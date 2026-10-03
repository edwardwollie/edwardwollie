import * as THREE from "three";
import { sfx } from "../engine/audio.ts";
import { Flame, Particles, damp } from "../engine/fx.ts";
import { skyDome } from "../engine/space.ts";
import { input } from "../engine/input.ts";
import { LANDING_FACTS, ROCK_SAMPLES } from "../data/destinations.ts";
import { bakeStatic } from "../models/bake.ts";
import { ActivityScene, type ActivityControl, type Gauge } from "./base.ts";

type Stage = "entry" | "chute" | "powered" | "rover" | "done";

/**
 * Moon and Mars landings. Moon: hold THRUST to slow down and steer onto the pad.
 * Mars: heat-shield entry, tap DEPLOY for the parachute in the green zone, then a
 * powered landing — and finally drive Dusty the rover to scan three rocks.
 */
export class LandingActivity extends ActivityScene {
  readonly id: string;
  readonly kind: "moon-landing" | "mars-landing";
  private readonly mars: boolean;
  private lander = new THREE.Group();
  private landerModel: THREE.Object3D | null = null;
  private capsule = new THREE.Group();
  private chute = new THREE.Group();
  private rover: THREE.Object3D | null = null;
  private flame: Flame | null = null;
  private plasma: THREE.Mesh | null = null;
  private dust: Particles;
  private stage: Stage = "powered";
  private readonly pos = new THREE.Vector2();
  private readonly vel = new THREE.Vector2();
  private fuel = 100;
  private gravity = 4;
  private maxFall = 4;
  private padRadius = 6;
  private chuteSpeed = 400;
  private stageTime = 0;
  private rocks: { mesh: THREE.Mesh; beacon: THREE.Mesh; scanned: boolean; sample: (typeof ROCK_SAMPLES)[number] }[] = [];
  private roverPos = new THREE.Vector3();
  private roverHeading = Math.PI;
  private scanned = 0;
  private near: number | null = null;

  constructor(game: ConstructorParameters<typeof ActivityScene>[0], world: "moon" | "mars") {
    super(game);
    this.mars = world === "mars";
    this.kind = this.mars ? "mars-landing" : "moon-landing";
    this.id = this.mars ? "act-mars-landing" : "act-moon-landing";
    this.dust = new Particles(600, false, game.engine.renderer.getPixelRatio());
  }

