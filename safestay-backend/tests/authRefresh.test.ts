/**
 * Refresh-token rotation + reuse-detection tests.
 *
 * Covers the hardened refresh flow:
 *   1. A valid refresh token mints a new access+refresh pair and revokes the
 *      presented refresh in the DB (atomically, via updateMany).
 *   2. The old refresh token, once presented, stops working (rotation).
 *   3. Presenting an already-revoked refresh token triggers family
 *      revocation — every still-active refresh row for that account is
 *      marked revokedAt = now.
 *   4. An expired / unknown refresh token is rejected without touching the
 *      family.
 *   5. An access token (wrong token type) must be rejected by the refresh
 *      endpoint even though it verifies against JWT_ACCESS_SECRET.
 *   6. Portal mismatch (hotel refresh token sent to /police/refresh, or
 *      vice versa) is rejected.
 *   7. The new access token carries a 15-minute expiry and the new refresh
 *      token carries a 7-day expiry.
 *
 * All prisma + redis is mocked — no network/DB calls.
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/index';
import { prisma } from '../src/config/database';
import {
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} from '../src/services/token.service';
import { env } from '../src/config/env';

jest.mock('../src/config/database', () => ({
  prisma: {
    hotel: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    policeUser: { findUnique: jest.fn() },
    hotelRefreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    policeRefreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
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
};

describe('POST /api/v1/auth/hotel/refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.hotelRefreshToken.create.mockResolvedValue({ id: 'row-1' });
    mockPrisma.hotel.findUnique.mockResolvedValue({
      id: 'hotel-1',
      email: 'hotel@test.com',
      isActive: true,
      deletedAt: null,
    });
  });

  it('rotates the refresh token atomically via updateMany', async () => {
    const refreshToken = generateRefreshToken({ sub: 'hotel-1', portalType: 'HOTEL' });
    mockPrisma.hotelRefreshToken.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .post('/api/v1/auth/hotel/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.refreshToken).not.toBe(refreshToken); // rotation

    // Revoke is a single atomic updateMany; no race-prone findUnique-then-update.
    expect(mockPrisma.hotelRefreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          token: hashRefreshToken(refreshToken),
          hotelId: 'hotel-1',
          revokedAt: null,
          expiresAt: { gt: expect.any(Date) },
        }),
        data: { revokedAt: expect.any(Date) },
      })
    );
    // Replacement refresh hash is persisted.
    expect(mockPrisma.hotelRefreshToken.create).toHaveBeenCalledTimes(1);
  });

  it('new access token expires in ~15 minutes, refresh token in ~7 days', async () => {
    const refreshToken = generateRefreshToken({ sub: 'hotel-1', portalType: 'HOTEL' });
    mockPrisma.hotelRefreshToken.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .post('/api/v1/auth/hotel/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    const access = jwt.verify(res.body.data.accessToken, env.JWT_ACCESS_SECRET) as jwt.JwtPayload;
    const refresh = jwt.verify(res.body.data.refreshToken, env.JWT_REFRESH_SECRET) as jwt.JwtPayload;

    const accessTtl = (access.exp! - access.iat!);
    const refreshTtl = (refresh.exp! - refresh.iat!);

    expect(accessTtl).toBe(15 * 60); // 900 seconds
    expect(refreshTtl).toBe(7 * 24 * 60 * 60); // 604800 seconds
  });

  it('rejects a refresh token already revoked AND burns the whole hotel family', async () => {
    const refreshToken = generateRefreshToken({ sub: 'hotel-1', portalType: 'HOTEL' });
    // First updateMany misses (already revoked).
    mockPrisma.hotelRefreshToken.updateMany.mockResolvedValue({ count: 0 });
    // Lookup shows the row exists but is revoked → reuse detection.
    mockPrisma.hotelRefreshToken.findUnique.mockResolvedValue({
      id: 'stolen-row',
      hotelId: 'hotel-1',
      token: hashRefreshToken(refreshToken),
      revokedAt: new Date(Date.now() - 60_000),
      expiresAt: new Date(Date.now() + 86400_000),
    });

    const res = await request(app)
      .post('/api/v1/auth/hotel/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
    // Family revocation fires: second updateMany wipes every active row.
    const calls = mockPrisma.hotelRefreshToken.updateMany.mock.calls;
    expect(calls.length).toBe(2);
    const familyRevoke = calls[1][0];
    expect(familyRevoke).toEqual({
      where: { hotelId: 'hotel-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('rejects an unknown refresh token WITHOUT family revocation', async () => {
    const refreshToken = generateRefreshToken({ sub: 'hotel-1', portalType: 'HOTEL' });
    mockPrisma.hotelRefreshToken.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.hotelRefreshToken.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/hotel/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
    // Only the initial consume attempt fired — no family revocation.
    expect(mockPrisma.hotelRefreshToken.updateMany).toHaveBeenCalledTimes(1);
  });

  it('rejects a hotel-portal refresh token sent to /police/refresh', async () => {
    const hotelRefresh = generateRefreshToken({ sub: 'hotel-1', portalType: 'HOTEL' });

    const res = await request(app)
      .post('/api/v1/auth/police/refresh')
      .send({ refreshToken: hotelRefresh });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('rejects an access token presented on /hotel/refresh (wrong token type)', async () => {
    const accessToken = generateAccessToken({ sub: 'hotel-1', portalType: 'HOTEL' });

    const res = await request(app)
      .post('/api/v1/auth/hotel/refresh')
      .send({ refreshToken: accessToken });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
    // We never even attempted to consume — verification failed up front.
    expect(mockPrisma.hotelRefreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an expired refresh token', async () => {
    // Sign a refresh token that's already past its expiry.
    const expired = jwt.sign(
      {
        sub: 'hotel-1',
        portalType: 'HOTEL',
        jti: 'expired-jti',
        tokenType: 'refresh',
      },
      env.JWT_REFRESH_SECRET,
      { expiresIn: '-1s' }
    );

    const res = await request(app)
      .post('/api/v1/auth/hotel/refresh')
      .send({ refreshToken: expired });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('REFRESH_TOKEN_EXPIRED');
  });

  it('rejects a malformed refresh token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/hotel/refresh')
      .send({ refreshToken: 'not-a-real-jwt' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('400s when refreshToken body field is missing', async () => {
    const res = await request(app).post('/api/v1/auth/hotel/refresh').send({});
    expect(res.status).toBe(400);
  });

  it('refuses to refresh when the hotel account has been deactivated', async () => {
    const refreshToken = generateRefreshToken({ sub: 'hotel-1', portalType: 'HOTEL' });
    mockPrisma.hotelRefreshToken.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.hotel.findUnique.mockResolvedValue({
      id: 'hotel-1',
      email: 'hotel@test.com',
      isActive: false,
      deletedAt: null,
    });

    const res = await request(app)
      .post('/api/v1/auth/hotel/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('refuses to refresh when the hotel row no longer exists (hard-deleted)', async () => {
    const refreshToken = generateRefreshToken({ sub: 'hotel-1', portalType: 'HOTEL' });
    mockPrisma.hotelRefreshToken.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.hotel.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/hotel/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
    // Must not mint or persist a replacement refresh after consume.
    expect(mockPrisma.hotelRefreshToken.create).not.toHaveBeenCalled();
  });

  it('refuses to refresh when the hotel is soft-deleted (deletedAt set)', async () => {
    const refreshToken = generateRefreshToken({ sub: 'hotel-1', portalType: 'HOTEL' });
    mockPrisma.hotelRefreshToken.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.hotel.findUnique.mockResolvedValue({
      id: 'hotel-1',
      email: 'hotel@test.com',
      isActive: true,
      deletedAt: new Date(),
    });

    const res = await request(app)
      .post('/api/v1/auth/hotel/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
    expect(mockPrisma.hotelRefreshToken.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/auth/police/refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.policeRefreshToken.create.mockResolvedValue({ id: 'row-1' });
    mockPrisma.policeUser.findUnique.mockResolvedValue({
      id: 'officer-1',
      badgeId: 'BADGE001',
      isActive: true,
      deletedAt: null,
      stationId: 'station-1',
      jurisdictionPath: 'state1/zone1/range1/district1/station1',
      rank: { level: 8, title: 'DSP' },
    });
  });

  it('rotates the police refresh token and reflects the current rank', async () => {
    const refreshToken = generateRefreshToken({ sub: 'officer-1', portalType: 'POLICE' });
    mockPrisma.policeRefreshToken.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .post('/api/v1/auth/police/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    const decoded = jwt.verify(res.body.data.accessToken, env.JWT_ACCESS_SECRET) as jwt.JwtPayload;
    expect(decoded.portalType).toBe('POLICE');
    expect(decoded.rankLevel).toBe(8); // picked up from re-fetched officer row
    expect(decoded.stationId).toBe('station-1');
  });

  it('family-revokes when a revoked police refresh is replayed', async () => {
    const refreshToken = generateRefreshToken({ sub: 'officer-1', portalType: 'POLICE' });
    mockPrisma.policeRefreshToken.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.policeRefreshToken.findUnique.mockResolvedValue({
      id: 'stolen-row',
      policeUserId: 'officer-1',
      token: hashRefreshToken(refreshToken),
      revokedAt: new Date(Date.now() - 1_000),
      expiresAt: new Date(Date.now() + 86400_000),
    });

    const res = await request(app)
      .post('/api/v1/auth/police/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(401);
    const calls = mockPrisma.policeRefreshToken.updateMany.mock.calls;
    expect(calls.length).toBe(2);
    expect(calls[1][0]).toEqual({
      where: { policeUserId: 'officer-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('rejects a police refresh if the officer account has been deactivated', async () => {
    const refreshToken = generateRefreshToken({ sub: 'officer-1', portalType: 'POLICE' });
    mockPrisma.policeRefreshToken.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.policeUser.findUnique.mockResolvedValue({
      id: 'officer-1',
      badgeId: 'BADGE001',
      isActive: false,
      deletedAt: null,
      rank: { level: 8, title: 'DSP' },
    });

    const res = await request(app)
      .post('/api/v1/auth/police/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('rejects a police refresh if the officer is soft-deleted (deletedAt set)', async () => {
    const refreshToken = generateRefreshToken({ sub: 'officer-1', portalType: 'POLICE' });
    mockPrisma.policeRefreshToken.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.policeUser.findUnique.mockResolvedValue({
      id: 'officer-1',
      badgeId: 'BADGE001',
      isActive: true,
      deletedAt: new Date(),
      rank: { level: 8, title: 'DSP' },
    });

    const res = await request(app)
      .post('/api/v1/auth/police/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
    expect(mockPrisma.policeRefreshToken.create).not.toHaveBeenCalled();
  });
});
