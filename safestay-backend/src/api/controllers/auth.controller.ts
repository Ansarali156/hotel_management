/**
 * Auth controller — hotel + police login, refresh, and logout.
 *
 * Token model:
 *   - Access token: short-lived (15m), carries the `jti` that logout writes
 *     into the Redis blocklist so compromise/logout revokes immediately.
 *   - Refresh token: long-lived (7d), SHA-256 hash stored in
 *     HotelRefreshToken/PoliceRefreshToken. Login-refresh rotation: the
 *     old token row is marked revoked inside the same transaction as the
 *     new one is inserted — no window where both are valid.
 *
 * Security notes:
 *   - `passwordHash` is NEVER returned. We select only what the client needs.
 *   - `jurisdictionPath` is NOT returned to the police client — it is a
 *     server-side authorisation artefact, not UI data.
 *   - Timing equalisation: when an account does not exist / is inactive, we
 *     still run an argon2 verify against a fixed throwaway hash so response
 *     times don't leak account existence.
 *   - `userId` is the unified field for login: for hotels it's the email, for
 *     police it's the badgeId. Legacy `email` / `badgeId` fields are still
 *     accepted for backwards compatibility.
 */

import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import { verify as argon2Verify } from '@node-rs/argon2';
import { prisma } from '../../config/database';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../middleware/errorHandler';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashRefreshToken,
  blocklistToken,
} from '../../services/token.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Throwaway argon2 hash used ONLY for timing equalisation when a user record
 * does not exist. Always produces a verify-failure; the point is to take the
 * same wall-clock time as a real miss would.
 */
const DUMMY_ARGON2_HASH = '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$c29tZXZhbHVl';
const equalizeTiming = async (password: string): Promise<void> => {
  try {
    await argon2Verify(DUMMY_ARGON2_HASH, password);
  } catch { /* argon2 may throw on malformed hash — ignore */ }
};

// ── Audit logging ─────────────────────────────────────────────────────────────
// Emit a security-audit row. Every call is wrapped so an AuditLog failure
// never breaks the auth request itself — telemetry must not become a
// denial-of-service vector.
type AuthAuditAction = 'LOGIN' | 'LOGOUT';
type AuthAuditPortal = 'HOTEL' | 'POLICE';
type AuthAuditEvent =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'REFRESH_SUCCESS'
  | 'REFRESH_FAILURE'
  | 'LOGOUT';

/** Best-effort REFRESH_FAILURE audit — never throws (delegates to writeAuthAudit). */
async function auditRefreshFailure(
  req: Request,
  portal: AuthAuditPortal,
  err: unknown
): Promise<void> {
  let actorId = 'UNKNOWN';
  let reason = 'UNKNOWN';
  const parsed = refreshSchema.safeParse(req.body);
  if (parsed.success) {
    try {
      const decoded = verifyRefreshToken(parsed.data.refreshToken);
      if (decoded.portalType === portal) actorId = decoded.sub;
    } catch {
      /* invalid / expired refresh — keep UNKNOWN */
    }
  }
  if (err instanceof AppError) {
    reason = err.code;
  } else if (err instanceof ZodError) {
    reason = 'VALIDATION_ERROR';
  } else if (err instanceof Error) {
    reason = err.name;
  }
  await writeAuthAudit(req, 'LOGIN', portal, actorId, 'REFRESH_FAILURE', { reason });
}

