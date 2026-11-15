import React, { useEffect, useState } from "react";
import type { Anime } from "@shared/anime.js";

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export interface ArtworkProps {
  anime: Anime;
  aspect?: "poster" | "backdrop" | "thumb";
  variant?: "poster" | "backdrop";
  className?: string;
}

export const Artwork: React.FC<ArtworkProps> = ({
  anime,
  aspect = "poster",
  variant,
  className = "",
}) => {
  const isBackdrop = variant === "backdrop" || aspect === "backdrop";
  const imageUrl = isBackdrop
    ? anime.artwork.backdropUrl ?? anime.artwork.posterUrl
    : anime.artwork.posterUrl ?? anime.artwork.backdropUrl;

  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [imageUrl]);

  if (imageUrl && !imgFailed) {
    return (
      <div
        className={`relative w-full h-full overflow-hidden bg-surface rounded-poster select-none ${className}`}
      >
        <img
          src={imageUrl}
          alt={anime.title.english ?? anime.title.romaji}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setImgFailed(true)}
          className="h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-[1.03]"
        />
        {isBackdrop && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, rgba(9,9,11,0.94) 0%, rgba(9,9,11,0.72) 48%, rgba(9,9,11,0.25) 100%), linear-gradient(0deg, #09090B 4%, rgba(9,9,11,0) 60%)",
            }}
          />
        )}
      </div>
    );
  }

  // Fallback geometric vector rendering
  const seed = hashString(anime.id || anime.slug);
  const motif = anime.artwork.motif || "sun";
  const viewBox = aspect === "poster" || aspect === "thumb" ? "0 0 400 600" : "0 0 800 450";

  return (
    <div
      className={`relative w-full h-full bg-[#121215] overflow-hidden select-none border border-line rounded-poster ${className}`}
    >
      <svg
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full block"
        aria-label={`${anime.title.romaji} artwork`}
      >
        <rect width="100%" height="100%" fill="#0D0D10" />

        {/* Hairline architectural grid */}
        <g stroke="#27272A" strokeWidth="1">
          <line x1="32" y1="0" x2="32" y2="600" />
          <line x1="368" y1="0" x2="368" y2="600" />
          <line x1="0" y1="48" x2="800" y2="48" />
          <line x1="0" y1="440" x2="800" y2="440" />
        </g>

        {/* Motif Rendering */}
        {motif === "sun" && (
          <g>
            <circle
              cx={aspect === "poster" || aspect === "thumb" ? "200" : "400"}
              cy={aspect === "poster" || aspect === "thumb" ? "220" : "180"}
              r="74"
              fill="#A3E635"
            />
            <rect
              x={aspect === "poster" || aspect === "thumb" ? "40" : "120"}
              y={aspect === "poster" || aspect === "thumb" ? "220" : "180"}
              width={aspect === "poster" || aspect === "thumb" ? "320" : "560"}
              height="200"
              fill="#18181B"
            />
            {[0, 1, 2, 3, 4].map((i) => (
              <line
                key={i}
                x1={aspect === "poster" || aspect === "thumb" ? "40" : "120"}
                y1={aspect === "poster" || aspect === "thumb" ? 240 + i * 28 : 200 + i * 28}
                x2={aspect === "poster" || aspect === "thumb" ? "360" : "680"}
                y2={aspect === "poster" || aspect === "thumb" ? 240 + i * 28 : 200 + i * 28}
                stroke="#27272A"
                strokeWidth="1.5"
              />
            ))}
          </g>
        )}

        {motif === "ridgelines" && (
          <g>
            <polygon
              points={
                aspect === "poster" || aspect === "thumb"
                  ? "200,90 330,360 70,360"
                  : "400,60 580,360 220,360"
              }
              fill="#18181B"
              stroke="#FAFAFA"
              strokeWidth="1.5"
            />
            <polygon
              points={
                aspect === "poster" || aspect === "thumb"
                  ? "200,150 290,340 110,340"
                  : "400,120 520,340 280,340"
              }
              fill="none"
              stroke="#A3E635"
              strokeWidth="2"
            />
            <line
              x1={aspect === "poster" || aspect === "thumb" ? "50" : "150"}
              y1={aspect === "poster" || aspect === "thumb" ? "260" : "240"}
              x2={aspect === "poster" || aspect === "thumb" ? "200" : "400"}
              y2={aspect === "poster" || aspect === "thumb" ? "210" : "190"}
              stroke="#B4B4BC"
              strokeWidth="1.5"
            />
          </g>
        )}

        {motif === "slash" && (
          <g>
            <rect
              x={aspect === "poster" || aspect === "thumb" ? "88" : "240"}
              y="90"
              width={aspect === "poster" || aspect === "thumb" ? "224" : "320"}
              height="280"
              fill="#18181B"
              stroke="#27272A"
              strokeWidth="1.5"
            />
            <line
              x1={aspect === "poster" || aspect === "thumb" ? "60" : "180"}
              y1={aspect === "poster" || aspect === "thumb" ? "380" : "340"}
              x2={aspect === "poster" || aspect === "thumb" ? "340" : "620"}
              y2="100"
              stroke="#A3E635"
              strokeWidth="5"
            />
            <circle
              cx={aspect === "poster" || aspect === "thumb" ? "260" : "460"}
              cy="180"
              r="28"
              fill="#09090B"
              stroke="#FAFAFA"
              strokeWidth="1.5"
            />
          </g>
        )}

        {motif === "waves" && (
          <g>
            {[0, 1, 2, 3].map((row) =>
              [0, 1, 2].map((col) => {
                const x =
                  (aspect === "poster" || aspect === "thumb" ? 80 : 250) + col * 84;
                const y = 90 + row * 84;
                const isHighlight = (row + col + seed) % 4 === 0;
                return (
                  <rect
                    key={`${row}-${col}`}
                    x={x}
                    y={y}
                    width="70"
                    height="70"
                    fill={isHighlight ? "#A3E635" : "#18181B"}
                    stroke={isHighlight ? "#A3E635" : "#27272A"}
                    strokeWidth="1.5"
                  />
                );
              })
            )}
          </g>
        )}

        {/* Minimal registration mark */}
        <text
          x={aspect === "poster" || aspect === "thumb" ? "44" : "50"}
          y={aspect === "poster" || aspect === "thumb" ? "570" : "420"}
          fill="#8A8A93"
          fontSize="11"
          fontFamily="system-ui"
          letterSpacing="1"
        >
          {anime.studio} · {anime.seasonYear}
        </text>
      </svg>
    </div>
  );
};

export const AnimeArtwork = Artwork;
export const PosterArt = (props: Omit<ArtworkProps, "variant" | "aspect"> & { className?: string }) => (
  <Artwork aspect="poster" {...props} />
);
export const BackdropArt = (props: Omit<ArtworkProps, "variant" | "aspect"> & { className?: string }) => (
  <Artwork aspect="backdrop" {...props} />
);
