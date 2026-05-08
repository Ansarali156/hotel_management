import request from 'supertest';
import app from '../src/index';
import { generateAccessToken } from '../src/services/token.service';
import { prisma } from '../src/config/database';
import path from 'path';
import fs from 'fs';

jest.mock('../src/config/database', () => ({
  prisma: {
    room: { findFirst: jest.fn(), update: jest.fn() },
    guest: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), count: jest.fn(), findMany: jest.fn() },
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

const hotelToken = generateAccessToken({ sub: 'hotel-uuid', portalType: 'HOTEL' });

describe('Guest Check-in', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POST /api/v1/guests/checkin → 400 when guestPhoto is missing', async () => {
    const res = await request(app)
      .post('/api/v1/guests/checkin')
      .set('Authorization', `Bearer ${hotelToken}`)
      .field('fullName', 'John Doe')
      .field('age', '30')
      .field('gender', 'MALE')
      .field('phoneNumber', '9876543210')
      .field('roomNumber', '101')
      .field('checkInDate', new Date().toISOString());
    // No guestPhoto attached

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PHOTO_REQUIRED');
  });

  it('POST /api/v1/guests/checkin → 401 without auth token', async () => {
    const res = await request(app)
      .post('/api/v1/guests/checkin')
      .send({ fullName: 'Test Guest' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('MISSING_TOKEN');
  });

  it('POST /api/v1/guests/checkin → 403 when police token used on hotel route', async () => {
    const policeToken = generateAccessToken({
      sub: 'officer-uuid',
      portalType: 'POLICE',
      rankLevel: 9,
      jurisdictionPath: 'state1/zone1',
    });

    const res = await request(app)
      .post('/api/v1/guests/checkin')
      .set('Authorization', `Bearer ${policeToken}`)
      .send({ fullName: 'Test Guest' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('GET /api/v1/guests/active → 200 returns paginated active guests', async () => {
    (mockPrisma.$transaction as jest.Mock).mockResolvedValue([
      2,
      [
        {
          id: 'g1', fullName: 'Alice Smith', age: 28, gender: 'FEMALE',
          phoneNumber: '9876543210', guestType: 'DOMESTIC',
          checkInDate: new Date(), expectedCheckout: null,
          room: { roomNumber: '101', floor: 1, category: 'Single' },
        },
        {
          id: 'g2', fullName: 'Bob Jones', age: 35, gender: 'MALE',
          phoneNumber: '9876543211', guestType: 'DOMESTIC',
          checkInDate: new Date(), expectedCheckout: null,
          room: { roomNumber: '102', floor: 1, category: 'Double' },
        },
      ],
    ]);

    const res = await request(app)
      .get('/api/v1/guests/active')
      .set('Authorization', `Bearer ${hotelToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.guests).toHaveLength(2);
    expect(res.body.data.pagination.total).toBe(2);
  });

  it('GET /api/v1/guests/active → response NEVER contains police-related fields', async () => {
    (mockPrisma.$transaction as jest.Mock).mockResolvedValue([0, []]);

    const res = await request(app)
      .get('/api/v1/guests/active')
      .set('Authorization', `Bearer ${hotelToken}`);

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('police');
    expect(body).not.toContain('criminal');
    expect(body).not.toContain('matchAlert');
    expect(body).not.toContain('verification');
    expect(body).not.toContain('surveillance');
  });
});

describe('Guest Check-out', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POST /api/v1/guests/checkout/:guestId → 404 for unknown guest', async () => {
    (mockPrisma.guest.findFirst as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/guests/checkout/unknown-id')
      .set('Authorization', `Bearer ${hotelToken}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('GUEST_NOT_FOUND');
  });
});
