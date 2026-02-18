"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import type { CardInfo, Recommendation } from "@/lib/recommender";

const MARVELCDB_BASE = "https://marvelcdb.com";
const PLACEHOLDER_IMG = "/placeholder-card.svg";

function cardImageSrc(imagesrc: string | null | undefined): string {
  return imagesrc ? `${MARVELCDB_BASE}${imagesrc}` : PLACEHOLDER_IMG;
}

const CARD_TYPES = ["Ally", "Event", "Support", "Upgrade", "Resource"] as const;
const COST_BUCKETS = ["0", "1", "2", "3", "4", "5+"] as const;

function matchesCostFilter(cost: number | null | undefined, buckets: Set<string>): boolean {
  if (buckets.size === 0) return true;
  if (cost === null || cost === undefined) return false;
  if (cost >= 5) return buckets.has("5+");
  return buckets.has(String(cost));
}

interface SuggestionsPanelProps {
  recommendations: Recommendation[];
  cardIndex: Record<string, CardInfo>;
  deckCount: number;
  selectedCards: string[];
  excludeCards: Set<string>;
  signatureCards: Set<string>;
  onAddCard: (code: string) => void;
}

export default function SuggestionsPanel({
  recommendations,
  cardIndex,
  deckCount,
  selectedCards,
  excludeCards,
  signatureCards,
  onAddCard,
}: SuggestionsPanelProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());
  const [costFilter, setCostFilter] = useState<Set<string>>(new Set());

  const hasFilters = search !== "" || typeFilter.size > 0 || costFilter.size > 0;

  const clearFilters = () => {
    setSearch("");
    setTypeFilter(new Set());
    setCostFilter(new Set());
  };

  const toggleType = (type: string) => {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const toggleCost = (bucket: string) => {
    setCostFilter((prev) => {
      const next = new Set(prev);
      if (next.has(bucket)) next.delete(bucket);
      else next.add(bucket);
      return next;
    });
  };

  // Filtered recommendations
  const filtered = useMemo(() => {
    return recommendations.filter((r) => {
      const card = cardIndex[r.cardCode];
      if (!card) return false;
      if (search && !card.name.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      if (typeFilter.size > 0 && !typeFilter.has(card.type_name)) return false;
      if (!matchesCostFilter(card.cost, costFilter)) return false;
      return true;
    });
  }, [recommendations, cardIndex, search, typeFilter, costFilter]);

  // Search across ALL eligible cards (not just recommendations)
  const searchResults = useMemo(() => {
    if (!search || search.length < 2) return null;
    const q = search.toLowerCase();
    const alreadyRecommended = new Set(recommendations.map((r) => r.cardCode));
    const results: Array<{ code: string; card: CardInfo }> = [];
    const seenNames = new Set<string>();

    for (const [code, card] of Object.entries(cardIndex)) {
      if (excludeCards.has(code)) continue;
      if (signatureCards.has(code)) continue;
      // Allow searching for additional copies if below deck_limit
      const copies = selectedCards.filter((c) => c === code).length;
      const limit = card.deck_limit ?? 3;
      if (copies >= limit) continue;
      if (alreadyRecommended.has(code)) continue;
      if (!card.name.toLowerCase().includes(q)) continue;
      if (card.type_name === "Hero" || card.type_name === "Alter-Ego") continue;
      if (card.type_name === "Obligation" || card.type_name === "Environment") continue;
      if (card.type_name === "Minion" || card.type_name === "Treachery") continue;
      if (card.type_name === "Side Scheme" || card.type_name === "Attachment") continue;
      const dedupeKey = `${card.name}|${card.faction_name}`;
      if (seenNames.has(dedupeKey)) continue;
      seenNames.add(dedupeKey);
      if (typeFilter.size > 0 && !typeFilter.has(card.type_name)) continue;
      if (!matchesCostFilter(card.cost, costFilter)) continue;
      results.push({ code, card });
    }

    results.sort((a, b) => a.card.name.localeCompare(b.card.name));
    return results.slice(0, 12);
  }, [search, cardIndex, excludeCards, signatureCards, selectedCards, recommendations, typeFilter, costFilter]);

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-800 px-4 py-3 sm:px-6">
        <h2 className="text-lg font-bold text-white">Recommended Cards</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          Based on {deckCount.toLocaleString()} recent community decks
        </p>
      </div>

      {/* Filters */}
      <div className="space-y-2 border-b border-gray-800 px-4 py-3 sm:px-6">
        {/* Search — full width on mobile */}
        <input
          type="text"
          placeholder="Search cards..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none transition focus:border-gray-500 sm:py-1.5"
        />

        {/* Type + Cost + Clear in a wrapping row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Type filter chips */}
          <div className="flex flex-wrap gap-1">
            {CARD_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={`rounded-full px-2.5 py-1.5 text-xs font-medium transition ${
                  typeFilter.has(type)
                    ? "bg-gray-100 text-gray-900"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Cost filter */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">Cost:</span>
            {COST_BUCKETS.map((bucket) => (
              <button
                key={bucket}
                onClick={() => toggleCost(bucket)}
                className={`h-8 min-w-8 rounded px-1 text-xs font-medium transition ${
                  costFilter.has(bucket)
                    ? "bg-gray-100 text-gray-900"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                {bucket}
              </button>
            ))}
          </div>

          {/* Clear filters */}
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="rounded-full px-2.5 py-1.5 text-xs font-medium text-gray-400 transition hover:bg-gray-800 hover:text-white"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Result count */}
      {hasFilters && filtered.length < recommendations.length && (
        <div className="border-b border-gray-800 px-4 py-1.5 sm:px-6">
          <p className="text-xs text-gray-500">
            Showing {filtered.length} of {recommendations.length} eligible cards
          </p>
        </div>
      )}

      {/* Card grid */}
      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {/* Recommendations */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {filtered.map((rec, idx) => (
            <SuggestionCard
              key={rec.cardCode}
              rec={rec}
              card={cardIndex[rec.cardCode]}
              rank={idx}
              onAdd={onAddCard}
            />
          ))}
        </div>

        {/* Extended search results (cards not in recommendations) */}
        {searchResults && searchResults.length > 0 && (
          <>
            <div className="mt-6 mb-3 border-t border-gray-800 pt-4">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
                Other matching cards
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {searchResults.map(({ code, card }) => (
                <SearchResultCard
                  key={code}
                  code={code}
                  card={card}
                  onAdd={onAddCard}
                />
              ))}
            </div>
          </>
        )}

        {filtered.length === 0 && (!searchResults || searchResults.length === 0) && (
          <p className="py-12 text-center text-sm text-gray-500">
            No cards match your filters
          </p>
        )}
      </div>
    </div>
  );
}

