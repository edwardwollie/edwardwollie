// Living wildlife: herds with leaders and formation, need-zone goals by time of
// day, senses (sight / hearing / scent with wind), alert → flee escalation that
// spreads through the herd, call responses, bedding, wounded behaviour with hit
// sign and recovery, knockdown, trophy stats and track laying.

import * as THREE from "three";
import { clamp, clamp01, damp, dampAngle, lerp, smoothstep, wrapAngle } from "../core/math.ts";
import { mulberry32, rngPick, rngRange, type Rng } from "../core/rng.ts";
import type { AnimalBlueprint } from "../blueprints/types.ts";
import { WILDLIFE_BY_SPECIES } from "../blueprints/wildlife/index.ts";
import { biomeWeights, type NeedZone } from "../blueprints/reserves.ts";
import { animalMaterial, createAnimalObject, type AnimalObject } from "../models/animal-mesh.ts";
import { patchWorldFog } from "../render/atmosphere.ts";
import { QUALITY_HIGH, QUALITY_LOW } from "../models/animal-builder.ts";
import { AnimalAnimator, newPose, type AnimPose } from "../sim/animal-anim.ts";
import { heightAt, maskAt, normalAt, waterLevelAt } from "../world/terrain-gen.ts";
import type { World } from "../world/world.ts";
import { AWARE, hearingStrength, scentStrength, sightStrength } from "./senses.ts";
import { ratingFor, type Grade, type Rating } from "./scoring.ts";
import type { Player } from "./player.ts";

export type AState = "graze" | "walk" | "alert" | "flee" | "bed" | "drink" | "investigate" | "wounded" | "dead";

export interface Trophy { score: number; weight: number; rating: Rating; points?: number }

export class Herd {
  members: Animal[] = [];
  leader!: Animal;
  goal: NeedZone;
  goalT = 0;
  id: number;
  species: string;
  constructor(id: number, species: string, goal: NeedZone) { this.id = id; this.species = species; this.goal = goal; }
}

let fieldMat: THREE.MeshStandardMaterial | null = null;
/** Wildlife out in a reserve takes the shared atmosphere fog like the terrain and trees do,
 *  so game fades into mist and haze with distance (the Studio keeps the plain coat material). */
function fieldAnimalMaterial(): THREE.MeshStandardMaterial {
  if (!fieldMat) { fieldMat = patchWorldFog(animalMaterial().clone()); fieldMat.name = "wildlife-coat-field"; }
  return fieldMat;
}

export class Animal {
  id: number;
  bp: AnimalBlueprint;
  sex: "male" | "female";
  age: number;
  obj: AnimalObject;
  anim: AnimalAnimator;
  pose: AnimPose;
  x: number; z: number; y = 0;
  heading: number;            // radians; forward = (sin h, cos h) in world XZ (model +Z)
  speed = 0;
  targetSpeed = 0;
  state: AState = "graze";
  stateT = 0;
  herd: Herd;
  slot: [number, number] = [0, 0];
  awareness = 0;
  threat = new THREE.Vector2();
  goalX = 0; goalZ = 0;
  wound: "none" | "liver" | "gut" | "leg" | "neck" | "flesh" = "none";
  wounds = 0;
  bleed = 0;                  // remaining hit-sign budget (m)
  bleedAcc = 0;
  dieAt = Infinity;
  staggerT = 0;
  alive = true;
  harvested = false;          // counted for the contract
  tagged = false;
  licensed = true;
  spotted = false;
  everAlerted = false;
  killGrade: Grade | null = null;
  killDist = 0;
  killOrgan = "";
  killedAt = 0;
  oneShot = true;
  trophy: Trophy;
  trackAcc = 0;
  foot = 0;
  senseT: number;
  vigilT: number;
  lookTarget = 0;
  deadSide = 1;
  answerT = 0;
  lodSkip = 0;
  radius: number;
  height: number;
  scale: number;
  constructor(id: number, bp: AnimalBlueprint, sex: "male" | "female", age: number, seed: number, herd: Herd, x: number, z: number, heading: number, lod: "high" | "low", rng: Rng) {
    this.id = id; this.bp = bp; this.sex = sex; this.age = age; this.herd = herd;
    this.x = x; this.z = z; this.heading = heading;
    this.obj = createAnimalObject(bp, { sex, age, seed }, lod === "high" ? QUALITY_HIGH : QUALITY_LOW, fieldAnimalMaterial());
    this.obj.root.userData.animal = this;
    this.obj.mesh.userData.animal = this;
    this.anim = new AnimalAnimator(this.obj);
    this.pose = newPose();
    this.pose.phase = rng();
    this.pose.t = rng() * 10;
    this.senseT = rng() * 0.2;
    this.vigilT = 3 + rng() * 8;
    this.scale = this.obj.build.scale;
    const bb = this.obj.build.bbox;
    this.radius = Math.max(bb.max[2] - bb.min[2], bb.max[1]) * 0.6 * this.scale;
    this.height = bb.max[1] * this.scale;
    this.deadSide = rng() < 0.5 ? 1 : -1;
    // trophy
    const T = bp.trophy;
    const w = sex === "male" ? lerp(T.weightMale[0], T.weightMale[1], clamp01(0.25 + 0.65 * age + 0.15 * (rng() - 0.5))) : lerp(T.weightFemale[0], T.weightFemale[1], clamp01(0.2 + 0.6 * age + 0.2 * (rng() - 0.5)));
    if (sex === "male") {
      const sc = lerp(T.maleScore[0], T.maleScore[1], clamp01(Math.pow(age, 1.25) * (0.82 + 0.3 * rng())));
      this.trophy = { score: Math.round(sc * 10) / 10, weight: Math.round(w), rating: ratingFor(sc, T.tiers) };
    } else {
      const rel = (w - T.weightFemale[0]) / (T.weightFemale[1] - T.weightFemale[0]);
      this.trophy = { score: Math.round(w), weight: Math.round(w), rating: rel > 0.85 ? "silver" : rel > 0.6 ? "bronze" : "none" };
    }
  }
  get speciesName() { return this.bp.species; }
  /** "Mule Deer Buck", "Wild Boar Sow" — but "Wild Boar", not "Wild Boar Boar" */
  get label() { const n = this.sex === "male" ? this.bp.maleName : this.bp.femaleName; return this.bp.species.endsWith(n) ? this.bp.species : `${this.bp.species} ${n}`; }
  /** world-space centre of mass (approx.) */
  center(out = new THREE.Vector3()) { return out.set(this.x, this.y + this.height * 0.55, this.z); }
}

