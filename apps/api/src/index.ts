import { createDatabase } from '@starter/db';
import { createApp } from './app';
import { loadConfig } from './config';
import { createRateLimiter } from './lib/ratelimit';

const config = loadConfig();
const database = createDatabase(config.databaseUrl);

let stopping = false;
let connecting = false;

const redis = new Bun.RedisClient(config.redisUrl, {
  connectionTimeout: 2_000,
  enableOfflineQueue: false,
});

async function connectRedis() {
  if (connecting) return;
  connecting = true;
  try {
    while (!redis.connected && !stopping) {
      try {
        await redis.connect();
      } catch (error) {
        if (!stopping) {
          console.error('Redis is unavailable; API requests will fail closed', error);
        }
      }
      if (!redis.connected && !stopping) await Bun.sleep(1_000);
    }
  } finally {
    connecting = false;
  }
}

redis.onclose = (error) => {
  if (stopping) return;
  console.error('Redis connection lost', error);
  void connectRedis();
};
void connectRedis();

const app = createApp({
  checkDatabase: database.check,
  rateLimiter: createRateLimiter(redis, config.rateLimit),
  trustedProxies: config.trustedProxies,
  webDistDir: config.webDistDir,
  logRequests: true,
});

const server = Bun.serve({ hostname: config.hostname, port: config.port, fetch: app.fetch });
console.log(`API listening on http://localhost:${server.port}`);

async function shutdown() {
  if (stopping) return;
  stopping = true;
  await server.stop();
  redis.onclose = null;
  try {
    redis.close();
  } catch {
    // close() throws when the connection already dropped.
  }
  await database.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
