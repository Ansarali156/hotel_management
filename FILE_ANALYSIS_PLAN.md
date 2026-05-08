# SafeStay Network — Complete File-by-File Analysis Plan

Every file in this repository, numbered in reading order. Work through each phase sequentially.
Mark each file `[x]` when done.

**Total files: 196**
**Estimated time: 6–10 hours (skim), 15–20 hours (deep read)**

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ⭐ | Critical — must understand deeply |
| 🔒 | Security-sensitive |
| 🗄️ | Database / schema |
| ⚙️ | Config / infra |
| 🧪 | Test |
| 🖥️ | Frontend |
| 📋 | Docs / generated / skip if short on time |

---

## Phase 1 — Root Infrastructure & DevOps
*Understand the deployment topology before touching any code.*

| # | File | Tag | What to look for |
|---|------|-----|-----------------|
| 1 | [README.md](README.md) | 📋 | Project overview, setup instructions |
| 2 | [CLAUDE.md](CLAUDE.md) | ⭐ | Architecture constraints, abstraction wall rules |
| 3 | [QA_INDEPENDENT_VERIFICATION.md](QA_INDEPENDENT_VERIFICATION.md) | 📋 | QA test outcomes, known issues |
| 4 | [.env.example](.env.example) | ⚙️ | Root-level env vars (if any) |
| 5 | [.gitignore](.gitignore) | 📋 | What's excluded from git |
| 6 | [docker-compose.yml](docker-compose.yml) | ⚙️⭐ | Postgres :5433, Redis :6381 — service names matter for env vars |
| 7 | [render.yaml](render.yaml) | ⚙️ | Production topology — 1 backend, 2 static frontends, Postgres, Redis |
| 8 | [setup.bat](setup.bat) | ⚙️ | One-shot local setup sequence |
| 9 | [start.bat](start.bat) | ⚙️ | Start command wrapper |
| 10 | [stop.bat](stop.bat) | ⚙️ | Stop command wrapper |
| 11 | [.github/workflows/keep-alive.yml](.github/workflows/keep-alive.yml) | ⚙️ | GitHub Actions — keeps Render free-tier from sleeping |
| 12 | [.claude/settings.json](.claude/settings.json) | 📋 | Claude Code tool permissions |
| 13 | [.claude/settings.local.json](.claude/settings.local.json) | 📋 | Local Claude Code overrides |
| 14 | [.claude/launch.json](.claude/launch.json) | 📋 | Claude Code launch config |

---

## Phase 2 — Backend Project Setup
*Package, TS config, test harness config.*

| # | File | Tag | What to look for |
|---|------|-----|-----------------|
| 15 | [safestay-backend/package.json](safestay-backend/package.json) | ⚙️ | Scripts (dev/test/build/seed), key dependencies (Prisma, BullMQ, argon2, zod) |
| 16 | [safestay-backend/tsconfig.json](safestay-backend/tsconfig.json) | ⚙️ | Target, paths, strict mode settings |
| 17 | [safestay-backend/jest.config.ts](safestay-backend/jest.config.ts) | ⚙️🧪 | `setupFilesAfterFramework`, mock paths, test match patterns |
| 18 | [safestay-backend/.env.example](safestay-backend/.env.example) | ⚙️⭐ | All required env vars — reference against env.ts |
| 19 | [safestay-backend/.gitignore](safestay-backend/.gitignore) | 📋 | What's excluded |
| 20 | [safestay-backend/README.md](safestay-backend/README.md) | 📋 | Backend-specific setup notes |
| 21 | [safestay-backend/docker-compose.yml](safestay-backend/docker-compose.yml) | ⚙️ | Backend-local infra (may differ from root compose) |
| 22 | [safestay-backend/delete-all-data.ts](safestay-backend/delete-all-data.ts) | 🔒 | Destructive utility — understand what it nukes |
| 23 | [safestay-backend/testing-cmplt-V-1.md](safestay-backend/testing-cmplt-V-1.md) | 📋 | V1 testing completion notes |
| 24 | [safestay-backend/logs/combined.log](safestay-backend/logs/combined.log) | 📋 | Recent runtime logs — useful for understanding flow |
| 25 | [safestay-backend/logs/error.log](safestay-backend/logs/error.log) | 📋 | Recent errors |

---

## Phase 3 — Environment & App Config
*Zod validation crashes the app on bad env — understand this before debugging startup.*

| # | File | Tag | What to look for |
|---|------|-----|-----------------|
| 26 | [safestay-backend/src/config/env.ts](safestay-backend/src/config/env.ts) | ⭐⚙️ | Zod schema for all env vars, which ones are required vs optional |
| 27 | [safestay-backend/src/config/features.ts](safestay-backend/src/config/features.ts) | ⚙️ | Feature flags — what's enabled/disabled per environment |
| 28 | [safestay-backend/src/config/database.ts](safestay-backend/src/config/database.ts) | ⚙️🗄️ | Singleton Prisma client |
| 29 | [safestay-backend/src/config/hotelDatabase.ts](safestay-backend/src/config/hotelDatabase.ts) | ⭐🗄️🔒 | Hotel-scoped DB wrapper — abstraction wall enforcement |
| 30 | [safestay-backend/src/config/policeDatabase.ts](safestay-backend/src/config/policeDatabase.ts) | ⭐🗄️🔒 | Police-scoped DB wrapper — abstraction wall enforcement |
| 31 | [safestay-backend/src/config/redis.ts](safestay-backend/src/config/redis.ts) | ⚙️ | Redis client setup, connection string handling |
| 32 | [safestay-backend/src/config/socketio.ts](safestay-backend/src/config/socketio.ts) | ⚙️ | Socket.IO setup for real-time alerts |
| 33 | [safestay-backend/src/config/multer.ts](safestay-backend/src/config/multer.ts) | ⚙️ | File upload config — allowed types, size limits, storage path |
| 34 | [safestay-backend/src/config/swagger.ts](safestay-backend/src/config/swagger.ts) | ⚙️ | Swagger UI setup, password protection |
| 35 | [safestay-backend/src/index.ts](safestay-backend/src/index.ts) | ⭐⚙️ | App bootstrap: middleware order, route mounting, worker startup |

