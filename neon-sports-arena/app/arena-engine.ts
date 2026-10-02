/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Color3, Color4, Engine, Matrix, Mesh, MeshBuilder, ParticleSystem, StandardMaterial, type Texture, TrailMesh, TransformNode,
  UniversalCamera, Vector3,
} from "@babylonjs/core";
import type {ArenaMission, UpgradeKey} from "./arena-data";
import {ARENA_THEMES} from "./arena-themes";
import {
  type ArenaDims, clamp, dist2d, goalAim, GRAVITY, keeperTarget, leadTarget, ringCrossing, rng, solveBallistic,
  solveShot, stepBall, type V3,
} from "./arena-physics";
import {
  airPose, applyPose, blastPose, boostPose, buildAthlete, carryPose, celebratePose, dunkPose, idlePose, kickPose, mixPose,
  type Pose, type Rig, shootPose, skatePose, stunPose, tacklePose, throwPose,
} from "./athlete-rig";
import {ARENA, BLUEPRINT, BlueprintBuilder, type Tints} from "./blueprint-mesh";
import {cameraRelative, screenForwardZ} from "./movement-input";
import {arenaLights, arenaScene, autoQuality, postFx, type Quality, skyDome, sparkTexture, Synth} from "./scene-kit";
import {Stadium} from "./stadium";

type UpgradeState = Record<UpgradeKey, number>;
export type TeamStyle = {color: string; accent: string; name?: string};
export type CameraMode = "chase" | "broadcast" | "tactical";
export type EngineSettings = {camera: CameraMode; quality: Quality | "auto"; music: boolean; replays: boolean; sfx: boolean};
type Callbacks = {
  hud(value: any): void; message(text: string, kind: string): void;
  complete(value: any): void; fail(value: any): void; ready?(): void; camera?(mode: CameraMode): void;
};
type Team = "home" | "rival";
type Anim = "idle" | "skate" | "boost" | "kick" | "shoot" | "throw" | "blast" | "tackle" | "air" | "dunk" | "celebrate" | "stun" | "carry";
const ANIMS: Anim[] = ["idle", "skate", "boost", "kick", "shoot", "throw", "blast", "tackle", "air", "dunk", "celebrate", "stun", "carry"];
type Actor = {
  id: number; team: Team; role: "player" | "ally" | "rival"; rig: Rig; pos: Vector3; vel: Vector3; yaw: number; maxSpeed: number;
  stun: number; contact: number; tackleCd: number; shootCd: number; think: number; target: Vector3; wantShot: number;
  anim: Anim; animT: number; phase: number; vy: number; air: boolean; ring: Mesh; telegraph: number; lunge: number; lungeDir: Vector3;
  boost: number; pickupBlock: number; job: "chase" | "support" | "defend" | "mark" | "attack";
};
type Keeper = {node: TransformNode; side: Team; x: number; tx: number; speed: number; lineZ: number; end: 1 | -1; flash: number; dive: number};
type Target = {node: TransformNode; hp: number; maxHp: number; base: Vector3; drift: number; golden: boolean; spin: number};
type Pickup = {node: TransformNode; kind: "energy" | "shield" | "turbo"; active: boolean; respawn: number; base: Vector3};
type Frame = {ball: number[]; actors: number[]};
type Phase = "intro" | "kickoff" | "play" | "goal" | "replay" | "end";

const DIMS = ARENA as unknown as ArenaDims & typeof ARENA;
const HW = ARENA.pitchHalfWidth, HL = ARENA.pitchHalfLength;
const CHARGE_TIME = .8, PERFECT_LO = .76, PERFECT_HI = .95;
const ATHLETE_R = .45;
const hex = (h: string) => Color3.FromHexString(h);
const tintsOf = (team: TeamStyle): Tints => ({kitPrimary: team.accent, kitTrim: team.color});
const yawTo = (from: V3, to: V3) => Math.atan2(to.x - from.x, to.z - from.z);
const setV = (v: Vector3, o: V3) => v.set(o.x, o.y, o.z);
const angleDiff = (a: number, b: number) => {let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d};

export class ArenaEngine {
  engine: Engine; scene; camera: UniversalCamera; builder: BlueprintBuilder; stadium: Stadium; synth = new Synth();
  mission: ArenaMission; upgrades: UpgradeState; callbacks: Callbacks; settings: EngineSettings; quality: Quality;
  home: TeamStyle; rivalTeam: TeamStyle; theme; random: () => number;
  actors: Actor[] = []; player!: Actor; keepers: Keeper[] = []; targets: Target[] = []; pickups: Pickup[] = [];
  ballNode!: TransformNode; ballMeshes: Mesh[] = []; ballR: number;
  ball = {p: new Vector3(0, .4, 0), v: new Vector3(), spin: 0};
  carrier: Actor | null = null; lastTouch: Actor | null = null; lastPasser: Actor | null = null; passTime = -99; passTarget: Actor | null = null;
  shotPerfect = false; shotBy: Actor | null = null; shotTime = -99;
  phase: Phase = "intro"; phaseT = 0; slowmo = 1; paused = false;
  keys = new Set<string>(); touchX = 0; touchZ = 0; charging = false; chargeT = 0; actionHeld = false;
  camMode: CameraMode; camYaw = 0; orbitYaw = 0; orbitPitch = 0; orbitIdle = 0; shake = 0; fov = .95;
  score = 0; rival = 0; shield = 100; energy = 55; combo = 0; bestCombo = 0; timeLeft: number; elapsed = 0; matchTime = 0;
  boostClock = 0; tackleClock = 0; overdriveClock = 0; overdriveTime = 0; boostTime = 0; rivalClock = 6; jumpClock = 0;
  stats = {goals: 0, assists: 0, perfects: 0, dunks: 0, saves: 0, tackles: 0, passes: 0};
  finished = false; won = false; last = performance.now(); hudClock = 0; screenClock = 0; frames: Frame[] = []; frameClock = 0;
  replay: Frame[] = []; replayT = 0; banner = ""; bannerKind = ""; celebrant: Actor | null = null; kickoffTeam: Team = "home";
  root: HTMLElement | null; radar: HTMLCanvasElement | null; trail: TrailMesh | null = null; sparks!: Texture;
  bursts: ParticleSystem[] = []; burstIndex = 0; boostFx: ParticleSystem | null = null; rings: {mesh: Mesh; t: number}[] = [];
  aura: Mesh | null = null; aimLine: Mesh | null = null; bolts: {mesh: Mesh; from: Vector3; to: Vector3; t: number; target: Target}[] = [];
  gamepadPrev: boolean[] = []; lastPos = new Vector3(); kickoffLabel = "";

  constructor(canvas: HTMLCanvasElement, mission: ArenaMission, upgrades: UpgradeState, team: TeamStyle, callbacks: Callbacks,
              opts: {settings: EngineSettings; rivalTeam: TeamStyle; root?: HTMLElement | null; radar?: HTMLCanvasElement | null; seed?: number}) {
    this.mission = mission; this.upgrades = upgrades; this.home = team; this.callbacks = callbacks; this.settings = opts.settings;
    this.rivalTeam = opts.rivalTeam; this.root = opts.root ?? null; this.radar = opts.radar ?? null;
    this.random = rng(opts.seed ?? (Date.now() ^ mission.id * 7919));
    this.quality = opts.settings.quality === "auto" ? autoQuality() : opts.settings.quality;
    this.camMode = opts.settings.camera;
    this.timeLeft = mission.time;
    this.theme = ARENA_THEMES[mission.world];
    this.ballR = mission.mode === "hoops" ? ARENA.orbRadius : mission.mode === "capture" ? ARENA.coreRadius : ARENA.ballRadius;
    this.engine = new Engine(canvas, true, {antialias: this.quality === "high", powerPreference: "high-performance", stencil: true});
    this.engine.setHardwareScalingLevel(this.quality === "high" ? Math.max(1, window.devicePixelRatio / 1.5) : Math.max(1, window.devicePixelRatio / 2));
    this.scene = arenaScene(this.engine, this.theme, this.quality);
    this.builder = new BlueprintBuilder(this.scene, {arena: this.theme.accent});
    this.builder.quality = this.quality;
    const lights = arenaLights(this.scene, this.theme, this.quality);
    this.shadow = lights.shadow;
    this.camera = new UniversalCamera("broadcastCam", new Vector3(0, 30, -60), this.scene);
    this.camera.inputs.clear(); this.camera.minZ = .1; this.camera.maxZ = 2000; this.camera.fov = this.fov;
    this.sparks = sparkTexture(this.scene);
    skyDome(this.scene, this.theme, mission.id * 13);
    this.stadium = new Stadium(this.scene, this.builder, mission.world, mission.mode, this.theme,
      {home: tintsOf(team), rival: tintsOf(this.rivalTeam), accent: mission.color, homeColor: team.color, rivalColor: this.rivalTeam.color},
      this.quality, m => this.caster(m));
    postFx(this.scene, this.camera, this.theme, this.quality);
    this.createTeams();
    this.createBall();
    this.createKeepers();
    this.createPickups();
    if (mission.mode === "targets") this.fillTargets();
    this.createEffects();
    this.resetPositions("home");
    this.bind(canvas);
    this.stadium.screen([mission.name.toUpperCase(), `MATCH ${mission.id}`], mission.color, `${this.home.name ?? "HOME"} vs ${this.rivalTeam.name ?? "RIVALS"}`);
    this.synth.startCrowd(.25 + this.theme.crowd * .2);
    if (this.settings.music) this.synth.setMusic(true, this.theme.music);
    this.setPhase("intro");
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug")) (window as any).__nsa = this;
    let first = true;
    this.engine.runRenderLoop(() => {
      this.update();
      if (first) {first = false; this.callbacks.ready?.()}
    });
    window.addEventListener("resize", this.resize);
  }
  shadow: any;

  resize = () => this.engine.resize();
  noGlow(mesh: Mesh) {for (const layer of this.scene.effectLayers) (layer as any).addExcludedMesh?.(mesh)}
  caster(m: Mesh) {this.shadow?.addShadowCaster(m, false)}

  // ---------------------------------------------------------------- setup
  createTeams() {
    const ringMat = (hexColor: string, alpha = .8) => {
      const m = new StandardMaterial(`ring${hexColor}`, this.scene); m.diffuseColor = Color3.Black(); m.emissiveColor = hex(hexColor).scale(.75); m.alpha = alpha; m.disableLighting = true;
      return m;
    };
    const make = (team: Team, role: Actor["role"], index: number, style: TeamStyle, speed: number): Actor => {
      const rig = buildAthlete(this.scene, this.builder, `${role}${index}`, tintsOf(style));
      rig.meshes.forEach(m => this.caster(m));
      const ring = MeshBuilder.CreateTorus(`${role}${index}-ring`, {diameter: 1.15, thickness: .06, tessellation: 40}, this.scene);
      ring.material = ringMat(role === "player" ? "#d9ff4f" : style.color, role === "player" ? .9 : .5); ring.isPickable = false;
      this.noGlow(ring);
      return {id: this.actors.length, team, role, rig, pos: new Vector3(), vel: new Vector3(), yaw: team === "home" ? 0 : Math.PI, maxSpeed: speed,
        stun: 0, contact: 0, tackleCd: 0, shootCd: 0, think: 0, target: new Vector3(), wantShot: 0, anim: "idle", animT: 0, phase: this.random() * 6,
        vy: 0, air: false, ring, telegraph: 0, lunge: 0, lungeDir: new Vector3(), boost: 0, pickupBlock: 0, job: "support"};
    };
    this.player = make("home", "player", 0, this.home, 6.2 + this.upgrades.speed * .5);
    this.actors.push(this.player);
    for (let i = 0; i < this.mission.allies; i++) this.actors.push(make("home", "ally", i, this.home, 5.3 + this.mission.id * .03));
    for (let i = 0; i < this.mission.bots; i++) {
      const a = make("rival", "rival", i, this.rivalTeam, (3.7 + this.mission.id * .06 + i * .08) * (this.mission.championship ? 1.08 : 1));
      a.rig.root.scaling.setAll(.97 + (i % 3) * .025);
      this.actors.push(a);
    }
  }

