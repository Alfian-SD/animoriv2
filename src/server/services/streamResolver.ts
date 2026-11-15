import * as cheerio from "cheerio";
import type { PlaybackOption, VideoQuality, StreamMode, Anime } from "../../shared/anime.js";
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

export const STOP_WORDS = new Set([
  "wa",
  "ga",
  "no",
  "wo",
  "ni",
  "de",
  "to",
  "the",
  "of",
  "a",
  "an",
  "in",
  "on",
  "at",
  "is",
  "and",
  "or",
  "for",
  "with",
]);

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
 * Hitung kesamaan word-overlap antara kueri pencarian dan judul target (0.0 - 1.0)
 */
export function calculateWordOverlap(query: string, candidate: string): number {
  const tokenize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOP_WORDS.has(w));

  const qTokens = tokenize(query);
  const cTokens = tokenize(candidate);
  if (qTokens.length === 0 || cTokens.length === 0) return 0;

  const cSet = new Set(cTokens);
  let matches = 0;

  for (const token of qTokens) {
    if (cSet.has(token)) {
      matches += 1;
    } else {
      // Kecocokan parsial kata majemuk/pemisahan (misal: "daiseijo" <-> "seijo" atau "dai")
      for (const ct of cSet) {
        if (ct.includes(token) || token.includes(ct)) {
          matches += 0.8;
          break;
        }
      }
    }
  }

  return matches / qTokens.length;
}

/**
 * Bangun daftar kandidat kueri pencarian multi-segi untuk anime & sekuel (mengakomodasi judul panjang)
 */