---

## Phase 4 — Database Schema & Migrations
*The data model is the contract everything else is built on.*

| # | File | Tag | What to look for |
|---|------|-----|-----------------|
| 36 | [safestay-backend/src/database/prisma/schema.prisma](safestay-backend/src/database/prisma/schema.prisma) | ⭐🗄️ | All models: Officer, Criminal, Guest, Hotel, Room, RefreshToken, MatchAlert, AuditLog — relations, enums, indexes |
| 37 | [safestay-backend/src/database/migrations/v2_schema.sql](safestay-backend/src/database/migrations/v2_schema.sql) | 🗄️ | Raw SQL schema (V2 reference) |
| 38 | [safestay-backend/src/database/prisma/migrations/migration_lock.toml](safestay-backend/src/database/prisma/migrations/migration_lock.toml) | 🗄️ | DB provider lock |
| 39 | [safestay-backend/src/database/prisma/migrations/20260402182638_init/migration.sql](safestay-backend/src/database/prisma/migrations/20260402182638_init/migration.sql) | 🗄️ | Initial schema — base tables |
| 40 | [safestay-backend/src/database/prisma/migrations/20260410175831_add_foreign_guest_details/migration.sql](safestay-backend/src/database/prisma/migrations/20260410175831_add_foreign_guest_details/migration.sql) | 🗄️ | Adds foreign guest fields |
| 41 | [safestay-backend/src/database/prisma/migrations/20260411000000_add_control_room_rank/migration.sql](safestay-backend/src/database/prisma/migrations/20260411000000_add_control_room_rank/migration.sql) | 🗄️ | Adds control room officer rank |
| 42 | [safestay-backend/src/database/prisma/migrations/20260411120000_police_passwordless_login/migration.sql](safestay-backend/src/database/prisma/migrations/20260411120000_police_passwordless_login/migration.sql) | 🗄️🔒 | Police login model change |
| 43 | [safestay-backend/src/database/prisma/migrations/20260412170623_add_voter_id_driving_license_and_indexes/migration.sql](safestay-backend/src/database/prisma/migrations/20260412170623_add_voter_id_driving_license_and_indexes/migration.sql) | 🗄️ | New identity fields + performance indexes |
| 44 | [safestay-backend/src/database/prisma/migrations/20260419000000_perf_indexes_and_matchalert_dedup/migration.sql](safestay-backend/src/database/prisma/migrations/20260419000000_perf_indexes_and_matchalert_dedup/migration.sql) | 🗄️⭐ | MatchAlert dedup constraint, perf indexes |
| 45 | [safestay-backend/src/database/prisma/migrations/20260419010000_perf_aadhaar_jsonb_idx/migration.sql](safestay-backend/src/database/prisma/migrations/20260419010000_perf_aadhaar_jsonb_idx/migration.sql) | 🗄️ | Aadhaar JSONB index for fast lookups |

---

## Phase 5 — Seeds & Test Data

| # | File | Tag | What to look for |
|---|------|-----|-----------------|
| 46 | [safestay-backend/src/database/seeds/policeRanks.ts](safestay-backend/src/database/seeds/policeRanks.ts) | 🗄️ | All 14 rank definitions with rankLevel numbers |
| 47 | [safestay-backend/src/database/seeds/defaultOfficer.ts](safestay-backend/src/database/seeds/defaultOfficer.ts) | 🗄️ | Demo officer credentials for dev login |
| 48 | [safestay-backend/src/database/seeds/comprehensive-seed.ts](safestay-backend/src/database/seeds/comprehensive-seed.ts) | 🗄️ | Full demo dataset — hotels, officers, criminals, guests |
| 49 | [safestay-backend/src/database/seeds/seedPoliceFromExcel.ts](safestay-backend/src/database/seeds/seedPoliceFromExcel.ts) | 🗄️ | Import officers from TSV file |
| 50 | [safestay-backend/src/database/seeds/data/CM_Bandobust_Duty_Import.tsv](safestay-backend/src/database/seeds/data/CM_Bandobust_Duty_Import.tsv) | 🗄️📋 | Real-format officer import data |

---

## Phase 6 — Type Declarations

| # | File | Tag | What to look for |
|---|------|-----|-----------------|
| 51 | [safestay-backend/src/types/bullmq.d.ts](safestay-backend/src/types/bullmq.d.ts) | ⚙️ | BullMQ type augmentations |

---

## Phase 7 — Middleware Stack
*Applied to every request. Security lives here.*

