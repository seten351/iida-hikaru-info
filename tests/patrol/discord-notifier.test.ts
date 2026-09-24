import assert from "node:assert/strict";
import test from "node:test";

import {
  type AppearanceNotificationItem,
  sendDiscordNotification,
} from "../../scripts/patrol/discord-notifier";

const webhookUrl = "https://discord.example.test/api/webhooks/123/token";

function item(index: number, action: AppearanceNotificationItem["action"] = "added"): AppearanceNotificationItem {
  return {
    id: `item-${index}`,
    title: `出演情報 ${index}`,
    category: "配信",
    startsAtLabel: "2026年9月24日",
    sourceUrl: `https://example.test/news/${index}`,
    action,
  };
}

function successfulResponse(): Response {
  return new Response(null, { status: 204 });
}

test("74件を10 embeds以下のバッチに分割し、全件を一度ずつ配送する", async () => {
  const payloads: Array<{ embeds: Array<{ title: string }>; allowed_mentions: { parse: string[] } }> = [];
  const checkpointedIds: string[] = [];
  const fetchMock = (async (_url: string, init?: RequestInit) => {
    payloads.push(JSON.parse(String(init?.body)));
    return successfulResponse();
  }) as typeof fetch;

  await sendDiscordNotification(Array.from({ length: 74 }, (_, index) => item(index + 1)), webhookUrl, {
    fetch: fetchMock,
    onBatchSent: async (batch) => { checkpointedIds.push(...batch.map((notification) => notification.id)); },
  });

  assert.equal(payloads.length, 8);
  assert.deepEqual(payloads.map((payload) => payload.embeds.length), [10, 10, 10, 10, 10, 10, 10, 4]);
  assert.deepEqual(checkpointedIds, Array.from({ length: 74 }, (_, index) => `item-${index + 1}`));
  assert.ok(payloads.every((payload) => payload.embeds.length <= 10));
  assert.ok(payloads.every((payload) => JSON.stringify(payload.allowed_mentions) === '{"parse":[]}'));
});

test("2バッチ目の失敗時は1バッチ目だけをチェックポイントする", async () => {
  let calls = 0;
  const checkpointedBatches: string[][] = [];
  const fetchMock = (async () => {
    calls += 1;
    return calls === 1 ? successfulResponse() : new Response("upstream failure", { status: 500 });
  }) as typeof fetch;

  await assert.rejects(
    sendDiscordNotification(Array.from({ length: 11 }, (_, index) => item(index + 1)), webhookUrl, {
      fetch: fetchMock,
      onBatchSent: async (batch) => { checkpointedBatches.push(batch.map((notification) => notification.id)); },
    }),
    /HTTP status 500/,
  );

  assert.equal(calls, 2);
  assert.deepEqual(checkpointedBatches, [Array.from({ length: 10 }, (_, index) => `item-${index + 1}`)]);
});

test("長い値もembedの個別・合計文字数上限内に収め、候補を候補として通知する", async () => {
  const payloads: Array<{
    content: string;
    embeds: Array<{ title: string; footer: { text: string }; fields: Array<{ name: string; value: string }> }>;
  }> = [];
  const longItem = (index: number): AppearanceNotificationItem => ({
    ...item(index, "candidate"),
    title: "題".repeat(300),
    category: "分".repeat(1200),
    startsAtLabel: "時".repeat(1200),
    sourceUrl: `https://example.test/${"a".repeat(1200)}`,
  });

  await sendDiscordNotification([longItem(1), longItem(2), longItem(3)], webhookUrl, {
    fetch: (async (_url: string, init?: RequestInit) => {
      payloads.push(JSON.parse(String(init?.body)));
      return successfulResponse();
    }) as typeof fetch,
  });

  assert.equal(payloads.length, 3);
  assert.ok(payloads.every((payload) => payload.content.includes("出演情報の候補")));
  assert.ok(payloads.every((payload) => payload.embeds[0].fields[2].value.includes("情報元")));
  for (const payload of payloads) {
    const embedCharacters = payload.embeds.reduce(
      (total, embed) => total + embed.title.length + embed.footer.text.length + embed.fields.reduce(
        (fieldTotal, field) => fieldTotal + field.name.length + field.value.length,
        0,
      ),
      0,
    );
    assert.ok(embedCharacters <= 6000);
    for (const embed of payload.embeds) {
      assert.ok(embed.title.length <= 256);
      assert.ok(embed.fields.every((field) => field.name.length <= 256 && field.value.length <= 1024));
    }
  }
});

test("HTTPS以外のWebhookを拒否し、成功応答のbodyを破棄する", async () => {
  let fetchCalls = 0;
  await assert.rejects(
    sendDiscordNotification([item(1)], "http://discord.example.test/webhook", {
      fetch: (async () => {
        fetchCalls += 1;
        return successfulResponse();
      }) as typeof fetch,
    }),
    /invalid/,
  );
  assert.equal(fetchCalls, 0);

  let bodyCancelled = false;
  const responseBody = new ReadableStream({
    cancel: () => { bodyCancelled = true; },
  });
  await sendDiscordNotification([item(2)], webhookUrl, {
    fetch: (async () => new Response(responseBody, { status: 200 })) as typeof fetch,
  });
  assert.equal(bodyCancelled, true);
});

test("429はRetry-Afterを尊重して上限回数まで再試行する", async () => {
  let calls = 0;
  const sleeps: number[] = [];
  const fetchMock = (async () => {
    calls += 1;
    if (calls < 3) return new Response(JSON.stringify({ retry_after: 0.25 }), { status: 429, headers: { "Retry-After": "0.5" } });
    return successfulResponse();
  }) as typeof fetch;

  await sendDiscordNotification([item(1)], webhookUrl, {
    fetch: fetchMock,
    sleep: async (milliseconds) => { sleeps.push(milliseconds); },
  });
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [500, 500]);

  calls = 0;
  await assert.rejects(
    sendDiscordNotification([item(2)], webhookUrl, {
      fetch: (async () => {
        calls += 1;
        return new Response(JSON.stringify({ retry_after: 61 }), { status: 429 });
      }) as typeof fetch,
      sleep: async () => undefined,
    }),
    /rate limit/,
  );
  assert.equal(calls, 1);
});

test("失敗メッセージにWebhook URL、応答本文、fetch例外を含めない", async () => {
  const secretWebhookUrl = "https://discord.example.test/api/webhooks/123/super-secret-token";
  const fetchMock = (async () => { throw new Error("network failure: super-secret-token"); }) as typeof fetch;
  await assert.rejects(
    sendDiscordNotification([item(1, "candidate")], secretWebhookUrl, { fetch: fetchMock }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.doesNotMatch(error.message, /super-secret-token|network failure|discord\.example/i);
      return true;
    },
  );
});
