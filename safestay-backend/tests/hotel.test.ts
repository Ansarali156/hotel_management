import request from 'supertest';
import app from '../src/index';
import { prisma } from '../src/config/database';

jest.mock('../src/config/database', () => ({
  prisma: {
    hotel: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    room: { createMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

// The app uses @node-rs/argon2, not the 'argon2' package. Mock the real import.
jest.mock('@node-rs/argon2', () => ({
  hash: jest.fn().mockResolvedValue('$argon2id$v=19$m=65536,t=3,p=4$test$test'),
  verify: jest.fn().mockResolvedValue(true),
  Algorithm: { Argon2id: 2 },
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

describe('Hotel Registration', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POST /api/v1/hotels/register → 201 on valid input with auto-generated rooms', async () => {
    (mockPrisma.hotel.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: Function) => {
      const txMock = {
        hotel: { create: jest.fn().mockResolvedValue({ id: 'new-hotel-id' }) },
        room: { createMany: jest.fn().mockResolvedValue({ count: 6 }) },
      };
      return fn(txMock);
    });

    const res = await request(app)
      .post('/api/v1/hotels/register')
      .send({
        hotelName: 'Grand Palace Hotel',
        email: 'grand@hotel.com',
        password: 'SecurePass1!',
        totalFloors: 2,
        roomsPerFloor: 3,
        roomCategories: ['Single', 'Double', 'Suite'],
        contactNumber: '9876543210',
        address: '123 Main St',
        licenseNumber: 'LIC001',
        maxGuestsPerRoom: 2,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('hotelId');
  });

  it('POST /api/v1/hotels/register → 409 when email already exists', async () => {
    (mockPrisma.hotel.findUnique as jest.Mock).mockResolvedValue({ id: 'existing-hotel' });

    const res = await request(app)
      .post('/api/v1/hotels/register')
      .send({
        hotelName: 'Duplicate Hotel',
        email: 'existing@hotel.com',
        password: 'SecurePass1!',
        totalFloors: 1,
        roomsPerFloor: 1,
        roomCategories: ['Single'],
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('HOTEL_EXISTS');
  });

  it('POST /api/v1/hotels/register → 400 on weak password', async () => {
    const res = await request(app)
      .post('/api/v1/hotels/register')
      .send({
        hotelName: 'Test Hotel',
        email: 'test@hotel.com',
        password: 'weakpass', // No uppercase, digit, or special char
        totalFloors: 1,
        roomsPerFloor: 1,
        roomCategories: ['Single'],
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/v1/hotels/register → NEVER returns passwordHash', async () => {
    (mockPrisma.hotel.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: Function) => {
      const txMock = {
        hotel: { create: jest.fn().mockResolvedValue({ id: 'hotel-uuid' }) },
        room: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      };
      return fn(txMock);
    });

    const res = await request(app)
      .post('/api/v1/hotels/register')
      .send({
        hotelName: 'Safe Hotel',
        email: 'safe@hotel.com',
        password: 'SecurePass1!',
        totalFloors: 1,
        roomsPerFloor: 1,
        roomCategories: ['Single'],
      });

    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    // nearestStation and jurisdictionPath must never appear in hotel responses
    expect(JSON.stringify(res.body)).not.toContain('nearestStation');
    expect(JSON.stringify(res.body)).not.toContain('police');
    expect(JSON.stringify(res.body)).not.toContain('surveillance');
  });
});
