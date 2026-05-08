/**
 * Redis configuration — Upstash REST adapter
 *
 * Uses @upstash/redis for serverless-friendly HTTP-based Redis.
 * Provides a thin wrapper that matches the API surface the rest of the
 * codebase expects (get, set, del, incr, ttl, pExpire, pTTL, decr).
 */

import { Redis } from '@upstash/redis';
import { logger } from '../utils/logger';

// Environment variables — Upstash REST. No hardcoded fallbacks; if unset,
// the adapter stays null and connectRedis logs a clear warning.
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL ?? '';
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? '';

const hasUpstash = UPSTASH_URL.length > 0 && UPSTASH_TOKEN.length > 0;

// ── Upstash client ────────────────────────────────────────────────────────────
const upstash = hasUpstash
  ? new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN })
  : null;

/**
 * Wrapper that gives the rest of the codebase the same interface it had
 * with the `redis` npm package (get, set, del, incr, decr, ttl, pExpire, pTTL).
 */
class UpstashRedisAdapter {
  private client: Redis;

  constructor(client: Redis) {
    this.client = client;
  }

  /** GET key → string | null */
  async get(key: string): Promise<string | null> {
    const val = await this.client.get<string>(key);
    return val ?? null;
  }

  /** SET key value [EX seconds] */
  async set(key: string, value: string, opts?: { EX?: number }): Promise<void> {
    if (opts?.EX) {
      await this.client.set(key, value, { ex: opts.EX });
    } else {
      await this.client.set(key, value);
    }
  }

  /** DEL key */
  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  /** INCR key → number */
  async incr(key: string): Promise<number> {
    return await this.client.incr(key);
  }

  /** DECR key → number */
  async decr(key: string): Promise<number> {
    return await this.client.decr(key);
  }

  /** TTL key → seconds (-2 if not exists, -1 if no expiry) */
  async ttl(key: string): Promise<number> {
    return await this.client.ttl(key);
  }

  /** PEXPIRE key milliseconds */
  async pExpire(key: string, ms: number): Promise<void> {
    await this.client.pexpire(key, ms);
  }

  /** PTTL key → milliseconds */
  async pTTL(key: string): Promise<number> {
    return await this.client.pttl(key);
  }
}

const _adapter = upstash ? new UpstashRedisAdapter(upstash) : null;

// Export with the same name the rest of the codebase uses
export const redisClient = _adapter as UpstashRedisAdapter;

export const connectRedis = async (): Promise<void> => {
  if (!_adapter) {
    logger.warn('Upstash Redis not configured (UPSTASH_REDIS_REST_URL / TOKEN missing) — Redis disabled');
    return;
  }
  // Upstash REST is stateless — no persistent connection needed.
  // Verify connectivity with a PING.
  try {
    const upstashClient = upstash!;
    await upstashClient.ping();
    logger.info('Upstash Redis connected (REST) ✓');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Upstash Redis PING failed', { error: msg });
  }
};
