import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { candidateId } from "../../scripts/patrol/types";
import { parseHikaroomProgramAtom, scrapeHikaroomProgram, scrapePikanonoProgram } from "../../scripts/patrol/scrapers/web-programs";
import { parseYouTubeChannelPage, parseYouTubeVideoPage } from "../../scripts/patrol/scrapers/youtube-pages";

const CHANNEL = "UC7ebYYsL-Uj3Q724lD2lR1Q";
const PIKANONO = "UCO0ZWJpt-1Ya_sZGfFmsyKA";
const VIDEO = { videoId: "zFU8AjGz_BY", title: "飯田ヒカルのヒカROOM 第36回", episode: 36 };
const PREVIOUS = { videoId: "UpOrTLZJBqM", title: "飯田ヒカルのヒカROOM 第35回", episode: 35 };
const UNRELATED = { videoId: "bbbbbbbbbbb", title: "別番組 #1178", episode: 1178 };
const episodeFromTitle = (title: string) => Number(/ヒカROOM 第(\d+)回/u.exec(title)?.[1]) || null;
const atom = () => readFileSync(join(process.cwd(), "tests/patrol/fixtures/hikaroom-atom.xml"), "utf8");
const script = (variable: string, data: unknown) => `<script>var ${variable} = ${JSON.stringify(data)};</script>`;

function channelData(tab: "videos" | "streams", videos = [VIDEO], channelId = CHANNEL) {
  return {
    metadata: { channelMetadataRenderer: { externalId: channelId } },
    contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: {
      selected: true,
      endpoint: { commandMetadata: { webCommandMetadata: { url: `/channel/${channelId}/${tab}` } } },
      content: { richGridRenderer: { contents: videos.map(video => ({ richItemRenderer: { content: {
        lockupViewModel: {
          contentType: "LOCKUP_CONTENT_TYPE_VIDEO", contentId: video.videoId,
          metadata: { lockupMetadataViewModel: { title: { content: video.title } } },
          rendererContext: { commandContext: { onTap: { innertubeCommand: { watchEndpoint: { videoId: video.videoId } } } } },
        },
      } } })) } },
    } }] } },
  };
}

function videoData(video = VIDEO, channelId = CHANNEL, publishDate = "2026-09-21T17:01:49-07:00") {
  return {
    videoDetails: { videoId: video.videoId, channelId, title: video.title },
    microformat: { playerMicroformatRenderer: {
      externalChannelId: channelId, publishDate,
      liveBroadcastDetails: { startTimestamp: "2026-09-21T11:00:08+00:00" },
    } },
  };
}

test("channel fallback reads only videos in the verified selected tab", () => {
  const data = {
    ...channelData("streams"),
    recommendations: channelData("streams", [PREVIOUS]).contents,
  };
  assert.deepEqual(parseYouTubeChannelPage(script("ytInitialData", data), CHANNEL, "streams", episodeFromTitle), [VIDEO]);
  assert.throws(() => parseYouTubeChannelPage(script("ytInitialData", data), PIKANONO, "streams", episodeFromTitle), /official channel/);
  assert.throws(() => parseYouTubeChannelPage(script("ytInitialData", data), CHANNEL, "videos", episodeFromTitle), /requested channel tab/);
  assert.throws(() => parseYouTubeChannelPage("<html>Consent required</html>", CHANNEL, "streams", episodeFromTitle), /expected JSON/);
});

test("channel fallback supports the older renderer and rejects mismatched video links", () => {
  const data = channelData("streams");
  const tab = data.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer;
  const older = { ...data, contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: {
    ...tab, content: { richGridRenderer: { contents: [{ richItemRenderer: { content: { videoRenderer: {
      videoId: VIDEO.videoId, title: { runs: [{ text: VIDEO.title }] },
      navigationEndpoint: { watchEndpoint: { videoId: VIDEO.videoId } },
    } } } }] } },
  } }] } } };
  assert.deepEqual(parseYouTubeChannelPage(script("ytInitialData", older), CHANNEL, "streams", episodeFromTitle), [VIDEO]);
  tab.content.richGridRenderer.contents[0].richItemRenderer.content.lockupViewModel
    .rendererContext.commandContext.onTap.innertubeCommand.watchEndpoint.videoId = PREVIOUS.videoId;
  assert.throws(() => parseYouTubeChannelPage(script("ytInitialData", data), CHANNEL, "streams", episodeFromTitle), /invalid video ID/);
});

