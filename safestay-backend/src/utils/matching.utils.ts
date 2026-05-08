/**
 * V4 Fuzzy Matching Utilities — script-agnostic.
 *
 * Pipeline:
 *   1. Detect the writing system of each input (Latin / Devanagari / Telugu /
 *      Tamil / Kannada / Malayalam / Bengali / Gurmukhi / Gujarati / Oriya).
 *   2. Transliterate Indic-script inputs to a common Latin (ITRANS) form,
 *      strip diacritics and the Devanagari trailing-"a" schwa.
 *   3. Run the fuzzy pipeline on the Latin canonical form:
 *        - normalised exact match        → 1.00
 *        - token-sort equality           → 0.98  (Indian first/last swap)
 *        - Double Metaphone phonetic     → floor at 0.86
 *        - token-sort Jaro-Winkler       → direct score
 *        - raw Jaro-Winkler              → direct score
 *
 * This means a hotel clerk can enter the guest name in Telugu while the
 * criminal profile holds the English spelling (or vice versa) and the engine
 * still produces a correct match. Different names in the same script stay
 * distinct because distinct source characters transliterate to distinct
 * Latin letters.
 *
 * SECURITY: Only names and aliases are processed here. Aadhaar / PAN still
 * use hash comparison in matchScore.ts — this util never touches PII.
 */

/* eslint-disable @typescript-eslint/no-require-imports */

interface DoubleMetaphoneInstance {
  process: (s: string) => [string, string];
  compare: (a: string, b: string) => boolean;
}
interface NaturalLib {
  JaroWinklerDistance: (a: string, b: string) => number;
  DamerauLevenshteinDistance: (a: string, b: string) => number;
  DoubleMetaphone: new () => DoubleMetaphoneInstance;
}
interface SanscriptLib {
  t: (text: string, from: string, to: string) => string;
}

let naturalLib: NaturalLib | null = null;
let doubleMetaphone: DoubleMetaphoneInstance | null = null;
let sanscriptLib: SanscriptLib | null = null;
let librariesAttempted = false;

function ensureLibraries() {
  if (librariesAttempted) return;
  librariesAttempted = true;
  try {
    naturalLib = require('natural') as NaturalLib;
    doubleMetaphone = new naturalLib.DoubleMetaphone();
  } catch {
    naturalLib = null;
  }
  try {
    sanscriptLib = require('@indic-transliteration/sanscript') as SanscriptLib;
  } catch {
    sanscriptLib = null;
  }
}

// ─── Script detection ──────────────────────────────────────────────────────

type Script =
  | 'Latin'
  | 'Devanagari'
  | 'Telugu'
  | 'Tamil'
  | 'Kannada'
  | 'Malayalam'
  | 'Bengali'
  | 'Gurmukhi'
  | 'Gujarati'
  | 'Oriya'
  | 'Arabic';

const SCRIPT_RANGES: Array<[RegExp, Script, string]> = [
  [/[\u0900-\u097F]/, 'Devanagari', 'devanagari'],
  [/[\u0980-\u09FF]/, 'Bengali', 'bengali'],
  [/[\u0A00-\u0A7F]/, 'Gurmukhi', 'gurmukhi'],
  [/[\u0A80-\u0AFF]/, 'Gujarati', 'gujarati'],
  [/[\u0B00-\u0B7F]/, 'Oriya', 'oriya'],
  [/[\u0B80-\u0BFF]/, 'Tamil', 'tamil'],
  [/[\u0C00-\u0C7F]/, 'Telugu', 'telugu'],
  [/[\u0C80-\u0CFF]/, 'Kannada', 'kannada'],
  [/[\u0D00-\u0D7F]/, 'Malayalam', 'malayalam'],
  [/[\u0600-\u06FF]/, 'Arabic', 'arabic'], // not handled by Sanscript
];

function detectScript(s: string): { script: Script; sanscriptScheme: string | null } {
  for (const [re, script, scheme] of SCRIPT_RANGES) {
    if (re.test(s)) return { script, sanscriptScheme: script === 'Arabic' ? null : scheme };
  }
  return { script: 'Latin', sanscriptScheme: null };
}

// ─── Canonicalization to Latin ─────────────────────────────────────────────

/** Strip combining diacritics (macrons, acutes, etc.) produced by transliteration. */
function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036F]/g, '');
}

/**
 * Devanagari transliteration inserts a trailing "a" for every consonant that
 * is not followed by a halant — "रामकुमार" → "rAmakumAra". This "schwa"
 * rarely appears in real English spellings of Hindi names. Remove it from
 * every token so "rajesha" ≡ "rajesh" and "vikrama" ≡ "vikram".
 */
