export type AppearanceNotificationItem = {
  id: string;
  title: string;
  category: string;
  startsAtLabel: string;
  sourceUrl: string;
  action: "added" | "updated";
};

export async function sendDiscordNotification(
  items: AppearanceNotificationItem[],
  webhookUrl?: string,
): Promise<boolean> {
  const url = webhookUrl || process.env.DISCORD_WEBHOOK_URL;
  if (!url) {
    console.log("[Discord] No DISCORD_WEBHOOK_URL configured, skipping notification.");
    return false;
  }

  if (items.length === 0) {
    return true;
  }

  const addedCount = items.filter((i) => i.action === "added").length;
  const updatedCount = items.filter((i) => i.action === "updated").length;

  const headerParts: string[] = [];
  if (addedCount > 0) headerParts.push(`新規追加 ${addedCount}件`);
  if (updatedCount > 0) headerParts.push(`更新 ${updatedCount}件`);

  const embeds = items.slice(0, 10).map((item) => {
    const isAdded = item.action === "added";
    return {
      title: `${isAdded ? "✨【新規】" : "🔄【更新】"} ${item.title}`,
      url: item.sourceUrl,
      color: isAdded ? 0x22c55e : 0x3b82f6, // green or blue
      fields: [
        {
          name: "カテゴリ",
          value: item.category,
          inline: true,
        },
        {
          name: "日時・時期",
          value: item.startsAtLabel,
          inline: true,
        },
        {
          name: "情報元リンク",
          value: `[公式アナウンスを開く](${item.sourceUrl})`,
          inline: false,
        },
      ],
      footer: {
        text: "飯田ヒカル 出演情報 自動巡回Bot",
      },
      timestamp: new Date().toISOString(),
    };
  });

  const payload = {
    username: "飯田ヒカル 出演情報Bot",
    content: `📢 **飯田ヒカルさんの出演情報が更新されました**（${headerParts.join(" / ")}）`,
    embeds,
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Discord] Webhook failed (${response.status}):`, errText);
      return false;
    }

    console.log(`[Discord] Successfully sent notification for ${items.length} item(s).`);
    return true;
  } catch (err) {
    console.error("[Discord] Error sending webhook:", err);
    return false;
  }
}
