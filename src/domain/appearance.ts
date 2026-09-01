export const appearanceCategories = [
  "テレビ",
  "ラジオ",
  "配信",
  "イベント",
  "その他",
] as const;

export type AppearanceCategory = (typeof appearanceCategories)[number];

export type Appearance = {
  id: string;
  startsAt: string;
  title: string;
  category: AppearanceCategory;
  sourceUrl: string;
  publishedAt: string;
};

export type AppearanceImportItem = Appearance & {
  sourceName: OfficialAppearanceSourceName;
  sourceItemId: string;
};

export const officialAppearanceSources = {
  "x:iidahikaroom": {
    hostname: "x.com",
    pathnamePrefix: "/iidahikaroom/status/",
  },
  "x:hagoromo6": {
    hostname: "x.com",
    pathnamePrefix: "/hagoromo_6/status/",
  },
} as const;

export type OfficialAppearanceSourceName =
  keyof typeof officialAppearanceSources;

const timezoneSuffixPattern = /(?:Z|[+-]\d{2}:\d{2})$/;

function assertDateTime(value: string, fieldName: string, id: string) {
  if (!timezoneSuffixPattern.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`${id}: ${fieldName} must be a valid timezone-aware datetime.`);
  }
}

export function validateAppearanceImportItems(
  items: readonly AppearanceImportItem[],
) {
  const ids = new Set<string>();
  const sourceKeys = new Set<string>();

  if (items.length === 0) {
    throw new Error("At least one appearance is required.");
  }

  for (const item of items) {
    if (!item.id.trim() || !item.title.trim() || !item.sourceItemId.trim()) {
      throw new Error("Appearance id, title, and sourceItemId must not be empty.");
    }

    if (!appearanceCategories.includes(item.category)) {
      throw new Error(`${item.id}: unsupported category ${item.category}.`);
    }

    assertDateTime(item.startsAt, "startsAt", item.id);
    assertDateTime(item.publishedAt, "publishedAt", item.id);

    const source = officialAppearanceSources[item.sourceName];
    const sourceUrl = new URL(item.sourceUrl);

    if (
      sourceUrl.protocol !== "https:" ||
      sourceUrl.hostname !== source.hostname ||
      !sourceUrl.pathname.startsWith(source.pathnamePrefix)
    ) {
      throw new Error(
        `${item.id}: sourceUrl does not match the registered official source ${item.sourceName}.`,
      );
    }

    const sourceKey = `${item.sourceName}\u0000${item.sourceItemId}`;

    if (ids.has(item.id)) {
      throw new Error(`Duplicate appearance id: ${item.id}.`);
    }

    if (sourceKeys.has(sourceKey)) {
      throw new Error(
        `Duplicate source identity: ${item.sourceName}/${item.sourceItemId}.`,
      );
    }

    ids.add(item.id);
    sourceKeys.add(sourceKey);
  }
}
