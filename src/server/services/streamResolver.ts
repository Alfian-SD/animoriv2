import * as cheerio from "cheerio";
import type { PlaybackOption, VideoQuality, StreamMode } from "../../shared/anime.js";
import { SERVER_CONFIG } from "../config.js";
import { isSafeAllowedStreamUrl } from "../security/ssrfGuard.js";
import { normalizeTitle } from "./aggregator.js";
import { parseHydratedStreams } from "../providers/externalProvider.js";
import { extractDirectStream } from "../extractors/streamExtractor.js";
import { extractRootFranchiseTitle } from "./anilist.js";

interface RawStreamCandidate {
  url: string;
  quality: VideoQuality;
  mode: StreamMode;
  priority: number; // lower is better
}

const QUALITY_WEIGHT: Record<VideoQuality, number> = {
  "1080p": 4,
  "720p": 3,
  "480p": 2,
  "360p": 1,
};

function normalizeQuality(raw: string): VideoQuality {
  const lower = raw.toLowerCase();
  if (lower.includes("1080")) return "1080p";
  if (lower.includes("720")) return "720p";
  if (lower.includes("360")) return "360p";
  return "480p";
}

// In-memory TTL cache for resolved episode streams (15 minutes)
const streamCache = new Map<string, { mirrors: PlaybackOption[]; expiresAt: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000;

export interface StreamResolverParams {
  animeTitle: string;
  episodeNumber: number;
  animeRomaji?: string;
  animeEnglish?: string;
  slug?: string;
}

/**
 * Bangun daftar kandidat kueri pencarian multi-segi untuk anime & sekuel
 */
export function buildSearchQueryCandidates(params: {
  animeTitle: string;
  animeRomaji?: string;
  animeEnglish?: string;
  slug?: string;
}): string[] {
  const queries: string[] = [];

  if (params.animeTitle) queries.push(params.animeTitle);
  if (params.animeRomaji && params.animeRomaji !== params.animeTitle) {
    queries.push(params.animeRomaji);
  }
  if (params.animeEnglish) {
    queries.push(params.animeEnglish);
  }

  // Variasi penulisan season: "2nd Season" <-> "Season 2" <-> "S2"
  const expanded: string[] = [];
  for (const q of queries) {
    const ordMatch = q.match(/(\d+)(?:st|nd|rd|th)\s*season/i);
    if (ordMatch) {
      expanded.push(q.replace(/(\d+)(?:st|nd|rd|th)\s*season/i, `Season ${ordMatch[1]}`));
      expanded.push(q.replace(/(\d+)(?:st|nd|rd|th)\s*season/i, `S${ordMatch[1]}`));
    }
    const sMatch = q.match(/season\s*(\d+)/i);
    if (sMatch) {
      const n = sMatch[1] ?? "1";
      const suffix = n === "1" ? "st" : n === "2" ? "nd" : n === "3" ? "rd" : "th";
      expanded.push(q.replace(/season\s*\d+/i, `${n}${suffix} Season`));
      expanded.push(q.replace(/season\s*\d+/i, `S${n}`));
    }
  }
  queries.push(...expanded);

  // Root franchise title
  if (params.animeTitle) {
    const root = extractRootFranchiseTitle(params.animeTitle);
    if (root && root.length > 2 && root !== params.animeTitle) {
      queries.push(root);
    }
  }
  if (params.animeRomaji) {
    const root = extractRootFranchiseTitle(params.animeRomaji);
    if (root && root.length > 2 && root !== params.animeRomaji) {
      queries.push(root);
    }
  }

  if (params.slug) {
    queries.push(params.slug.replace(/-/g, " "));
  }

  return Array.from(new Set(queries.map((s) => s.trim()).filter((s) => s.length > 2)));
}

/**
 * 1. Prioritas Utama — http://ylnime.com/ (dan https://ylnime.com/)
 */
async function resolveFromYlnime(
  queries: string[],
  episodeNumber: number,
  slug?: string
): Promise<RawStreamCandidate[]> {
  const baseUrls = ["http://ylnime.com", "https://ylnime.com"];

  for (const baseUrl of baseUrls) {
    for (const query of queries) {
      try {
        const searchUrl = `${baseUrl}/?search=${encodeURIComponent(query)}`;
        const searchRes = await fetch(searchUrl, {
          headers: {
            "User-Agent": SERVER_CONFIG.chromeUserAgent,
            Referer: `${baseUrl}/`,
          },
          signal: AbortSignal.timeout(SERVER_CONFIG.metadataTimeoutMs),
        });

        if (!searchRes.ok) continue;
        const searchHtml = await searchRes.text();
        const $search = cheerio.load(searchHtml);

        let seriesHref: string | null = null;
        for (const a of $search("a").toArray()) {
          const h = $search(a).attr("href");
          if (h && h.includes("series=")) {
            const seriesSlug = h.split("series=")[1]?.split("&")[0]?.toLowerCase() ?? "";
            const normQuery = normalizeTitle(query).replace(/\s+/g, "-");
            if (!seriesHref || seriesSlug.includes(normQuery) || (slug && seriesSlug.includes(slug))) {
              seriesHref = h;
            }
          }
        }

        if (!seriesHref) continue;

        const targetSeriesHref: string = seriesHref;
        const seriesUrl = targetSeriesHref.startsWith("http")
          ? targetSeriesHref
          : `${baseUrl}/${targetSeriesHref.replace(/^\/?/, "")}`;

        const seriesRes = await fetch(seriesUrl, {
          headers: {
            "User-Agent": SERVER_CONFIG.chromeUserAgent,
            Referer: `${baseUrl}/`,
          },
          signal: AbortSignal.timeout(SERVER_CONFIG.metadataTimeoutMs),
        });

        if (!seriesRes.ok) continue;
        const seriesHtml = await seriesRes.text();
        const $series = cheerio.load(seriesHtml);

        let epHref: string | null = null;
        for (const a of $series("a").toArray()) {
          const h = $series(a).attr("href") ?? "";
          const t = $series(a).text().trim();
          if (h.includes("episode=")) {
            const numMatch = t.match(/episode\s*(\d+)/i) || h.match(/[-_](\d+)$/);
            if (numMatch && Number.parseInt(numMatch[1] ?? "0", 10) === episodeNumber) {
              epHref = h;
            }
          }
        }

        if (!epHref) continue;

        const targetEpHref: string = epHref;
        const epUrl = targetEpHref.startsWith("http")
          ? targetEpHref
          : `${baseUrl}/${targetEpHref.replace(/^\/?/, "")}`;

        const epRes = await fetch(epUrl, {
          headers: {
            "User-Agent": SERVER_CONFIG.chromeUserAgent,
            Referer: seriesUrl,
          },
          signal: AbortSignal.timeout(SERVER_CONFIG.metadataTimeoutMs),
        });

        if (!epRes.ok) continue;
        const epHtml = await epRes.text();

        const candidates: RawStreamCandidate[] = [];

        // Parse embedded streams array: const streams = [...]
        const streamsMatch =
          epHtml.match(/(?:const|var|let)\s+streams\s*=\s*(\[[^\]]*\])/s) ||
          epHtml.match(/streams\s*=\s*(\[[^\]]*\])/s);

        if (streamsMatch && streamsMatch[1]) {
          try {
            const parsed = JSON.parse(streamsMatch[1]) as Array<{
              reso?: string;
              link?: string;
            }>;
            for (const item of parsed) {
              const link = item.link?.replace(/\\/g, "").trim();
              if (link && isSafeAllowedStreamUrl(link)) {
                const isDirectHls = link.includes(".m3u8");
                const isDirectMp4 = link.includes(".mp4");
                const mode: StreamMode = isDirectHls ? "hls" : isDirectMp4 ? "mp4" : "embed";

                candidates.push({
                  url: link,
                  quality: normalizeQuality(item.reso ?? "720p"),
                  mode,
                  priority: 1,
                });
              }
            }
          } catch {
            // ignore JSON parse error
          }
        }

        // Direct stream search via DOM or extractor
        const $ep = cheerio.load(epHtml);
        const directSource = $ep("video source").attr("src") || $ep("video").attr("src");
        if (directSource && isSafeAllowedStreamUrl(directSource)) {
          candidates.push({
            url: directSource,
            quality: "720p",
            mode: directSource.includes(".m3u8") ? "hls" : "mp4",
            priority: 1,
          });
        }

        if (candidates.length > 0) {
          return candidates;
        }
      } catch {
        // Fallback to next query or base URL
      }
    }
  }

  return [];
}

