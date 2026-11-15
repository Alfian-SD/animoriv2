import type { Anime } from "../../shared/anime.js";
import {
  type CatalogProvider,
  isChineseDonghua,
} from "../providers/externalProvider.js";
import { enrichScrapedItemsWithAniList } from "./anilist.js";

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

  public getProvider(providerId: string): CatalogProvider | undefined {
    return this.providers.get(providerId);
  }

  public getProviders(): CatalogProvider[] {
    return [...this.providers.values()];
  }

  public resolveRoute(idOrSlug: string): RouteEntry | null {
    return this.sourceRouteMap.get(idOrSlug) ?? null;
  }

  public size(): number {
    return this.sourceRouteMap.size;
  }

  public registerCatalog(items: Anime[]): Anime[] {
    const seenNormalizedTitles = new Map<string, Anime>();
    const seenAniListIds = new Map<number, Anime>();
    const deduplicated: Anime[] = [];

    for (const anime of items) {
      // 1. Strict Anti-Donghua gate: buang semua animasi asal China
      if (
        anime.countryOfOrigin === "CN" ||
        isChineseDonghua(anime.title.romaji, anime.genres) ||
        isChineseDonghua(anime.title.english ?? "", anime.genres)
      ) {
        continue;
      }

      const now = Date.now();
      const entry: RouteEntry = {
        providerId: anime.sourceProvider,
        animeId: anime.id,
        updatedAt: now,
      };
      this.sourceRouteMap.set(anime.id, entry);
      this.sourceRouteMap.set(anime.slug, entry);
      if (anime.externalUrl) {
        this.sourceRouteMap.set(anime.externalUrl, entry);
      }

      const normKey = normalizeTitle(anime.title.romaji);
      let existing: Anime | undefined;

      if (anime.anilistId && seenAniListIds.has(anime.anilistId)) {
        existing = seenAniListIds.get(anime.anilistId);
      } else if (seenNormalizedTitles.has(normKey)) {
        existing = seenNormalizedTitles.get(normKey);
      }

      if (existing) {
        // Saling melengkapi: pertahankan metadata & artwork AniList/Curated
        // sambil menyimpan rute provider scraper untuk episode streaming
        if (
          anime.sourceProvider !== "curated" &&
          anime.sourceProvider !== "anilist"
        ) {
          if (!existing.externalUrl && anime.externalUrl) {
            existing.externalUrl = anime.externalUrl;
          }
          this.sourceRouteMap.set(anime.id, entry);
          this.sourceRouteMap.set(anime.slug, entry);
        } else if (
          existing.sourceProvider !== "curated" &&
          existing.sourceProvider !== "anilist"
        ) {
          existing.anilistId = anime.anilistId;
          existing.malId = anime.malId ?? existing.malId;
          existing.countryOfOrigin = anime.countryOfOrigin ?? "JP";
          existing.title = anime.title;
          existing.synopsis = anime.synopsis;
          existing.score = anime.score;
          existing.genres = anime.genres;
          existing.studio = anime.studio;
          existing.artwork = anime.artwork;
        }
        continue;
      }

      seenNormalizedTitles.set(normKey, anime);
      if (anime.anilistId) {
        seenAniListIds.set(anime.anilistId, anime);
      }
      deduplicated.push(anime);
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

    const rawScrapedItems: Anime[] = [];
    for (const res of settled) {
      if (res.status === "fulfilled" && Array.isArray(res.value)) {
        rawScrapedItems.push(...res.value);
      }
    }

    // Filter awal anti-donghua pada hasil scraper
    const nonChineseScraped = rawScrapedItems.filter(
      (item) =>
        item.countryOfOrigin !== "CN" &&
        !isChineseDonghua(item.title.romaji, item.genres) &&
        !isChineseDonghua(item.title.english ?? "", item.genres)
    );

    // Identifikasi judul scraper yang belum ada di kurasi
    const curatedNormTitles = new Set(
      curatedItems.map((c) => normalizeTitle(c.title.romaji))
    );
    const uniqueToScrapers = nonChineseScraped.filter(
      (s) => !curatedNormTitles.has(normalizeTitle(s.title.romaji))
    );

    // Perkaya item unik dari scraper lewat AniList GraphQL
    let enrichedScraped: Anime[] = [];
    if (uniqueToScrapers.length > 0) {
      try {
        enrichedScraped = await enrichScrapedItemsWithAniList(uniqueToScrapers);
      } catch {
        enrichedScraped = uniqueToScrapers;
      }
    }

    const validEnriched = enrichedScraped.filter(
      (item) =>
        item.countryOfOrigin !== "CN" &&
        !isChineseDonghua(item.title.romaji, item.genres)
    );

    const merged = this.registerCatalog([
      ...curatedItems,
      ...nonChineseScraped,
      ...validEnriched,
    ]);

    this.cachedCatalog = merged;
    this.cacheExpiresAt = Date.now() + CatalogAggregator.CATALOG_TTL_MS;

    return merged;
  }
}