test("video fallback verifies identity and publication time independently of live start time", () => {
  assert.equal(parseYouTubeVideoPage(script("ytInitialPlayerResponse", videoData()), CHANNEL, VIDEO, episodeFromTitle), "2026-09-22T00:01:49.000Z");
  for (const data of [videoData(VIDEO, PIKANONO), videoData(PREVIOUS), videoData({ ...VIDEO, title: "別番組" })]) {
    assert.throws(() => parseYouTubeVideoPage(script("ytInitialPlayerResponse", data), CHANNEL, VIDEO, episodeFromTitle), /does not match/);
  }
  for (const timestamp of ["2026-09-22", "2026-09-22T00:01:49", "invalid", ""]) {
    assert.throws(() => parseYouTubeVideoPage(script("ytInitialPlayerResponse", videoData(VIDEO, CHANNEL, timestamp)), CHANNEL, VIDEO, episodeFromTitle), /exact publication timestamp/);
  }
});

test("a feed 404 recovers through official pages with the same candidates and identities", async context => {
  const requests: string[] = [];
  context.mock.method(globalThis, "fetch", async (input: string) => {
    requests.push(input);
    const url = new URL(input);
    if (url.pathname === "/feeds/videos.xml") return new Response("not found", { status: 404 });
    if (url.pathname.endsWith("/videos")) return new Response(script("ytInitialData", channelData("videos", [UNRELATED])));
    if (url.pathname.endsWith("/streams")) return new Response(script("ytInitialData", channelData("streams", [VIDEO, PREVIOUS, { ...VIDEO, title: `${VIDEO.title} おまけ` }])));
    if (url.searchParams.get("v") === VIDEO.videoId) return new Response(script("ytInitialPlayerResponse", videoData()));
    if (url.searchParams.get("v") === PREVIOUS.videoId) return new Response(script("ytInitialPlayerResponse", videoData(PREVIOUS, CHANNEL, "2026-08-31T11:00:00Z")));
    assert.fail(`Unexpected request: ${input}`);
  });
  const candidates = await scrapeHikaroomProgram();
  const fromAtom = parseHikaroomProgramAtom(atom());
  assert.deepEqual(candidates, fromAtom);
  assert.deepEqual(candidates.map(candidateId), fromAtom.map(candidateId));
  assert.equal(requests.filter(url => url.includes("/watch?")).length, 2);
});

test("healthy and invalid feed identities do not use the page fallback", async context => {
  let body = atom();
  let requests = 0;
  context.mock.method(globalThis, "fetch", async (url: string) => {
    requests++;
    assert.ok(url.includes("/feeds/videos.xml"));
    return new Response(body);
  });
  assert.equal((await scrapeHikaroomProgram()).length, 2);
  body = atom().replaceAll(CHANNEL, PIKANONO);
  await assert.rejects(scrapeHikaroomProgram(), /cannot be verified/);
  assert.equal(requests, 2);
});

test("failed fallback pages remain a collection failure", async context => {
  context.mock.method(globalThis, "fetch", async () => new Response("not found", { status: 404 }));
  await assert.rejects(scrapeHikaroomProgram(), /HTTP 404/);
});

test("pikanono fallback prefers a public episode over its members-only copy", async context => {
  const publicVideo = { videoId: "Sfs0aZA8wCM", title: "飯田ヒカル・大渕野々花 『ぴかのの定理』 #13", episode: 13 };
  const memberVideo = { ...publicVideo, videoId: "c7YPSk_f5w4", title: `【メンバー限定動画】${publicVideo.title}` };
  context.mock.method(globalThis, "fetch", async (input: string) => {
    const url = new URL(input);
    if (url.pathname === "/feeds/videos.xml") return new Response("not found", { status: 404 });
    if (url.pathname.endsWith("/videos")) return new Response(script("ytInitialData", channelData("videos", [memberVideo, publicVideo], PIKANONO)));
    if (url.pathname.endsWith("/streams")) return new Response(script("ytInitialData", channelData("streams", [memberVideo], PIKANONO)));
    assert.equal(url.searchParams.get("v"), publicVideo.videoId);
    return new Response(script("ytInitialPlayerResponse", videoData(publicVideo, PIKANONO, "2026-09-22T04:00:11-07:00")));
  });
  const [candidate] = await scrapePikanonoProgram();
  assert.equal(candidate.sourceUrl, "https://www.youtube.com/watch?v=Sfs0aZA8wCM");
  assert.equal(candidate.publishedAt, "2026-09-22T11:00:11.000Z");
});
