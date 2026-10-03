import { WORLDS, makeFlightMission, type AgePath, type StatKey } from "../../flight-data.ts";
import { analyzeRocket, type MissionNeeds, type RocketAnalysis } from "./physics.ts";
import { PHYSICS, emptyCounts, partInfo, systemsFor, type SystemCounts, type SystemId } from "./systems.ts";

/**
 * 90 rocket-engineering missions (3 age paths × 30), keeping the v2.1 structure:
 * six destinations × five missions, a sector boss every fifth mission, the same
 * objectives, focus meters and build-energy budgets. Goals are now physical:
 *   1. LIFT-OFF  — thrust-to-weight ratio ≥ 1.1
 *   2. RANGE     — enough delta-v to reach the destination
 *   3. FOCUS     — the mission's focus meter reaches its target
 *   4. READINESS — the four meters add up to the readiness goal
 * Targets are chosen from every rocket a cadet could build with the energy budget,
 * so every mission is guaranteed solvable (see tests/engineering.test.mjs).
 */
export type ActivityKind = "orbit" | "docking" | "moon-landing" | "mars-landing" | "asteroid" | "photo";

export const AGE_PATHS: readonly AgePath[] = ["5–7", "8–10", "11–12"];
export const RANGE_BY_WORLD = [2200, 2600, 3000, 3300, 3600, 3900] as const;
export const ACTIVITY_BY_WORLD: readonly ActivityKind[] = ["orbit", "docking", "moon-landing", "mars-landing", "asteroid", "photo"];
export const DESTINATIONS = ["Low Earth Orbit", "Orbital School Station", "Moon Base Tranquility", "Mars Canyon Outpost", "the Asteroid Route", "the Outer Worlds"] as const;
export const OUTER_TARGETS = ["jupiter", "saturn", "uranus", "neptune", "saturn"] as const;

export interface EngineeringMission {
  age: AgePath;
  level: number;
  worldIndex: number;
  world: (typeof WORLDS)[number];
  boss: boolean;
  focus: StatKey;
  objective: string;
  brief: string;
  tip: string;
  destination: string;
  activity: ActivityKind;
  /** Planet for Outer Worlds photo flybys. */
  target: string;
  start: SystemCounts;
  energy: number;
  needs: MissionNeeds;
  focusTarget: number;
  totalGoal: number;
  /** Cheapest energy cost of any winning build (used for hints). */
  bestCost: number;
}

export function missionNeeds(objective: string, age: AgePath, worldIndex: number): MissionNeeds {
  const available = new Set(systemsFor(age));
  const has = (id: SystemId) => available.has(id);
  const pick = (...ids: SystemId[]) => ids.filter(has);
  const range = RANGE_BY_WORLD[worldIndex];
  switch (objective) {
    case "Reach the target altitude":
      return { range, required: [], helpful: pick("computer", "antenna") };
    case "Enter a stable orbit":
      return { range, required: pick("computer"), helpful: pick("antenna", "solar") };
    case "Deliver the exploration module":
      return { range, required: has("lab") ? ["lab"] : has("solar") ? ["solar"] : ["antenna"], helpful: pick("computer", has("lab") ? "solar" : "antenna") };
    case "Land and return safely":
      return { range, required: pick("parachute", "shield", "lander"), helpful: pick("computer") };
    default: // "Transmit the discovery data"
      return { range, required: pick("antenna"), helpful: pick("solar", "computer", "lab") };
  }
}

function startConfig(focus: StatKey, level: number): SystemCounts {
  const counts = emptyCounts();
  counts.engine = 1;
  counts.tank = focus === "thrust" ? 2 : 1;
  if (focus !== "stability" && level % 3 === 0) counts.fins = 1;
  if (focus === "fuel" && level % 4 === 2) counts.engine = 2;
  return counts;
}

export function energyFor(age: AgePath, level: number) {
  return (age === "5–7" ? 18 : age === "8–10" ? 17 : 16) + (level <= 5 ? 2 : 0);
}

export interface Candidate {
  counts: SystemCounts;
  cost: number;
  analysis: RocketAnalysis;
}

