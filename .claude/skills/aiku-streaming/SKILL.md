---
name: aiku-anime-streaming-platform
description: >-
  Use when designing, building, reviewing, debugging, or optimizing the Aiku anime
  discovery and streaming platform. Covers multi-source catalog aggregation,
  normalized data contracts, O(1) source routing, AniList GraphQL metadata and
  fallback, authorized stream resolution, HTTP 206 byte-range and HLS delivery,
  SSRF protection, triple-mode cinema player (MP4, HLS.js, Sandboxed Iframe),
  automatic server failover, AniSkip OP/ED integration, watch history, and
  production reliability. Use only with content and providers the project is
  authorized to access, embed, or distribute.
---

# Aiku Anime Streaming Platform — Master Engineering Skill

## 0. Mission, Scope, and Core Operating Principles

Act as a senior full-stack streaming engineer responsible for building, debugging, and scaling **Aiku**—a resilient, high-performance anime discovery and playback web application. Prioritize correctness, maintainability, security, low-latency media delivery, accessibility, and a polished cinema viewing experience.

This skill is adaptable to Aiku's existing stack (whether Node.js/Express, Next.js, React, Vue, or TypeScript). Always inspect and follow the repository's existing conventions before introducing changes.

### Core Principles

1. **Respect Access Rights & Provider Policies:** Integrate official APIs, documented integrations, public metadata, user-owned media, licensed catalogs, and providers that explicitly permit the intended access, embedding, and playback.
2. **Do Not Defeat Access Controls:** Do not bypass paywalls, DRM, authentication, geo-restrictions, anti-bot controls, CAPTCHA, hotlink protection, or provider framing policies (`X-Frame-Options` / `Content-Security-Policy`). Do not harvest or replay private nonces, session cookies, or internal signatures, and do not spoof `Referer` headers to bypass upstream security controls. When a source is unavailable or disallows embedding, fall back to an authorized alternative or render a clean unavailable state.
3. **Never Build an Open Proxy:** Backend streaming endpoints must never fetch arbitrary user-supplied URLs without strict validation. Prefer resolving playback through server-controlled provider adapters and opaque IDs (`streamId`), backed by strict hostname allowlists and SSRF guards.
4. **Normalize at the Boundary:** Provider-specific HTML/JSON shapes stay strictly inside provider adapters. The rest of Aiku consumes stable, normalized internal contracts.
5. **Fail Predictably & Gracefully:** Every upstream request requires a timeout, schema validation, bounded retries for transient errors, typed error codes, and automatic fallback where appropriate.
6. **Verify Before Completion:** Always run relevant tests, linters, type checks, and production builds before declaring work complete.

---

## 1. First Response: Inspect Aiku Before Changing Code

When invoked inside the Aiku repository:

1. **Inspect Project Structure:** Check `package.json`, lockfiles, framework configuration, environment variables (`.env.example`), and directory layout.
2. **Trace Data Flow:** Identify how frontend pages/components communicate with backend API routes, catalog services, metadata services, and playback resolvers.
3. **Locate Existing Abstractions:** Find existing provider adapters, player components, watch-history utilities, caching layers, and error handlers.
4. **Read Local Instructions:** Check `AGENTS.md`, `README.md`, or local rules.
5. **Scope Minimally:** Identify the smallest set of files required to solve the user's request cleanly without overwriting unrelated work.

---

## 2. End-to-End Reference Architecture

Keep catalog discovery, metadata enrichment, stream delivery, and player presentation decoupled:

