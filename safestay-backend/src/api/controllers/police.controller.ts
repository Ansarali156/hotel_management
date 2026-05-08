import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { hash as argon2Hash, Algorithm } from '@node-rs/argon2';
import { prisma } from '../../config/database';
import { sendCreated, sendSuccess } from '../../utils/response';
import { AppError } from '../middleware/errorHandler';

const createOfficerSchema = z.object({
  badgeId: z.string().min(3).max(50),
  password: z.string().min(8).regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/,
    'Password must contain uppercase, lowercase, digit, and special character'
  ),
  fullName: z.string().min(2).max(200),
  email: z.string().email().optional(),
  rankId: z.string().uuid(),
  stationId: z.string().uuid(),
});

export const createPoliceUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createOfficerSchema.parse(req.body);

    const station = await prisma.station.findUnique({ where: { id: data.stationId } });
    if (!station) throw new AppError(404, 'STATION_NOT_FOUND', 'Station not found');

    const rank = await prisma.policeRank.findUnique({ where: { id: data.rankId } });
    if (!rank) throw new AppError(404, 'RANK_NOT_FOUND', 'Rank not found');

    const existing = await prisma.policeUser.findUnique({ where: { badgeId: data.badgeId } });
    if (existing) throw new AppError(409, 'CONFLICT', 'Badge ID already registered');

    const passwordHash = await argon2Hash(data.password, { algorithm: Algorithm.Argon2id });

    const officer = await prisma.policeUser.create({
      data: {
        badgeId: data.badgeId,
        passwordHash,
        fullName: data.fullName,
        email: data.email,
        rankId: data.rankId,
        stationId: data.stationId,
        jurisdictionPath: station.jurisdictionPath,
      },
      select: {
        id: true, badgeId: true, fullName: true, email: true,
        rank: { select: { level: true, title: true } },
        station: { select: { name: true } },
        createdAt: true,
      },
    });

    return sendCreated(res, { officerId: officer.id, officer }, 'Police officer created');
  } catch (err) {
    next(err);
  }
};

export const listPoliceUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = '1', limit = '20', search } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const pageSize = Math.min(100, parseInt(limit));

    const where: {
      isActive: boolean;
      OR?: Array<{ fullName?: { contains: string; mode: 'insensitive' }; badgeId?: { contains: string } }>;
    } = { isActive: true };

    if (search) where.OR = [
      { fullName: { contains: search, mode: 'insensitive' } },
      { badgeId: { contains: search } },
    ];

    // Parallel reads — display count + page, no snapshot requirement.
    const [total, officers] = await Promise.all([
      prisma.policeUser.count({ where }),
      prisma.policeUser.findMany({
        where,
        select: {
          id: true, badgeId: true, fullName: true, email: true, isActive: true,
          rank: { select: { level: true, title: true } },
          station: { select: { name: true } },
          createdAt: true,
        },
        orderBy: [{ rank: { level: 'asc' } }, { fullName: 'asc' }],
        skip: (pageNum - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return sendSuccess(res, { officers, pagination: { total, page: pageNum, limit: pageSize, pages: Math.ceil(total / pageSize) } });
  } catch (err) {
    next(err);
  }
};

const stationContactsSchema = z.object({
  alertEmailContacts: z.array(z.string().email()).max(10),
  alertWhatsappNumbers: z.array(z.string().regex(/^\+\d{10,15}$/)).max(10),
  alertsEnabled: z.boolean(),
});

export const updateStationContacts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { stationId } = req.params;
    const data = stationContactsSchema.parse(req.body);

    const station = await prisma.station.findUnique({ where: { id: stationId } });
    if (!station) throw new AppError(404, 'NOT_FOUND', 'Station not found');

    const updated = await prisma.station.update({
      where: { id: stationId },
      data: {
        alertEmailContacts: data.alertEmailContacts,
        alertWhatsappNumbers: data.alertWhatsappNumbers,
        alertsEnabled: data.alertsEnabled,
      },
      select: { id: true, name: true, alertEmailContacts: true, alertWhatsappNumbers: true, alertsEnabled: true },
    });

    return sendSuccess(res, updated, 'Station alert contacts updated');
  } catch (err) {
    next(err);
  }
};

export const getStationContacts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { stationId } = req.params;
    const station = await prisma.station.findUnique({
      where: { id: stationId },
      select: { id: true, name: true, alertEmailContacts: true, alertWhatsappNumbers: true, alertsEnabled: true },
    });
    if (!station) throw new AppError(404, 'NOT_FOUND', 'Station not found');
    return sendSuccess(res, station);
  } catch (err) {
    next(err);
  }
};

