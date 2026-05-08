import { prisma } from '../../config/database';

export const seedPoliceRanks = async () => {
  const ranks = [
    { level: 1,  title: 'Director General of Police (DGP)',         description: 'Highest state police authority' },
    { level: 2,  title: 'Additional Director General (ADGP)',        description: 'Zone-level authority' },
    { level: 3,  title: 'Inspector General of Police (IGP)',         description: 'Range-level authority' },
    { level: 4,  title: 'Deputy Inspector General (DIG)',            description: 'Range-level authority' },
    { level: 5,  title: 'Senior Superintendent of Police (SSP)',     description: 'District-level authority (large district)' },
    { level: 6,  title: 'Superintendent of Police (SP)',             description: 'District-level authority' },
    { level: 7,  title: 'Additional SP (ASP)',                       description: 'District sub-division authority' },
    { level: 8,  title: 'Deputy SP (DSP) / Circle Inspector (CI)',   description: 'Circle-level authority' },
    { level: 9,  title: 'Inspector of Police',                       description: 'Station-level officer in charge' },
    { level: 10, title: 'Sub-Inspector (SI)',                        description: 'Station-level investigating officer' },
    { level: 11, title: 'Assistant Sub-Inspector (ASI)',             description: 'Station-level' },
    { level: 12, title: 'Head Constable (HC)',                       description: 'Can create records, station-level access' },
    { level: 13, title: 'Senior Constable',                          description: 'Read-only, station level' },
    { level: 14, title: 'Constable',                                 description: 'Read-only, station level' },
  ];

  for (const rank of ranks) {
    await prisma.policeRank.upsert({
      where: { level: rank.level },
      update: { title: rank.title, description: rank.description },
      create: rank,
    });
  }
  console.log('✅ Police ranks seeded.');
};

// Run directly: ts-node src/database/seeds/policeRanks.ts
if (require.main === module) {
  seedPoliceRanks()
    .then(() => prisma.$disconnect())
    .catch(async (err) => {
      console.error('Seed failed:', err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
