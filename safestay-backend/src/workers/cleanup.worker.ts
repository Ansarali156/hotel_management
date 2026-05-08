/**
 * Guest + Refresh-Token Cleanup Worker
 *
 * Runs daily.
 *   1. Deletes inactive (checked-out) guest records older than 16 days along
 *      with their associated match alerts. Keeps storage costs under control.
 *   2. Deletes refresh-token rows that are either past their expiresAt OR
 *      were revokedAt more than 30 days ago. The table is unbounded-growth
 *      otherwise: every login rotation adds a row, and nothing else ever
 *      removes them.
 *
 * Active guests (still checked in) are never deleted regardless of age.
 * Refresh tokens that are still valid or recently revoked are kept so
 * reuse-detection and audit queries still see them.
 */

import fs from 'fs';
import path from 'path';
import { Worker, Job } from 'bullmq';
import { env } from '../config/env';
import { CleanupJobData } from '../queues/cleanupQueue';
import { hotelPrisma } from '../config/hotelDatabase';
import { policePrisma } from '../config/policeDatabase';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

const RETENTION_DAYS = 16;
/** Revoked-refresh-token rows are kept this many days for reuse-detection forensics. */
const REFRESH_TOKEN_REVOKED_RETENTION_DAYS = 30;

async function processCleanupJob(job: Job<CleanupJobData>): Promise<void> {
  const start = Date.now();
  logger.info('[CleanupWorker] Cleanup started', { jobId: job.id });

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);

  // Find guests that are inactive and checked in before the cutoff. Uses the
  // new (isActive, checkInDate) composite index so this is a plain index scan
  // instead of a seq-scan of the Guest table.
  const staleGuests = await hotelPrisma.guest.findMany({
    where: {
      isActive: false,
      checkInDate: { lt: cutoffDate },
    },
    select: { id: true },
  });

  if (staleGuests.length === 0) {
    logger.info('[CleanupWorker] No stale guests to clean up');
    // Still run the refresh-token purge — the two cleanups are independent.
    await purgeExpiredRefreshTokens();
    return;
  }

  const guestIds = staleGuests.map((g: { id: string }) => g.id);

  // Chunk the deletes so we never push a multi-thousand-element `IN (...)`
  // list at Postgres in one shot (which explodes the parse-plan cost and
  // hits the 65k parameter-binding limit on the node-postgres driver).
  const CHUNK = 500;
  let alertsDeleted = 0;
  let guestsDeleted = 0;
  for (let i = 0; i < guestIds.length; i += CHUNK) {
    const slice = guestIds.slice(i, i + CHUNK);
    const alerts = await policePrisma.matchAlert.deleteMany({
      where: { guestId: { in: slice } },
    });
    alertsDeleted += alerts.count;
    const guests = await hotelPrisma.guest.deleteMany({
      where: { id: { in: slice } },
    });
    guestsDeleted += guests.count;
  }

  // Audit log
  await policePrisma.auditLog.create({
    data: {
      actorId: 'SYSTEM',
      actorType: 'POLICE',
      action: 'DELETE',
      resourceType: 'Guest',
      metadata: {
        trigger: 'CLEANUP',
        retentionDays: RETENTION_DAYS,
        guestsDeleted,
        alertsDeleted,
        cutoffDate: cutoffDate.toISOString(),
        durationMs: Date.now() - start,
      },
    },
  });

  const refreshPurge = await purgeExpiredRefreshTokens();
  await purgeOrphanedTempFiles();

  logger.info('[CleanupWorker] Cleanup complete', {
    jobId: job.id,
    guestsDeleted,
    alertsDeleted,
    hotelRefreshTokensDeleted: refreshPurge.hotelTokensDeleted,
    policeRefreshTokensDeleted: refreshPurge.policeTokensDeleted,
    durationMs: Date.now() - start,
  });
}

