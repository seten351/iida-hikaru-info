export type AppearanceNotificationItem = {
  id: string;
  title: string;
  category: string;
  startsAtLabel: string;
  sourceUrl: string;
  action: "added" | "updated" | "candidate";
};

export type DiscordNotificationOptions = {
  onBatchSent?: (items: AppearanceNotificationItem[]) => Promise<void>;
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
};

const MAX_EMBEDS_PER_MESSAGE = 10;
const MAX_EMBED_CHARACTERS_PER_MESSAGE = 6000;
const MAX_EMBED_TITLE_CHARACTERS = 256;
const MAX_EMBED_FIELD_NAME_CHARACTERS = 256;
const MAX_EMBED_FIELD_VALUE_CHARACTERS = 1024;
const HTTP_TIMEOUT_MS = 30_000;
const MAX_RATE_LIMIT_RETRIES = 3;
const MAX_RATE_LIMIT_WAIT_MS = 60_000;
const MIN_RATE_LIMIT_WAIT_MS = 100;
const FOOTER_TEXT = "飯田ヒカル 出演情報 自動巡回Bot";

type DiscordEmbed = {
  title: string;
  color: number;
  fields: Array<{ name: string; value: string; inline: boolean }>;
  footer: { text: string };
  timestamp: string;
};

function truncate(value: string, maximumLength: number): string {
  if (value.length <= maximumLength) return value;
  return `${value.slice(0, Math.max(0, maximumLength - 1))}…`;
}

function formatSourceUrl(sourceUrl: string): string {
  const link = `[情報元を開く](${sourceUrl})`;
  if (link.length <= MAX_EMBED_FIELD_VALUE_CHARACTERS) return link;
  return `情報元URL: ${truncate(sourceUrl, MAX_EMBED_FIELD_VALUE_CHARACTERS - "情報元URL: ".length)}`;
}

function notificationPresentation(action: AppearanceNotificationItem["action"]) {
  switch (action) {
    case "added":
      return { prefix: "✨【新規】 ", color: 0x22c55e };
    case "updated":
      return { prefix: "🔄【更新】 ", color: 0x3b82f6 };
    case "candidate":
      return { prefix: "🔎【出演情報の候補】 ", color: 0xf59e0b };
  }
}

function createEmbed(item: AppearanceNotificationItem): DiscordEmbed {
  const presentation = notificationPresentation(item.action);
  return {
    title: `${presentation.prefix}${truncate(
      item.title,
      MAX_EMBED_TITLE_CHARACTERS - presentation.prefix.length,
    )}`,
    color: presentation.color,
    fields: [
      {
        name: truncate("カテゴリ", MAX_EMBED_FIELD_NAME_CHARACTERS),
        value: truncate(item.category, MAX_EMBED_FIELD_VALUE_CHARACTERS),
        inline: true,
      },
      {
        name: truncate("日時・時期", MAX_EMBED_FIELD_NAME_CHARACTERS),
        value: truncate(item.startsAtLabel, MAX_EMBED_FIELD_VALUE_CHARACTERS),
        inline: true,
      },
      {
        name: truncate("情報元リンク", MAX_EMBED_FIELD_NAME_CHARACTERS),
        value: formatSourceUrl(item.sourceUrl),
        inline: false,
      },
    ],
    footer: { text: FOOTER_TEXT },
    timestamp: new Date().toISOString(),
  };
}

function embedCharacterCount(embed: DiscordEmbed): number {
  return embed.title.length + embed.footer.text.length + embed.fields.reduce(
    (total, field) => total + field.name.length + field.value.length,
    0,
  );
}

function splitIntoBatches(items: AppearanceNotificationItem[]): AppearanceNotificationItem[][] {
  const batches: AppearanceNotificationItem[][] = [];
  let currentBatch: AppearanceNotificationItem[] = [];
  let currentCharacterCount = 0;

  for (const item of items) {
    const itemCharacterCount = embedCharacterCount(createEmbed(item));
    if (
      currentBatch.length > 0 &&
      (currentBatch.length >= MAX_EMBEDS_PER_MESSAGE ||
        currentCharacterCount + itemCharacterCount > MAX_EMBED_CHARACTERS_PER_MESSAGE)
    ) {
      batches.push(currentBatch);
      currentBatch = [];
      currentCharacterCount = 0;
    }
    currentBatch.push(item);
    currentCharacterCount += itemCharacterCount;
  }
  if (currentBatch.length > 0) batches.push(currentBatch);
  return batches;
}

