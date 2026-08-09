import bcrypt from 'bcryptjs';
import User from '../models/User.js';

export async function ensureSuperAdmin() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!email || !password) return;

  const existing = await User.findOne({ email: email.toLowerCase().trim() });
  if (existing) return;

  await User.create({
    name: 'Super Admin',
    email,
    role: 'super_admin',
    passwordHash: await bcrypt.hash(password, 12),
    mustChangePassword: false,
    permissions: { dashboard: true, scan: false, students: true }
  });
  console.log(`Bootstrapped super admin: ${email}`);
}
