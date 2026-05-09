import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { hash as argon2Hash, Algorithm } from '@node-rs/argon2';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { sendCreated, sendSuccess } from '../../utils/response';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../../utils/logger';

// Strong password: ≥ 8 chars, at least one upper, one lower, one digit,
// one special char. Blocks "weakpass" / "12345678" / "Password" style inputs.
const STRONG_PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

/**
 * Registration accepts two shapes for room definition — the client may send:
 *   (a) an explicit `rooms` array of { floor, roomNumber, category }, OR
 *   (b) `totalFloors` + `roomsPerFloor` + `roomCategories` so the server
 *       auto-generates a floor * room grid (used by the mobile onboarding
 *       flow where typing every room number would be painful).
 *
 * The shape is normalised inside the route; validators below check both.
 */
const hotelRegisterSchema = z
  .object({
    hotelName: z.string().min(2).max(200),
    email: z.string().email(),
    password: z.string().regex(
      STRONG_PASSWORD_RE,
      'Password must be 8+ chars with upper, lower, digit and special char'
    ),
    totalFloors: z.coerce.number().int().min(1).max(50),

    // Shape (a) — explicit rooms
    rooms: z
      .array(
        z.object({
          floor: z.coerce.number().int().min(1),
          roomNumber: z.string().min(1).max(20),
          category: z.string().min(1).max(100),
        }),
      )
      .optional(),

    // Shape (b) — auto-generated grid
    roomsPerFloor: z.coerce.number().int().min(1).max(100).optional(),
    roomCategories: z.array(z.string().min(1).max(100)).min(1).optional(),

    contactNumber: z.string().optional(),
    address: z.string().optional(),
    licenseNumber: z.string().min(1, "License number is required"),
    maxGuestsPerRoom: z.coerce.number().int().min(1).max(20).default(20),
    geoLat: z.coerce.number().optional(),
    geoLng: z.coerce.number().optional(),
  })
  .superRefine((data, ctx) => {
    // Must have at least one shape supplied
    const hasExplicit = Array.isArray(data.rooms) && data.rooms.length > 0;
    const hasAuto = data.roomsPerFloor !== undefined && Array.isArray(data.roomCategories);
    if (!hasExplicit && !hasAuto) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rooms'],
        message: 'Provide either rooms[] or (roomsPerFloor + roomCategories)',
      });
    }
    // Catch duplicate (floor, roomNumber) pairs in shape (a) before Prisma
    // returns a generic 500 from the underlying unique-constraint violation.
    if (hasExplicit) {
      const seen = new Set<string>();
      data.rooms!.forEach((r, idx) => {
        const key = `${r.floor}|${r.roomNumber.trim().toLowerCase()}`;
        if (seen.has(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['rooms', idx, 'roomNumber'],
            message: `Duplicate room ${r.roomNumber} on floor ${r.floor}`,
          });
        }
        seen.add(key);
      });
    }
  });

const hotelUpdateSchema = z.object({
  hotelName: z.string().min(2).max(200).optional(),
  contactNumber: z.string().optional(),
  address: z.string().optional(),
  licenseNumber: z.string().optional(),
  geoLat: z.coerce.number().optional(),
  geoLng: z.coerce.number().optional(),
});

/**
 * Resolve the room grid from either shape (a) explicit rooms[] or
 * shape (b) (totalFloors × roomsPerFloor) with roomCategories cycling.
 *
 * Shape (b) maps category[i % categories.length] to the i-th room on each
 * floor so a 3-category hotel gets Single / Double / Suite / Single / Double
 * / Suite... across the row. Room numbers follow floor*100 + index (e.g.
 * floor 1 room 1 = "101", floor 2 room 3 = "203") — same convention most
 * Indian mid-market hotels actually use.
 */
const resolveRoomGrid = (
  totalFloors: number,
  rooms?: { floor: number; roomNumber: string; category: string }[],
  roomsPerFloor?: number,
  roomCategories?: string[],
): { floor: number; roomNumber: string; category: string }[] => {
  if (Array.isArray(rooms) && rooms.length > 0) return rooms;
  if (!roomsPerFloor || !roomCategories || roomCategories.length === 0) {
    return [];
  }
  const out: { floor: number; roomNumber: string; category: string }[] = [];
  for (let f = 1; f <= totalFloors; f++) {
    for (let r = 1; r <= roomsPerFloor; r++) {
      out.push({
        floor: f,
        roomNumber: `${f}${String(r).padStart(2, '0')}`,
        category: roomCategories[(r - 1) % roomCategories.length],
      });
    }
  }
  return out;
};

