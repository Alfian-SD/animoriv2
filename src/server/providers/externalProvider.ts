import * as cheerio from "cheerio";
import type {
  Anime,
  PlaybackOption,
  VideoQuality,
} from "../../shared/anime.js";
import { SERVER_CONFIG } from "../config.js";
import { isSafeAllowedStreamUrl } from "../security/ssrfGuard.js";
import { extractDirectStream } from "../extractors/streamExtractor.js";

export interface CatalogProvider {
  readonly id: string;
  fetchCatalog(): Promise<Anime[]>;
  resolveEpisodeMirrors(episodeUrl: string): Promise<PlaybackOption[]>;
}

export interface HydratedStreamEntry {
  playUrl: string;
  quality: VideoQuality;
  episode: number;
}

interface MirrorTask {
  quality: VideoQuality;
  serverName: string;
  encodedPayload: string;
}

const QUALITY_WEIGHT: Record<VideoQuality, number> = {
  "1080p": 4,
  "720p": 3,
  "480p": 2,
  "360p": 1,
};

export function normalizeQuality(raw: string): VideoQuality {
  const lower = raw.toLowerCase();
  if (lower.includes("1080")) return "1080p";
  if (lower.includes("720")) return "720p";
  if (lower.includes("360")) return "360p";
  return "480p";
}

export function extractSlugFromHref(rawHref = ""): string {
  return (
    rawHref
      .replace(/^https?:\/\/[^/]+/i, "")
      .replace(/^\/+|\/+$/g, "")
      .split("/")
      .pop() ?? ""
  );
}

/**
 * Filter anti-donghua: mendeteksi kata kunci, tag, atau pola judul animasi produksi China.
 */
export function isChineseDonghua(title = "", genres: string[] = []): boolean {
  const lowerTitle = title.toLowerCase().trim();
  const lowerGenres = genres.map((g) => g.toLowerCase().trim());

  if (
    lowerGenres.some(
      (g) =>
        g.includes("donghua") ||
        g.includes("chinese") ||
        g === "3d" ||
        g.includes("china")
    )
  ) {
    return true;
  }

  const donghuaKeywords = [
    "donghua",
    "chinese anime",
    "sub indo donghua",
    "(donghua)",
    "[donghua]",
    "donghua sub indo",
    "douluo dalu",
    "soul land",
    "battle through the heavens",
    "btth",
    "perfect world",
    "shrouding the heavens",
    "swallowed star",
    "renegade immortal",
    "against the gods",
    "tales of demons and gods",
    "wu dong qian kun",
    "wan jie",
    "xian ni",
    "da zhuzai",
    "cang yuan tu",
    "fanren xiu xian chuan",
    "modao zushi",
    "mo dao zu shi",
    "tian bao fuyao lu",
    "ling cage",
    "scumbag system",
    "heaven official's blessing",
    "tian guan ci fu",
    "quanzhi fashi",
    "the king's avatar",
    "quan zhi gao shou",
    "huan jie wang",
    "bai lian cheng shen",
    "apotheosis",
    "peerless martial spirit",
    "martial master",
    "fangkai nage",
  ];

  for (const kw of donghuaKeywords) {
    if (lowerTitle.includes(kw)) {
      return true;
    }
  }

  return false;
}

/**
 * Mengekstrak objek stream dari skrip hidrasi Next.js / React Flight.
 */
export function parseHydratedStreams(html: string): HydratedStreamEntry[] {
  const results: HydratedStreamEntry[] = [];
  const regex = /\{[^{}]*?\\"playUrl\\"\s*:\s*\\"([^"\\]+)\\"[^{}]*?\}/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    const rawBlock = match[0];
    try {
      const unescaped = rawBlock.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      const parsed = JSON.parse(unescaped) as Record<string, unknown>;
      const playUrl = typeof parsed.playUrl === "string" ? parsed.playUrl : "";
      if (playUrl && isSafeAllowedStreamUrl(playUrl)) {
        results.push({
          playUrl,
          quality: normalizeQuality(String(parsed.quality ?? "720p")),
          episode: Number(parsed.episode ?? 1) || 1,
        });
      }
    } catch {
      const urlMatch = rawBlock.match(/\\"playUrl\\":\\"([^"\\]+)\\"/);
      const qualMatch = rawBlock.match(/\\"quality\\":\\"([^"\\]+)\\"/);
      const epMatch = rawBlock.match(/\\"episode\\":(\d+)/);
      const playUrl = urlMatch?.[1] ?? "";
      if (playUrl && isSafeAllowedStreamUrl(playUrl)) {
        results.push({
          playUrl,
          quality: normalizeQuality(qualMatch?.[1] ?? "720p"),
          episode: Number.parseInt(epMatch?.[1] ?? "1", 10) || 1,
        });
      }
    }
  }

  return results;
}

