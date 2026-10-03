// Save data. The v2.0.3 key and fields are preserved ("wildfront-save-v1":
// unlocked, credits, stars, upgrades, tutorial) so the Classic 2.0 edition and
// the 3D edition share progress; v3 data lives under `v3`, which Classic keeps.

import { MISSIONS } from "./missions.ts";
import type { TrophyRecord } from "../hunt/hunt.ts";
import type { QualityName } from "../render/quality.ts";

export const SAVE_KEY = "wildfront-save-v1";
export type UpgradeKey = "optics" | "stability" | "tracking";

export interface Settings {
  quality: "auto" | QualityName;
  fov: number;
  sensitivity: number;
  scopedSensitivity: number;
  invertY: boolean;
  aimHold: boolean;
  hitSign: "stylized" | "realistic";
  shotCard: boolean;
  units: "metric" | "imperial";
  volume: { master: number; effects: number; ambience: number; ui: number };
  hud: "full" | "minimal";
  assist: "relaxed" | "standard" | "realistic";
}

export interface JournalEntry { spotted: number; harvested: number; bestScore: number; bestRating: string }

export interface V3Data {
  version: 3;
  seenIntro: boolean;
  owned: string[];
  rifle: string;
  camo: string;
  trophies: TrophyRecord[];
  journal: Record<string, JournalEntry>;
  stats: { shots: number; hits: number; harvests: number; perfect: number; great: number; good: number; longest: number; distance: number; tracks: number; time: number; hunts: number; calls: number };
  achievements: string[];
  settings: Settings;
  best: Record<number, number>;   // best score per contract
  studioSeen: string[];           // blueprints opened in the Studio
}

export interface Save {
  unlocked: number;
  credits: number;
  stars: Record<number, number>;
  upgrades: Record<UpgradeKey, number>;
  tutorial: boolean;
  v3: V3Data;
}

export const DEFAULT_SETTINGS: Settings = {
  quality: "auto", fov: 70, sensitivity: 1, scopedSensitivity: 0.55, invertY: false, aimHold: true,
  hitSign: "stylized", shotCard: true, units: "metric", volume: { master: 0.9, effects: 1, ambience: 0.8, ui: 0.7 }, hud: "full", assist: "standard",
};

export function freshV3(): V3Data {
  return {
    version: 3, seenIntro: false, owned: ["ridgeline-308", "camo-forest"], rifle: "ridgeline-308", camo: "camo-forest", trophies: [], journal: {},
    stats: { shots: 0, hits: 0, harvests: 0, perfect: 0, great: 0, good: 0, longest: 0, distance: 0, tracks: 0, time: 0, hunts: 0, calls: 0 },
    achievements: [], settings: { ...DEFAULT_SETTINGS, volume: { ...DEFAULT_SETTINGS.volume } }, best: {}, studioSeen: [],
  };
}

/** v2.0.3 defaults, exactly. */
export const FRESH_V2 = { unlocked: 1, credits: 120, stars: {} as Record<number, number>, upgrades: { optics: 0, stability: 0, tracking: 0 } as Record<UpgradeKey, number>, tutorial: false };

