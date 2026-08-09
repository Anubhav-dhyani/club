import axios from 'axios';

export async function sendOtp(mobile, otp) {
  if (!process.env.MSG91_AUTH_KEY || !process.env.MSG91_TEMPLATE_ID) {
    console.log(`[DEV OTP] ${mobile}: ${otp}`);
    return { dev: true };
  }

  const response = await axios.post(
    'https://control.msg91.com/api/v5/otp',
    {
      template_id: process.env.MSG91_TEMPLATE_ID,
      mobile,
      authkey: process.env.MSG91_AUTH_KEY,
      otp,
      sender: process.env.MSG91_SENDER_ID
    },
    { headers: { 'Content-Type': 'application/json' } }
  );
  return response.data;
}
