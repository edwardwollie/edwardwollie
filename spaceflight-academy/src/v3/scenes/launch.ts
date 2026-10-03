import * as THREE from "three";
import type { Game } from "../app/game.ts";
import { loop, sfx, stopLoops } from "../engine/audio.ts";
import type { SceneController } from "../engine/engine.ts";
import { Particles, damp } from "../engine/fx.ts";
import { skyDome, updateStars } from "../engine/space.ts";
import { analyzeRocket, simulateAscent, type AscentSample } from "../engineering/physics.ts";
import { RANGE_BY_WORLD } from "../engineering/missions.ts";
import type { SystemCounts } from "../engineering/systems.ts";
import { bakeStatic } from "../models/bake.ts";
import { RocketAssembly } from "../world/assembly.ts";

export interface LaunchView {
  phase: "countdown" | "ascent" | "space" | "summary";
  count: number | null;
  altitudeKm: number;
  speedKmh: number;
  fuel: number;
  event: string | null;
  eventId: number;
  destination: string;
  sandbox: boolean;
  summary: { apogeeKm: number; reached: boolean; dv: number; twr: number } | null;
}

interface LaunchParams {
  counts: SystemCounts;
  destination: string;
  worldIndex: number;
  boss: boolean;
  sandbox?: boolean;
}

/**
 * Launch Complex 1: countdown, ignition, liftoff, booster separation and the climb
 * to space, driven by the rocket-physics ascent simulation of the player's build.
 */
