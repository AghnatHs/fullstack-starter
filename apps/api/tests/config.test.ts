import { describe, expect, test } from 'bun:test';
import { loadConfig } from '../src/config';

const baseEnv = {
  DATABASE_URL: 'postgresql://starter:secret@localhost:5432/starter',
  REDIS_URL: 'redis://localhost:6379',
};

describe('runtime configuration', () => {
  test('applies documented defaults', () => {
    const config = loadConfig(baseEnv);
    expect(config.port).toBe(3100);
    expect(config.rateLimit).toEqual({ max: 60, windowSeconds: 60 });
    expect(config.trustedProxies).toEqual([]);
    expect(config.webDistDir).toBeUndefined();
  });

  test('reads overrides', () => {
    const config = loadConfig({
      ...baseEnv,
      API_PORT: '4100',
      RATE_LIMIT_MAX: '5',
      RATE_LIMIT_WINDOW_SECONDS: '30',
      TRUSTED_PROXIES: '10.0.0.0/8, 192.168.0.1',
      WEB_DIST_DIR: 'apps/web/dist',
    });
    expect(config.port).toBe(4100);
    expect(config.rateLimit).toEqual({ max: 5, windowSeconds: 30 });
    expect(config.trustedProxies).toHaveLength(2);
    expect(config.webDistDir).toBe('apps/web/dist');
  });

  test('treats empty optional values as absent', () => {
    const config = loadConfig({ ...baseEnv, TRUSTED_PROXIES: '', WEB_DIST_DIR: '' });
    expect(config.trustedProxies).toEqual([]);
    expect(config.webDistDir).toBeUndefined();
  });

  test('fails with the variable name when database configuration is missing', () => {
    expect(() => loadConfig({ REDIS_URL: 'redis://localhost:6379' })).toThrow('DATABASE_URL');
  });

  test('fails with the variable name when rate limiting has no Redis URL', () => {
    expect(() => loadConfig({ DATABASE_URL: baseEnv.DATABASE_URL })).toThrow('REDIS_URL');
  });

  test('rejects invalid ports, limits, and proxy entries', () => {
    expect(() => loadConfig({ ...baseEnv, API_PORT: '0' })).toThrow('API_PORT');
    expect(() => loadConfig({ ...baseEnv, API_PORT: 'not-a-port' })).toThrow('API_PORT');
    expect(() => loadConfig({ ...baseEnv, RATE_LIMIT_MAX: '0' })).toThrow('RATE_LIMIT_MAX');
    expect(() => loadConfig({ ...baseEnv, RATE_LIMIT_WINDOW_SECONDS: '1.5' })).toThrow(
      'RATE_LIMIT_WINDOW_SECONDS',
    );
    expect(() => loadConfig({ ...baseEnv, TRUSTED_PROXIES: '10.0.0.0/8, nope' })).toThrow('nope');
  });
});
