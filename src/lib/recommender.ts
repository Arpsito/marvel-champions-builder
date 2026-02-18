/**
 * Deck recommendation engine for Marvel Champions.
 *
 * Uses pre-computed, recency-weighted co-occurrence data to suggest cards
 * that pair well with a given hero, aspect, and current card selection.
 *
 * All underlying data (base frequencies and co-occurrence rates) is already
 * recency-weighted from the data pipeline — recent decks have exponentially
 * more influence than older ones. The percentages therefore reflect modern
 * community deck-building patterns, not raw historical counts.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** A single card entry from the card index. */
export interface CardInfo {
  name: string;
  type_name: string;
  faction_name: string;
  cost: number | null;
  pack_name: string;
  imagesrc: string;
  card_set_name: string | null;
  /** Maximum copies allowed in a deck. 1 for uniques, typically 3 otherwise. */
  deck_limit: number | null;
}

/** Frequency and co-occurrence data for one hero+aspect bucket. */
export interface AspectData {
  deck_count: number;
  weighted_deck_count: number;
  /** Card code -> frequency as a percentage (0–100). */
  card_frequency: Record<string, number>;
  /**
   * Nested co-occurrence map. card_pairs[A][B] = percentage of decks
   * containing both A and B. Only stored in one direction (A < B lexically).
   */
  card_pairs: Record<string, Record<string, number>>;
  /**
   * Copy rate data. copy_rates[cardCode] = [P(2+|1+), P(3|2+)] as percentages (0–100).
   * P(2+|1+): of decks that include this card, what % run 2+ copies.
   * P(3|2+): of decks with 2+ copies, what % run 3.
   */
  copy_rates?: Record<string, [number, number]>;
}

/** Per-hero data as stored in deck_data.json. */
export interface HeroData {
  hero_name: string;
  alter_ego: string | null;
  total_decks: number;
  total_weighted_decks: number;
  most_recent_deck_date: string;
  aspects: Record<string, AspectData>;
}

/** The top-level shape of data/web/deck_data.json. */
export interface DeckData {
  card_index: Record<string, CardInfo>;
  heroes: Record<string, HeroData>;
}

/** Input parameters for getRecommendations. */
export interface RecommendationRequest {
  heroCode: string;
  aspect: string;
  /** Card codes already selected for the deck (may contain duplicates for multiple copies). */
  selectedCards: string[];
  /** Card codes to exclude from suggestions (e.g., off-aspect cards). */
  excludeCards?: string[];
  /** Number of recommendations to return. Default: 10. */
  topN?: number;
}

/** A single recommendation returned by the engine. */
export interface Recommendation {
  cardCode: string;
  cardName: string;
  /**
   * Relative recommendation strength, 0–100.
   * Normalized so the top candidate is always ~100 and others scale
   * proportionally. This shows how strong each pick is relative to
   * the other available options, not the absolute co-occurrence rate.
   */
  score: number;
  /**
   * The raw scoring percentage before normalization.
   * With no selected cards this equals baseFrequency.
   * With selected cards this reflects the co-occurrence signal.
   */
  rawScore: number;
  /** How often this card appears with this hero+aspect (percentage, recency-weighted). */
  baseFrequency: number;
  /** Human-readable explanation of why this card is recommended. */
  reason: string;
  /**
   * Which copy this recommendation is for (1 = first copy, 2 = second, etc.).
   * Helps the UI show "2nd copy" or "3rd copy" labels.
   */
  copyNumber: number;
}

// ── Data loading ──────────────────────────────────────────────────────────────

let _data: DeckData | null = null;

/**
 * Initialize the engine with pre-loaded data.
 * Call this once at app startup with the parsed contents of deck_data.json.
 */
export function loadData(data: DeckData): void {
  _data = data;
}

function getData(): DeckData {
  if (!_data) {
    throw new Error(
      "Recommendation engine not initialized. Call loadData() with the parsed deck_data.json first."
    );
  }
  return _data;
}

// ── Co-occurrence lookup ──────────────────────────────────────────────────────

/**
 * Look up the co-occurrence rate between two cards. Since pairs are stored
 * in one direction only (A < B lexically), we check both orderings.
 * Returns the percentage (0–100) or undefined if no data exists.
 */
function getCooccurrence(
  pairs: Record<string, Record<string, number>>,
  cardA: string,
  cardB: string
): number | undefined {
  const [lo, hi] = cardA < cardB ? [cardA, cardB] : [cardB, cardA];
  return pairs[lo]?.[hi];
}

