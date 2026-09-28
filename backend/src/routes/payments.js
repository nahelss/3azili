import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const paymentsRouter = Router();

// GET /payments — admin payments view (add pagination/filters as needed)
paymentsRouter.get('/', async (req, res) => {
  const payments = await prisma.payment.findMany({
    include: { booking: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  res.json(payments);
});

// POST /payments/:id/mark-cleared — call this from your Whish/OMT/Bob webhook
// or admin action once a transfer is confirmed.
paymentsRouter.post('/:id/mark-cleared', async (req, res) => {
  const payment = await prisma.payment.update({
    where: { id: req.params.id },
    data: { status: 'CLEARED' },
  });
  // If this was the deposit that unblocks a cash booking, confirm the booking too.
  if (payment.type === 'DEPOSIT') {
    await prisma.booking.update({ where: { id: payment.bookingId }, data: { status: 'CONFIRMED' } });
  }
  res.json(payment);
});
