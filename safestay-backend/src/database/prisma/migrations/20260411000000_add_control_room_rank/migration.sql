-- Add Control Room rank (level 0) — central command and control access
INSERT INTO "PoliceRank" (id, level, title, description)
VALUES (
  gen_random_uuid(),
  0,
  'Control Room',
  'Central command and control access'
)
ON CONFLICT (level) DO NOTHING;
