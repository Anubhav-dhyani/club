import fs from 'fs/promises';
import path from 'path';

export async function saveQrImage(buffer, eventSlug, fileName) {
  const dir = path.resolve('generated', eventSlug);
  await fs.mkdir(dir, { recursive: true });
  const fullPath = path.join(dir, fileName);
  await fs.writeFile(fullPath, buffer);
  const base = (process.env.QR_PUBLIC_BASE_URL || process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 5001}`).replace(/\/$/, '');
  if (process.env.NODE_ENV === 'production' && /localhost|127\.0\.0\.1/i.test(base)) {
    throw new Error('QR_PUBLIC_BASE_URL must use the production file domain');
  }
  return {
    url: `${base}/generated/${eventSlug}/${fileName}`,
    path: fullPath
  };
}
