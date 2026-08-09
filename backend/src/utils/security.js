import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

export function makeToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function makeOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function makePassword() {
  return crypto.randomBytes(9).toString('base64url') + 'A1!';
}

export async function hashValue(value) {
  return bcrypt.hash(value, 12);
}

export async function compareValue(value, hash) {
  return bcrypt.compare(value, hash);
}

export function signUser(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '8h' });
}

export function signStudent(mobile) {
  return jwt.sign({ mobile, kind: 'student' }, process.env.JWT_SECRET, { expiresIn: '4h' });
}

export function verifyStudentToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}
