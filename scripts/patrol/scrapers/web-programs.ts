import { load } from "cheerio";

import { fetchText } from "../http";
import type { PatrolCandidate } from "../types";

const ONSEN_URL = "https://www.onsen.ag/program/umauma";
const HIKAROOM_ATOM_URL = "https://www.youtube.com/feeds/videos.xml?channel_id=UC7ebYYsL-Uj3Q724lD2lR1Q";
const PIKANONO_ATOM_URL = "https://www.youtube.com/feeds/videos.xml?channel_id=UCO0ZWJpt-1Ya_sZGfFmsyKA";

type YouTubeProgram = {
  seriesId: "hikaroom" | "pikanono";
  seriesTitle: string;
  channelId: string;
  atomUrl: string;
  episodeFromTitle: (title: string) => number | null;
};

const HIKAROOM: YouTubeProgram = {
  seriesId: "hikaroom",
  seriesTitle: "飯田ヒカルのヒカROOM！",
  channelId: "UC7ebYYsL-Uj3Q724lD2lR1Q",
  atomUrl: HIKAROOM_ATOM_URL,
  episodeFromTitle: (title) => {
    const normalized = title.normalize("NFKC");
    if (/おまけ/u.test(normalized)) return null;
    return episodeFromMatch(/飯田ヒカルのヒカROOM\s*[!！]?\s*第\s*(\d+)\s*回/u, normalized);
  },
};

