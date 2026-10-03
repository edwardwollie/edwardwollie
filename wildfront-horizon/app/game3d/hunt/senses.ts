// Wildlife senses — pure functions so the rules are unit-testable and printed
// verbatim in the Field Guide:
//  • Scent: the wind carries the hunter's scent DOWNWIND in a ±32° cone. Range
//    grows with wind speed (eddies spread it in calm air too, over a short range).
//  • Hearing: the hunter's footstep noise radius × species hearing multiplier.
//  • Sight: species sight range × hunter visibility (stance, motion, cover,
//    light, weather, camo), inside a wide field of view, blocked by terrain/trunks.

import { clamp01, smoothstep } from "../core/math.ts";

export interface ScentInput { hx: number; hz: number; ax: number; az: number; windX: number; windZ: number; smell: number; blocker: number }

/** 0..1 scent strength reaching the animal. windX/Z = air velocity (m/s) toward which the air moves. */
export function scentStrength(s: ScentInput): number {
  const dx = s.ax - s.hx, dz = s.az - s.hz;
  const d = Math.hypot(dx, dz);
  if (d < 0.5) return 1;
  const ws = Math.hypot(s.windX, s.windZ);
  const range = s.smell * (0.35 + 0.65 * smoothstep(0.3, 6, ws)) * (1 - s.blocker * 0.35);
  if (d > range) return 0;
  // calm-air swirl: weak in every direction close by
  const swirl = ws < 1.2 ? (1 - d / (range * 0.25)) * 0.6 : 0;
  if (ws < 0.05) return clamp01(swirl);
  const cos = (dx * s.windX + dz * s.windZ) / (d * ws);
  const cone = smoothstep(Math.cos(0.56), Math.cos(0.18), cos); // ±32°, full at ±10°
  const fall = 1 - smoothstep(range * 0.55, range, d);
  return clamp01(Math.max(cone * fall, swirl));
}

/** 0..1 how loud the hunter sounds to an animal at distance d. */
export function hearingStrength(noiseRadius: number, hearing: number, d: number): number {
  const R = noiseRadius * hearing;
  if (R <= 0 || d > R) return 0;
  return 1 - d / R;
}

/** 0..1 sight detection rate for an exposed hunter at distance d within view. */
export function sightStrength(sightRange: number, visibility: number, d: number, angleFromHeading: number, alert: boolean): number {
  // prey eyes: ~300° field of view, sharpest ahead; a blind spot straight behind
  const a = Math.abs(angleFromHeading);
  const fov = a < 0.6 ? 1 : a < 2.4 ? 0.75 : a < 2.75 ? 0.35 : 0;
  const R = sightRange * (alert ? 1.25 : 1) * visibility;
  if (R <= 1 || d > R) return 0;
  return fov * Math.pow(1 - d / R, 0.7);
}

export const AWARE = { alert: 1.0, flee: 1.85, decay: 0.22 };
