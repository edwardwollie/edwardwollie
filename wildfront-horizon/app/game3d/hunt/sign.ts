// Tracking sign: hoof prints drawn from each species' T-series track blueprint,
// droppings, beds and hit sign, laid as terrain decals that age. The Trail
// Scanner (E) makes fresh sign glow; F inspects the nearest sign.

import * as THREE from "three";
import { WILDLIFE } from "../blueprints/wildlife/index.ts";
import type { TrackSpec } from "../blueprints/types.ts";
import { ATMO, patchWorldFog } from "../render/atmosphere.ts";
import { heightAt, normalAt, type TerrainData } from "../world/terrain-gen.ts";

export type SignKind = "track" | "dropping" | "bed" | "hit";
export interface SignRecord { kind: SignKind; species: string; x: number; z: number; heading: number; t: number; running: boolean; animalId: number; slot: number }

const CELL = 128, COLS = 8, ROWS = 2;
const SHAPES: TrackSpec["shape"][] = ["heart", "round", "blocky", "boar", "bison", "pointed"];

/** Draw one hoof print (two cleaves) into a 2D context cell, toe toward −y. */
export function drawHoofPrint(g: CanvasRenderingContext2D, cx: number, cy: number, size: number, shape: TrackSpec["shape"], dew: boolean) {
  const w = size * (shape === "bison" || shape === "round" ? 0.46 : shape === "boar" ? 0.42 : 0.36);
  const h = size * (shape === "bison" ? 0.92 : 0.9);
  const gap = size * (shape === "blocky" ? 0.07 : shape === "boar" ? 0.09 : 0.05);
  for (const side of [-1, 1]) {
    g.beginPath();
    const x0 = cx + side * gap;
    const tip = shape === "blocky" ? 0.18 : shape === "pointed" ? 0.42 : shape === "heart" ? 0.34 : 0.26;
    g.moveTo(x0, cy - h / 2);                                   // toe
    g.bezierCurveTo(x0 + side * w * (1 - tip), cy - h / 2, x0 + side * w, cy - h * 0.15, x0 + side * w * 0.95, cy + h * 0.2);
    g.bezierCurveTo(x0 + side * w * 0.9, cy + h * 0.48, x0 + side * w * 0.35, cy + h * 0.52, x0, cy + h * 0.42);
    g.closePath();
    g.fill();
  }
  if (dew) {
    for (const side of [-1, 1]) { g.beginPath(); g.ellipse(cx + side * size * 0.32, cy + h * 0.62, size * 0.07, size * 0.1, 0, 0, Math.PI * 2); g.fill(); }
  }
}

let atlas: THREE.CanvasTexture | null = null;
function signAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const c = document.createElement("canvas");
  c.width = CELL * COLS; c.height = CELL * ROWS;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = "#fff";
  SHAPES.forEach((s, i) => drawHoofPrint(g, i * CELL + CELL / 2, CELL / 2, CELL * 0.62, s, s === "boar"));
  // 6: droppings (pellet pile)
  for (let i = 0; i < 18; i++) { const a = i * 2.4, r = 6 + (i % 5) * 5; g.beginPath(); g.ellipse(6 * CELL + CELL / 2 + Math.cos(a) * r, CELL / 2 + Math.sin(a) * r, 7, 5, a, 0, Math.PI * 2); g.fill(); }
  // 7: bed (flattened oval)
  g.globalAlpha = 0.55; g.beginPath(); g.ellipse(7 * CELL + CELL / 2, CELL / 2, CELL * 0.26, CELL * 0.44, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
  // 8 (row 2, col 0): hit sign drops
  const ox = 0, oy = CELL;
  for (let i = 0; i < 14; i++) { const a = i * 1.7, r = (i * 7) % 34; const s = 3 + (i % 4) * 2.5; g.beginPath(); g.ellipse(ox + CELL / 2 + Math.cos(a) * r, oy + CELL / 2 + Math.sin(a) * r, s, s * 0.8, a, 0, Math.PI * 2); g.fill(); }
  atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.NoColorSpace;
  atlas.anisotropy = 4;
  return atlas;
}

function cellFor(kind: SignKind, shape: TrackSpec["shape"]): number {
  if (kind === "track") return SHAPES.indexOf(shape);
  if (kind === "dropping") return 6;
  if (kind === "bed") return 7;
  return 8;
}

