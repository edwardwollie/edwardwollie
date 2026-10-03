// Lodge backdrop: the live reserve at golden hour. A herd is settled on a
// scenic feeding or watering ground and a slow cinematic camera drifts along
// the longest arc around it that is clear of trees.

import * as THREE from "three";
import type { Mode } from "../engine/host.ts";
import { World } from "../world/world.ts";
import { buildLandmarks } from "../world/structures.ts";
import { Animal, AnimalManager, type Herd } from "../hunt/animals.ts";
import { mulberry32 } from "../core/rng.ts";
import { Player } from "../hunt/player.ts";
import { Precipitation } from "../hunt/fx.ts";
import type { QualitySettings } from "../render/quality.ts";
import type { TimeKey, WeatherKey } from "../world/environment.ts";
import { heightAt, normalAt, waterLevelAt } from "../world/terrain-gen.ts";
import { disposeObject } from "../engine/dispose.ts";
import type { NeedZone } from "../blueprints/reserves.ts";

export interface ShowcaseOptions { reserve: string; time: TimeKey; weather: WeatherKey; species?: string[]; seed?: number; hour?: number; frameRight?: boolean }

export class ShowcaseMode implements Mode {
  world: World;
  animals: AnimalManager;
  camera = new THREE.PerspectiveCamera(46, 1, 0.3, 5200);
  private player: Player;
  private precip: Precipitation;
  private focus = new THREE.Vector3();
  private lookAt = new THREE.Vector3();
  private arc = { mid: 0, half: 0.5, r: 18, h: 2.7 };
  private frameRight: boolean;
  private t = 0;
  private period = 80;
  herd: Herd | null = null;
  ready = false;
  constructor(renderer: THREE.WebGLRenderer, quality: QualitySettings, o: ShowcaseOptions) {
    this.world = new World(renderer, { reserve: o.reserve, time: o.time, weather: o.weather, seed: o.seed ?? 3 }, quality);
    const { group, colliders } = buildLandmarks(this.world);
    this.world.structures.add(group);
    for (const c of colliders) this.world.colliders.add(c);
    this.world.env.timeScale = 0;
    if (o.hour !== undefined) this.world.env.hour = o.hour;
    this.frameRight = o.frameRight ?? true;
    const def = this.world.def;
    this.player = new Player(this.world, def.spawn.x, def.spawn.z, 0);
    this.player.pos.set(1e5, -500, 1e5);               // out of every sense range
    this.animals = new AnimalManager(this.world, quality.animalLod);
    const wanted = (o.species ?? []).filter(s => def.fauna.includes(s));
    this.animals.spawn({ licensed: wanted.length ? wanted : def.fauna, count: 3, hour: this.world.env.hour, seed: (o.seed ?? 3) * 13 + 5, free: false });
    this.precip = new Precipitation(Math.min(quality.particles, 2500));
    this.world.scene.add(this.animals.group, this.precip.mesh);
    this.camera.rotation.order = "YXZ";
    this.stage(wanted);
    this.ready = true;
  }

