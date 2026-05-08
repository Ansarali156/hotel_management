/**
 * Rate limiter middleware.
 *
 * When Upstash Redis is configured (production / multi-instance), counters are
 * shared across instances via a thin custom store. When it isn't (local dev),
 * we fall back to express-rate-limit's built-in in-memory store so the limiter
 * still works on a single node instead of silently firing "fail-open" on every
 * request.
 *
 * Hardening:
 * - Auth endpoints have a stricter sub-limit (10 attempts / 15 min / IP)
 * - Redis errors degrade to `totalHits: 1` (fail-open) but are rate-limited in
 *   the log so a broken Redis cannot DoS the logger.
 */

import rateLimit, { Store, IncrementResponse } from 'express-rate-limit';
import { env } from '../../config/env';
import { redisClient } from '../../config/redis';
import { logger } from '../../utils/logger';

const REDIS_ENABLED = redisClient !== null && redisClient !== undefined;

// Throttle noisy "Redis error" logs to at most once per minute per limiter
// instance — one flaky Redis shouldn't produce a million log lines per hour.
const LOG_THROTTLE_MS = 60_000;

// ─── Custom Redis store ───────────────────────────────────────────────────────

class RedisRateLimitStore implements Store {
  readonly prefix: string;
  private readonly windowMs: number;
  private lastErrorLogAt = 0;

  constructor(keyPrefix: string, windowMs: number) {
    this.prefix = keyPrefix;
    this.windowMs = windowMs;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const redisKey = `${this.prefix}:${key}`;
    try {
      const count = await redisClient.incr(redisKey);
      if (count === 1) {
        await redisClient.pExpire(redisKey, this.windowMs);
      }
      const ttl = await redisClient.pTTL(redisKey);
      const resetTime = new Date(Date.now() + Math.max(0, ttl));
      return { totalHits: count, resetTime };
    } catch (err: unknown) {
      const now = Date.now();
      if (now - this.lastErrorLogAt > LOG_THROTTLE_MS) {
        this.lastErrorLogAt = now;
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('RedisRateLimitStore.increment failed — fail-open (throttled log)', {
          error: msg,
          prefix: this.prefix,
        });
      }
      return { totalHits: 1, resetTime: new Date(Date.now() + this.windowMs) };
    }
  }

  async decrement(key: string): Promise<void> {
    try {
      await redisClient.decr(`${this.prefix}:${key}`);
    } catch { /* ignore */ }
  }

  async resetKey(key: string): Promise<void> {
    try {
      await redisClient.del(`${this.prefix}:${key}`);
    } catch { /* ignore */ }
  }
}

// ─── Limiter instances ────────────────────────────────────────────────────────
//
// `store` is intentionally omitted when Redis isn't configured — that makes
// express-rate-limit default to its in-memory store, which is what we want
// for local development on a single process.

export const globalRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  ...(REDIS_ENABLED
    ? { store: new RedisRateLimitStore('rl:global', env.RATE_LIMIT_WINDOW_MS) }
    : {}),
  message: { success: false, error: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED' },
  skip: (req) => req.path === '/health',
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  // Only punish *failed* login attempts — a user typing their password right
  // on the first try shouldn't burn the bucket that's meant to stop brute-force.
  // This is the standard OWASP recommendation for login rate limiting.
  skipSuccessfulRequests: true,
  ...(REDIS_ENABLED
    ? { store: new RedisRateLimitStore('rl:auth', 15 * 60 * 1000) }
    : {}),
  message: { success: false, error: 'Too many login attempts', code: 'AUTH_RATE_LIMIT' },
});
