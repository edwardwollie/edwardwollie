// Shot grading and scoring. The v2.0.3 rules are preserved exactly:
//   PERFECT — head / muzzle contact (vital headshot)
//   GREAT   — chest, shoulder or upper-torso vital contact
//   GOOD    — any other registered body contact (animal staggers, then flees)
//   MISS    — −5 points (never below 0)
// Points: GOOD 75 + max(0, 70 − d)·0.35 · GREAT 260 + max(0, 130 − d) + 25 if breath held ·
//         PERFECT 340 + max(0, 130 − d) + 25 if breath held. Stars: accuracy ≥ 80 → 3, ≥ 50 → 2, else 1.

import type { OrganId, Zone } from "../blueprints/types.ts";

export type Grade = "perfect" | "great" | "good" | "graze" | "miss";

export interface HitInfo {
  zone: Zone;               // first surface contacted
  organs: OrganId[];        // organs the bullet path crosses
  inVitalRegion: boolean;   // contact point inside the GREAT region (upper torso / shoulder)
}

export interface GradeResult { grade: Grade; lethal: boolean; organ: string; wound: "none" | "liver" | "gut" | "leg" | "neck" | "flesh" }

export function gradeHit(h: HitInfo): GradeResult {
  if (h.zone === "antler") return { grade: "graze", lethal: false, organ: "antler / horn", wound: "none" };
  if (h.zone === "head") return { grade: "perfect", lethal: true, organ: h.organs.includes("brain") ? "brain" : "head", wound: "none" };
  if (h.organs.includes("heart")) return { grade: "great", lethal: true, organ: "heart", wound: "none" };
  if (h.organs.includes("lungs")) return { grade: "great", lethal: true, organ: "lungs", wound: "none" };
  if ((h.zone === "torso") && h.inVitalRegion) return { grade: "great", lethal: true, organ: "upper torso", wound: "none" };
  if (h.organs.includes("liver")) return { grade: "good", lethal: false, organ: "liver", wound: "liver" };
  if (h.organs.includes("stomach")) return { grade: "good", lethal: false, organ: "paunch", wound: "gut" };
  if (h.zone === "leg") return { grade: "good", lethal: false, organ: "leg", wound: "leg" };
  if (h.zone === "neck") return { grade: "good", lethal: false, organ: "neck", wound: "neck" };
  return { grade: "good", lethal: false, organ: h.zone, wound: "flesh" };
}

export function shotPoints(grade: Grade, dist: number, steady: boolean): number {
  switch (grade) {
    case "good": return Math.round(75 + Math.max(0, 70 - dist) * 0.35);
    case "great": return Math.round(260 + Math.max(0, 130 - dist) + (steady ? 25 : 0));
    case "perfect": return Math.round(340 + Math.max(0, 130 - dist) + (steady ? 25 : 0));
    case "miss": return -5;
    case "graze": return -5;
  }
}

export function starsFor(accuracy: number): number { return accuracy >= 80 ? 3 : accuracy >= 50 ? 2 : 1; }

/** Accuracy = registered hits ÷ shots fired (v2.0.3). */
export function accuracyOf(hits: number, shots: number): number { return shots ? Math.round(hits / shots * 100) : 0; }

export const UNLICENSED_PENALTY = 150;

export type Rating = "bronze" | "silver" | "gold" | "diamond" | "none";
export function ratingFor(score: number, tiers: { bronze: number; silver: number; gold: number; diamond: number }): Rating {
  if (score >= tiers.diamond) return "diamond";
  if (score >= tiers.gold) return "gold";
  if (score >= tiers.silver) return "silver";
  if (score >= tiers.bronze) return "bronze";
  return "none";
}

/** Credits paid for a harvest in Free Hunt (contracts pay their fixed reward). */
export function harvestCredits(rating: Rating, grade: Grade): number {
  const base = { none: 20, bronze: 35, silver: 55, gold: 85, diamond: 140 }[rating];
  const g = grade === "perfect" ? 1.3 : grade === "great" ? 1.15 : 0.8;
  return Math.round(base * g);
}

export const GRADE_LABEL: Record<Grade, string> = { perfect: "PERFECT · HEADSHOT", great: "GREAT SHOT · VITAL", good: "GOOD SHOT", graze: "GRAZE · NO BODY CONTACT", miss: "MISS" };
