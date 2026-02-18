"""Build co-occurrence data for Marvel Champions deck recommendations.

Processes filtered decks to compute, for each hero+aspect combination,
weighted card frequencies and card pair co-occurrence rates.
Recency weighting ensures modern card choices are emphasized.

Usage:
    python3 data/build_cooccurrence.py
"""

import json
import math
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

# ── Constants ──────────────────────────────────────────────────────────────────

ASPECTS = ["aggression", "justice", "leadership", "protection"]
FREQUENCY_THRESHOLD = 0.05
WEIGHT_FLOOR = 0.0
HALF_LIFE = 365  # days

DATA_DIR = Path(__file__).parent / "processed"
INPUT_CARDS = DATA_DIR / "card_index.json"
INPUT_RAW_CARDS = Path(__file__).parent / "raw" / "cards.json"
INPUT_DECKS = DATA_DIR / "filtered_decks.json"
OUTPUT_DIR = DATA_DIR / "cooccurrence"


# ── Helpers ────────────────────────────────────────────────────────────────────

def parse_date(iso_str):
    """Parse ISO 8601 date string to a timezone-aware datetime."""
    # Handle the +00:00 timezone format
    if iso_str.endswith("+00:00") or iso_str.endswith("Z"):
        iso_str = iso_str.replace("Z", "+00:00")
    return datetime.fromisoformat(iso_str)


def compute_weight(age_days):
    """Exponential decay weight with floor."""
    return max(WEIGHT_FLOOR, math.exp(-age_days / HALF_LIFE))


def get_aspect(deck):
    """Extract aspect from deck meta field. Returns lowercase or None."""
    meta_str = deck.get("meta")
    if not meta_str:
        return None
    try:
        meta = json.loads(meta_str)
    except (json.JSONDecodeError, TypeError):
        return None
    aspect = meta.get("aspect")
    if aspect and aspect.lower() in ASPECTS:
        return aspect.lower()
    return None


