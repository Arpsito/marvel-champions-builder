"""Package co-occurrence data and card index into optimized JSON for the web app.

Reads all per-hero cooccurrence files and the card index, then produces:
  - data/web/deck_data.json  (card index + hero frequency/cooccurrence data)
  - data/web/heroes.json     (simple hero list for pickers/menus)

Usage:
    python3 data/package_for_web.py
"""

import json
import os
from pathlib import Path

# ── Constants ──────────────────────────────────────────────────────────────────

TOP_CARDS_PER_ASPECT = 75
TOP_PAIRS_PER_CARD = 50

DATA_DIR = Path(__file__).parent
COOCCURRENCE_DIR = DATA_DIR / "processed" / "cooccurrence"
CARD_INDEX_PATH = DATA_DIR / "processed" / "card_index.json"
RAW_CARDS_PATH = DATA_DIR / "raw" / "cards.json"
OUTPUT_DIR = DATA_DIR / "web"


def load_hero_meta(raw_cards_path):
    """Build hero metadata from raw cards (alter ego names, traits, images)."""
    with open(raw_cards_path) as f:
        raw_cards = json.load(f)

    heroes = {}
    alter_egos = {}
    for c in raw_cards:
        if c.get("type_code") == "hero":
            heroes[c["code"]] = c
        elif c.get("type_code") == "alter_ego":
            alter_egos[c["code"]] = c

    hero_meta = {}
    for code, h in heroes.items():
        alter_code = code[:-1] + "b"
        ae = alter_egos.get(alter_code, {})
        hero_meta[code] = {
            "name": h["name"],
            "alter_ego": ae.get("name"),
            "traits": h.get("traits", ""),
            "imagesrc": h.get("imagesrc", ""),
        }

    return hero_meta


def compress_aspect(aspect_data):
    """Compress a single aspect's frequency, pair, and copy rate data."""
    freq = aspect_data["card_frequency"]
    pairs = aspect_data["card_pairs"]
    raw_copy_rates = aspect_data.get("copy_rates", {})

    # Top N cards by frequency, rounded to 1 decimal (as percentage)
    top_cards = sorted(freq.items(), key=lambda x: -x[1])[:TOP_CARDS_PER_ASPECT]
    compressed_freq = {code: round(val * 100, 1) for code, val in top_cards}

    # Only keep pairs for cards that made the frequency cut
    top_card_set = set(compressed_freq.keys())
    compressed_pairs = {}
    for card_a, inner in pairs.items():
        if card_a not in top_card_set:
            continue
        # Filter to cards also in top set, take top N by co-occurrence rate
        relevant = {b: v for b, v in inner.items() if b in top_card_set}
        top_inner = sorted(relevant.items(), key=lambda x: -x[1])[:TOP_PAIRS_PER_CARD]
        if top_inner:
            compressed_pairs[card_a] = {
                code: round(val * 100, 1) for code, val in top_inner
            }

    # Copy rates for cards in the top set, as percentages with 1 decimal
    # [P(2+|1+), P(3|2+)] — both as 0–100 scale
    compressed_copy_rates = {}
    for code in top_card_set:
        rates = raw_copy_rates.get(code)
        if rates:
            compressed_copy_rates[code] = [
                round(rates[0] * 100, 1),
                round(rates[1] * 100, 1),
            ]

    return {
        "deck_count": aspect_data["deck_count"],
        "weighted_deck_count": aspect_data["weighted_deck_count"],
        "card_frequency": compressed_freq,
        "card_pairs": compressed_pairs,
        "copy_rates": compressed_copy_rates,
    }


def main():
    print("Loading card index...")
    with open(CARD_INDEX_PATH) as f:
        card_index = json.load(f)
    print(f"  {len(card_index)} cards")

    print("Loading hero metadata from raw cards...")
    hero_meta = load_hero_meta(RAW_CARDS_PATH)

    print("Loading cooccurrence files...")
    cooccurrence_files = sorted(COOCCURRENCE_DIR.glob("*.json"))
    print(f"  {len(cooccurrence_files)} hero files")

    heroes_data = {}
    heroes_list = []

    total_freq_entries = 0
    total_pair_entries = 0

    for filepath in cooccurrence_files:
        with open(filepath) as f:
            hero = json.load(f)

        hero_code = hero["hero_code"]
        meta = hero_meta.get(hero_code, {})

        # Compress each aspect
        compressed_aspects = {}
        for aspect_key, aspect_data in hero["aspects"].items():
            compressed = compress_aspect(aspect_data)
            compressed_aspects[aspect_key] = compressed
            total_freq_entries += len(compressed["card_frequency"])
            total_pair_entries += sum(len(v) for v in compressed["card_pairs"].values())

        heroes_data[hero_code] = {
            "hero_name": hero["hero_name"],
            "alter_ego": meta.get("alter_ego"),
            "total_decks": hero["total_decks"],
            "total_weighted_decks": hero["total_weighted_decks"],
            "most_recent_deck_date": hero["most_recent_deck_date"],
            "aspects": compressed_aspects,
        }

        heroes_list.append({
            "code": hero_code,
            "name": hero["hero_name"],
            "alter_ego": meta.get("alter_ego"),
            "traits": meta.get("traits", ""),
            "imagesrc": meta.get("imagesrc", ""),
            "total_decks": hero["total_decks"],
        })

    print(f"\n  Compressed totals:")
    print(f"    card_frequency entries: {total_freq_entries}")
    print(f"    card_pair entries: {total_pair_entries}")

    # Build the main data file
    deck_data = {
        "card_index": card_index,
        "heroes": heroes_data,
    }

    # Write output
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    deck_data_path = OUTPUT_DIR / "deck_data.json"
    with open(deck_data_path, "w") as f:
        json.dump(deck_data, f, separators=(",", ":"))

    heroes_path = OUTPUT_DIR / "heroes.json"
    heroes_list.sort(key=lambda h: h["name"])
    with open(heroes_path, "w") as f:
        json.dump(heroes_list, f, indent=2)

    # Report
    deck_size = deck_data_path.stat().st_size
    heroes_size = heroes_path.stat().st_size
    print(f"\nOutput:")
    print(f"  {deck_data_path}: {deck_size / 1024 / 1024:.2f} MB")
    print(f"  {heroes_path}: {heroes_size / 1024:.1f} KB")

    if deck_size > 10 * 1024 * 1024:
        print("\n  WARNING: deck_data.json exceeds 10 MB target!")
        print("  Consider splitting by hero or further reducing pair limits.")
    else:
        print(f"\n  Within 10 MB target.")

    print("\nDone!")


if __name__ == "__main__":
    main()
