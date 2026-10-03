import type { AgePath } from "../../flight-data.ts";
import type { CadetId } from "../blueprints/cast.ts";

/**
 * Saved progress lives under the SAME key as v2.1 ("spaceflight-academy-save-v1"),
 * so every cadet keeps their unlocked missions, stars, XP, badges and star cores.
 * v3-only data is stored in a nested `v3` object; the Classic edition (/classic/)
 * keeps unknown fields when it writes, so both editions can share one save.
 */
export const SAVE_KEY = "spaceflight-academy-save-v1";

export type Timing = "standard" | "relaxed";
export type QualitySetting = "auto" | "low" | "medium" | "high";

export interface SavedDesign {
  name: string;
  counts: Record<string, number>;
  savedAt: string;
}

export interface V3Data {
  version: 3;
  cadet: CadetId;
  suit: string;
  music: boolean;
  narration: boolean;
  captions: boolean;
  timing: Timing;
  quality: QualitySetting;
  reduceMotion: boolean;
  /** Star Journal: ids of Space Rush facts collected (answered correctly). */
  journal: string[];
  /** Destinations visited (sector index as string). */
  passport: string[];
  photos: string[];
  activityBest: Record<string, number>;
  designs: SavedDesign[];
  tutorials: string[];
  planetWalk: string[];
  studioSeen: string[];
  /** Observatory: worlds explored and worlds jumped on in the Gravity Jump lab. */
  observatory: string[];
  jumps: string[];
  detectiveBest: number;
  achievements: string[];
  stats: { gates: number; gatesCorrect: number; launches: number; landings: number; docks: number; photos: number; samples: number; orbits: number };
  lastPlayed: string;
}

export interface Save {
  // ---- v2.1 fields (shared with the Classic edition)
  age: AgePath | null;
  progress: Record<AgePath, number>;
  stars: Record<string, number>;
  xp: number;
  badges: string[];
  starCores: number;
  bestCombo: number;
  familyWins: number;
  sound: boolean;
  ship: string;
  // ---- v3 data
  v3: V3Data;
  [extra: string]: unknown;
}

export function defaultV3(): V3Data {
  return {
    version: 3, cadet: "omari", suit: "classic", music: true, narration: true, captions: true, timing: "standard", quality: "auto",
    reduceMotion: false, journal: [], passport: [], photos: [], activityBest: {}, designs: [], tutorials: [], planetWalk: [], studioSeen: [],
    observatory: [], jumps: [], detectiveBest: 0, achievements: [], stats: { gates: 0, gatesCorrect: 0, launches: 0, landings: 0, docks: 0, photos: 0, samples: 0, orbits: 0 },
    lastPlayed: "",
  };
}

export function defaultSave(): Save {
  return { age: null, progress: { "5–7": 1, "8–10": 1, "11–12": 1 }, stars: {}, xp: 0, badges: [], starCores: 0, bestCombo: 0, familyWins: 0, sound: true, ship: "Comet", v3: defaultV3() };
}

const AGES: AgePath[] = ["5–7", "8–10", "11–12"];
const num = (value: unknown, fallback: number, min = 0, max = 1e9) => (typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback);
const strArr = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").slice(0, 2000) : []);