| # | File | Tag | What to look for |
|---|------|-----|-----------------|
| 52 | [safestay-backend/src/api/middleware/requireAuth.ts](safestay-backend/src/api/middleware/requireAuth.ts) | ⭐🔒 | JWT verification, `authenticate`, `authorizeHotel`, `authorizePolice(minRank)` |
| 53 | [safestay-backend/src/api/middleware/rateLimiter.ts](safestay-backend/src/api/middleware/rateLimiter.ts) | 🔒 | Redis-backed limits per endpoint, auth-specific tighter limits |
| 54 | [safestay-backend/src/api/middleware/securityHeaders.ts](safestay-backend/src/api/middleware/securityHeaders.ts) | 🔒 | Helmet config, CORS with two-origin whitelist |
| 55 | [safestay-backend/src/api/middleware/validateRequest.ts](safestay-backend/src/api/middleware/validateRequest.ts) | 🔒 | Zod schema validation middleware wrapper |
| 56 | [safestay-backend/src/api/middleware/errorHandler.ts](safestay-backend/src/api/middleware/errorHandler.ts) | ⚙️ | Central error → `sendError` envelope |

---

## Phase 8 — Auth Routes & Controller
*Token issuance, rotation, revocation — the most security-critical code.*

| # | File | Tag | What to look for |
|---|------|-----|-----------------|
| 57 | [safestay-backend/src/api/routes/auth.routes.ts](safestay-backend/src/api/routes/auth.routes.ts) | ⭐🔒 | Login/refresh/logout endpoints, middleware applied per route |
| 58 | [safestay-backend/src/api/controllers/auth.controller.ts](safestay-backend/src/api/controllers/auth.controller.ts) | ⭐🔒 | Token issuance, refresh rotation, logout, access token validation |

---

## Phase 9 — Hotel Domain Routes & Controllers

| # | File | Tag | What to look for |
|---|------|-----|-----------------|
| 59 | [safestay-backend/src/api/routes/hotel.routes.ts](safestay-backend/src/api/routes/hotel.routes.ts) | ⚙️ | Hotel CRUD endpoints, middleware stack |
| 60 | [safestay-backend/src/api/controllers/hotel.controller.ts](safestay-backend/src/api/controllers/hotel.controller.ts) | ⚙️ | Hotel registration, update, settings |
| 61 | [safestay-backend/src/api/routes/room.routes.ts](safestay-backend/src/api/routes/room.routes.ts) | ⚙️ | Room CRUD, availability endpoints |
| 62 | [safestay-backend/src/api/controllers/room.controller.ts](safestay-backend/src/api/controllers/room.controller.ts) | ⚙️ | Room creation, status updates |
| 63 | [safestay-backend/src/api/routes/guest.routes.ts](safestay-backend/src/api/routes/guest.routes.ts) | ⚙️ | Check-in/checkout, guest lookup endpoints |
| 64 | [safestay-backend/src/api/controllers/guest.controller.ts](safestay-backend/src/api/controllers/guest.controller.ts) | ⭐ | Check-in logic, identity linking, form-C trigger |
| 65 | [safestay-backend/src/api/routes/dashboard.routes.ts](safestay-backend/src/api/routes/dashboard.routes.ts) | ⚙️ | Dashboard summary endpoints |
| 66 | [safestay-backend/src/api/controllers/dashboard.controller.ts](safestay-backend/src/api/controllers/dashboard.controller.ts) | ⚙️ | Occupancy stats, ledger summaries |
| 67 | [safestay-backend/src/api/routes/files.routes.ts](safestay-backend/src/api/routes/files.routes.ts) | 🔒 | File serving with `FILE_SERVE_SECRET` token auth |

---

## Phase 10 — Police Domain Routes & Controllers

| # | File | Tag | What to look for |
|---|------|-----|-----------------|
| 68 | [safestay-backend/src/api/routes/police.routes.ts](safestay-backend/src/api/routes/police.routes.ts) | 🔒 | Officer CRUD, rank-gated endpoints |
| 69 | [safestay-backend/src/api/controllers/police.controller.ts](safestay-backend/src/api/controllers/police.controller.ts) | 🔒 | Officer management, jurisdiction scoping |
| 70 | [safestay-backend/src/api/routes/criminal.routes.ts](safestay-backend/src/api/routes/criminal.routes.ts) | 🔒 | Criminal profile CRUD, rank requirements per verb |
| 71 | [safestay-backend/src/api/controllers/criminal.controller.ts](safestay-backend/src/api/controllers/criminal.controller.ts) | 🔒 | Criminal create/update/soft-delete, file attach |
| 72 | [safestay-backend/src/api/routes/verification.routes.ts](safestay-backend/src/api/routes/verification.routes.ts) | ⭐🔒 | Trigger verification, review/dismiss alerts |
| 73 | [safestay-backend/src/api/controllers/verification.controller.ts](safestay-backend/src/api/controllers/verification.controller.ts) | ⭐🔒 | Run verification, handle MatchAlert lifecycle |

---

## Phase 11 — Token Service
*Core security primitive — read this carefully.*

| # | File | Tag | What to look for |
|---|------|-----|-----------------|
| 74 | [safestay-backend/src/services/token.service.ts](safestay-backend/src/services/token.service.ts) | ⭐🔒 | `generateRefreshJwt`, `verifyRefreshToken`, blocklist add/check, 128-byte hex token gen |

---

## Phase 12 — Verification & Matching Services

