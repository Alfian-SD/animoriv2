export const SERVER_CONFIG = {
  port: Number(process.env.PORT ?? 4000),
  chromeUserAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  streamTimeoutMs: 45_000,
  metadataTimeoutMs: 10_000,
  ylnimeUrl: process.env.YLNIME_URL || "http://ylnime.com",
  doronimeMeUrl: process.env.DORONIME_ME_URL || "https://doronime.me",
  doronimeIdUrl: process.env.DORONIME_ID_URL || "https://doronime.id",
  otakudesuUrl: process.env.OTAKUDESU_URL || "https://otakudesu.blog",
  nimegamiUrl: process.env.NIMEGAMI_URL || "https://nimegami.id",
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
    "doronime.me",
    "www.doronime.me",
    "doronime.id",
    "www.doronime.id",
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