  createBall() {
    const asset = this.mission.mode === "hoops" ? "gravity_orb" : this.mission.mode === "capture" ? "power_core" : "energy_ball";
    this.ballNode = new TransformNode("ball", this.scene);
    this.ballMeshes = this.builder.buildMerged(asset, this.ballNode, {arena: this.mission.color});
    this.ballMeshes.forEach(m => this.caster(m));
    if (this.mission.mode === "targets") {this.ballNode.setEnabled(false); return}
    const trailColor = this.mission.mode === "hoops" ? "#ffd447" : this.mission.mode === "capture" ? "#9b7cff" : "#49f4ff";
    this.trail = new TrailMesh("ballTrail", this.ballNode, this.scene, this.ballR * .45, 14, true);
    const tm = new StandardMaterial("trailMat", this.scene);
    tm.emissiveColor = hex(trailColor).scale(.7); tm.diffuseColor = Color3.Black(); tm.alpha = .22; tm.disableLighting = true; tm.backFaceCulling = false;
    this.trail.material = tm; this.trail.isPickable = false; this.noGlow(this.trail);
  }

  createKeepers() {
    if (this.mission.mode !== "goal" || !this.mission.keeper) {
      for (const s of this.stadium.structures) if (s.asset === "keeper_drone") s.node.setEnabled(false);
      return;
    }
    for (const side of ["rival", "home"] as Team[]) {
      const s = this.stadium.structure("keeper_drone", side); if (!s) continue;
      const end = side === "rival" ? 1 : -1;
      this.keepers.push({node: s.node, side, x: 0, tx: 0, end: end as 1 | -1, lineZ: end * (HL - .9), flash: 0, dive: 0,
        speed: side === "rival" ? 2.6 + this.mission.id * .09 : 3.4 + this.mission.id * .04});
    }
  }

  createPickups() {
    const entries = (BLUEPRINT.modes as any).pickups as {asset: "pickup_energy" | "pickup_shield" | "pickup_turbo"; position: number[]}[];
    for (const e of entries) {
      const node = new TransformNode(e.asset, this.scene);
      node.position = Vector3.FromArray(e.position);
      this.builder.buildMerged(e.asset, node, {});
      this.pickups.push({node, kind: e.asset.replace("pickup_", "") as Pickup["kind"], active: true, respawn: 0, base: node.position.clone()});
    }
  }

  createTarget(golden: boolean) {
    const node = new TransformNode(`target${this.targets.length}`, this.scene);
    const tints = golden ? {} : {};
    const meshes = this.builder.buildMerged("holo_target", node, tints);
    if (golden) for (const m of meshes) if (m.material && /magenta|cyan|lime/.test(m.name)) m.material = this.builder.material("gold");
    const base = new Vector3((this.random() - .5) * 24, 1.6 + this.random() * 3.2, 2 + this.random() * 19);
    node.position.copyFrom(base); node.rotation.y = Math.PI;
    const hp = (22 + this.mission.id * 2.2) * (golden ? 1.4 : 1);
    this.targets.push({node, hp, maxHp: hp, base, drift: this.random() < this.mission.targetMotion ? .6 + this.random() * .8 : 0, golden, spin: this.random() * 6});
    this.ring(base, golden ? "#ffd447" : "#ff55ad", 1.2);
  }

  fillTargets() {
    const remaining = this.mission.target - this.score - this.targets.length;
    const count = Math.min(6 - this.targets.length, remaining);
    for (let i = 0; i < count; i++) this.createTarget((this.score + this.targets.length + 1) % 5 === 0);
  }

  createEffects() {
    for (let i = 0; i < 7; i++) {
      const ps = new ParticleSystem(`burst${i}`, 260, this.scene);
      ps.particleTexture = this.sparks; ps.emitter = new Vector3(); ps.blendMode = ParticleSystem.BLENDMODE_ADD;
      ps.minSize = .08; ps.maxSize = .3; ps.minLifeTime = .25; ps.maxLifeTime = .8; ps.emitRate = 0; ps.manualEmitCount = 0;
      ps.minEmitPower = 3; ps.maxEmitPower = 9; ps.gravity = new Vector3(0, -9, 0); ps.updateSpeed = .016;
      ps.createSphereEmitter(.3); ps.start();
      this.bursts.push(ps);
    }
    const fx = new ParticleSystem("boostFx", 220, this.scene);
    fx.particleTexture = this.sparks; fx.emitter = new Vector3(); fx.blendMode = ParticleSystem.BLENDMODE_ADD;
    fx.minSize = .06; fx.maxSize = .18; fx.minLifeTime = .18; fx.maxLifeTime = .45; fx.emitRate = 0;
    fx.color1 = Color4.FromColor3(hex(this.home.color)); fx.color2 = new Color4(1, 1, 1, 1); fx.colorDead = new Color4(0, 0, 0, 0);
    fx.minEmitPower = .2; fx.maxEmitPower = .8; fx.gravity = new Vector3(0, .6, 0); fx.createSphereEmitter(.28);
    fx.start(); this.boostFx = fx;
    const aura = MeshBuilder.CreateTorus("overdriveAura", {diameter: 2.2, thickness: .12, tessellation: 48}, this.scene);
    const am = new StandardMaterial("auraMat", this.scene); am.emissiveColor = hex(this.home.color); am.diffuseColor = Color3.Black(); am.alpha = .7; am.disableLighting = true;
    aura.material = am; aura.isPickable = false; aura.setEnabled(false); this.aura = aura;
    const aim = MeshBuilder.CreateBox("aimLine", {width: .07, height: .02, depth: 1}, this.scene);
    const im = new StandardMaterial("aimMat", this.scene); im.emissiveColor = hex("#d9ff4f"); im.diffuseColor = Color3.Black(); im.alpha = .55; im.disableLighting = true;
    aim.material = im; aim.isPickable = false; aim.setEnabled(false); this.aimLine = aim; this.noGlow(aim);
  }

  burst(at: V3, color: string, count = 60, power = 7, gravity = -9, size = .25) {
    const ps = this.bursts[this.burstIndex++ % this.bursts.length];
    (ps.emitter as Vector3).set(at.x, at.y, at.z);
    const c = hex(color);
    ps.color1 = new Color4(c.r, c.g, c.b, 1); ps.color2 = new Color4(1, 1, 1, 1); ps.colorDead = new Color4(c.r * .2, c.g * .2, c.b * .2, 0);
    ps.minEmitPower = power * .4; ps.maxEmitPower = power; ps.gravity.y = gravity; ps.maxSize = size; ps.minSize = size * .3;
    ps.manualEmitCount = Math.round(count * (this.quality === "high" ? 1 : .55));
  }

  ring(at: V3, color: string, size = 1) {
    let slot = this.rings.find(r => r.t >= 1);
    if (!slot) {
      if (this.rings.length > 8) return;
      const mesh = MeshBuilder.CreateTorus("shockRing", {diameter: 1, thickness: .05, tessellation: 48}, this.scene);
      const m = new StandardMaterial("shockMat", this.scene); m.diffuseColor = Color3.Black(); m.disableLighting = true; mesh.material = m; mesh.isPickable = false;
      slot = {mesh, t: 1}; this.rings.push(slot); this.noGlow(mesh);
    }
    slot.t = 0; slot.mesh.position.set(at.x, Math.max(.05, at.y), at.z); slot.mesh.setEnabled(true);
    (slot.mesh.material as StandardMaterial).emissiveColor = hex(color).scale(.8);
    slot.mesh.metadata = size;
  }

  // ---------------------------------------------------------------- input
  bind(canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", this.keydown); window.addEventListener("keyup", this.keyup);
    canvas.addEventListener("pointerdown", this.pointerdown); window.addEventListener("pointerup", this.pointerup);
    canvas.addEventListener("pointermove", this.pointermove); canvas.addEventListener("contextmenu", this.noMenu);
    this.canvas = canvas;
  }
  canvas!: HTMLCanvasElement;
  noMenu = (e: Event) => e.preventDefault();
  keydown = (event: KeyboardEvent) => {
    if (event.repeat) {if (event.code === "Space") event.preventDefault(); return}
    this.keys.add(event.code);
    if (this.phase === "intro" || this.phase === "replay") {this.skip(); if (event.code === "Space") event.preventDefault(); return}
    if (event.code === "Space") {event.preventDefault(); this.actionDown()}
    if (event.code.startsWith("Shift")) this.boost();
    if (event.code === "KeyE") this.tackle();
    if (event.code === "KeyQ") this.overdrive();
    if (event.code === "KeyF") this.pass();
    if (event.code === "KeyC") this.jump();
    if (event.code === "KeyV") this.cycleCamera();
    if (event.code === "KeyP" || event.code === "Escape") this.setPaused(!this.paused);
    if (event.code.startsWith("Arrow")) event.preventDefault();
  };
  keyup = (event: KeyboardEvent) => {this.keys.delete(event.code); if (event.code === "Space") this.actionUp()};
  private dragging: {x: number; y: number; id: number} | null = null;
  pointerdown = (e: PointerEvent) => {
    if (e.pointerType === "touch") {this.dragging = {x: e.clientX, y: e.clientY, id: e.pointerId}; return}
    if (this.phase === "intro" || this.phase === "replay") {this.skip(); return}
    if (e.button === 0) this.actionDown();
    if (e.button === 2) this.pass();
    if (e.button === 1) this.dragging = {x: e.clientX, y: e.clientY, id: e.pointerId};
  };
  pointerup = (e: PointerEvent) => {
    if (this.dragging?.id === e.pointerId) {this.dragging = null; return}
    if (e.pointerType !== "touch" && e.button === 0) this.actionUp();
  };
  pointermove = (e: PointerEvent) => {
    if (this.dragging && this.dragging.id === e.pointerId) {
      this.orbitYaw = clamp(this.orbitYaw + (e.clientX - this.dragging.x) * .006, -1.2, 1.2);
      this.orbitPitch = clamp(this.orbitPitch + (e.clientY - this.dragging.y) * .004, -.35, .5);
      this.dragging.x = e.clientX; this.dragging.y = e.clientY; this.orbitIdle = 0;
    } else if (e.pointerType === "mouse" && (e.buttons & 4)) {
      this.orbitYaw = clamp(this.orbitYaw + e.movementX * .006, -1.2, 1.2); this.orbitIdle = 0;
    }
  };
  setMove(x: number, z: number) {this.touchX = x; this.touchZ = z}
  clearMove() {this.touchX = 0; this.touchZ = 0}
  look(dx: number, dy: number) {this.orbitYaw = clamp(this.orbitYaw + dx * .006, -1.2, 1.2); this.orbitPitch = clamp(this.orbitPitch + dy * .004, -.35, .5); this.orbitIdle = 0}
  setPaused(on: boolean) {
    if (this.finished) return;
    this.paused = on; this.synth.crowd(on ? .05 : .25);
    if (on) {this.charging = false; this.keys.clear()}
    this.pushHud(true);
  }
  cycleCamera() {
    const order: CameraMode[] = ["chase", "broadcast", "tactical"];
    this.camMode = order[(order.indexOf(this.camMode) + 1) % order.length];
    this.callbacks.message(`${this.camMode.toUpperCase()} CAMERA`, "info");
    this.callbacks.camera?.(this.camMode);
  }
  skip() {
    if (this.phase === "intro") this.setPhase("kickoff");
    else if (this.phase === "replay") this.endReplay();
  }

