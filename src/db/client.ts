import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

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

export function getDb() {
  if (!database) {
    database = createDb();
  }

  return database;
}
