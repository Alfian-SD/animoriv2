import type { Anime, Episode, PageInfo, RelatedSeason } from "../../shared/anime.js";
import { SERVER_CONFIG } from "../config.js";
import { CURATED_ANIME_CATALOG } from "../providers/curatedProvider.js";
import { queryJikanCatalog, fetchJikanSeasons, fetchJikanSeasonNow } from "./jikan.js";

const ANILIST_ENDPOINT = "https://graphql.anilist.co";

export interface AniListMedia {
  id: number;
  idMal?: number | null;
  countryOfOrigin?: string | null;
  title: {
    romaji: string;
    english?: string | null;
    native?: string | null;
  };
  description?: string | null;
  status?: "RELEASING" | "FINISHED" | "NOT_YET_RELEASED" | "CANCELLED" | "HIATUS";
  seasonYear?: number | null;
  season?: "WINTER" | "SPRING" | "SUMMER" | "FALL" | null;
  averageScore?: number | null;
  episodes?: number | null;
  genres?: string[];
  tags?: Array<{ name: string; isMediaSpoiler?: boolean }>;
  coverImage?: {
    extraLarge?: string | null;
    large?: string | null;
  };
  bannerImage?: string | null;
  studios?: {
    nodes?: Array<{ name: string }>;
  };
  nextAiringEpisode?: {
    episode?: number | null;
    airingAt?: number | null;
  } | null;
}

export interface AniListQueryParams {
  search?: string;
  genres?: string[];
  genre?: string;
  status?: string;
  sort?: string | string[];
  page?: number;
  perPage?: number;
}

export interface AniListQueryResult {
  items: Anime[];
  pageInfo: PageInfo;
}

const MOTIFS = ["sun", "ridgelines", "waves", "slash"] as const;