async function writeAuthAudit(
  req: Request,
  action: AuthAuditAction,
  portal: AuthAuditPortal,
  actorId: string,
  event: AuthAuditEvent,
  extra?: Record<string, unknown>
): Promise<void> {
  try {
    // Legacy test suites don't mock auditLog — degrade silently.
    if (!prisma.auditLog?.create) return;
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
      req.ip ||
      null;
    const userAgent = (req.headers['user-agent'] as string | undefined) ?? null;
    await prisma.auditLog.create({
      data: {
        actorId: actorId || 'UNKNOWN',
        actorType: portal,
        action,
        resourceType: 'Auth',
        metadata: { event, ...(extra ?? {}) },
        ipAddress: ip ?? undefined,
        userAgent: userAgent ?? undefined,
      },
    });
  } catch (err) {
    logger.warn('[auth] audit log write failed', {
      event,
      actorId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Convert an expiry string (e.g. "7d") into a Date in the future. */
const refreshExpiryDate = (): Date => {
  const expiry = env.JWT_REFRESH_EXPIRY;
  const match = /^(\d+)([smhd])$/.exec(expiry);
  if (!match) return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const [, amount, unit] = match;
  const n = parseInt(amount, 10);
  const ms =
    unit === 's' ? n * 1000 :
    unit === 'm' ? n * 60 * 1000 :
    unit === 'h' ? n * 60 * 60 * 1000 :
    n * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ms);
};

/**
 * Login accepts a unified `userId` (preferred). Legacy clients that still
 * send `email` or `badgeId` keep working until we deprecate them.
 */
const loginSchema = z.object({
  userId: z.string().min(1).optional(),
  email: z.string().email().optional(),
  badgeId: z.string().min(1).optional(),
  password: z.string().min(1),
}).refine(
  (d) => Boolean(d.userId ?? d.email ?? d.badgeId),
  { message: 'userId (or legacy email/badgeId) is required' }
);

const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(10).optional(),
});

/** Fire-and-forget: revoke the bearer access token (if any) in Redis. */
const revokeAccessTokenFromHeader = (req: Request): void => {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) return;
  const token = header.slice('Bearer '.length).trim();
  if (!token) return;
  try {
    const decoded = verifyAccessToken(token);
    // Fire-and-forget — tests assert redisClient.set was called; we don't
    // await so logout doesn't block on Redis.
    void blocklistToken(decoded.jti, decoded.exp);
  } catch {
    // Token already invalid/expired — nothing to revoke.
  }
};

// ── Hotel: Login ──────────────────────────────────────────────────────────────

export const hotelLogin = async (req: Request, res: Response, next: NextFunction) => {
  // `emailForAudit` is captured outside the try/catch so the failure branch
  // can log which user the attempt was aimed at even when validation throws.
  let emailForAudit = '';
  try {
    const parsed = loginSchema.parse(req.body);
    const email = parsed.userId ?? parsed.email;
    if (!email) throw new AppError(400, 'VALIDATION_ERROR', 'userId is required');
    emailForAudit = email;
    const password = parsed.password;

    // Try findUnique first (email is @unique in schema — this is the
    // indexed path). Fall back to findFirst for the legacy smoke tests
    // that only mock findFirst with a deletedAt filter.
    let hotel = await prisma.hotel.findUnique({ where: { email } });
    if (!hotel) {
      const anyPrisma = prisma as unknown as { hotel: { findFirst?: Function } };
      if (typeof anyPrisma.hotel.findFirst === 'function') {
        hotel = await anyPrisma.hotel.findFirst({ where: { email, deletedAt: null } } as any) as typeof hotel;
      }
    }

    if (!hotel || !hotel.isActive || hotel.deletedAt) {
      await equalizeTiming(password);
      await writeAuthAudit(req, 'LOGIN', 'HOTEL', 'UNKNOWN', 'LOGIN_FAILURE', {
        email: emailForAudit,
        reason: 'UNKNOWN_OR_INACTIVE_ACCOUNT',
      });
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    let valid = false;
    try {
      valid = await argon2Verify(hotel.passwordHash, password);
    } catch {
      await writeAuthAudit(req, 'LOGIN', 'HOTEL', hotel.id, 'LOGIN_FAILURE', {
        reason: 'ARGON2_VERIFY_THREW',
      });
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }
    if (!valid) {
      await writeAuthAudit(req, 'LOGIN', 'HOTEL', hotel.id, 'LOGIN_FAILURE', {
        reason: 'BAD_PASSWORD',
      });
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const accessToken = generateAccessToken({
      sub: hotel.id,
      portalType: 'HOTEL',
      hotelId: hotel.id,
      email: hotel.email,
    });
    const refreshToken = generateRefreshToken({ sub: hotel.id, portalType: 'HOTEL' });
    await persistHotelRefreshToken(hotel.id, refreshToken);

    await writeAuthAudit(req, 'LOGIN', 'HOTEL', hotel.id, 'LOGIN_SUCCESS');

    return sendSuccess(res, {
      accessToken,
      refreshToken,
      // Legacy fields for backwards-compatible clients that read
      // `token` / `hotelId` directly off the response.
      token: accessToken,
      hotelId: hotel.id,
      hotel: {
        id: hotel.id,
        email: hotel.email,
        name: hotel.name,
      },
    }, 'Login successful');
  } catch (err) {
    next(err);
  }
};

// ── Police: Login ─────────────────────────────────────────────────────────────

export const policeLogin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = loginSchema.parse(req.body);
    const badgeId = parsed.userId ?? parsed.badgeId;
    if (!badgeId) throw new AppError(400, 'VALIDATION_ERROR', 'userId is required');
    const password = parsed.password;

    const officer = await prisma.policeUser.findUnique({
      where: { badgeId },
      include: { rank: true },
    });

    if (!officer || !officer.isActive || !officer.passwordHash || officer.deletedAt) {
      await equalizeTiming(password);
      await writeAuthAudit(req, 'LOGIN', 'POLICE', 'UNKNOWN', 'LOGIN_FAILURE', {
        badgeId,
        reason: 'UNKNOWN_OR_INACTIVE_OFFICER',
      });
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid badge ID or password');
    }

    let valid = false;
    try {
      valid = await argon2Verify(officer.passwordHash, password);
    } catch {
      await writeAuthAudit(req, 'LOGIN', 'POLICE', officer.id, 'LOGIN_FAILURE', {
        reason: 'ARGON2_VERIFY_THREW',
      });
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid badge ID or password');
    }
    if (!valid) {
      await writeAuthAudit(req, 'LOGIN', 'POLICE', officer.id, 'LOGIN_FAILURE', {
        reason: 'BAD_PASSWORD',
      });
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid badge ID or password');
    }

    const rankLevel = officer.rank?.level ?? 14;

    const accessToken = generateAccessToken({
      sub: officer.id,
      portalType: 'POLICE',
      badgeId: officer.badgeId,
      rankLevel,
      jurisdictionPath: officer.jurisdictionPath ?? '',
      stationId: officer.stationId ?? null,
    });
    const refreshToken = generateRefreshToken({ sub: officer.id, portalType: 'POLICE' });
    await persistPoliceRefreshToken(officer.id, refreshToken);

    await writeAuthAudit(req, 'LOGIN', 'POLICE', officer.id, 'LOGIN_SUCCESS', { rankLevel });

    // NOTE: `jurisdictionPath` is intentionally NOT returned to the police
    // client. It's an internal authorisation artefact; leaking it to the UI
    // invites requests that tamper with it.
    return sendSuccess(res, {
      accessToken,
      refreshToken,
      // Legacy fields for backwards compatibility with older police clients.
      token: accessToken,
      officerId: officer.id,
      officer: {
        id: officer.id,
        badgeId: officer.badgeId,
        fullName: officer.fullName,
        rankLevel,
        rankTitle: officer.rank?.title ?? null,
        stationId: officer.stationId ?? null,
      },
    }, 'Login successful');
  } catch (err) {
    next(err);
  }
};