| # | File | Tag | What to look for |
|---|------|-----|-----------------|
| 75 | [safestay-backend/src/services/verification.service.ts](safestay-backend/src/services/verification.service.ts) | ⭐ | Criminal×guest cross-product, score threshold (0.40), MatchAlert dedup |
| 76 | [safestay-backend/src/services/verificationSync.service.ts](safestay-backend/src/services/verificationSync.service.ts) | ⚙️ | Sync/async coordination for verification runs |
| 77 | [safestay-backend/src/services/identityCheck.service.ts](safestay-backend/src/services/identityCheck.service.ts) | 🔒 | Aadhaar/identity validation logic |
| 78 | [safestay-backend/src/services/conflictDetection.service.ts](safestay-backend/src/services/conflictDetection.service.ts) | ⚙️ | Detect duplicate check-ins, room conflicts |
| 79 | [safestay-backend/src/services/alertDispatch.service.ts](safestay-backend/src/services/alertDispatch.service.ts) | ⚙️ | Push MatchAlert notifications to officers via Socket.IO |

---

## Phase 13 — Guest & Hotel Services

| # | File | Tag | What to look for |
|---|------|-----|-----------------|
| 80 | [safestay-backend/src/services/guestExport.service.ts](safestay-backend/src/services/guestExport.service.ts) | ⚙️ | CSV/Excel export of guest ledger |
| 81 | [safestay-backend/src/services/formCGenerator.ts](safestay-backend/src/services/formCGenerator.ts) | ⚙️ | Legal Form-C PDF generation for foreign guests |
| 82 | [safestay-backend/src/services/registerScanService.ts](safestay-backend/src/services/registerScanService.ts) | ⚙️ | Hotel register scan parsing |
| 83 | [safestay-backend/src/services/ocrService.ts](safestay-backend/src/services/ocrService.ts) | ⚙️ | OCR integration for ID document scanning |

---

## Phase 14 — Communication Services

| # | File | Tag | What to look for |
|---|------|-----|-----------------|
| 84 | [safestay-backend/src/services/emailService.ts](safestay-backend/src/services/emailService.ts) | ⚙️ | Email sending (alerts, confirmations) |
| 85 | [safestay-backend/src/services/whatsappService.ts](safestay-backend/src/services/whatsappService.ts) | ⚙️ | WhatsApp notification integration |

---

## Phase 15 — Utilities
*Pure functions — understand these before reading services.*

| # | File | Tag | What to look for |
|---|------|-----|-----------------|
| 86 | [safestay-backend/src/utils/response.ts](safestay-backend/src/utils/response.ts) | ⭐ | `sendSuccess`, `sendCreated`, `sendError` envelope — used in every controller |
| 87 | [safestay-backend/src/utils/logger.ts](safestay-backend/src/utils/logger.ts) | ⚙️ | Winston logger config, log levels, file transports |
| 88 | [safestay-backend/src/utils/matchScore.ts](safestay-backend/src/utils/matchScore.ts) | ⭐ | Weighted score calculation (Aadhaar 0.55, name 0.20, phone 0.15, age 0.05, passport 0.05) |
| 89 | [safestay-backend/src/utils/matching.utils.ts](safestay-backend/src/utils/matching.utils.ts) | ⭐ | Name normalization, fuzzy matching helpers |
| 90 | [safestay-backend/src/utils/jurisdictionHelper.ts](safestay-backend/src/utils/jurisdictionHelper.ts) | ⭐🔒 | `startsWith` path RLS, jurisdiction path parsing |
| 91 | [safestay-backend/src/utils/encrypt.ts](safestay-backend/src/utils/encrypt.ts) | 🔒 | AES-256-GCM encrypt/decrypt (future Aadhaar encryption) |
| 92 | [safestay-backend/src/utils/csvSanitizer.ts](safestay-backend/src/utils/csvSanitizer.ts) | 🔒 | CSV injection prevention |
| 93 | [safestay-backend/src/utils/otaParser.ts](safestay-backend/src/utils/otaParser.ts) | ⚙️ | OTA channel booking data parser |

---

## Phase 16 — Queues (BullMQ Job Definitions)

| # | File | Tag | What to look for |
|---|------|-----|-----------------|
| 94 | [safestay-backend/src/queues/cleanupQueue.ts](safestay-backend/src/queues/cleanupQueue.ts) | ⚙️ | Queue config for expired refresh token cleanup |
| 95 | [safestay-backend/src/queues/verificationQueue.ts](safestay-backend/src/queues/verificationQueue.ts) | ⚙️ | Queue config for async verification runs |
| 96 | [safestay-backend/src/queues/guestVerificationQueue.ts](safestay-backend/src/queues/guestVerificationQueue.ts) | ⚙️ | Per-guest verification job queue |
| 97 | [safestay-backend/src/queues/sweepQueue.ts](safestay-backend/src/queues/sweepQueue.ts) | ⚙️ | Sweep queue for batch operations |
| 98 | [safestay-backend/src/queues/injectionQueue.ts](safestay-backend/src/queues/injectionQueue.ts) | ⚙️ | Data injection queue |

---

## Phase 17 — Workers (BullMQ Job Processors)

| # | File | Tag | What to look for |
|---|------|-----|-----------------|
| 99 | [safestay-backend/src/workers/cleanup.worker.ts](safestay-backend/src/workers/cleanup.worker.ts) | ⭐ | Purges expired refresh tokens from DB — how the blocklist gets cleaned |
| 100 | [safestay-backend/src/workers/verification.worker.ts](safestay-backend/src/workers/verification.worker.ts) | ⭐ | Processes async verification jobs |
| 101 | [safestay-backend/src/workers/guestVerification.worker.ts](safestay-backend/src/workers/guestVerification.worker.ts) | ⚙️ | Per-guest match check on check-in |
| 102 | [safestay-backend/src/workers/sweep.worker.ts](safestay-backend/src/workers/sweep.worker.ts) | ⚙️ | Batch sweep processor |
| 103 | [safestay-backend/src/workers/injection.worker.ts](safestay-backend/src/workers/injection.worker.ts) | ⚙️ | Data injection processor |

