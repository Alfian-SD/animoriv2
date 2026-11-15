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

function normalizeQuality(raw: string): VideoQuality {
  if (raw.includes("1080")) return "1080p";
  if (raw.includes("720")) return "720p";
  if (raw.includes("360")) return "360p";
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

export class ExternalHtmlScraperProvider implements CatalogProvider {
  public readonly id: string;
  private readonly baseUrl: string;
  private readonly mirrorCache = new Map<
    string,
    { options: PlaybackOption[]; expiresAt: number }
  >();
  private static readonly MIRROR_TTL_MS = 15 * 60 * 1000; // 15 menit (mencegah token CDN kedaluwarsa)

  constructor(id: string, baseUrl: string) {
    this.id = id;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
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
        signal: AbortSignal.timeout(SERVER_CONFIG.metadataTimeoutMs),
      });

      if (!res.ok) return [];
      const html = await res.text();
      const $ = cheerio.load(html);
      const items: Anime[] = [];

      $(".venz ul li").each((index, el) => {
        const title = $(el).find("h2.jdlflm").text().trim();
        const href = $(el).find("a").attr("href") ?? "";
        const posterUrl = $(el).find("img").attr("src");
        const slug = extractSlugFromHref(href);

        if (!title || !slug) return;

        items.push({
          id: `${this.id}:${slug}`,
          slug,
          sourceProvider: this.id,
          title: { romaji: title },
          synopsis: `Katalog sinkronisasi eksternal dari ${this.id}.`,
          status: "RELEASING",
          seasonYear: 2026,
          season: "FALL",
          score: 8.0,
          genres: ["Action", "Adventure"],
          studio: "External Source",
          artwork: {
            motif: index % 2 === 0 ? "ridgelines" : "sun",
            primaryHue: (index * 47) % 360,
            posterUrl:
              posterUrl && isSafeAllowedStreamUrl(posterUrl)
                ? posterUrl
                : undefined,
          },
          episodes: [],
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
        expiresAt: Date.now() + ExternalHtmlScraperProvider.MIRROR_TTL_MS,
      });

      return sorted;
    } catch {
      return [];
    }
  }
}
