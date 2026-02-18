#!/usr/bin/env python3
"""Filter raw decklists to remove incomplete, invalid, and low-quality decks."""

import json
from collections import Counter
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
RAW_PATH = SCRIPT_DIR / "raw" / "decklists_raw.json"
PROCESSED_DIR = SCRIPT_DIR / "processed"
OUTPUT_PATH = PROCESSED_DIR / "filtered_decks.json"

MIN_CARDS = 40


def card_count(deck):
    """Total number of cards in the deck's slots."""
    slots = deck.get("slots")
    if not slots or not isinstance(slots, dict):
        return 0
    return sum(slots.values())


def filter_decks():
    """Load raw decks, apply quality filters, and save the result."""
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    with open(RAW_PATH, "r", encoding="utf-8") as f:
        decks = json.load(f)

    total = len(decks)
    print(f"Total decks loaded: {total}")

    # --- Apply filters, tracking removals ---
    no_hero = 0
    too_few_cards = 0
    kept = []

    for d in decks:
        if not d.get("hero_code"):
            no_hero += 1
            continue
        if card_count(d) < MIN_CARDS:
            too_few_cards += 1
            continue
        kept.append(d)

    # --- Save ---
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(kept, f, indent=2, ensure_ascii=False)

    # --- Report ---
    removed = total - len(kept)
    print(f"\n{'=' * 50}")
    print(f"FILTER REPORT")
    print(f"{'=' * 50}")
    print(f"No hero assigned:       {no_hero:>7}  removed")
    print(f"Fewer than {MIN_CARDS} cards:     {too_few_cards:>7}  removed")
    print(f"{'─' * 50}")
    print(f"Total removed:          {removed:>7}  ({removed/total*100:.1f}%)")
    print(f"Total remaining:        {len(kept):>7}  ({len(kept)/total*100:.1f}%)")

    # --- Top 20 heroes ---
    hero_counts = Counter(d.get("hero_name", "Unknown") for d in kept)
    print(f"\n{'=' * 50}")
    print(f"TOP 20 HEROES BY DECK COUNT")
    print(f"{'=' * 50}")
    for rank, (hero, count) in enumerate(hero_counts.most_common(20), 1):
        bar = "█" * (count * 30 // hero_counts.most_common(1)[0][1])
        print(f"  {rank:>2}. {hero:<25} {count:>5}  {bar}")

    print(f"\nTotal unique heroes: {len(hero_counts)}")

    # --- Deck size stats ---
    sizes = [card_count(d) for d in kept]
    avg_size = sum(sizes) / len(sizes) if sizes else 0
    print(f"\nAverage deck size: {avg_size:.1f} cards")

    print(f"\nSaved to {OUTPUT_PATH}")


if __name__ == "__main__":
    filter_decks()
