import { normalizeGuestInfo, type AppearanceGuestInfo } from "./appearance-guests";

export const appearanceCategories = [
  "テレビ",
  "ラジオ",
  "配信",
  "イベント",
  "その他",
  "ゲーム",
  "音声作品",
] as const;

export type AppearanceCategory = (typeof appearanceCategories)[number];

export const appearanceCategoryDisplayOrder = [
  "テレビ",
  "ラジオ",
  "配信",
  "イベント",
  "ゲーム",
  "音声作品",
  "その他",
] as const satisfies readonly AppearanceCategory[];

export const publishedAtPrecisions = ["exact", "date", "unknown"] as const;

export type PublishedAtPrecision = (typeof publishedAtPrecisions)[number];

export const startsAtPrecisions = ["exact", "date", "unknown"] as const;

export type StartsAtPrecision = (typeof startsAtPrecisions)[number];

export type AppearanceSeries = {
  id: string;
  displayName: string;
};

export type Appearance = {
  guestInfo?: AppearanceGuestInfo;
  id: string;
  startsAtPrecision: StartsAtPrecision;
  startsAt: string | null;
  startsOn: string | null;
  title: string;
  seriesId: string | null;
  seriesName: string | null;
  eventGroupId: string | null;
  eventTitle: string | null;
  sessionLabel: string | null;
  category: AppearanceCategory;
  /** Active source URLs, with the primary source first. */
  sourceUrls: string[];
  sourceUrl: string;
  publishedAtPrecision: PublishedAtPrecision;
  publishedAt: string | null;
  publishedOn: string | null;
  collectedAt: string;
};

export type AppearanceImportItem = Omit<
  Appearance,
  "collectedAt" | "seriesName" | "sourceUrls"
