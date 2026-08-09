import express from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import slugify from 'slugify';
import archiver from 'archiver';
import mongoose from 'mongoose';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Event from '../models/Event.js';
import StudentQr from '../models/StudentQr.js';
import UploadBatch from '../models/UploadBatch.js';
import User from '../models/User.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { makePassword, makeToken } from '../utils/security.js';
import { readRows, workbookBuffer } from '../utils/excel.js';
import { createQrPass } from '../services/qrPass.js';
import { sendPasswordEmail } from '../services/mail.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const imgDir = path.resolve(__dirname, '..', '..', '..', 'frontend', 'public', 'img');

router.use(requireAuth);

function adminEventFilter(user, eventId) {
  if (user.role === 'super_admin') return eventId ? { event: eventId } : {};
  const allowed = user.assignedEvents.map(String);
  if (eventId && !allowed.includes(String(eventId))) {
    const error = new Error('You do not have access to this event');
    error.status = 403;
    throw error;
  }
  return { event: { $in: user.assignedEvents } };
}

function aggregationEventFilter(filter) {
  const event = filter.event;
  if (!event) return {};
  if (typeof event === 'string') return { event: new mongoose.Types.ObjectId(event) };
  return filter;
}

function tokenFromQrLink(link) {
  if (!link) return '';
  try {
    const url = new URL(String(link));
    return url.pathname.split('/').filter(Boolean).pop()?.replace(/\.[^.]+$/, '');
  } catch {
    return String(link).split('/').filter(Boolean).pop()?.replace(/\.[^.]+$/, '');
  }
}

function pick(row, ...keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
  }
  return '';
}

router.get('/dashboard', async (req, res, next) => {
  try {
    const eventId = req.query.event || '';
    const filter = adminEventFilter(req.user, eventId);
    const [total, generated, downloaded, used, pending, byEvent, batches, scans] = await Promise.all([
      StudentQr.countDocuments(filter),
      StudentQr.countDocuments({ ...filter, status: { $in: ['generated', 'downloaded', 'used'] } }),
      StudentQr.countDocuments({ ...filter, downloadedAt: { $ne: null } }),
      StudentQr.countDocuments({ ...filter, status: 'used' }),
      StudentQr.countDocuments({ ...filter, status: { $in: ['pending', 'generated', 'downloaded'] } }),
      StudentQr.aggregate([
        { $match: aggregationEventFilter(filter) },
        { $group: { _id: '$event', total: { $sum: 1 }, used: { $sum: { $cond: [{ $eq: ['$status', 'used'] }, 1, 0] } } } },
        { $lookup: { from: 'events', localField: '_id', foreignField: '_id', as: 'event' } },
        { $unwind: '$event' },
        { $project: { event: '$event.name', total: 1, used: 1, pending: { $subtract: ['$total', '$used'] } } }
      ]),
      UploadBatch.find(eventId ? { event: eventId } : {}).populate('event', 'name').sort({ createdAt: -1 }).limit(20),
      StudentQr.find({ ...filter, status: 'used' }).populate('event', 'name').populate('usedBy', 'name email').sort({ usedAt: -1 }).limit(30)
    ]);
    res.json({ total, generated, downloaded, used, pending, byEvent, batches, scans });
  } catch (error) {
    next(error);
  }
});

router.get('/events', async (req, res, next) => {
  try {
    const filter = req.user.role === 'super_admin' ? {} : { _id: { $in: req.user.assignedEvents } };
    res.json(await Event.find(filter).sort({ createdAt: -1 }));
  } catch (error) {
    next(error);
  }
});

router.get('/templates', requireRole('super_admin'), async (_req, res, next) => {
  try {
    const files = await fs.readdir(imgDir);
    const templates = files.filter((file) => !file.startsWith('.') && !/^favicon\./i.test(file) && /\.(png|jpe?g|webp|svg)$/i.test(file));
    res.json(templates);
  } catch (error) {
    next(error);
  }
});

