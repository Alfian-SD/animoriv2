import React, { useState, useEffect, useRef } from "react";
import { ALL_ANIME_GENRES, type Anime, type PageInfo } from "@shared/anime.js";
import { FlipAnimeCard } from "../ui/FlipAnimeCard.js";
import { Button } from "../ui/components.js";
import { SearchIcon } from "../ui/icons.js";

interface ExplorePageProps {
  catalog: Anime[];
  onSelectAnime: (anime: Anime) => void;
}

export const ExplorePage: React.FC<ExplorePageProps> = ({ catalog, onSelectAnime }) => {
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortBy, setSortBy] = useState<"score" | "year" | "title">("score");

  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Anime[]>(catalog);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Track whether initial mount has happened
  const isFirstMount = useRef(true);

  // Fetch catalog on filter / search / sort changes
  useEffect(() => {
    const abortController = new AbortController();

    async function fetchFilteredCatalog() {
      // If first mount and we already have catalog from props and no filters, don't show full-page loading
      if (
        isFirstMount.current &&
        catalog.length > 0 &&
        selectedGenres.length === 0 &&
        !debouncedSearch &&
        statusFilter === "All" &&
        sortBy === "score"
      ) {
        isFirstMount.current = false;
      } else {
        setIsLoading(true);
      }

      setPage(1);

      try {
        const params = new URLSearchParams();
        params.set("page", "1");
        params.set("perPage", "24");
        params.set("sort", sortBy);

        if (selectedGenres.length > 0) {
          params.set("genres", selectedGenres.join(","));
        }
        if (debouncedSearch.trim()) {
          params.set("search", debouncedSearch.trim());
        }
        if (statusFilter !== "All") {
          params.set("status", statusFilter === "Airing" ? "RELEASING" : "FINISHED");
        }

        const res = await fetch(`/api/catalog?${params.toString()}`, {
          signal: abortController.signal,
        });

        if (!res.ok) {
          throw new Error(`Failed to load catalog: ${res.status}`);
        }

        const data = await res.json();
        if (data.ok && Array.isArray(data.items)) {
          setItems(data.items);
          setPageInfo(data.pageInfo ?? null);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Explore catalog fetch error:", err);
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchFilteredCatalog();

    return () => {
      abortController.abort();
    };
  }, [selectedGenres, debouncedSearch, statusFilter, sortBy]);

  // Handle load more pagination
  const handleLoadMore = async () => {
    if (isLoadingMore || !pageInfo?.hasNextPage) return;

    setIsLoadingMore(true);
    const nextPage = page + 1;

    try {
      const params = new URLSearchParams();
      params.set("page", String(nextPage));
      params.set("perPage", "24");
      params.set("sort", sortBy);

      if (selectedGenres.length > 0) {
        params.set("genres", selectedGenres.join(","));
      }
      if (debouncedSearch.trim()) {
        params.set("search", debouncedSearch.trim());
      }
      if (statusFilter !== "All") {
        params.set("status", statusFilter === "Airing" ? "RELEASING" : "FINISHED");
      }

      const res = await fetch(`/api/catalog?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch next page: ${res.status}`);
      }

      const data = await res.json();
      if (data.ok && Array.isArray(data.items)) {
        setItems((prev) => {
          const seen = new Set(prev.map((a) => a.id));
          const additions = data.items.filter((a: Anime) => !seen.has(a.id));
          return [...prev, ...additions];
        });
        setPage(nextPage);
        setPageInfo(data.pageInfo ?? null);
      }
    } catch (err) {
      console.error("Explore load more error:", err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  const handleClearFilters = () => {
    setSelectedGenres([]);
    setSearchQuery("");
    setDebouncedSearch("");
    setStatusFilter("All");
    setSortBy("score");
  };

  const hasActiveFilters =
    selectedGenres.length > 0 || searchQuery.trim().length > 0 || statusFilter !== "All";

  const totalCount = pageInfo?.total ?? items.length;

  return (
    <div className="space-y-8 pb-20">
      {/* Header with Title + Search */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-line pb-6">
        <div>
          <h1 className="font-serif text-4xl text-text">Explore</h1>
          <p className="text-text-3 text-sm pt-1">
            {totalCount} titles available in archive
          </p>
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

      {/* Multi-Select Genre Chips */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {/* All Genres Reset Button */}
          <button
            type="button"
            onClick={() => setSelectedGenres([])}
            className={`px-3 py-1 rounded-full text-xs font-sans transition-colors duration-150 select-none border whitespace-nowrap ${
              selectedGenres.length === 0
                ? "border-accent bg-surface-2 text-accent font-medium"
                : "bg-surface text-text-2 border-line hover:border-text-3 hover:text-text"
            }`}
          >
            All Genres
          </button>

          {/* 13 Official Genres */}
          {ALL_ANIME_GENRES.map((genre) => {
            const isSelected = selectedGenres.includes(genre);
            return (
              <button
                key={genre}
                type="button"
                onClick={() => toggleGenre(genre)}
                className={`px-3 py-1 rounded-full text-xs font-sans transition-colors duration-150 select-none border whitespace-nowrap ${
                  isSelected
                    ? "border-accent bg-surface-2 text-accent font-medium"
                    : "bg-surface text-text-2 border-line hover:border-text-3 hover:text-text"
                }`}
              >
                {genre}
              </button>
            );
          })}
        </div>

        {/* Active Multi-Genre AND (Irisan) Status Banner */}
        {selectedGenres.length > 0 && (
          <div className="flex items-center justify-between bg-surface-2 border border-line rounded-control px-3.5 py-2 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-text-3">Matching all genres:</span>
              <span className="text-accent font-medium">
                {selectedGenres.join(" + ")}
              </span>
              <span className="text-text-3 font-mono">({totalCount} titles)</span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedGenres([])}
              className="text-text-3 hover:text-accent underline text-xs ml-4 shrink-0"
            >
              Clear genre filters
            </button>
          </div>
        )}
      </div>

      {/* Filter and Sorting Selects */}
      <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-text-2 bg-surface p-3 rounded-poster border border-line">
        <div className="flex items-center gap-4 flex-wrap">
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

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={handleClearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {/* Content Area: Loading / Grid / Empty State */}
      {isLoading ? (
        <div className="py-24 text-center space-y-3">
          <div className="w-7 h-7 rounded-full border-2 border-line border-t-accent animate-spin mx-auto" />
          <p className="text-text-2 text-xs">Filtering archive titles...</p>
        </div>
      ) : items.length > 0 ? (
        <div className="space-y-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {items.map((anime) => (
              <FlipAnimeCard
                key={anime.id}
                anime={anime}
                onClick={() => onSelectAnime(anime)}
              />
            ))}
          </div>

          {/* Load More Pagination Button */}
          {pageInfo?.hasNextPage && (
            <div className="text-center pt-4">
              <Button
                variant="secondary"
                disabled={isLoadingMore}
                onClick={handleLoadMore}
                className="min-w-[160px]"
              >
                {isLoadingMore ? "Loading titles..." : "Load more anime"}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="py-20 text-center space-y-3 border border-dashed border-line rounded-poster px-4">
          <p className="text-text font-medium text-sm">No titles match your active filters.</p>
          <p className="text-text-3 text-xs max-w-md mx-auto">
            {selectedGenres.length > 1
              ? `No anime has all ${selectedGenres.length} selected genres (${selectedGenres.join(" + ")}). Try removing some genres to broaden results.`
              : "Try selecting a different genre or clearing your search query."}
          </p>
          <div className="pt-2">
            <Button variant="secondary" size="sm" onClick={handleClearFilters}>
              Clear all filters
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
