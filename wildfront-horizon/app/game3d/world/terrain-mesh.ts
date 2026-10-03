// three.js terrain: heightfield mesh with per-vertex biome tints and splat
// weights (dirt / rock / sand / snow) blended over procedural detail textures.

import * as THREE from "three";
import { clamp01, smoothstep } from "../core/math.ts";
import { Simplex2 } from "../core/noise.ts";
import type { RGB } from "../blueprints/types.ts";
import { srgbToLinear } from "../models/paint.ts";
import { ATMO, patchWorldFog } from "../render/atmosphere.ts";
import type { TerrainData } from "./terrain-gen.ts";
import { detailTextures } from "./textures.ts";

const lin = (c: RGB): [number, number, number] => [srgbToLinear(c[0]), srgbToLinear(c[1]), srgbToLinear(c[2])];

function biomeColor(t: TerrainData, k: number, key: "grass" | "dry" | "dirt" | "rock" | "sand"): [number, number, number] {
  const bs = t.def.biomes;
  if (!t.biome) return lin(bs[0][key]);
  const out: [number, number, number] = [0, 0, 0];
  for (let q = 0; q < 4; q++) {
    const w = t.biome[k * 4 + q];
    if (w <= 0) continue;
    const c = lin(bs[q][key]);
    out[0] += c[0] * w; out[1] += c[1] * w; out[2] += c[2] * w;
  }
  return out;
}

