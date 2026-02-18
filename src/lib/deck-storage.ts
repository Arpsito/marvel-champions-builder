export interface SavedDeck {
  id: string;
  name: string;
  heroCode: string;
  heroName: string;
  aspect: string;
  cards: string[];
  savedAt: string;
}

const SAVED_DECKS_KEY = "mc-saved-decks";
const AUTOSAVE_KEY = "mc-autosave";

export function getSavedDecks(): SavedDeck[] {
  try {
    const raw = localStorage.getItem(SAVED_DECKS_KEY);
    if (!raw) return [];
    const map: Record<string, SavedDeck> = JSON.parse(raw);
    return Object.values(map).sort(
      (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
    );
  } catch {
    return [];
  }
}

export function saveDeck(deck: SavedDeck): void {
  try {
    const raw = localStorage.getItem(SAVED_DECKS_KEY);
    const map: Record<string, SavedDeck> = raw ? JSON.parse(raw) : {};
    map[deck.id] = deck;
    localStorage.setItem(SAVED_DECKS_KEY, JSON.stringify(map));
  } catch {
    // storage full or unavailable
  }
}

export function deleteDeck(id: string): void {
  try {
    const raw = localStorage.getItem(SAVED_DECKS_KEY);
    if (!raw) return;
    const map: Record<string, SavedDeck> = JSON.parse(raw);
    delete map[id];
    localStorage.setItem(SAVED_DECKS_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function getAutosave(): SavedDeck | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setAutosave(
  deck: Omit<SavedDeck, "id" | "name" | "savedAt">
): void {
  try {
    const entry: SavedDeck = {
      ...deck,
      id: "autosave",
      name: "Autosave",
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(entry));
  } catch {
    // storage full or unavailable
  }
}

export function clearAutosave(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // ignore
  }
}