function stripHtmlTags(raw?: string | null): string {
  if (!raw) return "Sinopsis belum tersedia.";
  return raw.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

export function buildPlayableEpisodes(animeId: string, count: number): Episode[] {
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

function mapAniListMediaToAnime(m: AniListMedia, index = 0): Anime {
  const slug = m.title.romaji
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const id = `al-${m.id}`;
  const posterUrl = m.coverImage?.extraLarge ?? m.coverImage?.large ?? undefined;
  const backdropUrl = m.bannerImage ?? posterUrl;

  const rawGenres = m.genres ?? [];
  const hasIsekaiTag = m.tags?.some((t) => t.name?.toLowerCase() === "isekai");
  const combinedGenres = [...rawGenres];
  if (hasIsekaiTag && !combinedGenres.some((g) => g.toLowerCase() === "isekai")) {
    combinedGenres.push("Isekai");
  }

  const latestReleased = m.nextAiringEpisode?.episode
    ? Math.max(m.nextAiringEpisode.episode - 1, 1)
    : null;
  const episodeCount = latestReleased ?? m.episodes ?? 12;
  const episodes = buildPlayableEpisodes(id, episodeCount);

  const lastEp = episodes[episodes.length - 1];
  if (lastEp && m.nextAiringEpisode?.airingAt) {
    const lastAirDate = new Date((m.nextAiringEpisode.airingAt - 7 * 24 * 3600) * 1000);
    lastEp.airDate = `Aired ${lastAirDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }

  return {
    id,
    slug: slug || id,
    malId: m.idMal ?? undefined,
    anilistId: m.id,
    sourceProvider: "anilist",
    countryOfOrigin: m.countryOfOrigin ?? "JP",
    title: {
      romaji: m.title.romaji,
      english: m.title.english ?? undefined,
      native: m.title.native ?? undefined,
    },
    synopsis: stripHtmlTags(m.description),
    status:
      m.status === "RELEASING" || m.status === "FINISHED" || m.status === "NOT_YET_RELEASED"
        ? m.status
        : "FINISHED",
    seasonYear: m.seasonYear ?? 2026,
    season: m.season ?? "FALL",
    score: m.averageScore ? Number((m.averageScore / 10).toFixed(1)) : 8.5,
    genres: combinedGenres,
    studio: m.studios?.nodes?.[0]?.name ?? "Animation Studio",
    artwork: {
      motif: MOTIFS[index % MOTIFS.length] ?? "sun",
      primaryHue: (index * 37) % 360,
      posterUrl,
      backdropUrl,
    },
    episodes,
  };
}

// In-memory cache for trending anime to stay within AniList rate limits
let cachedTrending: { data: Anime[]; expiresAt: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// In-memory cache for dynamic queries
const catalogQueryCache = new Map<string, { data: AniListQueryResult; expiresAt: number }>();

// In-memory cache for artwork enrichment (TTL 1 hour)
const enrichedArtworkCache = new Map<
  number,
  { posterUrl?: string; backdropUrl?: string; expiresAt: number }
>();
const ARTWORK_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function enrichCatalogArtwork(items: Anime[]): Promise<Anime[]> {
  const now = Date.now();
  const missingIds: number[] = [];

  for (const item of items) {
    if (item.anilistId) {
      const cached = enrichedArtworkCache.get(item.anilistId);
      if (!cached || cached.expiresAt <= now) {
        missingIds.push(item.anilistId);
      }
    }
  }

  if (missingIds.length > 0) {
    const query = `
      query ($ids: [Int]) {
        Page(page: 1, perPage: 50) {
          media(id_in: $ids, type: ANIME) {
            id
            idMal
            coverImage { extraLarge large }
            bannerImage
          }
        }
      }
    `;

    try {
      const response = await fetch(ANILIST_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": SERVER_CONFIG.chromeUserAgent,
        },
        body: JSON.stringify({ query, variables: { ids: missingIds } }),
        signal: AbortSignal.timeout(SERVER_CONFIG.metadataTimeoutMs),
      });

      if (response.ok) {
        const payload = (await response.json()) as {
          data?: {
            Page?: {
              media?: Array<{
                id: number;
                idMal?: number | null;
                coverImage?: { extraLarge?: string | null; large?: string | null };
                bannerImage?: string | null;
              }>;
            };
          };
        };

        const mediaList = payload.data?.Page?.media ?? [];
        for (const m of mediaList) {
          const poster = m.coverImage?.extraLarge ?? m.coverImage?.large ?? undefined;
          const backdrop = m.bannerImage ?? poster;
          enrichedArtworkCache.set(m.id, {
            posterUrl: poster,
            backdropUrl: backdrop,
            expiresAt: now + ARTWORK_CACHE_TTL_MS,
          });
        }
      }
    } catch {
      // Retain existing or cached artwork gracefully if network times out
    }
  }

  // Apply enriched artwork to items
  return items.map((item) => {
    if (!item.anilistId) return item;
    const cached = enrichedArtworkCache.get(item.anilistId);
    if (!cached || (!cached.posterUrl && !cached.backdropUrl)) return item;

    return {
      ...item,
      artwork: {
        ...item.artwork,
        posterUrl: cached.posterUrl ?? item.artwork.posterUrl,
        backdropUrl: cached.backdropUrl ?? item.artwork.backdropUrl,
      },
    };
  });
}

export async function fetchAniListTrending(perPage = 18): Promise<Anime[]> {
  const now = Date.now();
  if (cachedTrending && cachedTrending.expiresAt > now) {
    return cachedTrending.data;
  }

  const query = `
    query ($perPage: Int) {
      Page(page: 1, perPage: $perPage) {
        media(type: ANIME, countryOfOrigin: JP, sort: [TRENDING_DESC, POPULARITY_DESC], isAdult: false) {
          id
          idMal
          countryOfOrigin
          title { romaji english native }
          description(asHtml: false)
          status
          seasonYear
          season
          averageScore
          episodes
          genres
          tags { name isMediaSpoiler }
          coverImage { extraLarge large }
          bannerImage
          studios(isMain: true) {
            nodes { name }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(ANILIST_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": SERVER_CONFIG.chromeUserAgent,
      },
      body: JSON.stringify({ query, variables: { perPage } }),
      signal: AbortSignal.timeout(SERVER_CONFIG.metadataTimeoutMs),
    });

    if (!response.ok) {
      return cachedTrending ? cachedTrending.data : [];
    }

    const payload = (await response.json()) as {
      data?: { Page?: { media?: AniListMedia[] } };
    };
    const mediaList = (payload.data?.Page?.media ?? []).filter(
      (m) => m.countryOfOrigin !== "CN"
    );
    const items = mediaList.map((m, index) => mapAniListMediaToAnime(m, index));

    if (items.length > 0) {
      cachedTrending = { data: items, expiresAt: now + CACHE_TTL_MS };
    }

    return items;
  } catch {
    return cachedTrending ? cachedTrending.data : [];
  }
}

export interface HomeHighlights {
  trending: Anime[];
  recentlyUpdated: Anime[];
  currentSeason: Anime[];
}

let cachedHomeHighlights: { data: HomeHighlights; expiresAt: number } | null = null;
const HOME_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function fetchHomeHighlights(): Promise<HomeHighlights> {
  const now = Date.now();
  if (cachedHomeHighlights && cachedHomeHighlights.expiresAt > now) {
    return cachedHomeHighlights.data;
  }

  const query = `
    query {
      trendingNow: Page(page: 1, perPage: 10) {
        media(type: ANIME, countryOfOrigin: JP, sort: [TRENDING_DESC], isAdult: false) {
          id
          idMal
          countryOfOrigin
          title { romaji english native }
          description(asHtml: false)
          status
          seasonYear
          season
          averageScore
          episodes
          genres
          tags { name isMediaSpoiler }
          coverImage { extraLarge large }
          bannerImage
          studios(isMain: true) {
            nodes { name }
          }
          nextAiringEpisode {
            episode
            airingAt
          }
        }
      }
      recentlyUpdated: Page(page: 1, perPage: 8) {
        media(type: ANIME, countryOfOrigin: JP, status: RELEASING, sort: [UPDATED_AT_DESC, TRENDING_DESC], isAdult: false) {
          id
          idMal
          countryOfOrigin
          title { romaji english native }
          description(asHtml: false)
          status
          seasonYear
          season
          averageScore
          episodes
          genres
          tags { name isMediaSpoiler }
          coverImage { extraLarge large }
          bannerImage
          studios(isMain: true) {
            nodes { name }
          }
          nextAiringEpisode {
            episode
            airingAt
          }
        }
      }
      currentSeason: Page(page: 1, perPage: 12) {
        media(type: ANIME, countryOfOrigin: JP, season: FALL, seasonYear: 2026, sort: [POPULARITY_DESC], isAdult: false) {
          id
          idMal
          countryOfOrigin
          title { romaji english native }
          description(asHtml: false)
          status
          seasonYear
          season
          averageScore
          episodes
          genres
          tags { name isMediaSpoiler }
          coverImage { extraLarge large }
          bannerImage
          studios(isMain: true) {
            nodes { name }
          }
          nextAiringEpisode {
            episode
            airingAt
          }
        }
      }
    }
  `;

  try {
    let response = await fetch(ANILIST_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": SERVER_CONFIG.chromeUserAgent,
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(SERVER_CONFIG.metadataTimeoutMs),
    });

    if (response.status === 429) {
      await new Promise((r) => setTimeout(r, 1000));
      response = await fetch(ANILIST_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": SERVER_CONFIG.chromeUserAgent,
        },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(SERVER_CONFIG.metadataTimeoutMs),
      });
    }

    if (!response.ok) {
      console.warn(`[anilist] fetchHomeHighlights status ${response.status}, falling back to Jikan...`);
      return fetchJikanSeasonNow();
    }

    const payload = (await response.json()) as {
      data?: {
        trendingNow?: { media?: AniListMedia[] };
        recentlyUpdated?: { media?: AniListMedia[] };
        currentSeason?: { media?: AniListMedia[] };
      };
    };

    const trendingRaw = (payload.data?.trendingNow?.media ?? []).filter((m) => m.countryOfOrigin !== "CN");
    const recentRaw = (payload.data?.recentlyUpdated?.media ?? []).filter((m) => m.countryOfOrigin !== "CN");
    const seasonRaw = (payload.data?.currentSeason?.media ?? []).filter((m) => m.countryOfOrigin !== "CN");

    const trending = trendingRaw.map((m, idx) => mapAniListMediaToAnime(m, idx));
    const recentlyUpdated = recentRaw.map((m, idx) => mapAniListMediaToAnime(m, idx));
    const currentSeason = seasonRaw.map((m, idx) => mapAniListMediaToAnime(m, idx));

    if (trending.length === 0 && recentlyUpdated.length === 0) {
      console.warn("[anilist] fetchHomeHighlights empty results, falling back to Jikan...");
      return fetchJikanSeasonNow();
    }

    const result: HomeHighlights = {
      trending,
      recentlyUpdated,
      currentSeason,
    };

    cachedHomeHighlights = { data: result, expiresAt: now + HOME_CACHE_TTL_MS };
    return result;
  } catch (err) {
    console.error("fetchHomeHighlights error, falling back to Jikan:", err);
    return fetchJikanSeasonNow();
  }
}

export async function fetchAniListById(anilistId: number): Promise<Anime | null> {
  const cacheKey = `byId-${anilistId}`;
  const now = Date.now();
  const cached = catalogQueryCache.get(cacheKey);
  if (cached && cached.expiresAt > now && cached.data.items[0]) {
    return cached.data.items[0];
  }

  const query = `
    query ($id: Int) {
      Media(id: $id, isAdult: false) {
        id
        idMal
        countryOfOrigin
        title { romaji english native }
        description(asHtml: false)
        status
        seasonYear
        season
        averageScore
        episodes
        genres
        tags { name isMediaSpoiler }
        coverImage { extraLarge large }
        bannerImage
        studios(isMain: true) {
          nodes { name }
        }
      }
    }
  `;

  try {
    const response = await fetch(ANILIST_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": SERVER_CONFIG.chromeUserAgent,
      },
      body: JSON.stringify({ query, variables: { id: anilistId } }),
      signal: AbortSignal.timeout(SERVER_CONFIG.metadataTimeoutMs),
    });

    if (!response.ok) return null;
    const payload = (await response.json()) as { data?: { Media?: AniListMedia } };
    const media = payload.data?.Media;
    if (!media || media.countryOfOrigin === "CN") return null;

    const anime = mapAniListMediaToAnime(media);
    catalogQueryCache.set(cacheKey, {
      data: {
        items: [anime],
        pageInfo: { total: 1, currentPage: 1, lastPage: 1, hasNextPage: false },
      },
      expiresAt: now + CACHE_TTL_MS,
    });
    return anime;
  } catch {
    return null;
  }
}

