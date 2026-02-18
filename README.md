# Marvel Champions Deck Builder

Community-powered deck builder for [Marvel Champions: The Card Game](https://en.wikipedia.org/wiki/Marvel_Champions:_The_Card_Game). Analyzes thousands of public decklists from [MarvelCDB](https://marvelcdb.com) to recommend cards based on what the community actually plays together — with recency weighting so recommendations reflect modern card choices, not stale meta.

**Live app:** https://marvel-champions-builder.vercel.app

## How it works

1. Pick a hero from the gallery
2. Choose an aspect (Aggression, Justice, Leadership, Protection)
3. The engine recommends cards ranked by how often they appear in community decks for that hero+aspect
4. As you add cards, recommendations shift based on **card-to-card co-occurrence** — picking a niche archetype card (e.g., a Web-Warrior ally) boosts other cards from that archetype and suppresses cards from competing archetypes
5. Save decks locally or export to MarvelCDB

## Tech stack

- **Next.js 16** (App Router, React 19, Server Components)
- **TypeScript** throughout
- **Tailwind CSS 4** for styling (dark theme, responsive mobile-first layout)
- **Python 3** data pipeline (fetching, filtering, co-occurrence computation)
- **Vercel** for deployment
- Card images served from MarvelCDB's CDN (configured in `next.config.ts`)
- No database — all data is pre-computed JSON, deck saves use `localStorage`

## Project structure

```
marvel-champions-builder/
├── data/                          # Data pipeline (Python)
│   ├── fetch_cards.py             # Step 1: Fetch card catalog from MarvelCDB API
│   ├── fetch_decks.py             # Step 2: Fetch all public decklists day-by-day
│   ├── filter_decks.py            # Step 3: Remove incomplete/invalid decks
│   ├── build_cooccurrence.py      # Step 4: Compute weighted frequencies & co-occurrence
│   ├── package_for_web.py         # Step 5: Compress data for browser (top 75 cards, top 50 pairs)
│   ├── raw/                       # [gitignored] Raw API responses (~38 MB)
│   ├── processed/
│   │   ├── card_index.json        # Simplified card catalog (in repo, ~464 KB)
│   │   ├── filtered_decks.json    # [gitignored] Quality-filtered decks (~35 MB)
│   │   └── cooccurrence/          # [gitignored] Per-hero co-occurrence files (~22 MB)
│   └── web/
│       ├── deck_data.json         # Final browser payload (~8 MB, in repo)
│       └── heroes.json            # Hero list for home page (~12 KB, in repo)
├── public/
│   ├── data/                      # [gitignored] Populated at build time by copying data/web/
│   └── placeholder-card.svg
├── src/
│   ├── app/
│   │   ├── layout.tsx             # Root layout (dark bg, metadata)
│   │   ├── globals.css            # Tailwind imports
│   │   ├── page.tsx               # Home: hero grid + saved decks (Server Component)
│   │   ├── components/
│   │   │   ├── HeroGrid.tsx       # Searchable hero gallery (Client)
│   │   │   └── SavedDecks.tsx     # Saved/autosaved deck cards (Client)
│   │   └── build/
│   │       └── [heroCode]/
│   │           ├── page.tsx        # Aspect selection (Server Component)
│   │           ├── AspectSelect.tsx # Aspect picker UI (Client)
│   │           └── [aspect]/
│   │               ├── page.tsx    # Deck builder page (Server Component)
│   │               ├── DeckBuilder.tsx   # Main builder orchestrator (Client)
│   │               ├── DeckPanel.tsx     # Your deck: mobile bottom bar / desktop sidebar
│   │               └── SuggestionsPanel.tsx # Card recommendations + filters
│   ├── lib/
│   │   ├── recommender.ts         # Recommendation engine (co-occurrence scoring)
│   │   ├── deck-storage.ts        # localStorage save/load/autosave
│   │   └── types.ts               # Shared TypeScript interfaces
│   ├── engine/
│   │   └── recommender.ts         # Earlier standalone version (unused by web app)
│   └── prototype/
│       └── cli.ts                 # CLI prototype for testing recommendations
├── package.json
├── tsconfig.json
├── next.config.ts                 # MarvelCDB image domain allowlist
└── postcss.config.mjs             # Tailwind PostCSS plugin
```

## Data pipeline

All scripts live in `data/` and are plain Python 3 (no dependencies beyond stdlib). Run them in order:

### Step 1: Fetch cards
```bash
python3 data/fetch_cards.py
```
Fetches the full card catalog from the MarvelCDB API. Outputs `data/raw/cards.json` (raw) and `data/processed/card_index.json` (simplified index with name, type, faction, cost, image, deck_limit).

### Step 2: Fetch decklists
```bash
python3 data/fetch_decks.py
```
Fetches every public decklist from MarvelCDB, day by day, from 2019-11-01 to today. **This takes hours** due to rate limiting (1 request/second). It's resumable — interrupt with Ctrl+C and re-run to continue where you left off. Progress is saved to `data/raw/decklists_progress.json`. Outputs `data/raw/decklists_raw.json`.

### Step 3: Filter decks
```bash
python3 data/filter_decks.py
```
Removes decks with no hero assignment and decks with fewer than 40 cards (incomplete/test decks). Outputs `data/processed/filtered_decks.json`.

### Step 4: Build co-occurrence
```bash
python3 data/build_cooccurrence.py
```
The core computation. For each hero+aspect combination:

- **Recency weighting:** Each deck gets an exponential decay weight based on age: `weight = e^(-age_days / 365)`. A 1-year-old deck has 37% weight, 2-year-old has 14%, and very old decks decay toward 0. This ensures recommendations reflect the current card pool and meta.
- **Card frequency:** Weighted percentage of decks containing each card. Cards below 5% are excluded.
- **Card pair co-occurrence:** For every pair of eligible cards, the weighted percentage of decks containing both. Stored in one direction only (lexically smaller code first) to halve storage.
- **Copy rates:** `[P(2+|1+), P(3|2+)]` — the probability of running 2+ copies given you run 1+, and 3 copies given you run 2+.
- **Hero merging:** Heroes with multiple card forms (e.g., Ant-Man Tiny/Giant) are merged into a single hero entry.

Outputs one JSON file per hero to `data/processed/cooccurrence/`.

### Step 5: Package for web
```bash
python3 data/package_for_web.py
```
Compresses the full co-occurrence data for browser delivery:
- Keeps top **75 cards per aspect** by frequency (was 50, increased to capture more archetype niche cards)
- Keeps top **50 co-occurrence pairs per card** (was 30, increased to preserve anti-synergy signal)
- Converts 0–1 fractions to 0–100 percentages with 1 decimal place
- Combines all heroes + card index into a single `data/web/deck_data.json` (~8 MB)
- Also outputs `data/web/heroes.json` for the home page hero list

### Refreshing data
To update recommendations with the latest community decks:
```bash
python3 data/fetch_decks.py      # Fetch new decklists (resumable)
python3 data/filter_decks.py     # Re-filter
python3 data/build_cooccurrence.py  # Recompute co-occurrence
python3 data/package_for_web.py  # Repackage for web
```
Then commit and push `data/web/deck_data.json` and `data/web/heroes.json`.

## Recommendation algorithm

The engine lives in `src/lib/recommender.ts`. Key behaviors:

### Scoring

- **No cards selected:** Score = base frequency (how often the card appears in this hero+aspect's decks).
- **With cards selected:** Score = average co-occurrence rate between the candidate and each selected card. This is the core mechanism that makes archetype detection work — selecting a Web-Warrior ally causes other Web-Warrior cards to score high (they co-occur frequently) and Voltron cards to score low (they rarely co-occur).
- **Missing pair handling:** If two cards are both in the candidate pool but have no co-occurrence entry, the pair was pruned during packaging for having very low co-occurrence. The algorithm treats this as 0 (anti-synergy) rather than falling back to base frequency. Cards added via extended search that aren't in the pool at all are skipped (genuinely no data).
- **Low coverage blending:** If co-occurrence data exists for fewer than 50% of selected cards, the score blends 70% base frequency + 30% co-occurrence average, to avoid over-relying on sparse data.
- **Score normalization:** Raw scores are normalized so the top recommendation = 100 and others scale proportionally. This shows relative strength between options.

### Multiple copies

Cards with `deck_limit > 1` (typically 3) can be recommended for additional copies:
- **1st copy:** Normal co-occurrence scoring
- **2nd copy:** Score = `P(2+|1+)` from community copy rate data
- **3rd copy:** Score = `max(P(2+|1+), P(3|2+))` (never decreases with commitment)

### Archetype detection strength

The co-occurrence data contains strong archetype signal. Concrete example from Spider-Man Leadership:
- **Within-archetype lift:** Web-Warrior cards co-occur at 5-6x the independent expectation
- **Cross-archetype suppression:** Web-Warrior + Voltron cards co-occur at 0.04-0.5x expected
- **Impact of a single pick:** Selecting one archetype-signaling card shifts other cards by 20-40 rank positions

## Web app architecture

### Pages and routing

| Route | Rendering | Description |
|-------|-----------|-------------|
| `/` | Static (SSG) | Hero grid. `page.tsx` reads `heroes.json` at build time via `readFileSync`. |
| `/build/[heroCode]` | Dynamic (SSR) | Aspect selection. Reads `deck_data.json` at request time to get aspect list. |
| `/build/[heroCode]/[aspect]` | Dynamic (SSR) | Deck builder. Server component loads hero meta, client component fetches `deck_data.json` via HTTP and runs the recommendation engine client-side. |

### DeckBuilder (client-side)

`DeckBuilder.tsx` is the main orchestrator:
- Fetches `/data/deck_data.json` on mount
- Manages `selectedCards` state (array of card codes, duplicates = multiple copies)
- Computes recommendations via `getRecommendations()` whenever selection changes
- Handles auto-aspect-locking: if "all" aspect is chosen, locks to a specific aspect when the first aspect card is added
- Autosaves to `localStorage` on every card change
- Restores from autosave or named save on load (via `?load=` query param)

### DeckPanel (responsive)

- **Mobile (< lg):** Fixed bottom bar. Collapsed = compact summary (hero thumb + card count + chevron). Tapping expands a slide-up overlay (max 70vh) with full card list, save/export buttons. Card remove X icons are always slightly visible (opacity-30) since hover doesn't work on touch.
- **Desktop (lg+):** Inline sidebar panel, always expanded, sticky positioning.

### SuggestionsPanel

- Filters: search (full-width on mobile), type chips, cost buttons, clear all
- Shows recommendation cards in a responsive grid with score bars, rank badges, and hover-to-add
- Extended search: when the search box has 2+ characters, also searches the full card index beyond the top recommendations

### Data flow

```
MarvelCDB API → Python pipeline → deck_data.json → copied to public/data/ at build time
                                                          ↓
                                  Server Components read heroes.json via readFileSync
                                  Client Component fetches deck_data.json via HTTP
                                                          ↓
                                  recommender.ts scores candidates in the browser
```

## Development

### Prerequisites
- Node.js 18+
- Python 3.8+ (only needed for data pipeline)

### Running locally
```bash
npm install
npm run dev
```
The `dev` script copies `data/web/*.json` to `public/data/` then starts the Next.js dev server. Open http://localhost:3000.

### Building for production
```bash
npm run build
npm start
```

### Type checking
```bash
npx tsc --noEmit
```

## Deployment

Deployed on Vercel with automatic deploys from the `main` branch on GitHub.

The `build` script in `package.json` runs `mkdir -p public/data && cp data/web/*.json public/data/ && next build` — this copies the pre-computed data files into the public directory before Next.js builds. No environment variables or external services are needed.

To deploy changes: push to `main` and Vercel auto-deploys.

## Key design decisions

1. **Pre-computed co-occurrence over collaborative filtering:** The entire recommendation model is a static JSON file. No server, no database, no ML inference at runtime. The browser does all scoring client-side in ~1ms. Trade-off: data freshness requires re-running the pipeline.

2. **Exponential decay (365-day half-life) for recency:** We chose exponential decay over hard date cutoffs because it gracefully handles heroes with different popularity curves. A hero released 3 years ago still uses all its decks, but recent ones dominate. The 365-day half-life was chosen so that ~1 year of meta shift is enough to substantially change recommendations.

3. **Card-to-card co-occurrence, not just hero-to-card frequency:** This is what enables archetype detection. Base frequency alone would always recommend the same generic staples. Co-occurrence captures "decks that run card A also run card B" — which encodes archetype, synergy, and strategy information that pure popularity misses.

4. **Missing pairs treated as anti-synergy (0), not unknown:** When the data packaging step prunes a pair for low co-occurrence, the recommendation engine treats the absence as evidence of anti-synergy rather than falling back to base frequency. This prevents cards from competing archetypes from being falsely inflated when pair data is missing.

5. **75 cards and 50 pairs per aspect (increased from 50/30):** The initial conservative limits cut too many niche archetype cards and anti-synergy signals. Increasing to 75/50 grew the data file from 4.5 MB to 8 MB (within the 10 MB budget) but dramatically improved archetype differentiation.

6. **Mobile-first deck builder layout:** On mobile, the deck builder uses `flex-col-reverse` so the suggestion cards (the primary interaction) appear first, with the deck panel as a fixed bottom bar. Desktop uses a traditional sidebar layout.

7. **Symlinks replaced with build-time copy:** `public/data/` files are derived from `data/web/` via a `cp` in the build script, rather than symlinks. This ensures compatibility with Vercel's build environment and any platform.

8. **No external dependencies in data pipeline:** All Python scripts use only stdlib (`json`, `math`, `urllib`, `collections`, `datetime`, `pathlib`). No pandas, no numpy, no pip install. This keeps the pipeline portable and simple.
