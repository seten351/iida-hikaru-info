import assert from "node:assert/strict";
import test from "node:test";
import { parseNewsFeed } from "../../scripts/patrol/scrapers/news-feed";
import { parseRaccoonDogProfile } from "../../scripts/patrol/scrapers/raccoon-dog";
import { candidateId, publishedAtFromX } from "../../scripts/patrol/types";
import { fetchText } from "../../scripts/patrol/http";

test("RSS becomes reviewable candidates without treating RSS dates as official announcements", () => {
  const [candidate] = parseNewsFeed('<rss><channel><item><title><![CDATA[飯田ヒカル A & B]]></title><link>https://news.google.com/rss/articles/example?oc=5</link><pubDate>Thu, 24 Sep 2026 09:00:00 GMT</pubDate></item></channel></rss>');
  assert.equal(candidate.title, "飯田ヒカル A & B");
  assert.equal(candidate.kind, "news");
  assert.equal(candidate.publishedAt, null);
  assert.match(candidate.note, /2026-09-24T09:00:00.000Z/);
  assert.equal(candidateId(candidate), candidateId({ ...candidate }));
  assert.notEqual(candidateId(candidate), candidateId({ ...candidate, title: "訂正された記事" }));
});

test("bad source documents fail instead of returning no updates", () => {
  assert.throws(() => parseNewsFeed("<html>blocked</html>"));
  assert.throws(() => parseNewsFeed("<rss><channel><item><title>broken</title></item></channel></rss>"));
  assert.throws(() => parseRaccoonDogProfile("<html>new layout</html>"));
  assert.deepEqual(parseNewsFeed("<rss><channel></channel></rss>"), []);
});

test("profile extraction supports attributes and nested tags and uses stable identities", () => {
  const html = '<h4 class="section">ゲーム</h4><dl><dt><a>作品Ａ &amp; B</a></dt><dd>役名</dd></dl><h4>ボイスコミック</h4><dl><dt>作品2</dt><dd>役2</dd></dl>';
  const candidates = parseRaccoonDogProfile(html);
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].title, "作品Ａ & B（役名）");
  assert.equal(candidates[1].category, "音声作品");
  assert.deepEqual(candidates.map(candidateId), parseRaccoonDogProfile(html).map(candidateId));
});

test("X timestamps are recovered from Snowflake IDs without inventing a date", () => {
  assert.equal(publishedAtFromX("https://x.com/onsenradio/status/2099800669310083073"), "2026-09-15T10:01:06.630Z");
  assert.equal(publishedAtFromX("https://x.com/onsenradio"), null);
});

test("HTTP errors and empty pages propagate as collection failures", async (context) => {
  context.mock.method(globalThis, "fetch", async () => new Response("not found", { status: 404 }));
  await assert.rejects(fetchText("https://www.onsen.ag/program/umauma"), /HTTP 404/);
  context.mock.restoreAll();
  context.mock.method(globalThis, "fetch", async () => new Response(""));
  await assert.rejects(fetchText("https://www.onsen.ag/program/umauma"), /empty response/);
});
