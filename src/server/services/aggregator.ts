import type { Anime } from "../../shared/anime.js";

export interface RouteEntry {
  providerId: string;
  animeId: string;
  updatedAt: number;
}

export function normalizeTitle(rawTitle = ""): string {
  return rawTitle
    .toLowerCase()
    .replace(/\s*(sub(?:title)?\s*indo(?:nesia)?|bd|batch|ova|ona|s\d+|season\s*\d+)\b.*$/gi, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export class CatalogAggregator {
  private readonly sourceRouteMap = new Map<string, RouteEntry>();

  public registerCatalog(items: Anime[]): Anime[] {
    const seenNormalizedTitles = new Set<string>();
    const deduplicated: Anime[] = [];

    for (const anime of items) {
      const now = Date.now();
      this.sourceRouteMap.set(anime.id, {
        providerId: anime.sourceProvider,
        animeId: anime.id,
        updatedAt: now,
      });
      this.sourceRouteMap.set(anime.slug, {
        providerId: anime.sourceProvider,
        animeId: anime.id,
        updatedAt: now,
      });

      const normKey = normalizeTitle(anime.title.romaji);
      if (!seenNormalizedTitles.has(normKey)) {
        seenNormalizedTitles.add(normKey);
        deduplicated.push(anime);
      }
    }

    return deduplicated;
  }

  public resolveRoute(idOrSlug: string): RouteEntry | null {
    return this.sourceRouteMap.get(idOrSlug) ?? null;
  }

  public size(): number {
    return this.sourceRouteMap.size;
  }
}
