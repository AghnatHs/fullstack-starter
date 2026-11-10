import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestApp } from './test-app';

const INDEX_HTML = '<!doctype html><html><body><div id="root"></div></body></html>';
const ASSET_JS = "console.log('asset');";

describe('SPA serving', () => {
  let distDir: string;

  beforeAll(async () => {
    distDir = await mkdtemp(join(tmpdir(), 'starter-web-'));
    await mkdir(join(distDir, 'assets'), { recursive: true });
    await Bun.write(join(distDir, 'index.html'), INDEX_HTML);
    await Bun.write(join(distDir, 'assets', 'app-abc123.js'), ASSET_JS);
  });

  afterAll(async () => {
    await rm(distDir, { recursive: true, force: true });
  });

  test('serves the document for client routes without caching it', async () => {
    const app = createTestApp({ webDistDir: distDir });

    const root = await app.request('/');
    expect(root.status).toBe(200);
    expect(await root.text()).toBe(INDEX_HTML);
    expect(root.headers.get('cache-control')).toBe('no-store');

    const clientRoute = await app.request('/tenders/42');
    expect(clientRoute.status).toBe(200);
    expect(await clientRoute.text()).toBe(INDEX_HTML);
  });

  test('serves hashed assets with immutable caching', async () => {
    const app = createTestApp({ webDistDir: distDir });
    const asset = await app.request('/assets/app-abc123.js');

    expect(asset.status).toBe(200);
    expect(await asset.text()).toBe(ASSET_JS);
    expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(asset.headers.get('content-type')).toContain('javascript');
  });

  test('never falls back to the document for API, asset, or non-GET requests', async () => {
    const app = createTestApp({ webDistDir: distDir });

    const missingAsset = await app.request('/assets/missing.js');
    expect(missingAsset.status).toBe(404);
    expect(await missingAsset.json()).toEqual({ error: 'Not found' });

    const bareAssets = await app.request('/assets');
    expect(bareAssets.status).toBe(404);
    expect(await bareAssets.json()).toEqual({ error: 'Not found' });

    const missingApi = await app.request('/api/missing');
    expect(missingApi.status).toBe(404);
    expect(await missingApi.json()).toEqual({ error: 'Not found' });

    const post = await app.request('/tenders', { method: 'POST' });
    expect(post.status).toBe(404);
  });

  test('leaves SPA requests outside the rate limiter', async () => {
    const app = createTestApp({
      webDistDir: distDir,
      rateLimiter: async () => {
        throw new Error('should not be called');
      },
    });

    expect((await app.request('/')).status).toBe(200);
    expect((await app.request('/assets/app-abc123.js')).status).toBe(200);
  });

  test('returns JSON 404 for the document when no build is configured', async () => {
    const app = createTestApp();
    const response = await app.request('/');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Not found' });
  });
});
