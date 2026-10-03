import * as THREE from "three";
import type { Game } from "../app/game.ts";
import { COMET_CONFIG } from "../blueprints/rocket.ts";
import { sfx } from "../engine/audio.ts";
import type { PointerInfo, SceneController } from "../engine/engine.ts";
import { damp } from "../engine/fx.ts";
import { DESTINATIONS, RANGE_BY_WORLD, coachHint, meetsGoals, missionNeeds, type EngineeringMission } from "../engineering/missions.ts";
import { analyzeRocket, type MissionNeeds, type RocketAnalysis } from "../engineering/physics.ts";
import { PHYSICS, emptyCounts, partInfo, systemsFor, type SystemCounts, type SystemId } from "../engineering/systems.ts";
import { bakeStatic } from "../models/bake.ts";
import { Animator } from "../models/rig.ts";
import type { BuiltModel } from "../models/build.ts";
import { RocketAssembly } from "../world/assembly.ts";
import { textSprite } from "../world/labels.ts";

export interface BuildCheck { id: string; label: string; ok: boolean; icon: string }

export interface BuildView {
  mode: "mission" | "sandbox";
  counts: SystemCounts;
  start: SystemCounts;
  energy: number;
  energyMax: number;
  history: SystemId[];
  analysis: RocketAnalysis;
  checks: BuildCheck[];
  ready: boolean;
  coach: string;
  engineer: boolean;
  available: SystemId[];
  focus: string | null;
  focusTarget: number | null;
  totalGoal: number | null;
  destinationIndex: number;
  mission: { level: number; objective: string; world: string; icon: string; destination: string } | null;
}

/**
 * The Rocket Hangar: the v2.1 rocket-engineering phase rebuilt as a hands-on 3D
 * assembly bay with real physics (thrust vs weight, delta-v, centre of mass vs
 * centre of pressure). Also used for free-build sandbox mode.
 */
