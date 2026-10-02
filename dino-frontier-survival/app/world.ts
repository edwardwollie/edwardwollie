import {
  Color3, Color4, DirectionalLight, DynamicTexture, HemisphericLight, Matrix, Mesh, MeshBuilder, ParticleSystem, Quaternion, Scene,
  ShadowGenerator, StandardMaterial, Texture, Vector3, VertexBuffer, VertexData,
} from "@babylonjs/core";
import { BLUEPRINT } from "./blueprints";
import { buildModel, buildPropMeshes, type Model } from "./model-builder";
import type { Sector } from "./frontier-data";

export type Weather = "fireflies" | "rain" | "dust" | "pollen" | "spores" | "embers" | "storm" | "snow" | "quantum" | "ash";
export type Biome = {
  ground: [string, string, string]; rock: string; fog: string; fogDensity: number;
  skyTop: string; skyHorizon: string; sun: string; sunPower: number; hemi: number; hemiGround: string;
  leaf: string; leaf2: string; trunk: string; crystal: string; grass: string;
  trees: number; crystals: number; rocks: number; grassTufts: number;
  weather: Weather; weatherColor: string; mountain: string; stars: boolean; planet: string; pools?: string; glow: number;
};

/** One hand-tuned environment per sector, keyed by sector id. */
export const BIOMES: Record<number, Biome> = {
  1: { ground: ["#1d5a35", "#2f7a3f", "#5b8f3a"], rock: "#3b4a44", fog: "#123a36", fogDensity: 0.0085, skyTop: "#06182b", skyHorizon: "#3c8f86", sun: "#ffe2b0", sunPower: 1.5, hemi: 0.75, hemiGround: "#14301f", leaf: "#1f8a4c", leaf2: "#36b26a", trunk: "#3a2414", crystal: "#61ff9a", grass: "#3f9a4a", trees: 70, crystals: 8, rocks: 26, grassTufts: 1400, weather: "fireflies", weatherColor: "#b8ff8a", mountain: "#0f2f2e", stars: true, planet: "#7ad6ff", glow: 0.8 },
  2: { ground: ["#2c4a2a", "#3e5e2a", "#5d6b2a"], rock: "#3a3f2a", fog: "#2f4220", fogDensity: 0.013, skyTop: "#151d0c", skyHorizon: "#8aa83a", sun: "#e8ffb0", sunPower: 1.1, hemi: 0.8, hemiGround: "#1f2a10", leaf: "#5d7a1f", leaf2: "#8ba832", trunk: "#2f2a14", crystal: "#d9ff3f", grass: "#6a8a2a", trees: 55, crystals: 10, rocks: 20, grassTufts: 1500, weather: "rain", weatherColor: "#c8ff6a", mountain: "#1c2610", stars: false, planet: "#d9ff3f", pools: "#b7ff3a", glow: 0.85 },
  3: { ground: ["#8a4a24", "#a8622e", "#c98a4a"], rock: "#7a3d1e", fog: "#6a3a20", fogDensity: 0.0075, skyTop: "#3a2a4a", skyHorizon: "#ffb070", sun: "#ffd29a", sunPower: 1.9, hemi: 0.7, hemiGround: "#4a2410", leaf: "#7a8a2a", leaf2: "#a8962a", trunk: "#4a2a14", crystal: "#ffb238", grass: "#b0803a", trees: 16, crystals: 8, rocks: 70, grassTufts: 500, weather: "dust", weatherColor: "#ffcf9a", mountain: "#5a2a14", stars: false, planet: "#ffd0a0", glow: 0.6 },
  4: { ground: ["#6a7a22", "#93a032", "#c2b44a"], rock: "#6a6248", fog: "#9ab8bc", fogDensity: 0.0065, skyTop: "#2a6aa8", skyHorizon: "#d2ecf2", sun: "#fff6d8", sunPower: 2.1, hemi: 0.95, hemiGround: "#4a5220", leaf: "#4a8a2a", leaf2: "#6aa83a", trunk: "#4a3018", crystal: "#35e8ff", grass: "#b2b440", trees: 30, crystals: 6, rocks: 28, grassTufts: 2400, weather: "pollen", weatherColor: "#fff3a0", mountain: "#6a8aa0", stars: false, planet: "#ffffff", glow: 0.5 },
  5: { ground: ["#121e1a", "#1b2c24", "#283a2e"], rock: "#0d1114", fog: "#0b1416", fogDensity: 0.012, skyTop: "#04050b", skyHorizon: "#3a1020", sun: "#ff9a9a", sunPower: 0.9, hemi: 0.6, hemiGround: "#0a1410", leaf: "#16503a", leaf2: "#0f3a40", trunk: "#1a120c", crystal: "#ff4d62", grass: "#1f4a32", trees: 95, crystals: 16, rocks: 30, grassTufts: 1500, weather: "spores", weatherColor: "#ff6a7a", mountain: "#0a0c10", stars: true, planet: "#ff4d62", glow: 1 },
  6: { ground: ["#5a2a14", "#7a3a1a", "#a85a2a"], rock: "#3a1a0e", fog: "#4a1c0c", fogDensity: 0.009, skyTop: "#260808", skyHorizon: "#ff6e3a", sun: "#ffb080", sunPower: 1.6, hemi: 0.7, hemiGround: "#3a140a", leaf: "#7a3a14", leaf2: "#a8542a", trunk: "#2a140a", crystal: "#ff6e3a", grass: "#a8622a", trees: 26, crystals: 10, rocks: 40, grassTufts: 1700, weather: "embers", weatherColor: "#ff8a3a", mountain: "#2a0c06", stars: false, planet: "#ffb080", glow: 0.85 },
  7: { ground: ["#231c3a", "#2e2650", "#3c3460"], rock: "#1a1530", fog: "#1a1630", fogDensity: 0.011, skyTop: "#08061a", skyHorizon: "#5a3a9a", sun: "#c8b0ff", sunPower: 1, hemi: 0.7, hemiGround: "#140f26", leaf: "#3a2a7a", leaf2: "#5a3aa8", trunk: "#1a1428", crystal: "#a56dff", grass: "#4a3a8a", trees: 80, crystals: 14, rocks: 24, grassTufts: 1300, weather: "storm", weatherColor: "#c8c0ff", mountain: "#100c22", stars: false, planet: "#a56dff", glow: 0.95 },
  8: { ground: ["#1e3a52", "#2e5a72", "#86a8b8"], rock: "#2a3a4a", fog: "#9ab8cc", fogDensity: 0.0095, skyTop: "#1a3a6a", skyHorizon: "#cfe6f5", sun: "#eaf6ff", sunPower: 1.7, hemi: 0.9, hemiGround: "#1a2a3a", leaf: "#2a6a8a", leaf2: "#3a8aa8", trunk: "#1e2a34", crystal: "#30d8ff", grass: "#5a8aa0", trees: 40, crystals: 18, rocks: 46, grassTufts: 900, weather: "snow", weatherColor: "#ffffff", mountain: "#5a7a95", stars: false, planet: "#cfe6f5", glow: 0.7 },
  9: { ground: ["#2a1430", "#3a1a44", "#5a2a5a"], rock: "#1a0a20", fog: "#1a0a22", fogDensity: 0.01, skyTop: "#0a0414", skyHorizon: "#ff4fba", sun: "#ffc0ee", sunPower: 1.1, hemi: 0.7, hemiGround: "#1a0a1a", leaf: "#6a2a7a", leaf2: "#2a8aa8", trunk: "#1a0a1a", crystal: "#ff4fba", grass: "#7a3a8a", trees: 22, crystals: 34, rocks: 30, grassTufts: 1000, weather: "quantum", weatherColor: "#ff9be0", mountain: "#140616", stars: true, planet: "#35e8ff", glow: 1.05 },
  10: { ground: ["#1a1210", "#2a1a14", "#3a2418"], rock: "#120c0a", fog: "#2a1008", fogDensity: 0.011, skyTop: "#120404", skyHorizon: "#ff7a2a", sun: "#ffc080", sunPower: 1.3, hemi: 0.6, hemiGround: "#2a0c06", leaf: "#3a1a10", leaf2: "#5a2a14", trunk: "#140a06", crystal: "#ffe45b", grass: "#4a2a14", trees: 24, crystals: 22, rocks: 60, grassTufts: 700, weather: "ash", weatherColor: "#ffb070", mountain: "#1a0806", stars: true, planet: "#ffe45b", pools: "#ff5a1a", glow: 1.05 },
};

