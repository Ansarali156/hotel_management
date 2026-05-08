/**
 * Synchronous Verification Service
 *
 * Runs criminal↔guest cross-matching directly (no Redis/BullMQ required).
 * Called as fire-and-forget from:
 *   - criminal.controller.ts  (new criminal created → match against all active guests)
 *   - guest.controller.ts     (new guest checked in → match against all active criminals)
 *
 * Creates MatchAlert records in the police DB for every pair with score >= 0.40.
 * Emits Socket.IO events to connected police officers for score >= 0.70.
 */

import { policePrisma } from '../config/policeDatabase';
import { hotelPrisma } from '../config/hotelDatabase';
import { calculateMatchScore } from '../utils/matchScore';
import { emitCriminalMatchAlert, emitVerificationProgress } from '../config/socketio';
import { logger } from '../utils/logger';
import { decryptAadhaar } from '../utils/encrypt';

/** Safely decrypt Aadhaar — returns plain digits or empty string on failure */
function safeDecrypt(encrypted?: string | null): string {
  if (!encrypted) return '';
  try {
    return decryptAadhaar(encrypted).replace(/\D/g, '');
  } catch {
    return '';
  }
}

const ALERT_THRESHOLD = 0; // Store ALL verification results — user wants to see every pair
const HIGH_PRIORITY_THRESHOLD = 0.70;
const BATCH_SIZE = 500;

// ─── Full Sweep: All Criminals × All Guests ───────────────────────────────────

/**
 * Full many-to-many sweep — all active WANTED/ABSCONDING criminals vs. every
 * currently active hotel guest. Used as a fallback when BullMQ/Redis is
 * unavailable, and as the sync path for the manual trigger and 3-hour cron.
 *
 * Clears stale PENDING_REVIEW alerts first (mirrors sweep.worker.ts behaviour).
 * Always resolves — errors are logged but never thrown.
 */
