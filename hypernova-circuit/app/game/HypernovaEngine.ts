import * as THREE from "three";
import { createBlueprintModel, type BlueprintAssetId } from "./blueprint-mesh";
import {
  effectiveStats,
  type CarSpec,
  type EffectiveStats,
  type UpgradeLevels,
} from "./progression";
import {
  CHECKPOINT_INTERVAL,
  LANE_X,
  PLAYER_LATERAL_LIMIT,
  ROAD_HALF_WIDTH,
  SECTOR_LENGTH,
  checkpointNumber,
  checkpointProgress,
  circuitForSector,
  courseBankAtDistance,
  courseCenterAtDistance,
  courseYawAtDistance,
  encounterFor,
  encounterIntervalSeconds,
} from "./circuit-design";

export type RaceHud = {
  speed: number;
  coins: number;
  distance: number;
  sector: number;
  circuitName: string;
  checkpoint: number;
  checkpointProgress: number;
  shield: number;
  maxShield: number;
  nitro: number;
  combo: number;
  drift: number;
  dodged: number;
  rivalsPassed: number;
};

export type RaceResult = {
  coins: number;
  distance: number;
  sector: number;
  dodged: number;
  rivalsPassed: number;
  driftRewards: number;
  topSpeed: number;
};

export type GameEvent =
  | { type: "coin"; amount: number; combo: number }
  | { type: "hit"; shield: number }
  | { type: "sector"; sector: number; reward: number }
  | { type: "nitro" }
  | { type: "repair" }
  | { type: "near-miss"; amount: number }
  | { type: "checkpoint"; checkpoint: number; reward: number; circuit: string }
  | { type: "drift"; amount: number; nitro: number }
  | { type: "warp"; amount: number };

type EngineCallbacks = {
  onHud: (hud: RaceHud) => void;
  onEvent: (event: GameEvent) => void;
  onGameOver: (result: RaceResult) => void;
};

type EngineMode = "attract" | "racing" | "paused" | "finished";

type EntityKind =
  | "coin"
  | "barrier"
  | "mine"
  | "drone"
  | "rival"
  | "nitro"
  | "repair"
  | "boost-pad";

type Entity = {
  kind: EntityKind;
  group: THREE.Group;
  radius: number;
  damage: number;
  phase: number;
  speedFactor: number;
  passed: boolean;
  laneX: number;
};

type SceneryItem = {
  group: THREE.Group;
  side: -1 | 1;
};

const PLAYER_Z = 4;
const ROAD_SEGMENT_LENGTH = 16;
const ROAD_SEGMENT_COUNT = 24;
const ROAD_LOOP_LENGTH = ROAD_SEGMENT_LENGTH * ROAD_SEGMENT_COUNT;
const WORLD_METERS_PER_UNIT = 1.16;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function randomLane(): number {
  return Math.floor(Math.random() * 3);
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Points)) {
      return;
    }
    // Blueprint geometry and materials are cached and shared between models.
    if (object.userData.shared) return;
    object.geometry?.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) material?.dispose();
  });
}