  pollGamepad() {
    const pads = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads && Array.from(pads).find(p => p && p.connected);
    if (!pad) return;
    const dead = (v: number) => (Math.abs(v) < .18 ? 0 : v);
    this.touchX = dead(pad.axes[0] ?? 0); this.touchZ = dead(pad.axes[1] ?? 0);
    const rx = dead(pad.axes[2] ?? 0), ry = dead(pad.axes[3] ?? 0);
    if (rx || ry) {this.orbitYaw = clamp(this.orbitYaw + rx * .05, -1.2, 1.2); this.orbitPitch = clamp(this.orbitPitch + ry * .03, -.35, .5); this.orbitIdle = 0}
    const b = pad.buttons.map(x => x.pressed);
    const edge = (i: number) => b[i] && !this.gamepadPrev[i];
    if (this.phase === "intro" || this.phase === "replay") {if (b.some((x, i) => x && !this.gamepadPrev[i])) this.skip()}
    else {
      if (edge(0)) this.actionDown(); if (!b[0] && this.gamepadPrev[0]) this.actionUp();
      if (edge(1)) this.tackle(); if (edge(2)) this.pass(); if (edge(3)) this.overdrive();
      if (edge(5) || edge(7)) this.boost(); if (edge(4) || edge(6)) this.jump(); if (edge(8)) this.cycleCamera(); if (edge(9)) this.setPaused(!this.paused);
    }
    this.gamepadPrev = b;
  }

  // ---------------------------------------------------------------- player actions
  canAct() {return this.phase === "play" && !this.paused && !this.finished && this.player.stun <= 0}

  actionDown() {
    this.actionHeld = true;
    if (!this.canAct()) return;
    if (this.mission.mode === "targets") {this.charging = true; this.chargeT = 0; return}
    if (this.carrier !== this.player) {
      // Grabbing a loose ball only collects it; a fresh press shoots.
      if (!this.carrier && dist2d(this.player.pos, this.ball.p) < 2.7 && this.ball.p.y < 2.2) {this.takeBall(this.player); this.message("SECURED", "good"); return}
      else if (this.player.air && this.mission.mode === "hoops" && this.carrier === null) {this.message("GET THE ORB FIRST", "warn"); return}
      else {this.message(this.carrier?.team === "home" ? "PRESS F TO CALL FOR THE BALL" : "SECURE THE BALL · TACKLE THE CARRIER", "warn"); return}
    }
    if (this.mission.mode === "hoops" && this.player.air && this.dunkReach()) {this.dunk(); return}
    this.charging = true; this.chargeT = 0;
  }

  actionUp() {
    this.actionHeld = false;
    if (!this.charging) return;
    this.charging = false;
    if (!this.canAct()) return;
    const power = clamp(this.chargeT / CHARGE_TIME, .3, 1);
    const ratio = this.chargeT / CHARGE_TIME;
    const perfect = ratio >= PERFECT_LO && ratio <= PERFECT_HI;
    if (this.mission.mode === "targets") {this.blast(power, perfect); return}
    if (this.carrier !== this.player) return;
    if (this.mission.mode === "hoops" && this.player.air && this.dunkReach()) {this.dunk(); return}
    if (perfect) {this.stats.perfects += 1; this.message("PERFECT RELEASE", "perfect"); this.ring(this.player.pos, "#d9ff4f", 1.6); this.synth.tone(1760, .18, .04, "sine", 1.5)}
    this.shoot(this.player, power, perfect ? 1 : .5 + power * .3, perfect);
  }

  /** Strike, gravity shot or throw for any athlete. quality 0..1 tightens accuracy. */
  shoot(actor: Actor, power: number, quality: number, perfect = false) {
    const mode = this.mission.mode, end = actor.team === "home" ? 1 : -1;
    const from = this.ball.p.clone();
    from.y = Math.max(from.y, this.ballR + .05);
    this.release(actor);
    this.shotBy = actor; this.shotPerfect = perfect; this.shotTime = this.elapsed;
    const err = () => (this.random() - .5) * 2;
    if (mode === "goal") {
      const aim = goalAim(actor.pos, actor.yaw, end * HL, ARENA.goalHalfWidth, this.ballR);
      const d = dist2d(from, {x: aim.x, y: 0, z: aim.z});
      const spread = (1 - quality) * (.5 + d * .055);
      const to = new Vector3(aim.x + err() * spread, clamp(.55 + power * 1.7 + err() * spread * .6, .45, 3.3), aim.z + end * .6);
      const speed = (17 + 13 * power + (actor.role === "player" ? this.upgrades.power * 1.1 : this.mission.id * .1)) * (perfect ? 1.22 : 1);
      setV(this.ball.v, solveShot(from, to, speed).velocity);
      this.animate(actor, "kick"); this.synth.kick(power);
      this.burst(from, actor.team === "home" ? this.home.color : this.rivalTeam.color, perfect ? 70 : 28, 5);
    } else if (mode === "hoops") {
      const hoop = this.hoopCentre(actor.team === "home" ? "rival" : "home");
      const d = Vector3.Distance(from, hoop);
      const t = clamp(.5 + d * .045, .55, 1.4);
      const pressure = this.actors.some(a => a.team !== actor.team && dist2d(a.pos, actor.pos) < 2.4) ? 1.45 : 1;
      const powerBias = actor.role === "player" ? 1 - this.upgrades.power * .07 : 1 - this.mission.id * .008;
      const spread = (.25 + d * .055) * (1.08 - quality) * pressure * powerBias;
      const sway = this.hoopSwayVelocity(actor.team === "home" ? "rival" : "home");
      const target = new Vector3(hoop.x + sway * t + err() * spread, hoop.y + err() * spread * .8, hoop.z);
      setV(this.ball.v, solveBallistic(from, target, t));
      this.animate(actor, "shoot"); this.synth.tone(520, .2, .03, "triangle", 1.8);
    } else {
      const mate = this.bestReceiver(actor, true);
      const dir = new Vector3(Math.sin(actor.yaw), 0, Math.cos(actor.yaw));
      const lead = mate ? leadTarget(from, mate.pos, mate.vel, 14).target : null;
      const goal = lead ? new Vector3(lead.x, lead.y, lead.z) : from.add(dir.scale(8 + 14 * power));
      goal.x = clamp(goal.x, -HW + 1, HW - 1); goal.z = clamp(goal.z, -HL + 1, HL - 1); goal.y = this.ballR;
      const t = .55 + dist2d(from, goal) * .025;
      setV(this.ball.v, solveBallistic(from, goal, t));
      if (mate) {this.passTarget = mate; this.lastPasser = actor; this.passTime = this.elapsed}
      this.animate(actor, "throw"); this.synth.tone(300, .15, .04, "triangle", 2);
    }
    actor.pickupBlock = .35;
    this.shake = Math.max(this.shake, .12 * power);
  }

  pass() {
    if (!this.canAct()) return;
    const allies = this.actors.filter(a => a.team === "home" && a !== this.player);
    if (!allies.length) {this.message("SOLO MATCH · NO TEAMMATES", "warn"); return}
    if (this.carrier && this.carrier.team === "home" && this.carrier !== this.player) {
      this.passTo(this.carrier, this.player); this.message("CALLED FOR THE BALL", "good"); return;
    }
    if (this.carrier !== this.player) {this.message("NO BALL TO PASS", "warn"); return}
    const mate = this.bestReceiver(this.player, false);
    if (!mate) {this.message("NO TEAMMATE OPEN", "warn"); return}
    this.passTo(this.player, mate);
  }

  passTo(from: Actor, to: Actor) {
    const start = this.ball.p.clone();
    const speed = this.mission.mode === "capture" ? 13 : 17;
    const lead = leadTarget(start, to.pos, to.vel, speed);
    const target = new Vector3(lead.target.x, this.ballR, lead.target.z);
    target.x = clamp(target.x, -HW + .8, HW - .8); target.z = clamp(target.z, -HL + .8, HL - .8);
    this.release(from);
    const lob = this.mission.mode !== "goal" || this.actors.some(a => a.team !== from.team && this.nearSegment(a.pos, start, target, 1.2));
    const t = lob ? .5 + dist2d(start, target) * .03 : Math.max(.15, dist2d(start, target) / speed);
    setV(this.ball.v, solveBallistic(start, target, t));
    this.passTarget = to; this.lastPasser = from; this.passTime = this.elapsed; from.pickupBlock = .35;
    this.animate(from, this.mission.mode === "capture" ? "throw" : this.mission.mode === "hoops" ? "shoot" : "kick");
    this.synth.kick(.35);
    if (from === this.player) this.stats.passes += 1;
  }

  nearSegment(p: V3, a: V3, b: V3, r: number) {
    const abx = b.x - a.x, abz = b.z - a.z, l2 = abx * abx + abz * abz || 1;
    const t = clamp(((p.x - a.x) * abx + (p.z - a.z) * abz) / l2, 0, 1);
    return Math.hypot(a.x + abx * t - p.x, a.z + abz * t - p.z) < r;
  }

  bestReceiver(from: Actor, forwardOnly: boolean) {
    let best: Actor | null = null, bestScore = -Infinity;
    const end = from.team === "home" ? 1 : -1;
    for (const a of this.actors) {
      if (a === from || a.team !== from.team || a.stun > 0) continue;
      const d = dist2d(a.pos, from.pos);
      if (d < 3 || d > 30) continue;
      const facing = Math.cos(angleDiff(yawTo(from.pos, a.pos), from.yaw));
      if (forwardOnly && facing < .5) continue;
      const open = Math.min(6, ...this.actors.filter(o => o.team !== from.team).map(o => dist2d(o.pos, a.pos)));
      const s = (a.pos.z - from.pos.z) * end * .12 + open * .45 - d * .04 + facing * 1.6;
      if (s > bestScore) {bestScore = s; best = a}
    }
    return best;
  }

  boost() {
    if (!this.canAct()) return;
    if (this.boostClock > 0 || this.energy < 18) {this.message(this.energy < 18 ? "ENERGY LOW" : "BOOST RECHARGING", "warn"); return}
    this.energy -= 18; this.boostClock = Math.max(1.8, 3.6 - this.upgrades.energy * .3); this.boostTime = .95;
    this.message("NOVA BOOST", "good"); this.synth.tone(180, .35, .05, "sawtooth", 3); this.fov = 1.12;
  }

  jump() {
    if (!this.canAct()) return;
    const p = this.player;
    if (p.air || this.jumpClock > 0) return;
    p.vy = 7.4 + this.upgrades.speed * .18; p.air = true; this.jumpClock = .45;
    this.synth.tone(330, .16, .03, "triangle", 1.7);
  }

  tackle() {
    if (!this.canAct()) return;
    if (this.tackleClock > 0) {this.message("TACKLE RECHARGING", "warn"); return}
    this.tackleClock = Math.max(1.3, 2.8 - this.upgrades.power * .22);
    const p = this.player, dir = new Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    // Lock on to the nearest rival in front so the charge connects.
    let mark: Actor | null = null, md = 7;
    for (const a of this.actors) if (a.team === "rival") {const d = dist2d(a.pos, p.pos); if (d < md && Math.cos(angleDiff(yawTo(p.pos, a.pos), p.yaw)) > .3) {md = d; mark = a}}
    if (mark) {p.yaw = yawTo(p.pos, mark.pos); dir.set(Math.sin(p.yaw), 0, Math.cos(p.yaw))}
    p.lunge = .3; p.lungeDir.copyFrom(dir); this.animate(p, "tackle");
    this.synth.noise(.18, .06, 900);
  }

  tackleHits(attacker: Actor) {
    let connected = false;
    for (const a of this.actors) {
      if (a.team === attacker.team || a.stun > 0) continue;
      if (dist2d(a.pos, attacker.pos) > 1.45) continue;
      a.stun = attacker.role === "player" ? 1.1 + this.upgrades.power * .13 : .9;
      const push = a.pos.subtract(attacker.pos); push.y = 0; push.normalize();
      a.vel.copyFrom(push.scale(7)); this.animate(a, "stun");
      if (this.carrier === a) {this.release(a); this.ball.v.set(push.x * 5 + attacker.lungeDir.x * 3, 2.5, push.z * 5 + attacker.lungeDir.z * 3)}
      connected = true;
      this.burst(a.pos.add(new Vector3(0, 1.1, 0)), attacker.team === "home" ? this.home.color : this.rivalTeam.color, 45, 6);
      this.ring(a.pos, "#ffffff", 1.4); this.shake = Math.max(this.shake, .25);
      if (attacker.role === "player") this.stats.tackles += 1;
    }
    if (connected) {attacker.lunge = 0; this.synth.noise(.25, .09, 1400); if (attacker.role === "player") this.message("CLEAN PULSE TACKLE", "good")}
    return connected;
  }

