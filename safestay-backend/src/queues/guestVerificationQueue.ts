/**
 * Guest Verification Queue (BullMQ)
 *
 * Triggered when a new guest checks in.
 * Job: one guest vs. ALL active criminal profiles (WANTED / ABSCONDING / UNDER_INVESTIGATION).
 *
 * Runs in the background so check-in response is never delayed.
 * Emits VERIFICATION_PROGRESS Socket.IO events so police can see live progress.
 */

import { Queue } from 'bullmq';
import { env } from '../config/env';

export interface GuestVerificationJobData {
  guestId: string;
  guestName: string;
  hotelId: string;
  triggeredAt: string; // ISO-8601
}

let _guestVerificationQueue: Queue<GuestVerificationJobData> | null = null;

export const getGuestVerificationQueue = (): Queue<GuestVerificationJobData> => {
  if (!_guestVerificationQueue) {
    _guestVerificationQueue = new Queue<GuestVerificationJobData>('guest-verification', {
      connection: { url: env.REDIS_URL },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 100 },
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_guestVerificationQueue as any).on('error', () => { /* Redis unavailable — queue disabled */ });
  }
  return _guestVerificationQueue;
};

export const enqueueGuestVerification = async (data: GuestVerificationJobData): Promise<string> => {
  if (!env.REDIS_URL) {
    return 'skipped'; // Background matching disabled — Redis not configured
  }
  const queue = getGuestVerificationQueue();
  const job = await queue.add('run-guest-verification', data, {
    jobId: `guest-verify:${data.guestId}:${Date.now()}`,
  });
  return job.id ?? 'queued';
};
