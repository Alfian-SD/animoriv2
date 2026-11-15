import { describe, it, expect } from "vitest";
import { rewriteHlsManifest } from "../src/server/routes/streamRoutes.js";

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
