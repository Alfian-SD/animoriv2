export const SERVER_CONFIG = {
  port: Number(process.env.PORT ?? 4000),
  chromeUserAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  streamTimeoutMs: 45_000,
  metadataTimeoutMs: 10_000,
  /**
   * Daftar host CDN / media yang diizinkan oleh SSRF guard.
   * Jika array kosong, semua domain publik non-private diizinkan.
   */
  allowedStreamHosts: new Set<string>([
    "test-streams.mux.dev",
    "desustream.net",
    "nimegami.id",
    "otakudesu.blog",
    "otakudesu.cloud",
    "berkasdrive.com",
    "samehadaku.email",
    "ylnime.com",
    "www.ylnime.com",
    "animeverse.id",
    "animekita.org",
    "filelions.to",
    "filelions.online",
    "vidhide.com",
    "vidhidepro.com",
    "krakenfiles.com",
    "mega.nz",
    "pixeldrain.com",
    "mp4upload.com",
    "blogger.com",
  ]),
} as const;