/** Every build reachable from `start` within the energy budget (start included). */
export function enumerateBuilds(age: AgePath, start: SystemCounts, energy: number, needs: MissionNeeds): Candidate[] {
  const systems = systemsFor(age);
  const out: Candidate[] = [];
  const counts = { ...start };
  const visit = (index: number, spent: number) => {
    if (index === systems.length) {
      out.push({ counts: { ...counts }, cost: spent, analysis: analyzeRocket(counts, needs) });
      return;
    }
    const id = systems[index];
    const cost = partInfo(id).cost;
    const original = counts[id];
    for (let extra = 0; original + extra <= PHYSICS[id].max && spent + extra * cost <= energy; extra++) {
      counts[id] = original + extra;
      visit(index + 1, spent + extra * cost);
    }
    counts[id] = original;
  };
  visit(0, 0);
  return out;
}

function quantile(values: number[], q: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))];
}

export function meetsGoals(analysis: RocketAnalysis, mission: Pick<EngineeringMission, "focus" | "focusTarget" | "totalGoal">) {
  return analysis.canLift && analysis.reaches && analysis.meters[mission.focus] >= mission.focusTarget && analysis.total >= mission.totalGoal;
}

const cache = new Map<string, EngineeringMission>();

export function makeEngineeringMission(age: AgePath, levelInput: number): EngineeringMission {
  const level = Math.max(1, Math.min(30, Math.floor(levelInput) || 1));
  const key = `${age}|${level}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const flight = makeFlightMission(age, level);
  const worldIndex = Math.floor((level - 1) / 5);
  const boss = level % 5 === 0;
  const focus = flight.focus;
  const needs = missionNeeds(flight.objective, age, worldIndex);
  const start = startConfig(focus, level);
  const energy = energyFor(age, level);
  const builds = enumerateBuilds(age, start, energy, needs);
  const feasible = builds.filter((c) => c.analysis.canLift && c.analysis.reaches);
  if (!feasible.length) throw new Error(`No feasible build for ${key}`);
  const base = age === "5–7" ? [0.24, 0.2] : age === "8–10" ? [0.36, 0.3] : [0.5, 0.45];
  const rampMax = age === "5–7" ? 0.14 : age === "8–10" ? 0.2 : 0.26;
  const ramp = ((level - 1) / 29) * rampMax + (boss ? 0.06 : 0);
  let focusTarget = quantile(feasible.map((c) => c.analysis.meters[focus]), Math.min(0.9, base[0] + ramp));
  const startAnalysis = analyzeRocket(start, needs);
  if (startAnalysis.meters[focus] >= focusTarget) {
    const higher = feasible.map((c) => c.analysis.meters[focus]).filter((v) => v > startAnalysis.meters[focus]).sort((a, b) => a - b);
    if (higher.length) focusTarget = higher[Math.min(higher.length - 1, Math.floor(higher.length * 0.3))];
  }
  const meetingFocus = feasible.filter((c) => c.analysis.meters[focus] >= focusTarget);
  let totalGoal = quantile(meetingFocus.map((c) => c.analysis.total), Math.min(0.88, base[1] + ramp));
  const draft = { focus, focusTarget, totalGoal };
  if (meetsGoals(startAnalysis, draft)) {
    const higher = meetingFocus.map((c) => c.analysis.total).filter((v) => v > startAnalysis.total).sort((a, b) => a - b);
    if (higher.length) totalGoal = higher[0];
  }
  // Three stars must always be possible: some winning build has to leave 4+ energy.
  const cheap = feasible.filter((c) => energy - c.cost >= 4);
  if (!feasible.some((c) => energy - c.cost >= 4 && meetsGoals(c.analysis, { focus, focusTarget, totalGoal })) && cheap.length) {
    const cheapFocus = cheap.filter((c) => c.analysis.meters[focus] >= focusTarget);
    if (!cheapFocus.length) focusTarget = Math.max(...cheap.map((c) => c.analysis.meters[focus]));
    const pool = cheap.filter((c) => c.analysis.meters[focus] >= focusTarget);
    totalGoal = Math.min(totalGoal, Math.max(...pool.map((c) => c.analysis.total)));
  }
  const winners = feasible.filter((c) => meetsGoals(c.analysis, { focus, focusTarget, totalGoal }));
  if (!winners.length) throw new Error(`Mission ${key} has no winning build`);
  const bestCost = Math.min(...winners.map((c) => c.cost));
  const destination = DESTINATIONS[worldIndex];
  const activity = ACTIVITY_BY_WORLD[worldIndex];
  const target = worldIndex === 5 ? OUTER_TARGETS[(level - 1) % 5] : worldIndex === 2 ? "moon" : worldIndex === 3 ? "mars" : "earth";
  const mission: EngineeringMission = {
    age, level, worldIndex, world: WORLDS[worldIndex], boss, focus, objective: flight.objective,
    brief: flight.brief, tip: flight.tip, destination, activity, target, start, energy, needs, focusTarget, totalGoal, bestCost,
  };
  cache.set(key, mission);
  return mission;
}

const SYSTEM_WORDS: Record<SystemId, string> = {
  engine: "a Main Engine", tank: "a Fuel Tank", fins: "Stability Fins", computer: "the Guidance Computer", parachute: "the Parachute",
  antenna: "the Comms Antenna", solar: "the Solar Array", shield: "the Heat Shield", habitat: "the Life-Support Cabin",
  booster: "the Booster Stage", lander: "Landing Legs", lab: "the Science Module",
};

/** Cosmo's coaching line for the current build. */
export function coachHint(mission: EngineeringMission, analysis: RocketAnalysis, counts: SystemCounts): string {
  const available = new Set(systemsFor(mission.age));
  const canAdd = (id: SystemId) => available.has(id) && counts[id] < PHYSICS[id].max;
  if (!analysis.canLift) {
    if (canAdd("engine")) return "Too heavy to lift off! Add another Main Engine for more push, or use fewer fuel tanks.";
    if (canAdd("booster")) return "Too heavy to lift off! Strap on the Booster Stage for a giant push.";
    return "Too heavy to lift off! Undo a fuel tank so the engines can lift the rocket.";
  }
  if (!analysis.reaches) {
    if (canAdd("tank")) return `Not enough fuel to reach ${mission.destination}. Add a Fuel Tank.`;
    if (canAdd("booster")) return `Not enough fuel to reach ${mission.destination}. The Booster Stage adds fuel and drops away when empty.`;
    return `Not enough fuel to reach ${mission.destination}. Try a lighter rocket so the fuel goes farther.`;
  }
  if (analysis.meters[mission.focus] < mission.focusTarget) {
    switch (mission.focus) {
      case "thrust": return canAdd("engine") ? "Raise THRUST: add a Main Engine so the rocket leaps off the pad." : canAdd("booster") ? "Raise THRUST: the Booster Stage gives a huge push." : "Raise THRUST: make the rocket lighter by undoing a heavy part.";
      case "fuel": return canAdd("tank") ? "Raise FUEL & ENERGY: add a Fuel Tank to fly farther." : canAdd("solar") ? "Raise FUEL & ENERGY: Solar Arrays make electricity from sunlight." : canAdd("booster") ? "Raise FUEL & ENERGY: the Booster Stage adds fuel and drops away." : "Raise FUEL & ENERGY: a lighter rocket flies farther on the same fuel.";
      case "stability": {
        const order: SystemId[] = ["fins", "computer", "parachute", "shield", "lander"];
        const next = order.find(canAdd);
        return next ? `Raise STABILITY & SAFETY: add ${SYSTEM_WORDS[next]}.` : "Raise STABILITY & SAFETY: put heavy parts higher up the rocket.";
      }
      case "mission": {
        const need = analysis.missing.find(canAdd) ?? mission.needs.helpful.find(canAdd);
        return need ? `Raise MISSION SYSTEMS: this mission needs ${SYSTEM_WORDS[need]}.` : "Raise MISSION SYSTEMS with the tools this mission needs.";
      }
    }
  }
  if (analysis.total < mission.totalGoal) {
    const missing = analysis.missing.find(canAdd);
    if (missing) return `Almost there! ${SYSTEM_WORDS[missing].replace(/^./, (c) => c.toUpperCase())} would help this mission a lot.`;
    return "Almost there! Add one more helpful system to raise total readiness.";
  }
  return "All systems green! Start the countdown.";
}

export const SYSTEM_PHRASES = SYSTEM_WORDS;
