export const SECTOR_LENGTH = 2400;
export const CHECKPOINT_INTERVAL = 600;
export const ROAD_HALF_WIDTH = 7.25;
export const PLAYER_LATERAL_LIMIT = 5.55;
export const LANE_X = [-4.15, 0, 4.15] as const;

export type CircuitProfile = {
  name: string;
  shortName: string;
  subtitle: string;
  threat: string;
  sky: number;
  fog: number;
  rail: number;
  key: number;
  roadGlow: number;
};

export const CIRCUITS: CircuitProfile[] = [
  {
    name: "Neon Megacity Grandway",
    shortName: "Neon Grandway",
    subtitle: "Skyline sweepers and luminous apex gates",
    threat: "URBAN VELOCITY",
    sky: 0x040316,
    fog: 0x170747,
    rail: 0x19e6ff,
    key: 0xff3bbd,
    roadGlow: 0x321061,
  },
  {
    name: "Solar Rift Canyon",
    shortName: "Solar Rift",
    subtitle: "Long canyon arcs and thermal boost lanes",
    threat: "HEAT SURGE",
    sky: 0x18030a,
    fog: 0x57101d,
    rail: 0xff8a1f,
    key: 0xffee55,
    roadGlow: 0x5b160a,
  },
  {
    name: "Prism Glacier Run",
    shortName: "Prism Glacier",
    subtitle: "Cold blue switchbacks with narrow racing lines",
    threat: "ICE VECTOR",
    sky: 0x020d1c,
    fog: 0x063a56,
    rail: 0x68d9ff,
    key: 0xa8ff3e,
    roadGlow: 0x063d54,
  },
  {
    name: "Quantum Void Spiral",
    shortName: "Quantum Void",
    subtitle: "Deep-space S-bends and unstable warp fields",
    threat: "VOID DISTORTION",
    sky: 0x080016,
    fog: 0x310052,
    rail: 0xc45cff,
    key: 0x38a7ff,
    roadGlow: 0x28004b,
  },
  {
    name: "Verdant Ion Causeway",
    shortName: "Ion Causeway",
    subtitle: "Wide energy causeways through a living neon biome",
    threat: "BIO-ION STORM",
    sky: 0x02150f,
    fog: 0x073d31,
    rail: 0x56ffae,
    key: 0xff5fc9,
    roadGlow: 0x06472d,
  },
  {
    name: "Nova Foundry Circuit",
    shortName: "Nova Foundry",
    subtitle: "Industrial chicanes, furnace light and rival packs",
    threat: "FOUNDRY REDLINE",
    sky: 0x120706,
    fog: 0x472014,
    rail: 0xff5d3a,
    key: 0x65d9ff,
    roadGlow: 0x4a160b,
  },
];

export function circuitForSector(sector: number): CircuitProfile {
  return CIRCUITS[(Math.max(1, sector) - 1) % CIRCUITS.length];
}

/**
 * Global continuous course center.  It never resets at a sector boundary,
 * which keeps the road from snapping when a new environment loads.
 */
export function courseCenterAtDistance(distanceMeters: number): number {
  const d = Math.max(0, distanceMeters);
  return (
    Math.sin(d / 82) * 2.55 +
    Math.sin(d / 171 + 0.9) * 1.55 +
    Math.sin(d / 43 + 1.8) * 0.42
  );
}

export function courseBankAtDistance(distanceMeters: number): number {
  const before = courseCenterAtDistance(Math.max(0, distanceMeters - 7));
  const after = courseCenterAtDistance(distanceMeters + 7);
  return Math.max(-0.16, Math.min(0.16, (after - before) * -0.026));
}

export function courseYawAtDistance(distanceMeters: number): number {
  const before = courseCenterAtDistance(Math.max(0, distanceMeters - 5));
  const after = courseCenterAtDistance(distanceMeters + 5);
  return Math.atan2(after - before, 10);
}

export type EncounterKind =
  | "coin-line"
  | "coin-sweep"
  | "barrier-choice"
  | "mine-slalom"
  | "drone-pair"
  | "rival-pack"
  | "warp-lane";

export type EncounterPlan = {
  kind: EncounterKind;
  primaryLane: number;
  secondaryLane: number;
  safeLane: number;
};

function hashInt(value: number): number {
  let x = value | 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

const ENCOUNTER_CYCLE: EncounterKind[] = [
  "coin-line",
  "barrier-choice",
  "coin-sweep",
  "mine-slalom",
  "drone-pair",
  "warp-lane",
  "rival-pack",
  "coin-sweep",
  "barrier-choice",
  "warp-lane",
];

export function encounterFor(sector: number, index: number): EncounterPlan {
  const seed = hashInt(Math.max(1, sector) * 1009 + Math.max(0, index) * 9176);
  const kind = ENCOUNTER_CYCLE[(index + sector * 2) % ENCOUNTER_CYCLE.length];
  const primaryLane = seed % 3;
  const secondaryLane = (primaryLane + 1 + ((seed >>> 4) % 2)) % 3;
  const safeLane = [0, 1, 2].find(
    (lane) => lane !== primaryLane && lane !== secondaryLane,
  ) ?? ((primaryLane + 1) % 3);
  return { kind, primaryLane, secondaryLane, safeLane };
}

export function encounterIntervalSeconds(sector: number): number {
  // Deliberately readable: late-game intensity comes from richer patterns and
  // speed, not from stacking hazards on top of one another.
  return Math.max(0.92, 1.48 - Math.min(12, Math.max(1, sector) - 1) * 0.035);
}

export function checkpointNumber(distanceMeters: number): number {
  return Math.floor(Math.max(0, distanceMeters) / CHECKPOINT_INTERVAL) + 1;
}

export function checkpointProgress(distanceMeters: number): number {
  return (Math.max(0, distanceMeters) % CHECKPOINT_INTERVAL) / CHECKPOINT_INTERVAL;
}
