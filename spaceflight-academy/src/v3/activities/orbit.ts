import * as THREE from "three";
import { sfx } from "../engine/audio.ts";
import { Flame } from "../engine/fx.ts";
import { ORBIT_FACT } from "../data/destinations.ts";
import { bakeStatic } from "../models/bake.ts";
import { ActivityScene, type ActivityControl, type Gauge } from "./base.ts";

const R_EARTH = 100;
const R0 = 136;

/**
 * Orbit insertion: hold BOOST to speed up sideways until the predicted path
 * closes into a circle around Earth, then let go. Too slow → you fall back;
 * too fast → you fly away. Teaches that an orbit is "falling around" a planet.
 */
export class OrbitActivity extends ActivityScene {
  readonly id = "act-orbit";
  readonly kind = "orbit" as const;
  private ship = new THREE.Group();
  private flame: Flame | null = null;
  private earth: THREE.Object3D | null = null;
  private line!: THREE.Line;
  private ideal!: THREE.LineLoop;
  private readonly pos = new THREE.Vector2();
  private readonly vel = new THREE.Vector2();
  private mu = 1;
  private vc = 1;
  private goodTime = 0;
  private tol = 0.15;
  private readonly points: THREE.Vector3[] = [];
  private status: "low" | "good" | "high" | "escape" = "low";

