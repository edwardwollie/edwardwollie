import * as THREE from "three";
import type { Game, MissionRun } from "../app/game.ts";
import { loop, sfx } from "../engine/audio.ts";
import type { PointerInfo, SceneController } from "../engine/engine.ts";
import { Flame, Particles, Ring, damp } from "../engine/fx.ts";
import { input } from "../engine/input.ts";
import { speak, stopSpeaking } from "../engine/narrator.ts";
import { updateStars, type PlanetKind } from "../engine/space.ts";
import { RushSession, type RushStage } from "../learning/rush.ts";
import { bakeStatic } from "../models/bake.ts";
import { drawWrapped } from "../world/labels.ts";

/**
 * SPACE RUSH 3D — the v2.1 learning gates as a real flight. Three holographic
 * answer gates hold far ahead while the narrator reads the question and all
 * choices, wait through the 7-second thinking time, then glide in over the answer
 * window. Steer (keys, tap a gate/answer, or drag) and BOOST through a gate.
 */
export const GATE_COLORS = ["#62e8ff", "#ffd95a", "#ff66bf"] as const;
export const GATE_SHAPES = ["●", "▲", "■"] as const;
const CAM_Z = 22;
/** The ship lines up just below a gate, then rises into it on BOOST. */
const SHIP_DROP = 4.2;
const SPAWN_Z = -340;

interface Gate {
  group: THREE.Group;
  left: THREE.Mesh;
  right: THREE.Mesh;
  membrane: THREE.Mesh;
  panel: THREE.Mesh;
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  slot: THREE.Vector2;
  open: number;
  crash: number;
  state: "normal" | "selected" | "correct" | "wrong" | "reveal";
  text: string;
}

/** Gate slots for an age path, adapted to the screen shape (phones in portrait get a column). */
function formation(age: string, aspect: number): { slots: THREE.Vector2[]; scale: number } {
  if (aspect < 0.85) {
    const lift = age === "5–7" ? 4 : age === "8–10" ? 6 : 8;
    return { slots: [new THREE.Vector2(-9.6, -3), new THREE.Vector2(0, lift), new THREE.Vector2(9.6, -3)], scale: 0.9 };
  }
  const gap = aspect < 1.25 ? 17.5 : 21;
  const scale = aspect < 1.25 ? 1.2 : 1.45;
  if (age === "5–7") return { slots: [new THREE.Vector2(-gap, 1), new THREE.Vector2(0, 1), new THREE.Vector2(gap, 1)], scale };
  if (age === "8–10") return { slots: [new THREE.Vector2(-gap, -1), new THREE.Vector2(0, 5), new THREE.Vector2(gap, -1)], scale };
  return { slots: [new THREE.Vector2(-gap * 0.95, -4), new THREE.Vector2(0, 8), new THREE.Vector2(gap * 0.95, -4)], scale };
}