const PIKANONO: YouTubeProgram = {
  seriesId: "pikanono",
  seriesTitle: "ぴかのの定理",
  channelId: "UCO0ZWJpt-1Ya_sZGfFmsyKA",
  atomUrl: PIKANONO_ATOM_URL,
  episodeFromTitle: (title) => {
    const normalized = title.normalize("NFKC");
    if (/おまけ/u.test(normalized)) return null;
    return episodeFromMatch(/ぴかのの定理[」』]?\s*#\s*(\d+)(?!\d)/u, normalized);
  },
};

function episodeFromMatch(pattern: RegExp, title: string) {
  const matched = pattern.exec(title)?.[1];
  if (!matched) return null;
  const episode = Number(matched);
  return Number.isSafeInteger(episode) && episode > 0 ? episode : null;
}

function candidate(
  seriesId: PatrolCandidate["seriesId"],
  episode: number,
  title: string,
  category: PatrolCandidate["category"],
  sourceUrl: string,
  publishedAt: string | null,
  note: string,
): PatrolCandidate {
  if (!seriesId) throw new Error("Program candidate requires a series ID");
  return {
    key: `program:${seriesId}:${episode}`,
    kind: "program",
    title,
    category,
    sourceUrl,
    publishedAt,
    seriesId,
    appearanceId: `${seriesId}-episode-${episode}`,
    note,
  };
}

/** Parse only the documented program rows; do not inspect embedded Nuxt data. */
export function parseOnsenProgramHtml(html: string): PatrolCandidate[] {
  const $ = load(html);
  const pageTitle = $("head > title").text().replace(/\s+/gu, " ");
  const pageHeading = $("h1").first().text().replace(/\s+/gu, " ");
  if (!pageTitle.includes("カンナヒカル") && !pageHeading.includes("カンナヒカル")) {
    throw new Error("Onsen page does not identify the expected program");
  }
  const rows = $("div.scroll-table > table > tbody > tr.wrap-content");
  if (rows.length === 0) throw new Error("Onsen program table is missing or empty");

  const seenEpisodes = new Set<number>();
  const candidates: PatrolCandidate[] = [];
  rows.each((_, row) => {
    const rawTitle = $(row).find("p.pro-title-content").first().text().replace(/\s+/gu, " ").trim();
    const normalized = rawTitle.normalize("NFKC");
    // This deliberately requires the title to end at the episode number, excluding bonuses.
    const episode = episodeFromMatch(/^第\s*(\d+)\s*回$/u, normalized);
    if (!episode || seenEpisodes.has(episode)) return;
    seenEpisodes.add(episode);
    candidates.push(candidate(
      "kannahikaru", episode, `カンナヒカル（仮）第${episode}回`, "ラジオ", ONSEN_URL, null,
      "音泉の番組一覧で回数を確認。個別告知URLと公開日時は未確認のため、候補として通知。",
    ));
  });

  if (candidates.length === 0) throw new Error("Onsen program table contains no matching main episodes");
  return candidates;
}

function directText($: ReturnType<typeof load>, node: ReturnType<ReturnType<typeof load>>, selector: string) {
  return node.children(selector).first().text().trim();
}

function exactTimestamp(value: string) {
  if (!/\d(?:Z|[+-]\d{2}:\d{2})$/u.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function channelIdFromAuthor($: ReturnType<typeof load>, entry: ReturnType<ReturnType<typeof load>>) {
  const uri = entry.children("author").first().children("uri").first().text().trim();
  return /^https?:\/\/(?:www\.)?youtube\.com\/channel\/([\w-]+)\/?$/u.exec(uri)?.[1] ?? null;
}

/** Parses a YouTube Atom feed after proving it is the intended official channel. */
export function parseYouTubeProgramAtom(xml: string, program: YouTubeProgram): PatrolCandidate[] {
  if (!xml.trim().startsWith("<")) throw new Error("YouTube Atom feed is not XML");
  const $ = load(xml, { xmlMode: true });
  const feed = $("feed").first();
  if (feed.length !== 1 || $.root().children("feed").length !== 1) throw new Error("YouTube Atom feed root is invalid");
  if (feed.attr("xmlns") !== "http://www.w3.org/2005/Atom") throw new Error("YouTube Atom namespace is missing");

  const feedChannelId = directText($, feed, "yt\\:channelId");
  const feedAuthorChannelId = channelIdFromAuthor($, feed);
  // YouTube's feed-level yt:channelId currently drops the leading "UC".  The
  // feed author URL remains a full canonical channel identifier, so accept
  // either independently verifiable identifier.
  if (feedChannelId !== program.channelId && feedAuthorChannelId !== program.channelId) {
    throw new Error("YouTube Atom feed cannot be verified as the official channel");
  }

  const entries = feed.children("entry");
  if (entries.length === 0) throw new Error("YouTube Atom feed has no entries");

  const seenEpisodes = new Set<number>();
  const candidates: PatrolCandidate[] = [];
  entries.each((_, entryNode) => {
    const entry = $(entryNode);
    const sourceTitle = directText($, entry, "title");
    const episode = program.episodeFromTitle(sourceTitle);
    if (!episode || seenEpisodes.has(episode)) return;

    const authorChannelId = channelIdFromAuthor($, entry);
    const entryChannelId = directText($, entry, "yt\\:channelId");
    if (entryChannelId && entryChannelId !== program.channelId) throw new Error("YouTube Atom entry channel ID does not match the official channel");
    if (authorChannelId && authorChannelId !== program.channelId) throw new Error("YouTube Atom entry author does not match the official channel");
    if (entryChannelId !== program.channelId && authorChannelId !== program.channelId) throw new Error("YouTube Atom entry cannot be verified as the official channel");

    const videoId = directText($, entry, "yt\\:videoId");
    const entryId = directText($, entry, "id");
    if (!/^[\w-]{11}$/u.test(videoId) || entryId !== `yt:video:${videoId}`) throw new Error("YouTube Atom entry has an invalid video ID");

    seenEpisodes.add(episode);
    const publishedAt = exactTimestamp(directText($, entry, "published"));
    if (!publishedAt) throw new Error("YouTube Atom entry is missing a valid publication timestamp");
    candidates.push(candidate(
      program.seriesId, episode, `${program.seriesTitle} 第${episode}回`, "配信",
      `https://www.youtube.com/watch?v=${videoId}`, publishedAt,
      "公式YouTube Atomフィードで動画公開日時を確認。配信・放送日時は未検証のため、候補として通知。",
    ));
  });

  if (candidates.length === 0) throw new Error(`YouTube Atom feed contains no ${program.seriesTitle} main episodes`);
  return candidates;
}

export function parseHikaroomProgramAtom(xml: string) {
  return parseYouTubeProgramAtom(xml, HIKAROOM);
}

export function parsePikanonoProgramAtom(xml: string) {
  return parseYouTubeProgramAtom(xml, PIKANONO);
}

export async function scrapeOnsenProgram(): Promise<PatrolCandidate[]> {
  return parseOnsenProgramHtml(await fetchText(ONSEN_URL));
}

export async function scrapeHikaroomProgram(): Promise<PatrolCandidate[]> {
  return parseHikaroomProgramAtom(await fetchText(HIKAROOM.atomUrl));
}

export async function scrapePikanonoProgram(): Promise<PatrolCandidate[]> {
  return parsePikanonoProgramAtom(await fetchText(PIKANONO.atomUrl));
}
