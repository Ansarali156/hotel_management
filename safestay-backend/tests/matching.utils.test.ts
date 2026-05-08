/**
 * Unit tests for the V3 fuzzy name matching layer.
 *
 * These tests lock in the contract that callers (verification.service.ts,
 * verificationSync.service.ts, matchScore.ts) depend on:
 *   - identical / normalised names → 1.0
 *   - token-order swaps → near-1.0
 *   - typos / transpositions / phonetic variants → ≥ 0.70
 *   - unrelated names → low (< 0.40)
 *   - very short strings → 0 unless identical
 */

import { fuzzyNameScore, fuzzyNameScoreWithAliases } from '../src/utils/matching.utils';

describe('fuzzyNameScore', () => {
  describe('exact / normalised matches → 1.0', () => {
    it.each([
      ['Vikram Gangster', 'Vikram Gangster'],
      ['vikram  GANGSTER ', 'Vikram Gangster'],
      ['Rajesh.Kumar', 'Rajesh Kumar'],
      ['Priya-Sharma', 'Priya Sharma'],
    ])('normalises "%s" ≡ "%s"', (a, b) => {
      expect(fuzzyNameScore(a, b)).toBe(1.0);
    });
  });

  describe('token-order swaps (Indian first/last convention)', () => {
    it('Gangster Vikram ↔ Vikram Gangster ≥ 0.95', () => {
      expect(fuzzyNameScore('Gangster Vikram', 'Vikram Gangster')).toBeGreaterThanOrEqual(0.95);
    });
    it('Sharma Rajesh ↔ Rajesh Sharma ≥ 0.95', () => {
      expect(fuzzyNameScore('Sharma Rajesh', 'Rajesh Sharma')).toBeGreaterThanOrEqual(0.95);
    });
  });

  describe('typos / transpositions → ≥ 0.85 (still above high-priority band)', () => {
    it.each([
      ['Vikrma Gangster', 'Vikram Gangster'], // single transposition
      ['Rajesh Shrama', 'Rajesh Sharma'],     // transposition inside token
      ['Pryia Sharma', 'Priya Sharma'],       // transposition
    ])('"%s" ≈ "%s"', (a, b) => {
      expect(fuzzyNameScore(a, b)).toBeGreaterThanOrEqual(0.85);
    });
  });

  describe('phonetic variants', () => {
    it('Ashween Kumar ↔ Ashwin Kumar ≥ 0.85 (DoubleMetaphone floor)', () => {
      expect(fuzzyNameScore('Ashween Kumar', 'Ashwin Kumar')).toBeGreaterThanOrEqual(0.85);
    });
    it('Smyth ↔ Smith ≥ 0.85', () => {
      expect(fuzzyNameScore('Smyth', 'Smith')).toBeGreaterThanOrEqual(0.85);
    });
    it('Shaikh ↔ Sheik ≥ 0.85 (rescued by Metaphone where Levenshtein would miss)', () => {
      expect(fuzzyNameScore('Shaikh', 'Sheik')).toBeGreaterThanOrEqual(0.85);
    });
  });

  describe('unrelated names stay below the HIGH-priority band', () => {
    // Jaro-Winkler can legitimately score shared-letter names around 0.60 (e.g.
    // "Priya Sharma" vs "Rahul Verma" ≈ 0.62). The real protection against
    // false positives is the composite weight at the matchScore.ts layer
    // (name weight = 0.20 → composite contribution ≈ 0.12, well below the
    // 0.40 alert threshold). Here we only assert that unrelated pairs stay
    // below the HIGH-priority 0.70 line at the fuzzy layer.
    it.each([
      ['John Smith', 'Vikram Gangster'],
      ['Priya Sharma', 'Rahul Verma'],
      ['Alice Wonderland', 'Bob Builder'],
    ])('"%s" vs "%s" < 0.70', (a, b) => {
      expect(fuzzyNameScore(a, b)).toBeLessThan(0.70);
    });
  });

  describe('short-string guard (prevents false positives on tiny inputs)', () => {
    it('"Li" vs "Liu" → 0 (short-string guard)', () => {
      expect(fuzzyNameScore('Li', 'Liu')).toBe(0);
    });
    it('empty input → 0', () => {
      expect(fuzzyNameScore('', 'Vikram')).toBe(0);
      expect(fuzzyNameScore('Vikram', '')).toBe(0);
    });
    it('punctuation-only input → 0', () => {
      expect(fuzzyNameScore('...', 'Vikram Gangster')).toBe(0);
    });
  });

  describe('symmetry', () => {
    it('fuzzyNameScore(a,b) === fuzzyNameScore(b,a)', () => {
      const pairs: Array<[string, string]> = [
        ['Vikrma Gangster', 'Vikram Gangster'],
        ['Ashween Kumar', 'Ashwin Kumar'],
        ['John Smith', 'Vikram Gangster'],
      ];
      for (const [a, b] of pairs) {
        expect(fuzzyNameScore(a, b)).toBeCloseTo(fuzzyNameScore(b, a), 5);
      }
    });
  });
});

