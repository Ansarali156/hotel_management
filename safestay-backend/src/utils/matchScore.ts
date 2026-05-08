/**
 * Match scoring algorithm — V3
 *
 * Combines weighted field similarity with forensically meaningful "hard-ID
 * overrides" so that government-issued identifiers dominate the final score
 * the same way a human officer would reason about them.
 *
 * SECURITY: The engine compares SHA-256 aadhaarHash values — plaintext Aadhaar
 * numbers are never passed into or out of this function.
 */

export interface MatchBreakdown {
  name: number;
  aadhaar: number;
  phone: number;
  age: number;
  passport: number;
  [key: string]: number;
}

interface MatchInput {
  guest: {
    fullName: string;
    aadhaarHash?: string | null;
    phoneNumber: string;
    age: number;
    guestType: string;
    passportNumber?: string | null;
  };
  criminal: {
    fullName: string;
    aadhaarHash?: string | null;
    phones: string[];
    approximateAge?: number | null;
    passportNumber?: string | null;
  };
}

const WEIGHTS = {
  aadhaar: 0.55,
  name: 0.20,
  phone: 0.15,
  age: 0.05,
  passport: 0.05,
};

/**
 * Lowercase, trim, strip everything that is not a unicode letter or digit.
 * Preserves Devanagari / Telugu / diacritics so two different non-Latin
 * strings are not both collapsed to "".
 */
const normalizeString = (s: string): string =>
  s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').trim();

/** Last 10 digits so a "+91" country code prefix does not prevent a match. */
const normalizePhone = (s: string): string => s.replace(/\D/g, '').slice(-10);

export const calculateMatchScore = (
  input: MatchInput
): { score: number; breakdown: MatchBreakdown } => {
  const breakdown: MatchBreakdown = { name: 0, aadhaar: 0, phone: 0, age: 0, passport: 0 };

  // Aadhaar — hash comparison (never plaintext)
  if (input.guest.aadhaarHash && input.criminal.aadhaarHash) {
    breakdown.aadhaar = input.guest.aadhaarHash === input.criminal.aadhaarHash ? 1.0 : 0.0;
  }

  // Passport — normalised exact match
  if (input.guest.passportNumber && input.criminal.passportNumber) {
    breakdown.passport =
      normalizeString(input.guest.passportNumber) ===
      normalizeString(input.criminal.passportNumber)
        ? 1.0
        : 0.0;
  }

  // Name — V3 fuzzy matching (token-sort + Jaro-Winkler + Double Metaphone) with alias check.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { fuzzyNameScoreWithAliases } = require('./matching.utils');
    const aliases = (input.criminal as { aliases?: string[] }).aliases ?? [];
    breakdown.name = fuzzyNameScoreWithAliases(
      input.guest.fullName,
      input.criminal.fullName,
      aliases
    );
  } catch {
    breakdown.name =
      normalizeString(input.guest.fullName) === normalizeString(input.criminal.fullName)
        ? 1.0
        : 0.0;
  }

  // Phone — normalise to last-10-digits so "+91" prefix / formatting differences don't kill the match.
  const guestPhone = normalizePhone(input.guest.phoneNumber);
  if (guestPhone) {
    breakdown.phone = input.criminal.phones.some(
      (p) => normalizePhone(p) === guestPhone
    )
      ? 1.0
      : 0.0;
  }

  // Age — within ±5 years, ONLY when both ages are present.
  if (
    input.criminal.approximateAge !== null &&
    input.criminal.approximateAge !== undefined &&
    input.guest.age > 0
  ) {
    breakdown.age =
      Math.abs(input.guest.age - input.criminal.approximateAge) <= 5 ? 1.0 : 0.0;
  }

  let score =
    breakdown.aadhaar * WEIGHTS.aadhaar +
    breakdown.name * WEIGHTS.name +
    breakdown.phone * WEIGHTS.phone +
    breakdown.age * WEIGHTS.age +
    breakdown.passport * WEIGHTS.passport;

  // ─── Forensic overrides ─────────────────────────────────────────────────
  // A hard-ID match (Aadhaar or Passport) is canonical identity re-use — it
  // should always escalate to the high-priority tier. Without this override
  // an Aadhaar-only match sits at 0.55, below the 0.70 alert band.
  if (breakdown.aadhaar === 1.0) score = Math.max(score, 0.95);
  if (breakdown.passport === 1.0) score = Math.max(score, 0.90);

  // Phone + strong-name combo is also high-confidence without needing Aadhaar.
  if (breakdown.phone === 1.0 && breakdown.name >= 0.85) score = Math.max(score, 0.80);

  // ─── False-positive guard ──────────────────────────────────────────────
  // Age alone is a weak signal — a pair whose only match is age should never
  // cross the 0.40 alert threshold even if someone tunes the weights upward.
  const onlyAgeMatched =
    breakdown.age === 1.0 &&
    breakdown.aadhaar === 0 &&
    breakdown.passport === 0 &&
    breakdown.phone === 0 &&
    breakdown.name < 0.70;
  if (onlyAgeMatched) score = Math.min(score, 0.30);

  return { score: Math.round(score * 100) / 100, breakdown };
};