```text
                      +-----------------------------------+
                      |     Catalog & Metadata Sources    |
                      |  - Authorized Catalog Providers   |
                      |  - Public JSON / Next/HTML Data   |
                      |  - AniList GraphQL & Jikan API    |
                      +-----------------+-----------------+
                                        |
                                        v
                      +-----------------------------------+
                      |   Aiku Unified Backend Aggregator |
                      |  - Title & Alias Normalization    |
                      |  - O(1) Source Routing Map        |
                      |  - Stale-While-Revalidate Cache   |
                      +-----------------+-----------------+
                                        |
              +-------------------------+-------------------------+
              |                                                   |
              v                                                   v
+-------------------------------+                   +-------------------------------+
|   Authorized Direct Streams   |                   |    Authorized Embed Hosts     |
|  - MP4 / WebM / HLS (.m3u8)   |                   |  - Official / Permitted Embed |
+---------------+---------------+                   +---------------+---------------+
                |                                                   |
                v                                                   v
+-------------------------------+                   +-------------------------------+
|  /api/streams/:provider/:id   |                   |   Validated Embed Container   |
|  - SSRF & Host Allowlist Guard|                   |  - Origin Allowlist Check     |
|  - HTTP 206 Byte-Range Piping |                   |  - Sandboxed Iframe Policy    |
|  - HLS Manifest Resolution    |                   +---------------+---------------+
|  - Socket Cleanup on Abort    |                                   |
+---------------+---------------+                                   |
                \                                                   /
                 \------------------------+------------------------/
                                          |
                                          v
                      +-----------------------------------+
                      |     Aiku Frontend Cinema Player   |
                      |  - Triple Mode: MP4 / HLS / Embed |
                      |  - Automatic Server Failover      |
                      |  - AniSkip OP/ED & Auto-Next      |
                      |  - Watch Progress & Resume        |
                      +-----------------------------------+
```

### Layer Responsibilities

| Layer | Primary Responsibility | Must Not Do |
|---|---|---|
| **Frontend UI & Player** | Render catalog, episode lists, triple-mode player controls, AniSkip button, and local watch state | Hold secret keys, scrape directly from browser, or construct unvalidated upstream proxy URLs |
| **API Routes** | Validate parameters/body, enforce rate limits, format envelopes, attach `requestId` | Accept unvalidated arbitrary target URLs |
| **Catalog Aggregator** | Query adapters concurrently (`Promise.allSettled`), deduplicate, maintain routing map | Leak raw upstream DOM/JSON structures to the frontend |
| **Provider Adapters** | Fetch and parse one specific provider's documented/permitted catalog or stream data | Bleed selector logic into shared controllers |
| **Metadata Service** | Enrich anime records via AniList GraphQL (`idMal`, banners, genres, synopsis) | Treat fuzzy title matches as guaranteed identity without verification |
| **Playback & Stream Proxy** | Resolve authorized `streamId` records, handle HTTP 206 `Range` headers, clean up sockets | Bypass provider security headers or buffer entire video files in RAM |

---

## 3. Domain Model & Normalized Contracts

Do not rely on raw provider slugs alone as globally unique IDs across Aiku. Always pair provider IDs with provider slugs (`${providerId}:${providerAnimeId}`) or resolve to a canonical internal ID.

```ts
export type AnimeStatus =
  | "releasing"
  | "finished"
  | "not_yet_released"
  | "cancelled"
  | "unknown";

export interface AnimeTitle {
  romaji?: string;
  english?: string;
  native?: string;
  preferred: string;
}

export interface Anime {
  id: string;                 // Stable Aiku application ID
  title: AnimeTitle;
  aliases: string[];
  synopsis?: string;
  coverImage?: string;
  bannerImage?: string;
  genres: string[];
  status: AnimeStatus;
  seasonYear?: number;
  episodeCount?: number;
  averageScore?: number;
  metadataIds: {
    anilist?: number;
    mal?: number;             // Required for AniSkip lookup
  };
  sourceRefs: Array<{
    providerId: string;
    providerAnimeId: string;
    canonicalUrl?: string;
  }>;
  updatedAt: string;
}

export interface Episode {
  id: string;
  animeId: string;
  number: number;
  title?: string;
  thumbnail?: string;
  durationSeconds?: number;
  sourceRef: {
    providerId: string;
    providerEpisodeId: string;
  };
}

export interface SubtitleTrack {
  id: string;
  language: string;
  label: string;
  format: "vtt" | "srt";
  url: string;
  isDefault?: boolean;
}

export type PlaybackOption =
  | {
      id: string;
      kind: "direct";
      streamType: "mp4" | "hls";
      providerId: string;
      streamId: string;       // Opaque ID resolved server-side
      label: string;
      quality?: "1080p" | "720p" | "480p" | "360p" | string;
      subtitles?: SubtitleTrack[];
    }
  | {
      id: string;
      kind: "embed";
      providerId: string;
      embedUrl: string;       // Validated against approved provider origins
      label: string;
      quality?: string;
    };

export interface WatchProgress {
  animeId: string;
  episodeId: string;
  episodeNumber: number;
  currentTime: number;
  duration: number;
  updatedAt: string;
  completed: boolean;
}
```

