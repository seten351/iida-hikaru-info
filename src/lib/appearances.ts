import type {
  Appearance,
  AppearanceCategory,
  PublishedAtPrecision,
} from "@/domain/appearance";

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

function formatCalendarDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

export type Publication = Pick<
  Appearance,
  "publishedAtPrecision" | "publishedAt" | "publishedOn" | "collectedAt"
>;

export function formatPublication(publication: Publication) {
  if (publication.publishedAtPrecision === "exact") {
    return updatedAtFormatter.format(new Date(publication.publishedAt!));
  }

  if (publication.publishedAtPrecision === "date") {
    return `${formatCalendarDate(publication.publishedOn!)}（日付のみ）`;
  }

  return `日時不明（サイト掲載 ${updatedAtFormatter.format(new Date(publication.collectedAt))}）`;
}

export type AppearanceCardSession = {
  id: string;
  startsAt: string;
  sessionLabel: string | null;
};

export type AppearanceCard = {
  id: string;
  title: string;
  seriesId: string | null;
  seriesName: string | null;
  category: AppearanceCategory;
  sessions: AppearanceCardSession[];
  sourceUrls: string[];
  publication: Publication;
  isGrouped: boolean;
};

const referenceDayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatReferenceDay(value: string) {
  const parts = referenceDayFormatter.formatToParts(new Date(value));
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function publicationReferenceDay(publication: Publication) {
  if (publication.publishedAtPrecision === "exact") {
    return formatReferenceDay(publication.publishedAt!);
  }

  if (publication.publishedAtPrecision === "date") {
    return publication.publishedOn!;
  }

  return formatReferenceDay(publication.collectedAt);
}

function publicationPrecisionRank(precision: PublishedAtPrecision) {
  return { exact: 2, date: 1, unknown: 0 }[precision];
}

export function comparePublications(a: Publication, b: Publication) {
  const referenceDayComparison = publicationReferenceDay(b).localeCompare(
    publicationReferenceDay(a),
  );
  if (referenceDayComparison !== 0) {
    return referenceDayComparison;
  }

  const precisionComparison =
    publicationPrecisionRank(b.publishedAtPrecision) -
    publicationPrecisionRank(a.publishedAtPrecision);
  if (precisionComparison !== 0) {
    return precisionComparison;
  }

  if (a.publishedAtPrecision === "exact" && b.publishedAtPrecision === "exact") {
    return new Date(b.publishedAt!).getTime() - new Date(a.publishedAt!).getTime();
  }

  return new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime();
}

function publicationOf(item: Appearance): Publication {
  return {
    publishedAtPrecision: item.publishedAtPrecision,
    publishedAt: item.publishedAt,
    publishedOn: item.publishedOn,
    collectedAt: item.collectedAt,
  };
}

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
      if (
        existing.seriesId !== item.seriesId ||
        existing.seriesName !== item.seriesName
      ) {
        throw new Error(`Event group ${existing.id} has inconsistent series metadata.`);
      }
      existing.sessions.push(session);
      if (!existing.sourceUrls.includes(item.sourceUrl)) {
        existing.sourceUrls.push(item.sourceUrl);
      }
      if (comparePublications(publicationOf(item), existing.publication) < 0) {
        existing.publication = publicationOf(item);
      }
      continue;
    }

    cardsById.set(cardId, {
      id: cardId,
      title: item.eventTitle ?? item.title,
      seriesId: item.seriesId,
      seriesName: item.seriesName,
      category: item.category,
      sessions: [session],
      sourceUrls: [item.sourceUrl],
      publication: publicationOf(item),
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
      .sort((a, b) =>
        comparePublications(a.publication, b.publication) || a.id.localeCompare(b.id),
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
