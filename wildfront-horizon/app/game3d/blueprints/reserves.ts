// M-series blueprints: the five reserves. Terrain, water, trails, cover and
// need-zones are authored here as plan-view data; the terrain generator turns
// them into the heightfield the game, the minimap and the printed topo sheets use.
// Frame: +X east, −Z north. Units metres.

import { hex } from "../core/color.ts";
import type { RGB } from "./types.ts";

export type ReserveId = "aurora-pines" | "crimson-highlands" | "verdant-basin" | "obsidian-steppe" | "horizon-crossing";
export type XZ = [number, number];

export type TerrainFeature =
  | { kind: "lake"; x: number; z: number; rx: number; rz: number; rot?: number; depth: number; name?: string }
  | { kind: "river"; pts: XZ[]; width: number; depth: number; name?: string }
  | { kind: "canyon"; pts: XZ[]; width: number; depth: number; terraces: number; name?: string }
  | { kind: "ridge"; pts: XZ[]; width: number; height: number; name?: string }
  | { kind: "hill"; x: number; z: number; r: number; h: number; name?: string }
  | { kind: "mesa"; x: number; z: number; r: number; h: number; name?: string }
  | { kind: "cone"; x: number; z: number; r: number; h: number; crater?: number; name?: string }
  | { kind: "flat"; x: number; z: number; r: number; strength?: number; name?: string }
  | { kind: "trail"; pts: XZ[]; width: number };

export interface Biome {
  id: string;
  name: string;
  grass: RGB; dry: RGB; dirt: RGB; rock: RGB; sand: RGB; snow: RGB;
  forest: number;            // forest cover 0..1
  flora: Record<string, number>; // tree / shrub blueprint id → relative weight
  shrubs: number;            // shrub density
  rocks: number;             // boulder density
  grassDensity: number;      // ground grass density
  grassHeight: number;
  flowers: RGB[];
  snowLine: number;          // height (m) above which snow lies in any weather
}

export type LandmarkKind = "lookout-tower" | "tree-stand" | "ground-blind" | "cabin" | "kiosk" | "truck" | "footbridge" | "fence" | "ranger-station";
export interface Landmark { kind: LandmarkKind; x: number; z: number; rot: number; name?: string }

export interface NeedZone { kind: "feed" | "water" | "bed"; x: number; z: number; r: number; species?: string[] }

export interface ReserveDef {
  id: ReserveId;
  name: string;                // matches mission data ("Aurora Pines" …)
  drawing: string;             // M-01 …
  tagline: string;
  seed: number;
  size: number;                // terrain square side (m); play boundary is size/2 − 50
  relief: { hills: number; detail: number; ridged: number; edgeRise: number; scale: number };
  features: TerrainFeature[];
  biomes: Biome[];
  /** biome weights by position (single-biome reserves return [1]) */
  biomeMode: "single" | "quadrants";
  /** spawn point; the hunter faces `look` (defaults to the reserve centre) */
  spawn: { x: number; z: number; yaw: number; look?: XZ };
  landmarks: Landmark[];
  zones: NeedZone[];
  fauna: string[];             // species names native to the reserve
  backdrop: { peaks: number; height: number; snow: boolean; color: RGB };
  sky: { tint: RGB; haze: number };
}

