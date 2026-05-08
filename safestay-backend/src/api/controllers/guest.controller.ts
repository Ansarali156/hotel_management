/**
 * Guest controller — check-in / check-out / ledger / active.
 *
 * Authentication removed. hotelId is passed as a query parameter.
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { hotelPrisma } from '../../config/hotelDatabase';
import { sendCreated, sendSuccess } from '../../utils/response';
import { AppError } from '../middleware/errorHandler';
import { encryptAadhaar, hashAadhaar } from '../../utils/encrypt';
import { validateMagicBytes } from '../../config/multer';
import { detectAadhaarConflict, createConflictAuditLog } from '../../services/conflictDetection.service';
import { generateFormC } from '../../services/formCGenerator';
import { logger } from '../../utils/logger';
import { generateGuestCSV, generateGuestPDF, getHotelName } from '../../services/guestExport.service';
import { extractAadhaarFromImage } from '../../services/ocrService';
import { parseOtaBookingText } from '../../utils/otaParser';
import { scanRegisterImage } from '../../services/registerScanService';

const domesticGuestSchema = z.object({
  fullName: z.string().min(2).max(200),
  age: z.coerce.number().int().min(1).max(120),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  phoneNumber: z.string().min(6, 'Phone number is too short').max(15, 'Phone number is too long'),
  roomNumber: z.string().min(1),
  checkInDate: z.string().datetime(),
  expectedCheckout: z.string().datetime().optional(),
  fatherName: z.string().optional(),
  email: z.string().email().optional(),
  panCard: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/).optional(),
  address: z.string().optional(),
  aadhaarNumber: z.string().regex(/^\d{12}$/).optional(),
  guestType: z.enum(['DOMESTIC', 'INTERNATIONAL']).default('DOMESTIC'),
});

const internationalGuestSchema = domesticGuestSchema.extend({
  passportNumber: z.string().min(6).max(20),
  guestType: z.literal('INTERNATIONAL'),
  passportNationality: z.string().optional(),
  passportPlaceOfIssue: z.string().optional(),
  passportDateOfIssue: z.string().optional(),
  passportExpiry: z.string().optional(),
  visaNumber: z.string().optional(),
  visaType: z.string().optional(),
  visaValidTill: z.string().optional(),
});

/**
 * Return the authenticated hotel's id.  We never trust a client-supplied
 * query-string / body hotelId for mutating routes; on routes guarded by
 * `requireHotelAuth`, `req.user.hotelId` is always present.  Legacy routes
 * that are still unauthenticated (reads) can fall back to the query param.
 */
/**
 * Resolve the authenticated hotel's id.
 *
 * Always derived from the verified JWT — we never trust a hotelId supplied
 * in the query string or body, because that would let an attacker download
 * any hotel's guest PII once they knew the UUID (see previous export bug).
 * All routes that call this MUST be mounted behind `requireHotelAuth`.
 */
function getHotelId(req: Request): string {
  const fromToken = req.user?.hotelId;
  if (!fromToken) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Hotel authentication required');
  }
  return fromToken;
}

