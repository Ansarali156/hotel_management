import request from 'supertest';
import app from '../src/index';
import { prisma } from '../src/config/database';
import * as nodeRsArgon2 from '@node-rs/argon2';

// Mock prisma and argon2 to avoid needing a live DB for tests
jest.mock('../src/config/database', () => ({
  prisma: {
    hotel: { findUnique: jest.fn(), create: jest.fn() },
    policeUser: { findUnique: jest.fn() },
    hotelRefreshToken: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
    policeRefreshToken: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
  },
}));

// Mock Redis to prevent connection attempts in test environment
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

jest.mock('@node-rs/argon2', () => ({
  verify: jest.fn(),
  hash: jest.fn(),
  Algorithm: { Argon2id: 2 },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockArgon2 = nodeRsArgon2 as jest.Mocked<typeof nodeRsArgon2>;

describe('Auth — Hotel Login', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POST /api/v1/auth/hotel/login → 200 with tokens on valid credentials', async () => {
    (mockPrisma.hotel.findUnique as jest.Mock).mockResolvedValue({
      id: 'hotel-uuid',
      email: 'hotel@test.com',
      name: 'Test Hotel',
      passwordHash: '$argon2hash',
      isActive: true,
    });
    (mockArgon2.verify as jest.Mock).mockResolvedValue(true);
    (mockPrisma.hotelRefreshToken.create as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .post('/api/v1/auth/hotel/login')
      .send({ userId: 'hotel@test.com', password: 'TestPass1!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
    expect(res.body.data.hotel).toHaveProperty('id', 'hotel-uuid');
    // passwordHash must NEVER be in response
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('POST /api/v1/auth/hotel/login → 401 on wrong password', async () => {
    (mockPrisma.hotel.findUnique as jest.Mock).mockResolvedValue({
      id: 'hotel-uuid',
      email: 'hotel@test.com',
      name: 'Test Hotel',
      passwordHash: '$argon2hash',
      isActive: true,
    });
    (mockArgon2.verify as jest.Mock).mockResolvedValue(false);

    const res = await request(app)
      .post('/api/v1/auth/hotel/login')
      .send({ userId: 'hotel@test.com', password: 'WrongPass1!' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('POST /api/v1/auth/hotel/login → 401 on inactive hotel', async () => {
    (mockPrisma.hotel.findUnique as jest.Mock).mockResolvedValue({
      id: 'hotel-uuid',
      email: 'hotel@test.com',
      name: 'Test Hotel',
      passwordHash: '$argon2hash',
      isActive: false,
    });

    const res = await request(app)
      .post('/api/v1/auth/hotel/login')
      .send({ userId: 'hotel@test.com', password: 'TestPass1!' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('POST /api/v1/auth/hotel/login → 401 when hotel is soft-deleted', async () => {
    (mockPrisma.hotel.findUnique as jest.Mock).mockResolvedValue({
      id: 'hotel-uuid',
      email: 'hotel@test.com',
      name: 'Test Hotel',
      passwordHash: '$argon2hash',
      isActive: true,
      deletedAt: new Date(),
    });

    const res = await request(app)
      .post('/api/v1/auth/hotel/login')
      .send({ userId: 'hotel@test.com', password: 'TestPass1!' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('POST /api/v1/auth/hotel/login → 400 on missing fields', async () => {
    const res = await request(app)
      .post('/api/v1/auth/hotel/login')
      .send({ userId: 'hotel@test.com' }); // Missing password

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('Auth — Police Login', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POST /api/v1/auth/police/login → 200 with tokens and rank info', async () => {
    (mockPrisma.policeUser.findUnique as jest.Mock).mockResolvedValue({
      id: 'officer-uuid',
      badgeId: 'BADGE001',
      fullName: 'Inspector Test',
      passwordHash: '$argon2hash',
      isActive: true,
      jurisdictionPath: 'state1/zone1/range1/district1/station1',
      rank: { level: 9, title: 'Inspector of Police' },
    });
    (mockArgon2.verify as jest.Mock).mockResolvedValue(true);
    (mockPrisma.policeRefreshToken.create as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .post('/api/v1/auth/police/login')
      .send({ userId: 'BADGE001', password: 'TestPass1!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.officer).toHaveProperty('rankLevel', 9);
    expect(res.body.data.officer).toHaveProperty('badgeId', 'BADGE001');
    // jurisdictionPath must NOT leak in police login response
    expect(res.body.data.officer).not.toHaveProperty('jurisdictionPath');
  });

  it('POST /api/v1/auth/police/login → 401 when officer is soft-deleted', async () => {
    (mockPrisma.policeUser.findUnique as jest.Mock).mockResolvedValue({
      id: 'officer-uuid',
      badgeId: 'BADGE001',
      fullName: 'Inspector Test',
      passwordHash: '$argon2hash',
      isActive: true,
      deletedAt: new Date(),
      jurisdictionPath: 'state1/zone1/range1/district1/station1',
      rank: { level: 9, title: 'Inspector of Police' },
    });

    const res = await request(app)
      .post('/api/v1/auth/police/login')
      .send({ userId: 'BADGE001', password: 'TestPass1!' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('Auth — Logout', () => {
  it('POST /api/v1/auth/hotel/logout → 200 and revokes token', async () => {
    (mockPrisma.hotelRefreshToken.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const res = await request(app)
      .post('/api/v1/auth/hotel/logout')
      .send({ refreshToken: 'some-valid-token' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('Security Headers', () => {
  it('every response has required security headers', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
