import type { SkipInterval } from "../../shared/anime.js";
import { SERVER_CONFIG } from "../config.js";

export function validateSkipIntervals(rawResults: unknown[]): SkipInterval[] {
  if (!Array.isArray(rawResults)) return [];

  const valid: SkipInterval[] = [];
  for (const item of rawResults) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const skipType = record.skipType;
    const interval = record.interval as Record<string, unknown> | undefined;
    const episodeLength = Number(record.episodeLength ?? 0);

    if (skipType !== "op" && skipType !== "ed") continue;
    if (!interval || typeof interval !== "object") continue;

    const startTime = Number(interval.startTime);
    const endTime = Number(interval.endTime);

    if (
      Number.isFinite(startTime) &&
      Number.isFinite(endTime) &&
      startTime >= 0 &&
      endTime > startTime &&
      endTime - startTime <= 300
    ) {
      valid.push({
        skipType,
        interval: { startTime, endTime },
        episodeLength: Number.isFinite(episodeLength) && episodeLength >= 0 ? episodeLength : 0,
      });
    }
  }

  return valid;
}

export async function fetchAniSkipIntervals(
  malId: number,
  episodeNumber: number
): Promise<SkipInterval[]> {
  if (!Number.isInteger(malId) || malId <= 0 || episodeNumber <= 0) {
    return [];
  }

  const url = `https://api.aniskip.com/v2/skip-times/${malId}/${episodeNumber}?types[]=op&types[]=ed&episodeLength=0`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(SERVER_CONFIG.metadataTimeoutMs),
      headers: { Accept: "application/json" },
    });

    if (!res.ok) return [];
    const data = (await res.json()) as { found?: boolean; results?: unknown[] };
    if (!data.found || !Array.isArray(data.results)) return [];

    return validateSkipIntervals(data.results);
  } catch {
    return [];
  }
}
