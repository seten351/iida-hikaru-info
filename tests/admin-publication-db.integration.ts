import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import type { getWriterDb } from "../src/db/client";
import { confirmAdminWrite, validateAdminWritePreview } from "../src/server/admin/write-service";
import { publicationOperationHash, runPublicationOperation, type PublicationAppearanceSnapshot } from "../scripts/admin-publication-operation";

test("publication CLI previews match real Admin source writes without changing appearance content", async () => {
  const pg = new PGlite();
  const local = drizzle(pg, { schema });
  const db = local as unknown as ReturnType<typeof getWriterDb>;
  const fields = { id: "publication-test", title: "公開日時検証", category: "音声作品", startsAtPrecision: "date", startsOn: "2026-10-10", startsAt: null, seriesId: null, eventGroupId: null, eventTitle: null, sessionLabel: null };
  const originalSource = { canonicalUrl: "https://example.com/news/original", sourceName: "official:test", externalItemId: "original", evidenceKey: "default", precision: "date", publishedAt: null, publishedOn: "2026-09-01" };
  const snapshot = async (): Promise<PublicationAppearanceSnapshot> => {
    const [row] = await local.select().from(schema.appearancesTable).where(eq(schema.appearancesTable.id, fields.id));
    const links = await local.select().from(schema.appearanceSourceLinksTable).where(eq(schema.appearanceSourceLinksTable.appearanceId, fields.id));
    const sources = await local.select().from(schema.sourceItemsTable);
    const identities = await local.select().from(schema.sourceIdentitiesTable);
    return {
      id: row.id, title: row.title, category: row.category, version: row.version, visibilityStatus: row.visibilityStatus,
      publication: { precision: row.publishedAtPrecision, publishedAt: row.publishedAt?.toISOString() ?? null, publishedOn: row.publishedOn },
      sourceLinks: links.map(link => ({
        sourceId: link.sourceId, evidenceKey: link.evidenceKey, active: link.active, isPrimary: link.isPrimary,
        canonicalUrl: sources.find(source => source.id === link.sourceId)!.canonicalUrl,
        sourceName: identities.find(identity => identity.id === link.sourceIdentityId)!.sourceName,
        externalItemId: identities.find(identity => identity.id === link.sourceIdentityId)!.externalItemId,
        precision: link.publishedAtPrecision, publishedAt: link.publishedAt?.toISOString() ?? null, publishedOn: link.publishedOn,
      })).sort((a, b) => a.sourceId.localeCompare(b.sourceId)),
    };
  };
  let output = "";
  const dependencies = {
    readAppearance: snapshot,
    hasReplay: async (key: string) => (await local.select().from(schema.appearanceProposalsTable).where(eq(schema.appearanceProposalsTable.adminBatchId, key))).length > 0,
    validatePreview: (input: Parameters<typeof validateAdminWritePreview>[0]) => validateAdminWritePreview(input, db),
    confirm: (input: Parameters<typeof confirmAdminWrite>[0], key: string) => confirmAdminWrite(input, key, db),
    log: (value: string) => { output = value; },
  };
  try {
    for (const file of (await readdir("drizzle")).filter(file => file.endsWith(".sql")).sort()) {
      if (file.startsWith("0006_")) await pg.exec("update appearance_backfill_checkpoints set completed_at=now(),dual_write_confirmed_at=now() where id='phase-1b'");
      await pg.exec(await readFile(`drizzle/${file}`, "utf8"));
    }
    await pg.exec("update content_management_state set content_mode='admin',admin_activated_at=now(),legacy_import_locked_at=now() where id='singleton'");
    for (const id of [fields.id, "publication-other"]) {
      await confirmAdminWrite({ kind: "appearance", operation: "create", expectedVersion: null, fields: { ...fields, id }, source: originalSource }, id, db);
    }
    const beforeRows = await local.select().from(schema.appearancesTable);
    const replacement = { ...originalSource, canonicalUrl: "https://example.com/news/replacement", externalItemId: "replacement", publishedOn: "2026-09-02" };
    const secondary = { ...originalSource, canonicalUrl: "https://example.com/store/work", externalItemId: "work", precision: "unknown", publishedOn: null };
    for (const source of [replacement, secondary]) {
      const before = await snapshot();
      const input = { kind: "source", operation: source === replacement ? "replace" : "append", targets: [{ appearanceId: fields.id, expectedVersion: before.version }], source };
      const tablesBefore = await pg.query("select (select count(*) from appearance_proposals) proposals, (select count(*) from appearance_revisions) revisions");
      await runPublicationOperation(input, { apply: false }, dependencies);
      assert.deepEqual(await snapshot(), before);
      assert.deepEqual(await pg.query("select (select count(*) from appearance_proposals) proposals, (select count(*) from appearance_revisions) revisions"), tablesBefore);
      const after = JSON.parse(output).after as PublicationAppearanceSnapshot;
      after.sourceLinks.sort((a, b) => a.sourceId.localeCompare(b.sourceId));
      await runPublicationOperation(input, { apply: true, reviewedHash: publicationOperationHash(input) }, dependencies);
      assert.deepEqual(await snapshot(), after);
      assert.equal((await runPublicationOperation(input, { apply: true, reviewedHash: publicationOperationHash(input) }, dependencies))?.replayed, true);
    }
    const before = await snapshot();
    const primary = before.sourceLinks.find(link => link.active && link.isPrimary)!;
    const input = { kind: "source", operation: "primary", targets: [{ appearanceId: fields.id, expectedVersion: before.version }], source: { sourceId: primary.sourceId, evidenceKey: primary.evidenceKey } };
    await runPublicationOperation(input, { apply: false }, dependencies);
    await runPublicationOperation(input, { apply: true, reviewedHash: publicationOperationHash(input) }, dependencies);
    const rows = await local.select().from(schema.appearancesTable);
    assert.deepEqual(rows.find(row => row.id === "publication-other"), beforeRows.find(row => row.id === "publication-other"));
    const original = beforeRows.find(row => row.id === fields.id)!;
    const changed = rows.find(row => row.id === fields.id)!;
    for (const key of ["title", "category", "startsAt", "startsOn", "seriesId", "eventGroupId", "visibilityStatus", "collectedAt", "firstVisibleAt", "guestInfo"] as const) assert.deepEqual(changed[key], original[key]);
  } finally {
    await pg.close();
  }
});
