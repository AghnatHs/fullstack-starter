import { SQL } from 'bun';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';
import * as schema from './schema';

export function createDatabase(url: string) {
  const client = new SQL(url, {
    connectionTimeout: 2,
    connection: { statement_timeout: '2000' },
  });
  const db = drizzle({ client, schema });

  return {
    db,
    async check() {
      await db.execute(sql`SELECT 1`);
    },
    close: () => client.close({ timeout: 5 }),
  };
}
