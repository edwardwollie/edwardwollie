// HuntSession — one contract or free hunt in a reserve. Owns the world,
// hunter, rifle, bullets, wildlife, sign and effects; produces HUD snapshots
// and the v2.0.3-compatible shot feedback, stats and results.

import * as THREE from "three";
import { clamp, clamp01, smoothstep, wrapAngle } from "../core/math.ts";
import { mulberry32 } from "../core/rng.ts";
import { RIFLES_BY_ID, RIFLES } from "../blueprints/gear.ts";
import { spawnYaw } from "../blueprints/reserves.ts";
import { WILDLIFE_BY_SPECIES } from "../blueprints/wildlife/index.ts";
import type { Input } from "../engine/input.ts";
import { ATMO } from "../render/atmosphere.ts";
import type { QualitySettings } from "../render/quality.ts";
import { heightAt, normalAt, surfaceAt, waterLevelAt } from "../world/terrain-gen.ts";
import { World } from "../world/world.ts";
import type { TimeKey, WeatherKey } from "../world/environment.ts";
import { AnimalManager, type Animal } from "./animals.ts";
import { launchBullet, speed as bulletSpeed, stepBullet, trajectoryTable, type Bullet } from "./ballistics.ts";
import { Fx, Precipitation } from "./fx.ts";
import { testSegment, type HitResult } from "./hits.ts";
import { Player, type Perch } from "./player.ts";
import { accuracyOf, GRADE_LABEL, gradeHit, harvestCredits, shotPoints, UNLICENSED_PENALTY, type Grade, type Rating } from "./scoring.ts";
import { compassName, describeAge, SignManager } from "./sign.ts";
import { Weapon, type Upgrades } from "./weapon.ts";
import { scentStrength } from "./senses.ts";
import type { GameAudio } from "../audio/audio.ts";
import { buildLandmarks } from "../world/structures.ts";
import { outside } from "../world/colliders.ts";
import { disposeObject } from "../engine/dispose.ts";

export interface HuntConfig {
  mode: "contract" | "free";
  missionId: number;
  name: string;
  reserve: string;
  licensed: string[];
  count: number;
  distinct: boolean;            // grand slam: each species counts once
  time: TimeKey;
  weather: WeatherKey;
  rifleId: string;
  upgrades: Upgrades;
  gear: { camo: number; caller: boolean; scentBlocker: boolean };
  hitSignRealistic: boolean;
  tutorial: boolean;
  seed: number;
  fov: number;
  /** difficulty assist: relaxed = calmer game + less sway; realistic = warier game + more sway */
  assist?: "relaxed" | "standard" | "realistic";
}

export interface TrophyRecord {
  id: string; species: string; label: string; sex: "male" | "female"; score: number; weight: number; rating: Rating;
  grade: Grade; organ: string; distance: number; reserve: string; date: number; seed: number; age: number; oneShot: boolean; credits: number; recovered: boolean;
}

export interface ShotAnalysis {
  species: string; label: string; grade: Grade; organ: string; zone: string; distance: number; dropCm: number; driftCm: number;
  tof: number; impactVelocity: number; energyJ: number; local: [number, number, number]; dir: [number, number, number]; animalId: string; sex: "male" | "female"; licensed: boolean;
  age: number; seed: number; steady: boolean; points: number; fatal: boolean;
}

export interface HuntStats {
  score: number; accuracy: number; shots: number; hits: number; clean: number; perfect: number; great: number; good: number;
  collected: number; longest: number; spooked: number; tracks: number; calls: number; distance: number; time: number; penalties: number; lost: number;
  trophies: TrophyRecord[]; credits: number;
}

export interface HudSnapshot {
  ammo: number; reserve: number; score: number; target: string; wind: string; windSpeed: number; windRel: number; scan: number; scanActive: boolean;
  scoped: boolean; zoom: string; mag: number; steady: number; steadyActive: boolean; range: string; species: string; state: string;
  shotFeedback: string; shotLabel: string; heading: number; stance: string; noise: number; visibility: number; stamina: number; heart: number;
  prompt: string; clock: string; binoculars: boolean; binoInfo: string; markers: { a: number; kind: string; label: string; d: number }[];
  boundary: number; weaponState: string; scent: number; px: number; pz: number; yaw: number; reloading: boolean; wading: boolean;
  scanTargets: { x: number; y: number; label: string }[]; sway: [number, number]; reticleMils: number; perched: boolean; collected: number; count: number; complete: boolean;
  rangeM: number | null; fov: number; ammoMax: number; callReady: boolean; hasCaller: boolean; light: number;
}

interface PendingShock { at: number; animal: Animal; amount: number; x: number; z: number }