  /** Pick a herd with a mature male, settle it on the most open scenic zone and find a clear camera arc. */
  private stage(preferred: string[]) {
    const def = this.world.def, t = this.world.terrain;
    const herds = [...this.animals.herds].sort((a, b) => score(b) - score(a));
    function score(h: Herd) {
      const male = h.members.some(m => m.sex === "male" && m.bp.headgear.length > 0) ? 3 : 0;
      return male + (preferred.includes(h.species) ? 2 : 0) + Math.min(h.members.length, 5) * 0.2;
    }
    const herd = herds[0] ?? null;
    this.herd = herd;
    if (herd && !herd.members.some(m => m.sex === "male" && m.bp.headgear.length > 0)) {
      const bp = herd.members[0].bp;
      const L = herd.members[0];
      const male = new Animal(9001, bp, "male", 0.95, 4242, herd, L.x + 4, L.z + 3, 0, this.animals.lod, mulberry32(77));
      male.licensed = true;
      male.slot = [4, 3];
      herd.members.push(male); this.animals.animals.push(male); this.animals.group.add(male.obj.root);
    }
    // candidate zones: water first, then open feeding ground
    const zones = def.zones.filter(z => z.kind !== "bed" && (!herd || !z.species || z.species.includes(herd.species)));
    zones.sort((a, b) => (a.kind === "water" ? -1 : 0) - (b.kind === "water" ? -1 : 0));
    let best: { zone: NeedZone; mid: number; half: number; cx: number; cz: number; score: number } | null = null;
    for (const z of zones.slice(0, 8)) {
      const [cx, cz] = this.groundNear(z.x, z.z);
      const a = this.clearArc(cx, cz);
      const sc = a.half * (z.kind === "water" ? 1.2 : 1) * (a.land ? 1.4 : 1);
      if (!best || sc > best.score) best = { zone: z, mid: a.mid, half: a.half, cx, cz, score: sc };
    }
    const cx = best?.cx ?? 0, cz = best?.cz ?? 0;
    this.focus.set(cx, heightAt(t, cx, cz), cz);
    this.arc.mid = best?.mid ?? 0;
    this.arc.half = Math.min(0.75, Math.max(0.12, (best?.half ?? 0.3) * 0.8));
    // keep only the staged herd (and its ground) — cheaper and calmer
    if (herd) {
      for (const h of this.animals.herds) if (h !== herd) for (const m of h.members) this.animals.group.remove(m.obj.root);
      this.animals.animals = this.animals.animals.filter(a => a.herd === herd);
      this.animals.herds = [herd];
      const n = herd.members.length;
      herd.members.forEach((m, i) => {
        const ang = (i / Math.max(1, n)) * Math.PI * 2 + 0.6, d = i === 0 ? 0 : 3 + (i % 3) * 3.2;
        const [x, z] = this.groundNear(cx + Math.cos(ang) * d, cz + Math.sin(ang) * d);
        m.x = x; m.z = z; m.y = heightAt(t, x, z);
        m.state = "graze"; m.stateT = -i * 3; m.pose.bed = 0; m.awareness = 0;
        m.heading = Math.atan2(cx - x, cz - z) + (i % 2 ? 1.3 : -1.1);
        m.obj.root.position.set(m.x, m.y, m.z);
      });
      herd.goal = { kind: "feed", x: cx, z: cz, r: 12 };
      herd.goalT = 1e9;
      herd.leader.goalX = cx; herd.leader.goalZ = cz;
      // the mature male is the leader so he stays near the centre of the frame
      const male = herd.members.find(m => m.sex === "male");
      if (male) herd.leader = male;
    }
    this.placeCamera(0);
    this.lookAt.copy(this.focus).add(new THREE.Vector3(0, 1.1, 0));
  }

