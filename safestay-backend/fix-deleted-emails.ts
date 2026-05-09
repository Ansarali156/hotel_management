import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function fix() {
  console.log('Searching for deleted hotels with conflicting emails...');
  const deletedHotels = await prisma.hotel.findMany({
    where: {
      deletedAt: { not: null },
      NOT: {
        email: { contains: '_deleted_' }
      }
    }
  });

  console.log(`Found ${deletedHotels.length} hotels to fix.`);

  for (const h of deletedHotels) {
    const newEmail = `${h.email}_deleted_fix_${Date.now()}`;
    await prisma.hotel.update({
      where: { id: h.id },
      data: { email: newEmail }
    });
    console.log(`Renamed: ${h.email} -> ${newEmail}`);
  }

  console.log('Done.');
}

fix().catch(console.error).finally(() => prisma.$disconnect());
