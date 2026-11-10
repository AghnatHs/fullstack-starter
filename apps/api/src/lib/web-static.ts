import { resolve } from 'node:path';
import type { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { compress } from 'hono/compress';

export function serveWebApp(app: Hono, distDir: string) {
  const root = resolve(distDir);

  app.get(
    '/assets/*',
    compress(),
    serveStatic({
      root,
      onFound: (_path, c) => c.header('Cache-Control', 'public, max-age=31536000, immutable'),
    }),
  );

  const indexDocument = serveStatic({
    root,
    path: 'index.html',
    onFound: (_path, c) => c.header('Cache-Control', 'no-store'),
  });

  app.on(['GET', 'HEAD'], '*', compress(), async (c, next) => {
    const path = c.req.path;
    if (
      path === '/api' ||
      path.startsWith('/api/') ||
      path === '/assets' ||
      path.startsWith('/assets/')
    ) {
      return next();
    }
    return indexDocument(c, next);
  });
}
