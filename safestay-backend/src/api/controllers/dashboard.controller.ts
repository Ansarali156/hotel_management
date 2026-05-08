import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { sendSuccess } from '../../utils/response';

export const getDashboardStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Seven independent COUNTs. $transaction serialised them AND forced a
    // snapshot we don't need (dashboard shows display numbers, not
    // accounting balances). Promise.all fans them out in parallel — wall-
    // clock drops from sum-of-all to max-of-all, and PG skips the txn
    // overhead.
    //
    // The `aadhaarMatches` count is backed by MatchAlert_aadhaar_match_idx
    // (partial expression index, migration 20260419010000) so it no longer
    // triggers a sequential scan on every dashboard render.
    const [
      totalHotels,
      totalOccupiedRooms,
      totalActiveGuests,
      totalActiveCriminals,
      pendingAlerts,
      criticalAlerts,
      aadhaarMatches,
    ] = await Promise.all([
      prisma.hotel.count({ where: { isActive: true } }),
      prisma.room.count({ where: { status: 'OCCUPIED' } }),
      prisma.guest.count({ where: { isActive: true } }),
      prisma.criminalProfile.count({
        where: {
          isActive: true,
          caseStatus: { in: ['WANTED', 'ABSCONDING'] },
        },
      }),
      prisma.matchAlert.count({ where: { status: 'PENDING_REVIEW' } }),
      prisma.matchAlert.count({
        where: {
          status: 'PENDING_REVIEW',
          matchScore: { gte: 0.70 },
        },
      }),
      prisma.matchAlert.count({
        where: {
          matchBreakdown: { path: ['aadhaar'], equals: 1 } as any,
        },
      }),
    ]);

    return sendSuccess(res, {
      totalHotels,
      totalOccupiedRooms,
      totalActiveGuests,
      totalActiveCriminals,
      pendingAlerts,
      criticalAlerts,
      aadhaarMatches,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /dashboard/hotels — list all hotels with guest counts (police view)
 *
 * Query params:
 *   search   string  — optional case-insensitive filter on name / address
 *   page     number  — 1-based (default 1)
 *   limit    number  — max 100 (default 50)
 *
 * Response stays backward-compatible with the existing frontend: `hotels` and
 * `total` are still top-level fields; `page` / `limit` / `pages` are added
 * and can be ignored by old clients.
 */
export const getHotelStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, page = '1', limit = '50' } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

    const where: any = { isActive: true, deletedAt: null };
    if (search && typeof search === 'string' && search.trim()) {
      where.OR = [
        { name: { contains: search.trim(), mode: 'insensitive' } },
        { address: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    // Two independent reads in parallel. Previous $transaction forced PG to
    // open a snapshot and serialise the pair — unnecessary for a paginated
    // display count. _count.rooms stays filtered (Room_hotelId_status_idx).
    const [total, hotels] = await Promise.all([
      prisma.hotel.count({ where }),
      prisma.hotel.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          contactNumber: true,
          address: true,
          totalFloors: true,
          roomsPerFloor: true,
          createdAt: true,
          _count: {
            select: {
              guests: { where: { isActive: true } },
              rooms: { where: { status: 'OCCUPIED' } },
            },
          },
        },
        orderBy: { name: 'asc' },
        skip: (pageNum - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const result = hotels.map((h: any) => ({
      id: h.id,
      name: h.name,
      email: h.email,
      phone: h.contactNumber,
      address: h.address,
      totalRooms: (h.totalFloors ?? 0) * (h.roomsPerFloor ?? 0),
      totalFloors: h.totalFloors,
      occupiedRooms: h._count.rooms,
      activeGuests: h._count.guests,
      registeredSince: h.createdAt,
    }));

    return sendSuccess(res, {
      hotels: result,
      total,
      page: pageNum,
      limit: pageSize,
      pages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    next(err);
  }
};
