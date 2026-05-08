/**
 * Seeds a default police officer for first-time setup.
 *
 * Creates: State → Zone → Range → District → Station → Officer
 *
 * Default credentials:
 *   Badge ID : ADMIN001
 *   Password : Admin@1234
 *   Rank     : Director General of Police (level 1 — full access)
 */

import { prisma } from '../../config/database';
import { hash as argon2Hash, Algorithm } from '@node-rs/argon2';

async function seedDefaultOfficer() {
  console.log('🌱 Seeding default police officer...');

  // ── 1. State ───────────────────────────────────────────────────────────────
  const state = await prisma.state.upsert({
    where: { name: 'Andhra Pradesh' },
    update: {},
    create: { name: 'Andhra Pradesh', code: 'AP' },
  });

  // ── 2. Zone ────────────────────────────────────────────────────────────────
  const zone = await prisma.zone.upsert({
    where: { name_stateId: { name: 'South Zone', stateId: state.id } },
    update: {},
    create: { name: 'South Zone', stateId: state.id },
  });

  // ── 3. Range ───────────────────────────────────────────────────────────────
  const range = await prisma.range.upsert({
    where: { name_zoneId: { name: 'Guntur Range', zoneId: zone.id } },
    update: {},
    create: { name: 'Guntur Range', zoneId: zone.id },
  });

  // ── 4. District ────────────────────────────────────────────────────────────
  const district = await prisma.district.upsert({
    where: { name_rangeId: { name: 'Guntur District', rangeId: range.id } },
    update: {},
    create: { name: 'Guntur District', rangeId: range.id },
  });

  // ── 5. Station + jurisdictionPath ─────────────────────────────────────────
  const jurisdictionPath = `${state.id}/${zone.id}/${range.id}/${district.id}`;

  const station = await prisma.station.upsert({
    where: { name_districtId: { name: 'Guntur Central Police Station', districtId: district.id } },
    update: {},
    create: {
      name: 'Guntur Central Police Station',
      districtId: district.id,
      jurisdictionPath,   // will be updated with stationId after creation
    },
  });

  // Update jurisdictionPath to include stationId
  const fullPath = `${jurisdictionPath}/${station.id}`;
  await prisma.station.update({
    where: { id: station.id },
    data: { jurisdictionPath: fullPath },
  });

  // ── 6. Get DGP rank (level 1 — full system access) ────────────────────────
  const dgpRank = await prisma.policeRank.findFirst({ where: { level: 1 } });
  if (!dgpRank) throw new Error('Police ranks not seeded yet. Run: npm run seed first.');

  // ── 7. Create officer ──────────────────────────────────────────────────────
  const existing = await prisma.policeUser.findUnique({ where: { badgeId: 'ADMIN001' } });
  if (existing) {
    console.log('ℹ️  Officer ADMIN001 already exists — skipping.');
  } else {
    const passwordHash = await argon2Hash('Admin@1234', { algorithm: Algorithm.Argon2id });

    await prisma.policeUser.create({
      data: {
        badgeId: 'ADMIN001',
        passwordHash,
        fullName: 'System Administrator',
        email: 'admin@safestay.police',
        rankId: dgpRank.id,
        stationId: station.id,
        jurisdictionPath: fullPath,
        isActive: true,
      },
    });
    console.log('✅ Default officer created.');
  }

  console.log('');
  console.log('  ┌─────────────────────────────────────────┐');
  console.log('  │   Police Portal Default Credentials     │');
  console.log('  │                                         │');
  console.log('  │   Badge ID : ADMIN001                   │');
  console.log('  │   Password : Admin@1234                 │');
  console.log('  │   Rank     : Director General (DGP)     │');
  console.log('  │   Access   : Full system (level 1)      │');
  console.log('  │                                         │');
  console.log('  │   URL: localhost:3000/police/login      │');
  console.log('  └─────────────────────────────────────────┘');
  console.log('');
}

seedDefaultOfficer()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error('❌ Seed failed:', err.message);
    await prisma.$disconnect();
    process.exit(1);
  });
