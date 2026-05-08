/**
 * Verification engine — pure business logic, no HTTP/queue concerns.
 *
 * Called exclusively by the BullMQ worker.  Hotel request handlers NEVER
 * call this service directly, which eliminates shared execution paths and
 * guarantees the stealth requirement.
 *
 * PHASE 3 FEATURES:
 * - Batch processing: criminals fetched in slices of batchSize (default 500)
 * - Per-batch pair matching bounded in memory
 * - Monitoring: returns totalPairsChecked, alertsGenerated, batchesProcessed
 */

import { policePrisma } from '../config/policeDatabase';
import { hotelPrisma } from '../config/hotelDatabase';
import { calculateMatchScore } from '../utils/matchScore';
import { logger } from '../utils/logger';
import { dispatchHighPriorityAlert } from './alertDispatch.service';
import { emitCriminalMatchAlert, emitVerificationProgress } from '../config/socketio';

// Minimum score to create a MatchAlert.  Below this threshold the pair is
// silently ignored — no DB write, no log entry.
const ALERT_THRESHOLD = 0.40;

export interface VerificationBatchInput {
  jurisdictionPath: string;
  batchSize?: number;
  // Optional: when provided, per-batch progress and completion events are
  // emitted on the police Socket.IO channel so dashboards can show a live
  // progress banner and refresh their alert counters.
  jobId?: string;
}

export interface VerificationBatchResult {
  totalPairsChecked: number;
  alertsGenerated: number;
  batchesProcessed: number;
}

/**
 * Runs the criminal × guest cross-product match for one jurisdiction.
 * Criminals are processed in batches of `batchSize` to cap memory usage.
 */
