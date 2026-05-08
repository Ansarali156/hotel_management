/**
 * Guest Data Cleanup Queue
 *
 * Scheduled cron job running once daily at 02:00 UTC.
 * Deletes inactive (checked-out) guest records older than 30 days
 * to control storage costs.
 */

import { Queue } from 'bullmq';
import { env } from '../config/env';

export interface CleanupJobData {
  trigger: 'CLEANUP';
  startedAt?: string;
}

const CLEANUP_CRON = '0 2 * * *'; // Daily at 02:00 UTC

let _cleanupQueue: Queue<CleanupJobData> | null = null;

export const getCleanupQueue = (): Queue<CleanupJobData> => {
  if (!_cleanupQueue) {
    _cleanupQueue = new Queue<CleanupJobData>('guest-cleanup', {
      connection: { url: env.REDIS_URL },
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 30 },
        removeOnFail: { count: 30 },
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_cleanupQueue as any).on('error', () => { /* Redis unavailable — cleanup disabled */ });
  }
  return _cleanupQueue;
};

/**
 * Register the repeatable cleanup job on startup.
 */
export const registerCleanupCron = async (): Promise<void> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queue = getCleanupQueue() as any;
  await queue.upsertJobScheduler(
    'cleanup-singleton',
    { pattern: CLEANUP_CRON },
    {
      name: 'guest-cleanup',
      data: { trigger: 'CLEANUP', startedAt: new Date().toISOString() } as CleanupJobData,
    }
  );
};
