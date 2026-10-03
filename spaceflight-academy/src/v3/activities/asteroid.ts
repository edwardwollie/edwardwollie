import * as THREE from "three";
import { sfx } from "../engine/audio.ts";
import { Particles, damp } from "../engine/fx.ts";
import { ASTEROID_SAMPLES } from "../data/destinations.ts";
import { bakeStatic } from "../models/bake.ts";
import { ActivityScene, type ActivityControl, type Gauge } from "./base.ts";

const ROCK_R = 30;

/**
 * Asteroid sample grab: the asteroid spins below the sampler. When a glowing
 * target passes under the arm, tap GRAB (touch-and-go) to collect a sample.
 */
export class AsteroidActivity extends ActivityScene {
  readonly id = "act-asteroid";
  readonly kind = "asteroid" as const;
  private rock = new THREE.Group();
  private probe = new THREE.Group();
  private arm!: THREE.Mesh;
  private aim!: THREE.Mesh;
  private markers: { node: THREE.Object3D; angle: number; taken: boolean }[] = [];
  private spin = 0;
  private spinSpeed = 0.3;
  private window = 0.18;
  private collected = 0;
  private misses = 0;
  private armDrop = 0;
  private probeX = 0;
  private cooldown = 0;
  private readonly sparks: Particles;

  constructor(game: ConstructorParameters<typeof ActivityScene>[0]) {
    super(game);
    this.sparks = new Particles(400, true, game.engine.renderer.getPixelRatio());
  }

