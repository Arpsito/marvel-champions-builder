"use client";

import Image from "next/image";
import Link from "next/link";

const MARVELCDB_BASE = "https://marvelcdb.com";

interface AspectInfo {
  key: string;
  deckCount: number;
}

interface AspectSelectProps {
  heroCode: string;
  heroName: string;
  alterEgo: string | null;
  imagesrc: string;
  totalDecks: number;
  aspects: AspectInfo[];
}

const ASPECT_CONFIG: Record<
  string,
  {
    label: string;
    color: string;
    border: string;
    bg: string;
    glow: string;
    subtitle?: string;
  }
> = {
  leadership: {
    label: "Leadership",
    color: "text-blue-400",
    border: "border-blue-500",
    bg: "bg-blue-500/10",
    glow: "hover:shadow-blue-500/25",
  },
  justice: {
    label: "Justice",
    color: "text-yellow-400",
    border: "border-yellow-500",
    bg: "bg-yellow-500/10",
    glow: "hover:shadow-yellow-500/25",
  },
  aggression: {
    label: "Aggression",
    color: "text-red-400",
    border: "border-red-500",
    bg: "bg-red-500/10",
    glow: "hover:shadow-red-500/25",
  },
  protection: {
    label: "Protection",
    color: "text-green-400",
    border: "border-green-500",
    bg: "bg-green-500/10",
    glow: "hover:shadow-green-500/25",
  },
  all: {
    label: "No Aspect",
    color: "text-gray-300",
    border: "border-gray-600",
    bg: "bg-gray-700/20",
    glow: "hover:shadow-gray-500/15",
    subtitle: "Cross-aspect data \u2014 auto-locks when you pick an aspect card",
  },
};

const ASPECT_ORDER = ["leadership", "justice", "aggression", "protection", "all"];

export default function AspectSelect({
  heroCode,
  heroName,
  alterEgo,
  imagesrc,
  totalDecks,
  aspects,
}: AspectSelectProps) {
  const aspectMap = new Map(aspects.map((a) => [a.key, a]));
  const orderedAspects = ASPECT_ORDER.filter((key) => aspectMap.has(key));

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8">
      {/* Back button */}
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 py-2 text-sm text-gray-400 transition hover:text-white"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 19.5L8.25 12l7.5-7.5"
          />
        </svg>
        All Heroes
      </Link>

      {/* Hero header */}
      <div className="mb-10 flex flex-col items-center gap-6 sm:flex-row sm:items-start">
        {/* Hero card art */}
        <div className="relative aspect-[5/7] w-36 shrink-0 overflow-hidden rounded-xl border border-gray-700 shadow-lg shadow-black/40 sm:w-48">
          <Image
            src={`${MARVELCDB_BASE}${imagesrc}`}
            alt={heroName}
            fill
            sizes="(max-width: 640px) 144px, 192px"
            className="object-cover object-top"
            priority
          />
        </div>

        {/* Hero info */}
        <div className="text-center sm:text-left">
          <h1 className="text-3xl font-bold text-white">{heroName}</h1>
          {alterEgo && alterEgo !== heroName && (
            <p className="mt-1 text-lg text-gray-400">{alterEgo}</p>
          )}
          <p className="mt-3 text-sm text-gray-500">
            {totalDecks.toLocaleString()} community decks
          </p>
          <p className="mt-6 text-sm font-medium text-gray-300">
            Choose an aspect to start building
          </p>
        </div>
      </div>

      {/* Aspect buttons */}
      <div className="grid gap-3">
        {orderedAspects.map((key) => {
          const info = aspectMap.get(key)!;
          const config = ASPECT_CONFIG[key];

          return (
            <Link
              key={key}
              href={`/build/${heroCode}/${key}`}
              className={`group flex items-center justify-between rounded-xl border ${config.border} ${config.bg} px-4 py-3.5 transition-all hover:shadow-lg sm:px-6 sm:py-4 ${config.glow}`}
            >
              <div>
                <span className={`text-lg font-bold ${config.color}`}>
                  {config.label}
                </span>
                {config.subtitle && (
                  <p className="mt-0.5 text-xs text-gray-500">
                    {config.subtitle}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400">
                  {info.deckCount.toLocaleString()} decks
                </span>
                <svg
                  className="h-5 w-5 text-gray-600 transition group-hover:translate-x-0.5 group-hover:text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.25 4.5l7.5 7.5-7.5 7.5"
                  />
                </svg>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
