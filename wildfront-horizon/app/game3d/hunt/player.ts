// The hunter: first-person movement over the heightfield with stances,
// stamina, heart rate, collision, wading, reserve boundary, elevated stands,
// and the noise / visibility values the wildlife senses react to.

import * as THREE from "three";
import { clamp, clamp01, damp, lerp, smoothstep } from "../core/math.ts";
import { heightAt, maskAt, surfaceAt, waterLevelAt } from "../world/terrain-gen.ts";
import { deckHeightAt } from "../world/structures.ts";
import { STANDING_EYE } from "../blueprints/assembly.ts";
import type { World } from "../world/world.ts";

export type Stance = "stand" | "crouch" | "prone";
export const EYE: Record<Stance, number> = { stand: STANDING_EYE, crouch: 1.05, prone: 0.38 };
const SPEED: Record<Stance, number> = { stand: 3.1, crouch: 1.55, prone: 0.6 };

/** A climbable or enterable spot. `y` is the floor the hunter stands or sits on; `r` how far they can
 *  shift around inside it (0 = seated); `eye` a fixed seated eye height, or null to follow the stance;
 *  `scent` scales how strongly game downwind can smell you from there; `rot` is the structure's
 *  heading (its blueprint +Z, e.g. a blind's front window, faces yaw = rot + π). */
export interface Perch {
  x: number; z: number; y: number; r: number; name: string; exitX: number; exitZ: number;
  kind: "tower" | "stand" | "blind"; eye: number | null; scent: number; rot: number;
}

export class Player {
  pos = new THREE.Vector3();     // feet
  yaw = 0;
  pitch = 0;
  vel = new THREE.Vector2();
  stance: Stance = "stand";
  eye = EYE.stand;
  stamina = 100;
  heart = 72;                    // bpm
  sprinting = false;
  speed = 0;
  noise = 0;                     // current noise radius (m)
  visibility = 0.5;              // 0..1 how exposed the hunter is
  cover = 0;                     // concealment from grass / brush
  bob = 0;
  bobAmp = 0;
  stepAcc = 0;
  surface: ReturnType<typeof surfaceAt> = "grass";
  wading = 0;
  perch: Perch | null = null;
  boundaryWarn = 0;
  distanceWalked = 0;
  onStep?: (surface: string, loud: number) => void;
  private world: World;
  private half: number;
  constructor(world: World, x: number, z: number, yaw: number) {
    this.world = world;
    this.half = world.terrain.half;
    this.pos.set(x, heightAt(world.terrain, x, z), z);
    this.yaw = yaw;
  }

  setStance(s: Stance) { if (this.perch && s === "prone") return; this.stance = s; }
  toggleCrouch() { this.setStance(this.stance === "crouch" ? "stand" : "crouch"); }
  toggleProne() { this.setStance(this.stance === "prone" ? "crouch" : "prone"); }