export const checkInGuest = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hotelId = getHotelId(req);
    const files = req.files as Record<string, Express.Multer.File[]>;

    const guestPhoto = files?.guestPhoto?.[0];
    const idDocument = files?.idDocument?.[0];
    const formCFile = files?.formC?.[0];

    const isInternational = req.body.guestType === 'INTERNATIONAL';

    // Guest photo is mandatory — the entire verification pipeline (face
    // match against criminal database, hotel register audit) depends on a
    // canonical photo at check-in. A check-in without a photo would create
    // a guest record that silently escapes identity verification.
    if (!guestPhoto) {
      throw new AppError(400, 'PHOTO_REQUIRED', 'Guest photo is required');
    }

    validateMagicBytes(guestPhoto.path, guestPhoto.mimetype);
    if (idDocument) validateMagicBytes(idDocument.path, idDocument.mimetype);
    if (formCFile) validateMagicBytes(formCFile.path, formCFile.mimetype);

    const schema = isInternational ? internationalGuestSchema : domesticGuestSchema;
    const data = schema.parse(req.body);

    // Use the (hotelId, roomNumber) composite unique index so Postgres does
    // an index lookup instead of a filtered scan. `findFirst` was previously
    // forcing a sequential scan when roomNumber alone wasn't indexed.
    const room = await hotelPrisma.room.findUnique({
      where: { hotelId_roomNumber: { hotelId, roomNumber: data.roomNumber } },
      select: { id: true, status: true, roomNumber: true },
    });
    if (!room) throw new AppError(404, 'ROOM_NOT_FOUND', 'Room not found');
    if (room.status !== 'AVAILABLE') throw new AppError(400, 'ROOM_NOT_AVAILABLE', 'Room is not available');

    let aadhaarEncrypted: string | undefined;
    let aadhaarHash: string | undefined;
    if (data.aadhaarNumber) {
      aadhaarEncrypted = encryptAadhaar(data.aadhaarNumber);
      aadhaarHash = hashAadhaar(data.aadhaarNumber);

      const conflict = await detectAadhaarConflict(aadhaarHash, hotelId);
      if (conflict.hasConflict) {
        createConflictAuditLog(aadhaarHash, hotelId, conflict.conflictHotelId!).catch(() => {});
        throw new AppError(
          409,
          'DUPLICATE_AADHAAR_DETECTED',
          'Check-in blocked: this Aadhaar is currently active at another location.'
        );
      }
    }

    const guest = await hotelPrisma.$transaction(async (tx: any) => {
      // Atomic room reservation: only succeeds if the room is still
      // AVAILABLE at the moment the transaction runs. Closes the TOCTOU
      // window between the findUnique above and the status update —
      // two concurrent check-ins now cannot both be accepted.
      const claim = await tx.room.updateMany({
        where: { id: room.id, status: 'AVAILABLE' },
        data: { status: 'OCCUPIED' },
      });
      if (claim.count === 0) {
        throw new AppError(409, 'ROOM_JUST_TAKEN', 'Room was claimed by another check-in — please retry');
      }

      const g = await tx.guest.create({
        data: {
          hotelId,
          roomId: room.id,
          fullName: data.fullName,
          age: data.age,
          gender: data.gender,
          phoneNumber: data.phoneNumber,
          fatherName: data.fatherName,
          email: data.email,
          panCard: data.panCard,
          address: data.address,
          guestType: isInternational ? 'INTERNATIONAL' : 'DOMESTIC',
          aadhaarEncrypted: aadhaarEncrypted ?? null,
          aadhaarHash: aadhaarHash ?? null,
          passportNumber: isInternational
            ? (data as z.infer<typeof internationalGuestSchema>).passportNumber
            : null,
          ...(isInternational ? {
            passportNationality: (data as z.infer<typeof internationalGuestSchema>).passportNationality ?? null,
            passportPlaceOfIssue: (data as z.infer<typeof internationalGuestSchema>).passportPlaceOfIssue ?? null,
            passportDateOfIssue: (data as z.infer<typeof internationalGuestSchema>).passportDateOfIssue
              ? new Date((data as z.infer<typeof internationalGuestSchema>).passportDateOfIssue!)
              : null,
            passportExpiry: (data as z.infer<typeof internationalGuestSchema>).passportExpiry
              ? new Date((data as z.infer<typeof internationalGuestSchema>).passportExpiry!)
              : null,
            visaNumber: (data as z.infer<typeof internationalGuestSchema>).visaNumber ?? null,
            visaType: (data as z.infer<typeof internationalGuestSchema>).visaType ?? null,
            visaValidTill: (data as z.infer<typeof internationalGuestSchema>).visaValidTill
              ? new Date((data as z.infer<typeof internationalGuestSchema>).visaValidTill!)
              : null,
          } : {}),
          checkInDate: new Date(data.checkInDate),
          expectedCheckout: data.expectedCheckout ? new Date(data.expectedCheckout) : null,
          guestPhotoPath: guestPhoto.path,
          idDocumentPath: idDocument?.path ?? null,
          formCPath: formCFile?.path,
          isActive: true,
        },
      });
      return g;
    });

    let formCUrl: string | undefined;
    if (isInternational) {
      try {
        const hotel = await hotelPrisma.hotel.findUnique({
          where: { id: hotelId },
          select: { name: true, address: true, licenseNumber: true },
        });

        const { pdfBuffer } = await generateFormC({
          guestFullName: guest.fullName,
          passportNumber: (data as z.infer<typeof internationalGuestSchema>).passportNumber,
          nationality: 'International',
          arrivalDate: guest.checkInDate.toISOString().split('T')[0],
          expectedDepartureDate: guest.expectedCheckout
            ? guest.expectedCheckout.toISOString().split('T')[0]
            : undefined,
          gender: guest.gender,
          hotelName: hotel?.name ?? 'Hotel',
          hotelAddress: hotel?.address ?? undefined,
          hotelLicenseNumber: hotel?.licenseNumber ?? undefined,
          roomNumber: room.roomNumber,
          purposeOfVisit: 'Tourism / Business',
        });

        const formCPath = `${process.env.UPLOAD_DIR ?? './uploads'}/formC_${guest.id}.pdf`;
        require('fs').writeFileSync(formCPath, pdfBuffer);
        await hotelPrisma.guest.update({
          where: { id: guest.id },
          data: { formCPath },
        });

        formCUrl = `/api/${process.env.API_VERSION ?? 'v1'}/guests/form-c/${guest.id}`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('[GuestController] Form C generation failed', { guestId: guest.id, error: msg });
      }
    }

    return sendCreated(
      res,
      {
        guestId: guest.id,
        ...(formCUrl && { formCUrl, formCNote: 'Form C has been auto-generated for this international guest.' }),
      },
      'Guest checked in successfully'
    );
  } catch (err) {
    next(err);
  }
};

