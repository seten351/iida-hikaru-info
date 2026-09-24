import { load } from "cheerio";
import { fetchText } from "../http";
import type { PatrolCandidate } from "../types";

export const NEWS_RSS_URL = "https://news.google.com/rss/search?q=%22%E9%A3%AF%E7%94%B0%E3%83%92%E3%82%AB%E3%83%AB%22+when%3A7d&hl=ja&gl=JP&ceid=JP:ja";

export function parseNewsFeed(xml: string): PatrolCandidate[] {
  const $ = load(xml, { xml: true });
  if ($("rss > channel").length !== 1) throw new Error("News RSS: expected an RSS channel");
  return $("channel > item").toArray().map((element) => {
    const item = $(element);
    const title = item.children("title").text().trim();
    const link = item.children("link").text().trim();
    const rawDate = item.children("pubDate").text().trim();
    if (!title || !link || !rawDate || Number.isNaN(Date.parse(rawDate))) throw new Error("News RSS: incomplete item");
    const url = new URL(link);
    if (url.protocol !== "https:" || url.hostname !== "news.google.com" || !url.pathname.startsWith("/rss/articles/")) throw new Error("News RSS: unexpected article URL");
    return {
      key: `news:${url.pathname}`, kind: "news", title, category: "その他",
      sourceUrl: url.toString(), publishedAt: null,
      note: `ニュース候補。公式の個別告知・出演日時の確認が必要です（RSS掲載日時: ${new Date(rawDate).toISOString()}）。`,
    } satisfies PatrolCandidate;
  });
}

export async function fetchHikaruNewsFeed() {
  return parseNewsFeed(await fetchText(NEWS_RSS_URL));
}
