import type { Anime, Episode } from "../../shared/anime.js";
import { SERVER_CONFIG } from "../config.js";

const ANILIST_ENDPOINT = "https://graphql.anilist.co";

export interface AniListMedia {
  id: number;
  idMal?: number | null;
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
  coverImage?: {
    extraLarge?: string | null;
    large?: string | null;
  };
  bannerImage?: string | null;
  studios?: {
    nodes?: Array<{ name: string }>;
  };
}

const MOTIFS = ["sun", "ridgelines", "waves", "slash"] as const;

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

// In-memory cache for trending anime to stay within AniList rate limits
let cachedTrending: { data: Anime[]; expiresAt: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

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
        media(type: ANIME, sort: [TRENDING_DESC, POPULARITY_DESC], isAdult: false) {
          id
          idMal
          title { romaji english native }
          description(asHtml: false)
          status
          seasonYear
          season
          averageScore
          episodes
          genres
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
    const mediaList = payload.data?.Page?.media ?? [];

    const items = mediaList.map((m, index): Anime => {
      const slug = m.title.romaji
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const id = `al-${m.id}`;
      const posterUrl =
        m.coverImage?.extraLarge ?? m.coverImage?.large ?? undefined;
      const backdropUrl = m.bannerImage ?? posterUrl;

      return {
        id,
        slug: slug || id,
        malId: m.idMal ?? undefined,
        anilistId: m.id,
        sourceProvider: "anilist",
        title: {
          romaji: m.title.romaji,
          english: m.title.english ?? undefined,
          native: m.title.native ?? undefined,
        },
        synopsis: stripHtmlTags(m.description),
        status:
          m.status === "RELEASING" ||
          m.status === "FINISHED" ||
          m.status === "NOT_YET_RELEASED"
            ? m.status
            : "FINISHED",
        seasonYear: m.seasonYear ?? 2026,
        season: m.season ?? "FALL",
        score: m.averageScore ? Number((m.averageScore / 10).toFixed(1)) : 8.5,
        genres: m.genres?.slice(0, 4) ?? ["Action", "Fantasy"],
        studio: m.studios?.nodes?.[0]?.name ?? "Animation Studio",
        artwork: {
          motif: MOTIFS[index % MOTIFS.length] ?? "sun",
          primaryHue: (index * 37) % 360,
          posterUrl,
          backdropUrl,
        },
        episodes: buildPlayableEpisodes(id, m.episodes ?? 12),
      };
    });

    if (items.length > 0) {
      cachedTrending = { data: items, expiresAt: now + CACHE_TTL_MS };
    }

    return items;
  } catch {
    return cachedTrending ? cachedTrending.data : [];
  }
}

export async function queryAniListCatalog(params: {
  search?: string;
  genre?: string;
  page?: number;
  perPage?: number;
}): Promise<AniListMedia[]> {
  const query = `
    query ($search: String, $genre: String, $page: Int = 1, $perPage: Int = 24) {
      Page(page: $page, perPage: $perPage) {
        media(search: $search, genre: $genre, type: ANIME, sort: POPULARITY_DESC) {
          id
          idMal
          title { romaji english native }
          coverImage { extraLarge large }
          bannerImage
          description(asHtml: false)
          averageScore
          episodes
          status
          season
          seasonYear
          genres
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
        variables: {
          search: params.search?.trim() || undefined,
          genre: params.genre?.trim() || undefined,
          page: params.page ?? 1,
          perPage: params.perPage ?? 24,
        },
      }),
      signal: AbortSignal.timeout(SERVER_CONFIG.metadataTimeoutMs),
    });

    if (!response.ok) return [];

    const payload = (await response.json()) as {
      data?: { Page?: { media?: AniListMedia[] } };
    };

    return payload.data?.Page?.media ?? [];
  } catch {
    return [];
  }
}
