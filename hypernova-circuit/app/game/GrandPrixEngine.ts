import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  assetGeometries,
  blueprintMaterial,
  createBlueprintModel,
  thrusterAnchors,
  type BlueprintAssetId,
} from "./blueprint-mesh";
import {
  GHOST_INTERVAL,
  GRID_SIZE,
  RIVALS,
  driveStats,
  loadGhost,
  raceReward,
  rivalSkill,
  rivalStats,
  storeGhost,
  type GhostLap,
} from "./grand-prix";
import { effectiveStats, type CarSpec, type UpgradeLevels } from "./progression";
import {
  aiInput,
  createCarState,
  resolveContacts,
  stepCar,
  WALL_LIMIT,
  type AiDriver,
  type CarState,
  type DriveInput,
  type DriveStats,
} from "./race-physics";
import {
  getTrack,
  lapDelta,
  minimapPoint,
  TRACK_HALF_WIDTH,
  type Frame,
  type RaceTrack,
} from "./track";
import { buildTrackScene, type BuiltTrack } from "./track-scene";

export type CameraMode = "chase" | "far" | "hood" | "tv";
export const CAMERA_MODES: CameraMode[] = ["chase", "far", "hood", "tv"];
export type ShowroomView = "orbit" | "front" | "rear" | "left" | "right" | "top" | "underside";
export type Quality = "high" | "low";

export type Standing = {
  name: string;
  css: string;
  isPlayer: boolean;
  gap: string;
  finished: boolean;
};

export type GpHud = {
  trackName: string;
  speed: number;
  position: number;
  cars: number;
  lap: number;
  laps: number;
  lapTime: number;
  lastLap: number;
  bestLap: number;
  ghostLap: number;
  raceTime: number;
  shield: number;
  maxShield: number;
  nitro: number;
  drift: number;
  coins: number;
  slipstream: boolean;
  rebooting: boolean;
  camera: CameraMode;
  standings: Standing[];
  dots: { x: number; y: number; css: string; player: boolean }[];
};

export type GpEvent =
  | { type: "countdown"; value: number }
  | { type: "go" }
  | { type: "lap"; lap: number; time: number; best: boolean; final: boolean }
  | { type: "coin"; amount: number; combo: number }
  | { type: "nitro" }
  | { type: "repair" }
  | { type: "boost" }
  | { type: "hit"; shield: number }
  | { type: "wall"; impact: number }
  | { type: "bump" }
  | { type: "drift"; amount: number; nitro: number }
  | { type: "overtake"; position: number }
  | { type: "reboot" }
  | { type: "ghost-saved"; time: number };

export type GpResult = {
  trackIndex: number;
  trackId: string;
  trackName: string;
  position: number;
  raceTime: number;
  bestLap: number;
  coins: number;
  reward: number;
  standings: { name: string; team: string; css: string; time: number; isPlayer: boolean }[];
};

type Callbacks = {
  onHud: (hud: GpHud) => void;
  onEvent: (event: GpEvent) => void;
  onFinish: (result: GpResult) => void;
  onQuality?: (quality: Quality) => void;
};

type Mode = "showcase" | "showroom" | "countdown" | "racing" | "paused" | "finished";

type RaceCar = {
  name: string;
  team: string;
  css: string;
  isPlayer: boolean;
  modelId: BlueprintAssetId;
  state: CarState;
  stats: DriveStats;
  ai: AiDriver;
  model: THREE.Group;
  flames: THREE.Mesh[];
  finished: boolean;
  finishTime: number;
  lapStart: number;
  bestLap: number;
  lastLap: number;
  lapsDone: number;
  boosting: boolean;
  throttle: number;
};

type Pickup = {
  kind: "coin" | "nitro" | "repair";
  s: number;
  d: number;
  active: boolean;
  respawn: number;
  object?: THREE.Object3D;
  instance?: number;
};

type Hazard = {
  kind: "mine" | "barrier" | "drone";
  s: number;
  d: number;
  baseD: number;
  phase: number;
  object: THREE.Object3D;
  cooldown: number;
};

type Spark = { position: THREE.Vector3; velocity: THREE.Vector3; life: number };

const FIXED_STEP = 1 / 120;
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();

function clamp(v: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, v));
}

