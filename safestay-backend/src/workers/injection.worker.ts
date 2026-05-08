/**
 * Injection Verification Worker — V2 Phase 1
 *
 * Processes a single criminal profile against ALL currently active guests
 * in the jurisdiction. Runs as a BullMQ background job.
 *
 * Match Rules:
 *   score >= 0.70 → PENDING_REVIEW + enqueue dispatch
 *   score >= 0.40 → REVIEW_REQUIRED (no auto-dispatch)
 *   score <  0.40 → ignored
 *
 * STEALTH: Uses policePrisma for criminal data, hotelPrisma for guest data.
 * Hotel API is never involved. No request path is shared.
 */

import { Worker, Job } from 'bullmq';
import { env } from '../config/env';
import { InjectionJobData } from '../queues/injectionQueue';
import { policePrisma } from '../config/policeDatabase';
import { hotelPrisma } from '../config/hotelDatabase';
import { calculateMatchScore } from '../utils/matchScore';
import { logger } from '../utils/logger';
import { dispatchHighPriorityAlert } from '../services/alertDispatch.service';
import { emitCriminalMatchAlert } from '../config/socketio';

const BATCH_SIZE = 500;
const HIGH_PRIORITY_THRESHOLD = 0.70;
const ALERT_THRESHOLD = 0.40;
const JOB_TIMEOUT_MS = 120_000; // 2 minutes

