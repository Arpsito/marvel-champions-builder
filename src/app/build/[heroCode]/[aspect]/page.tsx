import { readFileSync } from "fs";
import { join } from "path";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { Hero } from "@/lib/types";
import DeckBuilder from "./DeckBuilder";

const VALID_ASPECTS = ["aggression", "justice", "leadership", "protection", "all"];

function loadHeroMeta(heroCode: string): Hero | null {
  const heroesPath = join(process.cwd(), "public", "data", "heroes.json");
  const heroes: Hero[] = JSON.parse(readFileSync(heroesPath, "utf-8"));
  return heroes.find((h) => h.code === heroCode) ?? null;
}

export default async function DeckBuilderPage({
  params,
}: {
  params: Promise<{ heroCode: string; aspect: string }>;
}) {
  const { heroCode, aspect } = await params;

  if (!VALID_ASPECTS.includes(aspect)) notFound();

  const heroMeta = loadHeroMeta(heroCode);
  if (!heroMeta) notFound();

  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <div className="text-gray-400">Loading...</div>
        </main>
      }
    >
      <DeckBuilder
        heroCode={heroCode}
        heroName={heroMeta.name}
        alterEgo={heroMeta.alter_ego}
        heroImagesrc={heroMeta.imagesrc}
        initialAspect={aspect}
      />
    </Suspense>
  );
}
