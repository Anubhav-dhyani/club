import express from 'express';
import StudentQr from '../models/StudentQr.js';
import Event from '../models/Event.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth, requireRole('coordinator'));

router.post('/verify', async (req, res, next) => {
  try {
    const { token, eventId } = req.body;
    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: 'Event not found' });

    if (req.user.role === 'coordinator' && !req.user.assignedEvents.map(String).includes(String(eventId))) {
      return res.status(403).json({ message: 'You are not assigned to this event' });
    }

    const pass = await StudentQr.findOne({ token }).populate('event', 'name slug');
    if (!pass) return res.status(404).json({ message: 'Invalid QR code' });
    if (String(pass.event._id) !== String(eventId)) {
      return res.status(409).json({ message: `This QR is for ${pass.event.name}, not ${event.name}` });
    }
    if (pass.status === 'used') {
      return res.status(409).json({ message: 'This QR has already been used', pass });
    }

    pass.status = 'used';
    pass.usedAt = new Date();
    pass.usedBy = req.user._id;
    await pass.save();
    res.json({ message: 'Scan accepted', pass });
  } catch (error) {
    next(error);
  }
});

export default router;