const B_PINES: Biome = {
  id: "alpine-pine", name: "Alpine pine forest",
  grass: hex("#4f6b35"), dry: hex("#8f8a4c"), dirt: hex("#6b5a43"), rock: hex("#706e68"), sand: hex("#9c8f74"), snow: hex("#eef3f7"),
  forest: 0.55, flora: { "lodgepole-pine": 5, "engelmann-spruce": 4, "quaking-aspen": 1.2, "dead-snag": 0.5 },
  shrubs: 0.5, rocks: 0.6, grassDensity: 0.75, grassHeight: 0.55, flowers: [hex("#e8d14a"), hex("#c45ab8"), hex("#f0f0f0")], snowLine: 85,
};
const B_HIGHLAND: Biome = {
  id: "red-highland", name: "Red sandstone highland",
  grass: hex("#6d6638"), dry: hex("#9a8550"), dirt: hex("#7a4a32"), rock: hex("#94503c"), sand: hex("#b08a64"), snow: hex("#f2eeea"),
  forest: 0.22, flora: { "scots-pine": 4, "silver-birch": 2, "dead-snag": 0.6 },
  shrubs: 1.0, rocks: 1.0, grassDensity: 0.7, grassHeight: 0.45, flowers: [hex("#8e4a8a"), hex("#b8628c"), hex("#e3c050")], snowLine: 120,
};
const B_BASIN: Biome = {
  id: "river-basin", name: "Verdant river basin",
  grass: hex("#3e6a2c"), dry: hex("#7a8a42"), dirt: hex("#5a4a36"), rock: hex("#6a6a5e"), sand: hex("#8e8064"), snow: hex("#eef3f7"),
  forest: 0.5, flora: { "bur-oak": 4, "quaking-aspen": 2.5, "engelmann-spruce": 1, "willow": 1.2 },
  shrubs: 0.8, rocks: 0.35, grassDensity: 1.0, grassHeight: 0.7, flowers: [hex("#f2e65a"), hex("#e86a5a"), hex("#ffffff"), hex("#7a8cf0")], snowLine: 999,
};
const B_STEPPE: Biome = {
  id: "obsidian-steppe", name: "Obsidian steppe",
  grass: hex("#8a7f46"), dry: hex("#b0a060"), dirt: hex("#5c5246"), rock: hex("#2e2c2c"), sand: hex("#7a6e5a"), snow: hex("#eceff2"),
  forest: 0.04, flora: { "rocky-juniper": 3, "dead-snag": 0.4 },
  shrubs: 1.2, rocks: 0.5, grassDensity: 0.95, grassHeight: 0.6, flowers: [hex("#e8c04a"), hex("#d8d8d0")], snowLine: 999,
};

