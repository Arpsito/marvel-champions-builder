/**
 * Interactive CLI prototype for Marvel Champions deck building.
 *
 * Run: npx tsx src/prototype/cli.ts
 */

import { readFileSync } from "fs";
import { createInterface } from "readline";
import {
  loadData,
  getRecommendations,
  type DeckData,
  type CardInfo,
  type Recommendation,
} from "../lib/recommender.js";

// ── Data loading ──────────────────────────────────────────────────────────────

const raw = readFileSync("data/web/deck_data.json", "utf-8");
const deckData: DeckData = JSON.parse(raw);
loadData(deckData);

const heroesRaw = readFileSync("data/web/heroes.json", "utf-8");
const heroesList: Array<{
  code: string;
  name: string;
  alter_ego: string | null;
  traits: string;
  total_decks: number;
}> = JSON.parse(heroesRaw);

const cardIndex = deckData.card_index;

// ── Constants ─────────────────────────────────────────────────────────────────

const ASPECTS = ["aggression", "justice", "leadership", "protection"] as const;
const ASPECT_LABELS: Record<string, string> = {
  aggression: "Aggression",
  justice: "Justice",
  leadership: "Leadership",
  protection: "Protection",
  all: "No Aspect (all)",
};
const MAX_DECK_SIZE = 50;
const BAR_WIDTH = 10;

/**
 * Faction names for the four aspects. Used to build the exclude list:
 * when building a Leadership deck, we exclude Aggression/Justice/Protection
 * faction cards from recommendations.
 */
const ASPECT_FACTIONS: Record<string, string> = {
  aggression: "Aggression",
  justice: "Justice",
  leadership: "Leadership",
  protection: "Protection",
};

// ── Readline setup ────────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, output: process.stdout });

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

// ── Display helpers ───────────────────────────────────────────────────────────

function cls(): void {
  process.stdout.write("\x1b[2J\x1b[H");
}

function dim(s: string): string {
  return `\x1b[2m${s}\x1b[0m`;
}

function bold(s: string): string {
  return `\x1b[1m${s}\x1b[0m`;
}

function green(s: string): string {
  return `\x1b[32m${s}\x1b[0m`;
}

function yellow(s: string): string {
  return `\x1b[33m${s}\x1b[0m`;
}

function cyan(s: string): string {
  return `\x1b[36m${s}\x1b[0m`;
}