  overdrive() {
    if (!this.canAct()) return;
    if (this.energy < 100 || this.overdriveClock > 0) {this.message(this.energy < 100 ? "CHARGE ENERGY TO 100" : "OVERDRIVE RECHARGING", "warn"); return}
    this.energy = 0; this.overdriveTime = 7 + this.upgrades.energy * 1.2; this.overdriveClock = 12;
    for (const a of this.actors) if (a.team === "rival") {a.stun = Math.max(a.stun, 1.6); this.animate(a, "stun")}
    this.message("TEAM OVERDRIVE", "good"); this.burst(this.player.pos.add(new Vector3(0, 1, 0)), this.home.color, 120, 10, -2, .4);
    this.ring(this.player.pos, this.home.color, 6); this.synth.tone(110, .8, .06, "sawtooth", 4); this.stadium.cheer(.6);
  }

  blast(power: number, perfect: boolean) {
    const p = this.player;
    let best: Target | undefined, score = Infinity;
    for (const t of this.targets) {
      const d = Vector3.Distance(p.pos, t.node.position);
      if (d > 30) continue;
      const facing = Math.cos(angleDiff(yawTo(p.pos, t.node.position), p.yaw));
      const s = d * (1.6 - facing);
      if (s < score) {score = s; best = t}
    }
    if (!best) {this.message("MOVE CLOSER TO A TARGET", "warn"); return}
    p.yaw = yawTo(p.pos, best.node.position); this.animate(p, "blast");
    const from = p.pos.add(new Vector3(Math.sin(p.yaw) * .5 + Math.cos(p.yaw) * .32, 1.32, Math.cos(p.yaw) * .5 - Math.sin(p.yaw) * .32));
    const bolt = MeshBuilder.CreateSphere("bolt", {diameter: perfect ? .5 : power > .75 ? .42 : .3, segments: 8}, this.scene);
    const m = new StandardMaterial("boltMat", this.scene); m.emissiveColor = hex(perfect ? "#d9ff4f" : this.home.color); m.disableLighting = true; bolt.material = m;
    bolt.position.copyFrom(from);
    const damage = (18 + this.upgrades.power * 7) * (power > .75 ? 2.2 : 1) * (perfect ? 1.3 : 1);
    this.bolts.push({mesh: bolt, from, to: best.node.position.clone(), t: 0, target: best});
    bolt.metadata = damage;
    if (perfect) {this.stats.perfects += 1; this.message("PERFECT CHARGE", "perfect")}
    this.synth.tone(perfect ? 1500 : 980, .16, .04, "square", .4);
  }

  dunkReach() {
    const hoop = this.hoopCentre("rival");
    return Math.abs(this.player.pos.z - hoop.z) < 3.8 && Math.abs(this.player.pos.x - hoop.x) < 3 && this.player.pos.y > .9;
  }

  dunk() {
    const hoop = this.hoopCentre("rival"), p = this.player;
    this.release(p);
    this.ball.p.set(hoop.x, hoop.y + .3, hoop.z - .7); this.ball.v.set(0, -2, 7);
    this.shotBy = p; this.shotPerfect = true; this.shotTime = this.elapsed;
    this.animate(p, "dunk"); this.stats.dunks += 1;
    this.combo += 1; this.message("SLAM DUNK", "perfect"); this.shake = .35; this.synth.noise(.3, .1, 2500);
  }

  // ---------------------------------------------------------------- possession
  takeBall(actor: Actor) {
    if (this.mission.mode === "targets") return;
    const passer = this.lastPasser;
    this.carrier = actor; this.lastTouch = actor; this.ball.v.setAll(0);
    if (this.passTarget === actor && passer && passer.team === actor.team && passer !== actor) {/* completed pass */}
    else if (passer && passer.team !== actor.team) this.lastPasser = null;
    this.passTarget = null;
    if (actor.team === "home" && actor !== this.player && this.phase === "play" && actor.role === "ally") this.synth.beep();
  }

  release(actor: Actor) {
    if (this.carrier === actor) {
      this.carrier = null;
      const fwd = new Vector3(Math.sin(actor.yaw), 0, Math.cos(actor.yaw));
      this.ball.p.copyFrom(actor.pos.add(fwd.scale(.75)));
      this.ball.p.y = this.mission.mode === "capture" ? 1.1 : Math.max(this.ballR, this.ball.p.y);
      if (this.mission.mode === "capture") this.ball.p.y = actor.pos.y + 1.15;
    }
    this.lastTouch = actor;
  }

  // ---------------------------------------------------------------- scoring
  addScore(points: number, label: string, scorer: Actor | null, celebrate = true) {
    if (this.finished || this.phase !== "play") return;
    this.score = Math.min(this.mission.target, this.score + points);
    this.combo += 1; this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.energy = Math.min(100, this.energy + 18 + this.upgrades.energy * 2);
    if (scorer === this.player) this.stats.goals += 1;
    if (scorer && scorer !== this.player && scorer.team === "home" && this.lastPasser === this.player && this.elapsed - this.passTime < 6) this.stats.assists += 1;
    if (scorer === this.player && this.lastPasser && this.lastPasser.team === "home" && this.lastPasser !== this.player && this.elapsed - this.passTime < 6) label += " · ASSISTED";
    this.message(`${label} ×${this.combo}`, "good");
    this.banner = label.split(" ·")[0]; this.bannerKind = "home";
    this.stadium.cheer(1); this.synth.crowd(1, .2);
    if (this.mission.mode === "targets") {
      this.synth.tone(1320, .15, .04, "triangle", 1.3);
      if (this.score >= this.mission.target) this.win();
      return;
    }
    this.synth.horn();
    this.stadium.screen([label.split(" ·")[0], `${this.score} - ${this.rival}`], this.home.color, this.home.name?.toUpperCase());
    const at = this.ball.p.clone();
    this.burst(at, this.home.color, 160, 12, -6, .45); this.burst(at.add(new Vector3(0, 2, 0)), "#ffffff", 90, 9, -4, .3);
    this.ring(at, this.home.color, 8);
    this.celebrant = scorer ?? this.player; this.kickoffTeam = "rival";
    if (this.score >= this.mission.target) {this.win(); return}
    if (celebrate) this.setPhase("goal");
  }

  rivalScores(label = "RIVAL SCORES", scorer: Actor | null = null) {
    if (this.finished || this.phase !== "play") return;
    this.rival += 1; this.combo = 0;
    this.message(label, "warn"); this.banner = label.split(" ·")[0]; this.bannerKind = "rival"; this.synth.crowd(.12, .3); this.synth.tone(110, .6, .05, "sawtooth", .6);
    this.stadium.screen([label, `${this.score} - ${this.rival}`], this.rivalTeam.color, this.rivalTeam.name?.toUpperCase());
    if (this.rival >= this.mission.rivalTarget) {
      this.lose(this.mission.mode === "targets" ? "The rival squad cleared its targets first." : "The rival squad reached its score target first.");
      return;
    }
    if (this.mission.mode === "targets") return;
    this.celebrant = scorer; this.kickoffTeam = "home";
    this.burst(this.ball.p, this.rivalTeam.color, 90, 9);
    this.setPhase("goal");
  }

  win() {
    if (this.finished) return;
    this.finished = true; this.won = true; this.phase = "end"; this.phaseT = 0; this.celebrant = this.celebrant ?? this.player;
    this.synth.whistle(true); this.synth.horn(); this.stadium.cheer(1);
    this.stadium.screen(["VICTORY", `${this.score} - ${this.rival}`], this.home.color, this.home.name?.toUpperCase());
    this.message("FINAL WHISTLE · VICTORY", "good");
    window.setTimeout(() => this.callbacks.complete({score: this.score, rival: this.rival, time: Math.ceil(this.timeLeft), shield: Math.round(this.shield),
      combo: this.bestCombo, ...this.stats}), 3200);
  }

  lose(reason: string) {
    if (this.finished) return;
    this.finished = true; this.phase = "end"; this.phaseT = 0; this.celebrant = null;
    this.synth.whistle(true); this.synth.crowd(.08);
    this.stadium.screen(["FULL TIME", `${this.score} - ${this.rival}`], this.rivalTeam.color);
    window.setTimeout(() => this.callbacks.fail({score: this.score, rival: this.rival, reason, ...this.stats}), 1800);
  }

  setPhase(phase: Phase) {
    this.phase = phase; this.phaseT = 0;
    if (phase === "kickoff") {
      if (this.frames.length) this.resetPositions(this.kickoffTeam);
      this.kickoffLabel = "READY";
      this.stadium.screen([`${this.score} - ${this.rival}`, this.mission.mode === "targets" ? "BLITZ" : "KICKOFF"], this.mission.color);
    }
    if (phase === "play") {this.synth.whistle(); this.message("GO!", "good"); this.frames = []}
    if (phase === "goal") {this.slowmo = .3; this.charging = false}
  }

  endReplay() {this.replay = []; this.setPhase("kickoff")}

  resetPositions(kickoff: Team) {
    this.carrier = null; this.ball.v.setAll(0); this.ball.p.set(0, this.ballR, 0); this.passTarget = null; this.lastPasser = null;
    if (this.mission.mode === "capture") this.ball.p.y = .9;
    let hi = 0, ri = 0;
    for (const a of this.actors) {
      a.vel.setAll(0); a.stun = 0; a.vy = 0; a.air = false; a.lunge = 0; a.telegraph = 0; a.pos.y = 0;
      if (a.team === "home") {
        if (a === this.player) a.pos.set(0, 0, kickoff === "home" ? -1.4 : -7);
        else {const side = hi++ % 2 ? 1 : -1; a.pos.set(side * 7, 0, -7 - Math.floor(hi / 3) * 3)}
        a.yaw = 0;
      } else {
        const i = ri++;
        if (i === 0 && kickoff === "rival") a.pos.set(0, 0, 1.4);
        else a.pos.set(-9 + (i % 4) * 6, 0, 6 + Math.floor(i / 4) * 4.5);
        a.yaw = Math.PI;
      }
      this.placeRig(a, 1);
    }
    for (const k of this.keepers) {k.x = 0; k.tx = 0}
  }

  // ---------------------------------------------------------------- per-frame
  update() {
    const now = performance.now();
    const dt = Math.min(.05, (now - this.last) / 1000);
    this.last = now;
    this.pollGamepad();
    if (!this.paused) this.tick(dt);
    this.scene.render();
  }

  /** One simulation + presentation step (no rendering); also used by the test bot. */
  tick(raw: number) {
    this.slowmo += (1 - this.slowmo) * Math.min(1, raw * 1.6);
    if (this.phase === "goal" && this.phaseT < .5) this.slowmo = Math.min(this.slowmo, .35);
    const dt = raw * this.slowmo;
    this.elapsed += dt; this.phaseT += dt;
    switch (this.phase) {
      case "intro": if (this.phaseT > 3.4) this.setPhase("kickoff"); break;
      case "kickoff":
        this.kickoffLabel = this.phaseT < .55 ? "READY" : "GO";
        if (this.phaseT > 1.05) this.setPhase("play");
        break;
      case "goal":
        if (this.phaseT > 2.0) {
          if (this.settings.replays && this.kickoffTeam === "rival" && this.frames.length > 40 && this.mission.mode !== "targets") {
            this.replay = this.frames.slice(-96); this.replayT = 0; this.phase = "replay"; this.phaseT = 0;
          } else this.setPhase("kickoff");
        }
        break;
      case "replay":
        this.replayT += dt * .7;
        if (this.replayT * 30 >= this.replay.length - 1) this.endReplay();
        break;
    }
    if (this.phase === "replay") this.applyReplayFrame();
    else this.simulate(dt);
    this.updateCamera(dt);
    this.updateEffects(dt);
    this.stadium.update(dt, this.elapsed);
    this.hudClock -= dt;
    if (this.hudClock <= 0) {this.hudClock = 1 / 15; this.pushHud(false)}
    this.writeCssVars();
  }

