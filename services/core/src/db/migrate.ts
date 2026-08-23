/** Migration runner — splits DDL into single statements (PGlite limit) and is idempotent. */
import type { SqlRowClient } from "../types.ts";
import { openStorage } from "./storage.ts";
import { MIGRATIONS } from "./migrations.ts";
import { MIGRATIONS_RATINGS } from "./migrations-ratings.ts";
import { MIGRATIONS_INTEGRATION } from "./migrations-integration.ts";

const ALL_MIGRATIONS = [...MIGRATIONS, ...MIGRATIONS_RATINGS, ...MIGRATIONS_INTEGRATION];

export async function runMigrations(sql: SqlRowClient): Promise<void> {
  for (const m of ALL_MIGRATIONS) {
    const statements = m.sql
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) await sql.query(stmt);
  }
}

// CLI: pnpm db:migrate
if (process.argv[1]?.replace(/\\/g, "/").endsWith("db/migrate.ts")) {
  const storage = await openStorage();
  await runMigrations(storage.sql);
  console.log(`applied ${MIGRATIONS.length} migration(s)`);
  await storage.close();
}
