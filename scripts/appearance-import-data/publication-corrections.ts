import type { AppearanceImportItem } from "../../src/domain/appearance";

// 一次情報と公開日時を照合した2026-09-30の補正。根拠はdocs/publication-auditを参照。
export const publicationCorrections: Record<string, Pick<AppearanceImportItem,
  "sourceUrl" | "sourceName" | "sourceItemId" | "publishedAtPrecision" | "publishedAt" | "publishedOn"
>> = {
  "akechi-riko-houkago-03": {
    "sourceUrl": "https://www.youtube.com/watch?v=3XrNcrIYRdY",
    "sourceName": "明智璃子公式YouTube",
    "sourceItemId": "3XrNcrIYRdY",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-05-27T00:33:06.000Z",
    "publishedOn": null
  },
  "anirave-2026-08-02": {
    "sourceUrl": "https://www.animeravefestival.com/news/detail.php?id=1133838",
    "sourceName": "official:anirave",
    "sourceItemId": "news:1133838",
    "publishedAtPrecision": "date",
    "publishedAt": null,
    "publishedOn": "2026-06-02"
  },
  "atsumare-sasamori-153": {
    "sourceUrl": "https://x.com/onsenradio/status/2059487531423641885",
    "sourceName": "x:onsenradio",
    "sourceItemId": "2059487531423641885",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-05-27T04:11:05.576Z",
    "publishedOn": null
  },
  "booklove-adopted-daughter-season": {
    "sourceUrl": "https://x.com/Iida_Hikaru_828/status/2059471301576974457",
    "sourceName": "x:Iida_Hikaru_828",
    "sourceItemId": "2059471301576974457",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-05-27T03:06:36.079Z",
    "publishedOn": null
  },
  "cue-sheet-8th-9-iida-hikaru": {
    "sourceUrl": "https://x.com/beat_since2016/status/2093666174538276882",
    "sourceName": "x:beat_since2016",
    "sourceItemId": "2093666174538276882",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-08-29T11:44:49.103Z",
    "publishedOn": null
  },
  "futsuu-na-radio-event-2026-07-18": {
    "sourceUrl": "https://x.com/futsu_vg/status/2069770617847718378",
    "sourceName": "x:futsu_vg",
    "sourceItemId": "2069770617847718378",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-06-24T13:12:24.430Z",
    "publishedOn": null
  },
  "gekirock-benefit-event-2026-05-24": {
    "sourceUrl": "https://x.com/gekirock_shop/status/2029482047811567743",
    "sourceName": "x:gekirock_shop",
    "sourceItemId": "2029482047811567743",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-03-05T09:00:00.808Z",
    "publishedOn": null
  },
  "gkmas-2nd-period-day1": {
    "sourceUrl": "https://idolmaster-official.jp/news/01_17315",
    "sourceName": "official:idolmaster",
    "sourceItemId": "news:01_17315",
    "publishedAtPrecision": "date",
    "publishedAt": null,
    "publishedOn": "2025-11-15"
  },
  "gkmas-2nd-period-day2": {
    "sourceUrl": "https://idolmaster-official.jp/news/01_17315",
    "sourceName": "official:idolmaster",
    "sourceItemId": "news:01_17315",
    "publishedAtPrecision": "date",
    "publishedAt": null,
    "publishedOn": "2025-11-15"
  },
  "gkmas-music-festival-day1": {
    "sourceUrl": "https://idolmaster-official.jp/news/01_16742",
    "sourceName": "official:idolmaster",
    "sourceItemId": "news:01_16742",
    "publishedAtPrecision": "date",
    "publishedAt": null,
    "publishedOn": "2025-09-21"
  },
  "gkmas-music-festival-day2": {
    "sourceUrl": "https://idolmaster-official.jp/news/01_16742",
    "sourceName": "official:idolmaster",
    "sourceItemId": "news:01_16742",
    "publishedAtPrecision": "date",
    "publishedAt": null,
    "publishedOn": "2025-09-21"
  },
  "gkmas-undokai-2025-day1": {
    "sourceUrl": "https://idolmaster-official.jp/news/01_15744",
    "sourceName": "official:idolmaster",
    "sourceItemId": "news:01_15744",
    "publishedAtPrecision": "date",
    "publishedAt": null,
    "publishedOn": "2025-06-01"
  },
  "gkmas-undokai-2025-day2": {
    "sourceUrl": "https://idolmaster-official.jp/news/01_15744",
    "sourceName": "official:idolmaster",
    "sourceItemId": "news:01_15744",
    "publishedAtPrecision": "date",
    "publishedAt": null,
    "publishedOn": "2025-06-01"
  },
  "hanaiwa-kana-episode-66": {
    "sourceUrl": "https://x.com/PodcastsMs_jp/status/2056283647901376971",
    "sourceName": "x:PodcastsMs_jp",
    "sourceItemId": "2056283647901376971",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-05-18T08:00:00.219Z",
    "publishedOn": null
  },
  "hatsuboshi-housoubu-episode-100": {
    "sourceUrl": "https://www.youtube.com/watch?v=Ad5vt0-sVeg",
    "sourceName": "youtube:idolmaster-channel",
    "sourceItemId": "Ad5vt0-sVeg",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-08-05T11:06:44.000Z",
    "publishedOn": null
  },
  "hatsuboshi-housoubu-episode-58": {
    "sourceUrl": "https://asobichannel.asobistore.jp/watch/udhd2k1v4",
    "sourceName": "official:asobi-channel",
    "sourceItemId": "udhd2k1v4",
    "publishedAtPrecision": "exact",
    "publishedAt": "2025-10-06T02:30:05.336Z",
    "publishedOn": null
  },
  "hatsuboshi-housoubu-episode-64": {
    "sourceUrl": "https://asobichannel.asobistore.jp/watch/u8rhgnnpo6",
    "sourceName": "official:asobi-channel",
    "sourceItemId": "u8rhgnnpo6",
    "publishedAtPrecision": "exact",
    "publishedAt": "2025-11-17T02:30:05.126Z",
    "publishedOn": null
  },
  "hatsuboshi-housoubu-episode-69": {
    "sourceUrl": "https://asobichannel.asobistore.jp/watch/1qztxk3u2",
    "sourceName": "official:asobi-channel",
    "sourceItemId": "1qztxk3u2",
    "publishedAtPrecision": "exact",
    "publishedAt": "2025-12-22T02:30:05.456Z",
    "publishedOn": null
  },
  "hatsuboshi-housoubu-episode-72": {
    "sourceUrl": "https://asobichannel.asobistore.jp/watch/liyjpf3gx5u",
    "sourceName": "official:asobi-channel",
    "sourceItemId": "liyjpf3gx5u",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-01-19T02:30:04.735Z",
    "publishedOn": null
  },
  "hatsuboshi-housoubu-episode-81": {
    "sourceUrl": "https://asobichannel.asobistore.jp/watch/mcngfiqxc",
    "sourceName": "official:asobi-channel",
    "sourceItemId": "mcngfiqxc",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-03-23T02:30:05.321Z",
    "publishedOn": null
  },
  "hatsuboshi-housoubu-episode-84": {
    "sourceUrl": "https://asobichannel.asobistore.jp/watch/szbep3og5t",
    "sourceName": "official:asobi-channel",
    "sourceItemId": "szbep3og5t",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-04-13T02:30:04.922Z",
    "publishedOn": null
  },
  "hatsuboshi-housoubu-episode-96": {
    "sourceUrl": "https://asobichannel.asobistore.jp/watch/kehulry6m1",
    "sourceName": "official:asobi-channel",
    "sourceItemId": "kehulry6m1",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-07-06T02:30:05.303Z",
    "publishedOn": null
  },
  "hikaroom-episode-24": {
    "sourceUrl": "https://x.com/iidahikaroom/status/1967894921328857094",
    "sourceName": "x:iidahikaroom",
    "sourceItemId": "1967894921328857094",
    "publishedAtPrecision": "exact",
    "publishedAt": "2025-09-16T10:14:45.621Z",
    "publishedOn": null
  },
  "hikaroom-episode-25": {
    "sourceUrl": "https://x.com/iidahikaroom/status/1982755662741581890",
    "sourceName": "x:iidahikaroom",
    "sourceItemId": "1982755662741581890",
    "publishedAtPrecision": "exact",
    "publishedAt": "2025-10-27T10:26:02.473Z",
    "publishedOn": null
  },
  "hikaroom-episode-26": {
    "sourceUrl": "https://x.com/iidahikaroom/status/1988910420879417580",
    "sourceName": "x:iidahikaroom",
    "sourceItemId": "1988910420879417580",
    "publishedAtPrecision": "exact",
    "publishedAt": "2025-11-13T10:02:51.163Z",
    "publishedOn": null
  },
  "hikaroom-episode-27": {
    "sourceUrl": "https://x.com/iidahikaroom/status/2001571708663402583",
    "sourceName": "x:iidahikaroom",
    "sourceItemId": "2001571708663402583",
    "publishedAtPrecision": "exact",
    "publishedAt": "2025-12-18T08:34:17.406Z",
    "publishedOn": null
  },
  "hikaroom-episode-28": {
    "sourceUrl": "https://x.com/iidahikaroom/status/2016119005623550405",
    "sourceName": "x:iidahikaroom",
    "sourceItemId": "2016119005623550405",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-01-27T12:00:03.277Z",
    "publishedOn": null
  },
  "hikaroom-episode-29": {
    "sourceUrl": "https://x.com/iidahikaroom/status/2023714044603990442",
    "sourceName": "x:iidahikaroom",
    "sourceItemId": "2023714044603990442",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-02-17T11:00:01.679Z",
    "publishedOn": null
  },
  "hikaroom-episode-30": {
    "sourceUrl": "https://x.com/iidahikaroom/status/2032366053976903725",
    "sourceName": "x:iidahikaroom",
    "sourceItemId": "2032366053976903725",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-03-13T08:00:01.460Z",
    "publishedOn": null
  },
  "hikaroom-episode-31": {
    "sourceUrl": "https://x.com/iidahikaroom/status/2046514280703668224",
    "sourceName": "x:iidahikaroom",
    "sourceItemId": "2046514280703668224",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-04-21T09:00:01.573Z",
    "publishedOn": null
  },
  "hikaroom-episode-32": {
    "sourceUrl": "https://x.com/iidahikaroom/status/2054834103896473940",
    "sourceName": "x:iidahikaroom",
    "sourceItemId": "2054834103896473940",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-05-14T08:00:01.997Z",
    "publishedOn": null
  },
  "hikaroom-episode-33": {
    "sourceUrl": "https://x.com/iidahikaroom/status/2082752078372569230",
    "sourceName": "x:iidahikaroom",
    "sourceItemId": "2082752078372569230",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-07-30T08:56:05.803Z",
    "publishedOn": null
  },
  "hikaroom-episode-34": {
    "sourceUrl": "https://x.com/iidahikaroom/status/2086780048963735657",
    "sourceName": "x:iidahikaroom",
    "sourceItemId": "2086780048963735657",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-08-10T11:41:48.828Z",
    "publishedOn": null
  },
  "ichijoma": {
    "sourceUrl": "https://x.com/Iida_Hikaru_828/status/2043321950941192659",
    "sourceName": "x:Iida_Hikaru_828",
    "sourceItemId": "2043321950941192659",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-04-12T13:34:50.847Z",
    "publishedOn": null
  },
  "iida-hikaru-cooking-stream-2026-03-30": {
    "sourceUrl": "https://x.com/voicegarage_ch/status/2036035466659516577",
    "sourceName": "x:voicegarage_ch",
    "sourceItemId": "2036035466659516577",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-03-23T11:00:57.618Z",
    "publishedOn": null
  },
  "itagochi-2026-04-11": {
    "sourceUrl": "https://x.com/ngtk_itagochi/status/2037361296371597628",
    "sourceName": "x:ngtk_itagochi",
    "sourceItemId": "2037361296371597628",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-03-27T02:49:20.054Z",
    "publishedOn": null
  },
  "iyapan-r": {
    "sourceUrl": "https://x.com/iyapan_anime/status/2047604761424433384",
    "sourceName": "x:iyapan_anime",
    "sourceItemId": "2047604761424433384",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-04-24T09:13:12.437Z",
    "publishedOn": null
  },
  "kannahikaru-episode-1": {
    "sourceUrl": "https://x.com/onsenradio/status/2028772900787114052",
    "sourceName": "x:onsenradio",
    "sourceItemId": "2028772900787114052",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-03-03T10:02:06.982Z",
    "publishedOn": null
  },
  "kannahikaru-episode-10": {
    "sourceUrl": "https://x.com/onsenradio/status/2074434166561853660",
    "sourceName": "x:onsenradio",
    "sourceItemId": "2074434166561853660",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-07-07T10:03:41.088Z",
    "publishedOn": null
  },
  "kannahikaru-episode-11": {
    "sourceUrl": "https://x.com/onsenradio/status/2079507804566728996",
    "sourceName": "x:onsenradio",
    "sourceItemId": "2079507804566728996",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-07-21T10:04:30.652Z",
    "publishedOn": null
  },
  "kannahikaru-episode-12": {
    "sourceUrl": "https://x.com/onsenradio/status/2084581918964920354",
    "sourceName": "x:onsenradio",
    "sourceItemId": "2084581918964920354",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-08-04T10:07:13.797Z",
    "publishedOn": null
  },
  "kannahikaru-episode-13": {
    "sourceUrl": "https://x.com/onsenradio/status/2089654269557555666",
    "sourceName": "x:onsenradio",
    "sourceItemId": "2089654269557555666",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-08-18T10:02:56.418Z",
    "publishedOn": null
  },
  "kannahikaru-episode-14": {
    "sourceUrl": "https://x.com/onsenradio/status/2094727688657453414",
    "sourceName": "x:onsenradio",
    "sourceItemId": "2094727688657453414",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-09-01T10:02:53.791Z",
    "publishedOn": null
  },
  "kannahikaru-episode-2": {
    "sourceUrl": "https://x.com/onsenradio/status/2033847013629169762",
    "sourceName": "x:onsenradio",
    "sourceItemId": "2033847013629169762",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-03-17T10:04:49.756Z",
    "publishedOn": null
  },
  "kannahikaru-episode-3": {
    "sourceUrl": "https://x.com/onsenradio/status/2038920106823266770",
    "sourceName": "x:onsenradio",
    "sourceItemId": "2038920106823266770",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-03-31T10:03:29.427Z",
    "publishedOn": null
  },
  "kannahikaru-episode-4": {
    "sourceUrl": "https://x.com/onsenradio/status/2043993163161878961",
    "sourceName": "x:onsenradio",
    "sourceItemId": "2043993163161878961",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-04-14T10:02:00.311Z",
    "publishedOn": null
  },
  "kannahikaru-episode-5": {
    "sourceUrl": "https://x.com/onsenradio/status/2049066315600781369",
    "sourceName": "x:onsenradio",
    "sourceItemId": "2049066315600781369",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-04-28T10:00:54.107Z",
    "publishedOn": null
  },
  "kannahikaru-episode-6": {
    "sourceUrl": "https://x.com/onsenradio/status/2054140132689875439",
    "sourceName": "x:onsenradio",
    "sourceItemId": "2054140132689875439",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-05-12T10:02:26.368Z",
    "publishedOn": null
  },
  "kannahikaru-episode-7": {
    "sourceUrl": "https://x.com/onsenradio/status/2059213378380513680",
    "sourceName": "x:onsenradio",
    "sourceItemId": "2059213378380513680",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-05-26T10:01:42.397Z",
    "publishedOn": null
  },
  "kannahikaru-episode-8": {
    "sourceUrl": "https://x.com/onsenradio/status/2064287403024801793",
    "sourceName": "x:onsenradio",
    "sourceItemId": "2064287403024801793",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-06-09T10:04:04.143Z",
    "publishedOn": null
  },
  "kannahikaru-episode-9": {
    "sourceUrl": "https://x.com/onsenradio/status/2069360397912829988",
    "sourceName": "x:onsenradio",
    "sourceItemId": "2069360397912829988",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-06-23T10:02:20.376Z",
    "publishedOn": null
  },
  "lilac-side-witch-noa": {
    "sourceUrl": "https://bushiroad.com/media/6c3a3e0aec9c09b3",
    "sourceName": "official:bushiroad",
    "sourceItemId": "press:2025-09-19:lilac-cast",
    "publishedAtPrecision": "date",
    "publishedAt": null,
    "publishedOn": "2025-09-19"
  },
  "llv-reading-2025-10-02": {
    "sourceUrl": "https://x.com/Iida_Hikaru_828/status/1968268490453942690",
    "sourceName": "x:Iida_Hikaru_828",
    "sourceItemId": "1968268490453942690",
    "publishedAtPrecision": "exact",
    "publishedAt": "2025-09-17T10:59:11.441Z",
    "publishedOn": null
  },
  "llv-reading-2025-10-03": {
    "sourceUrl": "https://x.com/Iida_Hikaru_828/status/1968268490453942690",
    "sourceName": "x:Iida_Hikaru_828",
    "sourceItemId": "1968268490453942690",
    "publishedAtPrecision": "exact",
    "publishedAt": "2025-09-17T10:59:11.441Z",
    "publishedOn": null
  },
  "mlt-case02-part1": {
    "sourceUrl": "https://x.com/Marine__girls/status/2089661082147463631",
    "sourceName": "x:Marine__girls",
    "sourceItemId": "2089661082147463631",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-08-18T10:30:00.666Z",
    "publishedOn": null
  },
  "mlt-case02-part2": {
    "sourceUrl": "https://x.com/Marine__girls/status/2089661082147463631",
    "sourceName": "x:Marine__girls",
    "sourceItemId": "2089661082147463631",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-08-18T10:30:00.666Z",
    "publishedOn": null
  },
  "moiw-2025-day1": {
    "sourceUrl": "https://x.com/Iida_Hikaru_828/status/1949334563135901755",
    "sourceName": "x:Iida_Hikaru_828",
    "sourceItemId": "1949334563135901755",
    "publishedAtPrecision": "exact",
    "publishedAt": "2025-07-27T05:02:31.393Z",
    "publishedOn": null
  },
  "nonaka-kokona-rec-35": {
    "sourceUrl": "https://x.com/kokona_rec/status/2043992659296170371",
    "sourceName": "野中ここなのREC中！公式X",
    "sourceItemId": "2043992659296170371",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-04-14T10:00:00.180Z",
    "publishedOn": null
  },
  "odaiba-itasha-tengoku-2025-autumn": {
    "sourceUrl": "https://itasha-tengoku.yaesu-net.co.jp/event/2025_odaiba_2nd/",
    "sourceName": "official:itasha-tengoku",
    "sourceItemId": "odaiba:2025-autumn",
    "publishedAtPrecision": "date",
    "publishedAt": null,
    "publishedOn": "2025-10-03"
  },
  "one-and-only-episode-11": {
    "sourceUrl": "https://x.com/onsenradio/status/1990375362082312447",
    "sourceName": "x:onsenradio",
    "sourceItemId": "1990375362082312447",
    "publishedAtPrecision": "exact",
    "publishedAt": "2025-11-17T11:04:00.363Z",
    "publishedOn": null
  },
  "onsen-festival-2027": {
    "sourceUrl": "https://dialogue-music.jp/news/2026/06/21-4/",
    "sourceName": "official:dialogue-music",
    "sourceItemId": "news:2026-06-21-4",
    "publishedAtPrecision": "date",
    "publishedAt": null,
    "publishedOn": "2026-06-21"
  },
  "onsen-kannahikaru-event-2026": {
    "sourceUrl": "https://x.com/onsenradio/status/2059212952524460108",
    "sourceName": "x:onsenradio",
    "sourceItemId": "2059212952524460108",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-05-26T10:00:00.865Z",
    "publishedOn": null
  },
  "onsen-one-and-only-event-2026": {
    "sourceUrl": "https://x.com/onsenradio/status/2059212952524460108",
    "sourceName": "x:onsenradio",
    "sourceItemId": "2059212952524460108",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-05-26T10:00:00.865Z",
    "publishedOn": null
  },
  "pikanono-episode-1": {
    "sourceUrl": "https://x.com/voice_lounge/status/2055264434751410538",
    "sourceName": "x:voice_lounge",
    "sourceItemId": "2055264434751410538",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-05-15T12:30:00.868Z",
    "publishedOn": null
  },
  "pikanono-episode-10": {
    "sourceUrl": "https://x.com/voice_lounge/status/2089185459004157973",
    "sourceName": "x:voice_lounge",
    "sourceItemId": "2089185459004157973",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-08-17T03:00:03.272Z",
    "publishedOn": null
  },
  "pikanono-episode-11": {
    "sourceUrl": "https://x.com/voice_lounge/status/2091518321929703780",
    "sourceName": "x:voice_lounge",
    "sourceItemId": "2091518321929703780",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-08-23T13:30:01.136Z",
    "publishedOn": null
  },
  "pikanono-episode-2": {
    "sourceUrl": "https://x.com/voice_lounge/status/2060194421061116228",
    "sourceName": "x:voice_lounge",
    "sourceItemId": "2060194421061116228",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-05-29T03:00:01.199Z",
    "publishedOn": null
  },
  "pikanono-episode-3": {
    "sourceUrl": "https://x.com/voice_lounge/status/2066717411739627863",
    "sourceName": "x:voice_lounge",
    "sourceItemId": "2066717411739627863",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-06-16T03:00:03.368Z",
    "publishedOn": null
  },
  "pikanono-episode-4": {
    "sourceUrl": "https://x.com/voice_lounge/status/2069367359748661727",
    "sourceName": "x:voice_lounge",
    "sourceItemId": "2069367359748661727",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-06-23T10:30:00.207Z",
    "publishedOn": null
  },
  "pikanono-episode-5": {
    "sourceUrl": "https://x.com/voice_lounge/status/2070824466423189812",
    "sourceName": "x:voice_lounge",
    "sourceItemId": "2070824466423189812",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-06-27T11:00:01.510Z",
    "publishedOn": null
  },
  "pikanono-episode-9": {
    "sourceUrl": "https://x.com/voice_lounge/status/2086754430003687645",
    "sourceName": "x:voice_lounge",
    "sourceItemId": "2086754430003687645",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-08-10T10:00:00.792Z",
    "publishedOn": null
  },
  "saesuzu-event-2026": {
    "sourceUrl": "https://x.com/onsenradio/status/2074840747455766865",
    "sourceName": "x:onsenradio",
    "sourceItemId": "2074840747455766865",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-07-08T12:59:17.527Z",
    "publishedOn": null
  },
  "sashibana-event-2026-part1": {
    "sourceUrl": "https://x.com/sashibana_vg/status/2039266816871075939",
    "sourceName": "x:sashibana_vg",
    "sourceItemId": "2039266816871075939",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-04-01T09:01:11.544Z",
    "publishedOn": null
  },
  "sashibana-event-2026-part2": {
    "sourceUrl": "https://x.com/sashibana_vg/status/2039266816871075939",
    "sourceName": "x:sashibana_vg",
    "sourceItemId": "2039266816871075939",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-04-01T09:01:11.544Z",
    "publishedOn": null
  },
  "sashibana-event-2026-part3": {
    "sourceUrl": "https://x.com/sashibana_vg/status/2039266816871075939",
    "sourceName": "x:sashibana_vg",
    "sourceItemId": "2039266816871075939",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-04-01T09:01:11.544Z",
    "publishedOn": null
  },
  "seifuku-kanojo-3": {
    "sourceUrl": "https://x.com/seifukubu_love/status/2047239180934398110",
    "sourceName": "x:seifukubu_love",
    "sourceItemId": "2047239180934398110",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-04-23T09:00:31.256Z",
    "publishedOn": null
  },
  "seifuku-kanojo-valentine-event-2027": {
    "sourceUrl": "https://x.com/seifukubu_love/status/2070458648095248713",
    "sourceName": "x:seifukubu_love",
    "sourceItemId": "2070458648095248713",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-06-26T10:46:23.624Z",
    "publishedOn": null
  },
  "shirube-final-live-day1": {
    "sourceUrl": "https://x.com/gkmas_official/status/2063580960533463089",
    "sourceName": "x:gkmas_official",
    "sourceItemId": "2063580960533463089",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-06-07T11:16:55.128Z",
    "publishedOn": null
  },
  "shirube-final-live-day2": {
    "sourceUrl": "https://x.com/gkmas_official/status/2063580960533463089",
    "sourceName": "x:gkmas_official",
    "sourceItemId": "2063580960533463089",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-06-07T11:16:55.128Z",
    "publishedOn": null
  },
  "sora-the-1st-tita": {
    "sourceUrl": "https://www.falcom.co.jp/archives/202540",
    "sourceName": "日本ファルコム公式ニュース",
    "sourceItemId": "202540",
    "publishedAtPrecision": "date",
    "publishedAt": null,
    "publishedOn": "2025-09-22"
  },
  "sora-the-2nd-tita": {
    "sourceUrl": "https://x.com/nihonfalcom/status/2097146125652480254",
    "sourceName": "x:nihonfalcom",
    "sourceItemId": "2097146125652480254",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-09-08T02:12:54.103Z",
    "publishedOn": null
  },
  "star-savior-lily": {
    "sourceUrl": "https://www.youtube.com/watch?v=edNmiHp-P9k",
    "sourceName": "スターセイヴァー公式YouTube",
    "sourceItemId": "edNmiHp-P9k",
    "publishedAtPrecision": "exact",
    "publishedAt": "2025-10-15T03:00:49.000Z",
    "publishedOn": null
  },
  "stella-sora-first-anniversary-2026": {
    "sourceUrl": "https://x.com/StellaSoraJP/status/2078830411908804979",
    "sourceName": "x:StellaSoraJP",
    "sourceItemId": "2078830411908804979",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-07-19T13:12:47.657Z",
    "publishedOn": null
  },
  "stella-sora-maou-channel-half-anniversary": {
    "sourceUrl": "https://x.com/StellaSoraJP/status/2041093558166245497",
    "sourceName": "x:StellaSoraJP",
    "sourceItemId": "2041093558166245497",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-04-06T10:00:00.608Z",
    "publishedOn": null
  },
  "stella-sora-maou-channel-summer-2026": {
    "sourceUrl": "https://x.com/StellaSoraJP/status/2076607612356039153",
    "sourceName": "x:StellaSoraJP",
    "sourceItemId": "2076607612356039153",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-07-13T10:00:10.946Z",
    "publishedOn": null
  },
  "sugar-lies-asmr-series": {
    "sourceUrl": "https://x.com/Iida_Hikaru_828/status/2100818722164482325",
    "sourceName": "x:Iida_Hikaru_828",
    "sourceItemId": "2100818722164482325",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-09-18T05:26:29.345Z",
    "publishedOn": null
  },
  "sugar-lies-game": {
    "sourceUrl": "https://x.com/DEAR_MF_PR/status/2092899927751836101",
    "sourceName": "x:dear-mf-pr",
    "sourceItemId": "2092899927751836101",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-08-27T09:00:01.633Z",
    "publishedOn": null
  },
  "taipei-game-show-2026-stage": {
    "sourceUrl": "https://www.cloudedleopardent.com/zh-hant/news/8038/",
    "sourceName": "official:clouded-leopard",
    "sourceItemId": "news:8038",
    "publishedAtPrecision": "date",
    "publishedAt": null,
    "publishedOn": "2025-12-26"
  },
  "tokyo-valkyries-mamika-kanesaki": {
    "sourceUrl": "https://x.com/qureate/status/2071881436336976219",
    "sourceName": "qureate公式X",
    "sourceItemId": "2071881436336976219",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-06-30T09:00:02.775Z",
    "publishedOn": null
  },
  "touhou-lostword-koishi": {
    "sourceUrl": "https://x.com/Iida_Hikaru_828/status/2049835657439420537",
    "sourceName": "x:Iida_Hikaru_828",
    "sourceItemId": "2049835657439420537",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-04-30T12:57:59.495Z",
    "publishedOn": null
  },
  "tricolor-episode-32": {
    "sourceUrl": "https://x.com/onsenradio/status/2016724571987259571",
    "sourceName": "x:onsenradio",
    "sourceItemId": "2016724571987259571",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-01-29T04:06:21.549Z",
    "publishedOn": null
  },
  "uec-seiyu-talk-event-2025": {
    "sourceUrl": "https://uecseiyubunkaken.com/event-20251122/",
    "sourceName": "official:uec-seiyu",
    "sourceItemId": "event:2025-11-22",
    "publishedAtPrecision": "date",
    "publishedAt": null,
    "publishedOn": "2025-09-17"
  },
  "usui-frontier-episode-7": {
    "sourceUrl": "https://www.youtube.com/watch?v=SKVpwwu9Xy4",
    "sourceName": "youtube:Tetra Voice Station",
    "sourceItemId": "SKVpwwu9Xy4",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-01-09T17:10:45.000Z",
    "publishedOn": null
  },
  "yuri-relation-event-2026-day": {
    "sourceUrl": "https://x.com/su_kawa_vg/status/2011065207863574636",
    "sourceName": "x:su_kawa_vg",
    "sourceItemId": "2011065207863574636",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-01-13T13:18:03.996Z",
    "publishedOn": null
  },
  "yuri-relation-event-2026-night": {
    "sourceUrl": "https://x.com/su_kawa_vg/status/2011065207863574636",
    "sourceName": "x:su_kawa_vg",
    "sourceItemId": "2011065207863574636",
    "publishedAtPrecision": "exact",
    "publishedAt": "2026-01-13T13:18:03.996Z",
    "publishedOn": null
  },
  "yuri-relation-game-24": {
    "sourceUrl": "https://www.youtube.com/watch?v=Ay0RNXaAc58",
    "sourceName": "youtube:ボイスガレッジチャンネル in YouTube",
    "sourceItemId": "Ay0RNXaAc58",
    "publishedAtPrecision": "exact",
    "publishedAt": "2025-10-06T14:00:06.000Z",
    "publishedOn": null
  },
  "yuri-relation-game-25": {
    "sourceUrl": "https://www.youtube.com/watch?v=afiKGxP0vLQ",
    "sourceName": "youtube:ボイスガレッジチャンネル in YouTube",
    "sourceItemId": "afiKGxP0vLQ",
    "publishedAtPrecision": "exact",
    "publishedAt": "2025-10-13T14:00:06.000Z",
    "publishedOn": null
  },
  "yuri-relation-game-26": {
    "sourceUrl": "https://www.youtube.com/watch?v=NA7Qn04mhkM",
    "sourceName": "youtube:ボイスガレッジチャンネル in YouTube",
    "sourceItemId": "NA7Qn04mhkM",
    "publishedAtPrecision": "exact",
    "publishedAt": "2025-10-20T14:00:06.000Z",
    "publishedOn": null
  },
  "yuri-relation-game-27": {
    "sourceUrl": "https://www.youtube.com/watch?v=TBg0PNGubCo",
    "sourceName": "youtube:ボイスガレッジチャンネル in YouTube",
    "sourceItemId": "TBg0PNGubCo",
    "publishedAtPrecision": "exact",
    "publishedAt": "2025-10-20T14:20:06.000Z",
    "publishedOn": null
  },
  "yuri-relation-game-33": {
    "sourceUrl": "https://www.youtube.com/watch?v=QAiBXzGuuVg",
    "sourceName": "youtube:ボイスガレッジチャンネル in YouTube",
    "sourceItemId": "QAiBXzGuuVg",
    "publishedAtPrecision": "exact",
    "publishedAt": "2025-12-01T14:00:06.000Z",
    "publishedOn": null
  },
  "yuri-relation-game-34": {
    "sourceUrl": "https://www.youtube.com/watch?v=3xm9qqrwIq0",
    "sourceName": "youtube:ボイスガレッジチャンネル in YouTube",
    "sourceItemId": "3xm9qqrwIq0",
    "publishedAtPrecision": "exact",
    "publishedAt": "2025-12-08T14:00:06.000Z",
    "publishedOn": null
  },
  "yuri-relation-game-35": {
    "sourceUrl": "https://www.youtube.com/watch?v=Llc-a_0kL3g",
    "sourceName": "youtube:ボイスガレッジチャンネル in YouTube",
    "sourceItemId": "Llc-a_0kL3g",
    "publishedAtPrecision": "exact",
    "publishedAt": "2025-12-15T14:00:06.000Z",
    "publishedOn": null
  },
  "yuri-relation-live-2025-09-30": {
    "sourceUrl": "https://www.youtube.com/watch?v=w-FSxo6eHKc",
    "sourceName": "youtube:ボイスガレッジチャンネル in YouTube",
    "sourceItemId": "w-FSxo6eHKc",
    "publishedAtPrecision": "exact",
    "publishedAt": "2025-09-30T11:34:54.000Z",
    "publishedOn": null
  }
};
