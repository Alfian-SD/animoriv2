import React, { useState, useEffect } from "react";
import type { Anime } from "@shared/anime.js";
import { HomePage } from "./pages/HomePage.js";
import { ExplorePage } from "./pages/ExplorePage.js";
import { DetailsPage } from "./pages/DetailsPage.js";
import { WatchPage } from "./pages/WatchPage.js";
import { Button } from "./ui/components.js";

type ViewMode = "home" | "explore" | "details" | "watch";

export const App: React.FC = () => {
  const [view, setView] = useState<ViewMode>("home");
  const [catalog, setCatalog] = useState<Anime[]>([]);
  const [archiveTotal, setArchiveTotal] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedAnime, setSelectedAnime] = useState<Anime | null>(null);
  const [currentEpisodeNumber, setCurrentEpisodeNumber] = useState<number>(1);

  // Fetch catalog from backend API
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
          setCatalog(data.items);
          const total =
            typeof data.archiveTotal === "number" && data.archiveTotal > 0
              ? data.archiveTotal
              : typeof data.pageInfo?.total === "number" && data.pageInfo.total > 0
                ? data.pageInfo.total
                : data.items.length;
          setArchiveTotal(total);
        } else {
          throw new Error("Invalid catalog response format");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
      } finally {
        setLoading(false);
      }
    }
    loadCatalog();
  }, []);

  const handleSelectAnime = (anime: Anime) => {
    setSelectedAnime(anime);
    setView("details");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleWatchEpisode = (anime: Anime, epNumber: number) => {
    setSelectedAnime(anime);
    setCurrentEpisodeNumber(epNumber);
    setView("watch");
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
              onClick={() => {
                setView("home");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="font-serif text-3xl tracking-tight text-text hover:text-accent transition-colors flex items-center gap-2"
            >
              Yoake
            </button>

            <nav className="flex items-center gap-6 text-sm font-medium">
              <button
                onClick={() => setView("home")}
                className={`transition-colors ${
                  view === "home" ? "text-accent font-semibold" : "text-text-2 hover:text-text"
                }`}
              >
                Home
              </button>
              <button
                onClick={() => setView("explore")}
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
        {loading ? (
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
              <ExplorePage catalog={catalog} onSelectAnime={handleSelectAnime} />
            )}

            {view === "details" && selectedAnime && (
              <DetailsPage
                anime={selectedAnime}
                catalog={catalog}
                onSelectAnime={handleSelectAnime}
                onWatchEpisode={handleWatchEpisode}
                onBack={() => setView("home")}
              />
            )}

            {view === "watch" && selectedAnime && (
              <WatchPage
                anime={selectedAnime}
                episodeNumber={currentEpisodeNumber}
                onSelectEpisode={(ep) => setCurrentEpisodeNumber(ep)}
                onBackToDetails={() => setView("details")}
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