async function processInjectionJob(job: Job<InjectionJobData>): Promise<void> {
  const { criminalId } = job.data;
  const jobStart = Date.now();

  logger.info('[InjectionWorker] Job started', {
    jobId: job.id,
    criminalId,
    jurisdictionPath: job.data.jurisdictionPath,
    threatLevel: job.data.threatLevel,
  });

  const criminal = await policePrisma.criminalProfile.findUnique({
    where: { id: criminalId },
    select: {
      id: true,
      fullName: true,
      aliases: true,
      aadhaarHash: true,
      phones: true,
      approximateAge: true,
      passportNumber: true,
      threatLevel: true,
      caseStatus: true,
      crimeType: true,
      firStationId: true,
      enteredById: true,
      jurisdictionPath: true,
    },
  });

  if (!criminal) {
    logger.warn('[InjectionWorker] Criminal not found — skipping', { criminalId });
    return;
  }

  // Fall back to the criminal record's own state when the job payload is
  // missing fields (e.g. legacy jobs, manual re-runs, ops triggers).  This
  // prevents a silent audit-log crash that used to fail the whole job with
  // "actorId: String" and loop until the max attempt count.
  const jurisdictionPath = job.data.jurisdictionPath ?? criminal.jurisdictionPath;
  const threatLevel = job.data.threatLevel ?? criminal.threatLevel;
  const triggeredByOfficerId = job.data.triggeredByOfficerId ?? criminal.enteredById;

  // Fetch active guests in batches
  let skip = 0;
  let totalPairsChecked = 0;
  let alertsCreated = 0;
  let dispatchCount = 0;

  while (true) {
    const guests = await hotelPrisma.guest.findMany({
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
        room: { select: { roomNumber: true } },
        hotel: { select: { id: true, name: true, nearestStationId: true } },
      },
      // Stable ordering is required for skip/take paging to be deterministic.
      orderBy: { id: 'asc' },
      skip,
      take: BATCH_SIZE,
    });

    if (guests.length === 0) break;

    // Preload any existing alerts for this criminal × guest-batch in one
    // query. Replaces the per-pair findFirst() that used to make N DB calls
    // inside the loop. O(1) Map lookup per iteration.
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

    for (const guest of guests) {
      const { score, breakdown } = calculateMatchScore({ guest, criminal });

      if (score >= ALERT_THRESHOLD) {
        const existing = existingByGuest.get(guest.id);

        if (!existing) {
          const newAlert = await policePrisma.matchAlert.create({
            data: {
              guestId: guest.id,
              criminalId: criminal.id,
              matchScore: score,
              matchBreakdown: breakdown,
              triggeredBy: 'INJECTION',
              status: score >= HIGH_PRIORITY_THRESHOLD ? 'PENDING_REVIEW' : 'PENDING_REVIEW',
              dispatchStatus: score >= HIGH_PRIORITY_THRESHOLD ? 'PENDING' : null,
            },
            select: { id: true },
          });
          existingByGuest.set(guest.id, { id: newAlert.id, matchScore: score });
          alertsCreated++;

          if (score >= HIGH_PRIORITY_THRESHOLD) {
            // Broadcast the match to every connected police officer in real-time.
            // Without this, officers only see the alert on their next page refresh.
            // (The verification/sweep workers already do this; only injection
            // was missing the emit, so brand-new criminal uploads produced a DB
            // row but never a live toast — caught during E2E.)
            const matchedField =
              breakdown.aadhaar === 1 ? 'aadhaar'
              : breakdown.phone === 1 ? 'phone'
              : breakdown.passport === 1 ? 'passport'
              : breakdown.name > 0 ? 'name'
              : 'age';

            emitCriminalMatchAlert({
              alertId: newAlert.id,
              criminalProfile: {
                id: criminal.id,
                fullName: criminal.fullName,
                aliases: criminal.aliases ?? [],
                crimeType: (criminal as { crimeType?: string }).crimeType ?? '',
                threatLevel: criminal.threatLevel,
                caseStatus: (criminal as { caseStatus?: string }).caseStatus ?? '',
              },
              guestCheckin: {
                name: guest.fullName,
                room: guest.room?.roomNumber ?? null,
                hotel: guest.hotel.name ?? null,
                checkinTime: guest.checkInDate,
              },
              matchedField,
              threatLevel: criminal.threatLevel,
              timestamp: new Date().toISOString(),
            });

            // Fire-and-forget dispatch (non-blocking)
            dispatchHighPriorityAlert({
              alertId: newAlert.id,
              guestHotelId: guest.hotel.id,
              guestHotelStationId: guest.hotel.nearestStationId ?? undefined,
              criminalFirStationId: criminal.firStationId,
              matchScore: score,
              triggeredBy: 'INJECTION',
            }).catch((err) =>
              logger.error('[InjectionWorker] Dispatch failed', { alertId: newAlert.id, err })
            );
            dispatchCount++;
          }
        } else if (existing.matchScore < score) {
          await policePrisma.matchAlert.update({
            where: { id: existing.id },
            data: { matchScore: score, matchBreakdown: breakdown, triggeredBy: 'INJECTION' },
          });
          existing.matchScore = score;
        }
      }

      totalPairsChecked++;
    }

    skip += BATCH_SIZE;

    if (Date.now() - jobStart > JOB_TIMEOUT_MS) {
      logger.warn('[InjectionWorker] Job approaching timeout — stopping batch loop early', {
        jobId: job.id,
        totalPairsChecked,
      });
      break;
    }
  }

  // Audit log
  await policePrisma.auditLog.create({
    data: {
      actorId: triggeredByOfficerId,
      actorType: 'POLICE',
      action: 'VERIFICATION_RUN',
      resourceType: 'CriminalProfile',
      resourceId: criminalId,
      metadata: {
        trigger: 'INJECTION',
        jurisdictionPath,
        totalPairsChecked,
        alertsCreated,
        dispatchCount,
        threatLevel,
        durationMs: Date.now() - jobStart,
      },
    },
  });

  logger.info('[InjectionWorker] Job complete', {
    jobId: job.id,
    criminalId,
    totalPairsChecked,
    alertsCreated,
    dispatchCount,
    durationMs: Date.now() - jobStart,
  });
}

let _injectionWorker: Worker<InjectionJobData> | null = null;

export const startInjectionWorker = (): void => {
  if (_injectionWorker) return;

  _injectionWorker = new Worker<InjectionJobData>(
    'injection-verification',
    processInjectionJob,
    {
      connection: { url: env.REDIS_URL },
      concurrency: 2, // Two injection jobs can run concurrently
      lockDuration: 150_000,
    }
  );

  _injectionWorker.on('completed', (job) => {
    logger.info('[InjectionWorker] Completed', { jobId: job?.id });
  });
  _injectionWorker.on('failed', (job, err) => {
    logger.error('[InjectionWorker] Failed', { jobId: job?.id, error: err?.message });
  });
  _injectionWorker.on('stalled', (jobId) => {
    logger.warn('[InjectionWorker] Stalled', { jobId });
  });
  // Prevent unhandled 'error' event from crashing the process
  _injectionWorker.on('error', (err: unknown) => {
    logger.error('[InjectionWorker] Worker connection error — injection matching disabled', {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  logger.info('[InjectionWorker] Worker started');
};

export const stopInjectionWorker = async (): Promise<void> => {
  if (_injectionWorker) {
    await _injectionWorker.close();
    _injectionWorker = null;
    logger.info('[InjectionWorker] Worker stopped');
  }
};