export class HuntSession {
  cfg: HuntConfig;
  world: World;
  player: Player;
  weapon: Weapon;
  animals: AnimalManager;
  sign: SignManager;
  fx: Fx;
  precip: Precipitation;
  camera: THREE.PerspectiveCamera;
  input: Input;
  audio: GameAudio | null;
  quality: QualitySettings;
  bullets: (Bullet & { fired: number; ox: number; oy: number; oz: number; steady: boolean; scoped: boolean })[] = [];
  perches: Perch[] = [];
  stats: HuntStats = { score: 0, accuracy: 0, shots: 0, hits: 0, clean: 0, perfect: 0, great: 0, good: 0, collected: 0, longest: 0, spooked: 0, tracks: 0, calls: 0, distance: 0, time: 0, penalties: 0, lost: 0, trophies: [], credits: 0 };
  harvestedSpecies = new Set<string>();
  shotFeedback = ""; shotLabel = ""; shotFeedbackUntil = 0;
  scan = 1; scanActive = 0;
  paused = false;
  finished = false;
  completeAt = 0;
  now = 0;
  private shocks: PendingShock[] = [];
  lastShotDebug: { kind: string; dist: number; p: number[]; t: number } | null = null;
  private callCooldown = 0;
  private spotT = 0;
  private spotTarget: Animal | null = null;
  private tipShown = new Set<string>();
  private lastHud = 0;
  private hud: HudSnapshot | null = null;
  private rangeCache = { t: 0, text: "—", m: null as number | null, species: "NO TARGET", state: "SCANNING" };
  private trajectory: ReturnType<typeof trajectoryTable>;
  // callbacks
  onMessage: (text: string, kind: string) => void = () => {};
  onComplete: (stats: HuntStats) => void = () => {};
  onAnalysis: (a: ShotAnalysis) => void = () => {};
  onTag: (t: TrophyRecord) => void = () => {};
  onPause: () => void = () => {};
  onMap: () => void = () => {};
  onSpot: (a: Animal) => void = () => {};
  /** map waypoint set by the hunter (shown on the compass and minimap) */
  waypoint: { x: number; z: number } | null = null;

  private envMap: THREE.Texture | null;
  constructor(renderer: THREE.WebGLRenderer, cfg: HuntConfig, quality: QualitySettings, input: Input, audio: GameAudio | null, envMap: THREE.Texture | null) {
    this.cfg = cfg; this.quality = quality; this.input = input; this.audio = audio; this.envMap = envMap;
    this.world = new World(renderer, { reserve: cfg.reserve, time: cfg.time, weather: cfg.weather, seed: cfg.seed }, quality);
    const def = this.world.def;
    const { group: structGroup, perches, colliders } = buildLandmarks(this.world);
    this.world.structures.add(structGroup);
    for (const c of colliders) this.world.colliders.add(c);
    this.perches = perches;
    this.player = new Player(this.world, def.spawn.x, def.spawn.z, spawnYaw(def));
    const rifle = RIFLES_BY_ID[cfg.rifleId] ?? RIFLES[0];
    this.weapon = new Weapon(rifle, cfg.upgrades, rifle.ballistics.magazine, 15, envMap);
    this.trajectory = trajectoryTable(rifle.ballistics, Array.from({ length: 61 }, (_, i) => i * 10));
    this.animals = new AnimalManager(this.world, quality.animalLod);
    const assist = cfg.assist ?? "standard";
    this.animals.awarenessScale = assist === "relaxed" ? 0.7 : assist === "realistic" ? 1.3 : 1;
    this.weapon.swayScale = assist === "relaxed" ? 0.8 : assist === "realistic" ? 1.15 : 1;
    this.sign = new SignManager(this.world.terrain, cfg.hitSignRealistic);
    this.fx = new Fx();
    this.precip = new Precipitation(quality.particles);
    this.world.scene.add(this.animals.group, this.sign.mesh, this.fx.group, this.precip.mesh);
    this.camera = new THREE.PerspectiveCamera(cfg.fov, 1, 0.15, 5200);
    this.camera.rotation.order = "YXZ";
    this.wireEvents();
    this.animals.spawn({ licensed: cfg.licensed, count: cfg.count, hour: this.world.env.hour, seed: cfg.seed, tutorial: cfg.tutorial, free: cfg.mode === "free" });
    // seed the reserve with older sign along herd routes so tracking starts immediately
    this.seedOldSign();
    this.player.onStep = (surface, loud) => this.audio?.footstep(surface, loud);
    this.world.env.onThunder = (delay, strength) => { this.audio?.thunder(delay, strength); this.animals.disturb(this.player.pos.x, this.player.pos.z, 2000, 0.4 * strength); };
  }

  private wireEvents() {
    const ev = this.animals.events;
    ev.onTrack = (a, x, z, h, _f, running) => this.sign.track(a.bp.species, x, z, h, running, a.id);
    ev.onHitSign = (a, x, z) => this.sign.hit(a.bp.species, x, z, a.id);
    ev.onBed = (a, x, z, h) => this.sign.bed(a.bp.species, x, z, h, a.id);
    ev.onDropping = (a, x, z) => this.sign.dropping(a.bp.species, x, z, a.id);
    ev.onAlarm = (a, kind) => this.audio?.animal(a.bp.species, kind, a.x, a.y + 1, a.z);
    ev.onAnswer = (a) => {
      this.audio?.animal(a.bp.species, "call", a.x, a.y + 1.5, a.z);
      const d = Math.hypot(a.x - this.player.pos.x, a.z - this.player.pos.z);
      const brg = compassName(Math.atan2(a.x - this.player.pos.x, a.z - this.player.pos.z));
      this.onMessage(`${a.bp.species.toUpperCase()} ANSWERS — ${brg}, ≈${Math.round(d / 10) * 10} m`, "info");
    };
    ev.onFlee = (a) => { if (Math.hypot(a.x - this.player.pos.x, a.z - this.player.pos.z) < 260) this.stats.spooked++; };
    ev.onFootfall = (a, loud) => { if (Math.hypot(a.x - this.player.pos.x, a.z - this.player.pos.z) < 90) this.audio?.hoof(a.x, a.y, a.z, loud); };
    ev.onDeath = (a, delayed) => {
      if (delayed) {
        this.onMessage(`YOUR WOUNDED ${a.bp.species.toUpperCase()} HAS EXPIRED — FOLLOW THE HIT SIGN TO RECOVER IT`, "info");
        this.countHarvest(a, true);
      }
    };
  }

