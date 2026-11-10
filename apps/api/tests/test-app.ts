import { createApp, type AppDependencies } from '../src/app';

export function createTestApp(overrides: Partial<AppDependencies> = {}) {
  return createApp({
    checkDatabase: async () => {},
    rateLimiter: async () => ({ allowed: true, remaining: 1 }),
    trustedProxies: [],
    logRequests: false,
    ...overrides,
  });
}