export const runVerificationBatch = async (
  input: VerificationBatchInput
): Promise<VerificationBatchResult> => {
  const { jurisdictionPath, batchSize = 500, jobId } = input;
  const startTime = Date.now();

  const HIGH_PRIORITY_THRESHOLD = 0.70;

  // Fetch all currently active guests in this jurisdiction once.
  const activeGuests = await hotelPrisma.guest.findMany({
    where: {
      isActive: true,
      hotel: { jurisdictionPath: { startsWith: jurisdictionPath } },
    },
    select: {
      id: true,
      fullName: true,
      aadhaarHash: true,
      phoneNumber: true,
      age: true,
      guestType: true,
      passportNumber: true,
      checkInDate: true,
      hotel: { select: { id: true, name: true, nearestStationId: true } },
      room: { select: { roomNumber: true } },
    },
  });

  // Count total criminals for monitoring
  const totalCriminals = await policePrisma.criminalProfile.count({
    where: {
      isActive: true,
      caseStatus: { in: ['WANTED', 'ABSCONDING'] },
      jurisdictionPath: { startsWith: jurisdictionPath },
    },
  });

  if (activeGuests.length === 0) {
    logger.info('[VerificationService] No active guests — skipping', { jurisdictionPath });
    if (jobId) {
      emitVerificationProgress({
        jobId,
        type: 'SWEEP',
        status: 'COMPLETE',
        sourceName: 'Network Sweep',
        sourceId: 'sweep',
        checked: 0,
        total: totalCriminals,
        alertsFound: 0,
        pct: 100,
        durationMs: Date.now() - startTime,
      });
    }
    return { totalPairsChecked: 0, alertsGenerated: 0, batchesProcessed: 0 };
  }

  // Emit "started" so the dashboard banner appears right away
  if (jobId) {
    emitVerificationProgress({
      jobId,
      type: 'SWEEP',
      status: 'PROCESSING',
      sourceName: 'Network Sweep',
      sourceId: 'sweep',
      checked: 0,
      total: totalCriminals,
      alertsFound: 0,
      pct: 0,
    });
  }

  let alertsGenerated = 0;
  let totalPairsChecked = 0;
  let batchesProcessed = 0;
  let skip = 0;

  const guestIds = activeGuests.map((g: { id: string }) => g.id);

  // Process criminals in batches
  while (skip < totalCriminals) {
    const criminals = await policePrisma.criminalProfile.findMany({
      where: {
        isActive: true,
        caseStatus: { in: ['WANTED', 'ABSCONDING'] },
        jurisdictionPath: { startsWith: jurisdictionPath },
      },
      select: {
        id: true,
        fullName: true,
        aliases: true,
        aadhaarHash: true,
        phones: true,
        approximateAge: true,
        passportNumber: true,
        threatLevel: true,
        firStationId: true,
        crimeType: true,
        caseStatus: true,
      },
      // Deterministic batch paging
      orderBy: { id: 'asc' },
      skip,
      take: batchSize,
    });

    if (criminals.length === 0) break;

    batchesProcessed++;

    // Preload all PENDING_REVIEW alerts for this criminal-batch × guest set
    // in one query. Eliminates the O(C*G) findFirst() DB calls.
    const criminalIdsInBatch = criminals.map((c: { id: string }) => c.id);
    const existingAlerts = await policePrisma.matchAlert.findMany({
      where: {
        guestId: { in: guestIds },
        criminalId: { in: criminalIdsInBatch },
        status: 'PENDING_REVIEW',
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

        if (score >= ALERT_THRESHOLD) {
          const existing = existingByPair.get(`${guest.id}|${criminal.id}`);

          if (!existing) {
            const newAlert = await policePrisma.matchAlert.create({
              data: {
                guestId: guest.id,
                criminalId: criminal.id,
                matchScore: score,
                matchBreakdown: breakdown,
                triggeredBy: 'MANUAL',
                dispatchStatus: score >= HIGH_PRIORITY_THRESHOLD ? 'PENDING' : null,
              },
              select: { id: true },
            });
            existingByPair.set(`${guest.id}|${criminal.id}`, { id: newAlert.id, matchScore: score });
            alertsGenerated++;

            // Dispatch alert for high-confidence manual verification matches
            if (score >= HIGH_PRIORITY_THRESHOLD) {
              const guestWithHotel = guest as typeof guest & { hotel: { id: string; nearestStationId: string | null } };
              dispatchHighPriorityAlert({
                alertId: newAlert.id,
                guestHotelId: guestWithHotel.hotel.id,
                guestHotelStationId: guestWithHotel.hotel.nearestStationId ?? undefined,
                criminalFirStationId: criminal.firStationId,
                matchScore: score,
                triggeredBy: 'MANUAL',
              }).catch((err) =>
                logger.error('[VerificationService] Dispatch failed', { alertId: newAlert.id, err })
              );

              // Notify every connected officer so the bell badge increments
              // and a threat-level toast appears immediately — the same
              // payload shape the sync/identity services emit.
              emitCriminalMatchAlert({
                alertId: newAlert.id,
                criminalProfile: {
                  id: criminal.id,
                  fullName: criminal.fullName,
                  aliases: criminal.aliases ?? [],
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
                  .filter(([, v]) => (v as number) >= 0.9)
                  .map(([k]) => k.toUpperCase())
                  .join(', ') || 'FUZZY_NAME',
                threatLevel: criminal.threatLevel,
                timestamp: new Date().toISOString(),
              });
            }
          } else if (existing.matchScore < score) {
            await policePrisma.matchAlert.update({
              where: { id: existing.id },
              data: { matchScore: score, matchBreakdown: breakdown },
            });
            existing.matchScore = score;
          }
        }

        totalPairsChecked++;
      }
    }

    logger.info('[VerificationService] Batch processed', {
      jurisdictionPath,
      batch: batchesProcessed,
      criminalsInBatch: criminals.length,
      totalPairsChecked,
      alertsGeneratedSoFar: alertsGenerated,
    });

    skip += batchSize;

    // Emit per-batch progress so the dashboard progress bar advances.
    if (jobId) {
      const criminalsChecked = Math.min(skip, totalCriminals);
      emitVerificationProgress({
        jobId,
        type: 'SWEEP',
        status: 'PROCESSING',
        sourceName: 'Network Sweep',
        sourceId: 'sweep',
        checked: criminalsChecked,
        total: totalCriminals,
        alertsFound: alertsGenerated,
        pct: totalCriminals > 0 ? Math.min(99, Math.round((criminalsChecked / totalCriminals) * 100)) : 99,
      });
    }
  }

  const durationMs = Date.now() - startTime;

  logger.info('[VerificationService] Verification complete', {
    jurisdictionPath,
    totalPairsChecked,
    alertsGenerated,
    batchesProcessed,
    durationMs,
  });

  // Emit completion so the frontend can clear the banner and invalidate its
  // alert/stat caches (PoliceLayout listens for COMPLETE to refetch).
  if (jobId) {
    emitVerificationProgress({
      jobId,
      type: 'SWEEP',
      status: 'COMPLETE',
      sourceName: 'Network Sweep',
      sourceId: 'sweep',
      checked: totalCriminals,
      total: totalCriminals,
      alertsFound: alertsGenerated,
      pct: 100,
      durationMs,
    });
  }

  return { totalPairsChecked, alertsGenerated, batchesProcessed };
};
