import * as THREE from "three";
import type { Game } from "../app/game.ts";
import { BODIES, BODY_BY_ID, daysSinceJ2000, heliocentric, jumpOn, moonLongitude, orbitPoint, type Body, type BodyId } from "../data/solar.ts";
import { sfx } from "../engine/audio.ts";
import type { PointerInfo, SceneController } from "../engine/engine.ts";
import { Particles } from "../engine/fx.ts";
import { input } from "../engine/input.ts";
import { skyDome, updateStars } from "../engine/space.ts";
import { Animator } from "../models/rig.ts";
import { textSprite } from "../world/labels.ts";

export type ObsMode = "orbits" | "sizes" | "jump";
export type ObsScale = "fit" | "true";

export const SPEEDS = [
  { days: 0, label: "Paused" },
  { days: 1, label: "1 day / second" },
  { days: 7, label: "1 week / second" },
  { days: 30.44, label: "1 month / second" },
  { days: 365.25, label: "1 year / second" },
] as const;

export interface JumpView {
  world: BodyId;
  phase: "ready" | "crouch" | "air" | "landed";
  height: number;
  airTime: number;
  current: number;
  timer: number;
  jumps: number;
}

export interface ObservatoryView {
  mode: ObsMode;
  selected: BodyId;
  speed: number;
  scale: ObsScale;
  dateText: string;
  daysFromNow: number;
  jump: JumpView;
}

export interface Insets { l: number; r: number; t: number; b: number }

const DAY_MS = 86400000;
const KM_PER_UNIT = 1000; // sizes mode: 1 unit = 1,000 km
const FIT_SUN = 18;
const TRUE_SUN = 4;
const fitAU = (au: number) => 30 + 48 * Math.sqrt(au);
const trueAU = (au: number) => 40 * au;
const ORBITERS = BODIES.filter((b) => b.orbit);
const LINEUP: BodyId[] = ["mercury", "venus", "earth", "moon", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];

function displayRadius(b: Body) {
  if (b.id === "sun") return FIT_SUN;
  if (b.id === "moon") return 1.1;
  return Math.max(0.95, 0.6 * Math.sqrt(b.diameterKm / 1000));
}

/** Ecliptic (x, y, z) in AU → scene position with the chosen distance scale. */
function toScene(p: { x: number; y: number; z: number }, scale: ObsScale, out = new THREE.Vector3()) {
  const r = Math.hypot(p.x, p.y, p.z) || 1e-6;
  const d = scale === "fit" ? fitAU(r) : trueAU(r);
  const k = d / r;
  return out.set(p.x * k, p.z * k, -p.y * k);
}

interface Orbiter {
  body: Body;
  holder: THREE.Group;
  tilt: THREE.Group;
  planet: THREE.Object3D;
  label: THREE.Sprite;
  hit: THREE.Mesh;
  orbit: THREE.LineLoop | null;
  radius: number;
}

const BELT_VERTEX = /* glsl */ `
attribute vec3 orbit;
uniform float days;
uniform float trueScale;
uniform float pixelRatio;
uniform float size;
void main(){
  float a = orbit.x;
  float th = orbit.y + 0.0172021 * days / pow(a, 1.5);
  float r = trueScale > 0.5 ? 40.0 * a : 30.0 + 48.0 * sqrt(a);
  float zk = trueScale > 0.5 ? 40.0 : 24.0 / sqrt(a);
  vec4 mv = modelViewMatrix * vec4(cos(th) * r, orbit.z * zk, -sin(th) * r, 1.0);
  gl_PointSize = size * pixelRatio;
  gl_Position = projectionMatrix * mv;
}`;
const BELT_FRAGMENT = /* glsl */ `
uniform vec3 color;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  if (dot(c, c) > 0.25) discard;
  gl_FragColor = vec4(color, 0.85);
}`;

/**
 * Star Observatory: a real-time model of the solar system (planets are where they
 * really are today), a true-scale size line-up, and a Gravity Jump lab.
 */
