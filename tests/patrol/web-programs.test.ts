import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  parseHikaroomProgramAtom,
  parseOnsenProgramHtml,
  parsePikanonoProgramAtom,
} from "../../scripts/patrol/scrapers/web-programs";

const fixture = (name: string) => readFileSync(join(process.cwd(), "tests/patrol/fixtures", name), "utf8");

test("音泉は番組表の本編だけを各回一度ずつ候補にする", () => {
  const candidates = parseOnsenProgramHtml(fixture("onsen-umauma.html"));

  assert.deepEqual(candidates.map((candidate) => candidate.key), [
    "program:kannahikaru:15",
    "program:kannahikaru:14",
  ]);
  assert.ok(candidates.every((candidate) => candidate.publishedAt === null));
  assert.ok(candidates.every((candidate) => candidate.note.includes("個別告知URLと公開日時は未確認")));
});

test("ヒカROOM Atomは公式チャンネルの本編だけを動画公開日時付き候補にする", () => {
  const candidates = parseHikaroomProgramAtom(fixture("hikaroom-atom.xml"));

  assert.deepEqual(candidates.map((candidate) => [candidate.appearanceId, candidate.sourceUrl, candidate.publishedAt]), [
    ["hikaroom-episode-36", "https://www.youtube.com/watch?v=zFU8AjGz_BY", "2026-09-22T00:01:49.000Z"],
    ["hikaroom-episode-35", "https://www.youtube.com/watch?v=UpOrTLZJBqM", "2026-08-31T11:00:00.000Z"],
  ]);
});

test("ぴかのの定理 Atomは全角番号を受け付け、おまけを除外する", () => {
  const candidates = parsePikanonoProgramAtom(fixture("pikanono-atom.xml"));

  assert.deepEqual(candidates.map((candidate) => candidate.key), ["program:pikanono:13", "program:pikanono:12"]);
});

test("想定外チャンネルと空の番組構造は監視失敗として送出する", () => {
  assert.throws(
    () => parseHikaroomProgramAtom(fixture("hikaroom-atom.xml").replaceAll("UC7ebYYsL-Uj3Q724lD2lR1Q", "wrong-channel")),
    /cannot be verified/,
  );
  assert.throws(() => parseOnsenProgramHtml("<main></main>"), /does not identify/);
  assert.throws(
    () => parseHikaroomProgramAtom(fixture("hikaroom-atom.xml").replace(/<published>[^<]+<\/published>/g, "<published>invalid</published>")),
    /publication timestamp/,
  );
});