/** Merges stored data with defaults and repairs anything malformed. */
export function normalizeSave(raw: unknown): Save {
  const base = defaultSave();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const progressRaw = (r.progress && typeof r.progress === "object" ? r.progress : {}) as Record<string, unknown>;
  const progress = { ...base.progress };
  for (const age of AGES) progress[age] = Math.round(num(progressRaw[age], 1, 1, 30));
  const starsRaw = (r.stars && typeof r.stars === "object" ? r.stars : {}) as Record<string, unknown>;
  const stars: Record<string, number> = {};
  for (const [key, value] of Object.entries(starsRaw)) if (typeof value === "number") stars[key] = Math.round(num(value, 0, 0, 3));
  const v3raw = (r.v3 && typeof r.v3 === "object" ? r.v3 : {}) as Partial<V3Data> & Record<string, unknown>;
  const dv3 = defaultV3();
  const statsRaw = (v3raw.stats && typeof v3raw.stats === "object" ? v3raw.stats : {}) as Record<string, unknown>;
  const stats = { ...dv3.stats };
  for (const key of Object.keys(stats) as (keyof typeof stats)[]) stats[key] = Math.round(num(statsRaw[key], 0));
  const cadets: CadetId[] = ["omari", "mei", "finn", "sofia"];
  const v3: V3Data = {
    ...dv3,
    cadet: cadets.includes(v3raw.cadet as CadetId) ? (v3raw.cadet as CadetId) : dv3.cadet,
    suit: typeof v3raw.suit === "string" ? v3raw.suit : dv3.suit,
    music: typeof v3raw.music === "boolean" ? v3raw.music : dv3.music,
    narration: typeof v3raw.narration === "boolean" ? v3raw.narration : dv3.narration,
    captions: typeof v3raw.captions === "boolean" ? v3raw.captions : dv3.captions,
    timing: v3raw.timing === "relaxed" ? "relaxed" : "standard",
    quality: (["auto", "low", "medium", "high"] as QualitySetting[]).includes(v3raw.quality as QualitySetting) ? (v3raw.quality as QualitySetting) : "auto",
    reduceMotion: typeof v3raw.reduceMotion === "boolean" ? v3raw.reduceMotion : dv3.reduceMotion,
    journal: strArr(v3raw.journal),
    passport: strArr(v3raw.passport),
    photos: strArr(v3raw.photos),
    activityBest: v3raw.activityBest && typeof v3raw.activityBest === "object" ? Object.fromEntries(Object.entries(v3raw.activityBest as Record<string, unknown>).filter(([, v]) => typeof v === "number")) as Record<string, number> : {},
    designs: Array.isArray(v3raw.designs) ? (v3raw.designs as SavedDesign[]).filter((d) => d && typeof d.name === "string" && d.counts && typeof d.counts === "object").slice(0, 12) : [],
    tutorials: strArr(v3raw.tutorials),
    planetWalk: strArr(v3raw.planetWalk),
    studioSeen: strArr(v3raw.studioSeen),
    observatory: strArr(v3raw.observatory),
    jumps: strArr(v3raw.jumps),
    detectiveBest: Math.round(num(v3raw.detectiveBest, 0, 0, 999)),
    achievements: strArr(v3raw.achievements),
    stats,
    lastPlayed: typeof v3raw.lastPlayed === "string" ? v3raw.lastPlayed : "",
  };
  return {
    ...r,
    age: AGES.includes(r.age as AgePath) ? (r.age as AgePath) : null,
    progress,
    stars,
    xp: Math.round(num(r.xp, 0)),
    badges: strArr(r.badges),
    starCores: Math.round(num(r.starCores, 0)),
    bestCombo: Math.round(num(r.bestCombo, 0)),
    familyWins: Math.round(num(r.familyWins, 0)),
    sound: typeof r.sound === "boolean" ? r.sound : true,
    ship: typeof r.ship === "string" ? r.ship : "Comet",
    v3,
  };
}

export function loadSave(storage: Pick<Storage, "getItem"> | null = safeStorage()): Save {
  try {
    const text = storage?.getItem(SAVE_KEY);
    return normalizeSave(text ? JSON.parse(text) : null);
  } catch {
    return defaultSave();
  }
}

export function writeSave(save: Save, storage: Pick<Storage, "setItem"> | null = safeStorage()) {
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export const missionKey = (age: AgePath, level: number) => `${age}-${level}`;

export function totalStars(save: Save) {
  return Object.values(save.stars).reduce((sum, value) => sum + value, 0);
}

/** Academy rank from total XP (shown on the cadet badge). */
export const RANKS = [
  { xp: 0, name: "Cadet" },
  { xp: 1500, name: "Pilot Trainee" },
  { xp: 4000, name: "Flight Pilot" },
  { xp: 8000, name: "Orbit Navigator" },
  { xp: 13000, name: "Mission Specialist" },
  { xp: 20000, name: "Flight Commander" },
  { xp: 30000, name: "Star Captain" },
] as const;

export function rankFor(xp: number) {
  let current: (typeof RANKS)[number] = RANKS[0];
  let next: (typeof RANKS)[number] | null = null;
  for (let i = 0; i < RANKS.length; i++) {
    if (xp >= RANKS[i].xp) { current = RANKS[i]; next = RANKS[i + 1] ?? null; }
  }
  return { current, next, progress: next ? (xp - current.xp) / (next.xp - current.xp) : 1 };
}
