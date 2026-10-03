// Topographic maps of a reserve, drawn from the same heightfield, masks and
// feature blueprints the 3D terrain is generated from: hypsometric tint +
// hillshade, forest and meadow cover, water by depth, 5 m contours with 25 m
// index contours, trails, named features and landmarks. Used by the briefing,
// the minimap, the field map and the printed M-series sheets.

import type { TerrainData } from "../world/terrain-gen.ts";
import { sampleBilinear, waterLevelAt } from "../world/terrain-gen.ts";
import type { Landmark } from "../blueprints/reserves.ts";

export type TopoStyle = "field" | "print";

export interface TopoOptions {
  size: number;                 // output px (square)
  style?: TopoStyle;
  contours?: boolean;
  labels?: boolean;
  landmarks?: boolean;
  grid?: boolean;
  boundary?: boolean;
  /** draw only the base raster (no vectors) — for the book where vectors are added later */
  rasterOnly?: boolean;
}

type C3 = [number, number, number];
const mix = (a: C3, b: C3, t: number): C3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sat = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a: number, b: number, x: number) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export function worldToMap(t: TerrainData, x: number, z: number, size: number): [number, number] {
  return [(x + t.half) / (t.half * 2) * size, (z + t.half) / (t.half * 2) * size];
}
export function mapToWorld(t: TerrainData, px: number, py: number, size: number): [number, number] {
  return [px / size * t.half * 2 - t.half, py / size * t.half * 2 - t.half];
}

/** Per-node water depth (water level − ground) or −1 on dry land. */
function waterDepthGrid(t: TerrainData): Float32Array {
  const n = t.n, out = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -t.half + i * t.cell, z = -t.half + j * t.cell;
    const wl = waterLevelAt(t, x, z);
    const h = t.h[j * n + i];
    out[j * n + i] = wl === null ? -1.5 : wl - h;
  }
  return out;
}

const cache = new WeakMap<TerrainData, Map<string, HTMLCanvasElement>>();

export function renderTopo(t: TerrainData, o: TopoOptions): HTMLCanvasElement {
  const key = JSON.stringify(o);
  let m = cache.get(t);
  if (!m) { m = new Map(); cache.set(t, m); }
  const hit = m.get(key);
  if (hit) return hit;
  const c = drawTopo(t, o);
  m.set(key, c);
  return c;
}

