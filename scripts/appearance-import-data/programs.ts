import type { AppearanceImportItem } from "../../src/domain/appearance";
import { publishedAt, single } from "./helpers";

const hikaroomEpisodes = [
  [24, "2025-09-23T21:00:00+09:00"],
  [25, "2025-10-28T19:00:00+09:00"],
  [26, "2025-11-18T20:00:00+09:00"],
  [27, "2025-12-25T20:00:00+09:00"],
  [28, "2026-01-28T20:00:00+09:00"],
  [29, "2026-02-23T20:00:00+09:00"],
  [30, "2026-03-16T20:00:00+09:00"],
  [31, "2026-04-27T20:00:00+09:00"],
  [32, "2026-05-18T20:00:00+09:00"],
  [33, "2026-07-31T20:00:00+09:00"],
  [34, "2026-08-13T20:00:00+09:00"],
  [35, "2026-08-31T20:00:00+09:00"],
] as const;

const kannahikaruEpisodes = [
  [1, "2026-03-03T19:00:00+09:00"],
  [2, "2026-03-17T19:00:00+09:00"],
  [3, "2026-03-31T19:00:00+09:00"],
  [4, "2026-04-14T19:00:00+09:00"],
  [5, "2026-04-28T19:00:00+09:00"],
  [6, "2026-05-12T19:00:00+09:00"],
  [7, "2026-05-26T19:00:00+09:00"],
  [8, "2026-06-09T19:00:00+09:00"],
  [9, "2026-06-23T19:00:00+09:00"],
  [10, "2026-07-07T19:00:00+09:00"],
  [11, "2026-07-21T19:00:00+09:00"],
  [12, "2026-08-04T19:00:00+09:00"],
  [13, "2026-08-18T19:00:00+09:00"],
  [14, "2026-09-01T19:00:00+09:00"],
] as const;

const pikanonoEpisodes = [
  [1, "2026-05-19T20:00:00+09:00"],
  [2, "2026-05-29T20:00:00+09:00"],
  [3, "2026-06-16T20:30:00+09:00"],
  [4, "2026-06-23T20:00:00+09:00"],
  [5, "2026-06-30T20:00:00+09:00"],
  [9, "2026-08-11T20:00:00+09:00"],
  [10, "2026-08-18T20:00:00+09:00"],
  [11, "2026-08-25T20:00:00+09:00"],
] as const;

const hatsuboshiEpisodes = [
  [58, "2025-10-08T21:00:00+09:00"],
  [64, "2025-11-19T21:00:00+09:00"],
  [69, "2025-12-24T21:15:00+09:00"],
  [72, "2026-01-21T21:00:00+09:00"],
  [81, "2026-03-25T21:00:00+09:00"],
  [84, "2026-04-15T21:00:00+09:00"],
  [96, "2026-07-08T21:00:00+09:00"],
  [100, "2026-08-05T19:00:00+09:00"],
] as const;

const yuriRelationEpisodes = [
  ["live-2025-09-30", "2025-09-30T20:00:00+09:00", "YuriRelation 生放送"],
  ["game-24", "2025-10-06T23:00:00+09:00", "YuriRelation ゲーム実況 #24"],
  ["game-25", "2025-10-13T23:00:00+09:00", "YuriRelation ゲーム実況 #25"],
  ["game-26", "2025-10-20T23:00:00+09:00", "YuriRelation ゲーム実況 #26"],
  ["game-27", "2025-10-20T23:20:00+09:00", "YuriRelation ゲーム実況 #27"],
  ["game-33", "2025-12-01T23:00:00+09:00", "YuriRelation ゲーム実況 #33"],
  ["game-34", "2025-12-08T23:00:00+09:00", "YuriRelation ゲーム実況 #34"],
  ["game-35", "2025-12-15T23:00:00+09:00", "YuriRelation ゲーム実況 #35"],
] as const;

