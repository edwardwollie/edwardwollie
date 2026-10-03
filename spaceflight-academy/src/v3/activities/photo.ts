import * as THREE from "three";
import { sfx } from "../engine/audio.ts";
import type { PlanetKind } from "../engine/space.ts";
import { PHOTO_TARGETS, type PhotoTarget } from "../data/destinations.ts";
import { bakeStatic } from "../models/bake.ts";
import { ActivityScene, type ActivityControl, type Gauge } from "./base.ts";

interface Feature {
  target: PhotoTarget;
  anchor: THREE.Object3D;
  taken: boolean;
}

/**
 * Outer Worlds photo flyby: Pathfinder swoops past a giant planet. When a named
 * feature slides into the camera frame, tap SNAP. Three photos complete the album.
 */
export class PhotoActivity extends ActivityScene {
  readonly id = "act-photo";
  readonly kind = "photo" as const;
  private planetKind: PlanetKind = "jupiter";
  private world = new THREE.Group();
  private probe: THREE.Object3D | null = null;
  private features: Feature[] = [];
  private flyT = 0;
  private photos = 0;
  private misses = 0;
  private flash = 0;
  private frameRadius = 0.22;
  private builtFor = "";
  private readonly projected = new THREE.Vector3();
  private nextIndex = 0;
  private readonly aim = new THREE.Vector2();

