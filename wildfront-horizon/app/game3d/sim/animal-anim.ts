// Procedural quadruped animator. Drives the blueprint skeleton directly:
// walk (lateral sequence), trot (diagonal pairs), gallop (transverse) and the
// mule-deer stot, blended by speed; plus graze / alert / bedded / dead /
// wounded overlays, head look-at, ears, tail and breathing.

import { clamp, clamp01, lerp, smoothstep } from "../core/math.ts";
import type * as THREE from "three";
import type { AnimalObject } from "../models/animal-mesh.ts";

export type Gait = "walk" | "trot" | "gallop" | "stot";

export interface GaitTable { offsets: Record<"FL" | "FR" | "HL" | "HR", number>; beta: number; swingF: number; swingH: number; flexF: number; flexH: number; bob: number; pitch: number }
export const GAITS: Record<Gait, GaitTable> = {
  walk: { offsets: { HL: 0, FL: 0.25, HR: 0.5, FR: 0.75 }, beta: 0.64, swingF: 0.30, swingH: 0.28, flexF: 1.05, flexH: 0.85, bob: 0.012, pitch: 0.012 },
  trot: { offsets: { FL: 0, HR: 0, FR: 0.5, HL: 0.5 }, beta: 0.46, swingF: 0.42, swingH: 0.40, flexF: 1.45, flexH: 1.1, bob: 0.035, pitch: 0.02 },
  gallop: { offsets: { HL: 0, HR: 0.1, FL: 0.55, FR: 0.65 }, beta: 0.34, swingF: 0.72, swingH: 0.70, flexF: 1.9, flexH: 1.45, bob: 0.09, pitch: 0.11 },
  stot: { offsets: { HL: 0, HR: 0.02, FL: 0.04, FR: 0.06 }, beta: 0.30, swingF: 0.25, swingH: 0.30, flexF: 1.7, flexH: 1.5, bob: 0.0, pitch: 0.05 },
};

export interface AnimPose {
  speed: number;
  phase: number;          // gait cycle 0..1 (advanced by the animator if dt given)
  gait?: Gait;            // force a gait (preview); otherwise picked by speed
  graze: number;
  alert: number;
  bed: number;
  dead: number;
  deadSide: number;       // +1 falls to its left, -1 to its right
  wounded: number;
  limpLeg: number;        // 0..3
  lookYaw: number;
  lookPitch: number;
  earL: number; earR: number;
  tail: number;           // -1 down … +1 raised
  tailFlick: number;
  breathe: number;
  slope: number;          // terrain pitch (rad, + nose up)
  t: number;              // elapsed seconds (idle motion)
}

export function newPose(): AnimPose {
  return { speed: 0, phase: 0, graze: 0, alert: 0, bed: 0, dead: 0, deadSide: 1, wounded: 0, limpLeg: 0, lookYaw: 0, lookPitch: 0, earL: 0, earR: 0, tail: 0, tailFlick: 0, breathe: 0, slope: 0, t: 0 };
}

const LEGS: ("FL" | "FR" | "HL" | "HR")[] = ["FL", "FR", "HL", "HR"];

export class AnimalAnimator {
  a: AnimalObject;
  private stride: { walk: number; trot: number; gallop: number };
  private speeds: { walk: number; trot: number; gallop: number };
  private stot: boolean;
  private leg: Record<string, { up: THREE.Bone; mid: THREE.Bone; low: THREE.Bone; foot: THREE.Bone; front: boolean }> = {};
  private b: Record<string, THREE.Bone>;
  private restY: number;
  private bodyHalfWidth: number;
  /** neck1 / neck2 / head rotations that put the muzzle on the ground (solved per blueprint) */
  grazeAng: [number, number, number];
  constructor(a: AnimalObject) {
    this.a = a;
    const g = a.bp.gait;
    this.stride = { walk: g.walk.stride, trot: g.trot.stride, gallop: g.gallop.stride };
    this.speeds = { walk: g.walk.speed, trot: g.trot.speed, gallop: g.gallop.speed };
    this.stot = !!g.stot;
    this.b = a.bones;
    for (const id of LEGS) {
      const front = id[0] === "F";
      const side = id[1];
      const spec = a.bp.legs.find(l => l.id === (front ? "F" : "H"))!;
      const names = spec.bones.map(n => n + side);
      this.leg[id] = { up: this.b[names[0]], mid: this.b[names[1]], low: this.b[names[2]], foot: this.b[names[3]], front };
    }
    this.restY = this.b.root.position.y;
    let maxW = 0; for (const k of a.bp.body) maxW = Math.max(maxW, k.w);
    this.bodyHalfWidth = maxW;
    this.grazeAng = solveGraze(a);
  }

