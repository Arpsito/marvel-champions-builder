"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import type { CardInfo } from "@/lib/recommender";

const MARVELCDB_BASE = "https://marvelcdb.com";
const PLACEHOLDER_IMG = "/placeholder-card.svg";
const MAX_DECK_SIZE = 50;

function cardImageSrc(imagesrc: string | null | undefined): string {
  return imagesrc ? `${MARVELCDB_BASE}${imagesrc}` : PLACEHOLDER_IMG;
}

const ASPECT_LABELS: Record<string, string> = {
  aggression: "Aggression",
  justice: "Justice",
  leadership: "Leadership",
  protection: "Protection",
  all: "Multi-Aspect",
};

interface DeckPanelProps {
  heroCode: string;
  heroName: string;
  alterEgo: string | null;
  heroImagesrc: string;
  aspect: string;
  signatureCards: string[];
  /** Total copies of hero signature cards (sum of deck_limits). */
  signatureCardCount: number;
  selectedCards: string[];
  cardIndex: Record<string, CardInfo>;
  onRemoveCard: (code: string) => void;
  onSave?: (name: string) => void;
}

export default function DeckPanel({
  heroCode,
  heroName,
  alterEgo,
  heroImagesrc,
  aspect,
  signatureCards,
  signatureCardCount,
  selectedCards,
  cardIndex,
  onRemoveCard,
  onSave,
}: DeckPanelProps) {
  const [expandedOnMobile, setExpandedOnMobile] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saved, setSaved] = useState(false);
  const totalCards = signatureCardCount + selectedCards.length;

  const defaultName = `${heroName} - ${ASPECT_LABELS[aspect] ?? aspect}`;

  const handleSave = () => {
    if (!onSave) return;
    onSave(saveName.trim() || defaultName);
    setSaved(true);
    setShowSaveInput(false);
    setSaveName("");
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <>
      {/* Mobile: fixed bottom bar / Desktop: inline panel */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-800 bg-gray-950 lg:relative lg:inset-auto lg:z-auto lg:border-t-0">
        {/* Drag handle — mobile expanded only */}
        {expandedOnMobile && (
          <div className="flex justify-center py-2 lg:hidden">
            <div className="h-1 w-10 rounded-full bg-gray-600" />
          </div>
        )}

        {/* Header bar — tap to expand/collapse on mobile, static on desktop */}
        <button
          onClick={() => setExpandedOnMobile(!expandedOnMobile)}
          className="flex w-full items-center gap-3 px-4 py-2 lg:pointer-events-none lg:py-3"
        >
          <div className="relative h-10 w-8 shrink-0 overflow-hidden rounded border border-gray-700 lg:h-16 lg:w-12">
            <Image
              src={`${MARVELCDB_BASE}${heroImagesrc}`}
              alt={heroName}
              fill
              sizes="48px"
              className="object-cover object-top"
            />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <h2 className="truncate text-sm font-bold text-white lg:text-lg">{heroName}</h2>
            {alterEgo && alterEgo !== heroName && (
              <p className="hidden truncate text-xs text-gray-500 lg:block">{alterEgo}</p>
            )}
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-white lg:text-2xl">
              {totalCards}
              <span className="text-xs font-normal text-gray-500 lg:text-sm"> / {MAX_DECK_SIZE}</span>
            </div>
            <p className="hidden text-xs text-gray-500 lg:block">cards</p>
          </div>
          {/* Expand/collapse chevron — mobile only */}
          <svg
            className={`h-5 w-5 shrink-0 text-gray-400 transition lg:hidden ${expandedOnMobile ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
          </svg>
        </button>

        {/* Expandable content — collapsed by default on mobile, always visible on desktop */}
        <div
          className={`overflow-hidden transition-all duration-300 lg:overflow-y-auto lg:max-h-[calc(100vh-160px)] ${
            expandedOnMobile ? "max-h-[70vh] overflow-y-auto" : "max-h-0"
          }`}
        >
          {/* Save / Export buttons — shown when user has added cards */}
          {selectedCards.length >= 3 && (
            <div className="border-t border-gray-800 px-4 py-2">
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowSaveInput(!showSaveInput); setSaved(false); }}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2.5 text-xs font-medium transition sm:py-1.5 ${
                    saved
                      ? "border-green-600 bg-green-900/40 text-green-400"
                      : "border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-500 hover:bg-gray-700 hover:text-white"
                  }`}
                >
                  {saved ? (
                    <>
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      Saved!
                    </>
                  ) : (
                    <>
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
                      </svg>
                      Save Deck
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowExport(true)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-gray-700 bg-gray-800 px-3 py-2.5 text-xs font-medium text-gray-300 transition hover:border-gray-500 hover:bg-gray-700 hover:text-white sm:py-1.5"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  Export Deck
                </button>
              </div>

              {/* Inline save name input */}
              {showSaveInput && (
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
                    placeholder={defaultName}
                    className="min-w-0 flex-1 rounded-md border border-gray-700 bg-gray-800 px-2.5 py-2.5 text-xs text-white placeholder-gray-500 outline-none focus:border-gray-500 sm:py-1.5"
                    autoFocus
                  />
                  <button
                    onClick={handleSave}
                    className="rounded-md bg-white px-3 py-2.5 text-xs font-medium text-gray-900 transition hover:bg-gray-200 sm:py-1.5"
                  >
                    Save
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Hero signature cards */}
          {signatureCards.length > 0 && (
            <div className="px-3 pt-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-600">
                Hero Cards
              </p>
              <div className="grid grid-cols-5 gap-1.5 lg:grid-cols-3">
                {signatureCards.map((code) => {
                  const card = cardIndex[code];
                  const qty = card?.deck_limit ?? 1;
                  return (
                    <div key={code} className="group relative">
                      <div className="relative aspect-[5/7] overflow-hidden rounded border border-gray-800 opacity-75">
                        <Image
                          src={cardImageSrc(card?.imagesrc)}
                          alt={card?.name ?? code}
                          fill
                          sizes="80px"
                          className="object-cover object-top"
                          loading="lazy"
                        />
                        {qty > 1 && (
                          <div className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-gray-900/80 text-[10px] font-bold text-gray-300">
                            x{qty}
                          </div>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-center text-[10px] text-gray-600">
                        {card?.name ?? code}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Selected cards */}
          <div className="px-3 py-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-600">
              Selected Cards
              {selectedCards.length > 0 && (
                <span className="ml-1 text-gray-500">({selectedCards.length})</span>
              )}
            </p>

            {selectedCards.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-600">
                Add cards from the suggestions panel
              </p>
            ) : (
              <div className="grid grid-cols-5 gap-1.5 lg:grid-cols-3">
                {selectedCards.map((code, idx) => {
                  const card = cardIndex[code];
                  return (
                    <button
                      key={`${code}-${idx}`}
                      onClick={() => onRemoveCard(code)}
                      className="group relative text-left"
                      title={`Remove ${card?.name ?? code}`}
                    >
                      <div className="relative aspect-[5/7] overflow-hidden rounded border border-gray-700 transition group-hover:border-red-500">
                        <Image
                          src={cardImageSrc(card?.imagesrc)}
                          alt={card?.name ?? code}
                          fill
                          sizes="80px"
                          className="object-cover object-top"
                          loading="lazy"
                        />
                        {/* Remove overlay */}
                        <div className="absolute inset-0 flex items-center justify-center bg-red-900/0 transition group-hover:bg-red-900/60">
                          <svg
                            className="h-6 w-6 text-white opacity-30 transition group-hover:opacity-100 lg:opacity-0"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={2.5}
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </div>
                      </div>
                      <p className="mt-0.5 truncate text-center text-[10px] text-gray-400">
                        {card?.name ?? code}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Export modal — portaled to body to escape overflow/stacking context */}
      {showExport &&
        createPortal(
          <ExportModal
            heroName={heroName}
            aspect={aspect}
            heroCode={heroCode}
            signatureCards={signatureCards}
            selectedCards={selectedCards}
            cardIndex={cardIndex}
            onClose={() => setShowExport(false)}
          />,
          document.body
        )}
    </>
  );
}

// ── Export Modal ──────────────────────────────────────────────────────────────

function ExportModal({
  heroName,
  aspect,
  heroCode,
  signatureCards,
  selectedCards,
  cardIndex,
  onClose,
}: {
  heroName: string;
  aspect: string;
  heroCode: string;
  signatureCards: string[];
  selectedCards: string[];
  cardIndex: Record<string, CardInfo>;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  // Group selected cards by code and count copies
  const selectedCounts = new Map<string, number>();
  for (const code of selectedCards) {
    selectedCounts.set(code, (selectedCounts.get(code) ?? 0) + 1);
  }

  // Group hero signature cards with their deck_limit quantities
  const signatureCounts = new Map<string, number>();
  for (const code of signatureCards) {
    signatureCounts.set(code, cardIndex[code]?.deck_limit ?? 1);
  }

  // Build MarvelCDB text format grouped by card type
  const aspectLabel = ASPECT_LABELS[aspect] ?? aspect;
  const header = `# ${heroName} — ${aspectLabel}`;

  // Group cards by type
  const typeGroups = new Map<string, Array<{ code: string; name: string; qty: number }>>();

  const addToGroup = (code: string, qty: number) => {
    const card = cardIndex[code];
    const typeName = card?.type_name ?? "Unknown";
    const name = card?.name ?? code;
    if (!typeGroups.has(typeName)) typeGroups.set(typeName, []);
    typeGroups.get(typeName)!.push({ code, name, qty });
  };

  for (const [code, qty] of signatureCounts) {
    addToGroup(code, qty);
  }
  for (const [code, qty] of selectedCounts) {
    addToGroup(code, qty);
  }

  // Sort types in a logical order
  const typeOrder = ["Ally", "Event", "Support", "Upgrade", "Resource"];
  const sortedTypes = [...typeGroups.keys()].sort((a, b) => {
    const ai = typeOrder.indexOf(a);
    const bi = typeOrder.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  let deckText = header + "\n\n";
  for (const typeName of sortedTypes) {
    const cards = typeGroups.get(typeName)!;
    cards.sort((a, b) => a.name.localeCompare(b.name));
    deckText += `## ${typeName} (${cards.reduce((s, c) => s + c.qty, 0)})\n`;
    for (const { code, name, qty } of cards) {
      deckText += `${qty}x ${name} (${code})\n`;
    }
    deckText += "\n";
  }

  deckText = deckText.trimEnd() + "\n";

  // MarvelCDB import URL: slots format is card_code:qty pairs
  const slots: Record<string, number> = {};
  // Include hero identity card
  slots[heroCode] = 1;
  for (const [code, qty] of signatureCounts) {
    slots[code] = qty;
  }
  for (const [code, qty] of selectedCounts) {
    slots[code] = qty;
  }
  const slotsParam = Object.entries(slots)
    .map(([code, qty]) => `${code}:${qty}`)
    .join(";");
  const marvelcdbUrl = `${MARVELCDB_BASE}/deck/new?slots=${encodeURIComponent(slotsParam)}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(deckText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = deckText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="mx-4 flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border border-gray-700 bg-gray-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
          <h3 className="text-lg font-bold text-white">Export Deck</h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 transition hover:bg-gray-800 hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Deck text */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <pre className="whitespace-pre-wrap rounded-lg border border-gray-800 bg-gray-950 p-4 font-mono text-xs leading-relaxed text-gray-300">
            {deckText}
          </pre>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 border-t border-gray-800 px-5 py-4 sm:flex-row">
          <button
            onClick={handleCopy}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition ${
              copied
                ? "bg-green-600 text-white"
                : "bg-white text-gray-900 hover:bg-gray-200"
            }`}
          >
            {copied ? (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                </svg>
                Copy to Clipboard
              </>
            )}
          </button>
          <a
            href={marvelcdbUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-600 px-4 py-2 text-sm font-medium text-gray-300 transition hover:border-gray-400 hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            Open in MarvelCDB
          </a>
        </div>
      </div>
    </div>
  );
}
