// Distant landscape: a polar ring from inside the reserve out to ~4 km. Inside
// the playable square it hides under the terrain; outside it continues the
// reserve edge and rises into ridged, snow-capped ranges (the cover-art vista).

import * as THREE from "three";
import { clamp01, smoothstep } from "../core/math.ts";
import { Simplex2 } from "../core/noise.ts";
import { srgbToLinear } from "../models/paint.ts";
import { patchWorldFog } from "../render/atmosphere.ts";
import { heightAt, type TerrainData } from "./terrain-gen.ts";

export function createBackdrop(t: TerrainData): THREE.Mesh {
  const def = t.def;
  const N = new Simplex2(def.seed + 4242), N2 = new Simplex2(def.seed + 919);
  const rings = 56, segs = 220;
  const r0 = 260, r1 = 4200;
  const pos = new Float32Array((rings + 1) * segs * 3), col = new Float32Array((rings + 1) * segs * 3);
  const lin = (c: number[]) => c.map(srgbToLinear);
  const b0 = def.biomes[0];
  const forest = lin([b0.grass[0] * 0.55, b0.grass[1] * 0.62, b0.grass[2] * 0.55]);
  const rock = lin(def.backdrop.color);
  const snow = lin([0.93, 0.95, 0.98]);
  const half = t.half;
  for (let i = 0; i <= rings; i++) {
    const r = r0 * Math.pow(r1 / r0, i / rings);
    for (let k = 0; k < segs; k++) {
      const a = (k / segs) * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const cx = Math.max(-half, Math.min(half, x)), cz = Math.max(-half, Math.min(half, z));
      const outside = Math.hypot(x - cx, z - cz);
      let y: number;
      if (outside < 1) y = heightAt(t, x, z) - 4;
      else {
        const edge = heightAt(t, cx, cz);
        const rise = smoothstep(0, 700, outside);
        const ridge = N.ridged(x / 900, z / 900, 5);
        const peaks = Math.pow(ridge, 1.6) * def.backdrop.height;
        const foot = 40 * N2.fbm(x / 260, z / 260, 3) * smoothstep(0, 250, outside);
        y = edge + foot + peaks * rise + outside * 0.02;
      }
      const v = i * segs + k;
      pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
      const hRel = clamp01((y - t.maxH) / Math.max(1, def.backdrop.height));
      let c = forest;
      c = c.map((cv, q) => cv + (rock[q] - cv) * smoothstep(0.12, 0.45, hRel + 0.15 * N2.noise(x / 300, z / 300)));
      if (def.backdrop.snow) c = c.map((cv, q) => cv + (snow[q] - cv) * smoothstep(0.5, 0.68, hRel + 0.08 * N.noise(x / 120, z / 120)));
      col.set(c, v * 3);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < rings; i++) for (let k = 0; k < segs; k++) {
    const a = i * segs + k, b = i * segs + (k + 1) % segs, c = (i + 1) * segs + k, d = (i + 1) * segs + (k + 1) % segs;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mat = patchWorldFog(new THREE.MeshLambertMaterial({ vertexColors: true }));
  mat.name = "backdrop";
  const m = new THREE.Mesh(g, mat);
  m.name = "backdrop";
  m.frustumCulled = false;
  m.renderOrder = -5;
  return m;
}
