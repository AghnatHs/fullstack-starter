import { describe, expect, spyOn, test } from 'bun:test';
import { createTestApp } from './test-app';

describe('API request policy', () => {
  test('returns 429 with Retry-After once the budget is exhausted', async () => {
    let calls = 0;
    const app = createTestApp({
      rateLimiter: async () =>
        calls++ === 0 ? { allowed: true, remaining: 0 } : { allowed: false, retryAfterSeconds: 42 },
    });

    const allowed = await app.request('/api/unknown');
    expect(allowed.status).toBe(404);
    expect(await allowed.json()).toEqual({ error: 'Not found' });

    const limited = await app.request('/api/unknown');
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: 'Too many requests' });
    expect(limited.headers.get('retry-after')).toBe('42');
    expect(limited.headers.get('cache-control')).toBe('no-store');
  });

  test('never rate-limits liveness or readiness probes', async () => {
    let limited = false;
    const app = createTestApp({
      rateLimiter: async () => {
        limited = true;
        return { allowed: false, retryAfterSeconds: 60 };
      },
    });

    expect((await app.request('/api/health')).status).toBe(200);
    expect((await app.request('/api/ready')).status).toBe(200);
    expect(limited).toBe(false);
  });

  test('fails closed with 503 when Redis is unavailable', async () => {
    const consoleError = spyOn(console, 'error').mockImplementation(() => {});
    const app = createTestApp({
      rateLimiter: async () => {
        throw new Error('Redis connection refused');
      },
    });

    const response = await app.request('/api/unknown');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Service unavailable' });
    expect(response.headers.get('cache-control')).toBe('no-store');
    consoleError.mockRestore();
  });

  test('returns JSON 404 for unknown API routes', async () => {
    const missing = await createTestApp().request('/api/missing');
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'Not found' });
  });
});
