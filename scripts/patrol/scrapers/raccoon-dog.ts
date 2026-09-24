export type RaccoonDogEntry = {
  section: string;
  title: string;
  role: string;
};

export async function scrapeRaccoonDogProfile(): Promise<RaccoonDogEntry[]> {
  const profileUrl = "https://www.raccoon-dog.co.jp/talent/r18-iida.html";
  console.log(`[RaccoonDog Scraper] Fetching ${profileUrl}...`);

  try {
    const res = await fetch(profileUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) {
      console.warn(`[RaccoonDog Scraper] Failed to fetch: status ${res.status}`);
      return [];
    }

    const html = await res.text();
    const entries: RaccoonDogEntry[] = [];

    // Parse sections like <h4>TVアニメ</h4> ... <dl><dt>Title</dt><dd>Role</dd></dl>
    const sectionRegex = /<h4>([^<]+)<\/h4>([\s\S]*?)<\/dl>/g;
    let match: RegExpExecArray | null;

    while ((match = sectionRegex.exec(html)) !== null) {
      const section = match[1].trim();
      const content = match[2];

      const itemRegex = /<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g;
      let itemMatch: RegExpExecArray | null;

      while ((itemMatch = itemRegex.exec(content)) !== null) {
        const rawTitle = itemMatch[1].replace(/<[^>]+>/g, "").trim();
        const rawRole = itemMatch[2].replace(/<[^>]+>/g, "").trim();

        if (rawTitle) {
          entries.push({
            section,
            title: rawTitle,
            role: rawRole,
          });
        }
      }
    }

    console.log(`[RaccoonDog Scraper] Extracted ${entries.length} items from agency profile.`);
    return entries;
  } catch (err) {
    console.error("[RaccoonDog Scraper] Error during scraping:", err);
    return [];
  }
}
