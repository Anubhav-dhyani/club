import express from 'express';
import bcrypt from 'bcryptjs';
import Otp from '../models/Otp.js';
import User from '../models/User.js';
import StudentQr from '../models/StudentQr.js';
import { compareValue, hashValue, makeOtp, signStudent, signUser } from '../utils/security.js';
import { sendOtp } from '../services/msg91.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.post('/student/request-otp', async (req, res, next) => {
  try {
    const mobile = String(req.body.mobile || '').trim();
    if (!mobile) return res.status(400).json({ message: 'Mobile number is required' });
    const activeCount = await StudentQr.countDocuments({
      mobile,
      qrImageUrl: { $nin: ['', null] },
      status: { $in: ['generated', 'downloaded'] }
    });
    if (!activeCount) return res.status(403).json({ message: 'Your pass has already been used or is not available.' });

    const otp = makeOtp();
    const minutes = Number(process.env.MSG91_OTP_EXPIRY_MINUTES || 5);
    await Otp.create({
      mobile,
      codeHash: await hashValue(otp),
      expiresAt: new Date(Date.now() + minutes * 60 * 1000)
    });
    await sendOtp(mobile, otp);
    res.json({ message: 'OTP sent' });
  } catch (error) {
    next(error);
  }
});

router.post('/student/verify-otp', async (req, res, next) => {
  try {
    const mobile = String(req.body.mobile || '').trim();
    const otp = String(req.body.otp || '').trim();
    const record = await Otp.findOne({ mobile, verifiedAt: null }).sort({ createdAt: -1 });
    if (!record || record.expiresAt < new Date() || !(await compareValue(otp, record.codeHash))) {
      return res.status(401).json({ message: 'Invalid or expired OTP' });
    }
    record.verifiedAt = new Date();
    await record.save();
    res.json({ token: signStudent(mobile) });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').toLowerCase().trim();
    const user = await User.findOne({ email });
    if (!user || !user.isActive || !(await bcrypt.compare(req.body.password || '', user.passwordHash))) {
      return res.status(401).json({ message: 'Invalid login details' });
    }
    res.json({
      token: signUser(user),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
        assignedEvents: user.assignedEvents,
        mustChangePassword: user.mustChangePassword
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/change-password', requireAuth, async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);
    if (!(await bcrypt.compare(oldPassword || '', user.passwordHash))) {
      return res.status(401).json({ message: 'Old password is incorrect' });
    }
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.mustChangePassword = false;
    await user.save();
    res.json({ message: 'Password changed' });
  } catch (error) {
    next(error);
  }
});

export default router;
