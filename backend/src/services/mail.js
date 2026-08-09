import nodemailer from 'nodemailer';

function getTransport() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined
  });
}

export async function sendPasswordEmail(user, password) {
  const transport = getTransport();
  const frontendUrl = (process.env.PUBLIC_FRONTEND_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '');
  const text = `Hello ${user.name},\n\nYour club QR admin login is:\nEmail: ${user.email}\nPassword: ${password}\n\nLogin at ${frontendUrl}/club/admin and change your password from settings.`;
  if (!transport) {
    console.log(`[DEV MAIL] To ${user.email}\n${text}`);
    return { dev: true };
  }
  return transport.sendMail({
    from: process.env.SMTP_FROM,
    to: user.email,
    subject: 'Your Club QR login',
    text
  });
}