export class LaunchScene implements SceneController {
  readonly id = "launch";
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.5, 9000);
  bloom = { strength: 0.35, radius: 0.3, threshold: 0.7 };
  private readonly game: Game;
  private readonly rocket: RocketAssembly;
  private readonly ground = new THREE.Group();
  private readonly spaceGroup = new THREE.Group();
  private sky!: THREE.Mesh;
  private stars!: THREE.Points;
  private readonly smoke: Particles;
  private readonly fire: Particles;
  private params: LaunchParams | null = null;
  private samples: AscentSample[] = [];
  private t = 0;
  private phase: LaunchView["phase"] = "countdown";
  private eventId = 0;
  private lastEvent: string | null = null;
  private boosterDropped = false;
  private droppedBooster: { object: THREE.Object3D; vel: THREE.Vector3; spin: number } | null = null;
  private arm: THREE.Object3D | null = null;
  private built = false;
  private padTop = 2.0;
  private ended = false;
  private uiTimer = 0;
  private lastCount = -1;
  private apogee = 0;
  private readonly clouds: THREE.Object3D[] = [];

  constructor(game: Game) {
    this.game = game;
    this.rocket = new RocketAssembly(game);
    this.smoke = new Particles(1400, false, game.engine.renderer.getPixelRatio());
    this.fire = new Particles(500, true, game.engine.renderer.getPixelRatio());
  }

  private build() {
    if (this.built) return;
    this.built = true;
    const scene = this.scene;
    this.sky = skyDome("#3a86e0", "#cfeaff", new THREE.Vector3(0.5, 0.35, -0.8), 4000);
    scene.add(this.sky);
    scene.add(new THREE.HemisphereLight(0xe9f4ff, 0x6c8f5a, 1.1));
    const sun = new THREE.DirectionalLight(0xfff1dd, 2.4);
    sun.position.set(60, 80, 40);
    scene.add(sun);
    // Ground: pad, ocean, coast
    const grass = new THREE.Mesh(new THREE.CircleGeometry(900, 48), new THREE.MeshStandardMaterial({ color: "#6cc263", roughness: 1 }));
    grass.rotation.x = -Math.PI / 2;
    this.ground.add(grass);
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: "#2f8fd8", roughness: 0.2, metalness: 0.2 }));
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(2060, 0.1, 0);
    this.ground.add(ocean);
    const complex = this.game.model("launch-complex");
    this.arm = complex.joints.get("arm") ?? null;
    if (this.arm) this.arm.userData.keep = true;
    bakeStatic(complex.root, (n) => !!n.userData.keep);
    this.ground.add(complex.root);
    for (const [i, id] of ["prop-fuel-sphere", "prop-radar", "prop-palm", "prop-palm", "prop-lamp"].entries()) {
      const m = this.game.model(id);
      bakeStatic(m.root);
      m.root.position.set(-30 + i * 14, 0, -26 + (i % 2) * 6);
      this.ground.add(m.root);
    }
    scene.add(this.ground);
    const cloudMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1, emissive: "#ffffff", emissiveIntensity: 0.25, transparent: true, opacity: 0.92 });
    const puffGeometry = new THREE.SphereGeometry(1, 12, 9);
    for (let i = 0; i < 16; i++) {
      const group = new THREE.Group();
      for (let k = 0; k < 6; k++) {
        const r = 6 + (k % 3) * 2.5;
        const puff = new THREE.Mesh(puffGeometry, cloudMat);
        puff.position.set(Math.cos(k * 1.3) * 9, Math.sin(k * 2.1) * 2.5, Math.sin(k * 1.3) * 9);
        puff.scale.set(r, r * 0.55, r);
        group.add(puff);
      }
      const a = (i / 16) * Math.PI * 2;
      group.position.set(Math.cos(a) * (35 + (i % 4) * 18), 260 + (i % 5) * 110, Math.sin(a) * (35 + (i % 3) * 22));
      this.clouds.push(group);
      scene.add(group);
    }
    // Space backdrop (shown after the climb)
    const earth = this.game.space.planet("earth", 900, { clouds: true });
    earth.position.set(0, -980, -300);
    earth.rotation.set(1.25, 0.4, 0);
    this.spaceGroup.add(earth);
    this.spaceGroup.add(this.game.space.skySphere(["#1b3a8f", "#2f8fe8", "#7b5cff"], 0.7, 3800));
    this.stars = this.game.space.starfield(1500, 3500, 1.4);
    scene.add(this.stars);
    this.spaceGroup.visible = false;
    scene.add(this.spaceGroup);
    scene.add(this.rocket.group, this.smoke.points, this.fire.points);
  }

  enter(params?: unknown) {
    this.build();
    this.params = params as LaunchParams;
    this.rocket.setCounts(this.params.counts, false);
    this.rocket.group.position.set(0, this.padTop, 0);
    this.rocket.group.rotation.set(0, 0, 0);
    this.rocket.group.visible = true;
    this.samples = simulateAscent(this.params.counts);
    this.t = 0;
    this.phase = "countdown";
    this.ended = false;
    this.boosterDropped = false;
    if (this.droppedBooster) { this.droppedBooster.object.removeFromParent(); this.droppedBooster = null; }
    this.ground.visible = true;
    this.sky.visible = true;
    for (const cloud of this.clouds) cloud.visible = true;
    this.spaceGroup.visible = false;
    this.smoke.clear();
    this.fire.clear();
    this.lastCount = -1;
    this.apogee = 0;
    this.stars.visible = false;
    const material = this.sky.material as THREE.ShaderMaterial;
    material.uniforms.top.value.set("#3a86e0");
    material.uniforms.horizon.value.set("#cfeaff");
    this.event(null);
    if (this.arm) this.arm.rotation.y = 0;
    void this.game.say("Three, two, one. Liftoff!");
  }

  exit() {
    stopLoops();
  }

  private event(text: string | null) {
    if (text === this.lastEvent) return;
    this.lastEvent = text;
    this.eventId++;
    this.publish();
  }

  private sampleAt(seconds: number): AscentSample {
    const index = Math.max(0, Math.min(this.samples.length - 1, Math.floor(seconds / 0.1)));
    return this.samples[index] ?? { t: 0, altitude: 0, speed: 0, fuel: 1, boosterAttached: false };
  }

  private publish() {
    const p = this.params;
    if (!p) return;
    const flightT = Math.max(0, this.t - 4) * 9;
    const sample = this.sampleAt(flightT);
    const analysis = analyzeRocket(p.counts, { range: RANGE_BY_WORLD[p.worldIndex] ?? 3000, required: [], helpful: [] });
    const view: LaunchView = {
      phase: this.phase,
      count: this.phase === "countdown" ? Math.max(0, 3 - Math.floor(this.t)) : null,
      altitudeKm: sample.altitude / 1000,
      speedKmh: sample.speed * 3.6,
      fuel: sample.fuel,
      event: this.lastEvent,
      eventId: this.eventId,
      destination: p.destination,
      sandbox: !!p.sandbox,
      summary: this.phase === "summary" ? { apogeeKm: this.apogee / 1000, reached: analysis.reaches, dv: analysis.dv, twr: analysis.twr } : null,
    };
    this.game.ui.set({ launch: view });
  }

  skip() {
    if (this.phase === "summary") return;
    this.finish();
  }

  private finish() {
    if (this.ended) return;
    this.ended = true;
    stopLoops();
    if (this.params?.sandbox) {
      this.phase = "summary";
      this.apogee = Math.max(...this.samples.map((s) => s.altitude));
      this.publish();
      return;
    }
    void this.game.startActivity();
  }

  backToHangar() {
    void this.game.openHangarSandbox();
  }

  update(dt: number, time: number) {
    if (!this.params || this.game.ui.get().overlay) return;
    this.t += dt;
    const t = this.t;
    this.uiTimer -= dt;
    if (this.uiTimer <= 0 && this.phase !== "summary") { this.uiTimer = 0.1; this.publish(); }
    for (const cloud of this.clouds) cloud.rotation.y += dt * 0.02;
    this.rocket.update(dt, time);
    this.smoke.update(dt);
    this.fire.update(dt);
    updateStars(this.scene, time);
    // Countdown 3-2-1 with beeps
    if (t < 4) {
      const count = Math.max(0, 3 - Math.floor(t));
      if (count !== this.lastCount) {
        this.lastCount = count;
        if (count > 0) sfx("beep"); else { sfx("liftoff"); this.event("LIFTOFF!"); }
        this.publish();
      }
      if (this.arm) this.arm.rotation.y = damp(this.arm.rotation.y, t > 1.5 ? 1.2 : 0, 2, dt);
      // steam venting
      if (Math.random() < dt * 20) this.smoke.emit({ position: new THREE.Vector3(1.6, this.padTop + 10, 0), velocity: new THREE.Vector3(3, 1, 0), spread: 1.5, life: 1.6, size: 1.6, growth: 2.2, color: "#ffffff", alpha: 0.5 });
      const ignite = t > 3.2 ? Math.min(1, (t - 3.2) / 0.6) : 0;
      this.rocket.setThrottle(ignite);
      loop("engine", ignite * 0.7);
      if (ignite > 0) this.billow(dt, 1);
      this.cameraGround(t, 0);
      return;
    }
    // Ascent (simulation time runs 9× faster than real time)
    const flightT = (t - 4) * 9;
    const sample = this.sampleAt(flightT);
    if (this.phase === "countdown") { this.phase = "ascent"; this.publish(); }
    const throttle = sample.fuel > 0.001 ? 1 : 0;
    this.rocket.setThrottle(throttle, sample.boosterAttached ? 1 : 0);
    loop("engine", throttle * (0.75 - Math.min(0.5, sample.altitude / 60000)));
    const alt = sample.altitude;
    const visual = alt < 400 ? alt : 400 + Math.sqrt(alt - 400) * 9;
    this.rocket.group.position.y = this.padTop + visual;
    const tilt = Math.min(0.55, Math.max(0, (alt - 1500) / 40000));
    this.rocket.group.rotation.z = -tilt;
    this.rocket.group.position.x = -Math.max(0, visual - 300) * 0.25 * tilt * 0;
    if (alt < 2500) this.billow(dt, Math.max(0, 1 - alt / 2500));
    // Booster separation
    if (this.params.counts.booster && !sample.boosterAttached && !this.boosterDropped && flightT > 1) {
      this.boosterDropped = true;
      const booster = this.rocket.boosterObject();
      if (booster) {
        const world = new THREE.Vector3();
        booster.getWorldPosition(world);
        this.scene.attach(booster);
        this.droppedBooster = { object: booster, vel: new THREE.Vector3(0, -6, 0), spin: 0.6 };
        for (const f of this.rocket.boosterFlames) f.throttle = 0;
      }
      sfx("stage");
      this.event("BOOSTER SEPARATION — staging drops empty weight!");
    }
    if (this.droppedBooster) {
      const b = this.droppedBooster;
      b.vel.y -= 9.8 * dt;
      b.object.position.addScaledVector(b.vel, dt);
      b.object.rotation.z += b.spin * dt;
      b.object.rotation.x += b.spin * 0.4 * dt;
    }
    // Sky darkens with altitude
    const darkness = Math.min(1, alt / 60000);
    const material = this.sky.material as THREE.ShaderMaterial;
    material.uniforms.top.value.set("#3a86e0").lerp(new THREE.Color("#02040d"), darkness);
    material.uniforms.horizon.value.set("#cfeaff").lerp(new THREE.Color("#0b1f4a"), Math.min(1, darkness * 1.2));
    (this.stars.material as THREE.ShaderMaterial).opacity = darkness;
    this.stars.visible = darkness > 0.25;
    this.scene.fog = null;
    if (alt > 8000 && !this.lastEvent?.startsWith("MAX")) {
      if (flightT < 40) this.event("MAX Q — the air pushes hardest here");
    }
    // Switch to the space view
    const spaceAt = 7.5;
    if (t - 4 > spaceAt && this.phase === "ascent") {
      this.phase = "space";
      this.ground.visible = false;
      this.sky.visible = false;
      for (const cloud of this.clouds) cloud.visible = false;
      this.spaceGroup.visible = true;
      if (this.droppedBooster) this.droppedBooster.object.visible = false;
      this.event(this.params.sandbox ? "Climbing into space!" : `On course for ${this.params.destination}!`);
      sfx("whoosh");
    }
    if (this.phase === "space") {
      const s = t - 4 - spaceAt;
      this.rocket.group.position.set(-40 + s * 24, 60, -120);
      this.rocket.group.rotation.set(0, 0, -Math.PI / 2.3);
      this.camera.position.set(-10 + s * 18, 72, -60);
      this.camera.lookAt(this.rocket.group.position.x + 10, 55, -120);
      if (s > 4.2) this.finish();
      return;
    }
    if (t - 4 > 1.6) this.cameraChase(dt, visual);
    else this.cameraGround(t, visual);
  }

  private billow(dt: number, strength: number) {
    const count = Math.round(dt * 160 * strength);
    for (let i = 0; i < count; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      this.smoke.emit({ position: new THREE.Vector3((Math.random() - 0.5) * 3, 1.4, (Math.random() - 0.5) * 3), velocity: new THREE.Vector3(side * (14 + Math.random() * 10), 2 + Math.random() * 4, (Math.random() - 0.5) * 18), spread: 4, life: 2.6, size: 3.2, growth: 3.2, color: "#f4f1ea", colorEnd: "#c9c3bb", alpha: 0.75, drag: 0.9 });
    }
    if (Math.random() < strength) this.fire.emit({ position: new THREE.Vector3(0, this.rocket.group.position.y - 1, 0), velocity: new THREE.Vector3(0, -20, 0), spread: 6, life: 0.4, size: 1.8, growth: 1, color: "#ffe2a0", colorEnd: "#ff6a1f", alpha: 0.8 });
  }

  private cameraGround(t: number, visual: number) {
    const angle = -0.38 + t * 0.03;
    const portrait = this.game.engine.aspect < 0.9;
    const dist = portrait ? 72 : 52;
    this.camera.position.set(Math.sin(angle) * dist, 6, Math.cos(angle) * dist);
    this.camera.lookAt(0, this.padTop + 9 + visual * 0.9, 0);
  }

  private cameraChase(dt: number, visual: number) {
    const portrait = this.game.engine.aspect < 0.9;
    const target = new THREE.Vector3(portrait ? 30 : 22, this.padTop + visual - 5, portrait ? 44 : 30);
    this.camera.position.lerp(target, 1 - Math.exp(-7 * dt));
    this.camera.lookAt(0, this.padTop + visual + 7, 0);
  }
}
