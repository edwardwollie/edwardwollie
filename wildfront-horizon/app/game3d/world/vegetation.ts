// Vegetation: deterministic placement from the terrain masks and biome flora
// mix, instanced near-LOD meshes with wind, camera-facing impostors for the
// distance, and colliders for trunks/boulders.

import * as THREE from "three";
import { mulberry32 } from "../core/rng.ts";
import { FLORA_BY_ID, type FloraBlueprint } from "../blueprints/flora.ts";
import { biomeWeights } from "../blueprints/reserves.ts";
import { buildFlora } from "../models/flora-builder.ts";
import { ATMO, patchWorldFog } from "../render/atmosphere.ts";
import { heightAt, maskAt, waterLevelAt, type TerrainData } from "./terrain-gen.ts";
import { ColliderGrid } from "./colliders.ts";
import { foliageAtlas } from "./textures.ts";

export interface PlantInstance { type: string; variant: number; x: number; y: number; z: number; s: number; rot: number }

const TREE_FORMS = new Set(["spruce", "pole-pine", "scots-pine", "broadleaf", "aspen", "birch", "juniper", "willow", "snag"]);

function pickWeighted(r: number, weights: [string, number][]): string {
  let sum = 0; for (const [, w] of weights) sum += w;
  let acc = 0;
  for (const [k, w] of weights) { acc += w / sum; if (r <= acc) return k; }
  return weights[weights.length - 1][0];
}

function excluded(t: TerrainData, x: number, z: number, clear = 0): boolean {
  const d = t.def;
  if (Math.abs(x) > t.half - 8 || Math.abs(z) > t.half - 8) return true;
  if (Math.hypot(x - d.spawn.x, z - d.spawn.z) < 22 + clear) return true;
  for (const lm of d.landmarks) if (Math.hypot(x - lm.x, z - lm.z) < (lm.kind === "lookout-tower" ? 34 : lm.kind === "cabin" || lm.kind === "ranger-station" ? 16 : 9) + clear) return true;
  if (maskAt(t, t.trail, x, z) > 0.25) return true;
  const wl = waterLevelAt(t, x, z);
  if (wl !== null && heightAt(t, x, z) < wl + 0.25) return true;
  return false;
}