export class HypernovaEngine {
  private readonly container: HTMLElement;
  private readonly callbacks: EngineCallbacks;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.1, 420);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly clock = new THREE.Clock();
  private readonly trackSegments: THREE.Group[] = [];
  private readonly scenery: SceneryItem[] = [];
  private readonly entities: Entity[] = [];
  private readonly railMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly keyLight = new THREE.DirectionalLight(0xff3bbd, 3.2);
  private readonly starField: THREE.Points;
  private readonly speedField: THREE.Points;
  private readonly resizeObserver: ResizeObserver;

  private player = new THREE.Group();
  private playerShield: THREE.Mesh | null = null;
  private playerTrails: THREE.Mesh[] = [];
  private mode: EngineMode = "attract";
  private animationFrame = 0;
  private elapsed = 0;
  private speed = 18;
  private targetSpeed = 18;
  private topSpeed = 0;
  private playerX = 0;
  private steering = 0;
  private pointerTarget: number | null = null;
  private boosting = false;
  private spawnTimer = 0;
  private pickupTimer = 8;
  private hudTimer = 0;
  private runCoins = 0;
  private distance = 0;
  private sector = 1;
  private shield = 100;
  private nitro = 62;
  private combo = 1;
  private comboTimer = 0;
  private dodged = 0;
  private invulnerable = 0;
  private encounterIndex = 0;
  private lastCheckpoint = 0;
  private drifting = false;
  private driftTime = 0;
  private driftMeter = 0;
  private driftRewards = 0;
  private rivalsPassed = 0;
  private car: CarSpec;
  private upgrades: UpgradeLevels;
  private stats: EffectiveStats;

  constructor(
    container: HTMLElement,
    car: CarSpec,
    upgrades: UpgradeLevels,
    callbacks: EngineCallbacks,
  ) {
    this.container = container;
    this.car = car;
    this.upgrades = upgrades;
    this.stats = effectiveStats(car, upgrades);
    this.callbacks = callbacks;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;
    this.renderer.shadowMap.enabled = window.innerWidth > 900;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = "race-canvas";
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    this.container.prepend(this.renderer.domElement);

    this.camera.position.set(0, 5.25, 11.5);
    this.camera.lookAt(0, 0.55, -15);

    const openingCircuit = circuitForSector(1);
    this.scene.background = new THREE.Color(openingCircuit.sky);
    this.scene.fog = new THREE.FogExp2(openingCircuit.fog, 0.0115);

    const hemisphere = new THREE.HemisphereLight(0x6ebdff, 0x160016, 2.8);
    this.scene.add(hemisphere);
    this.keyLight.position.set(-6, 10, 5);
    this.keyLight.castShadow = this.renderer.shadowMap.enabled;
    this.scene.add(this.keyLight);

    const rimLight = new THREE.PointLight(0x19e6ff, 24, 24, 2);
    rimLight.position.set(5, 3, 2);
    this.scene.add(rimLight);

    this.createTrack();
    this.createScenery();
    this.starField = this.createStarField();
    this.speedField = this.createSpeedField();
    this.scene.add(this.starField, this.speedField);
    this.rebuildPlayer();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  start(): void {
    if (this.animationFrame) return;
    this.clock.start();
    this.animate();
  }

  startAttract(): void {
    this.mode = "attract";
    this.targetSpeed = 18;
    this.speed = Math.min(this.speed, 22);
    this.clearEntities();
  }

  beginRace(car: CarSpec, upgrades: UpgradeLevels): void {
    this.car = car;
    this.upgrades = { ...upgrades };
    this.stats = effectiveStats(car, upgrades);
    this.rebuildPlayer();
    this.clearEntities();
    this.mode = "racing";
    this.speed = 30;
    this.targetSpeed = this.stats.maxSpeed;
    this.topSpeed = 0;
    this.playerX = 0;
    this.steering = 0;
    this.pointerTarget = null;
    this.boosting = false;
    this.spawnTimer = 0.8;
    this.pickupTimer = 7;
    this.runCoins = 0;
    this.distance = 0;
    this.sector = 1;
    this.shield = this.stats.maxShield;
    this.nitro = 62;
    this.combo = 1;
    this.comboTimer = 0;
    this.dodged = 0;
    this.invulnerable = 0;
    this.encounterIndex = 0;
    this.lastCheckpoint = 0;
    this.drifting = false;
    this.driftTime = 0;
    this.driftMeter = 0;
    this.driftRewards = 0;
    this.rivalsPassed = 0;
    this.applyTheme(1);
    this.emitHud(true);
  }

  setShowroomCar(car: CarSpec, upgrades: UpgradeLevels): void {
    this.car = car;
    this.upgrades = { ...upgrades };
    this.stats = effectiveStats(car, upgrades);
    if (this.mode !== "racing" && this.mode !== "paused") {
      this.rebuildPlayer();
    }
  }

  pause(): void {
    if (this.mode === "racing") this.mode = "paused";
  }

  resume(): void {
    if (this.mode === "paused") {
      this.mode = "racing";
      this.clock.getDelta();
    }
  }

  setSteering(value: number): void {
    this.steering = clamp(value, -1, 1);
    if (value !== 0) this.pointerTarget = null;
  }

  steerTo(normalizedX: number): void {
    this.pointerTarget = clamp(normalizedX, -1, 1) * PLAYER_LATERAL_LIMIT;
  }

  releasePointer(): void {
    this.pointerTarget = null;
  }

  setBoosting(active: boolean): void {
    this.boosting = active;
  }

  getMode(): EngineMode {
    return this.mode;
  }

  dispose(): void {
    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
    this.resizeObserver.disconnect();
    this.clearEntities();
    disposeObject(this.scene);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private animate = (): void => {
    this.animationFrame = requestAnimationFrame(this.animate);
    const delta = Math.min(this.clock.getDelta(), 0.034);
    this.elapsed += delta;

    if (this.mode === "racing") this.updateRace(delta);
    else if (this.mode === "attract" || this.mode === "finished") {
      this.updateAttract(delta);
    }

    this.updateSharedVisuals(delta);
    this.renderer.render(this.scene, this.camera);
  };

  private updateRace(delta: number): void {
    const sectorSpeedBonus = Math.min(20, (this.sector - 1) * 1.55);
    const canBoost = this.boosting && this.nitro > 0.4;
    this.targetSpeed =
      (this.stats.maxSpeed + sectorSpeedBonus) *
      (canBoost ? this.stats.boostMultiplier : 1);
    this.speed +=
      (this.targetSpeed - this.speed) *
      Math.min(1, delta * (canBoost ? 2.8 : this.stats.acceleration * 0.17));

    if (canBoost) this.nitro = Math.max(0, this.nitro - delta * 18);
    else this.nitro = Math.min(100, this.nitro + delta * 2.1);

    this.topSpeed = Math.max(this.topSpeed, this.speed * 4.15);
    // The Grand Circuit uses long 2.4 km sectors, with four checkpoint splits
    // inside each environment so a sector feels like a real raceway.
    this.distance += this.speed * delta * WORLD_METERS_PER_UNIT;

    const currentCheckpoint = Math.floor(this.distance / CHECKPOINT_INTERVAL);
    if (currentCheckpoint > this.lastCheckpoint) {
      this.lastCheckpoint = currentCheckpoint;
      const reward = 10 + Math.min(28, this.sector * 2 + (currentCheckpoint % 4) * 3);
      this.runCoins += reward;
      this.nitro = Math.min(100, this.nitro + 12);
      this.callbacks.onEvent({
        type: "checkpoint",
        checkpoint: currentCheckpoint,
        reward,
        circuit: circuitForSector(this.sector).shortName,
      });
    }

    const nextSector = Math.floor(this.distance / SECTOR_LENGTH) + 1;
    if (nextSector > this.sector) {
      this.sector = nextSector;
      const reward = 45 + this.sector * 14;
      this.runCoins += reward;
      this.nitro = Math.min(100, this.nitro + 34);
      this.shield = Math.min(this.stats.maxShield, this.shield + 18);
      this.applyTheme(this.sector);
      this.callbacks.onEvent({ type: "sector", sector: this.sector, reward });
    }

    if (this.pointerTarget !== null) {
      const difference = this.pointerTarget - this.playerX;
      this.playerX +=
        clamp(difference, -1, 1) * this.stats.steering * delta * 0.82;
    } else {
      this.playerX += this.steering * this.stats.steering * delta;
    }
    this.playerX = clamp(this.playerX, -PLAYER_LATERAL_LIMIT, PLAYER_LATERAL_LIMIT);

    const steerVisual =
      this.pointerTarget !== null
        ? clamp(this.pointerTarget - this.playerX, -1, 1)
        : this.steering;
    const roadCenter = this.roadCenterAtZ(PLAYER_Z);
    const roadYaw = this.roadYawAtZ(PLAYER_Z);
    const roadBank = this.roadBankAtZ(PLAYER_Z);
    this.player.position.x = THREE.MathUtils.lerp(
      this.player.position.x,
      roadCenter + this.playerX,
      1 - Math.pow(0.001, delta),
    );

    const driftEligible =
      Math.abs(steerVisual) > 0.55 && this.speed * 4.15 > 145 && !canBoost;
    if (driftEligible) {
      this.drifting = true;
      this.driftTime += delta;
      this.driftMeter = Math.min(100, this.driftMeter + delta * 34);
      this.nitro = Math.min(100, this.nitro + delta * 5.2);
    } else if (this.drifting) {
      if (this.driftTime >= 0.62) {
        const amount = Math.max(3, Math.min(24, Math.round(this.driftTime * 6)));
        const nitroReward = Math.max(4, Math.min(20, Math.round(this.driftTime * 4)));
        this.runCoins += amount;
        this.driftRewards += amount;
        this.nitro = Math.min(100, this.nitro + nitroReward);
        this.callbacks.onEvent({ type: "drift", amount, nitro: nitroReward });
      }
      this.drifting = false;
      this.driftTime = 0;
      this.driftMeter = 0;
    } else {
      this.driftMeter = Math.max(0, this.driftMeter - delta * 45);
    }

    this.player.rotation.z = THREE.MathUtils.lerp(
      this.player.rotation.z,
      roadBank - steerVisual * (this.drifting ? 0.31 : 0.2),
      delta * 7,
    );
    this.player.rotation.y = THREE.MathUtils.lerp(
      this.player.rotation.y,
      roadYaw - steerVisual * (this.drifting ? 0.18 : 0.08),
      delta * 6,
    );
    this.player.position.y = 0.62 + Math.sin(this.elapsed * 7.5) * 0.045;

    this.spawnTimer -= delta;
    if (this.spawnTimer <= 0) {
      this.spawnWave();
      this.spawnTimer = encounterIntervalSeconds(this.sector);
    }
    this.pickupTimer -= delta;
    if (this.pickupTimer <= 0) {
      this.spawnPickup();
      this.pickupTimer = 9 + Math.random() * 6;
    }

    this.updateEntities(delta);
    this.invulnerable = Math.max(0, this.invulnerable - delta);
    if (this.playerShield) {
      this.playerShield.visible = this.invulnerable > 0;
      this.playerShield.rotation.y += delta * 1.6;
      const shieldMaterial = this.playerShield.material as THREE.MeshBasicMaterial;
      shieldMaterial.opacity = 0.16 + Math.sin(this.elapsed * 18) * 0.06;
    }

    this.comboTimer -= delta;
    if (this.comboTimer <= 0) this.combo = 1;
    this.emitHud();
  }

  private updateAttract(delta: number): void {
    this.targetSpeed = this.mode === "finished" ? 10 : 18;
    this.speed += (this.targetSpeed - this.speed) * delta * 1.8;
    this.playerX = Math.sin(this.elapsed * 0.42) * 1.15;
    const roadCenter = this.roadCenterAtZ(PLAYER_Z);
    this.player.position.x = THREE.MathUtils.lerp(
      this.player.position.x,
      roadCenter + this.playerX,
      delta * 1.6,
    );
    this.player.position.y = 0.66 + Math.sin(this.elapsed * 2.8) * 0.07;
    this.player.rotation.y =
      this.roadYawAtZ(PLAYER_Z) + Math.sin(this.elapsed * 0.36) * 0.08;
    this.player.rotation.z =
      this.roadBankAtZ(PLAYER_Z) + Math.sin(this.elapsed * 0.58) * 0.03;
  }

  private updateSharedVisuals(delta: number): void {
    const motionScale = this.mode === "paused" ? 0 : 1;
    this.moveWorld(this.speed * delta * motionScale);
    this.starField.rotation.z += delta * 0.008;

    const speedPositions = this.speedField.geometry.attributes.position;
    for (let index = 0; index < speedPositions.count; index += 1) {
      let z =
        speedPositions.getZ(index) + this.speed * delta * 1.55 * motionScale;
      if (z > 12) z = -180 - Math.random() * 80;
      speedPositions.setZ(index, z);
    }
    speedPositions.needsUpdate = true;

    const boostScale = this.mode === "racing" && this.boosting && this.nitro > 0;
    for (const trail of this.playerTrails) {
      const target = boostScale ? 2.05 : 1;
      trail.scale.z = THREE.MathUtils.lerp(trail.scale.z, target, delta * 8);
      (trail.material as THREE.MeshBasicMaterial).opacity =
        (boostScale ? 0.68 : 0.36) + Math.sin(this.elapsed * 24) * 0.08;
    }

    const playerRoadCenter = this.roadCenterAtZ(PLAYER_Z);
    const cameraLean = this.mode === "racing" ? this.playerX * 0.075 : 0;
    this.camera.position.x = THREE.MathUtils.lerp(
      this.camera.position.x,
      playerRoadCenter + cameraLean,
      delta * 2.6,
    );
    this.camera.position.z = THREE.MathUtils.lerp(
      this.camera.position.z,
      this.drifting ? 12.2 : 11.5,
      delta * 2.4,
    );
    this.camera.fov = THREE.MathUtils.lerp(
      this.camera.fov,
      this.mode === "racing" && this.boosting ? 68 : this.drifting ? 62 : 58,
      delta * 3.8,
    );
    this.camera.lookAt(this.roadCenterAtZ(-18), 0.55, -15);
    this.camera.updateProjectionMatrix();
  }

  private roadDistanceAtZ(z: number): number {
    return Math.max(0, this.distance + (PLAYER_Z - z) * WORLD_METERS_PER_UNIT);
  }

  private roadCenterAtZ(z: number): number {
    return courseCenterAtDistance(this.roadDistanceAtZ(z));
  }

  private roadBankAtZ(z: number): number {
    return courseBankAtDistance(this.roadDistanceAtZ(z));
  }

  private roadYawAtZ(z: number): number {
    return courseYawAtDistance(this.roadDistanceAtZ(z));
  }

  private moveWorld(amount: number): void {
    for (const segment of this.trackSegments) {
      segment.position.z += amount;
      if (segment.position.z > 28) segment.position.z -= ROAD_LOOP_LENGTH;
      segment.position.x = this.roadCenterAtZ(segment.position.z);
      segment.rotation.y = -this.roadYawAtZ(segment.position.z);
      segment.rotation.z = this.roadBankAtZ(segment.position.z);
    }

    for (const item of this.scenery) {
      item.group.position.z += amount;
      if (item.group.position.z > 35) {
        item.group.position.z -= 310 + Math.random() * 30;
        item.group.position.x =
          item.side * (10 + Math.random() * 13);
      }
    }
  }

  private createTrack(): void {
    const roadGeometry = new THREE.PlaneGeometry(ROAD_HALF_WIDTH * 2, ROAD_SEGMENT_LENGTH);
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: 0x12152a,
      roughness: 0.56,
      metalness: 0.7,
    });
    const shoulderGeometry = new THREE.BoxGeometry(
      0.72,
      0.18,
      ROAD_SEGMENT_LENGTH,
    );
    const shoulderMaterial = new THREE.MeshStandardMaterial({
      color: 0x242044,
      emissive: 0x421367,
      emissiveIntensity: 0.8,
      metalness: 0.88,
      roughness: 0.3,
    });
    const railGeometry = new THREE.BoxGeometry(
      0.12,
      0.72,
      ROAD_SEGMENT_LENGTH,
    );
    const markerGeometry = new THREE.BoxGeometry(0.075, 0.035, 1.72);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xdffcff });

    for (let index = 0; index < ROAD_SEGMENT_COUNT; index += 1) {
      const segment = new THREE.Group();
      segment.position.z = 12 - index * ROAD_SEGMENT_LENGTH;

      const road = new THREE.Mesh(roadGeometry, roadMaterial);
      road.rotation.x = -Math.PI / 2;
      road.receiveShadow = true;
      segment.add(road);

      for (const side of [-1, 1]) {
        const shoulder = new THREE.Mesh(shoulderGeometry, shoulderMaterial);
        shoulder.position.set(side * (ROAD_HALF_WIDTH + 0.42), 0.08, 0);
        segment.add(shoulder);

        const railMaterial = new THREE.MeshStandardMaterial({
          color: 0x152b38,
          emissive: circuitForSector(1).rail,
          emissiveIntensity: 3.8,
          metalness: 0.7,
          roughness: 0.2,
        });
        this.railMaterials.push(railMaterial);
        const rail = new THREE.Mesh(railGeometry, railMaterial);
        rail.position.set(side * (ROAD_HALF_WIDTH + 0.78), 0.54, 0);
        segment.add(rail);
      }

      for (const laneMarkerX of [-2.08, 2.08]) {
        for (const markerZ of [-6, -2, 2, 6]) {
          const marker = new THREE.Mesh(markerGeometry, markerMaterial);
          marker.position.set(laneMarkerX, 0.035, markerZ);
          segment.add(marker);
        }
      }

      if (index % 5 === 0) {
        const padMaterial = new THREE.MeshBasicMaterial({
          color: index % 10 === 0 ? 0xff3bbd : 0x19e6ff,
          transparent: true,
          opacity: 0.62,
        });
        for (let stripe = -1; stripe <= 1; stripe += 1) {
          const pad = new THREE.Mesh(
            new THREE.BoxGeometry(2.45, 0.04, 0.18),
            padMaterial,
          );
          pad.position.set(stripe * 4.12, 0.055, -4.8);
          segment.add(pad);
        }
      }

      if (index % 12 === 0) {
        const gateMaterial = new THREE.MeshStandardMaterial({
          color: 0x102b38,
          emissive: index % 24 === 0 ? 0x19e6ff : 0xff3bbd,
          emissiveIntensity: 3.3,
          metalness: 0.75,
          roughness: 0.22,
        });
        for (const side of [-1, 1]) {
          const pylon = new THREE.Mesh(
            new THREE.BoxGeometry(0.26, 4.8, 0.34),
            gateMaterial,
          );
          pylon.position.set(side * (ROAD_HALF_WIDTH - 0.22), 2.35, -5.8);
          segment.add(pylon);
        }
        const header = new THREE.Mesh(
          new THREE.BoxGeometry(ROAD_HALF_WIDTH * 1.95, 0.22, 0.34),
          gateMaterial,
        );
        header.position.set(0, 4.72, -5.8);
        segment.add(header);
        const halo = new THREE.Mesh(
          new THREE.TorusGeometry(2.55, 0.045, 8, 48),
          new THREE.MeshBasicMaterial({
            color: index % 24 === 0 ? 0x19e6ff : 0xff3bbd,
            transparent: true,
            opacity: 0.62,
          }),
        );
        halo.rotation.x = Math.PI / 2;
        halo.position.set(0, 4.02, -5.82);
        segment.add(halo);
      }

      segment.position.x = this.roadCenterAtZ(segment.position.z);
      segment.rotation.y = -this.roadYawAtZ(segment.position.z);
      segment.rotation.z = this.roadBankAtZ(segment.position.z);
      this.trackSegments.push(segment);
      this.scene.add(segment);
    }

    const underglow = new THREE.Mesh(
      new THREE.PlaneGeometry(48, 430),
      new THREE.MeshBasicMaterial({
        color: 0x19072f,
        transparent: true,
        opacity: 0.72,
      }),
    );
    underglow.rotation.x = -Math.PI / 2;
    underglow.position.set(0, -0.16, -145);
    this.scene.add(underglow);
  }

  private createScenery(): void {
    const colors = [0xff3bbd, 0x19e6ff, 0x8b5cff, 0xff8a1f, 0xa8ff3e];
    for (let index = 0; index < 54; index += 1) {
      const side = (index % 2 === 0 ? -1 : 1) as -1 | 1;
      const group = new THREE.Group();
      const width = 2.8 + Math.random() * 5.5;
      const height = 4 + Math.random() * 18;
      const depth = 3 + Math.random() * 6;
      const neon = colors[index % colors.length];

      const building = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        new THREE.MeshStandardMaterial({
          color: 0x101326,
          emissive: new THREE.Color(neon).multiplyScalar(0.14),
          emissiveIntensity: 0.75,
          metalness: 0.9,
          roughness: 0.35,
        }),
      );
      building.position.y = height / 2 - 0.1;
      group.add(building);

      const windowMaterial = new THREE.MeshBasicMaterial({
        color: neon,
        transparent: true,
        opacity: 0.82,
      });
      for (let stripe = 0; stripe < 3; stripe += 1) {
        const windowStrip = new THREE.Mesh(
          new THREE.BoxGeometry(0.055, height * 0.7, 0.12),
          windowMaterial,
        );
        windowStrip.position.set(
          side < 0 ? width / 2 + 0.03 : -width / 2 - 0.03,
          height * 0.5,
          (stripe - 1) * depth * 0.27,
        );
        group.add(windowStrip);
      }

      if (index % 4 === 0) {
        const spire = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.18, 3.5, 6),
          windowMaterial,
        );
        spire.position.y = height + 1.6;
        group.add(spire);
      }

      group.position.set(
        side * (10 + Math.random() * 13),
        0,
        15 - index * 5.9 - Math.random() * 10,
      );
      group.rotation.y = Math.random() * 0.28 - 0.14;
      this.scenery.push({ group, side });
      this.scene.add(group);
    }
  }

  private createStarField(): THREE.Points {
    const count = 520;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = (Math.random() - 0.5) * 190;
      positions[index * 3 + 1] = 10 + Math.random() * 75;
      positions[index * 3 + 2] = -260 + Math.random() * 310;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: 0xd9eeff,
        size: 0.24,
        transparent: true,
        opacity: 0.72,
        sizeAttenuation: true,
      }),
    );
  }

  private createSpeedField(): THREE.Points {
    const count = 100;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      positions[index * 3] = side * (7 + Math.random() * 22);
      positions[index * 3 + 1] = 0.4 + Math.random() * 13;
      positions[index * 3 + 2] = -180 + Math.random() * 190;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: 0x19e6ff,
        size: 0.16,
        transparent: true,
        opacity: 0.6,
      }),
    );
  }

  private createCarModel(
    car: CarSpec,
    includeShield = false,
  ): THREE.Group {
    // The endless mode now drives the exact Grand Prix blueprint models. They
    // face +Z and are 5 m long, so they are turned around and scaled to fit
    // the 4.15 m lanes of the classic run.
    const group = new THREE.Group();
    const model = createBlueprintModel(car.id as BlueprintAssetId, {
      primary: car.primary,
      secondary: car.secondary,
    }, { castShadow: true });
    model.rotation.y = Math.PI;
    model.scale.setScalar(0.68);
    model.position.y = -0.5;
    group.add(model);

    for (const side of [-1, 1]) {
      const trail = new THREE.Mesh(
        new THREE.ConeGeometry(0.2, 2.2, 12, 1, true),
        new THREE.MeshBasicMaterial({
          color: car.secondary,
          transparent: true,
          opacity: 0.4,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      trail.rotation.x = -Math.PI / 2;
      trail.position.set(side * 0.36, -0.1, 2.75);
      group.add(trail);
      if (includeShield) this.playerTrails.push(trail);
    }

    if (includeShield) {
      const shield = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.72, 2),
        new THREE.MeshBasicMaterial({
          color: 0x8affff,
          transparent: true,
          opacity: 0.18,
          wireframe: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      shield.scale.set(1.15, 0.62, 1.24);
      shield.visible = false;
      group.add(shield);
      this.playerShield = shield;
    }

    return group;
  }

  private rebuildPlayer(): void {
    if (this.player.parent) {
      this.scene.remove(this.player);
      disposeObject(this.player);
    }
    this.playerTrails = [];
    this.playerShield = null;
    this.player = this.createCarModel(this.car, true);
    this.player.position.set(this.playerX, 0.64, PLAYER_Z);
    this.player.scale.setScalar(0.94);
    this.scene.add(this.player);
  }

  private spawnWave(): void {
    const plan = encounterFor(this.sector, this.encounterIndex);
    this.encounterIndex += 1;
    const z = -122;

    if (plan.kind === "coin-line") {
      for (let index = 0; index < 8; index += 1) {
        this.addEntity(this.createCoin(plan.primaryLane, z - index * 5.4));
      }
      return;
    }

    if (plan.kind === "coin-sweep") {
      for (let index = 0; index < 9; index += 1) {
        const lane = (plan.primaryLane + index) % 3;
        this.addEntity(this.createCoin(lane, z - index * 5.1));
      }
      return;
    }

    if (plan.kind === "barrier-choice") {
      const blockTwo = this.sector > 1 || this.encounterIndex % 3 !== 0;
      this.addEntity(this.createBarrier(plan.primaryLane, z));
      if (blockTwo) this.addEntity(this.createBarrier(plan.secondaryLane, z));
      const safeLane = blockTwo ? plan.safeLane : plan.secondaryLane;
      for (let index = 0; index < 4; index += 1) {
        this.addEntity(this.createCoin(safeLane, z - 9 - index * 4.8));
      }
      return;
    }

    if (plan.kind === "mine-slalom") {
      this.addEntity(this.createMine(plan.primaryLane, z));
      this.addEntity(this.createMine(plan.secondaryLane, z - 13));
      this.addEntity(this.createCoin(plan.safeLane, z - 7));
      this.addEntity(this.createCoin(plan.safeLane, z - 19));
      return;
    }

    if (plan.kind === "drone-pair") {
      this.addEntity(this.createDrone(plan.primaryLane, z));
      this.addEntity(this.createDrone(plan.secondaryLane, z - 16));
      for (let index = 0; index < 3; index += 1) {
        this.addEntity(this.createCoin(plan.safeLane, z - 5 - index * 5));
      }
      return;
    }

    if (plan.kind === "warp-lane") {
      this.addEntity(this.createBoostPad(plan.safeLane, z));
      for (let index = 0; index < 5; index += 1) {
        this.addEntity(this.createCoin(plan.safeLane, z - 7 - index * 4.6));
      }
      return;
    }

    // Rival packs are true overtaking moments rather than a single car used as
    // a generic obstacle. The open lane is intentionally readable.
    this.addEntity(this.createRival(plan.primaryLane, z));
    if (this.sector >= 2) {
      this.addEntity(this.createRival(plan.secondaryLane, z - 18));
    }
    for (let index = 0; index < 3; index += 1) {
      this.addEntity(this.createCoin(plan.safeLane, z - 8 - index * 5.2));
    }
  }

  private spawnPickup(): void {
    const lane = randomLane();
    const z = -115 - Math.random() * 22;
    this.addEntity(
      Math.random() < 0.62
        ? this.createNitro(lane, z)
        : this.createRepair(lane, z),
    );
  }

  /** Encounter props are the exact blueprint models (road surface at Y = 0). */
  private blueprintEntity(
    kind: EntityKind,
    asset: BlueprintAssetId,
    lane: number,
    z: number,
    radius: number,
    damage: number,
    speedFactor = 1,
  ): Entity {
    const group = new THREE.Group();
    group.add(createBlueprintModel(asset));
    group.position.set(LANE_X[lane], 0, z);
    return {
      kind,
      group,
      radius,
      damage,
      phase: Math.random() * Math.PI * 2,
      speedFactor,
      passed: false,
      laneX: LANE_X[lane],
    };
  }

  private createCoin(lane: number, z: number): Entity {
    return this.blueprintEntity("coin", "coin", lane, z, 0.82, 0);
  }

  private createBarrier(lane: number, z: number): Entity {
    return this.blueprintEntity("barrier", "barrier", lane, z, 1.25, 38);
  }

  private createMine(lane: number, z: number): Entity {
    return this.blueprintEntity("mine", "mine", lane, z, 0.95, 46);
  }

  private createDrone(lane: number, z: number): Entity {
    return this.blueprintEntity("drone", "drone", lane, z, 1.2, 34, 1.06);
  }

  private createRival(lane: number, z: number): Entity {
    const rivalColors = [
      { primary: 0xff3bbd, secondary: 0x19e6ff },
      { primary: 0xff8a1f, secondary: 0xa8ff3e },
      { primary: 0x8b5cff, secondary: 0xffee55 },
    ];
    const colors = rivalColors[Math.floor(Math.random() * rivalColors.length)];
    const rival = this.createCarModel(
      {
        ...this.car,
        primary: colors.primary,
        secondary: colors.secondary,
      },
      false,
    );
    rival.scale.setScalar(0.9);
    rival.position.set(LANE_X[lane], 0.62, z);
    return {
      kind: "rival",
      group: rival,
      radius: 1.05,
      damage: 30,
      phase: Math.random() * Math.PI * 2,
      speedFactor: 0.56 + Math.random() * 0.18,
      passed: false,
      laneX: LANE_X[lane],
    };
  }

  private createNitro(lane: number, z: number): Entity {
    return this.blueprintEntity("nitro", "nitro", lane, z, 0.95, 0);
  }

  private createRepair(lane: number, z: number): Entity {
    return this.blueprintEntity("repair", "repair", lane, z, 0.9, 0);
  }

  private createBoostPad(lane: number, z: number): Entity {
    const entity = this.blueprintEntity("boost-pad", "boostPad", lane, z, 1.22, 0);
    entity.group.scale.set(0.9, 1, 0.95);
    return entity;
  }

  private addEntity(entity: Entity): void {
    this.entities.push(entity);
    this.scene.add(entity.group);
  }

  private updateEntities(delta: number): void {
    for (let index = this.entities.length - 1; index >= 0; index -= 1) {
      const entity = this.entities[index];
      entity.group.position.z += this.speed * delta * entity.speedFactor;
      entity.phase += delta;

      let weave = 0;
      if (entity.kind === "coin") {
        entity.group.rotation.y += delta * 4.4;
        entity.group.position.y = Math.sin(entity.phase * 4) * 0.12;
        const magnetDistance = this.stats.magnetRadius * 4.2;
        const dz = entity.group.position.z - PLAYER_Z;
        const localDx = entity.laneX - this.playerX;
        if (Math.hypot(localDx, dz) < magnetDistance) {
          entity.laneX = THREE.MathUtils.lerp(
            entity.laneX,
            this.playerX,
            Math.min(1, delta * (4.2 + this.upgrades.magnet)),
          );
        }
      } else if (entity.kind === "mine") {
        entity.group.rotation.y += delta * 2.8;
      } else if (entity.kind === "drone") {
        entity.group.position.y = Math.sin(entity.phase * 4.2) * 0.28;
        entity.group.rotation.y += delta * 2.2;
        weave = Math.sin(entity.phase * 1.45) * 0.26;
      } else if (entity.kind === "rival") {
        weave = Math.sin(entity.phase * 1.6) * 0.38;
        entity.group.rotation.z = this.roadBankAtZ(entity.group.position.z) + Math.sin(entity.phase * 1.6) * 0.05;
        entity.group.rotation.y = this.roadYawAtZ(entity.group.position.z);
      } else if (entity.kind === "nitro" || entity.kind === "repair") {
        entity.group.rotation.y += delta * 2.8;
        entity.group.position.y = Math.sin(entity.phase * 3.8) * 0.16;
      }

      entity.group.position.x =
        this.roadCenterAtZ(entity.group.position.z) + entity.laneX + weave;

      const dz = Math.abs(entity.group.position.z - PLAYER_Z);
      const dx = Math.abs(entity.group.position.x - this.player.position.x);
      if (dz < 1.6 && dx < entity.radius + 0.52) {
        this.handleCollision(entity);
        this.removeEntity(index);
        continue;
      }

      if (
        !entity.passed &&
        entity.group.position.z > PLAYER_Z + 1.8 &&
        entity.kind !== "coin" &&
        entity.kind !== "nitro" &&
        entity.kind !== "repair" &&
        entity.kind !== "boost-pad"
      ) {
        entity.passed = true;
        this.dodged += 1;
        if (entity.kind === "rival") {
          this.rivalsPassed += 1;
          this.runCoins += 4;
          this.nitro = Math.min(100, this.nitro + 6);
        }
        if (dx < entity.radius + 1.05) {
          const reward = 2 + Math.min(4, this.combo);
          this.runCoins += reward;
          this.nitro = Math.min(100, this.nitro + 7);
          this.callbacks.onEvent({ type: "near-miss", amount: reward });
        }
      }

      if (entity.group.position.z > 30) this.removeEntity(index);
    }
  }

  private handleCollision(entity: Entity): void {
    if (entity.kind === "coin") {
      this.combo = this.comboTimer > 0 ? Math.min(5, this.combo + 1) : 1;
      this.comboTimer = 2.4;
      const amount = this.combo;
      this.runCoins += amount;
      this.nitro = Math.min(100, this.nitro + 1.2);
      this.callbacks.onEvent({ type: "coin", amount, combo: this.combo });
      return;
    }

    if (entity.kind === "nitro") {
      this.nitro = Math.min(100, this.nitro + 48);
      this.callbacks.onEvent({ type: "nitro" });
      return;
    }

    if (entity.kind === "repair") {
      this.shield = Math.min(this.stats.maxShield, this.shield + 36);
      this.callbacks.onEvent({ type: "repair" });
      return;
    }

    if (entity.kind === "boost-pad") {
      const amount = 6;
      this.runCoins += amount;
      this.nitro = Math.min(100, this.nitro + 34);
      this.speed = Math.min(this.targetSpeed * 1.12, this.speed * 1.13 + 4);
      this.callbacks.onEvent({ type: "warp", amount });
      return;
    }

    if (this.invulnerable > 0) return;
    const damage = entity.damage * (1 - this.stats.damageReduction);
    this.shield = Math.max(0, this.shield - damage);
    this.speed *= 0.56;
    this.combo = 1;
    this.comboTimer = 0;
    this.invulnerable = 1.45;
    this.callbacks.onEvent({ type: "hit", shield: this.shield });

    if (this.shield <= 0) this.finishRace();
  }

  private finishRace(): void {
    if (this.mode !== "racing") return;
    this.mode = "finished";
    this.boosting = false;
    this.targetSpeed = 8;
    this.callbacks.onGameOver({
      coins: this.runCoins,
      distance: Math.floor(this.distance),
      sector: this.sector,
      dodged: this.dodged,
      rivalsPassed: this.rivalsPassed,
      driftRewards: this.driftRewards,
      topSpeed: Math.floor(this.topSpeed),
    });
  }

  private removeEntity(index: number): void {
    const [entity] = this.entities.splice(index, 1);
    if (!entity) return;
    this.scene.remove(entity.group);
    disposeObject(entity.group);
  }

  private clearEntities(): void {
    for (let index = this.entities.length - 1; index >= 0; index -= 1) {
      this.removeEntity(index);
    }
  }

  private applyTheme(sector: number): void {
    const theme = circuitForSector(sector);
    this.scene.background = new THREE.Color(theme.sky);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.setHex(theme.fog);
    }
    this.keyLight.color.setHex(theme.key);
    for (const material of this.railMaterials) material.emissive.setHex(theme.rail);
    (this.speedField.material as THREE.PointsMaterial).color.setHex(theme.rail);
  }

  private emitHud(force = false): void {
    const now = performance.now();
    if (!force && now - this.hudTimer < 90) return;
    this.hudTimer = now;
    this.callbacks.onHud({
      speed: Math.floor(this.speed * 4.15),
      coins: this.runCoins,
      distance: Math.floor(this.distance),
      sector: this.sector,
      circuitName: circuitForSector(this.sector).shortName,
      checkpoint: checkpointNumber(this.distance),
      checkpointProgress: checkpointProgress(this.distance),
      shield: Math.max(0, this.shield),
      maxShield: this.stats.maxShield,
      nitro: this.nitro,
      combo: this.combo,
      drift: this.driftMeter,
      dodged: this.dodged,
      rivalsPassed: this.rivalsPassed,
    });
  }

  private resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
