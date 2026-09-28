import { load } from "cheerio";
import { fetchText } from "../http";
import { SourceValidationError } from "../source-errors";

type Video = { videoId: string; title: string; episode: number };
type ChannelItem = {
  richItemRenderer?: { content?: {
    lockupViewModel?: {
      contentType?: string;
      contentId?: string;
      metadata?: { lockupMetadataViewModel?: { title?: { content?: string } } };
      rendererContext?: { commandContext?: { onTap?: { innertubeCommand?: { watchEndpoint?: { videoId?: string } } } } };
    };
    videoRenderer?: {
      videoId?: string;
      title?: { simpleText?: string; runs?: { text: string }[] };
      navigationEndpoint?: { watchEndpoint?: { videoId?: string } };
    };
  } };
};
type ChannelData = {
  metadata?: { channelMetadataRenderer?: { externalId?: string } };
  contents?: { twoColumnBrowseResultsRenderer?: { tabs?: { tabRenderer?: {
    selected?: boolean;
    endpoint?: { commandMetadata?: { webCommandMetadata?: { url?: string } } };
    content?: { richGridRenderer?: { contents?: ChannelItem[] } };
  } }[] } };
};
type PlayerData = {
  videoDetails?: { videoId?: string; channelId?: string; title?: string };
  microformat?: { playerMicroformatRenderer?: { externalChannelId?: string; publishDate?: string } };
};

/** Read JSON assignments only; never execute scripts supplied by a source page. */
function pageData<T>(html: string, variable: "ytInitialData" | "ytInitialPlayerResponse"): T {
  const $ = load(html);
  const assignment = new RegExp(`^\\s*var\\s+${variable}\\s*=\\s*(\\{[\\s\\S]*\\})\\s*;?\\s*$`, "u");
  for (const element of $("script").toArray()) {
    const match = assignment.exec($(element).text());
    if (match) {
      try { return JSON.parse(match[1]) as T; }
      catch { throw new SourceValidationError("invalid-json"); }
    }
  }
  throw new SourceValidationError(variable === "ytInitialData" ? "channel-data-missing" : "video-data-missing");
}

export function parseYouTubeChannelPage(
  html: string,
  channelId: string,
  tab: "videos" | "streams",
  episodeFromTitle: (title: string) => number | null,
): Video[] {
  const data = pageData<ChannelData>(html, "ytInitialData");
  if (data.metadata?.channelMetadataRenderer?.externalId !== channelId) {
    throw new SourceValidationError("channel-mismatch");
  }
  const selected = data.contents?.twoColumnBrowseResultsRenderer?.tabs
    ?.map(item => item.tabRenderer).find(item => item?.selected);
  const url = new URL(selected?.endpoint?.commandMetadata?.webCommandMetadata?.url ?? "/", "https://www.youtube.com");
  if (url.origin !== "https://www.youtube.com" || !url.pathname.endsWith(`/${tab}`)) {
    throw new SourceValidationError("tab-missing");
  }
  const items = selected?.content?.richGridRenderer?.contents;
  if (!Array.isArray(items) || !items.length) throw new SourceValidationError("grid-empty");

  const videos: Video[] = [];
  let videoCount = 0;
  // Restrict extraction to the selected tab's own grid, excluding recommendations.
  for (const item of items) {
    const content = item.richItemRenderer?.content;
    const lockup = content?.lockupViewModel;
    const renderer = content?.videoRenderer;
    if (lockup?.contentType !== "LOCKUP_CONTENT_TYPE_VIDEO" && !renderer) continue;
    videoCount++;
    const title = lockup?.metadata?.lockupMetadataViewModel?.title?.content
      ?? renderer?.title?.simpleText ?? renderer?.title?.runs?.map(run => run.text).join("") ?? "";
    const episode = episodeFromTitle(title);
    if (!episode) continue;
    const videoId = lockup?.contentId ?? renderer?.videoId ?? "";
    const endpointId = lockup?.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint?.videoId
      ?? renderer?.navigationEndpoint?.watchEndpoint?.videoId;
    if (!/^[\w-]{11}$/u.test(videoId) || endpointId !== videoId) {
      throw new SourceValidationError("video-link-mismatch");
    }
    videos.push({ videoId, title, episode });
  }
  if (!videoCount) throw new SourceValidationError("grid-unrecognized");
  return videos;
}

export function parseYouTubeVideoPage(
  html: string,
  channelId: string,
  video: Video,
  episodeFromTitle: (title: string) => number | null,
): string {
  const data = pageData<PlayerData>(html, "ytInitialPlayerResponse");
  const details = data.videoDetails;
  const metadata = data.microformat?.playerMicroformatRenderer;
  if (!details || !metadata) throw new SourceValidationError("video-details-missing");
  if (details.channelId !== channelId || metadata.externalChannelId !== channelId) {
    throw new SourceValidationError("video-channel-mismatch");
  }
  if (details.videoId !== video.videoId || episodeFromTitle(details.title ?? "") !== video.episode) {
    throw new SourceValidationError("video-episode-mismatch");
  }
  const published = metadata.publishDate ?? "";
  // A date alone, relative label, or live start time is not a publication timestamp.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(published)
    || Number.isNaN(Date.parse(published))) {
    throw new SourceValidationError("publication-time-missing");
  }
  return new Date(published).toISOString();
}

export async function fetchYouTubeProgramPages(program: {
  channelId: string;
  episodeFromTitle: (title: string) => number | null;
}) {
  const tabs = await Promise.all((["videos", "streams"] as const).map(async tab => {
    // Hosted runners are often outside Japan; translated titles lose the program matcher.
    const html = await fetchText(`https://www.youtube.com/channel/${program.channelId}/${tab}?hl=ja`);
    return parseYouTubeChannelPage(html, program.channelId, tab, program.episodeFromTitle);
  }));
  // Prefer public videos to members-only copies of the same episode.
  const byEpisode = new Map<number, Video>();
  for (const video of tabs.flat()) {
    const existing = byEpisode.get(video.episode);
    if (!existing || (/メンバー限定/u.test(existing.title) && !/メンバー限定/u.test(video.title))) {
      byEpisode.set(video.episode, video);
    }
  }
  const episodes = [...byEpisode.values()]
    .sort((a, b) => b.episode - a.episode).slice(0, 15);
  if (!episodes.length) throw new SourceValidationError("episodes-missing");

  const result: Array<Video & { publishedAt: string }> = [];
  // Bound concurrency and history, keeping the fallback within the patrol timeout.
  for (let offset = 0; offset < episodes.length; offset += 3) {
    result.push(...await Promise.all(episodes.slice(offset, offset + 3).map(async video => {
      const html = await fetchText(`https://www.youtube.com/watch?v=${video.videoId}&hl=ja`);
      return { ...video, publishedAt: parseYouTubeVideoPage(html, program.channelId, video, program.episodeFromTitle) };
    })));
  }
  return result;
}