---

## 4. Step 1: Multi-Source Catalog Aggregation & Provider Adapters

Combine permitted catalog providers with global metadata APIs so Aiku remains fast and resilient.

### A. Provider Adapter Contract

```ts
export interface PageResult<T> {
  items: T[];
  page: number;
  hasNextPage: boolean;
}

export interface CatalogProvider {
  readonly id: string;
  getHome?(): Promise<{ ongoing: Anime[]; complete: Anime[] }>;
  search(query: string, page: number): Promise<PageResult<Anime>>;
  getAnime(providerAnimeId: string): Promise<Anime | null>;
  getEpisodes(providerAnimeId: string): Promise<Episode[]>;
}
```

### B. Authorized HTML & Structured State Parsing Patterns

When parsing an authorized HTML catalog or structured JSON state (such as JSON-LD or hydrated application state):

1. Enforce an explicit request timeout (e.g., `8000`–`12000` ms).
2. Normalize relative slugs and URLs against a fixed, trusted base URL.
3. Validate protocols (`https:`) and origins before returning links.

```ts
import { load } from "cheerio";

export function extractSafeSlug(rawUrl = ""): string {
  return rawUrl
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .pop() || "";
}

export function parseAuthorizedCatalogHtml(html: string, trustedBaseUrl: string) {
  const $ = load(html);
  const base = new URL(trustedBaseUrl);
  const items: Array<{ title: string; slug: string; thumbnail?: string; tag?: string }> = [];

  $("[data-anime-card]").each((_, el) => {
    const card = $(el);
    const title = card.find("[data-anime-title]").text().trim();
    const rawHref = card.find("a[data-anime-link]").attr("href");
    const rawImg = card.find("img").attr("src");
    const tag = card.find("[data-anime-tag]").text().trim();

    if (!title || !rawHref) return;

    const canonical = new URL(rawHref, base);
    if (canonical.protocol !== "https:" || canonical.origin !== base.origin) return;

    let thumbnail: string | undefined;
    if (rawImg) {
      const parsedImg = new URL(rawImg, base);
      if (parsedImg.protocol === "https:") thumbnail = parsedImg.toString();
    }

    items.push({
      title,
      slug: extractSafeSlug(canonical.pathname),
      thumbnail,
      tag,
    });
  });

  return items;
}
```

If an authorized provider embeds public catalog metadata inside a `<script id="__NEXT_DATA__" type="application/json">` tag, parse it with `JSON.parse($("script#__NEXT_DATA__").text())` inside a `try/catch` block and validate the resulting structure with a schema validator (e.g., Zod) rather than relying on fragile regular expressions alone.

### C. Title Normalization & $\mathcal{O}(1)$ Source Routing Map

Maintain a composite routing key (`${providerId}:${providerAnimeId}`) and a careful title normalizer that strips noise tags (like `Sub Indo` or `Subtitle Indonesia`) without erasing sequel or season identifiers (`Season 2`, `Part 2`, `Movie`, `OVA`).

```ts
export interface SourceRouteEntry {
  providerId: string;
  providerAnimeId: string;
  updatedAt: number;
}

const sourceRouteMap = new Map<string, SourceRouteEntry>();

export function normalizeTitle(value = ""): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/\b(sub\s*indo|subtitle\s*indonesia|bd|batch)\b/gi, " ")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function getUnifiedOngoingCatalog(providers: CatalogProvider[]): Promise<Anime[]> {
  const results = await Promise.allSettled(
    providers.map((p) => (p.getHome ? p.getHome() : p.search("", 1).then((r) => ({ ongoing: r.items, complete: [] }))))
  );

  const seenKeys = new Set<string>();
  const merged: Anime[] = [];

  results.forEach((res, idx) => {
    if (res.status !== "fulfilled") {
      console.warn(`[Aiku Catalog] Provider ${providers[idx].id} failed:`, res.reason);
      return;
    }

    for (const anime of res.value.ongoing) {
      for (const ref of anime.sourceRefs) {
        const routeKey = `${ref.providerId}:${ref.providerAnimeId}`;
        sourceRouteMap.set(routeKey, {
          providerId: ref.providerId,
          providerAnimeId: ref.providerAnimeId,
          updatedAt: Date.now(),
        });
      }

      // Prefer matching by external AniList/MAL ID first, then normalized title + seasonYear
      const identityKey = anime.metadataIds.anilist
        ? `anilist:${anime.metadataIds.anilist}`
        : `${normalizeTitle(anime.title.preferred)}:${anime.seasonYear ?? "unknown"}`;

      if (!seenKeys.has(identityKey)) {
        seenKeys.add(identityKey);
        merged.push(anime);
      }
    }
  });

  return merged;
}
```

