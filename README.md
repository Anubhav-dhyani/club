# Club QR Pass System

Full-stack event-wise QR pass system with:

- Student OTP login through MSG91
- Admin/coordinator email-password login
- Event-wise templates from `frontend/public/img`
- Student Excel import/export
- One QR per student per event
- Secure QR tokens only, no student data inside QR
- Coordinator scanning with event permissions
- S3 upload support with local fallback

## Setup

```bash
npm run install:all
cp backend/.env.example backend/.env
npm run dev
```

Frontend: `http://localhost:5173/club`

Admin/coordinator login: `http://localhost:5173/club/admin`

Backend: `http://localhost:5001/api`

## First Super Admin

Create a user directly in MongoDB or use the seed command:

```bash
cd backend
npm run seed:super-admin
```

Default seed credentials are controlled by `.env`.
