export type StreamMode = "mp4" | "hls" | "embed";
export type VideoQuality = "1080p" | "720p" | "480p" | "360p";
export type AnimeStatus = "RELEASING" | "FINISHED" | "NOT_YET_RELEASED";

export const ALL_ANIME_GENRES = [
  "Action",
  "Adventure",
  "Fantasy",
  "Sci-Fi",
  "Romance",
  "Comedy",
  "Drama",
  "Horror",
  "Mystery",
  "Slice of Life",
  "Sports",
  "Mecha",
  "Isekai",
] as const;

export type AnimeGenre = (typeof ALL_ANIME_GENRES)[number];

export interface PageInfo {
  total: number;
  currentPage: number;
  lastPage: number;
  hasNextPage: boolean;
}

export interface PlaybackOption {
  id: string;
  providerId: string;
  serverName: string;
  quality: VideoQuality;
  mode: StreamMode;
  streamUrl: string;
  headers?: Record<string, string>;
}

export interface SkipInterval {
  skipType: "op" | "ed";
  interval: {
    startTime: number;
    endTime: number;
  };
  episodeLength: number;
}

export interface Episode {
  id: string;
  animeId: string;
  number: number;
  title: string;
  durationMinutes: number;
  airDate?: string;
  synopsis?: string;
  playbackOptions: PlaybackOption[];
}

export interface Anime {
  id: string;
  slug: string;
  malId?: number;
  anilistId?: number;
  sourceProvider: string;
  title: {
    romaji: string;
    english?: string;
    native?: string;
  };
  synopsis: string;
  status: AnimeStatus;
  seasonYear: number;
  season: "WINTER" | "SPRING" | "SUMMER" | "FALL";
  score: number;
  genres: string[];
  studio: string;
  artwork: {
    motif: "sun" | "ridgelines" | "waves" | "slash";
    primaryHue: number;
    posterUrl?: string;
    backdropUrl?: string;
  };
  episodes: Episode[];
}

export interface WatchProgress {
  animeId: string;
  episodeId: string;
  episodeNumber: number;
  currentTime: number;
  duration: number;
  updatedAt: number;
}