export function sortPlaybackOptionsByQuality(
  options: PlaybackOption[]
): PlaybackOption[] {
  return [...options].sort(
    (a, b) => (QUALITY_WEIGHT[b.quality] ?? 0) - (QUALITY_WEIGHT[a.quality] ?? 0)
  );
}

/**
 * Provider Scraper Otakudesu (HTML DOM Parser dengan Cheerio).
 */
export class OtakudesuProvider implements CatalogProvider {
  public readonly id = "otakudesu";
  public readonly baseUrl: string;
  private readonly mirrorCache = new Map<
    string,
    { options: PlaybackOption[]; expiresAt: number }
  >();
  private static readonly MIRROR_TTL_MS = 15 * 60 * 1000;

  constructor(baseUrl?: string) {
    const raw = baseUrl || process.env.OTAKUDESU_URL || "https://otakudesu.blog";
    this.baseUrl = raw.replace(/\/+$/, "");
  }

  public async fetchCatalog(): Promise<Anime[]> {
    if (!this.baseUrl || !isSafeAllowedStreamUrl(this.baseUrl)) {
      return [];
    }

    try {
      const res = await fetch(`${this.baseUrl}/`, {
        headers: {
          "User-Agent": SERVER_CONFIG.chromeUserAgent,
          Referer: `${this.baseUrl}/`,
        },
        signal: AbortSignal.timeout(2000),
      });

      if (!res.ok) return [];
      const html = await res.text();
      const $ = cheerio.load(html);
      const items: Anime[] = [];

      $(".venz ul li, .rapi ul li").each((index, el) => {
        const title = $(el).find(".jdlflm, h2, a").first().text().trim();
        const href = $(el).find("a").first().attr("href") ?? "";
        const posterUrl = $(el).find("img").attr("src");
        const epText = $(el).find(".epz").text().trim();
        const slug = extractSlugFromHref(href);

        if (!title || !slug) return;
        if (isChineseDonghua(title)) return;

        const epMatch = epText.match(/\d+/);
        const epCount = epMatch ? Number.parseInt(epMatch[0], 10) : 12;

        items.push({
          id: `${this.id}:${slug}`,
          slug,
          sourceProvider: this.id,
          countryOfOrigin: "JP",
          externalUrl: href,
          title: { romaji: title },
          synopsis: `Katalog anime dari Otakudesu.`,
          status: "RELEASING",
          seasonYear: 2026,
          season: "FALL",
          score: 8.0,
          genres: ["Action", "Adventure"],
          studio: "Otakudesu",
          artwork: {
            motif: index % 2 === 0 ? "ridgelines" : "sun",
            primaryHue: (index * 47) % 360,
            posterUrl:
              posterUrl && isSafeAllowedStreamUrl(posterUrl)
                ? posterUrl
                : undefined,
          },
          episodes: Array.from(
            { length: Math.min(Math.max(epCount, 1), 24) },
            (_, idx) => ({
              id: `${this.id}-${slug}-ep-${idx + 1}`,
              animeId: `${this.id}:${slug}`,
              number: idx + 1,
              title: `Episode ${idx + 1}`,
              durationMinutes: 24,
              playbackOptions: [],
            })
          ),
        });
      });

      return items;
    } catch {
      return [];
    }
  }