  protected buildWorld() {
    const space = this.game.space;
    this.scene.add(space.skySphere(["#2a1f4a", "#6a4a3a", "#3a5aa8"], 6.6, 6000));
    this.scene.add(space.starfield(1600, 5500, 1.4));
    this.scene.add(new THREE.AmbientLight(0x8890b0, 0.5));
    const sun = new THREE.DirectionalLight(0xfff2dc, 3);
    sun.position.set(300, 200, 260);
    this.scene.add(sun);
    const sunBall = space.planet("sun", 40);
    sunBall.position.set(1400, 900, -2600);
    this.scene.add(sunBall);
    const geometry = space.asteroidGeometry(ROCK_R, 7.7, 5);
    const body = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: space.surface("asteroid"), roughness: 1 }));
    this.rock.add(body);
    // boulders
    for (let i = 0; i < 18; i++) {
      const b = new THREE.Mesh(space.asteroidGeometry(1.5 + (i % 3), i * 1.7, 1), body.material);
      const a = (i / 18) * Math.PI * 2;
      b.position.set(Math.cos(a) * (ROCK_R * 0.98), Math.sin(a) * (ROCK_R * 0.98), (i % 2 ? 6 : -6));
      this.rock.add(b);
    }
    // sample targets around the "equator" (XY plane, rotating about Z)
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 + 0.6;
      const node = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.35, 10, 36), new THREE.MeshBasicMaterial({ color: "#5cf2a0" }));
      const glow = this.game.space.glow(14, "#5cf2a0", 0.6);
      node.add(ring, glow);
      node.position.set(Math.cos(angle) * (ROCK_R * 1.02), Math.sin(angle) * (ROCK_R * 1.02), 0);
      node.lookAt(0, 0, 0);
      this.rock.add(node);
      this.markers.push({ node, angle, taken: false });
    }
    this.scene.add(this.rock);
    // Sampler probe = science module + capsule + nose with an arm
    const lab = this.game.model("part-lab");
    bakeStatic(lab.root);
    const cap = this.game.model("part-capsule");
    bakeStatic(cap.root);
    cap.root.position.y = 1.8;
    const nose = this.game.model("part-nose");
    bakeStatic(nose.root);
    nose.root.position.y = 4.6;
    const body2 = new THREE.Group();
    body2.add(lab.root, cap.root, nose.root);
    body2.scale.setScalar(0.8);
    this.probe.add(body2);
    this.arm = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1, 10), new THREE.MeshStandardMaterial({ color: "#c8d2e2", metalness: 0.6, roughness: 0.3 }));
    this.arm.position.y = -0.5;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), new THREE.MeshStandardMaterial({ color: "#ffcf4a", metalness: 0.4, roughness: 0.3 }));
    head.name = "head";
    this.arm.add(head);
    this.probe.add(this.arm);
    this.probe.position.set(0, ROCK_R + 12, 0);
    this.scene.add(this.probe);
    this.aim = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.0, 40), new THREE.MeshBasicMaterial({ color: "#ffd95a", transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthTest: false }));
    this.aim.rotation.x = -Math.PI / 2;
    this.aim.renderOrder = 5;
    this.scene.add(this.aim, this.sparks.points);
  }

  protected reset() {
    this.spinSpeed = this.assist === 2 ? 0.22 : this.assist === 1 ? 0.3 : 0.38;
    this.window = this.assist === 2 ? 0.2 : this.assist === 1 ? 0.13 : 0.085;
    this.armDrop = 0;
    this.cooldown = 0;
  }

  enter(params?: unknown) {
    this.collected = 0;
    this.misses = 0;
    this.spin = 0;
    this.probeX = 0;
    for (const m of this.markers) { m.taken = false; m.node.visible = true; }
    super.enter(params);
  }

  protected title() { return "Grab an asteroid sample"; }
  protected help() { return this.assist === 0 ? "Steer left/right to line up, then tap GRAB when a green target is inside the yellow circle." : "Tap GRAB when a green target slides under the yellow circle!"; }
  protected intro() { return `Asteroid rendezvous! Asteroids are leftover building blocks from when the planets formed. ${this.help()}`; }
  protected controls(): ActivityControl[] { return this.assist === 0 ? ["left", "right", "grab"] : ["grab"]; }
  protected gauges(): Gauge[] { return [{ label: "Samples", value: this.collected, max: 3 }]; }
  protected progress() { return this.targetUnder() !== null ? "🟢 Target under the arm — GRAB!" : "⏳ Wait for a green target"; }

  /** Index of the marker currently under the arm (within the window), if any. */
  private targetUnder(): number | null {
    // The arm points straight down (angle π/2 in rock-space after spin).
    const armAngle = Math.PI / 2 + Math.atan2(-this.probeX, ROCK_R) - this.spin;
    for (let i = 0; i < this.markers.length; i++) {
      const m = this.markers[i];
      if (m.taken) continue;
      let d = (m.angle - armAngle) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) < this.window) return i;
    }
    return null;
  }

  protected onPress(name: ActivityControl) {
    if (this.phase !== "play" || (name !== "grab" && name !== "snap") || this.cooldown > 0) return;
    this.cooldown = 0.9;
    this.armDrop = 1;
    const index = this.targetUnder();
    if (index === null) {
      this.misses++;
      sfx("error");
      this.message = "Missed — wait until the green target is inside the yellow circle.";
      window.setTimeout(() => { if (this.phase === "play") this.message = null; }, 1800);
      return;
    }
    const marker = this.markers[index];
    marker.taken = true;
    marker.node.visible = false;
    this.collected++;
    sfx("star");
    const world = new THREE.Vector3();
    marker.node.getWorldPosition(world);
    this.sparks.emit({ position: world, velocity: new THREE.Vector3(0, 6, 0), spread: 12, life: 1.2, size: 0.8, color: "#bfffe0", colorEnd: "#5cf2a0", count: 70 });
    const sample = ASTEROID_SAMPLES[this.collected - 1];
    this.card = { icon: "☄️", title: sample.name, text: sample.fact };
    this.say(`Sample collected! ${sample.name}. ${sample.fact}`);
    if (this.collected >= 3) {
      this.attempts = 1 + Math.min(2, Math.floor(this.misses / 2));
      window.setTimeout(() => this.success(this.attemptScore(0), "Three samples safely stored! Heading home with treasure from the dawn of the solar system.", { icon: "☄️", title: "Why asteroids?", text: "Asteroids barely changed in 4.5 billion years, so their rocks tell us what the solar system was made of when it was born." }), 1500);
    }
  }

  protected step(dt: number) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.spin += this.spinSpeed * dt;
    this.rock.rotation.z = this.spin;
    if (this.assist === 0) {
      const steer = this.steer();
      this.probeX = THREE.MathUtils.clamp(this.probeX + steer.x * 8 * dt, -8, 8);
    }
    this.probe.position.x = damp(this.probe.position.x, this.probeX, 6, dt);
    this.probe.position.y = ROCK_R + 12 + Math.sin(this.time * 1.2) * 0.4;
    this.armDrop = Math.max(0, this.armDrop - dt * 2.2);
    const reach = 4 + Math.sin(this.armDrop * Math.PI) * 5.5;
    this.arm.scale.y = reach;
    this.arm.position.y = -reach / 2;
    const head = this.arm.getObjectByName("head");
    if (head) head.scale.set(1, 1 / reach, 1);
    const under = this.targetUnder() !== null;
    this.aim.position.set(this.probe.position.x, ROCK_R + 1.5, 4);
    (this.aim.material as THREE.MeshBasicMaterial).color.set(under ? "#5cf2a0" : "#ffd95a");
    this.aim.scale.setScalar(1 + (under ? Math.sin(this.time * 10) * 0.08 : 0));
    this.sparks.update(dt);
    const portrait = this.game.engine.aspect < 0.9;
    this.camera.position.set(this.probe.position.x * 0.5 + 10, ROCK_R + 22, portrait ? 95 : 62);
    this.camera.lookAt(this.probe.position.x * 0.5, ROCK_R + 2, 0);
  }

  qaGrabAll() {
    for (let i = 0; i < 3; i++) {
      const m = this.markers.find((x) => !x.taken);
      if (!m) break;
      this.spin = Math.PI / 2 - m.angle;
      this.cooldown = 0;
      this.onPress("grab");
    }
  }
}