export const ARENA = 35;
export const FENCE = 37.5;
export const OUTPOST = new Vector3(0, 0, 25);

/* ───────────── Seeded noise ───────────── */

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(x: number, y: number, s: number) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x: number, y: number, s: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, s: number) {
  let sum = 0, amp = 0.5, f = 1;
  for (let i = 0; i < 4; i++) { sum += amp * noise(x * f, y * f, s + i * 17); f *= 2.03; amp *= 0.5; }
  return sum;
}
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Terrain height in metres — gentle inside the arena, rising into hills beyond the fence. */
export function makeHeight(seed: number) {
  return (x: number, z: number) => {
    const r = Math.hypot(x, z);
    let h = (fbm(x * 0.035, z * 0.035, seed) - 0.5) * 2.4 + (noise(x * 0.17, z * 0.17, seed + 9) - 0.5) * 0.3;
    h *= 0.3 + 0.7 * smooth(5, 30, r);
    const rim = smooth(FENCE + 1, 85, r);
    h += rim * rim * 16 + rim * (fbm(x * 0.05, z * 0.05, seed + 3) - 0.3) * 14;
    h *= 0.08 + 0.92 * smooth(4.6, 9, Math.hypot(x - OUTPOST.x, z - OUTPOST.z));
    return h;
  };
}

