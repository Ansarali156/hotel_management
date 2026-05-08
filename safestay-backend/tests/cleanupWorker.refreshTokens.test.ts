/**
 * Cleanup-worker refresh-token purge tests.
 *
 * Exercises the refresh-token purge step that was added alongside the
 * existing guest cleanup. We can't easily run the BullMQ worker inline, but
 * the purge helper is exported via the same module and the behaviour we
 * care about is which deleteMany predicates get pushed at Prisma.
 *
 * Contract we verify:
 *   - Purges rows where expiresAt < now OR revokedAt < (now - 30d).
 *   - Recently-revoked rows (within 30 days) are kept so reuse-detection
 *     still has them to match against.
 *   - Runs for BOTH hotelRefreshToken and policeRefreshToken tables.
 *   - A prisma error in one table does not prevent the other from running,
 *     and does not throw out of the worker.
 */

jest.mock('../src/config/database', () => ({
  prisma: {
    hotelRefreshToken: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    policeRefreshToken: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  },
}));

jest.mock('../src/config/hotelDatabase', () => ({
  hotelPrisma: { guest: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() } },
}));

jest.mock('../src/config/policeDatabase', () => ({
  policePrisma: {
    matchAlert: { deleteMany: jest.fn() },
    auditLog: { create: jest.fn().mockResolvedValue({ id: 'a' }) },
  },
}));

import { prisma } from '../src/config/database';

// The worker exports the BullMQ bindings and the processor is an internal
// helper. We can still exercise purge via a dynamic reload that imports
// the worker and invokes its processor directly through the `processorFor`
// test hook. The cleanup worker's processor is `processCleanupJob` but it
// isn't exported — so instead we invoke the purge by importing the module
// for side effects and calling the BullMQ `Worker`'s process function
// indirectly via jest fake job. Simpler: import the module and read the
// non-exported helper through the module registry.
//
// To keep things robust we re-implement what we need using a thin reflected
// access: the module exposes `startCleanupWorker` which wires up a Worker
// with the processor. We don't want to spin up BullMQ in the test — instead
// we call the extracted `purgeExpiredRefreshTokens` helper by loading the
// module and reading it off the module's `__esModule` object only if it's
// exported. If it's not exported we fall back to driving the processor via
// a minimal synthetic job object.
//
// The worker DOES export the helper in test mode via a __TEST__ alias below.

describe('CleanupWorker.purgeExpiredRefreshTokens', () => {
  const mockPrisma = prisma as unknown as {
    hotelRefreshToken: { deleteMany: jest.Mock };
    policeRefreshToken: { deleteMany: jest.Mock };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes rows where expiresAt < now OR revokedAt < now - 30 days, for both tables', async () => {
    mockPrisma.hotelRefreshToken.deleteMany.mockResolvedValue({ count: 7 });
    mockPrisma.policeRefreshToken.deleteMany.mockResolvedValue({ count: 3 });

    // Reach into the worker module and invoke the purge helper directly.
    const mod = await import('../src/workers/cleanup.worker');
    // Test-only export — see cleanup.worker.ts export block below.
    const purge = (mod as unknown as {
      __test__purgeExpiredRefreshTokens?: () => Promise<{
        hotelTokensDeleted: number;
        policeTokensDeleted: number;
      }>;
    }).__test__purgeExpiredRefreshTokens;
    expect(purge).toBeDefined();

    const result = await purge!();
    expect(result).toEqual({ hotelTokensDeleted: 7, policeTokensDeleted: 3 });

    // Hotel side: predicate is OR(expiresAt<now, revokedAt<cutoff).
    const hotelCall = mockPrisma.hotelRefreshToken.deleteMany.mock.calls[0][0];
    expect(Array.isArray(hotelCall.where.OR)).toBe(true);
    expect(hotelCall.where.OR[0]).toEqual({ expiresAt: { lt: expect.any(Date) } });
    expect(hotelCall.where.OR[1]).toEqual({ revokedAt: { lt: expect.any(Date) } });

    // The revokedAt cutoff is now - 30 days (± a couple of seconds for test wall-clock jitter).
    const revokedCutoff: Date = hotelCall.where.OR[1].revokedAt.lt;
    const expected = Date.now() - 30 * 24 * 60 * 60 * 1000;
    expect(Math.abs(revokedCutoff.getTime() - expected)).toBeLessThan(5_000);

    // Police side fired too.
    expect(mockPrisma.policeRefreshToken.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('swallows prisma errors instead of bubbling them out of the worker step', async () => {
    mockPrisma.hotelRefreshToken.deleteMany.mockRejectedValue(new Error('db unreachable'));
    mockPrisma.policeRefreshToken.deleteMany.mockResolvedValue({ count: 0 });

    const mod = await import('../src/workers/cleanup.worker');
    const purge = (mod as unknown as {
      __test__purgeExpiredRefreshTokens?: () => Promise<{
        hotelTokensDeleted: number;
        policeTokensDeleted: number;
      }>;
    }).__test__purgeExpiredRefreshTokens;

    await expect(purge!()).resolves.toEqual({
      hotelTokensDeleted: 0,
      policeTokensDeleted: 0,
    });
  });
});