export const checkOutGuest = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hotelId = getHotelId(req);
    const { guestId } = req.params;

    const guest = await hotelPrisma.guest.findFirst({
      where: { id: guestId, hotelId, isActive: true },
    });
    if (!guest) throw new AppError(404, 'GUEST_NOT_FOUND', 'Active guest not found');

    await hotelPrisma.$transaction(async (tx: any) => {
      await tx.guest.update({
        where: { id: guestId },
        data: { isActive: false, checkOutDate: new Date() },
      });
      await tx.room.update({
        where: { id: guest.roomId },
        data: { status: 'AVAILABLE' },
      });
    });

    // Fire-and-forget audit trail — check-out is a state change that
    // investigators may need to reconstruct ("was guest X on premises at
    // time T?"). We intentionally keep metadata minimal so the audit log
    // doesn't itself become PII leakage (no Aadhaar, no phone).
    writeCheckoutAudit(hotelId, guestId).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[GuestController] audit write failed', { error: msg });
    });

    return sendSuccess(res, null, 'Guest checked out successfully');
  } catch (err) {
    next(err);
  }
};

/**
 * Emit an AuditLog entry for a hotel-initiated check-out.
 *
 * Kept intentionally lean: action + resourceType + actor. Adding guest PII
 * to the metadata would make the AuditLog table the new leak surface — the
 * point is WHO did WHAT, not what the guest's Aadhaar was. Workers that
 * need guest detail can join through resourceId.
 */
async function writeCheckoutAudit(hotelId: string, guestId: string): Promise<void> {
  await hotelPrisma.auditLog.create({
    data: {
      actorId: hotelId,
      actorType: 'HOTEL',
      action: 'UPDATE',
      resourceType: 'Guest',
      resourceId: guestId,
      metadata: { event: 'check_out' },
    },
  });
}