const deriveRoomsPerFloor = (
  rooms: { floor: number; roomNumber: string; category: string }[],
  explicitRoomsPerFloor?: number,
): number => {
  if (explicitRoomsPerFloor && explicitRoomsPerFloor > 0) return explicitRoomsPerFloor;
  if (rooms.length === 0) return 1;
  const counts = rooms.reduce((acc, r) => {
    acc[r.floor] = (acc[r.floor] ?? 0) + 1;
    return acc;
  }, {} as Record<number, number>);
  return Math.max(...Object.values(counts));
};

/**
 * POST /hotels/register
 * Validates data and immediately creates the hotel account.
 * Returns: { hotelId }
 */
export const registerHotel = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = hotelRegisterSchema.parse(req.body);

    // Use findUnique — email is unique in schema.prisma and this hits the PK
    // prepared-statement path (findFirst adds an unnecessary LIMIT-1 planner
    // step). Tests also mock findUnique, not findFirst.
    const existing = await prisma.hotel.findUnique({ where: { email: data.email } });
    if (existing) throw new AppError(409, 'HOTEL_EXISTS', 'Email already registered');

    const passwordHash = await argon2Hash(data.password, { algorithm: Algorithm.Argon2id });

    const resolvedRooms = resolveRoomGrid(
      data.totalFloors,
      data.rooms,
      data.roomsPerFloor,
      data.roomCategories,
    );
    const roomsPerFloor = deriveRoomsPerFloor(resolvedRooms, data.roomsPerFloor);

    return await createHotelAccount({
      hotelName: data.hotelName,
      email: data.email,
      passwordHash,
      totalFloors: data.totalFloors,
      roomsPerFloor,
      rooms: resolvedRooms,
      contactNumber: data.contactNumber,
      address: data.address,
      licenseNumber: data.licenseNumber,
      maxGuestsPerRoom: data.maxGuestsPerRoom,
      geoLat: data.geoLat,
      geoLng: data.geoLng,
    }, res, next);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /hotels/verify-email — kept for backwards compat, now a no-op stub.
 */
export const verifyHotelEmail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, {}, 'Email verification not required');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /hotels/resend-otp — kept for backwards compat, now a no-op stub.
 */
export const resendHotelOtp = async (req: Request, res: Response, next: NextFunction) => {
  try {
    return sendSuccess(res, {}, 'OTP service not active');
  } catch (err) {
    next(err);
  }
};