export function buildTerrainGeometry(t: TerrainData, step = 1): THREE.BufferGeometry {
  const n = t.n, m = Math.floor((n - 1) / step) + 1;
  const pos = new Float32Array(m * m * 3), nrm = new Float32Array(m * m * 3);
  const aGrass = new Float32Array(m * m * 3), aDirt = new Float32Array(m * m * 3), aRock = new Float32Array(m * m * 3), aSplat = new Float32Array(m * m * 4);
  const N = new Simplex2(t.def.seed + 501);
  for (let jj = 0; jj < m; jj++) for (let ii = 0; ii < m; ii++) {
    const i = Math.min(n - 1, ii * step), j = Math.min(n - 1, jj * step);
    const k = j * n + i, v = jj * m + ii;
    const x = -t.half + i * t.cell, z = -t.half + j * t.cell, y = t.h[k];
    pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
    const hx = t.h[j * n + Math.min(n - 1, i + 1)] - t.h[j * n + Math.max(0, i - 1)];
    const hz = t.h[Math.min(n - 1, j + 1) * n + i] - t.h[Math.max(0, j - 1) * n + i];
    const nx = -hx / (2 * t.cell), nz = -hz / (2 * t.cell), l = Math.hypot(nx, 1, nz);
    nrm[v * 3] = nx / l; nrm[v * 3 + 1] = 1 / l; nrm[v * 3 + 2] = nz / l;
    const slope = 1 - 1 / l;
    // grass tint: lush ↔ dry by broad noise, slope and altitude; darker under forest canopy
    const dryN = 0.5 + 0.5 * N.fbm(x / 110, z / 110, 3);
    const dry = clamp01(dryN * 0.75 + slope * 0.9 + smoothstep(t.minH + (t.maxH - t.minH) * 0.55, t.maxH, y) * 0.35 - t.meadow[k] * 0.2);
    const g = biomeColor(t, k, "grass"), d = biomeColor(t, k, "dry");
    const shade = 1 - 0.28 * t.forest[k];
    aGrass[v * 3] = (g[0] + (d[0] - g[0]) * dry) * shade;
    aGrass[v * 3 + 1] = (g[1] + (d[1] - g[1]) * dry) * shade;
    aGrass[v * 3 + 2] = (g[2] + (d[2] - g[2]) * dry) * shade;
    const dc = biomeColor(t, k, "dirt"), rc = biomeColor(t, k, "rock");
    const rv = 0.85 + 0.3 * (0.5 + 0.5 * N.noise(x / 40, z / 40));
    aDirt.set(dc, v * 3);
    aRock[v * 3] = rc[0] * rv; aRock[v * 3 + 1] = rc[1] * rv; aRock[v * 3 + 2] = rc[2] * rv;
    // splat weights
    const patchy = smoothstep(0.55, 0.85, 0.5 + 0.5 * N.noise(x / 18 + 3, z / 18 - 7)) * 0.45 * (1 - t.meadow[k]);
    const dirtW = clamp01(Math.max(t.trail[k], patchy * (0.3 + t.forest[k]), smoothstep(0.12, 0.2, slope) * 0.5));
    aSplat[v * 4] = dirtW;
    aSplat[v * 4 + 1] = t.rock[k];
    aSplat[v * 4 + 2] = t.shore[k];
    aSplat[v * 4 + 3] = t.snow[k];
  }
  const idx = new Uint32Array((m - 1) * (m - 1) * 6);
  let o = 0;
  for (let j = 0; j < m - 1; j++) for (let i = 0; i < m - 1; i++) {
    const a = j * m + i, b = a + 1, c = a + m, d = c + 1;
    // split along the shorter diagonal for smoother silhouettes
    if (Math.abs(pos[a * 3 + 1] - pos[d * 3 + 1]) < Math.abs(pos[b * 3 + 1] - pos[c * 3 + 1])) { idx[o++] = a; idx[o++] = c; idx[o++] = d; idx[o++] = a; idx[o++] = d; idx[o++] = b; }
    else { idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = d; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute("aGrass", new THREE.BufferAttribute(aGrass, 3));
  geo.setAttribute("aDirt", new THREE.BufferAttribute(aDirt, 3));
  geo.setAttribute("aRock", new THREE.BufferAttribute(aRock, 3));
  geo.setAttribute("aSplat", new THREE.BufferAttribute(aSplat, 4));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere(); geo.computeBoundingBox();
  return geo;
}

export function createTerrainMaterial(): THREE.MeshStandardMaterial {
  const tex = detailTextures();
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.96, metalness: 0, color: 0xffffff });
  mat.name = "terrain";
  patchWorldFog(mat, (shader) => {
    shader.uniforms.tGrass = { value: tex.grass };
    shader.uniforms.tDirt = { value: tex.dirt };
    shader.uniforms.tRock = { value: tex.rock };
    shader.uniforms.uSnow = ATMO.uSnow;
    shader.uniforms.uWet = ATMO.uWet;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
attribute vec3 aGrass; attribute vec3 aDirt; attribute vec3 aRock; attribute vec4 aSplat;
varying vec3 vGrass; varying vec3 vDirt; varying vec3 vRock; varying vec4 vSplat; varying vec3 vTW; varying vec3 vTN;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
vGrass = aGrass; vDirt = aDirt; vRock = aRock; vSplat = aSplat;
vTW = (modelMatrix * vec4(position, 1.0)).xyz; vTN = normal;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
uniform sampler2D tGrass; uniform sampler2D tDirt; uniform sampler2D tRock; uniform float uSnow; uniform float uWet;
varying vec3 vGrass; varying vec3 vDirt; varying vec3 vRock; varying vec4 vSplat; varying vec3 vTW; varying vec3 vTN;`)
      .replace("#include <map_fragment>", `
vec2 uvA = vTW.xz / 2.4;
vec2 uvB = vTW.xz / 13.0 + vec2(0.37, 0.71);
vec4 gT = texture2D(tGrass, uvA) * 0.55 + texture2D(tGrass, uvB) * 0.45;
float gL = gT.r;
float dL = texture2D(tDirt, uvA * 0.8).r * 0.6 + texture2D(tDirt, uvB).r * 0.4;
vec3 an = abs(normalize(vTN));
float rX = texture2D(tRock, vTW.zy / 5.0).r, rZ = texture2D(tRock, vTW.xy / 5.0).r, rY = texture2D(tRock, vTW.xz / 5.0).r;
float rL = (rX * an.x + rZ * an.z + rY * an.y) / (an.x + an.y + an.z);
float macro = texture2D(tDirt, vTW.xz / 160.0).r;
vec3 grass = vGrass * (0.62 + 0.8 * gL) * (0.85 + 0.3 * macro);
grass = mix(grass, grass * vec3(1.18, 1.1, 0.7), gT.a * 0.35);
vec3 dirt = vDirt * (0.6 + 0.85 * dL);
vec3 rock = vRock * (0.55 + 0.95 * rL);
vec3 sand = mix(vDirt, vec3(0.62, 0.56, 0.45), 0.55) * (0.8 + 0.4 * dL);
vec3 snowC = vec3(0.86, 0.9, 0.95) * (0.92 + 0.12 * gL);
float snowCover = clamp(vSplat.w + uSnow * smoothstep(0.55, 0.85, normalize(vTN).y) * (0.75 + 0.25 * gL), 0.0, 1.0);
vec3 terr = grass;
terr = mix(terr, dirt, clamp(vSplat.x * (0.75 + 0.5 * dL), 0.0, 1.0));
terr = mix(terr, sand, vSplat.z);
terr = mix(terr, rock, smoothstep(0.25, 0.75, vSplat.y + (rL - 0.5) * 0.3));
terr = mix(terr, snowC, snowCover);
terr *= 1.0 - uWet * 0.3 * (1.0 - snowCover);
diffuseColor.rgb *= terr;
`)
      .replace("#include <roughnessmap_fragment>", `float roughnessFactor = roughness;
roughnessFactor = mix(roughnessFactor, 0.5, uWet * 0.7);
roughnessFactor = mix(roughnessFactor, 0.75, vSplat.y * 0.3);`);
  });
  return mat;
}

export function createTerrainMesh(t: TerrainData, step = 1): THREE.Mesh {
  const mesh = new THREE.Mesh(buildTerrainGeometry(t, step), createTerrainMaterial());
  mesh.name = "terrain";
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}

/** Float height texture (R32F) + RGBA8 surface map for GPU-side grass and water. */
export function terrainTextures(t: TerrainData) {
  const n = t.n;
  const hData = new Float32Array(n * n);
  hData.set(t.h);
  const hTex = new THREE.DataTexture(hData, n, n, THREE.RedFormat, THREE.FloatType);
  hTex.magFilter = THREE.NearestFilter; hTex.minFilter = THREE.NearestFilter;
  hTex.needsUpdate = true;
  const sData = new Uint8Array(n * n * 4);
  for (let k = 0; k < n * n; k++) {
    sData[k * 4] = Math.round(255 * t.grass[k]);
    sData[k * 4 + 1] = Math.round(255 * t.meadow[k]);
    sData[k * 4 + 2] = Math.round(255 * t.forest[k]);
    sData[k * 4 + 3] = Math.round(255 * t.shore[k]);
  }
  const sTex = new THREE.DataTexture(sData, n, n, THREE.RGBAFormat);
  sTex.magFilter = THREE.LinearFilter; sTex.minFilter = THREE.LinearFilter;
  sTex.needsUpdate = true;
  return { hTex, sTex };
}
