/**
 * Alert Dispatch Service — V2 Phase 1
 *
 * Orchestrates the dual-routing high-priority alert dispatch:
 * 1. Fetches the hotel's nearest police station
 * 2. Fetches the criminal's FIR-source police station
 * 3. Assembles the evidence package
 * 4. Sends email + WhatsApp to contacts at BOTH stations
 * 5. Updates MatchAlert.dispatchStatus in the DB
 *
 * Called by injection.worker.ts and sweep.worker.ts when score > 70%.
 * Also called by verification.service.ts for manual verification matches.
 *
 * Retries: up to 3 attempts with 5s / 10s / 20s exponential backoff.
 */

import { policePrisma } from '../config/policeDatabase';
import { hotelPrisma } from '../config/hotelDatabase';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { sendAlertEmail } from './emailService';
import { sendAlertWhatsApp } from './whatsappService';

export interface DispatchAlertInput {
  alertId: string;
  guestHotelId: string;
  guestHotelStationId?: string; // nearestStationId on the Hotel
  criminalFirStationId: string;
  matchScore: number;
  triggeredBy: string;
}

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [5000, 10000, 20000];

export async function dispatchHighPriorityAlert(input: DispatchAlertInput): Promise<void> {
  const {
    alertId,
    guestHotelId,
    guestHotelStationId,
    criminalFirStationId,
    matchScore,
    triggeredBy,
  } = input;

  const stationIds = Array.from(
    new Set([guestHotelStationId, criminalFirStationId].filter(Boolean) as string[])
  );

  // Fan out the four independent writes/reads in parallel: flipping
  // dispatchStatus to PENDING, station contacts, hotel name, and guest
  // check-in date. Previously these ran serially on the critical path,
  // adding ~3 extra network round-trips per dispatch.
  const [, stations, hotel, alert] = await Promise.all([
    policePrisma.matchAlert.update({
      where: { id: alertId },
      data: { dispatchStatus: 'PENDING' },
    }),
    policePrisma.station.findMany({
      where: { id: { in: stationIds }, alertsEnabled: true },
      select: {
        id: true,
        name: true,
        alertEmailContacts: true,
        alertWhatsappNumbers: true,
      },
    }),
    hotelPrisma.hotel.findUnique({
      where: { id: guestHotelId },
      select: { name: true, address: true },
    }),
    policePrisma.matchAlert.findUnique({
      where: { id: alertId },
      select: {
        guest: { select: { checkInDate: true } },
      },
    }),
  ]);

  if (stations.length === 0) {
    logger.warn('[AlertDispatch] No stations with alert contacts found', { alertId, stationIds });
    await policePrisma.matchAlert.update({
      where: { id: alertId },
      data: {
        dispatchStatus: 'FAILED',
        dispatchError: 'No stations with alertsEnabled=true found',
      },
    });
    return;
  }

  const policePortalAlertUrl = `${env.POLICE_PORTAL_URL}/alerts/${alertId}`;
  const checkInDate = alert?.guest.checkInDate.toISOString().split('T')[0] ?? '';

  // Collect all email/whatsapp contacts
  const allEmailContacts: string[] = [];
  const allWhatsappContacts: string[] = [];
  const stationIdsList: string[] = [];

  for (const station of stations) {
    allEmailContacts.push(...station.alertEmailContacts);
    allWhatsappContacts.push(...station.alertWhatsappNumbers);
    stationIdsList.push(station.id);
  }

  // Retry logic
  let lastError: string | undefined;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAYS_MS[attempt - 1]);
    }

    try {
      const [emailResult, whatsappResult] = await Promise.all([
        allEmailContacts.length > 0
          ? sendAlertEmail({
              to: allEmailContacts,
              refId: alertId,
              matchScore,
              threatLevel: 'HIGH_PRIORITY',
              hotelName: hotel?.name ?? 'Unknown Hotel',
              hotelLocation: hotel?.address ?? undefined,
              checkInDate,
              triggeredBy,
              policePortalAlertUrl,
            })
          : Promise.resolve({ success: true, messageIds: undefined, error: undefined }),

        allWhatsappContacts.length > 0
          ? sendAlertWhatsApp({
              to: allWhatsappContacts,
              refId: alertId,
              matchScore,
              threatLevel: 'HIGH_PRIORITY',
              policePortalAlertUrl,
            })
          : Promise.resolve({ success: true, messageIds: undefined, error: undefined }),
      ]);

      if (emailResult.success && whatsappResult.success) {
        await policePrisma.matchAlert.update({
          where: { id: alertId },
          data: {
            dispatchStatus: 'SENT',
            dispatchedAt: new Date(),
            dispatchToStations: stationIdsList,
          },
        });

        await policePrisma.auditLog.create({
          data: {
            actorId: 'SYSTEM',
            actorType: 'POLICE',
            action: 'UPDATE',
            resourceType: 'MatchAlert',
            resourceId: alertId,
            metadata: {
              event: 'HIGH_PRIORITY_ALERT_DISPATCHED',
              stationIds: stationIdsList,
              matchScore,
              triggeredBy,
            },
          },
        });

        logger.info('[AlertDispatch] Dispatch successful', { alertId, stationIds: stationIdsList });
        return;
      }

      lastError = [
        !emailResult.success ? `email: ${emailResult.error}` : '',
        !whatsappResult.success ? `whatsapp: ${whatsappResult.error}` : '',
      ]
        .filter(Boolean)
        .join('; ');
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      logger.warn('[AlertDispatch] Attempt failed', { alertId, attempt: attempt + 1, error: lastError });
    }
  }

  // All retries exhausted
  await policePrisma.matchAlert.update({
    where: { id: alertId },
    data: {
      dispatchStatus: 'FAILED',
      dispatchError: lastError ?? 'Unknown error after retries',
    },
  });

  logger.error('[AlertDispatch] All retries exhausted', { alertId, lastError });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
