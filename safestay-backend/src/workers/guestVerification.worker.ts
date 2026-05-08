/**
 * Guest Verification Worker — V1
 *
 * Processes one guest check-in against ALL active criminal profiles
 * (WANTED / ABSCONDING / UNDER_INVESTIGATION).
 * Runs as a BullMQ background job.
 *
 * Match Rules:
 *   score >= 0.70 → PENDING_REVIEW + emit CRIMINAL_MATCH_ALERT
 *   score >= 0.40 → PENDING_REVIEW (no auto-dispatch)
 *   score <  0.40 → ignored
 *
 * Progress tracking:
 *   Emits VERIFICATION_PROGRESS Socket.IO events every batch so the police
 *   portal can show a live "X/Y criminals checked, N matches found" banner.
 */

import { Worker, Job } from 'bullmq';
import { env } from '../config/env';
import { GuestVerificationJobData } from '../queues/guestVerificationQueue';
import { policePrisma } from '../config/policeDatabase';
import { hotelPrisma } from '../config/hotelDatabase';
import { calculateMatchScore } from '../utils/matchScore';
import { logger } from '../utils/logger';
import { emitCriminalMatchAlert, emitVerificationProgress } from '../config/socketio';

const BATCH_SIZE = 500;
const HIGH_PRIORITY_THRESHOLD = 0.70;
const ALERT_THRESHOLD = 0; // Store ALL verification results
const JOB_TIMEOUT_MS = 120_000; // 2 minutes

async function processGuestVerificationJob(job: Job<GuestVerificationJobData>): Promise<void> {
  const { guestId, guestName, hotelId } = job.data;
  const jobStart = Date.now();
  const jobId = job.id ?? `guest-verify-${guestId}`;

  logger.info('[GuestVerificationWorker] Job started', { jobId, guestId, guestName, hotelId });

  const guest = await hotelPrisma.guest.findUnique({
    where: { id: guestId },
    select: {
      id: true,
      fullName: true,
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

  if (!guest) {
    logger.warn('[GuestVerificationWorker] Guest not found — skipping', { guestId });
    return;
  }

  // Count total active criminals upfront for progress bar
  const totalCriminals = await policePrisma.criminalProfile.count({
    where: { isActive: true },
  });

  // Emit "started" event
  emitVerificationProgress({
    jobId,
    type: 'GUEST_VS_CRIMINALS',
    status: 'PROCESSING',
    sourceName: guest.fullName,
    sourceId: guestId,
    checked: 0,
    total: totalCriminals,
    alertsFound: 0,
    pct: 0,
  });

  let skip = 0;
  let totalPairsChecked = 0;
  let alertsCreated = 0;

  while (true) {
    const criminals = await policePrisma.criminalProfile.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        fullName: true,
        aliases: true,
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
      // Stable ordering is required for skip/take paging to be deterministic.
      orderBy: { id: 'asc' },
      skip,
      take: BATCH_SIZE,
    });

    if (criminals.length === 0) break;

    // Batch-preload existing alerts for this (guest, criminals-in-batch) slice
    // so we replace the per-criminal findFirst() with a single round trip and
    // an in-memory Map lookup. This collapses the hot loop from O(C) DB calls
    // per guest to O(C / BATCH_SIZE).
    const batchCriminalIds = criminals.map((c) => c.id);
    const existingAlerts = await policePrisma.matchAlert.findMany({
      where: { guestId: guest.id, criminalId: { in: batchCriminalIds } },
      select: { id: true, criminalId: true, matchScore: true },
    });
    const existingByCriminalId = new Map(
      existingAlerts.map((a) => [a.criminalId, a])
    );

    for (const criminal of criminals) {
      const { score, breakdown } = calculateMatchScore({ guest, criminal });

      if (score >= ALERT_THRESHOLD) {
        const existing = existingByCriminalId.get(criminal.id);

        if (!existing) {
          const newAlert = await policePrisma.matchAlert.create({
            data: {
              guestId: guest.id,
              criminalId: criminal.id,
              matchScore: score,
              matchBreakdown: breakdown,
              triggeredBy: 'CHECKIN',
              status: 'PENDING_REVIEW',
              dispatchStatus: score >= HIGH_PRIORITY_THRESHOLD ? 'PENDING' : null,
            },
          });
          alertsCreated++;

          if (score >= HIGH_PRIORITY_THRESHOLD) {
            emitCriminalMatchAlert({
              alertId: newAlert.id,
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
        } else if (existing.matchScore < score) {
          await policePrisma.matchAlert.update({
            where: { id: existing.id },
            data: { matchScore: score, matchBreakdown: breakdown, triggeredBy: 'CHECKIN' },
          });
        }
      }

      totalPairsChecked++;
    }

    skip += BATCH_SIZE;

    // Emit progress after every batch
    emitVerificationProgress({
      jobId,
      type: 'GUEST_VS_CRIMINALS',
      status: 'PROCESSING',
      sourceName: guest.fullName,
      sourceId: guestId,
      checked: totalPairsChecked,
      total: totalCriminals,
      alertsFound: alertsCreated,
      pct: totalCriminals > 0 ? Math.min(99, Math.round((totalPairsChecked / totalCriminals) * 100)) : 99,
    });

    if (Date.now() - jobStart > JOB_TIMEOUT_MS) {
      logger.warn('[GuestVerificationWorker] Job approaching timeout — stopping early', {
        jobId,
        totalPairsChecked,
      });
      break;
    }
  }

  const durationMs = Date.now() - jobStart;

  // Emit completion
  emitVerificationProgress({
    jobId,
    type: 'GUEST_VS_CRIMINALS',
    status: 'COMPLETE',
    sourceName: guest.fullName,
    sourceId: guestId,
    checked: totalPairsChecked,
    total: totalCriminals,
    alertsFound: alertsCreated,
    pct: 100,
    durationMs,
  });

  logger.info('[GuestVerificationWorker] Job complete', {
    jobId,
    guestId,
    totalPairsChecked,
    alertsCreated,
    durationMs,
  });
}

let _guestVerificationWorker: Worker<GuestVerificationJobData> | null = null;

export const startGuestVerificationWorker = (): void => {
  if (_guestVerificationWorker) return;

  _guestVerificationWorker = new Worker<GuestVerificationJobData>(
    'guest-verification',
    processGuestVerificationJob,
    {
      connection: { url: env.REDIS_URL },
      concurrency: 3, // Multiple check-ins can be verified concurrently
      lockDuration: 150_000,
    }
  );

  _guestVerificationWorker.on('completed', (job) => {
    logger.info('[GuestVerificationWorker] Completed', { jobId: job?.id });
  });
  _guestVerificationWorker.on('failed', (job, err) => {
    logger.error('[GuestVerificationWorker] Failed', { jobId: job?.id, error: err?.message });
  });
  _guestVerificationWorker.on('stalled', (jobId) => {
    logger.warn('[GuestVerificationWorker] Stalled', { jobId });
  });
  _guestVerificationWorker.on('error', (err: unknown) => {
    logger.error('[GuestVerificationWorker] Worker connection error — guest verification disabled', {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  logger.info('[GuestVerificationWorker] Worker started');
};

export const stopGuestVerificationWorker = async (): Promise<void> => {
  if (_guestVerificationWorker) {
    await _guestVerificationWorker.close();
    _guestVerificationWorker = null;
    logger.info('[GuestVerificationWorker] Worker stopped');
  }
};