> & {
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
  "x:iida-hikaru": {
    hostname: "x.com",
    pathnamePrefix: "/Iida_Hikaru_828/status/",
  },
  "x:flashing-light": {
    hostname: "x.com",
    pathnamePrefix: "/flashinglightCM/status/",
  },
  "x:futsuradi": {
    hostname: "x.com",
    pathnamePrefix: "/futsuradi",
  },
  "x:iidahikaroom-account": {
    hostname: "x.com",
    pathnamePrefix: "/iidahikaroom",
  },
  "x:voice-lounge": {
    hostname: "x.com",
    pathnamePrefix: "/voice_lounge",
  },
  "x:uo-seiyuclub": {
    hostname: "x.com",
    pathnamePrefix: "/UO_seiyuclub",
  },
  "official:idolmaster": {
    hostname: "idolmaster-official.jp",
    pathnamePrefix: "/",
  },
  "official:falcom": {
    hostname: "www.falcom.co.jp",
    pathnamePrefix: "/",
  },
  "official:llv-reading": {
    hostname: "www.llv-reading.com",
    pathnamePrefix: "/",
  },
  "official:itasha-tengoku": {
    hostname: "itasha-tengoku.yaesu-net.co.jp",
    pathnamePrefix: "/",
  },
  "official:youtube": {
    hostname: "www.youtube.com",
    pathnamePrefix: "/",
  },
  "official:uec-seiyu": {
    hostname: "uecseiyubunkaken.com",
    pathnamePrefix: "/",
  },
  "official:tokyo-mx": {
    hostname: "s.mxtv.jp",
    pathnamePrefix: "/",
  },
  "official:clouded-leopard": {
    hostname: "www.cloudedleopardent.com",
    pathnamePrefix: "/",
  },
  "official:avex": {
    hostname: "avexnet.jp",
    pathnamePrefix: "/",
  },
  "official:bang-dream": {
    hostname: "bang-dream.com",
    pathnamePrefix: "/",
  },
  "official:gekirock": {
    hostname: "gekirock.com",
    pathnamePrefix: "/",
  },
  "official:gekirock-shop": {
    hostname: "shop.gekirock.com",
    pathnamePrefix: "/products/",
  },
  "official:voicegarage-zaiko": {
    hostname: "voicegarage.zaiko.io",
    pathnamePrefix: "/",
  },
  "official:pr-times": {
    hostname: "prtimes.jp",
    pathnamePrefix: "/",
  },
  "official:anirave": {
    hostname: "animeravefestival.com",
    hostnameAliases: ["www.animeravefestival.com"],
    pathnamePrefix: "/",
  },
  "official:animate": {
    hostname: "www.animate.co.jp",
    pathnamePrefix: "/",
  },
  "official:onsen": {
    hostname: "www.onsen.ag",
    pathnamePrefix: "/",
  },
  "official:e-stone-music": {
    hostname: "e-stonemusic.com",
    pathnamePrefix: "/",
  },
  "official:takachiho": {
    hostname: "www.takachiho.jp",
    pathnamePrefix: "/",
  },
  "official:stella-sora": {
    hostname: "1st-anniversary.stellasora.jp",
    pathnamePrefix: "/",
  },
  "official:hikaroom-store": {
    hostname: "hikaroomokinawa.stores.jp",
    pathnamePrefix: "/",
  },
  "official:niconico-live": {
    hostname: "live.nicovideo.jp",
    pathnamePrefix: "/",
  },
  "official:niconico": {
    hostname: "www.nicovideo.jp",
    pathnamePrefix: "/",
  },
  "official:niconico-channel": {
    hostname: "ch.nicovideo.jp",
    pathnamePrefix: "/",
  },
  "official:asobi-channel": {
    hostname: "asobichannel.asobistore.jp",
    pathnamePrefix: "/",
  },
  "official:audee": {
    hostname: "audee-membership.jp",
    pathnamePrefix: "/",
  },
  "official:raccoon-dog": {
    hostname: "www.raccoon-dog.co.jp",
    pathnamePrefix: "/talent/",
  },
  "x:onsenradio": {
    hostname: "x.com",
    pathnamePrefix: "/onsenradio/status/",
  },
  "x:gkmas-official": {
    hostname: "x.com",
    pathnamePrefix: "/gkmas_official/status/",
  },
  "official:livepocket": {
    hostname: "livepocket.jp",
    pathnamePrefix: "/e/",
  },
  "official:entergram": {
    hostname: "www.entergram.co.jp",
    pathnamePrefix: "/",
  },
  "official:nintendo-store": {
    hostname: "store-jp.nintendo.com",
    pathnamePrefix: "/",
  },
  "official:kogado": {
    hostname: "sugarlies.kogado.com",
    pathnamePrefix: "/",
  },
  "official:dlsite": {
    hostname: "www.dlsite.com",
    pathnamePrefix: "/home/work/=/product_id/",
  },
  "x:le-mirage": {
    hostname: "x.com",
    pathnamePrefix: "/Le_Mirage_jp/status/",
  },
  "x:fire-emblem": {
    hostname: "x.com",
    pathnamePrefix: "/FireEmblemJP/status/",
  },
  "x:dear-mf-pr": {
    hostname: "x.com",
    pathnamePrefix: "/DEAR_MF_PR/status/",
  },
  "明智璃子公式YouTube": {
    hostname: "www.youtube.com",
    pathnamePrefix: "/watch",
  },
  "x:Iida_Hikaru_828": {
    hostname: "x.com",
    pathnamePrefix: "/Iida_Hikaru_828/status/",
  },
  "x:beat_since2016": {
    hostname: "x.com",
    pathnamePrefix: "/beat_since2016/status/",
  },
  "x:futsu_vg": {
    hostname: "x.com",
    pathnamePrefix: "/futsu_vg/status/",
  },
  "x:gekirock_shop": {
    hostname: "x.com",
    pathnamePrefix: "/gekirock_shop/status/",
  },
  "x:PodcastsMs_jp": {
    hostname: "x.com",
    pathnamePrefix: "/PodcastsMs_jp/status/",
  },
  "youtube:idolmaster-channel": {
    hostname: "www.youtube.com",
    pathnamePrefix: "/watch",
  },
  "x:voicegarage_ch": {
    hostname: "x.com",
    pathnamePrefix: "/voicegarage_ch/status/",
  },
  "x:ngtk_itagochi": {
    hostname: "x.com",
    pathnamePrefix: "/ngtk_itagochi/status/",
  },
  "x:iyapan_anime": {
    hostname: "x.com",
    pathnamePrefix: "/iyapan_anime/status/",
  },
  "official:bushiroad": {
    hostname: "bushiroad.com",
    pathnamePrefix: "/",
  },
  "x:Marine__girls": {
    hostname: "x.com",
    pathnamePrefix: "/Marine__girls/status/",
  },
  "野中ここなのREC中！公式X": {
    hostname: "x.com",
    pathnamePrefix: "/kokona_rec/status/",
  },
  "official:dialogue-music": {
    hostname: "dialogue-music.jp",
    pathnamePrefix: "/",
  },
  "x:voice_lounge": {
    hostname: "x.com",
    pathnamePrefix: "/voice_lounge/status/",
  },
  "x:sashibana_vg": {
    hostname: "x.com",
    pathnamePrefix: "/sashibana_vg/status/",
  },
  "x:seifukubu_love": {
    hostname: "x.com",
    pathnamePrefix: "/seifukubu_love/status/",
  },
  "x:gkmas_official": {
    hostname: "x.com",
    pathnamePrefix: "/gkmas_official/status/",
  },
  "日本ファルコム公式ニュース": {
    hostname: "www.falcom.co.jp",
    pathnamePrefix: "/",
  },
  "x:nihonfalcom": {
    hostname: "x.com",
    pathnamePrefix: "/nihonfalcom/status/",
  },
  "スターセイヴァー公式YouTube": {
    hostname: "www.youtube.com",
    pathnamePrefix: "/watch",
  },
  "x:StellaSoraJP": {
    hostname: "x.com",
    pathnamePrefix: "/StellaSoraJP/status/",
  },
  "qureate公式X": {
    hostname: "x.com",
    pathnamePrefix: "/qureate/status/",
  },
  "youtube:Tetra Voice Station": {
    hostname: "www.youtube.com",
    pathnamePrefix: "/watch",
  },
  "x:su_kawa_vg": {
    hostname: "x.com",
    pathnamePrefix: "/su_kawa_vg/status/",
  },
  "youtube:ボイスガレッジチャンネル in YouTube": {
    hostname: "www.youtube.com",
    pathnamePrefix: "/watch",
  },
} as const;

