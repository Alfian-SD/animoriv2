import { describe, it, expect } from "vitest";
import { CatalogAggregator, normalizeTitle } from "../src/server/services/aggregator.js";
import type { Anime } from "../src/shared/anime.js";

describe("CatalogAggregator & Title Normalization", () => {
  it("normalizes titles by removing subtitle tags and punctuation", () => {
    expect(normalizeTitle("Kurogane Meridian Sub Indo")).toBe("kurogane meridian");
    expect(normalizeTitle("Glass Kyoto: 2099 Subtitle Indonesia [BD]")).toBe("glass kyoto 2099");
    expect(normalizeTitle("Ash & Cipher Season 2 Batch")).toBe("ash cipher");
    expect(normalizeTitle("Solstice Express (OVA)")).toBe("solstice express");
  });

  it("registers anime and enables O(1) route resolution by ID and slug", () => {
    const aggregator = new CatalogAggregator();

    const sampleAnime: Anime = {
      id: "sample-anime-01",
      slug: "sample-anime",
      sourceProvider: "curated",
      title: { romaji: "Sample Anime" },
      synopsis: "Test synopsis",
      status: "RELEASING",
      seasonYear: 2026,
      season: "FALL",
      score: 9.0,
      genres: ["Action"],
      studio: "Test Studio",
      artwork: { motif: "sun", primaryHue: 84 },
      episodes: [],
    };

    aggregator.registerCatalog([sampleAnime]);

    const routeById = aggregator.resolveRoute("sample-anime-01");
    expect(routeById).not.toBeNull();
    expect(routeById?.providerId).toBe("curated");
    expect(routeById?.animeId).toBe("sample-anime-01");

    const routeBySlug = aggregator.resolveRoute("sample-anime");
    expect(routeBySlug).not.toBeNull();
    expect(routeBySlug?.animeId).toBe("sample-anime-01");

    expect(aggregator.resolveRoute("non-existent")).toBeNull();
  });

  it("deduplicates anime across sources by normalized title", () => {
    const aggregator = new CatalogAggregator();

    const animeA: Anime = {
      id: "provider-a-1",
      slug: "sample-anime-sub-indo",
      sourceProvider: "providerA",
      title: { romaji: "Sample Anime Sub Indo" },
      synopsis: "Source A",
      status: "RELEASING",
      seasonYear: 2026,
      season: "FALL",
      score: 8.5,
      genres: ["Action"],
      studio: "Studio",
      artwork: { motif: "sun", primaryHue: 84 },
      episodes: [],
    };

    const animeB: Anime = {
      id: "provider-b-1",
      slug: "sample-anime-batch",
      sourceProvider: "providerB",
      title: { romaji: "Sample Anime [Batch]" },
      synopsis: "Source B",
      status: "RELEASING",
      seasonYear: 2026,
      season: "FALL",
      score: 8.5,
      genres: ["Action"],
      studio: "Studio",
      artwork: { motif: "sun", primaryHue: 84 },
      episodes: [],
    };

    const result = aggregator.registerCatalog([animeA, animeB]);
    expect(result.length).toBe(1);
    expect(result[0]?.id).toBe("provider-a-1");
  });
});