  public async resolveEpisodeMirrors(
    episodeUrl: string
  ): Promise<PlaybackOption[]> {
    if (!isSafeAllowedStreamUrl(episodeUrl)) {
      return [];
    }

    const cached = this.mirrorCache.get(episodeUrl);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.options;
    }

    try {
      const epRes = await fetch(episodeUrl, {
        headers: {
          "User-Agent": SERVER_CONFIG.chromeUserAgent,
          Referer: `${this.baseUrl}/`,
        },
        signal: AbortSignal.timeout(SERVER_CONFIG.metadataTimeoutMs),
      });

      if (!epRes.ok) return [];
      const episodeHtml = await epRes.text();

      const actionMatches = [
        ...episodeHtml.matchAll(/action:\s*["']([a-f0-9]{32})["']/g),
      ].map((m) => m[1]);

      const streamAction = actionMatches[0];
      const nonceAction = actionMatches[1];
      if (!streamAction || !nonceAction) {
        return [];
      }

      const ajaxEndpoint = `${this.baseUrl}/wp-admin/admin-ajax.php`;
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

      if (!nonceRes.ok) return [];
      const nonceJson = (await nonceRes.json()) as { data?: string };
      const nonce = nonceJson.data;
      if (!nonce) return [];

      const $ = cheerio.load(episodeHtml);
      const tasks: MirrorTask[] = [];

      $(".mirrorstream ul").each((_, ul) => {
        const rawClass = $(ul).attr("class") ?? "480p";
        const quality = normalizeQuality(rawClass);

        $(ul)
          .find("li a[data-content]")
          .each((__, anchor) => {
            const serverName = $(anchor).text().trim();
            const encodedPayload = $(anchor).attr("data-content") ?? "";
            if (serverName && encodedPayload) {
              tasks.push({ quality, serverName, encodedPayload });
            }
          });
      });

      const settled = await Promise.allSettled(
        tasks.map(async (task, idx): Promise<PlaybackOption | null> => {
          const decodedJson = Buffer.from(
            task.encodedPayload,
            "base64"
          ).toString("utf8");
          const payloadObj = JSON.parse(decodedJson) as Record<string, string>;

          const mirrorRes = await fetch(ajaxEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "User-Agent": SERVER_CONFIG.chromeUserAgent,
              Referer: episodeUrl,
            },
            body: new URLSearchParams({
              ...payloadObj,
              nonce,
              action: streamAction,
            }),
            signal: AbortSignal.timeout(SERVER_CONFIG.metadataTimeoutMs),
          });

          if (!mirrorRes.ok) return null;
          const mirrorJson = (await mirrorRes.json()) as { data?: string };
          if (!mirrorJson.data) return null;

          const iframeHtml = Buffer.from(mirrorJson.data, "base64").toString(
            "utf8"
          );
          const iframeSrc =
            cheerio.load(iframeHtml)("iframe").attr("src") ?? "";
          if (!iframeSrc || !isSafeAllowedStreamUrl(iframeSrc)) {
            return null;
          }

          const direct = await extractDirectStream(iframeSrc, episodeUrl);

          return {
            id: `${this.id}-${task.quality}-${idx}`,
            providerId: this.id,
            serverName: task.serverName,
            quality: task.quality,
            mode: direct ? direct.mode : "embed",
            streamUrl: direct ? direct.url : iframeSrc,
          };
        })
      );

      const validOptions = settled
        .filter(
          (r): r is PromiseFulfilledResult<PlaybackOption> =>
            r.status === "fulfilled" && r.value !== null
        )
        .map((r) => r.value);

      const sorted = sortPlaybackOptionsByQuality(validOptions);
      this.mirrorCache.set(episodeUrl, {
        options: sorted,
        expiresAt: Date.now() + OtakudesuProvider.MIRROR_TTL_MS,
      });

      return sorted;
    } catch {
      return [];
    }
  }
}

/**
 * Provider Scraper Nimegami (HTML & Hydrated Streams Parser).
 */
export class NimegamiProvider implements CatalogProvider {
  public readonly id = "nimegami";
  public readonly baseUrl: string;
  private readonly mirrorCache = new Map<
    string,
    { options: PlaybackOption[]; expiresAt: number }
  >();
  private static readonly MIRROR_TTL_MS = 15 * 60 * 1000;