  /** Nearest dry, gentle, uncluttered ground to (x, z) — searched in widening rings. */
  private groundNear(x0: number, z0: number): [number, number] {
    const t = this.world.terrain;
    const ok = (x: number, z: number) => {
      if (Math.abs(x) > t.half - 70 || Math.abs(z) > t.half - 70) return false;
      const wl = waterLevelAt(t, x, z);
      if (wl !== null && heightAt(t, x, z) < wl + 0.35) return false;
      if (normalAt(t, x, z)[1] < 0.88) return false;
      return this.world.colliders.query(x, z, 3).every(c => Math.hypot(c.x - x, c.z - z) > c.r + 1.6);
    };
    if (ok(x0, z0)) return [x0, z0];
    for (let r = 4; r < 260; r += 4) {
      const n = Math.max(8, Math.round(r * 0.6));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + r * 0.37;
        const x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r;
        if (ok(x, z)) return [x, z];
      }
    }
    return [x0, z0];
  }

  /** Longest run of camera angles around (cx, cz) clear of trees — on land if possible, else over water. */
  private clearArc(cx: number, cz: number): { mid: number; half: number; land: boolean } {
    const N = 72, t = this.world.terrain, R = this.arc.r;
    const fy = heightAt(t, cx, cz) + 1.1;
    const clear: boolean[] = [], land: boolean[] = [];
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      const x = cx + Math.sin(a) * R, z = cz + Math.cos(a) * R;
      const wl = waterLevelAt(t, x, z);
      const wet = wl !== null && heightAt(t, x, z) < wl + 0.2;
      const y = Math.max(heightAt(t, x, z), wet ? wl! : -1e9) + this.arc.h;
      let ok = Math.abs(x) < t.half - 60 && Math.abs(z) < t.half - 60;
      if (ok) ok = this.world.colliders.query(x, z, 6).every(c => (c.kind !== "tree" && c.kind !== "structure" && c.kind !== "rock") || Math.hypot(c.x - x, c.z - z) > c.r + 3);
      if (ok) ok = this.world.colliders.segment(x, y, z, cx, fy, cz, c => c.kind === "tree" || c.kind === "structure" || c.kind === "rock") === null;
      if (ok) for (let i = 1; i < 10; i++) { const u = i / 10; if (heightAt(t, x + (cx - x) * u, z + (cz - z) * u) > y + (fy - y) * u - 0.25) { ok = false; break; } }
      if (ok && !wet && normalAt(t, x, z)[1] < 0.8) ok = false;
      clear.push(ok); land.push(ok && !wet);
    }
    const longest = (arr: boolean[]) => {
      if (arr.every(Boolean)) return { start: 0, len: N };
      let bestLen = 0, bestStart = 0;
      for (let s0 = 0; s0 < N; s0++) {
        if (!arr[s0] || arr[(s0 - 1 + N) % N]) continue;
        let len = 0; while (len < N && arr[(s0 + len) % N]) len++;
        if (len > bestLen) { bestLen = len; bestStart = s0; }
      }
      return { start: bestStart, len: bestLen };
    };
    let r = longest(land), onLand = true;
    if (r.len < 8) { r = longest(clear); onLand = false; }
    return { mid: ((r.start + r.len / 2) / N) * Math.PI * 2, half: (r.len / N) * Math.PI, land: onLand };
  }

  private placeCamera(u: number) {
    const t = this.world.terrain;
    const a = this.arc.mid + Math.sin(u * Math.PI * 2) * this.arc.half;
    const R = this.arc.r + Math.sin(u * Math.PI * 4) * 2;
    const x = this.focus.x + Math.sin(a) * R, z = this.focus.z + Math.cos(a) * R;
    const wl = waterLevelAt(t, x, z);
    const ground = Math.max(heightAt(t, x, z), wl ?? -1e9);
    const y = Math.max(ground + this.arc.h + Math.sin(u * Math.PI * 2 + 1) * 0.5, this.focus.y + 1.2);
    this.camera.position.set(x, y, z);
  }

  update(dt: number, aspect: number) {
    this.t += dt;
    this.placeCamera(this.t / this.period);
    // follow the herd leader gently so the animals stay framed
    if (this.herd) {
      const L = this.herd.leader;
      const target = new THREE.Vector3(L.x, L.y + L.height * 0.6, L.z);
      this.lookAt.lerp(target, 1 - Math.exp(-dt * 0.4));
    }
    this.camera.lookAt(this.lookAt);
    this.camera.aspect = aspect;
    this.camera.fov = aspect < 1 ? 56 : 38;
    // frame the herd in the right-hand part of the screen (the lodge menu sits on the left)
    if (this.frameRight && aspect > 1.2) this.camera.setViewOffset(1000 * aspect, 1000, -1000 * aspect * 0.16, 0, 1000 * aspect, 1000);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.animals.update(dt, this.player, this.world.env, 0, this.camera.position);
    this.world.update(dt, this.camera, this.focus);
    this.precip.update(this.camera.position, this.world.env.w.rain, this.world.env.w.snow, this.world.env.lightLevel());
  }

  render(renderer: THREE.WebGLRenderer) {
    renderer.toneMappingExposure = this.world.env.exposure;
    renderer.render(this.world.scene, this.camera);
  }

  dispose() {
    this.animals.dispose();
    this.world.vegetation.dispose();
    disposeObject(this.world.scene);
  }
}