  /** Gait weights for a speed. */
  gaitWeights(speed: number, force?: Gait): Record<Gait, number> {
    const w: Record<Gait, number> = { walk: 0, trot: 0, gallop: 0, stot: 0 };
    if (force) { w[force] = 1; return w; }
    const s = this.speeds;
    if (speed <= s.walk * 1.25) w.walk = 1;
    else if (speed < s.trot) { const t = smoothstep(s.walk * 1.25, s.trot, speed); w.walk = 1 - t; w.trot = t; }
    else if (speed < (s.trot + s.gallop) * 0.45) { const t = smoothstep(s.trot, (s.trot + s.gallop) * 0.45, speed); w.trot = 1 - t; w.gallop = t; }
    else w.gallop = 1;
    return w;
  }

  strideFor(w: Record<Gait, number>): number {
    return w.walk * this.stride.walk + w.trot * this.stride.trot + w.gallop * this.stride.gallop + w.stot * this.stride.gallop * 0.8;
  }

  /** Advance the gait phase from speed and dt. */
  advance(p: AnimPose, dt: number) {
    const w = this.gaitWeights(p.speed, p.gait);
    const stride = this.strideFor(w);
    const moving = Math.max(p.speed, 0);
    p.phase = (p.phase + (moving / Math.max(0.3, stride)) * dt) % 1;
    p.t += dt;
  }