// Cache for global archive stats (TTL 1 hour)
let cachedArchiveStats: { total: number; expiresAt: number } | null = null;
const ARCHIVE_STATS_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function getAniListArchiveStats(): Promise<{ total: number }> {
  const now = Date.now();
  if (cachedArchiveStats && cachedArchiveStats.expiresAt > now) {
    return { total: cachedArchiveStats.total };
  }

  const query = `
    query {
      SiteStatistics {
        anime(sort: DATE_DESC, perPage: 1) {
          nodes {
            count
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(ANILIST_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": SERVER_CONFIG.chromeUserAgent,
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(SERVER_CONFIG.metadataTimeoutMs),
    });

    if (response.ok) {
      const payload = (await response.json()) as {
        data?: {
          SiteStatistics?: {
            anime?: {
              nodes?: Array<{ count?: number }>;
            };
          };
        };
      };

      const count = payload.data?.SiteStatistics?.anime?.nodes?.[0]?.count;
      if (typeof count === "number" && count > 0) {
        cachedArchiveStats = { total: count, expiresAt: now + ARCHIVE_STATS_TTL_MS };
        return { total: count };
      }
    }
  } catch {
    // Graceful fallback below
  }

  if (cachedArchiveStats) {
    return { total: cachedArchiveStats.total };
  }

  const fallbackTotal = 22686;
  cachedArchiveStats = { total: fallbackTotal, expiresAt: now + ARCHIVE_STATS_TTL_MS };
  return { total: fallbackTotal };
}

export async function queryAniListCatalog(
  params: AniListQueryParams
): Promise<AniListQueryResult> {
  const rawGenres = [
    ...(params.genres ?? []),
    ...(params.genre ? [params.genre] : []),
  ];
  const uniqueGenres = Array.from(new Set(rawGenres.map((g) => g.trim()).filter(Boolean)));

  // Separate standard AniList genres from Isekai (which AniList models as a Tag)
  const standardGenres = uniqueGenres.filter((g) => g.toLowerCase() !== "isekai");
  const hasIsekai = uniqueGenres.some((g) => g.toLowerCase() === "isekai");

  const page = Math.max(params.page ?? 1, 1);
  const perPage = Math.min(Math.max(params.perPage ?? 50, 1), 50);

  const cacheKey = JSON.stringify({
    search: params.search?.toLowerCase().trim(),
    standardGenres: standardGenres.sort(),
    hasIsekai,
    status: params.status,
    sort: params.sort,
    page,
    perPage,
  });

  const now = Date.now();
  const cached = catalogQueryCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  // Format sort parameter for AniList
  let sortVariable: string[] = ["POPULARITY_DESC"];
  if (params.sort) {
    if (Array.isArray(params.sort)) {
      sortVariable = params.sort;
    } else if (params.sort === "score") {
      sortVariable = ["SCORE_DESC"];
    } else if (params.sort === "year") {
      sortVariable = ["START_DATE_DESC"];
    } else if (params.sort === "title") {
      sortVariable = ["TITLE_ROMAJI"];
    } else {
      sortVariable = [params.sort];
    }
  }

  const query = `
    query ($search: String, $genre_in: [String], $tag_in: [String], $status: MediaStatus, $sort: [MediaSort], $page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          total
          currentPage
          lastPage
          hasNextPage
        }
        media(search: $search, genre_in: $genre_in, tag_in: $tag_in, status: $status, sort: $sort, type: ANIME, countryOfOrigin: JP, isAdult: false) {
          id
          idMal
          countryOfOrigin
          title { romaji english native }
          description(asHtml: false)
          status
          seasonYear
          season
          averageScore
          episodes
          genres
          tags { name isMediaSpoiler }
          coverImage { extraLarge large }
          bannerImage
          studios(isMain: true) {
            nodes { name }
          }
        }
      }
    }
  `;

  try {
    let response = await fetch(ANILIST_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": SERVER_CONFIG.chromeUserAgent,
      },
      body: JSON.stringify({
        query,
        variables: {
          search: params.search?.trim() || undefined,
          genre_in: standardGenres.length > 0 ? standardGenres : undefined,
          tag_in: hasIsekai ? ["Isekai"] : undefined,
          status: params.status?.trim() || undefined,
          sort: sortVariable,
          page,
          perPage,
        },
      }),
      signal: AbortSignal.timeout(SERVER_CONFIG.metadataTimeoutMs),
    });

    if (response.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      response = await fetch(ANILIST_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": SERVER_CONFIG.chromeUserAgent,
        },
        body: JSON.stringify({
          query,
          variables: {
            search: params.search?.trim() || undefined,
            genre_in: standardGenres.length > 0 ? standardGenres : undefined,
            tag_in: hasIsekai ? ["Isekai"] : undefined,
            status: params.status?.trim() || undefined,
            sort: sortVariable,
            page,
            perPage,
          },
        }),
        signal: AbortSignal.timeout(SERVER_CONFIG.metadataTimeoutMs),
      });
    }

    if (!response.ok) {
      return queryJikanCatalog({
        search: params.search,
        page,
        limit: perPage,
        genres: uniqueGenres,
      });
    }

    const payload = (await response.json()) as {
      data?: {
        Page?: {
          pageInfo?: PageInfo;
          media?: AniListMedia[];
        };
      };
    };

    const mediaList = (payload.data?.Page?.media ?? []).filter(
      (m) => m.countryOfOrigin !== "CN"
    );
    let items = mediaList.map((m, index) => mapAniListMediaToAnime(m, index));

    // Fallback to Jikan if AniList returns empty media list on search
    if (items.length === 0 && Boolean(params.search?.trim())) {
      const jikanFallback = await queryJikanCatalog({
        search: params.search,
        page,
        limit: perPage,
        genres: uniqueGenres,
      });
      if (jikanFallback.items.length > 0) {
        return jikanFallback;
      }
    }

    const pageInfo: PageInfo = payload.data?.Page?.pageInfo ?? {
      total: items.length,
      currentPage: page,
      lastPage: page,
      hasNextPage: false,
    };

    const isUnfiltered =
      !params.search?.trim() && uniqueGenres.length === 0 && !params.status?.trim();
    if (isUnfiltered && (pageInfo.total <= 5000 || pageInfo.total === 0)) {
      const stats = await getAniListArchiveStats();
      pageInfo.total = stats.total;
    }

    const result: AniListQueryResult = { items, pageInfo };
    catalogQueryCache.set(cacheKey, { data: result, expiresAt: now + CACHE_TTL_MS });

    return result;
  } catch (err) {
    console.error("queryAniListCatalog catch, falling back to Jikan:", err);
    return queryJikanCatalog({
      search: params.search,
      page,
      limit: perPage,
      genres: uniqueGenres,
    });
  }
}

interface ScrapedEnrichmentCacheEntry {
  enriched: Partial<Anime> | null;
  isChinese: boolean;
  expiresAt: number;
}

const scrapedEnrichmentCache = new Map<string, ScrapedEnrichmentCacheEntry>();
const SCRAPED_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function enrichScrapedItemsWithAniList(items: Anime[]): Promise<Anime[]> {
  const now = Date.now();
  const results: Anime[] = [];
  const candidateItems = items.slice(0, 10);

  for (const item of candidateItems) {
    if (item.countryOfOrigin === "CN") continue;

    const cacheKey = (item.slug || item.id).toLowerCase().trim();
    const cached = scrapedEnrichmentCache.get(cacheKey);

    if (cached && cached.expiresAt > now) {
      if (cached.isChinese) {
        continue;
      }
      if (cached.enriched) {
        results.push({
          ...item,
          ...cached.enriched,
          artwork: {
            ...item.artwork,
            ...(cached.enriched.artwork ?? {}),
          },
        });
        continue;
      }
    }

    const searchQuery = item.title.romaji
      .replace(/\s*(sub\s*indo|episode\s*\d+|batch|season\s*\d+)\b.*$/gi, "")
      .trim();

    const query = `
      query ($search: String) {
        Media(search: $search, type: ANIME, isAdult: false) {
          id
          idMal
          countryOfOrigin
          title { romaji english native }
          averageScore
          genres
          tags { name }
          coverImage { extraLarge large }
          bannerImage
          studios(isMain: true) { nodes { name } }
        }
      }
    `;

    try {
      const response = await fetch(ANILIST_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": SERVER_CONFIG.chromeUserAgent,
        },
        body: JSON.stringify({ query, variables: { search: searchQuery } }),
        signal: AbortSignal.timeout(SERVER_CONFIG.metadataTimeoutMs),
      });

      if (response.status === 429) {
        results.push(item);
        break;
      }

      if (response.ok) {
        const payload = (await response.json()) as {
          data?: {
            Media?: {
              id: number;
              idMal?: number | null;
              countryOfOrigin?: string | null;
              title?: { romaji?: string; english?: string | null; native?: string | null };
              averageScore?: number | null;
              genres?: string[];
              tags?: Array<{ name: string }>;
              coverImage?: { extraLarge?: string | null; large?: string | null };
              bannerImage?: string | null;
              studios?: { nodes?: Array<{ name: string }> };
            };
          };
        };

        const media = payload.data?.Media;
        if (media) {
          if (media.countryOfOrigin === "CN") {
            scrapedEnrichmentCache.set(cacheKey, {
              enriched: null,
              isChinese: true,
              expiresAt: now + SCRAPED_CACHE_TTL_MS,
            });
            continue; // Drop Chinese Donghua
          }

          const poster = media.coverImage?.extraLarge ?? media.coverImage?.large;
          const backdrop = media.bannerImage ?? poster;
          const hasIsekai = media.tags?.some((t) => t.name.toLowerCase() === "isekai");
          const genres = [...(media.genres ?? item.genres)];
          if (hasIsekai && !genres.includes("Isekai")) {
            genres.push("Isekai");
          }

          const enrichedData: Partial<Anime> = {
            anilistId: media.id,
            malId: media.idMal ?? item.malId,
            countryOfOrigin: media.countryOfOrigin ?? "JP",
            score: media.averageScore ? Number((media.averageScore / 10).toFixed(1)) : item.score,
            genres,
            studio: media.studios?.nodes?.[0]?.name ?? item.studio,
            artwork: {
              ...item.artwork,
              posterUrl: poster ?? item.artwork.posterUrl,
              backdropUrl: backdrop ?? item.artwork.backdropUrl,
            },
          };

          scrapedEnrichmentCache.set(cacheKey, {
            enriched: enrichedData,
            isChinese: false,
            expiresAt: now + SCRAPED_CACHE_TTL_MS,
          });

          results.push({
            ...item,
            ...enrichedData,
            artwork: {
              ...item.artwork,
              ...(enrichedData.artwork ?? {}),
            },
          });
          continue;
        }
      }
    } catch {
      // Network timeout: fall through
    }

    scrapedEnrichmentCache.set(cacheKey, {
      enriched: null,
      isChinese: false,
      expiresAt: now + SCRAPED_CACHE_TTL_MS,
    });
    results.push(item);
  }

  return results;
}

// In-memory cache for anime related seasons (TTL 1 hour per anilistId)
const animeSeasonsCache = new Map<number, { seasons: RelatedSeason[]; expiresAt: number }>();
const SEASONS_CACHE_TTL_MS = 60 * 60 * 1000;

export function extractRootFranchiseTitle(rawTitle: string): string {
  if (!rawTitle) return "";
  return rawTitle
    .replace(/\s*:\s*(?:the\s*final\s*season|final\s*season|season\s*\d+|part\s*\d+).*$/gi, "")
    .replace(/\s*(?:the\s*final\s*season|final\s*season|the\s*final|kanketsu-hen|zenpen|kouhen)\b.*$/gi, "")
    .replace(/\s*(?:\d+(?:st|nd|rd|th)\s*season|season\s*\d+|s\d+|part\s*\d+)\b.*$/gi, "")
    .replace(/\s*(?:the\s*movie|gekijouban)\b.*$/gi, "")
    .replace(/\s+(?:II|III|IV|V|VI|VII|VIII|IX|X)\b.*$/gi, "")
    .replace(/\s*(?:sub(?:title)?\s*indo(?:nesia)?|bd|batch|ova|ona)\b.*$/gi, "")
    .trim();
}

export function cleanBaseTitle(title = ""): string {
  return title
    .toLowerCase()
    .replace(
      /\s*(the\s*final\s*season|final\s*season|season\s*\d+|part\s*\d+|2nd\s*season|3rd\s*season|4th\s*season|the\s*movie|gekijouban)\b.*$/gi,
      ""
    )
    .replace(/\s*(sub(?:title)?\s*indo(?:nesia)?|bd|batch|ova|ona|s\d+)\b.*$/gi, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function formatSeasonLabel(
  rawTitle: string,
  index: number,
  total: number,
  format?: string | null
): string {
  const lower = rawTitle.toLowerCase();
  if (lower.includes("the final season") || lower.includes("final season")) {
    if (lower.includes("part 3") || lower.includes("kanketsu-hen")) return "Final Season Part 3";
    if (lower.includes("part 2")) return "Final Season Part 2";
    return "Final Season";
  }
  const seasonPartMatch = lower.match(/season\s*(\d+)\s*part\s*(\d+)/i);
  if (seasonPartMatch) {
    return `Season ${seasonPartMatch[1]} Part ${seasonPartMatch[2]}`;
  }
  const seasonMatch =
    lower.match(/(\d+)(?:st|nd|rd|th)\s*season/i) ||
    lower.match(/(?:season|s)\s*(\d+)/i);
  if (seasonMatch) {
    return `Season ${seasonMatch[1]}`;
  }
  const romanMatch = lower.match(/\b(ii|iii|iv|v|vi|vii|viii|ix|x)\b/i);
  if (romanMatch && romanMatch[1]) {
    const roman = romanMatch[1].toUpperCase();
    const romanToNum: Record<string, number> = {
      II: 2,
      III: 3,
      IV: 4,
      V: 5,
      VI: 6,
      VII: 7,
      VIII: 8,
      IX: 9,
      X: 10,
    };
    if (romanToNum[roman]) {
      return `Season ${romanToNum[roman]}`;
    }
  }
  if (
    format === "MOVIE" ||
    lower.includes("movie") ||
    lower.includes("the movie") ||
    lower.includes("gekijouban") ||
    lower.includes("zenpen") ||
    lower.includes("kouhen") ||
    lower.includes("chronicle")
  ) {
    return "Movie";
  }
  if (index === 0 && total > 1) {
    return "Season 1";
  }
  return `Season ${index + 1}`;
}

export async function fetchAnimeSeasons(anime: Anime): Promise<RelatedSeason[]> {
  const anilistId =
    anime.anilistId ??
    CURATED_ANIME_CATALOG.find((c) => c.id === anime.id || c.slug === anime.slug)?.anilistId;

  const malId =
    anime.malId ??
    CURATED_ANIME_CATALOG.find((c) => c.id === anime.id || c.slug === anime.slug)?.malId ??
    (anime.id.startsWith("mal-")
      ? Number.parseInt(anime.id.replace(/^mal-/, ""), 10)
      : undefined);

  if (!anilistId) {
    if (malId && Number.isFinite(malId)) {
      return fetchJikanSeasons(malId);
    }
    return [];
  }

  const now = Date.now();
  const cached = animeSeasonsCache.get(anilistId);
  if (cached && cached.expiresAt > now) {
    return cached.seasons.map((s) => ({
      ...s,
      isCurrent: s.anilistId === anilistId || s.id === anime.id,
    }));
  }

  const rawTitle = anime.title.romaji || anime.title.english || "";
  const rootFranchise = extractRootFranchiseTitle(rawTitle);
  const baseTitle = cleanBaseTitle(rootFranchise || rawTitle);

  const query = `
    query ($id: Int, $search: String) {
      Media(id: $id, type: ANIME) {
        id
        format
        countryOfOrigin
        seasonYear
        episodes
        title { romaji english }
        coverImage { large extraLarge }
        relations {
          edges {
            relationType
            node {
              id
              type
              format
              countryOfOrigin
              seasonYear
              episodes
              title { romaji english }
              coverImage { large extraLarge }
            }
          }
        }
      }
      Page(page: 1, perPage: 15) {
        media(search: $search, type: ANIME, countryOfOrigin: JP, format_in: [TV, TV_SHORT, MOVIE]) {
          id
          type
          format
          countryOfOrigin
          seasonYear
          episodes
          title { romaji english }
          coverImage { large extraLarge }
        }
      }
    }
  `;

  try {
    const response = await fetch(ANILIST_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": SERVER_CONFIG.chromeUserAgent,
      },
      body: JSON.stringify({
        query,
        variables: { id: anilistId, search: rootFranchise || baseTitle || undefined },
      }),
      signal: AbortSignal.timeout(SERVER_CONFIG.metadataTimeoutMs),
    });

    if (!response.ok) {
      if (malId && Number.isFinite(malId)) {
        return fetchJikanSeasons(malId);
      }
      return [];
    }

    const payload = (await response.json()) as {
      data?: {
        Media?: {
          id: number;
          format?: string | null;
          countryOfOrigin?: string | null;
          seasonYear?: number | null;
          episodes?: number | null;
          title?: { romaji?: string; english?: string | null };
          coverImage?: { large?: string | null; extraLarge?: string | null };
          relations?: {
            edges?: Array<{
              relationType?: string;
              node?: {
                id: number;
                type?: string;
                format?: string | null;
                countryOfOrigin?: string | null;
                seasonYear?: number | null;
                episodes?: number | null;
                title?: { romaji?: string; english?: string | null };
                coverImage?: { large?: string | null; extraLarge?: string | null };
              };
            }>;
          };
        };
        Page?: {
          media?: Array<{
            id: number;
            type?: string;
            format?: string | null;
            countryOfOrigin?: string | null;
            seasonYear?: number | null;
            episodes?: number | null;
            title?: { romaji?: string; english?: string | null };
            coverImage?: { large?: string | null; extraLarge?: string | null };
          }>;
        };
      };
    };

    const targetMedia = payload.data?.Media;
    if (!targetMedia || targetMedia.countryOfOrigin === "CN") {
      return [];
    }

    const candidateMap = new Map<
      number,
      {
        id: number;
        title: string;
        format?: string | null;
        seasonYear?: number;
        episodesCount?: number;
        posterUrl?: string;
      }
    >();

    // 1. Current media node
    candidateMap.set(targetMedia.id, {
      id: targetMedia.id,
      title: targetMedia.title?.romaji || targetMedia.title?.english || anime.title.romaji,
      format: targetMedia.format,
      seasonYear: targetMedia.seasonYear ?? anime.seasonYear,
      episodesCount: targetMedia.episodes ?? anime.episodes.length,
      posterUrl:
        targetMedia.coverImage?.extraLarge ??
        targetMedia.coverImage?.large ??
        anime.artwork.posterUrl,
    });

    // 2. Add relation edges
    const allowedRelations = new Set([
      "PREQUEL",
      "SEQUEL",
      "PARENT",
      "ALTERNATIVE",
      "SIDE_STORY",
    ]);
    const allowedFormats = new Set(["TV", "TV_SHORT", "MOVIE"]);

    const edges = targetMedia.relations?.edges ?? [];
    for (const edge of edges) {
      const node = edge.node;
      if (!node) continue;
      if (node.type !== "ANIME" || !node.format || !allowedFormats.has(node.format)) {
        continue;
      }
      if (node.countryOfOrigin === "CN") continue;
      if (edge.relationType && !allowedRelations.has(edge.relationType)) continue;

      const titleRomaji = node.title?.romaji || "";
      const normNode = cleanBaseTitle(extractRootFranchiseTitle(titleRomaji));
      if (baseTitle && !normNode.includes(baseTitle) && !baseTitle.includes(normNode)) {
        if (edge.relationType !== "PREQUEL" && edge.relationType !== "SEQUEL") continue;
      }

      if (!candidateMap.has(node.id)) {
        candidateMap.set(node.id, {
          id: node.id,
          title: node.title?.romaji || node.title?.english || `Season ${candidateMap.size + 1}`,
          format: node.format,
          seasonYear: node.seasonYear ?? undefined,
          episodesCount: node.episodes ?? undefined,
          posterUrl: node.coverImage?.extraLarge ?? node.coverImage?.large ?? undefined,
        });
      }
    }

    // 3. Add search results matching root franchise title
    const searchMedia = payload.data?.Page?.media ?? [];
    for (const m of searchMedia) {
      if (m.type !== "ANIME" || !m.format || !allowedFormats.has(m.format)) continue;
      if (m.countryOfOrigin === "CN") continue;

      const normTitle = cleanBaseTitle(extractRootFranchiseTitle(m.title?.romaji || ""));
      if (baseTitle && !normTitle.includes(baseTitle) && !baseTitle.includes(normTitle)) {
        continue;
      }

      if (!candidateMap.has(m.id)) {
        candidateMap.set(m.id, {
          id: m.id,
          title: m.title?.romaji || m.title?.english || "",
          format: m.format,
          seasonYear: m.seasonYear ?? undefined,
          episodesCount: m.episodes ?? undefined,
          posterUrl: m.coverImage?.extraLarge ?? m.coverImage?.large ?? undefined,
        });
      }
    }

    // 4. Sort chronologically: by seasonYear ascending, then id ascending
    const sortedCandidates = Array.from(candidateMap.values()).sort(
      (a, b) => (a.seasonYear ?? 0) - (b.seasonYear ?? 0) || a.id - b.id
    );

    // 5. Generate natural season labels and internal IDs
    const total = sortedCandidates.length;
    const finalSeasons: RelatedSeason[] = sortedCandidates.map((c, index) => {
      const curatedMatch = CURATED_ANIME_CATALOG.find(
        (ca) => ca.anilistId === c.id || (ca.id === anime.id && c.id === anilistId)
      );
      const internalId = curatedMatch ? curatedMatch.id : `al-${c.id}`;

      return {
        id: internalId,
        anilistId: c.id,
        title: c.title,
        seasonLabel: formatSeasonLabel(c.title, index, total, c.format),
        seasonYear: c.seasonYear,
        episodesCount: c.episodesCount,
        posterUrl: c.posterUrl,
        isCurrent: c.id === anilistId || internalId === anime.id,
      };
    });

    if (finalSeasons.length === 0 && malId && Number.isFinite(malId)) {
      const jikanSeasons = await fetchJikanSeasons(malId);
      if (jikanSeasons.length > 0) {
        return jikanSeasons;
      }
    }

    animeSeasonsCache.set(anilistId, {
      seasons: finalSeasons,
      expiresAt: now + SEASONS_CACHE_TTL_MS,
    });

    return finalSeasons;
  } catch (err) {
    console.error("fetchAnimeSeasons AniList error, falling back to Jikan:", err);
    if (malId && Number.isFinite(malId)) {
      return fetchJikanSeasons(malId);
    }
    return [];
  }
}
