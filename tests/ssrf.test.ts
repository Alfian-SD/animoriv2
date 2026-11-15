import { describe, it, expect } from "vitest";
import { isSafeAllowedStreamUrl } from "../src/server/security/ssrfGuard.js";

describe("SSRF Guard & IP Protection", () => {
  it("allows safe public HTTPS stream URLs", () => {
    expect(isSafeAllowedStreamUrl("https://commondatastorage.googleapis.com/sample.mp4")).toBe(true);
    expect(isSafeAllowedStreamUrl("https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8")).toBe(true);
  });

  it("blocks non-http/https protocols", () => {
    expect(isSafeAllowedStreamUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeAllowedStreamUrl("ftp://example.com/video.mp4")).toBe(false);
    expect(isSafeAllowedStreamUrl("javascript:alert(1)")).toBe(false);
  });

  it("blocks localhost, loopback, and internal hostnames", () => {
    expect(isSafeAllowedStreamUrl("http://localhost/stream")).toBe(false);
    expect(isSafeAllowedStreamUrl("http://127.0.0.1/video.mp4")).toBe(false);
    expect(isSafeAllowedStreamUrl("http://127.1.2.3:8080/video")).toBe(false);
    expect(isSafeAllowedStreamUrl("http://app.localhost:3000")).toBe(false);
    expect(isSafeAllowedStreamUrl("http://cluster.local")).toBe(false);
    expect(isSafeAllowedStreamUrl("http://backend.internal")).toBe(false);
  });

  it("blocks cloud metadata service (169.254.169.254)", () => {
    expect(isSafeAllowedStreamUrl("http://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isSafeAllowedStreamUrl("https://169.254.10.20/secret")).toBe(false);
  });

  it("blocks RFC 1918 private IPv4 ranges", () => {
    expect(isSafeAllowedStreamUrl("http://10.0.0.1/stream")).toBe(false);
    expect(isSafeAllowedStreamUrl("http://172.16.0.5:8000/media")).toBe(false);
    expect(isSafeAllowedStreamUrl("http://172.31.255.255/media")).toBe(false);
    expect(isSafeAllowedStreamUrl("http://192.168.1.1/video.m3u8")).toBe(false);
  });

  it("blocks IPv6 loopback, link-local, and IPv4-mapped IPv6", () => {
    expect(isSafeAllowedStreamUrl("http://[::1]/stream")).toBe(false);
    expect(isSafeAllowedStreamUrl("http://[fe80::1]/stream")).toBe(false);
    expect(isSafeAllowedStreamUrl("http://[fc00::1]/stream")).toBe(false);
    expect(isSafeAllowedStreamUrl("http://[::ffff:127.0.0.1]/stream")).toBe(false);
    expect(isSafeAllowedStreamUrl("http://[::ffff:169.254.169.254]/stream")).toBe(false);
  });

  it("blocks credentials in URLs", () => {
    expect(isSafeAllowedStreamUrl("https://admin:secret@example.com/video.mp4")).toBe(false);
  });

  it("blocks hex and octal IP bypasses", () => {
    expect(isSafeAllowedStreamUrl("http://2130706433/")).toBe(false); // 127.0.0.1 in decimal
    expect(isSafeAllowedStreamUrl("http://0x7f000001/")).toBe(false); // 127.0.0.1 in hex
  });

  it("enforces strict allowlist when enforceAllowlist is true", () => {
    expect(isSafeAllowedStreamUrl("https://test-streams.mux.dev/stream.m3u8", true)).toBe(true);
    expect(isSafeAllowedStreamUrl("https://unapproved-hacker-domain.com/video.mp4", true)).toBe(false);
  });
});