  apply(p: AnimPose) {
    const b = this.b;
    const w = this.gaitWeights(p.speed, p.gait);
    const move = clamp01(p.speed / 0.25) * (1 - p.dead) * (1 - p.bed);
    const dead = smoothstep(0, 1, p.dead);
    const bed = smoothstep(0, 1, p.bed) * (1 - dead);
    // ---------------- legs
    for (const id of LEGS) {
      const L = this.leg[id];
      let up = 0, mid = 0, low = 0, foot = 0, bob = 0;
      for (const g of ["walk", "trot", "gallop", "stot"] as Gait[]) {
        const wt = w[g];
        if (wt <= 0) continue;
        const T = GAITS[g];
        const ph = (p.phase + T.offsets[id]) % 1;
        const A = (L.front ? T.swingF : T.swingH) * (id === LEGS[p.limpLeg] ? 1 - 0.6 * p.wounded : 1);
        let sw: number, flex: number;
        if (ph < T.beta) { const s = ph / T.beta; sw = lerp(-A, A, s); flex = 0; }
        else { const s = (ph - T.beta) / (1 - T.beta); sw = lerp(A, -A, smoothstep(0, 1, s)); flex = Math.pow(Math.sin(Math.PI * s), 0.8); }
        const F = L.front ? T.flexF : T.flexH;
        if (L.front) {
          up += wt * sw;
          mid += wt * (-0.25 * flex * F * 0.4);
          low += wt * (flex * F);
          foot += wt * (flex * F * 0.45 - (ph < T.beta ? 0.12 * Math.sin(Math.PI * ph / T.beta) : 0));
        } else {
          up += wt * sw * 0.9;
          mid += wt * (flex * F * 0.42 + sw * 0.25);
          low += wt * (-flex * F * 0.75 - sw * 0.2);
          foot += wt * (flex * F * 0.55 - (ph < T.beta ? 0.1 * Math.sin(Math.PI * ph / T.beta) : 0));
        }
        bob += wt * T.bob;
      }
      up *= move; mid *= move; low *= move; foot *= move;
      // bedded: fold legs under the body
      if (bed > 0) {
        if (L.front) { up = lerp(up, -0.45, bed); mid = lerp(mid, -0.95, bed); low = lerp(low, 2.75, bed); foot = lerp(foot, 0.35, bed); }
        else { up = lerp(up, -0.75, bed); mid = lerp(mid, 1.35, bed); low = lerp(low, -2.25, bed); foot = lerp(foot, 0.55, bed); }
      }
      // dead: legs relax, slightly extended and splayed
      if (dead > 0) {
        const s = id.endsWith("L") ? 1 : -1;
        if (L.front) { up = lerp(up, -0.35 + 0.1 * s, dead); mid = lerp(mid, 0.1, dead); low = lerp(low, 0.25, dead); foot = lerp(foot, 0.35, dead); }
        else { up = lerp(up, 0.45 + 0.08 * s, dead); mid = lerp(mid, 0.15, dead); low = lerp(low, -0.1, dead); foot = lerp(foot, 0.3, dead); }
      }
      L.up.rotation.set(up, 0, 0);
      L.mid.rotation.set(mid, 0, 0);
      L.low.rotation.set(low, 0, 0);
      L.foot.rotation.set(foot, 0, 0);
      void bob;
    }
    // ---------------- body
    let bobY = 0, pitch = 0;
    for (const g of ["walk", "trot", "gallop", "stot"] as Gait[]) {
      const wt = w[g]; if (wt <= 0) continue;
      const T = GAITS[g];
      if (g === "walk") bobY += wt * T.bob * (0.5 - 0.5 * Math.cos(4 * Math.PI * p.phase));
      else if (g === "trot") bobY += wt * T.bob * Math.abs(Math.sin(2 * Math.PI * p.phase));
      else if (g === "gallop") { bobY += wt * T.bob * (0.5 + 0.5 * Math.sin(2 * Math.PI * (p.phase - 0.15))); pitch += wt * T.pitch * Math.sin(2 * Math.PI * (p.phase + 0.1)); }
      else if (g === "stot") { const air = Math.max(0, Math.sin(Math.PI * clamp((p.phase - 0.3) / 0.7, 0, 1))); bobY += wt * 0.55 * air; pitch += wt * 0.06 * Math.sin(2 * Math.PI * p.phase); }
    }
    bobY *= move; pitch *= move;
    const root = b.root;
    const H = this.a.bp.legs[0].joints[0].p[1];
    const bedDrop = -0.56 * H * bed;
    root.position.set(0, this.restY + bobY + bedDrop + dead * (this.bodyHalfWidth * 1.05 - 0.02) - dead * 0.0, 0);
    // fall to the side: rotate about the forward axis; lift by body half-width so the flank rests on the ground
    const side = p.deadSide >= 0 ? 1 : -1;
    root.rotation.set(-p.slope * (1 - dead) + pitch, 0, side * dead * (Math.PI / 2 - 0.12));
    if (dead > 0) {
      // shift so the animal lies roughly where it stood
      root.position.x = side * dead * (H * 0.85) * 0.0;
    }
    // breathing
    const br = 1 + 0.012 * Math.sin(p.t * (1.6 + 2.5 * p.alert + 3.5 * clamp01(p.speed / 6))) * (1 - dead);
    b.chest.scale.set(br, br, 1);
    // spine flex for gallop
    b.spine.rotation.set(-pitch * 0.4, 0, 0);
    // ---------------- neck & head
    const grz = smoothstep(0, 1, p.graze) * (1 - dead) * (1 - bed * 0.6);
    const alt = smoothstep(0, 1, p.alert) * (1 - dead);
    const idleNod = move * (w.walk * 0.05 * Math.sin(4 * Math.PI * p.phase) + w.gallop * 0.12 * Math.sin(2 * Math.PI * (p.phase + 0.3)));
    const ga = this.grazeAng;
    let n1 = 0.05 + grz * ga[0] - alt * 0.22 + idleNod * 0.5 + bed * 0.15;
    let n2 = 0.0 + grz * ga[1] - alt * 0.08 + idleNod * 0.4;
    let hd = 0.0 + grz * ga[2] - alt * 0.18 + idleNod * 0.3 - bed * 0.1;
    if (dead > 0) { n1 = lerp(n1, 0.55, dead); n2 = lerp(n2, 0.35, dead); hd = lerp(hd, 0.2, dead); }
    // chewing / browsing micro motion while grazing
    hd += grz * 0.06 * Math.sin(p.t * 7.0);
    const yaw = clamp(p.lookYaw, -1.6, 1.6) * (1 - dead) * (1 - grz * 0.6);
    const lp = clamp(p.lookPitch, -0.6, 0.5) * (1 - dead);
    b.neck1.rotation.set(n1 - lp * 0.4, yaw * 0.4, 0);
    b.neck2.rotation.set(n2 - lp * 0.3, yaw * 0.3, 0);
    b.head.rotation.set(hd - lp * 0.3, yaw * 0.3, -yaw * 0.08);
    // ---------------- ears & tail
    const earFwd = alt * 0.45;
    if (b.earL) b.earL.rotation.set(-earFwd * 0.3 + p.earL * 0.5, earFwd + p.earL * 0.3, -0.1 * dead);
    if (b.earR) b.earR.rotation.set(-earFwd * 0.3 + p.earR * 0.5, -earFwd - p.earR * 0.3, 0.1 * dead);
    if (b.tail1) {
      const tl = clamp(p.tail, -1, 1);
      b.tail1.rotation.set(-tl * 0.6 + 0.06 * Math.sin(p.t * 1.3), p.tailFlick * 0.5 * Math.sin(p.t * 9), 0);
      if (b.tail2) b.tail2.rotation.set(-tl * 0.4, p.tailFlick * 0.3 * Math.sin(p.t * 9 + 1), 0);
    }
  }
}