---

## 5. Step 2: AniList GraphQL Metadata & Catalog Fallback

Use AniList GraphQL to enrich catalog items with high-resolution `bannerImage`, `coverImage`, `genres`, `averageScore`, and `idMal` (which is required for AniSkip OP/ED lookup), as well as to provide a catalog fallback when other providers are unreachable.

```ts
const ANILIST_ENDPOINT = "https://graphql.anilist.co";

const ANILIST_CATALOG_QUERY = `
  query ($search: String, $genre: String, $page: Int = 1, $perPage: Int = 24) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        total
        currentPage
        lastPage
        hasNextPage
      }
      media(search: $search, genre: $genre, type: ANIME, sort: POPULARITY_DESC) {
        id
        idMal
        title { romaji english native }
        coverImage { extraLarge large }
        bannerImage
        description(asHtml: false)
        averageScore
        episodes
        status
        season
        seasonYear
        genres
      }
    }
  }
`;

export async function queryAniListCatalog(params: {
  search?: string;
  genre?: string;
  page?: number;
  perPage?: number;
}) {
  const response = await fetch(ANILIST_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      query: ANILIST_CATALOG_QUERY,
      variables: params,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (response.status === 429) {
    const retryAfter = response.headers.get("retry-after");
    throw new Error(`ANILIST_RATE_LIMITED (Retry-After: ${retryAfter ?? "unknown"})`);
  }

  if (!response.ok) {
    throw new Error(`ANILIST_HTTP_${response.status}`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error("ANILIST_GRAPHQL_ERROR");
  }

  return payload.data?.Page?.media ?? [];
}
```

### AniList Integration Rules
- Always pass variables via GraphQL `variables`; never interpolate user strings into the query.
- Check both HTTP status codes (`429`, `5xx`) and `payload.errors`.
- Cache metadata results aggressively (hours to days) keyed by `anilistId` or normalized title so page views do not exhaust rate limits.
- Render `description` as plain text or sanitize strictly; never inject raw HTML (`dangerouslySetInnerHTML`) from external metadata.

---

## 6. Step 3: Secure Media Delivery Pipeline (HTTP 206 & HLS)

When Aiku proxies authorized direct streams (such as self-hosted media, licensed CDN streams, or permitted open media), it must support byte-range scrubbing (`HTTP 206 Partial Content`), HLS manifest resolution, strict SSRF protection, and immediate socket cleanup on client disconnect.

### A. SSRF & Host Allowlist Guard

Never allow requests to localhost, loopback, link-local, cloud metadata (`169.254.169.254`), or private RFC 1918 networks, and enforce an explicit hostname allowlist per provider:

```ts
const ALLOWED_STREAM_HOSTS: Record<string, Set<string>> = {
  aikuCdn: new Set(["cdn.aiku.example.com", "hls.aiku.example.com"]),
};

export function isSafeAllowedStreamUrl(rawUrl: string, providerId: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "https:") return false;

    const host = u.hostname.toLowerCase();
    // Block loopback, private, and cloud metadata ranges
    if (
      host === "localhost" ||
      host === "[::1]" ||
      host.startsWith("127.") ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      host.startsWith("169.254.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return false;
    }

    const allowedHosts = ALLOWED_STREAM_HOSTS[providerId];
    if (!allowedHosts || !allowedHosts.has(host)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
```

> **Production Security Note:** In production, pair hostname allowlisting with DNS resolution checks or network-level egress rules so a domain cannot resolve to an internal IP address (DNS rebinding).

