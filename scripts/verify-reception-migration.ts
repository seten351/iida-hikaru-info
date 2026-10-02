import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
import { PGlite } from "@electric-sql/pglite";
import { databaseCacheScope } from "../src/server/public-cache/policy";

// No auth-attempts, environment contents or credentials are copied or logged.
const tables = [
  "appearance_backfill_checkpoints", "content_management_state", "appearance_series",
  "source_items", "source_identities", "appearances", "appearance_proposals",
  "appearance_series_proposals", "appearance_source_links", "proposal_source_links",
  "appearance_revisions", "appearance_series_revisions", "deadlines",
  "deadline_appearance_links", "deadline_source_links", "deadline_proposals", "deadline_revisions",
] as const;
const addedColumns = ["information_type", "starts_at_precision", "starts_at", "starts_on", "phase_override", "sale_mode"];
const snapshotSql = `select jsonb_build_object(${tables.map(table => `'${table}', (select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), '[]'::jsonb) from ${table} t)`).join(", ")}) as snapshot`;
type Snapshot = Record<typeof tables[number], Record<string, unknown>[]>;

function fingerprint(snapshot: unknown) {
  // Relation row order is immaterial; arrays inside persisted JSON retain their
  // order so changes to evidence, guest names or historical inputs are detected.
  const canonical = (value: unknown, depth = 0): string => {
    if (Array.isArray(value)) {
      const items = value.map(item => canonical(item, depth + 1));
      return `[${(depth <= 1 ? items.sort() : items).join(",")}]`;
    }
    if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item, depth + 1)}`).join(",")}}`;
    return JSON.stringify(value);
  };
  return createHash("sha256").update(canonical(snapshot)).digest("hex");
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for the read-only snapshot.");
  const files = (await readdir("drizzle")).filter(file => file.endsWith(".sql")).sort();
  const legacyFiles = files.filter(file => Number(file.slice(0, 4)) <= 13);
  const additions = files.filter(file => Number(file.slice(0, 4)) > 13);
  const reader = neon(databaseUrl);
  // The only remote transaction is explicitly READ ONLY; all migration SQL runs in RAM below.
  const [settings, historyRows, snapshotRows] = await reader.transaction([
    reader.query("select current_setting('TimeZone') as timezone"),
    reader.query("select hash, created_at from drizzle.__drizzle_migrations order by created_at"),
    reader.query(snapshotSql),
  ], { readOnly: true, isolationLevel: "RepeatableRead" });
  if (historyRows.length !== legacyFiles.length) throw new Error("Source migration count differs from the expected 0000–0013 baseline.");
  for (const [index, file] of legacyFiles.entries()) {
    if (historyRows[index].hash !== createHash("sha256").update(await readFile(`drizzle/${file}`, "utf8")).digest("hex")) throw new Error(`Source migration hash differs: ${file}`);
  }
  const source = snapshotRows[0].snapshot as Snapshot;
  const pg = new PGlite();
  try {
    await pg.query("select set_config('TimeZone', $1, false)", [settings[0].timezone]);
    for (const file of legacyFiles) {
      if (file.startsWith("0006_")) await pg.exec("update appearance_backfill_checkpoints set completed_at=now(), dual_write_confirmed_at=now() where id='phase-1b'");
      await pg.exec(await readFile(`drizzle/${file}`, "utf8"));
    }
    await pg.transaction(async tx => {
      await tx.exec(`truncate ${tables.join(", ")} cascade; set constraints all deferred`);
      for (const table of tables) {
        if (source[table].length) await tx.query(`insert into ${table} select * from jsonb_populate_recordset(null::${table}, $1::jsonb)`, [JSON.stringify(source[table])]);
      }
    });
    const before = (await pg.query<{ snapshot: Snapshot }>(snapshotSql)).rows[0].snapshot;
    if (fingerprint(before) !== fingerprint(source)) {
      const differences = tables.filter(table => fingerprint(before[table]) !== fingerprint(source[table]));
      const columns = differences.map(table => {
        const keys = new Set(source[table].flatMap(row => Object.keys(row)));
        return `${table}(${[...keys].filter(key => fingerprint(before[table].map(row => row[key])) !== fingerprint(source[table].map(row => row[key]))).join(",")})`;
      });
      throw new Error(`Isolated restore differs from the source snapshot: ${columns.join("; ")}`);
    }
    for (const file of additions) await pg.exec(await readFile(`drizzle/${file}`, "utf8"));
    const after = (await pg.query<{ snapshot: Snapshot }>(snapshotSql)).rows[0].snapshot;
    for (const row of after.deadlines) {
      if (row.information_type !== "unspecified" || row.starts_at_precision !== "unknown" || row.starts_at !== null || row.starts_on !== null || row.phase_override !== "auto" || row.sale_mode !== "initial") throw new Error("Migration inferred or changed reception fields.");
      for (const column of addedColumns) delete row[column];
    }
    if (fingerprint(before) !== fingerprint(after)) throw new Error("Migration changed legacy content, audit history or timestamp precision.");
    console.log(JSON.stringify({ mode: "remote-read-only/local-in-memory", sourceDbScope: databaseCacheScope(databaseUrl),
      sourceMigrations: historyRows.length, verifiedMigrations: additions,
      counts: Object.fromEntries(tables.map(table => [table, source[table].length])),
      legacyFingerprint: fingerprint(before), unchanged: true, snapshotPersisted: false }, null, 2));
  } finally { await pg.close(); }
}

main().catch(error => {
  // Native network and driver errors can contain connection details.
  const message = error instanceof Error && /^(Source migration|Isolated restore|Migration |DATABASE_URL)/.test(error.message)
    ? error.message : "Read-only source snapshot or isolated migration verification failed.";
  console.error(message);
  process.exitCode = 1;
});
