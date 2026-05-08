/**
 * Register Scan Service — Claude Vision API (claude-sonnet-4-6)
 *
 * Sends a photo of a hotel physical register page to Anthropic Claude,
 * which extracts all guest entries into structured JSON.
 *
 * Called by: guest.controller.ts → POST /guests/scan-register
 */

import * as fs from 'fs';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export interface ScannedGuest {
  fullName: string | null;
  age: number | null;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
  phoneNumber: string | null;
  roomNumber: string | null;
  checkInDate: string | null;         // YYYY-MM-DD
  expectedCheckout: string | null;    // YYYY-MM-DD
  address: string | null;
  aadhaarNumber: string | null;       // 12 digits
  passportNumber: string | null;
  guestType: 'DOMESTIC' | 'INTERNATIONAL';
}

const CLAUDE_MODEL = 'claude-sonnet-4-6';
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

const EXTRACTION_PROMPT = `You are scanning a hotel physical register / guest ledger page image.
Your job is to extract ALL guest entries that are visible in the image.

For each guest, return a JSON object with EXACTLY these fields:
{
  "fullName": string or null,         // Full name of guest — REQUIRED
  "age": number or null,              // Age in years as integer — REQUIRED
  "gender": "MALE"|"FEMALE"|"OTHER"|null,  // M/Male→MALE, F/Female→FEMALE — REQUIRED
  "phoneNumber": string or null,      // Phone digits only, no spaces — REQUIRED
  "roomNumber": string or null,       // Room or cabin number — REQUIRED
  "checkInDate": string or null,      // Check-in date → YYYY-MM-DD format — REQUIRED
  "expectedCheckout": string or null, // Checkout date → YYYY-MM-DD, null if absent
  "address": string or null,          // Residential address, null if absent
  "aadhaarNumber": string or null,    // 12 digits only, no spaces, null if absent
  "passportNumber": string or null,   // Passport number, null if absent
  "guestType": "DOMESTIC"|"INTERNATIONAL"  // INTERNATIONAL only if passport present or foreign nationality
}

Rules:
1. Return ONLY a valid JSON array — no markdown, no code blocks, no explanation whatsoever.
2. If no readable entries exist, return exactly: []
3. Date parsing: DD/MM/YYYY or DD-MM-YYYY → convert to YYYY-MM-DD
4. Strip all spaces and dashes from phoneNumber and aadhaarNumber
5. If a field is illegible or missing, set it to null
6. Each row in the register = one guest object in the array
7. Do not invent or guess data — only extract what is clearly visible`;

export async function scanRegisterImage(imagePath: string): Promise<ScannedGuest[]> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured on server');
  }

  if (!fs.existsSync(imagePath)) {
    throw new Error('Uploaded image file not found');
  }

  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const mimeType = detectMimeType(imageBuffer) as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

  const requestBody = {
    model: CLAUDE_MODEL,
    max_tokens: 8192,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType,
              data: base64Image,
            },
          },
          {
            type: 'text',
            text: EXTRACTION_PROMPT,
          },
        ],
      },
    ],
  };

  let response: Response;
  try {
    response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('[RegisterScan] Network error calling Claude API', { error: msg });
    throw new Error('Could not reach Claude API. Check internet connection.');
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    logger.error('[RegisterScan] Claude API error', { status: response.status, body: errText.slice(0, 300) });
    throw new Error(`Claude API returned ${response.status}. ${errText.slice(0, 120)}`);
  }

  const result = await response.json() as any;

  // Claude response: result.content[0].text
  const rawText: string = result?.content?.[0]?.text ?? '';

  if (!rawText.trim()) {
    logger.warn('[RegisterScan] Empty response from Claude');
    return [];
  }

  logger.info('[RegisterScan] Claude responded', { chars: rawText.length });

  // Strip markdown code fences if model included them
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let guests: ScannedGuest[];
  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) {
      throw new Error('Response is not an array');
    }
    guests = parsed;
  } catch (err) {
    logger.warn('[RegisterScan] Failed to parse Claude JSON', { raw: rawText.slice(0, 400) });
    throw new Error('AI returned unreadable data. Try a clearer, well-lit photo of the register.');
  }

  return guests.map(normaliseGuest);
}

function normaliseGuest(raw: any): ScannedGuest {
  const genderMap: Record<string, ScannedGuest['gender']> = {
    male: 'MALE', m: 'MALE', female: 'FEMALE', f: 'FEMALE',
    other: 'OTHER', o: 'OTHER', non_binary: 'OTHER',
  };

  const genderRaw = String(raw.gender ?? '').toLowerCase().trim();
  const gender = genderMap[genderRaw] ?? (
    ['MALE', 'FEMALE', 'OTHER'].includes(String(raw.gender).toUpperCase())
      ? (String(raw.gender).toUpperCase() as ScannedGuest['gender'])
      : null
  );

  const aadhaar = raw.aadhaarNumber
    ? String(raw.aadhaarNumber).replace(/\D/g, '').slice(0, 12)
    : null;

  const phone = raw.phoneNumber
    ? String(raw.phoneNumber).replace(/\D/g, '').slice(0, 15)
    : null;

  const age = raw.age != null ? parseInt(String(raw.age), 10) : null;

  return {
    fullName: raw.fullName ? String(raw.fullName).trim() : null,
    age: age != null && !isNaN(age) ? age : null,
    gender,
    phoneNumber: phone || null,
    roomNumber: raw.roomNumber ? String(raw.roomNumber).trim() : null,
    checkInDate: raw.checkInDate ? String(raw.checkInDate).trim() : null,
    expectedCheckout: raw.expectedCheckout ? String(raw.expectedCheckout).trim() : null,
    address: raw.address ? String(raw.address).trim() : null,
    aadhaarNumber: aadhaar && aadhaar.length === 12 ? aadhaar : null,
    passportNumber: raw.passportNumber ? String(raw.passportNumber).trim() : null,
    guestType: raw.guestType === 'INTERNATIONAL' ? 'INTERNATIONAL' : 'DOMESTIC',
  };
}

function detectMimeType(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0x52 && buf[1] === 0x49) return 'image/webp';
  return 'image/jpeg';
}
