/**
 * Multer upload configuration — hardened for production.
 *
 * SECURITY MEASURES:
 * 1. Magic byte validation — MIME type alone is spoofable; first bytes are checked
 * 2. UUID-based filenames — no guessable paths
 * 3. Files stored OUTSIDE the Express static root (./uploads is never served)
 * 4. File paths are NEVER returned in API responses; use the /files/… signed
 *    endpoint to retrieve documents
 */

import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { env } from './env';
import { AppError } from '../api/middleware/errorHandler';
import { Request } from 'express';

// ─── Magic byte signatures ────────────────────────────────────────────────────

const MAGIC_BYTES: Record<string, Buffer[]> = {
  'image/jpeg': [Buffer.from([0xff, 0xd8, 0xff])],
  'image/png': [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  // WebP: RIFF????WEBP — bytes 0-3 = RIFF, bytes 8-11 = WEBP
  'image/webp': [Buffer.from([0x52, 0x49, 0x46, 0x46])],
};

const ALLOWED_MIME_TYPES = Object.keys(MAGIC_BYTES);

/**
 * Reads the first 12 bytes of a file on disk and validates them against
 * the declared MIME type.  Throws AppError if they don't match.
 */
export const validateMagicBytes = (filePath: string, mimetype: string): void => {
  const signatures = MAGIC_BYTES[mimetype];
  if (!signatures) {
    // Should never reach here because fileFilter already blocked unsupported types,
    // but guard defensively.
    safeUnlinkSync(filePath);
    throw new AppError(400, 'INVALID_FILE_TYPE', 'File type not permitted');
  }

  let header: Buffer;
  try {
    const fd = fs.openSync(filePath, 'r');
    header = Buffer.alloc(12);
    fs.readSync(fd, header, 0, 12, 0);
    fs.closeSync(fd);
  } catch {
    safeUnlinkSync(filePath);
    throw new AppError(500, 'FILE_READ_ERROR', 'Could not read uploaded file');
  }

  const matched = signatures.some((sig) => header.subarray(0, sig.length).equals(sig));

  // Special case for WebP: additionally verify bytes 8-11 === 'WEBP'
  const isValidWebP = () =>
    mimetype === 'image/webp' &&
    header.subarray(8, 12).equals(Buffer.from([0x57, 0x45, 0x42, 0x50]));

  const valid = mimetype === 'image/webp' ? (matched && isValidWebP()) : matched;

  if (!valid) {
    safeUnlinkSync(filePath);
    throw new AppError(
      400,
      'MAGIC_BYTE_MISMATCH',
      'File content does not match its declared type'
    );
  }
};

const safeUnlinkSync = (filePath: string) => {
  try { fs.unlinkSync(filePath); } catch { /* ignore */ }
};

// ─── Storage destinations ─────────────────────────────────────────────────────

const resolveDir = (sub: string): string => {
  const dir = path.resolve(env.UPLOAD_DIR, sub);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const makeUUIDFilename = (_file: Express.Multer.File): string =>
  `${crypto.randomUUID()}`; // Extension deliberately omitted — served by our API, not by path

const guestStorage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb) => {
    cb(null, resolveDir('guests'));
  },
  filename: (_req: Request, file: Express.Multer.File, cb) => {
    cb(null, makeUUIDFilename(file));
  },
});

const criminalStorage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb) => {
    cb(null, resolveDir('criminals'));
  },
  filename: (_req: Request, file: Express.Multer.File, cb) => {
    cb(null, makeUUIDFilename(file));
  },
});

// ─── Multer instances ─────────────────────────────────────────────────────────

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new AppError(400, 'INVALID_FILE_TYPE', 'Only JPEG, PNG, WEBP allowed') as never);
  }
  cb(null, true);
};

export const guestUpload = multer({
  storage: guestStorage,
  limits: { fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024 },
  fileFilter,
});

export const criminalUpload = multer({
  storage: criminalStorage,
  limits: { fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024 },
  fileFilter,
});
