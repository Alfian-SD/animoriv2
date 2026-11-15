import React, { useState, useEffect } from "react";
import type { Anime, RelatedSeason } from "@shared/anime.js";
import { Artwork } from "../ui/art.js";
import { Button } from "../ui/components.js";
import { PlayIcon, BookmarkIcon, CheckIcon } from "../ui/icons.js";

interface DetailsPageProps {
  anime: Anime;
  catalog: Anime[];
  onSelectAnime: (anime: Anime) => void;
  onWatchEpisode: (anime: Anime, epNumber: number) => void;
  onBack: () => void;
}

export const DetailsPage: React.FC<DetailsPageProps> = ({
  anime,
  catalog,
  onSelectAnime,
  onWatchEpisode,
  onBack,
}) => {
  const [inWatchlist, setInWatchlist] = useState(false);
  const [currentAnime, setCurrentAnime] = useState<Anime>(anime);
  const [isLoadingSeasons, setIsLoadingSeasons] = useState<boolean>(
    !anime.seasons || anime.seasons.length === 0
  );

  // Synchronize local state whenever prop changes
  useEffect(() => {
    setCurrentAnime(anime);
    setIsLoadingSeasons(!anime.seasons || anime.seasons.length === 0);
  }, [anime]);

  // Fetch full details (including seasons and multi-season franchise relations)
  useEffect(() => {
    if (anime.seasons && anime.seasons.length > 0) {
      setIsLoadingSeasons(false);
      return;
    }

    let isMounted = true;
    async function loadFullDetails() {
      try {
        const res = await fetch(`/api/anime/${anime.id}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.ok && data.anime) {
            setCurrentAnime((prev) => ({
              ...prev,
              ...data.anime,
              seasons: data.anime.seasons || prev.seasons,
            }));
          }
        }
      } catch (err) {
        console.warn("Failed to load anime seasons:", err);
      } finally {
        if (isMounted) {
          setIsLoadingSeasons(false);
        }
      }
    }

    loadFullDetails();
    return () => {
      isMounted = false;
    };
  }, [anime.id]);

  // Background prefetch for episode 1 mirrors so clicking "Watch episode 1" is instant
  useEffect(() => {
    if (!currentAnime?.id || !currentAnime.episodes || currentAnime.episodes.length === 0) return;
    const ep1 = currentAnime.episodes.find((ep) => ep.number === 1) || currentAnime.episodes[0];
    if (!ep1) return;

    const controller = new AbortController();
    fetch(
      `/api/anime/${encodeURIComponent(currentAnime.id)}/episodes/${encodeURIComponent(
        ep1.id
      )}/mirrors`,
      { signal: controller.signal }
    ).catch(() => {});

    return () => {
      controller.abort();
    };
  }, [currentAnime?.id]);

  const activeAnime = currentAnime;

  const handleSeasonClick = async (season: RelatedSeason) => {
    if (
      season.id === activeAnime.id ||
      (Boolean(season.anilistId) && season.anilistId === activeAnime.anilistId) ||
      (Boolean(season.malId) && season.malId === activeAnime.malId)
    ) {
      return;
    }

    // Check catalog cache first for instant switch
    const cached = catalog.find(
      (a) =>
        a.id === season.id ||
        (Boolean(season.anilistId) && a.anilistId === season.anilistId) ||
        (Boolean(season.malId) && a.malId === season.malId)
    );
    if (cached && cached.seasons && cached.seasons.length > 0) {
      onSelectAnime(cached);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // Fetch full details from server
    try {
      const res = await fetch(`/api/anime/${season.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.anime) {
          onSelectAnime(data.anime);
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
      }
    } catch (err) {
      console.error("Failed to load season anime:", err);
    }

    if (cached) {
      onSelectAnime(cached);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const seasons = activeAnime.seasons || [];
  const currentIndex = seasons.findIndex(
    (s) =>
      s.isCurrent ||
      s.id === activeAnime.id ||
      (Boolean(activeAnime.anilistId) && s.anilistId === activeAnime.anilistId) ||
      (Boolean(activeAnime.malId) && s.malId === activeAnime.malId)
  );

  const prevSeason = currentIndex > 0 ? seasons[currentIndex - 1] : null;
  const nextSeason =
    currentIndex >= 0 && currentIndex < seasons.length - 1 ? seasons[currentIndex + 1] : null;

  const related = catalog.filter(
    (a) => a.id !== activeAnime.id && a.genres.some((g) => activeAnime.genres.includes(g))
  ).slice(0, 6);

  return (
    <div className="space-y-12 pb-20">
      {/* Top Navigation */}
      <button
        onClick={onBack}
        className="text-xs text-text-3 hover:text-text transition-colors flex items-center gap-1.5"
      >
        ← Back to browse
      </button>

      {/* Backdrop & Hero Details Header */}
      <div className="relative rounded-poster overflow-hidden border border-line bg-surface">
        {/* Backdrop Art Surface */}
        <div className="h-64 md:h-80 w-full relative overflow-hidden opacity-60">
          <Artwork anime={activeAnime} aspect="backdrop" className="w-full h-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/60 to-transparent" />
        </div>

        {/* Content Box Overlapping */}
        <div className="p-6 md:p-8 -mt-24 relative z-10 grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          {/* Poster */}
          <div className="md:col-span-3 aspect-[2/3] w-48 md:w-full rounded-poster overflow-hidden border border-line shadow-2xl">
            <Artwork anime={activeAnime} aspect="poster" />
          </div>

          {/* Details */}
          <div className="md:col-span-9 space-y-4">
            <div className="space-y-1">
              <h1 className="font-serif text-3xl md:text-5xl text-text leading-tight">
                {activeAnime.title.romaji}
              </h1>
              {activeAnime.title.native && (
                <div className="text-text-3 text-sm font-sans">{activeAnime.title.native}</div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-text-3 font-mono">
              <span className="text-accent font-semibold">Score {activeAnime.score}</span>
              <span>·</span>
              <span>{activeAnime.status === "RELEASING" ? "Airing" : "Completed"}</span>
              <span>·</span>
              <span>{activeAnime.seasonYear}</span>
              <span>·</span>
              <span>{activeAnime.studio}</span>
            </div>

            {/* Genres */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {activeAnime.genres.map((g) => (
                <span
                  key={g}
                  className="px-2.5 py-0.5 rounded-full text-xs bg-surface-2 text-text-2 border border-line"
                >
                  {g}
                </span>
              ))}
            </div>

            <p className="text-text-2 text-sm md:text-base leading-relaxed pt-2 max-w-3xl">
              {activeAnime.synopsis}
            </p>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-4">
              <Button
                variant="primary"
                size="lg"
                onClick={() => onWatchEpisode(activeAnime, 1)}
              >
                <PlayIcon size={16} />
                Watch episode 1
              </Button>

              <Button
                variant="secondary"
                size="lg"
                onClick={() => setInWatchlist(!inWatchlist)}
              >
                {inWatchlist ? (
                  <>
                    <CheckIcon size={16} className="text-accent" />
                    Added to your watchlist
                  </>
                ) : (
                  <>
                    <BookmarkIcon size={16} />
                    Add to watchlist
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Episodes list + Sticky Facts Sidebar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        {/* Main Left Column (Col 8) */}
        <div className="md:col-span-8 space-y-8">
          {/* Seasons Section (Above Episodes) */}
          {activeAnime.seasons && activeAnime.seasons.length > 1 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <h2 className="font-serif text-2xl text-text">Seasons</h2>
                <span className="text-xs text-text-3 font-mono">
                  {activeAnime.seasons.length} seasons available
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {activeAnime.seasons.map((season) => {
                  const isActive =
                    season.isCurrent ||
                    season.id === activeAnime.id ||
                    (Boolean(activeAnime.anilistId) && season.anilistId === activeAnime.anilistId) ||
                    (Boolean(activeAnime.malId) && season.malId === activeAnime.malId);

                  return (
                    <div
                      key={season.id || (season.malId ? `mal-${season.malId}` : season.anilistId)}
                      onClick={() => handleSeasonClick(season)}
                      className={`p-2.5 rounded-poster border transition-colors flex items-center gap-3 cursor-pointer group bg-surface select-none ${
                        isActive
                          ? "border-accent bg-surface-2"
                          : "border-line hover:border-text-3 hover:bg-surface-2/60"
                      }`}
                    >
                      {/* Small poster thumbnail */}
                      <div className="w-10 h-14 aspect-[2/3] shrink-0 rounded-control overflow-hidden border border-line bg-surface-2 relative">
                        {season.posterUrl ? (
                          <img
                            src={season.posterUrl}
                            alt={season.seasonLabel}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-text-3 text-[10px] font-mono">
                            ★
                          </div>
                        )}
                      </div>

                      {/* Label and Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-xs font-semibold truncate ${
                              isActive ? "text-accent" : "text-text group-hover:text-accent"
                            }`}
                          >
                            {season.seasonLabel}
                          </span>
                          {isActive && (
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-accent/15 text-accent border border-accent/30 shrink-0">
                              Current
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-text-3 truncate mt-0.5 font-mono">
                          {season.seasonYear ? `${season.seasonYear}` : ""}
                          {season.seasonYear && season.episodesCount ? " · " : ""}
                          {season.episodesCount ? `${season.episodesCount} episodes` : ""}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Episodes List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h2 className="font-serif text-2xl text-text">Episodes</h2>
              <span className="text-xs text-text-3">{activeAnime.episodes.length} episodes released</span>
            </div>

          <div className="space-y-2">
            {activeAnime.episodes.map((ep) => (
              <div
                key={ep.id}
                onClick={() => onWatchEpisode(activeAnime, ep.number)}
                className="bg-surface border border-line p-3.5 rounded-poster flex items-center justify-between gap-4 cursor-pointer hover:border-text-3 transition-colors group"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-8 h-8 rounded-control bg-surface-2 text-text-3 group-hover:text-accent group-hover:bg-accent/10 flex items-center justify-center text-xs font-mono font-medium">
                    {ep.number}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-text group-hover:text-accent transition-colors truncate">
                      {ep.title}
                    </div>
                    <div className="text-xs text-text-3">
                      {ep.durationMinutes}m · {ep.airDate || "Broadcast"}
                    </div>
                  </div>
                </div>

                <Button variant="ghost" size="sm">
                  <PlayIcon size={14} />
                  Play
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>

        {/* Sticky Facts Sidebar (Col 4) */}
        <div className="md:col-span-4 bg-surface border border-line rounded-poster p-6 space-y-4 sticky top-6">
          <h3 className="font-serif text-xl text-text border-b border-line pb-3">Series information</h3>

          <div className="space-y-3 text-xs">
            <div>
              <span className="text-text-3 block">Animation studio</span>
              <span className="text-text font-medium">{activeAnime.studio}</span>
            </div>

            <div>
              <span className="text-text-3 block">Broadcast season</span>
              <span className="text-text font-medium">{activeAnime.season} {activeAnime.seasonYear}</span>
            </div>

            <div>
              <span className="text-text-3 block">Status</span>
              <span className="text-text font-medium">
                {activeAnime.status === "RELEASING" ? "Currently airing" : "Completed broadcast"}
              </span>
            </div>

            <div>
              <span className="text-text-3 block">Audio & Subtitles</span>
              <span className="text-text font-medium">Original Japanese (Indonesian & English Subtitles)</span>
            </div>

            <div>
              <span className="text-text-3 block">Curator note</span>
              <span className="text-text-2 leading-relaxed block pt-0.5">
                Archived with full 1080p stream resolution and verified community skip markers.
              </span>
            </div>

            {/* Season Navigation (Direct Previous & Next Season Linkage) */}
            {isLoadingSeasons ? (
              <div className="border-t border-line pt-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-text-3 text-[11px] font-mono">Season navigation</span>
                  <span className="text-text-3 text-[10px] font-mono flex items-center gap-1.5 text-accent">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                    Checking...
                  </span>
                </div>
                <div className="h-14 rounded-poster bg-surface-2/60 border border-line animate-pulse" />
              </div>
            ) : (prevSeason || nextSeason) ? (
              <div className="border-t border-line pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-text-3 text-[11px] font-mono">Season navigation</span>
                  {seasons.length > 2 && currentIndex >= 0 && (
                    <span className="text-text-3 text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-2 border border-line">
                      Season {currentIndex + 1} of {seasons.length}
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  {/* Next Season (Prominent continuation) */}
                  {nextSeason && (
                    <div
                      onClick={() => handleSeasonClick(nextSeason)}
                      className="p-2.5 rounded-poster border border-accent bg-surface-2 hover:bg-surface-2/80 transition-colors flex items-center gap-3 cursor-pointer group select-none"
                    >
                      <div className="w-9 h-12 aspect-[2/3] shrink-0 rounded-control overflow-hidden border border-line bg-surface relative">
                        {nextSeason.posterUrl ? (
                          <img
                            src={nextSeason.posterUrl}
                            alt={nextSeason.seasonLabel}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-text-3 text-[10px] font-mono">
                            ★
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono text-accent font-medium flex items-center gap-1">
                            {nextSeason.seasonLabel === "Movie" ? "Next movie →" : "Next season →"}
                          </span>
                          {nextSeason.seasonYear && (
                            <span className="text-[10px] font-mono text-text-3">
                              {nextSeason.seasonYear}
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-semibold text-text group-hover:text-accent transition-colors truncate mt-0.5">
                          {nextSeason.seasonLabel}
                        </div>
                        <div className="text-[11px] text-text-3 truncate">
                          {nextSeason.title}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Previous Season */}
                  {prevSeason && (
                    <div
                      onClick={() => handleSeasonClick(prevSeason)}
                      className="p-2.5 rounded-poster border border-line bg-surface-2 hover:border-text-2 hover:bg-surface-2/80 transition-colors flex items-center gap-3 cursor-pointer group select-none"
                    >
                      <div className="w-9 h-12 aspect-[2/3] shrink-0 rounded-control overflow-hidden border border-line bg-surface relative">
                        {prevSeason.posterUrl ? (
                          <img
                            src={prevSeason.posterUrl}
                            alt={prevSeason.seasonLabel}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-text-3 text-[10px] font-mono">
                            ★
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono text-text-3 flex items-center gap-1">
                            {prevSeason.seasonLabel === "Movie" ? "← Previous movie" : "← Previous season"}
                          </span>
                          {prevSeason.seasonYear && (
                            <span className="text-[10px] font-mono text-text-3">
                              {prevSeason.seasonYear}
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-semibold text-text group-hover:text-accent transition-colors truncate mt-0.5">
                          {prevSeason.seasonLabel}
                        </div>
                        <div className="text-[11px] text-text-3 truncate">
                          {prevSeason.title}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Related Series Row */}
      {related.length > 0 && (
        <section className="space-y-4 border-t border-line pt-8">
          <h2 className="font-serif text-2xl text-text">Related titles</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
            {related.map((item) => (
              <div
                key={item.id}
                onClick={() => onSelectAnime(item)}
                className="cursor-pointer group space-y-1.5"
              >
                <div className="aspect-[2/3] rounded-poster overflow-hidden">
                  <Artwork anime={item} aspect="poster" />
                </div>
                <div className="text-sm font-medium text-text group-hover:text-accent transition-colors truncate">
                  {item.title.romaji}
                </div>
                <div className="text-xs text-text-3">{item.genres[0]}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
