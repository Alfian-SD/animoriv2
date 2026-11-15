import { Router, type Request, type Response } from "express";
import type { Anime } from "../../shared/anime.js";
import { CatalogAggregator } from "../services/aggregator.js";
import { CURATED_ANIME_CATALOG } from "../providers/curatedProvider.js";
import {
  OtakudesuProvider,
  NimegamiProvider,
  DoronimeProvider,
  ExternalHtmlScraperProvider,
  isChineseDonghua,
} from "../providers/externalProvider.js";
import { SERVER_CONFIG } from "../config.js";
import { isSafeAllowedStreamUrl } from "../security/ssrfGuard.js";
import { fetchAniSkipIntervals } from "../services/aniskip.js";
import {
  fetchAniListTrending,
  fetchAniListById,
  enrichCatalogArtwork,
  queryAniListCatalog,
  getAniListArchiveStats,
  fetchAnimeSeasons,
  fetchHomeHighlights,
  buildPlayableEpisodes,
} from "../services/anilist.js";
import { fetchJikanById } from "../services/jikan.js";
import { resolveEpisodeStreams } from "../services/streamResolver.js";

export const catalogRouter = Router();
export const aggregator = new CatalogAggregator();

// Register scraper providers: Doronime (me & id), Otakudesu, Nimegami
const doronimeMeUrl = SERVER_CONFIG.doronimeMeUrl;
if (isSafeAllowedStreamUrl(doronimeMeUrl)) {
  aggregator.registerProvider(new DoronimeProvider("doronime-me", doronimeMeUrl));
}

const doronimeIdUrl = SERVER_CONFIG.doronimeIdUrl;
if (isSafeAllowedStreamUrl(doronimeIdUrl)) {
  aggregator.registerProvider(new DoronimeProvider("doronime-id", doronimeIdUrl));
}

const otakudesuUrl = process.env.OTAKUDESU_URL || SERVER_CONFIG.otakudesuUrl;
if (isSafeAllowedStreamUrl(otakudesuUrl)) {
  aggregator.registerProvider(new OtakudesuProvider(otakudesuUrl));
}

const nimegamiUrl = process.env.NIMEGAMI_URL || SERVER_CONFIG.nimegamiUrl;
if (isSafeAllowedStreamUrl(nimegamiUrl)) {
  aggregator.registerProvider(new NimegamiProvider(nimegamiUrl));
}

// Register external scraper conditionally if provided and safe
const externalScraperUrl = process.env.EXTERNAL_SCRAPER_URL;
if (externalScraperUrl && isSafeAllowedStreamUrl(externalScraperUrl)) {
  aggregator.registerProvider(new ExternalHtmlScraperProvider("external", externalScraperUrl));
}

// Initial sync with curated catalog
aggregator.registerCatalog(CURATED_ANIME_CATALOG);

// Helper to get all combined catalog items with AniList trending enrichment and batch artwork validation
async function getUnifiedCatalog(forceRefresh = false) {
  const [enrichedCurated, anilistItems] = await Promise.all([
    enrichCatalogArtwork(CURATED_ANIME_CATALOG),
    fetchAniListTrending(18),
  ]);
  return aggregator.syncAllProviders([...enrichedCurated, ...anilistItems], forceRefresh);
}

// GET /api/catalog/stats
catalogRouter.get("/stats", async (_req: Request, res: Response) => {
  const stats = await getAniListArchiveStats();
  res.json({
    ok: true,
    archiveTotal: stats.total,
  });
});