export const runFullSweep = async (): Promise<{ pairsChecked: number; alertsCreated: number }> => {
  const startMs = Date.now();
  let alertsCreated = 0;
  let pairsChecked = 0;
  const jobId = `sync-sweep-${Date.now()}`;

  try {
    logger.info('[VerificationSync] Full sweep started', { jobId });

    // NOTE: We no longer delete existing alerts before sweep.
    // Instead, we deduplicate per (guestId, criminalId) pair below.

    // Pre-load all active guests once
    const activeGuestsRaw = await hotelPrisma.guest.findMany({
      where: { isActive: true },
      select: {
        id: true,
        fullName: true,
        aadhaarEncrypted: true,
        aadhaarHash: true,
        phoneNumber: true,
        age: true,
        guestType: true,
        passportNumber: true,
        checkInDate: true,
        hotel: { select: { id: true, name: true } },
        room: { select: { roomNumber: true } },
      },
    });

    // Decrypt Aadhaar once per guest (avoids repeated decryption in inner loop)
    const activeGuests = activeGuestsRaw.map((g: any) => ({
      ...g,
      aadhaarNumber: safeDecrypt(g.aadhaarEncrypted) || (g.aadhaarHash?.replace(/\D/g, '') || ''),
    }));

    // Count total criminals for diagnostics
    const totalCriminals = await policePrisma.criminalProfile.count({ where: { isActive: true } });
    // Do NOT log guest names / Aadhaar presence arrays here — it produces a
    // PII-heavy line for every sweep and blows up the log volume on large
    // deployments. Aggregate counts are sufficient for diagnostics.
    logger.info('[VerificationSync] Full sweep — data loaded', {
      activeGuests: activeGuests.length,
      activeCriminals: totalCriminals,
      guestsWithAadhaar: activeGuests.filter((g: { aadhaarHash?: string | null }) => !!g.aadhaarHash).length,
    });

    if (activeGuests.length === 0) {
      logger.info('[VerificationSync] Full sweep — no active guests, nothing to check');
      emitVerificationProgress({ jobId, type: 'SWEEP', status: 'COMPLETE', sourceName: 'Network Sweep', sourceId: 'sweep', checked: 0, total: totalCriminals, alertsFound: 0, pct: 100, durationMs: Date.now() - startMs });
      return { pairsChecked: 0, alertsCreated: 0 };
    }

    // Emit started event so UI shows the banner immediately
    emitVerificationProgress({ jobId, type: 'SWEEP', status: 'PROCESSING', sourceName: 'Network Sweep', sourceId: 'sweep', checked: 0, total: totalCriminals, alertsFound: 0, pct: 0 });

    let skip = 0;
    let criminalsChecked = 0;
    const guestIds = activeGuests.map((g: { id: string }) => g.id);
    while (true) {
      const criminalsRaw = await policePrisma.criminalProfile.findMany({
        where: { isActive: true },
        select: {
          id: true,
          fullName: true,
          aliases: true,
          aadhaarEncrypted: true,
          aadhaarHash: true,
          phones: true,
          approximateAge: true,
          passportNumber: true,
          drivingLicense: true,
          threatLevel: true,
          caseStatus: true,
          crimeType: true,
          firStationId: true,
        },
        // Deterministic batch paging
        orderBy: { id: 'asc' },
        skip,
        take: BATCH_SIZE,
      });

      if (criminalsRaw.length === 0) break;
      criminalsChecked += criminalsRaw.length;

      const criminals = criminalsRaw.map((c: any) => ({
        ...c,
        aadhaarNumber: safeDecrypt(c.aadhaarEncrypted) || (c.aadhaarHash?.replace(/\D/g, '') || ''),
      }));

      // Preload every existing alert for (this criminal batch) × (all guests)
      // in ONE query. Replaces per-pair findFirst(): was O(C*G) DB calls,
      // now O(1) in-memory Map lookup per iteration.
      const criminalIdsInBatch = criminals.map((c: { id: string }) => c.id);
      const existingAlerts = await policePrisma.matchAlert.findMany({
        where: {
          guestId: { in: guestIds },
          criminalId: { in: criminalIdsInBatch },
        },
        select: { id: true, guestId: true, criminalId: true, matchScore: true },
      });
      const existingByPair = new Map<string, { id: string; matchScore: number }>();
      for (const a of existingAlerts) {
        existingByPair.set(`${a.guestId}|${a.criminalId}`, { id: a.id, matchScore: a.matchScore });
      }

      for (const criminal of criminals) {
        for (const guest of activeGuests) {
          const { score, breakdown } = calculateMatchScore({ guest, criminal });
          pairsChecked++;

          // PII-safe: never log plaintext / partial Aadhaar prefixes in the
          // hot loop. Only emit diagnostic logs when the score crosses the
          // alert threshold so we still get visibility on matches without
          // dumping every pair × its Aadhaar fragments into the log stream.
          if (score >= HIGH_PRIORITY_THRESHOLD) {
            logger.info('[VerificationSync] High-priority match candidate', {
              guestId: guest.id,
              criminalId: criminal.id,
              score,
              aadhaarMatch: breakdown.aadhaar,
            });
          }

          if (score < ALERT_THRESHOLD) continue;

          const existing = existingByPair.get(`${guest.id}|${criminal.id}`);

          if (existing) {
            if (existing.matchScore < score) {
              await policePrisma.matchAlert.update({
                where: { id: existing.id },
                data: { matchScore: score, matchBreakdown: breakdown, triggeredBy: 'SWEEP' },
              });
              existing.matchScore = score;
            }
            continue;
          }

          const alert = await policePrisma.matchAlert.create({
            data: {
              guestId: guest.id,
              criminalId: criminal.id,
              matchScore: score,
              matchBreakdown: breakdown,
              status: 'PENDING_REVIEW',
              triggeredBy: 'SWEEP',
              dispatchStatus: score >= HIGH_PRIORITY_THRESHOLD ? 'PENDING' : null,
            },
            select: { id: true },
          });
          existingByPair.set(`${guest.id}|${criminal.id}`, { id: alert.id, matchScore: score });
          alertsCreated++;

          if (score >= HIGH_PRIORITY_THRESHOLD) {
            emitCriminalMatchAlert({
              alertId: alert.id,
              criminalProfile: {
                id: criminal.id,
                fullName: criminal.fullName,
                aliases: criminal.aliases,
                crimeType: criminal.crimeType ?? 'Unknown',
                threatLevel: criminal.threatLevel,
                caseStatus: criminal.caseStatus,
              },
              guestCheckin: {
                name: guest.fullName,
                room: guest.room?.roomNumber ?? null,
                hotel: guest.hotel?.name ?? null,
                checkinTime: guest.checkInDate,
              },
              matchedField: Object.entries(breakdown)
                .filter(([, v]) => v >= 0.9)
                .map(([k]) => k.toUpperCase())
                .join(', ') || 'FUZZY_NAME',
              threatLevel: criminal.threatLevel,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }

      skip += BATCH_SIZE;

      // Emit progress after each criminal batch
      emitVerificationProgress({ jobId, type: 'SWEEP', status: 'PROCESSING', sourceName: 'Network Sweep', sourceId: 'sweep', checked: criminalsChecked, total: totalCriminals, alertsFound: alertsCreated, pct: totalCriminals > 0 ? Math.min(99, Math.round((criminalsChecked / totalCriminals) * 100)) : 99 });
    }

    const durationMs = Date.now() - startMs;

    // Emit completion
    emitVerificationProgress({ jobId, type: 'SWEEP', status: 'COMPLETE', sourceName: 'Network Sweep', sourceId: 'sweep', checked: criminalsChecked, total: totalCriminals, alertsFound: alertsCreated, pct: 100, durationMs });

    logger.info('[VerificationSync] Full sweep complete', {
      pairsChecked,
      alertsCreated,
      guestsChecked: activeGuests.length,
      durationMs,
    });

    await policePrisma.auditLog.create({
      data: {
        actorId: 'SYSTEM',
        actorType: 'POLICE',
        action: 'VERIFICATION_RUN',
        resourceType: 'Sweep',
        metadata: {
          trigger: 'SWEEP',
          pairsChecked,
          alertsCreated,
          guestsChecked: activeGuests.length,
          durationMs,
        },
      },
    });

    return { pairsChecked, alertsCreated };
  } catch (err) {
    logger.error('[VerificationSync] Full sweep failed', {
      error: err instanceof Error ? err.message : String(err),
      pairsChecked,
      alertsCreated,
    });
    emitVerificationProgress({ jobId, type: 'SWEEP', status: 'FAILED', sourceName: 'Network Sweep', sourceId: 'sweep', checked: 0, total: 0, alertsFound: alertsCreated, pct: 0 });
    return { pairsChecked, alertsCreated };
  }
};

// ─── Criminal → All Guests ────────────────────────────────────────────────────

/**
 * When a new criminal profile is created/updated, cross-reference against every
 * currently active hotel guest in the system.
 * Always resolves — errors are logged but never thrown.
 */
export const runCriminalVsAllGuests = async (
  criminalId: string,
  officerId: string
): Promise<void> => {
  const startMs = Date.now();
  let alertsCreated = 0;
  let pairsChecked = 0;
  const jobId = `sync-inject-${criminalId}-${Date.now()}`;

  try {
    const criminalRaw = await policePrisma.criminalProfile.findUnique({
      where: { id: criminalId },
      select: {
        id: true,
        fullName: true,
        aliases: true,
        aadhaarEncrypted: true,
        aadhaarHash: true,
        phones: true,
        approximateAge: true,
        passportNumber: true,
        drivingLicense: true,
        threatLevel: true,
        caseStatus: true,
        crimeType: true,
        firStationId: true,
      },
    });

    if (!criminalRaw) {
      logger.warn('[VerificationSync] Criminal not found', { criminalId });
      return;
    }

    // Decrypt Aadhaar for plain comparison
    const criminal = {
      ...criminalRaw,
      aadhaarNumber: safeDecrypt(criminalRaw.aadhaarEncrypted) || (criminalRaw.aadhaarHash?.replace(/\D/g, '') || ''),
    };

    // Count total guests upfront for progress bar
    const totalGuests = await hotelPrisma.guest.count({ where: { isActive: true } });

    emitVerificationProgress({ jobId, type: 'CRIMINAL_VS_GUESTS', status: 'PROCESSING', sourceName: criminal.fullName, sourceId: criminalId, checked: 0, total: totalGuests, alertsFound: 0, pct: 0 });

    let skip = 0;
    while (true) {
      const guests = await hotelPrisma.guest.findMany({
        where: { isActive: true },
        select: {
          id: true,
          fullName: true,
          aadhaarEncrypted: true,
          aadhaarHash: true,
          phoneNumber: true,
          age: true,
          guestType: true,
          passportNumber: true,
          hotel: { select: { id: true, name: true } },
          room: { select: { roomNumber: true } },
          checkInDate: true,
        },
        orderBy: { id: 'asc' },
        skip,
        take: BATCH_SIZE,
      });

      if (guests.length === 0) break;

      // One preload query per batch instead of N findFirst() calls in the loop.
      const guestIdsInBatch = guests.map((g: { id: string }) => g.id);
      const existingAlerts = await policePrisma.matchAlert.findMany({
        where: {
          criminalId: criminal.id,
          guestId: { in: guestIdsInBatch },
        },
        select: { id: true, guestId: true, matchScore: true },
      });
      const existingByGuest = new Map<string, { id: string; matchScore: number }>();
      for (const a of existingAlerts) {
        existingByGuest.set(a.guestId, { id: a.id, matchScore: a.matchScore });
      }

      for (const guestRaw of guests) {
        const guest = {
          ...guestRaw,
          aadhaarNumber: safeDecrypt(guestRaw.aadhaarEncrypted) || (guestRaw.aadhaarHash?.replace(/\D/g, '') || ''),
        };
        const { score, breakdown } = calculateMatchScore({ guest, criminal });
        pairsChecked++;

        if (score < ALERT_THRESHOLD) continue;

        const existing = existingByGuest.get(guest.id);

        if (existing) {
          if (existing.matchScore < score) {
            await policePrisma.matchAlert.update({
              where: { id: existing.id },
              data: { matchScore: score, matchBreakdown: breakdown, triggeredBy: 'INJECTION' },
            });
            existing.matchScore = score;
          }
          continue;
        }

        const alert = await policePrisma.matchAlert.create({
          data: {
            guestId: guest.id,
            criminalId: criminal.id,
            matchScore: score,
            matchBreakdown: breakdown,
            status: 'PENDING_REVIEW',
            triggeredBy: 'INJECTION',
            dispatchStatus: score >= HIGH_PRIORITY_THRESHOLD ? 'PENDING' : null,
          },
          select: { id: true },
        });
        existingByGuest.set(guest.id, { id: alert.id, matchScore: score });
        alertsCreated++;

        // Notify police in real-time for high-confidence matches
        if (score >= HIGH_PRIORITY_THRESHOLD) {
          emitCriminalMatchAlert({
            alertId: alert.id,
            criminalProfile: {
              id: criminal.id,
              fullName: criminal.fullName,
              aliases: criminal.aliases,
              crimeType: criminal.crimeType ?? 'Unknown',
              threatLevel: criminal.threatLevel,
              caseStatus: criminal.caseStatus,
            },
            guestCheckin: {
              name: guest.fullName,
              room: guest.room?.roomNumber ?? null,
              hotel: guest.hotel?.name ?? null,
              checkinTime: guest.checkInDate,
            },
            matchedField: Object.entries(breakdown)
              .filter(([, v]) => v >= 0.9)
              .map(([k]) => k.toUpperCase())
              .join(', ') || 'FUZZY_NAME',
            threatLevel: criminal.threatLevel,
            timestamp: new Date().toISOString(),
          });
        }
      }

      skip += BATCH_SIZE;

      emitVerificationProgress({ jobId, type: 'CRIMINAL_VS_GUESTS', status: 'PROCESSING', sourceName: criminal.fullName, sourceId: criminalId, checked: pairsChecked, total: totalGuests, alertsFound: alertsCreated, pct: totalGuests > 0 ? Math.min(99, Math.round((pairsChecked / totalGuests) * 100)) : 99 });
    }

    const durationMs = Date.now() - startMs;
    emitVerificationProgress({ jobId, type: 'CRIMINAL_VS_GUESTS', status: 'COMPLETE', sourceName: criminal.fullName, sourceId: criminalId, checked: pairsChecked, total: totalGuests, alertsFound: alertsCreated, pct: 100, durationMs });

    logger.info('[VerificationSync] Criminal→Guests sweep complete', {
      criminalId,
      pairsChecked,
      alertsCreated,
      durationMs,
    });

    // Audit log
    await policePrisma.auditLog.create({
      data: {
        actorId: officerId,
        actorType: 'POLICE',
        action: 'VERIFICATION_RUN',
        resourceType: 'CriminalProfile',
        resourceId: criminalId,
        metadata: {
          trigger: 'CRIMINAL_CREATED',
          pairsChecked,
          alertsCreated,
          durationMs: Date.now() - startMs,
        },
      },
    });
  } catch (err) {
    logger.error('[VerificationSync] Criminal→Guests sweep failed', {
      criminalId,
      error: err instanceof Error ? err.message : String(err),
    });
    emitVerificationProgress({ jobId, type: 'CRIMINAL_VS_GUESTS', status: 'FAILED', sourceName: criminalId, sourceId: criminalId, checked: pairsChecked, total: 0, alertsFound: alertsCreated, pct: 0 });
  }
};

// ─── Guest → All Criminals ────────────────────────────────────────────────────

/**
 * When a new guest checks in, cross-reference against every active criminal
 * profile in the system.
 * Always resolves — errors are logged but never thrown.
 */
export const runGuestVsAllCriminals = async (
  guestId: string,
  hotelId: string
): Promise<void> => {
  const startMs = Date.now();
  let alertsCreated = 0;
  let pairsChecked = 0;
  const jobId = `sync-guest-${guestId}-${Date.now()}`;

  try {
    const guestRaw = await hotelPrisma.guest.findUnique({
      where: { id: guestId },
      select: {
        id: true,
        fullName: true,
        aadhaarEncrypted: true,
        aadhaarHash: true,
        phoneNumber: true,
        age: true,
        guestType: true,
        passportNumber: true,
        checkInDate: true,
        hotel: { select: { id: true, name: true } },
        room: { select: { roomNumber: true } },
      },
    });

    if (!guestRaw) {
      logger.warn('[VerificationSync] Guest not found', { guestId });
      return;
    }

    // Decrypt Aadhaar for plain comparison
    const guest = {
      ...guestRaw,
      aadhaarNumber: safeDecrypt(guestRaw.aadhaarEncrypted) || (guestRaw.aadhaarHash?.replace(/\D/g, '') || ''),
    };

    // Count total active criminals upfront for progress bar
    const totalCriminals = await policePrisma.criminalProfile.count({ where: { isActive: true } });

    emitVerificationProgress({ jobId, type: 'GUEST_VS_CRIMINALS', status: 'PROCESSING', sourceName: guest.fullName, sourceId: guestId, checked: 0, total: totalCriminals, alertsFound: 0, pct: 0 });

    let skip = 0;
    while (true) {
      const criminalsRaw = await policePrisma.criminalProfile.findMany({
        where: {
          isActive: true,
        },
        select: {
          id: true,
          fullName: true,
          aliases: true,
          aadhaarEncrypted: true,
          aadhaarHash: true,
          phones: true,
          approximateAge: true,
          passportNumber: true,
          drivingLicense: true,
          threatLevel: true,
          caseStatus: true,
          crimeType: true,
          firStationId: true,
        },
        orderBy: { id: 'asc' },
        skip,
        take: BATCH_SIZE,
      });

      if (criminalsRaw.length === 0) break;

      const criminals = criminalsRaw.map((c: any) => ({
        ...c,
        aadhaarNumber: safeDecrypt(c.aadhaarEncrypted) || (c.aadhaarHash?.replace(/\D/g, '') || ''),
      }));

      // Preload existing alerts for this guest × criminal-batch in one query.
      const criminalIdsInBatch = criminals.map((c: { id: string }) => c.id);
      const existingAlerts = await policePrisma.matchAlert.findMany({
        where: {
          guestId: guest.id,
          criminalId: { in: criminalIdsInBatch },
        },
        select: { id: true, criminalId: true, matchScore: true },
      });
      const existingByCriminal = new Map<string, { id: string; matchScore: number }>();
      for (const a of existingAlerts) {
        existingByCriminal.set(a.criminalId, { id: a.id, matchScore: a.matchScore });
      }

      for (const criminal of criminals) {
        const { score, breakdown } = calculateMatchScore({ guest, criminal });
        pairsChecked++;

        if (score < ALERT_THRESHOLD) continue;

        const existing = existingByCriminal.get(criminal.id);

        if (existing) {
          if (existing.matchScore < score) {
            await policePrisma.matchAlert.update({
              where: { id: existing.id },
              data: { matchScore: score, matchBreakdown: breakdown, triggeredBy: 'CHECKIN' },
            });
            existing.matchScore = score;
          }
          continue;
        }

        const alert = await policePrisma.matchAlert.create({
          data: {
            guestId: guest.id,
            criminalId: criminal.id,
            matchScore: score,
            matchBreakdown: breakdown,
            status: 'PENDING_REVIEW',
            triggeredBy: 'CHECKIN',
            dispatchStatus: score >= HIGH_PRIORITY_THRESHOLD ? 'PENDING' : null,
          },
          select: { id: true },
        });
        existingByCriminal.set(criminal.id, { id: alert.id, matchScore: score });
        alertsCreated++;

        // Notify police in real-time for high-confidence matches
        if (score >= HIGH_PRIORITY_THRESHOLD) {
          emitCriminalMatchAlert({
            alertId: alert.id,
            criminalProfile: {
              id: criminal.id,
              fullName: criminal.fullName,
              aliases: criminal.aliases,
              crimeType: criminal.crimeType ?? 'Unknown',
              threatLevel: criminal.threatLevel,
              caseStatus: criminal.caseStatus,
            },
            guestCheckin: {
              name: guest.fullName,
              room: guest.room?.roomNumber ?? null,
              hotel: guest.hotel?.name ?? null,
              checkinTime: guest.checkInDate,
            },
            matchedField: Object.entries(breakdown)
              .filter(([, v]) => v >= 0.9)
              .map(([k]) => k.toUpperCase())
              .join(', ') || 'FUZZY_NAME',
            threatLevel: criminal.threatLevel,
            timestamp: new Date().toISOString(),
          });
        }
      }

      skip += BATCH_SIZE;

      emitVerificationProgress({ jobId, type: 'GUEST_VS_CRIMINALS', status: 'PROCESSING', sourceName: guest.fullName, sourceId: guestId, checked: pairsChecked, total: totalCriminals, alertsFound: alertsCreated, pct: totalCriminals > 0 ? Math.min(99, Math.round((pairsChecked / totalCriminals) * 100)) : 99 });
    }

    const durationMs = Date.now() - startMs;
    emitVerificationProgress({ jobId, type: 'GUEST_VS_CRIMINALS', status: 'COMPLETE', sourceName: guest.fullName, sourceId: guestId, checked: pairsChecked, total: totalCriminals, alertsFound: alertsCreated, pct: 100, durationMs });

    logger.info('[VerificationSync] Guest→Criminals sweep complete', {
      guestId,
      hotelId,
      pairsChecked,
      alertsCreated,
      durationMs,
    });

    await policePrisma.auditLog.create({
      data: {
        actorId: 'SYSTEM',
        actorType: 'POLICE',
        action: 'VERIFICATION_RUN',
        resourceType: 'Guest',
        resourceId: guestId,
        metadata: { trigger: 'CHECKIN', hotelId, pairsChecked, alertsCreated, durationMs },
      },
    });
  } catch (err) {
    logger.error('[VerificationSync] Guest→Criminals sweep failed', {
      guestId,
      error: err instanceof Error ? err.message : String(err),
    });
    emitVerificationProgress({ jobId, type: 'GUEST_VS_CRIMINALS', status: 'FAILED', sourceName: guestId, sourceId: guestId, checked: pairsChecked, total: 0, alertsFound: alertsCreated, pct: 0 });
  }
};