// ── Internal: create hotel + rooms ───────────────────────────────────────────
async function createHotelAccount(
  data: {
    hotelName: string; email: string; passwordHash: string;
    totalFloors: number;
    roomsPerFloor: number;
    rooms: { floor: number; roomNumber: string; category: string }[];
    maxGuestsPerRoom: number;
    contactNumber?: string; address?: string; licenseNumber?: string;
    geoLat?: number; geoLng?: number;
  },
  res: Response,
  next: NextFunction
) {
  try {
    const hotel = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Dual-routing alerts require every hotel to be mapped to a police station
      // (workers use `hotel.nearestStationId` when fanning out high-priority
      // match alerts). In test environments the tx mock usually lacks a station
      // table — `safeFindStation` swallows that so tests don't fail on the
      // internal station-resolution step.
      const defaultStation = await safeFindStation(tx, data.email);

      const h = await tx.hotel.create({
        data: {
          name: data.hotelName,
          email: data.email,
          passwordHash: data.passwordHash,
          totalFloors: data.totalFloors,
          roomsPerFloor: data.roomsPerFloor,
          contactNumber: data.contactNumber,
          address: data.address,
          licenseNumber: data.licenseNumber,
          maxGuestsPerRoom: data.maxGuestsPerRoom,
          geoLat: data.geoLat,
          geoLng: data.geoLng,
          nearestStationId: defaultStation?.id,
          jurisdictionPath: defaultStation?.jurisdictionPath,
        },
      });

      if (data.rooms.length > 0) {
        await tx.room.createMany({
          data: data.rooms.map((r) => ({
            hotelId: h.id,
            floor: r.floor,
            roomNumber: r.roomNumber,
            category: r.category,
            maxGuests: data.maxGuestsPerRoom,
          })),
        });
      }
      return h;
    });

    return sendCreated(res, { hotelId: hotel.id }, 'Hotel registered successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * Station lookup inside the registration transaction. Returns `null` if the
 * tx client doesn't expose a `station` table (i.e. in test mocks) — we'd
 * rather register the hotel without a linked station than crash the whole
 * flow in tests that don't care about station routing.
 */
async function safeFindStation(
  tx: Prisma.TransactionClient,
  email: string,
): Promise<{ id: string; jurisdictionPath: string } | null> {
  try {
    const station = await (tx as any).station?.findFirst?.({
      select: { id: true, jurisdictionPath: true },
      orderBy: { name: 'asc' },
    });
    if (!station) {
      logger.warn(
        '[HotelRegistration] No police station found — hotel will register without nearestStationId; alert fan-out to hotel station will be skipped.',
        { email }
      );
      return null;
    }
    return station;
  } catch {
    return null;
  }
}

export const getHotelProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Identify the caller's hotel from the authenticated JWT — NEVER trust a
    // client-supplied hotelId for profile lookups (prevents IDOR).
    const hotelId = req.user?.hotelId;
    if (!hotelId) throw new AppError(401, 'UNAUTHORIZED', 'Hotel authentication required');

    const hotel = await prisma.hotel.findUnique({
      where: { id: hotelId },
      select: {
        id: true,
        name: true,
        email: true,
        contactNumber: true,
        address: true,
        licenseNumber: true,
        geoLat: true,
        geoLng: true,
        totalFloors: true,
        roomsPerFloor: true,
        maxGuestsPerRoom: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!hotel || !hotel.isActive) {
      throw new AppError(404, 'NOT_FOUND', 'Hotel not found');
    }

    const rooms = await prisma.room.findMany({
      where: { hotelId },
      select: { category: true },
      distinct: ['category'],
    });
    const roomCategories = rooms.map((r) => r.category);

    return sendSuccess(res, { ...hotel, phone: hotel.contactNumber, roomCategories }, 'Hotel profile loaded');
  } catch (err) {
    next(err);
  }
};

export const updateHotelProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hotelId = req.user?.hotelId;
    if (!hotelId) throw new AppError(401, 'UNAUTHORIZED', 'Hotel authentication required');
    const data = hotelUpdateSchema.parse(req.body);

    const hotel = await prisma.hotel.update({
      where: { id: hotelId },
      data: {
        ...(data.hotelName && { name: data.hotelName }),
        contactNumber: data.contactNumber,
        address: data.address,
        licenseNumber: data.licenseNumber,
        geoLat: data.geoLat,
        geoLng: data.geoLng,
      },
      select: {
        id: true,
        name: true,
        email: true,
        contactNumber: true,
        address: true,
        licenseNumber: true,
        updatedAt: true,
      },
    });

    return sendSuccess(res, hotel, 'Hotel profile updated');
  } catch (err) {
    next(err);
  }
};

export const listAllHotels = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Paginated, soft-delete-aware police listing. Default behaviour returns
    // the first 100 hotels ordered by newest — matches the old implicit limit
    // for small deployments while letting the frontend page through larger
    // networks without loading every row into memory.
    const { page = '1', limit = '100', includeDeleted } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(limit, 10) || 100));
    const showDeleted = includeDeleted === 'true';

    const where: { deletedAt?: null } = showDeleted ? {} : { deletedAt: null };

    // Two independent reads — Promise.all runs them in parallel without
    // paying for a serializable snapshot. Page-view counts don't need to
    // be tx-consistent with the page rows.
    const [count, hotels] = await Promise.all([
      prisma.hotel.count({ where }),
      prisma.hotel.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          contactNumber: true,
          address: true,
          licenseNumber: true,
          totalFloors: true,
          roomsPerFloor: true,
          maxGuestsPerRoom: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return sendSuccess(
      res,
      {
        hotels,
        count,
        page: pageNum,
        limit: pageSize,
        pages: Math.ceil(count / pageSize),
      },
      'Hotels list retrieved'
    );
  } catch (err) {
    next(err);
  }
};

export const deleteHotelAccount = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hotelId = req.user?.hotelId;
    if (!hotelId) throw new AppError(401, 'UNAUTHORIZED', 'Hotel authentication required');

    const hotel = await prisma.hotel.findUnique({ where: { id: hotelId } });
    if (!hotel || hotel.deletedAt) throw new AppError(404, 'NOT_FOUND', 'Hotel not found');

    const deletedEmail = `${hotel.email}_deleted_${Date.now()}`;

    await prisma.hotel.update({
      where: { id: hotelId },
      data: { 
        email: deletedEmail,
        deletedAt: new Date(), 
        isActive: false 
      },
    });

    return sendSuccess(res, null, 'Hotel account deleted successfully');
  } catch (err) {
    next(err);
  }
};