  eyePosition(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + this.eye + this.bob, this.pos.z);
  }
  forward(out = new THREE.Vector3()) { return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); }

  look(dx: number, dy: number, scopeFactor: number) {
    const k = 0.0022 * scopeFactor;
    this.yaw -= dx * k;
    this.pitch = clamp(this.pitch - dy * k, -1.35, 1.35);
  }

  update(dt: number, move: { x: number; y: number }, wantSprint: boolean, aiming: boolean, env: { noiseMask: () => number; visibility: () => number; lightLevel: () => number }, camo: number) {
    const t = this.world.terrain;
    // ---- movement
    const mag = Math.min(1, Math.hypot(move.x, move.y));
    const canSprint = wantSprint && !aiming && this.stance === "stand" && this.stamina > 5 && move.y > 0.2 && !this.perch;
    this.sprinting = canSprint;
    let base = SPEED[this.stance] * (canSprint ? 1.95 : 1) * (aiming ? 0.62 : 1);
    if (this.wading > 0.2) base *= lerp(0.75, 0.4, clamp01((this.wading - 0.2) / 0.8));
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const fx = -sy, fz = -cy, rx = cy, rz = -sy;
    const tx = (fx * move.y + rx * move.x) * base, tz = (fz * move.y + rz * move.x) * base;
    this.vel.x = damp(this.vel.x, tx, mag > 0 ? 9 : 12, dt);
    this.vel.y = damp(this.vel.y, tz, mag > 0 ? 9 : 12, dt);
    const pc = this.perch;
    if (pc && pc.r <= 0) this.vel.set(0, 0);       // seated: the stand's swivel seat
    else if (pc) this.vel.multiplyScalar(0.5);      // shuffling around a lookout cab / blind
    let nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.y * dt;
    if (pc) {
      // stay inside the cab / blind
      const dx = nx - pc.x, dz = nz - pc.z, d = Math.hypot(dx, dz);
      if (d > pc.r) { nx = pc.x + (pc.r > 0 ? dx / d * pc.r : 0); nz = pc.z + (pc.r > 0 ? dz / d * pc.r : 0); }
    } else {
      // slope limit: refuse to climb faces steeper than ~38°
      const h0 = this.pos.y;
      const h1 = Math.max(heightAt(t, nx, nz), deckHeightAt(this.world.decks, nx, nz) ?? -Infinity);
      const run = Math.hypot(nx - this.pos.x, nz - this.pos.z);
      if (run > 1e-4 && (h1 - h0) / run > 0.78) { nx = this.pos.x; nz = this.pos.z; this.vel.multiplyScalar(0.3); }
      // deep water stops the hunter (bridges excepted)
      const wl = waterLevelAt(t, nx, nz);
      const onDeck = deckHeightAt(this.world.decks, nx, nz);
      if (onDeck === null && wl !== null && wl - h1 > 1.15) { nx = this.pos.x; nz = this.pos.z; this.vel.set(0, 0); }
      // colliders (trunks, boulders, structures)
      [nx, nz] = this.world.colliders.resolve(nx, nz, this.stance === "prone" ? 0.45 : 0.32, this.pos.y);
    }
    // reserve boundary
    const lim = this.half - 32;
    this.boundaryWarn = smoothstep(lim - 25, lim, Math.max(Math.abs(nx), Math.abs(nz)));
    nx = clamp(nx, -lim, lim); nz = clamp(nz, -lim, lim);
    const moved = Math.hypot(nx - this.pos.x, nz - this.pos.z);
    this.distanceWalked += moved;
    this.speed = moved / Math.max(dt, 1e-4);
    this.pos.x = nx; this.pos.z = nz;
    const deck = deckHeightAt(this.world.decks, nx, nz);
    const ground = Math.max(heightAt(t, nx, nz), deck ?? -Infinity);
    this.pos.y = this.perch ? this.perch.y : ground;
    const wlHere = waterLevelAt(t, nx, nz);
    this.wading = !this.perch && deck === null && wlHere !== null ? Math.max(0, wlHere - ground) : 0;
    this.surface = this.wading > 0.05 ? "water" : surfaceAt(t, nx, nz);
    // ---- stance eye height (smooth)
    const eyeTarget = pc && pc.eye !== null ? pc.eye : EYE[this.stance] - (this.stance === "stand" ? Math.min(this.wading, 0.5) * 0.3 : 0);
    this.eye = damp(this.eye, eyeTarget, 7, dt);
    // ---- head bob & footsteps
    const moving = this.speed > 0.25;
    const freq = this.sprinting ? 2.6 : this.stance === "prone" ? 0.9 : this.stance === "crouch" ? 1.5 : 1.85;
    this.bobAmp = damp(this.bobAmp, moving ? (this.sprinting ? 0.055 : this.stance === "stand" ? 0.03 : 0.018) : 0, 8, dt);
    if (moving) {
      this.stepAcc += dt * freq;
      if (this.stepAcc >= 1) {
        this.stepAcc -= 1;
        this.onStep?.(this.surface, this.sprinting ? 1 : this.stance === "stand" ? 0.6 : this.stance === "crouch" ? 0.3 : 0.12);
      }
    }
    this.bob = Math.sin(this.stepAcc * Math.PI * 2) * this.bobAmp;
    // ---- stamina & heart rate
    if (this.sprinting) this.stamina = Math.max(0, this.stamina - 11 * dt);
    else this.stamina = Math.min(100, this.stamina + (moving ? 5 : 9) * dt);
    const targetHR = this.sprinting ? 150 : moving ? (this.stance === "stand" ? 96 : 88) : 70;
    this.heart = damp(this.heart, targetHR, this.heart < targetHR ? 0.35 : 0.12, dt);
    // ---- noise radius the wildlife can hear
    const surfK: Record<string, number> = { grass: 1, dirt: 0.85, rock: 1.15, sand: 0.8, snow: 0.75, water: 1.6 };
    let noise = 0;
    if (moving) noise = this.sprinting ? 75 : this.stance === "stand" ? 26 : this.stance === "crouch" ? 11 : 4;
    noise *= (surfK[this.surface] ?? 1) * (0.55 + 0.45 * clamp01(this.speed / Math.max(0.5, SPEED[this.stance])));
    noise *= 1 - env.noiseMask() * 0.55;
    this.noise = damp(this.noise, noise, 6, dt);
    // ---- visibility / concealment
    const grass = maskAt(t, t.grass, nx, nz), forest = maskAt(t, t.forest, nx, nz);
    const stanceK = this.stance === "stand" ? 1 : this.stance === "crouch" ? 0.55 : 0.25;
    const conceal = clamp01(grass * (this.stance === "stand" ? 0.15 : this.stance === "crouch" ? 0.45 : 0.85) + forest * 0.35);
    this.cover = conceal;
    const motion = moving ? (this.sprinting ? 1.35 : 1.0) : 0.45;
    const perchK = this.perch ? 0.55 : 1;
    this.visibility = clamp01(stanceK * motion * (1 - conceal * 0.7) * env.lightLevel() * env.visibility() * (1 - camo) * perchK);
  }
}
