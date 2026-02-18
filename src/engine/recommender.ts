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
  /** Card codes already selected for the deck. */
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
 */
function scoreCandidate(
  cardCode: string,
  baseFreq: number,
  selectedCards: string[],
  pairs: Record<string, Record<string, number>>
): number {
  if (selectedCards.length === 0) {
    return baseFreq;
  }

  // Gather co-occurrence rates with each selected card
  let coocSum = 0;
  let coocCount = 0;

  for (const selected of selectedCards) {
    const rate = getCooccurrence(pairs, cardCode, selected);
    if (rate !== undefined) {
      coocSum += rate;
      coocCount += 1;
    }
  }

  // No co-occurrence data at all — fall back to base frequency
  if (coocCount === 0) {
    return baseFreq;
  }

  const coocAvg = coocSum / coocCount;
  const coverage = coocCount / selectedCards.length;

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
  coocCount: number
): string {
  const pct = Math.round(baseFreq);

  if (selectedCards.length === 0) {
    return `Appears in ${pct}% of recent community decks`;
  }

  if (coocCount === 0) {
    return `Appears in ${pct}% of recent community decks (no pair data with selected cards)`;
  }

  if (coocCount === 1) {
    return `Frequently paired with 1 of your selected cards; appears in ${pct}% of recent community decks`;
  }

  return `Frequently paired with ${coocCount} of your selected cards; appears in ${pct}% of recent community decks`;
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Get card recommendations for a given hero, aspect, and current selection.
 *
 * All percentages in the returned data reflect recency-weighted community
 * patterns — recent decks have exponentially more influence than older ones.
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

  const { card_frequency: freq, card_pairs: pairs } = aspectData;

  // Build exclusion set: already selected + explicitly excluded
  const excludeSet = new Set([...selectedCards, ...excludeCards]);

  // Score every candidate card
  const candidates: Array<{
    cardCode: string;
    score: number;
    baseFreq: number;
    coocCount: number;
  }> = [];

  for (const [cardCode, baseFreq] of Object.entries(freq)) {
    if (excludeSet.has(cardCode)) continue;

    // Count co-occurrence hits for reason generation
    let coocCount = 0;
    for (const selected of selectedCards) {
      if (getCooccurrence(pairs, cardCode, selected) !== undefined) {
        coocCount++;
      }
    }

    const score = scoreCandidate(cardCode, baseFreq, selectedCards, pairs);
    candidates.push({ cardCode, score, baseFreq, coocCount });
  }

  // Sort by score descending, take top N
  candidates.sort((a, b) => b.score - a.score);
  const topCandidates = candidates.slice(0, topN);

  // Normalize scores: top candidate maps to 100, rest scale proportionally.
  // This ensures even a card at 20% raw shows as a strong pick if it's the
  // best remaining option.
  const maxScore = topCandidates.length > 0 ? topCandidates[0].score : 1;
  const scaleFactor = maxScore > 0 ? 100 / maxScore : 1;

  // Resolve card names and build output
  const cardIndex = data.card_index;

  return topCandidates.map(({ cardCode, score, baseFreq, coocCount }) => ({
    cardCode,
    cardName: cardIndex[cardCode]?.name ?? cardCode,
    score: Math.round(score * scaleFactor),
    rawScore: Math.round(score),
    baseFrequency: baseFreq,
    reason: formatReason(baseFreq, selectedCards, coocCount),
  }));
}
