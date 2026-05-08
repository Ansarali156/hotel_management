/**
 * Hotel portal Prisma client.
 *
 * This is a TypeScript-typed view of the shared Prisma instance restricted
 * to the hotel domain tables only.  Hotel controllers MUST import from here
 * instead of ./database.  The TypeScript compiler will reject any attempt to
 * access criminal, matchAlert, policeUser, policeRank, or verification tables
 * through this client.
 *
 * Implementation note: the underlying PrismaClient instance is the same object
 * as `prisma` in ./database so that Jest module mocks applied to ./database
 * automatically propagate here — no extra test setup required.
 */

import { PrismaClient } from '@prisma/client';
import { prisma } from './database';

// Restrict to hotel-domain tables only.  Any attempt to call
// hotelPrisma.criminalProfile / .matchAlert / .policeUser etc. will be
// a TypeScript compile-time error.
type HotelPrismaClient = Pick<
  PrismaClient,
  | '$transaction'
  | '$connect'
  | '$disconnect'
  | '$on'
  | 'hotel'
  | 'hotelRefreshToken'
  | 'room'
  | 'guest'
  | 'auditLog'
  | 'station'
  | 'state'
  | 'zone'
  | 'range'
  | 'district'
>;

export const hotelPrisma: HotelPrismaClient = prisma as unknown as HotelPrismaClient;
