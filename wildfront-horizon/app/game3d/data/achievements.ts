// Achievement rules. Each check receives the save (already updated with the
// event) and the event context; newly earned ids are returned so the UI can
// toast them.

import { ACHIEVEMENTS, type Save } from "./save.ts";
import { MISSIONS, type Mission } from "./missions.ts";
import { WILDLIFE } from "../blueprints/wildlife/index.ts";
import type { HuntStats, ShotAnalysis, TrophyRecord } from "../hunt/hunt.ts";
import { GEAR } from "../blueprints/gear.ts";
import { STRUCTURES } from "../blueprints/structures.ts";

export type AchEvent =
  | { kind: "shot"; a: ShotAnalysis }
  | { kind: "tag"; t: TrophyRecord; free: boolean; calls: number }
  | { kind: "complete"; mission: Mission | null; stats: HuntStats; free: boolean }
  | { kind: "studio" }
  | { kind: "stats" };

/** Every blueprint the Studio lists (wildlife, gear, structures). */
export const STUDIO_IDS: string[] = [...WILDLIFE.map(w => w.id), ...GEAR.map(g => g.id), ...STRUCTURES.map(s => s.id)];

export function checkAchievements(s: Save, ev: AchEvent): string[] {
  const have = new Set(s.v3.achievements);
  const got: string[] = [];
  const give = (id: string) => { if (!have.has(id) && ACHIEVEMENTS.some(a => a.id === id)) { have.add(id); got.push(id); } };
  switch (ev.kind) {
    case "shot":
      if (ev.a.grade === "perfect" && ev.a.licensed) give("perfect");
      if ((ev.a.grade === "perfect" || ev.a.grade === "great") && ev.a.licensed && ev.a.distance > 250) give("long-glass");
      break;
    case "tag": {
      give("first-harvest");
      if (ev.t.oneShot && (ev.t.grade === "perfect" || ev.t.grade === "great")) give("one-shot");
      if (ev.t.recovered) give("recovery");
      if (ev.calls > 0) give("called-in");
      if (ev.t.rating === "diamond") give("diamond");
      if (ev.free) give("free-roam");
      if (WILDLIFE.every(w => (s.v3.journal[w.species]?.harvested ?? 0) > 0)) give("six");
      break;
    }
    case "complete": {
      if (ev.free || !ev.mission) break;
      const m = ev.mission;
      if (ev.stats.spooked === 0) give("ghost");
      if (m.time === "Night" || m.weather === "Storm") give("storm");
      if (ev.stats.shots >= 3 && ev.stats.hits === ev.stats.shots) give("marksman");
      if (m.id === 12) give("grand-slam");
      if (MISSIONS.every(x => (s.stars[x.id] ?? 0) > 0)) give("warden");
      break;
    }
    case "studio":
      if (STUDIO_IDS.every(id => s.v3.studioSeen?.includes(id))) give("blueprints");
      break;
    case "stats":
      break;
  }
  if (s.v3.stats.tracks >= 25) give("reader");
  return got;
}
