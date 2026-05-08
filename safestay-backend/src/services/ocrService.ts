/**
 * Aadhaar OCR Service — Claude Vision API (claude-sonnet-4-6)
 *
 * Extracts name, DOB, and 12-digit Aadhaar number from an uploaded Aadhaar
 * card image using Anthropic Claude Vision API.
 *
 * SECURITY / PRIVACY:
 * - Returned aadhaarNumber is the raw plaintext — caller must encrypt before storage
 * - This service never stores the extracted data — caller owns the lifecycle
 * - If confidence < 0.85, the field is returned as null (staff types manually)
 * - Logging of the raw OCR output is suppressed to avoid Aadhaar numbers in logs
 */

import * as fs from 'fs';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export interface OcrExtractResult {
  fullName: string | null;
  dateOfBirth: string | null; // YYYY-MM-DD
  aadhaarNumber: string | null; // 12-digit plaintext — MUST be encrypted before storage
  confidence: number; // 0..1 — overall extraction confidence
  rawText?: string; // Only returned in development/debug mode
}

const CLAUDE_MODEL = 'claude-sonnet-4-6';
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

const AADHAAR_PROMPT = `You are reading an Indian Aadhaar card image. Extract the following fields:

Return ONLY a valid JSON object with exactly these fields — no markdown, no explanation:
{
  "fullName": string or null,      // Full name printed on the card
  "dateOfBirth": string or null,   // Date of birth in YYYY-MM-DD format
  "aadhaarNumber": string or null  // 12-digit Aadhaar number, digits only (no spaces or dashes)
}

Rules:
1. Return ONLY the JSON object — nothing else.
2. If a field is not visible or illegible, set it to null.
3. Convert any date format (DD/MM/YYYY, DD-MM-YYYY) to YYYY-MM-DD.
4. Strip all spaces and dashes from the Aadhaar number — return exactly 12 digits.
5. Do not guess or invent data — only extract what is clearly visible.`;

/**
 * OCR via Claude Vision API.
 */
async function extractWithClaude(imagePath: string): Promise<OcrExtractResult> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const mimeType = detectMimeType(imageBuffer) as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

  const requestBody = {
    model: CLAUDE_MODEL,
    max_tokens: 512,
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
            text: AADHAAR_PROMPT,
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
    throw new Error(`Network error calling Claude API: ${msg}`);
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Claude API returned ${response.status}. ${errText.slice(0, 120)}`);
  }

  const result = await response.json() as any;
  const rawText: string = result?.content?.[0]?.text ?? '';

  if (!rawText.trim()) {
    throw new Error('Empty response from Claude');
  }

  // Strip markdown fences if present
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('Claude returned non-JSON response');
  }

  const aadhaarNumber = parsed.aadhaarNumber
    ? String(parsed.aadhaarNumber).replace(/\D/g, '').slice(0, 12)
    : null;
  const dateOfBirth = parsed.dateOfBirth ? String(parsed.dateOfBirth).trim() : null;
  const fullName = parsed.fullName ? String(parsed.fullName).trim() : null;

  const fieldsExtracted = [
    aadhaarNumber && aadhaarNumber.length === 12,
    dateOfBirth,
    fullName,
  ].filter(Boolean).length;
  const confidence = fieldsExtracted / 3;

  return {
    fullName: confidence >= 0.85 ? fullName : null,
    dateOfBirth: confidence >= 0.85 ? dateOfBirth : null,
    aadhaarNumber: aadhaarNumber && aadhaarNumber.length === 12 ? aadhaarNumber : null,
    confidence,
    rawText: env.NODE_ENV === 'development' ? rawText : undefined,
  };
}

function detectMimeType(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0x52 && buf[1] === 0x49) return 'image/webp';
  return 'image/jpeg';
}

/**
 * Main OCR entry point — uses Claude Vision.
 */
export async function extractAadhaarFromImage(imagePath: string): Promise<OcrExtractResult> {
  const failResult: OcrExtractResult = {
    fullName: null,
    dateOfBirth: null,
    aadhaarNumber: null,
    confidence: 0,
  };

  if (!fs.existsSync(imagePath)) {
    logger.warn('[OCRService] Image file not found', { imagePath });
    return failResult;
  }

  try {
    const result = await extractWithClaude(imagePath);
    logger.info('[OCRService] Claude extraction complete', {
      confidence: result.confidence,
      fieldsFound: {
        name: !!result.fullName,
        dob: !!result.dateOfBirth,
        aadhaar: !!result.aadhaarNumber,
      },
    });
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('[OCRService] Claude extraction failed — returning empty result', { error: msg });
    return failResult;
  }
}

/**
 * Age estimation using AWS Rekognition.
 * Returns { low, high } age range or null if unavailable.
 */
export interface AgeEstimate {
  low: number;
  high: number;
}

export async function estimateAgeFromPhoto(imagePath: string): Promise<AgeEstimate | null> {
  if (env.FRUGAL_MODE === 'true') {
    logger.debug('[OCRService] FRUGAL_MODE — skipping age estimation');
    return null;
  }

  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
    return null; // Not configured — neutral result
  }

  if (!fs.existsSync(imagePath)) {
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { RekognitionClient, DetectFacesCommand } = require('@aws-sdk/client-rekognition');
    const client = new RekognitionClient({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    });

    const imageBytes = fs.readFileSync(imagePath);
    const command = new DetectFacesCommand({
      Image: { Bytes: imageBytes },
      Attributes: ['ALL'],
    });

    const response = await client.send(command);
    const face = response.FaceDetails?.[0];
    if (!face?.AgeRange) return null;

    return {
      low: face.AgeRange.Low ?? 0,
      high: face.AgeRange.High ?? 0,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('[OCRService] Rekognition age estimation failed — using neutral score', {
      error: msg,
    });
    return null;
  }
}

/**
 * Calculate age-variance score from estimated age range vs. Aadhaar DOB.
 * Returns 0..1 where 0.95 = confident match, 0.20 = likely mismatch.
 */
export function calcAgeVarianceScore(
  estimate: AgeEstimate,
  dateOfBirth: Date
): number {
  const { differenceInYears } = { differenceInYears: (a: Date, b: Date) => Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24 * 365.25)) };
  const aadhaarAge = differenceInYears(new Date(), dateOfBirth);
  const estimateMid = (estimate.low + estimate.high) / 2;
  const variance = Math.abs(estimateMid - aadhaarAge);

  if (variance <= 5) return 0.95;
  if (variance <= 10) return 0.60;
  return 0.20;
}
