import { Router, type Request, type Response } from "express";
import { CatalogAggregator } from "../services/aggregator.js";
import { CURATED_ANIME_CATALOG } from "../providers/curatedProvider.js";
import { fetchAniSkipIntervals } from "../services/aniskip.js";
import { queryAniListCatalog } from "../services/anilist.js";

export const catalogRouter = Router();
export const aggregator = new CatalogAggregator();

// Register initial curated catalog
aggregator.registerCatalog(CURATED_ANIME_CATALOG);

// GET /api/catalog
catalogRouter.get("/", async (req: Request, res: Response) => {
  const search = typeof req.query.search === "string" ? req.query.search.toLowerCase().trim() : "";
  const genre = typeof req.query.genre === "string" ? req.query.genre.trim() : "";
  const status = typeof req.query.status === "string" ? req.query.status.toUpperCase().trim() : "";
  const season = typeof req.query.season === "string" ? req.query.season.toUpperCase().trim() : "";
  const sort = typeof req.query.sort === "string" ? req.query.sort : "score";

  let items = [...CURATED_ANIME_CATALOG];

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

// GET /api/catalog/:idOrSlug
catalogRouter.get("/:idOrSlug", (req: Request, res: Response) => {
  const rawId = req.params.idOrSlug;
  const idOrSlug = (Array.isArray(rawId) ? rawId[0] : rawId) ?? "";
  const route = aggregator.resolveRoute(idOrSlug);

  const found = CURATED_ANIME_CATALOG.find(
    (a) => a.id === idOrSlug || a.slug === idOrSlug || (route && a.id === route.animeId)
  );

  if (!found) {
    res.status(404).json({ ok: false, error: "Anime not found" });
    return;
  }

  res.json({ ok: true, anime: found });
});

// GET /api/catalog/episodes/:episodeId/skip-times
catalogRouter.get("/episodes/:episodeId/skip-times", async (req: Request, res: Response) => {
  const rawEpisodeId = req.params.episodeId;
  const episodeId = (Array.isArray(rawEpisodeId) ? rawEpisodeId[0] : rawEpisodeId) ?? "";

  let targetAnime = CURATED_ANIME_CATALOG.find((a) =>
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
