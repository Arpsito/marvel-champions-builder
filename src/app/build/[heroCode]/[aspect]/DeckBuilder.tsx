"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  loadData,
  getRecommendations,
  type DeckData,
  type CardInfo,
  type Recommendation,
} from "@/lib/recommender";
import {
  getSavedDecks,
  getAutosave,
  setAutosave,
  clearAutosave,
  saveDeck,
  type SavedDeck,
} from "@/lib/deck-storage";
import DeckPanel from "./DeckPanel";
import SuggestionsPanel from "./SuggestionsPanel";

const ASPECTS = ["aggression", "justice", "leadership", "protection"];
const ASPECT_FACTIONS: Record<string, string> = {
  aggression: "Aggression",
  justice: "Justice",
  leadership: "Leadership",
  protection: "Protection",
};

interface DeckBuilderProps {
  heroCode: string;
  heroName: string;
  alterEgo: string | null;
  heroImagesrc: string;
  initialAspect: string;
}

export default function DeckBuilder({
  heroCode,
  heroName,
  alterEgo,
  heroImagesrc,
  initialAspect,
}: DeckBuilderProps) {
  const searchParams = useSearchParams();
  const [deckData, setDeckData] = useState<DeckData | null>(null);
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoreBanner, setRestoreBanner] = useState<string | null>(null);
  const restoredRef = useRef(false);

  // Load deck data on mount
  useEffect(() => {
    fetch("/data/deck_data.json")
      .then((res) => res.json())
      .then((data: DeckData) => {
        loadData(data);
        setDeckData(data);
        setLoading(false);
      });
  }, []);

  // Restore from saved deck or autosave after data loads
  useEffect(() => {
    if (!deckData || restoredRef.current) return;
    restoredRef.current = true;

    const loadParam = searchParams.get("load");
    let restored: string[] | null = null;

    if (loadParam === "autosave") {
      const auto = getAutosave();
      if (auto && auto.heroCode === heroCode && auto.aspect === initialAspect) {
        restored = auto.cards;
      }
    } else if (loadParam) {
      const decks = getSavedDecks();
      const saved = decks.find((d) => d.id === loadParam);
      if (saved) {
        restored = saved.cards;
      }
    } else {
      // Check for autosave matching this hero+aspect
      const auto = getAutosave();
      if (auto && auto.heroCode === heroCode && auto.aspect === initialAspect && auto.cards.length > 0) {
        restored = auto.cards;
      }
    }

    if (restored && restored.length > 0) {
      setSelectedCards(restored);
      setRestoreBanner(`Restored ${restored.length} cards`);
      setTimeout(() => setRestoreBanner(null), 3000);
    }
  }, [deckData, searchParams, heroCode, initialAspect]);

  // Autosave whenever selectedCards changes
  useEffect(() => {
    if (!deckData) return;
    if (selectedCards.length === 0) return;
    setAutosave({ heroCode, heroName, aspect: initialAspect, cards: selectedCards });
  }, [selectedCards, deckData, heroCode, heroName, initialAspect]);

  const handleSaveDeck = useCallback(
    (name: string) => {
      const deck: SavedDeck = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        name,
        heroCode,
        heroName,
        aspect: initialAspect,
        cards: selectedCards,
        savedAt: new Date().toISOString(),
      };
      saveDeck(deck);
      clearAutosave();
    },
    [heroCode, heroName, initialAspect, selectedCards]
  );

  const cardIndex = deckData?.card_index ?? {};
  const heroData = deckData?.heroes[heroCode];

  // Identify hero signature cards (faction_name="Hero", matching card_set_name)
  const signatureCards = useMemo(() => {
    if (!deckData) return [];
    const heroCard = cardIndex[heroCode];
    const setName = heroCard?.card_set_name ?? heroName;
    return Object.entries(cardIndex)
      .filter(
        ([, c]) =>
          c.faction_name === "Hero" &&
          c.card_set_name === setName &&
          c.type_name !== "Hero" &&
          c.type_name !== "Alter-Ego"
      )
      .map(([code]) => code)
      .sort();
  }, [deckData, cardIndex, heroCode, heroName]);

  // Total signature card copies (sum of deck_limits, e.g. x3 for Swinging Web Kick)
  const signatureCardCount = useMemo(() => {
    return signatureCards.reduce((sum, code) => {
      return sum + (cardIndex[code]?.deck_limit ?? 1);
    }, 0);
  }, [signatureCards, cardIndex]);

  // Determine effective aspect: if user chose "all", lock when they add an aspect card
  const lockedAspect = useMemo(() => {
    if (initialAspect !== "all") return initialAspect;
    for (const code of selectedCards) {
      const card = cardIndex[code];
      if (!card) continue;
      for (const [aspect, faction] of Object.entries(ASPECT_FACTIONS)) {
        if (card.faction_name === faction) return aspect;
      }
    }
    return null;
  }, [initialAspect, selectedCards, cardIndex]);

  const effectiveAspect = lockedAspect ?? "all";

  // Build exclusion list (other aspects' cards + signature cards)
  const excludeCards = useMemo(() => {
    if (effectiveAspect === "all") return signatureCards;
    const otherFactions = ASPECTS.filter((a) => a !== effectiveAspect).map(
      (a) => ASPECT_FACTIONS[a]
    );
    const otherAspectCodes = Object.entries(cardIndex)
      .filter(([, c]) => otherFactions.includes(c.faction_name))
      .map(([code]) => code);
    return [...otherAspectCodes, ...signatureCards];
  }, [effectiveAspect, cardIndex, signatureCards]);

  // Get recommendations
  const recommendations = useMemo(() => {
    if (!deckData || !heroData) return [];
    if (!heroData.aspects[effectiveAspect]) return [];
    return getRecommendations({
      heroCode,
      aspect: effectiveAspect,
      selectedCards,
      excludeCards,
      topN: 20,
    });
  }, [deckData, heroData, heroCode, effectiveAspect, selectedCards, excludeCards]);

  const deckCount = useMemo(() => {
    return heroData?.aspects[effectiveAspect]?.deck_count ?? heroData?.total_decks ?? 0;
  }, [heroData, effectiveAspect]);

  const addCard = useCallback(
    (code: string) => {
      setSelectedCards((prev) => {
        const currentCopies = prev.filter((c) => c === code).length;
        const limit = cardIndex[code]?.deck_limit ?? 3;
        if (currentCopies >= limit) return prev;
        return [...prev, code];
      });
    },
    [cardIndex]
  );

  const removeCard = useCallback((code: string) => {
    setSelectedCards((prev) => {
      const idx = prev.indexOf(code);
      if (idx === -1) return prev;
      return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-gray-400">Loading deck data...</div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col">
      {/* Sticky header — back button + aspect badge (always on top) */}
      <div className="sticky top-0 z-30 border-b border-gray-800 bg-gray-950">
        <div className="flex min-h-[44px] items-center gap-2 px-4 py-3">
          <Link
            href={`/build/${heroCode}`}
            className="flex min-h-[44px] items-center gap-1 text-sm text-gray-400 transition hover:text-white"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Back
          </Link>
          {initialAspect !== "all" && lockedAspect && (
            <AspectBadge aspect={lockedAspect} />
          )}
          {initialAspect === "all" && lockedAspect && (
            <AspectBadge aspect={lockedAspect} suffix="(auto)" />
          )}
          {initialAspect === "all" && !lockedAspect && (
            <span className="ml-auto text-xs text-gray-500">No aspect selected</span>
          )}
        </div>

        {restoreBanner && (
          <div className="flex items-center justify-between border-t border-green-800/50 bg-green-900/30 px-4 py-2 text-xs text-green-400">
            <span>{restoreBanner}</span>
            <button onClick={() => setRestoreBanner(null)} className="ml-2 p-2 text-green-500 hover:text-green-300">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Content area — reversed on mobile so suggestions appear first */}
      <div className="flex flex-col-reverse lg:flex-row">
        {/* Left panel: Your Deck */}
        <div className="w-full shrink-0 bg-gray-950 lg:w-[380px] lg:border-r lg:border-gray-800">
          <div className="lg:sticky lg:top-0">
            <DeckPanel
              heroCode={heroCode}
              heroName={heroName}
              alterEgo={alterEgo}
              heroImagesrc={heroImagesrc}
              aspect={effectiveAspect}
              signatureCards={signatureCards}
              signatureCardCount={signatureCardCount}
              selectedCards={selectedCards}
              cardIndex={cardIndex}
              onRemoveCard={removeCard}
              onSave={handleSaveDeck}
            />
          </div>
        </div>

        {/* Right panel: Suggestions */}
        <div className="min-w-0 flex-1 bg-gray-900 pb-16 lg:pb-0">
          <SuggestionsPanel
            recommendations={recommendations}
            cardIndex={cardIndex}
            deckCount={deckCount}
            selectedCards={selectedCards}
            excludeCards={new Set(excludeCards)}
            signatureCards={new Set(signatureCards)}
            onAddCard={addCard}
          />
        </div>
      </div>
    </main>
  );
}

function AspectBadge({ aspect, suffix }: { aspect: string; suffix?: string }) {
  const colors: Record<string, string> = {
    leadership: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    justice: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    aggression: "bg-red-500/20 text-red-400 border-red-500/30",
    protection: "bg-green-500/20 text-green-400 border-green-500/30",
  };
  const labels: Record<string, string> = {
    leadership: "Leadership",
    justice: "Justice",
    aggression: "Aggression",
    protection: "Protection",
  };
  return (
    <span
      className={`ml-auto rounded-full border px-2.5 py-0.5 text-xs font-medium ${colors[aspect] ?? "bg-gray-700 text-gray-300 border-gray-600"}`}
    >
      {labels[aspect] ?? aspect} {suffix}
    </span>
  );
}