export class ObservatoryScene implements SceneController {
  readonly id = "observatory";
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.5, 40000);
  bloom = { strength: 0.75, radius: 0.5, threshold: 0.82 };
  private readonly game: Game;
  private built = false;
  private view: ObservatoryView;
  private readonly system = new THREE.Group();
  private readonly lineup = new THREE.Group();
  private readonly jumpWorld = new THREE.Group();
  private readonly backdrop = new THREE.Group();
  private sun!: THREE.Group;
  private orbiters: Orbiter[] = [];
  private moonPivot = new THREE.Group();
  private moonOrbit!: THREE.LineLoop;
  private belts: THREE.ShaderMaterial[] = [];
  private lineupBodies = new Map<BodyId, { node: THREE.Object3D; x: number; r: number; hit: THREE.Mesh }>();
  private lineupEnd = 0;
  private simDays = 0;
  private readonly startDate = new Date();
  private readonly target = new THREE.Vector3();
  private readonly desiredTarget = new THREE.Vector3();
  private dist = 430;
  private desiredDist = 430;
  private yaw = 0.35;
  private pitch = 0.62;
  private zoom = 1;
  private wholeFamily = false;
  private insets: Insets = { l: 280, r: 350, t: 120, b: 96 };
  private publishTimer = 0;
  private dragging = false;
  private readonly raycaster = new THREE.Raycaster();
  // Gravity Jump
  private cadet: ReturnType<Game["cadetModel"]> | null = null;
  private animator: Animator | null = null;
  private jumpScene: THREE.Group | null = null;
  private jumpBuiltFor: BodyId | null = null;
  private readonly dust: Particles;
  private bestMarker: THREE.Group | null = null;
  private jumpY = 0;
  private jumpT = 0;

  constructor(game: Game) {
    this.game = game;
    this.dust = new Particles(300, false, game.engine.renderer.getPixelRatio());
    this.view = {
      mode: "orbits", selected: "sun", speed: 1, scale: "fit", dateText: "", daysFromNow: 0,
      jump: { world: "moon", phase: "ready", height: 0, airTime: 0, current: 0, timer: 0, jumps: 0 },
    };
    this.scene.background = new THREE.Color("#02030a");
    this.scene.add(this.backdrop, this.system, this.lineup, this.jumpWorld);
  }

  // ------------------------------------------------------------ build

  private build() {
    if (this.built) return;
    this.built = true;
    const space = this.game.space;
    this.backdrop.add(space.skySphere(["#1b1450", "#3a1f6a", "#0f3a6a"], 4.2, 16000));
    this.backdrop.add(space.starfield(2600, 15000, 1.5));

    // ---- Orbits: the Sun, planets, belts
    this.system.add(new THREE.AmbientLight(0x4a5680, 0.55));
    const sunLight = new THREE.PointLight(0xfff4e0, 3.2, 0, 0);
    this.system.add(sunLight);
    this.sun = space.planet("sun", FIT_SUN, { segments: 64 });
    this.sun.userData.body = "sun";
    this.system.add(this.sun);
    const sunHit = new THREE.Mesh(new THREE.SphereGeometry(FIT_SUN * 1.15, 12, 8), new THREE.MeshBasicMaterial());
    sunHit.visible = false;
    sunHit.userData.body = "sun";
    this.sun.add(sunHit);
    for (const body of ORBITERS) this.orbiters.push(this.makeOrbiter(body));
    // The Moon circles Earth
    const earth = this.orbiters.find((o) => o.body.id === "earth")!;
    const moonBody = BODY_BY_ID.moon;
    const moon = space.planet("moon", displayRadius(moonBody), { segments: 32, atmosphere: null });
    this.moonPivot.add(moon);
    const moonLabel = textSprite("Moon", { height: 0.026, border: "#cfd6e6" });
    (moonLabel.material as THREE.SpriteMaterial).sizeAttenuation = false;
    moonLabel.position.y = 2.2;
    moon.add(moonLabel);
    moon.userData.body = "moon";
    const moonHit = new THREE.Mesh(new THREE.SphereGeometry(2.4, 10, 8), new THREE.MeshBasicMaterial());
    moonHit.visible = false;
    moonHit.userData.body = "moon";
    moon.add(moonHit);
    moon.name = "moon";
    earth.holder.add(this.moonPivot);
    const ring: THREE.Vector3[] = [];
    for (let i = 0; i < 96; i++) { const a = (i / 96) * Math.PI * 2; ring.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a))); }
    this.moonOrbit = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ring), new THREE.LineBasicMaterial({ color: "#cfd6e6", transparent: true, opacity: 0.35 }));
    earth.holder.add(this.moonOrbit);
    this.system.add(this.makeBelt(1800, 2.1, 3.3, 0.12, "#b9a68e", 1.7, 1));
    this.system.add(this.makeBelt(1400, 30, 50, 0.35, "#9fc6ff", 1.5, 2));
    this.applyScale();

    // ---- Sizes: a true-scale line-up next to the edge of the Sun
    this.buildLineup();

    this.lineup.visible = false;
    this.jumpWorld.visible = false;
  }

  private makeOrbiter(body: Body): Orbiter {
    const space = this.game.space;
    const radius = displayRadius(body);
    const holder = new THREE.Group();
    const tilt = new THREE.Group();
    tilt.rotation.z = THREE.MathUtils.degToRad(body.tilt);
    const planet = space.planet(body.kind, radius, { clouds: body.id === "earth", rings: body.id === "saturn", segments: 48 });
    tilt.add(planet);
    holder.add(tilt);
    const label = textSprite(body.name, { height: 0.03, border: body.color });
    (label.material as THREE.SpriteMaterial).sizeAttenuation = false;
    label.position.y = radius * 1.35 + 1.2;
    holder.add(label);
    const hit = new THREE.Mesh(new THREE.SphereGeometry(Math.max(radius * 1.6, 3.2), 12, 8), new THREE.MeshBasicMaterial());
    hit.visible = false;
    hit.userData.body = body.id;
    holder.add(hit);
    holder.userData.body = body.id;
    this.system.add(holder);
    const orbit = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: body.color, transparent: true, opacity: 0.42 }));
    this.system.add(orbit);
    return { body, holder, tilt, planet, label, hit, orbit, radius };
  }

  private makeBelt(count: number, aMin: number, aMax: number, zSpread: number, color: string, size: number, seed: number) {
    const data = new Float32Array(count * 3);
    let s = seed * 9301 + 49297;
    const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let i = 0; i < count; i++) {
      const a = aMin + (aMax - aMin) * Math.pow(rand(), 0.8);
      data[i * 3] = a;
      data[i * 3 + 1] = rand() * Math.PI * 2;
      data[i * 3 + 2] = (rand() - 0.5) * 2 * zSpread * (a / 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("orbit", new THREE.BufferAttribute(data, 3));
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const material = new THREE.ShaderMaterial({
      vertexShader: BELT_VERTEX,
      fragmentShader: BELT_FRAGMENT,
      uniforms: { days: { value: 0 }, trueScale: { value: 0 }, pixelRatio: { value: this.game.engine.renderer.getPixelRatio() }, size: { value: size }, color: { value: new THREE.Color(color) } },
      transparent: true,
      depthWrite: false,
    });
    this.belts.push(material);
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    return points;
  }

  /** Rebuilds orbit lines and sizes for the current distance scale. */
  private applyScale() {
    const scale = this.view.scale;
    const shrink = scale === "true" ? 0.5 : 1;
    this.sun.scale.setScalar(scale === "true" ? TRUE_SUN / FIT_SUN : 1);
    for (const o of this.orbiters) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < 256; i++) pts.push(toScene(orbitPoint(o.body.orbit!, (i / 256) * Math.PI * 2), scale));
      o.orbit!.geometry.dispose();
      o.orbit!.geometry = new THREE.BufferGeometry().setFromPoints(pts);
      o.tilt.scale.setScalar(Math.max(0.6 / o.radius, shrink));
      o.label.position.y = o.radius * Math.max(0.6 / o.radius, shrink) * 1.35 + (scale === "true" ? 0.8 : 1.2);
    }
    const moonR = scale === "true" ? 2.2 : 3.6;
    this.moonOrbit.scale.setScalar(moonR);
    const moon = this.moonPivot.getObjectByName("moon");
    if (moon) moon.position.set(moonR, 0, 0);
    this.moonPivot.scale.setScalar(1);
    for (const m of this.belts) m.uniforms.trueScale.value = scale === "true" ? 1 : 0;
    this.placeBodies();
  }

  private placeBodies() {
    const days = daysSinceJ2000(this.startDate) + this.simDays;
    for (const o of this.orbiters) toScene(heliocentric(o.body.orbit!, days), this.view.scale, o.holder.position);
    // The Moon's longitude is measured around Earth in the ecliptic plane.
    this.moonPivot.rotation.y = THREE.MathUtils.degToRad(moonLongitude(days));
    for (const m of this.belts) m.uniforms.days.value = days;
  }

  private buildLineup() {
    const space = this.game.space;
    const light = new THREE.DirectionalLight(0xfff4e0, 3.0);
    light.position.set(-1, 0.25, 0.55);
    this.lineup.add(light, new THREE.AmbientLight(0x6070a0, 0.45));
    const sunR = BODY_BY_ID.sun.diameterKm / 2 / KM_PER_UNIT;
    const sun = space.planet("sun", sunR, { segments: 128 });
    sun.position.set(-sunR, 0, 0);
    const sunGlow = sun.getObjectByName("glow") as THREE.Sprite | undefined;
    if (sunGlow) { sunGlow.scale.setScalar(sunR * 2.5); (sunGlow.material as THREE.SpriteMaterial).opacity = 0.45; }
    this.lineup.add(sun);
    // Grid: 1 square = 10,000 km
    const grid = new THREE.GridHelper(3000, 300, 0x2c56b0, 0x1a3478);
    grid.rotation.x = Math.PI / 2;
    grid.position.set(600, 0, -160);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.55;
    this.lineup.add(grid);
    let cursor = 26;
    for (const id of LINEUP) {
      const body = BODY_BY_ID[id];
      const r = body.diameterKm / 2 / KM_PER_UNIT;
      const span = id === "saturn" ? r * 2.3 * 2 : r * 2;
      const x = cursor + span / 2;
      const node = space.planet(body.kind, r, { clouds: id === "earth", rings: id === "saturn", segments: id === "jupiter" || id === "saturn" ? 96 : 48 });
      const tilt = new THREE.Group();
      tilt.rotation.z = THREE.MathUtils.degToRad(Math.min(body.tilt, 180 - body.tilt) * (body.tilt > 90 ? -1 : 1));
      if (id === "saturn") tilt.rotation.x = 0.42;
      tilt.add(node);
      tilt.position.set(x, 0, 0);
      this.lineup.add(tilt);
      const label = textSprite(body.name, { height: Math.max(2.2, r * 0.3), border: body.color });
      label.position.set(x, -(Math.max(r, 2) + Math.max(2.2, r * 0.3) * 0.9), 0);
      this.lineup.add(label);
      const hit = new THREE.Mesh(new THREE.SphereGeometry(Math.max(r, 4), 12, 8), new THREE.MeshBasicMaterial());
      hit.visible = false;
      hit.userData.body = id;
      tilt.add(hit);
      this.lineupBodies.set(id, { node, x, r: span / 2, hit });
      cursor += span + Math.max(14, span * 0.12);
    }
    this.lineupEnd = cursor;
    const sunHit = new THREE.Mesh(new THREE.SphereGeometry(sunR, 24, 16), new THREE.MeshBasicMaterial());
    sunHit.visible = false;
    sunHit.userData.body = "sun";
    sun.add(sunHit);
    this.lineupBodies.set("sun", { node: sun, x: -40, r: 60, hit: sunHit });
  }

  // ------------------------------------------------------------ gravity jump world

  private buildJumpWorld(id: BodyId) {
    if (this.jumpBuiltFor === id && this.jumpScene) return;
    if (this.jumpScene) this.jumpWorld.remove(this.jumpScene);
    const body = BODY_BY_ID[id];
    const space = this.game.space;
    const g = new THREE.Group();
    this.jumpScene = g;
    this.jumpBuiltFor = id;
    const airless = id === "moon" || id === "mercury" || id === "pluto";
    const skies: Partial<Record<BodyId, [string, string]>> = {
      earth: ["#2f73d6", "#bfe6ff"], mars: ["#b07a52", "#e7c39b"], venus: ["#c99a3a", "#f3d58a"],
      jupiter: ["#9a7048", "#ead2ad"], saturn: ["#ad935f", "#f0e1b8"], uranus: ["#4fa9bb", "#c4f3f3"], neptune: ["#2a4cb0", "#86a8f2"],
    };
    const sunDir = new THREE.Vector3(0.55, 0.42, -0.72).normalize();
    if (airless) {
      g.add(space.starfield(900, 600, 1.2));
      const sunSize = 40 / Math.max(0.4, id === "moon" ? 1 : body.orbit!.a);
      const sunGlow = space.glow(Math.max(6, sunSize), "#fff2cc", 1);
      sunGlow.position.copy(sunDir).multiplyScalar(500);
      g.add(sunGlow);
      if (id === "moon") {
        const earthBall = space.planet("earth", 22, { clouds: true, segments: 48 });
        earthBall.position.set(-90, 165, -400);
        g.add(earthBall);
      }
    } else {
      const sky = skies[id]!;
      g.add(skyDome(sky[0], sky[1], sunDir, 700));
    }
    const sunLight = new THREE.DirectionalLight(0xfff2dc, id === "venus" ? 1.6 : 3.0);
    sunLight.position.copy(sunDir).multiplyScalar(30);
    sunLight.castShadow = this.game.engine.quality !== "low";
    sunLight.shadow.mapSize.set(1024, 1024);
    sunLight.shadow.camera.left = -6; sunLight.shadow.camera.right = 6; sunLight.shadow.camera.top = 12; sunLight.shadow.camera.bottom = -2;
    g.add(sunLight, new THREE.HemisphereLight(airless ? 0x8899bb : 0xdde8ff, 0x332822, airless ? 0.35 : 0.9));
    const texture = space.surface(body.kind).clone();
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(5, 2.5);
    texture.needsUpdate = true;
    if (body.jump === "platform") {
      // Floating platform above the cloud tops
      const deck = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.4, 0.5, 48), new THREE.MeshStandardMaterial({ color: "#dfe7f5", metalness: 0.5, roughness: 0.35 }));
      deck.position.y = -0.25;
      deck.receiveShadow = true;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(5.05, 0.12, 8, 64), new THREE.MeshStandardMaterial({ color: "#ff66bf", emissive: "#ff66bf", emissiveIntensity: 0.6 }));
      rim.rotation.x = Math.PI / 2;
      const clouds = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ map: texture, roughness: 1 }));
      clouds.rotation.x = -Math.PI / 2;
      clouds.position.y = -14;
      clouds.name = "cloudsea";
      g.add(deck, rim, clouds);
    } else {
      const ground = new THREE.Mesh(new THREE.CircleGeometry(220, 72), new THREE.MeshStandardMaterial({ map: texture, roughness: 1, color: id === "earth" ? "#9bc77a" : "#ffffff" }));
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      g.add(ground);
      // a few rocks for scale
      const rockMat = new THREE.MeshStandardMaterial({ color: body.color, roughness: 1 });
      for (let i = 0; i < 14; i++) {
        const a = i * 2.4, d = 6 + (i * 7.3) % 30;
        const rock = new THREE.Mesh(space.asteroidGeometry(0.25 + (i % 4) * 0.18, i * 3.1, 1), rockMat);
        rock.position.set(Math.cos(a) * d, 0.05, Math.sin(a) * d - 6);
        rock.castShadow = true;
        g.add(rock);
      }
    }
    // Height ruler (blueprint style), 0.5 m ticks
    const info = jumpOn(body.gravity);
    const top = Math.max(2, Math.ceil(info.height + 0.8));
    const ruler = new THREE.Group();
    const tickPts: THREE.Vector3[] = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, top, 0)];
    for (let h = 0; h <= top + 1e-6; h += 0.5) {
      const w = Number.isInteger(h) ? 0.32 : 0.16;
      tickPts.push(new THREE.Vector3(0, h, 0), new THREE.Vector3(w, h, 0));
      if (Number.isInteger(h) && h > 0) {
        const size = 0.2 * Math.max(1, top / 4);
        const label = textSprite(`${h} m`, { height: size, bg: "rgba(13,59,142,0.85)", border: "#f4f8ff" });
        label.position.set(-0.3 - size * 0.9, h, 0);
        ruler.add(label);
      }
    }
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(tickPts), new THREE.LineBasicMaterial({ color: "#f4f8ff" }));
    ruler.add(lines);
    ruler.position.set(-1.25, 0, 0.2);
    g.add(ruler);
    // Earth reference line at 0.5 m
    const earthLine = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.035), new THREE.MeshBasicMaterial({ color: "#5cf2a0", transparent: true, opacity: 0.85 }));
    earthLine.position.set(0, 0.5, 0.25);
    const tagSize = 0.18 * Math.max(1, top / 4);
    const earthLabel = textSprite("Earth jump", { height: tagSize, border: "#5cf2a0" });
    earthLabel.position.set(1.2 + tagSize * 2.6, 0.5, 0.25);
    g.add(earthLine, earthLabel);
    // Best-height marker
    const marker = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.05), new THREE.MeshBasicMaterial({ color: "#ffd95a" }));
    marker.add(bar);
    const markerLabel = textSprite(`${info.height.toFixed(info.height < 1 ? 2 : 1)} m!`, { height: 0.26 * Math.max(1, top / 4), border: "#ffd95a", fg: "#ffe9a8" });
    markerLabel.position.set(1.5 + 0.5 * Math.max(1, top / 4), 0, 0);
    marker.add(markerLabel);
    marker.position.set(0, info.height, 0.3);
    marker.visible = false;
    this.bestMarker = marker;
    g.add(marker);
    // Cadet
    if (!this.cadet) {
      this.cadet = this.game.cadetModel();
      this.cadet.root.traverse((n) => { if ((n as THREE.Mesh).isMesh) n.castShadow = true; });
      this.animator = new Animator(this.cadet, 9);
    }
    g.add(this.cadet.root);
    this.cadet.root.position.set(0, 0, 0);
    this.cadet.root.rotation.y = 0.35;
    g.add(this.dust.points);
    this.jumpWorld.add(g);
  }

  // ------------------------------------------------------------ lifecycle

  enter(params?: unknown) {
    this.build();
    const p = (params ?? {}) as { mode?: ObsMode; body?: BodyId };
    this.simDays = 0;
    this.setMode(p.mode ?? "orbits", false);
    this.select(p.body ?? "sun", false);
    this.publish();
    if (this.view.mode === "jump") {
      const b = BODY_BY_ID[this.view.jump.world];
      void this.game.say(`Gravity Jump lab! Your legs push just as hard on every world, but gravity is different. You are on ${b.name}. Tap JUMP!`);
    } else {
      void this.game.say("Welcome to the Star Observatory! The planets are shown where they really are today. Tap a planet to visit it, or change how fast time goes.");
    }
  }

  exit() {
    this.game.quiet();
  }

  setInsets(insets: Insets) {
    this.insets = insets;
  }

  setMode(mode: ObsMode, speak = true) {
    this.view = { ...this.view, mode };
    this.system.visible = mode === "orbits";
    this.lineup.visible = mode === "sizes";
    this.jumpWorld.visible = mode === "jump";
    this.backdrop.visible = mode !== "jump";
    this.wholeFamily = false;
    this.zoom = 1;
    this.scene.fog = null;
    if (mode === "jump") {
      const world = BODY_BY_ID[this.view.selected].jump !== "no" ? this.view.selected : this.view.jump.world;
      this.setJumpWorld(world, speak);
    } else if (mode === "sizes") {
      this.wholeFamily = this.view.selected === "sun";
      this.yaw = 0; this.pitch = 0.05;
      if (speak) void this.game.say("Size line-up! Every world here is drawn to the same scale, next to the edge of the Sun. One grid square is ten thousand kilometres.");
    } else {
      this.yaw = 0.35; this.pitch = 0.62;
      if (speak) void this.game.say("Orbit view. Change the time speed to watch the planets travel around the Sun. Planets close to the Sun move fastest!");
    }
    sfx("whoosh");
    this.snapCamera();
    this.publish();
  }

  select(id: BodyId, speak = true) {
    this.view = { ...this.view, selected: id };
    this.wholeFamily = id === "sun" && this.view.mode === "sizes";
    this.zoom = 1;
    const seen = this.game.save.get().v3.observatory;
    if (!seen.includes(id)) {
      this.game.save.set((s) => ({ v3: { ...s.v3, observatory: [...s.v3.observatory, id] } }));
      this.game.awardAchievements();
    }
    if (this.view.mode === "jump") {
      if (BODY_BY_ID[id].jump !== "no") this.setJumpWorld(id, speak);
      else if (speak) void this.game.say(BODY_BY_ID[id].jumpNote ?? "");
    } else if (speak) {
      sfx("select");
      const b = BODY_BY_ID[id];
      void this.game.say(`${b.name}. ${b.type}. ${b.facts[0]}`);
    }
    this.publish();
  }

  readAloud() {
    const b = BODY_BY_ID[this.view.selected];
    const moons = b.moons === null ? "" : ` It has ${b.moons === 0 ? "no moons" : b.moons === 1 ? "one moon" : `${b.moons} known moons`}.`;
    const year = b.id === "sun" ? "" : b.id === "moon" ? " It goes around Earth every 27 days." : ` One trip around the Sun takes ${b.yearText}.`;
    void this.game.say(`${b.name}, ${b.type}. ${b.facts.join(" ")} ${b.fits}${year}${moons}`);
  }

  setSpeed(index: number) {
    this.view = { ...this.view, speed: THREE.MathUtils.clamp(index, 0, SPEEDS.length - 1) };
    sfx("tap");
    this.publish();
  }

  resetTime() {
    this.simDays = 0;
    this.placeBodies();
    sfx("tap");
    this.publish();
  }

  setScale(scale: ObsScale) {
    if (scale === this.view.scale) return;
    this.view = { ...this.view, scale };
    this.applyScale();
    sfx("whoosh");
    if (scale === "true") void this.game.say("True distances! Now the gaps between the planets are drawn to scale. Space is mostly empty space. The planets have been made bigger so you can still find them.");
    this.snapCamera();
    this.publish();
  }

  showWholeFamily() {
    this.wholeFamily = true;
    this.zoom = 1;
    sfx("whoosh");
  }

  zoomBy(factor: number) {
    this.zoom = THREE.MathUtils.clamp(this.zoom * factor, 0.12, 8);
  }

  wheel(deltaY: number) {
    this.zoomBy(1 + deltaY * 0.0012);
  }

  // ------------------------------------------------------------ gravity jump

  private setJumpWorld(id: BodyId, speak = true) {
    const body = BODY_BY_ID[id];
    if (body.jump === "no") return;
    this.buildJumpWorld(id);
    const info = jumpOn(body.gravity);
    this.jumpY = 0;
    this.jumpT = 0;
    if (this.cadet) this.cadet.root.position.y = 0;
    if (this.bestMarker) this.bestMarker.visible = false;
    this.view = { ...this.view, selected: id, jump: { world: id, phase: "ready", height: info.height, airTime: info.airTime, current: 0, timer: 0, jumps: 0 } };
    this.scene.fog = body.jump === "platform" || id === "venus" ? new THREE.Fog(new THREE.Color(id === "venus" ? "#f3d58a" : "#d8d0c0"), 40, 520) : null;
    if (speak) {
      const g = body.gravity;
      const words = g < 0.2 ? `Gravity here is tiny: only ${Math.round(g * 100)} percent of Earth's.` : g < 0.95 ? `Gravity here is weaker than on Earth: ${Math.round(g * 100)} percent.` : g < 1.05 ? "This is normal Earth gravity." : `Gravity here is stronger than on Earth: ${g.toFixed(1)} times as strong.`;
      void this.game.say(`Welcome to ${body.name}! ${words} ${body.jumpNote ? body.jumpNote + " " : ""}Tap JUMP to see how high you can go!`);
    }
    this.snapCamera();
    this.publish();
  }

  jump() {
    if (this.view.mode !== "jump") return;
    const j = this.view.jump;
    if (j.phase === "crouch" || j.phase === "air") return;
    this.view = { ...this.view, jump: { ...j, phase: "crouch", timer: 0, current: 0 } };
    this.animator?.set("jump");
    if (this.animator) this.animator.time = 0;
    sfx("boost");
    this.publish();
  }

  private stepJump(dt: number) {
    const j = this.view.jump;
    const body = BODY_BY_ID[j.world];
    const info = jumpOn(body.gravity);
    if (j.phase === "crouch") {
      const timer = j.timer + dt;
      if (timer >= 0.26) {
        this.jumpT = 0;
        this.view = { ...this.view, jump: { ...j, phase: "air", timer: 0 } };
        this.animator?.set("float");
      } else this.view.jump = { ...j, timer };
    } else if (j.phase === "air") {
      this.jumpT += dt;
      const t = Math.min(this.jumpT, info.airTime);
      this.jumpY = Math.max(0, info.v0 * t - 0.5 * info.g * t * t);
      const current = Math.max(j.current, this.jumpY);
      if (this.bestMarker && current >= info.height * 0.98) this.bestMarker.visible = true;
      if (this.jumpT >= info.airTime) {
        this.jumpY = 0;
        this.animator?.set("cheer");
        sfx("land");
        if (body.jump === "ground") this.dust.emit({ position: new THREE.Vector3(0, 0.05, 0), velocity: new THREE.Vector3(0, 0.6 * Math.sqrt(body.gravity), 0), spread: 1.4, life: 1.6 / Math.sqrt(Math.max(0.1, body.gravity)), size: 0.18, color: body.color, colorEnd: "#ffffff", count: 40 });
        const jumps = j.jumps + 1;
        this.view = { ...this.view, jump: { ...j, phase: "landed", current: info.height, timer: 0, jumps } };
        if (jumps === 1) {
          const comp = body.gravity < 1 ? `That's ${(info.height / 0.5).toFixed(info.height / 0.5 < 10 ? 1 : 0)} times higher than the same jump on Earth!` : body.gravity > 1.05 ? "That's lower than on Earth, because strong gravity pulls you down hard." : "That's a normal Earth jump.";
          void this.game.say(`You jumped ${speakMetres(info.height)} high and stayed in the air for ${info.airTime.toFixed(1)} seconds. ${comp}`);
          const jumped = this.game.save.get().v3.jumps;
          if (!jumped.includes(j.world)) {
            this.game.save.set((s) => ({ v3: { ...s.v3, jumps: [...s.v3.jumps, j.world] } }));
            this.game.awardAchievements();
          }
        }
        this.publish();
        window.setTimeout(() => { if (this.view.jump.phase === "landed") this.animator?.set("idle"); }, 1600);
      } else this.view.jump = { ...j, current };
    }
    if (this.cadet) this.cadet.root.position.y = this.jumpY;
    this.animator?.update(dt);
    this.dust.update(dt);
    const sea = this.jumpScene?.getObjectByName("cloudsea") as THREE.Mesh | undefined;
    if (sea) ((sea.material as THREE.MeshStandardMaterial).map!).offset.x += dt * 0.004;
  }

  // ------------------------------------------------------------ camera

  /** Where the camera should look and how far away it should be for the current mode. */
  private desired() {
    const mode = this.view.mode;
    const id = this.view.selected;
    if (mode === "orbits") {
      if (id === "sun") {
        this.desiredTarget.set(0, 0, 0);
        this.desiredDist = this.view.scale === "fit" ? 470 : 4200;
      } else if (id === "moon") {
        const earth = this.orbiters.find((o) => o.body.id === "earth")!;
        const moon = this.moonPivot.getObjectByName("moon")!;
        earth.holder.getWorldPosition(this.desiredTarget).lerp(moon.getWorldPosition(new THREE.Vector3()), 0.5);
        this.desiredDist = 22;
      } else {
        const o = this.orbiters.find((x) => x.body.id === id)!;
        o.holder.getWorldPosition(this.desiredTarget);
        const r = o.radius * o.tilt.scale.x;
        this.desiredDist = Math.max(r * (id === "saturn" ? 16 : 11), 12);
      }
    } else if (mode === "sizes") {
      if (this.wholeFamily) {
        this.desiredTarget.set(this.lineupEnd * 0.42, 0, 0);
        this.desiredDist = this.fitDistance(this.lineupEnd * 1.12 + 60, 160);
      } else {
        const entry = this.lineupBodies.get(id)!;
        this.desiredTarget.set(entry.x, 0, 0);
        const w = Math.max(entry.r * 4.2, 34);
        this.desiredDist = this.fitDistance(w, w * 0.62);
      }
    } else {
      const info = jumpOn(BODY_BY_ID[this.view.jump.world].gravity);
      const top = Math.max(2.2, info.height + 1.9);
      this.desiredTarget.set(0.1, top / 2 - 0.05, 0);
      this.desiredDist = this.fitDistance(Math.max(4.6, top * 0.8), top);
    }
    this.desiredDist *= this.zoom;
  }

  /** Camera distance that fits a width × height box inside the free part of the screen. */
  private fitDistance(width: number, height: number) {
    const W = this.game.engine.width, H = this.game.engine.height;
    const { l, r, t, b } = this.insets;
    const aw = Math.max(160, W - l - r), ah = Math.max(160, H - t - b);
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * (ah / H);
    const tanH = tanV * (aw / ah);
    return Math.max(height / 2 / tanV, width / 2 / tanH);
  }

  private snapCamera() {
    this.desired();
    this.target.copy(this.desiredTarget);
    this.dist = this.desiredDist;
  }

  private placeCamera(dt: number) {
    this.desired();
    const k = 1 - Math.exp(-4 * dt);
    this.target.lerp(this.desiredTarget, this.view.mode === "orbits" && this.view.selected !== "sun" ? Math.max(k, 0.5) : k);
    this.dist += (this.desiredDist - this.dist) * k;
    const W = this.game.engine.width, H = this.game.engine.height;
    const { l, r, t, b } = this.insets;
    const aw = Math.max(160, W - l - r), ah = Math.max(160, H - t - b);
    const cx = l + aw / 2, cy = t + ah / 2;
    const cam = this.camera;
    cam.aspect = W / H;
    const pitch = this.view.mode === "jump" ? THREE.MathUtils.clamp(this.pitch, -0.05, 0.6) : this.pitch;
    cam.position.set(
      this.target.x + Math.sin(this.yaw) * Math.cos(pitch) * this.dist,
      this.target.y + Math.sin(pitch) * this.dist,
      this.target.z + Math.cos(this.yaw) * Math.cos(pitch) * this.dist,
    );
    cam.lookAt(this.target);
    if (this.view.mode === "jump") { cam.near = 0.05; cam.far = 3000; }
    else { cam.near = Math.max(0.2, this.dist * 0.004); cam.far = 60000; }
    cam.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
    cam.updateProjectionMatrix();
  }

  // ------------------------------------------------------------ frame

  update(dt: number, time: number) {
    const mode = this.view.mode;
    if (mode === "orbits") {
      const speed = SPEEDS[this.view.speed].days;
      if (speed > 0) {
        this.simDays += speed * dt;
        this.placeBodies();
      }
      const spin = this.game.reduceMotion ? 0.05 : 0.35;
      for (const o of this.orbiters) o.planet.rotation.y += dt * spin * Math.min(2.5, Math.pow(24 / o.body.spinHours, 0.35));
      this.sun.rotation.y += dt * 0.03;
    } else if (mode === "sizes") {
      for (const [, e] of this.lineupBodies) e.node.rotation.y += dt * 0.06;
    } else {
      if (input.pressed("space", "arrowup", "w")) this.jump();
      this.stepJump(dt);
    }
    if (!this.dragging && mode !== "jump" && !this.game.reduceMotion) this.yaw += dt * (mode === "orbits" ? 0.012 : 0);
    updateStars(this.backdrop, time);
    this.placeCamera(dt);
    this.publishTimer -= dt;
    if (this.publishTimer <= 0) {
      this.publishTimer = 0.25;
      this.publish();
    }
  }

  private publish() {
    const date = new Date(this.startDate.getTime() + this.simDays * DAY_MS);
    const dateText = date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    this.game.ui.set({ observatory: { ...this.view, jump: { ...this.view.jump }, dateText, daysFromNow: this.simDays } });
  }

  pointer(info: PointerInfo) {
    if (info.type === "down") this.dragging = false;
    if (info.type === "move" && info.pointers > 0 && Math.abs(info.dx) + Math.abs(info.dy) > 1) {
      this.dragging = true;
      if (this.view.mode === "sizes") {
        // Drag sideways to slide along the line-up.
        const worldPerPx = (2 * this.dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / this.game.engine.height;
        this.wholeFamily = false;
        const entry = this.lineupBodies.get(this.view.selected);
        const x = THREE.MathUtils.clamp(this.target.x - info.dx * worldPerPx, -200, this.lineupEnd + 50);
        // Pick the nearest body to the new centre so the info panel follows.
        let nearest: BodyId = this.view.selected, best = Infinity;
        for (const [id, e] of this.lineupBodies) { const d = Math.abs(e.x - x); if (d < best) { best = d; nearest = id; } }
        this.target.x = x;
        this.desiredTarget.x = x;
        if (nearest !== this.view.selected && entry) this.view = { ...this.view, selected: nearest };
      } else {
        this.yaw -= info.dx * 0.006;
        this.pitch = THREE.MathUtils.clamp(this.pitch + info.dy * 0.004, -1.35, 1.4);
      }
    }
    if (info.type === "up") window.setTimeout(() => { this.dragging = false; }, 60);
    if (info.type === "tap") {
      if (this.view.mode === "jump") { this.jump(); return; }
      this.raycaster.setFromCamera(new THREE.Vector2(info.x, info.y), this.camera);
      const root = this.view.mode === "orbits" ? this.system : this.lineup;
      const hits = this.raycaster.intersectObject(root, true).filter((h) => h.object.userData.body);
      if (hits.length) this.select(hits[0].object.userData.body as BodyId);
    }
  }

  // ------------------------------------------------------------ QA

  qaJumpLand() {
    this.jump();
    this.stepJump(0.3);
    const info = jumpOn(BODY_BY_ID[this.view.jump.world].gravity);
    this.jumpT = info.airTime / 2 - 0.01;
    this.stepJump(0.01);
  }
}

function speakMetres(m: number) {
  if (m < 1) return `${Math.round(m * 100)} centimetres`;
  return `${m.toFixed(1)} metres`;
}
