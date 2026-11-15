import React from "react";
import type { Anime } from "@shared/anime.js";
import { Artwork } from "./art.js";

export interface FlipAnimeCardProps {
  anime: Anime;
  rank?: number;
  onClick: () => void;
  className?: string;
  showSubtitle?: boolean;
}

function formatStatus(status: Anime["status"]): string {
  switch (status) {
    case "RELEASING":
      return "Ongoing";
    case "FINISHED":
      return "Completed";
    case "NOT_YET_RELEASED":
      return "Upcoming";
    default:
      return status;
  }
}

function formatSeason(season: Anime["season"]): string {
  switch (season) {
    case "WINTER":
      return "Winter";
    case "SPRING":
      return "Spring";
    case "SUMMER":
      return "Summer";
    case "FALL":
      return "Fall";
    default:
      return season;
  }
}

export const FlipAnimeCard: React.FC<FlipAnimeCardProps> = ({
  anime,
  rank,
  onClick,
  className = "",
}) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={`group cursor-pointer select-none text-left focus:outline-none ${className}`}
    >
      {/* 3D Perspective Wrapper */}
      <div className="flip-card-perspective relative w-full aspect-[2/3] rounded-poster">
        {/* Flipper Container */}
        <div className="flip-card-inner relative w-full h-full rounded-poster">
          {/* FRONT FACE (Default State) */}
          <div className="flip-card-front absolute inset-0 w-full h-full rounded-poster overflow-hidden border border-line bg-surface group-hover:border-accent/60 transition-colors">
            <Artwork anime={anime} aspect="poster" className="w-full h-full" />

            {/* Rank or Score Badge */}
            {rank !== undefined ? (
              <div
                className={`absolute top-2 left-2 text-xs font-mono px-2 py-0.5 rounded-control ${
                  rank === 1
                    ? "bg-accent text-[#09090B] font-semibold border border-accent"
                    : "bg-[#09090B] border border-line text-text font-medium"
                }`}
              >
                #{rank}
              </div>
            ) : (
              <div className="absolute top-2 left-2 bg-surface/90 border border-line text-[11px] font-mono px-1.5 py-0.5 rounded-control text-text flex items-center gap-1">
                <span className="text-accent">★</span>
                <span>{anime.score.toFixed(1)}</span>
              </div>
            )}
          </div>

          {/* BACK FACE (Hover / Focus State) */}
          <div className="flip-card-back absolute inset-0 w-full h-full rounded-poster overflow-hidden bg-surface border border-accent p-3.5 flex flex-col justify-between shadow-none">
            <div className="space-y-1.5 overflow-hidden">
              {/* Title & English Subtitle */}
              <div>
                <h3 className="font-serif text-sm sm:text-base text-text leading-snug line-clamp-2">
                  {anime.title.romaji}
                </h3>
                {anime.title.english && anime.title.english !== anime.title.romaji && (
                  <p className="text-[11px] text-text-3 truncate mt-0.5">
                    {anime.title.english}
                  </p>
                )}
              </div>

              {/* Metadata Row: Score, Episodes, Status */}
              <div className="flex items-center gap-2 pt-0.5 flex-wrap">
                <span className="text-accent font-mono text-xs font-medium">
                  ★ {anime.score.toFixed(1)}
                </span>
                <span className="text-text-3 text-[11px] font-mono">
                  {anime.episodes.length} ep
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-control bg-surface-2 border border-line text-text-2 font-mono">
                  {formatStatus(anime.status)}
                </span>
              </div>

              {/* Studio & Season Broadcast */}
              <p className="text-[11px] text-text-3 truncate pt-0.5">
                {anime.studio} · {formatSeason(anime.season)} {anime.seasonYear}
              </p>

              {/* Genre Chips */}
              <div className="flex flex-wrap gap-1 pt-1">
                {anime.genres.slice(0, 3).map((genre) => (
                  <span
                    key={genre}
                    className="text-[10px] px-1.5 py-0.5 rounded-control bg-surface-2 border border-line text-text-2"
                  >
                    {genre}
                  </span>
                ))}
              </div>

              {/* Synopsis Snippet */}
              <p className="text-[11px] leading-relaxed text-text-2 line-clamp-3 sm:line-clamp-4 pt-1 border-t border-line/50">
                {anime.synopsis}
              </p>
            </div>

            {/* Quick Action Footer */}
            <div className="pt-2 border-t border-line/60 flex items-center justify-between text-xs text-accent font-medium mt-auto">
              <span>View details</span>
              <span>→</span>
            </div>
          </div>
        </div>
      </div>

      {/* Static Footer below card for instant browsing */}
      <div className="mt-2 space-y-0.5">
        <div className="text-sm font-medium text-text group-hover:text-accent transition-colors truncate">
          {anime.title.romaji}
        </div>
        <div className="text-xs text-text-3 truncate">
          {anime.genres.slice(0, 2).join(", ") || `${anime.episodes.length} episodes`}
        </div>
      </div>
    </div>
  );
};