export interface MissionSpawn {
  licensed: string[];          // species that may be taken
  count: number;               // contract objective
  hour: number;
  seed: number;
  tutorial?: boolean;
  free?: boolean;
}

export interface AnimalEvents {
  onAlarm?: (a: Animal, kind: "snort" | "stomp" | "bark") => void;
  onFlee?: (a: Animal) => void;
  onAnswer?: (a: Animal) => void;
  onTrack?: (a: Animal, x: number, z: number, heading: number, foot: number, running: boolean) => void;
  onHitSign?: (a: Animal, x: number, z: number) => void;
  onBed?: (a: Animal, x: number, z: number, heading: number) => void;
  onDropping?: (a: Animal, x: number, z: number) => void;
  onDeath?: (a: Animal, delayed: boolean) => void;
  onFootfall?: (a: Animal, loud: number) => void;
}

export class AnimalManager {
  animals: Animal[] = [];
  herds: Herd[] = [];
  group = new THREE.Group();
  events: AnimalEvents = {};
  private world: World;
  private rng: Rng;
  private nextId = 1;
  private calls: number[] = [];
  private tmp = new THREE.Vector3();
  time = 0;
  /** difficulty assist: scales how fast awareness builds (relaxed 0.7 · standard 1 · realistic 1.3) */
  awarenessScale = 1;
  lod: "high" | "low";
  constructor(world: World, lod: "high" | "low") {
    this.world = world; this.lod = lod;
    this.rng = mulberry32(world.def.seed * 17 + 3);
    this.group.name = "wildlife";
  }

  // ------------------------------------------------------------------ spawning
  spawn(m: MissionSpawn) {
    this.rng = mulberry32(m.seed * 7919 + this.world.def.seed);
    const r = this.rng;
    const def = this.world.def;
    const native = def.fauna.filter(s => WILDLIFE_BY_SPECIES[s]);
    const licensed = m.licensed.filter(s => WILDLIFE_BY_SPECIES[s]);
    const total = Math.max(9, m.count + 6) + (m.free ? 6 : 0);
    const plan: { species: string; n: number }[] = [];
    // licensed herds take ~70 % of the animals; every licensed species gets at least one herd
    let licN = Math.round(total * (native.some(s => !licensed.includes(s)) ? 0.7 : 1));
    licN = Math.max(licN, licensed.length * 3);
    licensed.forEach((s, i) => plan.push({ species: s, n: Math.round(licN / licensed.length) + (i === 0 ? licN % licensed.length : 0) }));
    const others = native.filter(s => !licensed.includes(s));
    let rest = total - licN;
    for (const s of others) { if (rest <= 0) break; const n = Math.min(rest, 2 + Math.floor(r() * 3)); plan.push({ species: s, n }); rest -= n; }
    const feedTime = (m.hour >= 4.5 && m.hour < 9.5) || (m.hour >= 16 && m.hour < 21.5) || m.hour >= 21.5 || m.hour < 4.5;
    for (const p of plan) {
      const bp = WILDLIFE_BY_SPECIES[p.species];
      let left = p.n;
      while (left > 0) {
        const size = Math.min(left, Math.max(1, Math.round(rngRange(r, bp.senses.herd[0], bp.senses.herd[1] * 0.75))));
        left -= size;
        const zone = this.pickZone(p.species, feedTime ? (r() < 0.8 ? "feed" : "water") : (r() < 0.6 ? "bed" : "feed"), m);
        this.spawnHerd(bp, size, zone, licensed.includes(p.species), !feedTime && zone.kind === "bed");
      }
    }
    // tutorial: make sure a licensed herd is reachable from the trailhead
    if (m.tutorial && licensed.length) this.placeTutorialHerd(licensed[0]);
  }