### B. Direct Stream & HLS Delivery Route (`/api/streams/:providerId/:streamId`)

Key engineering requirements:
1. Resolve `:providerId` and `:streamId` server-side via `resolveAuthorizedStream(providerId, streamId)`.
2. Send `"Accept-Encoding": "identity"` so upstream servers do not gzip-compress binary byte ranges.
3. Forward `Range` and `If-Range` headers for smooth timeline seeking (`206 Partial Content`).
4. Destroy the upstream stream immediately when the client disconnects or scrubs (`req.on("close")`) to prevent memory and file-descriptor leaks.
5. For authorized HLS (`.m3u8`) manifests, resolve relative segment/sub-playlist lines against the manifest's base URL and map them to signed/registered stream IDs so segment fetches remain authorized.

```ts
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Request, Response, NextFunction } from "express";

app.all(
  "/api/streams/:providerId/:streamId",
  async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD");
      return res.sendStatus(405);
    }

    const { providerId, streamId } = req.params;
    const playback = await resolveAuthorizedStream(providerId, streamId);
    if (!playback || !isSafeAllowedStreamUrl(playback.url, providerId)) {
      return res.status(404).json({ ok: false, error: { code: "STREAM_NOT_FOUND" } });
    }

    const controller = new AbortController();
    const abortUpstream = () => controller.abort();
    req.once("aborted", abortUpstream);
    req.once("close", () => {
      if (!res.writableEnded) abortUpstream();
    });

    try {
      const upstreamHeaders = new Headers({
        "Accept-Encoding": "identity",
      });
      const range = req.get("range");
      const ifRange = req.get("if-range");
      if (range) upstreamHeaders.set("Range", range);
      if (ifRange) upstreamHeaders.set("If-Range", ifRange);

      const connectTimeout = setTimeout(abortUpstream, 15_000);
      let upstream: globalThis.Response;
      try {
        upstream = await fetch(playback.url, {
          method: req.method,
          headers: upstreamHeaders,
          redirect: "manual",
          signal: controller.signal,
        });
      } finally {
        clearTimeout(connectTimeout);
      }

      if (upstream.status >= 300 && upstream.status < 400) {
        controller.abort();
        return res.status(502).json({ ok: false, error: { code: "UPSTREAM_REDIRECT_DISALLOWED" } });
      }

      const contentType = upstream.headers.get("content-type") || "";
      const isHlsManifest =
        playback.url.includes(".m3u8") ||
        contentType.includes("mpegurl");

      // Handle HLS Manifest rewriting via registered child stream IDs
      if (isHlsManifest && req.method === "GET") {
        const manifestText = await upstream.text();
        const baseUrl = new URL(playback.url);
        const lines = await Promise.all(
          manifestText.split("\n").map(async (line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) return line;
            const resolvedSegmentUrl = new URL(trimmed, baseUrl).toString();
            if (!isSafeAllowedStreamUrl(resolvedSegmentUrl, providerId)) {
              throw new Error("Disallowed HLS segment host");
            }
            const childStreamId = await registerAuthorizedChildStream(providerId, resolvedSegmentUrl);
            return `/api/streams/${encodeURIComponent(providerId)}/${encodeURIComponent(childStreamId)}`;
          })
        );

        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        res.setHeader("Cache-Control", "private, max-age=30");
        return res.status(200).send(lines.join("\n"));
      }

      // Forward status (200, 206, 416) and media headers
      res.status(upstream.status);
      for (const headerName of [
        "content-type",
        "content-length",
        "content-range",
        "accept-ranges",
        "etag",
        "last-modified",
      ]) {
        const val = upstream.headers.get(headerName);
        if (val) res.setHeader(headerName, val);
      }

      if (req.method === "HEAD" || !upstream.body) {
        return res.end();
      }

      await pipeline(Readable.fromWeb(upstream.body as any), res);
    } catch (error) {
      if (res.headersSent) {
        res.destroy(error as Error);
      } else {
        next(error);
      }
    }
  }
);
```

---

## 7. Step 4: AniSkip OP/ED Timestamp Integration

