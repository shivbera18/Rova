/**
 * Storage abstraction: one interface, two drivers.
 *  - PG (node-postgres) when DATABASE_URL is set (docker compose)
 *  - Embedded PGlite (WASM postgres, file-persisted or in-memory) otherwise — zero-config demo
 * Both speak the same SQL surface we use (no PostGIS in v1: lat/lng columns + haversine
 * via the protocol package; PostGIS upgrade path documented in plan §6).
 */
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface SqlClient {
  query<T>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
}

export interface Storage {
  sql: SqlClient;
  kind: "pg" | "pglite";
  close(): Promise<void>;
}

export async function openStorage(): Promise<Storage> {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    const pool = new Pool({ connectionString: databaseUrl, max: 10 });
    return {
      kind: "pg",
      sql: {
        async query<T>(text: string, params?: unknown[]): Promise<QueryResult<T>> {
          const r = await pool.query(text, params ?? []);
          return { rows: r.rows as T[], rowCount: r.rowCount ?? 0 };
        },
      },
      close: () => pool.end(),
    };
  }
  const dir = process.env.PGLITE_DIR ?? ".chalo-data";
  const isMemory = dir === ":memory:" || dir === "memory://";
  const db = isMemory ? new PGlite() : new PGlite(dir);
  return {
    kind: "pglite",
    sql: {
      async query<T>(text: string, params?: unknown[]): Promise<QueryResult<T>> {
        const r = await db.query(text, (params ?? []) as never[]);
        return { rows: r.rows as T[], rowCount: r.rows.length };
      },
    },
    close: () => db.close(),
  };
}
