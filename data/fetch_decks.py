#!/usr/bin/env python3
"""Fetch all public decklists from MarvelCDB day-by-day and build a local archive."""

import json
import os
import sys
import time
from datetime import date, timedelta
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

API_BASE = "https://marvelcdb.com/api/public/decklists/by_date/"
SCRIPT_DIR = Path(__file__).resolve().parent
RAW_DIR = SCRIPT_DIR / "raw"

PROGRESS_PATH = RAW_DIR / "decklists_progress.json"
OUTPUT_PATH = RAW_DIR / "decklists_raw.json"

USER_AGENT = "MarvelChampionsBuilder/1.0"
REQUEST_DELAY = 1  # seconds between requests

START_DATE = date(2019, 11, 1)
PROGRESS_LOG_INTERVAL = 30  # log every N days

FIELDS = [
    "id", "name", "date_creation", "user_id",
    "hero_code", "hero_name",
    "slots", "tags", "meta", "version",
]


def load_progress():
    """Load existing progress or return empty state."""
    if PROGRESS_PATH.exists():
        with open(PROGRESS_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"fetched_dates": {}, "decks": []}


def save_progress(progress):
    """Save progress to disk."""
    with open(PROGRESS_PATH, "w", encoding="utf-8") as f:
        json.dump(progress, f, ensure_ascii=False)


def extract_deck(raw):
    """Extract relevant fields from a raw deck object."""
    deck = {}
    for field in FIELDS:
        if field in raw:
            deck[field] = raw[field]
    return deck


def fetch_day(day_str):
    """Fetch decklists for a single day. Returns list of decks or None on failure."""
    url = f"{API_BASE}{day_str}"
    req = Request(url, headers={"User-Agent": USER_AGENT})

    for attempt in range(2):
        try:
            with urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode())
            return data if isinstance(data, list) else []
        except HTTPError as exc:
            if exc.code in (429, 500, 502, 503, 504) and attempt == 0:
                print(f"  Retrying {day_str} after HTTP {exc.code}...")
                time.sleep(3)
                continue
            print(f"  WARNING: skipping {day_str} — HTTP {exc.code}: {exc.reason}")
            return None
        except (URLError, json.JSONDecodeError, OSError) as exc:
            if attempt == 0:
                print(f"  Retrying {day_str} after error: {exc}")
                time.sleep(3)
                continue
            print(f"  WARNING: skipping {day_str} — {exc}")
            return None

    return None


def fetch_decks():
    """Fetch all public decklists from MarvelCDB day-by-day."""
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    progress = load_progress()
    fetched_dates = progress["fetched_dates"]
    all_decks = progress["decks"]

    today = date.today()
    current = START_DATE
    total_days = (today - START_DATE).days + 1
    days_done = 0
    days_skipped = 0
    new_decks = 0

    print(f"Fetching decklists from {START_DATE} to {today} ({total_days} days)", flush=True)
    if fetched_dates:
        print(f"Resuming — {len(fetched_dates)} days already fetched, {len(all_decks)} decks cached", flush=True)

    try:
        while current <= today:
            day_str = current.isoformat()
            days_done += 1

            if day_str in fetched_dates:
                current += timedelta(days=1)
                continue

            if days_done % PROGRESS_LOG_INTERVAL == 0 or current == START_DATE:
                pct = days_done / total_days * 100
                print(f"[{days_done}/{total_days} {pct:.0f}%] Fetching {day_str} — {len(all_decks)} decks so far", flush=True)

            data = fetch_day(day_str)

            if data is None:
                days_skipped += 1
            else:
                extracted = [extract_deck(d) for d in data]
                all_decks.extend(extracted)
                new_decks += len(extracted)
                fetched_dates[day_str] = len(data)
                progress["decks"] = all_decks
                save_progress(progress)

            current += timedelta(days=1)
            time.sleep(REQUEST_DELAY)

    except KeyboardInterrupt:
        print(f"\nInterrupted! Progress saved — {len(fetched_dates)} days fetched, {len(all_decks)} decks.")
        print("Re-run this script to resume.")
        save_progress(progress)
        sys.exit(0)

    # --- Write final output ---
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(all_decks, f, indent=2, ensure_ascii=False)
    print(f"\nSaved {len(all_decks)} decks to {OUTPUT_PATH}")

    # --- Summary ---
    print(f"\n{'=' * 40}")
    print(f"Total decks:    {len(all_decks)}")
    print(f"Days fetched:   {len(fetched_dates)}")
    print(f"Days skipped:   {days_skipped}")
    print(f"New decks:      {new_decks}")
    if all_decks:
        dates = [d.get("date_creation", "") for d in all_decks if d.get("date_creation")]
        if dates:
            print(f"First deck:     {min(dates)}")
            print(f"Last deck:      {max(dates)}")

    # Clean up progress file now that we're done
    if PROGRESS_PATH.exists():
        os.remove(PROGRESS_PATH)
        print(f"\nCleaned up progress file.")


if __name__ == "__main__":
    fetch_decks()
