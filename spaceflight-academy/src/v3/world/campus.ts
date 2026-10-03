import { STUDIO_ENABLED } from "../app/features.ts";

/**
 * Spaceport campus layout (metres). X = east, Z = south, the camera starts south of
 * Academy Plaza looking north. Every building's front faces the plaza.
 */
export interface RectCollider { kind: "rect"; cx: number; cz: number; w: number; d: number }
export interface CircleCollider { kind: "circle"; cx: number; cz: number; r: number }
export type Collider = RectCollider | CircleCollider;

export interface StationDef {
  id: string;
  label: string;
  icon: string;
  /** Pad position in the building's local space. */
  pad: [number, number];
}

export interface BuildingPlacement {
  id: string;
  blueprint: string;
  x: number;
  z: number;
  /** Yaw in degrees. */
  rot: number;
  colliders: Collider[];
  station?: StationDef;
}

const faceOrigin = (x: number, z: number) => (Math.atan2(-x, -z) * 180) / Math.PI;

export const BUILDINGS: readonly BuildingPlacement[] = [
  { id: "plaza", blueprint: "academy-plaza", x: 0, z: 0, rot: 0, colliders: [{ kind: "circle", cx: 0, cz: 0, r: 5.2 }] },
  {
    id: "mission-control", blueprint: "mission-control", x: 0, z: -44, rot: 0,
    colliders: [{ kind: "rect", cx: 0, cz: 0, w: 22.6, d: 14.6 }],
    station: { id: "mission-control", label: "Mission Control", icon: "🛰️", pad: [0, 13.2] },
  },
  {
    id: "rocket-hangar", blueprint: "rocket-hangar", x: -50, z: -20, rot: faceOrigin(-50, -20),
    colliders: [{ kind: "rect", cx: 0, cz: 0, w: 28.4, d: 22.6 }, { kind: "rect", cx: 19, cz: -1.5, w: 10.4, d: 16.4 }],
    station: { id: "rocket-hangar", label: "Rocket Hangar", icon: "🔧", pad: [0, 15.5] },
  },
  {
    id: "launch-complex", blueprint: "launch-complex", x: 52, z: -84, rot: faceOrigin(52, -84),
    colliders: [{ kind: "circle", cx: 0, cz: 0, r: 13.8 }, { kind: "circle", cx: 13.4, cz: 10.4, r: 3.2 }, { kind: "circle", cx: 12.6, cz: -9.5, r: 1 }, { kind: "circle", cx: -12.6, cz: -9.5, r: 1 }],
    station: { id: "launch-complex", label: "Launch Pad", icon: "🚀", pad: [0, 17] },
  },
  {
    id: "observatory", blueprint: "observatory", x: 48, z: 14, rot: faceOrigin(48, 14),
    colliders: [{ kind: "circle", cx: 0, cz: 0, r: 7.4 }],
    station: { id: "observatory", label: "Star Observatory", icon: "🔭", pad: [0, 10.8] },
  },
  {
    id: "training-center", blueprint: "training-center", x: -48, z: 30, rot: faceOrigin(-48, 30),
    colliders: [{ kind: "rect", cx: -7, cz: 0, w: 18.6, d: 12.6 }, { kind: "circle", cx: 9.3, cz: 0, r: 7.1 }],
    station: { id: "training-center", label: "Training Center", icon: "🧑‍🚀", pad: [-7, 9.4] },
  },
  {
    id: "family-lab", blueprint: "family-lab", x: 16, z: 50, rot: faceOrigin(16, 50),
    colliders: [{ kind: "rect", cx: 0, cz: 0, w: 12.8, d: 9.8 }, { kind: "circle", cx: 5, cz: 9, r: 2.4 }],
    station: { id: "family-lab", label: "Family Space Lab", icon: "🎈", pad: [2.5, 7.4] },
  },
  // Internal only: the Blueprint Studio building is left out of production builds.
  ...(STUDIO_ENABLED ? [{
    id: "blueprint-studio", blueprint: "blueprint-studio", x: -16, z: 52, rot: faceOrigin(-16, 52),
    colliders: [{ kind: "rect" as const, cx: 0, cz: 0, w: 14.8, d: 12.8 }],
    station: { id: "blueprint-studio", label: "Blueprint Studio", icon: "📐", pad: [0, 9.6] as [number, number] },
  }] : []),
];