function createContent(items: AppearanceNotificationItem[]): string {
  const summaries = [
    ["added", "新規追加"],
    ["updated", "更新"],
    ["candidate", "出演情報の候補"],
  ].flatMap(([action, label]) => {
    const count = items.filter((item) => item.action === action).length;
    return count > 0 ? [`${label} ${count}件`] : [];
  });
  return `📢 飯田ヒカルさんの出演情報のお知らせ（${summaries.join(" / ")}）`;
}

function parseRetryAfter(response: Response, responseText: string | null): number | null {
  const headerValue = response.headers.get("Retry-After");
  if (headerValue) {
    const seconds = Number(headerValue);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const retryDate = Date.parse(headerValue);
    if (!Number.isNaN(retryDate)) return Math.max(0, retryDate - Date.now());
  }
  if (!responseText) return null;
  try {
    const body: unknown = JSON.parse(responseText);
    if (
      typeof body === "object" && body !== null && "retry_after" in body &&
      typeof body.retry_after === "number" && Number.isFinite(body.retry_after) && body.retry_after >= 0
    ) return body.retry_after * 1000;
  } catch {
    // Never expose malformed Discord response bodies in an error.
  }
  return null;
}

type WebhookResponse = {
  ok: boolean;
  status: number;
  retryAfterMs: number | null;
};

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  body: string,
): Promise<WebhookResponse> {
  const controller = new AbortController();
  let timedOut = false;
  let response: Response | null = null;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, HTTP_TIMEOUT_MS);
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: controller.signal,
    });
    let responseText: string | null = null;
    if (response.status === 429) {
      responseText = await response.text();
    } else if (response.body) {
      await response.body.cancel();
    }
    return {
      ok: response.ok,
      status: response.status,
      retryAfterMs: response.status === 429 ? parseRetryAfter(response, responseText) : null,
    };
  } catch {
    if (timedOut) throw new Error("Discord webhook request timed out.");
    throw new Error("Discord webhook request failed.");
  } finally {
    clearTimeout(timeout);
  }
}

function webhookUrlWithWait(url: string): string {
  try {
    const webhookUrl = new URL(url);
    if (webhookUrl.protocol !== "https:") {
      throw new Error("Discord webhook URL must use HTTPS.");
    }
    webhookUrl.searchParams.set("wait", "true");
    return webhookUrl.toString();
  } catch {
    throw new Error("Discord webhook URL is invalid.");
  }
}

async function sendBatch(
  items: AppearanceNotificationItem[],
  webhookUrl: string,
  fetchImpl: typeof fetch,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<void> {
  const payload = JSON.stringify({
    username: "飯田ヒカル 出演情報Bot",
    content: createContent(items),
    allowed_mentions: { parse: [] },
    embeds: items.map(createEmbed),
  });
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
    const response = await fetchWithTimeout(fetchImpl, webhookUrl, payload);
    if (response.ok) return;
    if (response.status === 429) {
      const retryAfterMs = response.retryAfterMs;
      if (retryAfterMs === null || retryAfterMs > MAX_RATE_LIMIT_WAIT_MS || attempt === MAX_RATE_LIMIT_RETRIES) {
        throw new Error("Discord webhook rate limit could not be retried safely.");
      }
      await sleep(Math.max(MIN_RATE_LIMIT_WAIT_MS, retryAfterMs));
      continue;
    }
    throw new Error(`Discord webhook failed with HTTP status ${response.status}.`);
  }
}

export async function sendDiscordNotification(
  items: AppearanceNotificationItem[],
  webhookUrl?: string,
  options: DiscordNotificationOptions = {},
): Promise<void> {
  if (items.length === 0) return;
  const configuredWebhookUrl = webhookUrl || process.env.DISCORD_WEBHOOK_URL;
  if (!configuredWebhookUrl) throw new Error("DISCORD_WEBHOOK_URL is not configured.");

  const fetchImpl = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  for (const batch of splitIntoBatches(items)) {
    await sendBatch(batch, webhookUrlWithWait(configuredWebhookUrl), fetchImpl, sleep);
    await options.onBatchSent?.(batch);
  }
  console.log(`[Discord] Successfully sent notification for ${items.length} item(s).`);
}