  simulate(dt: number) {
    const live = this.phase === "play" && !this.finished;
    if (live) {
      this.timeLeft = Math.max(0, this.timeLeft - dt); this.matchTime += dt;
      this.boostClock -= dt; this.tackleClock -= dt; this.overdriveClock -= dt; this.overdriveTime -= dt; this.boostTime -= dt; this.jumpClock -= dt;
      this.energy = Math.min(100, this.energy + dt * (3.8 + this.upgrades.energy * .7));
      if (this.charging) this.chargeT += dt;
      if (this.timeLeft <= 0) this.lose("Arena time expired before the score target was reached.");
      if (Math.ceil(this.timeLeft) <= 10 && Math.ceil(this.timeLeft) !== Math.ceil(this.timeLeft + dt)) this.synth.beep(Math.ceil(this.timeLeft) <= 3);
      if (this.mission.mode === "targets") {
        this.rivalClock -= dt;
        if (this.rivalClock <= 0) {
          this.rivalClock = Math.max(3.8, 7.2 - this.mission.id * .09);
          this.rivalScores("RIVAL TARGET HIT");
        }
      }
    }
    for (const a of this.actors) {
      a.stun -= dt; a.contact -= dt; a.tackleCd -= dt; a.shootCd -= dt; a.pickupBlock -= dt; a.animT += dt;
      if (live) {
        if (a === this.player) this.drivePlayer(a, dt);
        else this.driveAI(a, dt);
      } else this.coast(a, dt);
      this.integrate(a, dt);
    }
    if (live) {this.separate(); this.contactDamage()}
    this.updateBall(dt, live);
    this.updateKeepers(dt, live);
    this.updateStructures(dt);
    this.updatePickups(dt, live);
    this.updateTargets(dt);
    for (const a of this.actors) this.placeRig(a, dt);
    if (live) {
      this.frameClock -= dt;
      if (this.frameClock <= 0) {this.frameClock = 1 / 30; this.record()}
    }
  }

  drivePlayer(p: Actor, dt: number) {
    const left = this.keys.has("KeyA") || this.keys.has("ArrowLeft"), right = this.keys.has("KeyD") || this.keys.has("ArrowRight");
    const up = this.keys.has("KeyW") || this.keys.has("ArrowUp"), down = this.keys.has("KeyS") || this.keys.has("ArrowDown");
    let mx = (right ? 1 : 0) - (left ? 1 : 0) + this.touchX;
    let mz = screenForwardZ(up, down, this.touchZ);
    const mag = Math.min(1, Math.hypot(mx, mz));
    if (mag > .01) {const k = mag / Math.hypot(mx, mz); mx *= k; mz *= k}
    const world = cameraRelative(mx, mz, this.camYaw);
    const boost = this.boostTime > 0 ? 1.55 : 1, over = this.overdriveTime > 0 ? 1.35 : 1;
    const carry = this.carrier === p && this.mission.mode === "capture" ? .9 : 1;
    const setShot = this.charging ? (this.mission.mode === "hoops" ? .45 : .78) : 1;
    const speed = p.maxSpeed * boost * over * carry * setShot;
    if (p.stun > 0) return;
    if (p.lunge > 0) {
      p.lunge -= dt; p.vel.x = p.lungeDir.x * 15; p.vel.z = p.lungeDir.z * 15; this.tackleHits(p);
      return;
    }
    const accel = p.air ? 2.2 : 9;
    p.vel.x += (world.x * speed - p.vel.x) * Math.min(1, accel * dt);
    p.vel.z += (world.z * speed - p.vel.z) * Math.min(1, accel * dt);
    // Face the aim while charging a goal shot so the strike goes where you look.
    if (this.charging && this.mission.mode === "goal" && mag < .2) p.yaw += angleDiff(yawTo(p.pos, {x: 0, y: 0, z: HL}), p.yaw) * Math.min(1, dt * 4);
    if (p.air === false && this.mission.mode === "hoops") this.checkLaunchPad(p);
  }

  checkLaunchPad(a: Actor) {
    for (const [x, z] of ARENA.launchPads as number[][]) {
      if (Math.hypot(a.pos.x - x, a.pos.z - z) < 1.15 && !a.air && a.team === "home") {
        const hoop = this.hoopCentre("rival");
        const land = new Vector3(hoop.x + (x > 0 ? 1.2 : -1.2), 0, hoop.z - 2.6);
        const t = 1.05;
        a.vy = 12.4; a.air = true;
        a.vel.set((land.x - a.pos.x) / t, 0, (land.z - a.pos.z) / t);
        this.burst(a.pos.add(new Vector3(0, .3, 0)), "#d9ff4f", 60, 8, -4); this.ring(a.pos, "#d9ff4f", 3);
        this.synth.tone(220, .5, .05, "sawtooth", 3.2);
        if (a === this.player) this.message(this.carrier === a ? "LAUNCHED · PRESS ACTION TO DUNK" : "LAUNCHED", "good");
      }
    }
  }

  coast(a: Actor, dt: number) {
    a.vel.x *= Math.exp(-6 * dt); a.vel.z *= Math.exp(-6 * dt);
    if (this.phase === "goal" || this.phase === "end") {
      const celebrating = (this.phase === "end" && this.won && a.team === "home") || a === this.celebrant;
      if (celebrating) this.animate(a, "celebrate");
    }
  }

  integrate(a: Actor, dt: number) {
    if (a.air) {
      a.vy -= GRAVITY * dt; a.pos.y += a.vy * dt;
      if (a.pos.y <= 0) {a.pos.y = 0; a.vy = 0; a.air = false; if (a === this.player) this.synth.tone(120, .08, .04, "triangle", .6)}
    }
    if (a.stun > 0 && !a.air) {a.vel.x *= Math.exp(-4 * dt); a.vel.z *= Math.exp(-4 * dt)}
    a.pos.x += a.vel.x * dt; a.pos.z += a.vel.z * dt;
    a.pos.x = clamp(a.pos.x, -HW + .5, HW - .5); a.pos.z = clamp(a.pos.z, -HL + .5, HL - .5);
    const speed = Math.hypot(a.vel.x, a.vel.z);
    if (speed > .6 && a.lunge <= 0 && a.stun <= 0 && !(this.charging && a === this.player && this.mission.mode === "goal")) {
      a.yaw += angleDiff(Math.atan2(a.vel.x, a.vel.z), a.yaw) * Math.min(1, dt * 11);
    }
    a.phase += speed * dt * 1.15;
  }