---

## Phase 18 — Test Infrastructure

| # | File | Tag | What to look for |
|---|------|-----|-----------------|
| 104 | [safestay-backend/tests/env.setup.ts](safestay-backend/tests/env.setup.ts) | 🧪⭐ | Injects env vars before tests — required values and test overrides |
| 105 | [safestay-backend/tests/setup.ts](safestay-backend/tests/setup.ts) | 🧪 | Global `clearAllMocks` after each test |
| 106 | [safestay-backend/tests/__mocks__/argon2.js](safestay-backend/tests/__mocks__/argon2.js) | 🧪 | Pure-JS argon2 mock (avoids native binary) |
| 107 | [safestay-backend/tests/__mocks__/bullmq.js](safestay-backend/tests/__mocks__/bullmq.js) | 🧪 | No-op BullMQ mock (no Redis in unit tests) |

---

## Phase 19 — Unit Tests
*Read tests to understand expected contracts, not just implementation.*

| # | File | Tag | What to look for |
|---|------|-----|-----------------|
| 108 | [safestay-backend/tests/auth.test.ts](safestay-backend/tests/auth.test.ts) | 🧪⭐ | Hotel + police login happy path, bad credentials, token shape |
| 109 | [safestay-backend/tests/authRefresh.test.ts](safestay-backend/tests/authRefresh.test.ts) | 🧪⭐🔒 | Token rotation, refresh reuse attack detection |
| 110 | [safestay-backend/tests/authAudit.test.ts](safestay-backend/tests/authAudit.test.ts) | 🧪🔒 | Audit log entries on login/logout events |
| 111 | [safestay-backend/tests/tokenRevocation.test.ts](safestay-backend/tests/tokenRevocation.test.ts) | 🧪🔒 | Blocklist check, logout invalidates token |
| 112 | [safestay-backend/tests/hotel.test.ts](safestay-backend/tests/hotel.test.ts) | 🧪 | Hotel CRUD operations |
| 113 | [safestay-backend/tests/guest.test.ts](safestay-backend/tests/guest.test.ts) | 🧪 | Check-in/checkout, guest data validation |
| 114 | [safestay-backend/tests/criminal.test.ts](safestay-backend/tests/criminal.test.ts) | 🧪🔒 | Criminal CRUD, rank-gating assertions |
| 115 | [safestay-backend/tests/verification.test.ts](safestay-backend/tests/verification.test.ts) | 🧪⭐ | Match scoring end-to-end, alert creation, dedup |
| 116 | [safestay-backend/tests/matchScore.test.ts](safestay-backend/tests/matchScore.test.ts) | 🧪⭐ | Weight assertions (0.55/0.20/0.15/0.05/0.05), edge cases |
| 117 | [safestay-backend/tests/matching.utils.test.ts](safestay-backend/tests/matching.utils.test.ts) | 🧪 | Name normalization, fuzzy match accuracy |
| 118 | [safestay-backend/tests/auditLog.test.ts](safestay-backend/tests/auditLog.test.ts) | 🧪🔒 | Audit trail completeness |
| 119 | [safestay-backend/tests/cleanupWorker.refreshTokens.test.ts](safestay-backend/tests/cleanupWorker.refreshTokens.test.ts) | 🧪🔒 | Expired token cleanup job correctness |
| 120 | [safestay-backend/tests/fileValidation.test.ts](safestay-backend/tests/fileValidation.test.ts) | 🧪🔒 | Upload validation — allowed types, size limits |
| 121 | [safestay-backend/tests/alert.smoke.test.ts](safestay-backend/tests/alert.smoke.test.ts) | 🧪 | Alert dispatch smoke test |
| 122 | [safestay-backend/tests/auth.smoke.test.ts](safestay-backend/tests/auth.smoke.test.ts) | 🧪 | Auth flow smoke test |

---

## Phase 20 — E2E Tests (Playwright)
*Requires running backend. Skip during code review; run against live backend.*

| # | File | Tag | What to look for |
|---|------|-----|-----------------|
| 123 | [e2e/playwright.config.ts](e2e/playwright.config.ts) | 🧪⚙️ | Base URL, health-check skip logic, timeouts |
| 124 | [e2e/package.json](e2e/package.json) | 🧪⚙️ | E2E dependencies |
| 125 | [e2e/.gitignore](e2e/.gitignore) | 📋 | Excluded E2E artifacts |
| 126 | [e2e/tests/auth-hotel-api.spec.ts](e2e/tests/auth-hotel-api.spec.ts) | 🧪 | Hotel auth full flow via real API |
| 127 | [e2e/tests/auth-police-api.spec.ts](e2e/tests/auth-police-api.spec.ts) | 🧪 | Police auth full flow via real API |
| 128 | [e2e/tests/auth-cross-portal.spec.ts](e2e/tests/auth-cross-portal.spec.ts) | 🧪⭐🔒 | Hotel token rejected on police endpoint (abstraction wall test) |
| 129 | [e2e/tests/auth-hotel-registration.spec.ts](e2e/tests/auth-hotel-registration.spec.ts) | 🧪 | Hotel registration flow |
| 130 | [e2e/tests/all-endpoints-comprehensive.spec.ts](e2e/tests/all-endpoints-comprehensive.spec.ts) | 🧪 | Full endpoint coverage sweep |

