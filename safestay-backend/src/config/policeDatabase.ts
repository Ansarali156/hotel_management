/**
 * Police portal Prisma client.
 *
 * Police controllers have full access to all tables including criminal
 * profiles, match alerts, and verification data.  Hotel controllers must
 * NEVER import from here.
 *
 * Implementation note: same underlying PrismaClient as ./database, which
 * keeps Jest mocks working without any extra setup.
 */

import { prisma } from './database';
export { prisma as policePrisma };
