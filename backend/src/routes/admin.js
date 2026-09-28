import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const adminRouter = Router();

// NOTE: none of these routes check for an admin role yet — wire up your
// auth middleware (see src/index.js) before this goes anywhere near prod.

adminRouter.get('/config', async (req, res) => {
  const config =
    (await prisma.platformConfig.findUnique({ where: { id: 'singleton' } })) ??
    (await prisma.platformConfig.create({ data: { id: 'singleton' } }));
  res.json(config);
});

adminRouter.patch('/config', async (req, res) => {
  const { adminId, ...changes } = req.body;
  const before = await prisma.platformConfig.findUnique({ where: { id: 'singleton' } });
  const config = await prisma.platformConfig.update({ where: { id: 'singleton' }, data: changes });

  for (const [field, newValue] of Object.entries(changes)) {
    await prisma.auditLog.create({
      data: {
        adminId,
        targetType: 'platform_config',
        targetId: 'singleton',
        fieldChanged: field,
        oldValue: String(before?.[field]),
        newValue: String(newValue),
      },
    });
  }
  res.json(config);
});

adminRouter.post('/supply-catalog', async (req, res) => {
  const { name, cleanerPayoutPrice, category, adminId } = req.body;
  const item = await prisma.supplyCatalogItem.create({ data: { name, cleanerPayoutPrice, category } });
  await prisma.auditLog.create({
    data: { adminId, targetType: 'supply_item', targetId: item.id, fieldChanged: 'created', newValue: name },
  });
  res.status(201).json(item);
});

adminRouter.delete('/supply-catalog/:id', async (req, res) => {
  const { adminId } = req.body;
  const item = await prisma.supplyCatalogItem.update({
    where: { id: req.params.id },
    data: { active: false },
  });
  await prisma.auditLog.create({
    data: { adminId, targetType: 'supply_item', targetId: item.id, fieldChanged: 'active', newValue: 'false' },
  });
  res.json(item);
});

// Generic override endpoint — logs every change. Extend with a model/field
// allowlist before exposing this to a real admin UI.
adminRouter.post('/override', async (req, res) => {
  const { adminId, targetType, targetId, fieldChanged, oldValue, newValue, reason } = req.body;
  await prisma.auditLog.create({
    data: { adminId, targetType, targetId, fieldChanged, oldValue, newValue, reason },
  });
  res.json({ ok: true });
});

adminRouter.get('/audit-log', async (req, res) => {
  const logs = await prisma.auditLog.findMany({ orderBy: { timestamp: 'desc' }, take: 200 });
  res.json(logs);
});

// ---- Regions & cities/villages ----

adminRouter.get('/regions', async (req, res) => {
  const regions = await prisma.region.findMany({ include: { cities: true }, orderBy: { name: 'asc' } });
  res.json(regions);
});

adminRouter.post('/regions', async (req, res) => {
  const { name, adminId } = req.body;
  const region = await prisma.region.create({ data: { name } });
  await prisma.auditLog.create({
    data: { adminId, targetType: 'region', targetId: region.id, fieldChanged: 'created', newValue: name },
  });
  res.status(201).json(region);
});

adminRouter.delete('/regions/:id', async (req, res) => {
  const { adminId } = req.body;
  const region = await prisma.region.findUnique({ where: { id: req.params.id }, include: { cities: true } });
  if (!region) return res.status(404).json({ error: 'not found' });
  await prisma.city.deleteMany({ where: { regionId: region.id } });
  await prisma.region.delete({ where: { id: region.id } });
  await prisma.auditLog.create({
    data: {
      adminId,
      targetType: 'region',
      targetId: region.id,
      fieldChanged: 'deleted',
      oldValue: `${region.name} (${region.cities.length} cities)`,
    },
  });
  res.json({ ok: true });
});

adminRouter.post('/regions/:id/cities', async (req, res) => {
  const { name, adminId } = req.body;
  const region = await prisma.region.findUnique({ where: { id: req.params.id } });
  if (!region) return res.status(404).json({ error: 'region not found' });
  const city = await prisma.city.create({ data: { name, regionId: region.id } });
  await prisma.auditLog.create({
    data: { adminId, targetType: 'city', targetId: city.id, fieldChanged: 'created', newValue: `${name} (${region.name})` },
  });
  res.status(201).json(city);
});

adminRouter.delete('/cities/:id', async (req, res) => {
  const { adminId } = req.body;
  const city = await prisma.city.findUnique({ where: { id: req.params.id } });
  if (!city) return res.status(404).json({ error: 'not found' });
  await prisma.city.delete({ where: { id: city.id } });
  await prisma.auditLog.create({
    data: { adminId, targetType: 'city', targetId: city.id, fieldChanged: 'deleted', oldValue: city.name },
  });
  res.json({ ok: true });
});

// POST /admin/regions/:id/cities/bulk-import  { names: string[], adminId, sourceFileName? }
// The array of names is expected to be parsed client-side (e.g. with
// SheetJS reading an uploaded .xlsx/.csv — see the prototype's admin panel
// for that flow) and posted here as plain strings, rather than uploading
// the raw file to this endpoint.
adminRouter.post('/regions/:id/cities/bulk-import', async (req, res) => {
  const { names, adminId, sourceFileName } = req.body;
  const region = await prisma.region.findUnique({ where: { id: req.params.id }, include: { cities: true } });
  if (!region) return res.status(404).json({ error: 'region not found' });

  const existing = new Set(region.cities.map((c) => c.name));
  const toCreate = [...new Set(names.map((n) => String(n).trim()).filter(Boolean))].filter((n) => !existing.has(n));

  if (toCreate.length) {
    await prisma.city.createMany({ data: toCreate.map((name) => ({ name, regionId: region.id })) });
  }
  await prisma.auditLog.create({
    data: {
      adminId,
      targetType: 'region',
      targetId: region.id,
      fieldChanged: 'bulk_import_cities',
      newValue: `${toCreate.length} added${sourceFileName ? ` from ${sourceFileName}` : ''}`,
    },
  });
  res.json({ added: toCreate.length, skipped: names.length - toCreate.length });
});
