import React, { useState } from "react";
import type { Anime } from "@shared/anime.js";
import { CinemaPlayer } from "../player/CinemaPlayer.js";
import { Button } from "../ui/components.js";
import { PrevIcon, NextIcon } from "../ui/icons.js";

interface WatchPageProps {
  anime: Anime;
  episodeNumber: number;
  onSelectEpisode: (epNumber: number) => void;
  onBackToDetails: () => void;
}

export const WatchPage: React.FC<WatchPageProps> = ({
  anime,
  episodeNumber,
  onSelectEpisode,
  onBackToDetails,
}) => {
  const [theaterMode, setTheaterMode] = useState(false);

  const currentEpisode =
    anime.episodes.find((ep) => ep.number === episodeNumber) || anime.episodes[0];
  const hasPrev = episodeNumber > 1;
  const hasNext = episodeNumber < anime.episodes.length;

  if (!currentEpisode) return null;

  return (
    <div className="space-y-6 pb-20">
      {/* Breadcrumb / Navigation */}
      <div className="flex items-center justify-between text-xs text-text-3 border-b border-line pb-3">
        <button
          onClick={onBackToDetails}
          className="hover:text-text transition-colors flex items-center gap-1.5"
        >
          ← Back to {anime.title.romaji}
        </button>

        <span className="font-mono">
          Episode {currentEpisode.number} of {anime.episodes.length}
        </span>
      </div>

      {/* Main Watch Layout (Normal vs Theater Mode) */}
      <div
        className={`grid gap-6 items-start ${
          theaterMode ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-12"
        }`}
      >
        {/* Left / Main: Video Player Surface (Col 8 or Full in Theater) */}
        <div className={`space-y-4 ${theaterMode ? "w-full" : "lg:col-span-8"}`}>
          <CinemaPlayer
            options={currentEpisode.playbackOptions}
            animeId={anime.id}
            episodeId={currentEpisode.id}
            episodeNumber={currentEpisode.number}
            theaterMode={theaterMode}
            onToggleTheater={() => setTheaterMode(!theaterMode)}
            onNextEpisode={hasNext ? () => onSelectEpisode(episodeNumber + 1) : undefined}
          />

          {/* Episode Info & Navigation */}
          <div className="bg-surface border border-line rounded-poster p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="font-serif text-2xl text-text">
                Episode {currentEpisode.number}: {currentEpisode.title}
              </h1>
              <p className="text-text-3 text-xs pt-0.5">
                {anime.title.romaji} · Broadcast {currentEpisode.airDate || "Recent"} · {currentEpisode.durationMinutes}m
              </p>
            </div>

            {/* Prev / Next Buttons */}
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={!hasPrev}
                onClick={() => onSelectEpisode(episodeNumber - 1)}
              >
                <PrevIcon size={14} />
                Previous
              </Button>

              <Button
                variant="primary"
                size="sm"
                disabled={!hasNext}
                onClick={() => onSelectEpisode(episodeNumber + 1)}
              >
                Next
                <NextIcon size={14} />
              </Button>
            </div>
          </div>

          {currentEpisode.synopsis && (
            <div className="bg-surface border border-line rounded-poster p-4 text-xs text-text-2 leading-relaxed">
              <span className="text-text font-medium block mb-1">Episode synopsis</span>
              {currentEpisode.synopsis}
            </div>
          )}
        </div>

        {/* Right / Side Panel: Episode Selector (Col 4 or Bottom in Theater) */}
        <div
          className={`bg-surface border border-line rounded-poster p-4 space-y-3 ${
            theaterMode ? "w-full" : "lg:col-span-4 sticky top-6 max-h-[680px] flex flex-col"
          }`}
        >
          <div className="flex items-center justify-between border-b border-line pb-2 flex-shrink-0">
            <h2 className="font-serif text-lg text-text">Episodes</h2>
            <span className="text-xs text-text-3 font-mono">{anime.episodes.length} total</span>
          </div>

          <div className="space-y-1.5 overflow-y-auto pr-1 flex-1">
            {anime.episodes.map((ep) => {
              const isActive = ep.number === episodeNumber;
              return (
                <button
                  key={ep.id}
                  onClick={() => onSelectEpisode(ep.number)}
                  className={`w-full text-left p-2.5 rounded-control text-xs flex items-center justify-between gap-3 transition-colors ${
                    isActive
                      ? "bg-accent text-accent-ink font-semibold"
                      : "bg-surface-2/60 text-text hover:bg-surface-2 border border-line/60"
                  }`}
                >
                  <div className="min-w-0">
                    <span className="block truncate">
                      {ep.number}. {ep.title}
                    </span>
                    <span
                      className={`text-[11px] block ${
                        isActive ? "text-accent-ink/80" : "text-text-3"
                      }`}
                    >
                      {ep.durationMinutes}m
                    </span>
                  </div>
                  {isActive && <span className="text-[10px] font-mono uppercase">Playing</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