export const getGuestLedger = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hotelId = getHotelId(req);
    const {
      page = '1',
      limit = '20',
      name,
      phone,
      fromDate,
      toDate,
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page));
    const pageSize = Math.min(100, parseInt(limit));

    const where: {
      hotelId: string;
      isActive: boolean;
      fullName?: { contains: string; mode: 'insensitive' };
      phoneNumber?: { contains: string };
      checkInDate?: { gte?: Date; lte?: Date };
    } = { hotelId, isActive: false };
    if (name) where.fullName = { contains: name, mode: 'insensitive' };
    if (phone) where.phoneNumber = { contains: phone };
    if (fromDate) where.checkInDate = { gte: new Date(fromDate) };
    if (toDate) where.checkInDate = { ...where.checkInDate, lte: new Date(toDate) };

    // $transaction with an array of two queries — gives us a consistent
    // snapshot (count agrees with returned rows) and matches the test
    // mocking pattern (prisma.$transaction is mocked with [total, rows]).
    const [total, guests] = await hotelPrisma.$transaction([
      hotelPrisma.guest.count({ where }),
      hotelPrisma.guest.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          phoneNumber: true,
          roomId: true,
          checkInDate: true,
          checkOutDate: true,
          guestType: true,
          age: true,
        },
        orderBy: { checkInDate: 'desc' },
        skip: (pageNum - 1) * pageSize,
        take: pageSize,
      }),
    ] as const);

    return sendSuccess(res, {
      guests,
      pagination: { total, page: pageNum, limit: pageSize, pages: Math.ceil(total / pageSize) },
    });
  } catch (err) {
    next(err);
  }
};

export const getActiveGuests = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hotelId = getHotelId(req);
    const { page = '1', limit = '20' } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page));
    const pageSize = Math.min(100, parseInt(limit));

    // See $transaction note above.
    const [total, guests] = await hotelPrisma.$transaction([
      hotelPrisma.guest.count({ where: { hotelId, isActive: true } }),
      hotelPrisma.guest.findMany({
        where: { hotelId, isActive: true },
        select: {
          id: true,
          fullName: true,
          age: true,
          gender: true,
          phoneNumber: true,
          guestType: true,
          checkInDate: true,
          expectedCheckout: true,
          room: { select: { roomNumber: true, floor: true, category: true } },
        },
        orderBy: { checkInDate: 'desc' },
        skip: (pageNum - 1) * pageSize,
        take: pageSize,
      }),
    ] as const);

    return sendSuccess(res, {
      guests,
      pagination: { total, page: pageNum, limit: pageSize, pages: Math.ceil(total / pageSize) },
    });
  } catch (err) {
    next(err);
  }
};

export const exportGuestCSV = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hotelId = getHotelId(req);
    const { dateFrom, dateTo, roomNumber, guestName } = req.query as Record<string, string>;

    const csvBuffer = await generateGuestCSV({ hotelId, dateFrom, dateTo, roomNumber, guestName });

    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=guests_${dateStr}.csv`);
    res.send(csvBuffer);
  } catch (err) {
    next(err);
  }
};

export const exportGuestPDF = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hotelId = getHotelId(req);
    const { dateFrom, dateTo, roomNumber, guestName } = req.query as Record<string, string>;

    const hotelName = await getHotelName(hotelId);
    const pdfBuffer = await generateGuestPDF(
      { hotelId, dateFrom, dateTo, roomNumber, guestName },
      hotelName
    );

    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=guests_${dateStr}.pdf`);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
};

export const ocrAadhaarCard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = req.file;
    if (!file) throw new AppError(400, 'FILE_REQUIRED', 'Image file is required for OCR');

    const result = await extractAadhaarFromImage(file.path);

    return sendSuccess(
      res,
      {
        ...result,
        ...(result.confidence < 0.30 && { note: 'Low confidence — please fill fields manually' }),
      },
      'Aadhaar OCR extraction complete'
    );
  } catch (err) {
    next(err);
  }
};

export const parseOtaBooking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bookingText = (req.body.bookingText ?? req.body.rawText) as string | undefined;

    if (!bookingText || bookingText.trim().length < 10) {
      throw new AppError(400, 'INVALID_INPUT', 'bookingText must be at least 10 characters');
    }

    const result = parseOtaBookingText(bookingText);

    if (result.confidence < 0.70) {
      return res.status(422).json({
        success: false,
        error: 'PARSE_CONFIDENCE_LOW',
        message: 'Could not reliably extract guest details from the provided text.',
        data: result,
      });
    }

    return sendSuccess(res, result, 'OTA booking text parsed successfully');
  } catch (err) {
    next(err);
  }
};

