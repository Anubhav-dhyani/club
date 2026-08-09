import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
    if (!token) {
      const error = new Error('Authentication required');
      error.status = 401;
      throw error;
    }
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id).select('-passwordHash');
    if (!user || !user.isActive) {
      const error = new Error('Account disabled or missing');
      error.status = 401;
      throw error;
    }
    req.user = user;
    next();
  } catch (error) {
    error.status = error.status || 401;
    next(error);
  }
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!roles.includes(req.user.role)) {
      const error = new Error('Permission denied');
      error.status = 403;
      return next(error);
    }
    next();
  };
}

export function canManageStudents(req, _res, next) {
  if (['super_admin', 'admin'].includes(req.user.role)) return next();
  const error = new Error('Only admins can manage students');
  error.status = 403;
  next(error);
}
