import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { voiceAppearances } from "../scripts/appearance-import-data/voice";

test("audio works use verified individual announcements and keep release dates separate", () => {
  const evidence = JSON.parse(readFileSync("docs/voice-data/verification-2026-09-30.json", "utf8"));
  assert.equal(evidence.records.length, 14);
  assert.equal(new Set(evidence.records.map((record: { appearanceId: string }) => record.appearanceId)).size, 14);
  const audio = voiceAppearances.filter(item => item.category === "音声作品");
  assert.equal(audio.length, 14);
  for (const record of evidence.records) {
    const item = audio.find(item => item.id === record.appearanceId);
    assert.ok(item, record.appearanceId);
    assert.equal(item.sourceUrl, record.canonicalUrl);
    assert.equal(item.sourceName, record.sourceName);
    assert.equal(item.sourceItemId, record.externalItemId);
    assert.equal(item.publishedAtPrecision, "exact");
    assert.equal(item.publishedAt, record.publishedAt);
    assert.equal(item.publishedOn, null);
    if (record.releaseOn) assert.equal(item.startsOn, record.releaseOn);
    const url = new URL(item.sourceUrl);
    assert.notEqual(url.pathname, "/");
    if (url.hostname === "x.com") {
      const id = url.pathname.match(/\/status\/(\d+)$/)?.[1];
      assert.equal(id, item.sourceItemId);
      assert.equal(item.publishedAt, new Date(Number((BigInt(id!) >> BigInt(22)) + BigInt(1288834974657))).toISOString());
    }
  }
  assert.equal(audio.find(item => item.id === "toushindai-no-kanojo-school-stay")!.startsOn, "2026-08-13");
});
