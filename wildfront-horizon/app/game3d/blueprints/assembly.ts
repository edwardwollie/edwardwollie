// Assembly blueprints: manufactured objects (rifles, optics, callers,
// structures, vehicles) described as a parts list of primitives with
// transforms, materials and animation groups. One schema, three consumers:
// the game (viewmodel, landmarks), the Blueprint Studio and the printed sheets
// (parts list / exploded views come straight from `prims`).

import type { BlueprintMeta, RGB, V2, V3 } from "./types.ts";

export interface MatSpec { color: RGB; metal: number; rough: number; emissive?: RGB; label: string; /** < 1 for glazing and other see-through parts */ opacity?: number }

export type PrimKind = "box" | "cyl" | "lathe" | "extrude" | "tube" | "sphere" | "torus" | "ring";

export interface Prim {
  id: string;
  name: string;
  kind: PrimKind;
  mat: string;
  p: V3;                 // position (m)
  rot?: V3;              // euler XYZ (rad)
  size?: V3;             // box
  r?: number; r2?: number; h?: number;   // cyl: bottom/top radius, height along +Y (centered)
  profile?: V2[];        // lathe: (radius, y) / extrude: outline (x, y)
  depth?: number;        // extrude thickness (centered on Z)
  bevel?: number;        // extrude bevel size
  pts?: V3[]; tr?: number; // tube path + radius
  tor?: [number, number, number]; // torus: radius, tube, arc
  seg?: number;
  group?: string;        // animation / explode group
  explode?: V3;          // exploded-view offset (m)
  hidden?: boolean;      // e.g. internal parts drawn only in sections
}

export interface AssemblyBlueprint extends BlueprintMeta {
  category: "gear" | "structure" | "vehicle";
  materials: Record<string, MatSpec>;
  prims: Prim[];
  /** named attachment / reference points (muzzle, eye relief, anchor points, climb points) */
  anchors: Record<string, V3>;
  specs: { label: string; value: string }[];
  facts?: string[];
  /** where the hunter stands or sits on a climbable structure (the game reads it from here) */
  perch?: PerchSpec;
}

/** The hunter's standing eye height (m); a perch with `eye: null` uses it. */
export const STANDING_EYE = 1.68;

/** Height of the hunter's eye on a perch, above the structure origin. */
export function perchEyeY(p: PerchSpec): number { return p.floor + (p.eye ?? STANDING_EYE); }

/** Spec rows for the Studio and the sheets, plus where a climbable structure puts the hunter's eye. */
export function specRows(a: AssemblyBlueprint): { label: string; value: string }[] {
  const p = a.perch;
  if (!p) return a.specs;
  const how = p.eye === null ? `standing, ${STANDING_EYE.toFixed(2)} m above the floor` : `seated, ${p.eye.toFixed(2)} m above the floor`;
  return [...a.specs, { label: "Hunter's eye", value: `${perchEyeY(p).toFixed(2)} m (${how})` }];
}

/** A climbable position on a structure, in the blueprint frame (metres). */
export interface PerchSpec {
  kind: "tower" | "stand" | "blind";
  /** floor the hunter stands or sits on, above the structure origin */
  floor: number;
  /** eye height above that floor; null = the hunter's own standing eye height */
  eye: number | null;
  /** how far the hunter can move about on the floor */
  roam: number;
  /** the hunter's position (x, z) */
  at: [number, number];
  /** where the hunter steps off (x, z) */
  exit: [number, number];
  /** share of the hunter's scent that still reaches the game */
  scent: number;
}
