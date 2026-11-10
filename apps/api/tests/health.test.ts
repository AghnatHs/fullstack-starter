import { describe, expect, test } from 'bun:test';
import { createTestApp } from './test-app';

describe('health endpoints', () => {
  test('liveness stays available when database access fails', async () => {
    const app = createTestApp({
      checkDatabase: async () => {
        throw new Error('Database is offline');
      },
    });
    const response = await app.request('/api/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  test('readiness reports outage without leaking credentials and recovers on the next request', async () => {
    let available = false;
    const app = createTestApp({
      checkDatabase: async () => {
        if (!available) throw new Error('postgres://admin:private-password@database/internal');
      },
    });

    const unavailable = await app.request('/api/ready');
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({ status: 'not_ready', database: 'down' });
    expect(unavailable.headers.get('cache-control')).toBe('no-store');

    available = true;
    const recovered = await app.request('/api/ready');
    expect(recovered.status).toBe(200);
    expect(await recovered.json()).toEqual({ status: 'ready', database: 'up' });
    expect(recovered.headers.get('cache-control')).toBe('no-store');
  });
});
