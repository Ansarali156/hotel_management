/**
 * Secure file-serve endpoint.
 *
 * Files are stored outside the web-accessible directory and are NEVER
 * served directly by path.  This route validates a short-lived HMAC-signed
 * token and streams the file to the caller.
 *
 * Token format (URL-safe base64):
 *   base64url( JSON{ filePath, expiresAt } ) + '.' + HMAC-SHA256 signature
 */

import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { env } from '../../config/env';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// ─── Token helpers ────────────────────────────────────────────────────────────

const HMAC_ALG = 'sha256';
const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

interface FileTokenPayload {
  filePath: string;
  expiresAt: number; // Unix ms
  category: 'guest' | 'criminal';
}

export const createFileToken = (filePath: string, category: 'guest' | 'criminal'): string => {
  const payload: FileTokenPayload = {
    filePath,
    category,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac(HMAC_ALG, env.FILE_SERVE_SECRET)
    .update(data)
    .digest('base64url');
  return `${data}.${sig}`;
};

const validateFileToken = (token: string): FileTokenPayload => {
  const parts = token.split('.');
  if (parts.length !== 2) throw new AppError(400, 'INVALID_TOKEN', 'Malformed file token');

  const [data, sig] = parts;
  const expectedSig = crypto
    .createHmac(HMAC_ALG, env.FILE_SERVE_SECRET)
    .update(data)
    .digest('base64url');

  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    throw new AppError(403, 'INVALID_TOKEN', 'File token signature invalid');
  }

  let payload: FileTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  } catch {
    throw new AppError(400, 'INVALID_TOKEN', 'Malformed file token payload');
  }

  if (Date.now() > payload.expiresAt) {
    throw new AppError(403, 'TOKEN_EXPIRED', 'File access token has expired');
  }

  return payload;
};

// ─── Route ────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/files/:token
 * Streams the file identified by the signed HMAC token.
 */
router.get('/:token', (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = validateFileToken(req.params.token);

    // Normalise and sandbox: ensure the resolved path is inside the upload dir
    const uploadRoot = path.resolve(env.UPLOAD_DIR);
    const resolved = path.resolve(payload.filePath);
    if (!resolved.startsWith(uploadRoot + path.sep)) {
      throw new AppError(403, 'PATH_TRAVERSAL', 'Illegal file path');
    }

    if (!fs.existsSync(resolved)) {
      throw new AppError(404, 'FILE_NOT_FOUND', 'File not found');
    }

    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'no-store');
    fs.createReadStream(resolved).pipe(res);
  } catch (err) {
    next(err);
  }
});

export default router;
