/**
 * Sweep Verification Worker — V2 Phase 1
 *
 * Scheduled many-to-many verification: every active criminal vs. every active
 * guest, scoped per police station jurisdiction.
 *
 * Performance design:
 * - Criminals fetched in batches of CRIMINAL_BATCH_SIZE per jurisdiction
 * - Guests pre-loaded once per jurisdiction (they are fewer and indexed)
 * - Estimated throughput: ~10M comparisons in < 5 minutes
 *
 * STEALTH: Uses policePrisma for criminal + alert data; hotelPrisma for guests.
 * No hotel request path is shared.
 */

import { Worker, Job } from 'bullmq';
import { env } from '../config/env';
import { SweepJobData } from '../queues/sweepQueue';
import { policePrisma } from '../config/policeDatabase';
import { hotelPrisma } from '../config/hotelDatabase';
import { calculateMatchScore } from '../utils/matchScore';
import { logger } from '../utils/logger';
import { dispatchHighPriorityAlert } from '../services/alertDispatch.service';

const CRIMINAL_BATCH_SIZE = 500;
const HIGH_PRIORITY_THRESHOLD = 0.70;
const ALERT_THRESHOLD = 0.40;

async function processSweepJob(job: Job<SweepJobData>): Promise<void> {
  const sweepStart = Date.now();
  logger.info('[SweepWorker] Sweep started', { jobId: job.id });

  // Fetch all distinct jurisdiction paths (from stations)
  const stations = await policePrisma.station.findMany({
    select: { jurisdictionPath: true },
  });

  let totalCriminalsChecked = 0;
  let totalGuestsChecked = 0;
  let totalPairsChecked = 0;
  let totalAlertsCreated = 0;
  let totalDispatched = 0;
  let stationsProcessed = 0;

  for (const station of stations) {
    const { jurisdictionPath } = station;

    // Pre-load all active guests in this jurisdiction
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
        hotel: { select: { id: true, nearestStationId: true } },
      },
    });

    if (activeGuests.length === 0) continue;
    totalGuestsChecked += activeGuests.length;

    // Process criminals in batches
    const totalCriminals = await policePrisma.criminalProfile.count({
      where: {
        isActive: true,
        caseStatus: { in: ['WANTED', 'ABSCONDING'] },
        jurisdictionPath: { startsWith: jurisdictionPath },
      },
    });

    if (totalCriminals === 0) continue;

    let skip = 0;
    const guestIds = activeGuests.map((g: { id: string }) => g.id);
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
        },
        // Stable ordering is required for skip/take paging to be deterministic.
        orderBy: { id: 'asc' },
        skip,
        take: CRIMINAL_BATCH_SIZE,
      });

      if (criminals.length === 0) break;
      totalCriminalsChecked += criminals.length;

      // ── Preload every existing alert for this criminal-batch × guest set
      //    in ONE query. Replaces the per-pair findFirst() that used to make
      //    O(criminals × guests) DB calls. Lookup is then an in-memory Map.
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

          if (score >= ALERT_THRESHOLD) {
            const existing = existingByPair.get(`${guest.id}|${criminal.id}`);

            if (!existing) {
              const newAlert = await policePrisma.matchAlert.create({
                data: {
                  guestId: guest.id,
                  criminalId: criminal.id,
                  matchScore: score,
                  matchBreakdown: breakdown,
                  triggeredBy: 'SWEEP',
                  dispatchStatus: score >= HIGH_PRIORITY_THRESHOLD ? 'PENDING' : null,
                },
                select: { id: true },
              });
              // Cache the just-created row so a second criminal in the same
              // batch that also matches the same guest doesn't race-duplicate.
              existingByPair.set(`${guest.id}|${criminal.id}`, { id: newAlert.id, matchScore: score });
              totalAlertsCreated++;

              if (score >= HIGH_PRIORITY_THRESHOLD) {
                dispatchHighPriorityAlert({
                  alertId: newAlert.id,
                  guestHotelId: guest.hotel.id,
                  guestHotelStationId: guest.hotel.nearestStationId ?? undefined,
                  criminalFirStationId: criminal.firStationId,
                  matchScore: score,
                  triggeredBy: 'SWEEP',
                }).catch((err) =>
                  logger.error('[SweepWorker] Dispatch failed', { alertId: newAlert.id, err })
                );
                totalDispatched++;
              }
            } else if (existing.matchScore < score) {
              await policePrisma.matchAlert.update({
                where: { id: existing.id },
                data: {
                  matchScore: score,
                  matchBreakdown: breakdown,
                  triggeredBy: 'SWEEP',
                },
              });
              existing.matchScore = score;
            }
          }

          totalPairsChecked++;
        }
      }

      skip += CRIMINAL_BATCH_SIZE;
    }

    stationsProcessed++;
  }

  const durationMs = Date.now() - sweepStart;

  // Audit log
  await policePrisma.auditLog.create({
    data: {
      actorId: 'SYSTEM',
      actorType: 'POLICE',
      action: 'VERIFICATION_RUN',
      resourceType: 'Sweep',
      metadata: {
        trigger: 'SWEEP',
        stationsProcessed,
        totalCriminalsChecked,
        totalGuestsChecked,
        totalPairsChecked,
        totalAlertsCreated,
        totalDispatched,
        durationMs,
      },
    },
  });

  logger.info('[SweepWorker] Sweep complete', {
    jobId: job.id,
    stationsProcessed,
    totalPairsChecked,
    totalAlertsCreated,
    totalDispatched,
    durationMs,
  });
}

let _sweepWorker: Worker<SweepJobData> | null = null;

export const startSweepWorker = (): void => {
  if (_sweepWorker) return;

  _sweepWorker = new Worker<SweepJobData>(
    'sweep-verification',
    processSweepJob,
    {
      connection: { url: env.REDIS_URL },
      concurrency: 1, // Only one sweep at a time
      lockDuration: 600_000, // 10 minutes for large networks
    }
  );

  _sweepWorker.on('completed', (job) => {
    logger.info('[SweepWorker] Completed', { jobId: job?.id });
  });
  _sweepWorker.on('failed', (job, err) => {
    logger.error('[SweepWorker] Failed', { jobId: job?.id, error: err?.message });
  });
  _sweepWorker.on('stalled', (jobId) => {
    logger.warn('[SweepWorker] Stalled', { jobId });
  });
  // Prevent unhandled 'error' event from crashing the process
  _sweepWorker.on('error', (err: unknown) => {
    logger.error('[SweepWorker] Worker connection error — sweep disabled', {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  logger.info('[SweepWorker] Worker started');
};

export const stopSweepWorker = async (): Promise<void> => {
  if (_sweepWorker) {
    await _sweepWorker.close();
    _sweepWorker = null;
    logger.info('[SweepWorker] Worker stopped');
  }
};
