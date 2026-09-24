export type ProgramCheckResult = {
  seriesId: string;
  seriesTitle: string;
  latestKnownEpisode: number;
  detectedEpisode?: number;
  detectedDate?: string;
  sourceUrl: string;
};

export async function checkProgramUpdates(
  currentHighest: {
    kannahikaru: number;
    pikanono: number;
    hikaroom: number;
  },
): Promise<ProgramCheckResult[]> {
  const results: ProgramCheckResult[] = [];

  // 1. Kannahikaru on Onsen
  try {
    const onsenUrl = "https://www.onsen.ag/program/kannahikaru";
    console.log(`[Program Scraper] Checking Onsen: ${onsenUrl}...`);
    const res = await fetch(onsenUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (res.ok) {
      const text = await res.text();
      // Match patterns like "第16回" or "カンナヒカル（仮）第16回"
      const episodeMatches = Array.from(text.matchAll(/第(\d+)回/g)).map((m) => parseInt(m[1], 10));
      const highestFound = Math.max(...episodeMatches, 0);

      if (highestFound > currentHighest.kannahikaru) {
        results.push({
          seriesId: "kannahikaru",
          seriesTitle: "カンナヒカル（仮）",
          latestKnownEpisode: currentHighest.kannahikaru,
          detectedEpisode: highestFound,
          sourceUrl: onsenUrl,
        });
      }
    }
  } catch (err) {
    console.warn("[Program Scraper] Could not check Onsen (network or host offline):", err);
  }

  // 2. Niconico Channel for HikaROOM
  try {
    const nicoUrl = "https://ch.nicovideo.jp/iidahikaroom";
    console.log(`[Program Scraper] Checking Niconico: ${nicoUrl}...`);
    const res = await fetch(nicoUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (res.ok) {
      const text = await res.text();
      const episodeMatches = Array.from(text.matchAll(/第(\d+)回/g)).map((m) => parseInt(m[1], 10));
      const highestFound = Math.max(...episodeMatches, 0);

      if (highestFound > currentHighest.hikaroom) {
        results.push({
          seriesId: "hikaroom",
          seriesTitle: "飯田ヒカルのヒカROOM！",
          latestKnownEpisode: currentHighest.hikaroom,
          detectedEpisode: highestFound,
          sourceUrl: nicoUrl,
        });
      }
    }
  } catch (err) {
    console.warn("[Program Scraper] Could not check Niconico channel:", err);
  }

  return results;
}
