import { Router, type Request, type Response } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { isSafeAllowedStreamUrl } from "../security/ssrfGuard.js";
import { SERVER_CONFIG } from "../config.js";

export const streamRouter = Router();

export function rewriteHlsManifest(
  manifestText: string,
  baseManifestUrl: string,
  providerId: string,
  streamId: string
): string {
  const baseUrl = new URL(baseManifestUrl);
  const proxyPrefix = `/api/streams/${encodeURIComponent(providerId)}/${encodeURIComponent(streamId)}?url=`;

  return manifestText
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      // Rewrite URI="..." di dalam tag seperti #EXT-X-MAP atau #EXT-X-KEY
      if (trimmed.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (_, rawUri: string) => {
          const absUri = new URL(rawUri, baseUrl).href;
          return `URI="${proxyPrefix}${encodeURIComponent(absUri)}"`;
        });
      }

      const absSegmentUrl = new URL(trimmed, baseUrl).href;
      return `${proxyPrefix}${encodeURIComponent(absSegmentUrl)}`;
    })
    .join("\n");
}

function resolveUpstreamReferer(targetUrl: string): string {
  if (targetUrl.includes("nimegami") || targetUrl.includes("berkasdrive")) {
    return "https://nimegami.id/";
  }
  if (targetUrl.includes("samehadaku")) {
    return "https://samehadaku.email/";
  }
  return "https://desustream.net/";
}

// GET /api/streams/embed-proxy
streamRouter.get("/embed-proxy", async (req: Request, res: Response) => {
  const targetUrl = typeof req.query.url === "string" ? req.query.url : "";

  if (!isSafeAllowedStreamUrl(targetUrl)) {
    res.status(400).json({ error: "Invalid or forbidden embed URL" });
    return;
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      headers: {
        "User-Agent": SERVER_CONFIG.chromeUserAgent,
        Referer: resolveUpstreamReferer(targetUrl),
      },
      signal: AbortSignal.timeout(SERVER_CONFIG.metadataTimeoutMs),
    });

    if (!upstreamRes.ok) {
      res.status(502).json({ error: `Upstream embed responded with ${upstreamRes.status}` });
      return;
    }

    let html = await upstreamRes.text();
    const parsedUrl = new URL(targetUrl);
    const baseTag = `<base href="${parsedUrl.origin}/">`;

    if (!html.includes("<base ") && !html.includes("<base>")) {
      if (/<head[^>]*>/i.test(html)) {
        html = html.replace(/(<head[^>]*>)/i, `$1\n  ${baseTag}`);
      } else {
        html = `${baseTag}\n${html}`;
      }
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-store");
    // Explicitly do not forward X-Frame-Options or Content-Security-Policy to permit iframe embedding
    res.status(200).send(html);
  } catch (err) {
    res.status(502).json({
      error: "Embed proxy failed to retrieve content",
      detail: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

streamRouter.get("/:providerId/:streamId", async (req: Request, res: Response) => {
  const rawProviderId = req.params.providerId;
  const rawStreamId = req.params.streamId;
  const providerId = (Array.isArray(rawProviderId) ? rawProviderId[0] : rawProviderId) ?? "curated";
  const streamId = (Array.isArray(rawStreamId) ? rawStreamId[0] : rawStreamId) ?? "default";
  const targetUrl = typeof req.query.url === "string" ? req.query.url : "";

  if (!isSafeAllowedStreamUrl(targetUrl)) {
    res.status(400).json({ error: "Invalid or forbidden stream URL" });
    return;
  }

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), SERVER_CONFIG.streamTimeoutMs);

  const upstreamHeaders: Record<string, string> = {
    "User-Agent": SERVER_CONFIG.chromeUserAgent,
    Referer: resolveUpstreamReferer(targetUrl),
    "Accept-Encoding": "identity",
  };

  if (typeof req.headers.range === "string") {
    upstreamHeaders.Range = req.headers.range;
  }
  if (typeof req.headers["if-range"] === "string") {
    upstreamHeaders["If-Range"] = req.headers["if-range"];
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: "GET",
      headers: upstreamHeaders,
      signal: abortController.signal,
    });

    clearTimeout(timeoutId);

    if (!upstreamRes.ok && upstreamRes.status !== 206) {
      res.status(502).json({ error: `Upstream responded with ${upstreamRes.status}` });
      return;
    }

    const contentType = upstreamRes.headers.get("content-type") ?? "";
    const isHls =
      targetUrl.includes(".m3u8") ||
      contentType.includes("mpegurl") ||
      contentType.includes("x-mpegURL");

    if (isHls) {
      const rawManifest = await upstreamRes.text();
      const rewritten = rewriteHlsManifest(rawManifest, targetUrl, providerId, streamId);

      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "no-store");
      res.status(200).send(rewritten);
      return;
    }

    if (!upstreamRes.body) {
      res.status(502).json({ error: "Empty upstream media stream" });
      return;
    }

    const nodeStream = Readable.fromWeb(upstreamRes.body as unknown as WebReadableStream);

    req.once("close", () => {
      abortController.abort();
      if (!nodeStream.destroyed) {
        nodeStream.destroy();
      }
    });

    res.status(upstreamRes.status);
    res.setHeader("Content-Type", contentType || "video/mp4");
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=7200, stale-while-revalidate=86400");

    const contentLength = upstreamRes.headers.get("content-length");
    if (contentLength) res.setHeader("Content-Length", contentLength);

    const contentRange = upstreamRes.headers.get("content-range");
    if (contentRange) res.setHeader("Content-Range", contentRange);

    await pipeline(nodeStream, res);
  } catch (err) {
    clearTimeout(timeoutId);
    if (!res.headersSent) {
      res.status(502).json({
        error: "Stream proxy pipeline interrupted",
        detail: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }
});
