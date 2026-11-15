import React, { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
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

const PROGRESS_STORAGE_KEY = "aiku.watch-progress.v1";

export interface CinemaPlayerProps {
  options: PlaybackOption[];
  animeId: string;
  episodeId: string;
  episodeNumber: number;
  initialTime?: number;
  theaterMode?: boolean;
  onToggleTheater?: () => void;
  onNextEpisode?: () => void;
}

export const CinemaPlayer: React.FC<CinemaPlayerProps> = ({
  options,
  animeId,
  episodeId,
  episodeNumber,
  initialTime = 0,
  theaterMode = false,
  onToggleTheater,
  onNextEpisode,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [activeServerIdx, setActiveServerIdx] = useState(0);
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

  const activeOption = options[activeServerIdx] || options[0];

  // Load saved watch progress
  useEffect(() => {
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

  // Setup video source (MP4 or HLS)
  useEffect(() => {
    if (!activeOption || activeOption.mode === "embed") return;

    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const streamUrl = `/api/streams/${encodeURIComponent(activeOption.providerId)}/${encodeURIComponent(
      activeOption.id
    )}?url=${encodeURIComponent(activeOption.streamUrl)}`;

    if (activeOption.mode === "hls") {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = streamUrl;
      } else if (Hls.isSupported()) {
        const hls = new Hls({ maxBufferLength: 30 });
        hlsRef.current = hls;
        hls.loadSource(streamUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            handleFailover();
          }
        });
      } else {
        handleFailover();
      }
    } else {
      video.src = streamUrl;
    }

    if (initialTime > 0) {
      video.currentTime = initialTime;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [activeOption, initialTime]);

  const handleFailover = useCallback(() => {
    if (activeServerIdx + 1 < options.length) {
      const nextIdx = activeServerIdx + 1;
      setActiveServerIdx(nextIdx);
      setServerError(`Switched to backup server: ${options[nextIdx]?.serverName}`);
      setTimeout(() => setServerError(null), 4000);
    } else {
      setServerError("All available playback servers failed. Please try again later.");
    }
  }, [activeServerIdx, options]);

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

  return (
    <div
      ref={containerRef}
      onMouseMove={() => setShowControls(true)}
      className="relative w-full aspect-video bg-black rounded-poster overflow-hidden border border-line select-none group"
    >
      {/* Fallback Notice */}
      {serverError && (
        <div className="absolute top-4 left-4 z-40 bg-surface/90 text-text-2 border border-line px-3 py-1.5 rounded-control text-xs">
          {serverError}
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
            if (videoRef.current) setDuration(videoRef.current.duration || 0);
          }}
          onEnded={() => {
            saveProgress(duration, duration);
            if (onNextEpisode) onNextEpisode();
          }}
          onError={handleFailover}
          playsInline
          className="w-full h-full object-contain cursor-pointer"
          onClick={handleTogglePlay}
        />
      ) : (
        /* Mode 3: Sandboxed Iframe */
        <iframe
          src={activeOption.streamUrl}
          title={`Episode ${episodeNumber} player`}
          sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="autoplay; fullscreen; picture-in-picture"
          className="w-full h-full border-0"
        />
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
                value={activeServerIdx}
                onChange={(e) => setActiveServerIdx(Number(e.target.value))}
                className="bg-surface text-text-2 border border-line rounded px-2 py-1 text-xs focus:outline-none focus:border-accent"
              >
                {options.map((opt, idx) => (
                  <option key={opt.id} value={idx}>
                    {opt.serverName} ({opt.quality})
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
