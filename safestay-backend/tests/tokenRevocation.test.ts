/**
 * Token revocation tests.
 *
 * Verifies:
 * 1. An unblocked token is accepted
 * 2. A revoked JTI (Redis blocklist hit) is rejected with 401 TOKEN_REVOKED
 * 3. Redis failure is fail-open — token still accepted
 * 4. Logout fires the Redis blocklist set (fire-and-forget)
 */

import request from 'supertest';
import app from '../src/index';
import { generateAccessToken } from '../src/services/token.service';
import { prisma } from '../src/config/database';

jest.mock('../src/config/database', () => ({
  prisma: {
    hotel: { findUnique: jest.fn() },
    hotelRefreshToken: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
    policeRefreshToken: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
    guest: { count: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

// Define mock entirely inside the factory — avoids temporal dead zone (TDZ)
// that would occur if `const mockRedis = ...` were declared before jest.mock() runs.
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

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// Helper: get the mocked Redis client from the module registry
const getRedis = () => require('../src/config/redis').redisClient;

const hotelToken = generateAccessToken({ sub: 'hotel-uuid', portalType: 'HOTEL' });

describe('Token Revocation — blocklist enforcement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Ensure get mock defaults to "not blocked"
    getRedis().get.mockResolvedValue(null);
    getRedis().set.mockResolvedValue('OK');
  });

  it('accepts a token whose JTI is NOT in the Redis blocklist', async () => {
    getRedis().get.mockResolvedValue(null);
    (mockPrisma.$transaction as jest.Mock).mockResolvedValue([0, []]);

    const res = await request(app)
      .get('/api/v1/guests/active')
      .set('Authorization', `Bearer ${hotelToken}`);

    expect(res.status).toBe(200);
  });

  it('rejects a token whose JTI IS in the Redis blocklist', async () => {
    getRedis().get.mockResolvedValue('1'); // blocklist hit

    const res = await request(app)
      .get('/api/v1/guests/active')
      .set('Authorization', `Bearer ${hotelToken}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_REVOKED');
  });

  it('fails open when Redis get throws — token is still accepted', async () => {
    getRedis().get.mockRejectedValue(new Error('Redis ECONNREFUSED'));
    (mockPrisma.$transaction as jest.Mock).mockResolvedValue([0, []]);

    const res = await request(app)
      .get('/api/v1/guests/active')
      .set('Authorization', `Bearer ${hotelToken}`);

    // Fail-open: Redis error must not block valid tokens
    expect(res.status).toBe(200);
  });

  it('logout calls Redis set with token:blocklist: prefix (fire-and-forget)', async () => {
    (mockPrisma.hotelRefreshToken.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const res = await request(app)
      .post('/api/v1/auth/hotel/logout')
      .set('Authorization', `Bearer ${hotelToken}`)
      .send({ refreshToken: 'some-refresh-token' });

    expect(res.status).toBe(200);

    // Allow the fire-and-forget Promise to settle
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    expect(getRedis().set).toHaveBeenCalledWith(
      expect.stringContaining('token:blocklist:'),
      '1',
      expect.any(Object)
    );
  });
});
