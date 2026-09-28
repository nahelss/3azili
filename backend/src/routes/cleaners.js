import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const cleanersRouter = Router();

// GET /cleaners?city=Hamra&language=Arabic&gender=female&service=indoor
// Matching note: cities/villages are grouped under regions (see Region/City
// models). A cleaner's "coverage" is the set of City rows they've picked —
// possibly spanning several regions — not a km radius. See spec §1 note.
cleanersRouter.get('/', async (req, res) => {
  const { city, language, gender, service } = req.query;

  const where = { isAvailableNow: true };
  if (city) where.coverageCities = { some: { name: city } };
  if (language) where.user = { languages: { has: language } };
  if (gender) where.user = { ...(where.user ?? {}), gender: gender.toUpperCase() };
  if (service && service !== 'any') {
    where.OR = [{ serviceType: service.toUpperCase() }, { serviceType: 'BOTH' }];
  }

  const cleaners = await prisma.cleanerProfile.findMany({
    where,
    include: {
      user: { select: { fullName: true, gender: true, languages: true, profilePhotoUrl: true } },
      coverageCities: { include: { region: true } },
    },
    orderBy: { ratingAvg: 'desc' },
  });

  const shaped = cleaners.map((c) => ({
    id: c.id,
    displayName: c.anonymous ? 'Anonymous cleaner' : c.user.fullName,
    photoUrl: c.anonymous ? null : c.user.profilePhotoUrl,
    languages: c.user.languages,
    gender: c.user.gender,
    serviceType: c.serviceType,
    skills: c.skills,
    hourlyRate: c.hourlyRate,
    dailyRate: c.dailyRate,
    ratingAvg: c.ratingAvg,
    ratingCount: c.ratingCount,
    bringsSupplies: c.bringsSupplies,
    minBookingHours: c.minBookingHours,
    coverage: c.coverageCities.map((city) => ({ city: city.name, region: city.region.name })),
  }));

  res.json(shaped);
});

cleanersRouter.get('/:id', async (req, res) => {
  const c = await prisma.cleanerProfile.findUnique({
    where: { id: req.params.id },
    include: { user: true, availabilitySlots: true, coverageCities: { include: { region: true } } },
  });
  if (!c) return res.status(404).json({ error: 'not found' });
  res.json(c);
});

// PATCH /cleaners/:id/coverage  { cityIds: [...] }
// Replaces the cleaner's full coverage set — used by the "regions you cover"
// UI where the cleaner picks regions then specific cities within each.
cleanersRouter.patch('/:id/coverage', async (req, res) => {
  const { cityIds } = req.body;
  const c = await prisma.cleanerProfile.update({
    where: { id: req.params.id },
    data: { coverageCities: { set: cityIds.map((id) => ({ id })) } },
    include: { coverageCities: true },
  });
  res.json(c);
});
