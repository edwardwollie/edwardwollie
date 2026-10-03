import { STUDIO_ENABLED } from "../app/features.ts";
import { totalStars, type Save } from "../state/save.ts";

export interface Achievement {
  id: string;
  icon: string;
  name: string;
  detail: string;
  test: (save: Save) => boolean;
}

/** Blueprint Studio achievements: only offered where the (internal) Studio is available. */
const STUDIO_ACHIEVEMENTS: readonly Achievement[] = [
  { id: "blueprint-reader", icon: "📐", name: "Blueprint Reader", detail: "Explore 20 blueprints in the Blueprint Studio.", test: (s) => s.v3.studioSeen.length >= 20 },
  { id: "view-detective", icon: "🔍", name: "View Detective", detail: "Score 8 or more in View Detective.", test: (s) => s.v3.detectiveBest >= 8 },
];

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: "first-liftoff", icon: "🚀", name: "First Liftoff", detail: "Complete your first mission.", test: (s) => Object.keys(s.stars).length >= 1 },
  { id: "comet-combo", icon: "☄️", name: "Comet Combo", detail: "Answer 5 gates in a row correctly.", test: (s) => s.bestCombo >= 5 },
  { id: "perfect-rush", icon: "🌟", name: "Perfect Rush", detail: "Clear all 6 gates of a mission without a mistake.", test: (s) => s.bestCombo >= 6 },
  { id: "orbit-maker", icon: "🌍", name: "Orbit Maker", detail: "Reach orbit 3 times.", test: (s) => s.v3.stats.orbits >= 3 },
  { id: "docking-pro", icon: "🛰️", name: "Docking Pro", detail: "Dock with Orbital School 3 times.", test: (s) => s.v3.stats.docks >= 3 },
  { id: "soft-lander", icon: "🌙", name: "Soft Lander", detail: "Land gently on the Moon or Mars.", test: (s) => s.v3.stats.landings >= 1 },
  { id: "rock-collector", icon: "🪨", name: "Rock Collector", detail: "Grab 3 asteroid samples.", test: (s) => s.v3.stats.samples >= 3 },
  { id: "space-photographer", icon: "📸", name: "Space Photographer", detail: "Photograph the outer worlds.", test: (s) => s.v3.stats.photos >= 1 },
  { id: "star-scholar", icon: "📘", name: "Star Scholar", detail: "Collect 25 facts in your Star Journal.", test: (s) => s.v3.journal.length >= 25 },
  { id: "galaxy-brain", icon: "🧠", name: "Galaxy Brain", detail: "Collect 100 facts in your Star Journal.", test: (s) => s.v3.journal.length >= 100 },
  { id: "solar-explorer", icon: "🪐", name: "Solar System Explorer", detail: "Visit all six destinations.", test: (s) => s.v3.passport.length >= 6 },
  { id: "planet-walker", icon: "🚶", name: "Planet Walker", detail: "Visit every stop on the campus Planet Walk.", test: (s) => s.v3.planetWalk.length >= 10 },
  { id: "star-gazer", icon: "🔭", name: "Star Gazer", detail: "Explore all 11 worlds in the Star Observatory.", test: (s) => s.v3.observatory.length >= 11 },
  { id: "gravity-jumper", icon: "🦘", name: "Gravity Jumper", detail: "Jump on 5 different worlds in the Gravity Jump lab.", test: (s) => s.v3.jumps.length >= 5 },
  { id: "family-scientist", icon: "👨‍👩‍👧", name: "Family Scientist", detail: "Start 3 Family Space Lab activities.", test: (s) => s.familyWins >= 3 },
  { id: "thirty-stars", icon: "⭐", name: "Star Collector", detail: "Earn 30 mission stars.", test: (s) => totalStars(s) >= 30 },
  { id: "ninety-stars", icon: "🏆", name: "Academy Legend", detail: "Earn 90 mission stars.", test: (s) => totalStars(s) >= 90 },
  ...(STUDIO_ENABLED ? STUDIO_ACHIEVEMENTS : []),
];

/** Achievements newly true in `after` that were not yet recorded. */
export function checkAchievements(after: Save, before: Save): string[] {
  const owned = new Set([...before.v3.achievements, ...after.v3.achievements]);
  return ACHIEVEMENTS.filter((a) => !owned.has(a.id) && a.test(after)).map((a) => a.id);
}