  private pickZone(species: string, kind: NeedZone["kind"], m: MissionSpawn): NeedZone {
    const def = this.world.def;
    const r = this.rng;
    let zones = def.zones.filter(z => z.kind === kind && (!z.species || z.species.includes(species)));
    if (!zones.length) zones = def.zones.filter(z => !z.species || z.species.includes(species));
    // habitat preference in mixed reserves: weight by biome where the species lives
    const pref = (z: NeedZone) => {
      if (def.biomeMode !== "quadrants") return 1;
      const w = biomeWeights(def, z.x, z.z);
      const home: Record<string, number[]> = { "Mule Deer": [1, 0, 1, 0.3], "Elk": [1, 1, 0.3, 0.3], "Wild Boar": [0.5, 0, 1, 0], "Red Deer": [0.3, 1, 0.6, 0], "Bighorn Sheep": [0, 1, 0, 1], "Bison": [0, 0.2, 0.2, 1] };
      const h = home[species] ?? [1, 1, 1, 1];
      return 0.05 + w.reduce((s, v, i) => s + v * h[i], 0);
    };
    // keep away from the trailhead
    const sp = def.spawn;
    const cands = zones.map(z => ({ z, w: pref(z) * smoothstep(90, 200, Math.hypot(z.x - sp.x, z.z - sp.z)) + 0.001 }));
    let sum = 0; for (const c of cands) sum += c.w;
    let pick = r() * sum;
    for (const c of cands) { pick -= c.w; if (pick <= 0) return c.z; }
    void m;
    return cands[cands.length - 1].z;
  }

  private spawnHerd(bp: AnimalBlueprint, size: number, zone: NeedZone, licensed: boolean, bedded: boolean) {
    const r = this.rng;
    const herd = new Herd(this.herds.length, bp.species, zone);
    const cx = zone.x + (r() - 0.5) * zone.r, cz = zone.z + (r() - 0.5) * zone.r;
    const maleShare = bp.species === "Wild Boar" ? 0.25 : bp.species === "Bison" ? 0.4 : 0.38;
    for (let i = 0; i < size; i++) {
      const a0 = r() * Math.PI * 2, d = i === 0 ? 0 : 3 + r() * Math.max(6, size * 2.2);
      let x = cx + Math.cos(a0) * d, z = cz + Math.sin(a0) * d;
      [x, z] = this.findGround(x, z);
      const sex: "male" | "female" = (i === 0 && size === 1) || r() < maleShare ? "male" : "female";
      const age = clamp01(Math.pow(r(), 0.8) * (sex === "male" ? 1 : 0.9) + 0.1);
      const a = new Animal(this.nextId++, bp, sex, age, Math.floor(r() * 1e6), herd, x, z, r() * Math.PI * 2, this.lod, r);
      a.licensed = licensed;
      a.slot = [Math.cos(a0) * d, Math.sin(a0) * d];
      a.state = bedded && r() < 0.75 ? "bed" : r() < 0.7 ? "graze" : "walk";
      a.stateT = r() * 10;
      if (a.state === "bed") a.pose.bed = 1;
      a.y = heightAt(this.world.terrain, x, z);
      herd.members.push(a);
      this.animals.push(a);
      this.group.add(a.obj.root);
    }
    // leader: an adult female for deer/elk/sheep, the oldest otherwise
    herd.leader = herd.members.find(m => m.sex === "female") ?? herd.members[0];
    this.herds.push(herd);
    this.setGoal(herd, zone);
  }

