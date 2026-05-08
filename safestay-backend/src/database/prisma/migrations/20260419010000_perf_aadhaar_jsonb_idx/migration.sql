-- ============================================================================
-- Aadhaar-confirmed match hot path — partial expression index
--
-- Why:
--   getDashboardStats is called on every police dashboard load and runs:
--
--     prisma.matchAlert.count({
--       where: { matchBreakdown: { path: ['aadhaar'], equals: 1 } }
--     });
--
--   Prisma translates this to a JSONB predicate scan of the entire
--   MatchAlert table on every dashboard render. On a large table that is
--   both slow and a pointless repeated DB cost.
--
-- How:
--   Build a PARTIAL btree index on the extracted JSONB value, scoped to rows
--   where the key exists. Partial keeps it small; the scan predicate matches
--   exactly what Prisma emits.
--
-- Safety:
--   IF NOT EXISTS → idempotent, no-op on re-apply.
--   Partial index → only indexes rows with the key present, so writes to
--   MatchAlerts without an `aadhaar` breakdown are not taxed.
-- ============================================================================

CREATE INDEX IF NOT EXISTS "MatchAlert_aadhaar_match_idx"
  ON "MatchAlert" ((("matchBreakdown" -> 'aadhaar')))
  WHERE "matchBreakdown" ? 'aadhaar';
