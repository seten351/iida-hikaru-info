import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { AdminSourceInput } from "../src/server/admin/write-input";
import { DeadlinePrimaryPreview, DeadlineSourceFields } from "../src/app/admin/(protected)/deadlines/source-fields";

const source: AdminSourceInput = {
  canonicalUrl: "https://example.test/news/123", sourceName: "official", externalItemId: "123", evidenceKey: "initial",
  precision: "date", publishedAt: null, publishedOn: "2026-10-01",
};

test("unchanged primary is explicit while additional evidence leaves it intact", () => {
  const html = renderToStaticMarkup(<DeadlinePrimaryPreview before={source} after={{ ...source }} />);
  assert.match(html, /Primary告知元: 維持/);
  assert.match(html, /primary告知元を変更せず/);
});

test("replacing primary is explicit in Preview", () => {
  const html = renderToStaticMarkup(<DeadlinePrimaryPreview before={source} after={{ ...source, canonicalUrl: "https://example.test/news/resale" }} />);
  assert.match(html, /Primary告知元: 変更あり/);
  assert.match(html, /変更前:.*news\/123/);
  assert.match(html, /変更後:.*news\/resale/);
  assert.match(html, /公開発表日時への影響/);
});

test("changing only primary publication precision is also visible in Preview", () => {
  const html = renderToStaticMarkup(<DeadlinePrimaryPreview before={source} after={{ ...source, precision: "unknown", publishedOn: null }} />);
  assert.match(html, /変更あり/);
});

test("X evidence keeps automatic exact publication without requiring an invented timestamp", () => {
  const html = renderToStaticMarkup(<DeadlineSourceFields source={{ ...source, canonicalUrl: "https://x.com/official/status/123456789", sourceName: "x:official", externalItemId: "123456789", precision: "exact", publishedOn: null }} onChange={() => {}} />);
  assert.match(html, /ポストIDから自動算出/);
  assert.match(html, /<select disabled=""/);
  assert.doesNotMatch(html, /<input required=""[^>]*placeholder="ポストIDから自動算出/);
});
