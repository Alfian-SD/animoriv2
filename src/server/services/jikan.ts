import type { Anime, AnimeStatus, Episode, PageInfo, RelatedSeason } from "../../shared/anime.js";
import { SERVER_CONFIG } from "../config.js";
import { CURATED_ANIME_CATALOG } from "../providers/curatedProvider.js";
import { isChineseDonghua } from "../providers/externalProvider.js";
import { formatSeasonLabel } from "./anilist.js";

const JIKAN_API_BASE = "https://api.jikan.moe/v4";
const JIKAN_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes TTL
const JIKAN_TIMEOUT_MS = Math.min(SERVER_CONFIG.metadataTimeoutMs, 3500);

export interface JikanQueryParams {
  search?: string;
  page?: number;
  limit?: number;
  genres?: string[];
}

export interface JikanAnimeItem {
  mal_id: number;
  url?: string;
  images?: {
    jpg?: { image_url?: string; small_image_url?: string; large_image_url?: string };
    webp?: { image_url?: string; small_image_url?: string; large_image_url?: string };
  };
  trailer?: {
    youtube_id?: string | null;
    url?: string | null;
    embed_url?: string | null;
    images?: {
      image_url?: string | null;
      small_image_url?: string | null;
      medium_image_url?: string | null;
      large_image_url?: string | null;
      maximum_image_url?: string | null;
    };
  };
  title: string;
  title_english?: string | null;
  title_japanese?: string | null;
  type?: string | null;
  source?: string | null;
  episodes?: number | null;
  status?: string | null;
  aired?: {
    from?: string | null;
    to?: string | null;
    prop?: {
      from?: { day?: number | null; month?: number | null; year?: number | null };
      to?: { day?: number | null; month?: number | null; year?: number | null };
    };
  };
  duration?: string | null;
  rating?: string | null;
  score?: number | null;
  synopsis?: string | null;
  season?: string | null;
  year?: number | null;
  producers?: Array<{ mal_id: number; type: string; name: string; url?: string }>;
  studios?: Array<{ mal_id: number; type: string; name: string; url?: string }>;
  genres?: Array<{ mal_id: number; type: string; name: string; url?: string }>;
  themes?: Array<{ mal_id: number; type: string; name: string; url?: string }>;
  demographics?: Array<{ mal_id: number; type: string; name: string; url?: string }>;
}

export interface JikanRelationEntry {
  mal_id: number;
  type: string;
  name: string;
  url?: string;
}

export interface JikanRelation {
  relation: string;
  entry: JikanRelationEntry[];
}

const MOTIFS = ["sun", "ridgelines", "waves", "slash"] as const;

const CHINESE_STUDIO_KEYWORDS = [
  "bilibili",
  "tencent",
  "haoliners",
  "foch film",
  "foch",
  "sparkly key",
  "coloroom",
  "b.cmay",
  "shenying",
  "g.c.may",
  "l²studio",
  "shanghai animation",
  "beijing",
  "hangzhou",
  "iqiyi",
  "youku",
  "kjjy",
];

export function isChineseJikanItem(item: JikanAnimeItem): boolean {
  const genres = (item.genres ?? []).map((g) => g.name);
  if (isChineseDonghua(item.title, genres)) return true;
  if (item.title_english && isChineseDonghua(item.title_english, genres)) return true;
  if (item.title_japanese && isChineseDonghua(item.title_japanese, genres)) return true;

  const creators = [
    ...(item.studios ?? []).map((s) => s.name.toLowerCase()),
    ...(item.producers ?? []).map((p) => p.name.toLowerCase()),
  ];

  if (creators.some((c) => CHINESE_STUDIO_KEYWORDS.some((kw) => c.includes(kw)))) {
    return true;
  }

  return false;
}

