#!/usr/bin/env python3
"""Fetch Marvel Champions card data from MarvelCDB and build a local index."""

import json
import os
import sys
import time
from collections import Counter
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

API_URL = "https://marvelcdb.com/api/public/cards/"
SCRIPT_DIR = Path(__file__).resolve().parent
RAW_DIR = SCRIPT_DIR / "raw"
PROCESSED_DIR = SCRIPT_DIR / "processed"

RAW_PATH = RAW_DIR / "cards.json"
INDEX_PATH = PROCESSED_DIR / "card_index.json"

USER_AGENT = "MarvelChampionsBuilder/1.0"
REQUEST_DELAY = 1  # seconds between paginated requests


def fetch_cards():
    """Fetch all cards from the MarvelCDB API."""
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Fetching cards from {API_URL} ...")

    try:
        req = Request(API_URL, headers={"User-Agent": USER_AGENT})
        with urlopen(req, timeout=30) as resp:
            if resp.status != 200:
                print(f"Error: server returned status {resp.status}")
                sys.exit(1)
            data = json.loads(resp.read().decode())
    except HTTPError as exc:
        if exc.code == 429:
            print("Error: rate-limited by MarvelCDB. Wait a minute and try again.")
        else:
            print(f"HTTP error {exc.code}: {exc.reason}")
        sys.exit(1)
    except URLError as exc:
        print(f"Network error: {exc.reason}")
        sys.exit(1)
    except json.JSONDecodeError:
        print("Error: received invalid JSON from the API.")
        sys.exit(1)

    # --- Save raw response ---
    with open(RAW_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"Saved {len(data)} cards to {RAW_PATH}")

    # --- Build simplified index ---
    card_index = {}
    for card in data:
        card_index[card["code"]] = {
            "name": card.get("name"),
            "type_name": card.get("type_name"),
            "faction_name": card.get("faction_name"),
            "cost": card.get("cost"),
            "pack_name": card.get("pack_name"),
            "imagesrc": card.get("imagesrc"),
            "card_set_name": card.get("card_set_name"),
            "deck_limit": card.get("deck_limit"),
        }

    with open(INDEX_PATH, "w", encoding="utf-8") as f:
        json.dump(card_index, f, indent=2, ensure_ascii=False)
    print(f"Saved card index to {INDEX_PATH}")

    # --- Print summary ---
    print(f"\n{'=' * 40}")
    print(f"Total cards fetched: {len(data)}")

    factions = Counter(c.get("faction_name", "Unknown") for c in data)
    print(f"\nBy faction/aspect ({len(factions)}):")
    for faction, count in factions.most_common():
        print(f"  {faction or 'Unknown':<20} {count:>5}")

    types = Counter(c.get("type_name", "Unknown") for c in data)
    print(f"\nBy type ({len(types)}):")
    for type_name, count in types.most_common():
        print(f"  {type_name or 'Unknown':<20} {count:>5}")


if __name__ == "__main__":
    fetch_cards()
