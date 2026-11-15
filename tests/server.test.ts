import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { app } from "../src/server/index.js";
import type { Server } from "node:http";

describe("Express API Integration", () => {
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

  it("GET /api/catalog returns 12 curated anime", async () => {
    const res = await fetch(`${baseUrl}/api/catalog`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.total).toBe(12);
    expect(body.items.length).toBe(12);
  });

  it("GET /api/catalog/:id returns single anime details", async () => {
    const res = await fetch(`${baseUrl}/api/catalog/kurogane-meridian`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.anime.id).toBe("kurogane-meridian");
    expect(body.anime.episodes.length).toBeGreaterThan(0);
  });

  it("GET /api/streams blocks SSRF to 127.0.0.1", async () => {
    const res = await fetch(`${baseUrl}/api/streams/curated/s1?url=http://127.0.0.1:8080/secret`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid or forbidden");
  });

  it("GET /api/catalog/episodes/:episodeId/skip-times returns skip times envelope", async () => {
    const res = await fetch(`${baseUrl}/api/catalog/episodes/kurogane-meridian-ep-1/skip-times`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.episodeId).toBe("kurogane-meridian-ep-1");
    expect(Array.isArray(body.skipIntervals)).toBe(true);
  });
});
