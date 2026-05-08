import { defineConfig } from '@playwright/test';

/**
 * API-only E2E against a running backend. Default URL matches backend env (PORT 4000).
 *
 * Prerequisites: docker-compose (Postgres + Redis), prisma migrate, npm run seed:demo
 * (or equivalent seed with grand@hotel.com / Hotel@1234), backend listening.
 *
 *   E2E_API_BASE=http://127.0.0.1:4000 npm test
 */
const baseURL = process.env.E2E_API_BASE ?? 'http://127.0.0.1:4000';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL,
    extraHTTPHeaders: { Accept: 'application/json' },
  },
});
