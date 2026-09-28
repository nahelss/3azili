import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const bookingsRouter = Router();

async function getConfig() {
  return (
    (await prisma.platformConfig.findUnique({ where: { id: 'singleton' } })) ??
    (await prisma.platformConfig.create({ data: { id: 'singleton' } }))
  );
}

// POST /bookings
// body: { clientId, cleanerId, pricingType, duration, cityId, pinLat?, pinLng?, serviceType,
//         bookingMode, scheduledStart, scheduledEnd, paymentMethod, supplyItemIds: [] }
//
// Pricing logic mirrors the spec: labor commission is added on top of the
// cleaner's rate (not deducted from it); supplies carry a separate 7%
// commission with the client charged cleanerPayoutPrice * 1.07 per item.
bookingsRouter.post('/', async (req, res) => {
  const body = req.body;
  const config = await getConfig();
  const cleaner = await prisma.cleanerProfile.findUnique({ where: { id: body.cleanerId } });
  if (!cleaner) return res.status(404).json({ error: 'cleaner not found' });

  const basePrice =
    body.pricingType === 'HOURLY' ? cleaner.hourlyRate * body.duration : cleaner.dailyRate * body.duration;
  const laborCommission = basePrice * (config.commissionRateLabor / 100);

  let suppliesClientTotal = 0;
  let suppliesCleanerPayout = 0;
  let items = [];
  if (body.supplyItemIds?.length) {
    items = await prisma.supplyCatalogItem.findMany({ where: { id: { in: body.supplyItemIds } } });
    for (const item of items) {
      suppliesCleanerPayout += item.cleanerPayoutPrice;
      suppliesClientTotal += item.cleanerPayoutPrice * (1 + config.commissionRateSupplies / 100);
    }
  }
  const suppliesCommission = suppliesClientTotal - suppliesCleanerPayout;
  const totalPrice = basePrice + laborCommission + suppliesClientTotal;
  const depositRequired = body.paymentMethod === 'CASH';

  const booking = await prisma.booking.create({
    data: {
      clientId: body.clientId,
      cleanerId: body.cleanerId,
      pricingType: body.pricingType,
      scheduledStart: new Date(body.scheduledStart),
      scheduledEnd: new Date(body.scheduledEnd),
      cityId: body.cityId,
      pinLat: body.pinLat ?? null,
      pinLng: body.pinLng ?? null,
      serviceType: body.serviceType,
      bookingMode: body.bookingMode,
      basePrice,
      laborCommission,
      suppliesClientTotal,
      suppliesCleanerPayout,
      suppliesCommission,
      totalPrice,
      paymentMethod: body.paymentMethod,
      depositRequired,
      status: body.bookingMode === 'INSTANT_BOOK' ? 'CONFIRMED' : 'REQUESTED',
      supplyItems: {
        create: items.map((i) => ({ itemId: i.id, quantity: 1 })),
      },
    },
    include: { supplyItems: true },
  });

  // If cash + deposit required, the client still owes laborCommission
  // (+ suppliesClientTotal if config.suppliesPrepayRequired) via Whish/OMT/Bob
  // before the booking is considered confirmed. Record that as a pending payment.
  if (depositRequired) {
    const depositAmount = laborCommission + (config.suppliesPrepayRequired ? suppliesClientTotal : 0);
    await prisma.payment.create({
      data: {
        bookingId: booking.id,
        amount: depositAmount,
        method: body.paymentMethod, // will actually be settled via WHISH/OMT/BOB in the app, not cash
        type: 'DEPOSIT',
        status: 'PENDING',
      },
    });
  }

  res.status(201).json(booking);
});

bookingsRouter.patch('/:id/status', async (req, res) => {
  const { status, cancellationReason } = req.body;
  const booking = await prisma.booking.update({
    where: { id: req.params.id },
    data: { status, cancellationReason },
  });
  res.json(booking);
});

bookingsRouter.get('/:id', async (req, res) => {
  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id },
    include: { supplyItems: { include: { item: true } }, payments: true, reviews: true, dispute: true },
  });
  if (!booking) return res.status(404).json({ error: 'not found' });
  res.json(booking);
});
