import { Hono } from 'hono';
import type { Health, Readiness } from '@starter/shared';

export function createHealthRoutes(checkDatabase: () => Promise<void>) {
  const routes = new Hono();

  routes.get('/health', (c) => c.json({ status: 'ok' } satisfies Health));

  routes.get('/ready', async (c) => {
    try {
      await checkDatabase();
      return c.json({ status: 'ready', database: 'up' } satisfies Readiness);
    } catch {
      return c.json({ status: 'not_ready', database: 'down' } satisfies Readiness, 503);
    }
  });

  return routes;
}
