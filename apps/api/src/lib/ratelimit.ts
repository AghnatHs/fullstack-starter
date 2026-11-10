export type RateLimitResult =
  | { readonly allowed: true; readonly remaining: number }
  | { readonly allowed: false; readonly retryAfterSeconds: number };

export type RateLimiter = (key: string) => Promise<RateLimitResult>;

export type RedisCounter = {
  set(key: string, value: string, ...options: string[]): Promise<string | null>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
};

export type RateLimitOptions = { readonly max: number; readonly windowSeconds: number };

export function createRateLimiter(redis: RedisCounter, options: RateLimitOptions): RateLimiter {
  const { max, windowSeconds } = options;

  return async (key) => {
    const redisKey = `ratelimit:${key}`;
    await redis.set(redisKey, '0', 'EX', String(windowSeconds), 'NX');

    const count = await redis.incr(redisKey);
    if (count === 1) {
      // The key can expire between SET NX and INCR; repairing it keeps the window bounded.
      await redis.expire(redisKey, windowSeconds);
    }
    if (count <= max) return { allowed: true, remaining: max - count };

    const ttl = await redis.ttl(redisKey);
    return { allowed: false, retryAfterSeconds: ttl > 0 ? ttl : windowSeconds };
  };
}