// GET /api/catalog/home (Real-time trending, recently updated, and current season)
catalogRouter.get("/home", async (_req: Request, res: Response) => {
  const highlights = await fetchHomeHighlights();

  // Collect external scraper items from Otakudesu / Nimegami for latest episode updates
  let externalRecent: Anime[] = [];
  const providers = aggregator.getProviders();
  if (providers.length > 0) {
    const settled = await Promise.allSettled(providers.map((p) => p.fetchCatalog()));
    for (const res of settled) {
      if (res.status === "fulfilled" && Array.isArray(res.value)) {
        externalRecent.push(...res.value);
      }
    }
  }

  // Filter anti-donghua on external items
  externalRecent = externalRecent.filter(
    (item) =>
      item.countryOfOrigin !== "CN" &&
      !isChineseDonghua(item.title.romaji, item.genres) &&
      !isChineseDonghua(item.title.english ?? "", item.genres)
  );

  // Register live items to aggregator so routes and playback are instantly available
  aggregator.registerCatalog([
    ...highlights.trending,
    ...highlights.recentlyUpdated,
    ...highlights.currentSeason,
    ...externalRecent,
  ]);

  // Combine recentlyUpdated: prepend external recent releases
  // IMPORTANT: Do NOT inject CURATED_ANIME classics into trending or recentlyUpdated
  const combinedRecentlyUpdated = [
    ...externalRecent.slice(0, 4),
    ...highlights.recentlyUpdated,
  ].slice(0, 8);

  res.json({
    ok: true,
    trending: highlights.trending,
    recentlyUpdated: combinedRecentlyUpdated,
    currentSeason: highlights.currentSeason,
  });
});

// GET /api/catalog (or /api/anime)
catalogRouter.get("/", async (req: Request, res: Response) => {
  const search = typeof req.query.search === "string" ? req.query.search.toLowerCase().trim() : "";
  const status = typeof req.query.status === "string" ? req.query.status.toUpperCase().trim() : "";
  const season = typeof req.query.season === "string" ? req.query.season.toUpperCase().trim() : "";
  const sort = typeof req.query.sort === "string" ? req.query.sort : "score";

  const rawGenres =
    typeof req.query.genres === "string"
      ? req.query.genres
      : typeof req.query.genre === "string"
        ? req.query.genre
        : "";
  const selectedGenres = rawGenres
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);

  const page = Math.max(Number.parseInt(String(req.query.page ?? "1"), 10) || 1, 1);
  const perPage = Math.min(
    Math.max(Number.parseInt(String(req.query.perPage ?? "50"), 10) || 50, 1),
    50
  );

  // Dynamic AniList query with Isekai MediaTag & pagination support
  const [anilistResult, archiveStats] = await Promise.all([
    queryAniListCatalog({
      search: search || undefined,
      genres: selectedGenres,
      status: status || undefined,
      sort,
      page,
      perPage,
    }),
    getAniListArchiveStats(),
  ]);

  // On page 1 or when filtering, also evaluate curated catalog for fast offline-safe matching
  const enrichedCurated = await enrichCatalogArtwork(CURATED_ANIME_CATALOG);
  let curatedCandidates = [...enrichedCurated];

  if (search) {
    curatedCandidates = curatedCandidates.filter(
      (a) =>
        a.title.romaji.toLowerCase().includes(search) ||
        a.title.english?.toLowerCase().includes(search) ||
        a.synopsis.toLowerCase().includes(search)
    );
  }

  if (status) {
    curatedCandidates = curatedCandidates.filter((a) => a.status === status);
  }

  if (season) {
    curatedCandidates = curatedCandidates.filter((a) => a.season === season);
  }

  // Collect external scraper items on page 1 for complementary catalog enrichment
  let externalCandidates: Anime[] = [];
  if (page === 1 && !search && selectedGenres.length === 0) {
    const providers = aggregator.getProviders();
    if (providers.length > 0) {
      const settled = await Promise.allSettled(providers.map((p) => p.fetchCatalog()));
      for (const res of settled) {
        if (res.status === "fulfilled" && Array.isArray(res.value)) {
          externalCandidates.push(...res.value);
        }
      }
    }
  }

  // Merge curated, external scraper candidates, and AniList results
  const basePool =
    page === 1
      ? [...curatedCandidates, ...externalCandidates, ...anilistResult.items]
      : anilistResult.items;
  const deduplicatedItems = aggregator.registerCatalog(basePool);
  let items = [...deduplicatedItems];

  // Apply Strict Multi-Genre AND (Irisan) Filter: every requested genre must be present
  if (selectedGenres.length > 0) {
    items = items.filter((anime) =>
      selectedGenres.every((targetGenre) =>
        anime.genres.some((ag) => ag.toLowerCase() === targetGenre.toLowerCase())
      )
    );
  }

  // Sort
  if (sort === "score") {
    items.sort((a, b) => b.score - a.score);
  } else if (sort === "year") {
    items.sort((a, b) => b.seasonYear - a.seasonYear);
  } else if (sort === "title") {
    items.sort((a, b) => a.title.romaji.localeCompare(b.title.romaji));
  }

  const effectiveTotal = Math.max(items.length, anilistResult.pageInfo.total);

  res.json({
    ok: true,
    total: effectiveTotal,
    archiveTotal: archiveStats.total,
    pageInfo: {
      ...anilistResult.pageInfo,
      total: effectiveTotal,
      currentPage: page,
    },
    items,
  });
});