router.post('/events', requireRole('super_admin'), async (req, res, next) => {
  try {
    const templates = await fs.readdir(imgDir);
    if (!templates.includes(req.body.templateFile)) {
      return res.status(400).json({ message: 'Selected template was not found in frontend/public/img' });
    }
    const slug = slugify(req.body.name, { lower: true, strict: true });
    const event = await Event.create({
      name: req.body.name,
      slug,
      templateFile: req.body.templateFile,
      qrPlacement: req.body.qrPlacement,
      eventNamePlacement: req.body.eventNamePlacement
    });
    res.status(201).json(event);
  } catch (error) {
    next(error);
  }
});

router.patch('/events/:id', requireRole('super_admin'), async (req, res, next) => {
  try {
    const updates = { ...req.body };
    if (updates.name) updates.slug = slugify(updates.name, { lower: true, strict: true });
    res.json(await Event.findByIdAndUpdate(req.params.id, updates, { new: true }));
  } catch (error) {
    next(error);
  }
});

router.get('/students', async (req, res, next) => {
  try {
    const filter = adminEventFilter(req.user, req.query.event);
    const q = String(req.query.q || '').trim();
    const usage = String(req.query.usage || '').trim();
    if (q) filter.$or = [{ name: new RegExp(q, 'i') }, { mobile: new RegExp(q, 'i') }, { email: new RegExp(q, 'i') }];
    if (usage === 'used') filter.status = 'used';
    if (usage === 'unused') filter.status = { $ne: 'used' };
    res.json(await StudentQr.find(filter).populate('event', 'name slug').sort({ createdAt: -1 }).limit(500));
  } catch (error) {
    next(error);
  }
});

router.post('/students', requireRole('super_admin', 'admin'), async (req, res, next) => {
  try {
    adminEventFilter(req.user, req.body.event);
    const student = await StudentQr.create({ ...req.body, token: makeToken(32) });
    res.status(201).json(await student.populate('event', 'name slug'));
  } catch (error) {
    next(error);
  }
});

router.patch('/students/:id', requireRole('super_admin', 'admin'), async (req, res, next) => {
  try {
    const existing = await StudentQr.findById(req.params.id);
    adminEventFilter(req.user, existing.event);
    const protectedFields = ['token', 'status', 'qrUrl', 'qrImageUrl', 'qrImagePath', 'localQrImageUrl', 'localQrImagePath', 'usedAt', 'usedBy'];
    protectedFields.forEach((field) => delete req.body[field]);
    res.json(await StudentQr.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate('event', 'name slug'));
  } catch (error) {
    next(error);
  }
});

router.patch('/students/:id/mark-unused', requireRole('super_admin', 'admin'), async (req, res, next) => {
  try {
    const student = await StudentQr.findById(req.params.id);
    if (!student) return res.status(404).json({ message: 'Student not found' });
    adminEventFilter(req.user, student.event);
    if (student.status !== 'used') return res.status(409).json({ message: 'This pass is already unused' });

    student.status = student.downloadedAt ? 'downloaded' : (student.qrImageUrl || student.localQrImageUrl ? 'generated' : 'pending');
    student.usedAt = undefined;
    student.usedBy = undefined;
    await student.save();
    res.json({ message: 'Pass marked as unused', student: await student.populate('event', 'name slug') });
  } catch (error) {
    next(error);
  }
});

router.get('/students/:id/qr', async (req, res, next) => {
  try {
    const student = await StudentQr.findById(req.params.id);
    if (!student) return res.status(404).json({ message: 'Student not found' });
    adminEventFilter(req.user, student.event);
    const localPath = student.qrImagePath || student.localQrImagePath;
    if (localPath) {
      try {
        await fs.access(localPath);
        return res.download(path.resolve(localPath), `${student.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-qr.png`);
      } catch {
        // Regenerate below when an older deployment's local file is unavailable.
      }
    }
    const event = await Event.findById(student.event);
    if (!event || !event.isActive) return res.status(404).json({ message: 'Active event not found' });
    const links = await createQrPass(student, event);
    student.qrUrl = links.qrUrl;
    student.localQrImageUrl = links.qrImageUrl;
    student.localQrImagePath = links.qrImagePath;
    student.qrImageUrl = links.qrImageUrl;
    student.qrImagePath = links.qrImagePath;
    if (student.status === 'pending') student.status = 'generated';
    student.generatedAt = new Date();
    await student.save();
    res.download(path.resolve(links.qrImagePath), `${student.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-qr.png`);
  } catch (error) {
    next(error);
  }
});