export class SignManager {
  records: SignRecord[] = [];
  mesh: THREE.InstancedMesh;
  private aCell: THREE.InstancedBufferAttribute;
  private aBorn: THREE.InstancedBufferAttribute;
  private aKind: THREE.InstancedBufferAttribute;
  private capacity = 1600;
  private next = 0;
  private t: TerrainData;
  uniforms = { uNow: { value: 0 }, uScan: ATMO.uScan, uHitColor: { value: new THREE.Color(1.0, 0.62, 0.18) }, uAccent: { value: new THREE.Color(0.33, 0.95, 0.86) } };
  time = 0;
  constructor(t: TerrainData, realisticHitSign: boolean) {
    this.t = t;
    if (realisticHitSign) this.uniforms.uHitColor.value.setRGB(0.32, 0.03, 0.02);
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.aCell = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity), 1);
    this.aBorn = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity).fill(-1e6), 1);
    this.aKind = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity), 1);
    geo.setAttribute("aCell", this.aCell); geo.setAttribute("aBorn", this.aBorn); geo.setAttribute("aKind", this.aKind);
    const mat = new THREE.MeshLambertMaterial({ map: signAtlas(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    mat.name = "sign";
    patchWorldFog(mat, (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", `#include <common>
attribute float aCell; attribute float aBorn; attribute float aKind; uniform float uNow; varying float vAge; varying float vKind; varying vec2 vAtlasUv;`)
        .replace("#include <uv_vertex>", `#include <uv_vertex>
float col = mod(aCell, ${COLS}.0), row = floor(aCell / ${COLS}.0);
vAtlasUv = vec2((col + uv.x) / ${COLS}.0, 1.0 - (row + 1.0 - uv.y) / ${ROWS}.0);
vAge = uNow - aBorn; vKind = aKind;`);
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>
uniform float uScan; uniform vec3 uHitColor; uniform vec3 uAccent; varying float vAge; varying float vKind; varying vec2 vAtlasUv;`)
        .replace("#include <map_fragment>", `
vec4 sc = texture2D(map, vAtlasUv);
float fade = vKind > 2.5 ? (1.0 - smoothstep(600.0, 1200.0, vAge)) : (1.0 - smoothstep(200.0, 900.0, vAge) * 0.7);
vec3 soil = vec3(0.09, 0.07, 0.05);
vec3 base = vKind > 2.5 ? uHitColor : soil;
float fresh = 1.0 - smoothstep(30.0, 400.0, vAge);
diffuseColor.rgb = base;
diffuseColor.a = sc.a * fade * (vKind > 2.5 ? 0.95 : vKind > 1.5 ? 0.45 : 0.72);
`)
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
totalEmissiveRadiance += uAccent * uScan * (0.35 + 0.65 * fresh) * sc.a * 1.6;
totalEmissiveRadiance += vKind > 2.5 ? uHitColor * 0.25 : vec3(0.0);`);
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.name = "sign";
  }

  private place(kind: SignKind, species: string, x: number, z: number, heading: number, running: boolean, animalId: number, size: number) {
    const bp = WILDLIFE.find(b => b.species === species);
    const shape = bp?.track.shape ?? "heart";
    const slot = this.next;
    this.next = (this.next + 1) % this.capacity;
    this.mesh.count = Math.max(this.mesh.count, slot + 1);
    const y = heightAt(this.t, x, z) + 0.025;
    const n = normalAt(this.t, x, z);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(n[0], n[1], n[2]));
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading + Math.PI));
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(size, 1, size));
    this.mesh.setMatrixAt(slot, m);
    this.mesh.instanceMatrix.needsUpdate = true;
    (this.aCell.array as Float32Array)[slot] = cellFor(kind, shape);
    (this.aBorn.array as Float32Array)[slot] = this.time;
    (this.aKind.array as Float32Array)[slot] = kind === "track" ? 0 : kind === "dropping" ? 1 : kind === "bed" ? 2 : 3;
    this.aCell.needsUpdate = true; this.aBorn.needsUpdate = true; this.aKind.needsUpdate = true;
    const rec: SignRecord = { kind, species, x, z, heading, t: this.time, running, animalId, slot };
    const old = this.records.findIndex(r => r.slot === slot);
    if (old >= 0) this.records.splice(old, 1);
    this.records.push(rec);
  }

  track(species: string, x: number, z: number, heading: number, running: boolean, animalId: number) {
    const bp = WILDLIFE.find(b => b.species === species);
    const len = (bp?.track.length ?? 8) / 100;
    this.place("track", species, x, z, heading, running, animalId, len * 1.55 * (running ? 1.1 : 1));
  }
  dropping(species: string, x: number, z: number, animalId: number) { this.place("dropping", species, x, z, Math.random() * 6.28, false, animalId, species === "Bison" ? 0.5 : 0.24); }
  bed(species: string, x: number, z: number, heading: number, animalId: number) {
    const bp = WILDLIFE.find(b => b.species === species);
    this.place("bed", species, x, z, heading, false, animalId, Math.max(0.9, (bp?.overall.length ?? 1.6) * 0.75));
  }
  hit(species: string, x: number, z: number, animalId: number) { this.place("hit", species, x, z, Math.random() * 6.28, false, animalId, 0.42); }

  update(dt: number) { this.time += dt; this.uniforms.uNow.value = this.time; }

  /** Nearest sign within `r` of a ground point. */
  nearest(x: number, z: number, r: number): SignRecord | null {
    let best: SignRecord | null = null, bd = r;
    for (const s of this.records) { const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }
    return best;
  }
  /** Fresh sign count within a radius (scanner readout). */
  freshNear(x: number, z: number, r: number, maxAge = 400): number {
    let n = 0;
    for (const s of this.records) if (this.time - s.t < maxAge && Math.hypot(s.x - x, s.z - z) < r) n++;
    return n;
  }
}

export function describeAge(seconds: number, timeScale: number): string {
  const gm = seconds * timeScale / 60; // game minutes
  if (gm < 15) return "Very fresh — minutes old";
  if (gm < 60) return "Fresh — under an hour";
  if (gm < 180) return "A few hours old";
  return "Old sign";
}

export function compassName(heading: number): string {
  // heading: radians, 0 = toward +Z (south) in model convention → convert to compass bearing (0 = north)
  const bearing = ((Math.PI - heading) * 180 / Math.PI + 360) % 360;
  const names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return names[Math.round(bearing / 45) % 8];
}