/** Planet Walk: a true-distance scale model of the solar system (2.15 m per AU). */
export const AU_SCALE = 2.15;
export const PLANET_WALK_START = 14;
export interface WalkStop { id: string; name: string; au: number; size: number; color: string; fact: string }
export const PLANET_WALK: readonly WalkStop[] = [
  { id: "sun", name: "The Sun", au: 0, size: 0.9, color: "#ffc93d", fact: "Start of the Planet Walk! Every step east is a real distance in space, shrunk down. One metre here is about 70 million kilometres!" },
  { id: "mercury", name: "Mercury", au: 0.39, size: 0.12, color: "#a9a19a", fact: "Mercury is closest to the Sun. Notice how close the first four planets are to each other!" },
  { id: "venus", name: "Venus", au: 0.72, size: 0.2, color: "#e8c27a", fact: "Venus is the hottest planet because its thick clouds trap heat like a blanket." },
  { id: "earth", name: "Earth", au: 1.0, size: 0.21, color: "#3f8fe8", fact: "Earth! The distance from the Sun to Earth is called one astronomical unit, or 1 AU." },
  { id: "mars", name: "Mars", au: 1.52, size: 0.16, color: "#d4643a", fact: "Mars is one and a half times as far from the Sun as Earth. The rocky planets end here." },
  { id: "jupiter", name: "Jupiter", au: 5.2, size: 0.55, color: "#d9b38c", fact: "A big jump to Jupiter! The giant planets are much farther apart than the rocky ones." },
  { id: "saturn", name: "Saturn", au: 9.58, size: 0.48, color: "#ead39b", fact: "Saturn is almost twice as far as Jupiter. Light from the Sun takes over an hour to get here." },
  { id: "uranus", name: "Uranus", au: 19.2, size: 0.32, color: "#9ff0f0", fact: "Uranus is twice as far again. It spins tipped over on its side!" },
  { id: "neptune", name: "Neptune", au: 30.07, size: 0.31, color: "#4c79e8", fact: "Neptune is the farthest planet — about 4.5 billion kilometres from the Sun." },
  { id: "pluto", name: "Pluto", au: 39.5, size: 0.08, color: "#c9a98a", fact: "Pluto is a dwarf planet in the Kuiper Belt, at the very edge of our walk by the beach." },
];

export function walkStopX(stop: WalkStop) {
  return PLANET_WALK_START + stop.au * AU_SCALE;
}
export const PLANET_WALK_Z = -1.2;

export const CAMPUS = {
  spawn: { x: 0, z: 18 },
  radius: 118,
  coastX: 101,
  oceanX: 106,
};

/** Rotates a local building point into world space. */
export function toWorld(b: BuildingPlacement, lx: number, lz: number): [number, number] {
  const a = (b.rot * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  return [b.x + lx * cos + lz * sin, b.z - lx * sin + lz * cos];
}

/** Pushes a circle (the cadet) out of every collider. Returns the corrected position. */
export function resolveCollisions(x: number, z: number, radius: number): [number, number] {
  let px = x, pz = z;
  for (const b of BUILDINGS) {
    const a = (b.rot * Math.PI) / 180;
    const cos = Math.cos(a), sin = Math.sin(a);
    for (const c of b.colliders) {
      // into building-local space
      const dx = px - b.x, dz = pz - b.z;
      let lx = dx * cos - dz * sin;
      let lz = dx * sin + dz * cos;
      if (c.kind === "circle") {
        const ox = lx - c.cx, oz = lz - c.cz;
        const d = Math.hypot(ox, oz);
        const min = c.r + radius;
        if (d < min) {
          const k = d > 1e-6 ? min / d : 1;
          lx = c.cx + ox * k;
          lz = c.cz + (d > 1e-6 ? oz * k : min);
        } else continue;
      } else {
        const hw = c.w / 2 + radius, hd = c.d / 2 + radius;
        const ox = lx - c.cx, oz = lz - c.cz;
        if (Math.abs(ox) < hw && Math.abs(oz) < hd) {
          const pushX = hw - Math.abs(ox), pushZ = hd - Math.abs(oz);
          if (pushX < pushZ) lx = c.cx + Math.sign(ox || 1) * hw; else lz = c.cz + Math.sign(oz || 1) * hd;
        } else continue;
      }
      // back to world
      px = b.x + lx * cos + lz * sin;
      pz = b.z - lx * sin + lz * cos;
    }
  }
  const r = Math.hypot(px, pz);
  if (r > CAMPUS.radius) { px *= CAMPUS.radius / r; pz *= CAMPUS.radius / r; }
  if (px > CAMPUS.coastX) px = CAMPUS.coastX;
  return [px, pz];
}

export function stationPads() {
  return BUILDINGS.filter((b) => b.station).map((b) => {
    const [x, z] = toWorld(b, b.station!.pad[0], b.station!.pad[1]);
    return { ...b.station!, x, z, building: b };
  });
}
