// Rifle handling + first-person viewmodel: hip / aim-down-sights blend into
// the scope, Q zoom cycle (1× → low → high, v2.0.3 behaviour), wheel zoom,
// breath hold (steady meter, v2.0.3 drain/recover rates), sway from stance,
// heart rate and wind, recoil, bolt cycling, reload, binoculars.

import * as THREE from "three";
import { clamp, damp, lerp, smoothstep } from "../core/math.ts";
import { Simplex2 } from "../core/noise.ts";
import type { RifleBlueprint } from "../blueprints/gear.ts";
import { buildAssembly } from "../models/assembly-builder.ts";
import { zeroAngle } from "./ballistics.ts";
import type { Player } from "./player.ts";

export type WeaponState = "ready" | "cycling" | "reloading" | "empty";

export interface Upgrades { optics: number; stability: number; tracking: number }

/** First-person arms built in the rifle's blueprint frame (+Z muzzle, +X shooter's left). */
function buildArms(bp: RifleBlueprint, sleeve: THREE.Material, glove: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const tube = (pts: [number, number, number][], r0: number, r1: number, mat: THREE.Material) => {
    const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
    const geo = new THREE.TubeGeometry(curve, 16, 1, 10, false);
    // taper: scale ring radius along the tube
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    const segs = 16, radial = 10;
    for (let i = 0; i <= segs; i++) {
      const c = curve.getPointAt(i / segs);
      const r = r0 + (r1 - r0) * (i / segs);
      for (let k = 0; k <= radial; k++) {
        const vi = i * (radial + 1) + k;
        const v = new THREE.Vector3().fromBufferAttribute(pos, vi).sub(c).multiplyScalar(r).add(c);
        pos.setXYZ(vi, v.x, v.y, v.z);
      }
    }
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, mat);
  };
  const blob = (c: [number, number, number], r: [number, number, number], mat: THREE.Material) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), mat); m.position.set(...c); m.scale.set(...r); return m; };
  const band = (c: [number, number, number], radius: number, tubeR: number, arc: number, rotZ: number, mat: THREE.Material) => { const m = new THREE.Mesh(new THREE.TorusGeometry(radius, tubeR, 8, 18, arc), mat); m.position.set(...c); m.rotation.z = rotZ; return m; };
  const fz = bp.anchors.forend[2], fy = bp.anchors.forend[1];
  // left hand cradles the forend from below; fingers wrap the far (right, −X) side
  g.add(blob([0.004, fy - 0.03, fz], [0.034, 0.022, 0.055], glove));
  g.add(band([0, fy - 0.012, fz + 0.012], 0.03, 0.0115, Math.PI * 1.05, Math.PI * 1.02, glove));
  g.add(band([0, fy - 0.012, fz - 0.016], 0.03, 0.011, Math.PI * 1.0, Math.PI * 1.04, glove));
  g.add(blob([0.03, fy - 0.004, fz - 0.03], [0.012, 0.012, 0.035], glove));                // thumb on the near side
  g.add(tube([[0.01, fy - 0.045, fz - 0.05], [0.06, fy - 0.17, fz - 0.22], [0.16, fy - 0.36, fz - 0.42], [0.3, fy - 0.55, fz - 0.62]], 0.034, 0.06, sleeve));
  // right hand on the pistol grip, index finger toward the trigger
  const gz = bp.anchors.grip[2], gy = bp.anchors.grip[1];
  g.add(blob([-0.006, gy + 0.004, gz + 0.004], [0.034, 0.048, 0.042], glove));
  g.add(band([0, gy - 0.008, gz + 0.018], 0.026, 0.011, Math.PI * 1.1, -Math.PI * 0.05, glove));
  g.add(tube([[0, -0.068, 0.0], [0.004, -0.074, 0.018]], 0.0085, 0.008, glove));          // trigger finger
  g.add(blob([0.016, gy + 0.05, gz + 0.03], [0.011, 0.011, 0.03], glove));               // thumb over the wrist
  g.add(tube([[-0.01, gy - 0.02, gz - 0.05], [-0.07, gy - 0.12, gz - 0.2], [-0.2, gy - 0.3, gz - 0.38], [-0.34, gy - 0.48, gz - 0.55]], 0.036, 0.062, sleeve));
  g.traverse(o => { (o as THREE.Mesh).castShadow = false; });
  return g;
}

