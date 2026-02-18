import { readFileSync } from "fs";
import { join } from "path";
import { notFound } from "next/navigation";
import type { HeroData } from "@/lib/recommender";
import type { Hero } from "@/lib/types";
import AspectSelect from "./AspectSelect";

interface DeckDataFile {
  heroes: Record<string, HeroData>;
}

function loadHeroData(heroCode: string): { hero: HeroData; heroMeta: Hero } | null {
  const deckPath = join(process.cwd(), "public", "data", "deck_data.json");
  const deckData: DeckDataFile = JSON.parse(readFileSync(deckPath, "utf-8"));
  const hero = deckData.heroes[heroCode];
  if (!hero) return null;

  const heroesPath = join(process.cwd(), "public", "data", "heroes.json");
  const heroes: Hero[] = JSON.parse(readFileSync(heroesPath, "utf-8"));
  const heroMeta = heroes.find((h) => h.code === heroCode);
  if (!heroMeta) return null;

  return { hero, heroMeta };
}

export default async function BuildPage({
  params,
}: {
  params: Promise<{ heroCode: string }>;
}) {
  const { heroCode } = await params;
  const data = loadHeroData(heroCode);

  if (!data) notFound();

  const { hero, heroMeta } = data;

  // Build aspect info for the client component
  const aspects = Object.entries(hero.aspects).map(([key, data]) => ({
    key,
    deckCount: data.deck_count,
  }));

  return (
    <AspectSelect
      heroCode={heroCode}
      heroName={hero.hero_name}
      alterEgo={hero.alter_ego}
      imagesrc={heroMeta.imagesrc}
      totalDecks={hero.total_decks}
      aspects={aspects}
    />
  );
}