export type OfficialAppearanceSourceName =
  keyof typeof officialAppearanceSources;

const timezoneSuffixPattern = /(?:Z|[+-]\d{2}:\d{2})$/;
const seriesIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function assertDateTime(value: string, fieldName: string, id: string) {
  if (!timezoneSuffixPattern.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`${id}: ${fieldName} must be a valid timezone-aware datetime.`);
  }
}

function assertCalendarDate(value: string, fieldName: string, id: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`${id}: ${fieldName} must be a valid YYYY-MM-DD date.`);
  }

  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`${id}: ${fieldName} must be a valid YYYY-MM-DD date.`);
  }
}

function validatePublication(item: AppearanceImportItem) {
  switch (item.publishedAtPrecision) {
    case "exact":
      if (item.publishedAt === null || item.publishedOn !== null) {
        throw new Error(
          `${item.id}: exact publishedAtPrecision requires publishedAt only.`,
        );
      }
      assertDateTime(item.publishedAt, "publishedAt", item.id);
      return;
    case "date":
      if (item.publishedAt !== null || item.publishedOn === null) {
        throw new Error(
          `${item.id}: date publishedAtPrecision requires publishedOn only.`,
        );
      }
      assertCalendarDate(item.publishedOn, "publishedOn", item.id);
      return;
    case "unknown":
      if (item.publishedAt !== null || item.publishedOn !== null) {
        throw new Error(
          `${item.id}: unknown publishedAtPrecision cannot include a publication date.`,
        );
      }
      return;
  }
}

function validateAppearanceStart(item: AppearanceImportItem) {
  switch (item.startsAtPrecision) {
    case "exact":
      if (item.startsAt === null || item.startsOn !== null) {
        throw new Error(
          `${item.id}: exact startsAtPrecision requires startsAt only.`,
        );
      }
      assertDateTime(item.startsAt, "startsAt", item.id);
      return;
    case "date":
      if (item.startsAt !== null || item.startsOn === null) {
        throw new Error(
          `${item.id}: date startsAtPrecision requires startsOn only.`,
        );
      }
      assertCalendarDate(item.startsOn, "startsOn", item.id);
      return;
    case "unknown":
      if (item.startsAt !== null || item.startsOn !== null) {
        throw new Error(
          `${item.id}: unknown startsAtPrecision cannot include a start date.`,
        );
      }
      return;
  }
}