export class Weapon {
  bp: RifleBlueprint;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(52, 1, 0.01, 10);
  root = new THREE.Group();        // camera-space transform
  rifle: THREE.Group;
  groups: Record<string, THREE.Group>;
  ammo: number;
  reserve: number;
  state: WeaponState = "ready";
  stateT = 0;
  zoomLevel = 0;                  // 0 = no scope (1×), 1 = low, 2 = high  (v2.0.3 semantics)
  mag = 1;
  lastScopedMag: number;
  ads = 0;                        // 0 hip … 1 through the scope
  aiming = false;
  steady = false;
  steadyMeter = 100;
  binoculars = false;
  bino = 0;
  sway = new THREE.Vector2();     // current aim offset (rad) applied to the camera when scoped
  recoil = 0;
  recoilV = 0;
  zero: number;
  upgrades: Upgrades;
  private noise = new Simplex2(97);
  private t = 0;
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private flash: THREE.PointLight;
  private eyeAnchor: THREE.Vector3;
  shotsFired = 0;
  /** difficulty assist: sway multiplier */
  swayScale = 1;
  constructor(bp: RifleBlueprint, upgrades: Upgrades, ammo = 5, reserve = 15, envMap?: THREE.Texture | null) {
    this.bp = bp;
    this.upgrades = upgrades;
    this.ammo = ammo; this.reserve = reserve;
    this.zero = zeroAngle(bp.ballistics);
    this.lastScopedMag = this.maxMag();
    const a = buildAssembly(bp, {});
    this.rifle = a.root; this.groups = a.groups;
    if (envMap) a.meshes.forEach(m => { (m.material as THREE.MeshStandardMaterial).envMap = envMap; });
    // blueprint frame: muzzle +Z, left +X → camera frame: muzzle −Z
    this.rifle.rotation.y = Math.PI;
    const sleeveMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.16, 0.2, 0.14, THREE.SRGBColorSpace), roughness: 0.9 });
    const gloveMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.12, 0.1, 0.08, THREE.SRGBColorSpace), roughness: 0.75 });
    this.rifle.add(buildArms(bp, sleeveMat, gloveMat));
    this.root.add(this.rifle);
    this.scene.add(this.root);
    this.eyeAnchor = new THREE.Vector3(...bp.anchors.eye);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.flash = new THREE.PointLight(0xffc070, 0, 3, 2);
    this.scene.add(this.hemi, this.sun, this.flash);
    this.camera.add(this.root);
    this.scene.add(this.camera);
  }

  maxMag() { return Math.min(this.bp.scope.maxMag + this.upgrades.optics * 1.5, 16); }
  minMag() { return this.bp.scope.minMag; }
  /** magnification shown in the scope */
  magFor(level: number) { return level === 0 ? 1 : level === 1 ? Math.max(this.minMag(), 3) : Math.max(6, Math.min(this.maxMag(), 6 + this.upgrades.optics * 1.5)); }
  get scoped() { return this.zoomLevel > 0 && this.ads > 0.82 && !this.binoculars; }

  /** Q: cycle 1× → low → high → 1× (v2.0.3). */
  cycleZoom() { this.zoomLevel = (this.zoomLevel + 1) % 3; this.mag = this.magFor(this.zoomLevel); if (this.zoomLevel > 0) this.lastScopedMag = this.mag; this.aiming = this.zoomLevel > 0; if (!this.aiming) this.steady = false; }
  setAim(on: boolean) {
    if (on) { if (this.zoomLevel === 0) { this.zoomLevel = this.lastScopedMag >= 6 ? 2 : 1; this.mag = this.lastScopedMag; } this.aiming = true; }
    else { this.aiming = false; this.zoomLevel = 0; this.steady = false; }
  }
  wheelZoom(dir: number) {
    if (this.zoomLevel === 0) return;
    this.mag = clamp(this.mag * (dir > 0 ? 1.15 : 1 / 1.15), this.minMag(), this.maxMag());
    this.zoomLevel = this.mag >= 5.5 ? 2 : 1;
    this.lastScopedMag = this.mag;
  }
  setSteady(v: boolean) { this.steady = v && this.scoped && this.steadyMeter > 3; }
  toggleBinoculars() { this.binoculars = !this.binoculars; if (this.binoculars) { this.aiming = false; this.zoomLevel = 0; this.steady = false; } }

  canFire() { return this.state === "ready" && this.bino < 0.2; }

  /** Returns true if a round was fired. */
  fire(): boolean {
    if (!this.canFire()) return false;
    if (this.ammo <= 0) return false;
    this.ammo--;
    this.shotsFired++;
    this.recoilV += 4.5 * this.bp.ballistics.recoil;
    this.state = this.ammo > 0 ? "cycling" : "empty";
    this.stateT = 0;
    this.flash.intensity = 6;
    return true;
  }
  /** v2.0.3 reload rule: fills the magazine from reserve; time = max(650, 1320 − stability·150) ms. */
  reload(): boolean {
    if (this.state === "reloading" || this.ammo >= this.bp.ballistics.magazine || this.reserve <= 0) return false;
    this.state = "reloading"; this.stateT = 0;
    this.aiming = false; this.zoomLevel = 0;
    return true;
  }
  reloadTime() { return Math.max(650, 1320 - this.upgrades.stability * 150) / 1000; }

  /** Sway amplitude (rad) for the current stance / heart rate / breath. */
  swayAmplitude(p: Player, gust: number): number {
    const stance = p.stance === "prone" ? 0.25 : p.stance === "crouch" ? 0.55 : 1;
    const heart = 1 + Math.max(0, p.heart - 72) / 60;
    const optic = 1 - this.upgrades.optics * 0.17;
    const breath = this.steady ? 0.3 : 1;
    const wind = 1 + (p.stance === "stand" ? gust * 0.25 : gust * 0.08);
    const perch = p.perch ? 0.6 : 1;
    return 0.0042 * stance * heart * optic * breath * wind * perch * this.swayScale;
  }

  update(dt: number, p: Player, gust: number, aspect: number): { onCycleDone: boolean; onReloadDone: boolean } {
    this.t += dt;
    const ev = { onCycleDone: false, onReloadDone: false };
    // state machine
    this.stateT += dt;
    if (this.state === "cycling" && this.stateT > 0.62) { this.state = "ready"; ev.onCycleDone = true; }
    if (this.state === "empty") this.state = "ready";
    if (this.state === "reloading" && this.stateT > this.reloadTime()) {
      const need = this.bp.ballistics.magazine - this.ammo, take = Math.min(need, this.reserve);
      this.ammo += take; this.reserve -= take; this.state = "ready"; ev.onReloadDone = true;
    }
    // steady breath (v2.0.3 rates)
    if (this.steady && this.scoped) { this.steadyMeter = Math.max(0, this.steadyMeter - dt * (18 - this.upgrades.stability * 2.4)); if (this.steadyMeter <= 0) this.steady = false; }
    else this.steadyMeter = Math.min(100, this.steadyMeter + dt * (12 + this.upgrades.stability * 2));
    // ADS / binocular blends
    const wantAds = this.aiming && this.state !== "reloading" && !this.binoculars && !p.sprinting;
    this.ads = damp(this.ads, wantAds ? 1 : 0, wantAds ? 9 : 12, dt);
    this.bino = damp(this.bino, this.binoculars ? 1 : 0, 10, dt);
    // sway (applied to the camera by the hunt session while scoped)
    const amp = this.swayAmplitude(p, gust) * (0.25 + 0.75 * this.ads);
    const tt = this.t * (this.steady ? 0.35 : 0.55);
    this.sway.set(this.noise.noise(tt, 0.5) * amp + Math.sin(this.t * 1.2) * amp * 0.25, this.noise.noise(0.7, tt) * amp * 0.8 + Math.sin(this.t * 2.4 * (p.heart / 72)) * amp * 0.12);
    // recoil spring
    this.recoilV += (-this.recoil * 90 - this.recoilV * 14) * dt;
    this.recoil += this.recoilV * dt;
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 60);
    // ---- viewmodel placement
    this.camera.aspect = aspect; this.camera.updateProjectionMatrix();
    const eye = this.eyeAnchor;
    // rifle rotated 180° about Y: eye anchor (x,y,z) → (−x, y, −z)
    const adsPos = new THREE.Vector3(eye.x, -eye.y, eye.z);
    const hip = new THREE.Vector3(adsPos.x + 0.15, adsPos.y - 0.115, adsPos.z - 0.1);
    const sprint = p.sprinting ? 1 : 0;
    const low = Math.max(this.bino, this.state === "reloading" ? 0.35 : 0, sprint * 0.6);
    const pos = hip.clone().lerp(adsPos, this.ads);
    pos.y -= low * 0.22; pos.x += low * 0.05;
    // bob & breathing
    const bobK = (1 - this.ads * 0.85);
    pos.x += Math.sin(p.stepAcc * Math.PI * 2) * p.bobAmp * 0.5 * bobK;
    pos.y += Math.abs(Math.cos(p.stepAcc * Math.PI * 2)) * p.bobAmp * 0.4 * bobK + Math.sin(this.t * 1.6) * 0.0025 * bobK;
    pos.z += this.recoil * 0.05;
    this.root.position.copy(pos);
    this.root.rotation.set(this.recoil * 0.12 - low * 0.5, sprint * 0.5 * (1 - this.ads), sprint * 0.25 + low * 0.2);
    // bolt animation
    const bolt = this.groups.bolt;
    if (bolt) {
      let lift = 0, back = 0;
      if (this.state === "cycling" || (this.state === "reloading" && this.stateT < 0.5)) {
        const u = this.state === "cycling" ? clamp(this.stateT / 0.62, 0, 1) : clamp(this.stateT / 0.5, 0, 1);
        lift = smoothstep(0, 0.2, u) * (1 - smoothstep(0.8, 1, u));
        back = smoothstep(0.2, 0.45, u) * (1 - smoothstep(0.55, 0.8, u));
      }
      bolt.rotation.z = -lift * 1.05;
      bolt.position.z = -back * 0.085;
    }
    const mag = this.groups.mag;
    if (mag) {
      let drop = 0;
      if (this.state === "reloading") { const u = this.stateT / this.reloadTime(); drop = smoothstep(0.05, 0.3, u) * (1 - smoothstep(0.6, 0.9, u)); }
      mag.position.y = -drop * 0.18;
    }
    this.flash.position.set(0, -0.02, -0.9);
    return ev;
  }

  syncLights(sun: THREE.DirectionalLight, hemi: THREE.HemisphereLight, cameraQuat: THREE.Quaternion) {
    this.hemi.color.copy(hemi.color); this.hemi.groundColor.copy(hemi.groundColor); this.hemi.intensity = hemi.intensity;
    this.sun.color.copy(sun.color); this.sun.intensity = sun.intensity;
    // sun direction into camera space
    const dir = sun.position.clone().sub(sun.target.position).normalize().applyQuaternion(cameraQuat.clone().invert());
    this.sun.position.copy(dir);
  }

  /** Scoped field of view for a magnification: a 40° apparent field divided by the power (close to real riflescope true fields). */
  static fovFor(mag: number, baseFov: number): number {
    if (mag <= 1.01) return baseFov;
    return 2 * Math.atan(Math.tan((Weapon.APPARENT_FOV * Math.PI / 180) / 2) / mag) * 180 / Math.PI;
  }
  static APPARENT_FOV = 40;

  hipSpread(p: Player): number { return (p.stance === "prone" ? 0.8 : p.stance === "crouch" ? 1.2 : 1.8) * Math.PI / 180 * (1 - this.ads * 0.85); }
}

export function lerpAngle(a: number, b: number, t: number) { return lerp(a, b, t); }
