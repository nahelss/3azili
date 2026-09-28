import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';

export const authRouter = Router();

// POST /auth/request-otp { phone }
// Wire this to an SMS/WhatsApp provider. For now it just logs a mock code —
// replace with a real OTP provider (see spec: WhatsApp fallback for Lebanon's
// telecom reliability, not SMS-only).
authRouter.post('/request-otp', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'phone is required' });
  console.log(`[mock OTP] would send a code to ${phone} via WhatsApp/SMS`);
  res.json({ ok: true });
});

// POST /auth/verify-otp { phone, code, fullName?, role? }
// On first verify for a new phone, creates the User record.
authRouter.post('/verify-otp', async (req, res) => {
  const { phone, code, fullName, role } = req.body;
  if (!phone || !code) return res.status(400).json({ error: 'phone and code are required' });

  // TODO: verify `code` against whatever OTP provider you wire up.
  let user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    if (!fullName || !role) {
      return res.status(400).json({ error: 'fullName and role are required for first-time signup' });
    }
    user = await prisma.user.create({
      data: { phone, fullName, role, currentLocation: 'Beirut', languages: [] },
    });
    if (role === 'CLIENT' || role === 'BOTH') {
      await prisma.clientProfile.create({ data: { userId: user.id } });
    }
    if (role === 'CLEANER' || role === 'BOTH') {
      await prisma.cleanerProfile.create({
        data: { userId: user.id, hourlyRate: 0, dailyRate: 0, serviceType: 'INDOOR', skills: [], workVillages: [] },
      });
    }
  }

  const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user });
});