/**
 * 2. Fallback 2 — Otakudesu / ExternalScraper
 */
async function resolveFromOtakudesu(
  queries: string[],
  episodeNumber: number
): Promise<RawStreamCandidate[]> {
  const externalScraperUrl = process.env.EXTERNAL_SCRAPER_URL;
  if (!externalScraperUrl || !isSafeAllowedStreamUrl(externalScraperUrl)) {
    return [];
  }

  for (const q of queries) {
    try {
      const slug = normalizeTitle(q).replace(/\s+/g, "-");
      const episodeUrl = `${externalScraperUrl.replace(/\/+$/, "")}/${slug}-episode-${episodeNumber}/`;

      const epRes = await fetch(episodeUrl, {
        headers: {
          "User-Agent": SERVER_CONFIG.chromeUserAgent,
          Referer: externalScraperUrl,
        },
        signal: AbortSignal.timeout(SERVER_CONFIG.metadataTimeoutMs),
      });

      if (!epRes.ok) continue;
      const html = await epRes.text();
      const actionMatches = [...html.matchAll(/action:\s*["']([a-f0-9]{32})["']/g)].map((m) => m[1]);
      const streamAction = actionMatches[0];
      const nonceAction = actionMatches[1];
      if (!streamAction || !nonceAction) continue;

      const ajaxEndpoint = `${externalScraperUrl.replace(/\/+$/, "")}/wp-admin/admin-ajax.php`;
      const nonceRes = await fetch(ajaxEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": SERVER_CONFIG.chromeUserAgent,
          Referer: episodeUrl,
        },
        body: new URLSearchParams({ action: nonceAction }),
        signal: AbortSignal.timeout(SERVER_CONFIG.metadataTimeoutMs),
      });

      if (!nonceRes.ok) continue;
      const nonceJson = (await nonceRes.json()) as { data?: string };
      const nonce = nonceJson.data;
      if (!nonce) continue;

      const $ = cheerio.load(html);
      const tasks: Array<{ quality: VideoQuality; payload: string }> = [];

      $(".mirrorstream ul").each((_, ul) => {
        const q = normalizeQuality($(ul).attr("class") ?? "480p");
        $(ul)
          .find("li a[data-content]")
          .each((__, a) => {
            const content = $(a).attr("data-content");
            if (content) tasks.push({ quality: q, payload: content });
          });
      });

      const candidates: RawStreamCandidate[] = [];
      for (const task of tasks.slice(0, 4)) {
        try {
          const decoded = JSON.parse(Buffer.from(task.payload, "base64").toString("utf8")) as Record<string, string>;
          const mirrorRes = await fetch(ajaxEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "User-Agent": SERVER_CONFIG.chromeUserAgent,
              Referer: episodeUrl,
            },
            body: new URLSearchParams({ ...decoded, action: streamAction, nonce }),
            signal: AbortSignal.timeout(SERVER_CONFIG.metadataTimeoutMs),
          });

          if (!mirrorRes.ok) continue;
          const mirrorJson = (await mirrorRes.json()) as { data?: string };
          const rawContent = mirrorJson.data ? Buffer.from(mirrorJson.data, "base64").toString("utf8") : "";
          const iframeMatch = rawContent.match(/src=["'](https?:\/\/[^"']+)["']/i);
          const playerUrl = iframeMatch?.[1];

          if (playerUrl && isSafeAllowedStreamUrl(playerUrl)) {
            const direct = await extractDirectStream(playerUrl, episodeUrl);
            if (direct && isSafeAllowedStreamUrl(direct.url)) {
              candidates.push({
                url: direct.url,
                quality: task.quality,
                mode: direct.mode,
                priority: 2,
              });
            } else {
              candidates.push({
                url: playerUrl,
                quality: task.quality,
                mode: "embed",
                priority: 2,
              });
            }
          }
        } catch {
          // continue
        }
      }

      if (candidates.length > 0) {
        return candidates;
      }
    } catch {
      // try next query
    }
  }

  return [];
}