export function placeVegetation(t: TerrainData): PlantInstance[] {
  const out: PlantInstance[] = [];
  const r = mulberry32(t.def.seed * 13 + 5);
  const half = t.half;
  // trees
  const sp = 5.2;
  for (let z = -half; z < half; z += sp) for (let x = -half; x < half; x += sp) {
    const px = x + r() * sp, pz = z + r() * sp;
    const f = maskAt(t, t.forest, px, pz);
    const meadow = maskAt(t, t.meadow, px, pz);
    const p = Math.pow(f, 1.1) * 0.82 + 0.006 * (1 - meadow) * (1 - f);
    if (r() > p) continue;
    if (excluded(t, px, pz)) continue;
    const bw = biomeWeights(t.def, px, pz);
    const weights: [string, number][] = [];
    bw.forEach((w, q) => { for (const [id, wt] of Object.entries(t.def.biomes[q].flora)) { const i = weights.findIndex(e => e[0] === id); if (i >= 0) weights[i][1] += w * wt; else weights.push([id, w * wt]); } });
    // shoreline willows, meadow-edge aspens
    const shore = maskAt(t, t.shore, px, pz);
    if (shore > 0.2) weights.push(["willow", 6 * shore]);
    if (meadow > 0.05 && meadow < 0.6) { const i = weights.findIndex(e => e[0] === "quaking-aspen"); if (i >= 0) weights[i][1] *= 3; }
    const type = pickWeighted(r(), weights);
    const bp = FLORA_BY_ID[type];
    if (!bp) continue;
    const s = (0.72 + r() * 0.5) * (1 - 0.15 * meadow);
    out.push({ type, variant: r() < 0.5 ? 0 : 1, x: px, y: heightAt(t, px, pz) - 0.15, z: pz, s, rot: r() * Math.PI * 2 });
  }
  // shrubs & heather / sage
  const ss = 3.6;
  for (let z = -half; z < half; z += ss) for (let x = -half; x < half; x += ss) {
    const px = x + r() * ss, pz = z + r() * ss;
    const bw = biomeWeights(t.def, px, pz);
    let dens = 0; const types: [string, number][] = [];
    bw.forEach((w, q) => {
      const b = t.def.biomes[q];
      dens += w * b.shrubs;
      const kind = b.id === "obsidian-steppe" ? "sagebrush" : b.id === "red-highland" ? "heather" : "forest-shrub";
      types.push([kind, w]);
      if (b.id === "red-highland") types.push(["forest-shrub", w * 0.25]);
    });
    const f = maskAt(t, t.forest, px, pz), rock = maskAt(t, t.rock, px, pz);
    const p = dens * (0.09 + 0.2 * f) * (1 - rock * 0.6) * (1 - maskAt(t, t.snow, px, pz));
    if (r() > p) continue;
    if (excluded(t, px, pz, -6)) continue;
    const type = pickWeighted(r(), types);
    out.push({ type, variant: 0, x: px, y: heightAt(t, px, pz) - 0.05, z: pz, s: 0.55 + r() * 0.8, rot: r() * Math.PI * 2 });
  }
  // boulders
  const rs = 8.5;
  for (let z = -half; z < half; z += rs) for (let x = -half; x < half; x += rs) {
    const px = x + r() * rs, pz = z + r() * rs;
    const bw = biomeWeights(t.def, px, pz);
    let dens = 0; bw.forEach((w, q) => { dens += w * t.def.biomes[q].rocks; });
    const rock = maskAt(t, t.rock, px, pz);
    const p = dens * (0.025 + 0.22 * rock);
    if (r() > p) continue;
    if (excluded(t, px, pz, -8)) continue;
    const s = 0.35 + Math.pow(r(), 2) * 1.6;
    out.push({ type: "boulder", variant: Math.floor(r() * 3), x: px, y: heightAt(t, px, pz) - 0.35 * s, z: pz, s, rot: r() * Math.PI * 2 });
  }
  // fallen logs in timber
  for (let i = 0; i < 260; i++) {
    const px = (r() * 2 - 1) * (half - 20), pz = (r() * 2 - 1) * (half - 20);
    if (maskAt(t, t.forest, px, pz) < 0.45 || excluded(t, px, pz)) continue;
    out.push({ type: "fallen-log", variant: 0, x: px, y: heightAt(t, px, pz), z: pz, s: 0.7 + r() * 0.6, rot: r() * Math.PI * 2 });
  }
  // reeds on shores
  for (let i = 0; i < 2600; i++) {
    const px = (r() * 2 - 1) * (half - 10), pz = (r() * 2 - 1) * (half - 10);
    const sh = maskAt(t, t.shore, px, pz);
    if (sh < 0.45) continue;
    const wl = waterLevelAt(t, px, pz);
    const h = heightAt(t, px, pz);
    if (wl === null || h < wl - 0.5 || h > wl + 0.6) continue;
    if (t.def.biomeMode === "single" && t.def.biomes[0].id === "obsidian-steppe" && r() < 0.5) continue;
    out.push({ type: "reeds", variant: 0, x: px, y: h - 0.1, z: pz, s: 0.7 + r() * 0.6, rot: r() * Math.PI * 2 });
  }
  return out;
}

export function buildColliders(t: TerrainData, plants: PlantInstance[], grid = new ColliderGrid(8)): ColliderGrid {
  let id = 0;
  for (const p of plants) {
    const bp = FLORA_BY_ID[p.type];
    if (!bp) continue;
    if (TREE_FORMS.has(bp.form) && bp.collider > 0) grid.add({ x: p.x, z: p.z, r: bp.collider * p.s, y0: p.y - 1, h: bp.height * p.s * 0.92, kind: "tree", id: id++ });
    else if (bp.form === "boulder" && p.s > 0.6) grid.add({ x: p.x, z: p.z, r: bp.collider * p.s, y0: p.y - 1, h: bp.height * p.s * 0.85, kind: "rock", id: id++ });
  }
  void t;
  return grid;
}

// ------------------------------------------------------------------ rendering

/** Plain flora material (previews, book, trophy scenes): atlas-mapped leaf cards. */
export function plainFloraMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, map: foliageAtlas(), alphaTest: 0.5, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace("normal *= faceDirection;", ""); };
  m.customProgramCacheKey = () => "flora-plain";
  return m;
}

