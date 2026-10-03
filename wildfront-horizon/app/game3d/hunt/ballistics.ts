// External ballistics: quadratic drag (dv/dt = −k·|v_rel|·v_rel), gravity and
// wind, integrated with fixed sub-steps. The same model drives bullets in the
// world, the scope's BDC marks, the Field Guide drop tables and the printed
// ballistic sheet — so what the book says is what the game does.

import type { Ballistics } from "../blueprints/gear.ts";

export const G = 9.81;

export interface Bullet {
  px: number; py: number; pz: number;
  vx: number; vy: number; vz: number;
  t: number;            // seconds in flight
  dist: number;         // path length (m)
  alive: boolean;
}

export function speed(b: Bullet) { return Math.hypot(b.vx, b.vy, b.vz); }

/** Advance a bullet by dt (s) with sub-steps ≤ 2 ms. Wind is the air velocity (m/s) in world XZ. Returns segments travelled. */
export function stepBullet(b: Bullet, dt: number, k: number, windX: number, windZ: number, out?: [number, number, number, number, number, number][]): void {
  let remaining = dt;
  while (remaining > 1e-6 && b.alive) {
    const h = Math.min(0.002, remaining);
    remaining -= h;
    const x0 = b.px, y0 = b.py, z0 = b.pz;
    // midpoint (RK2) integration
    const rx = b.vx - windX, ry = b.vy, rz = b.vz - windZ;
    const s = Math.hypot(rx, ry, rz);
    const ax = -k * s * rx, ay = -k * s * ry - G, az = -k * s * rz;
    const mvx = b.vx + ax * h * 0.5, mvy = b.vy + ay * h * 0.5, mvz = b.vz + az * h * 0.5;
    const mrx = mvx - windX, mry = mvy, mrz = mvz - windZ;
    const ms = Math.hypot(mrx, mry, mrz);
    const max = -k * ms * mrx, may = -k * ms * mry - G, maz = -k * ms * mrz;
    b.px += mvx * h; b.py += mvy * h; b.pz += mvz * h;
    b.vx += max * h; b.vy += may * h; b.vz += maz * h;
    b.t += h;
    b.dist += Math.hypot(b.px - x0, b.py - y0, b.pz - z0);
    out?.push([x0, y0, z0, b.px, b.py, b.pz]);
  }
}

/**
 * Bore elevation (rad, relative to the line of sight) that makes the bullet
 * cross the sight line again at `zero` metres. Sight is `sightHeight` above bore.
 */
export function zeroAngle(bal: Ballistics): number {
  let lo = -0.01, hi = 0.02;
  for (let i = 0; i < 40; i++) {
    const a = (lo + hi) / 2;
    const y = heightAt(bal, a, bal.zero, 0);
    if (y > bal.sightHeight) hi = a; else lo = a;
  }
  return (lo + hi) / 2;
}

/** height of the bullet above the bore line origin at horizontal distance x (no wind) */
function heightAt(bal: Ballistics, angle: number, x: number, windX: number): number {
  const b: Bullet = { px: 0, py: 0, pz: 0, vx: 0, vy: Math.sin(angle) * bal.mv, vz: Math.cos(angle) * bal.mv, t: 0, dist: 0, alive: true };
  while (b.pz < x && b.t < 4) stepBullet(b, 0.002, bal.k, windX, 0);
  return b.py;
}

export interface TrajectoryRow {
  range: number;        // m
  dropCm: number;       // below the line of sight (negative = above)
  dropMil: number;      // holdover in milliradians
  driftCm: number;      // drift in a 4 m/s (≈ 9 mph) full-value crosswind
  driftMil: number;
  velocity: number;     // m/s
  energyJ: number;
  time: number;         // s
}

/** Trajectory table relative to the line of sight for a rifle zeroed at bal.zero. */
export function trajectoryTable(bal: Ballistics, ranges: number[] = [0, 50, 100, 150, 200, 250, 300, 350, 400, 500], crosswind = 4): TrajectoryRow[] {
  const a = zeroAngle(bal);
  const rows: TrajectoryRow[] = [];
  const b: Bullet = { px: 0, py: 0, pz: 0, vx: 0, vy: Math.sin(a) * bal.mv, vz: Math.cos(a) * bal.mv, t: 0, dist: 0, alive: true };
  const bw: Bullet = { ...b };
  for (const r of ranges) {
    while (b.pz < r && b.t < 5) stepBullet(b, 0.001, bal.k, 0, 0);
    while (bw.pz < r && bw.t < 5) stepBullet(bw, 0.001, bal.k, crosswind, 0);
    const los = bal.sightHeight; // line of sight is parallel to the bore datum, sightHeight above
    const drop = (los - b.py) * 100;
    const v = speed(b);
    rows.push({
      range: r,
      dropCm: r === 0 ? bal.sightHeight * 100 : drop,
      dropMil: r === 0 ? 0 : (drop / 100) / r * 1000,
      driftCm: bw.px * 100,
      driftMil: r === 0 ? 0 : bw.px / r * 1000,
      velocity: v,
      energyJ: 0.5 * bal.massKg * v * v,
      time: b.t,
    });
  }
  return rows;
}

/** Launch a bullet from the eye along a unit aim direction, applying the zero angle about the aim's right axis. */
export function launchBullet(bal: Ballistics, eye: [number, number, number], aim: [number, number, number], zero: number): Bullet {
  // bore sits sightHeight below the sight line
  const [ax, ay, az] = aim;
  // right vector (horizontal) and up vector of the aim frame
  let rx = -az, rz = ax; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
  const ux = -ay * rz, uy = rz * ax - rx * az, uz = ay * rx;
  // tilt aim upward by `zero` radians
  const c = Math.cos(zero), s = Math.sin(zero);
  const dx = ax * c + ux * s, dy = ay * c + uy * s, dz = az * c + uz * s;
  return {
    px: eye[0] - ux * bal.sightHeight, py: eye[1] - uy * bal.sightHeight, pz: eye[2] - uz * bal.sightHeight,
    vx: dx * bal.mv, vy: dy * bal.mv, vz: dz * bal.mv, t: 0, dist: 0, alive: true,
  };
}
