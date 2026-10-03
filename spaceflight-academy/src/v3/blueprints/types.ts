/**
 * Blueprint data model — the single source of truth for every 3D object in
 * Spaceflight Academy. The game, the in-game Blueprint Studio, the hangar part
 * thumbnails and the printable blueprint book are all generated from these specs.
 *
 * Conventions
 *  - Units are metres. Y is up. The model's FRONT faces +Z.
 *  - Width is X, height is Y, depth is Z. The origin is the centre of the base
 *    (y = 0 is the ground / attach plane) unless the blueprint says otherwise.
 *  - Rotations are in degrees (XYZ order).
 */
export type Vec3 = readonly [number, number, number];
export type Vec2 = readonly [number, number];

export type Shape =
  | { kind: "box"; size: Vec3; radius?: number; seg?: number }
  | { kind: "cyl"; rTop: number; rBot: number; h: number; seg?: number; open?: boolean; thetaStart?: number; thetaLength?: number }
  | { kind: "sphere"; r: number; seg?: number; phiStart?: number; phiLength?: number; thetaStart?: number; thetaLength?: number }
  | { kind: "capsule"; r: number; len: number; seg?: number }
  | { kind: "torus"; R: number; r: number; arc?: number; seg?: number; tube?: number }
  | { kind: "lathe"; profile: readonly Vec2[]; seg?: number; phiStart?: number; phiLength?: number }
  | { kind: "extrude"; outline: readonly Vec2[]; depth: number; bevel?: number; curveSeg?: number }
  | { kind: "tube"; path: readonly Vec3[]; r: number; seg?: number; radial?: number; closed?: boolean }
  | { kind: "plane"; size: Vec2 }
  | { kind: "disc"; r: number; inner?: number; seg?: number }
  | { kind: "label"; text: string; size: Vec2; fg?: string; bg?: string; weight?: number; border?: string }
  /** Many spheres merged into one mesh (curly hair, clouds, smoke, rock clusters). [x, y, z, r, sy?] */
  | { kind: "cluster"; balls: readonly (readonly number[])[]; seg?: number };

export interface MatSpec {
  color: string;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  flat?: boolean;
  doubleSide?: boolean;
  /** Not drawn as a solid in blueprint line-art (glass, glow, effects). */
  ghost?: boolean;
}

export interface Part {
  id: string;
  /** Name shown in callouts and the parts list. Omit for unlisted detail pieces. */
  name?: string;
  shape?: Shape;
  /** Reference another blueprint (reused as a sub-assembly). */
  ref?: string;
  mat?: string;
  at?: Vec3;
  rot?: Vec3;
  scale?: Vec3;
  /** Adds a copy mirrored across the YZ plane (x → -x). */
  mirrorX?: boolean;
  /** Replicates the part `count` times around the Y axis. */
  radial?: { count: number; offsetDeg?: number };
  children?: readonly Part[];
  /** Marks the node as a rig pivot (characters, robot arms, doors...). */
  joint?: string;
  /** Offset used by exploded views (metres). */
  explode?: Vec3;
  hidden?: boolean;
  tag?: string;
  /** Effects (flames, glows) are excluded from dimensions and line-art. */
  fx?: boolean;
  noShadow?: boolean;
}

export type BlueprintCategory = "cast" | "vehicle" | "system" | "spaceport" | "destination";

export type ViewName = "front" | "back" | "left" | "right" | "top" | "bottom" | "iso";

export interface Blueprint {
  id: string;
  name: string;
  category: BlueprintCategory;
  /** Short role line, e.g. "Cadet · Star Scout". */
  subtitle: string;
  /** Kid-friendly description used in the Blueprint Studio and the book. */
  description: string;
  /** Declared overall size in metres (tests fail if the model drifts > 1.5 cm). */
  overall: { w: number; h: number; d: number };
  parts: readonly Part[];
  materials?: Readonly<Record<string, MatSpec>>;
  facts?: readonly string[];
  /** Blueprint sheet options. */
  sheet?: { exploded?: boolean; notes?: readonly string[]; scale?: string };
  rig?: "cadet" | "robot";
  /** Sheet number in the blueprint book, e.g. "C-01". */
  code: string;
}

export const ALL_VIEWS: readonly ViewName[] = ["front", "back", "left", "right", "top", "bottom", "iso"];