// ── Scoring ───────────────────────────────────────────────────────────────────

/**
 * Weight applied to base frequency when co-occurrence data coverage is low.
 * When fewer than half of the selected cards have co-occurrence data for a
 * candidate, we blend toward base frequency using this weight.
 */
const BASE_FREQ_BLEND_WEIGHT = 0.7;

/**
 * Score a candidate card given the current deck selection.
 *
 * Scoring strategy:
 * - With no selected cards: score = base frequency.
 * - With selected cards: average the co-occurrence rates between the candidate
 *   and each selected card that has data. If coverage is below 50% of selected
 *   cards, blend the co-occurrence average with base frequency (weighted toward
 *   base frequency) to avoid over-relying on sparse pair data.
 *
 * Missing pair handling:
 * When no co-occurrence entry exists for a pair, there are two cases:
 * 1. The selected card IS in the frequency table — both cards are in the
 *    candidate pool, so the pair was pruned during data packaging for having
 *    very low co-occurrence. We treat this as 0 (anti-synergy signal).
 * 2. The selected card is NOT in the frequency table — it was added via
 *    extended search and genuinely has no data. We skip it entirely.
 */
function scoreCandidate(
  cardCode: string,
  baseFreq: number,
  selectedCards: string[],
  pairs: Record<string, Record<string, number>>,
  freq: Record<string, number>
): number {
  // Deduplicate selected cards for co-occurrence lookup (multiple copies of
  // the same card shouldn't multiply the co-occurrence signal)
  const uniqueSelected = [...new Set(selectedCards)];

  if (uniqueSelected.length === 0) {
    return baseFreq;
  }

  // Gather co-occurrence rates with each unique selected card
  let coocSum = 0;
  let coocCount = 0;

  for (const selected of uniqueSelected) {
    if (selected === cardCode) continue; // skip self (for additional copies)
    const rate = getCooccurrence(pairs, cardCode, selected);
    if (rate !== undefined) {
      coocSum += rate;
      coocCount += 1;
    } else if (freq[selected] !== undefined) {
      // Both cards are in the pool but no pair data — the pair was pruned
      // for having very low co-occurrence. Treat as ~0 rather than ignoring
      // it, which would otherwise inflate anti-synergy cards to base freq.
      coocSum += 0;
      coocCount += 1;
    }
    // else: selected card not in pool (found via search), genuinely no data
  }

  const otherCardCount = uniqueSelected.filter((c) => c !== cardCode).length;

  // No co-occurrence data at all — fall back to base frequency
  if (coocCount === 0) {
    return baseFreq;
  }

  const coocAvg = coocSum / coocCount;
  const coverage = otherCardCount > 0 ? coocCount / otherCardCount : 0;

  // Good coverage (>= 50%): trust the co-occurrence signal
  if (coverage >= 0.5) {
    return coocAvg;
  }

  // Low coverage: blend co-occurrence with base frequency,
  // weighting toward base frequency since we have limited pair data
  return BASE_FREQ_BLEND_WEIGHT * baseFreq + (1 - BASE_FREQ_BLEND_WEIGHT) * coocAvg;
}

// ── Reason generation ─────────────────────────────────────────────────────────

function formatReason(
  baseFreq: number,
  selectedCards: string[],
  coocCount: number,
  copyNumber: number,
  copyRate: number | null
): string {
  const pct = Math.round(baseFreq);

  // Copy 2+ with copy rate data: explain the community multi-copy behavior
  if (copyNumber > 1 && copyRate !== null) {
    const ratePct = Math.round(copyRate);
    return `${ordinal(copyNumber)} copy — ${ratePct}% of decks with this card run ${copyNumber}+`;
  }

  const copyLabel = copyNumber > 1 ? `${ordinal(copyNumber)} copy — ` : "";

  if (selectedCards.length === 0) {
    return `${copyLabel}Appears in ${pct}% of recent community decks`;
  }

  if (coocCount === 0) {
    return `${copyLabel}Appears in ${pct}% of recent community decks`;
  }

  if (coocCount === 1) {
    return `${copyLabel}Pairs with 1 of your cards; in ${pct}% of similar decks`;
  }

  return `${copyLabel}Pairs with ${coocCount} of your cards; in ${pct}% of similar decks`;
}