export const deactivatePoliceUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const officer = await prisma.policeUser.findFirst({
      where: { id, isActive: true },
    });
    if (!officer) throw new AppError(404, 'NOT_FOUND', 'Officer not found');

    await prisma.policeUser.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });

    return sendSuccess(res, null, 'Officer deactivated');
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POLICE READ-ONLY HOTEL GUEST SURVEILLANCE
// Frontend calls these from /police/hotels/:hotelId screens. Police can view
// any hotel's guest roster (with PII intentionally surfaced — that's the
// surveillance design). Hotels themselves still go through hotelPrisma which
// auto-scopes to their own hotelId.
// ─────────────────────────────────────────────────────────────────────────────

const guestListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  activeOnly: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true')),
  guestType: z.enum(['DOMESTIC', 'INTERNATIONAL']).optional(),
  sortBy: z.enum(['checkInDate', 'checkOutDate', 'name', 'room']).default('checkInDate'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const getPoliceHotelGuests = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user?.portalType !== 'POLICE') {
      throw new AppError(401, 'UNAUTHORIZED', 'Police authentication required');
    }
    const { hotelId } = req.params;
    const q = guestListQuerySchema.parse(req.query);

    const hotel = await prisma.hotel.findFirst({
      where: { id: hotelId, isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        contactNumber: true,
        address: true,
        totalFloors: true,
        roomsPerFloor: true,
      },
    });
    if (!hotel) throw new AppError(404, 'NOT_FOUND', 'Hotel not found');

    const where: Prisma.GuestWhereInput = { hotelId };
    if (typeof q.activeOnly === 'boolean') where.isActive = q.activeOnly;
    if (q.guestType) where.guestType = q.guestType as Prisma.EnumGuestTypeFilter;
    if (q.search) {
      where.OR = [
        { fullName: { contains: q.search, mode: 'insensitive' } },
        { phoneNumber: { contains: q.search } },
      ];
    }

    const sortOrder = (q.sortOrder === 'asc' || q.sortOrder === 'desc') ? q.sortOrder : 'desc';
    // Map sort key to actual column. `name` and `room` aren't direct columns
    // — name maps to fullName, room sorts by Room.roomNumber via relation.
    const orderBy: Prisma.GuestOrderByWithRelationInput =
      q.sortBy === 'name'
        ? { fullName: sortOrder }
        : q.sortBy === 'room'
        ? { room: { roomNumber: sortOrder } }
        : q.sortBy === 'checkOutDate'
        ? { checkOutDate: sortOrder }
        : { checkInDate: sortOrder };

    // Parallel reads — display count + page, no snapshot requirement.
    const [total, guests] = await Promise.all([
      prisma.guest.count({ where }),
      prisma.guest.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          age: true,
          gender: true,
          phoneNumber: true,
          guestType: true,
          checkInDate: true,
          checkOutDate: true,
          expectedCheckout: true,
          isActive: true,
          room: { select: { id: true, roomNumber: true, floor: true, category: true } },
        },
        orderBy,
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
    ]);

    return sendSuccess(res, {
      hotel,
      guests,
      pagination: {
        total,
        page: q.page,
        limit: q.limit,
        pages: Math.ceil(total / q.limit),
      },
    });
  } catch (err) {
    next(err);
  }
};

export const getPoliceHotelGuest = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user?.portalType !== 'POLICE') {
      throw new AppError(401, 'UNAUTHORIZED', 'Police authentication required');
    }
    const { hotelId, guestId } = req.params;

    const [hotel, guest] = await Promise.all([
      prisma.hotel.findFirst({
        where: { id: hotelId, isActive: true },
        select: {
          id: true,
          name: true,
          email: true,
          contactNumber: true,
          address: true,
        },
      }),
      prisma.guest.findFirst({
        where: { id: guestId, hotelId },
        include: {
          room: { select: { id: true, roomNumber: true, floor: true, category: true } },
        },
      }),
    ]);

    if (!hotel) throw new AppError(404, 'NOT_FOUND', 'Hotel not found');
    if (!guest) throw new AppError(404, 'NOT_FOUND', 'Guest not found');

    return sendSuccess(res, { hotel, guest });
  } catch (err) {
    next(err);
  }
};
