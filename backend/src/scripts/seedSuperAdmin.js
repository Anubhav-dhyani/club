import dotenv from 'dotenv';
dotenv.config();

import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { connectDb } from '../utils/db.js';

await connectDb();
const email = process.env.SUPER_ADMIN_EMAIL || 'superadmin@example.com';
const password = process.env.SUPER_ADMIN_PASSWORD || 'ChangeMe123!';

const existing = await User.findOne({ email });
if (existing) {
  console.log(`Super admin already exists: ${email}`);
  process.exit(0);
}

await User.create({
  name: 'Super Admin',
  email,
  role: 'super_admin',
  passwordHash: await bcrypt.hash(password, 12),
  mustChangePassword: false,
  permissions: { dashboard: true, scan: true, students: true }
});

console.log(`Created super admin: ${email} / ${password}`);
process.exit(0);