/**
 * Side-plane solve for the grazing pose: head points ~80° down, neck angle
 * chosen so the muzzle reaches the ground (clamped to near-vertical).
 */
export function solveGraze(a: AnimalObject): [number, number, number] {
  const bs = a.build.bones;
  const P = (n: string) => { const b = bs.find(x => x.name === n)!; return [b.p[2], b.p[1]] as [number, number]; };
  const p1 = P("neck1"), p3 = P("head");
  const tip = a.bp.body[a.bp.body.length - 1].p;
  const Ln = Math.hypot(p3[0] - p1[0], p3[1] - p1[1]);
  const Lh = Math.hypot(tip[0] - p3[0], tip[1] - p3[1]);
  const restNeck = Math.atan2(p3[1] - p1[1], p3[0] - p1[0]);
  const restHead = Math.atan2(tip[1] - p3[1], tip[0] - p3[0]);
  const headTarget = -1.36;
  const yTarget = 0.07;
  const sn = clamp((yTarget - Lh * Math.sin(headTarget) - p1[1]) / Ln, -0.985, 0.95);
  const phiN = Math.asin(sn);
  const th1 = restNeck - phiN - 0.05;
  const th3 = restHead - (th1 + 0.05) - headTarget;
  return [th1 * 0.78, th1 * 0.22, th3];
}

/** Static pose for previews and blueprint gait sheets. */
export function posePreview(a: AnimalObject, pose: string, phase: number) {
  const anim = new AnimalAnimator(a);
  const p = newPose();
  p.phase = phase;
  p.t = phase * 2;
  switch (pose) {
    case "walk": p.gait = "walk"; p.speed = a.bp.gait.walk.speed; break;
    case "trot": p.gait = "trot"; p.speed = a.bp.gait.trot.speed; break;
    case "gallop": p.gait = "gallop"; p.speed = a.bp.gait.gallop.speed; break;
    case "stot": p.gait = "stot"; p.speed = 6; break;
    case "graze": p.graze = 1; break;
    case "alert": p.alert = 1; p.earL = 0; p.earR = 0; break;
    case "bed": p.bed = 1; break;
    case "dead": p.dead = 1; break;
    case "look": p.alert = 1; p.lookYaw = 0.9; break;
  }
  anim.apply(p);
  a.root.updateMatrixWorld(true);
}
