import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { saveQrImage } from './storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function publicQrPageUrl(eventSlug, token) {
  const base = (process.env.PUBLIC_FRONTEND_URL || process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  if (process.env.NODE_ENV === 'production' && /localhost|127\.0\.0\.1/i.test(base)) {
    throw new Error('PUBLIC_FRONTEND_URL must use the production website domain');
  }
  return `${base}/club/pass/${eventSlug}/${token}`;
}

function templatePath(templateFile) {
  return path.resolve(__dirname, '..', '..', '..', 'frontend', 'public', 'img', templateFile);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function placementForTemplate(event, templateWidth, templateHeight) {
  const placement = event.qrPlacement || {};
  const isGraphicEraPortrait = templateWidth === 1024 && templateHeight === 1536;
  const isOldDefault = placement.x === 760 && placement.y === 500 && placement.size === 260;
  const isPreviousGraphicEraDefault = placement.x === 277 && placement.y === 574 && placement.size === 470;

  if (isGraphicEraPortrait && (!placement.size || isOldDefault || isPreviousGraphicEraDefault)) {
    return { x: 297, y: 594, size: 430 };
  }

  return placement;
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

  const qrPlacement = placementForTemplate(event, templateWidth, templateHeight);
  const qrSize = clamp(qrPlacement.size, 80, Math.min(templateWidth, templateHeight));
  const qrLeft = clamp(qrPlacement.x, 0, Math.max(0, templateWidth - qrSize));
  const qrTop = clamp(qrPlacement.y, 0, Math.max(0, templateHeight - qrSize));
  const qrPng = await QRCode.toBuffer(qrPageUrl, { errorCorrectionLevel: 'H', margin: 2, width: qrSize });

  const textLeft = clamp(event.eventNamePlacement.x, 0, Math.max(0, templateWidth - 1));
  const textTop = clamp(event.eventNamePlacement.y, 0, Math.max(0, templateHeight - 1));
  const textWidth = Math.max(1, templateWidth - textLeft);
  const textHeight = Math.min(260, Math.max(1, templateHeight - textTop));

  const overlays = [];
  if (event.eventNamePlacement?.enabled) {
    overlays.push({
      input: eventTextSvg(event, event.eventNamePlacement, textWidth, textHeight),
      left: textLeft,
      top: textTop
    });
  }
  if (templateWidth === 1024 && templateHeight === 1536) {
    const qrBackground = await sharp({
      create: {
        width: 470,
        height: 470,
        channels: 4,
        background: '#ffffff'
      }
    }).png().toBuffer();
    overlays.push({
      input: qrBackground,
      left: 277,
      top: 574
    });
  }
  overlays.push({ input: qrPng, left: qrLeft, top: qrTop });

  const image = await sharp(template)
    .composite(overlays)
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
      palette: true,
      colours: 128,
      dither: 0
    })
    .toBuffer();

  const fileName = `${studentQr.token}.png`;
  const saved = await saveQrImage(image, event.slug, fileName);
  return { qrUrl: qrPageUrl, qrImageUrl: saved.url, qrImagePath: saved.path };
}