function ordinal(n: number): string {
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Get card recommendations for a given hero, aspect, and current selection.
 *
 * Supports recommending additional copies of cards already in the deck.
 * A card with deck_limit=3 that already has 1 copy can be recommended
 * for a 2nd or 3rd copy. Cards at their deck_limit are excluded.
 */
export function getRecommendations(request: RecommendationRequest): Recommendation[] {
  const {
    heroCode,
    aspect,
    selectedCards,
    excludeCards = [],
    topN = 10,
  } = request;

  const data = getData();

  const hero = data.heroes[heroCode];
  if (!hero) {
    throw new Error(`Unknown hero code: ${heroCode}`);
  }

  const aspectData = hero.aspects[aspect];
  if (!aspectData) {
    throw new Error(
      `No data for aspect "${aspect}" on hero "${hero.hero_name}". ` +
      `Available: ${Object.keys(hero.aspects).join(", ")}`
    );
  }

  const { card_frequency: freq, card_pairs: pairs, copy_rates: copyRates } = aspectData;
  const cardIndex = data.card_index;

  // Count current copies of each card in the deck
  const copyCounts = new Map<string, number>();
  for (const code of selectedCards) {
    copyCounts.set(code, (copyCounts.get(code) ?? 0) + 1);
  }

  // Hard exclusions: off-aspect cards, etc.
  const hardExcludeSet = new Set(excludeCards);

  // Score every candidate card, including additional copies
  const candidates: Array<{
    cardCode: string;
    score: number;
    baseFreq: number;
    coocCount: number;
    copyNumber: number;
  }> = [];

  for (const [cardCode, baseFreq] of Object.entries(freq)) {
    if (hardExcludeSet.has(cardCode)) continue;

    const card = cardIndex[cardCode];
    const deckLimit = card?.deck_limit ?? 3;
    const currentCopies = copyCounts.get(cardCode) ?? 0;

    // Skip if already at deck limit
    if (currentCopies >= deckLimit) continue;

    const copyNumber = currentCopies + 1;

    // Count co-occurrence hits for reason generation (deduplicated).
    // Only count selected cards that have actual positive co-occurrence —
    // cards with pruned (zero) pairs don't count as "pairs with your cards".
    const uniqueSelected = [...new Set(selectedCards)];
    let coocCount = 0;
    for (const selected of uniqueSelected) {
      if (selected === cardCode) continue;
      if (getCooccurrence(pairs, cardCode, selected) !== undefined) {
        coocCount++;
      }
    }

    let score: number;

    if (copyNumber === 1) {
      // First copy: normal co-occurrence scoring
      score = scoreCandidate(cardCode, baseFreq, selectedCards, pairs, freq);
    } else {
      // Copies 2+: use community copy rate as the score.
      // This answers "given I have N-1 copies, should I add another?"
      // directly from how the community builds decks.
      const rates = copyRates?.[cardCode];
      if (rates) {
        // rates = [P(2+|1+), P(3|2+)] as percentages
        // Copy scores never decrease with commitment — if you added copy 2,
        // copy 3 should be at least as strongly recommended.
        score = copyNumber === 2 ? rates[0] : Math.max(rates[0], rates[1]);
      } else {
        // No copy rate data — fall back to base frequency
        score = baseFreq;
      }
    }

    candidates.push({ cardCode, score, baseFreq, coocCount, copyNumber });
  }

  // Sort by score descending, take top N
  candidates.sort((a, b) => b.score - a.score);
  const topCandidates = candidates.slice(0, topN);

  // Normalize scores: top candidate maps to 100, rest scale proportionally.
  const maxScore = topCandidates.length > 0 ? topCandidates[0].score : 1;
  const scaleFactor = maxScore > 0 ? 100 / maxScore : 1;

  return topCandidates.map(({ cardCode, score, baseFreq, coocCount, copyNumber }) => {
    // For copy 2+, pass the copy rate so formatReason can explain it
    let copyRate: number | null = null;
    if (copyNumber > 1) {
      const rates = copyRates?.[cardCode];
      if (rates) {
        copyRate = copyNumber === 2 ? rates[0] : Math.max(rates[0], rates[1]);
      }
    }

    return {
      cardCode,
      cardName: cardIndex[cardCode]?.name ?? cardCode,
      score: Math.round(score * scaleFactor),
      rawScore: Math.round(score),
      baseFrequency: baseFreq,
      reason: formatReason(baseFreq, selectedCards, coocCount, copyNumber, copyRate),
      copyNumber,
    };
  });
}
