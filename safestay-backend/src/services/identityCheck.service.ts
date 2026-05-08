/**
 * Identity check service — runs immediately after hotel check-in.
 *
 * STEALTH CONTRACT:
 * - This service is ONLY called from the guest controller (server-side, fire-and-forget).
 * - Hotel frontend never knows this runs — no latency impact, no response field, no error exposure.
 * - Uses policePrisma (full DB access) to cross-reference criminal profiles.
 * - Emits a Socket.IO event to police officers when a match is found.
 *
 * Match criteria (exact ID matching — score = 1.0):
 *   1. aadhaarHash — SHA-256 hash comparison (no decryption needed)
 *   2. passportNumber — case-insensitive string comparison
 *   3. drivingLicense — case-insensitive string comparison
 *
 * Note: voterId was dropped from both Guest and CriminalProfile in the current
 * schema, so we no longer check it here.  Keep the input field optional but
 * unused for API backward compatibility.
 */

import { policePrisma } from '../config/policeDatabase';
import { hotelPrisma } from '../config/hotelDatabase';
import { emitCriminalMatchAlert } from '../config/socketio';
import { logger } from '../utils/logger';

export interface IdentityCheckInput {
  guestId: string;
  hotelId: string;
  aadhaarHash?: string | null;
  passportNumber?: string | null;
  voterId?: string | null;
  drivingLicense?: string | null;
}

/**
 * Cross-references the guest's IDs against active criminal profiles.
 * Creates a MatchAlert and emits a Socket.IO event for every match found.
 * Always resolves — errors are swallowed so hotel check-in is never blocked.
 */
export const runIdentityCheck = async (input: IdentityCheckInput): Promise<void> => {
  const { guestId, aadhaarHash, passportNumber, drivingLicense } = input;

  // Skip if no IDs to check
  if (!aadhaarHash && !passportNumber && !drivingLicense) return;

  try {
    // Build OR conditions for each provided ID field
    const orConditions: Record<string, unknown>[] = [];
    if (aadhaarHash) {
      orConditions.push({ aadhaarHash });
    }
    if (passportNumber?.trim()) {
      orConditions.push({ passportNumber: { equals: passportNumber.trim(), mode: 'insensitive' } });
    }
    if (drivingLicense?.trim()) {
      orConditions.push({ drivingLicense: { equals: drivingLicense.trim(), mode: 'insensitive' } });
    }

    if (orConditions.length === 0) return;

    // Query criminal profiles — only active, wanted/absconding/under-investigation
    const matches = await policePrisma.criminalProfile.findMany({
      where: {
        isActive: true,
        caseStatus: { in: ['WANTED', 'ABSCONDING', 'UNDER_INVESTIGATION'] },
        OR: orConditions,
      },
      select: {
        id: true,
        fullName: true,
        aliases: true,
        crimeType: true,
        threatLevel: true,
        caseStatus: true,
        aadhaarHash: true,
        passportNumber: true,
        drivingLicense: true,
        jurisdictionPath: true,
      },
    });

    if (matches.length === 0) return;

    // Fetch guest + hotel/room context for the alert payload
    const guest = await hotelPrisma.guest.findUnique({
      where: { id: guestId },
      select: {
        fullName: true,
        checkInDate: true,
        hotel: { select: { name: true } },
        room: { select: { roomNumber: true } },
      },
    });

    if (!guest) {
      logger.warn('[IdentityCheck] Guest not found after check-in', { guestId });
      return;
    }

    // Batch-preload existing alerts for this guest vs. the matched criminals
    // so we don't do a findFirst() per criminal. `matches` is typically tiny
    // (1–3) but collapsing to one round-trip is cheaper and removes a small
    // findFirst→create race window.
    const matchedCriminalIds = matches.map((c) => c.id);
    const existingAlerts = await policePrisma.matchAlert.findMany({
      where: { guestId, criminalId: { in: matchedCriminalIds } },
      select: { criminalId: true },
    });
    const alreadyAlerted = new Set(existingAlerts.map((a) => a.criminalId));

    for (const criminal of matches) {
      // Determine which ID field caused the match
      let matchedField = '';
      if (aadhaarHash && criminal.aadhaarHash === aadhaarHash) {
        matchedField = 'AADHAAR';
      } else if (passportNumber && criminal.passportNumber?.toLowerCase() === passportNumber.toLowerCase()) {
        matchedField = 'PASSPORT';
      } else if (drivingLicense && criminal.drivingLicense?.toLowerCase() === drivingLicense.toLowerCase()) {
        matchedField = 'DRIVING_LICENCE';
      }

      if (!matchedField) continue; // Shouldn't happen, but guard anyway

      if (alreadyAlerted.has(criminal.id)) {
        logger.info('[IdentityCheck] Duplicate alert skipped', {
          guestId,
          criminalId: criminal.id,
        });
        continue;
      }

      // The new unique constraint on (guestId, criminalId) — enforced by
      // migration 20260419000000 — is our last-line defence against
      // duplicate inserts under concurrent check-ins for the same guest. If
      // we race and hit P2002, a sibling request's alert is already in
      // flight; skip emitting a duplicate event.
      let alert;
      try {
        alert = await policePrisma.matchAlert.create({
          data: {
            guestId,
            criminalId: criminal.id,
            matchScore: 1.0, // Exact ID match = maximum confidence
            matchBreakdown: { [matchedField.toLowerCase()]: 1.0 },
            status: 'PENDING_REVIEW',
            triggeredBy: 'CHECKIN',
          },
        });
      } catch (err: any) {
        if (err?.code === 'P2002') {
          logger.info('[IdentityCheck] Duplicate alert race — unique constraint caught it', {
            guestId,
            criminalId: criminal.id,
          });
          continue;
        }
        throw err;
      }

      // Emit real-time event to all connected police officers
      emitCriminalMatchAlert({
        alertId: alert.id,
        criminalProfile: {
          id: criminal.id,
          fullName: criminal.fullName,
          aliases: criminal.aliases,
          crimeType: criminal.crimeType,
          threatLevel: criminal.threatLevel,
          caseStatus: criminal.caseStatus,
        },
        guestCheckin: {
          name: guest.fullName,
          room: guest.room?.roomNumber ?? null,
          hotel: guest.hotel?.name ?? null,
          checkinTime: guest.checkInDate,
        },
        matchedField,
        threatLevel: criminal.threatLevel,
        timestamp: new Date().toISOString(),
      });

      logger.warn('[IdentityCheck] CRIMINAL MATCH DETECTED — alert created', {
        alertId: alert.id,
        guestId,
        criminalId: criminal.id,
        criminalName: criminal.fullName,
        matchedField,
        threatLevel: criminal.threatLevel,
      });
    }
  } catch (err) {
    // Non-fatal: hotel check-in has already succeeded, just log the failure
    logger.error('[IdentityCheck] Unhandled error during identity check', {
      guestId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
