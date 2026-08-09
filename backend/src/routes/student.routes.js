import express from 'express';
import StudentQr from '../models/StudentQr.js';
import { verifyStudentToken } from '../utils/security.js';

const router = express.Router();

function requireStudent(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'Login required' });
    const payload = verifyStudentToken(token);
    if (payload.kind !== 'student') return res.status(401).json({ message: 'Invalid student login' });
    req.mobile = payload.mobile;
    next();
  } catch (error) {
    error.status = 401;
    next(error);
  }
}

router.get('/passes', requireStudent, async (req, res, next) => {
  try {
    const passes = await StudentQr.find({
      mobile: req.mobile,
      status: { $in: ['pending', 'generated', 'downloaded'] }
    }).populate('event', 'name slug isActive');

    const active = passes.filter((pass) => pass.event?.isActive && pass.status !== 'used');
    if (!active.length) return res.status(403).json({ message: 'Your pass has already been used.' });
    res.json(active);
  } catch (error) {
    next(error);
  }
});

router.post('/passes/:id/downloaded', requireStudent, async (req, res, next) => {
  try {
    const pass = await StudentQr.findOne({ _id: req.params.id, mobile: req.mobile });
    if (!pass || pass.status === 'used') return res.status(404).json({ message: 'Active pass not found' });
    if (pass.status === 'generated') pass.status = 'downloaded';
    pass.downloadedAt = new Date();
    await pass.save();
    res.json({ message: 'Marked downloaded' });
  } catch (error) {
    next(error);
  }
});

export default router;