  protected buildWorld() {
    const space = this.game.space;
    this.scene.add(space.skySphere(["#13286a", "#2f6fd8", "#7b5cff"], 5.3, 8000));
    this.scene.add(space.starfield(1800, 7500, 1.4));
    this.scene.add(new THREE.AmbientLight(0x6f8fd0, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.6);
    sun.position.set(400, 300, 500);
    this.scene.add(sun);
    this.earth = space.planet("earth", R_EARTH, { clouds: true });
    this.earth.rotation.set(0.3, 0, 0.2);
    this.scene.add(this.earth);
    const rocket = this.game.model("rocket-comet");
    bakeStatic(rocket.root);
    rocket.root.position.y = -8.8;
    const holder = new THREE.Group();
    holder.add(rocket.root);
    holder.rotation.z = -Math.PI / 2; // nose along +X (direction of travel)
    holder.scale.setScalar(1.3);
    const halo = this.game.space.glow(44, "#7ff0ff", 0.55);
    this.ship.add(halo);
    this.flame = new Flame(0.62, 7, "orange");
    this.flame.mesh.position.set(0, 0.02, 0);
    rocket.root.add(this.flame.mesh);
    this.ship.add(holder);
    this.scene.add(this.ship);
    const geometry = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 600 }, () => new THREE.Vector3()));
    this.line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: "#ffd95a", transparent: true, opacity: 0.95 }));
    this.line.frustumCulled = false;
    this.scene.add(this.line);
    const ring = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 128 }, (_, i) => new THREE.Vector3(Math.cos((i / 128) * Math.PI * 2) * R0, Math.sin((i / 128) * Math.PI * 2) * R0, 0)));
    this.ideal = new THREE.LineLoop(ring, new THREE.LineDashedMaterial({ color: "#5cf2a0", dashSize: 6, gapSize: 5, transparent: true, opacity: 0.55 }));
    this.ideal.computeLineDistances();
    this.scene.add(this.ideal);
  }

  protected reset() {
    const period = this.assist === 2 ? 22 : this.assist === 1 ? 18 : 15;
    this.vc = (2 * Math.PI * R0) / period;
    this.mu = this.vc * this.vc * R0;
    this.tol = this.assist === 2 ? 0.26 : this.assist === 1 ? 0.16 : 0.09;
    this.pos.set(0, R0);
    this.vel.set(this.vc * (this.assist === 2 ? 0.72 : 0.64), 0);
    this.goodTime = 0;
  }

  protected title() { return "Steer into orbit"; }
  protected help() {
    return this.assist === 2
      ? "Hold BOOST to fly sideways faster. Let go when the yellow path turns into a green circle!"
      : "Hold BOOST to speed up sideways. Let go when your path closes into a circle. Too fast? Use BRAKE.";
  }
  protected intro() { return `Orbit time! ${ORBIT_FACT} ${this.help()}`; }
  protected controls(): ActivityControl[] { return this.assist === 2 ? ["hold"] : ["brake", "hold"]; }
  protected holdLabel() { return "BOOST"; }
  protected gauges(): Gauge[] {
    const speed = this.vel.length();
    return [
      { label: "Sideways speed", value: Math.round((speed / this.vc) * 100), max: 160, good: [Math.round((1 - this.tol * 0.6) * 100), Math.round((1 + this.tol * 0.6) * 100)], unit: "%" },
      { label: "Height", value: Math.round(Math.max(0, this.pos.length() - R_EARTH) * 3), max: 300, unit: " km" },
    ];
  }
  protected progress() {
    return this.status === "good" ? "🟢 Circle! Let go of BOOST" : this.status === "low" ? "🟡 Falling back — boost!" : this.status === "high" ? "🟠 Getting stretched — ease off" : "🔴 Too fast!";
  }

  private orbitInfo() {
    const r = this.pos.length();
    const v2 = this.vel.lengthSq();
    const energy = v2 / 2 - this.mu / r;
    const h = this.pos.x * this.vel.y - this.pos.y * this.vel.x;
    const e = Math.sqrt(Math.max(0, 1 + (2 * energy * h * h) / (this.mu * this.mu)));
    const a = energy < 0 ? -this.mu / (2 * energy) : Infinity;
    return { e, periapsis: a * (1 - e), apoapsis: a * (1 + e), energy };
  }

  protected step(dt: number) {
    const boosting = this.phase === "play" && this.isHeld("hold");
    const braking = this.phase === "play" && this.isHeld("brake");
    const accel = this.vc * 0.38;
    if (boosting || braking) {
      const dir = this.vel.clone().normalize();
      this.vel.addScaledVector(dir, (boosting ? 1 : -1) * accel * dt);
      if (Math.random() < dt * 8) sfx("tap");
    }
    this.engine(boosting || braking ? 0.8 : 0);
    if (this.flame) { this.flame.throttle = boosting ? 1 : braking ? 0.4 : 0.05; this.flame.update(dt, this.time); }
    // integrate (semi-implicit Euler with substeps)
    if (this.phase !== "retry") {
      const steps = 6;
      for (let i = 0; i < steps; i++) {
        const h = dt / steps;
        const r = this.pos.length();
        const g = this.pos.clone().multiplyScalar(-this.mu / (r * r * r));
        this.vel.addScaledVector(g, h);
        this.pos.addScaledVector(this.vel, h);
      }
    }
    const r = this.pos.length();
    const info = this.orbitInfo();
    this.status = info.energy >= 0 ? "escape" : info.periapsis < R_EARTH + 14 ? "low" : info.e <= this.tol && info.apoapsis < R0 * 1.7 ? "good" : "high";
    if (this.phase === "play") {
      if (r < R_EARTH + 3) this.retry("Not enough sideways speed — you fell back toward Earth. Hold BOOST longer!");
      else if (r > R0 * 3.2 || this.status === "escape") this.retry("Whoa, too fast — you flew away from Earth! Let go of BOOST sooner.");
      else if (this.status === "good" && !boosting && !braking) {
        this.goodTime += dt;
        if (this.goodTime > 1.3) {
          const score = info.e < this.tol / 2 ? this.attemptScore(0) : this.attemptScore(-1);
          this.success(score, "Orbit achieved! You're falling around the Earth.", { icon: "🌍", title: "Orbit facts", text: ORBIT_FACT });
          sfx("dock");
        }
      } else this.goodTime = 0;
    }
    // visuals
    this.ship.position.set(this.pos.x, this.pos.y, 0);
    this.ship.rotation.z = Math.atan2(this.vel.y, this.vel.x);
    if (this.earth) this.earth.rotation.y += dt * 0.05;
    this.updatePrediction();
    const color = this.status === "good" ? "#5cf2a0" : this.status === "low" ? "#ffd95a" : "#ff8a3d";
    (this.line.material as THREE.LineBasicMaterial).color.set(color);
    const portrait = this.game.engine.aspect < 0.9;
    this.camera.position.set(0, -170, portrait ? 720 : 400);
    this.camera.lookAt(0, 6, 0);
  }

  private updatePrediction() {
    const pos = this.pos.clone(), vel = this.vel.clone();
    const attr = this.line.geometry.attributes.position as THREE.BufferAttribute;
    const h = 0.06;
    let hit = false;
    for (let i = 0; i < attr.count; i++) {
      if (!hit) {
        const r = pos.length();
        const g = pos.clone().multiplyScalar(-this.mu / (r * r * r));
        vel.addScaledVector(g, h);
        pos.addScaledVector(vel, h);
        if (pos.length() < R_EARTH) hit = true;
      }
      attr.setXYZ(i, pos.x, pos.y, 0.5);
    }
    attr.needsUpdate = true;
    this.points.length = 0;
  }

  /** QA: put the ship on a near-perfect circular orbit. */
  qaCircularize() {
    this.vel.set(-this.pos.y, this.pos.x).normalize().multiplyScalar(Math.sqrt(this.mu / this.pos.length()));
  }
}
