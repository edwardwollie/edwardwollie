import * as THREE from "three";
import { sfx } from "../engine/audio.ts";
import { Flame, damp } from "../engine/fx.ts";
import { DOCK_FACT } from "../data/destinations.ts";
import { bakeStatic } from "../models/bake.ts";
import { ActivityScene, type ActivityControl, type Gauge } from "./base.ts";

/**
 * Docking with Orbital School: the capsule creeps toward the station's port.
 * Keep the docking ring centred on the green cross (steer with the joystick,
 * arrows or by dragging) and touch gently.
 */
export class DockingActivity extends ActivityScene {
  readonly id = "act-docking";
  readonly kind = "docking" as const;
  private capsule = new THREE.Group();
  private station: THREE.Object3D | null = null;
  private ring: THREE.Object3D | null = null;
  private portWorld = new THREE.Vector3();
  private readonly offset = new THREE.Vector2();
  private readonly drift = new THREE.Vector2();
  private distance = 90;
  private speed = 3.2;
  private tolerance = 1.6;
  private flames: Flame[] = [];
  private docked = 0;
  private reticle!: THREE.Mesh;

  protected buildWorld() {
    const space = this.game.space;
    this.scene.add(space.skySphere(["#13286a", "#2f6fd8", "#7b5cff"], 2.2, 9000));
    this.scene.add(space.starfield(1600, 8500, 1.4));
    this.scene.add(new THREE.HemisphereLight(0xcfe1ff, 0x203050, 1.0));
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
    sun.position.set(80, 120, 160);
    this.scene.add(sun);
    const earth = space.planet("earth", 2600, { clouds: true });
    earth.position.set(0, -2900, -1200);
    earth.rotation.set(1.2, 0.8, 0);
    this.scene.add(earth);
    const station = this.game.model("station-orbital-school");
    this.ring = station.joints.get("ring") ?? null;
    if (this.ring) this.ring.userData.keep = true;
    bakeStatic(station.root, (n) => !!n.userData.keep);
    this.station = station.root;
    this.scene.add(station.root);
    const port = station.tags.get("dockPort")?.[0];
    station.root.updateMatrixWorld(true);
    if (port) port.getWorldPosition(this.portWorld); else this.portWorld.set(0, 0, 8.6);
    // Capsule = crew capsule + nose (the Comet's top) seen from behind
    const cap = this.game.model("part-capsule");
    bakeStatic(cap.root);
    const nose = this.game.model("part-nose");
    bakeStatic(nose.root);
    nose.root.position.y = 2.8;
    const body = new THREE.Group();
    body.add(cap.root, nose.root);
    body.rotation.x = -Math.PI / 2; // nose toward -Z (the station)
    body.position.z = 0;
    body.scale.setScalar(0.42);
    this.capsule.add(body);
    for (const x of [-0.5, 0.5]) {
      const f = new Flame(0.18, 1.6, "blue");
      f.mesh.rotation.x = -Math.PI / 2;
      f.mesh.position.set(x, 0, 0.3);
      this.capsule.add(f.mesh);
      this.flames.push(f);
    }
    this.scene.add(this.capsule);
    this.reticle = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 40), new THREE.MeshBasicMaterial({ color: "#ffd95a", transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false }));
    this.reticle.renderOrder = 10;
    this.scene.add(this.reticle);
  }

  protected reset() {
    this.distance = 90;
    this.speed = this.assist === 0 ? 4.2 : 3.2;
    this.tolerance = this.assist === 2 ? 2.6 : this.assist === 1 ? 1.7 : 1.05;
    this.offset.set(this.assist === 2 ? 4 : 7, this.assist === 2 ? -3 : -5);
    this.drift.set(0, 0);
    this.docked = 0;
  }

  protected title() { return "Dock with Orbital School"; }
  protected help() { return this.assist === 0 ? "Line up the yellow ring with the green cross and use BRAKE to arrive slowly (under 1.5 m/s)." : "Steer so the yellow ring sits on the green cross. The capsule moves forward by itself!"; }
  protected intro() { return `Docking time! ${DOCK_FACT} ${this.help()}`; }
  protected controls(): ActivityControl[] { return this.assist === 0 ? ["brake"] : []; }
  protected steerEnabled() { return true; }
  protected gauges(): Gauge[] {
    const err = this.offset.length();
    return [
      { label: "Distance", value: Math.round(this.distance), max: 90, unit: " m" },
      { label: "Line-up", value: Math.round(Math.max(0, 100 - (err / 8) * 100)), max: 100, good: [Math.round(100 - (this.tolerance / 8) * 100), 100], unit: "%" },
      ...(this.assist === 0 ? [{ label: "Closing speed", value: Math.round(this.speed * 10) / 10, max: 5, good: [0, 1.5] as [number, number], unit: " m/s" }] : []),
    ];
  }
  protected progress() { return this.offset.length() < this.tolerance ? "🟢 Lined up!" : "🟡 Steer onto the cross"; }

  protected step(dt: number) {
    if (this.ring) this.ring.rotation.y += dt * 0.12;
    const steer = this.steer();
    if (this.phase === "play") {
      const thrust = 6.5;
      this.offset.x += steer.x * thrust * dt;
      this.offset.y += steer.y * thrust * dt;
      // gentle drift so it stays a skill
      this.drift.set(Math.sin(this.time * 0.6) * 0.55, Math.cos(this.time * 0.45) * 0.45);
      this.offset.addScaledVector(this.drift, dt);
      if (this.assist === 2) this.offset.multiplyScalar(1 - dt * 0.12);
      if (this.assist === 0) {
        if (this.isHeld("brake")) this.speed = Math.max(0.6, this.speed - dt * 1.4);
      } else this.speed = damp(this.speed, this.distance < 15 ? 1.2 : 3.2, 1.2, dt);
      this.distance -= this.speed * dt;
      this.engine(Math.abs(steer.x) + Math.abs(steer.y) > 0.1 ? 0.5 : 0);
      if (this.distance <= 0.4) {
        const aligned = this.offset.length() <= this.tolerance;
        const gentle = this.assist !== 0 || this.speed <= 1.5;
        if (aligned && gentle) {
          this.distance = 0.4;
          sfx("dock");
          const score = this.offset.length() < this.tolerance / 2 ? this.attemptScore(0) : this.attemptScore(-1);
          this.success(score, "Hard dock confirmed! Welcome aboard Orbital School.", { icon: "🛰️", title: "Docking facts", text: DOCK_FACT });
        } else {
          this.retry(!aligned ? "Bump! The rings didn't line up. Back off and try again." : "Bump! Too fast — tap BRAKE to slow down before you touch.");
        }
      }
    } else if (this.phase === "success") {
      this.docked += dt;
      this.offset.multiplyScalar(1 - dt * 3);
    }
    for (const f of this.flames) { f.throttle = this.phase === "play" ? 0.35 + Math.abs(steer.x) * 0.5 : 0; f.update(dt, this.time); }
    // Place everything relative to the port: station fixed, capsule approaches along +Z of the port
    const capPos = this.portWorld.clone().add(new THREE.Vector3(this.offset.x, this.offset.y, this.distance + 2.2));
    this.capsule.position.copy(capPos);
    this.capsule.rotation.set(-this.offset.y * 0.01, this.offset.x * 0.01, -steer.x * 0.15);
    this.reticle.position.copy(this.portWorld).add(new THREE.Vector3(this.offset.x, this.offset.y, 0.6));
    (this.reticle.material as THREE.MeshBasicMaterial).color.set(this.offset.length() < this.tolerance ? "#5cf2a0" : "#ffd95a");
    const portrait = this.game.engine.aspect < 0.9;
    const back = portrait ? 17 : 11;
    this.camera.position.set(capPos.x + 1.5, capPos.y + 3.2, capPos.z + back);
    this.camera.lookAt(this.portWorld.x + this.offset.x * 0.3, this.portWorld.y + this.offset.y * 0.3, this.portWorld.z);
  }

  qaAlign() { this.offset.set(0, 0); this.distance = 1; this.speed = 1; }
}
