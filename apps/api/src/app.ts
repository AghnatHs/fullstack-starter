import { Hono } from 'hono';
import { logger } from 'hono/logger';
import type { ParsedNetwork } from './lib/client-ip';
import type { RateLimiter } from './lib/ratelimit';
import { noStore } from './middleware/api-cache';
import { handleError, handleNotFound } from './middleware/error';
import { rateLimit } from './middleware/rate-limit';
import { createHealthRoutes } from './platform/health/routes';
import { serveWebApp } from './lib/web-static';

export type AppDependencies = {
  readonly checkDatabase: () => Promise<void>;
  readonly rateLimiter: RateLimiter;
  readonly trustedProxies: ParsedNetwork[];
  readonly webDistDir?: string;
  readonly logRequests?: boolean;
};

export function createApp(deps: AppDependencies) {
  const app = new Hono();

  if (deps.logRequests) app.use('*', logger());

  app.use('/api/*', noStore);
  app.use('/api/*', rateLimit({ limiter: deps.rateLimiter, trustedProxies: deps.trustedProxies }));

  app.route('/api', createHealthRoutes(deps.checkDatabase));

  if (deps.webDistDir) serveWebApp(app, deps.webDistDir);

  app.notFound(handleNotFound);
  app.onError(handleError);

  return app;
}