function stripHtmlTags(raw?: string | null): string {
  if (!raw) return "Sinopsis belum tersedia.";
  return raw.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function buildPlayableEpisodes(animeId: string, count: number): Episode[] {
  const total = Math.min(Math.max(count || 12, 1), 24);
  return Array.from({ length: total }, (_, idx) => {
    const epNum = idx + 1;
    const epId = `${animeId}-ep-${epNum}`;
    return {
      id: epId,
      animeId,
      number: epNum,
      title: `Episode ${epNum}`,
      durationMinutes: 24,
      playbackOptions: [],
    };
  });
}

function mapSeason(season?: string | null): "WINTER" | "SPRING" | "SUMMER" | "FALL" {
  if (!season) return "FALL";
  const s = season.toUpperCase();
  if (s === "WINTER" || s === "SPRING" || s === "SUMMER" || s === "FALL") {
    return s;
  }
  return "FALL";
}

export function mapJikanItemToAnime(item: JikanAnimeItem, index = 0): Anime {
  const curatedMatch = CURATED_ANIME_CATALOG.find((c) => c.malId === item.mal_id);
  const id = curatedMatch ? curatedMatch.id : `mal-${item.mal_id}`;
  const slug =
    curatedMatch?.slug ??
    (item.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || id);

  const posterUrl =
    item.images?.webp?.large_image_url ??
    item.images?.jpg?.large_image_url ??
    item.images?.webp?.image_url ??
    item.images?.jpg?.image_url ??
    curatedMatch?.artwork.posterUrl;

  const backdropUrl =
    item.trailer?.images?.maximum_image_url ??
    item.trailer?.images?.large_image_url ??
    curatedMatch?.artwork.backdropUrl ??
    posterUrl;

  const rawGenres = (item.genres ?? []).map((g) => g.name);
  const themes = (item.themes ?? []).map((t) => t.name);
  const combinedGenres = Array.from(new Set([...rawGenres, ...themes]));

  const hasIsekai =
    combinedGenres.some((g) => g.toLowerCase() === "isekai") ||
    (item.synopsis && item.synopsis.toLowerCase().includes("isekai"));
  if (hasIsekai && !combinedGenres.some((g) => g.toLowerCase() === "isekai")) {
    combinedGenres.push("Isekai");
  }

  let status: AnimeStatus = "FINISHED";
  if (item.status === "Currently Airing") {
    status = "RELEASING";
  } else if (item.status === "Not yet aired") {
    status = "NOT_YET_RELEASED";
  }

  const seasonYear =
    item.year ?? item.aired?.prop?.from?.year ?? curatedMatch?.seasonYear ?? 2026;

  return {
    id,
    slug,
    malId: item.mal_id,
    anilistId: curatedMatch?.anilistId,
    sourceProvider: "jikan",
    countryOfOrigin: "JP",
    title: {
      romaji: item.title,
      english: item.title_english ?? undefined,
      native: item.title_japanese ?? undefined,
    },
    synopsis: stripHtmlTags(item.synopsis) || "Sinopsis belum tersedia.",
    status,
    seasonYear,
    season: mapSeason(item.season),
    score: item.score ? Number(item.score.toFixed(1)) : (curatedMatch?.score ?? 8.0),
    genres: combinedGenres.length > 0 ? combinedGenres : (curatedMatch?.genres ?? ["Action"]),
    studio: item.studios?.[0]?.name ?? curatedMatch?.studio ?? "Animation Studio",
    artwork: {
      motif: MOTIFS[index % MOTIFS.length] ?? "sun",
      primaryHue: (index * 37) % 360,
      posterUrl,
      backdropUrl,
    },
    episodes: curatedMatch?.episodes ?? buildPlayableEpisodes(id, item.episodes ?? 12),
  };
}

// In-memory caches with 15-minute TTL
const jikanCatalogCache = new Map<
  string,
  { data: { items: Anime[]; pageInfo: PageInfo }; expiresAt: number }
>();
const jikanAnimeCache = new Map<number, { anime: Anime; expiresAt: number }>();
const jikanSeasonsCache = new Map<number, { seasons: RelatedSeason[]; expiresAt: number }>();

export async function queryJikanCatalog(
  params: JikanQueryParams
): Promise<{ items: Anime[]; pageInfo: PageInfo }> {
  const page = Math.max(params.page ?? 1, 1);
  const limit = Math.min(Math.max(params.limit ?? 25, 1), 25);
  const search = params.search?.trim() || "";

  const cacheKey = JSON.stringify({
    search: search.toLowerCase(),
    page,
    limit,
    genres: params.genres?.sort(),
  });
  const now = Date.now();
  const cached = jikanCatalogCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const url = search
    ? `${JIKAN_API_BASE}/anime?q=${encodeURIComponent(search)}&page=${page}&limit=${limit}&sfw=true`
    : `${JIKAN_API_BASE}/top/anime?page=${page}&limit=${limit}&sfw=true`;

  try {
    let response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": SERVER_CONFIG.chromeUserAgent,
      },
      signal: AbortSignal.timeout(JIKAN_TIMEOUT_MS),
    });

    if (response.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": SERVER_CONFIG.chromeUserAgent,
        },
        signal: AbortSignal.timeout(JIKAN_TIMEOUT_MS),
      });
    }

    if (!response.ok) {
      return {
        items: [],
        pageInfo: { total: 0, currentPage: page, lastPage: 1, hasNextPage: false },
      };
    }

    const payload = (await response.json()) as {
      pagination?: {
        last_visible_page?: number;
        has_next_page?: boolean;
        current_page?: number;
        items?: { total?: number; count?: number; per_page?: number };
      };
      data?: JikanAnimeItem[];
    };

    const rawList = payload.data ?? [];
    const validItems = rawList.filter((item) => !isChineseJikanItem(item));
    let items = validItems.map((item, idx) => mapJikanItemToAnime(item, idx));

    if (params.genres && params.genres.length > 0) {
      items = items.filter((anime) =>
        params.genres!.every((targetGenre) =>
          anime.genres.some((ag) => ag.toLowerCase() === targetGenre.toLowerCase())
        )
      );
    }

    const pagination = payload.pagination;
    const pageInfo: PageInfo = {
      total:
        pagination?.items?.total ??
        (pagination?.last_visible_page ? pagination.last_visible_page * limit : items.length),
      currentPage: page,
      lastPage: pagination?.last_visible_page ?? page,
      hasNextPage: pagination?.has_next_page ?? false,
    };

    const result = { items, pageInfo };
    jikanCatalogCache.set(cacheKey, { data: result, expiresAt: now + JIKAN_CACHE_TTL_MS });
    return result;
  } catch (err) {
    console.error("queryJikanCatalog error:", err);
    return {
      items: [],
      pageInfo: { total: 0, currentPage: page, lastPage: 1, hasNextPage: false },
    };
  }
}