function vegMaterial(isFoliageHeavy: boolean): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0, map: foliageAtlas(), alphaTest: 0.5, side: THREE.DoubleSide });
  m.name = "vegetation";
  patchWorldFog(m, (shader) => {
    shader.uniforms.uTime = ATMO.uTime;
    shader.uniforms.uWind = ATMO.uWind;
    shader.uniforms.uSnow = ATMO.uSnow;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
attribute float aSway; uniform float uTime; uniform vec2 uWind; varying vec3 vVW; varying float vSw;`)
      .replace("#include <project_vertex>", `
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
  vec3 ip = instanceMatrix[3].xyz;
#else
  vec3 ip = vec3(0.0);
#endif
float ph = ip.x * 0.131 + ip.z * 0.173;
float ws = length(uWind);
vec2 wd = ws > 0.01 ? uWind / ws : vec2(1.0, 0.0);
float gust = 0.55 + 0.45 * sin(uTime * 0.85 + ph * 0.6) * sin(uTime * 0.37 + ph);
float sw = aSway * (0.05 + ws * 0.03) * gust;
float fl = aSway * (0.015 + ws * 0.004) * sin(uTime * 6.5 + ph * 3.0 + position.y * 1.9);
mvPosition.xz += wd * sw + vec2(fl, -fl * 0.7);
vVW = mvPosition.xyz; vSw = aSway;
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("normal *= faceDirection;", "")
      .replace("#include <common>", `#include <common>
uniform float uSnow; varying vec3 vVW; varying float vSw;
float vhash(vec3 p) { p = fract(p * 0.3183 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
${isFoliageHeavy ? `float dap = vhash(floor(vVW * 3.1));
diffuseColor.rgb *= mix(1.0, 0.78 + 0.42 * dap, smoothstep(0.08, 0.3, vSw));` : ""}
float up = normalize(vNormal).y;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.95), uSnow * smoothstep(0.35, 0.8, up) * 0.85);`);
  });
  return m;
}

function impostorMaterial(tex: THREE.Texture): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.45, transparent: false, color: 0xffffff });
  m.name = "impostor";
  patchWorldFog(m, (shader) => {
    shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `
vec3 ctr = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
float sc = length(instanceMatrix[0].xyz);
vec3 toC = cameraPosition - ctr; toC.y = 0.0;
vec3 rt = normalize(vec3(toC.z, 0.0, -toC.x) + vec3(1e-4, 0.0, 0.0));
vec3 wp = ctr + rt * position.x * sc + vec3(0.0, position.y * sc, 0.0);
vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
gl_Position = projectionMatrix * mvPosition;`)
;
  });
  return m;
}

interface TypeRender {
  bp: FloraBlueprint;
  variant: number;
  insts: PlantInstance[];
  near: THREE.InstancedMesh;
  mid: THREE.InstancedMesh | null;
  far: THREE.InstancedMesh | null;
}

