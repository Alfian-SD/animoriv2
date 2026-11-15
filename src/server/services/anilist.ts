import { SERVER_CONFIG } from "../config.js";

const ANILIST_ENDPOINT = "https://graphql.anilist.co";

const ANILIST_CATALOG_QUERY = `
  query ($search: String, $genre: String, $page: Int = 1, $perPage: Int = 24) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        total
        currentPage
        lastPage
        hasNextPage
      }
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

export interface AniListMedia {
  id: number;
  idMal?: number;
  title: {
    romaji: string;
    english?: string;
    native?: string;
  };
  coverImage?: {
    extraLarge?: string;
    large?: string;
  };
  bannerImage?: string;
  description?: string;
  averageScore?: number;
  episodes?: number;
  status: string;
  season?: string;
  seasonYear?: number;
  genres: string[];
}

export async function queryAniListCatalog(params: {
  search?: string;
  genre?: string;
  page?: number;
  perPage?: number;
}): Promise<AniListMedia[]> {
  try {
    const response = await fetch(ANILIST_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": SERVER_CONFIG.chromeUserAgent,
      },
      body: JSON.stringify({
        query: ANILIST_CATALOG_QUERY,
        variables: {
          search: params.search?.trim() || undefined,
          genre: params.genre?.trim() || undefined,
          page: params.page ?? 1,
          perPage: params.perPage ?? 24,
        },
      }),
      signal: AbortSignal.timeout(SERVER_CONFIG.metadataTimeoutMs),
    });

    if (response.status === 429) {
      console.warn("[AniList] Rate limited (429)");
      return [];
    }

    if (!response.ok) {
      console.warn(`[AniList] HTTP error: ${response.status}`);
      return [];
    }

    const payload = (await response.json()) as {
      errors?: Array<{ message: string }>;
      data?: { Page?: { media?: AniListMedia[] } };
    };

    if (payload.errors && payload.errors.length > 0) {
      console.warn("[AniList] GraphQL errors:", payload.errors[0]?.message);
      return [];
    }

    return payload.data?.Page?.media ?? [];
  } catch (err) {
    console.warn("[AniList] Network failure:", err instanceof Error ? err.message : String(err));
    return [];
  }
}