function stripSchwa(s: string): string {
  return s
    .split(/\s+/)
    .map((tok) => tok.replace(/a$/, ''))
    .join(' ')
    .trim();
}

/**
 * Convert any supported script to a canonical Latin representation:
 *   - Lowercase
 *   - Transliterate Indic scripts via Sanscript to ITRANS Latin
 *   - Strip diacritics
 *   - Strip the Devanagari schwa (trailing "a" artifacts)
 *   - Replace punctuation with a space (so "Rajesh.Kumar" tokenises correctly)
 *   - Drop any remaining non-Latin characters (including Arabic, which we
 *     currently have no transliteration table for — those pairs fall through
 *     to exact/Jaro-Winkler and will only match if byte-identical).
 */
function canonicalize(input: string): string {
  ensureLibraries();
  const { sanscriptScheme } = detectScript(input);

  let s = input;
  if (sanscriptScheme && sanscriptLib) {
    try {
      s = sanscriptLib.t(input, sanscriptScheme, 'itrans');
    } catch {
      // fall back to raw input
    }
  }

  s = stripDiacritics(s).toLowerCase();

  // Replace non-[letter/digit/space] with a space so punctuation acts as a
  // token separator. Keep \p{L} (any unicode letter) so unsupported scripts
  // still contribute something, rather than collapsing to empty string.
  s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

  // Schwa-trim is only valid for Devanagari-origin text
  if (sanscriptScheme === 'devanagari') {
    s = stripSchwa(s);
  }

  return s;
}

// ─── Primitive similarity helpers ──────────────────────────────────────────

function tokenSort(name: string): string {
  return name.split(' ').filter(Boolean).sort().join(' ');
}

function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1.0;
  if (!a.length || !b.length) return 0.0;
  ensureLibraries();
  if (naturalLib) return naturalLib.JaroWinklerDistance(a, b);

  // Inline Jaro-Winkler used only when `natural` isn't available.
  const m = a.length;
  const n = b.length;
  const matchDistance = Math.max(Math.floor(Math.max(m, n) / 2) - 1, 0);
  const aMatches = new Array<boolean>(m).fill(false);
  const bMatches = new Array<boolean>(n).fill(false);
  let matches = 0;
  for (let i = 0; i < m; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, n);
    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < m; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  transpositions /= 2;
  const jaro = (matches / m + matches / n + (matches - transpositions) / matches) / 3;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, m, n); i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

function metaphoneMatch(a: string, b: string): boolean {
  ensureLibraries();
  if (!doubleMetaphone) return false;
  try {
    return doubleMetaphone.compare(a, b);
  } catch {
    return false;
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Compute fuzzy similarity score (0..1) between two name strings, regardless
 * of script. Cross-script pairs (e.g. "రాజేష్ కుమార్" vs "Rajesh Kumar") are
 * transliterated to a common Latin form before comparison.
 */
export function fuzzyNameScore(nameA: string, nameB: string): number {
  const a = canonicalize(nameA);
  const b = canonicalize(nameB);

  if (!a || !b) return 0;
  if (a === b) return 1.0;

  // Length-aware guard — avoid inflating scores on tiny inputs like "Li"↔"Liu"
  if (a.length <= 3 || b.length <= 3) return 0;

  const aSorted = tokenSort(a);
  const bSorted = tokenSort(b);
  if (aSorted === bSorted) return 0.98;

  // Double Metaphone only works on Latin-letter strings. After canonicalize()
  // everything that Sanscript handled is already ASCII — the guard is really
  // for Arabic or any other unsupported script that passed through raw.
  const isLatin = /^[a-z\s]+$/.test(a) && /^[a-z\s]+$/.test(b);
  const phonetic =
    isLatin && metaphoneMatch(a.replace(/\s+/g, ''), b.replace(/\s+/g, '')) ? 0.86 : 0;
  const jwRaw = jaroWinkler(a, b);
  const jwSorted = jaroWinkler(aSorted, bSorted);
  const best = Math.max(phonetic, jwRaw, jwSorted);

  // For anything still non-Latin after canonicalize() (i.e. an unsupported
  // script we couldn't transliterate), require a high Jaro-Winkler before we
  // treat it as a match — protects against Unicode-adjacency false positives.
  if (!isLatin && best < 0.85) return 0;

  return best;
}

/**
 * Score a guest name against a criminal's full name AND all known aliases.
 * Returns the highest similarity found.
 */
export function fuzzyNameScoreWithAliases(
  guestName: string,
  criminalName: string,
  aliases: string[]
): number {
  let best = fuzzyNameScore(guestName, criminalName);
  for (const alias of aliases) {
    if (!alias) continue;
    const s = fuzzyNameScore(guestName, alias);
    if (s > best) best = s;
    if (best === 1.0) break;
  }
  return best;
}