function scoreBar(score: number): string {
  const filled = Math.round((score / 100) * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  return green("█".repeat(filled)) + dim("░".repeat(empty));
}

function cardLabel(code: string): string {
  const card = cardIndex[code];
  if (!card) return code;
  const cost = card.cost !== null ? `${card.cost}` : "-";
  return `${card.name} ${dim(`[${card.type_name}, ${cost} cost]`)}`;
}

/**
 * Get the hero's signature card codes from the card index.
 * These are cards with faction_name="Hero" whose card_set_name matches the hero,
 * excluding the hero/alter-ego identity cards (type_name "Hero" or "Alter-Ego").
 */
function getSignatureCards(heroCode: string, heroName: string): string[] {
  // Try matching by card_set_name = heroName first
  let sigs = Object.entries(cardIndex).filter(
    ([, c]) =>
      c.faction_name === "Hero" &&
      c.card_set_name === heroName &&
      c.type_name !== "Hero" &&
      c.type_name !== "Alter-Ego"
  );

  // Fallback: match by code prefix (for SP//dr and similar edge cases)
  if (sigs.length === 0) {
    const prefix = heroCode.replace(/[a-z]$/, "");
    // Find the card_set_name from the hero's own card
    const heroCard = cardIndex[heroCode];
    const setName = heroCard?.card_set_name;
    if (setName) {
      sigs = Object.entries(cardIndex).filter(
        ([, c]) =>
          c.faction_name === "Hero" &&
          c.card_set_name === setName &&
          c.type_name !== "Hero" &&
          c.type_name !== "Alter-Ego"
      );
    }
  }

  return sigs.map(([code]) => code).sort();
}

/**
 * Build the list of card codes to exclude from recommendations:
 * cards from the other three aspects (not the selected one, not Basic/Hero).
 */
function buildExcludeList(aspect: string): string[] {
  if (aspect === "all") return [];

  const otherFactions = ASPECTS.filter((a) => a !== aspect).map(
    (a) => ASPECT_FACTIONS[a]
  );

  return Object.entries(cardIndex)
    .filter(([, c]) => otherFactions.includes(c.faction_name))
    .map(([code]) => code);
}

/**
 * Detect the aspect of a card from its faction_name.
 * Returns the lowercase aspect name, or null if Basic/Hero/Campaign/Pool.
 */
function detectCardAspect(code: string): string | null {
  const card = cardIndex[code];
  if (!card) return null;
  const faction = card.faction_name;
  for (const [aspect, factionName] of Object.entries(ASPECT_FACTIONS)) {
    if (faction === factionName) return aspect;
  }
  return null;
}

/**
 * Determine the locked aspect from the currently selected cards.
 * Returns the aspect if any aspect card is present, null otherwise.
 */
function detectLockedAspect(selectedCards: string[]): string | null {
  for (const code of selectedCards) {
    const aspect = detectCardAspect(code);
    if (aspect) return aspect;
  }
  return null;
}

// ── Screens ───────────────────────────────────────────────────────────────────

async function selectHero(): Promise<{ code: string; name: string }> {
  cls();
  console.log(bold("\n  MARVEL CHAMPIONS DECK BUILDER\n"));
  console.log(dim("  Select a hero:\n"));

  for (let i = 0; i < heroesList.length; i++) {
    const h = heroesList[i];
    const num = String(i + 1).padStart(3);
    const alter = h.alter_ego && h.alter_ego !== h.name ? dim(` (${h.alter_ego})`) : "";
    const decks = dim(`${h.total_decks} decks`);
    console.log(`  ${dim(num)}  ${h.name}${alter}  ${decks}`);
  }

  while (true) {
    const input = await prompt("\n  Hero #: ");
    const idx = parseInt(input, 10) - 1;
    if (idx >= 0 && idx < heroesList.length) {
      return { code: heroesList[idx].code, name: heroesList[idx].name };
    }
    console.log("  Invalid selection.");
  }
}

async function selectAspect(
  heroCode: string,
  heroName: string
): Promise<string> {
  cls();
  const hero = deckData.heroes[heroCode];
  console.log(bold(`\n  ${heroName}`));
  console.log(dim(`  ${hero.total_decks} community decks\n`));
  console.log(dim("  Select an aspect:\n"));

  const available = [...ASPECTS.filter((a) => a in hero.aspects), "all"];

  for (let i = 0; i < available.length; i++) {
    const a = available[i];
    const label = ASPECT_LABELS[a] ?? a;
    const num = String(i + 1).padStart(3);
    const aspectData = hero.aspects[a];
    const decks = aspectData ? dim(`${aspectData.deck_count} decks`) : "";
    console.log(`  ${dim(num)}  ${label}  ${decks}`);
  }

  while (true) {
    const input = await prompt("\n  Aspect #: ");
    const idx = parseInt(input, 10) - 1;
    if (idx >= 0 && idx < available.length) {
      return available[idx];
    }
    console.log("  Invalid selection.");
  }
}

function displayDeck(
  heroName: string,
  signatureCards: string[],
  selectedCards: string[]
): void {
  const totalCards = signatureCards.length + selectedCards.length;
  console.log(
    bold(`\n  ${heroName}`) + `  Cards: ${totalCards}/${MAX_DECK_SIZE}\n`
  );

  if (signatureCards.length > 0) {
    console.log(dim("  Hero cards (auto-included):"));
    for (const code of signatureCards) {
      console.log(`    ${dim("·")} ${dim(cardLabel(code))}`);
    }
  }

  if (selectedCards.length > 0) {
    console.log(dim("\n  Selected cards:"));
    for (let i = 0; i < selectedCards.length; i++) {
      const num = String(i + 1).padStart(3);
      console.log(`  ${dim(num)}  ${cardLabel(selectedCards[i])}`);
    }
  }
}

function displayRecommendations(recs: Recommendation[]): void {
  console.log(dim("\n  Recommendations:\n"));

  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    const num = String(i + 1).padStart(3);
    const bar = scoreBar(r.score);
    const pct = `${r.score}%`.padStart(4);
    const raw = dim(`(${r.rawScore}%)`);
    const card = cardIndex[r.cardCode];
    const cost = card?.cost !== null ? `${card?.cost}` : "-";
    const meta = dim(`[${card?.type_name ?? "?"}, ${cost} cost]`);
    console.log(`  ${dim(num)}  ${bar} ${pct} ${raw}  ${r.cardName}  ${meta}`);
  }
}

