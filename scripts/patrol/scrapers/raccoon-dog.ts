import { load } from "cheerio";
import { fetchText } from "../http";
import { normalizeTitle, type PatrolCandidate } from "../types";

export const PROFILE_URL = "https://www.raccoon-dog.co.jp/talent/r18-iida.html";

export function parseRaccoonDogProfile(html: string): PatrolCandidate[] {
  const $ = load(html);
  const entries: PatrolCandidate[] = [];
  $("h4").each((_, heading) => {
    const section = $(heading).text().trim();
    $(heading).nextUntil("h4").find("dt").each((_, dt) => {
      const title = $(dt).text().trim();
      const role = $(dt).next("dd").text().trim();
      if (!title) return;
      entries.push({
        key: `profile:${normalizeTitle(section)}:${normalizeTitle(title)}`,
        kind: "profile", title: role ? `${title}（${role}）` : title,
        category: section.includes("ゲーム") ? "ゲーム" : section.includes("アニメ") ? "テレビ" : section.includes("ボイス") ? "音声作品" : "その他",
        sourceUrl: PROFILE_URL, publishedAt: null,
        note: `公式プロフィールの掲載候補（${section}）。新規発表とは限りません。個別告知と発表日時の確認が必要です。`,
      });
    });
  });
  if (entries.length === 0) throw new Error("Agency profile: no credits found; page structure may have changed");
  return entries;
}

export async function scrapeRaccoonDogProfile() {
  return parseRaccoonDogProfile(await fetchText(PROFILE_URL));
}
