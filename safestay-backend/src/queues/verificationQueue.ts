/**
 * Verification job queue (BullMQ).
 *
 * STEALTH REQUIREMENT: All cross-reference matching is processed here,
 * completely decoupled from hotel request paths.  Hotels experience zero
 * latency from verification activity — there is no shared execution path.
 */

import { Queue } from 'bullmq';
import { env } from '../config/env';

export interface VerificationJobData {
  jurisdictionPath: string;
  triggeredByOfficerId: string;
  triggeredAt: string; // ISO-8601
}

// Lazy-initialized so the queue is only created when the server starts,
// not at import time (prevents crashing tests that lack a Redis connection).
let _queue: Queue<VerificationJobData> | null = null;

export const getVerificationQueue = (): Queue<VerificationJobData> => {
  if (!_queue) {
    _queue = new Queue<VerificationJobData>('verification', {
      connection: { url: env.REDIS_URL },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    });
    // Prevent unhandled 'error' event from crashing the process
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_queue as any).on('error', () => { /* Redis unavailable — queue disabled */ });
  }
  return _queue;
};

export const enqueueVerification = async (data: VerificationJobData): Promise<string> => {
  if (!env.REDIS_URL) {
    throw new Error('Background verification unavailable — Redis not configured');
  }
  const queue = getVerificationQueue();
  const job = await queue.add('run', data, {
    jobId: `verify:${data.jurisdictionPath}:${Date.now()}`,
  });
  return job.id ?? 'queued';
};
