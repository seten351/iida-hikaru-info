import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { appearanceImportData } from "../scripts/appearance-import-data";
import { publicationCorrections } from "../scripts/appearance-import-data/publication-corrections";
import { validateAppearanceImportItems } from "../src/domain/appearance";
import { appearanceSeriesData } from "../scripts/appearance-series-data";

test("publication corrections match audited outcomes and contain only source/publication fields", () => {
  const audit = JSON.parse(readFileSync("docs/publication-audit/2026-09-30.json", "utf8"));
  const applied = audit.records.filter((record: { status: string }) => record.status === "applied-and-verified");
  assert.equal(applied.length, 91);
  for (const record of applied) {
    const actual = publicationCorrections[record.appearanceId];
    assert.deepEqual(actual, {
      sourceUrl: record.after.primarySource,
      sourceName: record.after.sourceName,
      sourceItemId: record.after.sourceItemId,
      publishedAtPrecision: record.after.precision,
      publishedAt: record.after.publishedAt,
      publishedOn: record.after.publishedOn,
    }, record.appearanceId);
  }
  const keys = ["publishedAt", "publishedAtPrecision", "publishedOn", "sourceItemId", "sourceName", "sourceUrl"].sort();
  for (const [id, source] of Object.entries(publicationCorrections)) {
    assert.deepEqual(Object.keys(source).sort(), keys, id);
    const url = new URL(source.sourceUrl);
    assert.equal(url.protocol, "https:");
    assert.equal(url.username + url.password, "");
    if (url.hostname === "x.com") {
      const status = url.pathname.match(/\/status\/(\d+)$/)?.[1];
      assert.equal(status, source.sourceItemId, id);
      assert.equal(source.publishedAtPrecision, "exact");
      assert.equal(source.publishedAt, new Date(Number((BigInt(status!) >> BigInt(22)) + BigInt(1288834974657))).toISOString(), id);
    }
  }
  validateAppearanceImportItems(appearanceImportData, appearanceSeriesData);
  assert.equal(new Set(appearanceImportData.map(item => item.id)).size, appearanceImportData.length);
});