  protected buildWorld() {
    const space = this.game.space;
    const scene = this.scene;
    if (this.mars) {
      scene.add(skyDome("#c9855d", "#f0b892", new THREE.Vector3(0.3, 0.5, -0.8), 4000));
      scene.fog = new THREE.Fog("#e0a07a", 260, 1300);
    } else {
      scene.add(space.skySphere(["#141d48", "#2a3a7a", "#5a4a9a"], 8.1, 4000));
      scene.add(space.starfield(1500, 3800, 1.3));
      const earth = space.planet("earth", 60, { clouds: true });
      earth.position.set(-260, 260, -900);
      earth.rotation.set(1.1, 0.4, 0);
      scene.add(earth);
    }
    scene.add(new THREE.HemisphereLight(this.mars ? 0xffd9c0 : 0xd8e2ff, this.mars ? 0x8a4a2a : 0x303040, 1.0));
    const sun = new THREE.DirectionalLight(0xffffff, 2.6);
    sun.position.set(120, 160, 90);
    sun.castShadow = this.game.engine.quality !== "low";
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 500 });
    scene.add(sun);
    // Ground with craters / dunes
    const groundTex = space.surface(this.mars ? "mars" : "moon");
    groundTex.wrapT = THREE.RepeatWrapping;
    const ground = new THREE.Mesh(new THREE.CircleGeometry(1400, 64), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, color: this.mars ? "#c97a52" : "#b9b9b9" }));
    groundTex.repeat.set(6, 3);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const craterMat = new THREE.MeshStandardMaterial({ color: this.mars ? "#b4683f" : "#9c9b98", roughness: 1 });
    for (let i = 0; i < 26; i++) {
      const a = i * 2.39, r = 40 + (i * 37) % 260;
      const crater = new THREE.Mesh(new THREE.TorusGeometry(4 + (i % 5) * 3, 0.9 + (i % 3) * 0.4, 8, 28), craterMat);
      crater.rotation.x = -Math.PI / 2;
      crater.scale.z = 0.35;
      crater.position.set(Math.cos(a) * r, 0, Math.sin(a) * r - 40);
      scene.add(crater);
    }
    if (this.mars) {
      for (let i = 0; i < 6; i++) {
        const ridge = new THREE.Mesh(new THREE.ConeGeometry(60 + i * 12, 30 + i * 6, 6), new THREE.MeshStandardMaterial({ color: "#a9532f", roughness: 1, flatShading: true }));
        ridge.position.set(-400 + i * 160, 10, -520 - (i % 2) * 80);
        scene.add(ridge);
      }
    }
    // Base / outpost with the landing pad at the origin
    const base = this.game.model(this.mars ? "mars-outpost" : "moon-base");
    bakeStatic(base.root);
    base.root.position.set(this.mars ? 0 : 0, 0, this.mars ? -24 : -7.5);
    if (this.mars) base.root.position.x = 6;
    scene.add(base.root);
    if (this.mars) {
      const pad = new THREE.Mesh(new THREE.CircleGeometry(6, 40), new THREE.MeshBasicMaterial({ color: "#ffd95a", transparent: true, opacity: 0.45 }));
      pad.rotation.x = -Math.PI / 2;
      pad.position.y = 0.05;
      scene.add(pad);
    }
    // Lander
    const model = this.game.model("lander-hopper");
    bakeStatic(model.root);
    this.landerModel = model.root;
    this.lander.add(model.root);
    this.flame = new Flame(0.5, 4.5, "orange");
    this.flame.mesh.position.y = 0.45;
    this.lander.add(this.flame.mesh);
    scene.add(this.lander);
    // Mars entry capsule + parachute
    if (this.mars) {
      const cap = this.game.model("part-capsule");
      bakeStatic(cap.root);
      const shield = this.game.model("part-shield");
      bakeStatic(shield.root);
      this.capsule.add(cap.root, shield.root);
      this.capsule.scale.setScalar(0.9);
      this.plasma = new THREE.Mesh(new THREE.ConeGeometry(2.4, 6, 24, 1, true), new THREE.MeshBasicMaterial({ color: "#ff8a3d", transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
      this.plasma.position.y = -2.4;
      this.plasma.rotation.x = Math.PI;
      this.capsule.add(this.plasma);
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.2), new THREE.MeshStandardMaterial({ color: "#ff8a3d", side: THREE.DoubleSide, roughness: 0.7 }));
      canopy.position.y = 12;
      const stripes = new THREE.Mesh(new THREE.SphereGeometry(5.05, 8, 12, 0, Math.PI * 2, 0, Math.PI / 2.2), new THREE.MeshStandardMaterial({ color: "#ffffff", side: THREE.DoubleSide, roughness: 0.7, wireframe: true }));
      stripes.position.y = 12;
      this.chute.add(canopy, stripes);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const line = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 9.5), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
        line.position.set(Math.cos(a) * 2.4, 7.4, Math.sin(a) * 2.4);
        line.lookAt(0, 3, 0);
        line.rotateX(Math.PI / 2);
        this.chute.add(line);
      }
      this.chute.visible = false;
      this.capsule.add(this.chute);
      scene.add(this.capsule);
      const rover = this.game.model("rover-dusty");
      bakeStatic(rover.root);
      this.rover = rover.root;
      scene.add(rover.root);
      // Rocks to scan
      const rockGeo = space.asteroidGeometry(1, 4, 2);
      ROCK_SAMPLES.forEach((sample, i) => {
        const mesh = new THREE.Mesh(rockGeo, new THREE.MeshStandardMaterial({ color: ["#5a4a44", "#c9a27a", "#6a5a8a"][i], roughness: 0.9 }));
        const a = -0.9 + i * 0.9;
        mesh.position.set(Math.sin(a) * 18, 0.8, 12 + Math.cos(a) * 10);
        mesh.scale.setScalar(1.2);
        const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 6, 8), new THREE.MeshBasicMaterial({ color: "#5cf2a0", transparent: true, opacity: 0.7 }));
        beacon.position.copy(mesh.position).setY(3.5);
        scene.add(mesh, beacon);
        this.rocks.push({ mesh, beacon, scanned: false, sample });
      });
    }
    scene.add(this.dust.points);
  }

  protected reset() {
    const a = this.assist;
    this.gravity = this.mars ? 5.2 : 3.8;
    this.maxFall = a === 2 ? 6.5 : a === 1 ? 4.5 : 3.2;
    this.padRadius = a === 2 ? 10 : a === 1 ? 7 : 5.5;
    this.fuel = 100;
    this.stageTime = 0;
    if (this.stage === "rover" || this.stage === "done") return;
    if (this.stage === "entry" || this.stage === "chute") {
      // (Re)start the Mars entry: on a retry go straight back to the parachute moment.
      this.stage = this.attempts > 1 ? "chute" : "entry";
      this.chuteSpeed = this.stage === "chute" ? 420 : 900;
      this.pos.set(a === 2 ? 10 : 18, 70);
      this.capsule.visible = true;
      this.capsule.position.set(this.pos.x, 70, 0);
      this.chute.visible = false;
      this.lander.visible = false;
      if (this.rover) this.rover.visible = false;
      return;
    }
    // Powered descent
    this.startPowered(this.mars ? 52 : 85);
  }

  private startPowered(height: number) {
    const a = this.assist;
    this.stage = "powered";
    this.pos.set(a === 2 ? 14 : 26, height);
    this.vel.set(a === 2 ? -1.5 : -2.8, this.mars ? -3 : -5);
    this.lander.visible = true;
    this.capsule.visible = false;
    this.chute.visible = false;
    if (this.rover) this.rover.visible = false;
  }

  enter(params?: unknown) {
    this.stage = this.mars ? "entry" : "powered";
    if (this.plasma) this.plasma.visible = this.mars;
    this.scanned = 0;
    for (const rock of this.rocks) { rock.scanned = false; rock.beacon.visible = true; }
    super.enter(params);
  }

  protected title() {
    if (this.stage === "rover") return "Drive Dusty the rover";
    return this.mars ? "Land on Mars" : "Land on the Moon";
  }
  protected help() {
    switch (this.stage) {
      case "entry": return "Entering Mars's air at super speed — the heat shield is glowing hot!";
      case "chute": return "Tap DEPLOY when the speed is in the green zone to open the parachute.";
      case "rover": return "Drive to the glowing rocks with the joystick or arrow keys. Tap SCAN at each one!";
      default:
        return this.assist === 2 ? "Hold THRUST to slow down. Touch down gently on the glowing pad!" : "Hold THRUST to slow your fall and steer left/right onto the pad. Land slowly!";
    }
  }
  protected intro() {
    return this.mars ? `Mars landing! ${LANDING_FACTS.mars}` : `Moon landing! ${LANDING_FACTS.moon} ${this.help()}`;
  }
  protected controls(): ActivityControl[] {
    if (this.stage === "chute") return ["deploy"];
    if (this.stage === "rover") return ["scan"];
    if (this.stage === "entry") return [];
    return this.assist === 2 ? ["hold"] : ["left", "right", "hold"];
  }
  protected holdLabel() { return "THRUST"; }
  protected steerEnabled() { return this.stage === "rover"; }
  protected gauges(): Gauge[] {
    if (this.stage === "chute" || this.stage === "entry") {
      const window = this.chuteWindow();
      return [{ label: "Speed", value: Math.round(this.chuteSpeed), max: 450, good: window, unit: " m/s" }];
    }
    if (this.stage === "rover") return [{ label: "Rocks scanned", value: this.scanned, max: 3 }];
    return [
      { label: "Height", value: Math.max(0, Math.round(this.pos.y)), max: 100, unit: " m" },
      { label: "Falling speed", value: Math.round(Math.max(0, -this.vel.y) * 10) / 10, max: 14, good: [0, this.maxFall], unit: " m/s" },
      { label: "Fuel", value: Math.round(this.fuel), max: 100, unit: "%" },
    ];
  }
  protected progress() {
    if (this.stage === "rover") return `Rocks ${this.scanned}/3`;
    if (this.stage === "powered") return Math.abs(this.pos.x) < this.padRadius ? "🟢 Over the pad" : this.pos.x > 0 ? "⬅️ Pad is to the left" : "➡️ Pad is to the right";
    return null;
  }

  private chuteWindow(): [number, number] {
    return this.assist === 2 ? [140, 340] : this.assist === 1 ? [170, 300] : [190, 270];
  }

  protected onPress(name: ActivityControl) {
    if (this.phase !== "play") return;
    if ((name === "deploy" || name === "snap") && this.stage === "chute") {
      const [lo, hi] = this.chuteWindow();
      if (this.chuteSpeed > hi) { this.retry("Too fast for the parachute — it would rip! Wait for the green zone."); return; }
      if (this.chuteSpeed < lo) { this.retry("Too slow and too low — open the parachute a little sooner."); return; }
      sfx("chute");
      this.chute.visible = true;
      this.stageTime = 0;
      this.say("Parachute open! Now get ready for the rocket landing.");
      window.setTimeout(() => {
        if (this.phase !== "play" || this.stage !== "chute") return;
        this.startPowered(52);
      }, 1700);
    }
    if ((name === "scan" || name === "snap") && this.stage === "rover" && this.near !== null) {
      const rock = this.rocks[this.near];
      if (rock.scanned) return;
      rock.scanned = true;
      rock.beacon.visible = false;
      this.scanned++;
      sfx("scan");
      this.card = { icon: "🪨", title: rock.sample.name, text: rock.sample.fact };
      this.say(`${rock.sample.name}. ${rock.sample.fact}`);
      if (this.scanned >= 3) {
        window.setTimeout(() => this.success(this.attemptScore(0), "All three rocks scanned! Dusty sends the data home.", { icon: "🔴", title: "Mars rocks", text: "Rocks are like a diary of a planet. Scientists read them to learn if Mars was once warm and wet." }), 1400);
      }
    }
  }

  protected step(dt: number) {
    this.stageTime += dt;
    this.dust.update(dt);
    if (this.flame) this.flame.update(dt, this.time);
    if (this.stage === "entry") {
      this.capsule.visible = true;
      this.capsule.position.set(this.pos.x, 60 + (1 - this.stageTime / 3) * 80, 0);
      this.capsule.rotation.set(0, this.time * 0.3, 0.1);
      if (this.plasma) {
        (this.plasma.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(this.time * 30) * 0.1;
        this.plasma.visible = true;
      }
      this.chuteSpeed = damp(this.chuteSpeed, 420, 1.2, dt);
      if (this.stageTime > 3 && this.phase === "play") { this.stage = "chute"; this.stageTime = 0; this.chuteSpeed = 420; if (this.plasma) this.plasma.visible = false; this.say("Heat shield did its job! " + this.help()); }
      this.cameraOn(this.capsule.position, 26);
      return;
    }
    if (this.stage === "chute") {
      if (this.chute.visible) { this.chuteSpeed = damp(this.chuteSpeed, 40, 2, dt); this.cameraOn(this.capsule.position, 26); return; }
      this.chuteSpeed = Math.max(60, this.chuteSpeed - dt * (this.assist === 2 ? 34 : 46));
      this.capsule.position.y = damp(this.capsule.position.y, 55, 1, dt);
      this.capsule.rotation.y += dt * 0.4;
      if (this.chuteSpeed <= 60 && this.phase === "play") {
        if (this.assist === 2) { this.onPress("deploy"); } else this.retry("Too low — open the parachute a little sooner.");
      }
      this.cameraOn(this.capsule.position, 26);
      return;
    }
    if (this.stage === "rover") { this.stepRover(dt); return; }
    // Powered descent
    const thrusting = this.phase === "play" && this.isHeld("hold") && (this.fuel > 0 || this.assist === 2);
    let ax = 0;
    if (this.phase === "play") {
      if (this.assist === 2) ax = THREE.MathUtils.clamp(-this.pos.x * 0.35 - this.vel.x * 1.2, -3, 3);
      else ax = (this.isHeld("right") ? 3.2 : 0) - (this.isHeld("left") ? 3.2 : 0);
      if (ax !== 0 && this.assist !== 2) this.fuel = Math.max(0, this.fuel - dt * 3.5);
    }
    const ay = (thrusting ? this.gravity * 2.25 : 0) - this.gravity;
    if (thrusting && this.assist !== 2) this.fuel = Math.max(0, this.fuel - dt * 10);
    if (this.phase === "play") {
      this.vel.x += ax * dt;
      this.vel.y += ay * dt;
      this.vel.x *= 1 - dt * 0.15;
      this.pos.addScaledVector(this.vel, dt);
    }
    this.engine(thrusting ? 0.9 : 0);
    if (this.flame) this.flame.throttle = thrusting ? 1 : 0;
    this.lander.position.set(this.pos.x, Math.max(0, this.pos.y), 0);
    this.lander.rotation.z = damp(this.lander.rotation.z, -ax * 0.06, 6, dt);
    if (thrusting && this.pos.y < 18) {
      this.dust.emit({ position: new THREE.Vector3(this.pos.x, 0.3, 0), velocity: new THREE.Vector3((Math.random() - 0.5) * 18, 1.5, (Math.random() - 0.5) * 18), spread: 3, life: 1.4, size: 1.6, growth: 2, color: this.mars ? "#d99a6c" : "#cfcfcf", alpha: 0.6 });
    }
    if (this.phase === "play" && this.pos.y <= 0) {
      const fall = -this.vel.y;
      const onPad = Math.abs(this.pos.x) <= this.padRadius;
      if (fall <= this.maxFall && Math.abs(this.vel.x) <= 3 && onPad) {
        sfx("land");
        this.pos.y = 0;
        this.vel.set(0, 0);
        if (this.flame) this.flame.throttle = 0;
        const gentle = fall <= this.maxFall * 0.6 && Math.abs(this.pos.x) < this.padRadius * 0.6;
        if (this.mars) {
          this.say("Touchdown on Mars! Dusty the rover is rolling out.");
          this.stage = "rover";
          this.stageTime = 0;
          this.roverPos.set(this.pos.x + 4, 0, 4);
          this.roverHeading = 0;
          if (this.rover) this.rover.visible = true;
          this.score = gentle ? 1 : 0;
        } else {
          this.success(this.attemptScore(gentle ? 0 : -1), "Touchdown! The Moon Hopper has landed.", { icon: "🌙", title: "Moon facts", text: LANDING_FACTS.moon });
        }
      } else {
        this.pos.y = 0;
        this.retry(!onPad ? "You landed off the pad! Steer onto the glowing pad next time." : "Bounce! Too fast — the legs saved you. Hold THRUST to slow down near the ground.");
      }
    }
    this.cameraOn(this.lander.position, 34);
  }

  private stepRover(dt: number) {
    if (!this.rover) return;
    const axis = this.steer();
    const speed = 5.5;
    if (Math.abs(axis.x) + Math.abs(axis.y) > 0.08 && this.phase === "play") {
      const dir = new THREE.Vector3(axis.x, 0, -axis.y).normalize();
      this.roverPos.addScaledVector(dir, speed * dt * Math.min(1, Math.hypot(axis.x, axis.y)));
      this.roverHeading = Math.atan2(dir.x, dir.z);
    }
    this.roverPos.x = THREE.MathUtils.clamp(this.roverPos.x, -40, 40);
    this.roverPos.z = THREE.MathUtils.clamp(this.roverPos.z, -10, 40);
    this.rover.position.copy(this.roverPos);
    this.rover.rotation.y = damp(this.rover.rotation.y, this.roverHeading, 6, dt);
    this.near = null;
    this.rocks.forEach((rock, i) => {
      rock.beacon.scale.y = 1 + Math.sin(this.time * 3 + i) * 0.1;
      if (!rock.scanned && rock.mesh.position.distanceTo(this.roverPos) < 4.5) this.near = i;
    });
    if (input.pressed("e")) this.onPress("scan");
    const target = this.roverPos.clone().add(new THREE.Vector3(0, 9, 16));
    this.camera.position.lerp(target, 1 - Math.exp(-3 * dt));
    this.camera.lookAt(this.roverPos.x, 1, this.roverPos.z - 4);
  }

  private cameraOn(target: THREE.Vector3, distance: number) {
    const portrait = this.game.engine.aspect < 0.9;
    const d = (distance + 12 + target.y * 0.6) * (portrait ? 1.7 : 1);
    this.camera.position.set(target.x * 0.5 + 10, target.y * 0.55 + 5, d);
    this.camera.lookAt(target.x * 0.5, target.y * 0.5 + 1, 0);
  }

  qaLand() { this.pos.set(0, 0.5); this.vel.set(0, -1); }
  qaSkipToRover() { this.stage = "rover"; this.roverPos.set(0, 0, 4); if (this.rover) this.rover.visible = true; this.lander.visible = false; this.capsule.visible = false; }
}