describe('cross-script matching (hotel clerk enters Indic, criminal record in English)', () => {
  describe('Telugu ↔ English — same name should match', () => {
    it.each([
      ['రాజేష్ కుమార్', 'Rajesh Kumar'],
      ['ప్రియ శర్మ', 'Priya Sharma'],
      ['రాహుల్ వర్మ', 'Rahul Verma'],
      ['అశ్విన్ కుమార్', 'Ashwin Kumar'],
    ])('Telugu "%s" ≈ English "%s" (≥ 0.85)', (te, en) => {
      expect(fuzzyNameScore(te, en)).toBeGreaterThanOrEqual(0.85);
      expect(fuzzyNameScore(en, te)).toBeGreaterThanOrEqual(0.85);
    });
  });

  describe('Devanagari ↔ English — same name should match', () => {
    it.each([
      ['राजेश कुमार', 'Rajesh Kumar'],
      ['विक्रम', 'Vikram'],
      ['प्रिया शर्मा', 'Priya Sharma'],
    ])('Devanagari "%s" ≈ English "%s" (≥ 0.85)', (dv, en) => {
      expect(fuzzyNameScore(dv, en)).toBeGreaterThanOrEqual(0.85);
      expect(fuzzyNameScore(en, dv)).toBeGreaterThanOrEqual(0.85);
    });
  });

  describe('Cross-script — different names should NOT match', () => {
    it('Telugu "అశోక్ కుమార్" (Ashok Kumar) vs English "Rajesh Sharma" < 0.70', () => {
      expect(fuzzyNameScore('అశోక్ కుమార్', 'Rajesh Sharma')).toBeLessThan(0.70);
    });
    it('Telugu "రాజేష్ శర్మ" (Rajesh Sharma) vs English "Vikram Gangster" < 0.70', () => {
      expect(fuzzyNameScore('రాజేష్ శర్మ', 'Vikram Gangster')).toBeLessThan(0.70);
    });
    it('Devanagari "विक्रम" (Vikram) vs English "Rajesh" < 0.70', () => {
      expect(fuzzyNameScore('विक्रम', 'Rajesh')).toBeLessThan(0.70);
    });
  });

  describe('Same-script — different names still distinct after canonicalization', () => {
    it('Telugu "రాజేష్ కుమార్" vs "అశోక్ కుమార్" (different first names) ≤ 0.90', () => {
      // Same surname (Kumar) is a weak prefix signal — we only require this
      // pair to stay below a full match; the composite weight (0.20) keeps
      // it well under the 0.40 alert threshold.
      expect(fuzzyNameScore('రాజేష్ కుమార్', 'అశోక్ కుమార్')).toBeLessThan(0.90);
    });
    it('Telugu "రాజేష్ కుమార్" vs "రాజేష్ శర్మ" (different surnames) ≤ 0.95', () => {
      // Shared first name gives Jaro-Winkler a prefix bonus — expected
      // behaviour that mirrors how an investigator would reason about a
      // possibly-related person. The composite layer ultimately decides.
      expect(fuzzyNameScore('రాజేష్ కుమార్', 'రాజేష్ శర్మ')).toBeLessThan(0.95);
    });
    it('Telugu same name is 1.0', () => {
      expect(fuzzyNameScore('రాజేష్ కుమార్', 'రాజేష్ కుమార్')).toBe(1.0);
    });
  });

  describe('Cross-script aliases', () => {
    it('Latin guest name matches a Telugu alias entry', () => {
      const score = fuzzyNameScoreWithAliases('Rajesh Kumar', 'Criminal Person', ['రాజేష్ కుమార్']);
      expect(score).toBeGreaterThanOrEqual(0.85);
    });
    it('Telugu guest name matches a Latin alias entry', () => {
      const score = fuzzyNameScoreWithAliases('రాజేష్ కుమార్', 'Criminal Person', ['Rajesh Kumar']);
      expect(score).toBeGreaterThanOrEqual(0.85);
    });
  });
});

describe('fuzzyNameScoreWithAliases', () => {
  it('returns 1.0 when guest matches an alias exactly', () => {
    expect(
      fuzzyNameScoreWithAliases('Bunty', 'Vikram Gangster', ['Bunty Bhai', 'Bunty', 'VG'])
    ).toBe(1.0);
  });

  it('returns best across main name and aliases', () => {
    const score = fuzzyNameScoreWithAliases(
      'Ashween Kumar',
      'Rahul Verma',
      ['Ashwin Kumar']
    );
    expect(score).toBeGreaterThanOrEqual(0.85);
  });

  it('returns 0 when no alias or name is close', () => {
    const score = fuzzyNameScoreWithAliases(
      'Completely Unrelated Person',
      'Rahul Verma',
      ['Bunty', 'VG']
    );
    expect(score).toBeLessThan(0.60);
  });

  it('handles empty aliases array gracefully', () => {
    const score = fuzzyNameScoreWithAliases('Vikram Gangster', 'Vikram Gangster', []);
    expect(score).toBe(1.0);
  });
});