/* ───────────── Textures ───────────── */

/** Soft round sprite shared by every particle system. */
export function flareTexture(scene: Scene): Texture {
  const meta = (scene.metadata ??= {});
  if (meta.flare) return meta.flare;
  const t = new DynamicTexture("flare", { width: 64, height: 64 }, scene, false);
  const c = t.getContext() as CanvasRenderingContext2D;
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.25, "rgba(255,255,255,.85)"); g.addColorStop(0.6, "rgba(255,255,255,.18)"); g.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  t.hasAlpha = true;
  t.update();
  meta.flare = t;
  return t;
}

function detailTexture(scene: Scene, seed: number): Texture {
  const t = new DynamicTexture("groundDetail", { width: 256, height: 256 }, scene, true);
  const c = t.getContext() as CanvasRenderingContext2D;
  const img = c.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const n = 0.62 * noise(x / 9, y / 9, seed) + 0.38 * hash2(x, y, seed + 5);
    const v = 175 + n * 80;
    const i = (y * 256 + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  t.update();
  t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE;
  return t;
}

/* ───────────── World ───────────── */

export type Collider = { x: number; z: number; r: number };
export type World = {
  biome: Biome;
  heightAt: (x: number, z: number) => number;
  colliders: Collider[];
  sun: DirectionalLight;
  hemi: HemisphericLight;
  shadow: ShadowGenerator | null;
  outpost: Model;
  weather: ParticleSystem | null;
  weatherAnchor: Vector3;
  pools: { x: number; z: number; r: number }[];
  fence: Mesh;
  sky: Mesh;
  tick: (dt: number, t: number) => void;
};

const C = (hex: string) => Color3.FromHexString(hex);

export function buildWorld(scene: Scene, sector: Sector, quality: "low" | "medium" | "high", onThunder?: () => void): World {
  const biome = BIOMES[sector.id] ?? BIOMES[1];
  const seed = sector.id * 7919;
  const heightAt = makeHeight(seed);
  const rand = rng(seed);
  const detail = quality === "low" ? 0.45 : quality === "medium" ? 0.75 : 1;

  scene.clearColor = Color4.FromColor3(C(biome.fog), 1);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = biome.fogDensity;
  scene.fogColor = C(biome.fog);
  scene.ambientColor = C(biome.hemiGround).scale(0.6);

  const hemi = new HemisphericLight("sky", new Vector3(0.2, 1, 0.1), scene);
  hemi.intensity = Math.max(0.85, biome.hemi + 0.15);
  hemi.diffuse = Color3.Lerp(C(biome.skyHorizon), Color3.White(), 0.55);
  hemi.groundColor = C(biome.hemiGround);
  hemi.specular = Color3.Black();
  const sun = new DirectionalLight("sun", new Vector3(-0.45, -0.85, 0.35).normalize(), scene);
  sun.intensity = biome.sunPower;
  sun.diffuse = C(biome.sun);
  sun.position = sun.direction.scale(-60);
  let shadow: ShadowGenerator | null = null;
  if (quality !== "low") {
    shadow = new ShadowGenerator(quality === "high" ? 2048 : 1024, sun);
    shadow.usePercentageCloserFiltering = true;
    shadow.filteringQuality = quality === "high" ? ShadowGenerator.QUALITY_MEDIUM : ShadowGenerator.QUALITY_LOW;
    shadow.bias = 0.0008;
    shadow.normalBias = 0.02;
    sun.autoUpdateExtends = false;
    sun.shadowFrustumSize = 56;
    sun.shadowMinZ = 1;
    sun.shadowMaxZ = 140;
  }

  /* Terrain */
  const SIZE = 220, SUB = quality === "low" ? 110 : 170;
  const ground = MeshBuilder.CreateGround("terrain", { width: SIZE, height: SIZE, subdivisions: SUB, updatable: true }, scene);
  const pos = ground.getVerticesData(VertexBuffer.PositionKind)!;
  const colors: number[] = [];
  const [g0, g1, g2] = biome.ground.map(C), fence = C(biome.rock);
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], z = pos[i + 2], h = heightAt(x, z), r = Math.hypot(x, z);
    pos[i + 1] = h;
    const n = fbm(x * 0.06, z * 0.06, seed + 31);
    let col = Color3.Lerp(g0, g1, smooth(0.3, 0.7, n));
    col = Color3.Lerp(col, g2, smooth(1.5, 9, h) * 0.8 + smooth(0.62, 0.8, n) * 0.35);
    col = Color3.Lerp(col, fence, smooth(10, 26, h) * 0.85);
    const track = Math.abs(r - FENCE) < 1.6 ? 0.45 : 0;
    col = Color3.Lerp(col, fence.scale(0.7), track);
    const pad = 1 - smooth(4.2, 4.8, Math.hypot(x - OUTPOST.x, z - OUTPOST.z));
    col = Color3.Lerp(col, C("#0d1a1c"), pad * 0.8);
    colors.push(col.r, col.g, col.b, 1);
  }
  ground.updateVerticesData(VertexBuffer.PositionKind, pos);
  const normals: number[] = [];
  VertexData.ComputeNormals(pos, ground.getIndices()!, normals);
  ground.updateVerticesData(VertexBuffer.NormalKind, normals);
  ground.setVerticesData(VertexBuffer.ColorKind, colors);
  const gm = new StandardMaterial("terrainMat", scene);
  gm.diffuseTexture = detailTexture(scene, seed);
  (gm.diffuseTexture as Texture).uScale = (gm.diffuseTexture as Texture).vScale = 48;
  gm.specularColor = Color3.Black();
  ground.material = gm;
  ground.receiveShadows = true;
  ground.isPickable = true;
  ground.freezeWorldMatrix();

  /* Sky dome with vertex-colour gradient */
  const sky = MeshBuilder.CreateSphere("skyDome", { diameter: 900, segments: 24, sideOrientation: Mesh.BACKSIDE }, scene);
  const sp = sky.getVerticesData(VertexBuffer.PositionKind)!, sc: number[] = [];
  const top = C(biome.skyTop), hor = C(biome.skyHorizon), below = C(biome.fog);
  for (let i = 0; i < sp.length; i += 3) {
    const t = sp[i + 1] / 450;
    const c = t > 0 ? Color3.Lerp(Color3.Lerp(hor, top, smooth(0, 0.18, t) * 0.55), top, smooth(0.1, 0.7, t)) : Color3.Lerp(hor, below, smooth(0, 0.15, -t));
    sc.push(c.r, c.g, c.b, 1);
  }
  sky.setVerticesData(VertexBuffer.ColorKind, sc);
  const skyMat = new StandardMaterial("skyMat", scene);
  skyMat.disableLighting = true; skyMat.emissiveColor = Color3.White(); skyMat.diffuseColor = Color3.Black(); skyMat.fogEnabled = false;
  sky.material = skyMat; sky.infiniteDistance = true; sky.isPickable = false; sky.applyFog = false;

  const skyObjects: Mesh[] = [];
  if (biome.stars) {
    const star = MeshBuilder.CreatePolyhedron("star", { type: 0, size: 0.9 }, scene);
    const sm = new StandardMaterial("starMat", scene);
    sm.disableLighting = true; sm.emissiveColor = new Color3(0.95, 0.97, 1); sm.fogEnabled = false; sm.metadata = { glow: true };
    star.material = sm; star.infiniteDistance = true; star.isPickable = false;
    const mats: number[] = [];
    for (let i = 0; i < 420; i++) {
      const a = rand() * Math.PI * 2, e = 0.12 + Math.pow(rand(), 0.7) * 1.35, R = 400;
      const s = 0.4 + rand() * 1.3;
      Matrix.Compose(new Vector3(s, s, s), Quaternion.Identity(), new Vector3(Math.cos(a) * Math.cos(e) * R, Math.sin(e) * R, Math.sin(a) * Math.cos(e) * R)).copyToArray(mats, i * 16);
    }
    star.thinInstanceSetBuffer("matrix", new Float32Array(mats), 16);
    skyObjects.push(star);
  }
  const sunDir = sun.direction.scale(-1);
  const sunDisc = MeshBuilder.CreateDisc("sunDisc", { radius: 18, tessellation: 32 }, scene);
  const sdm = new StandardMaterial("sunMat", scene);
  sdm.disableLighting = true; sdm.emissiveColor = C(biome.sun); sdm.opacityTexture = flareTexture(scene); sdm.fogEnabled = false; sdm.metadata = { glow: true };
  sunDisc.material = sdm; sunDisc.position = sunDir.scale(400); sunDisc.billboardMode = Mesh.BILLBOARDMODE_ALL; sunDisc.infiniteDistance = true;
  skyObjects.push(sunDisc);
  const planet = MeshBuilder.CreateSphere("planet", { diameter: 120, segments: 32 }, scene);
  const pm = new StandardMaterial("planetMat", scene);
  pm.diffuseColor = C(biome.planet); pm.emissiveColor = C(biome.planet).scale(0.08); pm.specularColor = Color3.Black(); pm.fogEnabled = false;
  planet.material = pm; planet.position = new Vector3(-260, 150, 300); planet.infiniteDistance = true;
  const ring = MeshBuilder.CreateTorus("planetRing", { diameter: 210, thickness: 6, tessellation: 64 }, scene);
  const rm = new StandardMaterial("ringMat", scene);
  rm.diffuseColor = C(biome.planet).scale(0.8); rm.emissiveColor = C(biome.planet).scale(0.25); rm.alpha = 0.55; rm.fogEnabled = false;
  ring.material = rm; ring.parent = planet; ring.scaling.y = 0.05; ring.rotation.set(0.35, 0, 0.42);
  skyObjects.push(planet);
  for (const m of [...skyObjects, ring]) m.isPickable = false;

  /* Mountain silhouettes */
  for (const [R, H, shade] of [[118, 34, 0.9], [170, 60, 0.65]] as const) {
    const bottom: Vector3[] = [], top2: Vector3[] = [];
    for (let i = 0; i <= 160; i++) {
      const a = (i / 160) * Math.PI * 2, x = Math.cos(a) * R, z = Math.sin(a) * R;
      const peak = Math.pow(fbm(Math.cos(a) * 3 + R, Math.sin(a) * 3, seed + 77), 1.6) * H * 1.8 + H * 0.15;
      bottom.push(new Vector3(x, -4, z));
      top2.push(new Vector3(x * 0.96, peak, z * 0.96));
    }
    const ridge = MeshBuilder.CreateRibbon(`ridge${R}`, { pathArray: [bottom, top2], closePath: false, sideOrientation: Mesh.DOUBLESIDE }, scene);
    const rmat = new StandardMaterial(`ridgeMat${R}`, scene);
    rmat.diffuseColor = Color3.Black(); rmat.specularColor = Color3.Black();
    rmat.emissiveColor = Color3.Lerp(C(biome.mountain), C(biome.fog), 1 - shade);
    ridge.material = rmat; ridge.isPickable = false; ridge.freezeWorldMatrix();
  }

  /* Props from blueprints, thin-instanced */
  const colliders: Collider[] = [];
  const place = (count: number, inner: number, outer: number, minGap: number, cb: (x: number, z: number, s: number, yaw: number) => void) => {
    let placed = 0, guard = 0;
    while (placed < count && guard++ < count * 25) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(inner * inner + rand() * (outer * outer - inner * inner));
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.hypot(x - OUTPOST.x, z - OUTPOST.z) < 8) continue;
      if (Math.abs(r - FENCE) < 2.2) continue;
      if (colliders.some(c => Math.hypot(c.x - x, c.z - z) < c.r + minGap)) continue;
      cb(x, z, 0.75 + rand() * 0.6, rand() * Math.PI * 2);
      placed++;
    }
  };
  const instance = (meshes: Mesh[], list: Matrix[], castShadow: boolean) => {
    if (!list.length) { meshes.forEach(m => m.dispose()); return; }
    const buf = new Float32Array(list.length * 16);
    list.forEach((m, i) => m.copyToArray(buf, i * 16));
    for (const m of meshes) {
      m.thinInstanceSetBuffer("matrix", buf, 16, true);
      m.isPickable = false;
      m.receiveShadows = true;
      if (castShadow && shadow) shadow.addShadowCaster(m, false);
      m.freezeWorldMatrix();
      m.alwaysSelectAsActiveMesh = true;
    }
  };
  const mat = (x: number, z: number, s: number, yaw: number, sy = s, tilt = 0) => Matrix.Compose(new Vector3(s, sy, s), Quaternion.RotationYawPitchRoll(yaw, tilt, 0), new Vector3(x, heightAt(x, z) - 0.05, z));

  const trees: Matrix[] = [], crystals: Matrix[] = [], rocks: Matrix[] = [];
  const treeCount = Math.round(biome.trees * detail);
  place(Math.round(treeCount * 0.22), 9, ARENA - 2, 3, (x, z, s, yaw) => { trees.push(mat(x, z, s * 1.1, yaw)); colliders.push({ x, z, r: 0.45 * s + 0.2 }); });
  place(Math.round(biome.crystals * 0.6), 8, ARENA - 2, 2.5, (x, z, s, yaw) => { crystals.push(mat(x, z, s, yaw)); colliders.push({ x, z, r: 0.9 * s }); });
  place(Math.round(biome.rocks * 0.35), 8, ARENA - 1, 2, (x, z, s, yaw) => { rocks.push(mat(x, z, s * 1.3, yaw, s * 0.8, 0.2)); colliders.push({ x, z, r: 0.95 * s * 1.3 }); });
  const n = colliders.length;
  place(Math.round(treeCount * 0.9), FENCE + 3, 92, 1.5, (x, z, s, yaw) => trees.push(mat(x, z, s * 1.35, yaw)));
  place(Math.round(biome.crystals * 0.6), FENCE + 3, 80, 2, (x, z, s, yaw) => crystals.push(mat(x, z, s * 1.4, yaw)));
  place(Math.round(biome.rocks * 0.7 * detail), FENCE + 3, 95, 1, (x, z, s, yaw) => rocks.push(mat(x, z, s * 2.2, yaw, s * 1.4, 0.3)));
  colliders.splice(n); // only arena props block movement
  instance(buildPropMeshes(scene, BLUEPRINT.fern, { skin: biome.leaf, accent: biome.leaf2, dark: biome.trunk, glow: biome.crystal }), trees, true);
  instance(buildPropMeshes(scene, BLUEPRINT.crystal, { glow: biome.crystal, dark: biome.rock }), crystals, true);
  const rock = MeshBuilder.CreatePolyhedron("rock", { type: 2, size: 0.9 }, scene);
  const rkm = new StandardMaterial("rockMat", scene);
  rkm.diffuseColor = C(biome.rock).scale(1.4); rkm.specularColor = new Color3(0.08, 0.08, 0.08);
  rock.material = rkm;
  instance([rock], rocks, true);

  /* Grass tufts */
  const tuftCount = Math.round(biome.grassTufts * detail);
  if (tuftCount) {
    // A clump of three thin blades leaning outward reads as grass rather than spikes.
    const blades = [0, 1, 2].map(i => {
      const blade = MeshBuilder.CreateCylinder(`blade${i}`, { height: 0.42, diameterTop: 0, diameterBottom: 0.07, tessellation: 3 }, scene);
      const a = (i / 3) * Math.PI * 2;
      blade.position.set(Math.sin(a) * 0.06, 0.19, Math.cos(a) * 0.06);
      blade.rotation.set(Math.cos(a) * 0.38, 0, -Math.sin(a) * 0.38);
      return blade;
    });
    const tuft = Mesh.MergeMeshes(blades, true)!;
    tuft.name = "tuft";
    const tm = new StandardMaterial("tuftMat", scene);
    tm.diffuseColor = C(biome.grass); tm.specularColor = Color3.Black(); tm.emissiveColor = C(biome.grass).scale(0.12);
    tuft.material = tm;
    const tl: Matrix[] = [];
    for (let i = 0; i < tuftCount; i++) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 70, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.hypot(x - OUTPOST.x, z - OUTPOST.z) < 5) continue;
      const s = 0.7 + rand() * 0.8;
      tl.push(Matrix.Compose(new Vector3(s, s * (0.6 + rand() * 0.7), s), Quaternion.RotationYawPitchRoll(rand() * 6.28, (rand() - 0.5) * 0.3, 0), new Vector3(x, heightAt(x, z) - 0.03, z)));
    }
    instance([tuft], tl, false);
  }

  /* Glowing pools (acid marsh / lava) */
  const pools: World["pools"] = [];
  if (biome.pools) {
    const pm2 = new StandardMaterial("poolMat", scene);
    pm2.diffuseColor = Color3.Black(); pm2.emissiveColor = C(biome.pools); pm2.alpha = 0.85; pm2.specularColor = Color3.White(); pm2.metadata = { glow: true };
    for (let i = 0; i < 7; i++) {
      const a = rand() * Math.PI * 2, r = 12 + rand() * 20, x = Math.cos(a) * r, z = Math.sin(a) * r, rr = 1.6 + rand() * 1.8;
      if (Math.hypot(x - OUTPOST.x, z - OUTPOST.z) < 9 || colliders.some(c => Math.hypot(c.x - x, c.z - z) < c.r + rr)) continue;
      const disc = MeshBuilder.CreateDisc(`pool${i}`, { radius: rr, tessellation: 28 }, scene);
      disc.rotation.x = Math.PI / 2;
      disc.position.set(x, heightAt(x, z) + 0.06, z);
      disc.scaling.y = 0.7 + rand() * 0.5;
      disc.material = pm2; disc.isPickable = false;
      pools.push({ x, z, r: rr * 0.85 });
    }
  }

  /* Energy fence */
  const fenceMesh = MeshBuilder.CreateCylinder("fenceField", { height: 2.6, diameter: FENCE * 2, tessellation: 96, cap: Mesh.NO_CAP, sideOrientation: Mesh.DOUBLESIDE }, scene);
  const fm = new StandardMaterial("fenceMat", scene);
  fm.disableLighting = true; fm.emissiveColor = C(sector.color); fm.alpha = 0.05; fm.backFaceCulling = false;
  fenceMesh.material = fm; fenceMesh.position.y = 0.6; fenceMesh.isPickable = false;
  const pylon = MeshBuilder.CreateCylinder("pylon", { height: 2.8, diameterTop: 0.12, diameterBottom: 0.3, tessellation: 6 }, scene);
  pylon.position.y = 1.2; pylon.bakeCurrentTransformIntoVertices();
  const plm = new StandardMaterial("pylonMat", scene);
  plm.diffuseColor = C("#26343a"); plm.emissiveColor = C(sector.color).scale(0.35); plm.metadata = { glow: true };
  pylon.material = plm;
  const pyl: Matrix[] = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2, x = Math.cos(a) * FENCE, z = Math.sin(a) * FENCE;
    pyl.push(Matrix.Compose(Vector3.One(), Quaternion.Identity(), new Vector3(x, heightAt(x, z) - 0.2, z)));
  }
  instance([pylon], pyl, false);
  const beam = MeshBuilder.CreateTorus("fenceBeam", { diameter: FENCE * 2, thickness: 0.06, tessellation: 128 }, scene);
  const bm = new StandardMaterial("beamMat", scene);
  bm.disableLighting = true; bm.emissiveColor = C(sector.color); bm.metadata = { glow: true };
  beam.material = bm; beam.position.y = 2.4; beam.isPickable = false;

  /* Outpost landmark */
  const outpost = buildModel(scene, BLUEPRINT.outpost, { name: "outpost", merge: true, palette: { glow: sector.color } });
  outpost.root.position.set(OUTPOST.x, heightAt(OUTPOST.x, OUTPOST.z) - 0.05, OUTPOST.z);
  outpost.root.rotation.y = Math.PI;
  for (const m of outpost.meshes) { m.receiveShadows = true; shadow?.addShadowCaster(m, false); m.isPickable = false; }
  colliders.push({ x: OUTPOST.x, z: OUTPOST.z, r: 3.9 });

  /* Weather */
  const weatherAnchor = new Vector3(0, 0, 0);
  let weather: ParticleSystem | null = null;
  if (quality !== "low" || biome.weather === "rain" || biome.weather === "storm") weather = makeWeather(scene, biome, weatherAnchor, detail);

  let lightning = 4 + rand() * 6, flash = 0;
  const baseHemi = hemi.intensity;
  const tick = (dt: number, t: number) => {
    const beacon = outpost.bones.beacon;
    if (beacon) beacon.rotation.y = t * 1.4;
    fm.alpha = 0.045 + Math.sin(t * 2.2) * 0.015;
    if (biome.weather === "storm") {
      lightning -= dt;
      if (lightning <= 0) { lightning = 5 + rand() * 9; flash = 0.35; window.setTimeout(() => onThunder?.(), 250 + rand() * 900); }
      flash = Math.max(0, flash - dt);
      const f = flash > 0.22 ? 1 : flash > 0.12 ? 0.2 : flash > 0.05 ? 0.8 : 0;
      hemi.intensity = baseHemi + f * 2.2;
      skyMat.emissiveColor = Color3.White().scale(1 + f * 1.5);
    }
  };

  return { biome, heightAt, colliders, sun, hemi, shadow, outpost, weather, weatherAnchor, pools, fence: fenceMesh, sky, tick };
}

