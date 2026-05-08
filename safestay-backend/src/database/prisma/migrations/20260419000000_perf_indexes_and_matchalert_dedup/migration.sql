-- ============================================================================
-- Performance indexes + MatchAlert dedup unique constraint
--
-- Goal: cut verification worker DB calls from O(C*G) lookups to O(1) upserts
-- and eliminate full-table scans on the hottest filter columns.
--
-- All CREATE INDEX statements use IF NOT EXISTS so re-running the migration
-- (or running it on an environment where prior raw-SQL indexes already exist)
-- is a safe no-op.
-- ============================================================================

-- ── Station ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "Station_jurisdictionPath_idx" ON "Station"("jurisdictionPath");

-- ── Hotel ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "Hotel_isActive_deletedAt_idx" ON "Hotel"("isActive", "deletedAt");
CREATE INDEX IF NOT EXISTS "Hotel_jurisdictionPath_idx" ON "Hotel"("jurisdictionPath");
CREATE INDEX IF NOT EXISTS "Hotel_nearestStationId_idx" ON "Hotel"("nearestStationId");

-- ── Room ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "Room_hotelId_status_idx" ON "Room"("hotelId", "status");

-- ── Guest ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "Guest_hotelId_isActive_idx" ON "Guest"("hotelId", "isActive");
CREATE INDEX IF NOT EXISTS "Guest_isActive_checkInDate_idx" ON "Guest"("isActive", "checkInDate");
CREATE INDEX IF NOT EXISTS "Guest_checkInDate_idx" ON "Guest"("checkInDate");
-- Guest_aadhaarHash / voterId / drivingLicense already created in 20260412170623
CREATE INDEX IF NOT EXISTS "Guest_passportNumber_idx" ON "Guest"("passportNumber");
CREATE INDEX IF NOT EXISTS "Guest_roomId_idx" ON "Guest"("roomId");

-- ── PoliceUser ──────────────────────────────────────────────────────────────
-- PoliceUser_phoneNumber_idx already created in 20260411120000
CREATE INDEX IF NOT EXISTS "PoliceUser_stationId_isActive_idx" ON "PoliceUser"("stationId", "isActive");
CREATE INDEX IF NOT EXISTS "PoliceUser_jurisdictionPath_idx" ON "PoliceUser"("jurisdictionPath");

-- ── CriminalProfile ─────────────────────────────────────────────────────────
-- Several CriminalProfile indexes already created in 20260412170623
CREATE INDEX IF NOT EXISTS "CriminalProfile_isActive_caseStatus_idx" ON "CriminalProfile"("isActive", "caseStatus");
CREATE INDEX IF NOT EXISTS "CriminalProfile_jurisdictionPath_idx" ON "CriminalProfile"("jurisdictionPath");
CREATE INDEX IF NOT EXISTS "CriminalProfile_firStationId_idx" ON "CriminalProfile"("firStationId");

-- ── MatchAlert dedup + hot indexes ─────────────────────────────────────────
-- Step 1 — collapse existing duplicate (guestId, criminalId) rows to the one
--          with the highest matchScore so the unique constraint can succeed.
--          Ties broken by oldest createdAt to preserve audit continuity.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "guestId", "criminalId"
      ORDER BY "matchScore" DESC, "createdAt" ASC
    ) AS rn
  FROM "MatchAlert"
)
DELETE FROM "MatchAlert"
WHERE "id" IN (SELECT "id" FROM ranked WHERE rn > 1);

-- Step 2 — enforce the unique constraint.
CREATE UNIQUE INDEX IF NOT EXISTS "MatchAlert_guestId_criminalId_key"
  ON "MatchAlert"("guestId", "criminalId");

-- Step 3 — supporting indexes for common police-dashboard queries.
CREATE INDEX IF NOT EXISTS "MatchAlert_status_matchScore_idx"
  ON "MatchAlert"("status", "matchScore");
CREATE INDEX IF NOT EXISTS "MatchAlert_status_createdAt_idx"
  ON "MatchAlert"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "MatchAlert_criminalId_idx" ON "MatchAlert"("criminalId");
CREATE INDEX IF NOT EXISTS "MatchAlert_guestId_idx"    ON "MatchAlert"("guestId");

-- ── AuditLog ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_resourceType_createdAt_idx" ON "AuditLog"("resourceType", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- ── Refresh tokens ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "HotelRefreshToken_hotelId_revokedAt_idx"
  ON "HotelRefreshToken"("hotelId", "revokedAt");
CREATE INDEX IF NOT EXISTS "HotelRefreshToken_expiresAt_idx"
  ON "HotelRefreshToken"("expiresAt");
CREATE INDEX IF NOT EXISTS "PoliceRefreshToken_policeUserId_revokedAt_idx"
  ON "PoliceRefreshToken"("policeUserId", "revokedAt");
CREATE INDEX IF NOT EXISTS "PoliceRefreshToken_expiresAt_idx"
  ON "PoliceRefreshToken"("expiresAt");
