import { Router, type Request, type Response } from "express";
import { CatalogAggregator } from "../services/aggregator.js";
import { CURATED_ANIME_CATALOG } from "../providers/curatedProvider.js";
import { ExternalHtmlScraperProvider } from "../providers/externalProvider.js";
import { isSafeAllowedStreamUrl } from "../security/ssrfGuard.js";
import { fetchAniSkipIntervals } from "../services/aniskip.js";
import { fetchAniListTrending, enrichCatalogArtwork, queryAniListCatalog } from "../services/anilist.js";

export const catalogRouter = Router();
export const aggregator = new CatalogAggregator();

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

// GET /api/catalog (or /api/anime)
catalogRouter.get("/", async (req: Request, res: Response) => {
  const search = typeof req.query.search === "string" ? req.query.search.toLowerCase().trim() : "";
  const genre = typeof req.query.genre === "string" ? req.query.genre.trim() : "";
  const status = typeof req.query.status === "string" ? req.query.status.toUpperCase().trim() : "";
  const season = typeof req.query.season === "string" ? req.query.season.toUpperCase().trim() : "";
  const sort = typeof req.query.sort === "string" ? req.query.sort : "score";
  const forceRefresh = req.query.refresh === "true";

  // Sync multi-source providers
  const allItems = await getUnifiedCatalog(forceRefresh);
  let items = [...allItems];

  if (search) {
    items = items.filter(
      (a) =>
        a.title.romaji.toLowerCase().includes(search) ||
        a.title.english?.toLowerCase().includes(search) ||
        a.synopsis.toLowerCase().includes(search)
    );
  }

  if (genre) {
    items = items.filter((a) => a.genres.some((g) => g.toLowerCase() === genre.toLowerCase()));
  }

  if (status) {
    items = items.filter((a) => a.status === status);
  }

  if (season) {
    items = items.filter((a) => a.season === season);
  }

  if (sort === "score") {
    items.sort((a, b) => b.score - a.score);
  } else if (sort === "year") {
    items.sort((a, b) => b.seasonYear - a.seasonYear);
  } else if (sort === "title") {
    items.sort((a, b) => a.title.romaji.localeCompare(b.title.romaji));
  }

  res.json({
    ok: true,
    total: items.length,
    items,
  });
});

// GET /api/catalog/search-anilist
catalogRouter.get("/search-anilist", async (req: Request, res: Response) => {
  const search = typeof req.query.q === "string" ? req.query.q : "";
  const genre = typeof req.query.genre === "string" ? req.query.genre : "";

  const results = await queryAniListCatalog({ search, genre });
  res.json({
    ok: true,
    total: results.length,
    results,
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

  // Resolve external mirrors dynamically if applicable
  if (anime.sourceProvider !== "curated") {
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

  res.json({
    ok: true,
    animeId: anime.id,
    episodeId: episode.id,
    episodeNumber: episode.number,
    mirrors,
  });
});

// GET /api/catalog/:idOrSlug (or /api/anime/:idOrSlug)
catalogRouter.get("/:idOrSlug", async (req: Request, res: Response) => {
  const rawId = req.params.idOrSlug;
  const idOrSlug = (Array.isArray(rawId) ? rawId[0] : rawId) ?? "";
  const route = aggregator.resolveRoute(idOrSlug);

  const allItems = await getUnifiedCatalog();
  const found = allItems.find(
    (a) => a.id === idOrSlug || a.slug === idOrSlug || (route && a.id === route.animeId)
  );

  if (!found) {
    res.status(404).json({ ok: false, error: "Anime not found" });
    return;
  }

  res.json({ ok: true, anime: found });
});
