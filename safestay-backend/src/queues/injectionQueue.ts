/**
 * Injection Verification Queue — V2 Phase 1
 *
 * Triggered when a new criminal profile is saved (CREATE or threat-level UPDATE).
 * Job: one criminal vs. ALL active guests in the network/jurisdiction.
 *
 * Priority: CRITICAL/HIGH threat levels get priority 1 (highest); others get 3.
 */

import { Queue } from 'bullmq';
import { env } from '../config/env';

export interface InjectionJobData {
  criminalId: string;
  jurisdictionPath: string;
  triggeredByOfficerId: string;
  threatLevel: string; // ThreatLevel enum value
  triggeredAt: string; // ISO-8601
}

let _injectionQueue: Queue<InjectionJobData> | null = null;

export const getInjectionQueue = (): Queue<InjectionJobData> => {
  if (!_injectionQueue) {
    _injectionQueue = new Queue<InjectionJobData>('injection-verification', {
      connection: { url: env.REDIS_URL },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 100 },
      },
    });
    // Prevent unhandled 'error' event from crashing the process
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_injectionQueue as any).on('error', () => { /* Redis unavailable — queue disabled */ });
  }
  return _injectionQueue;
};

export const enqueueInjection = async (data: InjectionJobData): Promise<string> => {
  if (!env.REDIS_URL) {
    return 'skipped'; // Background matching disabled — Redis not configured
  }
  const queue = getInjectionQueue();
  const priority = ['CRITICAL', 'HIGH'].includes(data.threatLevel) ? 1 : 3;
  const job = await queue.add('run-injection', data, {
    jobId: `inject:${data.criminalId}:${Date.now()}`,
  });
  return job.id ?? 'queued';
};