/**
 * Delete refresh-token rows we no longer need:
 *   - expired: expiresAt < now
 *   - long-revoked: revokedAt < (now - 30 days)
 *
 * We keep recently-revoked rows because `consumeRefreshToken` relies on them
 * to distinguish "unknown token" from "replay of a revoked token" (the
 * reuse-detection trigger for family revocation). 30 days is well past any
 * practical replay window for a 7-day refresh token.
 */
async function purgeExpiredRefreshTokens(): Promise<{
  hotelTokensDeleted: number;
  policeTokensDeleted: number;
}> {
  const now = new Date();
  const revokedCutoff = new Date(
    now.getTime() - REFRESH_TOKEN_REVOKED_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );

  let hotelTokensDeleted = 0;
  let policeTokensDeleted = 0;
  try {
    if (prisma.hotelRefreshToken) {
      const result = await prisma.hotelRefreshToken.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            { revokedAt: { lt: revokedCutoff } },
          ],
        },
      });
      hotelTokensDeleted = result.count;
    }
    if (prisma.policeRefreshToken) {
      const result = await prisma.policeRefreshToken.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            { revokedAt: { lt: revokedCutoff } },
          ],
        },
      });
      policeTokensDeleted = result.count;
    }
  } catch (err) {
    // Non-fatal — the next daily run will retry. Don't let token cleanup
    // failure bubble up and abort the enclosing guest-cleanup job.
    logger.error('[CleanupWorker] Refresh-token purge failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (hotelTokensDeleted || policeTokensDeleted) {
    logger.info('[CleanupWorker] Refresh tokens purged', {
      hotelTokensDeleted,
      policeTokensDeleted,
      revokedCutoff: revokedCutoff.toISOString(),
    });
  }
  return { hotelTokensDeleted, policeTokensDeleted };
}

/** Delete temp upload files older than 1 hour to prevent PII accumulation on disk. */
async function purgeOrphanedTempFiles(): Promise<void> {
  const TEMP_DIRS = ['./uploads/ocr_tmp', './uploads/register_scan_tmp'];
  const ONE_HOUR_MS = 60 * 60 * 1000;
  const cutoff = Date.now() - ONE_HOUR_MS;
  let deleted = 0;
  for (const dir of TEMP_DIRS) {
    try {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        try {
          const stat = fs.statSync(filePath);
          if (stat.mtimeMs < cutoff) {
            fs.unlinkSync(filePath);
            deleted++;
          }
        } catch { /* file already gone */ }
      }
    } catch (err) {
      logger.warn('[CleanupWorker] Temp dir purge failed', {
        dir,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  if (deleted > 0) {
    logger.info('[CleanupWorker] Orphaned temp files purged', { deleted });
  }
}

let _cleanupWorker: Worker<CleanupJobData> | null = null;

export const startCleanupWorker = (): void => {
  if (_cleanupWorker) return;

  _cleanupWorker = new Worker<CleanupJobData>(
    'guest-cleanup',
    processCleanupJob,
    {
      connection: { url: env.REDIS_URL },
      concurrency: 1,
      lockDuration: 300_000, // 5 minutes
    }
  );

  _cleanupWorker.on('completed', (job) => {
    logger.info('[CleanupWorker] Completed', { jobId: job?.id });
  });
  _cleanupWorker.on('failed', (job, err) => {
    logger.error('[CleanupWorker] Failed', { jobId: job?.id, error: err?.message });
  });
  _cleanupWorker.on('error', (err: unknown) => {
    logger.error('[CleanupWorker] Worker connection error — cleanup disabled', {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  logger.info('[CleanupWorker] Worker started');
};

export const stopCleanupWorker = async (): Promise<void> => {
  if (_cleanupWorker) {
    await _cleanupWorker.close();
    _cleanupWorker = null;
    logger.info('[CleanupWorker] Worker stopped');
  }
};

// Test-only export so jest can exercise the refresh-token purge helper
// without spinning up a BullMQ worker. Kept behind an underscore prefix so
// it's clearly not part of the public API.
export const __test__purgeExpiredRefreshTokens = purgeExpiredRefreshTokens;