AniSkip provides community-submitted opening (`op`) and ending (`ed`) timestamps keyed by MyAnimeList ID (`idMal`) and episode number.

### Backend Route (`/api/episodes/:episodeId/skip-times`)

```ts
export interface SkipInterval {
  startTime: number;
  endTime: number;
  skipType: "op" | "ed";
}

export async function fetchAniSkipIntervals(
  malId: number,
  episodeNumber: number,
  episodeLengthSeconds = 0
): Promise<SkipInterval[]> {
  if (!Number.isFinite(malId) || malId <= 0) return [];

  const url = new URL(
    `/v2/skip-times/${malId}/${episodeNumber}`,
    "https://api.aniskip.com"
  );
  url.searchParams.append("types", "op");
  url.searchParams.append("types", "ed");
  url.searchParams.set(
    "episodeLength",
    episodeLengthSeconds > 0 ? episodeLengthSeconds.toFixed(3) : "0"
  );

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });

  if (response.status === 404) return [];
  if (!response.ok) {
    throw new Error(`ANISKIP_HTTP_${response.status}`);
  }

  const data = await response.json();
  if (!data?.found || !Array.isArray(data.results)) return [];

  return data.results
    .map((item: any) => ({
      startTime: Number(item?.interval?.startTime),
      endTime: Number(item?.interval?.endTime),
      skipType: item?.skipType === "ed" ? "ed" : "op",
    }))
    .filter(
      (i: SkipInterval) =>
        Number.isFinite(i.startTime) &&
        Number.isFinite(i.endTime) &&
        i.startTime >= 0 &&
        i.endTime > i.startTime
    );
}
```

### Interval Validation Rule
Always validate intervals against the actual loaded video `duration` (`interval.endTime <= video.duration + 1`) before displaying the **Skip Opening** / **Skip Ending** button.

---

## 8. Step 5: Aiku Frontend Cinema Player Implementation

The Aiku cinema player supports three playback modes (**Direct MP4**, **HLS via `Hls.js`**, and **Approved Sandboxed Iframe**) with automatic failover across playback options, AniSkip overlay buttons, throttled watch-progress persistence, and an accessible auto-next episode countdown.

### Player State Machine

```text
idle ──► loading ──► ready ──► playing ◄──► paused
                       │          │
                       │          ├──► buffering
                       │          ├──► seeking
                       │          └──► ended (triggers Auto-Next countdown)
                       └──► error (triggers bounded server failover)
```

### Reference Cinema Player Controller

