/**
 * Auth audit-log tests.
 *
 * Verifies:
 *   1. Successful hotel login writes a LOGIN/LOGIN_SUCCESS row with the IP
 *      and user-agent plumbed through.
 *   2. Failed hotel login (unknown account) writes a LOGIN/LOGIN_FAILURE
 *      with the reason + attempted email captured.
 *   3. Failed hotel login (bad password) writes a LOGIN/LOGIN_FAILURE tagged
 *      BAD_PASSWORD, scoped to the real account ID (so rate-limit-style
 *      queries can group on actor).
 *   4. Successful refresh writes a LOGIN/REFRESH_SUCCESS row.
 *   5. Failed refresh writes LOGIN/REFRESH_FAILURE with error reason.
 *   6. Logout writes a LOGOUT/LOGOUT row. Actor ID is resolved from the
 *      bearer access token when present.
 *   7. Bearer-only logout revokes all DB refresh rows for that principal and
 *      records counts in audit metadata.
 *   8. Audit-log failures NEVER break the auth request — a throwing
 *      auditLog.create still returns 200 from login.
 *
 * All prisma + redis mocked — no DB calls.
 */

import request from 'supertest';
import app from '../src/index';
import { prisma } from '../src/config/database';
import {
  generateAccessToken,
  generateRefreshToken,
} from '../src/services/token.service';

