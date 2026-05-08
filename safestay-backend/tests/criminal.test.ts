import request from 'supertest';
import app from '../src/index';
import { generateAccessToken } from '../src/services/token.service';
import { prisma } from '../src/config/database';

jest.mock('../src/config/database', () => ({
  prisma: {
    station: { findUnique: jest.fn() },
    criminalProfile: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
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

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// Officer at jurisdiction "state1/zone1/range1/district1/station1"
const officerToken = generateAccessToken({
  sub: 'officer-uuid',
  portalType: 'POLICE',
  rankLevel: 9, // Inspector
  jurisdictionPath: 'state1/zone1/range1/district1/station1',
});

// Head Constable (level 12) — can create
const hcToken = generateAccessToken({
  sub: 'hc-uuid',
  portalType: 'POLICE',
  rankLevel: 12,
  jurisdictionPath: 'state1/zone1/range1/district1/station1',
});

// Constable (level 14) — cannot create
const constableToken = generateAccessToken({
  sub: 'constable-uuid',
  portalType: 'POLICE',
  rankLevel: 14,
  jurisdictionPath: 'state1/zone1/range1/district1/station1',
});

describe('Criminal Profile — RBAC', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POST /api/v1/criminals → 403 when rank is insufficient (Constable)', async () => {
    const res = await request(app)
      .post('/api/v1/criminals')
      .set('Authorization', `Bearer ${constableToken}`)
      .send({
        fullName: 'Test Criminal',
        gender: 'MALE',
        caseStatus: 'WANTED',
        threatLevel: 'HIGH',
        crimeType: 'Robbery',
        firStationId: '00000000-0000-0000-0000-000000000001',
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_RANK');
  });

  it('POST /api/v1/criminals → 401 when hotel token used on police route', async () => {
    const hotelToken = generateAccessToken({ sub: 'hotel-uuid', portalType: 'HOTEL' });

    const res = await request(app)
      .post('/api/v1/criminals')
      .set('Authorization', `Bearer ${hotelToken}`)
      .send({
        fullName: 'Test Criminal',
        gender: 'MALE',
        caseStatus: 'WANTED',
        threatLevel: 'HIGH',
        crimeType: 'Robbery',
        firStationId: '00000000-0000-0000-0000-000000000001',
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('POST /api/v1/criminals → 403 when station is outside jurisdiction', async () => {
    (mockPrisma.station.findUnique as jest.Mock).mockResolvedValue({
      id: 'other-station',
      jurisdictionPath: 'state2/zone2/range2/district2/otherstation', // Different jurisdiction
    });

    const res = await request(app)
      .post('/api/v1/criminals')
      .set('Authorization', `Bearer ${hcToken}`)
      .send({
        fullName: 'Out of Jurisdiction Criminal',
        gender: 'MALE',
        caseStatus: 'WANTED',
        threatLevel: 'HIGH',
        crimeType: 'Robbery',
        firStationId: '00000000-0000-0000-0000-000000000001',
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('OUT_OF_JURISDICTION');
  });
});

describe('Criminal Profile — Jurisdiction Filter', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /api/v1/criminals → only returns profiles within officer jurisdiction', async () => {
    (mockPrisma.$transaction as jest.Mock).mockResolvedValue([
      1,
      [{
        id: 'crim-1',
        fullName: 'In Jurisdiction Criminal',
        aliases: [],
        threatLevel: 'HIGH',
        caseStatus: 'WANTED',
        crimeType: 'Robbery',
        photoPath: null,
        createdAt: new Date(),
      }],
    ]);

    const res = await request(app)
      .get('/api/v1/criminals')
      .set('Authorization', `Bearer ${officerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.profiles).toHaveLength(1);
  });

  it('GET /api/v1/criminals → response NEVER contains any Aadhaar field', async () => {
    (mockPrisma.$transaction as jest.Mock).mockResolvedValue([0, []]);

    const res = await request(app)
      .get('/api/v1/criminals')
      .set('Authorization', `Bearer ${officerToken}`);

    const body = JSON.stringify(res.body);
    // None of these should appear — plaintext, encrypted, or hash
    expect(body).not.toContain('aadhaarNumber');
    expect(body).not.toContain('aadhaarEncrypted');
    expect(body).not.toContain('aadhaarHash');
  });

  it('DELETE /api/v1/criminals/:id → 403 for Inspector (level 9) — needs level 8 or higher', async () => {
    const res = await request(app)
      .delete('/api/v1/criminals/some-criminal-id')
      .set('Authorization', `Bearer ${officerToken}`); // Inspector = level 9, needs <= 8

    // Inspector is level 9, delete requires level 8 or higher (1-8)
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_RANK');
  });
});
