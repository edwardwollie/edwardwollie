import { layoutRocket, type RocketConfig } from "../blueprints/rocket.ts";
import { AIRFRAME, G0, PHYSICS, type SystemCounts, type SystemId } from "./systems.ts";

/**
 * Rocket analysis used by the hangar, the launch simulation, hints and tests.
 *
 *  - Thrust-to-weight ratio (TWR) at liftoff decides if the rocket can rise.
 *  - Delta-v comes from the Tsiolkovsky rocket equation, with the strap-on
 *    boosters burning first and then separating (two-stage maths).
 *  - Stability compares the centre of mass with the centre of pressure
 *    (Barrowman-style weights: nose, body, fins).
 *  - Four kid-friendly readiness meters (v2.1 names) are derived from the physics.
 */
export interface MissionNeeds {
  /** Delta-v needed to reach the destination (Academy scale, m/s). */
  range: number;
  required: readonly SystemId[];
  helpful: readonly SystemId[];
}

export interface Meters {
  thrust: number;
  fuel: number;
  stability: number;
  mission: number;
}

export interface RocketAnalysis {
  mass: number;
  dryMass: number;
  fuelMass: number;
  thrust: number;
  twr: number;
  dv: number;
  boosterDv: number;
  /** Centre of mass / pressure heights above the pad (m). */
  com: number;
  cop: number;
  /** Static margin in calibers (rocket diameters). Positive = stable. */
  margin: number;
  height: number;
  canLift: boolean;
  reaches: boolean;
  meters: Meters;
  total: number;
  /** Mission systems still missing. */
  missing: SystemId[];
}

const DIAMETER = 3.0;
const MIN_TWR = 1.1;

export function toConfig(counts: SystemCounts): RocketConfig {
  return { ...counts, engine: Math.max(1, counts.engine) };
}

function itemMass(system: string): { dry: number; fuel: number } {
  if (system === "thrust") return { dry: AIRFRAME.thrust, fuel: 0 };
  if (system === "capsule") return { dry: AIRFRAME.capsule, fuel: 0 };
  if (system === "nose") return { dry: AIRFRAME.nose, fuel: 0 };
  const physics = PHYSICS[system as SystemId];
  return { dry: physics.mass, fuel: physics.fuel ?? 0 };
}

/** Thrust meter: 45 at TWR 1, rising smoothly toward 100. */
export function thrustMeter(twr: number) {
  if (twr <= 1) return Math.max(0, 45 * twr);
  return Math.min(100, 45 + 55 * (1 - Math.exp(-1.4 * (twr - 1))));
}

export function analyzeRocket(counts: SystemCounts, needs: MissionNeeds): RocketAnalysis {
  const config = toConfig(counts);
  const layout = layoutRocket(config);
  let mass = 0, dryMass = 0, fuelMass = 0, moment = 0;
  for (const item of layout.items) {
    const { dry, fuel } = itemMass(item.system);
    mass += dry + fuel;
    dryMass += dry;
    fuelMass += fuel;
    moment += (dry + fuel) * item.massY;
  }
  const com = moment / mass;
  const engines = config.engine;
  const coreThrust = engines * (PHYSICS.engine.thrust ?? 0);
  const coreIsp = PHYSICS.engine.isp ?? 300;
  const hasBooster = config.booster > 0;
  const boosterThrust = hasBooster ? PHYSICS.booster.thrust ?? 0 : 0;
  const boosterIsp = PHYSICS.booster.isp ?? 270;
  const thrust = coreThrust + boosterThrust;
  const twr = thrust / (mass * G0);
  // Delta-v (two phases when boosters are fitted)
  const coreFuel = fuelMass - (hasBooster ? PHYSICS.booster.fuel ?? 0 : 0);
  let dv = 0, boosterDv = 0;
  if (hasBooster) {
    const boosterFuel = PHYSICS.booster.fuel ?? 0;
    const mdotB = boosterThrust / (boosterIsp * G0);
    const mdotC = coreThrust / (coreIsp * G0);
    const burnTime = boosterFuel / mdotB;
    const coreBurned = Math.min(coreFuel, mdotC * burnTime);
    const ispMix = thrust / ((mdotB + mdotC) * G0);
    const m1 = mass - boosterFuel - coreBurned;
    boosterDv = ispMix * G0 * Math.log(mass / m1);
    const m2 = m1 - PHYSICS.booster.mass;
    const mf = m2 - (coreFuel - coreBurned);
    dv = boosterDv + (coreFuel - coreBurned > 0 ? coreIsp * G0 * Math.log(m2 / mf) : 0);
  } else if (coreFuel > 0) {
    dv = coreIsp * G0 * Math.log(mass / (mass - coreFuel));
  }
  // Centre of pressure (nose + body + fins + boosters)
  const nose = layout.items.find((item) => item.system === "nose")!;
  const top = nose.y1;
  const thrustItem = layout.items.find((item) => item.system === "thrust")!;
  const bodyBase = thrustItem.y0;
  let cnSum = 2, cnMoment = 2 * (nose.y0 + 0.534 * (nose.y1 - nose.y0));
  cnSum += 0.6; cnMoment += 0.6 * ((bodyBase + nose.y0) / 2);
  if (config.fins) { cnSum += 14; cnMoment += 14 * (bodyBase + 0.6); }
  if (config.booster) { cnSum += 1.2; cnMoment += 1.2 * (bodyBase + 3.0); }
  if (config.lander) { cnSum += 0.8; cnMoment += 0.8 * (bodyBase - 0.6); }
  const cop = cnMoment / cnSum;
  const margin = (com - cop) / DIAMETER;
  // Meters
  const reaches = dv >= needs.range;
  const fuel = Math.min(100, 80 * Math.min(1, dv / (needs.range * 1.3)) + (config.solar ? 20 : 4));
  const staticScore = Math.max(0, Math.min(45, 20 + 25 * margin));
  const stability = Math.min(100, 2 + staticScore + (config.computer ? 22 : 0) + (config.parachute ? 12 : 0) + (config.shield ? 12 : 0) + (config.lander ? 7 : 0));
  const installed = (id: SystemId) => counts[id] > 0;
  const missing = needs.required.filter((id) => !installed(id));
  const requiredDone = needs.required.length - missing.length;
  const helpfulDone = needs.helpful.filter(installed).length;
  const mission = Math.min(100, (needs.required.length ? 20 : 35) + 30 * requiredDone + 10 * helpfulDone);
  const meters: Meters = {
    thrust: Math.round(thrustMeter(twr)),
    fuel: Math.round(fuel),
    stability: Math.round(stability),
    mission: Math.round(mission),
  };
  return {
    mass, dryMass, fuelMass, thrust, twr, dv, boosterDv, com, cop, margin,
    height: top,
    canLift: twr >= MIN_TWR,
    reaches,
    meters,
    total: meters.thrust + meters.fuel + meters.stability + meters.mission,
    missing,
  };
}

