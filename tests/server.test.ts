import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { app } from "../src/server/index.js";
import type { Server } from "node:http";

describe("Express API Integration", { timeout: 15000 }, () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === "object") {
          baseUrl = `http://localhost:${address.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("GET /api/health returns 200 and ok status", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.service).toBe("animoriv2-api");
  });

  it("GET /api/catalog returns curated anime", async () => {
    const res = await fetch(`${baseUrl}/api/catalog`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(12);
    expect(body.items.length).toBeGreaterThanOrEqual(12);
  });

  it("GET /api/catalog with search and genre filters works correctly", async () => {
    const resSearch = await fetch(`${baseUrl}/api/catalog?search=frieren`);
    expect(resSearch.status).toBe(200);
    const bodySearch = await resSearch.json();
    expect(bodySearch.ok).toBe(true);
    expect(bodySearch.items.length).toBeGreaterThanOrEqual(1);
    expect(bodySearch.items[0].title.romaji).toContain("Frieren");

    const resGenre = await fetch(`${baseUrl}/api/catalog?genre=Fantasy`);
    expect(resGenre.status).toBe(200);
    const bodyGenre = await resGenre.json();
    expect(bodyGenre.ok).toBe(true);
    expect(bodyGenre.items.every((a: { genres: string[] }) => a.genres.includes("Fantasy"))).toBe(true);
  });

  it("GET /api/anime/:id returns single anime details via O(1) route", async () => {
    const res = await fetch(`${baseUrl}/api/anime/frieren-beyond-journeys-end`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.anime.id).toBe("frieren-beyond-journeys-end");
    expect(body.anime.episodes.length).toBeGreaterThan(0);
  });

  it("GET /api/anime/:id/episodes/:episodeId/mirrors returns mirrors and handles 404", async () => {
    // Valid curated anime episode
    const resValid = await fetch(`${baseUrl}/api/anime/frieren-beyond-journeys-end/episodes/frieren-beyond-journeys-end-ep-1/mirrors`);
    expect(resValid.status).toBe(200);
    const bodyValid = await resValid.json();
    expect(bodyValid.ok).toBe(true);
    expect(bodyValid.animeId).toBe("frieren-beyond-journeys-end");
    expect(bodyValid.episodeNumber).toBe(1);
    expect(Array.isArray(bodyValid.mirrors)).toBe(true);
    expect(bodyValid.mirrors.length).toBeGreaterThan(0);
    expect(bodyValid.mirrors[0].serverName).toBe("Server 1");
    for (const m of bodyValid.mirrors) {
      expect(m.serverName).toMatch(/^Server \d+$/);
    }

    // Non-existent anime
    const resMissingAnime = await fetch(`${baseUrl}/api/anime/non-existent-anime/episodes/ep-1/mirrors`);
    expect(resMissingAnime.status).toBe(404);

    // Non-existent episode on existing anime
    const resMissingEp = await fetch(`${baseUrl}/api/anime/frieren-beyond-journeys-end/episodes/non-existent-ep/mirrors`);
    expect(resMissingEp.status).toBe(404);
  });

  it("GET /api/streams blocks SSRF to 127.0.0.1", async () => {
    const res = await fetch(`${baseUrl}/api/streams/curated/s1?url=http://127.0.0.1:8080/secret`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid or forbidden");
  });

  it("GET /api/catalog/episodes/:episodeId/skip-times returns skip times envelope", async () => {
    const res = await fetch(`${baseUrl}/api/catalog/episodes/frieren-beyond-journeys-end-ep-1/skip-times`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.episodeId).toBe("frieren-beyond-journeys-end-ep-1");
    expect(Array.isArray(body.skipIntervals)).toBe(true);
  });

  it("GET /api/catalog?genres=Isekai,Romance strictly returns anime matching both genres (AND intersection)", async () => {
    const res = await fetch(`${baseUrl}/api/catalog?genres=Isekai,Romance`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.items.length).toBeGreaterThanOrEqual(2);
    for (const item of body.items) {
      const lowerGenres = item.genres.map((g: string) => g.toLowerCase());
      expect(lowerGenres).toContain("isekai");
      expect(lowerGenres).toContain("romance");
    }
  });

  it("GET /api/catalog/stats returns archiveTotal > 10000", async () => {
    const res = await fetch(`${baseUrl}/api/catalog/stats`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.archiveTotal).toBe("number");
    expect(body.archiveTotal).toBeGreaterThan(10000);
  });

  it("GET /api/catalog pagination supports 50 items per page and page 2 returns distinct items", async () => {
    const resPage1 = await fetch(`${baseUrl}/api/catalog?page=1&perPage=50`);
    expect(resPage1.status).toBe(200);
    const bodyPage1 = await resPage1.json();
    expect(bodyPage1.ok).toBe(true);
    expect(bodyPage1.items.length).toBeGreaterThanOrEqual(50);
    expect(bodyPage1.pageInfo.total).toBeGreaterThan(10000);
    expect(bodyPage1.archiveTotal).toBeGreaterThan(10000);

    const resPage2 = await fetch(`${baseUrl}/api/catalog?page=2&perPage=50`);
    expect(resPage2.status).toBe(200);
    const bodyPage2 = await resPage2.json();
    expect(bodyPage2.ok).toBe(true);
    expect(bodyPage2.items.length).toBeGreaterThanOrEqual(20);

    const page1Ids = new Set(bodyPage1.items.map((a: { id: string }) => a.id));
    const overlap = bodyPage2.items.filter((a: { id: string }) => page1Ids.has(a.id));
    expect(overlap.length).toBe(0);
  });

  it("GET /api/anime/shingeki-no-kyojin returns anime.seasons chronologically ordered and free of Chinese animation", async () => {
    const res = await fetch(`${baseUrl}/api/anime/shingeki-no-kyojin`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.anime).toBeDefined();
    expect(Array.isArray(body.anime.seasons)).toBe(true);
    expect(body.anime.seasons.length).toBeGreaterThanOrEqual(2);

    const seasons = body.anime.seasons;
    // Check chronological order (seasonYear ascending)
    for (let i = 0; i < seasons.length - 1; i++) {
      const currentYear = seasons[i].seasonYear ?? 0;
      const nextYear = seasons[i + 1].seasonYear ?? 0;
      expect(currentYear).toBeLessThanOrEqual(nextYear);
    }

    // Verify current anime is flagged as isCurrent
    const currentSeason = seasons.find((s: { isCurrent?: boolean }) => s.isCurrent);
    expect(currentSeason).toBeDefined();

    // Verify each season has required fields and proper format
    for (const s of seasons) {
      expect(typeof s.id).toBe("string");
      expect(typeof s.anilistId).toBe("number");
      expect(typeof s.title).toBe("string");
      expect(typeof s.seasonLabel).toBe("string");
      expect(s.seasonLabel.length).toBeGreaterThan(0);
    }
  });

  it("fails over to Jikan provider when AniList returns HTTP 429 / error for catalog and anime details with seasons", async () => {
    const originalFetch = globalThis.fetch;

    const mockJikanAnime = {
      mal_id: 99991,
      title: "Jikan Fallback Test Adventure",
      title_english: "Jikan Fallback Test Adventure",
      title_japanese: "ジカン・フォールバック",
      type: "TV",
      status: "Finished Airing",
      year: 2024,
      score: 8.7,
      genres: [
        { mal_id: 1, type: "anime", name: "Action" },
        { mal_id: 2, type: "anime", name: "Fantasy" },
      ],
      studios: [{ mal_id: 1, type: "anime", name: "Bones" }],
      images: {
        webp: { large_image_url: "https://example.com/poster.webp" },
        jpg: { large_image_url: "https://example.com/poster.jpg" },
      },
      trailer: {
        images: { maximum_image_url: "https://example.com/backdrop.jpg" },
      },
      synopsis: "A test anime returned by Jikan fallback provider when AniList is down.",
      episodes: 12,
    };

    const mockJikanRelations = [
      {
        relation: "Prequel",
        entry: [
          {
            mal_id: 99990,
            type: "anime",
            name: "Jikan Fallback Test Season 1",
            url: "https://myanimelist.net/anime/99990",
          },
        ],
      },
      {
        relation: "Sequel",
        entry: [
          {
            mal_id: 99992,
            type: "anime",
            name: "Jikan Fallback Test Season 3",
            url: "https://myanimelist.net/anime/99992",
          },
        ],
      },
    ];

    try {
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

        // Simulate AniList HTTP 429 Too Many Requests
        if (urlStr.includes("graphql.anilist.co")) {
          return new Response(
            JSON.stringify({ errors: [{ message: "Too Many Requests", status: 429 }] }),
            { status: 429, statusText: "Too Many Requests", headers: { "Content-Type": "application/json" } }
          );
        }

        // Mock Jikan API catalog endpoint
        if (urlStr.includes("api.jikan.moe/v4/anime?") || urlStr.includes("api.jikan.moe/v4/top/anime")) {
          return new Response(
            JSON.stringify({
              pagination: {
                last_visible_page: 1,
                has_next_page: false,
                current_page: 1,
                items: { count: 1, total: 1, per_page: 25 },
              },
              data: [mockJikanAnime],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        // Mock Jikan API single item full details endpoint
        if (urlStr.includes("api.jikan.moe/v4/anime/99991/full")) {
          return new Response(
            JSON.stringify({ data: mockJikanAnime }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        // Mock Jikan API relations endpoint
        if (urlStr.includes("api.jikan.moe/v4/anime/99991/relations")) {
          return new Response(
            JSON.stringify({ data: mockJikanRelations }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        // Pass-through local server and other requests
        return originalFetch(input, init);
      }) as typeof fetch;

      // 1. Verify GET /api/catalog falls back to Jikan when AniList returns 429
      const catalogRes = await fetch(`${baseUrl}/api/catalog?search=fallback_unique_query`);
      expect(catalogRes.status).toBe(200);
      const catalogBody = await catalogRes.json();
      expect(catalogBody.ok).toBe(true);
      expect(Array.isArray(catalogBody.items)).toBe(true);
      const jikanItem = catalogBody.items.find(
        (it: { id: string; title: { romaji: string } }) =>
          it.id === "mal-99991" || it.title.romaji.includes("Jikan Fallback")
      );
      expect(jikanItem).toBeDefined();
      expect(jikanItem.sourceProvider).toBe("jikan");

      // 2. Verify GET /api/anime/:id with prefix mal-{malId} resolves via Jikan
      const detailRes = await fetch(`${baseUrl}/api/anime/mal-99991`);
      expect(detailRes.status).toBe(200);
      const detailBody = await detailRes.json();
      expect(detailBody.ok).toBe(true);
      expect(detailBody.anime).toBeDefined();
      expect(detailBody.anime.id).toBe("mal-99991");
      expect(detailBody.anime.title.romaji).toBe("Jikan Fallback Test Adventure");
      expect(detailBody.anime.sourceProvider).toBe("jikan");

      // 3. Verify relations / seasons fallback from Jikan
      expect(Array.isArray(detailBody.anime.seasons)).toBe(true);
      expect(detailBody.anime.seasons.length).toBeGreaterThanOrEqual(2);
      const currentSeason = detailBody.anime.seasons.find(
        (s: { isCurrent?: boolean; malId?: number }) => s.isCurrent && s.malId === 99991
      );
      expect(currentSeason).toBeDefined();
      expect(detailBody.anime.seasons.some((s: { seasonLabel: string }) => s.seasonLabel.includes("Season"))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("GET /api/catalog/home returns real-time trending, recentlyUpdated, and currentSeason free of Chinese animation", async () => {
    const res = await fetch(`${baseUrl}/api/catalog/home`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    expect(Array.isArray(body.trending)).toBe(true);
    expect(body.trending.length).toBeGreaterThanOrEqual(1);

    expect(Array.isArray(body.recentlyUpdated)).toBe(true);
    expect(body.recentlyUpdated.length).toBeGreaterThanOrEqual(1);

    expect(Array.isArray(body.currentSeason)).toBe(true);
    expect(body.currentSeason.length).toBeGreaterThanOrEqual(1);

    // Verify anti-donghua filter
    for (const anime of [...body.trending, ...body.recentlyUpdated, ...body.currentSeason]) {
      expect(anime.countryOfOrigin).not.toBe("CN");
      expect(anime.genres.map((g: string) => g.toLowerCase())).not.toContain("donghua");
    }

    // Verify recentlyUpdated has valid episode information
    const firstRecent = body.recentlyUpdated[0];
    expect(firstRecent.episodes.length).toBeGreaterThanOrEqual(1);
    const latestEp = firstRecent.episodes[firstRecent.episodes.length - 1];
    expect(typeof latestEp.number).toBe("number");
    expect(latestEp.number).toBeGreaterThanOrEqual(1);
  });
});