```ts
import Hls from "hls.js";

export interface CinemaPlayerConfig {
  container: HTMLElement;
  skipButton: HTMLButtonElement | null;
  options: PlaybackOption[];
  skipIntervals: SkipInterval[];
  animeId: string;
  episodeId: string;
  episodeNumber: number;
  resumeTime?: number;
  onNextEpisode?: () => void;
  onAllSourcesFailed?: () => void;
}

export function createAikuCinemaPlayer(config: CinemaPlayerConfig) {
  let hlsInstance: Hls | null = null;
  let currentIndex = 0;
  let currentVideo: HTMLVideoElement | null = null;
  let destroyed = false;

  function cleanupMedia() {
    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }
    if (currentVideo) {
      currentVideo.pause();
      currentVideo.removeAttribute("src");
      currentVideo.load();
      currentVideo = null;
    }
    config.container.innerHTML = "";
    if (config.skipButton) {
      config.skipButton.style.display = "none";
    }
  }

  function triggerFailover(preserveTime?: number) {
    if (destroyed) return;
    if (currentIndex + 1 < config.options.length) {
      currentIndex += 1;
      mountCurrentOption(preserveTime ?? config.resumeTime ?? 0);
    } else {
      cleanupMedia();
      config.onAllSourcesFailed?.();
    }
  }

  function updateAniSkipUi(video: HTMLVideoElement) {
    const btn = config.skipButton;
    if (!btn) return;

    const duration = video.duration;
    const hit = config.skipIntervals.find(
      (i) =>
        (!Number.isFinite(duration) || i.endTime <= duration + 1) &&
        video.currentTime >= i.startTime &&
        video.currentTime < i.endTime
    );

    if (hit) {
      btn.textContent = hit.skipType === "op" ? "Skip Opening" : "Skip Ending";
      btn.style.display = "inline-flex";
      btn.onclick = () => {
        video.currentTime = hit.endTime;
      };
    } else {
      btn.style.display = "none";
    }
  }

  function mountCurrentOption(resumeAt = 0) {
    if (destroyed) return;
    cleanupMedia();

    const active = config.options[currentIndex];
    if (!active) {
      config.onAllSourcesFailed?.();
      return;
    }

    if (active.kind === "direct") {
      const video = document.createElement("video");
      currentVideo = video;
      video.controls = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.className = "aiku-video-surface";

      const streamUrl = `/api/streams/${encodeURIComponent(active.providerId)}/${encodeURIComponent(active.streamId)}`;

      // Attach validated subtitle tracks
      for (const sub of active.subtitles ?? []) {
        const track = document.createElement("track");
        track.kind = "subtitles";
        track.label = sub.label;
        track.srclang = sub.language;
        track.src = sub.url;
        if (sub.isDefault) track.default = true;
        video.appendChild(track);
      }

      if (active.streamType === "hls") {
        if (video.canPlayType("application/vnd.apple.mpegurl")) {
          // Native HLS support (Safari / iOS)
          video.src = streamUrl;
        } else if (Hls.isSupported()) {
          hlsInstance = new Hls({ maxBufferLength: 30 });
          hlsInstance.loadSource(streamUrl);
          hlsInstance.attachMedia(video);
          hlsInstance.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) {
              triggerFailover(video.currentTime || resumeAt);
            }
          });
        } else {
          triggerFailover(resumeAt);
          return;
        }
      } else {
        video.src = streamUrl;
      }

      video.addEventListener(
        "error",
        () => triggerFailover(video.currentTime || resumeAt),
        { once: true }
      );

      video.addEventListener(
        "loadedmetadata",
        () => {
          if (
            Number.isFinite(resumeAt) &&
            resumeAt > 0 &&
            Number.isFinite(video.duration) &&
            resumeAt < video.duration - 10
          ) {
            video.currentTime = resumeAt;
          }
        },
        { once: true }
      );

      let lastSavedAt = 0;
      video.addEventListener("timeupdate", () => {
        const now = Date.now();
        // Throttle watch progress writes to once every 10 seconds
        if (now - lastSavedAt >= 10_000 && video.currentTime > 5) {
          lastSavedAt = now;
          saveAikuWatchProgress({
            animeId: config.animeId,
            episodeId: config.episodeId,
            episodeNumber: config.episodeNumber,
            currentTime: video.currentTime,
            duration: video.duration || 0,
            updatedAt: new Date().toISOString(),
            completed:
              Number.isFinite(video.duration) &&
              video.duration > 0 &&
              video.currentTime / video.duration >= 0.9,
          });
        }
        updateAniSkipUi(video);
      });

      video.addEventListener("ended", () => {
        config.onNextEpisode?.();
      });

      config.container.appendChild(video);
    } else if (active.kind === "embed") {
      const iframe = document.createElement("iframe");
      iframe.src = active.embedUrl;
      iframe.title = `Aiku Episode ${config.episodeNumber} Player`;
      iframe.loading = "lazy";
      iframe.allowFullscreen = true;
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      iframe.setAttribute(
        "allow",
        "autoplay; fullscreen; picture-in-picture"
      );
      // Restrict ad popups while allowing standard player scripts
      iframe.setAttribute(
        "sandbox",
        "allow-scripts allow-same-origin allow-forms allow-presentation"
      );
      config.container.appendChild(iframe);
    }
  }

  mountCurrentOption(config.resumeTime ?? 0);

  return {
    selectOption(index: number) {
      if (index >= 0 && index < config.options.length) {
        const resumeAt = currentVideo?.currentTime ?? config.resumeTime ?? 0;
        currentIndex = index;
        mountCurrentOption(resumeAt);
      }
    },
    destroy() {
      destroyed = true;
      cleanupMedia();
    },
  };
}
```

### Watch Progress Persistence Helper