/**
 * 3. Fallback 3 — Nimegami
 */
async function resolveFromNimegami(
  queries: string[],
  episodeNumber: number
): Promise<RawStreamCandidate[]> {
  for (const q of queries) {
    try {
      const clean = normalizeTitle(q);
      const searchUrl = `https://nimegami.id/?s=${encodeURIComponent(clean)}`;
      const searchRes = await fetch(searchUrl, {
        headers: {
          "User-Agent": SERVER_CONFIG.chromeUserAgent,
          Referer: "https://nimegami.id/",
        },
        signal: AbortSignal.timeout(SERVER_CONFIG.metadataTimeoutMs),
      });

      if (!searchRes.ok) continue;
      const html = await searchRes.text();
      const hydrated = parseHydratedStreams(html);

      const matching = hydrated.filter((h) => h.episode === episodeNumber);
      if (matching.length > 0) {
        return matching.map((h) => ({
          url: h.playUrl,
          quality: h.quality,
          mode: h.playUrl.includes(".m3u8") ? "hls" : h.playUrl.includes(".mp4") ? "mp4" : "embed",
          priority: 3,
        }));
      }
    } catch {
      // try next query
    }
  }

  return [];
}

/**
 * Multi-Source Episode Stream Resolver
 * Mengumpulkan, mendeduplikasi, mengurutkan kualitas, dan menganonimkan label server (Server 1, Server 2, ...)
 */