def build_hero_merge_map(raw_cards, deck_hero_codes):
    """Build a mapping from alternate hero codes to the primary (most-used) code.

    Some heroes have multiple hero cards (e.g. Ant-Man Tiny/Giant, Ironheart
    level-up forms). These share the same name and pack, representing different
    forms of the same character. We merge them so all decks are grouped under
    one hero.

    Returns:
        merge_map: dict mapping alternate hero_code -> primary hero_code
        merged_names: dict mapping primary code -> list of all codes in the group
    """
    hero_cards = [c for c in raw_cards if c.get("type_code") == "hero"]

    # Group hero cards by (name, pack_code) — same character in same pack
    by_identity = defaultdict(list)
    for c in hero_cards:
        by_identity[(c["name"], c.get("pack_code", ""))].append(c["code"])

    merge_map = {}
    merged_names = {}
    for (name, pack), codes in by_identity.items():
        codes_in_decks = [c for c in codes if c in deck_hero_codes]
        if len(codes_in_decks) <= 1:
            continue
        # Primary = the code with the most decks
        primary = max(codes_in_decks, key=lambda c: deck_hero_codes[c])
        for code in codes_in_decks:
            if code != primary:
                merge_map[code] = primary
        merged_names[primary] = codes_in_decks

    return merge_map, merged_names


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    # Step 1: Load data
    print("Loading card index...")
    with open(INPUT_CARDS) as f:
        card_index = json.load(f)

    hero_card_codes = {
        code for code, card in card_index.items()
        if card["faction_name"] == "Hero"
    }
    print(f"  {len(card_index)} cards, {len(hero_card_codes)} hero-faction cards excluded")

    print("Loading raw cards for hero merge map...")
    with open(INPUT_RAW_CARDS) as f:
        raw_cards = json.load(f)

    print("Loading filtered decks...")
    with open(INPUT_DECKS) as f:
        all_decks = json.load(f)
    print(f"  {len(all_decks)} decks loaded")

    # Count decks per hero_code for merge map
    deck_counts_by_code = defaultdict(int)
    for deck in all_decks:
        deck_counts_by_code[deck["hero_code"]] += 1

    merge_map, merged_names = build_hero_merge_map(raw_cards, deck_counts_by_code)
    del raw_cards

    if merge_map:
        print(f"\n  Merging alternate hero versions:")
        for alt_code, primary_code in sorted(merge_map.items()):
            print(f"    {alt_code} ({deck_counts_by_code[alt_code]} decks) -> {primary_code} ({deck_counts_by_code[primary_code]} decks)")

    # Group decks by hero_code, merging alternates into primary
    decks_by_hero = defaultdict(list)
    merged_count = 0
    for deck in all_decks:
        hero_code = deck["hero_code"]
        canonical = merge_map.get(hero_code, hero_code)
        if canonical != hero_code:
            merged_count += 1
        decks_by_hero[canonical].append(deck)
    print(f"\n  {len(decks_by_hero)} unique heroes ({merged_count} decks merged into primary hero codes)")

    # Free memory
    del all_decks

    # Step 2 & 3: Process each hero
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    all_weights = []
    heroes_under_20 = []
    file_sizes = []
    spiderman_data = None  # for comparison report

    for hero_idx, (hero_code, hero_decks) in enumerate(sorted(decks_by_hero.items())):
        hero_name = hero_decks[0]["hero_name"]
        n_decks = len(hero_decks)

        if n_decks < 20:
            heroes_under_20.append((hero_code, hero_name, n_decks))

        # Parse dates and compute recency weights
        deck_dates = []
        for deck in hero_decks:
            deck_dates.append(parse_date(deck["date_creation"]))

        max_date = max(deck_dates)
        weights = []
        for dt in deck_dates:
            age_days = (max_date - dt).days
            weights.append(compute_weight(age_days))

        all_weights.extend(weights)

        # Bucket decks by aspect
        aspect_buckets = {a: [] for a in ASPECTS}
        aspect_buckets["all"] = []

        for i, deck in enumerate(hero_decks):
            w = weights[i]
            # Extract non-hero card slots with copy counts
            card_slots = {
                code: count for code, count in deck["slots"].items()
                if code not in hero_card_codes
            }
            entry = (w, card_slots)
            aspect_buckets["all"].append(entry)

            aspect = get_aspect(deck)
            if aspect:
                aspect_buckets[aspect].append(entry)

        # Compute frequencies and co-occurrence per aspect bucket
        aspects_output = {}
        for aspect_key, bucket in aspect_buckets.items():
            if not bucket:
                continue

            total_weight = sum(w for w, _ in bucket)
            deck_count = len(bucket)

            # Weighted card frequency and copy count tracking
            card_weight_sum = defaultdict(float)
            copy2_weight_sum = defaultdict(float)  # weight of decks with 2+ copies
            copy3_weight_sum = defaultdict(float)  # weight of decks with 3 copies
            for w, card_slots in bucket:
                for code, count in card_slots.items():
                    card_weight_sum[code] += w
                    if count >= 2:
                        copy2_weight_sum[code] += w
                    if count >= 3:
                        copy3_weight_sum[code] += w

            card_frequency = {
                code: wsum / total_weight
                for code, wsum in card_weight_sum.items()
            }

            # Eligible cards for pair computation (frequency >= threshold)
            eligible = {
                code for code, freq in card_frequency.items()
                if freq >= FREQUENCY_THRESHOLD
            }

            # Weighted co-occurrence pairs
            pair_weight_sum = defaultdict(float)
            for w, card_slots in bucket:
                # Filter to eligible cards in this deck, sort for consistent ordering
                eligible_in_deck = sorted(code for code in card_slots if code in eligible)
                for i in range(len(eligible_in_deck)):
                    for j in range(i + 1, len(eligible_in_deck)):
                        pair_weight_sum[(eligible_in_deck[i], eligible_in_deck[j])] += w

            # Build nested card_pairs dict
            card_pairs = defaultdict(dict)
            for (a, b), wsum in pair_weight_sum.items():
                card_pairs[a][b] = round(wsum / total_weight, 4)

            # Build copy_rates: [P(2+|1+), P(3|2+)] for each card
            # P(2+|1+) = fraction of including-decks with 2+ copies
            # P(3|2+)  = fraction of 2+-copy decks with 3 copies
            copy_rates = {}
            for code in card_weight_sum:
                w1 = card_weight_sum[code]
                w2 = copy2_weight_sum.get(code, 0.0)
                w3 = copy3_weight_sum.get(code, 0.0)
                if w1 > 0:
                    p2_given_1 = round(w2 / w1, 4)
                    p3_given_2 = round(w3 / w2, 4) if w2 > 0 else 0.0
                    copy_rates[code] = [p2_given_1, p3_given_2]

            # Prune cards below threshold and round frequencies
            card_frequency = {
                code: round(freq, 4)
                for code, freq in card_frequency.items()
                if freq >= FREQUENCY_THRESHOLD
            }

            # Prune copy_rates to only include cards above threshold
            copy_rates = {
                code: rates for code, rates in copy_rates.items()
                if code in card_frequency
            }

            aspects_output[aspect_key] = {
                "deck_count": deck_count,
                "weighted_deck_count": round(total_weight, 2),
                "card_frequency": dict(sorted(card_frequency.items())),
                "card_pairs": {k: dict(sorted(v.items())) for k, v in sorted(card_pairs.items())},
                "copy_rates": dict(sorted(copy_rates.items())),
            }

        hero_output = {
            "hero_code": hero_code,
            "hero_name": hero_name,
            "total_decks": n_decks,
            "total_weighted_decks": round(sum(weights), 2),
            "decay_half_life_days": HALF_LIFE,
            "most_recent_deck_date": max_date.strftime("%Y-%m-%d"),
            "aspects": aspects_output,
        }

        # Save
        out_path = OUTPUT_DIR / f"{hero_code}.json"
        with open(out_path, "w") as f:
            json.dump(hero_output, f, indent=2)

        file_size = out_path.stat().st_size
        file_sizes.append(file_size)

        if hero_code == "01001a":
            spiderman_data = hero_output
            spiderman_decks = hero_decks
            spiderman_weights = weights

        if (hero_idx + 1) % 10 == 0 or hero_idx == 0:
            print(f"  [{hero_idx + 1}/{len(decks_by_hero)}] {hero_name}: {n_decks} decks, "
                  f"{len(aspects_output) - 1} aspects + all")

    # ── Step 2 reporting: Weight distribution ──────────────────────────────────
    print("\n" + "=" * 60)
    print("WEIGHT DISTRIBUTION")
    print("=" * 60)
    print(f"  Total weights: {len(all_weights)}")
    print(f"  Average: {sum(all_weights) / len(all_weights):.4f}")
    print(f"  Min: {min(all_weights):.4f}")
    print(f"  Max: {max(all_weights):.4f}")

    # Histogram by year bracket (based on weight value ranges)
    year_brackets = [
        ("< 1 year (w > 0.37)", lambda w: w > math.exp(-1)),
        ("1-2 years (0.14 < w <= 0.37)", lambda w: math.exp(-2) < w <= math.exp(-1)),
        ("2-3 years (0.05 < w <= 0.14)", lambda w: math.exp(-3) < w <= math.exp(-2)),
        ("3+ years (w = 0.20 floor)", lambda w: w <= math.exp(-3)),
    ]
    # Actually the floor is 0.2, so many old decks will be at 0.2
    # Let's do a simpler histogram based on weight ranges
    bins = [
        (f"w = {WEIGHT_FLOOR:.1f} (floor)", lambda w: w <= WEIGHT_FLOOR + 0.01),
        (f"{WEIGHT_FLOOR:.1f} < w <= 0.40", lambda w: WEIGHT_FLOOR + 0.01 < w <= 0.40),
        ("0.40 < w <= 0.60", lambda w: 0.40 < w <= 0.60),
        ("0.60 < w <= 0.80", lambda w: 0.60 < w <= 0.80),
        ("0.80 < w <= 1.00", lambda w: 0.80 < w <= 1.00),
    ]
    for label, predicate in bins:
        count = sum(1 for w in all_weights if predicate(w))
        bar = "#" * (count * 40 // len(all_weights))
        print(f"  {label:30s} {count:6d} ({count * 100 / len(all_weights):5.1f}%) {bar}")

    # ── Step 5: Summary report ────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"  Heroes processed: {len(decks_by_hero)}")
    print(f"  Output files: {len(file_sizes)}")
    print(f"  Average file size: {sum(file_sizes) / len(file_sizes) / 1024:.1f} KB")
    print(f"  Total output size: {sum(file_sizes) / 1024 / 1024:.1f} MB")

    if heroes_under_20:
        print(f"\n  Heroes with < 20 decks ({len(heroes_under_20)}):")
        for code, name, count in heroes_under_20:
            print(f"    {code} ({name}): {count} decks")

    # Spider-Man Leadership: weighted vs unweighted comparison
    if spiderman_data and "leadership" in spiderman_data["aspects"]:
        print("\n" + "=" * 60)
        print("SPIDER-MAN LEADERSHIP: WEIGHTED vs UNWEIGHTED")
        print("=" * 60)

        sm_leadership = spiderman_data["aspects"]["leadership"]

        # Recompute unweighted for comparison
        unweighted_freq = defaultdict(float)
        sm_leadership_count = 0
        for i, deck in enumerate(spiderman_decks):
            aspect = get_aspect(deck)
            if aspect != "leadership":
                continue
            sm_leadership_count += 1
            card_codes = [
                code for code in deck["slots"]
                if code not in hero_card_codes
            ]
            for code in card_codes:
                unweighted_freq[code] += 1.0

        for code in unweighted_freq:
            unweighted_freq[code] /= sm_leadership_count

        weighted_freq = sm_leadership["card_frequency"]

        # Top 10 by weighted
        top_weighted = sorted(weighted_freq.items(), key=lambda x: -x[1])[:10]
        top_unweighted = sorted(unweighted_freq.items(), key=lambda x: -x[1])[:10]

        def card_name(code):
            return card_index.get(code, {}).get("name", code)

        print(f"\n  {'WEIGHTED (top 10)':40s} | {'UNWEIGHTED (top 10)':40s}")
        print(f"  {'-' * 40} | {'-' * 40}")
        for i in range(10):
            w_code, w_freq = top_weighted[i]
            u_code, u_freq = top_unweighted[i]
            w_name = card_name(w_code)
            u_name = card_name(u_code)
            print(f"  {w_name:28s} {w_freq:.4f}  | {u_name:28s} {u_freq:.4f}")

    print("\nDone!")


if __name__ == "__main__":
    main()
