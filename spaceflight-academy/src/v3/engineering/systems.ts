import { ROCKET_PARTS, availableParts, type AgePath, type RocketPart } from "../../flight-data.ts";

/**
 * The 12 Academy rocket systems from v2.1 (same ids, names, costs, age gates and
 * facts) with the physical properties used by the v3 rocket-engineering model.
 * Masses are tonnes, thrust kN, specific impulse seconds.
 */
export type SystemId = "engine" | "tank" | "fins" | "computer" | "parachute" | "antenna" | "solar" | "shield" | "habitat" | "booster" | "lander" | "lab";

export const SYSTEM_IDS: readonly SystemId[] = ROCKET_PARTS.map((part) => part.id as SystemId);

export interface SystemPhysics {
  /** Dry mass (t). */
  mass: number;
  /** Propellant (t). */
  fuel?: number;
  /** Thrust (kN). */
  thrust?: number;
  /** Specific impulse (s). */
  isp?: number;
  /** How many can be installed (counting pre-installed ones). */
  max: number;
  /** Blueprint id of the 3D part. */
  blueprint: string;
  /** What it does, in kid language (shown on the part card). */
  does: string;
}

export const PHYSICS: Readonly<Record<SystemId, SystemPhysics>> = {
  engine: { mass: 1.4, thrust: 360, isp: 300, max: 3, blueprint: "part-engine", does: "More push (thrust) — but adds weight" },
  tank: { mass: 0.9, fuel: 10, max: 3, blueprint: "part-tank", does: "More fuel to fly farther — but much heavier" },
  fins: { mass: 0.5, max: 1, blueprint: "part-fins", does: "Keeps the rocket pointing straight in the air" },
  computer: { mass: 0.3, max: 1, blueprint: "part-computer", does: "Steers automatically and finds orbit" },
  parachute: { mass: 0.4, max: 1, blueprint: "part-parachute", does: "Slows the capsule for a safe landing at home" },
  antenna: { mass: 0.2, max: 1, blueprint: "part-antenna", does: "Talks to Mission Control and sends data" },
  solar: { mass: 0.5, max: 1, blueprint: "part-solar", does: "Makes electricity from sunlight" },
  shield: { mass: 0.8, max: 1, blueprint: "part-shield", does: "Protects the crew from re-entry heat" },
  habitat: { mass: 2.0, max: 1, blueprint: "part-habitat", does: "Air, water and space for long trips" },
  booster: { mass: 2.4, fuel: 12, thrust: 560, isp: 270, max: 1, blueprint: "part-booster", does: "Huge extra push, then drops away (staging)" },
  lander: { mass: 0.6, max: 1, blueprint: "part-legs", does: "Lets the rocket stand on the ground after landing" },
  lab: { mass: 1.2, max: 1, blueprint: "part-lab", does: "Cameras and tools to study new worlds" },
};

/** Always-installed airframe: thrust structure 0.8 t, crew capsule 3.2 t, nose cone 0.3 t. */
export const AIRFRAME = { thrust: 0.8, capsule: 3.2, nose: 0.3 } as const;

export const G0 = 9.81;

export function partInfo(id: SystemId): RocketPart {
  const part = ROCKET_PARTS.find((p) => p.id === id);
  if (!part) throw new Error("unknown system " + id);
  return part;
}

export function systemsFor(age: AgePath): SystemId[] {
  return availableParts(age).map((part) => part.id as SystemId);
}

export type SystemCounts = Record<SystemId, number>;

export function emptyCounts(): SystemCounts {
  return { engine: 0, tank: 0, fins: 0, computer: 0, parachute: 0, antenna: 0, solar: 0, shield: 0, habitat: 0, booster: 0, lander: 0, lab: 0 };
}
