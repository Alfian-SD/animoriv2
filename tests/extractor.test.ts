import { describe, expect, it } from "vitest";
import { unpackDeanEdwards } from "../src/server/extractors/streamExtractor.js";
import {
  extractSlugFromHref,
  parseHydratedStreams,
  sortPlaybackOptionsByQuality,
} from "../src/server/providers/externalProvider.js";
import type { PlaybackOption } from "../src/shared/anime.js";

describe("External Scraper & Stream Extractor", () => {
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
});