  private seedOldSign() {
    const r = mulberry32(this.cfg.seed + 55);
    for (const h of this.animals.herds) {
      const a = h.leader;
      // a meandering trail of older prints leading into the herd's zone
      const x = a.x + (r() - 0.5) * 160, z = a.z + (r() - 0.5) * 160;
      const n = 50;
      for (let i = 0; i < n; i++) {
        const tx = a.x + (x - a.x) * (1 - i / n), tz = a.z + (z - a.z) * (1 - i / n);
        const hd = Math.atan2(a.x - x, a.z - z);
        this.sign.track(a.bp.species, tx + Math.sin(i * 0.7) * 1.2, tz + Math.cos(i * 0.5) * 1.2, hd, false, a.id);
        this.sign.records[this.sign.records.length - 1].t = -300 - r() * 900;
      }
      void x; void z;
    }
    // back-date the decals too
    for (const rec of this.sign.records) ((this.sign.mesh.geometry.getAttribute("aBorn") as THREE.InstancedBufferAttribute).array as Float32Array)[rec.slot] = rec.t;
    (this.sign.mesh.geometry.getAttribute("aBorn") as THREE.InstancedBufferAttribute).needsUpdate = true;
  }

  // ------------------------------------------------------------------ helpers
  setShotFeedback(kind: string, label: string, duration = 560) { this.shotFeedback = kind; this.shotLabel = label; this.shotFeedbackUntil = this.now + duration / 1000; }
  private tip(id: string, text: string) { if (!this.cfg.tutorial || this.tipShown.has(id)) return; this.tipShown.add(id); this.onMessage(text, "tip"); }
  private licensedFor(a: Animal) { return this.cfg.licensed.includes(a.bp.species); }

  private countHarvest(a: Animal, recovered: boolean) {
    if (a.harvested || !this.licensedFor(a)) return;
    if (this.cfg.distinct && this.harvestedSpecies.has(a.bp.species)) {
      this.onMessage(`${a.bp.species.toUpperCase()} ALREADY TAKEN — GRAND SLAM NEEDS A DIFFERENT SPECIES`, "warn");
      return;
    }
    a.harvested = true;
    this.harvestedSpecies.add(a.bp.species);
    this.stats.collected++;
    if (recovered) a.oneShot = false;
    if (this.stats.collected >= this.cfg.count && this.cfg.mode === "contract" && !this.completeAt) {
      // a few seconds to read the shot analysis before the debrief; untagged harvests are tagged automatically
      this.completeAt = this.now + 6.5;
      this.onMessage("CONTRACT COMPLETE — DEBRIEF IN A MOMENT · YOUR HARVEST IS TAGGED AUTOMATICALLY", "good");
    }
  }

  // ------------------------------------------------------------------ shooting
  private fire() {
    const w = this.weapon;
    if (this.finished) return;
    if (w.state === "reloading") return;
    if (w.ammo <= 0) { this.onMessage("MAGAZINE EMPTY — RELOAD", "warn"); this.audio?.dryFire(); return; }
    if (!w.fire()) return;
    this.stats.shots++;
    const eye = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    if (!w.scoped) {
      const spread = w.hipSpread(this.player);
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
      const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      const up = new THREE.Vector3().crossVectors(right, dir).normalize();
      dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
    }
    const b = launchBullet(w.bp.ballistics, [eye.x, eye.y, eye.z], [dir.x, dir.y, dir.z], w.zero);
    this.bullets.push({ ...b, fired: this.now, ox: eye.x, oy: eye.y, oz: eye.z, steady: w.steady, scoped: w.scoped });
    this.audio?.shot(w.bp.id, w.bp.ballistics.recoil);
    // the report reaches each animal at the speed of sound
    for (const a of this.animals.animals) {
      if (!a.alive) continue;
      const d = Math.hypot(a.x - eye.x, a.z - eye.z);
      if (d > 600) continue;
      this.shocks.push({ at: this.now + d / 343, animal: a, amount: d < 170 ? 2.2 : d < 320 ? 1.3 : 0.7, x: eye.x, z: eye.z });
    }
    this.player.heart = Math.min(this.player.heart + 8, 160);
    this.tip("after-shot", "Each shot alarms every animal that hears it — the report travels at 343 m/s.");
  }

