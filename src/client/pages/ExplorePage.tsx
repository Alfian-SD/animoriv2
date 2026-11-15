import React, { useState, useMemo } from "react";
import type { Anime } from "@shared/anime.js";
import { Artwork } from "../ui/art.js";
import { Chip, Button } from "../ui/components.js";
import { SearchIcon } from "../ui/icons.js";

interface ExplorePageProps {
  catalog: Anime[];
  onSelectAnime: (anime: Anime) => void;
}

const GENRE_LIST = ["All", "Action", "Sci-Fi", "Thriller", "Mystery", "Drama", "Slice of Life", "Fantasy"];

export const ExplorePage: React.FC<ExplorePageProps> = ({ catalog, onSelectAnime }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortBy, setSortBy] = useState<"score" | "year" | "title">("score");
  const [displayCount, setDisplayCount] = useState(12);

  const filteredItems = useMemo(() => {
    let result = [...catalog];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.title.romaji.toLowerCase().includes(q) ||
          a.title.english?.toLowerCase().includes(q) ||
          a.synopsis.toLowerCase().includes(q)
      );
    }

    if (selectedGenre !== "All") {
      result = result.filter((a) => a.genres.includes(selectedGenre));
    }

    if (statusFilter !== "All") {
      result = result.filter((a) => (statusFilter === "Airing" ? a.status === "RELEASING" : a.status === "FINISHED"));
    }

    if (sortBy === "score") {
      result.sort((a, b) => b.score - a.score);
    } else if (sortBy === "year") {
      result.sort((a, b) => b.seasonYear - a.seasonYear);
    } else if (sortBy === "title") {
      result.sort((a, b) => a.title.romaji.localeCompare(b.title.romaji));
    }

    return result;
  }, [catalog, searchQuery, selectedGenre, statusFilter, sortBy]);

  const visibleItems = filteredItems.slice(0, displayCount);

  return (
    <div className="space-y-8 pb-20">
      {/* Header with Title + Count */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-line pb-6">
        <div>
          <h1 className="font-serif text-4xl text-text">Explore</h1>
          <p className="text-text-3 text-sm pt-1">{filteredItems.length} titles available in archive</p>
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-text-3" size={16} />
          <input
            type="text"
            placeholder="Search by title, genre, keyword..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surface border border-line text-text placeholder-text-3 rounded-control pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* Genre Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {GENRE_LIST.map((genre) => (
          <Chip
            key={genre}
            label={genre}
            selected={selectedGenre === genre}
            onClick={() => setSelectedGenre(genre)}
          />
        ))}
      </div>

      {/* Filter and Sorting Selects */}
      <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-text-2 bg-surface p-3 rounded-poster border border-line">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span>Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-surface-2 text-text border border-line rounded px-2.5 py-1 focus:outline-none focus:border-accent"
            >
              <option value="All">All statuses</option>
              <option value="Airing">Currently airing</option>
              <option value="Completed">Completed series</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span>Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "score" | "year" | "title")}
              className="bg-surface-2 text-text border border-line rounded px-2.5 py-1 focus:outline-none focus:border-accent"
            >
              <option value="score">Highest rated</option>
              <option value="year">Release year</option>
              <option value="title">Alphabetical</option>
            </select>
          </div>
        </div>

        {(searchQuery || selectedGenre !== "All" || statusFilter !== "All") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchQuery("");
              setSelectedGenre("All");
              setStatusFilter("All");
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Poster Grid */}
      {visibleItems.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {visibleItems.map((anime) => (
            <div
              key={anime.id}
              onClick={() => onSelectAnime(anime)}
              className="cursor-pointer group space-y-1.5"
            >
              <div className="aspect-[2/3] rounded-poster overflow-hidden">
                <Artwork anime={anime} aspect="poster" />
              </div>
              <div className="text-sm font-medium text-text group-hover:text-accent transition-colors truncate">
                {anime.title.romaji}
              </div>
              <div className="text-xs text-text-3">
                {anime.seasonYear} · {anime.genres[0]}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-20 text-center space-y-2 border border-dashed border-line rounded-poster">
          <p className="text-text-2 text-sm">No titles match your active filters.</p>
          <p className="text-text-3 text-xs">Try selecting a different genre or clearing your search query.</p>
        </div>
      )}

      {/* Load More Button */}
      {visibleItems.length < filteredItems.length && (
        <div className="text-center pt-4">
          <Button variant="secondary" onClick={() => setDisplayCount((prev) => prev + 12)}>
            Load more titles
          </Button>
        </div>
      )}
    </div>
  );
};