  constructor(baseUrl?: string) {
    const raw = baseUrl || process.env.NIMEGAMI_URL || "https://nimegami.id";
    this.baseUrl = raw.replace(/\/+$/, "");
  }

  public async fetchCatalog(): Promise<Anime[]> {
    if (!this.baseUrl || !isSafeAllowedStreamUrl(this.baseUrl)) {
      return [];
    }

    try {
      const res = await fetch(`${this.baseUrl}/`, {
        headers: {
          "User-Agent": SERVER_CONFIG.chromeUserAgent,
          Referer: `${this.baseUrl}/`,
        },
        signal: AbortSignal.timeout(2000),
      });

      if (!res.ok) return [];
      const html = await res.text();
      const $ = cheerio.load(html);
      const items: Anime[] = [];

      $("article, .bsx, .listupd .bs").each((index, el) => {
        const title = $(el).find(".tt, h2, a").first().text().trim();
        const href = $(el).find("a").first().attr("href") ?? "";
        const posterUrl =
          $(el).find("img").attr("src") || $(el).find("img").attr("data-src");
        const slug = extractSlugFromHref(href);

        if (!title || !slug) return;
        if (isChineseDonghua(title)) return;

        items.push({
          id: `${this.id}:${slug}`,
          slug,
          sourceProvider: this.id,
          countryOfOrigin: "JP",
          externalUrl: href,
          title: { romaji: title },
          synopsis: `Katalog anime dari Nimegami.`,
          status: "RELEASING",
          seasonYear: 2026,
          season: "FALL",
          score: 8.2,
          genres: ["Action", "Fantasy"],
          studio: "Nimegami",
          artwork: {
            motif: index % 2 === 0 ? "waves" : "slash",
            primaryHue: (index * 63) % 360,
            posterUrl:
              posterUrl && isSafeAllowedStreamUrl(posterUrl)
                ? posterUrl
                : undefined,
          },
          episodes: Array.from({ length: 12 }, (_, idx) => ({
            id: `${this.id}-${slug}-ep-${idx + 1}`,
            animeId: `${this.id}:${slug}`,
            number: idx + 1,
            title: `Episode ${idx + 1}`,
            durationMinutes: 24,
            playbackOptions: [],
          })),
        });
      });

      return items;
    } catch {
      return [];
    }
  }

  public async resolveEpisodeMirrors(
    episodeUrl: string
  ): Promise<PlaybackOption[]> {
    if (!isSafeAllowedStreamUrl(episodeUrl)) {
      return [];
    }

    const cached = this.mirrorCache.get(episodeUrl);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.options;
    }

    try {
      const epRes = await fetch(episodeUrl, {
        headers: {
          "User-Agent": SERVER_CONFIG.chromeUserAgent,
          Referer: `${this.baseUrl}/`,
        },
        signal: AbortSignal.timeout(SERVER_CONFIG.metadataTimeoutMs),
      });

      if (!epRes.ok) return [];
      const html = await epRes.text();
      const hydrated = parseHydratedStreams(html);

      const options: PlaybackOption[] = hydrated.map((h, idx) => ({
        id: `${this.id}-${h.quality}-${idx}`,
        providerId: this.id,
        serverName: `Server ${idx + 1}`,
        quality: h.quality,
        mode: h.playUrl.includes(".m3u8")
          ? "hls"
          : h.playUrl.includes(".mp4")
            ? "mp4"
            : "embed",
        streamUrl: h.playUrl,
      }));

      const sorted = sortPlaybackOptionsByQuality(options);
      this.mirrorCache.set(episodeUrl, {
        options: sorted,
        expiresAt: Date.now() + NimegamiProvider.MIRROR_TTL_MS,
      });

      return sorted;
    } catch {
      return [];
    }
  }
}

/**
 * Backward compatibility alias for existing consumers.
 */
export class ExternalHtmlScraperProvider extends OtakudesuProvider {
  constructor(_id: string, baseUrl: string) {
    super(baseUrl);
  }
}