export const RESERVES: Record<ReserveId, ReserveDef> = {
  "aurora-pines": {
    id: "aurora-pines", name: "Aurora Pines", drawing: "M-01", tagline: "Alpine lake, lodgepole timber and high meadows",
    seed: 1101, size: 800,
    relief: { hills: 24, detail: 4.5, ridged: 0.35, edgeRise: 55, scale: 330 },
    features: [
      { kind: "lake", x: -95, z: -30, rx: 125, rz: 78, rot: 0.3, depth: 10, name: "Aurora Lake" },
      { kind: "hill", x: 185, z: 115, r: 140, h: 30, name: "Lookout Knob" },
      { kind: "hill", x: -235, z: 215, r: 120, h: 20 },
      { kind: "ridge", pts: [[-330, -300], [-150, -330], [60, -320]], width: 110, height: 26, name: "North Ridge" },
      { kind: "flat", x: 40, z: -175, r: 75, name: "Elk Meadow" },
      { kind: "flat", x: -215, z: -165, r: 62, name: "Fox Meadow" },
      { kind: "flat", x: 150, z: -75, r: 50 },
      { kind: "flat", x: 255, z: 285, r: 35, strength: 0.9, name: "Trailhead" },
      { kind: "trail", pts: [[255, 285], [195, 170], [95, 45], [45, -110], [-55, -185], [-200, -175]], width: 3 },
      { kind: "trail", pts: [[95, 45], [-15, 75], [-160, 75], [-235, 10]], width: 2.5 },
      { kind: "trail", pts: [[195, 170], [190, 118]], width: 2.2 },
    ],
    biomes: [B_PINES], biomeMode: "single",
    spawn: { x: 252, z: 280, yaw: 0, look: [-95, -30] },
    landmarks: [
      { kind: "truck", x: 266, z: 292, rot: 2.3 }, { kind: "kiosk", x: 246, z: 272, rot: 2.6 },
      { kind: "lookout-tower", x: 190, z: 112, rot: 0.4, name: "Aurora Lookout" },
      { kind: "tree-stand", x: 75, z: -128, rot: 2.4 }, { kind: "tree-stand", x: -172, z: -132, rot: -2.6 },
      { kind: "ground-blind", x: 128, z: -52, rot: 1.9 }, { kind: "cabin", x: -40, z: 168, rot: 0.2, name: "Trapper's Cabin" },
    ],
    zones: [
      { kind: "feed", x: 40, z: -175, r: 70 }, { kind: "feed", x: -215, z: -165, r: 55 }, { kind: "feed", x: 150, z: -75, r: 45 },
      { kind: "water", x: -10, z: 5, r: 30 }, { kind: "water", x: -170, z: -60, r: 30 }, { kind: "water", x: -95, z: 45, r: 25 },
      { kind: "bed", x: -60, z: -255, r: 50 }, { kind: "bed", x: 120, z: -235, r: 50 }, { kind: "bed", x: -290, z: -60, r: 45 }, { kind: "bed", x: 60, z: 160, r: 45 },
    ],
    fauna: ["Mule Deer", "Elk", "Wild Boar"],
    backdrop: { peaks: 26, height: 520, snow: true, color: hex("#6c7f94") },
    sky: { tint: hex("#7fb0d8"), haze: 1.0 },
  },
  "crimson-highlands": {
    id: "crimson-highlands", name: "Crimson Highlands", drawing: "M-02", tagline: "Red sandstone ridges, heather moor and a deep canyon",
    seed: 2203, size: 800,
    relief: { hills: 30, detail: 5.5, ridged: 0.8, edgeRise: 60, scale: 300 },
    features: [
      { kind: "canyon", pts: [[-330, -420], [-140, -160], [-70, 50], [30, 420]], width: 62, depth: 30, terraces: 4, name: "Ember Canyon" },
      { kind: "ridge", pts: [[90, -310], [210, -180], [320, -40]], width: 90, height: 34, name: "Sunset Ridge" },
      { kind: "ridge", pts: [[-330, 250], [-200, 330]], width: 80, height: 24 },
      { kind: "lake", x: 185, z: 165, rx: 46, rz: 38, rot: 0.6, depth: 5, name: "Crimson Tarn" },
      { kind: "flat", x: 195, z: -20, r: 80, name: "Heather Moor" },
      { kind: "flat", x: -235, z: 110, r: 70, name: "Stag Flats" },
      { kind: "flat", x: 300, z: 300, r: 32, strength: 0.9, name: "Trailhead" },
      { kind: "trail", pts: [[300, 300], [230, 220], [190, 80], [195, -20], [120, -120], [10, -150]], width: 3 },
      { kind: "trail", pts: [[190, 80], [60, 140], [-40, 120], [-235, 110]], width: 2.5 },
    ],
    biomes: [B_HIGHLAND], biomeMode: "single",
    spawn: { x: 296, z: 296, yaw: 0, look: [0, -60] },
    landmarks: [
      { kind: "truck", x: 312, z: 306, rot: 2.2 }, { kind: "kiosk", x: 290, z: 286, rot: 2.5 },
      { kind: "lookout-tower", x: 225, z: -185, rot: 1.1, name: "Ridge Lookout" },
      { kind: "tree-stand", x: -198, z: 140, rot: -1.8 }, { kind: "ground-blind", x: 160, z: 20, rot: 2.8 },
      { kind: "cabin", x: 40, z: 230, rot: -0.3, name: "Shepherd's Bothy" },
    ],
    zones: [
      { kind: "feed", x: 195, z: -20, r: 75 }, { kind: "feed", x: -235, z: 110, r: 65 }, { kind: "feed", x: -40, z: -250, r: 60 },
      { kind: "water", x: 185, z: 165, r: 40 }, { kind: "water", x: -95, z: -40, r: 25, species: ["Bighorn Sheep"] },
      { kind: "bed", x: 260, z: -160, r: 50, species: ["Bighorn Sheep"] }, { kind: "bed", x: -270, z: 280, r: 45 }, { kind: "bed", x: 30, z: -300, r: 50 },
    ],
    fauna: ["Red Deer", "Elk", "Bighorn Sheep"],
    backdrop: { peaks: 22, height: 360, snow: false, color: hex("#7a5a5e") },
    sky: { tint: hex("#d89a8a"), haze: 1.15 },
  },
  "verdant-basin": {
    id: "verdant-basin", name: "Verdant Basin", drawing: "M-03", tagline: "River bottoms, oak woods and reedy wetlands",
    seed: 3307, size: 800,
    relief: { hills: 16, detail: 3.2, ridged: 0.2, edgeRise: 45, scale: 360 },
    features: [
      { kind: "river", pts: [[-420, -250], [-220, -110], [-40, -55], [120, 20], [260, 110], [420, 190]], width: 20, depth: 2.6, name: "Verdant River" },
      { kind: "lake", x: -150, z: 170, rx: 72, rz: 55, rot: -0.4, depth: 3.5, name: "Heron Marsh" },
      { kind: "hill", x: 210, z: -210, r: 130, h: 18 },
      { kind: "hill", x: -260, z: -300, r: 120, h: 22 },
      { kind: "flat", x: 95, z: -195, r: 90, name: "Clover Bottom" },
      { kind: "flat", x: 225, z: 265, r: 72, name: "Long Meadow" },
      { kind: "flat", x: 315, z: -315, r: 32, strength: 0.9, name: "Trailhead" },
      { kind: "trail", pts: [[315, -315], [230, -230], [130, -120], [70, -10], [20, 90], [-60, 150]], width: 3 },
      { kind: "trail", pts: [[130, -120], [230, 40], [225, 265]], width: 2.5 },
    ],
    biomes: [B_BASIN], biomeMode: "single",
    spawn: { x: 310, z: -312, yaw: 0, look: [60, -20] },
    landmarks: [
      { kind: "truck", x: 326, z: -322, rot: -0.8 }, { kind: "kiosk", x: 300, z: -300, rot: -0.6 },
      { kind: "footbridge", x: 68, z: -5, rot: 0.5, name: "Mill Bridge" },
      { kind: "tree-stand", x: 60, z: -232, rot: 0.9 }, { kind: "ground-blind", x: -95, z: 120, rot: 2.6 },
      { kind: "tree-stand", x: 200, z: 225, rot: 0.6 }, { kind: "cabin", x: -260, z: -40, rot: 1.4, name: "Old Mill" },
    ],
    zones: [
      { kind: "feed", x: 95, z: -195, r: 85 }, { kind: "feed", x: 225, z: 265, r: 65 }, { kind: "feed", x: -280, z: 60, r: 55 },
      { kind: "water", x: -40, z: -55, r: 30 }, { kind: "water", x: 200, z: 70, r: 30 }, { kind: "water", x: -150, z: 170, r: 45 },
      { kind: "bed", x: -230, z: 300, r: 55 }, { kind: "bed", x: 40, z: 280, r: 50 }, { kind: "bed", x: -300, z: -200, r: 45 },
    ],
    fauna: ["Mule Deer", "Wild Boar", "Red Deer"],
    backdrop: { peaks: 20, height: 260, snow: false, color: hex("#5f7a72") },
    sky: { tint: hex("#8cc0c8"), haze: 1.05 },
  },
  "obsidian-steppe": {
    id: "obsidian-steppe", name: "Obsidian Steppe", drawing: "M-04", tagline: "Golden grass plains under black volcanic cones",
    seed: 4409, size: 800,
    relief: { hills: 12, detail: 2.4, ridged: 0.15, edgeRise: 35, scale: 420 },
    features: [
      { kind: "cone", x: -150, z: -185, r: 95, h: 42, crater: 0.3, name: "Cinder Cone" },
      { kind: "cone", x: 225, z: -70, r: 62, h: 26, crater: 0.25, name: "Ash Butte" },
      { kind: "mesa", x: -215, z: 215, r: 105, h: 22, name: "Black Table" },
      { kind: "ridge", pts: [[60, -340], [120, -250], [130, -170]], width: 40, height: 9, name: "Lava Dike" },
      { kind: "lake", x: 55, z: 110, rx: 42, rz: 34, rot: 0.2, depth: 2.2, name: "Bison Wallow Hole" },
      { kind: "flat", x: 40, z: -60, r: 140, strength: 0.6, name: "Thunder Flats" },
      { kind: "flat", x: 305, z: 320, r: 32, strength: 0.9, name: "Trailhead" },
      { kind: "trail", pts: [[305, 320], [230, 230], [130, 130], [40, -60], [-80, -190]], width: 3 },
    ],
    biomes: [B_STEPPE], biomeMode: "single",
    spawn: { x: 300, z: 316, yaw: 0, look: [-100, -120] },
    landmarks: [
      { kind: "truck", x: 316, z: 330, rot: 2.3 }, { kind: "kiosk", x: 292, z: 306, rot: 2.6 },
      { kind: "lookout-tower", x: 120, z: 240, rot: 0.3, name: "Plains Lookout" },
      { kind: "ground-blind", x: 90, z: 70, rot: 2.2 }, { kind: "fence", x: 150, z: 180, rot: 0.8 },
      { kind: "cabin", x: -60, z: 300, rot: 0.1, name: "Homestead" },
    ],
    zones: [
      { kind: "feed", x: 40, z: -60, r: 120 }, { kind: "feed", x: 200, z: 120, r: 70 }, { kind: "feed", x: -40, z: 180, r: 70 },
      { kind: "water", x: 55, z: 110, r: 40 },
      { kind: "bed", x: -150, z: -185, r: 60, species: ["Bighorn Sheep"] }, { kind: "bed", x: -215, z: 215, r: 70, species: ["Bighorn Sheep"] }, { kind: "bed", x: 250, z: -230, r: 70 },
    ],
    fauna: ["Bison", "Bighorn Sheep"],
    backdrop: { peaks: 16, height: 300, snow: true, color: hex("#6d6f80") },
    sky: { tint: hex("#9ec0e4"), haze: 0.9 },
  },
  "horizon-crossing": {
    id: "horizon-crossing", name: "Horizon Crossing", drawing: "M-05", tagline: "Where all four reserves meet — the Grand Slam ground",
    seed: 5501, size: 800,
    relief: { hills: 22, detail: 4, ridged: 0.45, edgeRise: 50, scale: 340 },
    features: [
      { kind: "lake", x: -175, z: -165, rx: 85, rz: 60, rot: 0.4, depth: 8, name: "Pine Lake" },
      { kind: "ridge", pts: [[90, -330], [250, -200], [330, -80]], width: 90, height: 30, name: "Crimson Spur" },
      { kind: "river", pts: [[-420, 120], [-250, 170], [-120, 250], [-40, 420]], width: 16, depth: 2.2, name: "Basin Creek" },
      { kind: "cone", x: 210, z: 210, r: 80, h: 32, crater: 0.28, name: "Obsidian Cone" },
      { kind: "flat", x: 0, z: 20, r: 60, strength: 0.95, name: "Crossing" },
      { kind: "flat", x: -150, z: -40, r: 55 }, { kind: "flat", x: 150, z: -40, r: 55 }, { kind: "flat", x: 60, z: 160, r: 60 }, { kind: "flat", x: -160, z: 60, r: 50 },
      { kind: "trail", pts: [[0, 20], [-150, -40], [-260, -110]], width: 3 },
      { kind: "trail", pts: [[0, 20], [150, -40], [230, -150]], width: 3 },
      { kind: "trail", pts: [[0, 20], [60, 160], [140, 280]], width: 3 },
      { kind: "trail", pts: [[0, 20], [-160, 60], [-260, 260]], width: 3 },
    ],
    biomes: [B_PINES, B_HIGHLAND, B_BASIN, B_STEPPE], biomeMode: "quadrants",
    spawn: { x: 6, z: 34, yaw: 0, look: [-175, -165] },
    landmarks: [
      { kind: "ranger-station", x: 18, z: 38, rot: 0.0, name: "Horizon Ranger Station" }, { kind: "truck", x: -14, z: 40, rot: 1.2 },
      { kind: "kiosk", x: -4, z: 18, rot: 0 }, { kind: "lookout-tower", x: 255, z: -170, rot: 0.5, name: "Spur Lookout" },
      { kind: "tree-stand", x: -150, z: -80, rot: 0.3 }, { kind: "ground-blind", x: 120, z: 150, rot: -2.4 },
      { kind: "footbridge", x: -205, z: 190, rot: 2.1 },
    ],
    zones: [
      { kind: "feed", x: -150, z: -40, r: 55 }, { kind: "feed", x: 150, z: -40, r: 55 }, { kind: "feed", x: 60, z: 160, r: 60 }, { kind: "feed", x: -160, z: 60, r: 50 },
      { kind: "water", x: -110, z: -150, r: 30 }, { kind: "water", x: -180, z: 200, r: 30 },
      { kind: "bed", x: -280, z: -280, r: 50 }, { kind: "bed", x: 280, z: -280, r: 50, species: ["Bighorn Sheep", "Red Deer", "Elk"] }, { kind: "bed", x: -280, z: 300, r: 50 }, { kind: "bed", x: 280, z: 300, r: 50 },
    ],
    fauna: ["Mule Deer", "Wild Boar", "Elk", "Red Deer", "Bighorn Sheep", "Bison"],
    backdrop: { peaks: 24, height: 440, snow: true, color: hex("#76788e") },
    sky: { tint: hex("#a6a0d8"), haze: 1.0 },
  },
};

/** Mission data uses display names; "All Reserves" is the Grand Slam ground. */
export function reserveByName(name: string): ReserveDef {
  for (const r of Object.values(RESERVES)) if (r.name === name) return r;
  return RESERVES["horizon-crossing"];
}

/** Quadrant biome weights (NW pines, NE highland, SW basin, SE steppe) blended over ±90 m. */
export function biomeWeights(def: ReserveDef, x: number, z: number): number[] {
  if (def.biomeMode === "single") return [1];
  const sx = 1 / (1 + Math.exp(-x / 45));      // 0 west … 1 east
  const sz = 1 / (1 + Math.exp(-z / 45));      // 0 north … 1 south
  return [(1 - sx) * (1 - sz), sx * (1 - sz), (1 - sx) * sz, sx * sz];
}

/** Yaw (camera convention: forward = (−sin ψ, 0, −cos ψ)) facing from the spawn toward its look target. */
export function spawnYaw(def: ReserveDef): number {
  const [lx, lz] = def.spawn.look ?? [0, 0];
  const fx = lx - def.spawn.x, fz = lz - def.spawn.z;
  return Math.atan2(-fx, -fz);
}