// GET /api/catalog/search-anilist
catalogRouter.get("/search-anilist", async (req: Request, res: Response) => {
  const search = typeof req.query.q === "string" ? req.query.q : "";
  const genre = typeof req.query.genre === "string" ? req.query.genre : "";

  const { items, pageInfo } = await queryAniListCatalog({ search, genre });
  res.json({
    ok: true,
    total: items.length,
    pageInfo,
    results: items,
  });
});

/**
 * Resolusi entitas Anime secara terpadu: cek cache aggregator, curated, atau fetch dinamis (al-* / mal-*)
 */
export async function resolveAnimeEntity(idOrSlug: string): Promise<Anime | null> {
  if (!idOrSlug) return null;
  const route = aggregator.resolveRoute(idOrSlug);
  const allItems = await getUnifiedCatalog();

  let found = allItems.find(
    (a) => a.id === idOrSlug || a.slug === idOrSlug || (route && a.id === route.animeId)
  );

  // Jika belum ada di memory cache dan diawali al- (contoh: al-159518), fetch dinamis dari AniList
  if (!found && idOrSlug.startsWith("al-")) {
    const anilistId = Number.parseInt(idOrSlug.replace(/^al-/, ""), 10);
    if (Number.isFinite(anilistId) && anilistId > 0) {
      const directAnime = await fetchAniListById(anilistId);
      if (directAnime) {
        aggregator.registerCatalog([directAnime]);
        found = directAnime;
      } else {
        const fallbackAnime: Anime = {
          id: idOrSlug,
          slug: idOrSlug,
          sourceProvider: "anilist",
          anilistId,
          title: {
            romaji: `Anime #${anilistId}`,
            english: `Anime #${anilistId}`,
            native: "",
          },
          synopsis: "Stream provided via dynamic anime resolution.",
          genres: ["Action"],
          countryOfOrigin: "JP",
          status: "RELEASING",
          seasonYear: 2026,
          season: "FALL",
          score: 8.5,
          studio: "Animation Studio",
          episodes: buildPlayableEpisodes(idOrSlug, 12),
          artwork: {
            motif: "sun",
            primaryHue: 200,
            posterUrl: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80",
            backdropUrl: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1200&auto=format&fit=crop&q=80",
          },
        };
        aggregator.registerCatalog([fallbackAnime]);
        found = fallbackAnime;
      }
    }
  }

  // Jika diawali mal-, fetch dinamis dari Jikan
  if (!found && idOrSlug.startsWith("mal-")) {
    const malId = Number.parseInt(idOrSlug.replace(/^mal-/, ""), 10);
    if (Number.isFinite(malId) && malId > 0) {
      const directAnime = await fetchJikanById(malId);
      if (directAnime) {
        aggregator.registerCatalog([directAnime]);
        found = directAnime;
      } else {
        const fallbackAnime: Anime = {
          id: idOrSlug,
          slug: idOrSlug,
          sourceProvider: "jikan",
          malId,
          title: {
            romaji: `Anime #${malId}`,
            english: `Anime #${malId}`,
            native: "",
          },
          synopsis: "Stream provided via dynamic anime resolution.",
          genres: ["Action"],
          countryOfOrigin: "JP",
          status: "RELEASING",
          seasonYear: 2026,
          season: "FALL",
          score: 8.5,
          studio: "Animation Studio",
          episodes: buildPlayableEpisodes(idOrSlug, 12),
          artwork: {
            motif: "sun",
            primaryHue: 200,
            posterUrl: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80",
            backdropUrl: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1200&auto=format&fit=crop&q=80",
          },
        };
        aggregator.registerCatalog([fallbackAnime]);
        found = fallbackAnime;
      }
    }
  }

  return found ?? null;
}

