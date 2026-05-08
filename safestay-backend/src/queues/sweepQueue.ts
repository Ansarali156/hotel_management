/**
 * Sweep Verification Queue — V2 Phase 1
 *
 * Scheduled cron job running every 3 hours.
 * Job: ALL active criminals vs. ALL active guests (Many-to-Many), jurisdiction-scoped.
 *
 * Only ONE sweep runs at a time (concurrency: 1 in the worker).
 * Overlapping cron triggers are deduplicated by jobId: 'sweep-singleton'.
 */

import { Queue } from 'bullmq';
import { env } from '../config/env';

export interface SweepJobData {
  trigger: 'SWEEP';
  startedAt?: string; // ISO-8601 — set at job creation
}

const SWEEP_CRON = '0 0,3,6,9,12,15,18,21 * * *'; // Every 3 hours

let _sweepQueue: Queue<SweepJobData> | null = null;

export const getSweepQueue = (): Queue<SweepJobData> => {
  if (!_sweepQueue) {
    _sweepQueue = new Queue<SweepJobData>('sweep-verification', {
      connection: { url: env.REDIS_URL },
      defaultJobOptions: {
        attempts: 1, // No retry — next cron cycle catches it
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 50 },
      },
    });
    // Prevent unhandled 'error' event from crashing the process
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_sweepQueue as any).on('error', () => { /* Redis unavailable — sweep disabled */ });
  }
  return _sweepQueue;
};

/**
 * Register the repeatable sweep job on startup.
 * Call this once from index.ts after DB connection confirmed.
 * BullMQ deduplicates via jobId: 'sweep-singleton' so multiple server
 * restarts don't stack up cron entries.
 */
export const registerSweepCron = async (): Promise<void> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queue = getSweepQueue() as any;
  // BullMQ v5 repeatable jobs use upsertJobScheduler instead of queue.add with repeat option
  await queue.upsertJobScheduler(
    'sweep-singleton',
    { pattern: SWEEP_CRON },
    {
      name: 'network-sweep',
      data: { trigger: 'SWEEP', startedAt: new Date().toISOString() } as SweepJobData,
    }
  );
};