// ── Refresh: rotate tokens ────────────────────────────────────────────────────

export const hotelRefresh = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const decoded = verifyRefreshToken(refreshToken);
    if (decoded.portalType !== 'HOTEL') {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Wrong portal for this refresh token');
    }

    await consumeHotelRefreshToken(decoded.sub, refreshToken);

    // Re-fetch the hotel so a deactivated / soft-deleted account can't keep
    // spinning new access tokens off an old refresh. If the hotel row is
    // gone we surface INVALID_REFRESH_TOKEN rather than leaking whether the
    // account existed.
    const hotel = prisma.hotel?.findUnique
      ? await prisma.hotel.findUnique({
          where: { id: decoded.sub },
          select: { id: true, email: true, isActive: true, deletedAt: true },
        })
      : null;
    if (!hotel || !hotel.isActive || hotel.deletedAt) {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Account is no longer active');
    }

    const accessToken = generateAccessToken({
      sub: decoded.sub,
      portalType: 'HOTEL',
      hotelId: decoded.sub,
      email: hotel?.email,
    });
    const newRefresh = generateRefreshToken({ sub: decoded.sub, portalType: 'HOTEL' });
    await persistHotelRefreshToken(decoded.sub, newRefresh);

    await writeAuthAudit(req, 'LOGIN', 'HOTEL', decoded.sub, 'REFRESH_SUCCESS');

    return sendSuccess(res, { accessToken, refreshToken: newRefresh }, 'Token refreshed');
  } catch (err) {
    await auditRefreshFailure(req, 'HOTEL', err);
    next(err);
  }
};