// ── Card search ──────────────────────────────────────────────────────────────

/**
 * Search the card index by name (case-insensitive substring match).
 * Excludes hero signature cards, already-selected cards, and off-aspect cards.
 * Returns up to `limit` matches sorted by name.
 */
function searchCards(
  query: string,
  excludeSet: Set<string>,
  limit: number = 20
): Array<[string, CardInfo]> {
  const lower = query.toLowerCase();
  const results: Array<[string, CardInfo]> = [];
  const seenNames = new Set<string>();

  for (const [code, card] of Object.entries(cardIndex)) {
    if (excludeSet.has(code)) continue;
    if (!card.name.toLowerCase().includes(lower)) continue;
    // Deduplicate by name+faction (multiple printings of the same card)
    const dedupeKey = `${card.name}|${card.faction_name}`;
    if (seenNames.has(dedupeKey)) continue;
    seenNames.add(dedupeKey);
    results.push([code, card]);
  }

  results.sort((a, b) => a[1].name.localeCompare(b[1].name));
  return results.slice(0, limit);
}

/**
 * Interactive search flow: show results, let user pick a card to add.
 * Returns the card code if one was selected, or null if cancelled.
 */
async function searchAndSelect(
  excludeSet: Set<string>
): Promise<string | null> {
  const query = await prompt("  Search: ");
  if (!query) return null;

  const results = searchCards(query, excludeSet);

  if (results.length === 0) {
    console.log(`  No cards found matching "${query}".`);
    await prompt(dim("  Press Enter to continue..."));
    return null;
  }

  console.log(dim(`\n  ${results.length} result(s):\n`));
  for (let i = 0; i < results.length; i++) {
    const [code, card] = results[i];
    const num = String(i + 1).padStart(3);
    const cost = card.cost !== null ? `${card.cost}` : "-";
    const meta = dim(`[${card.faction_name}, ${card.type_name}, ${cost} cost]`);
    console.log(`  ${dim(num)}  ${card.name}  ${meta}`);
  }

  const pick = await prompt(dim("\n  Add # (or Enter to cancel): "));
  if (!pick) return null;

  const idx = parseInt(pick, 10) - 1;
  if (idx >= 0 && idx < results.length) {
    return results[idx][0];
  }

  console.log("  Invalid selection.");
  return null;
}

