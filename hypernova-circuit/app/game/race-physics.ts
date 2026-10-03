import { lapDelta, TRACK_HALF_WIDTH, type RaceTrack } from "./track";

/**
 * Hovercar driving model, integrated in track space.
 *
 *   ds/dt = v cos(slip) / (1 - k d)     progress along the centreline
 *   dd/dt = v sin(slip)                 lateral drift across the road
 *   dpsi/dt = yaw - k ds/dt             heading relative to the road
 *
 * psi is where the nose points, slip is where the car actually travels. With
 * full grip slip follows psi at once; in a drift it lags, so the car slides
 * wide with its nose turned in. Elevation and banking come from the track
 * frame, so the same equations drive every hill, bridge and banked bend.
 */

export const CAR_HALF_WIDTH = 1.15;
export const CAR_HALF_LENGTH = 2.35;
export const WALL_LIMIT = TRACK_HALF_WIDTH - CAR_HALF_WIDTH - 0.35;

export type DriveStats = {
  topSpeed: number;
  acceleration: number;
  grip: number;
  maxYaw: number;
  boostMultiplier: number;
  braking: number;
};

export type DriveInput = {
  steer: number;
  throttle: number;
  brake: number;
  boost: boolean;
  /** AI drivers keep full traction. */
  noDrift?: boolean;
};

export type CarState = {
  s: number;
  d: number;
  psi: number;
  slip: number;
  v: number;
  yaw: number;
  steerSmoothed: number;
  /** Unwrapped race distance: negative on the grid, laps * length at the flag. */
  total: number;
  drifting: boolean;
  driftTime: number;
  wallContact: number;
  boostTime: number;
  airborne: number;
};

export type StepReport = {
  wallImpact: number;
  driftEnded: number;
  ds: number;
};

