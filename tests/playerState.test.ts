import { describe, it, expect } from "vitest";
import {
  resolveResumeTimestamp,
  resolveEmbedProxyUrl,
  resolveNextFallbackIndex,
  formatQualityLabel,
} from "../src/client/player/playerUtils.js";

describe("playerUtils - Yoake Streaming Engine", () => {
  describe("resolveResumeTimestamp", () => {
    it("returns null if saved timestamp is in the early intro (<= 5 seconds)", () => {
      expect(resolveResumeTimestamp(0, 1440)).toBeNull();
      expect(resolveResumeTimestamp(4.9, 1440)).toBeNull();
      expect(resolveResumeTimestamp(5, 1440)).toBeNull();
    });

    it("returns null if saved timestamp is near or past the ending (>= duration - 15 seconds)", () => {
      const duration = 1440; // 24 minutes
      expect(resolveResumeTimestamp(1425, duration)).toBeNull();
      expect(resolveResumeTimestamp(1430, duration)).toBeNull();
      expect(resolveResumeTimestamp(1440, duration)).toBeNull();
    });

    it("returns floored timestamp when within valid playback range", () => {
      const duration = 1440;
      expect(resolveResumeTimestamp(320.7, duration)).toBe(320);
      expect(resolveResumeTimestamp(6, duration)).toBe(6);
      expect(resolveResumeTimestamp(1424.9, duration)).toBe(1424);
    });

    it("returns null for non-finite or invalid duration/time values", () => {
      expect(resolveResumeTimestamp(NaN, 1440)).toBeNull();
      expect(resolveResumeTimestamp(100, NaN)).toBeNull();
      expect(resolveResumeTimestamp(100, 0)).toBeNull();
      expect(resolveResumeTimestamp(100, -50)).toBeNull();
    });
  });

  describe("resolveEmbedProxyUrl", () => {
    it("encodes target embed URL safely into the proxy endpoint", () => {
      const upstream = "https://desustream.net/embed/ep1?token=xyz&sig=123";
      const proxied = resolveEmbedProxyUrl(upstream);
      expect(proxied).toBe(
        "/api/streams/embed-proxy?url=https%3A%2F%2Fdesustream.net%2Fembed%2Fep1%3Ftoken%3Dxyz%26sig%3D123"
      );
    });
  });

  describe("resolveNextFallbackIndex", () => {
    it("returns the next incremental index when a fallback mirror exists", () => {
      expect(resolveNextFallbackIndex(0, 3)).toBe(1);
      expect(resolveNextFallbackIndex(1, 3)).toBe(2);
    });

    it("returns null when the active mirror is the last available option", () => {
      expect(resolveNextFallbackIndex(2, 3)).toBeNull();
      expect(resolveNextFallbackIndex(0, 1)).toBeNull();
      expect(resolveNextFallbackIndex(0, 0)).toBeNull();
    });
  });

  describe("formatQualityLabel", () => {
    it("formats server name and resolution cleanly with center dot separator", () => {
      expect(formatQualityLabel("AlphaCDN", "1080p")).toBe("AlphaCDN · 1080p");
      expect(formatQualityLabel(" DesuStream ", " 720p ")).toBe("DesuStream · 720p");
    });
  });
});
