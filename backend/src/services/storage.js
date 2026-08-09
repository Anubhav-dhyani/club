import fs from 'fs/promises';
import path from 'path';

export async function saveQrImage(buffer, eventSlug, fileName) {
  const dir = path.resolve('generated', eventSlug);
  await fs.mkdir(dir, { recursive: true });
  const fullPath = path.join(dir, fileName);
  await fs.writeFile(fullPath, buffer);
  const base = (process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 5001}`).replace(/\/$/, '');
  return {
    url: `${base}/generated/${eventSlug}/${fileName}`,
    path: fullPath
  };
}
