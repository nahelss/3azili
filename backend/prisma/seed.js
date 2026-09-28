import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  await prisma.platformConfig.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton', commissionRateLabor: 20, commissionRateSupplies: 7, suppliesPrepayRequired: true },
  });

  const items = [
    { name: 'All-purpose cleaner spray', cleanerPayoutPrice: 3 },
    { name: 'Mop & bucket set', cleanerPayoutPrice: 5 },
    { name: 'Vacuum cleaner', cleanerPayoutPrice: 8 },
    { name: 'Glass & window cleaner', cleanerPayoutPrice: 2 },
    { name: 'Disinfectant', cleanerPayoutPrice: 4 },
    { name: 'Microfiber cloths (pack)', cleanerPayoutPrice: 2.5 },
  ];
  for (const item of items) {
    await prisma.supplyCatalogItem.upsert({
      where: { id: item.name }, // placeholder; swap for a real unique key/slug if needed
      update: {},
      create: item,
    }).catch(async () => {
      // id isn't unique-by-name in the schema — just create if upsert-by-name fails
      const exists = await prisma.supplyCatalogItem.findFirst({ where: { name: item.name } });
      if (!exists) await prisma.supplyCatalogItem.create({ data: item });
    });
  }

  const regionData = {
    'Beirut': ['Beirut', 'Achrafieh', 'Hamra'],
    'Mount Lebanon': ['Baabda', 'Jounieh', 'Jbeil (Byblos)'],
    'North Lebanon': ['Tripoli'],
    'Bekaa': ['Zahle'],
    'South Lebanon': ['Saida (Sidon)', 'Sour (Tyre)', 'Naqoura'],
    'Nabatieh': ['Nabatieh'],
  };
  for (const [regionName, cities] of Object.entries(regionData)) {
    const region = await prisma.region.upsert({
      where: { name: regionName },
      update: {},
      create: { name: regionName },
    });
    for (const cityName of cities) {
      const exists = await prisma.city.findFirst({ where: { regionId: region.id, name: cityName } });
      if (!exists) await prisma.city.create({ data: { name: cityName, regionId: region.id } });
    }
  }

  console.log('Seed complete.');
}

main().finally(() => prisma.$disconnect());
