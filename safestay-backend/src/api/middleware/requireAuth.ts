/**
 * JWT authentication + authorisation middleware.
 *
 * Verifies the `Authorization: Bearer <jwt>` header using the token.service
 * helpers, enforces the Redis blocklist (fail-open on Redis errors), and
 * attaches the decoded payload to `req.user`.
 *
 * Four guards are exported:
 *   - requireAuth        : any valid JWT (hotel OR police)
 *   - requireHotelAuth   : hotel portal only — FORBIDDEN for police tokens
 *   - requirePoliceAuth  : police portal only — FORBIDDEN for hotel tokens
 *   - requireMinRank(n)  : police-only; requires rankLevel <= n (lower is senior)
 *
 * The auth controller signs two token shapes:
 *   - Hotel : sub, portalType "HOTEL",  hotelId, email, jti
 *   - Police: sub, portalType "POLICE", badgeId, rankLevel, jurisdictionPath, stationId, jti
 */

import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';
import {
  verifyAccessToken,
  isTokenBlocklisted,
  DecodedAccessToken,
} from '../../services/token.service';

export type PortalType = 'HOTEL' | 'POLICE';

export interface AuthUser {
  sub: string;
  portalType: PortalType;
  jti?: string;
  hotelId?: string;
  email?: string;
  badgeId?: string;
  rankLevel?: number;
  jurisdictionPath?: string;
  stationId?: string | null;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

const decodeBearerToken = (req: Request): DecodedAccessToken => {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) {
    throw new AppError(401, 'MISSING_TOKEN', 'Authorization token required');
  }
  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    throw new AppError(401, 'MISSING_TOKEN', 'Authorization token required');
  }
  return verifyAccessToken(token);
};

/**
 * Throw TOKEN_REVOKED if the JTI is in the Redis blocklist. Fails OPEN on
 * Redis error — the short access-token lifetime is the safety net.
 */
const assertNotBlocklisted = async (jti: string | undefined): Promise<void> => {
  if (!jti) return;
  if (await isTokenBlocklisted(jti)) {
    throw new AppError(401, 'TOKEN_REVOKED', 'Token has been revoked');
  }
};

const toAuthUser = (decoded: DecodedAccessToken): AuthUser => ({
  sub: decoded.sub,
  portalType: decoded.portalType,
  jti: decoded.jti,
  hotelId: decoded.hotelId ?? (decoded.portalType === 'HOTEL' ? decoded.sub : undefined),
  email: decoded.email,
  badgeId: decoded.badgeId,
  rankLevel: decoded.rankLevel,
  jurisdictionPath: decoded.jurisdictionPath,
  stationId: decoded.stationId ?? null,
});

/** Accept any valid JWT (hotel or police). */
export const requireAuth = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const decoded = decodeBearerToken(req);
    await assertNotBlocklisted(decoded.jti);
    req.user = toAuthUser(decoded);
    next();
  } catch (err) {
    next(err);
  }
};

/** Accept only hotel portal JWTs. */
export const requireHotelAuth = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const decoded = decodeBearerToken(req);
    if (decoded.portalType !== 'HOTEL') {
      throw new AppError(403, 'FORBIDDEN', 'Hotel credentials required');
    }
    await assertNotBlocklisted(decoded.jti);
    const user = toAuthUser(decoded);
    if (!user.hotelId) {
      throw new AppError(401, 'INVALID_TOKEN', 'Hotel ID missing from token');
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

/** Accept only police portal JWTs. */
export const requirePoliceAuth = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const decoded = decodeBearerToken(req);
    if (decoded.portalType !== 'POLICE') {
      throw new AppError(403, 'FORBIDDEN', 'Police credentials required');
    }
    await assertNotBlocklisted(decoded.jti);
    req.user = toAuthUser(decoded);
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Police RBAC: require that the authenticated officer's rankLevel be at most
 * `maxLevel` (lower numbers are more senior in the Indian police hierarchy,
 * e.g. 1 = DGP, 8 = DSP, 12 = Head Constable, 14 = Constable).
 *
 * Must be mounted AFTER requirePoliceAuth so req.user is populated.
 */
export const requireMinRank = (maxLevel: number) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user || user.portalType !== 'POLICE') {
        throw new AppError(403, 'FORBIDDEN', 'Police credentials required');
      }
      const level = user.rankLevel ?? 99;
      if (level > maxLevel) {
        throw new AppError(
          403,
          'INSUFFICIENT_RANK',
          `This action requires rank level ${maxLevel} or senior`
        );
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};