export class HangarScene implements SceneController {
  readonly id = "hangar";
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 800);
  bloom = { strength: 0.45, radius: 0.4, threshold: 0.8 };
  private readonly game: Game;
  private readonly rocket: RocketAssembly;
  private readonly turntable = new THREE.Group();
  private cosmo: { model: BuiltModel; anim: Animator } | null = null;
  private mode: "mission" | "sandbox" = "mission";
  private mission: EngineeringMission | null = null;
  private counts: SystemCounts = emptyCounts();
  private start: SystemCounts = emptyCounts();
  private energy = 0;
  private energyMax = 0;
  private history: SystemId[] = [];
  private engineer = false;
  private destinationIndex = 2;
  private yaw = 0.6;
  private pitch = 0.18;
  private distance = 34;
  private autoSpin = true;
  private idle = 0;
  private readonly arrows = new THREE.Group();
  private thrustArrow!: THREE.Mesh;
  private weightArrow!: THREE.Mesh;
  private comMarker!: THREE.Mesh;
  private copMarker!: THREE.Mesh;
  private markerLabels: THREE.Sprite[] = [];
  private built = false;
  private readonly lookAt = new THREE.Vector3(0, 8, 0);
  private dragging = false;
  private celebrate = 0;

  constructor(game: Game) {
    this.game = game;
    this.rocket = new RocketAssembly(game);
  }

  private build() {
    if (this.built) return;
    this.built = true;
    const scene = this.scene;
    scene.background = new THREE.Color("#0c1433");
    scene.fog = new THREE.Fog("#0c1433", 70, 160);
    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2a44, 1.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(18, 30, 22);
    key.castShadow = this.game.engine.quality !== "low";
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -20, right: 20, top: 30, bottom: -5, near: 1, far: 90 });
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fd8ff, 1.3);
    rim.position.set(-20, 18, -20);
    scene.add(rim);
    const pink = new THREE.PointLight(0xff66bf, 40, 40, 2);
    pink.position.set(-9, 6, 8);
    scene.add(pink);
    // Room
    const room = new THREE.Group();
    const wallMat = new THREE.MeshStandardMaterial({ color: "#dfe6f2", roughness: 0.85, side: THREE.BackSide });
    const shell = new THREE.Mesh(new THREE.BoxGeometry(90, 46, 80), wallMat);
    shell.position.y = 23;
    room.add(shell);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshStandardMaterial({ color: "#9aa6bd", roughness: 0.55, metalness: 0.15 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    room.add(floor);
    const stripe = new THREE.Mesh(new THREE.RingGeometry(8.2, 9.2, 64), new THREE.MeshBasicMaterial({ color: "#ffd95a" }));
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.y = 0.02;
    room.add(stripe);
    // Wall panels and stripes
    for (let i = 0; i < 9; i++) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 44, 0.4), new THREE.MeshStandardMaterial({ color: i % 2 ? "#2f63e0" : "#c9d3e6", roughness: 0.7 }));
      panel.position.set(-40 + i * 10, 22, -39.6);
      room.add(panel);
    }
    // Big doors open to the launch pad
    const doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(26, 36), new THREE.MeshBasicMaterial({ color: "#8fd0ff" }));
    doorGlow.position.set(0, 18, -39.4);
    room.add(doorGlow);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(2, 26, 2), new THREE.MeshBasicMaterial({ color: "#6f86b8" }));
    tower.position.set(6, 14, -39.2);
    room.add(tower);
    // Gantry towers
    const gantryMat = new THREE.MeshStandardMaterial({ color: "#f2338f", roughness: 0.5, metalness: 0.3 });
    const deckMat = new THREE.MeshStandardMaterial({ color: "#4a5368", roughness: 0.6, metalness: 0.5 });
    for (const side of [-1, 1]) {
      for (const dz of [-1.6, 1.6]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 30, 0.5), gantryMat);
        post.position.set(side * 10.5, 15, dz);
        room.add(post);
      }
      for (let y = 4; y < 30; y += 6) {
        const deck = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 4.2), deckMat);
        deck.position.set(side * 9.2, y, 0);
        room.add(deck);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(4, 0.12, 0.12), new THREE.MeshStandardMaterial({ color: "#ffd95a" }));
        rail.position.set(side * 9.2, y + 1, 2.05);
        room.add(rail);
      }
    }
    const crane = new THREE.Mesh(new THREE.BoxGeometry(30, 1.2, 1.4), new THREE.MeshStandardMaterial({ color: "#ffd95a", roughness: 0.5 }));
    crane.position.set(0, 36, 0);
    room.add(crane);
    // Display shelves with spare parts
    const shelfMat = new THREE.MeshStandardMaterial({ color: "#3a4256", roughness: 0.6 });
    for (const side of [-1, 1]) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 26), shelfMat);
      shelf.position.set(side * 36, 4, 0);
      room.add(shelf);
    }
    bakeStatic(room);
    scene.add(room);
    for (const [i, id] of ["part-tank", "part-engine", "part-fins", "part-capsule", "part-lab", "part-antenna"].entries()) {
      const model = this.game.model(id);
      bakeStatic(model.root);
      const side = i % 2 ? 1 : -1;
      model.root.scale.setScalar(0.7);
      model.root.position.set(side * 36, 4.2 + (id === "part-engine" ? 1.4 : 0), -8 + Math.floor(i / 2) * 8);
      model.root.rotation.y = side * -Math.PI / 2;
      scene.add(model.root);
    }
    const sign = textSprite("ORBITAL BUILD BAY", { height: 2.4, icon: "🔧", border: "#ffd95a" });
    sign.position.set(0, 38.5, -36);
    scene.add(sign);
    // Turntable + rocket
    const table = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.8, 0.6, 48), new THREE.MeshStandardMaterial({ color: "#2b3350", roughness: 0.4, metalness: 0.5 }));
    table.position.y = 0.3;
    table.receiveShadow = true;
    const glow = new THREE.Mesh(new THREE.TorusGeometry(5.6, 0.08, 8, 64), new THREE.MeshBasicMaterial({ color: "#62e8ff" }));
    glow.rotation.x = Math.PI / 2;
    glow.position.y = 0.62;
    this.turntable.add(table, glow);
    this.rocket.group.position.y = 0.6;
    this.turntable.add(this.rocket.group);
    scene.add(this.turntable);
    // Cosmo
    const cosmo = this.game.model("robot-cosmo");
    cosmo.root.scale.setScalar(2.2);
    cosmo.root.position.set(-7.5, 1.5, 5.5);
    cosmo.root.rotation.y = 0.7;
    scene.add(cosmo.root);
    this.cosmo = { model: cosmo, anim: new Animator(cosmo) };
    // Engineer overlays
    const arrowMat = (color: string) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, roughness: 0.4 });
    const makeArrow = (color: string) => {
      const group = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1, 16), arrowMat(color));
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.5, 20), arrowMat(color));
      head.position.y = 0.5 + 0.75;
      head.name = "head";
      group.add(head);
      return group;
    };
    this.thrustArrow = makeArrow("#ff8a3d");
    this.weightArrow = makeArrow("#4f8dff");
    this.weightArrow.rotation.z = Math.PI;
    this.comMarker = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16), new THREE.MeshStandardMaterial({ color: "#ffd95a", emissive: "#ffb52e", emissiveIntensity: 0.6 }));
    this.copMarker = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16), new THREE.MeshStandardMaterial({ color: "#ff4b6b", emissive: "#ff2b4b", emissiveIntensity: 0.7 }));
    const comLabel = textSprite("Centre of mass", { height: 0.7, border: "#ffd95a" });
    const copLabel = textSprite("Centre of pressure", { height: 0.7, border: "#ff4b6b" });
    const thrustLabel = textSprite("PUSH UP (thrust)", { height: 0.8, border: "#ff8a3d" });
    const weightLabel = textSprite("PULL DOWN (weight)", { height: 0.8, border: "#4f8dff" });
    this.markerLabels = [comLabel, copLabel, thrustLabel, weightLabel];
    this.arrows.add(this.thrustArrow, this.weightArrow, this.comMarker, this.copMarker, comLabel, copLabel, thrustLabel, weightLabel);
    scene.add(this.arrows);
  }

  enter(params?: unknown) {
    this.build();
    const mode = (params as { mode?: "mission" | "sandbox" } | undefined)?.mode ?? "mission";
    this.mode = mode;
    const run = this.game.ui.get().run;
    this.history = [];
    if (mode === "mission" && run) {
      this.mission = run.mission;
      this.start = { ...run.mission.start };
      this.counts = { ...run.mission.start };
      this.energy = run.mission.energy;
      this.energyMax = run.mission.energy;
      this.destinationIndex = run.mission.worldIndex;
      this.engineer = run.age === "11–12";
    } else {
      this.mission = null;
      this.start = { ...emptyCounts(), engine: 1 };
      this.counts = { ...COMET_CONFIG };
      this.energy = 40;
      this.energyMax = 40;
      this.engineer = this.game.age !== "5–7";
    }
    this.rocket.setCounts(this.counts, false);
    this.yaw = 0.6;
    this.autoSpin = true;
    this.publish();
    if (mode === "mission" && run) {
      void this.game.say(`Rocket hangar! ${run.mission.objective}. Add systems until every checklist light turns green, then launch. ${this.coachText()}`);
    } else {
      void this.game.say("Welcome to the Rocket Hangar! Build any rocket you like and test how high it can fly.");
    }
  }

  exit() {
    this.game.quiet();
  }

  private needs(): MissionNeeds {
    if (this.mission) return this.mission.needs;
    return { range: RANGE_BY_WORLD[this.destinationIndex], required: [], helpful: [] };
  }

  private analysis() {
    return analyzeRocket(this.counts, this.needs());
  }

  private coachText() {
    const analysis = this.analysis();
    if (this.mission) return coachHint(this.mission, analysis, this.counts);
    if (!analysis.canLift) return "Too heavy to lift off! Add an engine or remove a fuel tank.";
    if (!analysis.reaches) return `This rocket can't reach ${DESTINATIONS[this.destinationIndex]} yet. Add fuel or make it lighter.`;
    return "Great rocket! Press Test Launch to fly it.";
  }

  private available(): SystemId[] {
    return systemsFor(this.game.age);
  }

  private checks(analysis: RocketAnalysis): BuildCheck[] {
    const m = this.mission;
    const dest = m ? m.destination : DESTINATIONS[this.destinationIndex];
    const list: BuildCheck[] = [
      { id: "lift", icon: "🔥", label: `Can lift off (thrust ${analysis.twr.toFixed(2)}× its weight)`, ok: analysis.canLift },
      { id: "range", icon: "🧭", label: `Enough fuel to reach ${dest}`, ok: analysis.reaches },
    ];
    if (m) {
      const names: Record<string, string> = { thrust: "Thrust", fuel: "Fuel & Energy", stability: "Stability & Safety", mission: "Mission Systems" };
      list.push({ id: "focus", icon: "🎯", label: `Focus: ${names[m.focus]} ${analysis.meters[m.focus]} / ${m.focusTarget}`, ok: analysis.meters[m.focus] >= m.focusTarget });
      list.push({ id: "total", icon: "🚀", label: `Total readiness ${analysis.total} / ${m.totalGoal}`, ok: analysis.total >= m.totalGoal });
    }
    return list;
  }

  private publish() {
    const analysis = this.analysis();
    const checks = this.checks(analysis);
    const ready = this.mission ? meetsGoals(analysis, this.mission) : analysis.canLift;
    const view: BuildView = {
      mode: this.mode, counts: { ...this.counts }, start: { ...this.start }, energy: this.energy, energyMax: this.energyMax, history: [...this.history],
      analysis, checks, ready, coach: this.coachText(), engineer: this.engineer, available: this.available(),
      focus: this.mission?.focus ?? null, focusTarget: this.mission?.focusTarget ?? null, totalGoal: this.mission?.totalGoal ?? null,
      destinationIndex: this.destinationIndex,
      mission: this.mission ? { level: this.mission.level, objective: this.mission.objective, world: this.mission.world.name, icon: this.mission.world.icon, destination: this.mission.destination } : null,
    };
    this.game.ui.set({ build: view });
    if (this.mission) this.game.updateBuild(this.counts, this.energy);
  }

  // ------------------------------------------------------------ actions (called by the UI)

  canAdd(id: SystemId) {
    return this.available().includes(id) && this.counts[id] < PHYSICS[id].max && partInfo(id).cost <= this.energy;
  }

  addPart(id: SystemId) {
    if (!this.canAdd(id)) { sfx("error"); return; }
    const wasReady = this.mission ? meetsGoals(this.analysis(), this.mission) : false;
    this.counts = { ...this.counts, [id]: this.counts[id] + 1 };
    this.energy -= partInfo(id).cost;
    this.history.push(id);
    this.rocket.setCounts(this.counts, true, id);
    sfx("build");
    this.autoSpin = true;
    const part = partInfo(id);
    const nowReady = this.mission ? meetsGoals(this.analysis(), this.mission) : false;
    if (nowReady && !wasReady) {
      this.celebrate = 2.5;
      sfx("win");
      void this.game.say(`${part.name}. ${part.fact} All systems green! You can launch now.`);
    } else {
      void this.game.say(`${part.name}. ${part.fact}`);
    }
    this.publish();
  }

  undo() {
    const last = this.history.pop();
    if (!last) return;
    this.counts = { ...this.counts, [last]: this.counts[last] - 1 };
    this.energy += partInfo(last).cost;
    this.rocket.setCounts(this.counts, true);
    sfx("unbuild");
    this.game.say("Last system returned to the assembly rack.");
    this.publish();
  }

  reset() {
    this.counts = { ...this.start };
    if (!this.mission) this.counts = { ...emptyCounts(), engine: 1, tank: 1 };
    this.energy = this.energyMax;
    this.history = [];
    this.rocket.setCounts(this.counts, true);
    sfx("unbuild");
    void this.game.say("Rocket bay reset. Try another plan — there is no penalty.");
    this.publish();
  }

  toggleEngineer() {
    this.engineer = !this.engineer;
    sfx("tap");
    this.publish();
  }

  setDestination(index: number) {
    this.destinationIndex = Math.max(0, Math.min(5, index));
    if (!this.mission) this.publish();
  }

  loadDesign(counts: Record<string, number>) {
    const next = emptyCounts();
    for (const id of Object.keys(next) as SystemId[]) next[id] = Math.max(0, Math.min(PHYSICS[id].max, Math.round(counts[id] ?? 0)));
    next.engine = Math.max(1, next.engine);
    this.counts = next;
    this.history = [];
    this.rocket.setCounts(this.counts, true);
    this.publish();
  }

  speakCoach() {
    void this.game.say(this.coachText());
  }

  async launch() {
    if (this.mission) {
      if (!meetsGoals(this.analysis(), this.mission)) { sfx("error"); this.speakCoach(); return; }
      this.game.updateBuild(this.counts, this.energy);
      await this.game.launch();
    } else {
      const analysis = this.analysis();
      if (!analysis.canLift) { sfx("error"); this.speakCoach(); return; }
      this.game.ui.set({ run: null });
      this.game.mood("none");
      await this.game.show("launch", "launch", { counts: { ...this.counts }, destination: DESTINATIONS[this.destinationIndex], worldIndex: this.destinationIndex, boss: false, sandbox: true });
    }
  }

  // ------------------------------------------------------------ update

  update(dt: number, time: number) {
    this.rocket.update(dt, time);
    this.rocket.setThrottle(0);
    this.idle += dt;
    if (this.autoSpin && !this.dragging) this.yaw += dt * (this.game.reduceMotion ? 0.05 : 0.16);
    const h = Math.max(10, this.rocket.height);
    const targetDistance = Math.max(this.distance, h * 1.55 + 6);
    const lookY = h * 0.46 + 0.6;
    this.lookAt.y = damp(this.lookAt.y, lookY, 3, dt);
    const d = targetDistance;
    const x = Math.sin(this.yaw) * Math.cos(this.pitch) * d;
    const z = Math.cos(this.yaw) * Math.cos(this.pitch) * d;
    const y = this.lookAt.y + Math.sin(this.pitch) * d;
    const portrait = this.game.engine.aspect < 0.9;
    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.lookAt.x, this.lookAt.y - (portrait ? 0 : 0), this.lookAt.z);
    if (portrait) this.camera.fov = 58; else this.camera.fov = 42;
    this.camera.updateProjectionMatrix();
    // Engineer overlays
    const analysis = this.analysis();
    const showForces = this.engineer || this.game.age === "5–7";
    this.arrows.visible = true;
    this.thrustArrow.visible = showForces;
    this.weightArrow.visible = showForces;
    this.comMarker.visible = this.engineer;
    this.copMarker.visible = this.engineer;
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const toCam = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const thrustLen = Math.min(14, Math.max(1, analysis.thrust / 90));
    const weightLen = Math.min(14, Math.max(1, (analysis.mass * 9.81) / 90));
    const base = 0.6;
    const side = Math.max(4.6, 3.2 + (this.counts.booster ? 3.4 : 0) + (this.counts.solar ? 0 : 0));
    this.thrustArrow.scale.set(1, thrustLen, 1);
    (this.thrustArrow.getObjectByName("head") as THREE.Mesh).scale.set(1, 1 / thrustLen, 1);
    this.thrustArrow.position.copy(right.clone().multiplyScalar(side)).setY(base + thrustLen / 2 + 2);
    this.weightArrow.scale.set(1, weightLen, 1);
    (this.weightArrow.getObjectByName("head") as THREE.Mesh).scale.set(1, 1 / weightLen, 1);
    this.weightArrow.position.copy(right.clone().multiplyScalar(-side)).setY(base + 2 + weightLen / 2 + 1.5);
    const front = toCam.clone().multiplyScalar(2.2);
    this.comMarker.position.copy(front).setY(base + analysis.com);
    this.copMarker.position.copy(front).setY(base + analysis.cop);
    const [comLabel, copLabel, thrustLabel, weightLabel] = this.markerLabels;
    comLabel.visible = copLabel.visible = this.engineer;
    comLabel.position.copy(this.comMarker.position).add(right.clone().multiplyScalar(2.6));
    copLabel.position.copy(this.copMarker.position).add(right.clone().multiplyScalar(-2.8));
    thrustLabel.visible = weightLabel.visible = showForces;
    thrustLabel.position.copy(this.thrustArrow.position).setY(base + thrustLen + 4.6);
    weightLabel.position.copy(this.weightArrow.position).setY(base + 1.2);
    // Cosmo
    if (this.cosmo) {
      this.celebrate = Math.max(0, this.celebrate - dt);
      const ready = this.mission ? meetsGoals(analysis, this.mission) : analysis.canLift;
      this.cosmo.anim.set(this.celebrate > 0 ? "cheer" : ready ? "wave" : "point");
      this.cosmo.anim.update(dt);
      this.cosmo.model.root.position.y = 1.5 + Math.sin(time * 1.6) * 0.25;
    }
  }

  pointer(info: PointerInfo) {
    if (info.type === "down") this.dragging = false;
    if (info.type === "move" && info.pointers > 0) {
      if (Math.abs(info.dx) + Math.abs(info.dy) > 1) { this.dragging = true; this.autoSpin = false; }
      this.yaw -= info.dx * 0.008;
      this.pitch = Math.max(-0.1, Math.min(0.75, this.pitch + info.dy * 0.004));
    }
    if (info.type === "up") window.setTimeout(() => { this.dragging = false; }, 50);
  }

  wheel(deltaY: number) {
    this.distance = Math.max(18, Math.min(80, this.distance + deltaY * 0.03));
  }
}

export const SANDBOX_DESTINATIONS = DESTINATIONS;
export { missionNeeds };