---

## Phase 21 — Frontend Project Setup

| # | File | Tag | What to look for |
|---|------|-----|-----------------|
| 131 | [safestay-frontend/package.json](safestay-frontend/package.json) | ⚙️🖥️ | React, Vite, Tailwind, i18next, axios versions |
| 132 | [safestay-frontend/tsconfig.json](safestay-frontend/tsconfig.json) | ⚙️🖥️ | TS config for frontend |
| 133 | [safestay-frontend/tsconfig.node.json](safestay-frontend/tsconfig.node.json) | ⚙️🖥️ | TS config for Vite build tools |
| 134 | [safestay-frontend/vite.config.ts](safestay-frontend/vite.config.ts) | ⚙️🖥️ | Build config, proxy rules, PWA plugin |
| 135 | [safestay-frontend/tailwind.config.ts](safestay-frontend/tailwind.config.ts) | ⚙️🖥️ | Theme extensions, custom colors |
| 136 | [safestay-frontend/postcss.config.js](safestay-frontend/postcss.config.js) | ⚙️🖥️ | PostCSS plugins |
| 137 | [safestay-frontend/.npmrc](safestay-frontend/.npmrc) | ⚙️🖥️ | npm registry settings |
| 138 | [safestay-frontend/.env.example](safestay-frontend/.env.example) | ⚙️🖥️ | Frontend env vars (API URL, portal mode) |
| 139 | [safestay-frontend/index.html](safestay-frontend/index.html) | 🖥️ | HTML entry point, meta tags, manifest link |
| 140 | [safestay-frontend/clear-sw.js](safestay-frontend/clear-sw.js) | 🖥️ | Service worker cache invalidation script |
| 141 | [safestay-frontend/src/vite-env.d.ts](safestay-frontend/src/vite-env.d.ts) | ⚙️🖥️ | Vite env type declarations |

---

## Phase 22 — Frontend Bootstrap

| # | File | Tag | What to look for |
|---|------|-----|-----------------|
| 142 | [safestay-frontend/src/main.tsx](safestay-frontend/src/main.tsx) | ⭐🖥️ | React root render, router setup, i18n init, portal detection |
| 143 | [safestay-frontend/src/App.tsx](safestay-frontend/src/App.tsx) | ⭐🖥️ | Route tree — hotel vs police portal split, protected routes |
| 144 | [safestay-frontend/src/index.css](safestay-frontend/src/index.css) | 🖥️ | Global CSS, Tailwind directives |

---

## Phase 23 — Internationalisation

| # | File | Tag | What to look for |
|---|------|-----|-----------------|
| 145 | [safestay-frontend/src/i18n/index.ts](safestay-frontend/src/i18n/index.ts) | 🖥️ | i18next init, language detection |
| 146 | [safestay-frontend/src/i18n/locales/en.json](safestay-frontend/src/i18n/locales/en.json) | 🖥️ | English strings |
| 147 | [safestay-frontend/src/i18n/locales/te.json](safestay-frontend/src/i18n/locales/te.json) | 🖥️ | Telugu strings |

---

## Phase 24 — Firebase

| # | File | Tag | What to look for |
|---|------|-----|-----------------|
| 148 | [safestay-frontend/src/lib/firebase.ts](safestay-frontend/src/lib/firebase.ts) | 🖥️🔒 | Firebase init — used for FCM push notifications |

---

## Phase 25 — Frontend Shared Layer

| # | File | Tag | What to look for |
|---|------|-----|-----------------|
| 149 | [safestay-frontend/src/shared/api/client.ts](safestay-frontend/src/shared/api/client.ts) | ⭐🖥️🔒 | Axios instance, auth header injection, **token refresh interceptor** |
| 150 | [safestay-frontend/src/shared/types/hotel.types.ts](safestay-frontend/src/shared/types/hotel.types.ts) | 🖥️ | Hotel-side TypeScript types |
| 151 | [safestay-frontend/src/shared/types/police.types.ts](safestay-frontend/src/shared/types/police.types.ts) | 🖥️ | Police-side TypeScript types |
| 152 | [safestay-frontend/src/shared/components/BrandLogo.tsx](safestay-frontend/src/shared/components/BrandLogo.tsx) | 🖥️ | Portal-aware logo switcher |
| 153 | [safestay-frontend/src/shared/components/ErrorBoundary.tsx](safestay-frontend/src/shared/components/ErrorBoundary.tsx) | 🖥️ | React error boundary wrapper |
| 154 | [safestay-frontend/src/shared/components/ConnectionStatus.tsx](safestay-frontend/src/shared/components/ConnectionStatus.tsx) | 🖥️ | Online/offline indicator |
| 155 | [safestay-frontend/src/shared/components/OfflinePage.tsx](safestay-frontend/src/shared/components/OfflinePage.tsx) | 🖥️ | PWA offline fallback page |
| 156 | [safestay-frontend/src/shared/components/LanguageSwitcher.tsx](safestay-frontend/src/shared/components/LanguageSwitcher.tsx) | 🖥️ | EN/TE toggle component |
| 157 | [safestay-frontend/src/shared/components/PwaInstallButton.tsx](safestay-frontend/src/shared/components/PwaInstallButton.tsx) | 🖥️ | PWA install prompt trigger |
| 158 | [safestay-frontend/src/shared/components/PwaInstallPrompt.tsx](safestay-frontend/src/shared/components/PwaInstallPrompt.tsx) | 🖥️ | PWA install UI dialog |

