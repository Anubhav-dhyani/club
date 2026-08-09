import express from 'express';
import StudentQr from '../models/StudentQr.js';

const router = express.Router();

router.get('/pass/:eventSlug/:token', async (req, res, next) => {
  try {
    const pass = await StudentQr.findOne({ token: req.params.token }).populate('event', 'name slug isActive');
    if (!pass || pass.event.slug !== req.params.eventSlug) return res.status(404).json({ message: 'Pass not found' });
    if (pass.status === 'used') return res.status(410).json({ message: 'This pass has already been used' });
    res.json({
      id: pass._id,
      name: pass.name,
      event: pass.event,
      qrImageUrl: pass.qrImageUrl,
      status: pass.status
    });
  } catch (error) {
    next(error);
  }
});

export default router;
