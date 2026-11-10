import type { MiddlewareHandler } from 'hono';

export const noStore: MiddlewareHandler = async (c, next) => {
  c.header('Cache-Control', 'no-store');
  await next();
};