/**
 * Handler terpusat untuk AniSkip (skip-times)
 * Mengembalikan HTTP 200 OK dengan interval kosong jika data tidak ditemukan (anti-404 / no red errors)
 */
export async function handleSkipTimes(req: Request, res: Response): Promise<void> {
  const rawEpisodeId = req.params.episodeId;
  const rawIdOrSlug = req.params.idOrSlug;
  const episodeId = (Array.isArray(rawEpisodeId) ? rawEpisodeId[0] : rawEpisodeId) ?? "";
  const idOrSlug = (Array.isArray(rawIdOrSlug) ? rawIdOrSlug[0] : rawIdOrSlug) ?? "";

  let animeId = idOrSlug;
  let episodeNumber = 1;

  // Parse pola: ^(al-\d+|mal-\d+|[a-z0-9-]+)-ep-(\d+)$
  const match = episodeId.match(/^(al-\d+|mal-\d+|[a-z0-9-]+)-ep-(\d+)$/i);
  if (match) {
    if (!animeId) animeId = match[1] ?? "";
    episodeNumber = Number.parseInt(match[2] ?? "1", 10);
  } else {
    const numMatch = episodeId.match(/(?:ep-|-episode-|\be\b|\bep\b)(\d+)$/i) || episodeId.match(/(\d+)$/);
    if (numMatch) {
      episodeNumber = Number.parseInt(numMatch[1] ?? "1", 10);
    }
  }

  let malId: number | undefined;

  // 1. Coba resolusi entitas anime
  const targetAnime = await resolveAnimeEntity(animeId || episodeId);
  if (targetAnime) {
    malId = targetAnime.malId;
    if (targetAnime.episodes.length > 0 && !match) {
      const ep = targetAnime.episodes.find((e) => e.id === episodeId || String(e.number) === episodeId);
      if (ep) {
        episodeNumber = ep.number;
      }
    }
  }

  // 2. Jika malId belum ada dan animeId berawalan al-, ambil dari AniList
  if (!malId && animeId.startsWith("al-")) {
    const anilistId = Number.parseInt(animeId.replace(/^al-/, ""), 10);
    if (Number.isFinite(anilistId) && anilistId > 0) {
      const aniMedia = await fetchAniListById(anilistId);
      if (aniMedia) {
        malId = aniMedia.malId;
      }
    }
  } else if (!malId && animeId.startsWith("mal-")) {
    malId = Number.parseInt(animeId.replace(/^mal-/, ""), 10);
  }

  // 3. Panggil AniSkip jika malId ditemukan
  if (malId && Number.isFinite(malId) && malId > 0) {
    try {
      const skipIntervals = await fetchAniSkipIntervals(malId, episodeNumber);
      res.json({
        ok: true,
        found: skipIntervals.length > 0,
        episodeId,
        malId,
        episodeNumber,
        skipIntervals,
        intervals: skipIntervals,
        results: skipIntervals,
      });
      return;
    } catch {
      // Fallback ke respons 200 aman
    }
  }

  // Wajib kembalikan status 200 OK (jangan 404) agar tidak memunculkan error merah di console
  res.json({
    ok: true,
    found: false,
    episodeId,
    malId: malId ?? null,
    episodeNumber,
    skipIntervals: [],
    intervals: [],
    results: [],
  });
}

// Daftarkan rute AniSkip di catalogRouter
catalogRouter.get("/episodes/:episodeId/skip-times", handleSkipTimes);
catalogRouter.get("/:idOrSlug/episodes/:episodeId/skip-times", handleSkipTimes);

