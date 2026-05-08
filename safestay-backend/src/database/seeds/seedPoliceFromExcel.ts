/**
 * Seed police officers from CM Bandobust Duty Excel (TSV export).
 *
 * Source file: src/database/seeds/data/CM_Bandobust_Duty_Import.tsv
 *
 * Columns used:
 *   DSP Name, DSP Badge ID, DSP Phone   → rank level 8 (Deputy SP)
 *   CI  Name, CI  Badge ID, CI  Phone   → rank level 9 (Circle Inspector)
 *   SI  Name, SI  Badge ID, SI  Phone   → rank level 10 (Sub-Inspector)
 *   Constable Name, Constable Badge ID, Constable Phone → rank level 14 (Constable)
 *
 * Skips rows where:
 *   - Badge ID is blank
 *   - Name is blank, purely numeric, or is a role placeholder ("Sector In-charge")
 *
 * Deduplicates by Badge ID (unique DB constraint — first write wins for each badge).
 *
 * All officers are assigned to the same default station created by defaultOfficer.ts
 * (Guntur Central Police Station, Andhra Pradesh). The station is upserted here too
 * so this script can run stand-alone.
 *
 * Run: npm run seed:police-excel
 */

import * as fs from 'fs';
import * as path from 'path';
import { hash as argon2Hash, Algorithm } from '@node-rs/argon2';
import { prisma } from '../../config/database';

// Default login password for every seeded officer.  Only used locally; prod
// imports must go through the admin create-officer flow which sets a real
// password.  Hashed once at module load — `phone` is intentionally ignored
// (the schema has no phoneNumber column on PoliceUser; it lives on Station).
const SEED_PASSWORD = 'Police@1234';

// ── helpers ──────────────────────────────────────────────────────────────────

function normalizePhone(raw: string): string {
  return raw.replace(/\D+/g, '');
}

/** True if the name looks like real officer name data (not garbage). */
function isValidName(name: string): boolean {
  if (!name || name.trim().length < 3) return false;
  const t = name.trim();
  // Purely numeric → garbage (e.g. "1")
  if (/^\d+$/.test(t)) return false;
  // Known placeholder roles
  if (['sector in-charge', 'sector incharge'].includes(t.toLowerCase())) return false;
  return true;
}

// ── TSV parsing ───────────────────────────────────────────────────────────────

interface OfficerRow {
  name: string;
  badgeId: string;
  phone: string;
  rankSlug: 'DSP' | 'CI' | 'SI' | 'CONST';
}

