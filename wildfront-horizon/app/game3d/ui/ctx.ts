// App-wide context for the 3D edition's UI.

import { createContext, useContext } from "react";
import type { GameHost } from "../engine/host.ts";
import type { Snapshotter } from "../render/snapshots.ts";
import type { Save } from "../data/save.ts";
import type { StudioMode } from "../modes/studio.ts";
import type { TerrainData } from "../world/terrain-gen.ts";
import { generateTerrain } from "../world/terrain-gen.ts";
import { reserveByName } from "../blueprints/reserves.ts";

/** The Blueprint Studio is an internal tool: only local development builds show it. */
export const STUDIO_ENABLED = process.env.NODE_ENV !== "production";

/** Achievements a player can earn on this build (the Studio one needs the Studio). */
export const playableAchievement = (id: string) => STUDIO_ENABLED || id !== "blueprints";

export type Screen = "lodge" | "contracts" | "briefing" | "free" | "locker" | "trophies" | "guide" | "studio" | "settings" | "loading" | "hunt" | "results";

export interface AppCtx {
  host: GameHost;
  snap: Snapshotter;
  save: Save;
  update: (fn: (s: Save) => Save) => Save;
  go: (s: Screen) => void;
  toast: (text: string, kind?: string) => void;
  /** activates (and lazily creates) the shared Studio viewer mode */
  studio: () => StudioMode;
  units: "metric" | "imperial";
  touch: boolean;
  /** select a contract and open its briefing */
  brief: (missionId: number) => void;
  missionId: number;
  setMissionId: (id: number) => void;
  startFree: (o: FreeHuntOptions) => void;
  startContract: (missionId: number, loadout: Loadout) => void;
  playUi: (kind: string) => void;
}

export interface Loadout { rifleId: string; camo: string; caller: boolean; scent: boolean }
export interface FreeHuntOptions { reserve: string; time: string; weather: string; species: string[]; loadout: Loadout }

export const Ctx = createContext<AppCtx>(null!);
export const useApp = () => useContext(Ctx);

const terrains = new Map<string, TerrainData>();
/** Heightfield + masks for a reserve (cached; deterministic — identical to the 3D world's). */
export function terrainFor(reserve: string): TerrainData {
  const def = reserveByName(reserve);
  let t = terrains.get(def.id);
  if (!t) { t = generateTerrain(def, 257); terrains.set(def.id, t); }
  return t;
}
