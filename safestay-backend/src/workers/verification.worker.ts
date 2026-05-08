/**
 * Verification background worker (BullMQ).
 *
 * PHASE 3 SAFETY FEATURES:
 * - Processes criminals in batches of BATCH_SIZE (500) to bound memory
 * - Enforces JOB_TIMEOUT_MS (60 s) — job is abandoned if exceeded
 * - BullMQ handles retries (max 3, exponential backoff) via queue config
 * - All monitoring logs: job start, batch progress, duration, failure
 *
 * STEALTH GUARANTEE:
 * - This worker runs in the same Node.js process but on the event loop's
 *   async task queue, never blocking hotel request handlers.
 * - Hotel API latency is completely unaffected.
 */

import { Worker, Job } from 'bullmq';
import { env } from '../config/env';
import { VerificationJobData } from '../queues/verificationQueue';
import { runVerificationBatch } from '../services/verification.service';
import { logger } from '../utils/logger';

const BATCH_SIZE = 500;
const JOB_TIMEOUT_MS = 60_000; // 60 seconds

let _worker: Worker<VerificationJobData> | null = null;

const processVerificationJob = async (job: Job<VerificationJobData>): Promise<void> => {
  const { jurisdictionPath, triggeredByOfficerId, triggeredAt } = job.data;
  const jobStart = Date.now();

  logger.info('[VerificationWorker] Job started', {
    jobId: job.id,
    jurisdiction: jurisdictionPath,
    triggeredBy: triggeredByOfficerId,
    triggeredAt,
    attempt: job.attemptsMade + 1,
  });

  // Enforce job timeout
  const timeoutHandle = setTimeout(() => {
    logger.error('[VerificationWorker] Job exceeded timeout — aborting', {
      jobId: job.id,
      timeoutMs: JOB_TIMEOUT_MS,
    });
    // Throwing inside a timeout won't surface to BullMQ nicely, so we rely on
    // BullMQ's own lockDuration + stalledInterval to handle stalled jobs.
  }, JOB_TIMEOUT_MS);

  try {
    const result = await Promise.race([
      runVerificationBatch({ jurisdictionPath, batchSize: BATCH_SIZE, jobId: job.id }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Job timeout after ${JOB_TIMEOUT_MS}ms`)),
          JOB_TIMEOUT_MS
        )
      ),
    ]);

    const durationMs = Date.now() - jobStart;

    logger.info('[VerificationWorker] Job completed', {
      jobId: job.id,
      jurisdiction: jurisdictionPath,
      totalPairsChecked: result.totalPairsChecked,
      alertsGenerated: result.alertsGenerated,
      batchesProcessed: result.batchesProcessed,
      durationMs,
    });
  } catch (err: unknown) {
    const durationMs = Date.now() - jobStart;
    const message = err instanceof Error ? err.message : String(err);
    logger.error('[VerificationWorker] Job failed', {
      jobId: job.id,
      jurisdiction: jurisdictionPath,
      attempt: job.attemptsMade + 1,
      error: message,
      durationMs,
    });
    throw err; // Re-throw so BullMQ marks it as failed and applies retry backoff
  } finally {
    clearTimeout(timeoutHandle);
  }
};

export const startVerificationWorker = (): void => {
  if (_worker) return; // Already started

  _worker = new Worker<VerificationJobData>(
    'verification',
    processVerificationJob,
    {
      connection: { url: env.REDIS_URL },
      concurrency: 1,       // One jurisdiction sweep at a time
      lockDuration: 90_000, // 90 s lock — must be > JOB_TIMEOUT_MS
    }
  );

  _worker.on('completed', (job: { id?: string }) => {
    logger.info('[VerificationWorker] BullMQ completed event', { jobId: job?.id });
  });

  _worker.on('failed', (job: { id?: string; attemptsMade?: number } | undefined, err: unknown) => {
    logger.error('[VerificationWorker] BullMQ failed event', {
      jobId: job?.id,
      error: err instanceof Error ? err.message : String(err),
      attemptsMade: job?.attemptsMade,
    });
  });

  _worker.on('stalled', (jobId: string) => {
    logger.warn('[VerificationWorker] Job stalled', { jobId });
  });

  // CRITICAL: Without this handler, a Redis connection error emits an unhandled
  // 'error' event which Node.js converts to an uncaught exception → process exit.
  _worker.on('error', (err: unknown) => {
    logger.error('[VerificationWorker] Worker connection error — continuing without background verification', {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  logger.info('[VerificationWorker] Worker started');
};

export const stopVerificationWorker = async (): Promise<void> => {
  if (_worker) {
    await _worker.close();
    _worker = null;
    logger.info('[VerificationWorker] Worker stopped');
  }
};