export async function fetchJikanById(malId: number): Promise<Anime | null> {
  const now = Date.now();
  const cached = jikanAnimeCache.get(malId);
  if (cached && cached.expiresAt > now) {
    return cached.anime;
  }

  const url = `${JIKAN_API_BASE}/anime/${malId}/full`;

  try {
    let response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": SERVER_CONFIG.chromeUserAgent,
      },
      signal: AbortSignal.timeout(JIKAN_TIMEOUT_MS),
    });

    if (response.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": SERVER_CONFIG.chromeUserAgent,
        },
        signal: AbortSignal.timeout(JIKAN_TIMEOUT_MS),
      });
    }

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { data?: JikanAnimeItem };
    const item = payload.data;
    if (!item || isChineseJikanItem(item)) {
      return null;
    }

    const anime = mapJikanItemToAnime(item);
    jikanAnimeCache.set(malId, { anime, expiresAt: now + JIKAN_CACHE_TTL_MS });
    return anime;
  } catch (err) {
    console.error(`fetchJikanById(${malId}) error:`, err);
    return null;
  }
}

export async function fetchJikanSeasons(malId: number): Promise<RelatedSeason[]> {
  const now = Date.now();
  const cached = jikanSeasonsCache.get(malId);
  if (cached && cached.expiresAt > now) {
    return cached.seasons;
  }

  const url = `${JIKAN_API_BASE}/anime/${malId}/relations`;

  try {
    let response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": SERVER_CONFIG.chromeUserAgent,
      },
      signal: AbortSignal.timeout(JIKAN_TIMEOUT_MS),
    });

    if (response.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": SERVER_CONFIG.chromeUserAgent,
        },
        signal: AbortSignal.timeout(JIKAN_TIMEOUT_MS),
      });
    }

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as { data?: JikanRelation[] };
    const relations = payload.data ?? [];

    // Get current anime details if available for baseline
    const curatedCurrent = CURATED_ANIME_CATALOG.find((c) => c.malId === malId);
    let currentTitle = curatedCurrent?.title.romaji ?? "";
    let currentYear = curatedCurrent?.seasonYear;
    let currentPoster = curatedCurrent?.artwork.posterUrl;
    let currentEpisodes = curatedCurrent?.episodes.length;

    if (!curatedCurrent) {
      const cachedAnime = jikanAnimeCache.get(malId)?.anime;
      if (cachedAnime) {
        currentTitle = cachedAnime.title.romaji;
        currentYear = cachedAnime.seasonYear;
        currentPoster = cachedAnime.artwork.posterUrl;
        currentEpisodes = cachedAnime.episodes.length;
      }
    }

    interface SeasonCandidate {
      malId: number;
      title: string;
      seasonYear?: number;
      episodesCount?: number;
      posterUrl?: string;
      orderWeight: number; // negative for prequels, 0 for current, positive for sequels
    }

    const candidateMap = new Map<number, SeasonCandidate>();

    // Add current anime
    candidateMap.set(malId, {
      malId,
      title: currentTitle || `Anime #${malId}`,
      seasonYear: currentYear,
      episodesCount: currentEpisodes,
      posterUrl: currentPoster,
      orderWeight: 0,
    });

    // Traverse relations: filter Prequels and Sequels of type "anime"
    for (const rel of relations) {
      const relType = (rel.relation || "").toLowerCase();
      const isPrequel = relType.includes("prequel");
      const isSequel = relType.includes("sequel");
      const isParentOrAlt = relType.includes("parent") || relType.includes("alternative");

      if (!isPrequel && !isSequel && !isParentOrAlt) continue;

      const entries = rel.entry ?? [];
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (!entry || entry.type !== "anime") continue;
        if (isChineseDonghua(entry.name)) continue;

        if (!candidateMap.has(entry.mal_id)) {
          const curated = CURATED_ANIME_CATALOG.find((c) => c.malId === entry.mal_id);
          const cachedEntry = jikanAnimeCache.get(entry.mal_id)?.anime;

          let weight = 0;
          if (isPrequel) weight = -10 - (entries.length - i);
          else if (isSequel) weight = 10 + i;
          else weight = 5 + i;

          candidateMap.set(entry.mal_id, {
            malId: entry.mal_id,
            title: curated?.title.romaji ?? cachedEntry?.title.romaji ?? entry.name,
            seasonYear: curated?.seasonYear ?? cachedEntry?.seasonYear,
            episodesCount: curated?.episodes.length ?? cachedEntry?.episodes.length,
            posterUrl: curated?.artwork.posterUrl ?? cachedEntry?.artwork.posterUrl,
            orderWeight: weight,
          });
        }
      }
    }

    // Sort chronologically: seasonYear ascending, then orderWeight ascending, then malId ascending
    const sortedCandidates = Array.from(candidateMap.values()).sort((a, b) => {
      if (a.seasonYear && b.seasonYear && a.seasonYear !== b.seasonYear) {
        return a.seasonYear - b.seasonYear;
      }
      return a.orderWeight - b.orderWeight || a.malId - b.malId;
    });

    const total = sortedCandidates.length;
    const finalSeasons: RelatedSeason[] = sortedCandidates.map((c, index) => {
      const curated = CURATED_ANIME_CATALOG.find((ca) => ca.malId === c.malId);
      const internalId = curated ? curated.id : `mal-${c.malId}`;

      return {
        id: internalId,
        anilistId: curated?.anilistId ?? c.malId,
        malId: c.malId,
        title: c.title,
        seasonLabel: formatSeasonLabel(c.title, index, total),
        seasonYear: c.seasonYear,
        episodesCount: c.episodesCount,
        posterUrl: c.posterUrl,
        isCurrent: c.malId === malId,
      };
    });

    jikanSeasonsCache.set(malId, { seasons: finalSeasons, expiresAt: now + JIKAN_CACHE_TTL_MS });
    return finalSeasons;
  } catch (err) {
    console.error(`fetchJikanSeasons(${malId}) error:`, err);
    return [];
  }
}

