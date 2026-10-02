import {
  Color3, Color4, DefaultRenderingPipeline, Engine, GlowLayer, ImageProcessingConfiguration, InstancedMesh, Matrix, Mesh, MeshBuilder,
  ParticleSystem, PointLight, Scene, StandardMaterial, TransformNode, UniversalCamera, Vector3,
} from "@babylonjs/core";
import { BLUEPRINT } from "./blueprints";
import { buildModel, slotMaterial, socketWorld, type Model } from "./model-builder";
import { SPECIES, STATS, type Sector, type Species, type UpgradeKey } from "./frontier-data";
import { cameraRelative, screenForwardZ } from "./movement-input";
import { ARENA, FENCE, buildWorld, flareTexture, type World } from "./world";
import { FrontierAudio } from "./audio";

export type Upgrades = Record<UpgradeKey, number>;
export type CameraMode = "third" | "tactical";
export type Quality = "low" | "medium" | "high";
export type Settings = { camera: CameraMode; quality: Quality; sensitivity: number; volume: number; invertY: boolean; shake: boolean };
export const DEFAULT_SETTINGS: Settings = { camera: "third", quality: "high", sensitivity: 1, volume: 0.7, invertY: false, shake: true };

export type Hud = {
  health: number; kills: string; cores: number; score: number; combo: number;
  dash: number; dashMax: number; emp: number; threat: number; airborne: boolean;
  boss: { name: string; hp: number } | null; locked: boolean; camera: CameraMode; hint: string | null;
};
export type Result = { kills: number; cores: number; score: number; health: number; time: number; accuracy: number; bestCombo: number };
export type Callbacks = {
  hud: (h: Hud) => void;
  message: (text: string, kind: "good" | "warn" | "info") => void;
  complete: (r: Result) => void;
  fail: (r: Result) => void;
  pause: () => void;
  /** Requested by the gamepad Start button while paused. */
  resume?: () => void;
  banner?: (title: string, sub: string) => void;
  camera?: (mode: CameraMode) => void;
};
export type Ui = { damage?: HTMLDivElement | null; radar?: HTMLCanvasElement | null; crosshair?: HTMLDivElement | null; vignette?: HTMLDivElement | null };

type State = "chase" | "windup" | "recover" | "stun" | "leap" | "charge" | "spin" | "spit" | "roar" | "stomp" | "dead";
type Enemy = {
  id: number; kind: Species; model: Model; pos: Vector3; yaw: number; knock: Vector3;
  hp: number; maxHp: number; speed: number; damage: number; radius: number; height: number;
  state: State; timer: number; cd: Record<string, number>; next: State | null;
  phase: number; gait: number; flank: number; flash: number; jaw: number; flare: number; lean: number;
  leap?: { from: Vector3; to: Vector3; t: number; dur: number }; charge?: { dir: Vector3; left: number; hit: boolean };
  spun: boolean; breached: boolean; bar: TransformNode; barFill: Mesh; deadT: number; rest: Record<string, Vector3>; stepSide: number;
};
type Shot = { mesh: InstancedMesh; pos: Vector3; vel: Vector3; life: number; dmg: number; owner: "ranger" | "drone" | "acid"; gravity: number };
type Pickup = { mesh: InstancedMesh; kind: "core" | "med"; value: number; pos: Vector3; life: number; vy: number };
type Ring = { mesh: Mesh; center: Vector3; r: number; speed: number; max: number; hit: boolean; damage: number; color: Color3; hostile: boolean };
type Puddle = { pos: Vector3; r: number; life: number; mesh: Mesh };
type Floater = { el: HTMLSpanElement; pos: Vector3; vy: number; life: number; max: number };

