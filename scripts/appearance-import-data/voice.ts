import type { AppearanceImportItem } from "../../src/domain/appearance";
import { single } from "./helpers";

const agencyProfileUrl = "https://www.raccoon-dog.co.jp/talent/r18-iida.html";

export const voiceAppearances = [
  single({
    id: "grand-blue-season-2",
    startsAt: "2025-09-09T00:30:00+09:00",
    title: "TVアニメ『ぐらんぶる』Season 2（声の出演）",
    seriesId: "grand-blue",
    category: "テレビ",
    sourceUrl: agencyProfileUrl,
    sourceName: "official:raccoon-dog",
    sourceItemId: "profile:tv:grand-blue-season-2",
  }),
  single({
    id: "booklove-adopted-daughter-season",
    startsAt: "2026-04-11T17:30:00+09:00",
    title: "TVアニメ『本好きの下剋上 領主の養女』シーズン出演",
    seriesId: "ascendance-of-a-bookworm",
    category: "テレビ",
    sourceUrl: agencyProfileUrl,
    sourceName: "official:raccoon-dog",
    sourceItemId: "profile:tv:booklove-adopted-daughter",
  }),
  single({
    id: "iyapan-r",
    startsAt: "2026-05-07T22:00:00+09:00",
    title: "Webアニメ『嫌な顔されながらおパンツ見せてもらいたいR』（声の出演）",
    seriesId: "iyapan",
    category: "配信",
    sourceUrl: agencyProfileUrl,
    sourceName: "official:raccoon-dog",
    sourceItemId: "profile:web:iyapan-r",
  }),
  single({
    id: "ichijoma",
    startsAt: "2026-05-10T02:00:00+09:00",
    title: "TVアニメ『一畳間まんきつ暮らし！』（声の出演）",
    seriesId: "ichijoma",
    category: "テレビ",
    sourceUrl: agencyProfileUrl,
    sourceName: "official:raccoon-dog",
    sourceItemId: "profile:tv:ichijoma",
  }),
] satisfies readonly AppearanceImportItem[];