export async function fetchJikanSeasonNow(): Promise<{
  trending: Anime[];
  recentlyUpdated: Anime[];
  currentSeason: Anime[];
}> {
  const url = `${JIKAN_API_BASE}/seasons/now?limit=25&sfw=true`;
  try {
    let response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": SERVER_CONFIG.chromeUserAgent,
      },
      signal: AbortSignal.timeout(JIKAN_TIMEOUT_MS),
    });
    if (response.status === 429) {
      await new Promise((r) => setTimeout(r, 1000));
      response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": SERVER_CONFIG.chromeUserAgent,
        },
        signal: AbortSignal.timeout(JIKAN_TIMEOUT_MS),
      });
    }
    if (response.ok) {
      const payload = (await response.json()) as { data?: JikanAnimeItem[] };
      const valid = (payload.data ?? []).filter((item) => !isChineseJikanItem(item));
      const animes = valid.map((item, idx) => mapJikanItemToAnime(item, idx));
      return {
        trending: animes.slice(0, 10),
        recentlyUpdated: animes.slice(0, 8),
        currentSeason: animes.slice(0, 12),
      };
    }
  } catch (e) {
    console.warn("fetchJikanSeasonNow error:", e);
  }

  // Final fallback to queryJikanCatalog
  const jikanRes = await queryJikanCatalog({ page: 1, limit: 25 });
  return {
    trending: jikanRes.items.slice(0, 10),
    recentlyUpdated: jikanRes.items.slice(0, 8),
    currentSeason: jikanRes.items.slice(0, 12),
  };
}
