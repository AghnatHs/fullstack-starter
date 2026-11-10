import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL;
if (!url)
  throw new Error('DATABASE_URL is required. Copy .env.example to .env at the repository root.');

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
  dbCredentials: { url },
});