function drawTopo(t: TerrainData, o: TopoOptions): HTMLCanvasElement {
  const S = o.size, style = o.style ?? "field";
  const n = t.n, cell = t.cell, half = t.half;
  const def = t.def;
  const canvas = document.createElement("canvas");
  canvas.width = S; canvas.height = S;
  const g = canvas.getContext("2d")!;
  const img = g.createImageData(S, S);
  const D = img.data;
  const depth = waterDepthGrid(t);
  // hillshade per node (light from the north-west, 45° up)
  const shade = new Float32Array(n * n);
  const L = [-0.55, 0.62, -0.55];
  const ll = Math.hypot(L[0], L[1], L[2]);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const hx = t.h[j * n + Math.min(n - 1, i + 1)] - t.h[j * n + Math.max(0, i - 1)];
    const hz = t.h[Math.min(n - 1, j + 1) * n + i] - t.h[Math.max(0, j - 1) * n + i];
    const nx = -hx / (2 * cell), nz = -hz / (2 * cell), ny = 1;
    const nl = Math.hypot(nx, ny, nz);
    shade[j * n + i] = (nx * L[0] + ny * L[1] + nz * L[2]) / (nl * ll);
  }
  const b0 = def.biomes[0];
  const quad = def.biomeMode === "quadrants" && t.biome;
  const lo = t.minH, hi = Math.max(t.maxH, lo + 1);
  for (let py = 0; py < S; py++) {
    const z = (py + 0.5) / S * half * 2 - half;
    for (let px = 0; px < S; px++) {
      const x = (px + 0.5) / S * half * 2 - half;
      const h = sampleBilinear(t.h, n, half, cell, x, z);
      const wd = sampleBilinear(depth, n, half, cell, x, z);
      const sh = sampleBilinear(shade, n, half, cell, x, z);
      const forest = sampleBilinear(t.forest, n, half, cell, x, z);
      const rock = sampleBilinear(t.rock, n, half, cell, x, z);
      const snow = sampleBilinear(t.snow, n, half, cell, x, z);
      const meadow = sampleBilinear(t.meadow, n, half, cell, x, z);
      // biome base colours (quadrant reserves blend four palettes)
      let grass: C3 = b0.grass as C3, dry: C3 = b0.dry as C3, rk: C3 = b0.rock as C3;
      if (quad) {
        const fx = Math.max(0, Math.min(n - 1, Math.round((x + half) / cell))), fz = Math.max(0, Math.min(n - 1, Math.round((z + half) / cell)));
        const bi = (fz * n + fx) * 4;
        grass = [0, 0, 0]; dry = [0, 0, 0]; rk = [0, 0, 0];
        for (let k = 0; k < 4; k++) {
          const w = t.biome![bi + k], B = def.biomes[k] ?? b0;
          for (let q = 0; q < 3; q++) { grass[q] += B.grass[q] * w; dry[q] += B.dry[q] * w; rk[q] += B.rock[q] * w; }
        }
      }
      const e = (h - lo) / (hi - lo);
      let col: C3;
      if (style === "print") {
        // light hypsometric tints on paper
        col = mix([0.86, 0.9, 0.78], [0.93, 0.89, 0.76], sstep(0.15, 0.75, e));
        col = mix(col, [0.88, 0.84, 0.8], sstep(0.4, 0.8, rock));
        col = mix(col, [0.74, 0.86, 0.68], forest * 0.75);
        col = mix(col, [0.98, 0.98, 0.98], snow);
        const k = 0.86 + 0.22 * sh;
        col = [col[0] * k, col[1] * k, col[2] * k];
      } else {
        col = mix(grass, dry, sat(0.25 + 0.5 * e - meadow * 0.2));
        col = mix(col, [grass[0] * 1.15, grass[1] * 1.2, grass[2] * 0.9], meadow * 0.35);
        col = mix(col, rk, sstep(0.35, 0.8, rock));
        col = mix(col, [grass[0] * 0.42, grass[1] * 0.55, grass[2] * 0.42], sstep(0.2, 0.75, forest) * 0.85);
        col = mix(col, [0.9, 0.93, 0.96], snow);
        const k = 0.5 + 0.75 * Math.max(0, sh);
        col = [col[0] * k * 0.92, col[1] * k * 0.92, col[2] * k * 0.92];
      }
      if (wd > 0) {
        const dd = sat(wd / 6);
        col = style === "print" ? mix([0.68, 0.84, 0.92], [0.42, 0.66, 0.84], dd) : mix([0.16, 0.38, 0.42], [0.04, 0.14, 0.24], dd);
      } else if (wd > -0.35 && style === "field") col = mix(col, [0.55, 0.52, 0.4], 0.35);
      const i4 = (py * S + px) * 4;
      D[i4] = Math.round(sat(col[0]) * 255); D[i4 + 1] = Math.round(sat(col[1]) * 255); D[i4 + 2] = Math.round(sat(col[2]) * 255); D[i4 + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  if (o.rasterOnly) return canvas;
  const k = S / (half * 2);
  const P = (x: number, z: number): [number, number] => [(x + half) * k, (z + half) * k];
  // ---- contours (marching squares on the node grid)
  if (o.contours !== false) {
    const minor = 5, major = 25;
    const segs = new Map<number, number[]>();
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const a = t.h[j * n + i], b = t.h[j * n + i + 1], c2 = t.h[(j + 1) * n + i + 1], d = t.h[(j + 1) * n + i];
      if (depth[j * n + i] > 0.2 && depth[(j + 1) * n + i + 1] > 0.2) continue;      // no contours under water
      const mn = Math.min(a, b, c2, d), mx = Math.max(a, b, c2, d);
      for (let lv = Math.ceil(mn / minor) * minor; lv <= mx; lv += minor) {
        const pts: number[] = [];
        const edge = (h1: number, h2: number, x1: number, z1: number, x2: number, z2: number) => {
          if ((h1 < lv) !== (h2 < lv)) { const u = (lv - h1) / (h2 - h1); pts.push(x1 + (x2 - x1) * u, z1 + (z2 - z1) * u); }
        };
        const x0 = -half + i * cell, z0 = -half + j * cell, x1 = x0 + cell, z1 = z0 + cell;
        edge(a, b, x0, z0, x1, z0); edge(b, c2, x1, z0, x1, z1); edge(c2, d, x1, z1, x0, z1); edge(d, a, x0, z1, x0, z0);
        if (pts.length >= 4) {
          let arr = segs.get(lv); if (!arr) { arr = []; segs.set(lv, arr); }
          arr.push(pts[0], pts[1], pts[2], pts[3]);
          if (pts.length === 8) arr.push(pts[4], pts[5], pts[6], pts[7]);
        }
      }
    }
    for (const [lv, arr] of segs) {
      const isMajor = Math.abs(lv % major) < 1e-6;
      g.beginPath();
      for (let q = 0; q < arr.length; q += 4) { const [ax, ay] = P(arr[q], arr[q + 1]); const [bx, by] = P(arr[q + 2], arr[q + 3]); g.moveTo(ax, ay); g.lineTo(bx, by); }
      if (style === "print") { g.strokeStyle = isMajor ? "rgba(140,90,40,0.75)" : "rgba(160,110,60,0.38)"; g.lineWidth = isMajor ? 1.3 * S / 1400 + 0.4 : 0.7 * S / 1400 + 0.25; }
      else { g.strokeStyle = isMajor ? "rgba(255,240,205,0.42)" : "rgba(255,240,205,0.16)"; g.lineWidth = isMajor ? 1.1 : 0.6; }
      g.stroke();
    }
  }
  // ---- rivers (centre lines) and trails
  for (const f of def.features) {
    if (f.kind === "river") {
      g.beginPath();
      f.pts.forEach(([x, z], i) => { const [px, py] = P(x, z); if (i) g.lineTo(px, py); else g.moveTo(px, py); });
      g.strokeStyle = style === "print" ? "rgba(60,120,180,0.55)" : "rgba(120,200,230,0.35)"; g.lineWidth = Math.max(1, f.width * k * 0.35); g.stroke();
    }
  }
  for (const f of def.features) {
    if (f.kind !== "trail") continue;
    g.beginPath();
    f.pts.forEach(([x, z], i) => { const [px, py] = P(x, z); if (i) g.lineTo(px, py); else g.moveTo(px, py); });
    g.setLineDash(style === "print" ? [6 * S / 1400 + 2, 4 * S / 1400 + 2] : [5, 4]);
    g.strokeStyle = style === "print" ? "rgba(120,60,30,0.9)" : "rgba(255,226,170,0.85)"; g.lineWidth = style === "print" ? 1.4 * S / 1400 + 0.6 : 1.6;
    g.stroke();
    g.setLineDash([]);
  }
  // ---- boundary
  if (o.boundary !== false) {
    const b = half - 50;
    const [ax, ay] = P(-b, -b), [bx, by] = P(b, b);
    g.setLineDash([8, 6]);
    g.strokeStyle = style === "print" ? "rgba(200,40,40,0.7)" : "rgba(255,120,80,0.7)"; g.lineWidth = 1.5;
    g.strokeRect(ax, ay, bx - ax, by - ay);
    g.setLineDash([]);
  }
  // ---- grid (100 m squares, A.. / 1..)
  if (o.grid) {
    g.strokeStyle = style === "print" ? "rgba(40,60,90,0.18)" : "rgba(83,243,220,0.12)"; g.lineWidth = 1;
    for (let v = -half; v <= half + 0.1; v += 100) {
      const [p1x, p1y] = P(v, -half), [p2x, p2y] = P(v, half);
      g.beginPath(); g.moveTo(p1x, p1y); g.lineTo(p2x, p2y); g.stroke();
      const [q1x, q1y] = P(-half, v), [q2x, q2y] = P(half, v);
      g.beginPath(); g.moveTo(q1x, q1y); g.lineTo(q2x, q2y); g.stroke();
    }
    g.fillStyle = style === "print" ? "rgba(40,60,90,0.6)" : "rgba(160,230,220,0.55)";
    g.font = `600 ${Math.round(S / 70)}px 'Barlow Condensed', sans-serif`;
    const cols = Math.round(half * 2 / 100);
    for (let q = 0; q < cols; q++) {
      const [cx] = P(-half + 50 + q * 100, 0); g.fillText(String.fromCharCode(65 + q), cx - S / 200, S / 55);
      const [, cy] = P(0, -half + 50 + q * 100); g.fillText(String(q + 1), S / 160, cy + S / 200);
    }
  }
  // ---- landmarks
  if (o.landmarks !== false) for (const lm of def.landmarks) drawLandmark(g, lm, P(lm.x, lm.z), S, style);
  // ---- labels
  if (o.labels !== false) {
    const fs = Math.max(10, Math.round(S / 62));
    g.textAlign = "center"; g.textBaseline = "middle";
    // simple collision avoidance: a label that would overlap one already placed is nudged
    // down (then up) by whole line heights
    const placed: [number, number, number, number][] = [];
    // landmark symbols are obstacles too
    if (o.landmarks !== false) for (const lm of def.landmarks) { const [lx, ly] = P(lm.x, lm.z); placed.push([lx, ly, S / 45, S / 45]); }
    const label = (text: string, x: number, z: number, kind: "water" | "land" | "site") => {
      const [px0, py0] = P(x, z);
      g.font = kind === "water" ? `italic 600 ${fs}px 'Barlow Condensed', sans-serif` : `700 ${kind === "site" ? Math.round(fs * 0.85) : fs}px 'Barlow Condensed', sans-serif`;
      const txt = kind === "water" ? text : text.toUpperCase();
      const w = g.measureText(txt).width + 6, h = fs * 1.15;
      const px = px0;
      let py = py0;
      for (const k of [0, 1, -1, 2, -2, 3]) {
        const y = py0 + k * h;
        if (!placed.some(r => Math.abs(r[0] - px0) * 2 < r[2] + w && Math.abs(r[1] - y) * 2 < r[3] + h)) { py = y; break; }
      }
      placed.push([px, py, w, h]);
      if (style === "print") { g.fillStyle = kind === "water" ? "#1e5a8c" : "#3a2a1a"; }
      else {
        g.lineWidth = 3; g.strokeStyle = "rgba(4,14,22,0.75)"; g.strokeText(txt, px, py);
        g.fillStyle = kind === "water" ? "#9fe6ff" : kind === "site" ? "#ffe2aa" : "#e9f6f2";
      }
      g.fillText(txt, px, py);
    };
    for (const f of def.features) {
      if (!("name" in f) || !f.name || f.name === "Trailhead") continue;
      if (f.kind === "lake") label(f.name, f.x, f.z, "water");
      else if (f.kind === "river") { const m = f.pts[Math.floor(f.pts.length / 2)]; label(f.name, m[0], m[1] - 14, "water"); }
      else if (f.kind === "canyon" || f.kind === "ridge") { const m = f.pts[Math.floor(f.pts.length / 2)]; label(f.name, m[0], m[1], "land"); }
      else if ("x" in f) label(f.name, f.x, f.z + ("r" in f ? 0 : 0), "land");
    }
    for (const lm of def.landmarks) if (lm.name) label(lm.name, lm.x, lm.z + 16, "site");
    g.textAlign = "start"; g.textBaseline = "alphabetic";
  }
  return canvas;
}

export function drawLandmark(g: CanvasRenderingContext2D, lm: Landmark, [x, y]: [number, number], S: number, style: TopoStyle) {
  const s = Math.max(5, S / 140);
  g.save();
  g.translate(x, y);
  g.lineWidth = Math.max(1, S / 700);
  const ink = style === "print" ? "#2a1a10" : "#ffe9c0";
  const fill = style === "print" ? "#fff8e8" : "rgba(10,24,32,0.85)";
  g.strokeStyle = ink; g.fillStyle = fill;
  switch (lm.kind) {
    case "lookout-tower": g.beginPath(); g.moveTo(0, -s * 1.3); g.lineTo(s, s); g.lineTo(-s, s); g.closePath(); g.fill(); g.stroke(); g.beginPath(); g.moveTo(-s * 0.5, 0); g.lineTo(s * 0.5, 0); g.stroke(); break;
    case "tree-stand": g.beginPath(); g.moveTo(0, -s); g.lineTo(0, s); g.moveTo(-s * 0.7, -s * 0.5); g.lineTo(s * 0.7, -s * 0.5); g.stroke(); break;
    case "ground-blind": g.fillRect(-s * 0.8, -s * 0.8, s * 1.6, s * 1.6); g.strokeRect(-s * 0.8, -s * 0.8, s * 1.6, s * 1.6); break;
    case "cabin": case "ranger-station": g.beginPath(); g.moveTo(-s, s * 0.8); g.lineTo(-s, -s * 0.1); g.lineTo(0, -s); g.lineTo(s, -s * 0.1); g.lineTo(s, s * 0.8); g.closePath(); g.fill(); g.stroke(); break;
    case "kiosk": g.beginPath(); g.arc(0, 0, s * 0.85, 0, Math.PI * 2); g.fill(); g.stroke(); g.fillStyle = ink; g.font = `700 ${Math.round(s * 1.3)}px 'Barlow Condensed', sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("i", 0, s * 0.08); break;
    case "truck": g.fillRect(-s, -s * 0.55, s * 2, s * 1.1); g.strokeRect(-s, -s * 0.55, s * 2, s * 1.1); break;
    case "footbridge": g.beginPath(); g.moveTo(-s * 1.3, -s * 0.45); g.lineTo(s * 1.3, -s * 0.45); g.moveTo(-s * 1.3, s * 0.45); g.lineTo(s * 1.3, s * 0.45); g.stroke(); break;
    case "fence": g.setLineDash([2, 2]); g.beginPath(); g.moveTo(-s * 1.4, 0); g.lineTo(s * 1.4, 0); g.stroke(); g.setLineDash([]); break;
  }
  g.restore();
}