export function createCarState(s: number, d: number, total: number): CarState {
  return {
    s,
    d,
    psi: 0,
    slip: 0,
    v: 0,
    yaw: 0,
    steerSmoothed: 0,
    total,
    drifting: false,
    driftTime: 0,
    wallContact: 0,
    boostTime: 0,
    airborne: 0,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function stepCar(
  car: CarState,
  input: DriveInput,
  stats: DriveStats,
  track: RaceTrack,
  dt: number,
): StepReport {
  const report: StepReport = { wallImpact: 0, driftEnded: 0, ds: 0 };
  // Steering is smoothed so digital keys still feel analogue.
  car.steerSmoothed += (input.steer - car.steerSmoothed) * Math.min(1, dt * 9);
  const steer = car.steerSmoothed;

  const boosting = input.boost;
  const top = stats.topSpeed * (boosting ? stats.boostMultiplier : 1) * (car.boostTime > 0 ? 1.12 : 1);
  if (input.brake > 0 && !(car.drifting && car.driftTime > 0.25)) {
    // Once a drift is set the brake is only needed to start it.
    car.v -= stats.braking * input.brake * dt;
  } else if (car.v < top) {
    const push = stats.acceleration * (boosting ? 2.1 : 1) * input.throttle;
    car.v += push * (1 - (car.v / top) ** 2 * 0.65) * dt;
  } else {
    car.v -= (car.v - top) * Math.min(1, dt * 1.6);
  }
  car.v -= car.v * 0.012 * dt; // air drag
  car.v = Math.max(0, car.v);
  car.boostTime = Math.max(0, car.boostTime - dt);

  // Drift: tap the brake while steering hard at speed to break traction,
  // then hold the steering to keep the slide going.
  const wantsDrift =
    !input.noDrift && Math.abs(steer) > 0.6 && car.v > 40 && (input.brake > 0 || car.drifting);
  if (wantsDrift && !car.drifting) {
    car.drifting = true;
    car.driftTime = 0;
  } else if (car.drifting && (Math.abs(steer) < 0.35 || car.v < 30)) {
    car.drifting = false;
    report.driftEnded = car.driftTime;
    car.driftTime = 0;
  }
  if (car.drifting) {
    car.driftTime += dt;
    car.v -= car.v * 0.03 * dt;
  }

  const grip = stats.grip * (car.drifting ? 1.32 : 1);
  const yawLimit = Math.min(stats.maxYaw * (car.drifting ? 1.25 : 1), grip / Math.max(car.v, 9));
  car.yaw = steer * yawLimit;

  const k = track.curvatureAt(car.s);
  const denom = Math.max(0.35, 1 - k * car.d);
  const ds = (car.v * Math.cos(car.slip)) / denom * dt;
  car.psi += car.yaw * dt - k * ds;
  car.slip += -k * ds;
  const slipRate = car.drifting ? 2.6 : 11;
  car.slip += (car.psi - car.slip) * Math.min(1, dt * slipRate);
  car.psi = clamp(car.psi, -1.4, 1.4);
  car.slip = clamp(car.slip, -1.3, 1.3);

  car.d += car.v * Math.sin(car.slip) * dt;
  car.s = (car.s + ds + track.length) % track.length;
  car.total += ds;
  report.ds = ds;

  // Energy barriers: deflect, scrub speed and straighten the car.
  car.wallContact = Math.max(0, car.wallContact - dt);
  if (Math.abs(car.d) > WALL_LIMIT) {
    const side = Math.sign(car.d);
    const into = Math.max(0, Math.sin(car.slip) * side);
    report.wallImpact = into * car.v;
    car.d = side * WALL_LIMIT;
    car.v *= 1 - Math.min(0.35, into * 0.9 + 0.01);
    car.slip = -car.slip * 0.25;
    car.psi = car.psi * 0.4 - side * 0.05;
    car.wallContact = 0.12;
    if (car.drifting) {
      car.drifting = false;
      car.driftTime = 0;
    }
  }
  return report;
}

export type AiDriver = {
  skill: number;
  aggression: number;
  lineBias: number;
  lane: number;
  profile: Float32Array;
};

/** Steering and pedals an AI driver applies to reach its line and speed. */
export function aiInput(
  car: CarState,
  ai: AiDriver,
  track: RaceTrack,
  stats: DriveStats,
  obstacles: { s: number; d: number; v: number }[],
  rubberBand: number,
): DriveInput {
  const look = Math.max(14, car.v * 0.55);
  const ahead = car.s + look;
  let target = track.racingLineAt(ahead) * (0.82 + ai.aggression * 0.18) + ai.lineBias;

  // Avoid slower cars and hazards ahead by picking the side with more room.
  for (const o of obstacles) {
    const gap = lapDelta(car.s, o.s, track.length);
    if (gap < 1 || gap > 30) continue;
    const closing = car.v - o.v;
    if (closing < -2 && gap > 9) continue;
    const lateral = o.d - target;
    if (Math.abs(lateral) < 3.4) {
      const side = lateral > 0 ? -1 : 1;
      let pass = o.d + side * 3.6;
      if (Math.abs(pass) > WALL_LIMIT - 0.3) pass = o.d - side * 3.6;
      target = pass;
    }
  }
  target = clamp(target, -WALL_LIMIT + 0.4, WALL_LIMIT - 0.4);

  const desired = Math.atan2(target - car.d, look);
  const k = track.curvatureAt(car.s);
  const feedForward = k * car.v;
  const correction = (desired - car.psi) * 3.2;
  const yawLimit = Math.min(stats.maxYaw, stats.grip / Math.max(car.v, 9));
  const steer = clamp((feedForward + correction) / Math.max(0.05, yawLimit), -1, 1);

  const limit = track.sampleScalar(ai.profile, car.s + car.v * 0.25) * ai.skill * rubberBand;
  const tooFast = car.v - limit;
  return {
    steer,
    throttle: tooFast > 0 ? 0 : 1,
    brake: tooFast > 1.5 ? clamp(tooFast / 10, 0.2, 1) : 0,
    boost: false,
    noDrift: true,
  };
}

/** Resolve overlapping cars in track space. Returns the strongest impact. */
export function resolveContacts(cars: CarState[], length: number): { a: number; b: number; impact: number }[] {
  const hits: { a: number; b: number; impact: number }[] = [];
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      const ds = lapDelta(a.s, b.s, length);
      const dd = b.d - a.d;
      const overlapS = CAR_HALF_LENGTH * 2 - Math.abs(ds);
      const overlapD = CAR_HALF_WIDTH * 2 - Math.abs(dd);
      if (overlapS <= 0 || overlapD <= 0) continue;
      const impact = Math.abs(a.v - b.v);
      if (overlapD < overlapS * 0.9) {
        // Side by side: push apart laterally.
        const push = (overlapD / 2 + 0.02) * Math.sign(dd || 1);
        a.d = clamp(a.d - push, -WALL_LIMIT, WALL_LIMIT);
        b.d = clamp(b.d + push, -WALL_LIMIT, WALL_LIMIT);
        a.slip *= 0.6;
        b.slip *= 0.6;
      } else {
        // Nose to tail: the chaser loses speed, the leader gets a nudge.
        const [front, back] = ds > 0 ? [b, a] : [a, b];
        const exchange = Math.max(0, back.v - front.v);
        back.v -= exchange * 0.6 + 1;
        front.v += exchange * 0.25;
        const move = overlapS / 2 + 0.02;
        back.s = (back.s - move + length) % length;
        back.total -= move;
        front.s = (front.s + move) % length;
        front.total += move;
        const nudge = 0.4 * Math.sign(front.d - back.d || 1);
        front.d = clamp(front.d + nudge, -WALL_LIMIT, WALL_LIMIT);
      }
      hits.push({ a: i, b: j, impact });
    }
  }
  return hits;
}
