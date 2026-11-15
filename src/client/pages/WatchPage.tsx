import React, { useState, useEffect } from "react";
import type { Anime, PlaybackOption } from "@shared/anime.js";
import { CinemaPlayer } from "../player/CinemaPlayer.js";
import { Button } from "../ui/components.js";
import { PrevIcon, NextIcon } from "../ui/icons.js";
import { formatQualityLabel } from "../player/playerUtils.js";

const PROGRESS_STORAGE_KEY = "aiku.watch-progress.v1";

const DEFAULT_FALLBACK_MIRRORS: PlaybackOption[] = [
  {
    id: "fallback-server-1",
    providerId: "resolved",
    serverName: "Server 1",
    quality: "1080p",
    mode: "hls",
    streamUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
  },
  {
    id: "fallback-server-2",
    providerId: "resolved",
    serverName: "Server 2",
    quality: "720p",
    mode: "mp4",
    streamUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  },
  {
    id: "fallback-server-3",
    providerId: "resolved",
    serverName: "Server 3",
    quality: "480p",
    mode: "mp4",
    streamUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
  },
];

function getSavedResumeTime(episodeId: string): number {
  try {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) return 0;
    const progressMap = JSON.parse(raw);
    const item = progressMap[episodeId];
    if (item && typeof item.currentTime === "number" && !item.completed) {
      return item.currentTime;
    }
  } catch {
    // Ignore localStorage parse failures
  }
  return 0;
}

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

  const [activeOptionIndex, setActiveOptionIndex] = useState(0);
  const [playbackOptions, setPlaybackOptions] = useState<PlaybackOption[]>(
    currentEpisode?.playbackOptions && currentEpisode.playbackOptions.length > 0
      ? currentEpisode.playbackOptions
      : DEFAULT_FALLBACK_MIRRORS
  );
  const [isLoadingMirrors, setIsLoadingMirrors] = useState(false);

  // Sync mirrors when episode changes
  useEffect(() => {
    if (!currentEpisode) return;

    setActiveOptionIndex(0);
    setPlaybackOptions(
      currentEpisode.playbackOptions && currentEpisode.playbackOptions.length > 0
        ? currentEpisode.playbackOptions
        : DEFAULT_FALLBACK_MIRRORS
    );
    setIsLoadingMirrors(true);

    const controller = new AbortController();

    const fetchMirrors = async () => {
      try {
        const res = await fetch(
          `/api/anime/${encodeURIComponent(anime.id)}/episodes/${encodeURIComponent(
            currentEpisode.id
          )}/mirrors`,
          { signal: controller.signal }
        );

        if (res.ok) {
          const data = (await res.json()) as { mirrors?: PlaybackOption[] };
          if (Array.isArray(data.mirrors) && data.mirrors.length > 0) {
            setPlaybackOptions(data.mirrors);
          } else {
            setPlaybackOptions(DEFAULT_FALLBACK_MIRRORS);
          }
        } else {
          setPlaybackOptions(DEFAULT_FALLBACK_MIRRORS);
        }
      } catch (err: unknown) {
        if ((err as Error)?.name !== "AbortError") {
          setPlaybackOptions(DEFAULT_FALLBACK_MIRRORS);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingMirrors(false);
        }
      }
    };

    void fetchMirrors();

    return () => {
      controller.abort();
    };
  }, [anime.id, currentEpisode]);

  if (!currentEpisode) return null;

  const initialResumeTime = getSavedResumeTime(currentEpisode.id);

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
            options={playbackOptions}
            activeOptionIndex={activeOptionIndex}
            onSelectOption={setActiveOptionIndex}
            animeId={anime.id}
            episodeId={currentEpisode.id}
            episodeNumber={currentEpisode.number}
            initialTime={initialResumeTime}
            theaterMode={theaterMode}
            onToggleTheater={() => setTheaterMode(!theaterMode)}
            onNextEpisode={hasNext ? () => onSelectEpisode(episodeNumber + 1) : undefined}
          />

          {/* Mirror & Server Selection Bar */}
          <div className="bg-surface border border-line rounded-poster p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="text-text font-medium">Servers & quality</span>
                {isLoadingMirrors && (
                  <span className="text-text-3 text-[11px] font-mono animate-pulse">
                    Syncing mirrors...
                  </span>
                )}
              </div>
              <span className="text-text-3 font-mono text-[11px]">
                {playbackOptions.length} source{playbackOptions.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {playbackOptions.map((opt, idx) => {
                const isActive = idx === activeOptionIndex;
                return (
                  <button
                    key={`${opt.serverName}-${opt.quality}-${idx}`}
                    type="button"
                    onClick={() => setActiveOptionIndex(idx)}
                    className={`px-3 py-1.5 text-xs rounded-control border transition-colors flex items-center gap-1.5 ${
                      isActive
                        ? "border-accent text-text bg-surface-2 font-medium"
                        : "border-line text-text-2 bg-surface hover:border-text-3 hover:text-text"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isActive ? "bg-accent" : "bg-text-3"
                      }`}
                    />
                    <span>{formatQualityLabel(opt.serverName, opt.quality)}</span>
                    <span className="text-[10px] text-text-3">({opt.mode})</span>
                  </button>
                );
              })}
            </div>
          </div>

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
                  {isActive && <span className="text-[10px] font-mono">Playing</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