/** Merge whatever is stored (v2 or v3) into a complete v3 save. */
export function migrate(raw: unknown): Save {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Save> & Record<string, unknown>;
  const base: Save = { ...FRESH_V2, stars: { ...FRESH_V2.stars }, upgrades: { ...FRESH_V2.upgrades }, v3: freshV3() };
  const s: Save = { ...base, ...r } as Save;
  s.unlocked = Math.max(1, Math.min(MISSIONS.length, Number(s.unlocked) || 1));
  s.credits = Math.max(0, Number(s.credits) || 0);
  s.stars = typeof s.stars === "object" && s.stars ? s.stars : {};
  const up = (s.upgrades ?? {}) as Record<UpgradeKey, number>;
  s.upgrades = { optics: clampLvl(up.optics), stability: clampLvl(up.stability), tracking: clampLvl(up.tracking) };
  s.tutorial = !!s.tutorial;
  const v = (r.v3 ?? {}) as Partial<V3Data>;
  const f = freshV3();
  s.v3 = {
    ...f, ...v, version: 3,
    owned: Array.isArray(v.owned) ? Array.from(new Set([...f.owned, ...v.owned])) : f.owned,
    trophies: Array.isArray(v.trophies) ? v.trophies.slice(-200) : [],
    journal: v.journal && typeof v.journal === "object" ? v.journal : {},
    stats: { ...f.stats, ...(v.stats ?? {}) },
    achievements: Array.isArray(v.achievements) ? v.achievements : [],
    settings: { ...f.settings, ...(v.settings ?? {}), volume: { ...f.settings.volume, ...(v.settings?.volume ?? {}) } },
    best: v.best && typeof v.best === "object" ? v.best : {},
    studioSeen: Array.isArray(v.studioSeen) ? v.studioSeen : [],
  };
  // a v2 player who already finished the tutorial has seen the basics
  if (r.v3 === undefined && s.tutorial) s.v3.seenIntro = false;
  return s;
}
function clampLvl(v: unknown) { const n = Math.floor(Number(v) || 0); return Math.max(0, Math.min(3, n)); }

export function loadSave(): Save {
  try { const s = localStorage.getItem(SAVE_KEY); return migrate(s ? JSON.parse(s) : null); } catch { return migrate(null); }
}
export function writeSave(s: Save) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } }

/** v2.0.3 claim rule: credits += reward; unlock next; keep best stars. */
export function claimContract(s: Save, missionId: number, stars: number): Save {
  const m = MISSIONS.find(x => x.id === missionId)!;
  return { ...s, credits: s.credits + m.reward, unlocked: Math.min(MISSIONS.length, Math.max(s.unlocked, m.id + 1)), stars: { ...s.stars, [m.id]: Math.max(s.stars[m.id] || 0, stars) } };
}

/** v2.0.3 upgrade rule: level ≤ 3, cost 120 × (level + 1). */
export function upgradeCost(level: number) { return 120 * (level + 1); }

export function reserveUnlocked(s: Save, reserve: string): boolean {
  if (reserve === "Aurora Pines") return true;            // the home reserve is always open for free hunts
  if (reserve === "Horizon Crossing") return (s.stars[12] ?? 0) > 0 || ["Aurora Pines", "Crimson Highlands", "Verdant Basin", "Obsidian Steppe"].every(r => reserveUnlocked(s, r));
  return MISSIONS.some(m => m.reserve === reserve && (s.stars[m.id] ?? 0) > 0);
}

export const ACHIEVEMENTS: { id: string; title: string; detail: string }[] = [
  { id: "first-harvest", title: "First Harvest", detail: "Tag your first animal." },
  { id: "one-shot", title: "One Shot, One Harvest", detail: "Take an animal with a single vital shot." },
  { id: "perfect", title: "Perfect Form", detail: "Land a PERFECT headshot." },
  { id: "long-glass", title: "Long Glass", detail: "Vital hit beyond 250 m." },
  { id: "reader", title: "Reader of Sign", detail: "Inspect 25 tracks or sign." },
  { id: "recovery", title: "Ethical Recovery", detail: "Recover a wounded animal." },
  { id: "called-in", title: "Called In", detail: "Bring game in with the caller and harvest it." },
  { id: "ghost", title: "Ghost", detail: "Complete a contract without spooking anything." },
  { id: "storm", title: "Storm Hunter", detail: "Complete a night or storm contract." },
  { id: "marksman", title: "Marksman", detail: "100 % accuracy on a contract with 3+ shots." },
  { id: "diamond", title: "Diamond Trophy", detail: "Harvest a diamond-rated trophy." },
  { id: "six", title: "Six of Six", detail: "Harvest all six species." },
  { id: "grand-slam", title: "Grand Slam", detail: "Complete the Horizon Grand Slam." },
  { id: "warden", title: "Warden of the Wild", detail: "Complete all 12 contracts." },
  { id: "blueprints", title: "Draughtsman", detail: "Open every blueprint in the Studio." },
  { id: "free-roam", title: "Open Country", detail: "Tag a trophy in a Free Hunt." },
];