jest.mock('../src/config/database', () => ({
  prisma: {
    hotel: { findUnique: jest.fn(), findFirst: jest.fn() },
    policeUser: { findUnique: jest.fn() },
    hotelRefreshToken: {
      create: jest.fn().mockResolvedValue({ id: 'row-1' }),
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    policeRefreshToken: {
      create: jest.fn().mockResolvedValue({ id: 'row-2' }),
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    $transaction: jest.fn(),
  },
}));

jest.mock('../src/config/redis', () => ({
  redisClient: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    incr: jest.fn().mockResolvedValue(1),
    pExpire: jest.fn().mockResolvedValue(1),
    pTTL: jest.fn().mockResolvedValue(900000),
    decr: jest.fn().mockResolvedValue(0),
    del: jest.fn().mockResolvedValue(1),
    isOpen: true,
    connect: jest.fn().mockResolvedValue(undefined),
  },
  connectRedis: jest.fn().mockResolvedValue(undefined),
}));

// We avoid argon2Verify network/binary traffic by mocking it per-case. The
// auth module imports `verify` from @node-rs/argon2 as `argon2Verify`; the
// path under which we mock must match the bare specifier used in source.
const mockArgon2Verify = jest.fn<Promise<boolean>, [string, string]>();
jest.mock('@node-rs/argon2', () => ({
  verify: (hash: string, password: string) => mockArgon2Verify(hash, password),
}));

const mockPrisma = prisma as unknown as {
  hotel: { findUnique: jest.Mock };
  policeUser: { findUnique: jest.Mock };
  hotelRefreshToken: {
    create: jest.Mock;
    findUnique: jest.Mock;
    updateMany: jest.Mock;
  };
  policeRefreshToken: {
    create: jest.Mock;
    findUnique: jest.Mock;
    updateMany: jest.Mock;
  };
  auditLog: { create: jest.Mock };
};

describe('Auth audit logging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockArgon2Verify.mockReset();
  });

  it('writes LOGIN_SUCCESS with IP + user-agent on hotel login', async () => {
    mockPrisma.hotel.findUnique.mockResolvedValue({
      id: 'hotel-1',
      email: 'h@test.com',
      name: 'Test Hotel',
      isActive: true,
      passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$c29tZXZhbHVl',
    });
    mockArgon2Verify.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/v1/auth/hotel/login')
      .set('User-Agent', 'Mozilla/5.0 (test)')
      .set('X-Forwarded-For', '203.0.113.7')
      .send({ userId: 'h@test.com', password: 'secret' });

    expect(res.status).toBe(200);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'hotel-1',
          actorType: 'HOTEL',
          action: 'LOGIN',
          resourceType: 'Auth',
          metadata: expect.objectContaining({ event: 'LOGIN_SUCCESS' }),
          ipAddress: '203.0.113.7',
          userAgent: 'Mozilla/5.0 (test)',
        }),
      })
    );
  });

  it('writes LOGIN_FAILURE with reason=UNKNOWN_OR_INACTIVE_ACCOUNT for a missing hotel', async () => {
    mockPrisma.hotel.findUnique.mockResolvedValue(null);
    // Simulate the fallback findFirst also returning null.
    (mockPrisma.hotel as unknown as { findFirst?: jest.Mock }).findFirst = jest
      .fn()
      .mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/hotel/login')
      .send({ userId: 'ghost@test.com', password: 'whatever' });

    expect(res.status).toBe(401);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'UNKNOWN',
          actorType: 'HOTEL',
          action: 'LOGIN',
          metadata: expect.objectContaining({
            event: 'LOGIN_FAILURE',
            reason: 'UNKNOWN_OR_INACTIVE_ACCOUNT',
            email: 'ghost@test.com',
          }),
        }),
      })
    );
  });

  it('writes LOGIN_FAILURE with reason=BAD_PASSWORD scoped to the real hotel id', async () => {
    mockPrisma.hotel.findUnique.mockResolvedValue({
      id: 'hotel-1',
      email: 'h@test.com',
      name: 'Test Hotel',
      isActive: true,
      passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$c29tZXZhbHVl',
    });
    mockArgon2Verify.mockResolvedValue(false);

    const res = await request(app)
      .post('/api/v1/auth/hotel/login')
      .send({ userId: 'h@test.com', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'hotel-1',
          metadata: expect.objectContaining({
            event: 'LOGIN_FAILURE',
            reason: 'BAD_PASSWORD',
          }),
        }),
      })
    );
  });

  it('writes REFRESH_SUCCESS on successful hotel refresh', async () => {
    const refreshToken = generateRefreshToken({ sub: 'hotel-1', portalType: 'HOTEL' });
    mockPrisma.hotelRefreshToken.updateMany.mockResolvedValueOnce({ count: 1 });
    mockPrisma.hotel.findUnique.mockResolvedValue({
      id: 'hotel-1',
      email: 'h@test.com',
      isActive: true,
      deletedAt: null,
    });

    const res = await request(app)
      .post('/api/v1/auth/hotel/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'hotel-1',
          actorType: 'HOTEL',
          metadata: expect.objectContaining({ event: 'REFRESH_SUCCESS' }),
        }),
      })
    );
  });

  it('writes LOGOUT with actor resolved from the bearer access token', async () => {
    const accessToken = generateAccessToken({
      sub: 'hotel-1',
      portalType: 'HOTEL',
      hotelId: 'hotel-1',
    });

    const res = await request(app)
      .post('/api/v1/auth/hotel/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken: 'some-token' });

    expect(res.status).toBe(200);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'hotel-1',
          actorType: 'HOTEL',
          action: 'LOGOUT',
          metadata: expect.objectContaining({
            event: 'LOGOUT',
            refreshTokenRevoked: true,
            refreshTokensRevokedCount: 1,
          }),
        }),
      })
    );
  });

  it('writes REFRESH_FAILURE when the refresh token cannot be verified', async () => {
    const res = await request(app)
      .post('/api/v1/auth/hotel/refresh')
      .send({ refreshToken: 'not-a-real-jwt' });

    expect(res.status).toBe(401);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'UNKNOWN',
          actorType: 'HOTEL',
          action: 'LOGIN',
          metadata: expect.objectContaining({
            event: 'REFRESH_FAILURE',
            reason: 'INVALID_REFRESH_TOKEN',
          }),
        }),
      })
    );
  });

  it('writes REFRESH_FAILURE with VALIDATION_ERROR when refresh body is empty', async () => {
    const res = await request(app).post('/api/v1/auth/hotel/refresh').send({});

    expect(res.status).toBe(400);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            event: 'REFRESH_FAILURE',
            reason: 'VALIDATION_ERROR',
          }),
        }),
      })
    );
  });

  it('bearer-only LOGOUT revokes every active hotel refresh row for that sub', async () => {
    const accessToken = generateAccessToken({
      sub: 'hotel-1',
      portalType: 'HOTEL',
      hotelId: 'hotel-1',
    });
    mockPrisma.hotelRefreshToken.updateMany.mockResolvedValueOnce({ count: 2 });

    const res = await request(app)
      .post('/api/v1/auth/hotel/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(mockPrisma.hotelRefreshToken.updateMany).toHaveBeenCalledWith({
      where: { hotelId: 'hotel-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'hotel-1',
          metadata: expect.objectContaining({
            event: 'LOGOUT',
            refreshTokenRevoked: true,
            refreshTokensRevokedCount: 2,
          }),
        }),
      })
    );
  });

  it('a failing audit write does NOT break the login response', async () => {
    mockPrisma.hotel.findUnique.mockResolvedValue({
      id: 'hotel-1',
      email: 'h@test.com',
      name: 'Test Hotel',
      isActive: true,
      passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$c29tZXZhbHVl',
    });
    mockArgon2Verify.mockResolvedValue(true);
    // Audit telemetry failure must not deny service.
    mockPrisma.auditLog.create.mockRejectedValueOnce(new Error('audit sink down'));

    const res = await request(app)
      .post('/api/v1/auth/hotel/login')
      .send({ userId: 'h@test.com', password: 'secret' });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
  });
});
