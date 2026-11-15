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

  it("strictly filters out Chinese animation (Donghua) by countryOfOrigin: CN and donghua keywords", () => {
    const aggregator = new CatalogAggregator();

    const chineseAnime1: Anime = {
      id: "al-12345",
      slug: "douluo-dalu",
      sourceProvider: "anilist",
      countryOfOrigin: "CN",
      title: { romaji: "Douluo Dalu" },
      synopsis: "Soul Land Chinese Donghua",
      status: "RELEASING",
      seasonYear: 2026,
      season: "FALL",
      score: 7.8,
      genres: ["Action", "Fantasy"],
      studio: "Sparkly Key Animation",
      artwork: { motif: "sun", primaryHue: 40 },
      episodes: [],
    };

    const chineseAnime2: Anime = {
      id: "otakudesu:btth-donghua",
      slug: "btth-donghua",
      sourceProvider: "otakudesu",
      countryOfOrigin: "JP", // even if mislabeled as JP
      title: { romaji: "Battle Through the Heavens (Donghua) Sub Indo" },
      synopsis: "Donghua populer",
      status: "RELEASING",
      seasonYear: 2026,
      season: "FALL",
      score: 8.0,
      genres: ["Action", "Donghua"],
      studio: "External",
      artwork: { motif: "waves", primaryHue: 120 },
      episodes: [],
    };

    const validJapaneseAnime: Anime = {
      id: "al-154587",
      slug: "frieren",
      sourceProvider: "anilist",
      countryOfOrigin: "JP",
      title: { romaji: "Sousou no Frieren" },
      synopsis: "Frieren Japanese Anime",
      status: "FINISHED",
      seasonYear: 2023,
      season: "FALL",
      score: 9.3,
      genres: ["Adventure", "Fantasy"],
      studio: "Madhouse",
      artwork: { motif: "slash", primaryHue: 84 },
      episodes: [],
    };

    const result = aggregator.registerCatalog([chineseAnime1, chineseAnime2, validJapaneseAnime]);
    expect(result.length).toBe(1);
    expect(result[0]?.id).toBe("al-154587");
    expect(result[0]?.title.romaji).toBe("Sousou no Frieren");
  });

  it("deduplicates identical titles from AniList and Otakudesu into 1 entry with AniList poster and complementary routes", () => {
    const aggregator = new CatalogAggregator();

    const anilistAnime: Anime = {
      id: "al-154587",
      slug: "sousou-no-frieren",
      anilistId: 154587,
      sourceProvider: "anilist",
      countryOfOrigin: "JP",
      title: { romaji: "Sousou no Frieren", english: "Frieren: Beyond Journey's End" },
      synopsis: "Official AniList synopsis.",
      status: "FINISHED",
      seasonYear: 2023,
      season: "FALL",
      score: 9.3,
      genres: ["Adventure", "Drama", "Fantasy"],
      studio: "Madhouse",
      artwork: {
        motif: "slash",
        primaryHue: 84,
        posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587.jpg",
      },
      episodes: [],
    };

    const otakudesuAnime: Anime = {
      id: "otakudesu:sousou-no-frieren-sub-indo",
      slug: "sousou-no-frieren-sub-indo",
      sourceProvider: "otakudesu",
      countryOfOrigin: "JP",
      externalUrl: "https://otakudesu.blog/anime/sousou-no-frieren-sub-indo/",
      title: { romaji: "Sousou no Frieren Sub Indo" },
      synopsis: "Deskripsi Otakudesu.",
      status: "FINISHED",
      seasonYear: 2023,
      season: "FALL",
      score: 8.0,
      genres: ["Adventure"],
      studio: "Otakudesu",
      artwork: {
        motif: "ridgelines",
        primaryHue: 10,
        posterUrl: "https://otakudesu.blog/wp-content/lowres.jpg",
      },
      episodes: [],
    };

    const result = aggregator.registerCatalog([anilistAnime, otakudesuAnime]);
    expect(result.length).toBe(1);
    const merged = result[0];
    expect(merged?.id).toBe("al-154587");
    // Retains high-res AniList artwork
    expect(merged?.artwork.posterUrl).toBe("https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587.jpg");
    // Receives externalUrl from Otakudesu
    expect(merged?.externalUrl).toBe("https://otakudesu.blog/anime/sousou-no-frieren-sub-indo/");

    // Resolves both primary and provider routes
    expect(aggregator.resolveRoute("al-154587")).not.toBeNull();
    expect(aggregator.resolveRoute("otakudesu:sousou-no-frieren-sub-indo")?.providerId).toBe("otakudesu");
    expect(aggregator.resolveRoute("https://otakudesu.blog/anime/sousou-no-frieren-sub-indo/")?.providerId).toBe("otakudesu");
  });

  it("allows unique non-Chinese titles from external providers to complement the catalog", () => {
    const aggregator = new CatalogAggregator();

    const curatedAnime: Anime = {
      id: "curated-01",
      slug: "frieren",
      sourceProvider: "curated",
      countryOfOrigin: "JP",
      title: { romaji: "Sousou no Frieren" },
      synopsis: "Curated anime",
      status: "FINISHED",
      seasonYear: 2023,
      season: "FALL",
      score: 9.3,
      genres: ["Fantasy"],
      studio: "Madhouse",
      artwork: { motif: "slash", primaryHue: 84 },
      episodes: [],
    };

    const uniqueNimegamiAnime: Anime = {
      id: "nimegami:dandadan",
      slug: "dandadan-sub-indo",
      sourceProvider: "nimegami",
      countryOfOrigin: "JP",
      externalUrl: "https://nimegami.id/anime/dandadan-sub-indo/",
      title: { romaji: "Dandadan" },
      synopsis: "Anime supernatural unik dari Nimegami.",
      status: "RELEASING",
      seasonYear: 2024,
      season: "FALL",
      score: 8.7,
      genres: ["Action", "Comedy", "Supernatural"],
      studio: "Science SARU",
      artwork: { motif: "waves", primaryHue: 200, posterUrl: "https://nimegami.id/poster.jpg" },
      episodes: [],
    };

    const result = aggregator.registerCatalog([curatedAnime, uniqueNimegamiAnime]);
    expect(result.length).toBe(2);
    expect(result.some((a) => a.id === "curated-01")).toBe(true);
    expect(result.some((a) => a.id === "nimegami:dandadan")).toBe(true);
    expect(aggregator.resolveRoute("nimegami:dandadan")?.providerId).toBe("nimegami");
  });
});
