/**
 * Conflict Detection Service — V2 Phase 2
 *
 * Detects when the same Aadhaar hash is associated with an active guest in
 * a different hotel simultaneously. This is a synchronous check that BLOCKS
 * the check-in if a conflict is found.
 *
 * SECURITY: Only aadhaarHash (SHA-256) is compared — plaintext never used.
 * STEALTH:  This service runs via hotelPrisma but results are reported to
 *           the police portal via a MatchAlert — hotel receives only a 409.
 */

import { hotelPrisma } from '../config/hotelDatabase';
import { policePrisma } from '../config/policeDatabase';
import { logger } from '../utils/logger';

export interface ConflictResult {
  hasConflict: boolean;
  conflictHotelName?: string;
  conflictHotelId?: string;
  conflictGuestId?: string;
}

/**
 * Check if the given Aadhaar hash is currently active in any hotel other than
 * the one making the check-in request.
 */
export async function detectAadhaarConflict(
  aadhaarHash: string,
  currentHotelId: string
): Promise<ConflictResult> {
  if (!aadhaarHash) return { hasConflict: false };

  const conflict = await hotelPrisma.guest.findFirst({
    where: {
      aadhaarHash,
      isActive: true,
      hotelId: { not: currentHotelId },
    },
    select: {
      id: true,
      hotel: { select: { id: true, name: true } },
    },
  });

  if (!conflict) return { hasConflict: false };

  logger.warn('[ConflictDetection] Duplicate Aadhaar detected across hotels', {
    aadhaarHash: aadhaarHash.substring(0, 8) + '...', // Partial hash for log safety
    existingHotelId: conflict.hotel.id,
    incomingHotelId: currentHotelId,
  });

  return {
    hasConflict: true,
    conflictHotelName: conflict.hotel.name,
    conflictHotelId: conflict.hotel.id,
    conflictGuestId: conflict.id,
  };
}

/**
 * Create a HIGH_PRIORITY MatchAlert flagged as a conflict in the police system.
 * Called after a conflict is detected and the check-in is blocked.
 *
 * This alert has no criminalId (there may not be a criminal profile yet) —
 * it's a standalone conflict flag for police review.
 *
 * NOTE: Since MatchAlert requires both guestId and criminalId in the schema,
 * we log the conflict to the AuditLog instead, as a CONFLICT_DETECTED event.
 */
export async function createConflictAuditLog(
  aadhaarHash: string,
  incomingHotelId: string,
  conflictHotelId: string
): Promise<void> {
  try {
    await policePrisma.auditLog.create({
      data: {
        actorId: incomingHotelId,
        actorType: 'HOTEL',
        action: 'CREATE',
        resourceType: 'CONFLICT_DETECTED',
        metadata: {
          aadhaarHashPartial: aadhaarHash.substring(0, 12),
          incomingHotelId,
          conflictHotelId,
          severity: 'HIGH_PRIORITY',
          description: 'Same Aadhaar hash detected active in two hotels simultaneously',
        },
      },
    });
    logger.info('[ConflictDetection] Conflict audit log created', {
      incomingHotelId,
      conflictHotelId,
    });
  } catch (err) {
    // Non-fatal — the check-in is still blocked; audit log failure just means
    // the conflict won't be in the police audit trail
    logger.error('[ConflictDetection] Failed to create conflict audit log', { err });
  }
}
