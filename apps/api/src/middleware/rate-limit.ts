import type { Context, MiddlewareHandler } from 'hono';
import { type ParsedNetwork, resolveClientIp } from '../lib/client-ip';
import { AppError } from '../lib/errors';
import type { RateLimiter, RateLimitResult } from '../lib/ratelimit';

const PROBE_PATHS: Record<string, true> = {
  '/api/health': true,
  '/api/ready': true,
};

type ConnectionServer = {
  requestIP(request: Request): { address: string } | null;
};

function connectionServer(c: Context): ConnectionServer | undefined {
  const env = c.env as ConnectionServer | { server?: ConnectionServer } | undefined;
  if (!env || typeof env !== 'object') return undefined;
  return 'requestIP' in env ? env : env.server;
}

export function rateLimit(options: {
  readonly limiter: RateLimiter;
  readonly trustedProxies: ParsedNetwork[];
}): MiddlewareHandler {
  return async (c, next) => {
    if (PROBE_PATHS[c.req.path]) return next();

    const clientIp = resolveClientIp({
      directAddress: connectionServer(c)?.requestIP(c.req.raw)?.address,
      forwardedFor: c.req.header('x-forwarded-for'),
      trustedProxies: options.trustedProxies,
    });

    let result: RateLimitResult;
    try {
      result = await options.limiter(clientIp);
    } catch (error) {
      console.error('Rate limiter unavailable', error);
      throw new AppError(503, 'Service unavailable');
    }

    if (!result.allowed) {
      throw new AppError(429, 'Too many requests', {
        'Retry-After': String(result.retryAfterSeconds),
      });
    }

    await next();
  };
}