function damp(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

export class GrandPrixEngine {
  private readonly container: HTMLElement;
  private readonly callbacks: Callbacks;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(62, 1, 0.1, 5200);
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly resizeObserver: ResizeObserver;
  private readonly clock = new THREE.Clock();
  private readonly sun = new THREE.DirectionalLight(0xffffff, 2.2);
  private readonly hemi = new THREE.HemisphereLight(0x9ccfff, 0x1a0a22, 1.4);
  private readonly envTexture: THREE.Texture;
  private readonly frame: Frame = {
    position: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    right: new THREE.Vector3(),
    up: new THREE.Vector3(),
  };

  private quality: Quality;
  private autoQuality: boolean;
  private fpsSamples: number[] = [];
  private animationFrame = 0;
  private suspended = false;
  private mode: Mode = "showcase";
  private trackIndex = 0;
  private track: RaceTrack;
  private built: BuiltTrack | null = null;
  private cars: RaceCar[] = [];
  private player: RaceCar | null = null;
  private playerCar: CarSpec | null = null;
  private upgrades: UpgradeLevels = { engine: 0, handling: 0, shield: 0, magnet: 0 };
  private pickups: Pickup[] = [];
  private coinMeshes: THREE.InstancedMesh[] = [];
  private hazards: Hazard[] = [];
  private sparks: Spark[] = [];
  private sparkPoints: THREE.Points;
  private speedLines: THREE.LineSegments;
  private ghost: GhostLap | null = null;
  private ghostModel: THREE.Group | null = null;
  private ghostRecording: number[] = [];
  private ghostClock = 0;
  private turntable: THREE.Mesh | null = null;

  private input: DriveInput = { steer: 0, throttle: 1, brake: 0, boost: false };
  private cameraMode: CameraMode = "chase";
  private lookBack = false;
  private showroomView: ShowroomView = "orbit";
  private wireframe = false;
  private wireMaterial = new THREE.MeshBasicMaterial({ color: 0x3de9ff, wireframe: true, toneMapped: false });
  private elapsed = 0;
  private accumulator = 0;
  private raceTime = 0;
  private countdown = 0;
  private lastCountdown = 4;
  private hudTimer = 0;
  private shield = 100;
  private maxShield = 100;
  private damageReduction = 0;
  private magnetRadius = 2;
  private nitro = 50;
  private coins = 0;
  private combo = 1;
  private comboTimer = 0;
  private reboot = 0;
  private slipstream = false;
  private shake = 0;
  private lastPosition = GRID_SIZE;
  private tvCamera = new THREE.Vector3();
  private tvCameraS = -1000;
  private showcaseShot = 0;
  private showcaseTimer = 0;
  private cameraPos = new THREE.Vector3();
  private cameraLook = new THREE.Vector3();
  private cameraReady = false;
  private finishSent = false;

  constructor(container: HTMLElement, callbacks: Callbacks, quality: "auto" | Quality = "auto") {
    this.container = container;
    this.callbacks = callbacks;
    const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
    this.autoQuality = quality === "auto";
    this.quality = quality === "auto" ? (coarse ? "low" : "high") : quality;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = "race-canvas gp-canvas";
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    container.prepend(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.envTexture = pmrem.fromScene(room, 0.04).texture;
    room.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    pmrem.dispose();
    this.scene.environment = this.envTexture;
    this.scene.environmentIntensity = 0.55;

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.6, 0.45, 0.86);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.sun.position.set(-60, 120, -40);
    this.sun.shadow.mapSize.set(1024, 1024);
    const shadowCam = this.sun.shadow.camera;
    shadowCam.left = -30;
    shadowCam.right = 30;
    shadowCam.top = 30;
    shadowCam.bottom = -30;
    shadowCam.near = 1;
    shadowCam.far = 300;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun, this.sun.target, this.hemi);

    this.sparkPoints = this.createSparks();
    this.speedLines = this.createSpeedLines();
    this.scene.add(this.sparkPoints, this.camera);
    this.camera.add(this.speedLines);

    this.track = getTrack(0);
    this.applyQuality();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.loadTrack(0);
    this.setupShowcase();
  }

  // ---------------------------------------------------------------- public API

  start(): void {
    if (this.animationFrame) return;
    this.clock.start();
    this.loop();
  }

  suspend(): void {
    this.suspended = true;
    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
    this.renderer.domElement.style.display = "none";
  }

  wake(): void {
    if (!this.suspended) return;
    this.suspended = false;
    this.renderer.domElement.style.display = "";
    this.clock.getDelta();
    this.start();
  }

  getQuality(): Quality {
    return this.quality;
  }

  setQuality(setting: "auto" | Quality): void {
    this.autoQuality = setting === "auto";
    if (setting !== "auto") this.quality = setting;
    this.fpsSamples = [];
    this.applyQuality();
  }

  showcase(trackIndex: number): void {
    if (trackIndex !== this.trackIndex) this.loadTrack(trackIndex);
    this.setupShowcase();
  }

  showroom(car: CarSpec, upgrades: UpgradeLevels): void {
    this.playerCar = car;
    this.upgrades = { ...upgrades };
    if (this.mode !== "showroom") {
      this.mode = "showroom";
      this.setupShowcase();
      this.mode = "showroom";
    }
    this.buildShowroomCar();
  }

  setShowroomView(view: ShowroomView): void {
    this.showroomView = view;
  }

  setWireframe(on: boolean): void {
    this.wireframe = on;
    const target = this.cars.find((c) => c.isPlayer)?.model;
    target?.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      if (on) {
        o.userData.solid = o.userData.solid ?? o.material;
        o.material = this.wireMaterial;
      } else if (o.userData.solid) {
        o.material = o.userData.solid;
      }
    });
  }

  startRace(trackIndex: number, car: CarSpec, upgrades: UpgradeLevels): void {
    this.setWireframe(false);
    if (trackIndex !== this.trackIndex) this.loadTrack(trackIndex);
    this.playerCar = car;
    this.upgrades = { ...upgrades };
    const stats = effectiveStats(car, upgrades);
    this.maxShield = stats.maxShield;
    this.shield = stats.maxShield;
    this.damageReduction = stats.damageReduction;
    this.magnetRadius = 1.6 + stats.magnetRadius * 0.9;
    this.nitro = 40;
    this.coins = 0;
    this.combo = 1;
    this.comboTimer = 0;
    this.reboot = 0;
    this.raceTime = 0;
    this.countdown = 3.999;
    this.lastCountdown = 4;
    this.finishSent = false;
    this.lastPosition = GRID_SIZE;
    this.input = { steer: 0, throttle: 1, brake: 0, boost: false };
    this.buildField(true);
    this.resetPickups();
    this.ghost = loadGhost(this.track.spec.id);
    this.ghostRecording = [];
    this.ghostClock = 0;
    this.setupGhostModel();
    this.cameraReady = false;
    this.mode = "countdown";
    this.emitHud(true);
  }

  pause(): void {
    if (this.mode === "racing" || this.mode === "countdown") {
      this.pausedFrom = this.mode;
      this.mode = "paused";
    }
  }

  private pausedFrom: Mode = "racing";

  resume(): void {
    if (this.mode === "paused") {
      this.mode = this.pausedFrom;
      this.clock.getDelta();
    }
  }

  isRacing(): boolean {
    return this.mode === "racing" || this.mode === "countdown";
  }

  setSteer(value: number): void {
    this.input.steer = clamp(value, -1, 1);
  }

  setBrake(on: boolean): void {
    this.input.brake = on ? 1 : 0;
  }

  setBoost(on: boolean): void {
    this.input.boost = on;
  }

  setLookBack(on: boolean): void {
    this.lookBack = on;
  }

  cycleCamera(): CameraMode {
    const i = CAMERA_MODES.indexOf(this.cameraMode);
    this.cameraMode = CAMERA_MODES[(i + 1) % CAMERA_MODES.length];
    this.cameraReady = false;
    this.emitHud(true);
    return this.cameraMode;
  }

  setCamera(mode: CameraMode): void {
    this.cameraMode = mode;
    this.cameraReady = false;
  }

  dispose(): void {
    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
    this.resizeObserver.disconnect();
    this.clearField();
    this.clearPickups();
    this.built?.dispose();
    this.envTexture.dispose();
    this.wireMaterial.dispose();
    this.sparkPoints.geometry.dispose();
    (this.sparkPoints.material as THREE.Material).dispose();
    this.speedLines.geometry.dispose();
    (this.speedLines.material as THREE.Material).dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ------------------------------------------------------------- track set-up

  private loadTrack(index: number): void {
    this.clearField();
    this.clearPickups();
    if (this.built) {
      this.scene.remove(this.built.root);
      this.built.dispose();
    }
    this.trackIndex = index;
    this.track = getTrack(index);
    this.built = buildTrackScene(this.track, this.quality);
    this.scene.add(this.built.root);
    const look = this.built.look;
    this.scene.fog = new THREE.FogExp2(look.fog, look.fogDensity);
    this.scene.background = new THREE.Color(look.zenith);
    this.sun.color.setHex(look.sun).lerp(new THREE.Color(0xffffff), 0.55);
    this.hemi.color.setHex(look.rail).lerp(new THREE.Color(0xffffff), 0.6);
    this.hemi.groundColor.setHex(look.fog);
    this.spawnHazards();
  }

  private makeCarModel(id: BlueprintAssetId, primary: number, secondary: number): { model: THREE.Group; flames: THREE.Mesh[] } {
    const model = createBlueprintModel(id, { primary, secondary }, { castShadow: true });
    const flames: THREE.Mesh[] = [];
    const flameGeometry = new THREE.ConeGeometry(0.2, 1, 10, 1, true);
    // Base at the nozzle, tip trailing 1 m behind the car (-Z).
    flameGeometry.translate(0, 0.5, 0);
    flameGeometry.rotateX(-Math.PI / 2);
    const flameMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(secondary).multiplyScalar(1.6),
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    for (const anchor of thrusterAnchors(id)) {
      const flame = new THREE.Mesh(flameGeometry, flameMaterial);
      flame.position.copy(anchor);
      flame.scale.set(1, 1, 1);
      model.add(flame);
      flames.push(flame);
    }
    model.userData.flameGeometry = flameGeometry;
    model.userData.flameMaterial = flameMaterial;
    return { model, flames };
  }

  private disposeCar(car: RaceCar): void {
    this.scene.remove(car.model);
    (car.model.userData.flameGeometry as THREE.BufferGeometry | undefined)?.dispose();
    (car.model.userData.flameMaterial as THREE.Material | undefined)?.dispose();
  }

  private clearField(): void {
    for (const car of this.cars) this.disposeCar(car);
    this.cars = [];
    this.player = null;
    if (this.ghostModel) {
      this.scene.remove(this.ghostModel);
      this.ghostModel.traverse((o) => {
        if (o instanceof THREE.Mesh && !o.userData.shared) (o.material as THREE.Material).dispose();
      });
      this.ghostModel = null;
    }
    if (this.turntable) {
      this.scene.remove(this.turntable);
      this.turntable.geometry.dispose();
      (this.turntable.material as THREE.Material).dispose();
      this.turntable = null;
    }
  }

  /** Eight cars on a two-wide grid behind the start line. */
  private buildField(withPlayer: boolean): void {
    this.clearField();
    const track = this.track;
    const entries: { name: string; team: string; css: string; id: BlueprintAssetId; primary: number; secondary: number; stats: DriveStats; skill: number; aggression: number; isPlayer: boolean }[] = [];
    if (withPlayer && this.playerCar) {
      entries.push({
        name: "YOU", team: "Flexzonic", css: this.playerCar.cssPrimary, id: this.playerCar.id,
        primary: this.playerCar.primary, secondary: this.playerCar.secondary,
        stats: driveStats(this.playerCar, this.upgrades), skill: 0.97, aggression: 0.8, isPlayer: true,
      });
    }
    for (const rival of RIVALS) {
      if (entries.length >= GRID_SIZE) break;
      entries.push({
        name: rival.name, team: rival.team, css: rival.css, id: rival.car, primary: rival.primary,
        secondary: rival.secondary, stats: rivalStats(rival, this.trackIndex),
        skill: withPlayer ? rivalSkill(rival, this.trackIndex) : rival.skill,
        aggression: rival.aggression, isPlayer: false,
      });
    }
    // The player starts on the third row so there is a field to pass.
    const slots = withPlayer ? [5, 0, 1, 2, 3, 4, 6, 7] : [0, 1, 2, 3, 4, 5, 6, 7];
    entries.forEach((entry, k) => {
      const slot = slots[k];
      const row = Math.floor(slot / 2);
      const s = track.length - 10 - row * 9;
      const d = slot % 2 === 0 ? -4.2 : 4.2;
      const { model, flames } = this.makeCarModel(entry.id, entry.primary, entry.secondary);
      this.scene.add(model);
      const profileGrip = entry.stats.grip * 0.92;
      const car: RaceCar = {
        name: entry.name,
        team: entry.team,
        css: entry.css,
        isPlayer: entry.isPlayer,
        modelId: entry.id,
        state: createCarState(s, d, s - track.length),
        stats: entry.stats,
        ai: {
          skill: entry.skill,
          aggression: entry.aggression,
          lineBias: (k % 3 - 1) * 0.8,
          lane: d,
          profile: track.buildSpeedProfile(profileGrip, entry.stats.topSpeed, entry.stats.braking * 0.8),
        },
        model,
        flames,
        finished: false,
        finishTime: 0,
        lapStart: 0,
        bestLap: 0,
        lastLap: 0,
        lapsDone: 0,
        boosting: false,
        throttle: 0,
      };
      this.cars.push(car);
      if (entry.isPlayer) this.player = car;
    });
    this.placeCars();
  }

  private setupShowcase(): void {
    const showroom = this.mode === "showroom";
    this.mode = "showcase";
    this.buildField(false);
    // Spread the field around the lap and let them race.
    this.cars.forEach((car, k) => {
      car.state.s = (k * 47 + 30) % this.track.length;
      car.state.total = car.state.s;
      car.state.v = 40;
      car.state.d = this.track.racingLineAt(car.state.s);
    });
    this.resetPickups();
    this.cameraReady = false;
    this.showcaseTimer = 0;
    if (showroom) this.mode = "showroom";
  }

  private buildShowroomCar(): void {
    if (!this.playerCar) return;
    const existing = this.cars.find((c) => c.isPlayer);
    if (existing) {
      this.disposeCar(existing);
      this.cars = this.cars.filter((c) => c !== existing);
    }
    const { model, flames } = this.makeCarModel(this.playerCar.id, this.playerCar.primary, this.playerCar.secondary);
    this.scene.add(model);
    const s = 22;
    const car: RaceCar = {
      name: "YOU", team: "Flexzonic", css: this.playerCar.cssPrimary, isPlayer: true, modelId: this.playerCar.id,
      state: createCarState(s, 0, s), stats: driveStats(this.playerCar, this.upgrades),
      ai: { skill: 1, aggression: 0, lineBias: 0, lane: 0, profile: new Float32Array(this.track.count) },
      model, flames, finished: false, finishTime: 0, lapStart: 0, bestLap: 0, lastLap: 0, lapsDone: 0, boosting: false, throttle: 0,
    };
    this.cars.push(car);
    this.player = car;
    if (!this.turntable) {
      this.turntable = new THREE.Mesh(
        new THREE.CylinderGeometry(4.2, 4.4, 0.18, 64),
        new THREE.MeshStandardMaterial({ color: 0x0c1428, metalness: 0.9, roughness: 0.2, emissive: 0x0a3a5a, emissiveIntensity: 0.6 }),
      );
      this.scene.add(this.turntable);
    }
    this.track.frameAt(s, this.frame);
    this.turntable.position.copy(this.track.pointAt(s, 0, -0.06));
    this.turntable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.frame.up);
    this.setWireframe(this.wireframe);
  }

  private setupGhostModel(): void {
    if (!this.ghost || !this.playerCar) return;
    const model = createBlueprintModel(this.ghost.car);
    const material = new THREE.MeshBasicMaterial({
      color: 0x9df6ff,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    model.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.material = material;
        o.userData.shared = false;
        o.castShadow = false;
      }
    });
    this.ghostModel = model;
    this.scene.add(model);
  }

  private spawnHazards(): void {
    for (const h of this.hazards) this.scene.remove(h.object);
    this.hazards = this.track.spec.hazards.map((spec) => {
      const object = createBlueprintModel(spec.kind);
      this.scene.add(object);
      return { kind: spec.kind, s: spec.s, d: spec.d, baseD: spec.d, phase: spec.s * 0.01, object, cooldown: 0 };
    });
  }

  private clearPickups(): void {
    for (const p of this.pickups) if (p.object) this.scene.remove(p.object);
    this.pickups = [];
    for (const mesh of this.coinMeshes) {
      this.scene.remove(mesh);
      mesh.dispose();
    }
    this.coinMeshes = [];
  }

  private resetPickups(): void {
    this.clearPickups();
    const coinSpots: Pickup[] = [];
    for (const line of this.track.spec.coinLines) {
      for (let k = 0; k < line.count; k += 1) {
        coinSpots.push({ kind: "coin", s: (line.s + k * line.spacing + this.track.length) % this.track.length, d: line.d, active: true, respawn: 0 });
      }
    }
    coinSpots.forEach((p, k) => (p.instance = k));
    if (coinSpots.length) {
      for (const [key, geometry] of assetGeometries("coin")) {
        const mesh = new THREE.InstancedMesh(geometry, blueprintMaterial("coin", key), coinSpots.length);
        mesh.frustumCulled = false;
        this.coinMeshes.push(mesh);
        this.scene.add(mesh);
      }
    }
    const items: Pickup[] = this.track.spec.items.map((item) => {
      const object = createBlueprintModel(item.kind);
      this.scene.add(object);
      return { kind: item.kind, s: item.s, d: item.d, active: true, respawn: 0, object };
    });
    this.pickups = [...coinSpots, ...items];
  }

  // ------------------------------------------------------------------ loop

  private loop = (): void => {
    this.animationFrame = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += dt;
    this.update(dt);
    this.render(dt);
    this.trackFps(dt);
  };

  private update(dt: number): void {
    if (this.mode === "paused") return;
    if (this.mode === "showroom") {
      this.updateShowroom(dt);
      return;
    }
    if (this.mode === "countdown") {
      this.countdown -= dt;
      const value = Math.ceil(this.countdown);
      if (value < this.lastCountdown && value > 0) {
        this.lastCountdown = value;
        this.callbacks.onEvent({ type: "countdown", value });
      }
      if (this.countdown <= 0) {
        this.mode = "racing";
        this.callbacks.onEvent({ type: "go" });
        for (const car of this.cars) car.lapStart = 0;
      }
      this.placeCars();
      this.updateAmbient(dt);
      this.emitHud();
      return;
    }

    this.accumulator += dt;
    while (this.accumulator >= FIXED_STEP) {
      this.fixedStep(FIXED_STEP);
      this.accumulator -= FIXED_STEP;
    }
    this.placeCars();
    this.updateAmbient(dt);
    if (this.mode === "racing" || this.mode === "finished") this.emitHud();
  }

  private fixedStep(dt: number): void {
    const racing = this.mode === "racing" || this.mode === "finished";
    if (racing) this.raceTime += dt;
    const player = this.player;
    const obstacles = [
      ...this.cars.map((c) => ({ s: c.state.s, d: c.state.d, v: c.state.v })),
      ...this.hazards.map((h) => ({ s: h.s, d: h.d, v: 0 })),
    ];

    for (const car of this.cars) {
      let input: DriveInput;
      const autopilot = !car.isPlayer || this.mode === "finished" || this.mode === "showcase";
      if (autopilot) {
        let band = 1;
        if (player && !car.isPlayer && this.mode === "racing") {
          const gap = car.state.total - player.state.total;
          band = gap > 0 ? 1 - Math.min(0.045, gap / 4000) : 1 + Math.min(0.05, -gap / 3000);
        }
        const others = obstacles.filter((o) => o.s !== car.state.s || o.d !== car.state.d);
        input = aiInput(car.state, car.ai, this.track, car.stats, others, band);
        // AI uses boost pads and a little nitro on long straights.
        input.boost = car.state.boostTime > 0;
      } else {
        input = { ...this.input };
        if (this.reboot > 0) {
          input.throttle = 0;
          input.brake = 0.6;
          input.boost = false;
        }
        input.boost = input.boost && this.nitro > 0.5;
      }
      car.boosting = input.boost;
      car.throttle = input.throttle;
      const before = car.state.total;
      const report = stepCar(car.state, input, car.stats, this.track, dt);

      if (car.isPlayer && !autopilot) {
        if (input.boost) this.nitro = Math.max(0, this.nitro - dt * 24);
        else this.nitro = Math.min(100, this.nitro + dt * 1.6);
        if (car.state.drifting) this.nitro = Math.min(100, this.nitro + dt * 6);
        if (report.driftEnded > 0.7) {
          const amount = Math.max(3, Math.min(30, Math.round(report.driftEnded * 7)));
          const nitro = Math.max(5, Math.min(24, Math.round(report.driftEnded * 5)));
          this.coins += amount;
          this.nitro = Math.min(100, this.nitro + nitro);
          this.callbacks.onEvent({ type: "drift", amount, nitro });
        }
        if (report.wallImpact > 6) {
          this.shake = Math.min(1, this.shake + report.wallImpact / 40);
          this.emitSparks(car, Math.sign(car.state.d), Math.min(30, report.wallImpact));
          this.callbacks.onEvent({ type: "wall", impact: report.wallImpact });
          this.damage(report.wallImpact * 0.45);
        } else if (car.state.wallContact > 0 && car.state.v > 20 && Math.random() < 0.3) {
          this.emitSparks(car, Math.sign(car.state.d), 2);
        }
      }

      if (racing) this.updateLaps(car, before);
    }

    // Slipstream: tuck in behind a car for extra speed and nitro.
    if (player && this.mode === "racing") {
      this.slipstream = false;
      for (const other of this.cars) {
        if (other === player) continue;
        const gap = lapDelta(player.state.s, other.state.s, this.track.length);
        if (gap > 4 && gap < 26 && Math.abs(other.state.d - player.state.d) < 2.6 && player.state.v > 35) {
          this.slipstream = true;
          break;
        }
      }
      if (this.slipstream) {
        player.state.v += 2.6 * dt;
        this.nitro = Math.min(100, this.nitro + 5 * dt);
      }
    }

    const hits = resolveContacts(this.cars.map((c) => c.state), this.track.length);
    for (const hit of hits) {
      const a = this.cars[hit.a];
      const b = this.cars[hit.b];
      if ((a.isPlayer || b.isPlayer) && hit.impact > 3 && this.mode === "racing") {
        this.shake = Math.min(1, this.shake + 0.35);
        this.callbacks.onEvent({ type: "bump" });
        this.damage(hit.impact * 0.6);
        this.emitSparks(a.isPlayer ? a : b, a.isPlayer ? Math.sign(b.state.d - a.state.d) : Math.sign(a.state.d - b.state.d), 8);
      }
    }

    this.updatePickups(dt);
    this.updateHazards(dt);

    if (this.reboot > 0) {
      this.reboot -= dt;
      if (this.reboot <= 0) this.shield = this.maxShield * 0.6;
    }
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.combo = 1;

    if (player && this.mode === "racing" && player.state.total >= 0) {
      this.ghostClock += dt;
      if (this.ghostClock >= GHOST_INTERVAL) {
        this.ghostClock -= GHOST_INTERVAL;
        this.ghostRecording.push(+player.state.s.toFixed(2), +player.state.d.toFixed(2), +player.state.psi.toFixed(3));
      }
    }
  }

  private updateLaps(car: RaceCar, before: number): void {
    const L = this.track.length;
    const laps = this.track.spec.laps;
    const lapsDone = Math.max(0, Math.floor(car.state.total / L));
    if (Math.floor(before / L) < Math.floor(car.state.total / L) && car.state.total >= L - 0.001 && lapsDone > car.lapsDone) {
      const lapTime = this.raceTime - car.lapStart;
      car.lapStart = this.raceTime;
      car.lapsDone = lapsDone;
      car.lastLap = lapTime;
      const best = !car.bestLap || lapTime < car.bestLap;
      if (best) car.bestLap = lapTime;
      if (car.isPlayer && this.mode === "racing") {
        if (!this.ghost || lapTime < this.ghost.lapTime) {
          if (this.ghostRecording.length > 30 && this.playerCar) {
            const ghost: GhostLap = { version: 1, trackId: this.track.spec.id, car: this.playerCar.id, lapTime, samples: this.ghostRecording };
            storeGhost(ghost);
            this.ghost = ghost;
            if (!this.ghostModel) this.setupGhostModel();
            this.callbacks.onEvent({ type: "ghost-saved", time: lapTime });
          }
        }
        this.ghostRecording = [];
        this.ghostClock = 0;
        // Coins come back every lap.
        for (const p of this.pickups) if (p.kind === "coin") p.active = true;
        if (lapsDone < laps) {
          this.callbacks.onEvent({ type: "lap", lap: lapsDone, time: lapTime, best, final: lapsDone === laps - 1 });
        }
      }
      if (lapsDone >= laps && !car.finished) {
        car.finished = true;
        car.finishTime = this.raceTime;
        if (car.isPlayer) this.finishRace();
      }
    }
  }

  private finishRace(): void {
    if (this.finishSent || !this.player) return;
    this.finishSent = true;
    this.mode = "finished";
    this.input.boost = false;
    const L = this.track.length;
    const laps = this.track.spec.laps;
    const results = this.cars.map((car) => {
      let time = car.finishTime;
      if (!car.finished) {
        const remaining = laps * L - car.state.total;
        const pace = Math.max(30, car.state.total > 0 ? car.state.total / this.raceTime : 40);
        time = this.raceTime + remaining / pace;
      }
      return { name: car.name, team: car.team, css: car.css, time, isPlayer: car.isPlayer };
    });
    results.sort((a, b) => a.time - b.time);
    const position = results.findIndex((r) => r.isPlayer) + 1;
    const reward = raceReward(position, this.trackIndex);
    this.cameraMode = "tv";
    this.cameraReady = false;
    this.callbacks.onFinish({
      trackIndex: this.trackIndex,
      trackId: this.track.spec.id,
      trackName: this.track.spec.name,
      position,
      raceTime: this.player.finishTime,
      bestLap: this.player.bestLap,
      coins: this.coins,
      reward,
      standings: results,
    });
  }

  private damage(amount: number): void {
    if (this.mode !== "racing" || this.reboot > 0 || amount <= 0) return;
    this.shield = Math.max(0, this.shield - amount * (1 - this.damageReduction));
    if (this.shield <= 0) {
      this.reboot = 2.2;
      this.shake = 1;
      this.callbacks.onEvent({ type: "reboot" });
    }
  }

  private updatePickups(dt: number): void {
    const player = this.player;
    for (const p of this.pickups) {
      if (!p.active) {
        if (p.kind !== "coin") {
          p.respawn -= dt;
          if (p.respawn <= 0) p.active = true;
        }
        continue;
      }
      if (!player || this.mode !== "racing") continue;
      const ds = lapDelta(player.state.s, p.s, this.track.length);
      if (Math.abs(ds) > 12) continue;
      const reach = p.kind === "coin" ? this.magnetRadius : 2.2;
      if (Math.abs(ds) < 2.6 && Math.abs(p.d - player.state.d) < reach) {
        p.active = false;
        if (p.kind === "coin") {
          this.combo = this.comboTimer > 0 ? Math.min(5, this.combo + 1) : 1;
          this.comboTimer = 2.2;
          this.coins += this.combo;
          this.nitro = Math.min(100, this.nitro + 1.5);
          this.callbacks.onEvent({ type: "coin", amount: this.combo, combo: this.combo });
        } else if (p.kind === "nitro") {
          p.respawn = 14;
          this.nitro = Math.min(100, this.nitro + 48);
          this.callbacks.onEvent({ type: "nitro" });
        } else {
          p.respawn = 14;
          this.shield = Math.min(this.maxShield, this.shield + 36);
          this.callbacks.onEvent({ type: "repair" });
        }
      }
    }
    // Boost pads work for every car.
    for (const pad of this.track.spec.boostPads) {
      for (const car of this.cars) {
        const ds = lapDelta(car.state.s, pad.s, this.track.length);
        if (Math.abs(ds) < 3 && Math.abs(pad.d - car.state.d) < 1.9 && car.state.boostTime < 1.2) {
          car.state.boostTime = 1.6;
          car.state.v = Math.min(car.stats.topSpeed * 1.25, car.state.v + 6);
          if (car.isPlayer && this.mode === "racing") {
            this.nitro = Math.min(100, this.nitro + 25);
            this.coins += 4;
            this.shake = Math.min(1, this.shake + 0.15);
            this.callbacks.onEvent({ type: "boost" });
          }
        }
      }
    }
  }

  private updateHazards(dt: number): void {
    for (const h of this.hazards) {
      h.phase += dt;
      h.cooldown = Math.max(0, h.cooldown - dt);
      if (h.kind === "drone") h.d = h.baseD + Math.sin(h.phase * 0.9) * 3.2;
      for (const car of this.cars) {
        const ds = lapDelta(car.state.s, h.s, this.track.length);
        const reach = h.kind === "barrier" ? 2.4 : 1.8;
        if (Math.abs(ds) < 2.4 && Math.abs(h.d - car.state.d) < reach) {
          if (car.isPlayer) {
            if (h.cooldown > 0 || this.mode !== "racing") continue;
            h.cooldown = 1.2;
            car.state.v *= 0.62;
            const base = h.kind === "mine" ? 46 : h.kind === "barrier" ? 38 : 34;
            this.damage(base);
            this.shake = 1;
            this.emitSparks(car, 0, 24);
            this.callbacks.onEvent({ type: "hit", shield: this.shield });
          } else if (h.cooldown <= 0) {
            car.state.v *= 0.8;
          }
        }
      }
    }
  }

  // ------------------------------------------------------------ placement

  private placeCar(car: RaceCar, s: number, d: number, psi: number, roll: number, hover: number): void {
    const f = this.track.frameAt(s, this.frame);
    const forward = tmpV.copy(f.tangent).multiplyScalar(Math.cos(psi)).addScaledVector(f.right, Math.sin(psi));
    const right = tmpV2.copy(f.right).multiplyScalar(Math.cos(psi)).addScaledVector(f.tangent, -Math.sin(psi));
    const up = f.up.clone();
    if (roll) {
      up.applyAxisAngle(forward, roll);
      right.applyAxisAngle(forward, roll);
    }
    tmpM.makeBasis(right.clone().negate(), up, forward.clone());
    car.model.quaternion.setFromRotationMatrix(tmpM);
    this.track.pointAt(s, d, hover, car.model.position);
  }

  private placeCars(): void {
    for (const car of this.cars) {
      const st = car.state;
      const bob = Math.sin(this.elapsed * 6 + st.s) * 0.035;
      const roll = -st.yaw * 0.16 - (st.drifting ? Math.sign(st.yaw) * 0.08 : 0);
      this.placeCar(car, st.s, st.d, st.psi, roll, 0.06 + bob + (car.isPlayer && this.reboot > 0 ? 0.2 : 0));
      const thrust = car.boosting || st.boostTime > 0 ? 2.6 : 0.6 + car.throttle * 0.9 * Math.min(1, st.v / 40);
      for (const flame of car.flames) {
        const flicker = 0.85 + Math.random() * 0.3;
        flame.scale.set(1, 1, thrust * flicker);
        flame.visible = st.v > 2 || this.mode === "countdown";
      }
    }
    if (this.ghostModel && this.ghost && this.player && this.mode === "racing") {
      const t = (this.raceTime - this.player.lapStart) / GHOST_INTERVAL;
      const n = this.ghost.samples.length / 3;
      const i = Math.floor(t);
      if (i >= 0 && i < n - 1 && this.player.state.total >= 0) {
        const a = i * 3;
        const b = a + 3;
        const u = t - i;
        const g = this.ghost.samples;
        const s = g[a] + lapDelta(g[a], g[b], this.track.length) * u;
        const ghostCar = { model: this.ghostModel } as RaceCar;
        this.placeCar(ghostCar, s, g[a + 1] + (g[b + 1] - g[a + 1]) * u, g[a + 2], 0, 0.08);
        this.ghostModel.visible = true;
      } else {
        this.ghostModel.visible = false;
      }
    } else if (this.ghostModel) {
      this.ghostModel.visible = false;
    }
  }

  private updateAmbient(dt: number): void {
    const pulse = this.elapsed;
    // Coins: spin in place, hidden once collected.
    let k = 0;
    for (const p of this.pickups) {
      if (p.kind !== "coin") {
        if (p.object) {
          p.object.visible = p.active;
          if (p.active) {
            this.track.frameAt(p.s, this.frame);
            this.track.pointAt(p.s, p.d, Math.sin(pulse * 3 + p.s) * 0.15, p.object.position);
            p.object.rotation.y = pulse * 2.4;
          }
        }
        continue;
      }
      const pos = this.track.pointAt(p.s, p.d, Math.sin(pulse * 4 + p.s) * 0.12);
      tmpQ.setFromEuler(new THREE.Euler(0, pulse * 4 + p.s, 0));
      const scale = p.active ? 1 : 0;
      tmpM.compose(pos, tmpQ, tmpV.set(scale, scale, scale));
      for (const mesh of this.coinMeshes) mesh.setMatrixAt(p.instance ?? k, tmpM);
      k += 1;
    }
    for (const mesh of this.coinMeshes) mesh.instanceMatrix.needsUpdate = true;

    for (const h of this.hazards) {
      this.track.frameAt(h.s, this.frame);
      const hover = h.kind === "drone" ? Math.sin(h.phase * 3) * 0.3 : h.kind === "mine" ? Math.sin(h.phase * 2) * 0.12 : 0;
      this.track.pointAt(h.s, h.d, hover, h.object.position);
      tmpM.makeBasis(this.frame.right.clone().negate(), this.frame.up, this.frame.tangent);
      h.object.quaternion.setFromRotationMatrix(tmpM);
      if (h.kind !== "barrier") h.object.rotateY(h.phase * (h.kind === "mine" ? 1.4 : 0.6));
    }

    for (const a of this.built?.animated ?? []) a.object.rotation.z += a.spin * dt;
    this.updateSparks(dt);
  }

  // ---------------------------------------------------------------- camera

  private updateCamera(dt: number): void {
    const camera = this.camera;
    let fov = 62;
    if (this.mode !== "showroom" && camera.view?.enabled) camera.clearViewOffset();
    if (this.mode === "showroom") {
      this.showroomCamera(dt);
      return;
    }
    const focus = this.player ?? this.cars[0];
    if (!focus) return;
    if (this.mode === "showcase") {
      this.showcaseCamera(dt);
      return;
    }
    const st = focus.state;
    const f = this.track.frameAt(st.s, this.frame);
    const heading = tmpV.copy(f.tangent).multiplyScalar(Math.cos(st.psi * 0.5)).addScaledVector(f.right, Math.sin(st.psi * 0.5)).normalize();
    const carPos = focus.model.position;
    let desiredPos: THREE.Vector3;
    let look: THREE.Vector3;
    let rate = 9;
    const mode = this.mode === "finished" ? "tv" : this.cameraMode;
    const back = this.lookBack ? -1 : 1;
    if (mode === "hood") {
      const fw = tmpV2.copy(f.tangent).multiplyScalar(Math.cos(st.psi)).addScaledVector(f.right, Math.sin(st.psi));
      desiredPos = carPos.clone().addScaledVector(f.up, 1.3).addScaledVector(fw, back > 0 ? 0.7 : -1.6);
      look = carPos.clone().addScaledVector(fw, 40 * back).addScaledVector(f.up, 0.9);
      rate = 40;
    } else if (mode === "tv") {
      if (this.tvCameraS < -999 || lapDelta(this.tvCameraS, st.s, this.track.length) > 45 || lapDelta(this.tvCameraS, st.s, this.track.length) < -200) {
        const s = (st.s + 150) % this.track.length;
        const side = Math.random() < 0.5 ? -1 : 1;
        this.tvCameraS = s;
        this.track.pointAt(s, side * (TRACK_HALF_WIDTH + 8 + Math.random() * 10), 4 + Math.random() * 8, this.tvCamera);
        this.cameraReady = false;
      }
      desiredPos = this.tvCamera.clone();
      look = carPos.clone().addScaledVector(f.up, 0.8);
      const distance = desiredPos.distanceTo(carPos);
      fov = clamp(2 * Math.atan(9 / distance) * (180 / Math.PI), 8, 60);
      rate = 60;
    } else {
      const far = mode === "far";
      const distance = (far ? 12.5 : 7.6) + Math.min(2, st.v / 60);
      desiredPos = carPos.clone().addScaledVector(heading, -distance * back).addScaledVector(f.up, far ? 4.6 : 2.5);
      look = carPos.clone().addScaledVector(heading, 9 * back).addScaledVector(f.up, far ? 1.2 : 1.0);
    }
    if (!this.cameraReady) {
      this.cameraPos.copy(desiredPos);
      this.cameraLook.copy(look);
      this.cameraReady = true;
    } else {
      this.cameraPos.lerp(desiredPos, 1 - Math.exp(-rate * dt));
      this.cameraLook.lerp(look, 1 - Math.exp(-rate * 1.4 * dt));
    }
    camera.position.copy(this.cameraPos);
    if (this.shake > 0) {
      const s = this.shake * 0.25;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
      this.shake = Math.max(0, this.shake - dt * 2.2);
    }
    camera.up.copy(f.up);
    camera.lookAt(this.cameraLook);
    if (mode !== "tv") {
      const speedFov = clamp((st.v - 30) / 70, 0, 1) * 13;
      fov = 62 + speedFov + (focus.boosting || st.boostTime > 0 ? 7 : 0);
    }
    camera.fov = damp(camera.fov, fov, mode === "tv" ? 20 : 4, dt);
    camera.updateProjectionMatrix();
  }

  private showcaseCamera(dt: number): void {
    this.showcaseTimer -= dt;
    if (this.showcaseTimer <= 0) {
      this.showcaseTimer = 7;
      this.showcaseShot = (this.showcaseShot + 1) % 3;
      this.cameraReady = false;
      this.tvCameraS = -1000;
    }
    const leader = this.cars[(Math.floor(this.elapsed / 21) % Math.max(1, this.cars.length))] ?? this.cars[0];
    if (!leader) return;
    const st = leader.state;
    const f = this.track.frameAt(st.s, this.frame);
    const pos = leader.model.position;
    let desired: THREE.Vector3;
    let fov = 50;
    if (this.showcaseShot === 0) {
      // Low tracking shot alongside the car.
      desired = pos.clone().addScaledVector(f.right, 6).addScaledVector(f.up, 1.4).addScaledVector(f.tangent, 3);
    } else if (this.showcaseShot === 1) {
      // Helicopter orbit.
      const a = this.elapsed * 0.25;
      desired = pos.clone().add(new THREE.Vector3(Math.cos(a) * 34, 22, Math.sin(a) * 34));
      fov = 45;
    } else {
      if (this.tvCameraS < -999 || lapDelta(this.tvCameraS, st.s, this.track.length) > 40) {
        this.tvCameraS = (st.s + 120) % this.track.length;
        this.track.pointAt(this.tvCameraS, (TRACK_HALF_WIDTH + 10) * (Math.random() < 0.5 ? -1 : 1), 3 + Math.random() * 5, this.tvCamera);
        this.cameraReady = false;
      }
      desired = this.tvCamera.clone();
      fov = clamp(2 * Math.atan(8 / desired.distanceTo(pos)) * (180 / Math.PI), 10, 55);
    }
    if (!this.cameraReady) {
      this.cameraPos.copy(desired);
      this.cameraReady = true;
    } else {
      this.cameraPos.lerp(desired, 1 - Math.exp(-(this.showcaseShot === 2 ? 50 : 6) * dt));
    }
    this.camera.position.copy(this.cameraPos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(pos.clone().addScaledVector(f.up, 0.7));
    this.camera.fov = damp(this.camera.fov, fov, 8, dt);
    this.camera.updateProjectionMatrix();
  }

  private updateShowroom(dt: number): void {
    const car = this.player;
    if (!car) return;
    this.updateAmbient(dt);
    // AI cars keep lapping in the background.
    const obstacles: { s: number; d: number; v: number }[] = [];
    for (const other of this.cars) {
      if (other === car) continue;
      const input = aiInput(other.state, other.ai, this.track, other.stats, obstacles, 0.75);
      stepCar(other.state, input, other.stats, this.track, dt);
      // Keep the showroom stretch clear.
      if (Math.abs(lapDelta(other.state.s, car.state.s, this.track.length)) < 30) other.state.d = Math.sign(other.state.d || 1) * WALL_LIMIT;
    }
    this.placeCars();
    const spin = this.showroomView === "orbit" ? this.elapsed * 0.35 : 0;
    this.placeCar(car, car.state.s, 0, spin, 0, 0.12 + Math.sin(this.elapsed * 2) * 0.04);
    if (this.turntable) this.turntable.rotation.y = 0;
    for (const flame of car.flames) flame.scale.set(1, 1, 0.8 + Math.random() * 0.2);
  }

  private showroomCamera(dt: number): void {
    const car = this.player;
    if (!car) return;
    // On wide screens the garage panel sits on the left, so frame the car
    // in the right-hand part of the view.
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width > 900) this.camera.setViewOffset(width, height, -width * 0.2, 0, width, height);
    else if (width > 0) this.camera.setViewOffset(width, height, 0, height * 0.22, width, height);
    const f = this.track.frameAt(car.state.s, this.frame);
    const centre = car.model.position.clone().addScaledVector(f.up, 0.55);
    const views: Record<ShowroomView, THREE.Vector3> = {
      orbit: centre.clone().addScaledVector(f.tangent, 6.2).addScaledVector(f.right, 4.2).addScaledVector(f.up, 2.2),
      front: centre.clone().addScaledVector(f.tangent, 8),
      rear: centre.clone().addScaledVector(f.tangent, -8),
      left: centre.clone().addScaledVector(f.right, -8.5),
      right: centre.clone().addScaledVector(f.right, 8.5),
      top: centre.clone().addScaledVector(f.up, 10).addScaledVector(f.tangent, 0.01),
      underside: centre.clone().addScaledVector(f.up, -0.5).addScaledVector(f.right, 7.5).addScaledVector(f.tangent, 0.5),
    };
    const desired = views[this.showroomView];
    if (!this.cameraReady) {
      this.cameraPos.copy(desired);
      this.cameraReady = true;
    }
    this.cameraPos.lerp(desired, 1 - Math.exp(-5 * dt));
    this.camera.position.copy(this.cameraPos);
    this.camera.up.copy(this.showroomView === "top" ? f.tangent : f.up);
    this.camera.lookAt(this.showroomView === "underside" ? centre.clone().addScaledVector(f.up, -0.3) : centre);
    this.camera.fov = damp(this.camera.fov, 42, 6, dt);
    this.camera.updateProjectionMatrix();
  }

  // --------------------------------------------------------------- effects

  private createSparks(): THREE.Points {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(240 * 3), 3));
    geometry.setDrawRange(0, 0);
    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ color: 0xffd27a, size: 0.22, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    points.frustumCulled = false;
    return points;
  }

  private emitSparks(car: RaceCar, side: number, count: number): void {
    const origin = car.model.position.clone();
    this.track.frameAt(car.state.s, this.frame);
    origin.addScaledVector(this.frame.right, side * 1.1).addScaledVector(this.frame.up, 0.4);
    for (let i = 0; i < count && this.sparks.length < 240; i += 1) {
      const velocity = this.frame.tangent.clone().multiplyScalar(car.state.v * (0.3 + Math.random() * 0.4))
        .addScaledVector(this.frame.right, side * (2 + Math.random() * 6) + (Math.random() - 0.5) * 4)
        .addScaledVector(this.frame.up, 2 + Math.random() * 5);
      this.sparks.push({ position: origin.clone(), velocity, life: 0.35 + Math.random() * 0.4 });
    }
  }

  private updateSparks(dt: number): void {
    const attr = this.sparkPoints.geometry.getAttribute("position") as THREE.BufferAttribute;
    let n = 0;
    for (let i = this.sparks.length - 1; i >= 0; i -= 1) {
      const s = this.sparks[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.sparks.splice(i, 1);
        continue;
      }
      s.velocity.y -= 18 * dt;
      s.position.addScaledVector(s.velocity, dt);
    }
    for (const s of this.sparks) {
      attr.setXYZ(n, s.position.x, s.position.y, s.position.z);
      n += 1;
    }
    attr.needsUpdate = true;
    this.sparkPoints.geometry.setDrawRange(0, n);
  }

  private createSpeedLines(): THREE.LineSegments {
    const count = 90;
    const positions = new Float32Array(count * 6);
    for (let i = 0; i < count; i += 1) this.resetSpeedLine(positions, i, true);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const lines = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ color: 0xbff8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    lines.frustumCulled = false;
    return lines;
  }

  private resetSpeedLine(p: Float32Array, i: number, anywhere: boolean): void {
    const a = Math.random() * Math.PI * 2;
    const r = 2.5 + Math.random() * 6;
    const z = anywhere ? -Math.random() * 60 : -60;
    p[i * 6] = Math.cos(a) * r;
    p[i * 6 + 1] = Math.sin(a) * r * 0.6;
    p[i * 6 + 2] = z;
    p[i * 6 + 3] = p[i * 6];
    p[i * 6 + 4] = p[i * 6 + 1];
    p[i * 6 + 5] = z - 3;
  }

  private updateSpeedLines(dt: number): void {
    const focus = this.player;
    const v = focus && (this.mode === "racing" || this.mode === "finished") ? focus.state.v : 0;
    const boost = focus ? focus.boosting || focus.state.boostTime > 0 : false;
    const material = this.speedLines.material as THREE.LineBasicMaterial;
    const intensity = clamp((v - 50) / 50, 0, 1) * 0.5 + (boost ? 0.35 : 0);
    material.opacity = damp(material.opacity, this.cameraMode === "tv" ? 0 : intensity, 6, dt);
    this.speedLines.visible = material.opacity > 0.01;
    if (!this.speedLines.visible) return;
    const attr = this.speedLines.geometry.getAttribute("position") as THREE.BufferAttribute;
    const p = attr.array as Float32Array;
    const travel = v * dt * 1.5;
    const stretch = 2 + v * 0.06;
    for (let i = 0; i < p.length / 6; i += 1) {
      p[i * 6 + 2] += travel;
      p[i * 6 + 5] = p[i * 6 + 2] - stretch;
      if (p[i * 6 + 2] > 0) this.resetSpeedLine(p, i, false);
    }
    attr.needsUpdate = true;
  }

  // ---------------------------------------------------------------- render

  private render(dt: number): void {
    this.updateCamera(dt);
    this.updateSpeedLines(dt);
    if (this.built) this.built.sky.position.copy(this.camera.position);
    const focus = this.player ?? this.cars[0];
    if (focus && this.renderer.shadowMap.enabled) {
      this.sun.target.position.copy(focus.model.position);
      this.sun.position.copy(focus.model.position).add(new THREE.Vector3(-40, 90, -30));
    }
    if (this.quality === "high") this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  private applyQuality(): void {
    const high = this.quality === "high";
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 1.75 : 1));
    this.renderer.shadowMap.enabled = high;
    this.sun.castShadow = high;
    this.renderer.shadowMap.needsUpdate = true;
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.Material) o.material.needsUpdate = true;
    });
    this.resize();
    this.callbacks.onQuality?.(this.quality);
  }

  private trackFps(dt: number): void {
    if (!this.autoQuality || this.quality === "low" || this.mode !== "racing") return;
    this.fpsSamples.push(dt);
    if (this.fpsSamples.length >= 180) {
      const average = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
      this.fpsSamples = [];
      if (average > 1 / 38) {
        this.quality = "low";
        this.applyQuality();
      }
    }
  }

  private resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(width, height);
    this.bloom.resolution.set(width / 2, height / 2);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ HUD

  private standingsOrder(): RaceCar[] {
    return [...this.cars].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.state.total - a.state.total;
    });
  }

  private emitHud(force = false): void {
    const now = performance.now();
    if (!force && now - this.hudTimer < 100) return;
    this.hudTimer = now;
    const player = this.player;
    if (!player) return;
    const order = this.standingsOrder();
    const position = order.indexOf(player) + 1;
    if (this.mode === "racing" && position < this.lastPosition && this.raceTime > 3) {
      this.callbacks.onEvent({ type: "overtake", position });
    }
    if (this.mode === "racing") this.lastPosition = position;
    const leader = order[0];
    const standings: Standing[] = order.map((car, k) => {
      let gap = k === 0 ? "LEADER" : "";
      if (k > 0) {
        const behind = leader.state.total - car.state.total;
        gap = `+${(behind / Math.max(20, car.state.v || 40)).toFixed(1)}s`;
      }
      return { name: car.name, css: car.css, isPlayer: car.isPlayer, gap, finished: car.finished };
    });
    const dots = this.cars.map((car) => {
      const [x, y] = minimapPoint(this.track, car.model.position.x, car.model.position.z);
      return { x, y, css: car.css, player: car.isPlayer };
    });
    const laps = this.track.spec.laps;
    this.callbacks.onHud({
      trackName: this.track.spec.name,
      speed: Math.round(player.state.v * 3.6),
      position,
      cars: this.cars.length,
      lap: Math.min(laps, Math.max(1, player.lapsDone + 1)),
      laps,
      lapTime: this.mode === "countdown" ? 0 : this.raceTime - player.lapStart,
      lastLap: player.lastLap,
      bestLap: player.bestLap,
      ghostLap: this.ghost?.lapTime ?? 0,
      raceTime: this.raceTime,
      shield: this.shield,
      maxShield: this.maxShield,
      nitro: this.nitro,
      drift: player.state.drifting ? Math.min(100, player.state.driftTime * 40) : 0,
      coins: this.coins,
      slipstream: this.slipstream,
      rebooting: this.reboot > 0,
      camera: this.cameraMode,
      standings,
      dots,
    });
  }
}
