import { readFileSync } from "fs";
import { join } from "path";
import type { Hero } from "@/lib/types";
import HeroGrid from "./components/HeroGrid";
import SavedDecks from "./components/SavedDecks";

function loadHeroes(): Hero[] {
  const filePath = join(process.cwd(), "public", "data", "heroes.json");
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

export default function Home() {
  const heroes = loadHeroes();

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Marvel Champions
          <span className="text-red-600"> Deck Builder</span>
        </h1>
        <p className="mt-2 text-gray-400">
          Community-powered recommendations from{" "}
          {heroes.reduce((sum, h) => sum + h.total_decks, 0).toLocaleString()}{" "}
          decks
        </p>
      </div>

      <SavedDecks />

      <HeroGrid heroes={heroes} />
    </main>
  );
}
