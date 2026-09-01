import type { Appearance, AppearanceCategory } from "@/domain/appearance";

const dateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const updatedAtFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export const categoryClassNames: Record<AppearanceCategory, string> = {
  テレビ: "category-television",
  ラジオ: "category-radio",
  配信: "category-stream",
  イベント: "category-event",
  その他: "category-other",
};

export function formatAppearanceDate(value: string) {
  return dateTimeFormatter.format(new Date(value));
}

export function formatUpdatedAt(value: Date) {
  return updatedAtFormatter.format(value);
}

export function formatPublishedAt(value: string) {
  return updatedAtFormatter.format(new Date(value));
}

export type AppearanceCardSession = {
  id: string;
  startsAt: string;
  sessionLabel: string | null;
};

export type AppearanceCard = {
  id: string;
  title: string;
  category: AppearanceCategory;
  sessions: AppearanceCardSession[];
  sourceUrls: string[];
  publishedAt: string;
  isGrouped: boolean;
};

function compareStartsAtAscending(
  a: Pick<AppearanceCardSession, "id" | "startsAt">,
  b: Pick<AppearanceCardSession, "id" | "startsAt">,
) {
  return (
    new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime() ||
    a.id.localeCompare(b.id)
  );
}

function compareStartsAtDescending(
  a: Pick<AppearanceCardSession, "id" | "startsAt">,
  b: Pick<AppearanceCardSession, "id" | "startsAt">,
) {
  return -compareStartsAtAscending(a, b);
}

export function buildAppearanceCards(items: Appearance[]): AppearanceCard[] {
  const cardsById = new Map<string, AppearanceCard>();

  for (const item of items) {
    const isGrouped = item.eventGroupId !== null;
    const cardId = item.eventGroupId ?? `appearance:${item.id}`;
    const existing = cardsById.get(cardId);
    const session = {
      id: item.id,
      startsAt: item.startsAt,
      sessionLabel: item.sessionLabel,
    };

    if (existing) {
      existing.sessions.push(session);
      if (!existing.sourceUrls.includes(item.sourceUrl)) {
        existing.sourceUrls.push(item.sourceUrl);
      }
      if (
        new Date(item.publishedAt).getTime() >
        new Date(existing.publishedAt).getTime()
      ) {
        existing.publishedAt = item.publishedAt;
      }
      continue;
    }

    cardsById.set(cardId, {
      id: cardId,
      title: item.eventTitle ?? item.title,
      category: item.category,
      sessions: [session],
      sourceUrls: [item.sourceUrl],
      publishedAt: item.publishedAt,
      isGrouped,
    });
  }

  return [...cardsById.values()].map((card) => ({
    ...card,
    sessions: [...card.sessions].sort(compareStartsAtAscending),
  }));
}

function latestSession(card: AppearanceCard) {
  return [...card.sessions].sort(compareStartsAtDescending)[0];
}

function nextSession(card: AppearanceCard, now: Date) {
  const nowTimestamp = now.getTime();
  return card.sessions.find(
    (session) => new Date(session.startsAt).getTime() >= nowTimestamp,
  );
}

export function groupAppearances(items: Appearance[], now: Date) {
  const timestamp = now.getTime();
  const cards = buildAppearanceCards(items);

  return {
    latest: [...cards]
      .sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() -
            new Date(a.publishedAt).getTime() || a.id.localeCompare(b.id),
      )
      .slice(0, 3),
    upcoming: cards
      .filter((card) => nextSession(card, now) !== undefined)
      .sort(
        (a, b) =>
          compareStartsAtAscending(nextSession(a, now)!, nextSession(b, now)!) ||
          a.id.localeCompare(b.id),
      ),
    past: cards
      .filter((card) =>
        card.sessions.every(
          (session) => new Date(session.startsAt).getTime() < timestamp,
        ),
      )
      .sort(
        (a, b) =>
          compareStartsAtDescending(latestSession(a), latestSession(b)) ||
          a.id.localeCompare(b.id),
      ),
  };
}