// ── Main loop ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { code: heroCode, name: heroName } = await selectHero();
  const aspect = await selectAspect(heroCode, heroName);

  const signatureCards = getSignatureCards(heroCode, heroName);
  const selectedCards: string[] = [];

  // When the user picks a specific aspect up front, it's fixed.
  // When they pick "all" (No Aspect), the aspect locks dynamically
  // as soon as they add an aspect card, and unlocks if all aspect cards
  // are removed.
  const fixedAspect = aspect !== "all" ? aspect : null;

  // Main deck-building loop
  let lastRecs: Recommendation[] = [];

  while (true) {
    cls();

    // Determine current effective aspect and exclusions
    const lockedAspect = fixedAspect ?? detectLockedAspect(selectedCards);
    const effectiveAspect = lockedAspect ?? "all";
    const excludeCards = buildExcludeList(effectiveAspect);

    displayDeck(heroName, signatureCards, selectedCards);

    if (!fixedAspect && lockedAspect) {
      console.log(
        `  ${dim("Aspect locked to")} ${bold(ASPECT_LABELS[lockedAspect] ?? lockedAspect)} ${dim("(from selected cards)")}`
      );
    }

    lastRecs = getRecommendations({
      heroCode,
      aspect: effectiveAspect,
      selectedCards,
      excludeCards: [...excludeCards, ...signatureCards],
      topN: 10,
    });

    displayRecommendations(lastRecs);

    console.log(
      dim(
        "\n  [1-10] add  |  search [name]  |  remove [n]  |  deck  |  quit\n"
      )
    );
    const input = await prompt("  > ");
    const lower = input.toLowerCase();

    if (lower === "quit" || lower === "q") {
      break;
    }

    if (lower === "deck") {
      cls();
      displayDeck(heroName, signatureCards, selectedCards);
      await prompt(dim("\n  Press Enter to continue..."));
      continue;
    }

    // search <query> — find any card by name and add it
    const searchMatch = lower.match(/^(?:search|s)\s+(.+)$/);
    if (searchMatch || lower === "search" || lower === "s") {
      const allExcluded = new Set([
        ...selectedCards,
        ...signatureCards,
        ...excludeCards,
      ]);
      let code: string | null;
      if (searchMatch) {
        // Inline query: search the term directly
        const query = searchMatch[1];
        const results = searchCards(query, allExcluded);
        if (results.length === 0) {
          console.log(`  No cards found matching "${query}".`);
          await prompt(dim("  Press Enter to continue..."));
          continue;
        }
        console.log(dim(`\n  ${results.length} result(s):\n`));
        for (let i = 0; i < results.length; i++) {
          const [, card] = results[i];
          const num = String(i + 1).padStart(3);
          const cost = card.cost !== null ? `${card.cost}` : "-";
          const meta = dim(`[${card.faction_name}, ${card.type_name}, ${cost} cost]`);
          console.log(`  ${dim(num)}  ${card.name}  ${meta}`);
        }
        const pick = await prompt(dim("\n  Add # (or Enter to cancel): "));
        if (!pick) continue;
        const idx = parseInt(pick, 10) - 1;
        code = idx >= 0 && idx < results.length ? results[idx][0] : null;
        if (code === null) {
          console.log("  Invalid selection.");
          continue;
        }
      } else {
        // Bare "search" — prompt for query
        code = await searchAndSelect(allExcluded);
      }
      if (code) {
        selectedCards.push(code);
        console.log(`  ${cyan("Added:")} ${cardIndex[code]?.name ?? code}`);
      }
      continue;
    }

    const removeMatch = lower.match(/^(?:remove|r)\s+(\d+)$/);
    if (removeMatch) {
      const idx = parseInt(removeMatch[1], 10) - 1;
      if (idx >= 0 && idx < selectedCards.length) {
        const removed = selectedCards.splice(idx, 1)[0];
        console.log(
          `  ${yellow("Removed:")} ${cardIndex[removed]?.name ?? removed}`
        );
      } else {
        console.log("  Invalid card number.");
      }
      continue;
    }

    const addIdx = parseInt(input, 10) - 1;
    if (addIdx >= 0 && addIdx < lastRecs.length) {
      const card = lastRecs[addIdx];
      selectedCards.push(card.cardCode);
      console.log(`  ${cyan("Added:")} ${card.cardName}`);
    } else if (input !== "") {
      console.log("  Unknown command. Try 1-10, 'search [name]', 'remove N', 'deck', or 'quit'.");
      await prompt(dim("  Press Enter to continue..."));
    }
  }

  // Final summary
  cls();
  console.log(bold("\n  FINAL DECK\n"));
  displayDeck(heroName, signatureCards, selectedCards);
  console.log();

  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