function makeWeather(scene: Scene, biome: Biome, anchor: Vector3, detail: number): ParticleSystem {
  const kind = biome.weather;
  const wet = kind === "rain" || kind === "storm";
  const cap = Math.round((wet ? 2600 : kind === "snow" || kind === "ash" ? 1400 : 500) * detail);
  const ps = new ParticleSystem(`weather-${kind}`, cap, scene);
  ps.particleTexture = flareTexture(scene);
  ps.emitter = anchor;
  const span = wet || kind === "snow" || kind === "ash" ? 30 : 34;
  ps.minEmitBox = new Vector3(-span, wet ? 14 : 0, -span);
  ps.maxEmitBox = new Vector3(span, wet ? 20 : 12, span);
  const col = Color3.FromHexString(biome.weatherColor);
  ps.color1 = new Color4(col.r, col.g, col.b, wet ? 0.45 : 0.9);
  ps.color2 = new Color4(col.r * 0.8, col.g * 0.8, col.b * 0.9, wet ? 0.3 : 0.6);
  ps.colorDead = new Color4(col.r, col.g, col.b, 0);
  ps.blendMode = ParticleSystem.BLENDMODE_ADD;
  ps.preWarmCycles = 60; ps.preWarmStepOffset = 8;
  switch (kind) {
    case "rain": case "storm":
      ps.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED;
      ps.minSize = 0.05; ps.maxSize = 0.09; ps.minScaleY = 7; ps.maxScaleY = 10;
      ps.minLifeTime = 0.7; ps.maxLifeTime = 0.9; ps.emitRate = cap * 1.3;
      ps.direction1 = new Vector3(-2, -30, 1); ps.direction2 = new Vector3(-1, -34, 2);
      ps.minEmitPower = 1; ps.maxEmitPower = 1;
      break;
    case "snow": case "ash":
      ps.minSize = 0.06; ps.maxSize = 0.16; ps.minLifeTime = 6; ps.maxLifeTime = 9; ps.emitRate = cap / 7;
      ps.minEmitBox.y = 8; ps.maxEmitBox.y = 18;
      ps.direction1 = new Vector3(-0.6, -1.4, -0.3); ps.direction2 = new Vector3(0.8, -2, 0.5);
      ps.minEmitPower = 1; ps.maxEmitPower = 1;
      if (kind === "ash") ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      break;
    case "embers":
      ps.minSize = 0.05; ps.maxSize = 0.14; ps.minLifeTime = 3; ps.maxLifeTime = 6; ps.emitRate = cap / 4;
      ps.direction1 = new Vector3(-0.5, 0.6, -0.3); ps.direction2 = new Vector3(0.7, 1.8, 0.4);
      ps.minEmitPower = 0.6; ps.maxEmitPower = 1.2; ps.minEmitBox.y = 0; ps.maxEmitBox.y = 4;
      break;
    default:
      ps.minSize = kind === "dust" ? 0.05 : 0.07; ps.maxSize = kind === "dust" ? 0.12 : 0.2;
      ps.minLifeTime = 4; ps.maxLifeTime = 8; ps.emitRate = cap / 6;
      ps.direction1 = kind === "dust" ? new Vector3(1.5, -0.1, 0.4) : new Vector3(-0.3, -0.2, -0.3);
      ps.direction2 = kind === "dust" ? new Vector3(3, 0.3, 1) : new Vector3(0.3, 0.4, 0.3);
      ps.minEmitPower = 0.4; ps.maxEmitPower = 1;
      ps.minAngularSpeed = -1; ps.maxAngularSpeed = 1;
      if (kind === "quantum" || kind === "fireflies" || kind === "spores") ps.updateSpeed = 0.012;
  }
  ps.start();
  return ps;
}
