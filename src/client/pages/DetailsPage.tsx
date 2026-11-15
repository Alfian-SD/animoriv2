import React, { useState } from "react";
import type { Anime } from "@shared/anime.js";
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

  const related = catalog.filter(
    (a) => a.id !== anime.id && a.genres.some((g) => anime.genres.includes(g))
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
          <Artwork anime={anime} aspect="backdrop" className="w-full h-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/60 to-transparent" />
        </div>

        {/* Content Box Overlapping */}
        <div className="p-6 md:p-8 -mt-24 relative z-10 grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          {/* Poster */}
          <div className="md:col-span-3 aspect-[2/3] w-48 md:w-full rounded-poster overflow-hidden border border-line shadow-2xl">
            <Artwork anime={anime} aspect="poster" />
          </div>

          {/* Details */}
          <div className="md:col-span-9 space-y-4">
            <div className="space-y-1">
              <h1 className="font-serif text-3xl md:text-5xl text-text leading-tight">
                {anime.title.romaji}
              </h1>
              {anime.title.native && (
                <div className="text-text-3 text-sm font-sans">{anime.title.native}</div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-text-3 font-mono">
              <span className="text-accent font-semibold">Score {anime.score}</span>
              <span>·</span>
              <span>{anime.status === "RELEASING" ? "Airing" : "Completed"}</span>
              <span>·</span>
              <span>{anime.seasonYear}</span>
              <span>·</span>
              <span>{anime.studio}</span>
            </div>

            {/* Genres */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {anime.genres.map((g) => (
                <span
                  key={g}
                  className="px-2.5 py-0.5 rounded-full text-xs bg-surface-2 text-text-2 border border-line"
                >
                  {g}
                </span>
              ))}
            </div>

            <p className="text-text-2 text-sm md:text-base leading-relaxed pt-2 max-w-3xl">
              {anime.synopsis}
            </p>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-4">
              <Button
                variant="primary"
                size="lg"
                onClick={() => onWatchEpisode(anime, 1)}
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
        {/* Episodes List (Col 8) */}
        <div className="md:col-span-8 space-y-4">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <h2 className="font-serif text-2xl text-text">Episodes</h2>
            <span className="text-xs text-text-3">{anime.episodes.length} episodes released</span>
          </div>

          <div className="space-y-2">
            {anime.episodes.map((ep) => (
              <div
                key={ep.id}
                onClick={() => onWatchEpisode(anime, ep.number)}
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

        {/* Sticky Facts Sidebar (Col 4) */}
        <div className="md:col-span-4 bg-surface border border-line rounded-poster p-6 space-y-4 sticky top-6">
          <h3 className="font-serif text-xl text-text border-b border-line pb-3">Series information</h3>

          <div className="space-y-3 text-xs">
            <div>
              <span className="text-text-3 block">Animation studio</span>
              <span className="text-text font-medium">{anime.studio}</span>
            </div>

            <div>
              <span className="text-text-3 block">Broadcast season</span>
              <span className="text-text font-medium">{anime.season} {anime.seasonYear}</span>
            </div>

            <div>
              <span className="text-text-3 block">Status</span>
              <span className="text-text font-medium">
                {anime.status === "RELEASING" ? "Currently airing" : "Completed broadcast"}
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
