import React, { useState, useEffect, useCallback } from "react";
import type { Anime } from "@shared/anime.js";
import { HomePage } from "./pages/HomePage.js";
import { ExplorePage } from "./pages/ExplorePage.js";
import { DetailsPage } from "./pages/DetailsPage.js";
import { WatchPage } from "./pages/WatchPage.js";
import { Button } from "./ui/components.js";

type ViewMode = "home" | "explore" | "details" | "watch";

export function getAnimeCleanSlug(anime: {
  slug?: string;
  title?: { romaji?: string; english?: string };
  id?: string;
}): string {
  if (anime.slug && !anime.slug.startsWith("al-") && !anime.slug.startsWith("mal-")) {
    return anime.slug;
  }
  const title = anime.title?.romaji || anime.title?.english || anime.slug || anime.id || "";
  const clean = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return clean || anime.slug || anime.id || "";
}

export const App: React.FC = () => {
  const [view, setView] = useState<ViewMode>("home");
  const [searchKeyword, setSearchKeyword] = useState<string>("");
  const [catalog, setCatalog] = useState<Anime[]>([]);
  const [archiveTotal, setArchiveTotal] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [loadingAnimeDetails, setLoadingAnimeDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedAnime, setSelectedAnime] = useState<Anime | null>(null);
  const [currentEpisodeNumber, setCurrentEpisodeNumber] = useState<number>(1);

  // Synchronize view state from window.location.pathname
  const syncRouteFromLocation = useCallback(
    async (catalogList?: Anime[]) => {
      let pathname = window.location.pathname;
      const hash = window.location.hash;

      // Redirect root / or hash /#/ to /home
      if (pathname === "/" || pathname === "" || hash.startsWith("#/")) {
        window.history.replaceState(null, "", "/home");
        pathname = "/home";
      }

      const clean = pathname.replace(/^\/+|\/+$/g, "");

      if (clean === "home" || clean === "") {
        setView("home");
        return;
      }

      if (clean === "explore") {
        setView("explore");
        setSearchKeyword("");
        return;
      }

      if (clean.startsWith("src/")) {
        const slug = clean.slice(4);
        const keyword = slug.replace(/-/g, " ");
        setView("explore");
        setSearchKeyword(keyword);
        return;
      }

      // Check anime route: /:animeSlug or /:animeSlug/ep-:epNum
      let animeSlug = clean;
      let targetEp = 1;
      let isWatch = false;

      if (clean.includes("/ep-")) {
        const parts = clean.split("/ep-");
        animeSlug = parts[0] ?? clean;
        targetEp = parseInt(parts[1] ?? "1", 10) || 1;
        isWatch = true;
      }

      const activeList = catalogList ?? catalog;
      const cached = activeList.find(
        (a) => a.slug === animeSlug || a.id === animeSlug || getAnimeCleanSlug(a) === animeSlug
      );

      if (cached) {
        setSelectedAnime(cached);
        setCurrentEpisodeNumber(targetEp);
        setView(isWatch ? "watch" : "details");
        return;
      }

      // If not in local catalog, fetch from backend API /api/anime/:idOrSlug
      try {
        setLoadingAnimeDetails(true);
        const res = await fetch(`/api/anime/${encodeURIComponent(animeSlug)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.ok && data.anime) {
            const normalizedAnime = {
              ...data.anime,
              slug: getAnimeCleanSlug(data.anime),
            };
            setSelectedAnime(normalizedAnime);
            setCurrentEpisodeNumber(targetEp);
            setView(isWatch ? "watch" : "details");
            return;
          }
        }
      } catch (err) {
        console.error("Failed to load anime from slug:", err);
      } finally {
        setLoadingAnimeDetails(false);
      }

      // Fallback redirect to /home if not found
      window.history.replaceState(null, "", "/home");
      setView("home");
    },
    [catalog]
  );

  // Popstate listener for browser Back / Forward buttons
  useEffect(() => {
    const onPopState = () => {
      void syncRouteFromLocation();
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [syncRouteFromLocation]);

  // Initial route sync and catalog fetch
  useEffect(() => {
    async function loadCatalog() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/catalog");
        if (!res.ok) {
          throw new Error(`Failed to load catalog from server (HTTP ${res.status})`);
        }
        const data = await res.json();
        if (data.ok && Array.isArray(data.items)) {
          const normalized = data.items.map((item: Anime) => ({
            ...item,
            slug: getAnimeCleanSlug(item),
          }));
          setCatalog(normalized);
          const total =
            typeof data.archiveTotal === "number" && data.archiveTotal > 0
              ? data.archiveTotal
              : typeof data.pageInfo?.total === "number" && data.pageInfo.total > 0
                ? data.pageInfo.total
                : data.items.length;
          setArchiveTotal(total);
          void syncRouteFromLocation(normalized);
        } else {
          throw new Error("Invalid catalog response format");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
        void syncRouteFromLocation();
      } finally {
        setLoading(false);
      }
    }
    loadCatalog();
  }, [syncRouteFromLocation]);

  const handleNavHome = () => {
    setView("home");
    window.history.pushState(null, "", "/home");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleNavExplore = () => {
    setSearchKeyword("");
    setView("explore");
    window.history.pushState(null, "", "/explore");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSelectAnime = (anime: Anime) => {
    const cleanSlug = getAnimeCleanSlug(anime);
    setSelectedAnime(anime);
    setView("details");
    window.history.pushState(null, "", `/${cleanSlug}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleWatchEpisode = (anime: Anime, epNumber: number) => {
    const cleanSlug = getAnimeCleanSlug(anime);
    setSelectedAnime(anime);
    setCurrentEpisodeNumber(epNumber);
    setView("watch");
    window.history.pushState(null, "", `/${cleanSlug}/ep-${epNumber}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSelectEpisode = (epNumber: number) => {
    setCurrentEpisodeNumber(epNumber);
    if (selectedAnime) {
      const cleanSlug = getAnimeCleanSlug(selectedAnime);
      window.history.replaceState(null, "", `/${cleanSlug}/ep-${epNumber}`);
    }
  };

  const handleBackToDetails = () => {
    setView("details");
    if (selectedAnime) {
      const cleanSlug = getAnimeCleanSlug(selectedAnime);
      window.history.pushState(null, "", `/${cleanSlug}`);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBackToBrowse = () => {
    setView("home");
    window.history.pushState(null, "", "/home");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-line bg-bg/95 backdrop-blur-none sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Navigation */}
          <div className="flex items-center gap-8">
            <button
              onClick={handleNavHome}
              className="font-serif text-3xl tracking-tight text-text hover:text-accent transition-colors flex items-center gap-2"
            >
              Yoake
            </button>

            <nav className="flex items-center gap-6 text-sm font-medium">
              <button
                onClick={handleNavHome}
                className={`transition-colors ${
                  view === "home" ? "text-accent font-semibold" : "text-text-2 hover:text-text"
                }`}
              >
                Home
              </button>
              <button
                onClick={handleNavExplore}
                className={`transition-colors ${
                  view === "explore" ? "text-accent font-semibold" : "text-text-2 hover:text-text"
                }`}
              >
                Explore
              </button>
            </nav>
          </div>

          {/* Quick status */}
          <div className="text-xs text-text-3 font-mono hidden sm:block">
            {archiveTotal > 0
              ? `${archiveTotal.toLocaleString()} archive titles · Stream engine online`
              : "Stream engine online"}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {loading || loadingAnimeDetails ? (
          <div className="py-32 text-center space-y-3">
            <div className="w-8 h-8 rounded-full border-2 border-line border-t-accent animate-spin mx-auto" />
            <p className="text-text-2 text-sm">Connecting to Yoake archive server...</p>
          </div>
        ) : error ? (
          <div className="py-24 text-center space-y-4 max-w-md mx-auto">
            <div className="text-danger font-medium text-base">Server communication failed</div>
            <p className="text-text-2 text-xs">{error}</p>
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Retry connection
            </Button>
          </div>
        ) : (
          <>
            {view === "home" && (
              <HomePage
                catalog={catalog}
                onSelectAnime={handleSelectAnime}
                onWatchEpisode={handleWatchEpisode}
              />
            )}

            {view === "explore" && (
              <ExplorePage
                catalog={catalog}
                onSelectAnime={handleSelectAnime}
                initialSearch={searchKeyword}
                onSearchChange={setSearchKeyword}
              />
            )}

            {view === "details" && selectedAnime && (
              <DetailsPage
                anime={selectedAnime}
                catalog={catalog}
                onSelectAnime={handleSelectAnime}
                onWatchEpisode={handleWatchEpisode}
                onBack={handleBackToBrowse}
              />
            )}

            {view === "watch" && selectedAnime && (
              <WatchPage
                anime={selectedAnime}
                episodeNumber={currentEpisodeNumber}
                onSelectEpisode={handleSelectEpisode}
                onBackToDetails={handleBackToDetails}
              />
            )}
          </>
        )}
      </main>

      {/* Minimal Footer */}
      <footer className="border-t border-line py-8 bg-surface text-text-3 text-xs">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-serif text-lg text-text">Yoake</span>
            <span>— Editorial anime streaming archive. Fictional catalog with deterministic vector key art.</span>
          </div>
          <div>All stream proxies enforced with RFC 1918 & IPv6 SSRF filters.</div>
        </div>
      </footer>
    </div>
  );
};
