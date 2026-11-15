import * as cheerio from "cheerio";
import type { StreamMode } from "../../shared/anime.js";
import { SERVER_CONFIG } from "../config.js";
import { isSafeAllowedStreamUrl } from "../security/ssrfGuard.js";

export interface ExtractedStream {
  url: string;
  mode: Extract<StreamMode, "hls" | "mp4">;
}

const BASE62_ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

function encodeRadix(num: number, radix: number): string {
  const prefix = num < radix ? "" : encodeRadix(Math.floor(num / radix), radix);
  const remainder = num % radix;
  const digit =
    remainder > 35
      ? String.fromCharCode(remainder + 29)
      : (BASE62_ALPHABET[remainder] ?? "");
  return prefix + digit;
}

/**
 * Mendekode skrip terkompresi pola Dean Edwards P.A.C.K.E.R.
 */
export function unpackDeanEdwards(packedHtml: string): string {
  const match = packedHtml.match(
    /\}\('(.+?)',(\d+),(\d+),'(.+?)'\.split\('\|'\)/s
  );
  if (!match || !match[1] || !match[2] || !match[3] || !match[4]) {
    return packedHtml;
  }

  let payload = match[1];
  const radix = Number.parseInt(match[2], 10);
  let count = Number.parseInt(match[3], 10);
  const words = match[4].split("|");

  if (!Number.isFinite(radix) || radix < 2 || radix > 62 || !Number.isFinite(count)) {
    return packedHtml;
  }

  while (count > 0) {
    count -= 1;
    const token = words[count];
    if (token) {
      const encodedKey = encodeRadix(count, radix);
      payload = payload.replace(new RegExp(`\\b${encodedKey}\\b`, "g"), token);
    }
  }

  return payload;
}

/**
 * Mengekstrak URL stream langsung (.m3u8 atau .mp4) dari halaman iframe/player.
 * Dibatasi maksimal 3500ms agar 1 mirror yang lambat tidak menghambat mirror lainnya.
 */
export async function extractDirectStream(
  playerUrl: string,
  referer: string,
  timeoutMs = 3500
): Promise<ExtractedStream | null> {
  if (!isSafeAllowedStreamUrl(playerUrl)) {
    return null;
  }

  try {
    const response = await fetch(playerUrl, {
      headers: {
        "User-Agent": SERVER_CONFIG.chromeUserAgent,
        Referer: referer,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) return null;

    const rawHtml = await response.text();
    const unpackedHtml = unpackDeanEdwards(rawHtml);
    const $ = cheerio.load(unpackedHtml);

    let candidate =
      $("video source").attr("src") ?? $("video").attr("src") ?? null;

    if (!candidate) {
      const hlsMatch = unpackedHtml.match(
        /(?:file|src|url)\s*[:=]\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i
      );
      const mp4Match = unpackedHtml.match(
        /(?:videoURL|file|src|url)\s*[:=]\s*["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i
      );
      candidate = hlsMatch?.[1] ?? mp4Match?.[1] ?? null;
    }

    if (!candidate) return null;

    const cleanUrl = candidate.replace(/&amp;/g, "&").trim();
    if (!isSafeAllowedStreamUrl(cleanUrl)) {
      return null;
    }

    return {
      url: cleanUrl,
      mode: cleanUrl.toLowerCase().includes(".m3u8") ? "hls" : "mp4",
    };
  } catch {
    return null;
  }
}
