import type { AppearanceImportItem } from "../../src/domain/appearance";
import { publishedOn, singleDate, singleUnknown } from "./helpers";

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
    id: "fire-emblem-banshisankou",
    startsOn: "2026-09-17",
    title: "ゲーム『ファイアーエムブレム 万紫千紅』（カターニャ、君子蘭婦人 役）",
    seriesId: "fire-emblem",
    category: "ゲーム",
    sourceUrl: "https://store-jp.nintendo.com/item/software/D70010000126928",
    publication: publishedOn("2026-09-17"),
    sourceName: "official:nintendo-store",
    sourceItemId: "nintendo:software:D70010000126928",
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
    sourceUrl: "https://bang-dream.com/",
    publication: publishedOn("2026-09-24"),
    sourceName: "official:bang-dream",
    sourceItemId: "bang-dream:our-notes",
  }),
] satisfies readonly AppearanceImportItem[];
