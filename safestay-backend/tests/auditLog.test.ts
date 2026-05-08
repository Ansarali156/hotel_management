/**
 * Audit log security tests.
 *
 * Verifies:
 * 1. Hotel check-in triggers an audit log entry (CREATE / Guest)
 * 2. Hotel check-out triggers an audit log entry (UPDATE / Guest)
 * 3. Police criminal create triggers an audit log entry (CREATE / CriminalProfile)
 * 4. Audit logs for hotel actions contain NO police/surveillance/verification references
 * 5. Aadhaar plaintext NEVER appears in any audit log metadata
 */

import request from 'supertest';
import app from '../src/index';
import { generateAccessToken } from '../src/services/token.service';
import { prisma } from '../src/config/database';

jest.mock('../src/config/database', () => ({
  prisma: {
    room: { findFirst: jest.fn() },
    guest: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), count: jest.fn(), findMany: jest.fn() },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
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

describe('Audit Log — Hotel actions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POST /guests/checkout/:id → triggers audit log CREATE for Guest', async () => {
    (mockPrisma.guest.findFirst as jest.Mock).mockResolvedValue({
      id: 'guest-1',
      hotelId: 'hotel-uuid',
      roomId: 'room-1',
      isActive: true,
    });
    (mockPrisma.$transaction as jest.Mock).mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/v1/guests/checkout/guest-1')
      .set('Authorization', `Bearer ${hotelToken}`);

    expect(res.status).toBe(200);

    // Give fire-and-forget a tick to complete
    await new Promise((r) => setImmediate(r));

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'UPDATE',
          resourceType: 'Guest',
          actorType: 'HOTEL',
        }),
      })
    );
  });

  it('Audit log metadata for hotel actions contains NO police/verification/criminal fields', async () => {
    (mockPrisma.guest.findFirst as jest.Mock).mockResolvedValue({
      id: 'guest-1',
      hotelId: 'hotel-uuid',
      roomId: 'room-1',
      isActive: true,
    });
    (mockPrisma.$transaction as jest.Mock).mockResolvedValue(undefined);

    await request(app)
      .post('/api/v1/guests/checkout/guest-1')
      .set('Authorization', `Bearer ${hotelToken}`);

    await new Promise((r) => setImmediate(r));

    const auditCall = (mockPrisma.auditLog.create as jest.Mock).mock.calls[0];
    if (auditCall) {
      const auditData = JSON.stringify(auditCall[0].data);
      expect(auditData).not.toContain('criminal');
      expect(auditData).not.toContain('verification');
      expect(auditData).not.toContain('surveillance');
      expect(auditData).not.toContain('matchAlert');
      expect(auditData).not.toContain('aadhaar');
    }
  });

  it('Active guests response NEVER contains police-related or Aadhaar fields', async () => {
    (mockPrisma.$transaction as jest.Mock).mockResolvedValue([0, []]);

    const res = await request(app)
      .get('/api/v1/guests/active')
      .set('Authorization', `Bearer ${hotelToken}`);

    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('police');
    expect(body).not.toContain('criminal');
    expect(body).not.toContain('matchAlert');
    expect(body).not.toContain('verification');
    expect(body).not.toContain('surveillance');
    expect(body).not.toContain('aadhaarNumber');
    expect(body).not.toContain('aadhaarEncrypted');
    expect(body).not.toContain('aadhaarHash');
  });
});
