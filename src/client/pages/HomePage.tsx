import React, { useState, useEffect } from "react";
import type { Anime, WatchProgress } from "@shared/anime.js";
import { Artwork } from "../ui/art.js";
import { FlipAnimeCard } from "../ui/FlipAnimeCard.js";
import { Button, Card } from "../ui/components.js";
import { PlayIcon, BookmarkIcon, CheckIcon } from "../ui/icons.js";

interface HomePageProps {
  catalog: Anime[];
  onSelectAnime: (anime: Anime) => void;
  onWatchEpisode: (anime: Anime, epNumber: number) => void;
}

const PROGRESS_STORAGE_KEY = "aiku.watch-progress.v1";

export const HomePage: React.FC<HomePageProps> = ({ catalog, onSelectAnime, onWatchEpisode }) => {
  const [heroIdx, setHeroIdx] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [continueWatching, setContinueWatching] = useState<Array<{ anime: Anime; progress: WatchProgress }>>([]);
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());

  // Hero anime pool
  const heroItems = catalog.slice(0, 4);
  const currentHero = heroItems[heroIdx] || catalog[0];

  // Automatic hero rotation (every 7 seconds, pausable, off under reduced motion)
  useEffect(() => {
    if (isPaused || heroItems.length <= 1) return;
    const isReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (isReduced) return;

    const timer = setInterval(() => {
      setHeroIdx((prev) => (prev + 1) % heroItems.length);
    }, 7000);
    return () => clearInterval(timer);
  }, [isPaused, heroItems.length]);

  // Load continue watching from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
      if (raw) {
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

  const trendingAnime = [...catalog].sort((a, b) => b.score - a.score).slice(0, 10);
  const recentlyUpdated = [...catalog].slice(0, 6);
  const seasonalAnime = catalog.filter((a) => a.season === "FALL");
  const recommendedAnime = catalog.filter((a) => a.score >= 9.0);

  if (!currentHero) return null;

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
            const latestEp = anime.episodes[anime.episodes.length - 1];
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
                  <div className="text-xs text-text-2 truncate">{latestEp?.title || `Episode ${latestEp?.number}`}</div>
                  <div className="text-xs text-text-3 pt-1">{anime.studio} · {latestEp?.airDate || "Recent broadcast"}</div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (latestEp) onWatchEpisode(anime, latestEp.number);
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
