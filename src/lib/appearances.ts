import type {
  Appearance,
  AppearanceCategory,
  PublishedAtPrecision,
  StartsAtPrecision,
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
  ゲーム: "category-game",
  音声作品: "category-audio",
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

export type AppearanceStart = {
  startsAtPrecision: StartsAtPrecision;
  startsAt: string | null;
  startsOn: string | null;
};

export function formatAppearanceStart(start: AppearanceStart) {
  if (start.startsAtPrecision === "exact") {
    return formatAppearanceDate(start.startsAt!);
  }

  if (start.startsAtPrecision === "date") {
    return formatCalendarDate(start.startsOn!);
  }

  return "日時未定";
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
  startsAtPrecision: StartsAtPrecision;
  startsAt: string | null;
  startsOn: string | null;
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

function formatReferenceDay(value: string | Date) {
  const parts = referenceDayFormatter.formatToParts(
    typeof value === "string" ? new Date(value) : value,
  );
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

function startReferenceDay(start: AppearanceStart) {
  if (start.startsAtPrecision === "exact") {
    return formatReferenceDay(start.startsAt!);
  }

  if (start.startsAtPrecision === "date") {
    return start.startsOn!;
  }

  return null;
}

export function getAppearanceStartDay(start: AppearanceStart) {
  return startReferenceDay(start);
}

const timeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatAppearanceAgendaStart(start: AppearanceStart) {
  if (start.startsAtPrecision === "exact") {
    return timeFormatter.format(new Date(start.startsAt!));
  }

  if (start.startsAtPrecision === "date") {
    return "日付のみ";
  }

  return "日時未定";
}

function startPrecisionRank(precision: StartsAtPrecision) {
  return { date: 0, exact: 1, unknown: 2 }[precision];
}

export function compareAppearanceStartsAscending(
  a: AppearanceCardSession,
  b: AppearanceCardSession,
) {
  const aDay = startReferenceDay(a);
  const bDay = startReferenceDay(b);

  if (aDay === null || bDay === null) {
    if (aDay === null && bDay === null) {
      return a.id.localeCompare(b.id);
    }
    return aDay === null ? 1 : -1;
  }

  const dayComparison = aDay.localeCompare(bDay);
  if (dayComparison !== 0) {
    return dayComparison;
  }

  const precisionComparison =
    startPrecisionRank(a.startsAtPrecision) -
    startPrecisionRank(b.startsAtPrecision);
  if (precisionComparison !== 0) {
    return precisionComparison;
  }

  if (a.startsAtPrecision === "exact" && b.startsAtPrecision === "exact") {
    const timeComparison =
      new Date(a.startsAt!).getTime() - new Date(b.startsAt!).getTime();
    if (timeComparison !== 0) {
      return timeComparison;
    }
  }

  return a.id.localeCompare(b.id);
}

export function isAppearanceStartUpcoming(
  start: AppearanceStart,
  now: Date,
) {
  if (start.startsAtPrecision === "unknown") {
    return true;
  }

  if (start.startsAtPrecision === "date") {
    return start.startsOn! >= formatReferenceDay(now);
  }

  return new Date(start.startsAt!).getTime() >= now.getTime();
}

export function buildAppearanceCards(items: Appearance[]): AppearanceCard[] {
  const cardsById = new Map<string, AppearanceCard>();

  for (const item of items) {
    const isGrouped = item.eventGroupId !== null;
    const cardId = item.eventGroupId ?? `appearance:${item.id}`;
    const existing = cardsById.get(cardId);
    const session = {
      id: item.id,
      startsAtPrecision: item.startsAtPrecision,
      startsAt: item.startsAt,
      startsOn: item.startsOn,
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
      for (const sourceUrl of item.sourceUrls) {
        if (!existing.sourceUrls.includes(sourceUrl)) {
          existing.sourceUrls.push(sourceUrl);
        }
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
      sourceUrls: [...new Set(item.sourceUrls)],
      publication: publicationOf(item),
      isGrouped,
    });
  }

  return [...cardsById.values()].map((card) => ({
    ...card,
    sessions: [...card.sessions].sort(compareAppearanceStartsAscending),
  }));
}

function earliestKnownSession(card: AppearanceCard) {
  return card.sessions.find(
    (session) => session.startsAtPrecision !== "unknown",
  );
}

function latestKnownSession(card: AppearanceCard) {
  return card.sessions.findLast(
    (session) => session.startsAtPrecision !== "unknown",
  );
}

function compareCardsByStartAscending(a: AppearanceCard, b: AppearanceCard) {
  const aStart = earliestKnownSession(a);
  const bStart = earliestKnownSession(b);

  if (aStart === undefined || bStart === undefined) {
    if (aStart === undefined && bStart === undefined) {
      return a.id.localeCompare(b.id);
    }
    return aStart === undefined ? 1 : -1;
  }

  return (
    compareAppearanceStartsAscending(aStart, bStart) ||
    a.id.localeCompare(b.id)
  );
}

export function groupAppearances(items: Appearance[], now: Date) {
  return groupAppearanceCards(buildAppearanceCards(items), now);
}

export function groupAppearanceCards(cards: AppearanceCard[], now: Date) {
  return {
    latest: [...cards]
      .sort((a, b) =>
        comparePublications(a.publication, b.publication) || a.id.localeCompare(b.id),
      )
      .slice(0, 3),
    upcoming: cards
      .filter((card) =>
        card.sessions.some((session) => isAppearanceStartUpcoming(session, now)),
      )
      .sort(compareCardsByStartAscending),
    past: cards
      .filter((card) =>
        card.sessions.every(
          (session) => !isAppearanceStartUpcoming(session, now),
        ),
      )
      .sort(
        (a, b) => {
          const aStart = latestKnownSession(a)!;
          const bStart = latestKnownSession(b)!;
          return (
            -compareAppearanceStartsAscending(aStart, bStart) ||
            a.id.localeCompare(b.id)
          );
        },
      ),
  };
}