const BIPED: Species[] = ["raptor", "spitter", "rex"];
const NAMES = Object.fromEntries(SPECIES.map(s => [s.key, s.name])) as Record<Species, string>;
const TINT = Object.fromEntries(SPECIES.map(s => [s.key, Color3.FromHexString(s.color)])) as Record<Species, Color3>;
const FLASH = Color3.White(), TELEGRAPH = Color3.FromHexString("#ff3040");
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt);
const angleTo = (from: number, to: number) => { let d = to - from; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const flat = (v: Vector3) => new Vector3(v.x, 0, v.z);

export class FrontierEngine {
  engine: Engine; scene: Scene; camera: UniversalCamera; world: World; audio: FrontierAudio;
  sector: Sector; up: Upgrades; cb: Callbacks; ui: Ui; settings: Settings;
  glow: GlowLayer; pipeline: DefaultRenderingPipeline | null = null;
  ranger: Model; drone: Model; muzzleLight: PointLight;
  boltSrc: Mesh; droneBoltSrc: Mesh; acidSrc: Mesh; coreSrc: Mesh; medSrc: Mesh; ringMat: StandardMaterial;
  bursts: ParticleSystem[] = []; burstIx = 0; trail: ParticleSystem;
  enemies: Enemy[] = []; shots: Shot[] = []; pickups: Pickup[] = []; rings: Ring[] = []; puddles: Puddle[] = []; floaters: Floater[] = [];
  keys = new Set<string>(); touchX = 0; touchZ = 0; firingHeld = false; mouseFiring = false; locked = false;
  mouse = { x: 0, y: 0, moved: -99 }; padPrev: boolean[] = [];
  pos = new Vector3(0, 0, -4); velY = 0; grounded = true; bodyYaw = 0; moveVec = new Vector3(); knock = new Vector3();
  camYaw = 0; camPitch = 0.26; camDist = 5.4; shake = 0; aberration = 0; hurtFlash = 0; fovKick = 0;
  health = 100; kills = 0; cores = 0; score = 0; combo = 0; comboClock = 0; bestCombo = 0; emp = 0; shotsFired = 0; shotsHit = 0;
  spawned = 0; spawnClock = 1.2; fireClock = 0; droneClock = 0; dashClock = 0; dashTime = 0; invuln = 0; slow = 0; hazardTick = 0;
  elapsed = 0; timeScale = 1; finished = false; paused = false; dying = 0; nextId = 0; recoil = 0; walkPhase = 0; hudClock = 0; radarClock = 0;
  boss: Enemy | null = null; hint: string | null = null; last = performance.now(); isTouch: boolean;
  /** Debug/testing: advance a fixed step per frame instead of wall-clock time. */
  fixedStep = 0;
  pausedDraw = 0; destroyed = false; endTimer = 0; lockFailures = 0;

  constructor(canvas: HTMLCanvasElement, sector: Sector, upgrades: Partial<Upgrades>, cb: Callbacks, settings: Settings = DEFAULT_SETTINGS, ui: Ui = {}) {
    this.sector = sector; this.up = { rifle: 0, armor: 0, boots: 0, drone: 0, emp: 0, ...upgrades }; this.cb = cb; this.ui = ui; this.settings = { ...settings };
    this.isTouch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
    this.engine = new Engine(canvas, settings.quality !== "low", { stencil: true, powerPreference: "high-performance", preserveDrawingBuffer: false }, true);
    const dpr = window.devicePixelRatio || 1;
    this.engine.setHardwareScalingLevel(settings.quality === "high" ? 1 / Math.min(dpr, 1.5) : settings.quality === "medium" ? 1 / Math.min(dpr, 1.25) : 1.3);
    this.scene = new Scene(this.engine);
    this.scene.skipPointerMovePicking = true;
    this.audio = new FrontierAudio(settings.volume);
    this.world = buildWorld(this.scene, sector, settings.quality, () => { if (!this.destroyed) this.audio.thunder(); });

    this.camera = new UniversalCamera("cam", new Vector3(0, 6, -12), this.scene);
    this.camera.inputs.clear();
    this.camera.minZ = 0.1; this.camera.maxZ = 1000; this.camera.fov = 0.95;

    this.glow = new GlowLayer("glow", this.scene, { mainTextureRatio: settings.quality === "high" ? 0.5 : 0.3, blurKernelSize: settings.quality === "low" ? 24 : 40 });
    this.glow.intensity = this.world.biome.glow;
    this.glow.customEmissiveColorSelector = (_m, _s, mat, out) => {
      const sm = mat as StandardMaterial;
      if (sm?.metadata?.glow && sm.emissiveColor) out.set(sm.emissiveColor.r, sm.emissiveColor.g, sm.emissiveColor.b, 1);
      else out.set(0, 0, 0, 0);
    };
    if (settings.quality !== "low") {
      const p = new DefaultRenderingPipeline("pipe", true, this.scene, [this.camera]);
      p.fxaaEnabled = true;
      p.imageProcessingEnabled = true;
      p.imageProcessing.toneMappingEnabled = true;
      p.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
      p.imageProcessing.exposure = 1.35;
      p.imageProcessing.contrast = 1.12;
      p.imageProcessing.vignetteEnabled = true;
      p.imageProcessing.vignetteWeight = 1.6;
      p.imageProcessing.vignetteColor = new Color4(0, 0, 0, 0);
      p.chromaticAberrationEnabled = true;
      p.chromaticAberration.aberrationAmount = 0;
      if (settings.quality === "high") { p.grainEnabled = true; p.grain.intensity = 5; p.grain.animated = true; }
      this.pipeline = p;
    }

    this.ranger = buildModel(this.scene, BLUEPRINT.ranger, { name: "ranger", merge: true });
    this.drone = buildModel(this.scene, BLUEPRINT.drone, { name: "drone", merge: true });
    for (const m of [...this.ranger.meshes, ...this.drone.meshes]) { this.world.shadow?.addShadowCaster(m, false); m.isPickable = false; }
    this.muzzleLight = new PointLight("muzzle", Vector3.Zero(), this.scene);
    this.muzzleLight.diffuse = Color3.FromHexString("#7ff6ff"); this.muzzleLight.intensity = 0; this.muzzleLight.range = 9;

    const glowMat = (name: string, hex: string) => { const m = new StandardMaterial(name, this.scene); m.disableLighting = true; m.emissiveColor = Color3.FromHexString(hex); m.metadata = { glow: true }; return m; };
    const hidden = (m: Mesh) => { m.position.y = -500; m.isPickable = false; return m; };
    this.boltSrc = hidden(MeshBuilder.CreateCapsule("bolt", { radius: 0.07, height: 1.1, tessellation: 6, orientation: Vector3.Forward() }, this.scene));
    this.boltSrc.material = glowMat("boltMat", "#9ffcff");
    this.droneBoltSrc = hidden(MeshBuilder.CreateCapsule("dbolt", { radius: 0.05, height: 0.7, tessellation: 6, orientation: Vector3.Forward() }, this.scene));
    this.droneBoltSrc.material = glowMat("dboltMat", "#ff7fd8");
    this.acidSrc = hidden(MeshBuilder.CreateSphere("acid", { diameter: 0.42, segments: 8 }, this.scene));
    this.acidSrc.material = glowMat("acidMat", "#d9ff3f");
    this.coreSrc = hidden(MeshBuilder.CreatePolyhedron("core", { type: 1, size: 0.32 }, this.scene));
    this.coreSrc.material = glowMat("coreMat", "#3dfff0");
    const cross = [MeshBuilder.CreateBox("medA", { width: 0.5, height: 0.16, depth: 0.16 }, this.scene), MeshBuilder.CreateBox("medB", { width: 0.16, height: 0.5, depth: 0.16 }, this.scene)];
    this.medSrc = hidden(Mesh.MergeMeshes(cross, true)!);
    this.medSrc.material = glowMat("medMat", "#ff5fa8");
    this.ringMat = glowMat("ringMat", "#ffffff"); this.ringMat.alpha = 0.7; this.ringMat.backFaceCulling = false;

    const flare = flareTexture(this.scene);
    for (let i = 0; i < 10; i++) {
      const ps = new ParticleSystem(`burst${i}`, 260, this.scene);
      ps.particleTexture = flare; ps.emitter = new Vector3(0, -100, 0); ps.emitRate = 0; ps.blendMode = ParticleSystem.BLENDMODE_ADD;
      ps.minEmitBox = new Vector3(-0.2, -0.2, -0.2); ps.maxEmitBox = new Vector3(0.2, 0.2, 0.2);
      ps.direction1 = new Vector3(-1, 0.4, -1); ps.direction2 = new Vector3(1, 1.6, 1);
      ps.updateSpeed = 0.016; ps.start();
      this.bursts.push(ps);
    }
    this.trail = new ParticleSystem("dashTrail", 300, this.scene);
    this.trail.particleTexture = flare; this.trail.emitter = this.pos; this.trail.emitRate = 0;
    this.trail.color1 = new Color4(0.3, 1, 0.65, 0.9); this.trail.color2 = new Color4(0.2, 0.9, 1, 0.7); this.trail.colorDead = new Color4(0, 0.3, 0.3, 0);
    this.trail.minSize = 0.15; this.trail.maxSize = 0.45; this.trail.minLifeTime = 0.25; this.trail.maxLifeTime = 0.5;
    this.trail.minEmitBox = new Vector3(-0.3, 0.2, -0.3); this.trail.maxEmitBox = new Vector3(0.3, 1.6, 0.3);
    this.trail.minEmitPower = 0; this.trail.maxEmitPower = 0.3; this.trail.blendMode = ParticleSystem.BLENDMODE_ADD; this.trail.start();

    this.pos.y = this.world.heightAt(this.pos.x, this.pos.z);
    this.ranger.root.position.copyFrom(this.pos);
    this.camera.position.set(0, this.pos.y + 3, this.pos.z - 7);
    this.audio.startAmbience([55, 49, 58.27, 46.25, 41.2, 51.91, 43.65, 61.74, 38.89, 36.71][(sector.id - 1) % 10]);
    this.hint = this.settings.camera === "third" && !this.isTouch ? "CLICK TO LOCK AIM · ESC TO PAUSE" : null;

    this.bind(canvas);
    if (new URLSearchParams(window.location.search).has("debug")) (window as unknown as { __frontier?: FrontierEngine }).__frontier = this;
    this.engine.runRenderLoop(() => this.update());
    window.addEventListener("resize", this.resize);
  }

  /* ───────────── Input ───────────── */

  canvas() { return this.engine.getRenderingCanvas()!; }
  resize = () => this.engine.resize();
  bind(canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", this.keydown);
    window.addEventListener("keyup", this.keyup);
    canvas.addEventListener("mousedown", this.mousedown);
    window.addEventListener("mouseup", this.mouseup);
    window.addEventListener("mousemove", this.mousemove);
    canvas.addEventListener("wheel", this.wheel, { passive: false });
    canvas.addEventListener("contextmenu", this.noMenu);
    document.addEventListener("pointerlockchange", this.lockchange);
    document.addEventListener("pointerlockerror", this.lockerror);
    document.addEventListener("visibilitychange", this.visibility);
  }
  noMenu = (e: Event) => e.preventDefault();
  keydown = (e: KeyboardEvent) => {
    if (this.paused || (e.repeat && (e.code === "Space" || e.code === "KeyQ"))) return;
    this.keys.add(e.code);
    if (e.code === "Space") { e.preventDefault(); this.jump(); }
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") this.dash();
    if (e.code === "KeyQ" || e.code === "KeyE") this.pulse();
    if (e.code === "KeyV" || e.code === "KeyC") this.toggleCamera();
    if (e.code === "Escape" || e.code === "KeyP") { if (!this.paused && !this.finished) this.cb.pause(); }
    if (e.code === "KeyF" || e.code === "Enter" || e.code === "KeyJ") this.firingHeld = true;
    if (e.code.startsWith("Arrow")) e.preventDefault();
  };
  keyup = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    if (e.code === "KeyF" || e.code === "Enter" || e.code === "KeyJ") this.firingHeld = false;
  };
  mousedown = (e: MouseEvent) => {
    if (this.paused || this.finished) return;
    if (e.button === 0) {
      if (this.settings.camera === "third" && !this.locked && !this.isTouch && this.lockFailures < 2) { this.lockPointer(); return; }
      this.mouseFiring = true;
      this.fire(true);
    }
  };
  mouseup = (e: MouseEvent) => { if (e.button === 0) this.mouseFiring = false; };
  mousemove = (e: MouseEvent) => {
    if (this.paused) return;
    if (this.locked) { this.look(e.movementX, e.movementY); return; }
    this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.moved = this.elapsed;
    // Fallback when pointer lock is unavailable (e.g. embedded iframes): right-drag to look.
    if (this.settings.camera === "third" && e.buttons & 2) this.look(e.movementX, e.movementY);
  };
  wheel = (e: WheelEvent) => { e.preventDefault(); this.camDist = clamp(this.camDist + Math.sign(e.deltaY) * 0.5, 3.2, 9); };
  lockchange = () => {
    const was = this.locked;
    this.locked = document.pointerLockElement === this.canvas();
    this.hint = this.locked ? null : this.isTouch ? null : "CLICK TO LOCK AIM · ESC TO PAUSE";
    if (this.locked) this.lockFailures = 0;
    if (was && !this.locked && !this.paused && !this.finished && this.settings.camera === "third") this.cb.pause();
  };
  /** Two failed lock requests in a row (e.g. a sandboxed iframe): fall back to click-to-fire + right-drag look. */
  lockerror = () => {
    this.lockFailures++;
    this.hint = this.lockFailures >= 2 ? "RIGHT-DRAG TO LOOK · CLICK TO FIRE" : "CLICK AGAIN TO LOCK AIM · OR RIGHT-DRAG TO LOOK";
  };
  visibility = () => { if (document.hidden && !this.paused && !this.finished) this.cb.pause(); };

  lockPointer() {
    if (this.isTouch || this.settings.camera !== "third") return;
    try {
      const r = this.canvas().requestPointerLock() as unknown as Promise<void> | undefined;
      r?.catch?.(() => {});
    } catch { /* pointer lock unsupported */ }
  }
  /** Rotate the third-person camera (mouse delta in px, or touch drag). */
  look(dx: number, dy: number) {
    const k = 0.0023 * this.settings.sensitivity;
    this.camYaw += dx * k;
    this.camPitch = clamp(this.camPitch + dy * k * (this.settings.invertY ? -1 : 1), -0.45, 1.05);
  }
  setMove(x: number, z: number) { this.touchX = x; this.touchZ = z; }
  clearMove() { this.touchX = 0; this.touchZ = 0; }
  setFiring(on: boolean) { this.firingHeld = on; if (on) this.fire(true); }
  toggleCamera() {
    this.settings.camera = this.settings.camera === "third" ? "tactical" : "third";
    if (this.settings.camera === "tactical" && this.locked) document.exitPointerLock?.();
    this.cb.camera?.(this.settings.camera);
    this.cb.message(this.settings.camera === "third" ? "THIRD-PERSON CAMERA" : "TACTICAL CAMERA", "info");
  }
  setSettings(s: Settings) {
    const cam = this.settings.camera !== s.camera;
    this.settings = { ...s };
    this.audio.setVolume(s.volume);
    if (cam && s.camera === "tactical" && this.locked) document.exitPointerLock?.();
  }
  pause() { this.paused = true; this.keys.clear(); this.firingHeld = false; this.mouseFiring = false; this.clearMove(); if (this.locked) document.exitPointerLock?.(); }
  resume(relock = true) { this.paused = false; this.last = performance.now(); if (relock && this.lockFailures < 2) this.lockPointer(); }

  pollGamepad(dt: number) {
    const pads = navigator.getGamepads?.() ?? [];
    const gp = Array.from(pads).find(p => p && p.connected);
    if (!gp) return null;
    const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);
    const btn = (i: number) => !!gp.buttons[i]?.pressed;
    const edge = (i: number) => { const now = btn(i), was = this.padPrev[i]; this.padPrev[i] = now; return now && !was; };
    this.look(dz(gp.axes[2] ?? 0) * 900 * dt, dz(gp.axes[3] ?? 0) * 600 * dt);
    if (edge(0)) this.jump();
    if (edge(1) || edge(5)) this.dash();
    if (edge(3) || edge(4)) this.pulse();
    if (edge(8)) this.toggleCamera();
    if (edge(9) && !this.finished) this.cb.pause();
    if (btn(7) || btn(2)) this.fire(true);
    return { x: dz(gp.axes[0] ?? 0), z: -dz(gp.axes[1] ?? 0) };
  }

  /* ───────────── Abilities ───────────── */

  dash() {
    if (this.paused || this.finished || this.dashClock > 0) return;
    this.dashTime = 0.34;
    this.dashClock = Math.max(2.2, 4.6 - this.up.boots * 0.5);
    this.fovKick = 0.18;
    this.audio.dash();
  }
  jump() {
    if (this.paused || this.finished || !this.grounded) return;
    this.velY = 7.4 + this.up.boots * 0.3;
    this.grounded = false;
    this.audio.jump();
    this.burst(this.pos.add(new Vector3(0, 0.1, 0)), Color3.FromHexString(this.world.biome.ground[2]), 14, 2.5, 0.35, 0.5, -4, false);
  }
  /** EMP shockwave: damages, stuns and throws back everything nearby. */
  pulse() {
    if (this.paused || this.finished || this.emp < 100) return;
    this.emp = 0;
    const radius = 9 + this.up.emp * 1.3, dmg = 60 + this.up.emp * 15;
    this.audio.emp();
    this.shake = Math.max(this.shake, 0.5); this.aberration = 1.2;
    this.ring(this.pos.clone(), radius, 26, Color3.FromHexString("#b98cff"), false, 0);
    this.burst(this.pos.add(new Vector3(0, 1, 0)), Color3.FromHexString("#b98cff"), 120, 12, 0.6, 0.7, 0, true);
    for (const e of [...this.enemies]) {
      if (e.state === "dead") continue;
      const d = Vector3.Distance(flat(e.pos), flat(this.pos));
      if (d > radius + e.radius) continue;
      const dir = flat(e.pos.subtract(this.pos)).normalize();
      e.knock.addInPlace(dir.scale(e.kind === "rex" ? 4 : 11));
      this.damage(e, dmg * (1 - (d / (radius + e.radius)) * 0.4), "emp");
      if ((e.state as State) !== "dead") { e.state = "stun"; e.timer = 1.6; e.next = null; }
    }
    this.cb.message("EMP DISCHARGE", "good");
  }

  /* ───────────── Combat ───────────── */

  aimDirection(): Vector3 {
    return new Vector3(Math.sin(this.camYaw) * Math.cos(this.camPitch), -Math.sin(this.camPitch), Math.cos(this.camYaw) * Math.cos(this.camPitch));
  }
  /** Ray test against an enemy's body and head spheres; returns the nearest hit distance (0 if starting inside). */
  rayHit(o: Vector3, d: Vector3, e: Enemy): { t: number; head: boolean } | null {
    let best: { t: number; head: boolean } | null = null;
    const test = (c: Vector3, r: number, head: boolean) => {
      const oc = o.subtract(c), b = Vector3.Dot(oc, d), cc = oc.lengthSquared() - r * r, h = b * b - cc;
      if (h < 0) return;
      const near = -b - Math.sqrt(h), far = -b + Math.sqrt(h);
      if (far < 0) return;
      const t = Math.max(0, near);
      if (!best || t < best.t || (t === best.t && head)) best = { t, head };
    };
    test(e.pos.add(new Vector3(0, e.height * 0.5, 0)), e.radius * 1.15, false);
    test(socketWorld(e.model, "eyeline"), e.radius * 0.55 + 0.15, true);
    return best;
  }
  nearest(range: number, cone?: { dir: Vector3; cos: number }) {
    let best: Enemy | undefined, bd = range;
    for (const e of this.enemies) {
      if (e.state === "dead") continue;
      const to = e.pos.subtract(this.pos), d = to.length();
      if (d > bd) continue;
      if (cone && Vector3.Dot(flat(to).normalize(), cone.dir) < cone.cos) continue;
      best = e; bd = d;
    }
    return best;
  }
  /** Work out where the ranger is aiming for this shot. */
  aimPoint(range: number): Vector3 | null {
    const tactical = this.settings.camera === "tactical";
    const useMouse = tactical && !this.isTouch && this.elapsed - this.mouse.moved < 4;
    if (!tactical && !this.isTouch) {
      const o = this.camera.position, d = this.aimDirection();
      const minT = Vector3.Dot(this.pos.add(new Vector3(0, 1.4, 0)).subtract(o), d);
      let bestT = Infinity, bestE: Enemy | null = null;
      for (const e of this.enemies) {
        if (e.state === "dead") continue;
        const h = this.rayHit(o, d, e);
        if (h && h.t > minT && h.t < bestT) { bestT = h.t; bestE = e; }
      }
      if (bestE) return o.add(d.scale(bestT + 0.05));
      let assist: Enemy | null = null, bestCos = Math.cos(0.06);
      for (const e of this.enemies) {
        if (e.state === "dead") continue;
        const c = e.pos.add(new Vector3(0, e.height * 0.5, 0)), to = c.subtract(o);
        if (Vector3.Dot(to, d) < minT) continue;
        const cos = Vector3.Dot(to.normalize(), d);
        if (cos > bestCos && to.length() < range + 6) { bestCos = cos; assist = e; }
      }
      if (assist) return assist.pos.add(new Vector3(0, assist.height * 0.5, 0));
      for (let t = 2; t < range + 8; t += 0.75) {
        const p = o.add(d.scale(t));
        if (p.y < this.world.heightAt(p.x, p.z)) return p;
      }
      return o.add(d.scale(range + 8));
    }
    if (useMouse) {
      const ray = this.scene.createPickingRay(this.mouse.x, this.mouse.y, Matrix.Identity(), this.camera);
      const planeY = this.pos.y + 1.1, t = (planeY - ray.origin.y) / (ray.direction.y || -1e-4);
      const p = ray.origin.add(ray.direction.scale(Math.max(0, t)));
      let snap: Enemy | null = null, sd = 3;
      for (const e of this.enemies) { if (e.state === "dead") continue; const d = Vector3.Distance(flat(e.pos), flat(p)); if (d < sd + e.radius) { sd = d; snap = e; } }
      return snap ? snap.pos.add(new Vector3(0, snap.height * 0.5, 0)) : p;
    }
    const facing = new Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
    const target = this.nearest(range, { dir: tactical ? new Vector3(Math.sin(this.bodyYaw), 0, Math.cos(this.bodyYaw)) : facing, cos: Math.cos(1.05) }) ?? this.nearest(range);
    return target ? target.pos.add(new Vector3(0, target.height * 0.5, 0)) : null;
  }
  fire(manual = false) {
    if (this.paused || this.finished || this.dying) return;
    if (!manual || this.fireClock > 0) return;
    const range = 30 + this.up.rifle * 4;
    const aim = this.aimPoint(range);
    if (!aim) return;
    this.fireClock = Math.max(0.12, 0.2 - this.up.rifle * 0.012);
    const flatDir = flat(aim.subtract(this.pos));
    if (flatDir.lengthSquared() > 0.01) this.bodyYaw = Math.atan2(flatDir.x, flatDir.z);
    this.ranger.root.rotation.y = this.bodyYaw;
    const muzzle = socketWorld(this.ranger, "muzzle");
    const dir = aim.subtract(muzzle).normalize();
    this.spawnShot(this.boltSrc, muzzle, dir.scale(80), range / 80, 15 + this.up.rifle * 6, "ranger", 0);
    this.shotsFired++;
    this.recoil = 1;
    this.muzzleLight.position.copyFrom(muzzle); this.muzzleLight.intensity = 2.4;
    this.burst(muzzle, Color3.FromHexString("#9ffcff"), 6, 3, 0.25, 0.12, 0, true);
    this.audio.shot();
  }
  droneFire() {
    if (this.droneClock > 0) return;
    const range = 17 + this.up.drone * 1.2;
    const target = this.nearest(range);
    if (!target) return;
    this.droneClock = Math.max(0.2, 0.55 - this.up.drone * 0.07);
    const from = socketWorld(this.drone, "muzzle");
    const to = target.pos.add(new Vector3(0, target.height * 0.5, 0));
    this.drone.root.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
    this.spawnShot(this.droneBoltSrc, from, to.subtract(from).normalize().scale(55), range / 55 + 0.1, 8 + this.up.drone * 4, "drone", 0);
    this.audio.droneShot();
  }
  spawnShot(src: Mesh, from: Vector3, vel: Vector3, life: number, dmg: number, owner: Shot["owner"], gravity: number) {
    const mesh = src.createInstance(`${owner}-${this.nextId++}`);
    mesh.position.copyFrom(from);
    mesh.isPickable = false;
    this.shots.push({ mesh, pos: from.clone(), vel, life, dmg, owner, gravity });
  }

  damage(e: Enemy, amount: number, source: "ranger" | "drone" | "emp", head = false, from?: Vector3) {
    if (e.state === "dead") return;
    let dmg = amount, tag = "";
    if (head) { dmg *= 1.5; tag = "CRIT "; }
    if (e.kind === "anky" && from && source !== "emp") {
      const fwd = new Vector3(Math.sin(e.yaw), 0, Math.cos(e.yaw)), toShooter = flat(from.subtract(e.pos)).normalize();
      if (Vector3.Dot(fwd, toShooter) > 0.55) { dmg *= 0.7; tag = "ARMOR "; }
    }
    if (e.state === "stun" && e.kind === "trike") { dmg *= 1.5; tag = "EXPOSED "; }
    dmg = Math.round(dmg);
    e.hp -= dmg;
    e.flash = 0.09;
    if (e !== this.boss) e.bar.setEnabled(true);
    e.barFill.scaling.x = Math.max(0.001, e.hp / e.maxHp);
    e.barFill.position.x = -(1 - Math.max(0, e.hp / e.maxHp)) * 0.6;
    this.floatText(e.pos.add(new Vector3((Math.random() - 0.5) * 0.6, e.height + 0.3, 0)), `${tag}${dmg}`, head ? "crit" : tag === "ARMOR " ? "armor" : source === "drone" ? "drone" : "");
    if (source === "ranger") this.shotsHit++;
    if (source !== "emp") this.hitMarker(head);
    if (e.hp <= 0) this.kill(e);
  }
  kill(e: Enemy) {
    e.state = "dead"; e.deadT = 0; e.bar.setEnabled(false);
    e.pos.y = this.world.heightAt(e.pos.x, e.pos.z);
    this.kills++;
    this.combo++; this.comboClock = 4.2; this.bestCombo = Math.max(this.bestCombo, this.combo);
    const big = e.kind === "rex";
    this.score += 100 + this.combo * 20 + (big ? 900 : e.kind === "trike" || e.kind === "anky" ? 120 : 0);
    const c = e.pos.add(new Vector3(0, e.height * 0.5, 0));
    this.burst(c, TINT[e.kind], big ? 220 : 70, big ? 9 : 6, big ? 0.9 : 0.5, 0.9, -6, true);
    this.burst(c, Color3.White(), 18, 4, 0.3, 0.3, 0, true);
    this.audio.kill(big);
    if (big) {
      this.shake = Math.max(this.shake, 0.6);
      this.boss = this.enemies.find(x => x.kind === "rex" && x.state !== "dead") ?? null;
      if (this.boss) this.boss.bar.setEnabled(false);
      else this.audio.tension(false);
      this.cb.banner?.("APEX NEUTRALIZED", this.boss ? "Another Tyrant is still hunting you" : "Crimson Tyrant down — finish the sector");
    }
    const before = this.emp;
    this.emp = Math.min(100, this.emp + (big ? 40 : 9 + this.up.emp * 2.5));
    if (before < 100 && this.emp >= 100) this.cb.message("EMP READY · PRESS Q", "info");
    const drops = big ? 6 : Math.random() < 0.7 ? 1 : 0;
    for (let i = 0; i < drops; i++) this.drop(c, "core", 1);
    if (Math.random() < (this.health < 50 ? 0.16 : 0.07) || big) this.drop(c, "med", 22);
    if (this.combo === 5 || this.combo === 10 || this.combo === 20) this.cb.message(`HUNT CHAIN ×${this.combo}`, "good");
  }
  drop(at: Vector3, kind: Pickup["kind"], value: number) {
    const mesh = (kind === "core" ? this.coreSrc : this.medSrc).createInstance(`${kind}-${this.nextId++}`);
    const pos = at.add(new Vector3((Math.random() - 0.5) * 1.6, 0, (Math.random() - 0.5) * 1.6));
    mesh.position.copyFrom(pos);
    this.pickups.push({ mesh, kind, value, pos, life: 25, vy: 3 + Math.random() * 2 });
  }
  /** Damage the ranger. Environmental hazards pass `force` to ignore dash i-frames. */
  hurt(amount: number, from: Vector3, knock = 4, label?: string, force = false) {
    if (this.finished || this.dying) return;
    if (!force && this.dashTime > 0) { this.floatText(this.pos.add(new Vector3(0, 2.2, 0)), "EVADED", "evade"); return; }
    if (!force && this.invuln > 0) return;
    const dmg = amount * (1 - this.up.armor * 0.12);
    this.health = Math.max(0, this.health - dmg);
    if (!force) this.invuln = 0.3;
    this.combo = 0;
    const dir = flat(this.pos.subtract(from));
    if (dir.lengthSquared() > 1e-4) this.knock.addInPlace(dir.normalize().scale(knock));
    this.hurtFlash = force ? 0.45 : 1; this.aberration = Math.max(this.aberration, force ? 0.2 : 0.8);
    this.shake = Math.max(this.shake, force ? 0.1 : 0.25 + amount / 60);
    this.audio.hurt();
    if (label) this.cb.message(label, "warn");
    if (this.health <= 0) this.die();
  }
  die() {
    this.dying = 0.001;
    this.audio.kill(false);
    this.cb.message("RANGER DOWN", "warn");
  }

  /* ───────────── Enemies ───────────── */

  spawn(kind?: Species) {
    const pool = this.sector.species, chosen = kind ?? pool[Math.floor(Math.random() * pool.length)];
    const st = STATS[chosen], bp = BLUEPRINT[chosen];
    const a = Math.random() * Math.PI * 2, r = FENCE + 4 + Math.random() * 4;
    const pos = new Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    pos.y = this.world.heightAt(pos.x, pos.z);
    const model = buildModel(this.scene, bp, { name: `${chosen}-${this.nextId}`, merge: true });
    for (const m of model.meshes) { this.world.shadow?.addShadowCaster(m, false); m.isPickable = false; m.overlayColor = Color3.White(); m.overlayAlpha = 0.65; }
    const rest: Record<string, Vector3> = {};
    for (const [id, b] of Object.entries(model.bones)) rest[id] = b.position.clone();
    const bar = new TransformNode(`bar-${this.nextId}`, this.scene);
    bar.billboardMode = TransformNode.BILLBOARDMODE_ALL;
    const bg = MeshBuilder.CreatePlane("barBg", { width: 1.3, height: 0.13 }, this.scene);
    const fill = MeshBuilder.CreatePlane("barFill", { width: 1.2, height: 0.07 }, this.scene);
    bg.parent = bar; fill.parent = bar; fill.position.z = -0.01;
    bg.material = this.barMat("#04100e", 0.8); fill.material = this.barMat(SPECIES.find(s => s.key === chosen)!.color, 1);
    bg.isPickable = fill.isPickable = false;
    bar.setEnabled(false);
    const threat = this.sector.threat;
    const hp = st.hp * (1 + threat * 0.09);
    const e: Enemy = {
      id: this.nextId++, kind: chosen, model, pos, yaw: Math.atan2(-pos.x, -pos.z), knock: new Vector3(),
      hp, maxHp: hp, speed: st.speed * (1 + threat * 0.025), damage: st.damage * (1 + threat * 0.045), radius: bp.collider.radius, height: bp.collider.height,
      state: "chase", timer: 0, cd: { attack: 1, special: 2 + Math.random() * 2, roar: 3, stomp: 6 }, next: null,
      phase: Math.random() * 6, gait: 0, flank: (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 3), flash: 0, jaw: 0, flare: 0, lean: 0,
      spun: false, breached: false, bar, barFill: fill, deadT: 0, rest, stepSide: 0,
    };
    model.root.position.copyFrom(pos);
    model.root.rotation.y = e.yaw;
    this.enemies.push(e);
    this.spawned++;
    if (chosen === "rex") {
      this.audio.roar(true); this.audio.tension(true);
      this.shake = Math.max(this.shake, 0.45);
      if (!this.boss) {
        this.boss = e;
        this.cb.banner?.("APEX SIGNAL DETECTED", "Crimson Tyrant inbound — jump its shockwaves");
      }
    }
  }
  barMats = new Map<string, StandardMaterial>();
  barMat(hex: string, alpha: number) {
    let m = this.barMats.get(hex);
    if (!m) { m = new StandardMaterial(`bar${hex}`, this.scene); m.disableLighting = true; m.emissiveColor = Color3.FromHexString(hex); m.alpha = alpha; m.backFaceCulling = false; this.barMats.set(hex, m); }
    return m;
  }

  /** Per-species state machines. */
  think(e: Enemy, dt: number) {
    const to = flat(this.pos.subtract(e.pos)), d = to.length(), dir = d > 1e-3 ? to.scale(1 / d) : new Vector3(0, 0, 1);
    for (const k in e.cd) e.cd[k] -= dt;
    let move = 0;
    const face = (target: Vector3, rate: number) => { const want = Math.atan2(target.x, target.z); e.yaw += clamp(angleTo(e.yaw, want), -rate * dt, rate * dt); };
    const forward = () => new Vector3(Math.sin(e.yaw), 0, Math.cos(e.yaw));
    const reach = e.radius + (e.kind === "rex" ? 2.4 : 1.1);
    e.jaw += ((e.state === "windup" || e.state === "roar" || e.state === "spit" ? 1 : 0) - e.jaw) * damp(10, dt);
    e.flare += ((e.state === "spit" || (e.state === "windup" && e.next === "charge") ? 1 : 0) - e.flare) * damp(8, dt);

    switch (e.state) {
      case "chase": {
        let goal = dir;
        if (e.kind === "raptor" && d > 7) goal = flat(this.pos.add(new Vector3(-dir.z, 0, dir.x).scale(e.flank)).subtract(e.pos)).normalize();
        if (e.kind === "spitter") {
          const strafe = new Vector3(-dir.z, 0, dir.x).scale(Math.sign(e.flank));
          goal = d > 12 ? dir : d < 7 ? dir.scale(-1).add(strafe.scale(0.4)).normalize() : strafe;
          face(dir, 5);
          move = d > 12 || d < 7 ? 1 : 0.6;
          e.pos.addInPlace(goal.scale(e.speed * move * dt));
          if (e.cd.special <= 0 && d < 20) { e.state = "spit"; e.timer = 0.55; this.audio.spit(); }
          break;
        }
        face(goal, e.kind === "raptor" ? 6 : e.kind === "rex" ? 1.6 : 2.6);
        move = 1;
        const slowTurn = Math.abs(angleTo(e.yaw, Math.atan2(goal.x, goal.z))) > 1 ? 0.35 : 1;
        e.pos.addInPlace(forward().scale(e.speed * slowTurn * dt));
        if (e.kind === "raptor" && e.cd.special <= 0 && d > 3.5 && d < 8) { e.state = "windup"; e.next = "leap"; e.timer = 0.35; break; }
        if (e.kind === "trike" && e.cd.special <= 0 && d > 6 && d < 22) { e.state = "windup"; e.next = "charge"; e.timer = 0.85; this.audio.windup(); break; }
        if (e.kind === "anky" && e.cd.special <= 0 && d < 4.2) { e.state = "windup"; e.next = "spin"; e.timer = 0.6; this.audio.windup(); break; }
        if (e.kind === "rex" && e.cd.roar <= 0 && d < 20) { e.state = "roar"; e.timer = 1.3; e.cd.roar = 13; this.audio.roar(true); break; }
        if (e.kind === "rex" && e.cd.stomp <= 0 && d < 12) { e.state = "windup"; e.next = "stomp"; e.timer = 0.65; this.audio.windup(); break; }
        if (d < reach && e.cd.attack <= 0) { e.state = "windup"; e.next = null; e.timer = e.kind === "rex" ? 0.5 : 0.32; }
        break;
      }
      case "windup": {
        face(dir, e.next === "spin" ? 0 : 4);
        e.timer -= dt;
        e.lean += ((e.next === "leap" ? 1 : e.next === "charge" ? 0.6 : 0.3) - e.lean) * damp(8, dt);
        if (e.next === "charge" && Math.random() < dt * 12) this.burst(e.pos.add(new Vector3(0, 0.2, 0)), Color3.FromHexString(this.world.biome.ground[2]), 4, 2, 0.4, 0.5, -3, false);
        if (e.timer > 0) break;
        e.lean = 0;
        if (e.next === "leap") {
          const target = this.pos.add(flat(this.moveVec).scale(0.3));
          e.leap = { from: e.pos.clone(), to: target, t: 0, dur: 0.55 }; e.state = "leap"; e.cd.special = 3.5 + Math.random() * 2;
        } else if (e.next === "charge") {
          e.charge = { dir, left: d + 7, hit: false }; e.yaw = Math.atan2(dir.x, dir.z); e.state = "charge"; e.cd.special = 6 + Math.random() * 3; this.audio.roar(false);
        } else if (e.next === "spin") {
          e.state = "spin"; e.timer = 0.75; e.spun = false; e.cd.special = 4;
        } else if (e.next === "stomp") {
          e.state = "stomp"; e.timer = 0.6; e.cd.stomp = 7.5;
          this.audio.stomp(); this.shake = Math.max(this.shake, 0.55);
          this.ring(e.pos.clone(), 15, 10, Color3.FromHexString("#ff4d62"), true, e.damage * 0.75);
          this.burst(e.pos.add(new Vector3(0, 0.3, 0)), Color3.FromHexString(this.world.biome.ground[2]), 90, 7, 0.8, 0.9, -6, false);
        } else {
          if (d < reach + 0.6) this.hurt(e.damage, e.pos, e.kind === "rex" ? 9 : 4, e.kind === "rex" ? "TYRANT BITE" : undefined);
          e.state = "recover"; e.timer = e.kind === "rex" ? 0.7 : 0.5; e.cd.attack = e.kind === "raptor" ? 0.8 : 1.1;
        }
        e.next = null;
        break;
      }
      case "leap": {
        const L = e.leap!;
        L.t += dt / L.dur;
        const t = Math.min(1, L.t);
        e.pos = Vector3.Lerp(L.from, L.to, t);
        e.pos.y += Math.sin(t * Math.PI) * 1.8;
        face(flat(L.to.subtract(L.from)), 8);
        if (t >= 1) {
          e.state = "recover"; e.timer = 0.65; e.pos.y = this.world.heightAt(e.pos.x, e.pos.z);
          if (Vector3.Distance(flat(e.pos), flat(this.pos)) < e.radius + 1.2 && this.pos.y - this.world.heightAt(this.pos.x, this.pos.z) < 1.2) this.hurt(e.damage * 1.3, e.pos, 6, "RAPTOR POUNCE");
          this.burst(e.pos.add(new Vector3(0, 0.1, 0)), Color3.FromHexString(this.world.biome.ground[2]), 12, 2.5, 0.35, 0.4, -4, false);
        }
        return;
      }
      case "charge": {
        const C = e.charge!, step = 13 * dt;
        e.pos.addInPlace(C.dir.scale(step)); C.left -= step; move = 2.2;
        if (Math.random() < dt * 30) this.burst(e.pos.add(new Vector3(0, 0.2, 0)), Color3.FromHexString(this.world.biome.ground[2]), 3, 2, 0.5, 0.5, -3, false);
        if (!C.hit && Vector3.Distance(flat(e.pos), flat(this.pos)) < e.radius + 0.8 && this.pos.y - this.world.heightAt(this.pos.x, this.pos.z) < 1.4) {
          C.hit = true; this.hurt(e.damage * 1.35, e.pos, 14, "HORN CHARGE");
        }
        if (C.left <= 0 || Math.hypot(e.pos.x, e.pos.z) > FENCE + 3) {
          e.state = C.hit ? "recover" : "stun"; e.timer = C.hit ? 0.8 : 1.6;
          if (!C.hit) this.floatText(e.pos.add(new Vector3(0, e.height + 0.4, 0)), "STUNNED", "evade");
        }
        break;
      }
      case "spin": {
        e.timer -= dt; e.yaw += 11 * dt; move = 0;
        if (!e.spun && e.timer < 0.45 && d < 4.4) { e.spun = true; this.hurt(e.damage * 1.2, e.pos, 11, "TAIL CLUB"); }
        if (e.timer <= 0) { e.state = "recover"; e.timer = 0.9; }
        break;
      }
      case "spit": {
        face(dir, 5);
        e.timer -= dt;
        if (e.timer <= 0) {
          const mouth = socketWorld(e.model, "mouth");
          const lead = this.pos.add(flat(this.moveVec).scale(0.55));
          const T = clamp(d / 13, 0.5, 1.3), g = 14;
          const vel = new Vector3((lead.x - mouth.x) / T, (lead.y + 0.9 - mouth.y) / T + 0.5 * g * T, (lead.z - mouth.z) / T);
          this.spawnShot(this.acidSrc, mouth, vel, 3, e.damage, "acid", g);
          e.state = "recover"; e.timer = 0.5; e.cd.special = 2.3 + Math.random() * 1.2;
        }
        break;
      }
      case "roar": {
        e.timer -= dt;
        if (e.timer < 1.0 && e.timer + dt >= 1.0) {
          this.shake = Math.max(this.shake, 0.7);
          if (d < 20) { this.slow = 2; this.cb.message("TERRIFYING ROAR · SLOWED", "warn"); }
        }
        if (e.timer <= 0) { e.state = "recover"; e.timer = 0.3; }
        break;
      }
      case "stomp": case "recover": {
        e.timer -= dt; face(dir, 1.5);
        if (e.timer <= 0) e.state = "chase";
        break;
      }
      case "stun": {
        e.timer -= dt;
        if (Math.random() < dt * 6) this.burst(e.pos.add(new Vector3(0, e.height + 0.2, 0)), Color3.FromHexString("#ffe45b"), 2, 1, 0.25, 0.4, 0, true);
        if (e.timer <= 0) e.state = "chase";
        break;
      }
      default: break;
    }
    e.gait += (move - e.gait) * damp(6, dt);
  }

  /** Procedural animation driven by gait, state and timers. */
  animate(e: Enemy, dt: number) {
    const b = e.model.bones, g = e.gait;
    const rate = e.kind === "rex" ? 1.3 : e.kind === "raptor" ? 2.6 : e.kind === "spitter" ? 2.3 : 1.7;
    e.phase += dt * (0.6 + g * e.speed * rate);
    const s = Math.sin(e.phase), c = Math.cos(e.phase);
    const breathe = Math.sin(this.elapsed * 2 + e.id) * 0.03;
    if (BIPED.includes(e.kind)) {
      const amp = 0.5 * Math.min(1.2, g);
      b.thigh_L.rotation.x = -s * amp - e.lean * 0.5; b.thigh_R.rotation.x = s * amp - e.lean * 0.5;
      b.shin_L.rotation.x = Math.max(0, c) * amp * 1.1 + e.lean * 0.7; b.shin_R.rotation.x = Math.max(0, -c) * amp * 1.1 + e.lean * 0.7;
      b.foot_L.rotation.x = -b.thigh_L.rotation.x * 0.4 - e.lean * 0.3; b.foot_R.rotation.x = -b.thigh_R.rotation.x * 0.4 - e.lean * 0.3;
      b.arm_L.rotation.x = s * 0.25 * g + breathe; b.arm_R.rotation.x = -s * 0.25 * g + breathe;
      b.hips.position.y = e.rest.hips.y - Math.abs(c) * 0.06 * g - e.lean * 0.2;
      b.hips.rotation.x = e.lean * 0.25 + (e.state === "roar" ? -0.25 : 0);
      b.chest.rotation.x = breathe;
      if (e.state === "stomp" || (e.state === "windup" && e.kind === "rex")) b.thigh_L.rotation.x = -0.6;
    } else {
      const amp = 0.42 * Math.min(1.3, g);
      b.legF_L.rotation.x = -s * amp; b.legB_R.rotation.x = -s * amp; b.legF_R.rotation.x = s * amp; b.legB_L.rotation.x = s * amp;
      b.lowF_L.rotation.x = Math.max(0, c) * amp; b.lowB_R.rotation.x = Math.max(0, c) * amp; b.lowF_R.rotation.x = Math.max(0, -c) * amp; b.lowB_L.rotation.x = Math.max(0, -c) * amp;
      b.hips.position.y = e.rest.hips.y - Math.abs(s) * 0.05 * g - e.lean * 0.12;
      b.hips.rotation.z = Math.sin(e.phase) * 0.03 * g;
      b.hips.rotation.x = -e.lean * 0.12;
    }
    const sway = Math.sin(e.phase * 0.5) * (0.12 + g * 0.1) + (e.state === "spin" ? 0.6 : 0);
    b.tail1.rotation.y = sway * 0.6; b.tail2.rotation.y = sway * 0.8 + Math.sin(e.phase * 0.5 - 0.7) * 0.1; b.tail3.rotation.y = sway + Math.sin(e.phase * 0.5 - 1.3) * 0.15;
    b.tail1.rotation.x = -0.05 + breathe; b.tail2.rotation.x = 0.04;
    b.neck.rotation.x = Math.sin(e.phase * 2) * 0.04 * g - e.jaw * (e.state === "roar" ? 0.4 : 0.1) + e.lean * 0.15;
    b.head.rotation.x = -e.jaw * 0.15 + (e.kind === "trike" ? e.lean * 0.45 : 0);
    b.jaw.rotation.x = e.jaw * (e.kind === "rex" ? 0.65 : 0.5);
    if (b.frill) b.frill.scaling.setAll(e.kind === "spitter" ? 0.55 + e.flare * 0.65 : 1 + e.flare * 0.12);
    const tele = e.state === "windup" ? 0.35 + 0.35 * Math.abs(Math.sin(this.elapsed * 22)) : 0;
    const overlay = e.flash > 0 ? 0.75 : tele;
    for (const m of e.model.meshes) {
      m.renderOverlay = overlay > 0;
      m.overlayAlpha = overlay;
      m.overlayColor = e.flash > 0 ? FLASH : TELEGRAPH;
    }
    // Footfall dust and tremor for heavy species.
    if ((e.kind === "rex" || e.kind === "trike") && g > 0.3) {
      const side = s > 0 ? 1 : -1;
      if (side !== e.stepSide) {
        e.stepSide = side;
        if (e.kind === "rex") { const d = Vector3.Distance(e.pos, this.pos); this.shake = Math.max(this.shake, clamp(0.25 - d * 0.012, 0, 0.25)); }
        this.burst(e.pos.add(new Vector3(0, 0.1, 0)), Color3.FromHexString(this.world.biome.ground[2]), 5, 1.5, 0.45, 0.6, -2, false);
      }
    }
  }

  updateEnemies(dt: number) {
    const h = this.world.heightAt;
    for (const e of this.enemies) {
      if (e.state === "dead") continue;
      e.flash -= dt;
      this.think(e, dt);
      if (e.state !== "leap") {
        e.pos.addInPlace(e.knock.scale(dt));
        e.knock.scaleInPlace(Math.max(0, 1 - dt * 5));
        for (const c of this.world.colliders) {
          const dx = e.pos.x - c.x, dz = e.pos.z - c.z, dd = Math.hypot(dx, dz), min = c.r + e.radius * 0.7;
          if (dd < min && dd > 1e-4) { e.pos.x = c.x + (dx / dd) * min; e.pos.z = c.z + (dz / dd) * min; }
        }
        e.pos.y = h(e.pos.x, e.pos.z);
      }
      if (!e.breached && Math.hypot(e.pos.x, e.pos.z) < FENCE) {
        e.breached = true;
        this.burst(e.pos.add(new Vector3(0, 1.2, 0)), Color3.FromHexString(this.sector.color), 30, 5, 0.3, 0.5, -3, true);
        this.audio.zap();
      }
    }
    // Keep bodies from overlapping each other and the ranger.
    const live = this.enemies.filter(e => e.state !== "dead");
    for (let i = 0; i < live.length; i++) {
      const a = live[i];
      for (let j = i + 1; j < live.length; j++) {
        const b = live[j], dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), min = (a.radius + b.radius) * 0.85;
        if (d < min && d > 1e-4) {
          const push = (min - d) / 2, nx = dx / d, nz = dz / d, wa = b.kind === "rex" ? 1.6 : 1, wb = a.kind === "rex" ? 1.6 : 1;
          a.pos.x -= nx * push * wa; a.pos.z -= nz * push * wa; b.pos.x += nx * push * wb; b.pos.z += nz * push * wb;
        }
      }
      if (a.state !== "leap" && a.state !== "charge") {
        const dx = a.pos.x - this.pos.x, dz = a.pos.z - this.pos.z, d = Math.hypot(dx, dz), min = a.radius + 0.45;
        if (d < min && d > 1e-4) { a.pos.x = this.pos.x + (dx / d) * min; a.pos.z = this.pos.z + (dz / d) * min; }
      }
    }
    for (const e of this.enemies) {
      const root = e.model.root;
      if (e.state === "dead") {
        e.deadT += dt;
        root.rotation.z = Math.min(1.45, e.deadT * 4) * (e.id % 2 ? 1 : -1);
        root.position.y = e.pos.y - Math.max(0, e.deadT - 1) * 1.2;
        for (const m of e.model.meshes) { m.renderOverlay = true; m.overlayColor = TINT[e.kind]; m.overlayAlpha = Math.min(0.8, e.deadT * 0.6); }
        continue;
      }
      root.position.copyFrom(e.pos);
      root.rotation.y = e.yaw;
      if (e.state !== "leap") {
        const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw), L = e.radius * 1.6;
        const pitch = Math.atan2(h(e.pos.x + fx * L, e.pos.z + fz * L) - h(e.pos.x - fx * L, e.pos.z - fz * L), 2 * L);
        root.rotation.x += (clamp(-pitch, -0.35, 0.35) - root.rotation.x) * damp(8, dt);
      }
      this.animate(e, dt);
      e.bar.position.set(e.pos.x, e.pos.y + e.height + 0.55, e.pos.z);
    }
    for (const e of this.enemies.filter(x => x.state === "dead" && x.deadT > 2.4)) {
      e.model.root.dispose(false, false); // materials are shared per species
      e.bar.dispose(false, false);
      this.enemies.splice(this.enemies.indexOf(e), 1);
    }
  }

  /* ───────────── FX helpers ───────────── */

  burst(at: Vector3, color: Color3, count: number, power: number, size: number, life: number, gravity: number, additive: boolean) {
    const ps = this.bursts[this.burstIx++ % this.bursts.length];
    (ps.emitter as Vector3).copyFrom(at);
    ps.color1 = new Color4(color.r, color.g, color.b, 1);
    ps.color2 = new Color4(Math.min(1, color.r * 1.3 + 0.2), Math.min(1, color.g * 1.3 + 0.2), Math.min(1, color.b * 1.3 + 0.2), 0.9);
    ps.colorDead = new Color4(color.r * 0.3, color.g * 0.3, color.b * 0.3, 0);
    ps.minEmitPower = power * 0.4; ps.maxEmitPower = power;
    ps.minSize = size * 0.4; ps.maxSize = size;
    ps.minLifeTime = life * 0.5; ps.maxLifeTime = life;
    ps.gravity = new Vector3(0, gravity, 0);
    ps.blendMode = additive ? ParticleSystem.BLENDMODE_ADD : ParticleSystem.BLENDMODE_STANDARD;
    ps.manualEmitCount = Math.round(count * (this.settings.quality === "low" ? 0.5 : 1));
  }
  ring(center: Vector3, max: number, speed: number, color: Color3, hostile: boolean, damage: number) {
    const mesh = MeshBuilder.CreateTorus("ring", { diameter: 2, thickness: hostile ? 0.18 : 0.12, tessellation: 64 }, this.scene);
    const m = this.ringMat.clone("ringMat") as StandardMaterial;
    m.emissiveColor = color; m.metadata = { glow: true };
    mesh.material = m; mesh.isPickable = false;
    mesh.position.set(center.x, center.y + 0.25, center.z);
    this.rings.push({ mesh, center, r: 0.5, speed, max, hit: false, damage, color, hostile });
  }
  floatText(at: Vector3, text: string, cls: string) {
    const host = this.ui.damage;
    if (!host) return;
    let f = this.floaters.find(x => x.life <= 0);
    if (!f) {
      if (this.floaters.length > 40) return;
      const el = document.createElement("span");
      host.appendChild(el);
      f = { el, pos: at, vy: 0, life: 0, max: 0 };
      this.floaters.push(f);
    }
    f.el.textContent = text; f.el.className = cls; f.pos = at.clone(); f.vy = 1.6; f.life = f.max = 0.9;
  }
  hitMarker(head: boolean) {
    const x = this.ui.crosshair;
    if (!x) return;
    x.classList.remove("hit", "crit");
    void x.offsetWidth;
    x.classList.add(head ? "crit" : "hit");
  }

  /* ───────────── Main loop ───────────── */

  update() {
    const now = performance.now(), raw = this.fixedStep || Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.paused) {
      const gp = Array.from(navigator.getGamepads?.() ?? []).find(p => p && p.connected);
      const start = !!gp?.buttons[9]?.pressed;
      if (start && !this.padPrev[9]) this.cb.resume?.();
      this.padPrev[9] = start;
      if (now - this.pausedDraw > 250) { this.pausedDraw = now; this.scene.render(); }
      return;
    }
    const dt = raw * this.timeScale;
    this.elapsed += dt;
    this.fireClock -= dt; this.droneClock -= dt; this.dashClock -= dt; this.dashTime -= dt; this.invuln -= dt; this.slow -= dt; this.comboClock -= dt;
    if (this.comboClock <= 0) this.combo = 0;

    const pad = this.pollGamepad(dt);
    this.updateRanger(dt, pad);
    if (!this.finished) this.updateSpawns(dt);
    this.updateEnemies(dt);
    this.updateShots(dt);
    this.updatePickups(dt);
    this.updateHazards(dt);
    this.updateCamera(raw);
    this.world.tick(dt, this.elapsed);
    this.updateOverlay(raw);
    this.checkEnd(raw);
    this.audio.pulse(raw, this.health < 30 && !this.finished);

    this.hudClock -= raw;
    if (this.hudClock <= 0) { this.hudClock = 0.08; this.pushHud(); }
    this.scene.render();
  }

  updateRanger(dt: number, pad: { x: number; z: number } | null) {
    const h = this.world.heightAt, b = this.ranger.bones;
    if (this.dying) {
      this.dying += dt;
      this.ranger.root.rotation.x = -Math.min(1.5, this.dying * 3);
      this.ranger.root.position.y = this.pos.y + Math.min(0.25, this.dying);
      return;
    }
    const k = this.keys;
    const left = k.has("KeyA") || k.has("ArrowLeft"), right = k.has("KeyD") || k.has("ArrowRight"), up = k.has("KeyW") || k.has("ArrowUp"), down = k.has("KeyS") || k.has("ArrowDown");
    let lx = (right ? 1 : 0) - (left ? 1 : 0) + this.touchX, lz = screenForwardZ(up, down, this.touchZ);
    if (pad) { lx += pad.x; lz += pad.z; }
    const yaw = this.settings.camera === "third" ? this.camYaw : 0;
    const w = cameraRelative(lx, lz, yaw);
    const moving = Math.hypot(w.x, w.z) > 0.05;
    const speed = (5.6 + this.up.boots * 0.5) * (this.slow > 0 ? 0.55 : 1) * (this.dashTime > 0 ? 2.7 : 1);
    let mv = new Vector3(w.x, 0, w.z);
    if (this.dashTime > 0 && !moving) mv = new Vector3(Math.sin(this.bodyYaw), 0, Math.cos(this.bodyYaw));
    this.moveVec = mv.scale(speed);
    this.pos.addInPlace(this.moveVec.scale(dt)).addInPlace(this.knock.scale(dt));
    this.knock.scaleInPlace(Math.max(0, 1 - dt * 7));
    for (const c of this.world.colliders) {
      const dx = this.pos.x - c.x, dz = this.pos.z - c.z, d = Math.hypot(dx, dz), min = c.r + 0.45;
      if (d < min && d > 1e-4) { this.pos.x = c.x + (dx / d) * min; this.pos.z = c.z + (dz / d) * min; }
    }
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > ARENA) { this.pos.x *= ARENA / r; this.pos.z *= ARENA / r; }
    const ground = h(this.pos.x, this.pos.z);
    if (!this.grounded) {
      this.velY -= 20 * dt;
      this.pos.y += this.velY * dt;
      if (this.pos.y <= ground) { this.pos.y = ground; this.grounded = true; this.velY = 0; this.audio.land(); }
    } else this.pos.y = ground;

    // Facing: third-person faces the camera; tactical faces travel or the aim.
    const firing = this.firingHeld || this.mouseFiring;
    let wantYaw = this.bodyYaw;
    if (this.settings.camera === "third" && !this.isTouch) wantYaw = this.camYaw;
    else if (moving && !firing) wantYaw = Math.atan2(w.x, w.z);
    this.bodyYaw += angleTo(this.bodyYaw, wantYaw) * damp(14, dt);
    const root = this.ranger.root;
    root.position.copyFrom(this.pos);
    root.rotation.y = this.bodyYaw;

    // Legs follow local travel direction so strafing and back-pedalling read correctly.
    const localZ = mv.x * Math.sin(this.bodyYaw) + mv.z * Math.cos(this.bodyYaw);
    const gait = moving ? 1 : 0;
    this.walkPhase += dt * (moving ? 9 + this.up.boots * 0.4 : 0) * (this.dashTime > 0 ? 1.6 : 1);
    const s = Math.sin(this.walkPhase) * 0.6 * gait * (localZ < -0.3 ? -1 : 1);
    if (this.grounded) {
      b.thigh_L.rotation.x = -s; b.thigh_R.rotation.x = s;
      b.shin_L.rotation.x = Math.max(0, Math.cos(this.walkPhase)) * 0.8 * gait; b.shin_R.rotation.x = Math.max(0, -Math.cos(this.walkPhase)) * 0.8 * gait;
    } else {
      b.thigh_L.rotation.x = -0.7; b.thigh_R.rotation.x = -0.3; b.shin_L.rotation.x = 1.1; b.shin_R.rotation.x = 0.6;
    }
    b.pelvis.position.y = 0.98 - Math.abs(Math.cos(this.walkPhase)) * 0.05 * gait;
    b.spine.rotation.x = this.dashTime > 0 ? 0.35 : moving ? 0.08 : 0;
    const pitch = this.settings.camera === "third" && !this.isTouch ? clamp(this.camPitch - 0.2, -0.6, 0.8) : 0;
    this.recoil = Math.max(0, this.recoil - dt * 9);
    b.chest.rotation.x = pitch * 0.5 + Math.sin(this.elapsed * 2) * 0.015;
    b.rifle.rotation.x = pitch * 0.5 - this.recoil * 0.12;
    b.armR.rotation.x = pitch * 0.5 - this.recoil * 0.08; b.armL.rotation.x = pitch * 0.5 - this.recoil * 0.08;
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 30);
    if (this.dashTime > 0) this.trail.manualEmitCount = 6;

    // Pulse drone orbits off the left shoulder and bobs.
    const t = this.elapsed;
    const side = new Vector3(-Math.cos(this.bodyYaw), 0, Math.sin(this.bodyYaw));
    const target = this.pos.add(side.scale(1.1)).add(new Vector3(Math.sin(t * 1.3) * 0.3, 2.4 + Math.sin(t * 2.4) * 0.15, Math.cos(t * 1.1) * 0.3));
    this.drone.root.position = Vector3.Lerp(this.drone.root.position, target, damp(6, dt));
    this.drone.bones.ring.rotation.y += dt * 6;
    if (firing) this.fire(true);
    if (!this.finished) this.droneFire();
  }

  updateSpawns(dt: number) {
    this.spawnClock -= dt;
    const live = this.enemies.filter(e => e.state !== "dead").length;
    const cap = 3 + Math.min(8, Math.floor(this.sector.threat * 0.7));
    if (this.spawnClock <= 0 && this.spawned < this.sector.target && live < cap) {
      const finalBoss = this.sector.boss && this.spawned === this.sector.target - 1;
      this.spawn(finalBoss ? this.sector.boss : undefined);
      this.spawnClock = Math.max(0.55, 2.1 - this.sector.threat * 0.1);
      // Raptors hunt in packs of two or three.
      const last = this.enemies[this.enemies.length - 1];
      if (last?.kind === "raptor" && Math.random() < 0.55) {
        for (let i = 0; i < 1 + (Math.random() < 0.4 ? 1 : 0) && this.spawned < this.sector.target - (this.sector.boss ? 1 : 0) && live + i + 1 < cap; i++) {
          this.spawn("raptor");
          const mate = this.enemies[this.enemies.length - 1];
          mate.pos.copyFrom(last.pos.add(new Vector3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4)));
          mate.flank = -last.flank;
        }
      }
    }
  }

  updateShots(dt: number) {
    const h = this.world.heightAt;
    for (const s of [...this.shots]) {
      const prev = s.pos.clone();
      s.vel.y -= s.gravity * dt;
      s.pos.addInPlace(s.vel.scale(dt));
      s.life -= dt;
      s.mesh.position.copyFrom(s.pos);
      if (s.owner !== "acid") s.mesh.lookAt(s.pos.add(s.vel));
      let done = s.life <= 0;
      if (s.owner === "acid") {
        if (Vector3.Distance(s.pos, this.pos.add(new Vector3(0, 1, 0))) < 0.9) { this.hurt(s.dmg, s.pos, 3, "ACID HIT"); done = true; this.splash(s.pos, false); }
        else if (s.pos.y < h(s.pos.x, s.pos.z)) { this.splash(s.pos, true); done = true; }
      } else {
        const seg = s.pos.subtract(prev), len = seg.length(), d = seg.scale(1 / Math.max(len, 1e-5));
        let best: { e: Enemy; t: number; head: boolean } | null = null;
        for (const e of this.enemies) {
          if (e.state === "dead") continue;
          const hit = this.rayHit(prev, d, e);
          if (hit && hit.t <= len && (!best || hit.t < best.t)) best = { e, t: hit.t, head: hit.head };
        }
        if (best) {
          const at = prev.add(d.scale(best.t));
          best.e.knock.addInPlace(flat(d).scale(best.e.kind === "rex" ? 0.2 : 1.4));
          this.damage(best.e, s.dmg, s.owner, best.head && s.owner === "ranger", this.pos);
          this.burst(at, s.owner === "drone" ? Color3.FromHexString("#ff7fd8") : TINT[best.e.kind], 14, 4, 0.3, 0.35, -5, true);
          this.audio.hit();
          done = true;
        } else if (s.pos.y < h(s.pos.x, s.pos.z)) {
          this.burst(s.pos, Color3.FromHexString("#9ffcff"), 8, 2.5, 0.25, 0.3, -6, true);
          done = true;
        }
      }
      if (done) { s.mesh.dispose(); this.shots.splice(this.shots.indexOf(s), 1); }
    }
  }
  splash(at: Vector3, puddle: boolean) {
    this.burst(at, Color3.FromHexString("#d9ff3f"), 30, 4, 0.4, 0.6, -8, true);
    this.audio.splash();
    if (!puddle) return;
    const mesh = MeshBuilder.CreateDisc("puddle", { radius: 1.5, tessellation: 24 }, this.scene);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(at.x, this.world.heightAt(at.x, at.z) + 0.07, at.z);
    mesh.material = slotMaterial(this.scene, "glow", "#b7ff3a");
    mesh.isPickable = false;
    this.puddles.push({ pos: mesh.position.clone(), r: 1.5, life: 4, mesh });
  }

  updatePickups(dt: number) {
    const magnet = 4.5 + this.up.boots * 0.6;
    for (const p of [...this.pickups]) {
      p.life -= dt;
      const ground = this.world.heightAt(p.pos.x, p.pos.z) + 0.6;
      p.vy -= 12 * dt; p.pos.y = Math.max(ground, p.pos.y + p.vy * dt);
      if (p.pos.y <= ground) p.vy = 0;
      const to = this.pos.add(new Vector3(0, 0.9, 0)).subtract(p.pos), d = to.length();
      if (d < magnet) p.pos.addInPlace(to.normalize().scale(Math.min(d, (14 - d) * dt)));
      p.mesh.position.set(p.pos.x, p.pos.y + Math.sin(this.elapsed * 3 + p.value) * 0.12, p.pos.z);
      p.mesh.rotation.y += dt * 2.5;
      p.mesh.isVisible = p.life > 4 || Math.sin(p.life * 18) > 0;
      if (d < 1.3) {
        if (p.kind === "core") { this.cores += p.value; this.score += p.value * 60; this.audio.pickup(); this.floatText(p.pos.add(new Vector3(0, 0.6, 0)), `+${p.value} CORE`, "core"); }
        else { this.health = Math.min(100, this.health + p.value); this.audio.heal(); this.floatText(p.pos.add(new Vector3(0, 0.6, 0)), `+${p.value} INTEGRITY`, "heal"); }
        this.burst(p.pos, p.kind === "core" ? Color3.FromHexString("#3dfff0") : Color3.FromHexString("#ff5fa8"), 20, 3, 0.3, 0.4, 0, true);
        p.mesh.dispose(); this.pickups.splice(this.pickups.indexOf(p), 1);
      } else if (p.life <= 0) { p.mesh.dispose(); this.pickups.splice(this.pickups.indexOf(p), 1); }
    }
  }

  updateHazards(dt: number) {
    for (const r of [...this.rings]) {
      r.r += r.speed * dt;
      r.mesh.scaling.set(r.r, 1, r.r);
      (r.mesh.material as StandardMaterial).alpha = 0.85 * (1 - r.r / r.max);
      if (r.hostile && !r.hit && !this.finished) {
        const d = Vector3.Distance(flat(this.pos), flat(r.center)), air = this.pos.y - this.world.heightAt(this.pos.x, this.pos.z);
        if (Math.abs(d - r.r) < 0.8 && air < 0.45) { r.hit = true; this.hurt(r.damage, r.center, 10, "SHOCKWAVE · JUMP IT!"); }
        else if (Math.abs(d - r.r) < 0.8 && air >= 0.45 && !r.hit) { r.hit = true; this.floatText(this.pos.add(new Vector3(0, 2.3, 0)), "CLEARED", "evade"); }
      }
      if (r.r >= r.max) { r.mesh.material?.dispose(); r.mesh.dispose(); this.rings.splice(this.rings.indexOf(r), 1); }
    }
    for (const p of [...this.puddles]) {
      p.life -= dt;
      p.mesh.scaling.setAll(Math.min(1, p.life));
      if (p.life <= 0) { p.mesh.dispose(); this.puddles.splice(this.puddles.indexOf(p), 1); }
    }
    this.hazardTick -= dt;
    if (this.hazardTick <= 0 && this.grounded && !this.finished) {
      const hazard = this.puddles.find(p => Vector3.Distance(flat(p.pos), flat(this.pos)) < p.r) ?? this.world.pools.find(p => Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < p.r);
      if (hazard) {
        this.hazardTick = 0.5;
        const lava = this.world.biome.pools === "#ff5a1a" && !("life" in hazard);
        this.hurt(lava ? 6 : 4, this.pos, 0, Math.random() < 0.3 ? (lava ? "LAVA BURN" : "ACID BURN") : undefined, true);
        this.slow = Math.max(this.slow, 0.3);
      }
    }
  }

  updateCamera(raw: number) {
    const cam = this.camera, h = this.world.heightAt;
    this.shake = Math.max(0, this.shake - raw * 1.6);
    this.fovKick = Math.max(0, this.fovKick - raw * 0.6);
    const sh = this.settings.shake ? this.shake * this.shake : 0;
    const jitter = new Vector3((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    let desired: Vector3, target: Vector3;
    if (this.settings.camera === "third") {
      const fwd = this.aimDirection(), right = new Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
      const pivot = this.pos.add(new Vector3(0, 1.75, 0)).add(right.scale(this.isTouch ? 0.4 : 0.7));
      desired = pivot.subtract(fwd.scale(this.camDist + this.fovKick * 4));
      const floor = h(desired.x, desired.z) + 0.45;
      if (desired.y < floor) desired.y = floor;
      cam.position = Vector3.Lerp(cam.position, desired, damp(20, raw)).add(jitter);
      target = cam.position.add(fwd);
    } else {
      desired = this.pos.add(new Vector3(0, 20, -14));
      cam.position = Vector3.Lerp(cam.position, desired, damp(6, raw)).add(jitter);
      target = this.pos.add(new Vector3(0, 0, 2));
    }
    cam.setTarget(target);
    cam.fov = 0.95 + this.fovKick;
    if (this.world.shadow) this.world.sun.position = this.pos.subtract(this.world.sun.direction.scale(60));
    this.world.weatherAnchor.set(this.pos.x, this.pos.y, this.pos.z);
    this.trail.emitter = this.pos.clone();
    if (this.pipeline) {
      this.aberration = Math.max(0, this.aberration - raw * 2.5);
      this.pipeline.chromaticAberration.aberrationAmount = this.aberration * 60;
    }
  }

  updateOverlay(raw: number) {
    // Floating damage numbers, projected into screen space.
    const w = this.engine.getRenderWidth(), hh = this.engine.getRenderHeight();
    const vp = this.camera.viewport.toGlobal(w, hh), tm = this.scene.getTransformMatrix();
    const sx = window.innerWidth / w, sy = window.innerHeight / hh;
    for (const f of this.floaters) {
      if (f.life <= 0) { if (f.el.style.opacity !== "0") f.el.style.opacity = "0"; continue; }
      f.life -= raw; f.pos.y += f.vy * raw; f.vy *= 0.96;
      const p = Vector3.Project(f.pos, Matrix.IdentityReadOnly, tm, vp);
      if (p.z > 1 || p.z < 0) { f.el.style.opacity = "0"; continue; }
      f.el.style.opacity = String(Math.min(1, f.life / (f.max * 0.4)));
      f.el.style.transform = `translate(${(p.x * sx).toFixed(1)}px,${(p.y * sy).toFixed(1)}px) translate(-50%,-50%) scale(${(1 + (f.max - f.life) * 0.3).toFixed(2)})`;
    }
    this.hurtFlash = Math.max(0, this.hurtFlash - raw * 2.2);
    const v = this.ui.vignette;
    if (v) {
      const low = this.health < 30 ? 0.35 + 0.25 * Math.sin(this.elapsed * 6) : 0;
      v.style.opacity = String(Math.max(this.hurtFlash * 0.85, low));
    }
    if (this.ui.crosshair) this.ui.crosshair.style.display = this.settings.camera === "third" && !this.isTouch && !this.finished ? "block" : "none";
    this.radarClock -= raw;
    if (this.radarClock <= 0) { this.radarClock = 0.05; this.drawRadar(); }
  }

  drawRadar() {
    const c = this.ui.radar;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const S = c.width, R = S / 2, range = 42;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.translate(R, R);
    ctx.beginPath(); ctx.arc(0, 0, R - 1, 0, Math.PI * 2); ctx.fillStyle = "rgba(4,16,14,.78)"; ctx.fill();
    ctx.strokeStyle = "rgba(53,232,255,.35)"; ctx.lineWidth = 1;
    for (const k of [0.33, 0.66]) { ctx.beginPath(); ctx.arc(0, 0, (R - 2) * k, 0, Math.PI * 2); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(0, 0, R - 1, 0, Math.PI * 2); ctx.strokeStyle = "rgba(53,232,255,.7)"; ctx.stroke();
    ctx.clip();
    const yaw = this.settings.camera === "third" ? this.camYaw : 0, cs = Math.cos(yaw), sn = Math.sin(yaw);
    const plot = (x: number, z: number) => {
      const dx = x - this.pos.x, dz = z - this.pos.z;
      return [(dx * cs - dz * sn) * (R / range), -(dx * sn + dz * cs) * (R / range)];
    };
    // Arena fence.
    ctx.beginPath();
    const [fx, fy] = plot(0, 0);
    ctx.arc(fx, fy, FENCE * (R / range), 0, Math.PI * 2);
    ctx.strokeStyle = this.sector.color + "88"; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
    // View cone.
    ctx.fillStyle = "rgba(97,255,154,.12)";
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55); ctx.closePath(); ctx.fill();
    for (const p of this.pickups) {
      const [x, y] = plot(p.pos.x, p.pos.z);
      ctx.fillStyle = p.kind === "core" ? "#3dfff0" : "#ff5fa8";
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    for (const e of this.enemies) {
      if (e.state === "dead") continue;
      const [x, y] = plot(e.pos.x, e.pos.z), rr = e.kind === "rex" ? 5.5 : e.kind === "trike" || e.kind === "anky" ? 3.8 : 2.8;
      ctx.fillStyle = SPECIES.find(s => s.key === e.kind)!.color;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill();
      if (e.state === "windup") { ctx.strokeStyle = "#ff3b4f"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, rr + 3, 0, Math.PI * 2); ctx.stroke(); }
    }
    ctx.restore();
    ctx.save(); ctx.translate(R, R);
    ctx.rotate(this.settings.camera === "third" ? this.bodyYaw - this.camYaw : this.bodyYaw);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-4.5, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  checkEnd(raw: number) {
    if (this.finished) {
      this.timeScale = Math.min(1, this.timeScale + raw * 0.6);
      return;
    }
    if (this.dying > 1.4) { this.finished = true; this.cb.fail(this.result()); return; }
    const live = this.enemies.some(e => e.state !== "dead");
    if (this.kills >= this.sector.target && !live && !this.dying) {
      this.finished = true;
      this.timeScale = 0.25;
      this.cb.banner?.("SECTOR SECURED", `${this.sector.name} is safe`);
      if (this.locked) document.exitPointerLock?.();
      this.endTimer = window.setTimeout(() => { if (!this.destroyed) this.cb.complete(this.result()); }, 1600);
    }
  }
  result(): Result {
    return { kills: this.kills, cores: this.cores, score: this.score, health: Math.round(this.health), time: Math.round(this.elapsed), accuracy: this.shotsFired ? Math.round((this.shotsHit / this.shotsFired) * 100) : 0, bestCombo: this.bestCombo };
  }
  pushHud() {
    this.cb.hud({
      health: Math.round(this.health), kills: `${this.kills}/${this.sector.target}`, cores: this.cores, score: this.score, combo: this.combo,
      dash: Math.max(0, this.dashClock), dashMax: Math.max(2.2, 4.6 - this.up.boots * 0.5), emp: Math.round(this.emp), airborne: !this.grounded,
      threat: Math.min(100, Math.round((this.spawned / this.sector.target) * 100)),
      boss: this.boss ? { name: NAMES[this.boss.kind], hp: Math.max(0, this.boss.hp / this.boss.maxHp) } : null,
      locked: this.locked, camera: this.settings.camera, hint: this.hint,
    });
  }

  destroy() {
    this.destroyed = true;
    window.clearTimeout(this.endTimer);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("keydown", this.keydown);
    window.removeEventListener("keyup", this.keyup);
    window.removeEventListener("mouseup", this.mouseup);
    window.removeEventListener("mousemove", this.mousemove);
    document.removeEventListener("pointerlockchange", this.lockchange);
    document.removeEventListener("pointerlockerror", this.lockerror);
    document.removeEventListener("visibilitychange", this.visibility);
    const c = this.canvas();
    c.removeEventListener("mousedown", this.mousedown);
    c.removeEventListener("wheel", this.wheel);
    c.removeEventListener("contextmenu", this.noMenu);
    if (document.pointerLockElement === c) document.exitPointerLock?.();
    for (const f of this.floaters) f.el.remove();
    this.audio.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}

