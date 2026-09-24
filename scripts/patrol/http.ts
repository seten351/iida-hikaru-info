import { setTimeout as sleep } from "node:timers/promises";

export async function fetchText(url: string): Promise<string> {
  const label = new URL(url).hostname;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; HikaruAppearancePatrol/1.0)" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        if ((response.status === 429 || response.status >= 500) && attempt < 2) {
          const retryAfter = Number(response.headers.get("retry-after"));
          await sleep(Math.min(10_000, Math.max(1000 * (attempt + 1), retryAfter * 1000 || 0)));
          continue;
        }
        throw new Error(`${label}: HTTP ${response.status}`);
      }
      const text = await response.text();
      if (!text.trim()) throw new Error(`${label}: empty response`);
      return text;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith(`${label}:`)) throw error;
      if (attempt === 2) throw new Error(`${label}: request failed or timed out`);
      await sleep(1000 * (attempt + 1));
    }
  }
  throw new Error(`${label}: request failed`);
}
