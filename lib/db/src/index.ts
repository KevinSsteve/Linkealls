import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Recycle idle connections before the serverless Postgres endpoint
  // terminates them from its side.
  idleTimeoutMillis: 30_000,
  max: 10,
});

// Without an error handler, an idle client dropped by the server emits an
// unhandled 'error' event and crashes the whole process (this took down the
// production deployment's health checks). Log and continue — the pool
// discards the broken client and creates a fresh one on the next query.
pool.on("error", (err) => {
  console.error("[db] idle client error (recovered):", err.message);
});
export const db = drizzle(pool, { schema });

export * from "./schema";