function parseTsv(filePath: string): OfficerRow[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // Skip the header line
  const dataLines = lines.slice(1);

  // Deduplicate by badgeId — first occurrence wins for each unique badge
  const seen = new Set<string>();
  const officers: OfficerRow[] = [];

  for (const line of dataLines) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    if (cols.length < 13) continue;

    const entries: [string, string, string, OfficerRow['rankSlug']][] = [
      [cols[0].trim(), cols[1].trim(),  cols[2].trim(),  'DSP'],
      [cols[3].trim(), cols[4].trim(),  cols[5].trim(),  'CI'],
      [cols[6].trim(), cols[7].trim(),  cols[8].trim(),  'SI'],
      [cols[10].trim(), cols[11].trim(), cols[12].trim(), 'CONST'],
    ];

    for (const [name, badgeId, phone, rankSlug] of entries) {
      if (!badgeId) continue;
      if (!isValidName(name)) continue;
      if (seen.has(badgeId)) continue;
      seen.add(badgeId);
      officers.push({ name, badgeId, phone: normalizePhone(phone) || '', rankSlug });
    }
  }

  return officers;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function seedPoliceFromExcel() {
  const tsvPath = path.join(__dirname, 'data', 'CM_Bandobust_Duty_Import.tsv');
  if (!fs.existsSync(tsvPath)) {
    throw new Error(`TSV file not found: ${tsvPath}`);
  }

  const officers = parseTsv(tsvPath);
  console.log(`\n📋 Parsed ${officers.length} unique officers from TSV.\n`);

  // ── ensure jurisdiction hierarchy exists (idempotent) ────────────────────
  const state = await prisma.state.upsert({
    where: { name: 'Andhra Pradesh' },
    update: {},
    create: { name: 'Andhra Pradesh', code: 'AP' },
  });
  const zone = await prisma.zone.upsert({
    where: { name_stateId: { name: 'South Zone', stateId: state.id } },
    update: {},
    create: { name: 'South Zone', stateId: state.id },
  });
  const range = await prisma.range.upsert({
    where: { name_zoneId: { name: 'Guntur Range', zoneId: zone.id } },
    update: {},
    create: { name: 'Guntur Range', zoneId: zone.id },
  });
  const district = await prisma.district.upsert({
    where: { name_rangeId: { name: 'Guntur District', rangeId: range.id } },
    update: {},
    create: { name: 'Guntur District', rangeId: range.id },
  });

  const baseJPath = `${state.id}/${zone.id}/${range.id}/${district.id}`;
  let station = await prisma.station.upsert({
    where: { name_districtId: { name: 'Guntur Central Police Station', districtId: district.id } },
    update: {},
    create: { name: 'Guntur Central Police Station', districtId: district.id, jurisdictionPath: baseJPath },
  });
  const fullPath = station.jurisdictionPath.split('/').length < 5
    ? `${baseJPath}/${station.id}`
    : station.jurisdictionPath;
  if (station.jurisdictionPath !== fullPath) {
    station = await prisma.station.update({ where: { id: station.id }, data: { jurisdictionPath: fullPath } });
  }

  // ── load ranks ────────────────────────────────────────────────────────────
  const rankMap: Record<OfficerRow['rankSlug'], { id: string; title: string } | null> = {
    DSP: null, CI: null, SI: null, CONST: null,
  };

  const dsp   = await prisma.policeRank.findFirst({ where: { level: 8 } });
  const ci    = await prisma.policeRank.findFirst({ where: { level: 9 } });
  const si    = await prisma.policeRank.findFirst({ where: { level: 10 } });
  const cnst  = await prisma.policeRank.findFirst({ where: { level: 14 } });

  if (!dsp || !ci || !si || !cnst) {
    throw new Error('Required police ranks not seeded. Run: npm run seed first.');
  }

  rankMap.DSP   = dsp;
  rankMap.CI    = ci;
  rankMap.SI    = si;
  rankMap.CONST = cnst;

  // ── upsert officers ───────────────────────────────────────────────────────
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const noPhone: string[] = [];

  const passwordHash = await argon2Hash(SEED_PASSWORD, { algorithm: Algorithm.Argon2id });

  for (const officer of officers) {
    const rank = rankMap[officer.rankSlug]!;

    const existing = await prisma.policeUser.findUnique({ where: { badgeId: officer.badgeId } });

    if (existing) {
      // Already exists — update name if it changed (data corrections).
      // Phone numbers live on Station, not PoliceUser, so we drop them here.
      await prisma.policeUser.update({
        where: { id: existing.id },
        data: {
          fullName: officer.name,
        },
      });
      updated++;
    } else {
      await prisma.policeUser.create({
        data: {
          badgeId: officer.badgeId,
          passwordHash,
          fullName: officer.name,
          rankId: rank.id,
          stationId: station.id,
          jurisdictionPath: fullPath,
          isActive: true,
        },
      });
      created++;
    }

    if (!officer.phone) {
      noPhone.push(`${officer.badgeId} (${officer.name})`);
    }
  }

  skipped = officers.filter(o => !o.phone).length;

  // ── summary ───────────────────────────────────────────────────────────────
  const byRank = { DSP: 0, CI: 0, SI: 0, CONST: 0 };
  officers.forEach(o => byRank[o.rankSlug]++);

  console.log('  ┌──────────────────────────────────────────────┐');
  console.log('  │   CM Bandobust Duty — Seeding Summary        │');
  console.log('  │                                              │');
  console.log(`  │   DSP     : ${String(byRank.DSP).padEnd(4)} officers (level 8)        │`);
  console.log(`  │   CI      : ${String(byRank.CI).padEnd(4)} officers (level 9)        │`);
  console.log(`  │   SI      : ${String(byRank.SI).padEnd(4)} officers (level 10)       │`);
  console.log(`  │   Constable: ${String(byRank.CONST).padEnd(3)} officers (level 14)       │`);
  console.log('  │                                              │');
  console.log(`  │   Created  : ${String(created).padEnd(4)}                             │`);
  console.log(`  │   Updated  : ${String(updated).padEnd(4)}                             │`);
  console.log(`  │   No phone : ${String(noPhone.length).padEnd(4)} (cannot log in)            │`);
  console.log('  └──────────────────────────────────────────────┘');

  if (noPhone.length > 0) {
    console.log('\n⚠️  Officers without phone number (login disabled):');
    noPhone.forEach(n => console.log('    -', n));
  }

  console.log('\n✅ Done.\n');
}

seedPoliceFromExcel()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error('❌ Seed failed:', err.message);
    await prisma.$disconnect();
    process.exit(1);
  });