  separate() {
    for (let i = 0; i < this.actors.length; i++) for (let j = i + 1; j < this.actors.length; j++) {
      const a = this.actors[i], b = this.actors[j];
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz);
      if (d < ATHLETE_R * 2 && d > 1e-4) {
        const push = (ATHLETE_R * 2 - d) / 2, nx = dx / d, nz = dz / d;
        a.pos.x -= nx * push; a.pos.z -= nz * push; b.pos.x += nx * push; b.pos.z += nz * push;
      }
    }
  }

  contactDamage() {
    const p = this.player;
    for (const a of this.actors) {
      if (a.team !== "rival" || a.stun > 0 || a.contact > 0) continue;
      if (dist2d(a.pos, p.pos) < 1.0 && !p.air) {
        a.contact = 1.2;
        const reduction = 1 - this.upgrades.shield * .09;
        const lunging = a.lunge > 0;
        this.shield = Math.max(0, this.shield - (lunging ? 10 + this.mission.id * .35 : (10 + this.mission.id * .35) * .45) * reduction);
        if (this.carrier === p && lunging) {
          this.release(p); const knock = p.pos.subtract(a.pos).normalize(); this.ball.v.set(knock.x * 5.5, 2.4, knock.z * 5.5);
        }
        this.combo = 0; this.shake = Math.max(this.shake, lunging ? .32 : .14);
        this.message(lunging ? "TACKLED" : "RIVAL CONTACT", "warn"); this.synth.noise(.15, .07, 1100);
        if (lunging) {p.stun = .35; this.animate(p, "stun")}
      }
    }
    if (this.shield <= 0) {this.shield = 100; this.rivalScores("SHIELD BREAK · RIVAL POINT")}
  }

  // ---------------------------------------------------------------- AI
  driveAI(a: Actor, dt: number) {
    if (a.stun > 0) return;
    const mode = this.mission.mode;
    if (a.lunge > 0) {a.lunge -= dt; a.vel.x = a.lungeDir.x * 11; a.vel.z = a.lungeDir.z * 11; if (a.team === "home") this.tackleHits(a); return}
    if (a.telegraph > 0) {
      a.telegraph -= dt; a.vel.scaleInPlace(Math.exp(-8 * dt));
      if (a.telegraph <= 0) {
        const victim = this.carrier && this.carrier.team !== a.team ? this.carrier : this.player;
        a.lungeDir.copyFrom(victim.pos.subtract(a.pos)); a.lungeDir.y = 0; a.lungeDir.normalize(); a.lunge = .26; this.animate(a, "tackle");
        if (victim !== this.player && a.team === "rival") window.setTimeout(() => {if (dist2d(a.pos, victim.pos) < 1.3 && victim.stun <= 0) {
          victim.stun = .9; this.animate(victim, "stun"); if (this.carrier === victim) {this.release(victim); this.ball.v.set(a.lungeDir.x * 5, 2.4, a.lungeDir.z * 5)}}}, 180);
      }
      return;
    }
    a.think -= dt;
    if (a.think <= 0) {a.think = .12 + this.random() * .1; this.decide(a)}
    const slow = a.team === "rival" && this.overdriveTime > 0 ? .62 : 1;
    const to = a.target.subtract(a.pos); to.y = 0;
    const d = to.length();
    const want = d > .3 ? to.scale(Math.min(1, d / 2.2) / d) : Vector3.Zero();
    const speed = a.maxSpeed * slow * (this.carrier === a && mode === "capture" ? .88 : 1) * (a.boost > 0 ? 1.4 : 1);
    a.boost -= dt;
    a.vel.x += (want.x * speed - a.vel.x) * Math.min(1, 6 * dt);
    a.vel.z += (want.z * speed - a.vel.z) * Math.min(1, 6 * dt);
    if (mode === "targets") return;
    if (this.carrier === a) {
      if (a.wantShot > 0) {a.wantShot -= dt; if (a.wantShot <= 0) this.aiShoot(a)}
    }
  }

  decide(a: Actor) {
    const mode = this.mission.mode, end = a.team === "home" ? 1 : -1;
    const mates = this.actors.filter(o => o.team === a.team), foes = this.actors.filter(o => o.team !== a.team);
    if (mode === "targets") {
      // Rivals hassle the player; there is no ball.
      a.target.copyFrom(this.player.pos.add(new Vector3(Math.sin(this.elapsed + a.id) * 1.5, 0, Math.cos(this.elapsed + a.id) * 1.5)));
      if (dist2d(a.pos, this.player.pos) < 1.8 && a.tackleCd <= 0 && this.random() < .35) {a.tackleCd = 3.2; a.telegraph = .34; this.animate(a, "tackle")}
      return;
    }
    const ball = this.carrier ? this.carrier.pos : this.ball.p;
    if (this.carrier === a) {
      // Attack: drive at goal, swerve away from the nearest defender.
      const goal = this.attackTarget(a.team);
      const dir = goal.subtract(a.pos); dir.y = 0; dir.normalize();
      const threat = foes.reduce((best, f) => (dist2d(f.pos, a.pos) < dist2d(best.pos, a.pos) ? f : best), foes[0]);
      if (threat && dist2d(threat.pos, a.pos) < 4) {
        const away = a.pos.subtract(threat.pos); away.y = 0; away.normalize();
        dir.addInPlace(away.scale(.7)).normalize();
      }
      a.target.copyFrom(a.pos.add(dir.scale(5)));
      const range = mode === "goal" ? (a.team === "home" ? 13 : 12 - this.mission.id * .05) : mode === "hoops" ? 10.5 : 0;
      const dGoal = dist2d(a.pos, goal);
      if (range && dGoal < range && a.shootCd <= 0 && a.wantShot <= 0 && Math.abs(a.pos.x) < 11) {a.wantShot = .12 + this.random() * .25; a.shootCd = 1.4}
      const pressured = threat && dist2d(threat.pos, a.pos) < 2.2;
      if (pressured && this.random() < (a.team === "home" ? .35 : .2)) {
        const mate = a.team === "home" && this.player.stun <= 0 && dist2d(this.player.pos, a.pos) > 3 ? this.player : this.bestReceiver(a, false);
        if (mate) this.passTo(a, mate);
      }
      if (a.team === "rival" && this.random() < .02) a.boost = .6;
      return;
    }
    const ourBall = this.carrier?.team === a.team, theirBall = this.carrier && this.carrier.team !== a.team;
    const chasers = mates.filter(m => m !== this.player && m.role !== "player").sort((x, y) => dist2d(x.pos, ball) - dist2d(y.pos, ball));
    const rank = chasers.indexOf(a);
    if (this.passTarget === a) {a.target.copyFrom(this.ball.p.add(this.ball.v.scale(.25))); return}
    if (ourBall) {
      // Support run: ahead of the carrier in a passing lane.
      const lane = (a.id % 2 ? 1 : -1) * (5 + (a.id % 3));
      a.target.set(clamp(this.carrier!.pos.x * .4 + lane, -HW + 2, HW - 2), 0, clamp(this.carrier!.pos.z + end * 6, -HL + 3, HL - 3));
      return;
    }
    if (theirBall) {
      const carrier = this.carrier!;
      if (a.team === "rival" || rank === 0) {
        const press = rank <= (a.team === "rival" ? 1 : 0);
        if (press) {
          a.target.copyFrom(carrier.pos.add(carrier.vel.scale(.35)));
          if (dist2d(a.pos, carrier.pos) < 1.75 && a.tackleCd <= 0) {
            const aggression = a.team === "rival" ? .55 + this.mission.id * .01 : .5;
            a.tackleCd = a.team === "rival" ? 2.6 - this.mission.id * .03 : 2.4;
            if (this.random() < aggression) {a.telegraph = a.team === "rival" ? clamp(.42 - this.mission.id * .005, .26, .42) : .2; this.animate(a, "tackle")}
          }
          return;
        }
      }
      // Defend: sit between the carrier and our goal.
      const ownGoal = new Vector3(0, 0, -end * HL);
      a.target.copyFrom(Vector3.Lerp(carrier.pos, ownGoal, .45));
      a.target.x += (a.id % 2 ? 1.5 : -1.5);
      return;
    }
    // Loose ball: nearest teammates chase, others hold shape.
    const dPlayer = a.team === "home" ? dist2d(this.player.pos, this.ball.p) : Infinity;
    if ((a.team === "rival" && rank <= 1) || (a.team === "home" && rank === 0 && dist2d(a.pos, this.ball.p) < dPlayer - 1)) {
      a.target.copyFrom(this.ball.p.add(this.ball.v.scale(.3)));
    } else {
      const shape = a.team === "rival" ? (rank % 2 ? 1 : -1) * (4 + rank) : (a.id % 2 ? 1 : -1) * 6;
      a.target.set(clamp(this.ball.p.x * .5 + shape, -HW + 2, HW - 2), 0, clamp(this.ball.p.z - end * (3 + rank * 1.5), -HL + 3, HL - 3));
    }
  }

  attackTarget(team: Team) {
    const end = team === "home" ? 1 : -1, mode = this.mission.mode;
    if (mode === "hoops") {const h = this.hoopCentre(team === "home" ? "rival" : "home"); return new Vector3(h.x, 0, h.z - end * 6)}
    if (mode === "capture") return new Vector3(0, 0, end * ARENA.captureZ);
    return new Vector3(0, 0, end * HL);
  }

  aiShoot(a: Actor) {
    if (this.carrier !== a) return;
    const skill = a.team === "home" ? .62 : clamp(.42 + this.mission.id * .014, .42, .82);
    const goal = this.attackTarget(a.team);
    if (this.mission.mode === "goal") {
      a.yaw = yawTo(a.pos, goal) + (this.random() - .5) * .35;
      this.shoot(a, .6 + this.random() * .35, skill);
    } else if (this.mission.mode === "hoops") {
      a.yaw = yawTo(a.pos, this.hoopCentre(a.team === "home" ? "rival" : "home"));
      this.shoot(a, .8, skill);
    }
  }

  // ---------------------------------------------------------------- ball
  updateBall(dt: number, live: boolean) {
    if (this.mission.mode === "targets") return;
    const mode = this.mission.mode, b = this.ball;
    if (this.carrier) {
      const c = this.carrier, fwd = new Vector3(Math.sin(c.yaw), 0, Math.cos(c.yaw)), speed = Math.hypot(c.vel.x, c.vel.z);
      if (mode === "capture") {
        b.p.copyFrom(c.pos.add(fwd.scale(.42))); b.p.y = c.pos.y + 1.12;
      } else if (mode === "hoops") {
        const side = new Vector3(Math.cos(c.yaw), 0, -Math.sin(c.yaw));
        const bounce = Math.abs(Math.sin(this.elapsed * 7.5));
        b.p.copyFrom(c.pos.add(fwd.scale(.5)).add(side.scale(.38)));
        b.p.y = c.air ? c.pos.y + 1.6 : this.ballR + bounce * .75;
        if (!c.air && bounce < .08 && this.random() < .3) this.synth.tone(90, .05, .02, "sine", .7);
      } else {
        b.p.copyFrom(c.pos.add(fwd.scale(.78 + Math.min(.3, speed * .03)))); b.p.y = c.pos.y + this.ballR;
        b.spin += speed * dt / this.ballR;
      }
      b.v.copyFrom(c.vel);
      if (mode === "capture" && live) {
        const end = c.team === "home" ? 1 : -1;
        if (dist2d(c.pos, {x: 0, y: 0, z: end * ARENA.captureZ}) < ARENA.captureRadius) {
          this.shotBy = c; this.lastTouch = c;
          if (c.team === "home") this.addScore(1, "CORE CAPTURED", c); else this.rivalScores("RIVAL CAPTURE", c);
          return;
        }
      }
      // Walk-in goal: the dribbled ball crosses the line inside the mouth.
      if (mode === "goal" && live && Math.abs(b.p.z) > HL - .15 && Math.abs(b.p.x) < ARENA.goalHalfWidth - this.ballR) {
        this.shotBy = c; this.shotPerfect = false; this.lastTouch = c;
        if (b.p.z > 0 && c.team === "home") this.addScore(1, "WALK-IN GOAL", c);
        else if (b.p.z < 0 && c.team === "rival") this.rivalScores("RIVAL GOAL", c);
      }
    } else {
      const prev = b.p.clone();
      if (this.trail) this.trail.isVisible = Math.hypot(b.v.x, b.v.y, b.v.z) > 6;
      const events = stepBall(b as any, dt, DIMS, mode === "goal", mode === "capture" ? .4 : .12);
      for (const e of events) {
        if (e.type === "goal" && live) {
          if (e.end === 1) this.addScore(1, this.lastTouch?.team === "rival" ? "OWN GOAL" : this.shotPerfect ? "PERFECT GOAL" : "NEON GOAL", this.shotBy?.team === "home" ? this.shotBy : null);
          else this.rivalScores(this.lastTouch?.team === "home" ? "OWN GOAL · RIVAL POINT" : "RIVAL GOAL", this.shotBy?.team === "rival" ? this.shotBy : null);
          return;
        }
        if (e.type === "post") {this.synth.clang(); this.message("OFF THE POST", "warn"); this.ring(b.p, "#ffffff", 1)}
        if (e.type === "bounce" && e.speed > 3) this.synth.tone(80 + e.speed * 8, .06, .025, "sine", .7);
        if (e.type === "wall") this.synth.tone(140, .05, .02, "triangle");
      }
      if (mode === "goal" && this.phase === "goal") {
        // Ball settles in the net.
        if (Math.abs(b.p.z) > HL) {b.v.scaleInPlace(Math.exp(-6 * dt)); b.p.z = clamp(b.p.z, -HL - 2, HL + 2)}
      }
      if (mode === "hoops" && live) this.hoopPhysics(prev);
      if (mode === "capture" && live && b.p.y < .7 && Math.hypot(b.v.x, b.v.z) < 2 && this.lastTouch) {
        if (dist2d(b.p, {x: 0, y: 0, z: ARENA.captureZ}) < ARENA.captureRadius && this.lastTouch.team === "home") this.addScore(1, "CORE CAPTURED", this.lastTouch);
        else if (dist2d(b.p, {x: 0, y: 0, z: -ARENA.captureZ}) < ARENA.captureRadius && this.lastTouch.team === "rival") this.rivalScores("RIVAL CAPTURE", this.lastTouch);
      }
      if (live) this.loosePickup();
    }
    this.ballNode.position.copyFrom(b.p);
    if (mode === "capture") {this.ballNode.rotation.y += dt * 2.2; this.ballNode.rotation.x = Math.sin(this.elapsed * 1.7) * .25}
    else {
      const sp = Math.hypot(b.v.x, b.v.z);
      if (sp > .05) {this.ballNode.rotation.y = Math.atan2(b.v.x, b.v.z); this.ballNode.rotation.x = b.spin}
    }
  }

  loosePickup() {
    const b = this.ball;
    let best: Actor | null = null, bd = 1.05;
    for (const a of this.actors) {
      if (a.stun > 0 || a.pickupBlock > 0) continue;
      const reach = a.air ? 1.8 : 1.4;
      const d = dist2d(a.pos, b.p);
      if (d < bd && b.p.y < a.pos.y + reach + .3) {bd = d; best = a}
    }
    if (best) {
      // Keepers aside, a pass is easiest for its intended receiver to collect.
      this.takeBall(best);
      if (best === this.player) this.message(this.mission.mode === "capture" ? "CORE SECURED" : "BALL SECURED", "good");
    }
  }

  hoopCentre(side: "home" | "rival") {
    const s = this.stadium.structure("hoop_rig", side);
    const z = (side === "rival" ? 1 : -1) * ARENA.hoopZ;
    return new Vector3(s ? s.node.position.x : 0, ARENA.hoopCentreY + (s ? s.node.position.y : 0), z);
  }

  hoopSwayVelocity(side: "home" | "rival") {
    const sway = this.mission.hoopSway; if (!sway) return 0;
    const phase = side === "rival" ? 0 : 1.7;
    return Math.cos(this.elapsed * .55 + phase) * .55 * sway;
  }

  hoopPhysics(prev: Vector3) {
    const b = this.ball;
    for (const side of ["rival", "home"] as const) {
      const c = this.hoopCentre(side), end = side === "rival" ? 1 : -1;
      if (Math.sign(b.v.z) !== end) continue;
      const hit = ringCrossing(prev, b.p, c, ARENA.hoopScoreRadius, ARENA.hoopRimRadius);
      if (hit === "score") {
        this.synth.swish();
        if (side === "rival") this.addScore(1, this.stats.dunks && this.elapsed - this.shotTime < 1.2 && this.shotBy === this.player && this.shotPerfect && this.player.air ? "SLAM DUNK" : this.shotPerfect ? "PERFECT SWISH" : "GRAVITY HOOP", this.shotBy);
        else this.rivalScores("RIVAL HOOP", this.shotBy);
        return;
      }
      if (hit === "rim") {
        b.v.z = -b.v.z * .45; b.v.y = Math.abs(b.v.y) * .4 + 2; b.v.x += (b.p.x - c.x) * 1.5;
        this.synth.clang(); this.ring(b.p, this.mission.color, 1.2); this.message("RIM OUT", "warn");
      }
      // Backboard: glass hexagon 1.45 m behind the ring.
      const boardZ = c.z + end * 1.45;
      if ((prev.z - boardZ) * (b.p.z - boardZ) <= 0 && Math.abs(b.p.x - c.x) < 3.5 && b.p.y > 1.7 && b.p.y < 7.6) {
        b.p.z = boardZ - end * .05; b.v.z = -b.v.z * .55; this.synth.tone(260, .1, .03, "triangle");
      }
    }
  }

  // ---------------------------------------------------------------- keepers
  updateKeepers(dt: number, live: boolean) {
    for (const k of this.keepers) {
      const ball = {p: this.ball.p, v: this.ball.v};
      const react = k.side === "rival" ? Math.max(.12, .3 - this.mission.id * .006) : .22;
      const t = this.elapsed - this.shotTime < react ? {x: k.tx, urgent: false, y: 1.2} : keeperTarget(ball, k.lineZ, ARENA.goalHalfWidth, k.end);
      const shotTowardMe = Math.sign(this.ball.v.z) === k.end && this.carrier === null;
      const slow = shotTowardMe && this.shotPerfect && k.side === "rival" ? .55 : 1;
      k.tx += (t.x - k.tx) * Math.min(1, dt * (t.urgent ? 9 : 3));
      const step = clamp(k.tx - k.x, -k.speed * slow * dt * (t.urgent ? 1.5 : 1), k.speed * slow * dt * (t.urgent ? 1.5 : 1));
      k.x += step;
      k.dive += ((t.urgent ? clamp((t.x - k.x) * .5, -.5, .5) : 0) - k.dive) * Math.min(1, dt * 8);
      k.flash = Math.max(0, k.flash - dt * 2);
      k.node.position.set(k.x, 1.3 + Math.sin(this.elapsed * 2.6 + k.end) * .08 + (t.urgent ? clamp(t.y - 1.2, -.4, .9) * .5 : 0), k.lineZ);
      k.node.rotation.z = -k.dive * k.end;
      k.node.scaling.setAll(1 + k.flash * .12);
      if (!live || this.carrier) continue;
      // Save: the ball crosses the keeper's plane within reach of the paddles.
      const b = this.ball;
      const prevZ = b.p.z - b.v.z * dt;
      const crossed = Math.sign(b.v.z) === k.end && (prevZ - k.lineZ) * (b.p.z - k.lineZ) <= 0;
      if (crossed && Math.abs(b.p.x - k.x) < 1.35 + this.ballR * .5 && b.p.y < 2.3) {
        b.v.z = -b.v.z * .42; b.v.x += (b.p.x - k.x) * 2.4 + (this.random() - .5) * 3; b.v.y = 3.2 + this.random() * 2;
        b.p.z = k.lineZ - k.end * .6; k.flash = 1;
        this.lastTouch = null; this.shotPerfect = false;
        this.synth.clang(); this.ring(b.p, k.side === "rival" ? this.rivalTeam.color : this.home.color, 2); this.burst(b.p, "#ffffff", 50, 6);
        if (k.side === "rival") {this.message("SAVED BY THE KEEPER", "warn"); this.combo = 0} else {this.message("HOME KEEPER SAVE", "good"); this.stats.saves += 1}
        this.shake = Math.max(this.shake, .18);
      }
    }
  }

  updateStructures(dt: number) {
    const mode = this.mission.mode;
    for (const s of this.stadium.structures) {
      if (mode === "hoops" && s.asset === "hoop_rig") {
        const phase = s.side === "rival" ? 0 : 1.7;
        s.node.position.x = s.base.x + Math.sin(this.elapsed * .55 + phase) * this.mission.hoopSway;
        if (this.mission.world >= 4) s.node.position.y = Math.sin(this.elapsed * .4 + phase) * .45;
      }
      if (s.asset === "capture_zone" || s.asset === "launch_pad") s.node.rotation.y += dt * .2;
    }
  }

  // ---------------------------------------------------------------- pickups & targets
  updatePickups(dt: number, live: boolean) {
    for (const p of this.pickups) {
      if (!p.active) {
        p.respawn -= dt;
        if (p.respawn <= 0) {p.active = true; p.node.setEnabled(true); this.ring(p.base, "#ffffff", 1)}
        continue;
      }
      p.node.rotation.y += dt * 2.4; p.node.position.y = p.base.y + Math.sin(this.elapsed * 2.2 + p.base.x) * .12;
      if (!live) continue;
      if (dist2d(p.node.position, this.player.pos) < 1.3) {
        p.active = false; p.respawn = 8; p.node.setEnabled(false);
        if (p.kind === "energy") this.energy = Math.min(100, this.energy + 36);
        if (p.kind === "shield") this.shield = Math.min(100, this.shield + 34);
        if (p.kind === "turbo") this.overdriveTime = Math.max(this.overdriveTime, 2.6);
        const color = p.kind === "energy" ? "#d9ff4f" : p.kind === "shield" ? "#49f4ff" : "#ff55ad";
        this.burst(p.node.position, color, 50, 5, -3); this.ring(p.base, color, 2);
        this.message(`${p.kind.toUpperCase()} PICKUP`, "good"); this.synth.tone(880, .1, .04, "triangle", 2);
      }
    }
  }

  updateTargets(dt: number) {
    for (const t of this.targets) {
      t.spin += dt;
      t.node.rotation.z += dt * (t.golden ? 2 : .8);
      if (t.drift) {
        t.node.position.x = clamp(t.base.x + Math.sin(this.elapsed * t.drift + t.spin * .1) * 5, -HW + 2, HW - 2);
        t.node.position.y = t.base.y + Math.sin(this.elapsed * t.drift * 1.3) * .8;
      } else t.node.position.y = t.base.y + Math.sin(this.elapsed * 1.6 + t.base.x) * .15;
      const hurt = 1 - t.hp / t.maxHp;
      t.node.scaling.setAll(1 - hurt * .25);
    }
    for (const bolt of [...this.bolts]) {
      bolt.t += dt / .14;
      bolt.mesh.position.copyFrom(Vector3.Lerp(bolt.from, bolt.target.node.position, Math.min(1, bolt.t)));
      if (bolt.t >= 1) {
        const damage = Number(bolt.mesh.metadata) || 0;
        bolt.mesh.dispose(); this.bolts.splice(this.bolts.indexOf(bolt), 1);
        const t = bolt.target; if (!this.targets.includes(t)) continue;
        t.hp -= damage;
        this.burst(t.node.position, t.golden ? "#ffd447" : "#ff55ad", 30, 5, -4);
        if (t.hp <= 0) {
          this.burst(t.node.position, "#ffffff", 80, 9, -6, .35); this.ring(t.node.position, t.golden ? "#ffd447" : this.mission.color, 3);
          t.node.dispose(); this.targets.splice(this.targets.indexOf(t), 1);
          this.addScore(t.golden ? 2 : 1, t.golden ? "GOLDEN TARGET" : "TARGET SHATTERED", this.player);
          this.fillTargets();
        } else this.synth.tone(600, .06, .03, "square");
      }
    }
  }

  // ---------------------------------------------------------------- animation
  animate(a: Actor, anim: Anim) {a.anim = anim; a.animT = 0}

  poseFor(a: Actor): Pose {
    const speed = Math.hypot(a.vel.x, a.vel.z), s01 = clamp(speed / 7, 0, 1);
    const oneShot: Partial<Record<Anim, number>> = {kick: .55, shoot: .6, throw: .55, blast: .3, tackle: .45, dunk: .7};
    if (a.anim in oneShot && a.animT > (oneShot[a.anim] ?? 0) && a.telegraph <= 0 && a.lunge <= 0) a.anim = "idle";
    if (a.anim === "stun" && a.stun <= 0) a.anim = "idle";
    switch (a.anim) {
      case "kick": return kickPose(a.animT / .55);
      case "shoot": return shootPose(a.animT / .6);
      case "throw": return throwPose(a.animT / .55);
      case "blast": return blastPose(a.animT / .3);
      case "tackle": return tacklePose(a.animT);
      case "dunk": return dunkPose(a.animT / .7);
      case "celebrate": return celebratePose(a.animT);
      case "stun": return stunPose(a.animT);
      default: break;
    }
    if (a.air) return airPose(a.vy);
    if (a === this.player && this.charging && this.mission.mode !== "targets") {
      const k = clamp(this.chargeT / CHARGE_TIME, 0, 1);
      if (this.mission.mode === "goal") return mixPose(skatePose(a.phase, s01), kickPose(.22), k * .9);
      if (this.mission.mode === "hoops") return mixPose(skatePose(a.phase, s01), shootPose(.3), k);
      return mixPose(carryPose(a.phase, s01), throwPose(.3), k);
    }
    if (this.carrier === a && this.mission.mode === "capture") return speed > .4 ? carryPose(a.phase, s01) : mixPose(idlePose(this.elapsed), carryPose(0, 0), .8);
    if ((a === this.player && this.boostTime > 0) || a.boost > 0) return boostPose(this.elapsed);
    if (speed > .45) return skatePose(a.phase, s01);
    return idlePose(this.elapsed + a.id);
  }

  placeRig(a: Actor, dt: number) {
    const r = a.rig.root;
    r.position.set(a.pos.x, a.pos.y + .015 + Math.sin(this.elapsed * 5 + a.id) * .012, a.pos.z);
    r.rotation.y = a.yaw;
    const speed = Math.hypot(a.vel.x, a.vel.z);
    // Lean into turns and acceleration like a skater.
    r.rotation.z = clamp(-angleDiff(Math.atan2(a.vel.x, a.vel.z), a.yaw) * speed * .02, -.18, .18);
    applyPose(a.rig, this.poseFor(a), Math.min(1, dt * 14));
    a.ring.position.set(a.pos.x, .03, a.pos.z);
    const hasBall = this.carrier === a;
    a.ring.scaling.setAll(hasBall ? 1.25 + Math.sin(this.elapsed * 8) * .06 : a.telegraph > 0 ? 1.4 + Math.sin(this.elapsed * 30) * .15 : 1);
    (a.ring.material as StandardMaterial).emissiveColor = a.telegraph > 0 ? hex("#ff4969") : hasBall ? hex("#ffffff")
      : hex(a.role === "player" ? "#d9ff4f" : a.team === "home" ? this.home.color : this.rivalTeam.color);
  }

  // ---------------------------------------------------------------- replay
  record() {
    const actors: number[] = [];
    for (const a of this.actors) actors.push(a.pos.x, a.pos.y, a.pos.z, a.yaw, ANIMS.indexOf(a.anim), a.animT, a.phase, Math.hypot(a.vel.x, a.vel.z), a.vy, this.carrier === a ? 1 : 0);
    this.frames.push({ball: [this.ball.p.x, this.ball.p.y, this.ball.p.z, this.ball.spin], actors});
    if (this.frames.length > 150) this.frames.shift();
  }

  applyReplayFrame() {
    const f = this.replayT * 30, i = Math.min(this.replay.length - 2, Math.floor(f)), k = f - i;
    const A = this.replay[i], B = this.replay[i + 1];
    if (!A || !B) return;
    const lerp = (x: number, y: number) => x + (y - x) * k;
    this.ball.p.set(lerp(A.ball[0], B.ball[0]), lerp(A.ball[1], B.ball[1]), lerp(A.ball[2], B.ball[2]));
    this.ballNode.position.copyFrom(this.ball.p); this.ballNode.rotation.x = A.ball[3];
    this.actors.forEach((a, j) => {
      const o = j * 10;
      a.pos.set(lerp(A.actors[o], B.actors[o]), lerp(A.actors[o + 1], B.actors[o + 1]), lerp(A.actors[o + 2], B.actors[o + 2]));
      a.yaw = A.actors[o + 3] + angleDiff(B.actors[o + 3], A.actors[o + 3]) * k;
      a.anim = ANIMS[A.actors[o + 4]] ?? "idle"; a.animT = lerp(A.actors[o + 5], B.actors[o + 5]); a.phase = lerp(A.actors[o + 6], B.actors[o + 6]);
      const sp = A.actors[o + 7]; a.vel.set(Math.sin(a.yaw) * sp, 0, Math.cos(a.yaw) * sp); a.vy = A.actors[o + 8]; a.air = a.pos.y > .02;
      this.placeRig(a, 1);
    });
  }

  // ---------------------------------------------------------------- camera
  updateCamera(dt: number) {
    const p = this.player, cam = this.camera;
    let pos: Vector3, look: Vector3;
    this.orbitIdle += dt;
    if (this.orbitIdle > 1.6) {this.orbitYaw *= Math.exp(-2.2 * dt); this.orbitPitch *= Math.exp(-2.2 * dt)}
    const t = this.elapsed;
    if (this.phase === "intro") {
      const k = clamp(this.phaseT / 3.4, 0, 1), e = k * k * (3 - 2 * k);
      const ang = -2.4 + e * 2.4;
      pos = new Vector3(Math.sin(ang) * (62 - e * 40), 34 - e * 26, Math.cos(ang) * (62 - e * 40) * -1);
      look = new Vector3(0, 2, 4 * e);
    } else if (this.phase === "goal" || (this.phase === "end" && this.won)) {
      const focus = (this.celebrant ?? p).pos;
      const ang = t * .6;
      pos = focus.add(new Vector3(Math.sin(ang) * 6.5, 2.6, Math.cos(ang) * 6.5));
      look = focus.add(new Vector3(0, 1.3, 0));
    } else if (this.phase === "replay") {
      const goalZ = this.mission.mode === "goal" ? HL : this.mission.mode === "hoops" ? ARENA.hoopZ : ARENA.captureZ;
      pos = new Vector3(this.ball.p.x * .5 + 9, 3.2, goalZ - 9);
      look = this.ball.p.clone();
    } else {
      const s = this.camMode;
      const dist = s === "chase" ? 8.6 : s === "broadcast" ? 19 : 4;
      const height = s === "chase" ? 4.3 : s === "broadcast" ? 14.5 : 30;
      this.camYaw += (this.orbitYaw + (s === "tactical" ? 0 : -p.pos.x * .008) - this.camYaw) * Math.min(1, dt * 4);
      const focus = s === "broadcast" ? Vector3.Lerp(p.pos, this.mission.mode === "targets" ? p.pos : this.ball.p, .35) : p.pos;
      const yaw = this.camYaw, pitchUp = this.orbitPitch;
      pos = new Vector3(focus.x - Math.sin(yaw) * dist, height + pitchUp * 6 + p.pos.y * .5, focus.z - Math.cos(yaw) * dist);
      if (s === "tactical") pos = new Vector3(focus.x * .7, height, focus.z - 9);
      look = focus.add(new Vector3(Math.sin(yaw) * (s === "chase" ? 4.5 : 3), s === "chase" ? 1.1 + p.pos.y * .6 : 0, Math.cos(yaw) * (s === "chase" ? 4.5 : 3)));
      if (s === "chase" && this.mission.mode !== "targets" && !this.carrier) look = Vector3.Lerp(look, this.ball.p, .22);
    }
    pos.y = Math.max(1.2, pos.y);
    const smooth = this.phase === "play" || this.phase === "kickoff" ? Math.min(1, dt * 6.5) : Math.min(1, dt * 3.5);
    if (this.phase === "intro" || this.phase === "replay") cam.position.copyFrom(pos); else cam.position = Vector3.Lerp(cam.position, pos, smooth);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.5);
      cam.position.addInPlace(new Vector3((this.random() - .5) * this.shake, (this.random() - .5) * this.shake, (this.random() - .5) * this.shake));
    }
    this.camLook = this.camLook ? Vector3.Lerp(this.camLook, look, this.phase === "intro" || this.phase === "replay" ? 1 : Math.min(1, dt * 8)) : look;
    cam.setTarget(this.camLook);
    const targetFov = this.boostTime > 0 ? 1.1 : this.overdriveTime > 0 ? 1.02 : this.phase === "replay" ? .7 : .95;
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 3); cam.fov = this.fov;
  }
  camLook: Vector3 | null = null;

  updateEffects(dt: number) {
    for (const r of this.rings) {
      if (r.t >= 1) continue;
      r.t = Math.min(1, r.t + dt * 1.6);
      const size = (r.mesh.metadata as number) || 1;
      r.mesh.scaling.setAll(.6 + r.t * 2.4 * size);
      (r.mesh.material as StandardMaterial).alpha = (1 - r.t) * .85;
      if (r.t >= 1) r.mesh.setEnabled(false);
    }
    if (this.boostFx) {
      this.boostFx.emitRate = this.boostTime > 0 || this.overdriveTime > 0 ? 170 : 0;
      (this.boostFx.emitter as Vector3).set(this.player.pos.x, this.player.pos.y + .25, this.player.pos.z);
    }
    if (this.aura) {
      const on = this.overdriveTime > 0;
      this.aura.setEnabled(on);
      if (on) {this.aura.position.set(this.player.pos.x, .2 + Math.sin(this.elapsed * 6) * .1, this.player.pos.z); this.aura.rotation.y += dt * 3}
    }
    if (this.aimLine) {
      const show = this.charging && this.mission.mode !== "targets" && this.carrier === this.player;
      this.aimLine.setEnabled(show);
      if (show) {
        const k = clamp(this.chargeT / CHARGE_TIME, 0, 1), len = 3 + k * 7, p = this.player;
        const aimYaw = this.mission.mode === "hoops" ? yawTo(p.pos, this.hoopCentre("rival")) : p.yaw;
        this.aimLine.scaling.z = len; this.aimLine.rotation.y = aimYaw;
        this.aimLine.position.set(p.pos.x + Math.sin(aimYaw) * len / 2, .06, p.pos.z + Math.cos(aimYaw) * len / 2);
        const ratio = this.chargeT / CHARGE_TIME;
        (this.aimLine.material as StandardMaterial).emissiveColor = ratio >= PERFECT_LO && ratio <= PERFECT_HI ? hex("#d9ff4f") : ratio > PERFECT_HI ? hex("#ff4969") : hex("#ffffff");
      }
    }
    if (this.phase === "end" && this.won && this.phaseT > .2 && this.random() < dt * 4) {
      const at = new Vector3((this.random() - .5) * 40, 14 + this.random() * 12, (this.random() - .2) * 40);
      this.burst(at, ["#49f4ff", "#ff55ad", "#d9ff4f", "#ffe45c", this.home.color][Math.floor(this.random() * 5)], 140, 11, -3, .4);
      this.synth.noise(.4, .05, 1200);
    }
    // Crowd noise follows the attack.
    if (this.phase === "play" && this.mission.mode !== "targets") {
      const threat = this.ball.p.z > HL * .45 ? .55 : this.ball.p.z < -HL * .45 ? .4 : .25;
      if (Math.abs(threat - this.synth.crowdLevel) > .1) this.synth.crowd(threat, 1.2);
    }
  }

  // ---------------------------------------------------------------- HUD
  message(text: string, kind: string) {this.callbacks.message(text, kind)}

  pushHud(force: boolean) {
    void force;
    const mates = this.actors.filter(a => a.team === "home" && a !== this.player).length;
    this.callbacks.hud({
      score: this.score, rival: this.rival, target: this.mission.target, rivalTarget: this.mission.rivalTarget,
      time: Math.ceil(this.timeLeft), shield: Math.round(this.shield), energy: Math.round(this.energy), combo: this.combo,
      boost: Math.max(0, this.boostClock), tackle: Math.max(0, this.tackleClock), overdrive: Math.max(0, this.overdriveClock),
      possession: this.carrier === this.player, teamBall: this.carrier?.team === "home", rivalBall: this.carrier?.team === "rival",
      phase: this.phase, kickoff: this.kickoffLabel, banner: this.banner, bannerKind: this.bannerKind, paused: this.paused, camera: this.camMode, mates, air: this.player.air,
      overdriveReady: this.energy >= 100 && this.overdriveClock <= 0, dunk: this.mission.mode === "hoops" && this.player.air && this.carrier === this.player && this.dunkReach(),
    });
  }

  writeCssVars() {
    const root = this.root; if (!root) return;
    const ratio = this.charging ? clamp(this.chargeT / CHARGE_TIME, 0, 1.2) : 0;
    root.style.setProperty("--charge", ratio.toFixed(3));
    root.style.setProperty("--charging", this.charging ? "1" : "0");
    // Off-screen ball indicator.
    if (this.mission.mode !== "targets" && this.phase === "play") {
      const w = this.engine.getRenderWidth(), h = this.engine.getRenderHeight();
      const proj = Vector3.Project(this.ball.p, Matrix.IdentityReadOnly, this.scene.getTransformMatrix(), this.camera.viewport.toGlobal(w, h));
      const fwd = this.camera.getForwardRay(1).direction, toBall = this.ball.p.subtract(this.camera.position);
      const behind = Vector3.Dot(fwd, toBall) < 0;
      const off = behind || proj.x < 0 || proj.x > w || proj.y < 0 || proj.y > h;
      root.style.setProperty("--ball-off", off && !this.carrier ? "1" : "0");
      if (off) {
        let x = proj.x / w - .5, y = proj.y / h - .5; if (behind) {x = -x; y = Math.abs(y) + .5}
        const a = Math.atan2(y, x), r = .42;
        root.style.setProperty("--ball-x", `${(50 + Math.cos(a) * r * 100).toFixed(1)}%`);
        root.style.setProperty("--ball-y", `${(50 + Math.sin(a) * r * 100).toFixed(1)}%`);
        root.style.setProperty("--ball-angle", `${a.toFixed(3)}rad`);
      }
    }
    this.drawRadar();
  }

  drawRadar() {
    const c = this.radar; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const W = c.width, H = c.height, sx = W / (HW * 2 + 2), sz = H / (HL * 2 + 2);
    const X = (x: number) => W / 2 + x * sx, Z = (z: number) => H / 2 - z * sz;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(6,8,25,.72)"; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(73,244,255,.5)"; ctx.lineWidth = 1; ctx.strokeRect(X(-HW), Z(HL), HW * 2 * sx, HL * 2 * sz);
    ctx.beginPath(); ctx.moveTo(X(-HW), Z(0)); ctx.lineTo(X(HW), Z(0)); ctx.stroke();
    ctx.beginPath(); ctx.arc(X(0), Z(0), 4.5 * sx, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = this.mission.color; ctx.fillRect(X(-ARENA.goalHalfWidth), Z(HL) - 2, ARENA.goalHalfWidth * 2 * sx, 3);
    ctx.fillStyle = this.home.color; ctx.fillRect(X(-ARENA.goalHalfWidth), Z(-HL) - 1, ARENA.goalHalfWidth * 2 * sx, 3);
    for (const t of this.targets) {ctx.fillStyle = t.golden ? "#ffd447" : "#ff55ad"; ctx.fillRect(X(t.node.position.x) - 2, Z(t.node.position.z) - 2, 4, 4)}
    for (const a of this.actors) {
      ctx.fillStyle = a.role === "player" ? "#d9ff4f" : a.team === "home" ? this.home.color : this.rivalTeam.color;
      ctx.beginPath(); ctx.arc(X(a.pos.x), Z(a.pos.z), a.role === "player" ? 4 : 3, 0, Math.PI * 2); ctx.fill();
      if (a.role === "player") {ctx.strokeStyle = "#d9ff4f"; ctx.beginPath(); ctx.moveTo(X(a.pos.x), Z(a.pos.z)); ctx.lineTo(X(a.pos.x + Math.sin(a.yaw) * 3), Z(a.pos.z + Math.cos(a.yaw) * 3)); ctx.stroke()}
    }
    if (this.mission.mode !== "targets") {ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(X(this.ball.p.x), Z(this.ball.p.z), 2.6, 0, Math.PI * 2); ctx.fill()}
  }

  destroy() {
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("keydown", this.keydown); window.removeEventListener("keyup", this.keyup);
    window.removeEventListener("pointerup", this.pointerup);
    this.canvas?.removeEventListener("pointerdown", this.pointerdown); this.canvas?.removeEventListener("pointermove", this.pointermove);
    this.canvas?.removeEventListener("contextmenu", this.noMenu);
    this.synth.close();
    if ((window as any).__nsa === this) delete (window as any).__nsa;
    this.engine.stopRenderLoop();
    this.scene.dispose(); this.engine.dispose();
  }
}
