// Heightfield + surface masks for a reserve, generated deterministically from
// its M-series blueprint. Pure TypeScript (no three.js) so the same data feeds
// the game, the minimap/topo renderer, AI path checks and Node tests.

import { clamp01, lerp, smoothstep } from "../core/math.ts";
import { Simplex2 } from "../core/noise.ts";
import { biomeWeights, type ReserveDef, type TerrainFeature, type XZ } from "../blueprints/reserves.ts";

export interface Lake { x: number; z: number; rx: number; rz: number; rot: number; level: number; depth: number; name?: string }
export interface River { pts: [number, number, number][]; width: number; depth: number; name?: string }

export interface TerrainData {
  def: ReserveDef;
  n: number;
  size: number;
  half: number;
  cell: number;
  h: Float32Array;
  lakes: Lake[];
  rivers: River[];
  trail: Float32Array;
  rock: Float32Array;
  shore: Float32Array;
  meadow: Float32Array;
  forest: Float32Array;
  grass: Float32Array;
  snow: Float32Array;
  biome: Float32Array | null;   // n*n*4
  minH: number; maxH: number;
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): [number, number] {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  let t = ((px - ax) * dx + (pz - az) * dz) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + dx * t, cz = az + dz * t;
  return [Math.hypot(px - cx, pz - cz), t];
}

/** distance to a polyline and arc-length fraction of the closest point */
export function distToPolyline(px: number, pz: number, pts: XZ[]): { d: number; s: number } {
  let best = Infinity, bestS = 0, acc = 0, total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const [d, t] = distToSegment(px, pz, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    if (d < best) { best = d; bestS = (acc + t * seg) / (total || 1); }
    acc += seg;
  }
  return { d: best, s: bestS };
}

const bump = (t: number) => (t >= 1 ? 0 : Math.pow(0.5 + 0.5 * Math.cos(Math.PI * t), 1.15));

function ellipseT(x: number, z: number, cx: number, cz: number, rx: number, rz: number, rot: number) {
  const dx = x - cx, dz = z - cz;
  const c = Math.cos(rot), s = Math.sin(rot);
  const u = (dx * c + dz * s) / rx, v = (-dx * s + dz * c) / rz;
  return Math.sqrt(u * u + v * v);
}