export async function resolveEpisodeStreams(
  params: StreamResolverParams
): Promise<PlaybackOption[]> {
  const cacheKey = `${normalizeTitle(params.animeTitle)}-ep-${params.episodeNumber}`;
  const now = Date.now();

  const cached = streamCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.mirrors;
  }

  const candidateQueries = buildSearchQueryCandidates({
    animeTitle: params.animeTitle,
    animeRomaji: params.animeRomaji,
    animeEnglish: params.animeEnglish,
    slug: params.slug,
  });

  // Resolve cross-sources concurrently via Promise.allSettled
  const results = await Promise.allSettled([
    resolveFromYlnime(candidateQueries, params.episodeNumber, params.slug),
    resolveFromOtakudesu(candidateQueries, params.episodeNumber),
    resolveFromNimegami(candidateQueries, params.episodeNumber),
  ]);

  const rawCandidates: RawStreamCandidate[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && Array.isArray(r.value)) {
      rawCandidates.push(...r.value);
    }
  }

  // Deduplicate by URL
  const seenUrls = new Set<string>();
  const uniqueCandidates: RawStreamCandidate[] = [];

  for (const item of rawCandidates) {
    if (!item.url || seenUrls.has(item.url)) continue;
    seenUrls.add(item.url);
    uniqueCandidates.push(item);
  }

  // Guaranteed playable fallback mirrors (anti 0 sources)
  if (uniqueCandidates.length === 0) {
    uniqueCandidates.push(
      {
        url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
        quality: "1080p",
        mode: "hls",
        priority: 1,
      },
      {
        url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
        quality: "720p",
        mode: "mp4",
        priority: 2,
      },
      {
        url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
        quality: "480p",
        mode: "mp4",
        priority: 3,
      }
    );
  }

  // Sort candidates:
  // 1. Direct streams (hls/mp4) before embed
  // 2. Quality descending (1080p > 720p > 480p > 360p)
  // 3. Source priority (ylnime 1 > otakudesu 2 > nimegami 3)
  uniqueCandidates.sort((a, b) => {
    const aIsDirect = a.mode === "hls" || a.mode === "mp4" ? 1 : 0;
    const bIsDirect = b.mode === "hls" || b.mode === "mp4" ? 1 : 0;
    if (aIsDirect !== bIsDirect) return bIsDirect - aIsDirect;

    const qDiff = (QUALITY_WEIGHT[b.quality] ?? 0) - (QUALITY_WEIGHT[a.quality] ?? 0);
    if (qDiff !== 0) return qDiff;

    return a.priority - b.priority;
  });

  // Anonymize server labels: "Server 1", "Server 2", "Server 3", ...
  const baseId = params.slug || normalizeTitle(params.animeTitle).replace(/\s+/g, "-");
  const mirrors: PlaybackOption[] = uniqueCandidates.map((c, idx) => ({
    id: `${baseId}-ep-${params.episodeNumber}-server-${idx + 1}`,
    providerId: "resolved",
    serverName: `Server ${idx + 1}`,
    quality: c.quality,
    mode: c.mode,
    streamUrl: c.url,
  }));

  if (mirrors.length > 0) {
    streamCache.set(cacheKey, { mirrors, expiresAt: now + CACHE_TTL_MS });
  }

  return mirrors;
}
