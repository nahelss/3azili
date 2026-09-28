import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const locationsRouter = Router();

// GET /locations/regions — public read-only listing, used by both the
// client search screen and the cleaner coverage picker. Region/city
// management itself (create/delete/bulk-import) stays under /admin.
locationsRouter.get('/regions', async (req, res) => {
  const regions = await prisma.region.findMany({
    include: { cities: { orderBy: { name: 'asc' } } },
    orderBy: { name: 'asc' },
  });
  res.json(regions);
});
