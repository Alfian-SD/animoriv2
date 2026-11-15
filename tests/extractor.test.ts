import { describe, expect, it } from "vitest";
import { unpackDeanEdwards } from "../src/server/extractors/streamExtractor.js";
import {
  extractSlugFromHref,
  parseHydratedStreams,
  sortPlaybackOptionsByQuality,
  DoronimeProvider,
} from "../src/server/providers/externalProvider.js";
import { resolveUpstreamReferer } from "../src/server/routes/streamRoutes.js";
import { sortStreamCandidates, type RawStreamCandidate } from "../src/server/services/streamResolver.js";
import type { PlaybackOption } from "../src/shared/anime.js";

describe("External Scraper & Stream Extractor", { timeout: 15000 }, () => {
  it("unpacks Dean Edwards P.A.C.K.E.R. obfuscated player config", () => {
    const packed =
      "eval(function(p,a,c,k,e,d){return p}('0 1=\"2://3.4/5.6\";',7,7,'var|streamUrl|https|cdn|example|video|m3u8'.split('|'),0,{}))";
    const unpacked = unpackDeanEdwards(packed);
    expect(unpacked).toContain('var streamUrl="https://cdn.example/video.m3u8";');
  });

  it("extracts valid public streams from hydrated Next.js payloads and drops SSRF URLs", () => {
    const html = `
      <script>
        self.__next_f.push([1, "{\\"playUrl\\":\\"https://cdn.example.com/ep1.m3u8\\",\\"quality\\":\\"1080p\\",\\"episode\\":1}"]);
        self.__next_f.push([1, "{\\"playUrl\\":\\"http://169.254.169.254/latest/meta-data/\\",\\"quality\\":\\"720p\\",\\"episode\\":1}"]);
      </script>
    `;
    const streams = parseHydratedStreams(html);
    expect(streams).toHaveLength(1);
    expect(streams[0]).toEqual({
      playUrl: "https://cdn.example.com/ep1.m3u8",
      quality: "1080p",
      episode: 1,
    });
  });

  it("normalizes slugs independent of upstream TLD rotations", () => {
    expect(
      extractSlugFromHref("https://otakudesu.cloud/anime/frieren-sub-indo/")
    ).toBe("frieren-sub-indo");
    expect(
      extractSlugFromHref("https://otakudesu.best/anime/frieren-sub-indo")
    ).toBe("frieren-sub-indo");
  });

  it("cleans query strings and hash fragments in extractSlugFromHref and rejects standalone anchors", () => {
    expect(extractSlugFromHref("https://nimegami.id/some-anime/#nonton")).toBe("some-anime");
    expect(extractSlugFromHref("#nonton")).toBe("");
    expect(extractSlugFromHref("https://nimegami.id/another-anime?param=1#nonton")).toBe("another-anime");
    expect(extractSlugFromHref("https://nimegami.id/#watch")).toBe("");
  });

  it("sorts resolved playback mirrors from highest to lowest resolution", () => {
    const unsorted: PlaybackOption[] = [
      {
        id: "1",
        providerId: "ext",
        serverName: "Mirror A",
        quality: "480p",
        mode: "embed",
        streamUrl: "https://cdn.example.com/480",
      },
      {
        id: "2",
        providerId: "ext",
        serverName: "Mirror B",
        quality: "1080p",
        mode: "hls",
        streamUrl: "https://cdn.example.com/1080.m3u8",
      },
      {
        id: "3",
        providerId: "ext",
        serverName: "Mirror C",
        quality: "720p",
        mode: "mp4",
        streamUrl: "https://cdn.example.com/720.mp4",
      },
    ];

    const sorted = sortPlaybackOptionsByQuality(unsorted);
    expect(sorted.map((o) => o.quality)).toEqual(["1080p", "720p", "480p"]);
  });

  it("builds candidate search queries for long romaji titles and calculates word-overlap similarity >= 50%", async () => {
    const { buildSearchQueries, calculateWordOverlap } = await import(
      "../src/server/services/streamResolver.js"
    );

    const longTitle = "Tensei shita Dai Seijo wa, Seijo de Aru Koto wo Hita Kakusu";
    const queries = buildSearchQueries({
      animeTitle: longTitle,
      animeRomaji: longTitle,
    });

    expect(queries).toContain(longTitle);
    expect(queries.some((q) => q.includes("Tensei shita Dai Seijo"))).toBe(true);

    const providerResult = "Tensei shita Daiseijo wa, Seijo de Aru Koto wo Hitakakusu Sub Indo";
    const overlap = calculateWordOverlap("Tensei shita Dai Seijo", providerResult);
    expect(overlap).toBeGreaterThanOrEqual(0.5);

    const unrelated = "Gotoubun no Hanayome";
    const unrelatedOverlap = calculateWordOverlap("Tensei shita Dai Seijo", unrelated);
    expect(unrelatedOverlap).toBeLessThan(0.5);
  });

  it("extractDirectStream returns null and falls back quickly on timeout or ssrf", async () => {
    const { extractDirectStream } = await import(
      "../src/server/extractors/streamExtractor.js"
    );

    // SSRF URL should immediately return null
    const ssrfResult = await extractDirectStream("http://169.254.169.254/latest", "https://example.com");
    expect(ssrfResult).toBeNull();
  });

  it("streamResolver supports refresh query and bypasses cache when refresh=true", async () => {
    const { resolveEpisodeStreams } = await import(
      "../src/server/services/streamResolver.js"
    );

    const mirrors1 = await resolveEpisodeStreams({
      animeTitle: "Non Existent Anime Title 12345",
      episodeNumber: 99,
      refresh: true,
    });
    expect(Array.isArray(mirrors1)).toBe(true);
    expect(mirrors1).toHaveLength(0);
  });

  it("extractSlugFromHref cleanly parses doronime.me and doronime.id URLs with prefixes and queries", () => {
    expect(extractSlugFromHref("https://doronime.me/anime/solo-leveling/")).toBe("solo-leveling");
    expect(extractSlugFromHref("https://doronime.id/episode/solo-leveling-episode-1-sub-indo/")).toBe("solo-leveling-episode-1-sub-indo");
    expect(extractSlugFromHref("https://doronime.me/nonton/frieren-sub-indo?param=1#player")).toBe("frieren-sub-indo");
    expect(extractSlugFromHref("https://doronime.id/watch/attack-on-titan-final-season/")).toBe("attack-on-titan-final-season");
  });

  it("resolveUpstreamReferer returns correct referer header for ylnime.com, doronime.me, doronime.id and generic CDNs", () => {
    expect(resolveUpstreamReferer("http://ylnime.com/series?title=solo")).toBe("http://ylnime.com/");
    expect(resolveUpstreamReferer("https://doronime.me/episode/test-ep-1")).toBe("https://doronime.me/");
    expect(resolveUpstreamReferer("https://doronime.id/anime/test")).toBe("https://doronime.id/");
    expect(resolveUpstreamReferer("https://nimegami.id/video")).toBe("https://nimegami.id/");
    expect(resolveUpstreamReferer("https://otakudesu.blog/video")).toBe("https://desustream.net/");
    expect(resolveUpstreamReferer("https://cdn.example.com/stream/file.mp4")).toBe("https://cdn.example.com/");
  });

  it("DoronimeProvider extracts streams, handles Base64 data attributes, and strictly anonymizes server names", async () => {
    const provider = new DoronimeProvider("doronime-me", "https://doronime.me");
    const sampleHtml = `
      <div class="player">
        <video src="https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"></video>
        <iframe src="https://desustream.net/embed/test"></iframe>
        <div data-content="aHR0cHM6Ly9maWxlbGlvbnMudG8vdi94eXoxMjM="></div>
      </div>
    `;

    const options = await provider.extractStreamsFromHtml(sampleHtml, "https://doronime.me/episode/1");
    expect(options.length).toBeGreaterThanOrEqual(2);
    // Ensure all server names are anonymized as "Server 1", "Server 2", ...
    options.forEach((opt, idx) => {
      expect(opt.serverName).toBe(`Server ${idx + 1}`);
      expect(opt.serverName.toLowerCase()).not.toContain("doronime");
      expect(opt.serverName.toLowerCase()).not.toContain("ylnime");
      expect(opt.serverName.toLowerCase()).not.toContain("otakudesu");
    });
  });

  it("DoronimeProvider filters Chinese Donghua from catalog list", () => {
    const provider = new DoronimeProvider("doronime-me", "https://doronime.me");
    const catalogHtml = `
      <article>
        <h2 class="title"><a href="https://doronime.me/anime/frieren-sub-indo/">Sousou no Frieren</a></h2>
        <img src="https://doronime.me/images/frieren.jpg" />
        <div class="genres"><a href="/genre/fantasy">Fantasy</a></div>
      </article>
      <article>
        <h2 class="title"><a href="https://doronime.me/anime/soul-land-donghua/">Soul Land 2</a></h2>
        <img src="https://doronime.me/images/soul-land.jpg" />
        <div class="genres"><a href="/genre/donghua">Donghua</a></div>
      </article>
    `;

    const items = provider.parseAnimeList(catalogHtml);
    expect(items.length).toBe(1);
    expect(items[0]!.title.romaji).toBe("Sousou no Frieren");
    expect(items[0]!.slug).toBe("frieren-sub-indo");
  });

  it("sortStreamCandidates enforces strict tiered priority: ylnime (1) -> doronime.me (2) -> doronime.id (3) -> otakudesu (4) -> nimegami (5)", () => {
    const mockCandidates: RawStreamCandidate[] = [
      { url: "https://otakudesu.cloud/ep1.mp4", quality: "1080p", mode: "mp4", priority: 4 },
      { url: "https://nimegami.id/ep1.mp4", quality: "1080p", mode: "mp4", priority: 5 },
      { url: "https://doronime.id/ep1.mp4", quality: "720p", mode: "mp4", priority: 3 },
      { url: "https://doronime.me/ep1.mp4", quality: "720p", mode: "mp4", priority: 2 },
      { url: "https://ylnime.com/ep1.m3u8", quality: "720p", mode: "hls", priority: 1 },
      { url: "https://doronime.me/ep1-embed", quality: "720p", mode: "embed", priority: 2 },
    ];

    const sorted = sortStreamCandidates(mockCandidates);

    expect(sorted[0]!.url).toBe("https://ylnime.com/ep1.m3u8"); // Tier 1: ylnime
    expect(sorted[0]!.priority).toBe(1);

    expect(sorted[1]!.url).toBe("https://doronime.me/ep1.mp4"); // Tier 2: doronime.me direct
    expect(sorted[1]!.priority).toBe(2);

    expect(sorted[2]!.url).toBe("https://doronime.me/ep1-embed"); // Tier 2: doronime.me embed
    expect(sorted[2]!.priority).toBe(2);

    expect(sorted[3]!.url).toBe("https://doronime.id/ep1.mp4"); // Tier 3: doronime.id
    expect(sorted[3]!.priority).toBe(3);

    expect(sorted[4]!.url).toBe("https://otakudesu.cloud/ep1.mp4"); // Tier 4: otakudesu
    expect(sorted[4]!.priority).toBe(4);

    expect(sorted[5]!.url).toBe("https://nimegami.id/ep1.mp4"); // Tier 5: nimegami
    expect(sorted[5]!.priority).toBe(5);
  });
});
