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
});
