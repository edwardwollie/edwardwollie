// Wildfront Horizon 3.0 — blueprint schema.
// Every 3D model in the game, the in-game Blueprint Studio and the printed
// blueprint book are generated from data shaped by these types.
// Units: metres, radians, kilograms. Model space: +Z forward (head / muzzle),
// +Y up, +X = the subject's left side. Origin on the ground plane.

export type V2 = [number, number];
export type V3 = [number, number, number];
/** sRGB colour components 0..1 */
export type RGB = [number, number, number];

export type BlueprintCategory = "wildlife" | "gear" | "structure" | "vehicle" | "flora" | "sign" | "map";

export interface PartSpec { id: string; name: string; material: string; qty: number; note?: string }

export interface BlueprintMeta {
  id: string;
  drawing: string;           // drawing number, e.g. "A-01"
  title: string;
  subtitle?: string;
  category: BlueprintCategory;
  rev: string;
  scale: string;             // nominal print scale for the A3 sheet, e.g. "1:10"
  /** Bounding box of the reference build (metres). length = Z, width = X, height = Y. Kept in sync by tests. */
  overall: { length: number; width: number; height: number };
  notes: string[];
  parts?: PartSpec[];
}

// ---------------------------------------------------------------- wildlife

export type Zone = "head" | "neck" | "torso" | "leg" | "tail" | "antler";
export const ZONE_IDS: Record<Zone, number> = { head: 1, neck: 2, torso: 3, leg: 4, tail: 5, antler: 6 };
export const ZONE_BY_ID: Zone[] = ["torso", "head", "neck", "torso", "leg", "tail", "antler"];

export interface BoneSpec { name: string; parent: string | null; p: V3 }

/** One station of the body loft: centreline point in side elevation (z, y) and the section half-sizes. */
export interface LoftKey {
  p: V2;
  w: number;            // half width (plan view)
  up: number;           // half height above centreline (dorsal)
  dn: number;           // half height below centreline (ventral)
  n?: number;           // superellipse exponent; 2 = ellipse, >2 boxier
  /** section tilt: centreline angle in the side plane (rad, 0 = forward, +up). Defaults to the smoothed tangent. */
  a?: number;
  bone: string;
  zone: Zone;
}

export interface LegJoint { p: V3; r: number; rz?: number }
export interface LegSpec {
  id: "F" | "H";        // fore / hind (left side; right side is mirrored)
  parent: string;       // bone the leg hangs from
  joints: LegJoint[];   // top (inside body) → ground contact
  bones: string[];      // base names per segment; "L"/"R" suffix added
  hoof: { len: number; w: number; h: number; split: boolean; dewclaw: boolean; color: RGB };
}

export interface EarSpec { base: V3; dir: V3; len: number; wid: number; cup: number; outer: RGB; inner: RGB; tip?: RGB }
export interface EyeSpec { p: V3; r: number }

/** A tapered tube along a smoothed polyline (antler tines, horns, tusks, tails, beards). */
export interface TubeSpec { pts: V3[]; r0: number; r1: number; ridge?: number; ridgeFreq?: number; flat?: number; burr?: number; minAge?: number; colorBase: RGB; colorTip: RGB }

export interface AntlerSpec {
  kind: "antler" | "horn" | "tusk" | "palm";
  bone: string;
  base: V3;                  // left-side base point (model space)
  tubes: TubeSpec[];         // in the antler's local frame: x = outward, y = up, z = forward, origin at base
  palm?: { pts: V2[]; thick: number; tilt: number; yaw: number; at: V3; color: RGB };
  /** Rotations applied to the local frame (outward splay / backward rake). */
  splay: number;
  rake: number;
}