---

## Phase 26 — Hotel Portal

| # | File | Tag | What to look for |
|---|------|-----|-----------------|
| 159 | [safestay-frontend/src/portals/hotel/api/hotel.api.ts](safestay-frontend/src/portals/hotel/api/hotel.api.ts) | ⭐🖥️ | All hotel API calls — check endpoint paths match backend routes |
| 160 | [safestay-frontend/src/portals/hotel/components/HotelLayout.tsx](safestay-frontend/src/portals/hotel/components/HotelLayout.tsx) | 🖥️ | Nav, sidebar, auth guard wrapper |
| 161 | [safestay-frontend/src/portals/hotel/components/NotificationBell.tsx](safestay-frontend/src/portals/hotel/components/NotificationBell.tsx) | 🖥️ | Real-time notification badge |
| 162 | [safestay-frontend/src/portals/hotel/components/RoomDetailPanel.tsx](safestay-frontend/src/portals/hotel/components/RoomDetailPanel.tsx) | 🖥️ | Room status side panel |
| 163 | [safestay-frontend/src/portals/hotel/pages/Landing.tsx](safestay-frontend/src/portals/hotel/pages/Landing.tsx) | 🖥️ | Public landing page |
| 164 | [safestay-frontend/src/portals/hotel/pages/Login.tsx](safestay-frontend/src/portals/hotel/pages/Login.tsx) | 🖥️🔒 | Hotel login form, token storage |
| 165 | [safestay-frontend/src/portals/hotel/pages/Register.tsx](safestay-frontend/src/portals/hotel/pages/Register.tsx) | 🖥️ | Hotel registration flow |
| 166 | [safestay-frontend/src/portals/hotel/pages/Dashboard.tsx](safestay-frontend/src/portals/hotel/pages/Dashboard.tsx) | 🖥️ | Occupancy overview, stats cards |
| 167 | [safestay-frontend/src/portals/hotel/pages/CheckIn.tsx](safestay-frontend/src/portals/hotel/pages/CheckIn.tsx) | ⭐🖥️ | Check-in form — identity fields, room assignment |
| 168 | [safestay-frontend/src/portals/hotel/pages/GuestList.tsx](safestay-frontend/src/portals/hotel/pages/GuestList.tsx) | 🖥️ | Guest ledger table, search/filter |
| 169 | [safestay-frontend/src/portals/hotel/pages/ScanRegister.tsx](safestay-frontend/src/portals/hotel/pages/ScanRegister.tsx) | 🖥️ | OCR register scan upload UI |
| 170 | [safestay-frontend/src/portals/hotel/pages/Settings.tsx](safestay-frontend/src/portals/hotel/pages/Settings.tsx) | 🖥️ | Hotel settings, profile update |

---

## Phase 27 — Police Portal

| # | File | Tag | What to look for |
|---|------|-----|-----------------|
| 171 | [safestay-frontend/src/portals/police/api/police.api.ts](safestay-frontend/src/portals/police/api/police.api.ts) | ⭐🖥️🔒 | All police API calls — verify no hotel data leaks through |
| 172 | [safestay-frontend/src/portals/police/context/VerificationContext.tsx](safestay-frontend/src/portals/police/context/VerificationContext.tsx) | ⭐🖥️ | React context for verification state, alert count |
| 173 | [safestay-frontend/src/portals/police/components/PoliceLayout.tsx](safestay-frontend/src/portals/police/components/PoliceLayout.tsx) | 🖥️ | Police nav, rank display, jurisdiction badge |
| 174 | [safestay-frontend/src/portals/police/components/AddCriminalModal.tsx](safestay-frontend/src/portals/police/components/AddCriminalModal.tsx) | 🖥️ | Quick-add criminal modal |
| 175 | [safestay-frontend/src/portals/police/pages/Login.tsx](safestay-frontend/src/portals/police/pages/Login.tsx) | 🖥️🔒 | Police login (passwordless / badge-based) |
| 176 | [safestay-frontend/src/portals/police/pages/Dashboard.tsx](safestay-frontend/src/portals/police/pages/Dashboard.tsx) | 🖥️ | Alert count, recent matches, jurisdiction summary |
| 177 | [safestay-frontend/src/portals/police/pages/Alerts.tsx](safestay-frontend/src/portals/police/pages/Alerts.tsx) | ⭐🖥️ | MatchAlert list, filter by status |
| 178 | [safestay-frontend/src/portals/police/pages/AlertDetail.tsx](safestay-frontend/src/portals/police/pages/AlertDetail.tsx) | ⭐🖥️ | Alert review UI — approve/dismiss actions |
| 179 | [safestay-frontend/src/portals/police/pages/Criminals.tsx](safestay-frontend/src/portals/police/pages/Criminals.tsx) | 🖥️🔒 | Criminal profile list, jurisdiction-scoped |
| 180 | [safestay-frontend/src/portals/police/pages/CriminalDetail.tsx](safestay-frontend/src/portals/police/pages/CriminalDetail.tsx) | 🖥️🔒 | Criminal profile detail, photo, records |
| 181 | [safestay-frontend/src/portals/police/pages/AddCriminal.tsx](safestay-frontend/src/portals/police/pages/AddCriminal.tsx) | 🖥️🔒 | Add criminal form (rank ≥ 12 only) |
| 182 | [safestay-frontend/src/portals/police/pages/HotelStatus.tsx](safestay-frontend/src/portals/police/pages/HotelStatus.tsx) | 🖥️🔒 | Hotel occupancy view (police perspective) |
| 183 | [safestay-frontend/src/portals/police/pages/HotelDetail.tsx](safestay-frontend/src/portals/police/pages/HotelDetail.tsx) | 🖥️🔒 | Single hotel detail for police |
| 184 | [safestay-frontend/src/portals/police/pages/PoliceGuestDetail.tsx](safestay-frontend/src/portals/police/pages/PoliceGuestDetail.tsx) | 🖥️🔒 | Guest record as seen by police — check no extra fields leak |
| 185 | [safestay-frontend/src/portals/police/pages/StationSettings.tsx](safestay-frontend/src/portals/police/pages/StationSettings.tsx) | 🖥️ | Station/jurisdiction settings |

