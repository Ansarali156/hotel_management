# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SafeStay Network (CheckInNow) — a dual-portal hotel management + law enforcement surveillance system. Two completely separate portals share a single backend but must never leak data across the boundary:

- **Hotel Portal** — guest check-in/checkout, room inventory, ledger
- **Police Portal** — criminal profiles, match alerts, verification, 14-level RBAC, jurisdiction-scoped access

## Commands

### Backend (`safestay-backend/`)

```bash
npm run dev                    # ts-node-dev on :4000
npm test                       # Jest --runInBand --forceExit
npm run test:watch
npm run test:coverage
npm run build                  # Compile TypeScript
npm run prisma:migrate         # Run DB migrations
npm run prisma:generate        # Regenerate Prisma client
npm run prisma:studio          # Open Prisma Studio GUI
npm run seed                   # Seed 14 police ranks
npm run seed:officer           # Create demo officer
npm run seed:demo              # Seed comprehensive test data
```

Run a single test file:
```bash
npx jest tests/authRefresh.test.ts --runInBand
```

### Frontend (`safestay-frontend/`)

```bash
npm run dev           # Vite on :5173
npm run build
npm start:hotel       # Serve dist on :3000
npm start:police      # Serve dist on :3001
```

### E2E (`e2e/`)

```bash
npm test              # Playwright API tests (skips if GET /health fails)
```

### Local Infrastructure

```bash
docker-compose up -d  # Postgres on :5433, Redis on :6381
```

## Architecture

### Abstraction Wall

The single most important architectural constraint: **hotel routes must never expose police/criminal data**. Hotel responses must never contain: `police`, `criminal`, `verification`, `matching`, `alert`, `surveillance`, `nearestStation`, or `jurisdictionPath`.

- `authenticate + authorizeHotel` — hotel middleware stack
- `authenticate + authorizePolice(minRank)` — police middleware stack
- CORS separately whitelists `HOTEL_FRONTEND_ORIGIN` and `POLICE_FRONTEND_ORIGIN`

### JWT Token Architecture

- **Access tokens:** 15-min JWT containing `sub`, `portalType`, `rankLevel` (police), `jurisdictionPath` (police). Signed with `JWT_ACCESS_SECRET`.
- **Refresh tokens:** 128-byte random hex stored in DB, revocable individually. Signed/verified with `JWT_REFRESH_SECRET` (isolated secret). Functions: `generateRefreshJwt()` / `verifyRefreshToken()` in `token.service.ts`.
- Blocklist for revoked tokens; cleanup BullMQ worker clears expired refresh tokens.

### Police RBAC (14 levels)

Rank levels enforced on routes via `authorizePolice(minRank)`:
- Level 6 (SP): create officers
- Level 8 (DSP/CI): soft-delete criminals
- Level 10 (SI): review/dismiss match alerts
- Level 12 (HC): create/update criminals, trigger verification

### Jurisdiction Row-Level Security

Every police DB query filters by:
```typescript
where: { jurisdictionPath: { startsWith: req.jurisdictionPath } }
```

`jurisdictionPath` is a slash-delimited path like `"s1/z2/r3/d4/st5"` (State → Zone → Range → District → Station) stored on officers at creation time.

### Verification / Match Scoring Engine

Triggered via `POST /api/v1/verification/run`. Runs cross-product between WANTED/ABSCONDING criminals and currently checked-in guests. Weighted score:

| Field | Weight |
|-------|--------|
| Aadhaar | 0.55 |
| Name (normalized) | 0.20 |
| Phone | 0.15 |
| Age (±3 yr) | 0.05 |
| Passport | 0.05 |

Score ≥ 0.40 → creates `MatchAlert`. Dedup: existing PENDING_REVIEW alerts updated, not duplicated.

### Standard Response Envelope

All API responses use `sendSuccess` / `sendCreated` / `sendError` from `src/utils/response.ts`:
```json
{ "success": true, "statusCode": 200, "message": "...", "data": {} }
```

### Environment Validation

`src/config/env.ts` uses Zod to validate all env vars at startup. Missing required vars crash the process immediately — no silent defaults. Required: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `AADHAAR_ENCRYPTION_KEY` (64-char hex), `FILE_SERVE_SECRET`, `SWAGGER_PASSWORD`.

## Test Setup

Tests use mocks for native binaries:
- `tests/__mocks__/argon2.js` — pure-JS mock (avoids `.node` binary)
- `tests/__mocks__/bullmq.js` — no-op mock (no Redis needed in unit tests)
- `tests/env.setup.ts` — injects env vars before tests run
- `tests/setup.ts` — global `clearAllMocks` teardown

`jest.config.ts` uses `setupFilesAfterFramework` (not `setupFiles`) — important for mock ordering.

## Key File Locations

| Purpose | Path |
|---------|------|
| Env schema | `safestay-backend/src/config/env.ts` |
| Token service | `safestay-backend/src/services/token.service.ts` |
| Auth middleware | `safestay-backend/src/api/middleware/authenticate.ts` |
| RBAC middleware | `safestay-backend/src/api/middleware/rbac.ts` |
| Match scoring | `safestay-backend/src/utils/matchScore.ts` |
| Prisma schema | `safestay-backend/src/database/prisma/schema.prisma` |
| Auth routes | `safestay-backend/src/api/routes/auth.routes.ts` |
| Verification service | `safestay-backend/src/services/verification.service.ts` |
| Audit logging | `safestay-backend/src/api/middleware/audit.ts` |

## Deployment

- **Local:** `docker-compose up -d` → migrate → seed → `npm run dev`
- **Production:** `render.yaml` provisions Postgres, Node.js backend, 2× static sites (hotel `:3000`, police `:3001`)
- **BullMQ** requires TCP Redis (not Upstash REST-only) — use `rediss://` URL for Render KV or Upstash

## V1 Known Limitations

- Aadhaar stored as plain text (AES-256-GCM encryption deferred to V1.5)
- No fuzzy name matching (V2)
- No cron sweep — verification is manual trigger only
- New criminal profiles don't auto-trigger verification
- Tests mock Prisma; full integration tests need a separate `safestay_test` DB
