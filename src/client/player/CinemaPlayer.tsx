import React, { useEffect, useRef, useState, useCallback } from "react";
import type Hls from "hls.js";
import type { PlaybackOption, SkipInterval, WatchProgress } from "@shared/anime.js";
import {
  PlayIcon,
  PauseIcon,
  VolumeIcon,
  MuteIcon,
  FullscreenIcon,
  TheaterIcon,
  NextIcon,
} from "../ui/icons.js";
import { Button } from "../ui/components.js";
import {
  resolveResumeTimestamp,
  resolveNextFallbackIndex,
} from "./playerUtils.js";

const PROGRESS_STORAGE_KEY = "aiku.watch-progress.v1";

export interface CinemaPlayerProps {
  options: PlaybackOption[];
  activeOptionIndex?: number;
  onSelectOption?: (index: number) => void;
  animeId: string;
  episodeId: string;
  episodeNumber: number;
  initialTime?: number;
  theaterMode?: boolean;
  onToggleTheater?: () => void;
  onNextEpisode?: () => void;
  onRetry?: () => void;
}

export const CinemaPlayer: React.FC<CinemaPlayerProps> = ({
  options,
  activeOptionIndex,
  onSelectOption,
  animeId,
  episodeId,
  episodeNumber,
  initialTime = 0,
  theaterMode = false,
  onToggleTheater,
  onNextEpisode,
  onRetry,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [internalServerIdx, setInternalServerIdx] = useState(0);
  const activeIndex = activeOptionIndex ?? internalServerIdx;
  const handleSelectOption = onSelectOption ?? setInternalServerIdx;

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [skipIntervals, setSkipIntervals] = useState<SkipInterval[]>([]);
  const [activeSkip, setActiveSkip] = useState<SkipInterval | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  const activeOption = options[activeIndex] || options[0];

  // Auto-next binge countdown timer
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      if (onNextEpisode) onNextEpisode();
      return;
    }
    const timer = setTimeout(() => {
      setCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown, onNextEpisode]);

  // Load saved watch progress on episode change
  useEffect(() => {
    setCountdown(null);
    try {
      const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
      if (raw) {
        const map = JSON.parse(raw) as Record<string, WatchProgress>;
        const saved = map[episodeId];
        if (saved && saved.currentTime > 5 && (!saved.duration || saved.currentTime < saved.duration - 15)) {
          if (videoRef.current) {
            videoRef.current.currentTime = saved.currentTime;
          }
        }
      }
    } catch {
      // ignore
    }
  }, [episodeId]);

  // Fetch AniSkip intervals
  useEffect(() => {
    let unmounted = false;
    async function loadSkipTimes() {
      try {
        const res = await fetch(`/api/catalog/episodes/${encodeURIComponent(episodeId)}/skip-times`);
        if (res.ok) {
          const data = await res.json();
          if (!unmounted && data.ok && Array.isArray(data.skipIntervals)) {
            setSkipIntervals(data.skipIntervals);
          }
        }
      } catch {
        // silent fallback
      }
    }
    loadSkipTimes();
    return () => {
      unmounted = true;
    };
  }, [episodeId]);

  // Save watch progress helper
  const saveProgress = useCallback(
    (time: number, total: number) => {
      if (time <= 0 || total <= 0) return;
      try {
        const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
        const map: Record<string, WatchProgress> = raw ? JSON.parse(raw) : {};
        map[episodeId] = {
          animeId,
          episodeId,
          episodeNumber,
          currentTime: time,
          duration: total,
          updatedAt: Date.now(),
        };
        localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(map));
      } catch {
        // quota exceeded fallback
      }
    },
    [animeId, episodeId, episodeNumber]
  );

  const handleFailover = useCallback(() => {
    const nextIdx = resolveNextFallbackIndex(activeIndex, options.length);
    if (nextIdx !== null) {
      handleSelectOption(nextIdx);
      const nextOption = options[nextIdx];
      setServerError(`Switched to backup server: ${nextOption?.serverName} (${nextOption?.quality})`);
      setTimeout(() => setServerError(null), 5000);
    } else {
      setServerError("All available playback servers failed. Please try again later.");
    }
  }, [activeIndex, options, handleSelectOption]);

  // Setup video source (MP4 or lazy HLS)
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !activeOption || activeOption.mode === "embed") return;

    const currentOption = activeOption;
    const currentVideo = videoEl;

    let isCancelled = false;
    let hlsInstance: Hls | null = null;

    const proxiedUrl = `/api/streams/${encodeURIComponent(currentOption.providerId)}/${encodeURIComponent(
      currentOption.id
    )}?url=${encodeURIComponent(currentOption.streamUrl)}`;

    async function attachMediaSource() {
      if (currentOption.mode === "hls") {
        try {
          const { default: HlsConstructor } = await import("hls.js");
          if (isCancelled || !videoRef.current) return;

          if (HlsConstructor.isSupported()) {
            hlsInstance = new HlsConstructor({
              maxBufferLength: 30,
              enableWorker: true,
            });
            hlsRef.current = hlsInstance;
            hlsInstance.loadSource(proxiedUrl);
            hlsInstance.attachMedia(videoRef.current);

            hlsInstance.on(HlsConstructor.Events.ERROR, (_event, data) => {
              if (data.fatal && !isCancelled) {
                handleFailover();
              }
            });
            return;
          }

          // Fallback native HLS (Safari / iOS)
          if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
            videoRef.current.src = proxiedUrl;
            return;
          }

          if (!isCancelled) handleFailover();
        } catch {
          if (!isCancelled) handleFailover();
        }
      } else if (currentOption.mode === "mp4") {
        currentVideo.src = proxiedUrl;
      }
    }

    void attachMediaSource();

    return () => {
      isCancelled = true;
      if (hlsInstance) {
        hlsInstance.destroy();
        hlsInstance = null;
      }
      hlsRef.current = null;
      currentVideo.removeAttribute("src");
      currentVideo.load();
    };
  }, [activeOption, handleFailover]);

  // Video event handlers
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;

    const cur = video.currentTime;
    const dur = video.duration || 0;
    setCurrentTime(cur);
    setDuration(dur);

    // Save progress every ~10s
    if (Math.floor(cur) % 10 === 0 && cur > 5) {
      saveProgress(cur, dur);
    }

    // Check AniSkip interval
    const match = skipIntervals.find(
      (item) =>
        cur >= item.interval.startTime &&
        cur < item.interval.endTime &&
        (!Number.isFinite(dur) || dur <= 0 || item.interval.endTime <= dur + 1)
    );
    setActiveSkip(match ?? null);
  };

  const handleTogglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setCurrentTime(val);
    if (videoRef.current) {
      videoRef.current.currentTime = val;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
    }
    setIsMuted(val === 0);
  };

  const handleToggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isMuted) {
      video.muted = false;
      setIsMuted(false);
    } else {
      video.muted = true;
      setIsMuted(true);
    }
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  };

  const handleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleSkip = () => {
    if (!activeSkip || !videoRef.current) return;
    videoRef.current.currentTime = activeSkip.interval.endTime;
    setActiveSkip(null);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  if (!options || options.length === 0 || !activeOption) {
    return (
      <div
        ref={containerRef}
        className="relative w-full aspect-video bg-surface-1 rounded-poster overflow-hidden border border-line flex flex-col items-center justify-center p-6 text-center select-none"
      >
        <div className="max-w-md space-y-3">
          <p className="text-sm text-text font-medium">
            Stream untuk episode ini belum tersedia di server.
          </p>
          <p className="text-xs text-text-3">
            Episode ini sedang menunggu sinkronisasi mirror dari provider eksternal.
          </p>
          <div className="pt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => (onRetry ? onRetry() : window.location.reload())}
            >
              Coba muat ulang
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onMouseMove={() => setShowControls(true)}
      className="relative w-full aspect-video bg-black rounded-poster overflow-hidden border border-line select-none group"
    >
      {/* Fallback Notice Banner */}
      {serverError && (
        <div className="absolute top-4 left-4 z-40 bg-surface-2 text-text-2 border border-line px-3 py-1.5 rounded-control text-xs flex items-center gap-2">
          <span>{serverError}</span>
        </div>
      )}

      {/* Mode 1 & 2: Direct Video (MP4 / HLS) */}
      {activeOption?.mode !== "embed" ? (
        <video
          ref={videoRef}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={() => {
            if (videoRef.current) {
              const dur = videoRef.current.duration || 0;
              setDuration(dur);
              if (initialTime > 0) {
                const resumeAt = resolveResumeTimestamp(initialTime, dur);
                if (resumeAt !== null && resumeAt > 0) {
                  videoRef.current.currentTime = resumeAt;
                }
              }
            }
          }}
          onEnded={() => {
            saveProgress(duration, duration);
            if (onNextEpisode) {
              setCountdown(5);
            }
          }}
          onError={handleFailover}
          playsInline
          className="w-full h-full object-contain cursor-pointer"
          onClick={handleTogglePlay}
        />
      ) : (
        /* Mode 3: Sandboxed Iframe Player with no-referrer */
        <iframe
          src={activeOption.streamUrl}
          title={`Episode ${episodeNumber} player`}
          referrerPolicy="no-referrer"
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          className="w-full h-full border-0"
        />
      )}

      {/* Auto-Next Binge Countdown Overlay */}
      {countdown !== null && onNextEpisode && (
        <div className="absolute inset-x-0 bottom-16 z-30 mx-auto max-w-sm bg-surface-2 border border-line rounded-poster p-4 flex items-center justify-between gap-4">
          <span className="text-sm text-text font-medium">
            Next episode starts in {countdown}s
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setCountdown(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setCountdown(null);
                onNextEpisode();
              }}
            >
              Play now
            </Button>
          </div>
        </div>
      )}

      {/* AniSkip Button Overlay */}
      {activeSkip && (
        <div className="absolute bottom-16 right-6 z-30 animate-fade-in">
          <Button variant="primary" size="md" onClick={handleSkip}>
            {activeSkip.skipType === "op" ? "Skip opening" : "Skip ending"}
          </Button>
        </div>
      )}

      {/* Video Controls Bar (Only for MP4/HLS) */}
      {activeOption?.mode !== "embed" && (
        <div
          className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-bg/95 via-bg/80 to-transparent p-4 transition-opacity duration-200 z-20 ${
            showControls ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          {/* Timeline Range */}
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs font-mono text-text-3 min-w-[36px]">{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="yoake-range flex-1"
            />
            <span className="text-xs font-mono text-text-3 min-w-[36px]">{formatTime(duration)}</span>
          </div>

          <div className="flex items-center justify-between text-text-2 text-xs">
            {/* Left Controls */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleTogglePlay}
                className="text-text hover:text-accent transition-colors"
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
              </button>

              {onNextEpisode && (
                <button
                  onClick={onNextEpisode}
                  className="text-text-2 hover:text-text transition-colors"
                  aria-label="Next episode"
                >
                  <NextIcon size={16} />
                </button>
              )}

              {/* Volume */}
              <div className="flex items-center gap-1.5 ml-2">
                <button onClick={handleToggleMute} className="hover:text-text">
                  {isMuted || volume === 0 ? <MuteIcon size={16} /> : <VolumeIcon size={16} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="yoake-range w-16"
                />
              </div>
            </div>

            {/* Right Controls */}
            <div className="flex items-center gap-4">
              {/* Server / Quality dropdown */}
              <select
                value={activeIndex}
                onChange={(e) => handleSelectOption(Number(e.target.value))}
                className="bg-surface text-text-2 border border-line rounded px-2 py-1 text-xs focus:outline-none focus:border-accent"
              >
                {options.map((opt, idx) => (
                  <option key={opt.id} value={idx}>
                    {opt.serverName} · {opt.quality}
                  </option>
                ))}
              </select>

              {/* Playback Speed */}
              <div className="flex items-center gap-1">
                {[1, 1.25, 1.5].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => handleSpeedChange(spd)}
                    className={`px-1.5 py-0.5 rounded text-[11px] ${
                      playbackSpeed === spd ? "bg-accent text-accent-ink font-semibold" : "text-text-3 hover:text-text"
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>

              {/* Theater Mode */}
              {onToggleTheater && (
                <button
                  onClick={onToggleTheater}
                  className={`hover:text-text ${theaterMode ? "text-accent" : "text-text-2"}`}
                  aria-label="Theater mode"
                >
                  <TheaterIcon size={16} />
                </button>
              )}

              {/* Fullscreen */}
              <button onClick={handleFullscreen} className="hover:text-text" aria-label="Fullscreen">
                <FullscreenIcon size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