  protected buildWorld() {
    const space = this.game.space;
    this.scene.add(space.skySphere(["#2a1f6a", "#c03a9a", "#3a9fe8"], 4.4, 9000));
    this.scene.add(space.starfield(1800, 8500, 1.4));
    this.scene.add(new THREE.AmbientLight(0x7080b0, 0.55));
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.8);
    sun.position.set(-600, 300, 500);
    this.scene.add(sun);
    this.scene.add(this.world);
    const probe = this.game.model("probe-pathfinder");
    bakeStatic(probe.root);
    probe.root.scale.setScalar(1.6);
    this.probe = probe.root;
    this.scene.add(probe.root);
  }

  private buildPlanet(kind: PlanetKind) {
    if (this.builtFor === kind) return;
    this.builtFor = kind;
    this.world.clear();
    this.features = [];
    const space = this.game.space;
    const radius = kind === "jupiter" ? 300 : kind === "saturn" ? 240 : 190;
    const planet = space.planet(kind, radius, { rings: kind === "saturn" || kind === "uranus" });
    if (kind === "uranus") {
      planet.rotation.z = 1.5;
      const rings = planet.getObjectByName("rings");
      if (rings) rings.scale.setScalar(0.75);
    } else planet.rotation.z = 0.35;
    planet.position.set(0, 0, 0);
    this.world.add(planet);
    const targets = PHOTO_TARGETS[kind] ?? PHOTO_TARGETS.jupiter;
    const moonKinds: Record<string, PlanetKind> = { "jupiter-io": "io", "jupiter-europa": "europa", "saturn-titan": "titan", "uranus-miranda": "moon", "neptune-triton": "europa" };
    targets.forEach((target, i) => {
      const anchor = new THREE.Object3D();
      if (moonKinds[target.id]) {
        const moon = space.planet(moonKinds[target.id], 26, { atmosphere: target.id === "saturn-titan" ? "#ffb85e" : null });
        moon.position.set(-radius * 1.9 + i * 120, 70 - i * 60, 240 - i * 60);
        this.world.add(moon);
        anchor.position.copy(moon.position);
      } else if (target.id.includes("rings") || target.id.includes("cassini")) {
        anchor.position.set(radius * 1.75, 0, 40);
      } else {
        // a spot on the planet's face toward the flyby path
        anchor.position.set(-radius * 0.35 + i * 30, -radius * 0.32, radius * 0.88);
      }
      this.world.add(anchor);
      this.features.push({ target, anchor, taken: false });
    });
  }

  protected reset() {
    this.frameRadius = this.assist === 2 ? 0.3 : this.assist === 1 ? 0.22 : 0.16;
  }

  enter(params?: unknown) {
    const run = (params as { run?: { mission: { target: string } } } | undefined)?.run;
    this.planetKind = (run?.mission.target as PlanetKind) || "jupiter";
    if (!["jupiter", "saturn", "uranus", "neptune"].includes(this.planetKind)) this.planetKind = "jupiter";
    this.buildPlanet(this.planetKind);
    this.photos = 0;
    this.misses = 0;
    this.flyT = 0;
    this.nextIndex = 0;
    for (const f of this.features) f.taken = false;
    super.enter(params);
  }

  private name() {
    return this.planetKind[0].toUpperCase() + this.planetKind.slice(1);
  }

  protected title() { return `Photo flyby: ${this.name()}`; }
  protected help() {
    const next = this.features[this.nextIndex];
    return next ? `Find: ${next.target.name}. Aim the camera with the joystick (or drag), then tap SNAP when it is inside the circle!` : "Album complete!";
  }
  protected intro() { return `Flyby of ${this.name()}! ${this.help()}`; }
  protected controls(): ActivityControl[] { return ["snap"]; }
  protected steerEnabled() { return true; }
  protected gauges(): Gauge[] { return [{ label: "Photos", value: this.photos, max: 3 }]; }
  protected progress() { return this.inFrame() ? "🟢 In the frame — SNAP!" : "🔭 Searching…"; }

  private inFrame(): boolean {
    const next = this.features[this.nextIndex];
    if (!next) return false;
    next.anchor.getWorldPosition(this.projected);
    this.projected.project(this.camera);
    if (this.projected.z > 1) return false;
    const aspect = this.game.engine.aspect;
    const dx = this.projected.x * Math.max(1, aspect), dy = this.projected.y * Math.max(1, 1 / aspect);
    return Math.hypot(dx, dy) < this.frameRadius * 2;
  }

  /** Screen position (0..1) of the current target for the HUD hint arrow. */
  targetScreen() {
    const next = this.features[this.nextIndex];
    if (!next) return null;
    next.anchor.getWorldPosition(this.projected);
    this.projected.project(this.camera);
    return { x: (this.projected.x + 1) / 2, y: (1 - this.projected.y) / 2, behind: this.projected.z > 1 };
  }

  protected onPress(name: ActivityControl) {
    if (this.phase !== "play" || (name !== "snap")) return;
    const next = this.features[this.nextIndex];
    if (!next) return;
    this.flash = 1;
    sfx("shutter");
    if (!this.inFrame()) {
      this.misses++;
      this.message = `Not quite — wait for ${next.target.name} to be inside the circle.`;
      window.setTimeout(() => { if (this.phase === "play") this.message = null; }, 1800);
      return;
    }
    next.taken = true;
    this.photos++;
    this.nextIndex++;
    this.card = { icon: "📸", title: next.target.name, text: next.target.fact };
    this.say(`Great shot! ${next.target.name}. ${next.target.fact}`);
    this.game.save.set((s) => ({ v3: { ...s.v3, photos: [...new Set([...s.v3.photos, next.target.id])] } }));
    if (this.photos >= 3) {
      this.attempts = 1 + Math.min(2, Math.floor(this.misses / 2));
      window.setTimeout(() => this.success(this.attemptScore(0), `Photo album complete! ${this.name()} looks amazing.`, { icon: "🪐", title: `${this.name()} album`, text: "Your photos were beamed home by Pathfinder's big dish antenna — radio messages from this far take hours to reach Earth!" }), 1600);
    }
  }

  protected step(dt: number) {
    this.flyT += dt;
    this.flash = Math.max(0, this.flash - dt * 3);
    const next = this.features[this.nextIndex] ?? this.features[0];
    const target = new THREE.Vector3();
    next.anchor.getWorldPosition(target);
    // The probe swoops past: the view drifts, and the cadet steers the camera to keep the target framed.
    const drift = this.assist === 2 ? 45 : this.assist === 1 ? 70 : 95;
    const steer = this.steer();
    this.aim.x = THREE.MathUtils.clamp(this.aim.x + steer.x * 110 * dt, -260, 260);
    this.aim.y = THREE.MathUtils.clamp(this.aim.y + steer.y * 110 * dt, -200, 200);
    const dir = target.clone().normalize();
    const camPos = target.clone().add(dir.clone().multiplyScalar(160)).add(new THREE.Vector3(60, 40, 220));
    this.camera.position.lerp(camPos, 1 - Math.exp(-1.5 * dt));
    const look = target.clone().add(new THREE.Vector3(Math.sin(this.flyT * 0.6) * drift + this.aim.x, Math.cos(this.flyT * 0.45) * drift * 0.5 + this.aim.y, 0));
    this.camera.lookAt(look);
    if (this.probe) {
      const p = this.camera.position.clone().add(new THREE.Vector3(-14, -10, -40).applyQuaternion(this.camera.quaternion));
      this.probe.position.lerp(p, 1 - Math.exp(-4 * dt));
      this.probe.lookAt(target);
      this.probe.rotateX(-Math.PI / 2);
    }
    for (const child of this.world.children) child.rotation.y += dt * 0.02;
  }

  enterAimReset() { this.aim.set(0, 0); }

  qaSnapAll() {
    for (let i = 0; i < 3; i++) {
      const next = this.features[this.nextIndex];
      if (!next) break;
      next.anchor.getWorldPosition(this.projected);
      this.camera.lookAt(this.projected);
      this.camera.updateMatrixWorld();
      this.onPress("snap");
    }
  }
}
