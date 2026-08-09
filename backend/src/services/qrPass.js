import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { saveQrImage } from './storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function publicQrPageUrl(eventSlug, token) {
  const base = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  return `${base}/club/pass/${eventSlug}/${token}`;
}

function templatePath(templateFile) {
  return path.resolve(__dirname, '..', '..', '..', 'frontend', 'public', 'img', templateFile);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function eventTextSvg(event, placement, width, height) {
  const text = event.name.replace(/[<&>"]/g, '');
  const fontSize = clamp(placement.fontSize, 12, Math.max(12, height - 10));
  return Buffer.from(`
    <svg width="${width}" height="${height}">
      <style>
        .event { fill: ${placement.color}; font-size: ${fontSize}px; font-family: Arial, sans-serif; font-weight: 800; }
      </style>
      <text x="0" y="${fontSize + 6}" class="event">${text}</text>
    </svg>
  `);
}

export async function createQrPass(studentQr, event) {
  const qrPageUrl = publicQrPageUrl(event.slug, studentQr.token);
  const template = templatePath(event.templateFile);
  await fs.access(template);
  const metadata = await sharp(template).metadata();
  const templateWidth = metadata.width || 1200;
  const templateHeight = metadata.height || 800;

  const qrSize = clamp(event.qrPlacement.size, 80, Math.min(templateWidth, templateHeight));
  const qrLeft = clamp(event.qrPlacement.x, 0, Math.max(0, templateWidth - qrSize));
  const qrTop = clamp(event.qrPlacement.y, 0, Math.max(0, templateHeight - qrSize));
  const qrPng = await QRCode.toBuffer(qrPageUrl, { margin: 1, width: qrSize });

  const textLeft = clamp(event.eventNamePlacement.x, 0, Math.max(0, templateWidth - 1));
  const textTop = clamp(event.eventNamePlacement.y, 0, Math.max(0, templateHeight - 1));
  const textWidth = Math.max(1, templateWidth - textLeft);
  const textHeight = Math.min(260, Math.max(1, templateHeight - textTop));

  const image = await sharp(template)
    .composite([
      {
        input: eventTextSvg(event, event.eventNamePlacement, textWidth, textHeight),
        left: textLeft,
        top: textTop
      },
      {
        input: qrPng,
        left: qrLeft,
        top: qrTop
      }
    ])
    .png()
    .toBuffer();

  const fileName = `${studentQr.token}.png`;
  const saved = await saveQrImage(image, event.slug, fileName);
  return { qrUrl: qrPageUrl, qrImageUrl: saved.url, qrImagePath: saved.path };
}
