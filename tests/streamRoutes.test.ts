import { describe, it, expect, vi, afterEach } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { streamRouter, rewriteHlsManifest } from "../src/server/routes/streamRoutes.js";

describe("HLS Manifest Rewriter", () => {
  it("rewrites relative segment paths to proxied stream URLs", () => {
    const rawManifest = `
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXTINF:9.009,
segment_0.ts
#EXTINF:9.009,
segment_1.ts
#EXT-X-ENDLIST
`.trim();

    const baseManifestUrl = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
    const rewritten = rewriteHlsManifest(rawManifest, baseManifestUrl, "curated", "stream-1");

    expect(rewritten).toContain("/api/streams/curated/stream-1?url=https%3A%2F%2Ftest-streams.mux.dev%2Fx36xhzz%2Fsegment_0.ts");
    expect(rewritten).toContain("/api/streams/curated/stream-1?url=https%3A%2F%2Ftest-streams.mux.dev%2Fx36xhzz%2Fsegment_1.ts");
    expect(rewritten).toContain("#EXT-X-VERSION:3");
  });

  it("rewrites URI in tags like #EXT-X-MAP", () => {
    const rawManifest = `
#EXTM3U
#EXT-X-MAP:URI="init.mp4"
#EXTINF:5.0,
chunk_0.m4s
`.trim();

    const baseManifestUrl = "https://commondatastorage.googleapis.com/hls/master.m3u8";
    const rewritten = rewriteHlsManifest(rawManifest, baseManifestUrl, "curated", "stream-2");

    expect(rewritten).toContain('#EXT-X-MAP:URI="/api/streams/curated/stream-2?url=https%3A%2F%2Fcommondatastorage.googleapis.com%2Fhls%2Finit.mp4"');
    expect(rewritten).toContain("/api/streams/curated/stream-2?url=https%3A%2F%2Fcommondatastorage.googleapis.com%2Fhls%2Fchunk_0.m4s");
  });
});

describe("Embed Proxy Route (/embed-proxy)", () => {
  const app = express();
  app.use("/api/streams", streamRouter);

  let server: Server;
  let baseUrl: string;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  async function startServer(): Promise<string> {
    return new Promise((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        baseUrl = typeof addr === "object" && addr ? `http://localhost:${addr.port}` : "";
        resolve(baseUrl);
      });
    });
  }

  it("rejects SSRF target URLs pointing to localhost and cloud metadata (HTTP 400)", async () => {
    await startServer();

    const resLocal = await fetch(`${baseUrl}/api/streams/embed-proxy?url=http://127.0.0.1:8080/player`);
    expect(resLocal.status).toBe(400);
    const bodyLocal = await resLocal.json();
    expect(bodyLocal.error).toContain("Invalid or forbidden");

    const resMeta = await fetch(`${baseUrl}/api/streams/embed-proxy?url=http://169.254.169.254/latest/meta-data/`);
    expect(resMeta.status).toBe(400);
  });

  it("injects <base href> tag and strips X-Frame-Options headers", async () => {
    await startServer();

    const sampleHtml = `<!DOCTYPE html><html><head><title>Player</title></head><body><video src="v.mp4"></video></body></html>`;

    const originalFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const urlStr = String(url);
      if (urlStr.startsWith("https://desustream.net")) {
        return new Response(sampleHtml, {
          status: 200,
          headers: {
            "Content-Type": "text/html",
            "X-Frame-Options": "DENY",
            "Content-Security-Policy": "frame-ancestors 'none'",
          },
        });
      }
      return originalFetch(url, init);
    });

    const res = await fetch(`${baseUrl}/api/streams/embed-proxy?url=https://desustream.net/embed/123`);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-frame-options")).toBeNull();
    expect(res.headers.get("content-type")).toContain("text/html");

    const html = await res.text();
    expect(html).toContain('<base href="https://desustream.net/">');
  });
});
