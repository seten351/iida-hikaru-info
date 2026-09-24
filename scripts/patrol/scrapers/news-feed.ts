export type NewsFeedItem = {
  title: string;
  link: string;
  pubDate: string;
};

export async function fetchHikaruNewsFeed(): Promise<NewsFeedItem[]> {
  const rssUrl =
    "https://news.google.com/rss/search?q=%E9%A3%AF%E7%94%B0%E3%83%92%E3%82%AB%E3%83%AB&hl=ja&gl=JP&ceid=JP:ja";
  console.log(`[News RSS] Fetching feed: ${rssUrl}...`);

  try {
    const res = await fetch(rssUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!res.ok) {
      console.warn(`[News RSS] Failed to fetch RSS: status ${res.status}`);
      return [];
    }

    const xml = await res.text();
    const items: NewsFeedItem[] = [];

    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let itemMatch: RegExpExecArray | null;

    while ((itemMatch = itemRegex.exec(xml)) !== null) {
      const block = itemMatch[1];

      const titleMatch = /<title>([\s\S]*?)<\/title>/.exec(block);
      const linkMatch = /<link>([\s\S]*?)<\/link>/.exec(block);
      const pubDateMatch = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(block);

      if (titleMatch && linkMatch) {
        items.push({
          title: titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").trim(),
          link: linkMatch[1].trim(),
          pubDate: pubDateMatch ? pubDateMatch[1].trim() : "",
        });
      }
    }

    console.log(`[News RSS] Retrieved ${items.length} news items.`);
    return items;
  } catch (err) {
    console.warn("[News RSS] Could not fetch Google News RSS feed:", err);
    return [];
  }
}
