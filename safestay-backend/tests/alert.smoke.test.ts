/**
 * Alert review smoke tests — verify that officers can confirm/dismiss
 * match alerts only with a valid police JWT, and that 401 is returned
 * without one. The Prisma layer is mocked.
 */

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/index';
import { policePrisma } from '../src/config/policeDatabase';
import { env } from '../src/config/env';

jest.mock('../src/config/policeDatabase', () => ({
  policePrisma: {
    matchAlert: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
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

const mockPolicePrisma = policePrisma as unknown as {
  matchAlert: { findFirst: jest.Mock; update: jest.Mock };
};

const signPoliceToken = () =>
  jwt.sign(
    {
      sub: 'officer-1',
      portalType: 'POLICE',
      badgeId: 'ADMIN001',
      rankLevel: 1,
      jurisdictionPath: 'state1/zone1/range1/district1/station1',
      stationId: 'station-1',
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' }
  );

const signHotelToken = () =>
  jwt.sign(
    {
      sub: 'hotel-1',
      portalType: 'HOTEL',
      hotelId: 'hotel-1',
      email: 'demo@hotel.com',
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' }
  );

describe('Alert review smoke', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects PATCH /alerts/:id/review without a token → 401', async () => {
    const res = await request(app)
      .patch('/api/v1/verification/alerts/alert-1/review')
      .send({ status: 'CONFIRMED', notes: 'ok' });

    expect(res.status).toBe(401);
    expect(['MISSING_TOKEN', 'INVALID_TOKEN']).toContain(res.body.code);
  });

  it('rejects PATCH /alerts/:id/review with a hotel token → 403', async () => {
    const res = await request(app)
      .patch('/api/v1/verification/alerts/alert-1/review')
      .set('Authorization', `Bearer ${signHotelToken()}`)
      .send({ status: 'CONFIRMED', notes: 'ok' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('accepts PATCH /alerts/:id/review with a police token → 200', async () => {
    mockPolicePrisma.matchAlert.findFirst.mockResolvedValue({
      id: 'alert-1',
      status: 'PENDING_REVIEW',
    });
    mockPolicePrisma.matchAlert.update.mockResolvedValue({
      id: 'alert-1',
      status: 'CONFIRMED',
      reviewNotes: 'Subject apprehended',
      updatedAt: new Date(),
    });

    const res = await request(app)
      .patch('/api/v1/verification/alerts/alert-1/review')
      .set('Authorization', `Bearer ${signPoliceToken()}`)
      .send({ status: 'CONFIRMED', notes: 'Subject apprehended' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('CONFIRMED');
    // Must record the authenticated officer, not a client-supplied id
    expect(mockPolicePrisma.matchAlert.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reviewedByPoliceId: 'officer-1' }),
      })
    );
  });

  it('returns 404 when the alert does not exist', async () => {
    mockPolicePrisma.matchAlert.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .patch('/api/v1/verification/alerts/missing/review')
      .set('Authorization', `Bearer ${signPoliceToken()}`)
      .send({ status: 'DISMISSED' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('rejects invalid status values → 400', async () => {
    const res = await request(app)
      .patch('/api/v1/verification/alerts/alert-1/review')
      .set('Authorization', `Bearer ${signPoliceToken()}`)
      .send({ status: 'MAYBE' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