export const regularProgramAppearances = [
  ...hikaroomEpisodes.map(([episode, startsAt]) =>
    single({
      id: `hikaroom-episode-${episode}`,
      startsAt,
      title: `飯田ヒカルのヒカROOM！ 第${episode}回`,
      seriesId: "hikaroom",
      category: "配信",
      sourceUrl:
        episode === 35
          ? "https://x.com/iidahikaroom/status/2092901505024344380"
          : "https://x.com/iidahikaroom",
      publication:
        episode === 35
          ? publishedAt("2026-08-27T18:06:17.684+09:00")
          : undefined,
      sourceName:
        episode === 35 ? "x:iidahikaroom" : "x:iidahikaroom-account",
      sourceItemId:
        episode === 35
          ? "2092901505024344380"
          : `iidahikaroom:episode:${episode}`,
    }),
  ),
  ...kannahikaruEpisodes.map(([episode, startsAt]) =>
    single({
      id: `kannahikaru-episode-${episode}`,
      startsAt,
      title: `カンナヒカル（仮）第${episode}回`,
      seriesId: "kannahikaru",
      category: "ラジオ",
      sourceUrl: "https://www.onsen.ag/program/umauma",
      sourceName: "official:onsen",
      sourceItemId: `umauma:episode:${episode}`,
    }),
  ),
  ...pikanonoEpisodes.map(([episode, startsAt]) =>
    single({
      id: `pikanono-episode-${episode}`,
      startsAt,
      title: `ぴかのの定理 第${episode}回`,
      seriesId: "pikanono",
      category: "配信",
      sourceUrl: "https://x.com/voice_lounge",
      sourceName: "x:voice-lounge",
      sourceItemId: `voice_lounge:pikanono:${episode}`,
    }),
  ),
  ...hatsuboshiEpisodes.map(([episode, startsAt]) =>
    single({
      id: `hatsuboshi-housoubu-episode-${episode}`,
      startsAt,
      title: `初星学園放送部 第${episode}回`,
      seriesId: "gakuen-idolmaster",
      category: "配信",
      sourceUrl: "https://asobichannel.asobistore.jp/",
      sourceName: "official:asobi-channel",
      sourceItemId: `hatsuboshi-housoubu:${episode}`,
    }),
  ),
  ...yuriRelationEpisodes.map(([key, startsAt, title]) =>
    single({
      id: `yuri-relation-${key}`,
      startsAt,
      title,
      seriesId: "yuri-relation",
      category: "配信",
      sourceUrl: "https://ch.nicovideo.jp/voicegarage",
      sourceName: "official:niconico-channel",
      sourceItemId: `yurirelation:${key}`,
    }),
  ),
  single({
    id: "one-and-only-episode-11",
    startsAt: "2025-11-17T20:00:00+09:00",
    title: "ONE AND ONLY 第11回",
    seriesId: "one-and-only",
    category: "ラジオ",
    sourceUrl: "https://www.onsen.ag/program/aoi",
    sourceName: "official:onsen",
    sourceItemId: "aoi:episode:11",
  }),
  single({
    id: "usui-frontier-episode-7",
    startsAt: "2026-01-08T19:00:00+09:00",
    title: "うすいフロンティア 第7回",
    seriesId: "usui-frontier",
    category: "配信",
    sourceUrl: "https://ch.nicovideo.jp/voicegarage",
    sourceName: "official:niconico-channel",
    sourceItemId: "usui-frontier:episode:7",
  }),
  single({
    id: "tricolor-episode-32",
    startsAt: "2026-01-29T13:00:00+09:00",
    title: "礒部花凜・土屋李央・林鼓子 トリコロールカラー 第32回",
    seriesId: "tricolor-color",
    category: "ラジオ",
    sourceUrl: "https://www.onsen.ag/program/tricolor",
    sourceName: "official:onsen",
    sourceItemId: "tricolor:episode:32",
  }),
  single({
    id: "hanaiwa-kana-episode-66",
    startsAt: "2026-05-18T18:00:00+09:00",
    title: "花岩香奈のはないわーるど 第66回",
    seriesId: "hanaiwa-world",
    category: "ラジオ",
    sourceUrl: "https://audee-membership.jp/hanaiwa-kana",
    sourceName: "official:audee",
    sourceItemId: "hanaiwa-kana:episode:66",
  }),
] satisfies readonly AppearanceImportItem[];
