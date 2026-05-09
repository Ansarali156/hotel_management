import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../middleware/errorHandler';

export const getRoomGrid = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // hotelId MUST come from the verified JWT.  Accepting ?hotelId= lets any
    // authenticated hotel enumerate another hotel's room layout and live
    // occupant PII (names + check-in times) — an IDOR break.
    const hotelId = req.user?.hotelId;
    if (!hotelId) throw new AppError(401, 'UNAUTHENTICATED', 'Hotel authentication required');

    const rooms = await prisma.room.findMany({
      where: { hotelId },
      include: {
        guests: {
          where: { isActive: true },
          select: { id: true, fullName: true, checkInDate: true, expectedCheckout: true },
        },
      },
      orderBy: [{ floor: 'asc' }, { roomNumber: 'asc' }],
    });

    // Group by floor
    const grid: Record<number, typeof rooms> = {};
    for (const room of rooms) {
      if (!grid[room.floor]) grid[room.floor] = [];
      grid[room.floor].push(room);
    }

    return sendSuccess(res, grid, 'Room grid loaded');
  } catch (err) {
    next(err);
  }
};

export const getRoomDetails = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Same reasoning as getRoomGrid: hotelId from JWT only.
    const hotelId = req.user?.hotelId;
    if (!hotelId) throw new AppError(401, 'UNAUTHENTICATED', 'Hotel authentication required');
    const { roomId } = req.params;

    const room = await prisma.room.findFirst({
      where: { id: roomId, hotelId },
      include: {
        guests: {
          where: { isActive: true },
          select: {
            id: true,
            fullName: true,
            age: true,
            gender: true,
            phoneNumber: true,
            guestType: true,
            checkInDate: true,
            expectedCheckout: true,
          },
        },
      },
    });

    if (!room) throw new AppError(404, 'ROOM_NOT_FOUND', 'Room not found');

    return sendSuccess(res, room, 'Room details loaded');
  } catch (err) {
    next(err);
  }
};

export const updateRoomStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { roomId } = req.params;
    const { status } = z.object({ status: z.enum(['AVAILABLE', 'MAINTENANCE']) }).parse(req.body);
    // Always derive hotelId from the authenticated hotel — prevents an
    // authenticated hotel from flipping another hotel's room status.
    const hotelId = req.user?.hotelId;
    if (!hotelId) throw new AppError(401, 'UNAUTHORIZED', 'Hotel authentication required');

    const room = await prisma.room.findFirst({ where: { id: roomId, hotelId } });
    if (!room) throw new AppError(404, 'ROOM_NOT_FOUND', 'Room not found');
    if (room.status === 'OCCUPIED') {
      throw new AppError(400, 'ROOM_OCCUPIED', 'Cannot change status of occupied room');
    }

    const updated = await prisma.room.update({
      where: { id: roomId },
      data: { status },
      select: { id: true, roomNumber: true, floor: true, status: true, category: true },
    });

    return sendSuccess(res, updated, 'Room status updated');
  } catch (err) {
    next(err);
  }
};

export const addRoom = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hotelId = req.user?.hotelId;
    if (!hotelId) throw new AppError(401, 'UNAUTHORIZED', 'Hotel authentication required');

    const schema = z.object({
      floor: z.coerce.number().int().min(1),
      roomNumber: z.string().min(1).max(20),
      category: z.string().min(1).max(100),
    });

    const data = schema.parse(req.body);

    // Check if room number already exists for this hotel
    const existing = await prisma.room.findUnique({
      where: { hotelId_roomNumber: { hotelId, roomNumber: data.roomNumber } },
    });

    if (existing) {
      throw new AppError(400, 'ROOM_EXISTS', `Room ${data.roomNumber} already exists`);
    }

    const hotel = await prisma.hotel.findUnique({ where: { id: hotelId } });
    if (!hotel) throw new AppError(404, 'HOTEL_NOT_FOUND', 'Hotel not found');

    const room = await prisma.$transaction(async (tx) => {
      const r = await tx.room.create({
        data: {
          hotelId,
          floor: data.floor,
          roomNumber: data.roomNumber,
          category: data.category,
          maxGuests: hotel.maxGuestsPerRoom,
        },
      });

      // Update hotel totalFloors if this room is on a higher floor
      if (data.floor > hotel.totalFloors) {
        await tx.hotel.update({
          where: { id: hotelId },
          data: { totalFloors: data.floor },
        });
      }

      return r;
    });

    return sendSuccess(res, room, 'Room added successfully');
  } catch (err) {
    next(err);
  }
};

export const deleteRoom = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hotelId = req.user?.hotelId;
    if (!hotelId) throw new AppError(401, 'UNAUTHORIZED', 'Hotel authentication required');

    const { roomId } = req.params;

    const room = await prisma.room.findFirst({
      where: { id: roomId, hotelId },
      include: { 
        guests: {
          where: { isActive: true },
          select: { id: true }
        }
      },
    });

    if (!room) throw new AppError(404, 'ROOM_NOT_FOUND', 'Room not found');
    if (room.guests.length > 0) {
      throw new AppError(400, 'ROOM_OCCUPIED', 'Cannot delete an occupied room');
    }

    await prisma.room.delete({ where: { id: roomId } });

    return sendSuccess(res, null, 'Room deleted successfully');
  } catch (err) {
    next(err);
  }
};
