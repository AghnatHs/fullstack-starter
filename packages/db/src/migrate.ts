import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/bun-sql/migrator';
import { createDatabase } from './index';

const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

if (!existsSync(migrationsFolder)) {
  console.log('No migrations yet. Define your tables and run bun run db:generate first.');
} else {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required.');
  const database = createDatabase(url);
  try {
    await migrate(database.db, { migrationsFolder });
    console.log('Migrations applied.');
  } finally {
    await database.close();
  }
}
