"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  getSavedDecks,
  getAutosave,
  deleteDeck,
  clearAutosave,
  type SavedDeck,
} from "@/lib/deck-storage";

const ASPECT_COLORS: Record<string, string> = {
  aggression: "bg-red-500/20 text-red-400 border-red-500/30",
  justice: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  leadership: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  protection: "bg-green-500/20 text-green-400 border-green-500/30",
  all: "bg-purple-500/20 text-purple-400 border-purple-500/30",
};

const ASPECT_LABELS: Record<string, string> = {
  aggression: "Aggression",
  justice: "Justice",
  leadership: "Leadership",
  protection: "Protection",
  all: "Multi-Aspect",
};

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function SavedDecks() {
  const [decks, setDecks] = useState<SavedDeck[]>([]);
  const [autosave, setAutosaveState] = useState<SavedDeck | null>(null);

  useEffect(() => {
    setDecks(getSavedDecks());
    setAutosaveState(getAutosave());
  }, []);

  const handleDelete = (id: string) => {
    deleteDeck(id);
    setDecks(getSavedDecks());
  };

  const handleDismissAutosave = () => {
    clearAutosave();
    setAutosaveState(null);
  };

  if (decks.length === 0 && !autosave) return null;

  return (
    <div className="mb-8">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-gray-500">
        Saved Decks
      </h2>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {/* Autosave entry */}
        {autosave && autosave.cards.length > 0 && (
          <div className="group relative rounded-lg border border-dashed border-yellow-700/50 bg-gray-900/50 p-3 transition hover:border-yellow-600/70 hover:bg-gray-900">
            <Link
              href={`/build/${autosave.heroCode}/${autosave.aspect}?load=autosave`}
              className="block"
            >
              <p className="text-xs font-medium text-yellow-500">
                Unsaved deck in progress
              </p>
              <p className="mt-0.5 text-sm font-semibold text-white">
                {autosave.heroName}
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                    ASPECT_COLORS[autosave.aspect] ?? ASPECT_COLORS.all
                  }`}
                >
                  {ASPECT_LABELS[autosave.aspect] ?? autosave.aspect}
                </span>
                <span className="text-xs text-gray-500">
                  {autosave.cards.length} cards
                </span>
                <span className="text-xs text-gray-600">
                  {relativeDate(autosave.savedAt)}
                </span>
              </div>
            </Link>
            <button
              onClick={handleDismissAutosave}
              className="absolute top-2 right-2 rounded p-2 text-gray-600 opacity-100 transition hover:bg-gray-800 hover:text-gray-400 lg:opacity-0 lg:group-hover:opacity-100"
              title="Dismiss"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        )}

        {/* Saved decks */}
        {decks.map((deck) => (
          <div
            key={deck.id}
            className="group relative rounded-lg border border-gray-800 bg-gray-900/50 p-3 transition hover:border-gray-700 hover:bg-gray-900"
          >
            <Link
              href={`/build/${deck.heroCode}/${deck.aspect}?load=${deck.id}`}
              className="block"
            >
              <p className="truncate text-sm font-semibold text-white">
                {deck.name}
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                    ASPECT_COLORS[deck.aspect] ?? ASPECT_COLORS.all
                  }`}
                >
                  {ASPECT_LABELS[deck.aspect] ?? deck.aspect}
                </span>
                <span className="text-xs text-gray-500">
                  {deck.cards.length} cards
                </span>
                <span className="text-xs text-gray-600">
                  {relativeDate(deck.savedAt)}
                </span>
              </div>
            </Link>
            <button
              onClick={() => handleDelete(deck.id)}
              className="absolute top-2 right-2 rounded p-2 text-gray-600 opacity-100 transition hover:bg-gray-800 hover:text-red-400 lg:opacity-0 lg:group-hover:opacity-100"
              title="Delete deck"
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
                  d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