export class Vegetation {
  group = new THREE.Group();
  types: TypeRender[] = [];
  private lastPos = new THREE.Vector3(1e9, 0, 0);
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private v = new THREE.Vector3();
  nearDist: number;
  farDist: number;
  /** full-detail radius; between hiDist and nearDist trees use the reduced LOD */
  hiDist = 70;
  impostorTint: THREE.Color = new THREE.Color(1, 1, 1);
  private impostorMats: THREE.MeshBasicMaterial[] = [];
  constructor(renderer: THREE.WebGLRenderer, plants: PlantInstance[], quality: { nearDist: number; farDist: number; shadows: boolean; impostors: boolean }) {
    this.group.name = "vegetation";
    this.nearDist = quality.nearDist;
    this.farDist = quality.farDist;
    const byKey = new Map<string, PlantInstance[]>();
    for (const p of plants) { const k = `${p.type}|${p.variant}`; let a = byKey.get(k); if (!a) { a = []; byKey.set(k, a); } a.push(p); }
    const quadGeo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    for (const [k, insts] of byKey) {
      const [type, vs] = k.split("|");
      const bp = FLORA_BY_ID[type];
      const variant = Number(vs);
      const isTree = TREE_FORMS.has(bp.form);
      const geo = buildFlora(bp, 11 + variant * 17, 0);
      const mat = vegMaterial(isTree || bp.form === "shrub" || bp.form === "heather" || bp.form === "sage");
      const near = new THREE.InstancedMesh(geo, mat, insts.length);
      near.castShadow = quality.shadows && (isTree || bp.form === "boulder");
      near.receiveShadow = !isTree;
      near.frustumCulled = false;
      near.count = 0;
      near.name = `veg:${k}`;
      this.group.add(near);
      let mid: THREE.InstancedMesh | null = null;
      if (isTree) {
        mid = new THREE.InstancedMesh(buildFlora(bp, 11 + variant * 17, 1), mat, insts.length);
        mid.castShadow = near.castShadow; mid.frustumCulled = false; mid.count = 0; mid.name = `vegmid:${k}`;
        this.group.add(mid);
      }
      let far: THREE.InstancedMesh | null = null;
      if (quality.impostors && (isTree || bp.form === "boulder")) {
        const { tex, w, h } = renderImpostor(renderer, geo, bp);
        const mat2 = impostorMaterial(tex);
        this.impostorMats.push(mat2);
        const g2 = quadGeo.clone().scale(w, h, 1);
        far = new THREE.InstancedMesh(g2, mat2, insts.length);
        far.frustumCulled = false;
        far.count = 0;
        far.name = `imp:${k}`;
        this.group.add(far);
      }
      this.types.push({ bp, variant, insts, near, mid, far });
    }
  }
  /** Rebuild LOD instance lists when the viewer moves enough. */
  update(cam: THREE.Vector3, force = false) {
    if (!force && cam.distanceToSquared(this.lastPos) < 36) return;
    this.lastPos.copy(cam);
    const nd2 = this.nearDist * this.nearDist, fd2 = this.farDist * this.farDist;
    const hd2 = Math.min(nd2, this.hiDist * this.hiDist);
    for (const T of this.types) {
      let n = 0, f = 0, md = 0;
      const small = !TREE_FORMS.has(T.bp.form) && T.bp.form !== "boulder";
      const smallD2 = Math.min(nd2, 95 * 95);
      for (const p of T.insts) {
        const dx = p.x - cam.x, dz = p.z - cam.z, d2 = dx * dx + dz * dz;
        this.q.setFromAxisAngle(this.v.set(0, 1, 0), p.rot);
        this.s.setScalar(p.s);
        this.m4.compose(this.v.set(p.x, p.y, p.z), this.q, this.s);
        if (T.mid && d2 >= hd2 && d2 < nd2) { T.mid.setMatrixAt(md++, this.m4); }
        else if (d2 < (small ? smallD2 : nd2)) { T.near.setMatrixAt(n++, this.m4); }
        else if (T.far && d2 < fd2) { this.q.identity(); this.m4.compose(this.v.set(p.x, p.y, p.z), this.q, this.s); T.far.setMatrixAt(f++, this.m4); }
      }
      T.near.count = n; T.near.instanceMatrix.needsUpdate = true;
      if (T.mid) { T.mid.count = md; T.mid.instanceMatrix.needsUpdate = true; }
      if (T.far) { T.far.count = f; T.far.instanceMatrix.needsUpdate = true; }
    }
  }
  setTint(c: THREE.Color) { for (const m of this.impostorMats) m.color.copy(c); }
  dispose() {
    for (const T of this.types) { T.near.geometry.dispose(); (T.near.material as THREE.Material).dispose(); T.far?.geometry.dispose(); (T.far?.material as THREE.MeshBasicMaterial | undefined)?.map?.dispose(); }
  }
}

/** Render a side view of a plant into a texture for distant impostors. */
function renderImpostor(renderer: THREE.WebGLRenderer, geo: THREE.BufferGeometry, bp: FloraBlueprint): { tex: THREE.Texture; w: number; h: number } {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const h = bb.max.y - Math.min(0, bb.min.y);
  const w = Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x), Math.abs(bb.min.z), Math.abs(bb.max.z)) * 2 * 1.02;
  const W = 128, Hpx = Math.min(512, Math.max(128, Math.round(128 * h / w / 32) * 32));
  const rt = new THREE.WebGLRenderTarget(W, Hpx, { samples: 0, colorSpace: THREE.SRGBColorSpace });
  rt.texture.generateMipmaps = true;
  rt.texture.minFilter = THREE.LinearMipmapLinearFilter;
  rt.texture.magFilter = THREE.LinearFilter;
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(geo, plainFloraMaterial());
  scene.add(mesh);
  scene.add(new THREE.HemisphereLight(0xdde8ff, 0x403a30, 1.6));
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.2); sun.position.set(0.6, 1, 0.8); scene.add(sun);
  const cam = new THREE.OrthographicCamera(-w / 2, w / 2, h, 0, -100, 100);
  cam.position.set(0, 0, 50); cam.lookAt(0, 0, 0);
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
  const fc = bp.foliage;
  renderer.setRenderTarget(rt);
  renderer.setClearColor(new THREE.Color(fc[0] * 0.5, fc[1] * 0.5, fc[2] * 0.5), 0);
  renderer.clear(true, true, true);
  renderer.render(scene, cam);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  (mesh.material as THREE.Material).dispose();
  return { tex: rt.texture, w, h };
}
