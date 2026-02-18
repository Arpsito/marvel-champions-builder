"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Hero } from "@/lib/types";

const MARVELCDB_BASE = "https://marvelcdb.com";

export default function HeroGrid({ heroes }: { heroes: Hero[] }) {
  const [search, setSearch] = useState("");

  const filtered = heroes.filter((h) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      h.name.toLowerCase().includes(q) ||
      (h.alter_ego?.toLowerCase().includes(q) ?? false) ||
      h.traits.toLowerCase().includes(q)
    );
  });

  return (
    <>
      {/* Search bar */}
      <div className="mx-auto mb-8 max-w-md">
        <input
          type="text"
          placeholder="Search heroes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-3 text-gray-100 placeholder-gray-500 outline-none transition focus:border-red-600 focus:ring-1 focus:ring-red-600"
        />
      </div>

      {/* Hero grid */}
      {filtered.length === 0 ? (
        <p className="py-12 text-center text-gray-500">
          No heroes match &ldquo;{search}&rdquo;
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((hero) => (
            <Link
              key={hero.code}
              href={`/build/${hero.code}`}
              className="group relative overflow-hidden rounded-lg border border-gray-800 bg-gray-900 transition-all hover:border-red-600 hover:shadow-lg hover:shadow-red-900/20"
            >
              {/* Card image */}
              <div className="relative aspect-[5/7] w-full overflow-hidden">
                <Image
                  src={`${MARVELCDB_BASE}${hero.imagesrc}`}
                  alt={hero.name}
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                  className="object-cover object-top transition-transform duration-300 group-hover:scale-105"
                />
                {/* Gradient overlay at bottom for text readability */}
                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-gray-950 via-gray-950/80 to-transparent" />
              </div>

              {/* Hero info overlay */}
              <div className="absolute inset-x-0 bottom-0 p-2.5 sm:p-3">
                <h3 className="text-sm font-bold leading-tight text-white">
                  {hero.name}
                </h3>
                {hero.alter_ego && hero.alter_ego !== hero.name && (
                  <p className="mt-0.5 text-xs text-gray-400">
                    {hero.alter_ego}
                  </p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  {hero.total_decks.toLocaleString()} decks
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
