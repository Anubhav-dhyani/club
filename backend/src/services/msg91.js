import axios from 'axios';

function normalizeIndianMobile(mobile) {
  const digits = String(mobile || '').replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

export async function sendOtp(mobile, otp) {
  if (!process.env.MSG91_AUTH_KEY || !process.env.MSG91_TEMPLATE_ID) {
    console.log(`[DEV OTP] ${mobile}: ${otp}`);
    return { dev: true };
  }

  const otpVariable = process.env.MSG91_OTP_VARIABLE || 'OTP';
  const validityVariable = process.env.MSG91_VALIDITY_VARIABLE || 'Validity';
  const validity = process.env.MSG91_OTP_EXPIRY_MINUTES || '5';
  const response = await axios.post(
    'https://control.msg91.com/api/v5/otp',
    {
      [otpVariable]: otp,
      [validityVariable]: validity,
      otp
    },
    {
      params: {
        template_id: process.env.MSG91_TEMPLATE_ID,
        mobile: normalizeIndianMobile(mobile),
        authkey: process.env.MSG91_AUTH_KEY
      },
      headers: { 'Content-Type': 'application/json' }
    }
  );
  return response.data;
}
