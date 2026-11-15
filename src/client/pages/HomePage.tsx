import React, { useState, useEffect } from "react";
import type { Anime, WatchProgress } from "@shared/anime.js";
import { Artwork } from "../ui/art.js";
import { FlipAnimeCard } from "../ui/FlipAnimeCard.js";
import { Button, Card } from "../ui/components.js";
import { PlayIcon, BookmarkIcon, CheckIcon } from "../ui/icons.js";
import { HomeLoadingSkeleton } from "../ui/HomeLoadingSkeleton.js";

interface HomePageProps {
  catalog: Anime[];
  onSelectAnime: (anime: Anime) => void;
  onWatchEpisode: (anime: Anime, epNumber: number) => void;
}

interface HomeData {
  trending: Anime[];
  recentlyUpdated: Anime[];
  currentSeason: Anime[];
}

// In-memory module-level cache (TTL 5 minutes) to eliminate flash of stale content
let cachedHomeData: { data: HomeData; expiresAt: number } | null = null;
const CLIENT_HOME_CACHE_TTL_MS = 5 * 60 * 1000;

const PROGRESS_STORAGE_KEY = "aiku.watch-progress.v1";

export const HomePage: React.FC<HomePageProps> = ({ catalog, onSelectAnime, onWatchEpisode }) => {
  // 1. All State Hooks
  const [heroIdx, setHeroIdx] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [continueWatching, setContinueWatching] = useState<Array<{ anime: Anime; progress: WatchProgress }>>([]);
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());

  // Check if cache is fresh on initial mount
  const initialData =
    cachedHomeData && cachedHomeData.expiresAt > Date.now() ? cachedHomeData.data : null;

  const [homeData, setHomeData] = useState<HomeData | null>(initialData);
  const [isLoadingHome, setIsLoadingHome] = useState<boolean>(!initialData);

  // 2. Fetch real-time home highlights from AniList + Scrapers
  useEffect(() => {
    let isMounted = true;

    // If cache is fresh, skip re-fetching to guarantee instant render
    if (cachedHomeData && cachedHomeData.expiresAt > Date.now()) {
      setHomeData(cachedHomeData.data);
      setIsLoadingHome(false);
      return;
    }

    async function loadHome() {
      try {
        const res = await fetch("/api/catalog/home");
        if (res.ok) {
          const json = await res.json();
          if (isMounted && json.ok) {
            const data: HomeData = {
              trending: json.trending || [],
              recentlyUpdated: json.recentlyUpdated || [],
              currentSeason: json.currentSeason || [],
            };
            cachedHomeData = {
              data,
              expiresAt: Date.now() + CLIENT_HOME_CACHE_TTL_MS,
            };
            setHomeData(data);
            setIsLoadingHome(false);
            return;
          }
        }
      } catch (err) {
        console.warn("Could not load /api/catalog/home, using fallback:", err);
      }

      // Offline / network failure fallback
      if (isMounted) {
        setIsLoadingHome(false);
      }
    }
    loadHome();
    return () => {
      isMounted = false;
    };
  }, []);

  // Safe data derivation before rotation hook
  const trendingAnime =
    homeData?.trending && homeData.trending.length > 0
      ? homeData.trending
      : Array.isArray(catalog) && catalog.length > 0
        ? [...catalog].sort((a, b) => b.score - a.score).slice(0, 10)
        : [];

  // Hero anime pool: use top 5 trending titles
  const heroItems = trendingAnime.slice(0, 5);

  // 3. Automatic hero rotation effect with internal guard (never conditionally mounted)
  useEffect(() => {
    if (isLoadingHome || !homeData || isPaused || heroItems.length <= 1) return;
    const isReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (isReduced) return;

    const timer = setInterval(() => {
      setHeroIdx((prev) => (prev + 1) % heroItems.length);
    }, 7000);
    return () => clearInterval(timer);
  }, [isLoadingHome, homeData, isPaused, heroItems.length]);

  // 4. Hero index bounds check
  useEffect(() => {
    if (heroIdx >= heroItems.length && heroItems.length > 0) {
      setHeroIdx(0);
    }
  }, [heroItems.length, heroIdx]);

  // 5. Load continue watching from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
      if (raw && Array.isArray(catalog) && catalog.length > 0) {
        const map = JSON.parse(raw) as Record<string, WatchProgress>;
        const list: Array<{ anime: Anime; progress: WatchProgress }> = [];
        for (const prog of Object.values(map)) {
          const match = catalog.find((a) => a.id === prog.animeId);
          if (match && prog.currentTime > 5 && prog.currentTime < prog.duration - 15) {
            list.push({ anime: match, progress: prog });
          }
        }
        setContinueWatching(list.slice(0, 4));
      }
    } catch {
      // ignore
    }
  }, [catalog]);

  const toggleWatchlist = (id: string) => {
    setWatchlist((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Safe fallbacks for hero and listing sections
  const currentHero = heroItems[heroIdx] ?? heroItems[0] ?? catalog[0] ?? null;

  const recentlyUpdated =
    homeData?.recentlyUpdated && homeData.recentlyUpdated.length > 0
      ? homeData.recentlyUpdated
      : Array.isArray(catalog)
        ? catalog.slice(0, 8)
        : [];

  const seasonalAnime =
    homeData?.currentSeason && homeData.currentSeason.length > 0
      ? homeData.currentSeason
      : Array.isArray(catalog)
        ? catalog.filter((a) => a.season === "FALL")
        : [];

  const recommendedAnime = Array.isArray(catalog)
    ? catalog.filter((a) => a.score >= 9.0).slice(0, 6)
    : [];

  // Conditional early return ONLY after ALL hooks have been executed unconditionally
  if (isLoadingHome && !homeData) {
    return <HomeLoadingSkeleton />;
  }

  if (!currentHero) {
    return <HomeLoadingSkeleton />;
  }

  return (
    <div className="space-y-16 pb-20">
      {/* HERO SECTION */}
      <section
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        className="relative min-h-[460px] md:min-h-[520px] rounded-poster overflow-hidden border border-line bg-surface grid grid-cols-1 md:grid-cols-12 items-stretch"
      >
        {/* Left: Titles & Actions */}
        <div className="md:col-span-7 p-6 md:p-12 flex flex-col justify-end z-10 space-y-6">
          <div className="space-y-2">
            <h1 className="font-serif text-4xl sm:text-5xl md:text-6xl text-text leading-tight tracking-tight text-left">
              {currentHero.title.romaji}
            </h1>
            <p className="text-text-2 text-sm md:text-base line-clamp-3 max-w-xl">
              {currentHero.synopsis}
            </p>
            <div className="text-xs text-text-3 font-mono pt-1">
              {currentHero.studio} · {currentHero.seasonYear} · {currentHero.genres.join(", ")}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="primary"
              size="lg"
              onClick={() => onWatchEpisode(currentHero, 1)}
            >
              <PlayIcon size={16} />
              Watch episode 1
            </Button>

            <Button
              variant="secondary"
              size="lg"
              onClick={() => onSelectAnime(currentHero)}
            >
              Details
            </Button>

            <Button
              variant="ghost"
              size="lg"
              onClick={() => toggleWatchlist(currentHero.id)}
              aria-label="Add to watchlist"
            >
              {watchlist.has(currentHero.id) ? (
                <CheckIcon size={18} className="text-accent" />
              ) : (
                <BookmarkIcon size={18} />
              )}
            </Button>

            {/* Rotation Bars with Pause indicator */}
            <div className="ml-auto flex items-center gap-1.5" aria-label="Hero navigation">
              {heroItems.map((item, idx) => (
                <button
                  key={item.id}
                  onClick={() => setHeroIdx(idx)}
                  className={`h-1 rounded-full transition-all duration-200 ${
                    heroIdx === idx ? "w-8 bg-accent" : "w-4 bg-line hover:bg-text-3"
                  }`}
                  aria-label={`Slide ${idx + 1}`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right: Artwork */}
        <div className="md:col-span-5 h-[280px] md:h-full relative overflow-hidden border-t md:border-t-0 md:border-l border-line">
          <Artwork anime={currentHero} aspect="backdrop" className="w-full h-full" />
        </div>
      </section>

      {/* CONTINUE WATCHING (Wide Cards with Progress Bar) */}
      {continueWatching.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-serif text-2xl text-text">Continue watching</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {continueWatching.map(({ anime, progress }) => {
              const pct = Math.min(100, Math.round((progress.currentTime / (progress.duration || 1)) * 100));
              return (
                <Card
                  key={progress.episodeId}
                  onClick={() => onWatchEpisode(anime, progress.episodeNumber)}
                  className="group"
                >
                  <div className="aspect-video relative overflow-hidden">
                    <Artwork anime={anime} aspect="thumb" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <div className="w-10 h-10 rounded-full bg-accent text-accent-ink flex items-center justify-center">
                        <PlayIcon size={18} />
                      </div>
                    </div>
                  </div>
                  {/* Progress Line */}
                  <div className="h-1 w-full bg-line">
                    <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="p-3">
                    <div className="text-sm font-medium text-text truncate">{anime.title.romaji}</div>
                    <div className="text-xs text-text-3">Episode {progress.episodeNumber} · {pct}%</div>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* TRENDING (Ranked Posters 1-10 with 3D Flip Cards) */}
      <section className="space-y-4">
        <h2 className="font-serif text-2xl text-text">Trending</h2>
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-none">
          {trendingAnime.map((anime, idx) => (
            <FlipAnimeCard
              key={anime.id}
              anime={anime}
              rank={idx + 1}
              onClick={() => onSelectAnime(anime)}
              className="w-[165px] sm:w-[185px] lg:w-[200px] shrink-0"
            />
          ))}
        </div>
      </section>

      {/* RECENTLY UPDATED (Two-Column List) */}
      <section className="space-y-4">
        <h2 className="font-serif text-2xl text-text">Recently updated</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {recentlyUpdated.map((anime) => {
            const latestEp =
              anime.episodes && anime.episodes.length > 0
                ? anime.episodes[anime.episodes.length - 1]
                : null;
            const epNumber = latestEp?.number || 1;
            const epTitle =
              latestEp?.title && latestEp.title !== "Episode"
                ? latestEp.title
                : `Episode ${epNumber}`;
            const airDateText = latestEp?.airDate || "Recent broadcast";

            return (
              <div
                key={anime.id}
                onClick={() => onSelectAnime(anime)}
                className="bg-surface border border-line p-3 rounded-poster flex items-center gap-4 cursor-pointer hover:border-text-3 transition-colors"
              >
                <div className="w-16 h-20 flex-shrink-0 rounded-poster overflow-hidden">
                  <Artwork anime={anime} aspect="poster" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-text truncate">{anime.title.romaji}</div>
                  <div className="text-xs text-text-2 truncate">{epTitle}</div>
                  <div className="text-xs text-text-3 pt-1">{anime.studio} · {airDateText}</div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onWatchEpisode(anime, epNumber);
                  }}
                >
                  <PlayIcon size={14} />
                  Play
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      {/* FALL 2026 (Poster Row with 3D Flip Cards) */}
      <section className="space-y-4">
        <h2 className="font-serif text-2xl text-text">Fall 2026 season</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
          {seasonalAnime.slice(0, 6).map((anime) => (
            <FlipAnimeCard
              key={anime.id}
              anime={anime}
              onClick={() => onSelectAnime(anime)}
            />
          ))}
        </div>
      </section>

      {/* RECOMMENDED (Poster Row with 3D Flip Cards) */}
      <section className="space-y-4">
        <h2 className="font-serif text-2xl text-text">Recommended</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
          {recommendedAnime.slice(0, 6).map((anime) => (
            <FlipAnimeCard
              key={anime.id}
              anime={anime}
              onClick={() => onSelectAnime(anime)}
            />
          ))}
        </div>
      </section>
    </div>
  );
};
