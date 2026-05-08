/**
 * Unit tests for the V3 composite match scorer.
 *
 * These tests lock in the forensic overrides:
 *   - Aadhaar hash match → always ≥ 0.95 (HIGH priority regardless of name)
 *   - Passport match → always ≥ 0.90
 *   - Phone + strong-name → ≥ 0.80
 *   - Age-only match → capped below 0.40 alert threshold
 *   - Unrelated pair → < 0.10
 */

import { calculateMatchScore } from '../src/utils/matchScore';

type Guest = Parameters<typeof calculateMatchScore>[0]['guest'];
type Criminal = Parameters<typeof calculateMatchScore>[0]['criminal'] & { aliases?: string[] };

const baseGuest: Guest = {
  fullName: 'Random Person',
  aadhaarHash: null,
  phoneNumber: '0000000000',
  age: 30,
  guestType: 'INDIAN',
  passportNumber: null,
};
const baseCriminal: Criminal = {
  fullName: 'Someone Else',
  aadhaarHash: null,
  phones: [],
  approximateAge: null,
  passportNumber: null,
  aliases: [],
};

describe('calculateMatchScore — hard-ID overrides', () => {
  it('Aadhaar hash match alone → score ≥ 0.95 (HIGH priority)', () => {
    const { score, breakdown } = calculateMatchScore({
      guest: { ...baseGuest, aadhaarHash: 'sha256-abc' },
      criminal: { ...baseCriminal, aadhaarHash: 'sha256-abc' },
    });
    expect(breakdown.aadhaar).toBe(1.0);
    expect(score).toBeGreaterThanOrEqual(0.95);
  });

  it('Passport match alone → score ≥ 0.90', () => {
    const { score, breakdown } = calculateMatchScore({
      guest: { ...baseGuest, passportNumber: 'X1234567' },
      criminal: { ...baseCriminal, passportNumber: 'x1234567' }, // case/format agnostic
    });
    expect(breakdown.passport).toBe(1.0);
    expect(score).toBeGreaterThanOrEqual(0.90);
  });

  it('Phone + strong-name combo → score ≥ 0.80', () => {
    const { score, breakdown } = calculateMatchScore({
      guest: { ...baseGuest, fullName: 'Vikram Gangster', phoneNumber: '9988776655' },
      criminal: { ...baseCriminal, fullName: 'Vikram Gangster', phones: ['9988776655'] },
    });
    expect(breakdown.phone).toBe(1.0);
    expect(breakdown.name).toBeGreaterThanOrEqual(0.9);
    expect(score).toBeGreaterThanOrEqual(0.80);
  });
});

describe('calculateMatchScore — phone normalisation', () => {
  it('ignores "+91" country code prefix', () => {
    const { breakdown } = calculateMatchScore({
      guest: { ...baseGuest, phoneNumber: '+919988776655' },
      criminal: { ...baseCriminal, phones: ['9988776655'] },
    });
    expect(breakdown.phone).toBe(1.0);
  });

  it('ignores spaces, dashes and parens', () => {
    const { breakdown } = calculateMatchScore({
      guest: { ...baseGuest, phoneNumber: '998-877-6655' },
      criminal: { ...baseCriminal, phones: ['(998) 877 6655'] },
    });
    expect(breakdown.phone).toBe(1.0);
  });
});