export type PaintRule =
  | { kind: "ellipsoid"; center: V3; radii: V3; color: RGB; soft?: number; mirror?: boolean; zones?: Zone[]; amount?: number }
  | { kind: "ventral"; threshold: number; color: RGB; soft?: number; zones?: Zone[]; amount?: number }
  | { kind: "dorsal"; threshold: number; color: RGB; soft?: number; zones?: Zone[]; amount?: number }
  | { kind: "below"; y: number; color: RGB; soft?: number; zones?: Zone[]; amount?: number }
  | { kind: "above"; y: number; color: RGB; soft?: number; zones?: Zone[]; amount?: number }
  | { kind: "zBand"; z0: number; z1: number; color: RGB; soft?: number; zones?: Zone[]; amount?: number }
  | { kind: "zone"; zones: Zone[]; color: RGB; amount?: number }
  | { kind: "inner"; color: RGB; amount?: number } // inside faces of legs
  | { kind: "facing"; dir: V3; threshold: number; color: RGB; soft?: number; zones?: Zone[]; amount?: number };

export interface CoatSpec { base: RGB; rules: PaintRule[]; mottle: number; mottleScale: number }

export type OrganId = "brain" | "heart" | "lungs" | "liver" | "stomach" | "spine";
export interface OrganSpec { id: OrganId; bone: string; c: V3; r: V3; lethal: "vital" | "slow" | "none" }

export interface GaitSpec {
  walk: { speed: number; stride: number };
  trot: { speed: number; stride: number };
  gallop: { speed: number; stride: number };
  flee: number;              // sustained flee speed m/s
  stot?: boolean;            // mule-deer pronk when alarmed
  swing: number;             // leg swing amplitude (rad) at walk
  bob: number;               // body bob (m) at gallop
}

export interface SenseSpec {
  sight: number;             // metres at which a standing, moving hunter is detected in the open
  hearing: number;           // multiplier on hunter noise radius
  smell: number;             // scent detection distance downwind (m) in moderate wind
  wariness: number;          // 0..1 — how quickly awareness builds
  herd: [number, number];    // group size range
  group: string;             // herd / sounder / band …
  fleeDistance: [number, number];
}

export interface TrophySpec {
  measure: "antler" | "horn" | "tusk" | "weight";
  unit: string;              // "pts" (score points) / "cm"
  /** score ranges at age class 0..1 for males; females use weight. */
  maleScore: [number, number];
  tiers: { bronze: number; silver: number; gold: number; diamond: number };
  weightMale: [number, number];
  weightFemale: [number, number];
}

export interface TrackSpec {
  length: number; width: number;           // cm
  shape: "heart" | "round" | "blocky" | "boar" | "bison" | "pointed";
  dewclaws: boolean;
  stride: number;                          // walking step length (m)
  straddle: number;                        // trail width (m)
  dropping: { kind: "pellets" | "pile" | "pat" | "log"; size: number };
}

export interface SpeciesFacts {
  latin: string; family: string; range: string; habitat: string; diet: string;
  lifespan: string; topSpeed: string; shoulder: string; weight: string;
  senses: string; season: string; call: string; notes: string[];
}

export interface AnimalBlueprint extends BlueprintMeta {
  category: "wildlife";
  species: string;               // display species name used by missions ("Mule Deer")
  maleName: string; femaleName: string;
  femaleScale: number;           // uniform scale applied to the female build
  femaleHasHeadgear: boolean;    // bison & bighorn ewes carry (smaller) horns
  bones: BoneSpec[];
  body: LoftKey[];
  tail: { keys: LoftKey[]; color?: RGB; tip?: RGB };
  legs: LegSpec[];
  ears: EarSpec;
  eyes: EyeSpec;
  nose: { p: V3; r: V3; color: RGB };
  headgear: AntlerSpec[];        // left side only; mirrored at build time
  headgearFemale?: AntlerSpec[];
  /** Extra lofts on the centre line: beards, bristle crests, dewlaps. */
  appendages?: { name: string; keys: LoftKey[]; color?: RGB; segs?: number }[];
  coat: CoatSpec;
  coatFemale?: Partial<CoatSpec>;
  organs: OrganSpec[];
  /** Generous GREAT region (upper torso/shoulder) used by the v2.0.3 grading rule. */
  vitalRegion: { bone: string; c: V3; r: V3 };
  gait: GaitSpec;
  senses: SenseSpec;
  trophy: TrophySpec;
  track: TrackSpec;
  facts: SpeciesFacts;
  callName: string;
}

export interface AnimalVariant {
  sex: "male" | "female";
  /** 0 = young adult, 1 = prime mature — scales headgear and body mass. */
  age: number;
  seed: number;
  scale?: number;
}