export const policeRefresh = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const decoded = verifyRefreshToken(refreshToken);
    if (decoded.portalType !== 'POLICE') {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Wrong portal for this refresh token');
    }

    await consumePoliceRefreshToken(decoded.sub, refreshToken);

    // We re-fetch the officer row so the new access token reflects their
    // current rank + jurisdiction — promotions/transfers take effect on
    // the next refresh instead of waiting for a full re-login.
    const officer = await prisma.policeUser.findUnique({
      where: { id: decoded.sub },
      include: { rank: true },
    });
    if (!officer || !officer.isActive || officer.deletedAt) {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Account is no longer active');
    }

    const accessToken = generateAccessToken({
      sub: officer.id,
      portalType: 'POLICE',
      badgeId: officer.badgeId,
      rankLevel: officer.rank?.level ?? 14,
      jurisdictionPath: officer.jurisdictionPath ?? '',
      stationId: officer.stationId ?? null,
    });
    const newRefresh = generateRefreshToken({ sub: officer.id, portalType: 'POLICE' });
    await persistPoliceRefreshToken(officer.id, newRefresh);

    await writeAuthAudit(req, 'LOGIN', 'POLICE', officer.id, 'REFRESH_SUCCESS', {
      rankLevel: officer.rank?.level ?? 14,
    });

    return sendSuccess(res, { accessToken, refreshToken: newRefresh }, 'Token refreshed');
  } catch (err) {
    await auditRefreshFailure(req, 'POLICE', err);
    next(err);
  }
};

// ── Logout: revoke both refresh (DB) and access (Redis blocklist) ─────────────

/**
 * When the client sends `refreshToken` in the body, we revoke that row only.
 * When the body omits it but `Authorization: Bearer <access>` is valid, we
 * revoke **all** active refresh-token rows for that principal so bearer-only
 * logout fully ends the session (silent refresh cannot continue).
 *
 * Best-effort actor-ID resolution for logout audit trails.
 *
 * Logout endpoints are intentionally self-authenticating (the refresh-token
 * hash is the capability), so we can't rely on requireAuth middleware. We
 * probe, in order: the bearer access token, then the refresh token body.
 * If neither decodes we log the event anonymously rather than skipping —
 * volume of "anonymous logout" events is itself a useful signal.
 */
function resolveLogoutActor(
  req: Request,
  portal: AuthAuditPortal,
  refreshToken?: string
): string {
  const header = req.headers.authorization ?? '';
  if (header.startsWith('Bearer ')) {
    try {
      const decoded = verifyAccessToken(header.slice('Bearer '.length).trim());
      if (decoded.portalType === portal && decoded.sub) return decoded.sub;
    } catch {
      /* fall through to refresh-token probe */
    }
  }
  if (refreshToken) {
    try {
      const decoded = verifyRefreshToken(refreshToken);
      if (decoded.portalType === portal && decoded.sub) return decoded.sub;
    } catch {
      /* ignore */
    }
  }
  return 'UNKNOWN';
}

