import {
  CARS,
  type CarId,
  type CarSpec,
  type SaveData,
  type UpgradeLevels,
} from "./progression";
import type { DriveStats } from "./race-physics";
import { TRACKS } from "./track";

/** Grand Prix rules, rival roster, rewards, records and ghost storage. */

export const GRID_SIZE = 8;

export type Rival = {
  name: string;
  team: string;
  car: CarId;
  primary: number;
  secondary: number;
  css: string;
  skill: number;
  aggression: number;
};

export const RIVALS: Rival[] = [
  { name: "Kaito Vance", team: "Helix Works", car: "solar", primary: 0xff3b5c, secondary: 0xffd34d, css: "#ff3b5c", skill: 0.985, aggression: 0.9 },
  { name: "Mira Osei", team: "Aurora Dynamics", car: "vortex", primary: 0x7c4dff, secondary: 0x19e6ff, css: "#7c4dff", skill: 0.97, aggression: 0.8 },
  { name: "Juno Calder", team: "Ironclad", car: "prism", primary: 0xf4f7ff, secondary: 0xff5d3a, css: "#f4f7ff", skill: 0.955, aggression: 0.6 },
  { name: "Rex Halloran", team: "Quasar Rush", car: "pulse", primary: 0xffb000, secondary: 0x2b6bff, css: "#ffb000", skill: 0.945, aggression: 0.75 },
  { name: "Lena Sorrow", team: "Nightjar", car: "vortex", primary: 0x1b1f33, secondary: 0xff3bbd, css: "#c03bff", skill: 0.935, aggression: 0.95 },
  { name: "Tomas Reyes", team: "Verdant Arc", car: "solar", primary: 0x32ff8a, secondary: 0x0a5bff, css: "#32ff8a", skill: 0.92, aggression: 0.55 },
  { name: "Ivy Strand", team: "Nova Spark", car: "pulse", primary: 0xff7ad9, secondary: 0xfff36b, css: "#ff7ad9", skill: 0.9, aggression: 0.5 },
];

/** Track-space driving stats (m/s, m/s², rad/s) for a car and its upgrades. */
export function driveStats(car: CarSpec, upgrades: UpgradeLevels): DriveStats {
  return {
    topSpeed: 62 + car.speed * 30 + upgrades.engine * 2.6,
    acceleration: 15 + car.speed * 7 + upgrades.engine * 1.3,
    grip: 34 + car.handling * 18 + upgrades.handling * 2.6,
    maxYaw: 1.25 + car.handling * 0.55 + upgrades.handling * 0.07,
    boostMultiplier: 1.22 + car.speed * 0.1 + upgrades.engine * 0.015,
    braking: 38,
  };
}

/** AI stats scale with the circuit so later events are tougher. */
export function rivalStats(rival: Rival, trackIndex: number): DriveStats {
  const base = CARS.find((c) => c.id === rival.car) ?? CARS[0];
  const tier = Math.min(5, trackIndex);
  return driveStats(base, {
    engine: 1 + tier * 0.8,
    handling: 1 + tier * 0.8,
    shield: 0,
    magnet: 0,
  });
}

/** Early rounds are gentler; by round 6 rivals drive at their full pace. */
export function rivalSkill(rival: Rival, trackIndex: number): number {
  return rival.skill * Math.min(1, 0.945 + Math.max(0, trackIndex) * 0.011);
}

export const POSITION_REWARD = [600, 430, 320, 240, 180, 130, 90, 60];

export function raceReward(position: number, trackIndex: number): number {
  const base = POSITION_REWARD[Math.min(GRID_SIZE, Math.max(1, position)) - 1];
  return Math.round((base * (1 + trackIndex * 0.18)) / 10) * 10;
}

export type TrackRecord = {
  bestPosition: number;
  bestLap: number;
  bestRace: number;
  wins: number;
};

export type GrandPrixSave = Record<string, TrackRecord>;

export function sanitizeGrandPrix(value: unknown): GrandPrixSave {
  const out: GrandPrixSave = {};
  if (!value || typeof value !== "object") return out;
  for (const track of TRACKS) {
    const raw = (value as Record<string, Partial<TrackRecord>>)[track.id];
    if (!raw || typeof raw !== "object") continue;
    const num = (v: unknown, fallback: number) =>
      typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback;
    out[track.id] = {
      bestPosition: Math.min(GRID_SIZE, Math.floor(num(raw.bestPosition, GRID_SIZE))),
      bestLap: num(raw.bestLap, 0),
      bestRace: num(raw.bestRace, 0),
      wins: Math.floor(num(raw.wins, 0)),
    };
  }
  return out;
}

/** The first two circuits are open; a podium finish unlocks the next one. */
export function isTrackUnlocked(save: SaveData, index: number): boolean {
  if (index < 2) return true;
  const previous = save.grandPrix?.[TRACKS[index - 1].id];
  return Boolean(previous && previous.bestPosition <= 3);
}

export function recordRace(
  current: GrandPrixSave | undefined,
  trackId: string,
  position: number,
  bestLap: number,
  raceTime: number,
): GrandPrixSave {
  const previous = current?.[trackId];
  const next: TrackRecord = {
    bestPosition: Math.min(previous?.bestPosition ?? GRID_SIZE, position),
    bestLap: previous?.bestLap ? Math.min(previous.bestLap, bestLap) : bestLap,
    bestRace: previous?.bestRace ? Math.min(previous.bestRace, raceTime) : raceTime,
    wins: (previous?.wins ?? 0) + (position === 1 ? 1 : 0),
  };
  return { ...(current ?? {}), [trackId]: next };
}

export type GhostLap = {
  version: 1;
  trackId: string;
  car: CarId;
  lapTime: number;
  /** Interleaved s, d, psi sampled every GHOST_INTERVAL seconds. */
  samples: number[];
};

export const GHOST_INTERVAL = 0.1;

function ghostKey(trackId: string): string {
  return `hypernova-ghost-v3-${trackId}`;
}

export function loadGhost(trackId: string): GhostLap | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ghostKey(trackId));
    if (!raw) return null;
    const ghost = JSON.parse(raw) as GhostLap;
    if (ghost.version !== 1 || ghost.trackId !== trackId) return null;
    if (!Array.isArray(ghost.samples) || ghost.samples.length < 30) return null;
    return ghost;
  } catch {
    return null;
  }
}

export function storeGhost(ghost: GhostLap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ghostKey(ghost.trackId), JSON.stringify(ghost));
  } catch {
    // Ghosts are optional; storage may be full or blocked.
  }
}

export function formatLapTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "--:--.---";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}:${rest.toFixed(3).padStart(6, "0")}`;
}