export function generateTerrain(def: ReserveDef, n = 257): TerrainData {
  const size = def.size, half = size / 2, cell = size / (n - 1);
  const N1 = new Simplex2(def.seed), N2 = new Simplex2(def.seed + 11), N3 = new Simplex2(def.seed + 23), N4 = new Simplex2(def.seed + 37);
  const R = def.relief;
  const h = new Float32Array(n * n);
  const detail = new Float32Array(n * n);
  const rockF = new Float32Array(n * n);
  const meadow = new Float32Array(n * n);
  const trail = new Float32Array(n * n);
  const X = (i: number) => -half + i * cell;

  const baseAt = (x: number, z: number) => {
    // domain-warped rolling hills + ridged structure + edge rise toward the reserve boundary
    const wx = x + 40 * N4.noise(x / 500, z / 500), wz = z + 40 * N4.noise(z / 500 + 7, x / 500 - 3);
    let v = R.hills * N1.fbm(wx / R.scale, wz / R.scale, 4);
    v += R.ridged * R.hills * (N2.ridged(wx / (R.scale * 0.75), wz / (R.scale * 0.75), 4) - 0.45) * 1.4;
    const d = Math.max(Math.abs(x), Math.abs(z)) / half;
    v += R.edgeRise * smoothstep(0.74, 1.08, d) * (0.65 + 0.35 * N3.noise(x / 160, z / 160));
    return v;
  };
  const detailAt = (x: number, z: number) => R.detail * N3.fbm(x / 55, z / 55, 3) + 0.55 * N2.noise(x / 11, z / 11);

  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = X(i), z = X(j), k = j * n + i;
    h[k] = baseAt(x, z);
    detail[k] = detailAt(x, z);
  }

  // additive landforms
  const feats = def.features;
  for (const f of feats) {
    if (f.kind === "hill" || f.kind === "cone" || f.kind === "mesa" || f.kind === "ridge") {
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const x = X(i), z = X(j), k = j * n + i;
        if (f.kind === "hill") {
          const t = Math.hypot(x - f.x, z - f.z) / f.r;
          if (t < 1) h[k] += f.h * bump(t);
        } else if (f.kind === "cone") {
          const t = Math.hypot(x - f.x, z - f.z) / f.r;
          if (t < 1) {
            let v = f.h * Math.pow(1 - t, 1.45);
            const c = f.crater ?? 0;
            if (c > 0 && t < c) v -= f.h * 0.28 * Math.pow(1 - t / c, 2);
            h[k] += v * (0.9 + 0.1 * N2.noise(x / 18, z / 18));
            rockF[k] = Math.max(rockF[k], smoothstep(1, 0.55, t) * 0.75);
          }
        } else if (f.kind === "mesa") {
          const t = Math.hypot(x - f.x, z - f.z) / (f.r * (1 + 0.12 * N3.noise(x / 60, z / 60)));
          if (t < 1.25) {
            h[k] += f.h * (1 - smoothstep(0.82, 1.0, t)) + f.h * 0.15 * bump(t / 1.25);
            rockF[k] = Math.max(rockF[k], smoothstep(0.75, 0.92, t) * (1 - smoothstep(1.0, 1.15, t)));
          }
        } else {
          const { d } = distToPolyline(x, z, f.pts);
          const t = d / f.width;
          if (t < 1) { h[k] += f.height * bump(t) * (0.8 + 0.2 * N1.noise(x / 70, z / 70)); rockF[k] = Math.max(rockF[k], bump(t) * 0.25); }
        }
      }
    }
  }
  // flats (meadows, trailheads): blend toward the local mean and suppress detail
  for (const f of feats) {
    if (f.kind !== "flat") continue;
    const target = sampleBilinear(h, n, half, cell, f.x, f.z);
    const strength = f.strength ?? 0.75;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = X(i), z = X(j), k = j * n + i;
      const t = Math.hypot(x - f.x, z - f.z) / f.r;
      if (t < 1.4) {
        const w = bump(t / 1.4) * strength;
        h[k] = lerp(h[k], target + (h[k] - target) * 0.25, w);
        detail[k] *= 1 - w * 0.85;
        if (f.name && !/trailhead/i.test(f.name)) meadow[k] = Math.max(meadow[k], bump(t));
      }
    }
  }
  // trails: shallow, smoothed tread
  for (const f of feats) {
    if (f.kind !== "trail") continue;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = X(i), z = X(j), k = j * n + i;
      const { d } = distToPolyline(x, z, f.pts);
      const w = 1 - smoothstep(f.width * 0.5, f.width * 1.6, d);
      if (w > 0) { trail[k] = Math.max(trail[k], w); detail[k] *= 1 - 0.8 * w; }
    }
  }
  for (let k = 0; k < n * n; k++) h[k] += detail[k];

  // canyons (terraced)
  for (const f of feats) {
    if (f.kind !== "canyon") continue;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = X(i), z = X(j), k = j * n + i;
      const { d } = distToPolyline(x, z, f.pts);
      const wob = 1 + 0.18 * N2.noise(x / 45, z / 45);
      const t = d / (f.width * wob);
      if (t < 1.6) {
        const p = smoothstep(1.6, 0.25, t);
        const terr = Math.round(p * f.terraces) / f.terraces;
        const prof = lerp(p, terr, 0.55);
        h[k] -= f.depth * prof;
        rockF[k] = Math.max(rockF[k], smoothstep(0.1, 0.5, Math.abs(p - terr) * 3 + (t > 0.3 && t < 1.4 ? 0.3 : 0)) * 0.8);
      }
    }
  }

  // rivers: monotonic water level along the path, carved bed and banks
  const rivers: River[] = [];
  for (const f of feats) {
    if (f.kind !== "river") continue;
    const samples: [number, number, number][] = [];
    const pts = f.pts;
    for (let s = 0; s < pts.length - 1; s++) {
      const a = pts[s], b = pts[s + 1];
      const steps = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 6));
      for (let q = 0; q < steps; q++) {
        const t = q / steps;
        samples.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t), 0]);
      }
    }
    samples.push([pts[pts.length - 1][0], pts[pts.length - 1][1], 0]);
    let prev = Infinity;
    for (const sm of samples) {
      let lvl = sampleBilinear(h, n, half, cell, sm[0], sm[1]) - 0.6;
      // look across the channel for the lower bank
      lvl = Math.min(lvl, minAround(h, n, half, cell, sm[0], sm[1], f.width * 0.9) - 0.4);
      lvl = Math.min(lvl, prev - 0.02);
      sm[2] = lvl; prev = lvl;
    }
    // smooth levels
    for (let it = 0; it < 4; it++) for (let s = 1; s < samples.length - 1; s++) samples[s][2] = Math.min(samples[s - 1][2], (samples[s - 1][2] + samples[s][2] + samples[s + 1][2]) / 3);
    rivers.push({ pts: samples, width: f.width, depth: f.depth, name: f.name });
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = X(i), z = X(j), k = j * n + i;
      let best = Infinity, lvl = 0;
      for (let s = 0; s < samples.length - 1; s++) {
        const [d, t] = distToSegment(x, z, samples[s][0], samples[s][1], samples[s + 1][0], samples[s + 1][1]);
        if (d < best) { best = d; lvl = lerp(samples[s][2], samples[s + 1][2], t); }
      }
      const hw = f.width / 2;
      if (best < f.width * 2.2) {
        const bed = lvl - f.depth * (1 - Math.pow(Math.min(1, best / hw), 2) * 0.75);
        if (best < hw) h[k] = Math.min(h[k], bed);
        else h[k] = Math.min(h[k], lerp(lvl - 0.25, h[k], smoothstep(hw, f.width * 2.2, best)));
      }
    }
  }

  // lakes: level just under the lowest rim point, bowl-carved
  const lakes: Lake[] = [];
  for (const f of feats) {
    if (f.kind !== "lake") continue;
    const rot = f.rot ?? 0;
    let rim = Infinity;
    for (let a = 0; a < 64; a++) {
      const th = (a / 64) * Math.PI * 2;
      const u = Math.cos(th) * f.rx * 1.14, v = Math.sin(th) * f.rz * 1.14;
      const x = f.x + u * Math.cos(rot) - v * Math.sin(rot), z = f.z + u * Math.sin(rot) + v * Math.cos(rot);
      rim = Math.min(rim, sampleBilinear(h, n, half, cell, x, z));
    }
    const level = rim - 0.7;
    lakes.push({ x: f.x, z: f.z, rx: f.rx, rz: f.rz, rot, level, depth: f.depth, name: f.name });
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = X(i), z = X(j), k = j * n + i;
      const t = ellipseT(x, z, f.x, f.z, f.rx, f.rz, rot) * (1 + 0.06 * N3.noise(x / 40, z / 40));
      if (t < 1.3) {
        const target = t < 1 ? level - f.depth * (1 - t * t) - 0.2 : level - 0.2 + (t - 1) * 9;
        h[k] = Math.min(h[k], target);
      }
    }
  }

  // landmark pads: level the ground under stands, towers, blinds and buildings so nothing
  // floats on the downhill side and no terrain pokes through a floor (a whole grid cell
  // around the footprint is levelled so bilinear sampling stays flat inside it)
  const PAD: Partial<Record<string, number>> = { "lookout-tower": 3.6, "tree-stand": 2.0, "ground-blind": 1.8, cabin: 4.6, "ranger-station": 6.6, kiosk: 1.8, truck: 3.0 };
  for (const lm of def.landmarks) {
    const r0 = PAD[lm.kind];
    if (r0 === undefined) continue;
    let sum = sampleBilinear(h, n, half, cell, lm.x, lm.z), cnt = 1;
    for (let a = 0; a < 12; a++) { const th = (a / 12) * Math.PI * 2; sum += sampleBilinear(h, n, half, cell, lm.x + Math.cos(th) * r0, lm.z + Math.sin(th) * r0); cnt++; }
    const target = sum / cnt;
    const full = r0 + cell, edge = full + 6;
    const i0 = Math.max(0, Math.floor((lm.x - edge + half) / cell)), i1 = Math.min(n - 1, Math.ceil((lm.x + edge + half) / cell));
    const j0 = Math.max(0, Math.floor((lm.z - edge + half) / cell)), j1 = Math.min(n - 1, Math.ceil((lm.z + edge + half) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(X(i) - lm.x, X(j) - lm.z);
      if (d < edge) { const k = j * n + i; h[k] = lerp(h[k], target, 1 - smoothstep(full, edge, d)); }
    }
  }

  // ---- masks
  const riverXZ: XZ[][] = rivers.map(rv => rv.pts.map(p => [p[0], p[1]] as XZ));
  const rock = new Float32Array(n * n), shore = new Float32Array(n * n), forest = new Float32Array(n * n), grass = new Float32Array(n * n), snow = new Float32Array(n * n);
  const biome = def.biomeMode === "quadrants" ? new Float32Array(n * n * 4) : null;
  let minH = Infinity, maxH = -Infinity;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, x = X(i), z = X(j);
    const hx = h[j * n + Math.min(n - 1, i + 1)] - h[j * n + Math.max(0, i - 1)];
    const hz = h[Math.min(n - 1, j + 1) * n + i] - h[Math.max(0, j - 1) * n + i];
    const ny = 1 / Math.hypot(hx / (2 * cell), 1, hz / (2 * cell));
    const slope = 1 - ny;
    minH = Math.min(minH, h[k]); maxH = Math.max(maxH, h[k]);
    const bw = biomeWeights(def, x, z);
    if (biome) for (let q = 0; q < 4; q++) biome[k * 4 + q] = bw[q];
    let forestCover = 0, grassD = 0, grassH = 0, snowLine = 0;
    bw.forEach((w, q) => { const b = def.biomes[q]; forestCover += w * b.forest; grassD += w * b.grassDensity; grassH += w * b.grassHeight; snowLine += w * b.snowLine; });
    rock[k] = clamp01(smoothstep(0.17, 0.34, slope) + rockF[k] * (0.6 + 0.4 * N1.noise(x / 9, z / 9)) + 0.25 * smoothstep(0.4, 0.8, N2.noise(x / 35, z / 35)) * smoothstep(0.08, 0.2, slope));
    // shores
    let sh = 0;
    for (const L of lakes) {
      const t = ellipseT(x, z, L.x, L.z, L.rx, L.rz, L.rot);
      if (t < 1.4) sh = Math.max(sh, 1 - smoothstep(0.4, 2.2, Math.abs(h[k] - L.level)));
    }
    for (let ri = 0; ri < rivers.length; ri++) {
      const rv = rivers[ri];
      const d = distToPolyline(x, z, riverXZ[ri]).d;
      if (d < rv.width * 2.5) sh = Math.max(sh, 1 - smoothstep(rv.width * 0.5, rv.width * 1.8, d));
    }
    shore[k] = sh;
    snow[k] = smoothstep(snowLine - 12, snowLine + 12, h[k]) * (1 - smoothstep(0.35, 0.6, slope));
    // forest patches from noise, excluded from meadows / trails / water / rock / boundary strip / spawn
    const fn = 0.5 + 0.5 * N4.fbm(x / 140, z / 140, 3) + 0.15 * N1.noise(x / 30, z / 30);
    const thr = 1 - forestCover;
    let f = smoothstep(thr - 0.08, thr + 0.12, fn);
    f *= 1 - meadow[k] * 0.95;
    f *= 1 - trail[k];
    f *= 1 - smoothstep(0.2, 0.6, sh);
    f *= 1 - smoothstep(0.35, 0.6, slope);
    const sp = Math.hypot(x - def.spawn.x, z - def.spawn.z);
    f *= smoothstep(18, 45, sp);
    // landmarks sit in small clearings; fire lookouts keep a cleared summit so the cab sees out over the canopy
    for (const lm of def.landmarks) { const d = Math.hypot(x - lm.x, z - lm.z); const [r0, r1] = lm.kind === "lookout-tower" ? [40, 90] : [6, 14]; if (d < r1) f *= smoothstep(r0, r1, d); }
    forest[k] = clamp01(f);
    let g = grassD * (1 - rock[k] * 0.9) * (1 - trail[k] * 0.85) * (1 - sh * 0.6) * (1 - snow[k]) * (1 - forest[k] * 0.55);
    g *= 0.65 + 0.35 * (0.5 + 0.5 * N2.noise(x / 22, z / 22));
    g = clamp01(g + meadow[k] * 0.15);
    for (const lm of def.landmarks) { const d = Math.hypot(x - lm.x, z - lm.z); if (d < 12) g *= smoothstep(5, 12, d); }
    grass[k] = g;
    // grass height lives in the integer part trick? keep separate scale via grassH
    void grassH;
  }
  // underwater: no grass / forest
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, x = X(i), z = X(j);
    const wl = waterLevelAt({ lakes, rivers } as TerrainData, x, z);
    if (wl !== null && h[k] < wl + 0.15) { grass[k] = 0; forest[k] = 0; }
  }

  return { def, n, size, half, cell, h, lakes, rivers, trail, rock, shore, meadow, forest, grass, snow, biome, minH, maxH };
}

