import { describe, expect, test } from 'bun:test';
import { createRateLimiter, type RedisCounter } from '../src/lib/ratelimit';

function createFakeRedis() {
  let nowSeconds = 1_000;
  const entries = new Map<string, { count: number; expiresAt: number }>();

  const redis: RedisCounter = {
    async set(key, value, ...options) {
      const existing = entries.get(key);
      const isNew = !existing || existing.expiresAt <= nowSeconds;
      if (options.includes('NX') && !isNew) return null;

      const expiryIndex = options.indexOf('EX');
      const seconds =
        expiryIndex >= 0 ? Number(options[expiryIndex + 1]) : Number.POSITIVE_INFINITY;
      entries.set(key, { count: Number(value), expiresAt: nowSeconds + seconds });
      return 'OK';
    },
    async incr(key) {
      const entry = entries.get(key);
      if (!entry || entry.expiresAt <= nowSeconds) {
        entries.set(key, { count: 1, expiresAt: Number.POSITIVE_INFINITY });
        return 1;
      }
      entry.count += 1;
      return entry.count;
    },
    async expire(key, seconds) {
      const entry = entries.get(key);
      if (!entry) return 0;
      entry.expiresAt = nowSeconds + seconds;
      return 1;
    },
    async ttl(key) {
      const entry = entries.get(key);
      if (!entry || entry.expiresAt === Number.POSITIVE_INFINITY) return -1;
      return Math.max(Math.ceil(entry.expiresAt - nowSeconds), 0);
    },
  };

  return {
    redis,
    advance(seconds: number) {
      nowSeconds += seconds;
    },
  };
}

describe('Redis fixed-window rate limiter', () => {
  test('allows the configured budget and reports the wait for the rest of the window', async () => {
    const { redis, advance } = createFakeRedis();
    const limit = createRateLimiter(redis, { max: 2, windowSeconds: 60 });

    expect(await limit('203.0.113.7')).toEqual({ allowed: true, remaining: 1 });
    expect(await limit('203.0.113.7')).toEqual({ allowed: true, remaining: 0 });
    expect(await limit('203.0.113.7')).toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });

    advance(30);
    expect(await limit('203.0.113.7')).toEqual({
      allowed: false,
      retryAfterSeconds: 30,
    });

    advance(30);
    expect(await limit('203.0.113.7')).toEqual({ allowed: true, remaining: 1 });
  });

  test('tracks clients independently', async () => {
    const { redis } = createFakeRedis();
    const limit = createRateLimiter(redis, { max: 1, windowSeconds: 60 });

    expect((await limit('198.51.100.1')).allowed).toBe(true);
    expect((await limit('198.51.100.2')).allowed).toBe(true);
    expect((await limit('198.51.100.1')).allowed).toBe(false);
  });

  test('propagates Redis errors so the caller can fail closed', async () => {
    const redis: RedisCounter = {
      set: async () => {
        throw new Error('connection lost');
      },
      incr: async () => 1,
      expire: async () => 1,
      ttl: async () => 60,
    };
    const limit = createRateLimiter(redis, { max: 1, windowSeconds: 60 });
    expect(limit('203.0.113.7')).rejects.toThrow('connection lost');
  });
});
