import { Router, type Request, type Response } from "express";
import type { Anime } from "../../shared/anime.js";
import { CatalogAggregator } from "../services/aggregator.js";
import { CURATED_ANIME_CATALOG } from "../providers/curatedProvider.js";
import {
  OtakudesuProvider,
  NimegamiProvider,
  ExternalHtmlScraperProvider,
} from "../providers/externalProvider.js";
import { isSafeAllowedStreamUrl } from "../security/ssrfGuard.js";
import { fetchAniSkipIntervals } from "../services/aniskip.js";
import {
  fetchAniListTrending,
  fetchAniListById,
  enrichCatalogArtwork,
  queryAniListCatalog,
  getAniListArchiveStats,
  fetchAnimeSeasons,
} from "../services/anilist.js";
import { resolveEpisodeStreams } from "../services/streamResolver.js";

export const catalogRouter = Router();
export const aggregator = new CatalogAggregator();

// Register dual scraper providers: Otakudesu & Nimegami
const otakudesuUrl = process.env.OTAKUDESU_URL || "https://otakudesu.blog";
if (isSafeAllowedStreamUrl(otakudesuUrl)) {
  aggregator.registerProvider(new OtakudesuProvider(otakudesuUrl));
}

const nimegamiUrl = process.env.NIMEGAMI_URL || "https://nimegami.id";
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

// GET /api/catalog/episodes/:episodeId/skip-times
catalogRouter.get("/episodes/:episodeId/skip-times", async (req: Request, res: Response) => {
  const rawEpisodeId = req.params.episodeId;
  const episodeId = (Array.isArray(rawEpisodeId) ? rawEpisodeId[0] : rawEpisodeId) ?? "";

  const allItems = await getUnifiedCatalog();
  const targetAnime = allItems.find((a) =>
    a.episodes.some((ep) => ep.id === episodeId)
  );

  const episode = targetAnime?.episodes.find((ep) => ep.id === episodeId);
  if (!episode || !targetAnime) {
    res.status(404).json({ ok: false, error: "Episode not found" });
    return;
  }

  const malId = targetAnime.malId ?? 1;
  const skipIntervals = await fetchAniSkipIntervals(malId, episode.number);

  res.json({
    ok: true,
    episodeId,
    malId,
    episodeNumber: episode.number,
    skipIntervals,
  });
});

// GET /api/catalog/:idOrSlug/episodes/:episodeId/mirrors
catalogRouter.get("/:idOrSlug/episodes/:episodeId/mirrors", async (req: Request, res: Response) => {
  const rawId = req.params.idOrSlug;
  const rawEpisodeId = req.params.episodeId;
  const idOrSlug = (Array.isArray(rawId) ? rawId[0] : rawId) ?? "";
  const episodeId = (Array.isArray(rawEpisodeId) ? rawEpisodeId[0] : rawEpisodeId) ?? "";

  const route = aggregator.resolveRoute(idOrSlug);
  const allItems = await getUnifiedCatalog();

  const anime = allItems.find(
    (a) => a.id === idOrSlug || a.slug === idOrSlug || (route && a.id === route.animeId)
  );

  if (!anime) {
    res.status(404).json({ ok: false, error: "Anime not found" });
    return;
  }

  const episode = anime.episodes.find((ep) => ep.id === episodeId || String(ep.number) === episodeId);
  if (!episode) {
    res.status(404).json({ ok: false, error: "Episode not found" });
    return;
  }

  let mirrors = episode.playbackOptions;

  // Resolve episode streams dynamically across multi-sources (ylnime -> otakudesu -> nimegami)
  const resolved = await resolveEpisodeStreams({
    animeTitle: anime.title.romaji,
    animeRomaji: anime.title.romaji,
    animeEnglish: anime.title.english,
    slug: anime.slug,
    episodeNumber: episode.number,
  });

  if (resolved.length > 0) {
    mirrors = resolved;
  } else if (anime.sourceProvider !== "curated") {
    // Fallback to provider instance if available
    const provider = aggregator.getProvider(anime.sourceProvider);
    if (provider) {
      const episodeUrl =
        episode.playbackOptions[0]?.streamUrl ||
        (process.env.EXTERNAL_SCRAPER_URL
          ? `${process.env.EXTERNAL_SCRAPER_URL.replace(/\/+$/, "")}/${anime.slug}-episode-${episode.number}/`
          : "");

      if (episodeUrl && isSafeAllowedStreamUrl(episodeUrl)) {
        const dynamicMirrors = await provider.resolveEpisodeMirrors(episodeUrl);
        if (dynamicMirrors.length > 0) {
          mirrors = dynamicMirrors;
        }
      }
    }
  }

  // Strict anonymization: always "Server 1", "Server 2", "Server 3"
  const anonymizedMirrors = mirrors.map((m, idx) => ({
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
  const route = aggregator.resolveRoute(idOrSlug);

  const allItems = await getUnifiedCatalog();
  let found = allItems.find(
    (a) => a.id === idOrSlug || a.slug === idOrSlug || (route && a.id === route.animeId)
  );

  // If not found in local cache and ID starts with al- (e.g. al-151847), fetch dynamically from AniList
  if (!found && idOrSlug.startsWith("al-")) {
    const anilistId = Number.parseInt(idOrSlug.replace(/^al-/, ""), 10);
    if (Number.isFinite(anilistId) && anilistId > 0) {
      const directAnime = await fetchAniListById(anilistId);
      if (directAnime) {
        aggregator.registerCatalog([directAnime]);
        found = directAnime;
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