  private placeTutorialHerd(species: string) {
    const def = this.world.def;
    const herd = this.herds.find(h => h.species === species && h.members.some(m => m.licensed));
    if (!herd) return;
    // move the herd to ~150 m from the trailhead along the first trail
    const trail = def.features.find(f => f.kind === "trail");
    let tx = def.spawn.x * 0.4, tz = def.spawn.z * 0.4;
    if (trail && trail.kind === "trail" && trail.pts.length > 2) { tx = trail.pts[2][0] + 25; tz = trail.pts[2][1] - 15; }
    const dx = tx - herd.leader.x, dz = tz - herd.leader.z;
    for (const a of herd.members) { const [x, z] = this.findGround(a.x + dx, a.z + dz); a.x = x; a.z = z; a.state = "graze"; a.pose.bed = 0; }
    herd.goal = { kind: "feed", x: tx, z: tz, r: 30 };
    this.setGoal(herd, herd.goal);
    // a fresh trail of tracks from near the trailhead toward the herd
    const ldr = herd.leader;
    const sx = def.spawn.x + (tx - def.spawn.x) * 0.15, sz = def.spawn.z + (tz - def.spawn.z) * 0.15;
    const steps = Math.floor(Math.hypot(tx - sx, tz - sz) / (ldr.bp.track.stride * 1.0));
    const h = Math.atan2(tx - sx, tz - sz);
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const px = sx + (tx - sx) * t + Math.sin(i * 0.37) * 1.5, pz = sz + (tz - sz) * t + Math.cos(i * 0.29) * 1.5;
      this.events.onTrack?.(ldr, px, pz, h, i % 2, false);
    }
  }

  private findGround(x: number, z: number): [number, number] {
    const t = this.world.terrain;
    for (let k = 0; k < 12; k++) {
      const wl = waterLevelAt(t, x, z);
      const steep = normalAt(t, x, z)[1] < 0.8;
      const blocked = this.world.colliders.query(x, z, 1.2).length > 0;
      if ((wl === null || heightAt(t, x, z) > wl + 0.2) && !steep && !blocked && Math.abs(x) < t.half - 50 && Math.abs(z) < t.half - 50) return [x, z];
      x += (this.rng() - 0.5) * 14; z += (this.rng() - 0.5) * 14;
      x = clamp(x, -t.half + 55, t.half - 55); z = clamp(z, -t.half + 55, t.half - 55);
    }
    return [x, z];
  }

  private setGoal(h: Herd, zone: NeedZone) {
    h.goal = zone; h.goalT = 60 + this.rng() * 120;
    const a = this.rng() * Math.PI * 2, d = this.rng() * zone.r * 0.6;
    h.leader.goalX = zone.x + Math.cos(a) * d; h.leader.goalZ = zone.z + Math.sin(a) * d;
  }

  // ------------------------------------------------------------------ stimuli
  /** A rifle shot: everything nearby startles; the closer (and the bullet's impact) the stronger. */
  gunshot(px: number, pz: number, impactX: number, impactZ: number) {
    for (const a of this.animals) {
      if (!a.alive) continue;
      const d = Math.hypot(a.x - px, a.z - pz);
      const di = Math.hypot(a.x - impactX, a.z - impactZ);
      if (d < 420 || di < 30) {
        const k = d < 160 || di < 22 ? 2.2 : d < 300 ? 1.25 : 0.7;
        this.raise(a, k, di < 22 ? impactX : px, di < 22 ? impactZ : pz);
      }
    }
  }
  /** Ambient disturbance (flushed birds, thunder) */
  disturb(x: number, z: number, radius: number, amount: number) {
    for (const a of this.animals) if (a.alive && Math.hypot(a.x - x, a.z - z) < radius) this.raise(a, amount, x, z);
  }
  /** Player call: matching species within range come to investigate (males keener). Over-calling raises suspicion. */
  call(x: number, z: number, species: string[]): number {
    this.calls = this.calls.filter(t => this.time - t < 45);
    this.calls.push(this.time);
    let n = 0;
    for (const a of this.animals) {
      if (!a.alive || !species.includes(a.bp.species)) continue;
      const d = Math.hypot(a.x - x, a.z - z);
      if (d > 400 || d < 25) continue;
      if (this.calls.length > 3) { a.awareness += 0.55; continue; }
      if (a.awareness > 0.7 || a.state === "flee" || a.state === "wounded") continue;
      const p = (a.sex === "male" ? 0.75 : 0.4) * (1 - d / 520);
      if (this.rng() < p) {
        a.state = "investigate"; a.stateT = 0;
        const ang = this.rng() * Math.PI * 2, stop = 25 + this.rng() * 30;
        a.goalX = x + Math.cos(ang) * stop; a.goalZ = z + Math.sin(ang) * stop;
        a.threat.set(x, z);
        if (a.sex === "male" && (a.bp.species === "Elk" || a.bp.species === "Red Deer" || a.bp.species === "Mule Deer" || a.bp.species === "Wild Boar" || a.bp.species === "Bison")) a.answerT = 1.2 + this.rng() * 2.5;
        n++;
      }
    }
    return n;
  }

  private raise(a: Animal, amount: number, sx: number, sz: number) {
    a.awareness = Math.max(a.awareness, 0) + amount;
    a.threat.set(sx, sz);
    if (a.awareness >= AWARE.alert) a.everAlerted = true;
  }

  // ------------------------------------------------------------------ hits
  /** Called by the hunt session after grading. */
  applyHit(a: Animal, lethal: boolean, wound: Animal["wound"], fromX: number, fromZ: number) {
    if (!a.alive) return;
    a.wounds++;
    if (lethal || a.wounds >= 2) { this.kill(a, false); return; }
    a.oneShot = false;
    a.wound = wound;
    a.bleed = wound === "liver" ? 260 : wound === "gut" ? 320 : wound === "neck" ? 160 : 110;
    a.staggerT = 0.72;                        // v2.0.2 stagger
    a.state = "wounded"; a.stateT = 0;
    a.threat.set(fromX, fromZ);
    a.awareness = 3;
    if (wound === "liver") a.dieAt = this.time + 70 + this.rng() * 40;
    a.everAlerted = true;
    for (const m of a.herd.members) if (m !== a && m.alive) this.raise(m, 2.2, fromX, fromZ);
  }

  kill(a: Animal, delayed: boolean) {
    a.alive = false;
    a.state = "dead"; a.stateT = 0;
    a.speed = 0; a.targetSpeed = 0;
    a.killedAt = this.time;
    this.events.onDeath?.(a, delayed);
  }

  // ------------------------------------------------------------------ update
  update(dt: number, player: Player, env: { windVector: () => [number, number]; lightLevel: () => number; visibility: () => number }, scentBlocker: number, camPos: THREE.Vector3) {
    this.time += dt;
    const [wx, wz] = env.windVector();
    const hx = player.pos.x, hz = player.pos.z;
    for (const h of this.herds) {
      h.goalT -= dt;
      const live = h.members.filter(m => m.alive && m.state !== "wounded");
      if (!live.length) continue;
      if (!h.leader.alive || h.leader.state === "wounded") h.leader = live[0];
      if (h.goalT <= 0 && h.leader.state !== "flee") {
        const kinds: NeedZone["kind"][] = ["feed", "feed", "water", "bed"];
        const z = this.pickZone(h.species, rngPick(this.rng, kinds), { licensed: [], count: 0, hour: 12, seed: 0 });
        this.setGoal(h, z);
        for (const m of live) if (m.state === "bed" && this.rng() < 0.6) { m.state = "walk"; m.stateT = 0; this.events.onBed?.(m, m.x, m.z, m.heading); }
      }
    }
    for (const a of this.animals) {
      a.stateT += dt;
      const dPlayer = Math.hypot(a.x - hx, a.z - hz);
      if (a.alive) {
        // ---- senses (5 Hz)
        a.senseT -= dt;
        if (a.senseT <= 0) {
          a.senseT = 0.2;
          let stim = 0;
          const S = a.bp.senses;
          // aloft on a stand or tower the scent stream mostly passes over the game; a blind holds some in
          const sc = scentStrength({ hx, hz, ax: a.x, az: a.z, windX: wx, windZ: wz, smell: S.smell, blocker: scentBlocker }) * (player.perch?.scent ?? 1);
          if (sc > 0.15) { stim += sc * 1.4 * 0.2 / 0.2; a.threat.set(hx, hz); }
          const hr = hearingStrength(player.noise, S.hearing, dPlayer);
          if (hr > 0) { stim += hr * 0.9; a.threat.set(hx, hz); }
          if (dPlayer < S.sight * 1.3) {
            const toP = Math.atan2(hx - a.x, hz - a.z);
            const ang = wrapAngle(toP - a.heading - a.pose.lookYaw);
            let s = sightStrength(S.sight, player.visibility, dPlayer, ang, a.awareness > 0.6 || a.state === "alert");
            if (a.state === "graze" && a.pose.graze > 0.6) s *= 0.35; // head down
            if (a.state === "bed") s *= 0.7;
            if (s > 0) {
              if (!this.lineOfSight(a, player)) s *= 0.08;
              else if (this.world.colliders.segment(a.x, a.y + a.height, a.z, hx, player.pos.y + player.eye, hz, c => c.kind === "tree")) s *= 0.4;
              stim += s * 1.6 * S.wariness;
              if (s > 0.05) a.threat.set(hx, hz);
            }
          }
          // game passing right by notices you — unless you are well above it
          if (dPlayer < (player.perch && player.perch.kind !== "blind" ? 2 : 6)) { stim += 3; a.threat.set(hx, hz); }
          if (stim > 0) a.awareness += stim * 0.2 * (0.6 + S.wariness) * this.awarenessScale;
          else a.awareness = Math.max(0, a.awareness - AWARE.decay * 0.2 * (a.state === "flee" ? 0.5 : 1));
          if (a.awareness >= AWARE.alert) a.everAlerted = true;
        }
        this.think(a, dt, player);
      } else {
        a.speed = damp(a.speed, 0, 6, dt);
      }
      this.move(a, dt);
      // ---- pose & animation (LOD by camera distance)
      const dCam = Math.hypot(a.x - camPos.x, a.z - camPos.z);
      a.obj.root.visible = dCam < this.world.quality.treeFar + 40;
      const skip = dCam > 320 ? 4 : dCam > 160 ? 2 : 1;
      a.lodSkip = (a.lodSkip + 1) % skip;
      this.updatePose(a, dt, player);
      a.anim.advance(a.pose, dt);
      if (a.lodSkip === 0 && a.obj.root.visible) a.anim.apply(a.pose);
      a.obj.root.position.set(a.x, a.y, a.z);
      a.obj.root.rotation.y = a.heading;
    }
  }

  private lineOfSight(a: Animal, p: Player): boolean {
    const t = this.world.terrain;
    const ax = a.x, ay = a.y + a.height * 0.95, az = a.z;
    const bx = p.pos.x, by = p.pos.y + p.eye, bz = p.pos.z;
    for (let i = 1; i < 8; i++) {
      const u = i / 8;
      const x = ax + (bx - ax) * u, y = ay + (by - ay) * u, z = az + (bz - az) * u;
      if (heightAt(t, x, z) > y + 0.15) return false;
    }
    return true;
  }

  private think(a: Animal, dt: number, player: Player) {
    const S = a.bp.senses, G = a.bp.gait;
    const ldr = a.herd.leader;
    // death from a liver wound
    if (this.time >= a.dieAt) { this.kill(a, true); return; }
    // escalation (wounded animals manage their own state)
    if (a.state !== "wounded") {
      if (a.awareness >= AWARE.flee && a.state !== "flee") {
        a.state = "flee"; a.stateT = 0;
        a.goalX = a.x + (a.x - a.threat.x); a.goalZ = a.z + (a.z - a.threat.y);
        this.events.onFlee?.(a);
        if (this.rng() < 0.7) this.events.onAlarm?.(a, a.bp.species === "Wild Boar" ? "bark" : "snort");
        // the whole herd bolts
        for (const m of a.herd.members) if (m !== a && m.alive && m.state !== "flee" && m.state !== "wounded") { m.awareness = Math.max(m.awareness, AWARE.flee + 0.05); m.threat.copy(a.threat); }
      } else if (a.awareness >= AWARE.alert && (a.state === "graze" || a.state === "walk" || a.state === "drink" || a.state === "bed" || a.state === "investigate")) {
        if (a.state === "bed" && Math.hypot(a.x - player.pos.x, a.z - player.pos.z) < 35) { a.awareness = AWARE.flee + 0.1; return; }
        a.state = "alert"; a.stateT = 0;
        if (this.rng() < 0.5) this.events.onAlarm?.(a, a.bp.species.includes("Deer") || a.bp.species === "Elk" ? "stomp" : "snort");
        for (const m of a.herd.members) if (m !== a && m.alive && m.awareness < AWARE.alert * 0.8) { m.awareness += 0.45; m.threat.copy(a.threat); }
      }
    }
    switch (a.state) {
      case "graze": case "drink": {
        a.targetSpeed = 0;
        a.vigilT -= dt;
        if (a.stateT > 5 + (a.id % 7) && this.rng() < dt * 0.25) { a.state = "walk"; a.stateT = 0; a.goalX = a.x + (this.rng() - 0.5) * 14; a.goalZ = a.z + (this.rng() - 0.5) * 14; }
        if (a !== ldr && Math.hypot(a.x - (ldr.x + a.slot[0]), a.z - (ldr.z + a.slot[1])) > 22) { a.state = "walk"; a.stateT = 0; }
        if (a === ldr && Math.hypot(a.x - a.goalX, a.z - a.goalZ) > a.herd.goal.r * 0.9) { a.state = "walk"; a.stateT = 0; }
        if (a.stateT > 4 && this.rng() < dt * 0.02) this.events.onDropping?.(a, a.x - Math.sin(a.heading) * 0.6, a.z - Math.cos(a.heading) * 0.6);
        break;
      }
      case "walk": {
        if (a !== ldr) { a.goalX = ldr.x + a.slot[0]; a.goalZ = ldr.z + a.slot[1]; }
        const d = Math.hypot(a.x - a.goalX, a.z - a.goalZ);
        a.targetSpeed = d > 30 && a !== ldr ? G.trot.speed : G.walk.speed;
        if (d < 3 || a.stateT > 40) { a.state = a.herd.goal.kind === "water" && a === ldr ? "drink" : "graze"; a.stateT = 0; }
        break;
      }
      case "alert": {
        a.targetSpeed = 0;
        if (a.awareness < AWARE.alert * 0.55 && a.stateT > 2) { a.state = "graze"; a.stateT = 0; }
        if (a.stateT > 3 && this.rng() < dt * 0.15) this.events.onAlarm?.(a, "stomp");
        break;
      }
      case "flee": {
        const away = Math.hypot(a.x - a.threat.x, a.z - a.threat.y);
        const close = away < 60;
        a.targetSpeed = a.stateT < 1.0 ? G.flee * 0.8 : close || a.awareness > AWARE.flee ? G.flee : G.trot.speed * 1.2;
        if (Math.hypot(a.x - a.goalX, a.z - a.goalZ) < 15) {
          // keep running directly away while the threat is close
          a.goalX = a.x + (a.x - a.threat.x) * 1.5 + (this.rng() - 0.5) * 30; a.goalZ = a.z + (a.z - a.threat.y) * 1.5 + (this.rng() - 0.5) * 30;
        }
        const limit = lerp(S.fleeDistance[0], S.fleeDistance[1], (a.id % 10) / 10);
        if ((away > limit && a.awareness < AWARE.flee) || a.stateT > 40) {
          a.state = "walk"; a.stateT = 0; a.awareness = Math.min(a.awareness, AWARE.alert * 0.9);
          if (a === ldr) { const z = this.pickZone(a.herd.species, "bed", { licensed: [], count: 0, hour: 12, seed: 0 }); this.setGoal(a.herd, z); }
        }
        break;
      }
      case "bed": {
        a.targetSpeed = 0;
        if (a.stateT > 90 + (a.id % 5) * 30 && this.rng() < dt * 0.05) { a.state = "graze"; a.stateT = 0; this.events.onBed?.(a, a.x, a.z, a.heading); }
        break;
      }
      case "investigate": {
        const d = Math.hypot(a.x - a.goalX, a.z - a.goalZ);
        a.targetSpeed = d > 4 ? G.walk.speed * 1.25 : 0;
        if (a.answerT > 0) { a.answerT -= dt; if (a.answerT <= 0) this.events.onAnswer?.(a); }
        if (a.stateT > 50 || (d < 4 && a.stateT > 15)) { a.state = "graze"; a.stateT = 0; }
        break;
      }
      case "wounded": {
        if (a.staggerT > 0) { a.staggerT -= dt; a.targetSpeed = 0; a.speed = 0; break; }
        const tSince = a.stateT - 0.72;
        if (tSince < 14) {
          a.targetSpeed = G.flee * 0.72;
          if (Math.hypot(a.x - a.goalX, a.z - a.goalZ) < 10 || tSince < 0.2) { a.goalX = a.x + (a.x - a.threat.x) * 2 + (this.rng() - 0.5) * 40; a.goalZ = a.z + (a.z - a.threat.y) * 2 + (this.rng() - 0.5) * 40; }
        } else if (tSince < 40) {
          a.targetSpeed = G.walk.speed * 0.8;
        } else {
          // bed down in cover; jumps up if the hunter blunders in
          a.targetSpeed = 0;
          const dp = Math.hypot(a.x - player.pos.x, a.z - player.pos.z);
          const sneaky = player.stance !== "stand" && player.noise < 8;
          if (dp < (sneaky ? 14 : 32) && tSince > 45) { a.stateT = 0.72 + 1; a.threat.set(player.pos.x, player.pos.z); a.goalX = a.x + (a.x - player.pos.x) * 3; a.goalZ = a.z + (a.z - player.pos.z) * 3; this.events.onAlarm?.(a, "snort"); }
          // non-lethal wounds stop bleeding and the animal recovers
          if ((a.wound === "flesh" || a.wound === "leg") && tSince > 90) { a.wound = "none"; a.state = "walk"; a.stateT = 0; a.bleed = 0; }
        }
        break;
      }
    }
    // vigilance head-ups while grazing
    if (a.state === "graze") {
      a.vigilT -= dt;
      if (a.vigilT <= 0) { a.vigilT = 6 + this.rng() * 10; a.lookTarget = (this.rng() - 0.5) * 2; }
    }
  }

  private move(a: Animal, dt: number) {
    const t = this.world.terrain;
    if (a.state === "dead") { a.y = heightAt(t, a.x, a.z); return; }
    // desired heading
    let want = a.heading;
    if (a.state === "walk" || a.state === "flee" || a.state === "investigate" || (a.state === "wounded" && a.targetSpeed > 0)) want = Math.atan2(a.goalX - a.x, a.goalZ - a.z);
    if (a.state === "alert") want = Math.atan2(a.threat.x - a.x, a.threat.y - a.z);
    // steering: obstacles, water, cliffs, boundary
    const look = 2.5 + a.speed * 0.6;
    const probe = (h: number) => {
      const px = a.x + Math.sin(h) * look, pz = a.z + Math.cos(h) * look;
      let pen = 0;
      if (this.world.colliders.query(px, pz, a.radius * 0.5 + 0.6).length) pen += 1;
      const wl = waterLevelAt(t, px, pz);
      if (wl !== null && heightAt(t, px, pz) < wl - 0.25) pen += 2;
      if (Math.abs(heightAt(t, px, pz) - a.y) / look > 0.85) pen += 1.5;
      if (Math.abs(px) > t.half - 45 || Math.abs(pz) > t.half - 45) pen += 3;
      return pen;
    };
    if (a.speed > 0.2 || a.targetSpeed > 0.2) {
      if (probe(want) > 0) {
        for (const off of [0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.4, -2.4]) { if (probe(want + off) === 0) { want += off; break; } }
      }
      // boundary push back
      if (Math.abs(a.x) > t.half - 60 || Math.abs(a.z) > t.half - 60) want = Math.atan2(-a.x, -a.z);
    }
    // separation from herd mates
    let sx = 0, sz = 0;
    for (const m of a.herd.members) { if (m === a || !m.alive) continue; const dx = a.x - m.x, dz = a.z - m.z, d = Math.hypot(dx, dz); if (d < 2.2 && d > 0.01) { sx += dx / d * (2.2 - d); sz += dz / d * (2.2 - d); } }
    const turnRate = a.state === "flee" || a.state === "wounded" ? 2.8 : 1.4;
    if (a.speed > 0.1 || a.state === "alert") a.heading = dampAngle(a.heading, want, turnRate, dt);
    const accel = a.targetSpeed > a.speed ? (a.state === "flee" ? 6 : 2) : 3;
    a.speed = damp(a.speed, a.targetSpeed, accel, dt);
    const fx = Math.sin(a.heading), fz = Math.cos(a.heading);
    let nx = a.x + fx * a.speed * dt + sx * dt * 0.8, nz = a.z + fz * a.speed * dt + sz * dt * 0.8;
    [nx, nz] = this.world.colliders.resolve(nx, nz, a.radius * 0.35, a.y);
    const moved = Math.hypot(nx - a.x, nz - a.z);
    a.x = nx; a.z = nz;
    a.y = heightAt(t, a.x, a.z);
    // tracks: one print per half stride
    if (moved > 0) {
      a.trackAcc += moved;
      const half = a.bp.track.stride * (a.speed > a.bp.gait.trot.speed ? 1.6 : 1) * 0.5;
      if (a.trackAcc > half) {
        a.trackAcc = 0; a.foot ^= 1;
        this.events.onTrack?.(a, a.x + Math.cos(a.heading) * a.bp.track.straddle * 0.5 * (a.foot ? 1 : -1), a.z - Math.sin(a.heading) * a.bp.track.straddle * 0.5 * (a.foot ? 1 : -1), a.heading, a.foot, a.speed > a.bp.gait.trot.speed);
        if (a.speed > 2.5) this.events.onFootfall?.(a, clamp01(a.speed / 10));
      }
      if (a.bleed > 0 && (a.state === "wounded" || a.wound !== "none")) {
        a.bleedAcc += moved;
        if (a.bleedAcc > 2.6) { a.bleedAcc = 0; a.bleed -= 2.6; this.events.onHitSign?.(a, a.x + (this.rng() - 0.5) * 0.4, a.z + (this.rng() - 0.5) * 0.4); }
      }
    }
  }

  private updatePose(a: Animal, dt: number, player: Player) {
    const p = a.pose;
    p.speed = a.speed;
    p.gait = a.bp.gait.stot && a.state === "flee" && a.speed > 5 && a.stateT < 3 ? "stot" : undefined;
    const st = a.state;
    p.graze = damp(p.graze, st === "graze" || st === "drink" ? (a.vigilT > 2.5 ? 1 : 0) : 0, 3, dt);
    p.alert = damp(p.alert, st === "alert" || st === "investigate" || a.awareness > 0.6 ? 1 : 0, 5, dt);
    p.bed = damp(p.bed, st === "bed" || (st === "wounded" && a.stateT > 41 && a.targetSpeed === 0) ? 1 : 0, 1.6, dt);
    p.dead = st === "dead" ? Math.min(1, p.dead + dt / 0.9) : 0;
    p.deadSide = a.deadSide;
    p.wounded = damp(p.wounded, st === "wounded" || a.wound !== "none" ? 1 : 0, 2, dt);
    p.limpLeg = a.id % 4;
    // look toward the threat or idle glances
    let ly = 0;
    if (st === "alert" || st === "investigate") ly = wrapAngle(Math.atan2(a.threat.x - a.x, a.threat.y - a.z) - a.heading);
    else if (st === "graze") ly = a.lookTarget * (1 - p.graze);
    p.lookYaw = damp(p.lookYaw, clamp(ly, -1.5, 1.5), 3, dt);
    p.earL = Math.sin(p.t * 0.7 + a.id) > 0.97 ? 0.6 : 0;
    p.earR = Math.sin(p.t * 0.63 + a.id * 2) > 0.97 ? 0.6 : 0;
    p.tail = st === "flee" ? (a.bp.species === "Wild Boar" ? 1 : 0.5) : st === "alert" ? 0.3 : 0;
    p.tailFlick = st === "graze" ? 1 : 0.2;
    // terrain pitch
    const t = this.world.terrain;
    const L = (a.bp.legs[0].joints[0].p[2] - a.bp.legs[1].joints[0].p[2]) * a.scale;
    const hf = heightAt(t, a.x + Math.sin(a.heading) * L * 0.5, a.z + Math.cos(a.heading) * L * 0.5);
    const hb = heightAt(t, a.x - Math.sin(a.heading) * L * 0.5, a.z - Math.cos(a.heading) * L * 0.5);
    p.slope = damp(p.slope, Math.atan2(hf - hb, Math.max(0.5, L)), 6, dt);
    if (a.staggerT > 0) p.slope += Math.sin(a.staggerT * 30) * 0.06;
    void player;
  }

  /** Nearest alive animal whose body intersects the screen-centre ray within maxDist (for range / species readouts). */
  pick(ray: THREE.Ray, maxDist: number): { animal: Animal; dist: number } | null {
    let best: { animal: Animal; dist: number } | null = null;
    for (const a of this.animals) {
      if (!a.obj.root.visible) continue;
      const c = a.center(this.tmp);
      const d = ray.distanceToPoint(c);
      const along = c.clone().sub(ray.origin).dot(ray.direction);
      if (along < 0 || along > maxDist) continue;
      if (d < a.radius * 0.85 && (!best || along < best.dist)) best = { animal: a, dist: along };
    }
    return best;
  }

  remaining(licensed: string[]) { return this.animals.filter(a => a.alive && licensed.includes(a.bp.species)).length; }

  dispose() {
    for (const a of this.animals) { a.obj.mesh.geometry.dispose(); a.obj.mesh.skeleton.dispose(); }
    this.animals = []; this.herds = [];
  }
}

export { maskAt };