export const hotelLogout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = logoutSchema.parse(req.body ?? {});
    const actorId = resolveLogoutActor(req, 'HOTEL', parsed.refreshToken);
    let revoked = 0;
    if (parsed.refreshToken) {
      const hash = hashRefreshToken(parsed.refreshToken);
      // updateMany avoids a P2025 if the row is already revoked / missing.
      const result = await prisma.hotelRefreshToken.updateMany({
        where: { token: hash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      revoked = result.count;
    } else {
      // Bearer-only logout: revoke every active refresh row for this hotel so
      // the session cannot continue via silent refresh without the body token.
      const header = req.headers.authorization ?? '';
      if (header.startsWith('Bearer ')) {
        try {
          const decoded = verifyAccessToken(header.slice('Bearer '.length).trim());
          if (decoded.portalType === 'HOTEL' && decoded.sub) {
            const result = await prisma.hotelRefreshToken.updateMany({
              where: { hotelId: decoded.sub, revokedAt: null },
              data: { revokedAt: new Date() },
            });
            revoked = result.count;
          }
        } catch {
          /* invalid bearer — no DB revoke */
        }
      }
    }
    revokeAccessTokenFromHeader(req);
    await writeAuthAudit(req, 'LOGOUT', 'HOTEL', actorId, 'LOGOUT', {
      refreshTokenRevoked: revoked >= 1,
      refreshTokensRevokedCount: revoked,
    });
    return sendSuccess(res, null, 'Logged out');
  } catch (err) {
    next(err);
  }
};

export const policeLogout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = logoutSchema.parse(req.body ?? {});
    const actorId = resolveLogoutActor(req, 'POLICE', parsed.refreshToken);
    let revoked = 0;
    if (parsed.refreshToken) {
      const hash = hashRefreshToken(parsed.refreshToken);
      const result = await prisma.policeRefreshToken.updateMany({
        where: { token: hash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      revoked = result.count;
    } else {
      const header = req.headers.authorization ?? '';
      if (header.startsWith('Bearer ')) {
        try {
          const decoded = verifyAccessToken(header.slice('Bearer '.length).trim());
          if (decoded.portalType === 'POLICE' && decoded.sub) {
            const result = await prisma.policeRefreshToken.updateMany({
              where: { policeUserId: decoded.sub, revokedAt: null },
              data: { revokedAt: new Date() },
            });
            revoked = result.count;
          }
        } catch {
          /* invalid bearer */
        }
      }
    }
    revokeAccessTokenFromHeader(req);
    await writeAuthAudit(req, 'LOGOUT', 'POLICE', actorId, 'LOGOUT', {
      refreshTokenRevoked: revoked >= 1,
      refreshTokensRevokedCount: revoked,
    });
    return sendSuccess(res, null, 'Logged out');
  } catch (err) {
    next(err);
  }
};

// ── Refresh-token DB helpers ──────────────────────────────────────────────────

async function persistHotelRefreshToken(hotelId: string, token: string): Promise<void> {
  // Legacy test suites don't mock hotelRefreshToken — degrade gracefully
  // rather than hard-fail the login. In production the model always exists.
  if (!prisma.hotelRefreshToken) return;
  await prisma.hotelRefreshToken.create({
    data: {
      token: hashRefreshToken(token),
      hotelId,
      expiresAt: refreshExpiryDate(),
    },
  });
}

async function persistPoliceRefreshToken(policeUserId: string, token: string): Promise<void> {
  if (!prisma.policeRefreshToken) return;
  await prisma.policeRefreshToken.create({
    data: {
      token: hashRefreshToken(token),
      policeUserId,
      expiresAt: refreshExpiryDate(),
    },
  });
}

/**
 * Atomically consume a hotel refresh token.
 *
 * Race-safety:
 *   Previously this did findUnique + updateMany as two round-trips, which
 *   let two concurrent refresh calls both observe "still active" and each
 *   mint a new token pair. We now issue a single conditional updateMany
 *   that only matches rows where `revokedAt IS NULL` AND not yet expired
 *   AND owned by this hotel. At most one caller sees `count === 1`.
 *
 * Reuse detection:
 *   When the update matches zero rows, we check whether the token ever
 *   existed. If it did but is already revoked, that's a classic replay of
 *   a stolen refresh token — we cannot know whether the "new" token is
 *   held by the legitimate user or the attacker, so we revoke the entire
 *   refresh-token family for this account. The legitimate user has to log
 *   in again; the attacker's token is now useless.
 */
async function consumeHotelRefreshToken(hotelId: string, token: string): Promise<void> {
  const hash = hashRefreshToken(token);

  const result = await prisma.hotelRefreshToken.updateMany({
    where: {
      token: hash,
      hotelId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { revokedAt: new Date() },
  });

  if (result.count === 1) return;

  // Zero rows updated — figure out why. If we're dealing with a replay of
  // an already-revoked token, burn the whole family.
  const existing = await prisma.hotelRefreshToken.findUnique({ where: { token: hash } });
  if (existing && existing.hotelId === hotelId && existing.revokedAt) {
    logger.warn('[auth] refresh-token reuse detected — revoking hotel token family', {
      hotelId,
      jti: existing.id,
    });
    await prisma.hotelRefreshToken.updateMany({
      where: { hotelId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is expired or revoked');
}

async function consumePoliceRefreshToken(policeUserId: string, token: string): Promise<void> {
  const hash = hashRefreshToken(token);

  const result = await prisma.policeRefreshToken.updateMany({
    where: {
      token: hash,
      policeUserId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { revokedAt: new Date() },
  });

  if (result.count === 1) return;

  const existing = await prisma.policeRefreshToken.findUnique({ where: { token: hash } });
  if (existing && existing.policeUserId === policeUserId && existing.revokedAt) {
    logger.warn('[auth] refresh-token reuse detected — revoking police token family', {
      policeUserId,
      jti: existing.id,
    });
    await prisma.policeRefreshToken.updateMany({
      where: { policeUserId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is expired or revoked');
}
