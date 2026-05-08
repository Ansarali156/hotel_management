import { calculateMatchScore } from '../src/utils/matchScore';
import { hashAadhaar } from '../src/utils/encrypt';
import request from 'supertest';
import app from '../src/index';
import { generateAccessToken } from '../src/services/token.service';
import { prisma } from '../src/config/database';

jest.mock('../src/config/database', () => ({
  prisma: {
    criminalProfile: { findMany: jest.fn(), count: jest.fn() },
    guest: { findMany: jest.fn() },
    matchAlert: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn(), findMany: jest.fn() },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(),
  },
}));

// Mock Redis to prevent connection attempts in test env
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

// Mock BullMQ queue to prevent Redis connection in tests
jest.mock('../src/queues/verificationQueue', () => ({
  enqueueVerification: jest.fn().mockResolvedValue('test-job-id'),
  getVerificationQueue: jest.fn(),
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const siToken = generateAccessToken({
  sub: 'si-uuid',
  portalType: 'POLICE',
  rankLevel: 10,
  jurisdictionPath: 'state1/zone1/range1/district1/station1',
});

const constableToken = generateAccessToken({
  sub: 'constable-uuid',
  portalType: 'POLICE',
  rankLevel: 14,
  jurisdictionPath: 'state1/zone1/range1/district1/station1',
});

// ─── Unit tests for match scoring algorithm ───────────────────────────────────

describe('Match Scoring Algorithm', () => {
  it('returns 0.95 score when all fields match (no passport)', () => {
    const aadhaar = '123456789012';
    const hash = hashAadhaar(aadhaar);

    const result = calculateMatchScore({
      guest: {
        fullName: 'Rajesh Kumar',
        aadhaarHash: hash,
        phoneNumber: '9876543210',
        age: 35,
        guestType: 'DOMESTIC',
        passportNumber: null,
      },
      criminal: {
        fullName: 'Rajesh Kumar',
        aadhaarHash: hash,
        phones: ['9876543210'],
        approximateAge: 35,
        passportNumber: null,
      },
    });

    expect(result.score).toBe(0.95); // 0.55 + 0.20 + 0.15 + 0.05
    expect(result.breakdown.aadhaar).toBe(1.0);
    expect(result.breakdown.name).toBe(1.0);
    expect(result.breakdown.phone).toBe(1.0);
    expect(result.breakdown.age).toBe(1.0);
  });

  it('Aadhaar hash match alone is escalated to HIGH (≥ 0.95) by the forensic override', () => {
    // V3 change: a matching government-issued ID is canonical identity
    // re-use, so an Aadhaar hit alone must cross the HIGH-priority band.
    const hash = hashAadhaar('123456789012');

    const result = calculateMatchScore({
      guest: {
        fullName: 'Different Name',
        aadhaarHash: hash,
        phoneNumber: '1111111111',
        age: 99,
        guestType: 'DOMESTIC',
        passportNumber: null,
      },
      criminal: {
        fullName: 'Rajesh Kumar',
        aadhaarHash: hash,
        phones: ['9876543210'],
        approximateAge: 35,
        passportNumber: null,
      },
    });

    expect(result.breakdown.aadhaar).toBe(1.0);
    expect(result.breakdown.phone).toBe(0.0);
    expect(result.score).toBeGreaterThanOrEqual(0.95);
  });

  it('stays below the alert threshold when aadhaar hashes differ and nothing else matches', () => {
    // V3 no longer flattens the score to exactly 0.0 — fuzzy name / age may
    // contribute tiny fractions. The invariant is that such pairs stay
    // well below the 0.40 alert threshold.
    const result = calculateMatchScore({
      guest: {
        fullName: 'No Match',
        aadhaarHash: hashAadhaar('999999999999'),
        phoneNumber: '9000000000',
        age: 20,
        guestType: 'DOMESTIC',
        passportNumber: null,
      },
      criminal: {
        fullName: 'Rajesh Kumar',
        aadhaarHash: hashAadhaar('123456789012'),
        phones: ['9876543210'],
        approximateAge: 35,
        passportNumber: null,
      },
    });

    expect(result.breakdown.aadhaar).toBe(0.0);
    expect(result.score).toBeLessThan(0.40);
  });

  it('age within ±3 years counts as match', () => {
    const result = calculateMatchScore({
      guest: {
        fullName: 'X',
        aadhaarHash: null,
        phoneNumber: '9000000000',
        age: 33,
        guestType: 'DOMESTIC',
        passportNumber: null,
      },
      criminal: {
        fullName: 'X',
        aadhaarHash: null,
        phones: [],
        approximateAge: 35,
        passportNumber: null,
      },
    });

    expect(result.breakdown.age).toBe(1.0);
  });

  it('age beyond ±3 years does NOT count as match', () => {
    const result = calculateMatchScore({
      guest: {
        fullName: 'X',
        aadhaarHash: null,
        phoneNumber: '9000000000',
        age: 29,
        guestType: 'DOMESTIC',
        passportNumber: null,
      },
      criminal: {
        fullName: 'X',
        aadhaarHash: null,
        phones: [],
        approximateAge: 35,
        passportNumber: null,
      },
    });

    expect(result.breakdown.age).toBe(0.0);
  });

  it('name matching is case-insensitive and ignores special chars', () => {
    const result = calculateMatchScore({
      guest: {
        fullName: 'RAJESH KUMAR',
        aadhaarHash: null,
        phoneNumber: '9000000000',
        age: 30,
        guestType: 'DOMESTIC',
        passportNumber: null,
      },
      criminal: {
        fullName: 'rajesh kumar',
        aadhaarHash: null,
        phones: [],
        approximateAge: null,
        passportNumber: null,
      },
    });

    expect(result.breakdown.name).toBe(1.0);
  });
});

// ─── Integration tests for verification endpoints ─────────────────────────────

describe('Verification — RBAC', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POST /api/v1/verification/run → 403 for Constable (level 14)', async () => {
    const res = await request(app)
      .post('/api/v1/verification/run')
      .set('Authorization', `Bearer ${constableToken}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_RANK');
  });

  it('GET /api/v1/verification/alerts → 401 without token', async () => {
    const res = await request(app).get('/api/v1/verification/alerts');
    expect(res.status).toBe(401);
  });

  it('GET /api/v1/verification/alerts → 200 with valid SI token', async () => {
    (mockPrisma.$transaction as jest.Mock).mockResolvedValue([0, []]);

    const res = await request(app)
      .get('/api/v1/verification/alerts')
      .set('Authorization', `Bearer ${siToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('alerts');
  });

  it('PATCH /api/v1/verification/alerts/:id/review → 403 for Constable (needs level 10)', async () => {
    const res = await request(app)
      .patch('/api/v1/verification/alerts/some-id/review')
      .set('Authorization', `Bearer ${constableToken}`)
      .send({ status: 'CONFIRMED' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_RANK');
  });

  it('POST /api/v1/verification/run → 202 (Accepted / queued) for rank L12', async () => {
    const hcToken = generateAccessToken({
      sub: 'hc-uuid',
      portalType: 'POLICE',
      rankLevel: 12,
      jurisdictionPath: 'state1/zone1/range1/district1/station1',
    });

    const res = await request(app)
      .post('/api/v1/verification/run')
      .set('Authorization', `Bearer ${hcToken}`);

    expect(res.status).toBe(202);
    expect(res.body.data).toHaveProperty('jobId');
    expect(res.body.data.status).toBe('QUEUED');
  });
});

describe('Abstraction Wall — Police data never leaks to hotel routes', () => {
  it('Hotel token cannot access /api/v1/verification routes', async () => {
    const hotelToken = generateAccessToken({ sub: 'hotel-uuid', portalType: 'HOTEL' });

    const res = await request(app)
      .get('/api/v1/verification/alerts')
      .set('Authorization', `Bearer ${hotelToken}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('Hotel token cannot access /api/v1/criminals routes', async () => {
    const hotelToken = generateAccessToken({ sub: 'hotel-uuid', portalType: 'HOTEL' });

    const res = await request(app)
      .get('/api/v1/criminals')
      .set('Authorization', `Bearer ${hotelToken}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('Hotel token cannot access /api/v1/dashboard/stats', async () => {
    const hotelToken = generateAccessToken({ sub: 'hotel-uuid', portalType: 'HOTEL' });

    const res = await request(app)
      .get('/api/v1/dashboard/stats')
      .set('Authorization', `Bearer ${hotelToken}`);

    expect(res.status).toBe(403);
  });
});
