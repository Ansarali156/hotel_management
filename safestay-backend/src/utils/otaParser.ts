/**
 * OTA Booking Text Parser — V2 Phase 3
 *
 * Extracts guest name, check-in date, check-out date, and room type from
 * booking confirmation texts pasted by hotel staff.
 *
 * Supported platforms: OYO Rooms, MakeMyTrip, Airbnb, Booking.com, Generic
 * Pure regex + NLP — no external API required.
 *
 * STEALTH: No police-related data is ever processed here. Hotel-facing only.
 */

export interface OtaParseResult {
  guestName: string | null;
  checkInDate: string | null; // YYYY-MM-DD
  checkOutDate: string | null; // YYYY-MM-DD
  roomType: string | null;
  platform: string;
  confidence: number; // 0..1
}

// ── Platform detection markers ────────────────────────────────────────────────

function detectPlatform(text: string): string {
  const lower = text.toLowerCase();
  if (/oyo\s*(booking|rooms|id)/i.test(text) || /oyorooms\.com/i.test(text)) return 'OYO';
  if (/mmt\s*booking|makemytrip|mmtbooking/i.test(text)) return 'MakeMyTrip';
  if (/airbnb\s*reservation|airbnb\.com/i.test(text)) return 'Airbnb';
  if (/booking\.com|booking reference/i.test(text)) return 'Booking.com';
  if (lower.includes('goibibo') || lower.includes('go-ibibo')) return 'Goibibo';
  if (lower.includes('yatra')) return 'Yatra';
  return 'Generic';
}

// ── Name extraction ───────────────────────────────────────────────────────────

const NAME_PATTERNS: RegExp[] = [
  /Guest\s*Name\s*[:\-]\s*([A-Za-z][\w\s\-\.]{2,60})/i,
  /Travell?er\s*[:\-]\s*([A-Za-z][\w\s\-\.]{2,60})/i,
  /Booker\s*(?:Name|name)\s*[:\-]\s*([A-Za-z][\w\s\-\.]{2,60})/i,
  /Guest\s*[:\-]\s*([A-Za-z][\w\s\-\.]{2,60})/i,
  /Name\s*[:\-]\s*([A-Za-z][\w\s\-\.]{2,60})/i,
  /Dear\s+([A-Za-z][\w\s\-\.]{2,40}),/i,
];

function extractName(text: string): string | null {
  for (const pattern of NAME_PATTERNS) {
    const m = text.match(pattern);
    if (m) {
      const name = m[1].trim().replace(/\s+/g, ' ');
      // Sanity check: 2-5 words, no numbers, 3-60 chars
      if (name.length >= 3 && name.length <= 60 && !/\d/.test(name)) {
        return name;
      }
    }
  }
  return null;
}

// ── Date extraction ───────────────────────────────────────────────────────────

const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  january: '01', february: '02', march: '03', april: '04', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

function parseFlexibleDate(raw: string): string | null {
  raw = raw.trim();

  // DD/MM/YYYY or DD-MM-YYYY
  let m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;

  // YYYY-MM-DD
  m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return raw;

  // DD MMM YYYY  (15 Apr 2026)
  m = raw.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    const mon = MONTH_MAP[m[2].toLowerCase()];
    if (mon) return `${m[3]}-${mon}-${m[1].padStart(2, '0')}`;
  }

  // MMM DD, YYYY  (April 15, 2026)
  m = raw.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const mon = MONTH_MAP[m[1].toLowerCase()];
    if (mon) return `${m[3]}-${mon}-${m[2].padStart(2, '0')}`;
  }

  return null;
}

// Date pattern: label + date value
const DATE_PATTERNS: { label: RegExp; capture: RegExp }[] = [
  { label: /check[-\s]?in/i, capture: /check[-\s]?in\s*[:\-]?\s*([A-Za-z0-9\/\-\s,]+?)(?:\n|check[-\s]?out|$)/i },
  { label: /arrival/i, capture: /arrival\s*[:\-]?\s*([A-Za-z0-9\/\-\s,]+?)(?:\n|departure|$)/i },
  { label: /from/i, capture: /from\s*[:\-]?\s*([A-Za-z0-9\/\-\s,]+?)(?:\s*to\s|\n|$)/i },
];

const CHECKOUT_PATTERNS: { label: RegExp; capture: RegExp }[] = [
  { label: /check[-\s]?out/i, capture: /check[-\s]?out\s*[:\-]?\s*([A-Za-z0-9\/\-\s,]+?)(?:\n|$)/i },
  { label: /departure/i, capture: /departure\s*[:\-]?\s*([A-Za-z0-9\/\-\s,]+?)(?:\n|$)/i },
  { label: /to/i, capture: /\bto\s*[:\-]?\s*([A-Za-z0-9\/\-\s,]+?)(?:\n|$)/i },
];

function extractDate(text: string, patterns: typeof DATE_PATTERNS): string | null {
  for (const { capture } of patterns) {
    const m = text.match(capture);
    if (m) {
      const candidate = m[1].trim().replace(/\s+/g, ' ');
      const parsed = parseFlexibleDate(candidate);
      if (parsed) return parsed;
    }
  }
  return null;
}

// ── Room type extraction ──────────────────────────────────────────────────────

const ROOM_TYPE_PATTERN =
  /(?:room\s*type|room|accommodation)\s*[:\-]?\s*([\w\s\-]{3,40}?)(?:\n|,|\.|$)/i;

function extractRoomType(text: string): string | null {
  const m = text.match(ROOM_TYPE_PATTERN);
  if (m) {
    return m[1].trim();
  }
  return null;
}

// ── Validation ────────────────────────────────────────────────────────────────

function isDateValid(dateStr: string): boolean {
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Parse an OTA booking confirmation text and extract guest details.
 * Returns null fields for anything that could not be extracted.
 */
export function parseOtaBookingText(rawText: string): OtaParseResult {
  const text = rawText.trim();
  const platform = detectPlatform(text);

  const guestName = extractName(text);
  const checkInDate = extractDate(text, DATE_PATTERNS);
  const checkOutDate = extractDate(text, CHECKOUT_PATTERNS);
  const roomType = extractRoomType(text);

  // Validate dates
  const validCheckIn = checkInDate && isDateValid(checkInDate) ? checkInDate : null;
  const validCheckOut =
    checkOutDate && isDateValid(checkOutDate) && checkOutDate > (validCheckIn ?? '')
      ? checkOutDate
      : null;

  // Confidence = fraction of required fields found
  const required = [guestName, validCheckIn, validCheckOut];
  const found = required.filter(Boolean).length;
  const confidence = found / required.length;

  return {
    guestName,
    checkInDate: validCheckIn,
    checkOutDate: validCheckOut,
    roomType,
    platform,
    confidence,
  };
}