router.delete('/students/:id', requireRole('super_admin', 'admin'), async (req, res, next) => {
  try {
    const student = await StudentQr.findById(req.params.id);
    if (!student) return res.status(404).json({ message: 'Student not found' });
    adminEventFilter(req.user, student.event);
    const paths = [...new Set([student.qrImagePath, student.localQrImagePath].filter(Boolean))];
    await StudentQr.deleteOne({ _id: student._id });
    await Promise.all(paths.map((filePath) => fs.unlink(filePath).catch(() => {})));
    res.json({ message: 'Student deleted' });
  } catch (error) {
    next(error);
  }
});

router.post('/students/import', requireRole('super_admin', 'admin'), upload.single('file'), async (req, res, next) => {
  try {
    const eventId = req.body.event;
    adminEventFilter(req.user, eventId);
    const rows = await readRows(req.file.path);
    const batch = await UploadBatch.create({
      fileName: req.file.originalname,
      event: eventId,
      totalRows: rows.length,
      uploadedBy: req.user._id,
      type: 'student_import'
    });
    const docs = rows
      .filter((row) => row.Name || row.name || row.Mobile || row.mobile)
      .map((row) => ({
        name: pick(row, 'Name', 'name'),
        email: pick(row, 'Email', 'email'),
        mobile: String(pick(row, 'Mobile', 'mobile', 'Contact Number', 'contact number', 'Phone', 'phone')),
        course: pick(row, 'Course', 'course'),
        semester: String(pick(row, 'Semester', 'semester', 'Year', 'year', 'Sem', 'sem')),
        event: eventId,
        uploadBatch: batch._id,
        token: makeToken(32)
      }));
    const imported = await StudentQr.insertMany(docs, { ordered: false });
    batch.importedRows = imported.length;
    await batch.save();
    res.json({ imported: imported.length, batch });
  } catch (error) {
    next(error);
  }
});

router.post('/students/preview', requireRole('super_admin', 'admin'), upload.single('file'), async (req, res, next) => {
  try {
    const rows = await readRows(req.file.path);
    res.json({ totalRows: rows.length, rows: rows.slice(0, 10) });
  } catch (error) {
    next(error);
  }
});

router.post('/students/import-qr-data', requireRole('super_admin', 'admin'), upload.single('file'), async (req, res, next) => {
  try {
    const eventId = req.body.event;
    adminEventFilter(req.user, eventId);
    const rows = await readRows(req.file.path);
    const batch = await UploadBatch.create({
      fileName: req.file.originalname,
      event: eventId,
      totalRows: rows.length,
      uploadedBy: req.user._id,
      type: 'qr_data_import'
    });
    let imported = 0;
    for (const row of rows) {
      const qrImageUrl = row['QR link'] || row.qrLink || row.qrImageUrl;
      const token = row.Token || row.token || tokenFromQrLink(qrImageUrl) || makeToken(32);
      const mobile = String(pick(row, 'Mobile', 'mobile', 'Contact Number', 'contact number', 'Phone', 'phone'));
      if (!mobile) continue;
      const payload = {
        name: pick(row, 'Name', 'name'),
        email: pick(row, 'Email', 'email'),
        mobile,
        course: pick(row, 'Course', 'course'),
        semester: String(pick(row, 'Semester', 'semester', 'Year', 'year', 'Sem', 'sem')),
        event: eventId,
        uploadBatch: batch._id,
        token,
        qrUrl: row['QR page link'] || row.qrUrl || '',
        qrImageUrl,
        status: qrImageUrl ? 'generated' : 'pending',
        generatedAt: qrImageUrl ? new Date() : undefined
      };
      const existing = await StudentQr.findOne({ event: eventId, $or: [{ token }, { mobile: payload.mobile }] });
      if (existing) {
        Object.assign(existing, payload);
        await existing.save();
      } else {
        await StudentQr.create(payload);
      }
      imported += 1;
    }
    batch.importedRows = imported;
    await batch.save();
    res.json({ imported, batch });
  } catch (error) {
    next(error);
  }
});