export const downloadFormC = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hotelId = getHotelId(req);
    const { guestId } = req.params;

    const guest = await hotelPrisma.guest.findFirst({
      where: { id: guestId, hotelId },
      select: { formCPath: true, passportNumber: true, fullName: true, guestType: true },
    });

    if (!guest) throw new AppError(404, 'GUEST_NOT_FOUND', 'Guest not found');
    if (guest.guestType !== 'INTERNATIONAL') {
      throw new AppError(400, 'NOT_INTERNATIONAL', 'Form C is only for international guests');
    }
    if (!guest.formCPath) {
      throw new AppError(404, 'FORM_C_NOT_FOUND', 'Form C has not been generated for this guest');
    }

    const fs = require('fs');
    if (!fs.existsSync(guest.formCPath)) {
      throw new AppError(404, 'FORM_C_FILE_MISSING', 'Form C file not found on disk');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=FormC_${guestId.slice(0, 8)}.pdf`
    );
    fs.createReadStream(guest.formCPath).pipe(res);
  } catch (err) {
    next(err);
  }
};

export const scanRegisterPage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      throw new AppError(400, 'IMAGE_REQUIRED', 'Please upload a photo of the register page');
    }

    const guests = await scanRegisterImage(req.file.path);

    const fsSync = require('fs');
    try { fsSync.unlinkSync(req.file.path); } catch { /* non-fatal */ }

    return sendSuccess(res, { guests, count: guests.length }, `Extracted ${guests.length} guest entries`);
  } catch (err) {
    next(err);
  }
};

const bulkGuestSchema = z.object({
  fullName: z.string().min(2).max(200),
  age: z.coerce.number().int().min(1).max(120),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  phoneNumber: z.string().min(6).max(15),
  roomNumber: z.string().min(1),
  checkInDate: z.string(),
  expectedCheckout: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  aadhaarNumber: z.string().regex(/^\d{12}$/).optional().nullable(),
  passportNumber: z.string().optional().nullable(),
  guestType: z.enum(['DOMESTIC', 'INTERNATIONAL']).default('DOMESTIC'),
});

export const bulkCheckIn = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hotelId = getHotelId(req);
    const raw = req.body.guests;

    if (!Array.isArray(raw) || raw.length === 0) {
      throw new AppError(400, 'GUESTS_REQUIRED', 'guests array is required and must not be empty');
    }
    if (raw.length > 50) {
      throw new AppError(400, 'TOO_MANY', 'Maximum 50 guests per bulk upload');
    }

    const validated: Array<z.infer<typeof bulkGuestSchema>> = [];
    const errors: Array<{ index: number; message: string }> = [];

    for (let i = 0; i < raw.length; i++) {
      const result = bulkGuestSchema.safeParse(raw[i]);
      if (result.success) {
        validated.push(result.data);
      } else {
        const field = result.error.issues[0]?.path.join('.') ?? 'unknown';
        const msg = result.error.issues[0]?.message ?? 'Invalid data';
        errors.push({ index: i, message: `Row ${i + 1} (${raw[i]?.fullName ?? '?'}): ${field} — ${msg}` });
      }
    }

    if (errors.length > 0) {
      return res.status(422).json({
        success: false,
        code: 'VALIDATION_ERRORS',
        message: 'Some guest entries have validation errors',
        errors,
      });
    }

    const results: Array<{ index: number; success: boolean; guestId?: string; error?: string }> = [];

    // ── Bulk prefetch #1: all requested rooms in ONE query (indexed by the
    //    Room(hotelId, roomNumber) composite unique) — replaces N per-guest
    //    findFirst() calls.
    const uniqueRoomNumbers = Array.from(new Set(validated.map((g) => g.roomNumber)));
    const rooms = await hotelPrisma.room.findMany({
      where: { hotelId, roomNumber: { in: uniqueRoomNumbers } },
      select: { id: true, roomNumber: true, status: true },
    });
    const roomByNumber = new Map<string, { id: string; status: string }>();
    for (const r of rooms) roomByNumber.set(r.roomNumber, { id: r.id, status: r.status });

    // ── Bulk prefetch #2: Aadhaar conflict check across all provided Aadhaars
    //    in ONE query on the (aadhaarHash, isActive) indexes. Previously this
    //    was N findFirst() calls inside detectAadhaarConflict().
    const aadhaarHashByInput = new Map<string, string>();
    for (const g of validated) {
      if (g.aadhaarNumber) aadhaarHashByInput.set(g.aadhaarNumber, hashAadhaar(g.aadhaarNumber));
    }
    const hashesToCheck = Array.from(new Set(aadhaarHashByInput.values()));
    const conflictRows = hashesToCheck.length > 0
      ? await hotelPrisma.guest.findMany({
          where: {
            aadhaarHash: { in: hashesToCheck },
            isActive: true,
            hotelId: { not: hotelId },
          },
          select: { aadhaarHash: true, hotel: { select: { id: true, name: true } } },
        })
      : [];
    const conflictByHash = new Map<string, { hotelId: string; hotelName: string }>();
    for (const c of conflictRows) {
      if (c.aadhaarHash) conflictByHash.set(c.aadhaarHash, { hotelId: c.hotel.id, hotelName: c.hotel.name });
    }

    // Track local room claims inside this bulk request so two rows targeting
    // the same room fail the second one up front (the DB updateMany guard
    // below is still the authoritative check against concurrent requests).
    const locallyClaimed = new Set<string>();

    for (let i = 0; i < validated.length; i++) {
      const data = validated[i];
      try {
        const room = roomByNumber.get(data.roomNumber);
        if (!room) {
          results.push({ index: i, success: false, error: `Room ${data.roomNumber} not found` });
          continue;
        }
        if (room.status !== 'AVAILABLE' || locallyClaimed.has(room.id)) {
          results.push({ index: i, success: false, error: `Room ${data.roomNumber} is not available` });
          continue;
        }

        let aadhaarEncrypted: string | null = null;
        let aadhaarHash: string | null = null;
        if (data.aadhaarNumber) {
          aadhaarEncrypted = encryptAadhaar(data.aadhaarNumber);
          aadhaarHash = aadhaarHashByInput.get(data.aadhaarNumber) ?? hashAadhaar(data.aadhaarNumber);

          const conflict = conflictByHash.get(aadhaarHash);
          if (conflict) {
            createConflictAuditLog(aadhaarHash, hotelId, conflict.hotelId).catch(() => {});
            results.push({ index: i, success: false, error: `Aadhaar already active at another hotel` });
            continue;
          }
        }

        const checkInDate = new Date(data.checkInDate);
        if (isNaN(checkInDate.getTime())) {
          results.push({ index: i, success: false, error: `Invalid checkInDate: ${data.checkInDate}` });
          continue;
        }

        const guest = await hotelPrisma.$transaction(async (tx: any) => {
          // Atomic room claim — protects against concurrent bulk uploads
          // racing for the same room across requests. (locallyClaimed
          // handles the in-request case.)
          const claim = await tx.room.updateMany({
            where: { id: room.id, status: 'AVAILABLE' },
            data: { status: 'OCCUPIED' },
          });
          if (claim.count === 0) {
            throw new AppError(409, 'ROOM_JUST_TAKEN', `Room ${data.roomNumber} was claimed concurrently`);
          }

          const g = await tx.guest.create({
            data: {
              hotelId,
              roomId: room.id,
              fullName: data.fullName,
              age: data.age,
              gender: data.gender,
              phoneNumber: data.phoneNumber,
              address: data.address ?? null,
              guestType: data.guestType,
              aadhaarEncrypted,
              aadhaarHash,
              passportNumber: data.passportNumber ?? null,
              checkInDate,
              expectedCheckout: data.expectedCheckout ? new Date(data.expectedCheckout) : null,
              isActive: true,
            },
          });
          return g;
        });

        locallyClaimed.add(room.id);
        // Keep the cached room status consistent with what we just persisted
        // so a later duplicate row in the same batch falls into the
        // "not available" branch above instead of re-trying the transaction.
        room.status = 'OCCUPIED';
        results.push({ index: i, success: true, guestId: guest.id });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ index: i, success: false, error: msg });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return sendSuccess(res, { results, successCount, failCount },
      `${successCount} guests checked in${failCount > 0 ? `, ${failCount} failed` : ''}`);
  } catch (err) {
    next(err);
  }
};