```ts
const PROGRESS_STORAGE_KEY = "aiku.watch-progress.v1";

export function saveAikuWatchProgress(entry: WatchProgress): void {
  if (
    !Number.isFinite(entry.currentTime) ||
    entry.currentTime < 0 ||
    !Number.isFinite(entry.duration) ||
    entry.duration < 0
  ) {
    return;
  }

  try {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
    const map: Record<string, WatchProgress> = raw ? JSON.parse(raw) : {};
    map[entry.episodeId] = entry;
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors gracefully
  }
}
```

---

## 9. Common Pitfalls & Engineering Gotchas

1. **Unclosed Upstream Sockets Leak Memory:**
   When a viewer scrubs the `<video>` timeline, the browser fires multiple overlapping `Range: bytes=...` requests and aborts old ones. Always bind `req.once("close", ...)` / `AbortController` in the streaming route and use `stream/promises` `pipeline()` so upstream connections are destroyed immediately when the client disconnects.
2. **Compressed Upstream Responses Break Byte-Range Piping:**
   Always send `"Accept-Encoding": "identity"` in upstream stream proxy requests so the upstream CDN does not apply gzip/brotli compression to binary byte ranges.
3. **Relative Paths in `.m3u8` Playlists:**
   Proxying only the master `.m3u8` playlist will fail when `Hls.js` tries to fetch relative `.ts` or `.m4s` segment lines against your application domain. Always resolve non-`#` lines inside `.m3u8` manifests against the manifest's base URL and route them through registered/authorized stream identifiers.
4. **Expiring Signed CDN Tokens:**
   Direct stream URLs often include time-bound or IP-bound query tokens (`?token=...&expires=...`). Never cache resolved direct stream URLs for more than 10–15 minutes. Cache catalog and AniList metadata for hours, but resolve episode playback options fresh or with a short TTL.
5. **Media Element Memory Leaks in SPA Navigation:**
   When a user navigates between episodes in React/Next.js/Vue, failing to call `hlsInstance.destroy()`, `video.pause()`, `video.removeAttribute("src")`, and `video.load()` on unmount causes background audio playback and high memory usage.

---

## 10. Caching, API Design & Observability

### Recommended Caching TTLs

| Data Category | Recommended TTL | Notes |
|---|---|---|
| Genre List | 24 hours | Rarely changes |
| AniList Metadata (`idMal`, banners) | 12–24 hours | Key by `anilistId` or normalized title |
| Ongoing Catalog / Home | 5–15 minutes | Use `stale-while-revalidate` |
| Completed Anime Details | 6–12 hours | Episode list is static |
| AniSkip OP/ED Timestamps | 6–24 hours | Key by `malId + episodeNumber` |
| Resolved Playback Options | 5–10 minutes | Tokens expire quickly |
| User Watch Progress | Per-user / Local | Never put in shared public cache |

### Structured Logging & Redaction

Log every external provider call with:
- `requestId`, `providerId`, `operation`, `durationMs`, `statusCode`, `cacheHit`, `errorCode`.
- **Never log** full signed stream URLs, query tokens, cookies, or `Authorization` headers.

---

## 11. Testing Strategy & Definition of Done

### Required Test Coverage
- **Unit Tests:** `normalizeTitle`, `extractSafeSlug`, AniSkip interval validation, `isSafeAllowedStreamUrl` (rejecting `localhost`, `127.0.0.1`, `169.254.169.254`, `192.168.x.x`, `10.x.x.x`, non-HTTPS, and unapproved domains), and watch-progress storage validation.
- **Integration Tests:** Provider adapter parsing against saved HTML/JSON fixtures, AniList GraphQL error & `429` handling, HTTP 206 `Range` streaming (`200`, `206`, `416`, `HEAD`, and client abort cleanup).
- **E2E / Manual Player Verification:** Search $\rightarrow$ Anime Detail $\rightarrow$ Episode Playback $\rightarrow$ Seek/Scrub $\rightarrow$ AniSkip OP/ED skip $\rightarrow$ Server Failover $\rightarrow$ Resume Progress $\rightarrow$ Unmount cleanup.

### Completion Gate Checklist
```text
[ ] Type check passes (tsc --noEmit)
[ ] Linter passes
[ ] Unit & integration tests pass
[ ] Production build succeeds
[ ] SSRF and host-allowlist checks verified on all external fetch routes
[ ] Media & HLS cleanup verified on episode change / unmount
```