export const LIFTOFF_TWR = MIN_TWR;

export interface AscentSample {
  t: number;
  altitude: number;
  speed: number;
  fuel: number;
  boosterAttached: boolean;
}

/**
 * Simple vertical-then-pitched ascent for the launch scene (visual pacing only).
 * Returns samples every 0.1 s of mission time; the scene time-compresses them.
 */
export function simulateAscent(counts: SystemCounts, seconds = 140): AscentSample[] {
  const config = toConfig(counts);
  const layout = layoutRocket(config);
  let mass = 0, coreFuel = 0, boosterFuel = 0;
  for (const item of layout.items) {
    const { dry, fuel } = itemMass(item.system);
    mass += dry + fuel;
    if (item.system === "booster") boosterFuel += fuel; else coreFuel += fuel;
  }
  const coreThrust = config.engine * (PHYSICS.engine.thrust ?? 0);
  const boosterThrust = config.booster ? PHYSICS.booster.thrust ?? 0 : 0;
  const mdotC = coreThrust / ((PHYSICS.engine.isp ?? 300) * G0);
  const mdotB = boosterThrust / ((PHYSICS.booster.isp ?? 270) * G0);
  let altitude = 0, speed = 0, t = 0, booster = config.booster > 0;
  const samples: AscentSample[] = [];
  const dt = 0.1;
  const startFuel = coreFuel + boosterFuel;
  while (t < seconds) {
    let thrust = 0;
    if (coreFuel > 0) { thrust += coreThrust; coreFuel = Math.max(0, coreFuel - mdotC * dt); }
    if (booster && boosterFuel > 0) { thrust += boosterThrust; boosterFuel = Math.max(0, boosterFuel - mdotB * dt); }
    mass = Math.max(1, mass - ((coreFuel > 0 ? mdotC : 0) + (booster && boosterFuel > 0 ? mdotB : 0)) * dt);
    if (booster && boosterFuel <= 0) { booster = false; mass -= PHYSICS.booster.mass; }
    const density = Math.exp(-altitude / 8000);
    const drag = 0.0006 * density * speed * speed;
    const gravity = G0 * Math.max(0.2, 1 - altitude / 400000);
    const accel = Math.max(-20, (thrust - drag) / mass - gravity);
    speed = Math.max(0, speed + accel * dt);
    altitude += speed * dt;
    t += dt;
    samples.push({ t, altitude, speed, fuel: (coreFuel + boosterFuel) / Math.max(1, startFuel), boosterAttached: booster });
    if (coreFuel <= 0 && (!config.booster || boosterFuel <= 0) && speed <= 0) break;
  }
  return samples;
}
