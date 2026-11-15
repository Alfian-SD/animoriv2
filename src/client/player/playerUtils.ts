export function resolveResumeTimestamp(
  savedTime: number,
  duration: number
): number | null {
  if (
    Number.isFinite(savedTime) &&
    savedTime > 5 &&
    Number.isFinite(duration) &&
    duration > 0 &&
    savedTime < duration - 15
  ) {
    return Math.floor(savedTime);
  }
  return null;
}

export function resolveEmbedProxyUrl(streamUrl: string): string {
  return `/api/streams/embed-proxy?url=${encodeURIComponent(streamUrl)}`;
}

export function resolveNextFallbackIndex(
  currentIndex: number,
  totalOptions: number
): number | null {
  if (currentIndex + 1 < totalOptions) {
    return currentIndex + 1;
  }
  return null;
}

export function formatQualityLabel(serverName: string, quality: string): string {
  const cleanServer = serverName.trim();
  const cleanQuality = quality.trim();
  return `${cleanServer} · ${cleanQuality}`;
}
