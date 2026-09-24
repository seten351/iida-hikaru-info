import { createHash } from "node:crypto";
import type { AppearanceCategory } from "../../src/domain/appearance";

export type PatrolCandidate = {
  key: string;
  kind: "profile" | "program" | "news";
  title: string;
  category: AppearanceCategory;
  sourceUrl: string;
  publishedAt: string | null;
  publishedOn?: string | null;
  seriesId?: string;
  appearanceId?: string;
  note: string;
};

export function normalizeTitle(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

export function candidateId(candidate: PatrolCandidate) {
  const content = JSON.stringify([
    candidate.key, candidate.title, candidate.category, candidate.sourceUrl,
    candidate.publishedAt, candidate.publishedOn ?? null, candidate.note,
  ]);
  return `patrol-${createHash("sha256").update(content).digest("hex")}`;
}

export function publishedAtFromX(url: string) {
  const parsed = new URL(url);
  if (!["x.com", "twitter.com", "www.x.com", "www.twitter.com"].includes(parsed.hostname)) return null;
  const id = /^\/[^/]+\/status\/(\d+)\/?$/.exec(parsed.pathname)?.[1];
  if (!id) return null;
  const milliseconds = Number((BigInt(id) >> BigInt(22)) + BigInt("1288834974657"));
  return Number.isSafeInteger(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

export function isIndividualSource(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") return false;
  if (["x.com", "twitter.com"].includes(parsed.hostname)) return /^\/[^/]+\/status\/\d+\/?$/.test(parsed.pathname);
  if (["www.youtube.com", "youtube.com"].includes(parsed.hostname)) return /^\/(?:live|shorts)\/[\w-]{11}$/.test(parsed.pathname) || (parsed.pathname === "/watch" && /^[\w-]{11}$/.test(parsed.searchParams.get("v") ?? ""));
  if (parsed.hostname === "youtu.be") return /^\/[\w-]{11}$/.test(parsed.pathname);
  if (["live.nicovideo.jp", "www.nicovideo.jp"].includes(parsed.hostname)) return /^\/watch\/(?:lv|so|sm)?\d+$/.test(parsed.pathname);
  return false;
}
