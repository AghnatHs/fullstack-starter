import { z } from 'zod';
import { type ParsedNetwork, parseTrustedProxies } from './lib/client-ip';
import type { RateLimitOptions } from './lib/ratelimit';
import { formatIssues } from './lib/validation';

export type Config = {
  readonly databaseUrl: string;
  readonly hostname: string;
  readonly port: number;
  readonly redisUrl: string;
  readonly rateLimit: RateLimitOptions;
  readonly trustedProxies: ParsedNetwork[];
  readonly webDistDir: string | undefined;
};

const trustedProxiesSchema = z
  .string()
  .default('')
  .transform((value, ctx) => {
    try {
      return parseTrustedProxies(value);
    } catch (error) {
      ctx.addIssue({
        code: 'custom',
        message: error instanceof Error ? error.message : 'Invalid trusted proxy configuration',
      });
      return z.NEVER;
    }
  });

const envSchema = z.object({
  DATABASE_URL: z.string().trim().min(1),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3100),
  REDIS_URL: z.string().trim().min(1),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(60),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
  TRUSTED_PROXIES: trustedProxiesSchema,
  WEB_DIST_DIR: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${formatIssues(parsed.error)}`);
  }

  const values = parsed.data;
  return {
    databaseUrl: values.DATABASE_URL,
    hostname: '0.0.0.0',
    port: values.API_PORT,
    redisUrl: values.REDIS_URL,
    rateLimit: {
      max: values.RATE_LIMIT_MAX,
      windowSeconds: values.RATE_LIMIT_WINDOW_SECONDS,
    },
    trustedProxies: values.TRUSTED_PROXIES,
    webDistDir: values.WEB_DIST_DIR,
  };
}
