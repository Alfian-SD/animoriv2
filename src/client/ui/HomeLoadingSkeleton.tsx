import React from "react";

export const HomeLoadingSkeleton: React.FC = () => {
  return (
    <div className="space-y-16 pb-20 animate-pulse">
      {/* Top Status Bar Indicator */}
      <div className="flex items-center justify-between border border-line bg-surface px-4 py-2.5 rounded-control text-xs">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-accent" />
          <span className="text-text font-medium">Loading live catalog...</span>
        </div>
        <span className="text-text-3 font-mono text-[11px] hidden sm:inline">
          Syncing AniList GraphQL and verified mirrors
        </span>
      </div>

      {/* Hero Section Skeleton */}
      <section className="relative min-h-[460px] md:min-h-[520px] rounded-poster overflow-hidden border border-line bg-surface grid grid-cols-1 md:grid-cols-12 items-stretch">
        {/* Left: Titles & Actions Skeleton */}
        <div className="md:col-span-7 p-6 md:p-12 flex flex-col justify-end z-10 space-y-6">
          <div className="space-y-3">
            <div className="h-10 md:h-14 w-3/4 bg-surface-2 rounded-control" />
            <div className="space-y-2 pt-2">
              <div className="h-4 w-full max-w-xl bg-surface-2 rounded-control" />
              <div className="h-4 w-5/6 max-w-lg bg-surface-2 rounded-control" />
            </div>
            <div className="h-3 w-48 bg-surface-2 rounded-control mt-2" />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <div className="h-11 w-40 bg-surface-2 rounded-control" />
            <div className="h-11 w-24 bg-surface-2 rounded-control" />
            <div className="h-11 w-11 bg-surface-2 rounded-control" />
            <div className="ml-auto flex items-center gap-1.5">
              <div className="w-8 h-1 bg-accent/40 rounded-full" />
              <div className="w-4 h-1 bg-line rounded-full" />
              <div className="w-4 h-1 bg-line rounded-full" />
              <div className="w-4 h-1 bg-line rounded-full" />
              <div className="w-4 h-1 bg-line rounded-full" />
            </div>
          </div>
        </div>

        {/* Right: Artwork Placeholder */}
        <div className="md:col-span-5 h-[280px] md:h-full relative overflow-hidden border-t md:border-t-0 md:border-l border-line bg-surface-2/40 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full border border-line flex items-center justify-center text-text-3 font-mono text-xs">
            ★
          </div>
        </div>
      </section>

      {/* Trending Row Skeleton */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-2xl text-text">Trending</h2>
          <span className="text-xs text-text-3 font-mono">Ranked 1–10</span>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-none">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="w-[165px] sm:w-[185px] lg:w-[200px] aspect-[2/3] shrink-0 rounded-poster border border-line bg-surface p-2.5 flex flex-col justify-between"
            >
              <div className="w-6 h-5 rounded-control bg-[#09090B] border border-line" />
              <div className="space-y-1.5 pt-4">
                <div className="h-3 w-4/5 bg-surface-2 rounded-control" />
                <div className="h-2.5 w-1/2 bg-surface-2 rounded-control" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recently Updated Skeleton */}
      <section className="space-y-4">
        <h2 className="font-serif text-2xl text-text">Recently updated</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div
              key={idx}
              className="bg-surface border border-line p-3 rounded-poster flex items-center gap-4"
            >
              <div className="w-16 h-20 shrink-0 rounded-poster bg-surface-2 border border-line" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 bg-surface-2 rounded-control" />
                <div className="h-3 w-1/3 bg-surface-2 rounded-control" />
                <div className="h-2.5 w-1/2 bg-surface-2 rounded-control" />
              </div>
              <div className="w-16 h-8 bg-surface-2 rounded-control" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
