import type { Anime } from "../../shared/anime.js";
import type { CatalogProvider } from "../providers/externalProvider.js";

export interface RouteEntry {
  providerId: string;
  animeId: string;
  updatedAt: number;
}

export function normalizeTitle(rawTitle = ""): string {
  return rawTitle
    .toLowerCase()
    .replace(
      /\s*(sub(?:title)?\s*indo(?:nesia)?|bd|batch|ova|ona|s\d+|season\s*\d+)\b.*$/gi,
      ""
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export class CatalogAggregator {
  private readonly sourceRouteMap = new Map<string, RouteEntry>();
  private readonly providers = new Map<string, CatalogProvider>();
  private cachedCatalog: Anime[] = [];
  private cacheExpiresAt = 0;
  private static readonly CATALOG_TTL_MS = 5 * 60 * 1000; // 5 menit

  public registerProvider(provider: CatalogProvider): void {
    this.providers.set(provider.id, provider);
  }

  public registerCatalog(items: Anime[]): Anime[] {
    const seenNormalizedTitles = new Set<string>();
    const deduplicated: Anime[] = [];

    for (const anime of items) {
      const now = Date.now();
      const entry: RouteEntry = {
        providerId: anime.sourceProvider,
        animeId: anime.id,
        updatedAt: now,
      };
      this.sourceRouteMap.set(anime.id, entry);
      this.sourceRouteMap.set(anime.slug, entry);

      const normKey = normalizeTitle(anime.title.romaji);
      if (!seenNormalizedTitles.has(normKey)) {
        seenNormalizedTitles.add(normKey);
        deduplicated.push(anime);
      }
    }

    return deduplicated;
  }

  public async syncAllProviders(
    curatedItems: Anime[],
    forceRefresh = false
  ): Promise<Anime[]> {
    if (
      !forceRefresh &&
      this.cachedCatalog.length > 0 &&
      this.cacheExpiresAt > Date.now()
    ) {
      return this.cachedCatalog;
    }

    const externalList = [...this.providers.values()];
    const settled = await Promise.allSettled(
      externalList.map((provider) => provider.fetchCatalog())
    );

    const externalItems: Anime[] = [];
    for (const res of settled) {
      if (res.status === "fulfilled") {
        externalItems.push(...res.value);
      }
    }

    // Prioritaskan curatedItems terlebih dahulu agar metadata editorial tetap utuh
    const merged = this.registerCatalog([...curatedItems, ...externalItems]);
    this.cachedCatalog = merged;
    this.cacheExpiresAt = Date.now() + CatalogAggregator.CATALOG_TTL_MS;

    return merged;
  }

  public resolveRoute(idOrSlug: string): RouteEntry | null {
    return this.sourceRouteMap.get(idOrSlug) ?? null;
  }

  public getProvider(providerId: string): CatalogProvider | undefined {
    return this.providers.get(providerId);
  }

  public size(): number {
    return this.sourceRouteMap.size;
  }
}