router.post('/students/qr-data-preview', requireRole('super_admin', 'admin'), upload.single('file'), async (req, res, next) => {
  try {
    const rows = await readRows(req.file.path);
    res.json({ totalRows: rows.length, rows: rows.slice(0, 10) });
  } catch (error) {
    next(error);
  }
});

router.get('/students/import-template', requireRole('super_admin', 'admin'), async (_req, res, next) => {
  try {
    const buffer = await workbookBuffer([{ Name: '', Email: '', Mobile: '', Course: '', Semester: '' }], 'Student Import');
    res.setHeader('Content-Disposition', 'attachment; filename=student-import-template.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

router.get('/students/qr-data-template', requireRole('super_admin', 'admin'), async (_req, res, next) => {
  try {
    const buffer = await workbookBuffer(
      [{ Name: '', Email: '', Mobile: '', Course: '', Semester: '', Token: '', 'QR page link': '', 'QR link': '' }],
      'Student QR Data'
    );
    res.setHeader('Content-Disposition', 'attachment; filename=student-qr-data-template.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

router.post('/students/generate/:eventId', requireRole('super_admin', 'admin'), async (req, res, next) => {
  try {
    adminEventFilter(req.user, req.params.eventId);
    const event = await Event.findById(req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    const statusFilter = req.body.regenerate ? { $in: ['pending', 'generated', 'downloaded'] } : 'pending';
    const students = await StudentQr.find({ event: event._id, status: statusFilter });
    let generated = 0;
    for (let index = 0; index < students.length; index += 3) {
      const batch = students.slice(index, index + 3);
      await Promise.all(batch.map(async (student) => {
        const links = await createQrPass(student, event);
        student.qrUrl = links.qrUrl;
        student.localQrImageUrl = links.qrImageUrl;
        student.localQrImagePath = links.qrImagePath;
        student.qrImageUrl = links.qrImageUrl;
        student.qrImagePath = links.qrImagePath;
        if (student.status === 'pending') student.status = 'generated';
        student.generatedAt = new Date();
        await student.save();
        generated += 1;
      }));
    }
    res.json({ generated });
  } catch (error) {
    next(error);
  }
});

router.get('/students/export', async (req, res, next) => {
  try {
    const filter = adminEventFilter(req.user, req.query.event);
    const students = await StudentQr.find(filter).populate('event', 'name');
    const rows = students.map((s) => ({
      Name: s.name,
      Email: s.email,
      Mobile: s.mobile,
      Course: s.course,
      Semester: s.semester,
      Event: s.event?.name,
      Token: s.token,
      'QR page link': s.qrUrl,
      'QR link': s.qrImageUrl,
      'Generated local QR': s.localQrImageUrl,
      'QR status': s.status
    }));
    const buffer = await workbookBuffer(rows);
    res.setHeader('Content-Disposition', 'attachment; filename=student-qr-data.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

router.get('/students/zip/:eventId', async (req, res, next) => {
  try {
    adminEventFilter(req.user, req.params.eventId);
    const event = await Event.findById(req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    const students = await StudentQr.find({
      event: event._id,
      status: { $in: ['generated', 'downloaded'] }
    });
    if (!students.length) return res.status(404).json({ message: 'No active QR passes are available for this event' });

    const files = [];
    for (const student of students) {
      let filePath = student.localQrImagePath || student.qrImagePath;
      let fileAvailable = false;
      if (filePath) {
        try {
          const stats = await fs.stat(filePath);
          fileAvailable = stats.isFile() && stats.size <= 600 * 1024;
        } catch {
          fileAvailable = false;
        }
      }
      if (!fileAvailable) {
        const links = await createQrPass(student, event);
        student.qrUrl = links.qrUrl;
        student.localQrImageUrl = links.qrImageUrl;
        student.localQrImagePath = links.qrImagePath;
        student.qrImageUrl = links.qrImageUrl;
        student.qrImagePath = links.qrImagePath;
        student.generatedAt = new Date();
        await student.save();
        filePath = links.qrImagePath;
      }
      files.push({ student, image: await fs.readFile(filePath) });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${event.slug}-qr-passes.zip"`);
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('warning', (error) => {
      if (error.code !== 'ENOENT') res.destroy(error);
    });
    archive.on('error', (error) => {
      if (!res.headersSent) return next(error);
      res.destroy(error);
    });
    archive.pipe(res);
    const rows = students.map((s) => ({
      Name: s.name,
      Email: s.email,
      Mobile: s.mobile,
      Course: s.course,
      Semester: s.semester,
      Event: event.name,
      Token: s.token,
      'QR page link': s.qrUrl,
      'QR link': s.qrImageUrl,
      'Generated local QR': s.localQrImageUrl,
      'QR status': s.status
    }));
    archive.append(await workbookBuffer(rows), { name: `${event.slug}-student-qr-data.xlsx` });
    archive.append(
      students.map((s) => `${s.name},${s.mobile},${s.token},${s.qrUrl},${s.qrImageUrl || ''},${s.localQrImageUrl || ''}`).join('\n'),
      { name: `${event.slug}-qr-links.csv` }
    );
    for (const { student, image } of files) {
      archive.append(image, { name: `qr-passes/${student.token}.png` });
    }
    await archive.finalize();
  } catch (error) {
    next(error);
  }
});

router.get('/users', requireRole('super_admin'), async (_req, res, next) => {
  try {
    res.json(await User.find().select('-passwordHash').populate('assignedEvents', 'name').sort({ createdAt: -1 }));
  } catch (error) {
    next(error);
  }
});

router.post('/users', requireRole('super_admin'), async (req, res, next) => {
  try {
    const password = makePassword();
    const allEvents = await Event.find().select('_id');
    const assignedEvents = req.body.assignedEvents?.length ? req.body.assignedEvents : allEvents.map((event) => event._id);
    const user = await User.create({
      name: req.body.name,
      email: req.body.email,
      role: req.body.role,
      assignedEvents,
      permissions: req.body.permissions,
      passwordHash: await bcrypt.hash(password, 12)
    });
    await sendPasswordEmail(user, password);
    res.status(201).json({ user: await User.findById(user._id).select('-passwordHash'), temporaryPassword: password });
  } catch (error) {
    next(error);
  }
});

router.post('/users/preview', requireRole('super_admin'), upload.single('file'), async (req, res, next) => {
  try {
    const rows = await readRows(req.file.path);
    res.json({ totalRows: rows.length, rows: rows.slice(0, 10) });
  } catch (error) {
    next(error);
  }
});

router.post('/users/import', requireRole('super_admin'), upload.single('file'), async (req, res, next) => {
  try {
    const rows = await readRows(req.file.path);
    const allEvents = await Event.find().select('_id');
    const requestedEvents = req.body.assignedEvents ? JSON.parse(req.body.assignedEvents) : [];
    const assignedEvents = requestedEvents.length ? requestedEvents : allEvents.map((event) => event._id);
    let imported = 0;
    const created = [];
    for (const row of rows) {
      const name = row.Name || row.name;
      const email = String(row.Email || row.email || '').toLowerCase().trim();
      if (!name || !email) continue;
      const role = ['admin', 'coordinator'].includes(row.Role || row.role) ? row.Role || row.role : 'coordinator';
      const password = makePassword();
      const permissions = { dashboard: role === 'admin', students: role === 'admin', scan: role === 'coordinator' };
      const user = await User.findOneAndUpdate(
        { email },
        {
          name,
          email,
          role,
          assignedEvents,
          permissions,
          passwordHash: await bcrypt.hash(password, 12),
          mustChangePassword: true,
          isActive: true
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      await sendPasswordEmail(user, password);
      created.push({ name, email, role, temporaryPassword: password });
      imported += 1;
    }
    res.json({ imported, users: created });
  } catch (error) {
    next(error);
  }
});

router.get('/users/import-template', requireRole('super_admin'), async (_req, res, next) => {
  try {
    const buffer = await workbookBuffer([{ Name: '', Email: '', Role: 'coordinator' }], 'Team Import');
    res.setHeader('Content-Disposition', 'attachment; filename=team-import-template.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

router.patch('/users/:id', requireRole('super_admin'), async (req, res, next) => {
  try {
    delete req.body.passwordHash;
    res.json(await User.findByIdAndUpdate(req.params.id, req.body, { new: true }).select('-passwordHash'));
  } catch (error) {
    next(error);
  }
});

export default router;