describe('calculateMatchScore — false-positive guards', () => {
  it('age-only match stays below 0.40 alert threshold', () => {
    const { score, breakdown } = calculateMatchScore({
      guest: { ...baseGuest, fullName: 'Alice Wonderland', age: 35 },
      criminal: { ...baseCriminal, fullName: 'Bob Builder', approximateAge: 33 },
    });
    expect(breakdown.age).toBe(1.0);
    expect(score).toBeLessThan(0.40);
  });

  it('completely unrelated pair → well below the 0.40 alert threshold', () => {
    const { score } = calculateMatchScore({
      guest: { ...baseGuest, fullName: 'Alice Wonderland', age: 25 },
      criminal: { ...baseCriminal, fullName: 'Vikram Gangster', approximateAge: 50 },
    });
    expect(score).toBeLessThan(0.20);
  });

  it('non-Latin normalisation does NOT collapse different strings to match', () => {
    // Before V3, both normalised to "" and would register as a name match.
    // V4 canonicalises both via transliteration, so distinct Telugu names
    // resolve to distinct Latin forms ("rajesh sharma" vs "ashok kumar")
    // and stay well below the high-confidence band.
    const { breakdown } = calculateMatchScore({
      guest: { ...baseGuest, fullName: 'రాజేష్ శర్మ' },
      criminal: { ...baseCriminal, fullName: 'అశోక్ కుమార్' },
    });
    expect(breakdown.name).toBeLessThan(0.70);
  });

  it('cross-script same-name MATCHES (Telugu guest ↔ English criminal record)', () => {
    // The core real-world scenario: a hotel clerk enters the guest name in
    // Telugu while the criminal profile holds the English spelling. The name
    // layer must resolve ≥ 0.85 so combined with any other hard identifier
    // the pair lands in the high-priority alert band.
    const { breakdown, score } = calculateMatchScore({
      guest: { ...baseGuest, fullName: 'రాజేష్ కుమార్', aadhaarHash: 'shared' },
      criminal: { ...baseCriminal, fullName: 'Rajesh Kumar', aadhaarHash: 'shared' },
    });
    expect(breakdown.name).toBeGreaterThanOrEqual(0.85);
    expect(score).toBeGreaterThanOrEqual(0.95); // Aadhaar override
  });

  it('cross-script different-name does NOT alert (Telugu Ashok vs English Rajesh)', () => {
    // Ensures the safety net holds: two truly different names in different
    // scripts must not cross the 0.40 alert threshold when no hard ID matches.
    const { score } = calculateMatchScore({
      guest: { ...baseGuest, fullName: 'అశోక్ కుమార్', age: 40 },
      criminal: { ...baseCriminal, fullName: 'Rajesh Sharma', approximateAge: 38 },
    });
    expect(score).toBeLessThan(0.40);
  });

  it('same-first-name-different-last-name stays below alert threshold without hard IDs', () => {
    const { score } = calculateMatchScore({
      guest: { ...baseGuest, fullName: 'Rajesh Kumar' },
      criminal: { ...baseCriminal, fullName: 'Rajesh Sharma' },
    });
    // Jaro-Winkler prefix bonus pushes the name layer up, but without
    // Aadhaar/phone/passport the composite stays below 0.40.
    expect(score).toBeLessThan(0.40);
  });
});

describe('calculateMatchScore — realistic true-positive scenarios', () => {
  it('typo in name + identical Aadhaar + matching phone → HIGH (≥ 0.70)', () => {
    const { score } = calculateMatchScore({
      guest: {
        fullName: 'Vikrma Gangster', // typo
        aadhaarHash: 'sha256-aad',
        phoneNumber: '9988776655',
        age: 35,
        guestType: 'INDIAN',
        passportNumber: null,
      },
      criminal: {
        fullName: 'Vikram Gangster',
        aadhaarHash: 'sha256-aad',
        phones: ['9988776655'],
        approximateAge: 36,
        passportNumber: null,
      },
    });
    expect(score).toBeGreaterThanOrEqual(0.70);
  });

  it('alias match alone scores high-name tier', () => {
    const { breakdown } = calculateMatchScore({
      guest: { ...baseGuest, fullName: 'Bunty' },
      criminal: {
        fullName: 'Vikram Gangster',
        aadhaarHash: null,
        phones: [],
        approximateAge: null,
        passportNumber: null,
        aliases: ['Bunty', 'VG'],
      } as Criminal,
    });
    expect(breakdown.name).toBe(1.0);
  });

  it('round-number precision — score is rounded to 2 decimals', () => {
    const { score } = calculateMatchScore({
      guest: { ...baseGuest, fullName: 'Vikram Gangster' },
      criminal: { ...baseCriminal, fullName: 'Vikram Gangster' },
    });
    expect(Number.isFinite(score)).toBe(true);
    expect(Math.round(score * 100)).toBe(score * 100); // 2-decimal rounding
  });
});
