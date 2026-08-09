import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDb } from './utils/db.js';
import authRoutes from './routes/auth.routes.js';
import adminRoutes from './routes/admin.routes.js';
import studentRoutes from './routes/student.routes.js';
import scanRoutes from './routes/scan.routes.js';
import publicRoutes from './routes/public.routes.js';
import { errorHandler, notFound } from './middleware/error.js';
import { ensureSuperAdmin } from './utils/bootstrap.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configuredOrigins = [process.env.FRONTEND_URL, process.env.PUBLIC_FRONTEND_URL]
  .filter(Boolean)
  .map((origin) => origin.replace(/\/$/, ''));

app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const normalizedOrigin = origin.replace(/\/$/, '');
    const isLocalDevelopment = process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalizedOrigin);
    if (isLocalDevelopment || configuredOrigins.includes(normalizedOrigin)) return callback(null, true);
    return callback(new Error(`Origin ${origin} is not allowed by CORS`));
  }
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use('/generated', express.static(path.join(__dirname, '..', 'generated')));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/public', publicRoutes);
app.use(notFound);
app.use(errorHandler);

const port = process.env.PORT || 5001;
connectDb().then(() => {
  return ensureSuperAdmin();
}).then(() => {
  app.listen(port, () => console.log(`API running on http://localhost:${port}`));
}).catch((error) => {
  console.error('Failed to start API server:', error.message);
  process.exit(1);
});