---

## Phase 28 — Static Assets & PWA

| # | File | Tag | What to look for |
|---|------|-----|-----------------|
| 186 | [safestay-frontend/public/checkinnow-icon.svg](safestay-frontend/public/checkinnow-icon.svg) | 🖥️📋 | Hotel portal PWA icon |
| 187 | [safestay-frontend/public/openstay-icon.svg](safestay-frontend/public/openstay-icon.svg) | 🖥️📋 | Alternative brand icon |
| 188 | [safestay-frontend/public/safestay-icon.svg](safestay-frontend/public/safestay-icon.svg) | 🖥️📋 | SafeStay brand icon |
| 189 | [safestay-frontend/dev-dist/registerSW.js](safestay-frontend/dev-dist/registerSW.js) | 🖥️📋 | Generated SW registration (do not edit) |
| 190 | [safestay-frontend/dev-dist/sw.js](safestay-frontend/dev-dist/sw.js) | 🖥️📋 | Generated service worker (do not edit) |
| 191 | [safestay-frontend/dev-dist/workbox-21a80088.js](safestay-frontend/dev-dist/workbox-21a80088.js) | 🖥️📋 | Generated Workbox runtime (do not edit) |
| 192 | [safestay-frontend/dev-dist/workbox-5a5d9309.js](safestay-frontend/dev-dist/workbox-5a5d9309.js) | 🖥️📋 | Generated Workbox runtime (do not edit) |
| 193 | [safestay-frontend/dev-dist/workbox-b24eef9b.js](safestay-frontend/dev-dist/workbox-b24eef9b.js) | 🖥️📋 | Generated Workbox runtime (do not edit) |
| 194 | [safestay-frontend/dev-dist/workbox-b6866b34.js](safestay-frontend/dev-dist/workbox-b6866b34.js) | 🖥️📋 | Generated Workbox runtime (do not edit) |

---

## Phase 29 — Frontend Config (Claude)

| # | File | Tag | What to look for |
|---|------|-----|-----------------|
| 195 | [safestay-frontend/.claude/launch.json](safestay-frontend/.claude/launch.json) | 📋 | Frontend Claude Code launch config |
| 196 | [safestay-backend/package-lock.json](safestay-backend/package-lock.json) | 📋 | Exact dependency tree (skip unless debugging dep issues) |

---

## Priority Fast-Track (if short on time)

Read only these 20 files and you'll understand ~80% of the system:

| # | File | Why |
|---|------|-----|
| 1 | `CLAUDE.md` | Architecture rules and constraints |
| 2 | `docker-compose.yml` | Infrastructure |
| 3 | `safestay-backend/src/config/env.ts` | What breaks at startup |
| 4 | `safestay-backend/src/index.ts` | Bootstrap order |
| 5 | `safestay-backend/src/database/prisma/schema.prisma` | All data models |
| 6 | `safestay-backend/src/config/hotelDatabase.ts` | Abstraction wall (hotel side) |
| 7 | `safestay-backend/src/config/policeDatabase.ts` | Abstraction wall (police side) |
| 8 | `safestay-backend/src/services/token.service.ts` | Auth security core |
| 9 | `safestay-backend/src/api/middleware/requireAuth.ts` | JWT verification + RBAC |
| 10 | `safestay-backend/src/api/routes/auth.routes.ts` | Auth endpoints |
| 11 | `safestay-backend/src/api/controllers/auth.controller.ts` | Token logic |
| 12 | `safestay-backend/src/utils/matchScore.ts` | Scoring weights |
| 13 | `safestay-backend/src/services/verification.service.ts` | Criminal×guest matching |
| 14 | `safestay-backend/src/utils/jurisdictionHelper.ts` | Row-level security |
| 15 | `safestay-backend/src/utils/response.ts` | Response envelope |
| 16 | `safestay-backend/tests/authRefresh.test.ts` | Token rotation contract |
| 17 | `safestay-frontend/src/shared/api/client.ts` | Frontend token refresh interceptor |
| 18 | `safestay-frontend/src/App.tsx` | Frontend routing + portal split |
| 19 | `safestay-frontend/src/portals/hotel/pages/CheckIn.tsx` | Primary hotel workflow |
| 20 | `e2e/tests/auth-cross-portal.spec.ts` | Abstraction wall enforcement test |

---

*Generated: 2026-04-28 | Total files: 196 | Repository: SafeStay Network (CheckInNow)*
