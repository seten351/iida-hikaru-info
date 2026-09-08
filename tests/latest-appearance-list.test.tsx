import assert from "node:assert/strict";
import test from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { LatestAppearanceList } from "../src/app/latest-appearance-list";
import type { AppearanceCard } from "../src/lib/appearances";

const item: AppearanceCard = {
  id: "appearance:latest",
  title: "公開日を基準にした新着情報",
  seriesId: null,
  seriesName: null,
  category: "配信",
  sessions: [{
    id: "latest",
    startsAtPrecision: "unknown",
    startsAt: null,
    startsOn: null,
    sessionLabel: null,
  }],
  sourceUrls: ["https://example.com/official", "https://example.com/official-2"],
  publication: {
    publishedAtPrecision: "date",
    publishedAt: null,
    publishedOn: "2026-09-08",
    collectedAt: "2026-09-08T12:00:00+09:00",
  },
  isGrouped: false,
};

test("latest list keeps the publication date and every official source link", () => {
  const markup = renderToStaticMarkup(<LatestAppearanceList items={[item]} />);

  assert.match(markup, /<ol class="latest-appearance-list" aria-label="新着情報一覧">/);
  assert.match(markup, /公開日を基準にした新着情報/);
  assert.match(markup, /公開 <time dateTime="2026-09-08">2026年9月8日（日付のみ）<\/time>/);
  assert.match(markup, /href="https:\/\/example.com\/official"/);
  assert.match(markup, /href="https:\/\/example.com\/official-2"/);
  assert.match(markup, /aria-label="公開日を基準にした新着情報の公式情報元"/);
  assert.match(markup, /target="_blank" rel="noopener noreferrer"/);
});
