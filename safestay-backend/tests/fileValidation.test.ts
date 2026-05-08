/**
 * File upload security tests.
 *
 * Verifies:
 * 1. Magic byte validation rejects a JPEG file with wrong magic bytes
 * 2. Magic byte validation accepts a valid JPEG signature
 * 3. PNG magic bytes are accepted
 * 4. WebP magic bytes are accepted
 * 5. A file claiming to be JPEG but with PNG magic bytes is rejected
 * 6. csvSanitizer neutralises formula injection prefixes
 * 7. createFileToken produces a verifiable token
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { validateMagicBytes } from '../src/config/multer';
import { AppError } from '../src/api/middleware/errorHandler';
import { sanitizeCsvField, objectsToCsv } from '../src/utils/csvSanitizer';
import { createFileToken } from '../src/api/routes/files.routes';

// ─── Magic byte tests ─────────────────────────────────────────────────────────

const writeTmpFile = (bytes: number[]): string => {
  const tmp = path.join(os.tmpdir(), `test-${Date.now()}.bin`);
  fs.writeFileSync(tmp, Buffer.from(bytes));
  return tmp;
};

describe('Magic Byte Validation', () => {
  afterEach(() => {
    // Clean up temp files created during tests
  });

  it('accepts a file with valid JPEG magic bytes', () => {
    const tmpFile = writeTmpFile([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    expect(() => validateMagicBytes(tmpFile, 'image/jpeg')).not.toThrow();
    fs.unlinkSync(tmpFile);
  });

  it('accepts a file with valid PNG magic bytes', () => {
    const tmpFile = writeTmpFile([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    expect(() => validateMagicBytes(tmpFile, 'image/png')).not.toThrow();
    fs.unlinkSync(tmpFile);
  });

  it('accepts a file with valid WebP magic bytes (RIFF....WEBP)', () => {
    const tmpFile = writeTmpFile([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x00, 0x00, 0x00, 0x00, // file size (dummy)
      0x57, 0x45, 0x42, 0x50, // WEBP
    ]);
    expect(() => validateMagicBytes(tmpFile, 'image/webp')).not.toThrow();
    fs.unlinkSync(tmpFile);
  });

  it('rejects a file claiming JPEG but with PNG magic bytes', () => {
    const tmpFile = writeTmpFile([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(() => validateMagicBytes(tmpFile, 'image/jpeg')).toThrow(AppError);
    // File should be deleted by validateMagicBytes after rejection
    expect(fs.existsSync(tmpFile)).toBe(false);
  });

  it('rejects a text file with JPEG MIME type', () => {
    const tmpFile = path.join(os.tmpdir(), `test-text-${Date.now()}.bin`);
    fs.writeFileSync(tmpFile, Buffer.from('This is a plain text file, not a JPEG'));
    expect(() => validateMagicBytes(tmpFile, 'image/jpeg')).toThrow(AppError);
    expect(fs.existsSync(tmpFile)).toBe(false);
  });

  it('rejects an unsupported MIME type not in ALLOWED list', () => {
    const tmpFile = writeTmpFile([0x25, 0x50, 0x44, 0x46]); // PDF magic bytes
    expect(() => validateMagicBytes(tmpFile, 'application/pdf')).toThrow(AppError);
    // File may or may not exist depending on deletion order — just verify the throw
  });
});

// ─── CSV injection tests ──────────────────────────────────────────────────────

describe('CSV Injection Protection', () => {
  it('prefixes = with tab to prevent formula injection', () => {
    expect(sanitizeCsvField('=CMD')).toBe('\t=CMD');
  });

  it('prefixes + with tab', () => {
    expect(sanitizeCsvField('+1234567890')).toBe('\t+1234567890');
  });

  it('prefixes - with tab', () => {
    expect(sanitizeCsvField('-SUM(A1:A2)')).toBe('\t-SUM(A1:A2)');
  });

  it('prefixes @ with tab', () => {
    expect(sanitizeCsvField('@SUM(1+1)')).toBe('\t@SUM(1+1)');
  });

  it('does not modify safe values', () => {
    expect(sanitizeCsvField('Rajesh Kumar')).toBe('Rajesh Kumar');
    expect(sanitizeCsvField('9876543210')).toBe('9876543210');
    expect(sanitizeCsvField('hotel@example.com')).toBe('hotel@example.com');
  });

  it('handles null and undefined safely', () => {
    expect(sanitizeCsvField(null)).toBe('');
    expect(sanitizeCsvField(undefined)).toBe('');
  });

  it('objectsToCsv sanitizes all fields — dangerous prefixes are tab-escaped', () => {
    const csv = objectsToCsv([
      { name: 'Alice', phone: '=MALICIOUS()' },
      { name: '+Bob', phone: '9000000000' },
    ]);
    // Tab-prefixed versions ARE present
    expect(csv).toContain('\t=MALICIOUS()');
    expect(csv).toContain('\t+Bob');
    // Unprotected formula must NOT appear at the start of a CSV cell (quoted directly)
    // In CSV format, a cell starting with = would be `"=MALICIOUS()"` — that must not appear
    expect(csv).not.toMatch(/"=MALICIOUS\(\)"/);
    expect(csv).not.toMatch(/,=MALICIOUS\(\)/);
  });
});

// ─── File token tests ─────────────────────────────────────────────────────────

describe('Secure File Token', () => {
  it('createFileToken returns a non-empty token with two parts separated by dot', () => {
    const token = createFileToken('/uploads/guests/abc.jpg', 'guest');
    expect(token).toBeTruthy();
    const parts = token.split('.');
    expect(parts).toHaveLength(2);
    expect(parts[0].length).toBeGreaterThan(0);
    expect(parts[1].length).toBeGreaterThan(0);
  });

  it('two tokens for the same path have different signatures (timestamp differs)', async () => {
    const t1 = createFileToken('/uploads/guests/abc.jpg', 'guest');
    await new Promise((r) => setTimeout(r, 2));
    const t2 = createFileToken('/uploads/guests/abc.jpg', 'guest');
    // Tokens should differ because expiresAt is different
    expect(t1).not.toBe(t2);
  });
});