export class RushScene implements SceneController {
  readonly id = "rush";
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 4000);
  // Keep the halo tight so the answers on the gates stay easy to read.
  bloom = { strength: 0.42, radius: 0.22, threshold: 0.62 };
  private readonly game: Game;
  private session: RushSession | null = null;
  private run: MissionRun | null = null;
  private readonly ship = new THREE.Group();
  private readonly flames: Flame[] = [];
  private shield!: THREE.Mesh;
  private shieldTime = 0;
  private readonly gates: Gate[] = [];
  private gateZ = SPAWN_Z;
  private gateOpacity = 0;
  private readonly env = new THREE.Group();
  private readonly dust: THREE.Points;
  private readonly sparks: Particles;
  private readonly smoke: Particles;
  private readonly ring = new Ring("#7ff0ff");
  private readonly shipPos = new THREE.Vector2();
  private readonly shipTarget = new THREE.Vector2();
  private bank = 0;
  private boostGlow = 0;
  private shake = 0;
  private speed = 60;
  private stage: RushStage = "narrating";
  private lastToken = 0;
  private dragging = false;
  private dragTarget: THREE.Vector2 | null = null;
  private destination: THREE.Object3D | null = null;
  private boss: THREE.Group | null = null;
  private bossHit = 0;
  private finishing = 0;
  private uiTimer = 0;
  private slots: THREE.Vector2[] = formation("5–7", 1.7).slots;
  private gateScale = 1.45;
  private camDistance = 40;

  /** Where the gates wait while the question is read (in front of the ship). */
  private get holdZ() {
    return Math.min(-26, CAM_Z - this.camDistance);
  }
  private rocks: { mesh: THREE.InstancedMesh; data: { p: THREE.Vector3; r: THREE.Euler; s: number; spin: THREE.Vector3 }[] } | null = null;
  private factShownAt = 0;
  private time = 0;
  private shipBuilt = false;

  constructor(game: Game) {
    this.game = game;
    this.scene.add(this.env);
    const dustGeometry = new THREE.BufferGeometry();
    const count = 900;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      positions.set([side * (14 + Math.random() * 110), (Math.random() - 0.5) * 110, -Math.random() * 600], i * 3);
    }
    dustGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: "#bfe9ff", size: 0.35, map: game.space.glowSprite(), transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.dust.frustumCulled = false;
    this.dust.userData.noBloom = true;
    this.scene.add(this.dust);
    this.sparks = new Particles(900, true, game.engine.renderer.getPixelRatio());
    this.smoke = new Particles(500, true, game.engine.renderer.getPixelRatio());
    this.scene.add(this.sparks.points, this.smoke.points, this.ring.mesh, this.ship);
    this.scene.add(new THREE.HemisphereLight(0xb8d4ff, 0x302040, 0.9));
    const sun = new THREE.DirectionalLight(0xfff1dd, 2.6);
    sun.position.set(80, 60, 40);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x9f7bff, 1.2);
    rim.position.set(-60, -20, -80);
    this.scene.add(rim);
    for (let i = 0; i < 3; i++) this.gates.push(this.makeGate(i));
  }

  private buildShip() {
    if (this.shipBuilt) return;
    this.shipBuilt = true;
    const rocket = this.game.model("rocket-comet");
    bakeStatic(rocket.root);
    const holder = new THREE.Group();
    holder.add(rocket.root);
    rocket.root.position.y = -8.8; // centre the rocket on its middle
    holder.rotation.x = -Math.PI / 2;
    holder.scale.setScalar(0.48);
    this.ship.add(holder);
    const spots: [number, number][] = [[0, 0.8], [-0.7, -0.42], [0.7, -0.42]];
    for (const [x, z] of spots) {
      const flame = new Flame(0.62, 6, "orange");
      flame.mesh.position.set(x, 0.02, z);
      rocket.root.add(flame.mesh);
      this.flames.push(flame);
    }
    this.shield = this.game.space.atmosphere(1, "#7ff0ff", 3.2, 1);
    this.shield.scale.set(3.6, 3.6, 6.2);
    this.shield.visible = false;
    this.ship.add(this.shield);
  }

  private makeGate(index: number): Gate {
    const color = new THREE.Color(GATE_COLORS[index]);
    const group = new THREE.Group();
    const torus = new THREE.TorusGeometry(6.4, 0.55, 14, 40, Math.PI);
    const ringMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.2 });
    ringMat.userData.bloom = true;
    const left = new THREE.Mesh(torus, ringMat);
    left.rotation.z = Math.PI / 2;
    const right = new THREE.Mesh(torus, ringMat.clone());
    right.rotation.z = -Math.PI / 2;
    const membrane = new THREE.Mesh(new THREE.CircleGeometry(6.0, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    membrane.userData.noBloom = true; // keeps the answer text crisp on High graphics
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 600;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(10.2, 6.0), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    panel.position.z = 0.2;
    // little lights around the rim
    const bulbs = new THREE.Group();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
      bulb.position.set(Math.cos(a) * 6.4, Math.sin(a) * 6.4, 0.45);
      bulbs.add(bulb);
    }
    group.add(left, right, membrane, panel, bulbs);
    this.scene.add(group);
    return { group, left, right, membrane, panel, canvas, texture, slot: new THREE.Vector2(), open: 0, crash: 0, state: "normal", text: "" };
  }

  private paintGate(gate: Gate, index: number) {
    const ctx = gate.canvas.getContext("2d")!;
    const { width, height } = gate.canvas;
    ctx.clearRect(0, 0, width, height);
    const color = gate.state === "correct" || gate.state === "reveal" ? "#5cf2a0" : GATE_COLORS[index];
    ctx.fillStyle = gate.state === "wrong" ? "rgba(70,12,40,0.9)" : gate.state === "selected" ? "rgba(18,32,92,0.94)" : "rgba(8,14,44,0.88)";
    ctx.beginPath();
    ctx.roundRect(10, 10, width - 20, height - 20, 70);
    ctx.fill();
    ctx.lineWidth = gate.state === "selected" ? 22 : 12;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(110, 110, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#081029";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 92px 'Fredoka Variable','Fredoka',system-ui,sans-serif";
    ctx.fillText(String(index + 1), 110, 116);
    ctx.fillStyle = color;
    ctx.font = "700 64px system-ui,sans-serif";
    ctx.fillText(GATE_SHAPES[index], width - 100, 112);
    ctx.fillStyle = "#ffffff";
    drawWrapped(ctx, gate.text, width / 2, height / 2 + 50, width - 120, height - 230, 96, 700, 1.08);
    if (gate.state === "correct" || gate.state === "reveal") {
      ctx.fillStyle = "#5cf2a0";
      ctx.font = "700 60px 'Fredoka Variable','Fredoka',system-ui,sans-serif";
      ctx.fillText("✓", width - 100, height - 80);
    }
    gate.texture.needsUpdate = true;
  }

  private setGateState(index: number, state: Gate["state"]) {
    const gate = this.gates[index];
    if (gate.state === state) return;
    gate.state = state;
    this.paintGate(gate, index);
    const green = new THREE.Color("#5cf2a0");
    const base = new THREE.Color(GATE_COLORS[index]);
    const c = state === "correct" || state === "reveal" ? green : base;
    for (const half of [gate.left, gate.right]) {
      const m = half.material as THREE.MeshStandardMaterial;
      m.color.copy(c);
      m.emissive.copy(c);
      m.emissiveIntensity = state === "selected" ? 1.6 : 0.9;
    }
    (gate.membrane.material as THREE.MeshBasicMaterial).color.copy(c);
  }

  // ------------------------------------------------------------ environment

  private buildEnvironment(run: MissionRun) {
    this.env.clear();
    this.destination = null;
    this.boss = null;
    this.rocks = null;
    const space = this.game.space;
    const world = run.mission.worldIndex;
    const palettes: [string, string, string][] = [["#1b3a8f", "#2f8fe8", "#7b5cff"], ["#23307a", "#3aa0d8", "#9b5cff"], ["#2a2a6a", "#6a6aa8", "#3a8fd8"], ["#5a1f3a", "#c8553a", "#7b3fa8"], ["#3a2a5a", "#8a6a4a", "#5a8fd8"], ["#2a1f6a", "#c03a9a", "#3a9fe8"]];
    this.env.add(space.skySphere(palettes[world], world * 1.7 + 1.1, 1800));
    this.env.add(space.starfield(1800, 1700, 1.2));
    if (world === 0) {
      const earth = space.planet("earth", 520, { clouds: true });
      earth.position.set(0, -585, -380);
      earth.rotation.set(1.3, 0.6, 0.25);
      this.env.add(earth);
      this.destination = null;
    } else if (world === 1) {
      const earth = space.planet("earth", 420, { clouds: true });
      earth.position.set(-120, -500, -200);
      earth.rotation.set(1.2, 2.1, 0);
      this.env.add(earth);
      const station = this.game.model("station-orbital-school");
      bakeStatic(station.root);
      station.root.position.set(30, 18, -1100);
      station.root.scale.setScalar(2.2);
      this.env.add(station.root);
      this.destination = station.root;
    } else if (world === 2) {
      const moon = space.planet("moon", 170);
      moon.position.set(110, 10, -1400);
      this.env.add(moon);
      const earth = space.planet("earth", 40, { clouds: true });
      earth.position.set(-260, 120, -900);
      this.env.add(earth);
      this.destination = moon;
    } else if (world === 3) {
      const mars = space.planet("mars", 190);
      mars.position.set(-120, -20, -1500);
      this.env.add(mars);
      const phobos = new THREE.Mesh(space.asteroidGeometry(9, 4.2, 2), new THREE.MeshStandardMaterial({ map: space.surface("asteroid"), roughness: 1 }));
      phobos.position.set(90, 60, -700);
      this.env.add(phobos);
      this.destination = mars;
    } else if (world === 4) {
      const sun = space.planet("sun", 60);
      sun.position.set(500, 160, -1600);
      this.env.add(sun);
      const material = new THREE.MeshStandardMaterial({ map: space.surface("asteroid"), roughness: 1 });
      const geometry = space.asteroidGeometry(1, 2.7, 2);
      const count = 90;
      const mesh = new THREE.InstancedMesh(geometry, material, count);
      const data = Array.from({ length: count }, (_, i) => {
        const side = i % 2 ? 1 : -1;
        return { p: new THREE.Vector3(side * (32 + Math.random() * 90), (Math.random() - 0.5) * 80, -Math.random() * 700), r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0), s: 1.5 + Math.random() * 6, spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(0.6) };
      });
      this.rocks = { mesh, data };
      this.env.add(mesh);
    } else {
      const kind = run.mission.target as PlanetKind;
      const planet = space.planet(kind, kind === "jupiter" ? 300 : kind === "saturn" ? 230 : 170, { rings: kind === "saturn" });
      planet.position.set(220, 40, -1500);
      planet.rotation.z = kind === "uranus" ? 1.45 : 0.4;
      this.env.add(planet);
      this.destination = planet;
    }
    if (run.mission.boss) {
      const boss = new THREE.Group();
      const rockMat = new THREE.MeshStandardMaterial({ map: space.surface("asteroid"), roughness: 1, emissive: "#ff4b1f", emissiveIntensity: 0.18 });
      const body = new THREE.Mesh(space.asteroidGeometry(38, 9.1, 4), rockMat);
      boss.add(body);
      const eyeMat = new THREE.MeshBasicMaterial({ color: "#ffd95a" });
      for (const x of [-11, 11]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(6, 20, 14), eyeMat);
        eye.position.set(x, 8, 33);
        eye.scale.set(1, 0.65, 0.4);
        boss.add(eye);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(2.6, 14, 10), new THREE.MeshBasicMaterial({ color: "#2a0c08" }));
        pupil.position.set(x * 0.92, 7, 35.5);
        boss.add(pupil);
      }
      const grin = new THREE.Mesh(new THREE.TorusGeometry(12, 1.8, 10, 30, Math.PI), new THREE.MeshBasicMaterial({ color: "#ff7b2f" }));
      grin.position.set(0, -6, 33);
      grin.rotation.z = Math.PI;
      boss.add(grin);
      boss.add(space.glow(150, "#ff6a2f", 0.35));
      boss.position.set(-60, 40, -760);
      this.env.add(boss);
      this.boss = boss;
    }
  }

  // ------------------------------------------------------------ lifecycle

  enter(params?: unknown) {
    const run = (params as { run: MissionRun }).run;
    this.run = run;
    this.buildShip();
    this.buildEnvironment(run);
    this.applyFormation();
    const relaxed = this.game.save.get().v3.timing === "relaxed";
    this.session = new RushSession(run.age, run.level, relaxed);
    this.session.onChange = () => this.onSessionChange();
    this.stage = this.session.stage;
    this.lastToken = 0;
    this.shipPos.set(0, 0);
    this.shipTarget.copy(this.slots[1]);
    this.finishing = 0;
    this.bossHit = 0;
    this.sparks.clear();
    this.smoke.clear();
    this.prepareGates();
    this.publish();
    this.handleNarration();
    loop("engine", 0.25);
  }

  exit() {
    stopSpeaking();
    loop("engine", 0);
    if (this.session) this.session.onChange = null;
  }

  /** Resume after pause: re-read the question so the timing stays fair. */
  resume() {
    if (!this.session) return;
    if (!this.session.readAgain()) this.handleNarration(true);
    loop("engine", 0.25);
  }

  private applyFormation() {
    const age = this.run?.age ?? "5–7";
    const aspect = this.game.engine.aspect;
    const f = formation(age, aspect);
    this.slots = f.slots;
    this.gateScale = f.scale;
    // Fit the whole formation (plus gate radius) inside the view at the hold distance.
    const radius = 6.4 * f.scale + 1.5;
    let halfW = 0, halfH = 0;
    for (const slot of f.slots) { halfW = Math.max(halfW, Math.abs(slot.x) + radius); halfH = Math.max(halfH, Math.abs(slot.y - 2) + radius); }
    const vHalf = ((this.camera.fov || 55) * Math.PI) / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * aspect);
    const need = Math.max(halfW / Math.tan(hHalf * 0.9), halfH / Math.tan(vHalf * 0.72));
    this.camDistance = Math.max(30, Math.min(110, need));
    for (const gate of this.gates) gate.slot.copy(this.slots[this.gates.indexOf(gate)]);
    if (this.session) this.shipTarget.copy(this.slots[this.session.selected]);
  }

  resize() {
    if (this.run) this.applyFormation();
  }

  private prepareGates() {
    const session = this.session!;
    const choices = session.choices;
    this.gateZ = SPAWN_Z;
    this.gateOpacity = 0;
    this.gates.forEach((gate, i) => {
      gate.text = choices[i];
      gate.state = "normal";
      gate.open = 0;
      gate.crash = 0;
      gate.slot.copy(this.slots[i]);
      gate.group.visible = true;
      gate.left.position.set(0, 0, 0);
      gate.right.position.set(0, 0, 0);
      gate.left.rotation.set(0, 0, Math.PI / 2);
      gate.right.rotation.set(0, 0, -Math.PI / 2);
      gate.panel.visible = true;
      gate.membrane.visible = true;
      this.paintGate(gate, i);
      this.setGateState(i, i === session.selected ? "selected" : "normal");
    });
  }

  private onSessionChange() {
    const session = this.session!;
    const previous = this.stage;
    this.stage = session.stage;
    if (previous !== session.stage) {
      if (session.stage === "impact") this.onImpact();
      if (session.stage === "narrating" && previous === "fact") this.prepareGates();
      if (session.stage === "running") sfx("beep");
      if (session.stage === "done") this.finishing = 0.0001;
    }
    if (session.stage !== "impact" && session.stage !== "fact" && session.stage !== "done") {
      this.gates.forEach((_, i) => this.setGateState(i, i === session.selected ? "selected" : "normal"));
      this.shipTarget.copy(this.slots[session.selected]);
    }
    this.handleNarration();
    this.publish();
  }

  private handleNarration(force = false) {
    const session = this.session;
    if (!session) return;
    if ((session.stage === "narrating" || session.stage === "fact") && (force || session.narrationToken !== this.lastToken)) {
      const token = session.narrationToken;
      this.lastToken = token;
      const isFact = session.stage === "fact";
      const text = isFact ? session.factText() : session.narrationText();
      if (isFact) this.factShownAt = this.time;
      void speak(text, { rate: this.game.rate, caption: isFact ? text : session.question?.prompt }).then(() => {
        if (!this.session || this.session !== session) return;
        if (isFact) window.setTimeout(() => session.narrationDone(token), 650);
        else session.narrationDone(token);
      });
    }
  }

  private onImpact() {
    const session = this.session!;
    const impact = session.impact!;
    const sel = this.gates[impact.selected];
    if (impact.correct) {
      sfx("correct");
      this.setGateState(impact.selected, "correct");
      this.boostGlow = 1;
      this.bossHit = this.boss ? 1 : 0;
    } else {
      sfx("wrong");
      this.setGateState(impact.selected, "wrong");
      this.setGateState(impact.correctGate, "reveal");
      this.shake = this.game.reduceMotion ? 0.2 : 1;
      this.shieldTime = 0.8;
    }
    void sel;
    loop("engine", 0.6);
    window.setTimeout(() => loop("engine", 0.25), 900);
  }

  private publish() {
    if (!this.session) return;
    this.game.ui.set({ rush: this.session.snapshot() });
  }

  // ------------------------------------------------------------ controls (also used by the HUD)

  select(index: number) {
    if (this.session?.select(index)) sfx("select");
  }

  boost() {
    if (this.session?.boost()) sfx("boost");
    else if (this.session?.stage === "grace" || this.session?.stage === "narrating") sfx("error");
  }

  readAgain() {
    if (this.session?.readAgain()) sfx("tap");
  }

  continueFact() {
    if (this.session?.stage === "fact" && this.time - this.factShownAt > 1.2) {
      stopSpeaking();
      this.session.skipFact();
    }
  }

  // ------------------------------------------------------------ update

  update(dt: number, time: number) {
    this.time = time;
    const session = this.session;
    if (!session) return;
    if (this.game.ui.get().overlay) return;
    // Input
    if (input.pressed("a", "arrowleft")) this.select(session.selected - 1);
    if (input.pressed("d", "arrowright")) this.select(session.selected + 1);
    if (input.pressed("1")) this.select(0);
    if (input.pressed("2")) this.select(1);
    if (input.pressed("3")) this.select(2);
    if (input.pressed("w", "arrowup", "space", "enter")) {
      if (session.stage === "fact") this.continueFact(); else this.boost();
    }
    if (input.pressed("r")) this.readAgain();
    session.tick(dt);
    // UI refresh at ~10 Hz for timers
    this.uiTimer -= dt;
    if (this.uiTimer <= 0) { this.uiTimer = 0.1; this.publish(); }
    // Gate motion
    const stage = session.stage;
    const holdZ = this.holdZ;
    let targetZ = holdZ;
    if (stage === "running") targetZ = session.relaxed ? holdZ * 0.62 : holdZ * Math.max(0.06, session.timeLeft / session.window);
    if (stage === "narrating" || stage === "grace" || stage === "running") {
      this.gateZ = damp(this.gateZ, targetZ, stage === "running" ? 6 : 1.8, dt);
      this.gateOpacity = Math.min(1, this.gateOpacity + dt * 1.2);
      this.speed = damp(this.speed, stage === "running" ? 75 : 55, 2, dt);
    } else if (stage === "impact" || stage === "fact" || stage === "done") {
      const before = this.gateZ;
      this.gateZ += dt * (this.gateZ < -8 ? 160 : 90);
      if (before < -6 && this.gateZ >= -6) this.burst();
      this.speed = damp(this.speed, stage === "impact" ? 140 : 70, 3, dt);
    }
    // Drag steering
    if (this.dragTarget && (stage === "narrating" || stage === "grace" || stage === "running")) this.shipTarget.copy(this.dragTarget);
    const drop = stage === "impact" ? 0 : SHIP_DROP;
    this.shipPos.x = damp(this.shipPos.x, this.shipTarget.x, 4.5, dt);
    this.shipPos.y = damp(this.shipPos.y, this.shipTarget.y - drop, stage === "impact" ? 7 : 4.5, dt);
    const lateral = this.shipTarget.x - this.shipPos.x;
    this.bank = damp(this.bank, -lateral * 0.05, 5, dt);
    this.ship.position.set(this.shipPos.x, this.shipPos.y, 0);
    this.ship.rotation.set((this.shipTarget.y - drop - this.shipPos.y) * 0.03, 0, this.bank);
    // Gates
    this.gates.forEach((gate, i) => {
      gate.group.position.set(gate.slot.x, gate.slot.y, this.gateZ);
      gate.group.rotation.z = Math.sin(time * 0.8 + i) * 0.04;
      const pulse = gate.state === "selected" ? 1 + Math.sin(time * 6) * 0.04 : 1;
      gate.group.scale.setScalar(this.gateScale * pulse);
      const mats = [gate.membrane.material, gate.panel.material] as THREE.MeshBasicMaterial[];
      mats[0].opacity = (gate.state === "selected" ? 0.26 : 0.14) * this.gateOpacity;
      mats[1].opacity = this.gateOpacity * (gate.crash > 0 ? Math.max(0, 1 - gate.crash * 3) : 1);
      if (gate.open > 0) {
        gate.open = Math.min(1, gate.open + dt * 2.2);
        const o = gate.open;
        gate.left.position.x = -o * 7;
        gate.right.position.x = o * 7;
        gate.left.rotation.y = o * 1.1;
        gate.right.rotation.y = -o * 1.1;
        gate.panel.position.y = o * 12;
      }
      if (gate.crash > 0) {
        gate.crash = Math.min(1, gate.crash + dt * 1.8);
        gate.left.rotation.x = gate.crash * 0.9;
        gate.right.rotation.x = -gate.crash * 0.7;
        gate.left.position.y = -gate.crash * 3;
        gate.right.position.y = -gate.crash * 4;
      }
      if (this.gateZ > 40) gate.group.visible = false;
    });
    // Ship effects
    this.boostGlow = Math.max(0, this.boostGlow - dt * 0.9);
    const throttle = 0.55 + (stage === "impact" ? 0.45 : 0) + this.boostGlow * 0.3;
    for (const flame of this.flames) { flame.throttle = throttle; flame.update(dt, time); }
    if (Math.random() < dt * 30) this.smoke.emit({ position: new THREE.Vector3(this.shipPos.x + (Math.random() - 0.5) * 1.2, this.shipPos.y + (Math.random() - 0.5) * 1.2, 5.5), velocity: new THREE.Vector3(0, 0, 26), spread: 3, life: 0.32, size: 0.7, growth: 1.5, color: "#ffc27a", colorEnd: "#ff4fb5", alpha: 0.35 });
    if (this.shield) {
      this.shieldTime = Math.max(0, this.shieldTime - dt);
      this.shield.visible = this.shieldTime > 0;
      const k = 1 + (0.8 - this.shieldTime) * 0.25;
      this.shield.scale.set(3.6 * k, 3.6 * k, 6.2 * k);
    }
    this.shake = Math.max(0, this.shake - dt * 1.4);
    // Dust streaks
    const pos = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      let z = pos.getZ(i) + this.speed * dt * 2.2;
      if (z > 30) z -= 630;
      pos.setZ(i, z);
    }
    pos.needsUpdate = true;
    (this.dust.material as THREE.PointsMaterial).size = 0.5 + this.speed / 220;
    // Environment drift
    const progress = (session.index + (stage === "impact" || stage === "fact" ? 1 : 0)) / session.total + (stage === "done" ? 0.15 : 0);
    if (this.destination) {
      const base = this.destination.userData.baseZ ?? (this.destination.userData.baseZ = this.destination.position.z);
      this.destination.position.z = damp(this.destination.position.z, base + progress * 620, 1.2, dt);
      this.destination.rotation.y += dt * 0.03;
    }
    if (this.rocks) {
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      this.rocks.data.forEach((rock, i) => {
        rock.p.z += this.speed * dt * 1.4;
        if (rock.p.z > 60) rock.p.z -= 760;
        rock.r.x += rock.spin.x * dt; rock.r.y += rock.spin.y * dt;
        m.compose(rock.p, q.setFromEuler(rock.r), new THREE.Vector3(rock.s, rock.s * 0.8, rock.s));
        this.rocks!.mesh.setMatrixAt(i, m);
      });
      this.rocks.mesh.instanceMatrix.needsUpdate = true;
    }
    if (this.boss) {
      this.boss.rotation.y = Math.sin(time * 0.5) * 0.25;
      this.boss.position.y = 40 + Math.sin(time * 0.8) * 6;
      if (this.bossHit > 0) {
        this.bossHit = Math.max(0, this.bossHit - dt);
        this.boss.position.x = -60 + Math.sin(time * 40) * this.bossHit * 4;
      }
      const left = session.total - session.correct;
      const target = 0.4 + (left / session.total) * 0.6;
      this.boss.scale.setScalar(damp(this.boss.scale.x, stage === "done" ? 0.01 : target, 2, dt));
    }
    this.sparks.update(dt);
    this.smoke.update(dt);
    this.ring.update(dt, 14);
    updateStars(this.env, time);
    // Finish
    if (stage === "done") {
      this.finishing += dt;
      this.speed = damp(this.speed, 400, 1.5, dt);
      if (this.finishing > 2.2 && this.finishing < 100) {
        this.finishing = 1000;
        loop("engine", 0);
        void this.game.finishRush(session.snapshot());
      }
    }
    // Camera: framed so the three gates fit on any screen shape
    const sx = this.shipPos.x, sy = this.shipPos.y;
    const shake = this.shake * 0.6;
    this.camera.fov = damp(this.camera.fov, 55 + (stage === "impact" ? 7 : 0) + this.boostGlow * 4, 4, dt);
    this.camera.updateProjectionMatrix();
    this.camera.position.set(sx * 0.35 + (Math.random() - 0.5) * shake, sy * 0.3 + 6.5 + (Math.random() - 0.5) * shake, CAM_Z);
    this.camera.lookAt(sx * 0.3, sy * 0.3 + 2.2, this.holdZ - 30);
  }

  private burst() {
    const impact = this.session?.impact;
    if (!impact) return;
    const gate = this.gates[impact.selected];
    const at = new THREE.Vector3(gate.slot.x, gate.slot.y, -4);
    if (impact.correct) {
      gate.open = 0.01;
      this.ring.fire(at);
      this.sparks.emit({ position: at, velocity: new THREE.Vector3(0, 0, 22), spread: 30, life: 1.0, size: 0.38, color: "#fff4b0", colorEnd: "#ffd95a", count: 160 });
      sfx("star");
    } else {
      gate.crash = 0.01;
      gate.panel.visible = false;
      gate.membrane.visible = false;
      this.sparks.emit({ position: at, velocity: new THREE.Vector3(0, 0, 26), spread: 26, life: 1.0, size: 0.55, color: GATE_COLORS[impact.selected], colorEnd: "#ffffff", count: 120, gravity: 12 });
      const right = this.gates[impact.correctGate];
      right.open = 0.01;
    }
  }

  pointer(info: PointerInfo) {
    const session = this.session;
    if (!session) return;
    if (info.type === "down") {
      this.dragging = false;
    }
    if (info.type === "move" && info.pointers > 0 && (Math.abs(info.dx) > 0.5 || Math.abs(info.dy) > 0.5)) {
      this.dragging = true;
      const world = this.screenToGatePlane(info.x, info.y);
      if (world) {
        this.dragTarget = world;
        let best = 0, bestD = Infinity;
        this.slots.forEach((slot, i) => { const d = slot.distanceTo(world); if (d < bestD) { bestD = d; best = i; } });
        if (best !== session.selected) this.select(best);
      }
    }
    if (info.type === "up") {
      this.dragTarget = null;
      this.shipTarget.copy(this.slots[session.selected]);
    }
    if (info.type === "tap" && !this.dragging) {
      // Tap a gate to pick it; tap the same gate again to boost through.
      const world = this.screenToGatePlane(info.x, info.y);
      if (!world) return;
      let best = -1, bestD = 10;
      this.slots.forEach((slot, i) => { const d = slot.distanceTo(world); if (d < bestD) { bestD = d; best = i; } });
      if (best < 0) return;
      if (best === session.selected && session.stage === "running") this.boost();
      else this.select(best);
    }
  }

  private screenToGatePlane(x: number, y: number) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(x, y), this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -Math.min(-10, this.gateZ));
    void CAM_Z;
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    return new THREE.Vector2(Math.max(-18, Math.min(18, hit.x)), Math.max(-8, Math.min(10, hit.y)));
  }

  // QA helper: answer a gate immediately (skips narration and thinking time).
  qaAnswer(index: number) {
    const session = this.session;
    if (!session) return;
    while (session.stage === "narrating") session.narrationDone(session.narrationToken);
    if (session.stage === "grace") session.tick(10);
    session.select(index);
    session.boost();
  }

  qaCorrectGate() {
    return this.session?.correctGate ?? -1;
  }
}