function minAround(h: Float32Array, n: number, half: number, cell: number, x: number, z: number, r: number) {
  let m = Infinity;
  for (let a = 0; a < 8; a++) { const th = (a / 8) * Math.PI * 2; m = Math.min(m, sampleBilinear(h, n, half, cell, x + Math.cos(th) * r, z + Math.sin(th) * r)); }
  return m;
}

export function sampleBilinear(arr: Float32Array, n: number, half: number, cell: number, x: number, z: number): number {
  let fx = (x + half) / cell, fz = (z + half) / cell;
  fx = Math.max(0, Math.min(n - 1.001, fx)); fz = Math.max(0, Math.min(n - 1.001, fz));
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
  const a = arr[j * n + i], b = arr[j * n + i + 1], c = arr[(j + 1) * n + i], d = arr[(j + 1) * n + i + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

export function heightAt(t: TerrainData, x: number, z: number): number { return sampleBilinear(t.h, t.n, t.half, t.cell, x, z); }
export function maskAt(t: TerrainData, arr: Float32Array, x: number, z: number): number { return sampleBilinear(arr, t.n, t.half, t.cell, x, z); }

export function normalAt(t: TerrainData, x: number, z: number): [number, number, number] {
  const e = t.cell;
  const hx = heightAt(t, x + e, z) - heightAt(t, x - e, z);
  const hz = heightAt(t, x, z + e) - heightAt(t, x, z - e);
  const nx = -hx / (2 * e), nz = -hz / (2 * e);
  const l = Math.hypot(nx, 1, nz);
  return [nx / l, 1 / l, nz / l];
}

/** Water surface height at (x,z), or null if dry land. */
export function waterLevelAt(t: Pick<TerrainData, "lakes" | "rivers">, x: number, z: number): number | null {
  for (const L of t.lakes) {
    if (ellipseT(x, z, L.x, L.z, L.rx * 1.25, L.rz * 1.25, L.rot) < 1) return L.level;
  }
  for (const rv of t.rivers) {
    let best = Infinity, lvl = 0;
    for (let s = 0; s < rv.pts.length - 1; s++) {
      const [d, tt] = distToSegment(x, z, rv.pts[s][0], rv.pts[s][1], rv.pts[s + 1][0], rv.pts[s + 1][1]);
      if (d < best) { best = d; lvl = lerp(rv.pts[s][2], rv.pts[s + 1][2], tt); }
    }
    if (best < rv.width * 0.75) return lvl;
  }
  return null;
}

/** Surface type for footsteps, impacts and hit sign. */
export function surfaceAt(t: TerrainData, x: number, z: number): "grass" | "dirt" | "rock" | "sand" | "snow" | "water" {
  const wl = waterLevelAt(t, x, z);
  if (wl !== null && heightAt(t, x, z) < wl) return "water";
  if (maskAt(t, t.snow, x, z) > 0.5) return "snow";
  if (maskAt(t, t.rock, x, z) > 0.55) return "rock";
  if (maskAt(t, t.shore, x, z) > 0.55) return "sand";
  if (maskAt(t, t.trail, x, z) > 0.5) return "dirt";
  return "grass";
}

export type { TerrainFeature };
