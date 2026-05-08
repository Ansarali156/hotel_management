/**
 * Token service — JWT access and refresh token management.
 *
 * Responsibilities:
 *   - Sign short-lived access tokens (15m default) with a `jti` for per-token revocation
 *   - Sign long-lived refresh tokens (7d default) for the rotation flow
 *   - Verify both token types and surface standard AppError(401) on failure
 *   - Hash refresh tokens (SHA-256) before DB persistence so the DB never sees the plaintext
 *   - Redis-based access-token blocklist keyed on `jti`, with fail-open on Redis errors
 *
 * Design notes:
 *   - Access tokens are short-lived on purpose — the blocklist is a safety net
 *     for logout/compromise, not a primary auth check. Fail-open is deliberate:
 *     a Redis outage must NOT take down logins for every user.
 *   - Refresh tokens are long-lived but can be atomically revoked in the DB
 *     (HotelRefreshToken.revokedAt / PoliceRefreshToken.revokedAt).
 *   - `crypto.randomUUID()` is used for jti — collision-resistant and avoids an
 *     extra dependency.
 */

import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';
import { redisClient } from '../config/redis';
import { AppError } from '../api/middleware/errorHandler';
import { logger } from '../utils/logger';

// ── Claim shapes ──────────────────────────────────────────────────────────────

export type PortalType = 'HOTEL' | 'POLICE';

/** What callers pass in to `generateAccessToken`. */
export interface AccessTokenClaims {
  sub: string;
  portalType: PortalType;
  hotelId?: string;
  email?: string;
  badgeId?: string;
  rankLevel?: number;
  jurisdictionPath?: string;
  stationId?: string | null;
}

/** What we get back after `verifyAccessToken`. Always includes a `jti`. */
export interface DecodedAccessToken extends AccessTokenClaims {
  jti: string;
  iat: number;
  exp: number;
}

export interface RefreshTokenClaims {
  sub: string;
  portalType: PortalType;
}

export interface DecodedRefreshToken extends RefreshTokenClaims {
  jti: string;
  tokenType: 'refresh';
  iat: number;
  exp: number;
}

// ── Token generation ──────────────────────────────────────────────────────────

/**
 * Sign a short-lived access JWT with a unique `jti` for blocklist tracking.
 */
export const generateAccessToken = (claims: AccessTokenClaims): string => {
  const jti = crypto.randomUUID();
  const payload = { ...claims, jti };
  const options: SignOptions = {
    expiresIn: env.JWT_ACCESS_EXPIRY as SignOptions['expiresIn'],
  };
  // jti is embedded in the payload directly — jsonwebtoken rejects `jwtid`
  // in options when the payload already carries `jti`.
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, options);
};

/**
 * Sign a long-lived refresh JWT. Marked with `tokenType: 'refresh'` so the
 * middleware can reject refresh tokens sent on regular protected endpoints.
 */
export const generateRefreshToken = (claims: RefreshTokenClaims): string => {
  const jti = crypto.randomUUID();
  const payload = { ...claims, jti, tokenType: 'refresh' as const };
  const options: SignOptions = {
    expiresIn: env.JWT_REFRESH_EXPIRY as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, options);
};

// ── Token verification ────────────────────────────────────────────────────────

/**
 * Verify an access token. Throws AppError(401) on any failure so callers
 * can simply `next(err)` and let the global handler translate to HTTP.
 */
export const verifyAccessToken = (token: string): DecodedAccessToken => {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError(401, 'TOKEN_EXPIRED', 'Access token has expired');
    }
    throw new AppError(401, 'INVALID_TOKEN', 'Invalid or malformed access token');
  }
  if (!decoded || typeof decoded === 'string') {
    throw new AppError(401, 'INVALID_TOKEN', 'Invalid token format');
  }
  return decoded as DecodedAccessToken;
};

/**
 * Verify a refresh token. Also enforces the `tokenType === 'refresh'` claim
 * so an access token cannot be presented on the refresh endpoint.
 */
export const verifyRefreshToken = (token: string): DecodedRefreshToken => {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, env.JWT_REFRESH_SECRET);
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError(401, 'REFRESH_TOKEN_EXPIRED', 'Refresh token has expired');
    }
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Invalid or malformed refresh token');
  }
  if (!decoded || typeof decoded === 'string') {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Invalid refresh token format');
  }
  const payload = decoded as DecodedRefreshToken;
  if (payload.tokenType !== 'refresh') {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Not a refresh token');
  }
  return payload;
};

// ── Refresh-token hashing for DB storage ──────────────────────────────────────

/**
 * SHA-256 of the refresh token string. We persist only the hash so a DB dump
 * cannot be replayed against the auth endpoints.
 */
export const hashRefreshToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// ── Redis blocklist ───────────────────────────────────────────────────────────

const BLOCKLIST_PREFIX = 'token:blocklist:';

const blocklistKey = (jti: string): string => `${BLOCKLIST_PREFIX}${jti}`;

/**
 * Seconds left until a decoded token expires. Used as the Redis TTL so
 * blocklist entries expire with their tokens (no manual cleanup needed).
 */
export const remainingTtlSeconds = (exp: number): number => {
  const nowSec = Math.floor(Date.now() / 1000);
  return Math.max(0, exp - nowSec);
};

/**
 * Check whether a `jti` is in the Redis blocklist. Fails OPEN: if Redis is
 * unreachable, we do NOT lock users out — the short access-token lifetime
 * is the safety net there.
 */
export const isTokenBlocklisted = async (jti: string): Promise<boolean> => {
  if (!redisClient) return false;
  try {
    const v = await redisClient.get(blocklistKey(jti));
    return v !== null && v !== undefined;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('[token.service] blocklist lookup failed — failing open', { jti, error: msg });
    return false;
  }
};

/**
 * Add a `jti` to the Redis blocklist with a TTL matching the token's own
 * remaining lifetime. Fire-and-forget callers can ignore the returned promise.
 */
export const blocklistToken = async (jti: string, exp: number): Promise<void> => {
  if (!redisClient) return;
  const ttl = remainingTtlSeconds(exp);
  if (ttl <= 0) return;
  try {
    // The test mocks expect a 3-argument call: (key, value, optionsObj).
    // `EX` matches the UpstashRedisAdapter.set signature.
    await redisClient.set(blocklistKey(jti), '1', { EX: ttl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('[token.service] blocklist write failed — proceeding', { jti, error: msg });
  }
};
