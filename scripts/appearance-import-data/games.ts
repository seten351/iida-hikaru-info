import type { AppearanceImportItem } from "../../src/domain/appearance";
import { publishedAt, publishedOn, singleDate, singleUnknown } from "./helpers";

export const gameAppearances = [
  singleDate({
    id: "seifuku-kanojo-3",
    startsOn: "2026-09-10",
    title: "ゲーム『制服カノジョ3』（八尋実咲 役）",
    seriesId: "seifuku-kanojo",
    category: "ゲーム",
    sourceUrl: "https://www.entergram.co.jp/seikano3/",
    publication: publishedOn("2026-09-10"),
    sourceName: "official:entergram",
    sourceItemId: "entergram:seikano3",
  }),
  singleDate({
    id: "fire-emblem-banshi-senko",
    startsOn: "2026-09-17",
    title: "ファイアーエムブレム 万紫千紅（カターニャ／君子蘭婦人役）",
    seriesId: "fire-emblem",
    category: "ゲーム",
    sourceUrl: "https://x.com/FireEmblemJP/status/2094757161176056163",
    publication: publishedAt("2026-09-01T21:00:00+09:00"),
    sourceName: "x:fire-emblem",
    sourceItemId: "2094757161176056163",
  }),
  singleUnknown({
    id: "sugar-lies-game",
    title: "ゲーム『Sugar Lies』（雪平明星 役・主題歌歌唱）",
    seriesId: "sugar-lies",
    category: "ゲーム",
    sourceUrl: "https://sugarlies.kogado.com/",
    publication: publishedOn("2026-09-18"),
    sourceName: "official:kogado",
    sourceItemId: "kogado:sugarlies",
  }),
  singleDate({
    id: "bang-dream-our-notes",
    startsOn: "2026-09-24",
    title: "ゲーム『バンドリ！ アワーノーツ』（沢海奏多 役）",
    seriesId: "bang-dream",
    category: "ゲーム",
    sourceUrl: "https://x.com/Iida_Hikaru_828/status/2103119925682557035",
    publication: publishedAt("2026-09-24T22:50:39.018+09:00"),
    sourceName: "x:iida-hikaru",
    sourceItemId: "2103119925682557035",
  }),
] satisfies readonly AppearanceImportItem[];