export function validateAppearanceImportItems(
  items: readonly AppearanceImportItem[],
  series: readonly AppearanceSeries[],
) {
  const ids = new Set<string>();
  const seriesIds = new Set<string>();
  const seriesNames = new Set<string>();
  const groupMetadata = new Map<
    string,
    {
      eventTitle: string;
      category: AppearanceCategory;
      seriesId: string | null;
    }
  >();
  const groupSessionKeys = new Set<string>();

  if (items.length === 0) {
    throw new Error("At least one appearance is required.");
  }

  if (series.length === 0) {
    throw new Error("At least one appearance series is required.");
  }

  for (const item of series) {
    if (!seriesIdPattern.test(item.id) || !item.displayName.trim()) {
      throw new Error("Appearance series must have a normalized id and displayName.");
    }
    if (seriesIds.has(item.id) || seriesNames.has(item.displayName)) {
      throw new Error(`Duplicate appearance series: ${item.id}.`);
    }
    seriesIds.add(item.id);
    seriesNames.add(item.displayName);
  }

  for (const item of items) {
    if (item.guestInfo !== undefined) normalizeGuestInfo(item.guestInfo);
    if (!item.id.trim() || !item.title.trim() || !item.sourceItemId.trim()) {
      throw new Error("Appearance id, title, and sourceItemId must not be empty.");
    }

    if (!appearanceCategories.includes(item.category)) {
      throw new Error(`${item.id}: unsupported category ${item.category}.`);
    }

    validateAppearanceStart(item);
    validatePublication(item);

    if (item.seriesId !== null && !seriesIds.has(item.seriesId)) {
      throw new Error(`${item.id}: unknown appearance series ${item.seriesId}.`);
    }

    const groupValues = [
      item.eventGroupId,
      item.eventTitle,
      item.sessionLabel,
    ];
    const hasGroupValue = groupValues.some((value) => value !== null);
    const hasMissingGroupValue = groupValues.some((value) => value === null);

    if (hasGroupValue && hasMissingGroupValue) {
      throw new Error(
        `${item.id}: eventGroupId, eventTitle, and sessionLabel must be set together.`,
      );
    }

    if (hasGroupValue) {
      const eventGroupId = item.eventGroupId as string;
      const eventTitle = item.eventTitle as string;
      const sessionLabel = item.sessionLabel as string;

      if (!eventGroupId.trim() || !eventTitle.trim() || !sessionLabel.trim()) {
        throw new Error(`${item.id}: group information must not be empty.`);
      }

      const existingGroup = groupMetadata.get(eventGroupId);
      if (
        existingGroup &&
        (existingGroup.eventTitle !== eventTitle ||
          existingGroup.category !== item.category ||
          existingGroup.seriesId !== item.seriesId)
      ) {
        throw new Error(
          `${item.id}: group ${eventGroupId} must use one eventTitle and category.`,
        );
      }

      groupMetadata.set(eventGroupId, {
        eventTitle,
        category: item.category,
        seriesId: item.seriesId,
      });

      const groupSessionKey = `${eventGroupId}\u0000${sessionLabel}`;
      if (groupSessionKeys.has(groupSessionKey)) {
        throw new Error(
          `${item.id}: duplicate sessionLabel ${sessionLabel} in group ${eventGroupId}.`,
        );
      }
      groupSessionKeys.add(groupSessionKey);
    }

    const source = officialAppearanceSources[item.sourceName];
    const sourceUrl = new URL(item.sourceUrl);
    const matchesHostname =
      sourceUrl.hostname === source.hostname ||
      ("hostnameAliases" in source &&
        source.hostnameAliases.some((hostname) => hostname === sourceUrl.hostname));

    if (
      sourceUrl.protocol !== "https:" ||
      !matchesHostname ||
      !sourceUrl.pathname.startsWith(source.pathnamePrefix)
    ) {
      throw new Error(
        `${item.id}: sourceUrl does not match the registered official source ${item.sourceName}.`,
      );
    }

    if (ids.has(item.id)) {
      throw new Error(`Duplicate appearance id: ${item.id}.`);
    }

    ids.add(item.id);
  }
}