// ── Scoring helpers ───────────────────────────────────────────────────────────

/**
 * Map a 0–100 score to a color hue (HSL).
 * 100 → 142 (green), 50 → 60 (yellow), 0 → 0 (red).
 */
function scoreHue(score: number): number {
  // Piecewise for a nicer feel: green stays green longer, shifts faster at low end
  if (score >= 70) return 120 + (score - 70) * (22 / 30); // 120→142
  if (score >= 30) return 36 + (score - 30) * (84 / 40);  // 36→120
  return score * (36 / 30);                                 // 0→36
}

function scoreBarColor(score: number): string {
  return `hsl(${scoreHue(score)}, 85%, 48%)`;
}

function scoreBarTrackColor(score: number): string {
  return `hsl(${scoreHue(score)}, 25%, 14%)`;
}

function scoreTextColor(score: number): string {
  return `hsl(${scoreHue(score)}, 75%, 62%)`;
}

function scoreLabel(score: number): string | null {
  if (score >= 80) return "Community staple";
  if (score >= 60) return "Popular pick";
  if (score < 20) return "Bold pick";
  if (score < 30) return "Creative pick";
  return null;
}

// ── Card components ───────────────────────────────────────────────────────────

function SuggestionCard({
  rec,
  card,
  rank,
  onAdd,
}: {
  rec: Recommendation;
  card: CardInfo | undefined;
  rank: number;
  onAdd: (code: string) => void;
}) {
  if (!card) return null;

  const { score } = rec;
  const isTopPick = rank === 0;

  // Border based on score range + special top-pick treatment
  const borderClass = isTopPick
    ? "border-amber-400/60 shadow-[0_0_15px_-3px] shadow-amber-400/20"
    : score >= 70
      ? "border-emerald-500/30"
      : score >= 30
        ? "border-gray-700"
        : "border-orange-500/25";

  const label = scoreLabel(score);

  return (
    <button
      onClick={() => onAdd(rec.cardCode)}
      title={rec.reason}
      className={`group relative overflow-hidden rounded-lg border ${borderClass} bg-gray-900 text-left transition-all hover:scale-[1.02] hover:border-white/40 hover:shadow-xl`}
    >
      {/* Card image */}
      <div className="relative aspect-[5/7] w-full overflow-hidden">
        <Image
          src={cardImageSrc(card.imagesrc)}
          alt={card.name}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 20vw"
          className="object-cover object-top transition-transform duration-200 group-hover:scale-105"
          loading="lazy"
        />

        {/* Top pick badge */}
        {isTopPick && (
          <div className="absolute top-1.5 left-1.5">
            <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
              &#9733; Top Pick
            </span>
          </div>
        )}

        {/* Copy number badge */}
        {rec.copyNumber > 1 && (
          <div className="absolute top-1.5 right-1.5">
            <span className="rounded bg-gray-900/80 px-1.5 py-0.5 text-[10px] font-medium text-gray-300">
              {rec.copyNumber === 2 ? "2nd" : rec.copyNumber === 3 ? "3rd" : `${rec.copyNumber}th`} copy
            </span>
          </div>
        )}

        {/* Hover: + icon and tooltip */}
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/0 transition group-hover:bg-black/40">
          <div className="rounded-full bg-white/0 p-2 transition group-hover:bg-white/20">
            <svg
              className="h-8 w-8 text-white opacity-0 transition group-hover:opacity-100"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </div>
          <p className="mt-1 max-w-[90%] text-center text-[10px] leading-tight text-white/0 transition group-hover:text-white/90">
            {rec.reason}
          </p>
        </div>
      </div>

      {/* Score bar */}
      <div className="h-1.5" style={{ backgroundColor: scoreBarTrackColor(score) }}>
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${score}%`, backgroundColor: scoreBarColor(score) }}
        />
      </div>

      {/* Card info */}
      <div className="px-2 py-2">
        <div className="flex items-start justify-between gap-1">
          <p className="min-w-0 truncate text-xs font-medium text-white">{card.name}</p>
          <span
            className="shrink-0 text-[10px] font-bold tabular-nums"
            style={{ color: scoreTextColor(score) }}
          >
            {score}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-1">
          <span className="truncate text-[10px] text-gray-500">
            {card.type_name}
            {card.cost !== null && <span className="text-gray-600"> &middot; {card.cost}</span>}
          </span>
          {label && (
            <span
              className="shrink-0 text-[9px] font-medium"
              style={{ color: scoreTextColor(score) }}
            >
              {label}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function SearchResultCard({
  code,
  card,
  onAdd,
}: {
  code: string;
  card: CardInfo;
  onAdd: (code: string) => void;
}) {
  return (
    <button
      onClick={() => onAdd(code)}
      className="group relative overflow-hidden rounded-lg border border-gray-700 bg-gray-850 text-left transition-all hover:scale-[1.02] hover:border-white/40"
    >
      <div className="relative aspect-[5/7] w-full overflow-hidden">
        <Image
          src={cardImageSrc(card.imagesrc)}
          alt={card.name}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 20vw"
          className="object-cover object-top transition-transform duration-200 group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/30">
          <div className="rounded-full bg-white/0 p-2 transition group-hover:bg-white/20">
            <svg
              className="h-8 w-8 text-white opacity-0 transition group-hover:opacity-100"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </div>
        </div>
      </div>
      <div className="bg-gray-900 px-2 py-2">
        <p className="truncate text-xs font-medium text-white">{card.name}</p>
        <span className="text-[10px] text-gray-500">
          {card.type_name}
          {card.cost !== null && ` · ${card.cost} cost`}
        </span>
      </div>
    </button>
  );
}