  private updateBullets(dt: number) {
    const t = this.world.terrain;
    const [wx, wz] = this.world.env.windVector();
    const segs: [number, number, number, number, number, number][] = [];
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      segs.length = 0;
      stepBullet(b, dt, this.weapon.bp.ballistics.k, wx, wz, segs);
      let done = false;
      for (const s of segs) {
        const A = new THREE.Vector3(s[0], s[1], s[2]), B = new THREE.Vector3(s[3], s[4], s[5]);
        // animals
        const hit = testSegment(A, B, this.animals.animals);
        // trees / rocks / structures (the blind you shoot from never blocks your own shot)
        const obs = this.world.colliders.segment(s[0], s[1], s[2], s[3], s[4], s[5], c => outside(c, b.ox, b.oz));
        // terrain (sample along the segment)
        let tTerr: number | null = null;
        const n = 4;
        for (let k = 1; k <= n; k++) {
          const u = k / n;
          const x = s[0] + (s[3] - s[0]) * u, y = s[1] + (s[4] - s[1]) * u, z = s[2] + (s[5] - s[2]) * u;
          if (y <= heightAt(t, x, z)) { tTerr = u; break; }
          const wl = waterLevelAt(t, x, z);
          if (wl !== null && y <= wl) { tTerr = u; break; }
        }
        const tHit = hit ? hit.t : Infinity, tObs = obs ? obs.t : Infinity, tT = tTerr ?? Infinity;
        const first = Math.min(tHit, tObs, tT);
        if (first === Infinity) continue;
        const P = A.clone().lerp(B, first);
        const dist = Math.hypot(P.x - b.ox, P.z - b.oz);
        this.lastShotDebug = { kind: first === tHit ? "animal" : first === tObs ? `obstacle:${obs?.c.kind}` : "terrain", dist, p: [P.x, P.y, P.z], t: b.t };
        if (first === tHit && hit) this.resolveHit(hit, b, dist);
        else {
          let kind: "dust" | "bark" | "spark" | "splash" | "snow" = "dust";
          if (first === tObs && obs) kind = obs.c.kind === "tree" || obs.c.kind === "log" ? "bark" : obs.c.kind === "rock" ? "spark" : "bark";
          else { const sf = surfaceAt(t, P.x, P.z); kind = sf === "water" ? "splash" : sf === "snow" ? "snow" : sf === "rock" ? "spark" : "dust"; }
          const nn = normalAt(t, P.x, P.z);
          this.fx.burst(P, kind, new THREE.Vector3(nn[0], nn[1], nn[2]));
          this.audio?.impact(kind, P.x, P.y, P.z, dist / 343);
          this.resolveMiss(dist, P);
        }
        done = true;
        break;
      }
      if (done || b.t > 2.5 || b.py < -200) {
        if (!done) this.resolveMiss(9999, null);
        this.bullets.splice(i, 1);
      }
    }
  }

  private resolveMiss(dist: number, P: THREE.Vector3 | null) {
    this.stats.score = Math.max(0, this.stats.score - 5);
    this.setShotFeedback("miss", "MISS", 340);
    this.onMessage("MISS — FOLLOW THE ANIMAL, NOT THE RETICLE", "miss");
    if (P) this.animals.disturb(P.x, P.z, 28, 2.2);
    void dist;
  }

  private resolveHit(h: HitResult, b: Bullet & { steady: boolean; ox: number; oz: number }, dist: number) {
    const a = h.animal;
    const g = gradeHit({ zone: h.zone, organs: h.organs, inVitalRegion: h.inVital });
    const licensed = this.licensedFor(a);
    this.fx.pulse(h.point, g.grade === "graze" || g.grade === "miss" ? "graze" : g.grade, dist);
    this.audio?.impact(g.grade === "graze" ? "spark" : "flesh", h.point.x, h.point.y, h.point.z, dist / 343);
    if (g.grade === "graze") {
      this.stats.score = Math.max(0, this.stats.score - 5);
      this.setShotFeedback("miss", "GRAZE", 600);
      this.onMessage(`GRAZE · ${a.bp.headgear[0]?.kind === "horn" ? "HORN" : "ANTLER"} — NO BODY CONTACT`, "miss");
      this.animals.disturb(a.x, a.z, 40, 2.5);
      return;
    }
    if (!a.alive) {
      // shooting an already-down animal counts as a registered hit but scores nothing
      this.stats.hits++;
      this.setShotFeedback("good", "ALREADY DOWN", 500);
      return;
    }
    this.stats.hits++;
    const wasWounded = a.wounds > 0;
    if (!licensed) {
      this.stats.penalties++;
      this.stats.score = Math.max(0, this.stats.score - UNLICENSED_PENALTY);
      this.setShotFeedback("miss", "NO TAG", 1100);
      this.onMessage(`NO TAG — ${a.bp.species.toUpperCase()} IS NOT ON THIS LICENSE · −${UNLICENSED_PENALTY}`, "warn");
      this.animals.applyHit(a, g.lethal, g.wound, b.ox, b.oz);
      if (!a.alive) a.harvested = false;
      return;
    }
    const pts = shotPoints(g.grade, dist, b.steady);
    const lethal = g.lethal || wasWounded;
    if (g.grade === "good") {
      this.stats.good++;
      this.stats.score += pts;
      this.setShotFeedback("good", lethal ? "GOOD SHOT · RECOVERED" : "GOOD SHOT", 820);
      this.onMessage(lethal ? `GOOD SHOT · FOLLOW-UP · ${a.bp.species.toUpperCase()} DOWN · ${Math.round(dist)}m · +${pts}` : `GOOD SHOT · BODY HIT · ${Math.round(dist)}m · +${pts}`, "good");
      this.animals.applyHit(a, false, g.wound, b.ox, b.oz);
      if (!a.alive) this.countHarvest(a, true);
      else this.tip("wounded", "Wounded animals leave hit sign. Give it a minute, then follow the drops — approach slowly and finish it cleanly.");
    } else {
      this.stats.clean++;
      if (g.grade === "perfect") {
        this.stats.perfect++; this.stats.score += pts;
        this.setShotFeedback("perfect", GRADE_LABEL.perfect, 1100);
        this.onMessage(`PERFECT HEADSHOT · VITAL ${a.bp.species.toUpperCase()} · ${Math.round(dist)}m · +${pts}`, "good");
      } else {
        this.stats.great++; this.stats.score += pts;
        this.setShotFeedback("great", GRADE_LABEL.great, 1000);
        this.onMessage(`GREAT SHOT · VITAL ${a.bp.species.toUpperCase()} · ${Math.round(dist)}m · +${pts}`, "good");
      }
      this.animals.applyHit(a, true, "none", b.ox, b.oz);
      this.countHarvest(a, wasWounded);
    }
    if (!a.alive) { a.killGrade = g.grade; a.killDist = dist; a.killOrgan = g.organ; this.stats.longest = Math.max(this.stats.longest, dist); }
    // shot analysis card
    const row = this.trajectory[Math.min(this.trajectory.length - 1, Math.round(dist / 10))];
    const v = bulletSpeed(b);
    this.onAnalysis({
      species: a.bp.species, label: a.label, grade: g.grade, organ: g.organ, zone: h.zone, distance: dist,
      dropCm: row?.dropCm ?? 0, driftCm: row ? row.driftCm * (Math.hypot(...this.world.env.windVector()) / 4) : 0,
      tof: b.t, impactVelocity: v, energyJ: 0.5 * this.weapon.bp.ballistics.massKg * v * v,
      local: [h.local.x, h.local.y, h.local.z], dir: [h.localDir.x, h.localDir.y, h.localDir.z], animalId: a.bp.id, sex: a.sex, licensed,
      age: a.age, seed: a.obj.variant.seed, steady: b.steady, points: licensed ? pts : -UNLICENSED_PENALTY, fatal: !a.alive,
    });
  }

  // ------------------------------------------------------------------ interaction
  private interact() {
    const p = this.player;
    // tag a harvested / dead animal
    let best: Animal | null = null, bd = 3.4;
    for (const a of this.animals.animals) { if (a.alive || a.tagged) continue; const d = Math.hypot(a.x - p.pos.x, a.z - p.pos.z); if (d < bd) { bd = d; best = a; } }
    if (best) { this.tag(best); return; }
    // climb / leave a stand or tower
    if (p.perch) {
      const pc = p.perch; p.perch = null; p.pos.x = pc.exitX; p.pos.z = pc.exitZ; p.setStance("stand");
      this.onMessage(pc.kind === "blind" ? "LEFT THE GROUND BLIND" : `CLIMBED DOWN FROM ${pc.name.toUpperCase()}`, "info");
      return;
    }
    for (const pc of this.perches) {
      if (Math.hypot(pc.exitX - p.pos.x, pc.exitZ - p.pos.z) < 2.4) {
        p.perch = pc; p.pos.x = pc.x; p.pos.z = pc.z;
        // stand in a lookout cab to see over its walls; sit on a stand's seat or the blind's stool
        p.setStance(pc.kind === "tower" ? "stand" : "crouch");
        // settle on the blind's stool facing out of its most open window, not into a corner,
        // leaning toward it (as far as the blind allows) so it fills more of the view
        if (pc.kind === "blind") {
          p.yaw = this.openWindow(pc); p.pitch = 0;
          const lean = Math.min(0.25, pc.r);
          p.pos.x = pc.x - Math.sin(p.yaw) * lean; p.pos.z = pc.z - Math.cos(p.yaw) * lean;
        }
        this.onMessage(pc.kind === "blind" ? "IN THE GROUND BLIND — HIDDEN FROM SIGHT · SHOOT THROUGH THE WINDOWS · F TO LEAVE"
          : pc.kind === "tower" ? `CLIMBED ${pc.name.toUpperCase()} — 360° VIEW · YOUR SCENT LIFTS ABOVE THE GAME · F TO CLIMB DOWN`
          : "ON THE TRIPOD STAND — RIFLE RESTS ON THE RAIL · YOUR SCENT LIFTS ABOVE THE GAME · F TO CLIMB DOWN", "info");
        return;
      }
    }
    // inspect sign under the look point
    const look = this.groundLookPoint(6);
    const s = this.sign.nearest(look?.x ?? p.pos.x, look?.z ?? p.pos.z, 2.6) ?? this.sign.nearest(p.pos.x, p.pos.z, 2.2);
    if (s) {
      this.stats.tracks++;
      const what = s.kind === "track" ? `${s.species.toUpperCase()} TRACKS` : s.kind === "dropping" ? `${s.species.toUpperCase()} DROPPINGS` : s.kind === "bed" ? `${s.species.toUpperCase()} BED` : `HIT SIGN — ${s.species.toUpperCase()}`;
      const age = describeAge(this.sign.time - s.t, this.world.env.timeScale);
      const dir = s.kind === "track" || s.kind === "hit" ? ` · HEADING ${compassName(s.heading)}${s.running ? " · RUNNING" : " · WALKING"}` : "";
      this.onMessage(`${what} · ${age.toUpperCase()}${dir}`, "track");
      this.audio?.ui("inspect");
      return;
    }
    this.onMessage("NOTHING TO INSPECT HERE — LOOK AT THE GROUND NEAR SIGN", "info");
  }

  /** Yaw of the blind window with the longest clear view (rising ground and tree trunks); the front window wins near-ties. */
  private openWindow(pc: Perch): number {
    const w = this.world, ey = pc.y + (pc.eye ?? 1.2);
    let best = pc.rot + Math.PI, bestD = -Infinity;
    for (let k = 0; k < 4; k++) {
      const yaw = pc.rot + Math.PI + k * Math.PI / 2, dx = -Math.sin(yaw), dz = -Math.cos(yaw);
      let d = 4;
      while (d < 200 && w.heightAt(pc.x + dx * d, pc.z + dz * d) < ey - 0.4) d += 2;
      const trunk = w.colliders.segment(pc.x, ey, pc.z, pc.x + dx * d, ey, pc.z + dz * d, c => c.kind !== "structure");
      if (trunk) d *= trunk.t;
      if (d > bestD + 5) { bestD = d; best = yaw; }
    }
    return best;
  }

  private groundLookPoint(maxD: number): THREE.Vector3 | null {
    const o = this.camera.getWorldPosition(new THREE.Vector3()), d = this.camera.getWorldDirection(new THREE.Vector3());
    const t = this.world.terrain;
    for (let s = 0.5; s < maxD; s += 0.25) { const x = o.x + d.x * s, y = o.y + d.y * s, z = o.z + d.z * s; if (y <= heightAt(t, x, z)) return new THREE.Vector3(x, y, z); }
    return null;
  }

  tag(a: Animal) {
    a.tagged = true;
    const rating = a.trophy.rating;
    const credits = this.cfg.mode === "free" && this.licensedFor(a) ? harvestCredits(rating, a.killGrade ?? "good") : 0;
    const rec: TrophyRecord = {
      id: `${Date.now()}-${a.id}`, species: a.bp.species, label: a.label, sex: a.sex, score: a.trophy.score, weight: a.trophy.weight, rating,
      grade: a.killGrade ?? "good", organ: a.killOrgan || "—", distance: Math.round(a.killDist), reserve: this.world.def.name, date: Date.now(),
      seed: a.obj.variant.seed, age: a.age, oneShot: a.oneShot, credits, recovered: !a.oneShot,
    };
    if (this.licensedFor(a)) { this.stats.trophies.push(rec); this.stats.credits += credits; }
    this.audio?.ui("tag");
    this.onTag(rec);
  }

  private useCaller() {
    if (!this.cfg.gear.caller) { this.onMessage("NO CALLER IN YOUR KIT — BUY ONE AT THE GEAR LOCKER", "warn"); return; }
    if (this.callCooldown > 0) return;
    this.callCooldown = 6;
    this.stats.calls++;
    const sp = this.cfg.licensed[0];
    this.audio?.caller(sp);
    const n = this.animals.call(this.player.pos.x, this.player.pos.z, this.cfg.licensed);
    const bp = WILDLIFE_BY_SPECIES[sp];
    this.onMessage(`${(bp?.callName ?? "CALL").toUpperCase()}${n ? "" : " — NO RESPONSE YET"}`, "info");
    this.player.noise = Math.max(this.player.noise, 8);
  }

  private pulseScan() {
    if (this.scan < 1) return;
    this.scan = 0;
    this.scanActive = 2.7 + this.cfg.upgrades.tracking * 0.65;
    this.onMessage("TRAIL SCANNER — FRESH SIGN HIGHLIGHTED", "info");
    this.audio?.ui("scan");
  }

  // ------------------------------------------------------------------ frame
  update(dt: number, aspect: number) {
    if (this.paused) return;
    this.now += dt;
    this.stats.time += dt;
    const inp = this.input;
    const w = this.weapon, p = this.player, env = this.world.env;
    // ---- actions
    if (inp.wasPressed("pause")) { this.onPause(); }
    if (inp.wasPressed("map")) this.onMap();
    if (inp.wasPressed("zoom")) { w.cycleZoom(); this.audio?.ui("zoom"); }
    if (inp.wasPressed("aim") && !inp.settings.aimHold) w.setAim(!w.aiming);
    if (inp.settings.aimHold) { if (inp.wasPressed("aim")) w.setAim(true); if (inp.released.has("aim")) w.setAim(false); }
    if (inp.wasPressed("zoomIn")) { if (w.zoomLevel > 0) w.wheelZoom(1); }
    if (inp.wasPressed("zoomOut")) { if (w.zoomLevel > 0) w.wheelZoom(-1); }
    if (inp.wasPressed("reload")) { if (w.reload()) { this.onMessage("RELOADING…", "info"); this.audio?.reload(w.reloadTime()); } }
    if (inp.wasPressed("scan")) this.pulseScan();
    if (inp.wasPressed("crouch")) p.toggleCrouch();
    if (inp.wasPressed("prone")) p.toggleProne();
    if (inp.wasPressed("binoculars")) { w.toggleBinoculars(); this.audio?.ui("bino"); }
    if (inp.wasPressed("interact")) this.interact();
    if (inp.wasPressed("call")) this.useCaller();
    if (inp.wasPressed("fire")) this.fire();
    w.setSteady(inp.isDown("steady") && w.scoped);
    // ---- look & move
    const scopeK = w.scoped ? (1 / w.mag) * inp.settings.scopedSensitivity * 2.2 : w.bino > 0.5 ? 0.12 : 1;
    p.look(inp.look.x, inp.look.y, scopeK);
    p.update(dt, inp.move, inp.isDown("sprint") && !w.scoped, w.aiming || w.bino > 0.5, env, this.cfg.gear.camo);
    if (p.boundaryWarn > 0.6) this.tip("boundary", "Reserve boundary ahead — turn back.");
    const ev = w.update(dt, p, env.gust, aspect);
    if (ev.onCycleDone) this.audio?.bolt();
    if (ev.onReloadDone) this.audio?.ui("loaded");
    // ---- camera
    const eye = p.eyePosition();
    this.camera.position.copy(eye);
    const kick = w.recoil * 0.06;
    this.camera.rotation.set(p.pitch + (w.scoped ? w.sway.y : w.sway.y * 0.3) + kick, p.yaw + (w.scoped ? w.sway.x : w.sway.x * 0.3), 0);
    const fovTarget = w.bino > 0.5 ? Weapon.fovFor(10, this.cfg.fov) : w.scoped ? Weapon.fovFor(w.mag, this.cfg.fov) : this.cfg.fov - w.ads * 8;
    this.camera.fov = fovTarget;
    this.camera.aspect = aspect;
    this.camera.near = w.scoped || w.bino > 0.5 ? 0.5 : 0.15;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    // ---- systems
    this.updateBullets(dt);
    for (let i = this.shocks.length - 1; i >= 0; i--) {
      const s = this.shocks[i];
      if (this.now >= s.at) { if (s.animal.alive) { s.animal.awareness += s.amount; s.animal.threat.set(s.x, s.z); s.animal.everAlerted = true; } this.shocks.splice(i, 1); }
    }
    this.animals.update(dt, p, env, this.cfg.gear.scentBlocker ? 0.6 : 0, this.camera.position);
    this.sign.update(dt);
    this.scan = Math.min(1, this.scan + dt * (0.075 + this.cfg.upgrades.tracking * 0.006));
    this.scanActive = Math.max(0, this.scanActive - dt);
    ATMO.uScan.value = clamp01(this.scanActive);
    this.callCooldown = Math.max(0, this.callCooldown - dt);
    this.world.update(dt, this.camera, p.pos);
    this.fx.update(dt, this.camera);
    this.precip.update(this.camera.position, env.w.rain, env.w.snow, env.lightLevel());
    w.syncLights(env.sun, env.hemi, this.camera.quaternion);
    this.audio?.update(this.camera, env, p);
    // spotting through optics
    if (w.scoped || w.bino > 0.5) {
      const ray = new THREE.Ray(this.camera.position.clone(), this.camera.getWorldDirection(new THREE.Vector3()));
      const pk = this.animals.pick(ray, 900);
      if (pk && pk.animal === this.spotTarget) { this.spotT += dt; if (this.spotT > 0.45 && !pk.animal.spotted) { pk.animal.spotted = true; this.audio?.ui("spot"); this.onSpot(pk.animal); } }
      else { this.spotTarget = pk?.animal ?? null; this.spotT = 0; }
    }
    // tutorial nudges
    if (this.cfg.tutorial) {
      if (this.stats.time > 4) this.tip("start", "Fresh tracks lead away from the trailhead. Look at the ground and press F to read them; E pulses the Trail Scanner.");
      const sc = this.scentToNearestHerd();
      if (sc > 0.2) this.tip("wind", "The wind is carrying your scent toward game — circle around so the wind blows from them to you.");
    }
    if (this.completeAt && this.now >= this.completeAt && !this.finished) this.finish();
  }

  private scentToNearestHerd(): number {
    const [wx, wz] = this.world.env.windVector();
    let s = 0;
    for (const a of this.animals.animals) if (a.alive && this.licensedFor(a)) s = Math.max(s, scentStrength({ hx: this.player.pos.x, hz: this.player.pos.z, ax: a.x, az: a.z, windX: wx, windZ: wz, smell: a.bp.senses.smell, blocker: 0 }));
    return s;
  }

  /** Stats so far (used when a contract is abandoned). */
  currentStats(): HuntStats {
    return { ...this.stats, accuracy: accuracyOf(this.stats.hits, this.stats.shots), distance: this.player.distanceWalked, lost: this.animals.animals.filter(a => a.alive && a.wound !== "none" && this.licensedFor(a)).length };
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    // auto-tag harvests left in the field
    for (const a of this.animals.animals) if (!a.alive && a.harvested && !a.tagged) this.tag(a);
    this.stats.lost = this.animals.animals.filter(a => a.alive && a.wound !== "none" && this.licensedFor(a)).length;
    this.stats.accuracy = accuracyOf(this.stats.hits, this.stats.shots);
    this.stats.distance = this.player.distanceWalked;
    this.onComplete({ ...this.stats });
  }

  render(renderer: THREE.WebGLRenderer) {
    renderer.toneMappingExposure = this.world.env.exposure;
    renderer.autoClear = true;
    renderer.render(this.world.scene, this.camera);
    const w = this.weapon;
    if (!w.scoped && w.bino < 0.6) {
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(w.scene, w.camera);
      renderer.autoClear = true;
    }
  }

  // ------------------------------------------------------------------ HUD
  snapshot(): HudSnapshot {
    if (this.hud && this.now - this.lastHud < 1 / 15) {
      this.hud.shotFeedback = this.now < this.shotFeedbackUntil ? this.shotFeedback : "";
      this.hud.shotLabel = this.now < this.shotFeedbackUntil ? this.shotLabel : "";
      this.hud.sway = [this.weapon.sway.x, this.weapon.sway.y];
      return this.hud;
    }
    this.lastHud = this.now;
    const w = this.weapon, p = this.player, env = this.world.env;
    const [wx, wz] = env.windVector();
    const windSpeed = Math.hypot(wx, wz);
    // wind direction relative to view: angle of the air movement in screen space
    const windAng = Math.atan2(wx, -wz);          // bearing the wind blows TOWARD (0 = north)
    const viewBrg = -p.yaw;                        // camera bearing
    const windRel = wrapAngle(windAng - viewBrg);
    // range / species / state readout (v2.0.3 telemetry)
    if (this.now - this.rangeCache.t > 0.12) {
      this.rangeCache.t = this.now;
      const ray = new THREE.Ray(this.camera.position.clone(), this.camera.getWorldDirection(new THREE.Vector3()));
      const pk = this.animals.pick(ray, 1000);
      if (pk) {
        const a = pk.animal;
        this.rangeCache.text = `${Math.round(pk.dist)}m`; this.rangeCache.m = pk.dist;
        this.rangeCache.species = (a.spotted ? a.label : a.bp.species).toUpperCase();
        this.rangeCache.state = !a.alive ? "DOWN" : a.state === "graze" || a.state === "drink" ? "GRAZE" : a.state === "bed" ? "BEDDED" : a.state === "investigate" ? "CURIOUS" : a.state === "wounded" ? "WOUNDED" : a.state.toUpperCase();
      } else {
        const g = this.groundLookPointFar(1200);
        this.rangeCache.text = g ? `${Math.round(g)}m` : "—"; this.rangeCache.m = g;
        this.rangeCache.species = "NO TARGET"; this.rangeCache.state = "SCANNING";
      }
    }
    // compass markers
    const markers: HudSnapshot["markers"] = [];
    const brg = (x: number, z: number) => wrapAngle(Math.atan2(x - p.pos.x, -(z - p.pos.z)) - viewBrg);
    const def = this.world.def;
    markers.push({ a: brg(def.spawn.x, def.spawn.z), kind: "home", label: "TRAILHEAD", d: Math.hypot(def.spawn.x - p.pos.x, def.spawn.z - p.pos.z) });
    if (this.waypoint) markers.push({ a: brg(this.waypoint.x, this.waypoint.z), kind: "waypoint", label: "WAYPOINT", d: Math.hypot(this.waypoint.x - p.pos.x, this.waypoint.z - p.pos.z) });
    for (const a of this.animals.animals) {
      if (!a.alive && a.harvested && !a.tagged) markers.push({ a: brg(a.x, a.z), kind: "harvest", label: "HARVEST", d: Math.hypot(a.x - p.pos.x, a.z - p.pos.z) });
      else if (a.spotted && a.alive && Math.hypot(a.x - p.pos.x, a.z - p.pos.z) < 600) markers.push({ a: brg(a.x, a.z), kind: "spotted", label: a.bp.species.toUpperCase(), d: Math.hypot(a.x - p.pos.x, a.z - p.pos.z) });
    }
    // scanner targets on screen
    const scanTargets: HudSnapshot["scanTargets"] = [];
    if (this.scanActive > 0) {
      const R = 140 * (1 + this.cfg.upgrades.tracking * 0.2);
      for (const a of this.animals.animals) {
        if (!a.alive) continue;
        if (Math.hypot(a.x - p.pos.x, a.z - p.pos.z) > R) continue;
        const v = a.center(new THREE.Vector3()).project(this.camera);
        if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) continue;
        scanTargets.push({ x: v.x, y: v.y, label: a.bp.species.toUpperCase() });
      }
    }
    // contextual prompt
    let prompt = "";
    if (this.animals.animals.some(a => !a.alive && !a.tagged && Math.hypot(a.x - p.pos.x, a.z - p.pos.z) < 3.4)) prompt = "F — TAG HARVEST";
    else if (p.perch) prompt = p.perch.kind === "blind" ? "F — LEAVE BLIND" : "F — CLIMB DOWN";
    else {
      const near = this.perches.find(pc => Math.hypot(pc.exitX - p.pos.x, pc.exitZ - p.pos.z) < 2.4);
      if (near) prompt = near.kind === "blind" ? "F — ENTER BLIND" : "F — CLIMB";
    }
    if (!prompt && !p.perch && this.sign.nearest(p.pos.x, p.pos.z, 2.2)) prompt = "F — INSPECT SIGN";
    let binoInfo = "";
    if (w.bino > 0.5 && this.spotTarget) {
      const a = this.spotTarget;
      const d = Math.hypot(a.x - p.pos.x, a.z - p.pos.z);
      binoInfo = a.spotted ? `${a.label.toUpperCase()} · ${Math.round(d)} m · ${a.alive ? a.state.toUpperCase() : "DOWN"}${a.sex === "male" && a.trophy.rating !== "none" ? ` · EST. ${a.trophy.rating.toUpperCase()}` : ""}${this.licensedFor(a) ? " · LICENSED" : " · NOT LICENSED"}` : "IDENTIFYING…";
    }
    const scent = this.scentToNearestHerd();
    this.hud = {
      ammo: w.ammo, reserve: w.reserve, score: this.stats.score, target: `${this.stats.collected}/${this.cfg.count}`,
      wind: windSpeed.toFixed(1), windSpeed, windRel, scan: Math.round(this.scan * 100), scanActive: this.scanActive > 0,
      scoped: w.scoped, zoom: w.scoped ? `${w.mag.toFixed(w.mag % 1 ? 1 : 0)}×` : "1×", mag: w.mag, steady: Math.round(w.steadyMeter), steadyActive: w.steady,
      range: this.rangeCache.text, species: this.rangeCache.species, state: this.rangeCache.state,
      shotFeedback: this.now < this.shotFeedbackUntil ? this.shotFeedback : "", shotLabel: this.now < this.shotFeedbackUntil ? this.shotLabel : "",
      heading: ((-p.yaw * 180 / Math.PI) % 360 + 360) % 360, stance: p.perch ? "perched" : p.stance, noise: clamp01(p.noise / 60), visibility: p.visibility,
      stamina: p.stamina, heart: Math.round(p.heart), prompt, clock: env.clockString(), binoculars: w.bino > 0.5, binoInfo, markers,
      boundary: p.boundaryWarn, weaponState: w.state, scent, px: p.pos.x, pz: p.pos.z, yaw: p.yaw, reloading: w.state === "reloading", wading: p.wading > 0.2,
      scanTargets, sway: [w.sway.x, w.sway.y], reticleMils: 0, perched: !!p.perch, collected: this.stats.collected, count: this.cfg.count, complete: !!this.completeAt,
      rangeM: this.rangeCache.m, fov: this.camera.fov, ammoMax: w.bp.ballistics.magazine, callReady: this.callCooldown <= 0, hasCaller: this.cfg.gear.caller, light: env.lightLevel(),
    };
    return this.hud;
  }

  private groundLookPointFar(maxD: number): number | null {
    const o = this.camera.position, d = this.camera.getWorldDirection(new THREE.Vector3());
    const t = this.world.terrain;
    let s = 1;
    while (s < maxD) { const x = o.x + d.x * s, y = o.y + d.y * s, z = o.z + d.z * s; if (y <= heightAt(t, x, z)) return s; s += s < 50 ? 1 : s < 200 ? 3 : 8; }
    return null;
  }

  /** BDC marks for the current rifle: holdover in mils at 100 m steps (for the scope reticle). */
  bdc(): { range: number; mil: number }[] {
    return [200, 300, 400, 500].map(r => ({ range: r, mil: this.trajectory[r / 10]?.dropMil ?? 0 }));
  }

  dispose() {
    this.animals.dispose();
    this.world.vegetation.dispose();
    disposeObject(this.world.scene, [this.envMap]);
    disposeObject(this.weapon.scene, [this.envMap]);
  }
}

export { clamp, smoothstep };