// GET /api/catalog/:idOrSlug/episodes/:episodeId/mirrors
catalogRouter.get("/:idOrSlug/episodes/:episodeId/mirrors", async (req: Request, res: Response) => {
  const rawId = req.params.idOrSlug;
  const rawEpisodeId = req.params.episodeId;
  const idOrSlug = (Array.isArray(rawId) ? rawId[0] : rawId) ?? "";
  const episodeId = (Array.isArray(rawEpisodeId) ? rawEpisodeId[0] : rawEpisodeId) ?? "";

  const anime = await resolveAnimeEntity(idOrSlug);
  if (!anime) {
    res.status(404).json({ ok: false, error: "Anime not found" });
    return;
  }

  let episode = anime.episodes.find((ep) => ep.id === episodeId || String(ep.number) === episodeId);

  // Jika episode belum terdaftar di array anime.episodes, ekstrak nomor episode dari ID
  if (!episode) {
    const match =
      episodeId.match(/(?:ep-|-episode-|\be\b|\bep\b)(\d+)$/i) ||
      episodeId.match(/(\d+)$/);

    if (match) {
      const epNum = Number.parseInt(match[1] ?? "1", 10);
      episode = {
        id: episodeId,
        animeId: anime.id,
        number: epNum,
        title: `Episode ${epNum}`,
        durationMinutes: 24,
        playbackOptions: [],
      };
    }
  }

  if (!episode) {
    res.status(404).json({ ok: false, error: "Episode not found" });
    return;
  }

  let mirrors = episode.playbackOptions ?? [];
  const refresh = req.query.refresh === "true" || req.query.refresh === "1";

  // Resolve episode streams dynamically across multi-sources (ylnime -> otakudesu -> nimegami)
  const resolved = await resolveEpisodeStreams({
    animeTitle: anime.title.romaji,
    animeRomaji: anime.title.romaji,
    animeEnglish: anime.title.english,
    slug: anime.slug,
    episodeNumber: episode.number,
    refresh,
  });

  if (resolved.length > 0) {
    mirrors = resolved;
  } else if (anime.sourceProvider !== "curated" && anime.sourceProvider !== "anilist") {
    // Fallback to provider instance if available
    const provider = aggregator.getProvider(anime.sourceProvider);
    if (provider) {
      const episodeUrl =
        episode.playbackOptions[0]?.streamUrl ||
        (process.env.EXTERNAL_SCRAPER_URL
          ? `${process.env.EXTERNAL_SCRAPER_URL.replace(/\/+$/, "")}/${anime.slug}-episode-${episode.number}/`
          : "");

      if (episodeUrl && isSafeAllowedStreamUrl(episodeUrl)) {
        const dynamicMirrors = await provider.resolveEpisodeMirrors(episodeUrl, refresh);
        if (dynamicMirrors.length > 0) {
          mirrors = dynamicMirrors;
        }
      }
    }
  }

  // Strict anonymization: always "Server 1", "Server 2", "Server 3"
  const anonymizedMirrors = (mirrors ?? []).map((m, idx) => ({
    ...m,
    serverName: `Server ${idx + 1}`,
  }));

  res.json({
    ok: true,
    animeId: anime.id,
    episodeId: episode.id,
    episodeNumber: episode.number,
    mirrors: anonymizedMirrors,
  });
});

// GET /api/catalog/:idOrSlug (or /api/anime/:idOrSlug)
catalogRouter.get("/:idOrSlug", async (req: Request, res: Response) => {
  const rawId = req.params.idOrSlug;
  const idOrSlug = (Array.isArray(rawId) ? rawId[0] : rawId) ?? "";

  let found = await resolveAnimeEntity(idOrSlug);

  // Resolusi slug saat refresh (GET /api/anime/:idOrSlug):
  // Jika belum ada di memori, cari via AniList dengan keyword dari slug
  if (!found) {
    const keyword = idOrSlug.replace(/-/g, " ").trim();
    if (keyword.length > 0) {
      try {
        const { items } = await queryAniListCatalog({ search: keyword, perPage: 5 });
        if (items && items.length > 0) {
          aggregator.registerCatalog(items);
          const match = items.find((a) => a.slug === idOrSlug || a.id === idOrSlug) || items[0];
          if (match) {
            found = match;
          }
        }
      } catch (err) {
        console.warn("Failed to resolve slug via AniList search:", err);
      }
    }
  }

  if (!found) {
    res.status(404).json({ ok: false, error: "Anime not found" });
    return;
  }

  // Populate related seasons if not already present
  if (!found.seasons || found.seasons.length === 0) {
    const seasons = await fetchAnimeSeasons(found);
    if (seasons.length > 0) {
      found = { ...found, seasons };
    }
  }

  res.json({ ok: true, anime: found });
});
