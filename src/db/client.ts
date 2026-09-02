import { neon, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as drizzleTransaction } from "drizzle-orm/neon-serverless";

import * as schema from "./schema";

function createDb() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const sql = neon(databaseUrl);

  return drizzle(sql, { schema });
}

type Database = ReturnType<typeof createDb>;

let database: Database | null = null;

function createWriterDb() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const pool = new Pool({ connectionString: databaseUrl });

  return {
    db: drizzleTransaction(pool, { schema }),
    pool,
  };
}

type WriterDatabase = ReturnType<typeof createWriterDb>;

let writerDatabase: WriterDatabase | null = null;

export function getDb() {
  if (!database) {
    database = createDb();
  }

  return database;
}

export function getWriterDb() {
  if (!writerDatabase) {
    writerDatabase = createWriterDb();
  }

  return writerDatabase.db;
}

export async function closeWriterDb() {
  if (!writerDatabase) {
    return;
  }

  const current = writerDatabase;
  writerDatabase = null;
  await current.pool.end();
}