export function buildSearchQueries(
  animeOrParams:
    | Anime
    | StreamResolverParams
    | {
        title?: { romaji: string; english?: string };
        animeTitle?: string;
        animeRomaji?: string;
        animeEnglish?: string;
        slug?: string;
      }
): string[] {
  const queries: string[] = [];

  const romaji =
    ("title" in animeOrParams ? animeOrParams.title?.romaji : undefined) ||
    ("animeRomaji" in animeOrParams ? animeOrParams.animeRomaji : undefined) ||
    ("animeTitle" in animeOrParams ? animeOrParams.animeTitle : undefined) ||
    "";

  const english =
    ("title" in animeOrParams ? animeOrParams.title?.english : undefined) ||
    ("animeEnglish" in animeOrParams ? animeOrParams.animeEnglish : undefined) ||
    "";

  const slug = ("slug" in animeOrParams ? animeOrParams.slug : undefined) || "";

  // 1. Judul mentah & ternormalisasi (romaji & english)
  if (romaji) {
    queries.push(romaji.trim());
    queries.push(normalizeTitle(romaji));
  }
  if (english) {
    queries.push(english.trim());
    queries.push(normalizeTitle(english));
  }

  // 2. Franchise root title (menghapus Season 2, Part 2, dsb.)
  if (romaji) {
    const root = extractRootFranchiseTitle(romaji);
    if (root && root.length > 2 && root !== romaji) {
      queries.push(root);
    }
  }
  if (english) {
    const root = extractRootFranchiseTitle(english);
    if (root && root.length > 2 && root !== english) {
      queries.push(root);
    }
  }

  // 3. 3-4 kata kunci utama pertama (mengabaikan partikel pendek: wa, ga, no, wo, ni, de, dll.)
  // Contoh: "Tensei shita Dai Seijo wa, Seijo de Aru Koto wo Hita Kakusu" -> "Tensei shita Dai Seijo"
  const extractLeadingKeywords = (title: string): string[] => {
    const words = title
      .replace(/[,;:.!?"'()[\]{}]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 0);

    const significant = words.filter((w) => !STOP_WORDS.has(w.toLowerCase()));
    const keySubsets: string[] = [];

    if (significant.length >= 3) {
      keySubsets.push(significant.slice(0, 3).join(" "));
      keySubsets.push(significant.slice(0, 4).join(" "));
    } else if (words.length >= 3) {
      keySubsets.push(words.slice(0, 3).join(" "));
      keySubsets.push(words.slice(0, 4).join(" "));
    }

    // Variasi gabungan kata umum seperti "Dai Seijo" <-> "Daiseijo", "Hita Kakusu" <-> "Hitakakusu"
    if (title.toLowerCase().includes("dai seijo")) {
      keySubsets.push(title.replace(/dai\s+seijo/gi, "Daiseijo").slice(0, 30).trim());
    }

    return keySubsets;
  };

  if (romaji) queries.push(...extractLeadingKeywords(romaji));
  if (english) queries.push(...extractLeadingKeywords(english));

  // 4. Variasi penulisan season: "2nd Season" <-> "Season 2" <-> "S2"
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

  if (slug) {
    queries.push(slug.replace(/-/g, " "));
  }

  // Deduplikasi dan buang entri terlalu pendek
  return Array.from(new Set(queries.map((s) => s.trim()).filter((s) => s.length > 2)));
}

/**
 * Alias kompatibilitas mundur
 */
export const buildSearchQueryCandidates = buildSearchQueries;

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
 * Mencari katalog anime berdasarkan word-overlap similarity, membuka halaman episode, dan mengambil stream embed / direct.
 */
async function resolveFromOtakudesu(
  queries: string[],
  episodeNumber: number
): Promise<RawStreamCandidate[]> {
  const otakudesuBase =
    process.env.OTAKUDESU_URL ||
    process.env.EXTERNAL_SCRAPER_URL ||
    "https://otakudesu.blog";

  if (!isSafeAllowedStreamUrl(otakudesuBase)) {
    return [];
  }

  const cleanBase = otakudesuBase.replace(/\/+$/, "");

  for (const q of queries) {
    try {
      // 1. Cari katalog anime di Otakudesu
      const searchUrl = `${cleanBase}/?s=${encodeURIComponent(q)}&post_type=anime`;
      const searchRes = await fetch(searchUrl, {
        headers: {
          "User-Agent": SERVER_CONFIG.chromeUserAgent,
          Referer: `${cleanBase}/`,
        },
        signal: AbortSignal.timeout(SERVER_CONFIG.metadataTimeoutMs),
      });

      if (!searchRes.ok) continue;
      const searchHtml = await searchRes.text();
      const $search = cheerio.load(searchHtml);

      // Cari halaman anime dengan word-overlap tertinggi
      let bestAnimeUrl = "";
      let highestScore = 0;

      $search(".chlist, .venz ul li, .page li, article, .jdlflm").each((_, el) => {
        const a = $search(el).find("h2 a, a").first();
        const href = a.attr("href");
        const title = a.text().trim();
        if (href && (href.includes("/anime/") || !href.includes("/episode/"))) {
          const score = calculateWordOverlap(q, title);
          if (score >= 0.5 && score > highestScore) {
            highestScore = score;
            bestAnimeUrl = href;
          }
        }
      });

      // Cadangan seleksi jika selektor di atas tidak menemukan kecocokan
      if (!bestAnimeUrl) {
        $search("a[href*='/anime/']").each((_, a) => {
          const href = $search(a).attr("href");
          const title = $search(a).text().trim();
          if (href && title) {
            const score = calculateWordOverlap(q, title);
            if (score >= 0.4 && score > highestScore) {
              highestScore = score;
              bestAnimeUrl = href;
            }
          }
        });
      }

      if (!bestAnimeUrl) continue;

      // 2. Buka halaman seri anime untuk menemukan episode yang diminta
      const animeRes = await fetch(bestAnimeUrl, {
        headers: {
          "User-Agent": SERVER_CONFIG.chromeUserAgent,
          Referer: searchUrl,
        },
        signal: AbortSignal.timeout(SERVER_CONFIG.metadataTimeoutMs),
      });

      if (!animeRes.ok) continue;
      const animeHtml = await animeRes.text();
      const $anime = cheerio.load(animeHtml);

      let episodeUrl = "";
      $anime(".episodelist ul li a, .episodes a, a[href*='-episode-']").each((_, a) => {
        const href = $anime(a).attr("href") ?? "";
        const text = $anime(a).text().trim();
        const match =
          text.match(/episode\s*(\d+)/i) ||
          href.match(/[-_](\d+)[-_]/) ||
          href.match(/[-_](\d+)$/);

        if (match && Number.parseInt(match[1] ?? "0", 10) === episodeNumber) {
          episodeUrl = href;
        }
      });

      if (!episodeUrl) continue;

      // 3. Buka halaman episode
      const epRes = await fetch(episodeUrl, {
        headers: {
          "User-Agent": SERVER_CONFIG.chromeUserAgent,
          Referer: bestAnimeUrl,
        },
        signal: AbortSignal.timeout(SERVER_CONFIG.metadataTimeoutMs),
      });

      if (!epRes.ok) continue;
      const epHtml = await epRes.text();
      const $ep = cheerio.load(epHtml);

      const candidates: RawStreamCandidate[] = [];

      // A. Ambil player iframe utama di halaman episode
      const initialIframe =
        $ep(".responsive-embed-stream iframe").attr("src") ||
        $ep("#pembed iframe").attr("src") ||
        $ep("iframe").attr("src");

      if (initialIframe && isSafeAllowedStreamUrl(initialIframe)) {
        const direct = await extractDirectStream(initialIframe, episodeUrl);
        if (direct && isSafeAllowedStreamUrl(direct.url)) {
          candidates.push({
            url: direct.url,
            quality: "720p",
            mode: direct.mode,
            priority: 2,
          });
        } else {
          // JANGAN buang mirror embed!
          candidates.push({
            url: initialIframe,
            quality: "720p",
            mode: "embed",
            priority: 2,
          });
        }
      }

      // B. Ambil mirrorstream via AJAX
      const actionMatches = [...epHtml.matchAll(/action:\s*["']([a-f0-9]{32})["']/g)].map((m) => m[1]);
      const streamAction = actionMatches[0];
      const nonceAction = actionMatches[1];

      if (streamAction && nonceAction) {
        const ajaxEndpoint = `${cleanBase}/wp-admin/admin-ajax.php`;
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

        if (nonceRes.ok) {
          const nonceJson = (await nonceRes.json()) as { data?: string };
          const nonce = nonceJson.data;

          if (nonce) {
            const tasks: Array<{ quality: VideoQuality; payload: string }> = [];
            $ep(".mirrorstream ul").each((_, ul) => {
              const q = normalizeQuality($ep(ul).attr("class") ?? "480p");
              $ep(ul)
                .find("li a[data-content]")
                .each((__, a) => {
                  const content = $ep(a).attr("data-content");
                  if (content) tasks.push({ quality: q, payload: content });
                });
            });

            for (const task of tasks.slice(0, 6)) {
              try {
                const decoded = JSON.parse(
                  Buffer.from(task.payload, "base64").toString("utf8")
                ) as Record<string, string>;

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
                const rawContent = mirrorJson.data
                  ? Buffer.from(mirrorJson.data, "base64").toString("utf8")
                  : "";
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
                    // JANGAN buang mirror embed!
                    candidates.push({
                      url: playerUrl,
                      quality: task.quality,
                      mode: "embed",
                      priority: 2,
                    });
                  }
                }
              } catch {
                // abaikan kegagalan mirror individual
              }
            }
          }
        }
      }

      if (candidates.length > 0) {
        return candidates;
      }
    } catch {
      // coba kueri selanjutnya
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
      const $ = cheerio.load(html);

      // Cek stream terhidrasi langsung pada halaman pencarian
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

      // Cek halaman anime hasil pencarian dengan word-overlap
      let bestAnimeHref = "";
      let highestScore = 0;

      $(".post-article article, article, .thumbnail-archive").each((_, el) => {
        const a = $(el).find("a").first();
        const title = $(el).find("h2, .title").text().trim() || a.text().trim();
        const href = a.attr("href");
        if (href && !href.includes("#")) {
          const score = calculateWordOverlap(q, title);
          if (score >= 0.5 && score > highestScore) {
            highestScore = score;
            bestAnimeHref = href;
          }
        }
      });

      if (bestAnimeHref) {
        const animeUrl = bestAnimeHref.startsWith("http")
          ? bestAnimeHref
          : `https://nimegami.id/${bestAnimeHref.replace(/^\/?/, "")}`;

        const animeRes = await fetch(animeUrl, {
          headers: {
            "User-Agent": SERVER_CONFIG.chromeUserAgent,
            Referer: searchUrl,
          },
          signal: AbortSignal.timeout(SERVER_CONFIG.metadataTimeoutMs),
        });

        if (animeRes.ok) {
          const animeHtml = await animeRes.text();
          const animeHydrated = parseHydratedStreams(animeHtml);
          const animeMatching = animeHydrated.filter((h) => h.episode === episodeNumber);
          if (animeMatching.length > 0) {
            return animeMatching.map((h) => ({
              url: h.playUrl,
              quality: h.quality,
              mode: h.playUrl.includes(".m3u8") ? "hls" : h.playUrl.includes(".mp4") ? "mp4" : "embed",
              priority: 3,
            }));
          }
        }
      }
    } catch {
      // coba kueri selanjutnya
    }
  }

  return [];
}

/**
 * Multi-Source Episode Stream Resolver
 * Mengumpulkan, mendeduplikasi, mengurutkan kualitas, dan menganonimkan label server (Server 1, Server 2, ...)
 * Jika stream tidak ditemukan di semua provider, mengembalikan array kosong [] (tanpa video dummy)
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

  const candidateQueries = buildSearchQueries({
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

  // Hapus total fallback video dummy open-source.
  // Jika stream episode belum tersedia, kembalikan mirrors kosong [] agar UI menampilkan pesan status resmi.
  if (uniqueCandidates.length === 0) {
    return [];
  }

  // Urutkan kandidat:
  // 1. Direct streams (hls/mp4) sebelum embed
  // 2. Kualitas menurun (1080p > 720p > 480p > 360p)
  // 3. Prioritas sumber (ylnime 1 > otakudesu 2 > nimegami 3)
  uniqueCandidates.sort((a, b) => {
    const aIsDirect = a.mode === "hls" || a.mode === "mp4" ? 1 : 0;
    const bIsDirect = b.mode === "hls" || b.mode === "mp4" ? 1 : 0;
    if (aIsDirect !== bIsDirect) return bIsDirect - aIsDirect;

    const qDiff = (QUALITY_WEIGHT[b.quality] ?? 0) - (QUALITY_WEIGHT[a.quality] ?? 0);
    if (qDiff !== 0) return qDiff;

    return a.priority - b.priority;
  });

  // Anonimisasi label server secara teratur: "Server 1", "Server 2", "Server 3", ...
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
