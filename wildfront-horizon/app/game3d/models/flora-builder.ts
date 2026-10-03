// Procedural geometry for F-series flora: trunks (tapered sweeps), spruce
// whorls (drooping star cones), foliage blobs (noise-displaced icospheres),
// shrubs, boulders, logs and reeds. Each tree is built in local space (base at
// the origin) with vertex colours and an `aSway` weight for wind.

import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mulberry32, rngRange } from "../core/rng.ts";
import { Simplex2 } from "../core/noise.ts";
import { smoothstep } from "../core/math.ts";
import type { RGB, V3 } from "../blueprints/types.ts";
import type { FloraBlueprint } from "../blueprints/flora.ts";
import { computeNormals, newPart, sweep, type GeoPart } from "./geometry.ts";
import { srgbToLinear } from "./paint.ts";

interface FPart extends GeoPart { sway: number[]; uv: number[] }
const fpart = (kind: string): FPart => ({ ...newPart(kind), sway: [], uv: [] });
/** atlas quadrant origins (see world/textures.ts foliageAtlas) */
const QUAD: [number, number][] = [[0, 0.5], [0.5, 0.5], [0, 0], [0.5, 0]];
const SOLID_UV: [number, number] = [0.75, 0.25];
function solidUV(p: FPart) { p.uv = []; for (let i = 0; i < p.pos.length / 3; i++) p.uv.push(SOLID_UV[0], SOLID_UV[1]); }
const L = (c: RGB): RGB => [srgbToLinear(c[0]), srgbToLinear(c[1]), srgbToLinear(c[2])];
const mixc = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function trunkPart(pts: V3[], r0: number, r1: number, bark: RGB, barkTop: RGB, H: number, segs = 8, samples = 8): FPart {
  const p = sweep(pts, { segs, samples, zone: 0, kind: "trunk", skin: () => [[0, 1]], up: [0, 0, 1], closeStart: false, closeEnd: true,
    section: (t, phi) => { const r = r0 + (r1 - r0) * Math.pow(t, 0.8); const fl = t < 0.05 ? 1 + (0.05 - t) * 6 : 1; return [Math.cos(phi) * r * fl, Math.sin(phi) * r * fl]; } });
  computeNormals(p);
  const out: FPart = { ...p, sway: [], uv: [] };
  solidUV(out);
  const n = new Simplex2(7);
  out.col = [];
  for (let i = 0; i < p.pos.length; i += 3) {
    const y = p.pos[i + 1];
    const t = Math.min(1, Math.max(0, y / H));
    const v = 0.85 + 0.25 * n.noise(p.pos[i] * 9 + y * 2, p.pos[i + 2] * 9 - y * 3);
    const c = mixc(L(bark), L(barkTop), smoothstep(0.3, 0.8, t));
    out.col.push(c[0] * v, c[1] * v, c[2] * v);
    out.sway.push(Math.pow(t, 2) * 0.6);
  }
  return out;
}

function indexedSphere(detail: number): { pos: Float32Array; idx: ArrayLike<number> } {
  const g0 = new THREE.IcosahedronGeometry(1, detail);
  g0.deleteAttribute("normal"); g0.deleteAttribute("uv");
  const g = mergeVertices(g0, 1e-4);
  return { pos: (g.getAttribute("position") as THREE.BufferAttribute).array as Float32Array, idx: g.getIndex()!.array };
}
const SPH1 = indexedSphere(1), SPH2 = indexedSphere(2);

/** Noise-displaced, non-indexed icosphere blob coloured dark-inside → light-tip. */
function blob(c: V3, r: V3, noise: Simplex2, amp: number, inner: RGB, tip: RGB, H: number, treeC: V3, detail2 = false, swayBase = 0.2): FPart {
  const S = detail2 ? SPH2 : SPH1, src = S.pos;
  const p = fpart("foliage");
  for (let i = 0; i < src.length; i += 3) {
    const dx = src[i], dy = src[i + 1], dz = src[i + 2];
    const k = 1 + amp * noise.noise(dx * 2.3 + c[0] * 0.7 + dz, dy * 2.3 + c[2] * 0.7 - dz * 1.3);
    p.pos.push(c[0] + dx * r[0] * k, c[1] + dy * r[1] * k, c[2] + dz * r[2] * k);
  }
  for (let i = 0; i < S.idx.length; i++) p.idx.push(S.idx[i]);
  computeNormals(p);
  const li = L(inner), lt = L(tip);
  for (let i = 0; i < p.pos.length; i += 3) {
    const ny = p.nrm[i + 1];
    const ox = p.pos[i] - treeC[0], oz = p.pos[i + 2] - treeC[2];
    const outward = (ox * p.nrm[i] + oz * p.nrm[i + 2]) / (Math.hypot(ox, oz) + 0.3);
    const t = Math.min(1, Math.max(0, smoothstep(-0.7, 0.9, ny) * 0.65 + outward * 0.35 + 0.1 * noise.noise(p.pos[i] * 3, p.pos[i + 2] * 3)));
    const col = mixc(li, lt, t);
    p.col.push(col[0], col[1], col[2]);
    p.sway.push(Math.min(1.2, Math.pow(Math.max(0, p.pos[i + 1]) / H, 1.5) + swayBase));
  }
  solidUV(p);
  return p;
}

function unit(rnd: () => number): V3 {
  const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - z * z);
  return [Math.cos(a) * s, z, Math.sin(a) * s];
}

/**
 * Leaf-card canopy: a darker opaque core plus alpha-cut cards scattered through
 * the crown volume, normals pointing out from the crown centre for soft light.
 */
function canopy(c: V3, r: V3, quad: number, noise: Simplex2, rnd: () => number, inner: RGB, tip: RGB, H: number, treeC: V3, lod: number, swayBase = 0.2): FPart[] {
  const core = blob(c, [r[0] * 0.55, r[1] * 0.55, r[2] * 0.55], noise, 0.3, mixc(inner, [0, 0, 0], 0.5), mixc(inner, [0, 0, 0], 0.2), H, treeC, false, swayBase);
  const p = fpart("cards");
  const avg = (r[0] + r[1] + r[2]) / 3;
  const n = Math.max(lod ? 5 : 10, Math.min(lod ? 18 : 42, Math.round((lod ? 5 : 11) * Math.pow(avg, 1.2))));
  const li = L(inner), lt = L(tip);
  const [u0, v0] = QUAD[quad];
  for (let i = 0; i < n; i++) {
    const d = unit(rnd);
    const k = 0.5 + 0.5 * Math.sqrt(rnd());
    const cc: V3 = [c[0] + d[0] * r[0] * k, c[1] + d[1] * r[1] * k, c[2] + d[2] * r[2] * k];
    const s = avg * (0.55 + 0.4 * rnd()) * (avg < 1.2 ? 1.15 : 1);
    const jit = unit(rnd);
    let nv: V3 = [d[0] + jit[0] * 0.9, d[1] + jit[1] * 0.9 + 0.2, d[2] + jit[2] * 0.9];
    const nl = Math.hypot(nv[0], nv[1], nv[2]) || 1; nv = [nv[0] / nl, nv[1] / nl, nv[2] / nl];
    let t1: V3 = Math.abs(nv[1]) < 0.9 ? [nv[2], 0, -nv[0]] : [1, 0, 0];
    const tl = Math.hypot(t1[0], t1[1], t1[2]) || 1; t1 = [t1[0] / tl, t1[1] / tl, t1[2] / tl];
    const t2: V3 = [nv[1] * t1[2] - nv[2] * t1[1], nv[2] * t1[0] - nv[0] * t1[2], nv[0] * t1[1] - nv[1] * t1[0]];
    const rot = rnd() * Math.PI * 2, cr = Math.cos(rot), sr = Math.sin(rot);
    const a: V3 = [t1[0] * cr + t2[0] * sr, t1[1] * cr + t2[1] * sr, t1[2] * cr + t2[2] * sr];
    const b: V3 = [-t1[0] * sr + t2[0] * cr, -t1[1] * sr + t2[1] * cr, -t1[2] * sr + t2[2] * cr];
    const shadeN: V3 = (() => { const v: V3 = [d[0] * 0.85, d[1] * 0.85 + 0.35, d[2] * 0.85]; const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; })();
    const tcol = Math.min(1, Math.max(0, smoothstep(-0.7, 0.9, d[1]) * 0.55 + k * 0.35 + 0.15 * (rnd() - 0.5)));
    const col = mixc(li, lt, tcol);
    const base = p.pos.length / 3;
    const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [sx, sy] of corners) {
      const v: V3 = [cc[0] + (a[0] * sx + b[0] * sy) * s, cc[1] + (a[1] * sx + b[1] * sy) * s, cc[2] + (a[2] * sx + b[2] * sy) * s];
      p.pos.push(v[0], v[1], v[2]);
      p.nrm.push(shadeN[0], shadeN[1], shadeN[2]);
      p.col.push(col[0], col[1], col[2]);
      p.uv.push(u0 + 0.01 + (sx + 1) * 0.24, v0 + 0.01 + (sy + 1) * 0.24);
      p.sway.push(Math.min(1.3, Math.pow(Math.max(0, v[1]) / H, 1.5) + swayBase + 0.1));
    }
    p.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  for (let i = 0; i < p.pos.length / 3; i++) { p.skinI.push(0, 0, 0, 0); p.skinW.push(1, 0, 0, 0); p.zone.push(0); }
  return [core, p];
}

/** Spruce whorl: drooping many-pointed cone. */
function whorl(y: number, r: number, droop: number, spikes: number, rnd: () => number, inner: RGB, tip: RGB, H: number): FPart {
  const p = fpart("whorl");
  const li = L(inner), lt = L(tip);
  const top: V3 = [0, y + r * 0.22, 0], bot: V3 = [0, y - droop * 0.5, 0];
  const rim: V3[] = [];
  const off = rnd() * Math.PI * 2;
  for (let k = 0; k < spikes * 2; k++) {
    const th = off + (k / (spikes * 2)) * Math.PI * 2 + (rnd() - 0.5) * 0.15;
    const rr = r * (k % 2 ? 0.58 : 1.0) * (0.85 + 0.3 * rnd());
    rim.push([Math.cos(th) * rr, y - droop * (rr / r) * (0.8 + 0.4 * rnd()), Math.sin(th) * rr]);
  }
  const K = rim.length;
  const push = (v: V3, c: RGB, sway: number) => { p.pos.push(v[0], v[1], v[2]); p.col.push(c[0], c[1], c[2]); p.sway.push(sway); return p.pos.length / 3 - 1; };
  const sw = (yy: number, rad: number) => Math.min(1.3, Math.pow(Math.max(0, yy) / H, 1.4) + rad * 0.15);
  for (let k = 0; k < K; k++) {
    const a = rim[k], b = rim[(k + 1) % K];
    const tipA = k % 2 ? 0.55 : 1, tipB = (k + 1) % 2 ? 0.55 : 1;
    const t0 = push(top, mixc(li, lt, 0.15), sw(top[1], 0));
    const t1 = push(b, mixc(li, lt, tipB), sw(b[1], 1));
    const t2 = push(a, mixc(li, lt, tipA), sw(a[1], 1));
    p.idx.push(t0, t1, t2);
    const d = mixc(li, li, 0);
    const b0 = push(bot, [d[0] * 0.55, d[1] * 0.55, d[2] * 0.55], sw(bot[1], 0));
    const b1 = push(a, mixc(li, lt, tipA * 0.5), sw(a[1], 1));
    const b2 = push(b, mixc(li, lt, tipB * 0.5), sw(b[1], 1));
    p.idx.push(b0, b1, b2);
  }
  computeNormals(p);
  solidUV(p);
  return p;
}

function merge(parts: FPart[], name: string): THREE.BufferGeometry {
  let nv = 0, ni = 0;
  for (const p of parts) { nv += p.pos.length / 3; ni += p.idx.length; }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), col = new Float32Array(nv * 3), sway = new Float32Array(nv), uv = new Float32Array(nv * 2);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const p of parts) {
    pos.set(p.pos, vo * 3); nrm.set(p.nrm, vo * 3); col.set(p.col, vo * 3); sway.set(p.sway, vo);
    if (p.uv.length === (p.pos.length / 3) * 2) uv.set(p.uv, vo * 2); else for (let i = 0; i < p.pos.length / 3; i++) { uv[(vo + i) * 2] = SOLID_UV[0]; uv[(vo + i) * 2 + 1] = SOLID_UV[1]; }
    for (let i = 0; i < p.idx.length; i++) idx[io + i] = p.idx[i] + vo;
    vo += p.pos.length / 3; io += p.idx.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aSway", new THREE.BufferAttribute(sway, 1));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingBox(); g.computeBoundingSphere();
  g.name = name;
  return g;
}

/** Build a flora specimen. `seed` varies branch/blob layout; `lod` 0 = full, 1 = reduced. */
export function buildFlora(bp: FloraBlueprint, seed = 1, lod = 0): THREE.BufferGeometry {
  const rnd = mulberry32(seed * 977 + bp.id.length * 31);
  const noise = new Simplex2(seed + 5);
  const H = bp.height, parts: FPart[] = [];
  const barkTop = bp.barkTop ?? bp.bark;
  const C: V3 = [0, H * 0.6, 0];
  const segs = lod ? 5 : 8;
  switch (bp.form) {
    case "spruce": {
      parts.push(trunkPart([[0, 0, 0], [0, H * 0.5, 0], [0, H * 0.98, 0]], bp.trunkR, 0.02, bp.bark, barkTop, H, segs, 6));
      const n = lod ? 7 : 13;
      const y0 = H * Math.max(0.05, bp.crownBase);
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const y = y0 + (H * 0.97 - y0) * Math.pow(t, 0.92);
        const r = Math.max(0.25, bp.crownR * Math.pow(1 - t, 0.9) * (0.88 + 0.24 * rnd()));
        parts.push(whorl(y, r, r * 0.55, lod ? 6 : 9, rnd, bp.foliage, bp.foliageTip, H));
      }
      break;
    }
    case "pole-pine": {
      const lean: V3 = [rngRange(rnd, -0.3, 0.3), 0, rngRange(rnd, -0.3, 0.3)];
      parts.push(trunkPart([[0, 0, 0], [lean[0] * 0.4, H * 0.5, lean[2] * 0.4], [lean[0], H, lean[2]]], bp.trunkR, 0.03, bp.bark, barkTop, H, segs, 6));
      const n = lod ? 5 : 10;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const y = H * (bp.crownBase + (0.98 - bp.crownBase) * t);
        const r = bp.crownR * (1 - t * 0.75) * (0.7 + 0.4 * rnd());
        const a = rnd() * Math.PI * 2, off = r * 0.55;
        parts.push(...canopy([lean[0] * (y / H) + Math.cos(a) * off, y, lean[2] * (y / H) + Math.sin(a) * off], [r, r * 0.55, r], 1, noise, rnd, bp.foliage, bp.foliageTip, H, [lean[0], y, lean[2]], lod, 0.2));
      }
      parts.push(whorl(H * 0.97, bp.crownR * 0.35, 0.6, 6, rnd, bp.foliage, bp.foliageTip, H));
      break;
    }
    case "scots-pine": {
      const bend: V3 = [rngRange(rnd, -0.8, 0.8), 0, rngRange(rnd, -0.8, 0.8)];
      parts.push(trunkPart([[0, 0, 0], [bend[0] * 0.3, H * 0.45, bend[2] * 0.3], [bend[0], H * 0.88, bend[2]]], bp.trunkR, 0.05, bp.bark, barkTop, H, segs, 7));
      const n = lod ? 4 : 7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd();
        const rr = bp.crownR * (0.35 + 0.55 * rnd());
        const y = H * (0.72 + 0.22 * rnd());
        const cx = bend[0] + Math.cos(a) * rr, cz = bend[2] + Math.sin(a) * rr;
        if (!lod) parts.push(trunkPart([[bend[0] * 0.8, y - 1.2, bend[2] * 0.8], [cx, y, cz]], 0.07, 0.03, barkTop, barkTop, H, 5, 3));
        const br = 1.4 + rnd() * 1.4;
        parts.push(...canopy([cx, y + 0.3, cz], [br, br * 0.42, br], 1, noise, rnd, bp.foliage, bp.foliageTip, H, [bend[0], y, bend[2]], lod, 0.2));
      }
      break;
    }
    case "broadleaf": {
      const tH = H * bp.crownBase;
      parts.push(trunkPart([[0, 0, 0], [0.1, tH * 0.6, 0.05], [0, tH, 0]], bp.trunkR, bp.trunkR * 0.7, bp.bark, barkTop, H, segs + 2, 6));
      const nb = 5;
      const crownC: V3 = [0, tH + (H - tH) * 0.48, 0];
      const ends: V3[] = [];
      for (let i = 0; i < nb; i++) {
        const a = (i / nb) * Math.PI * 2 + rnd() * 0.6;
        const e: V3 = [Math.cos(a) * bp.crownR * 0.62, tH + (H - tH) * (0.45 + 0.3 * rnd()), Math.sin(a) * bp.crownR * 0.62];
        ends.push(e);
        parts.push(trunkPart([[0, tH * 0.95, 0], [e[0] * 0.45, (tH + e[1]) * 0.5, e[2] * 0.45], e], bp.trunkR * 0.45, 0.06, bp.bark, barkTop, H, lod ? 5 : 6, lod ? 3 : 5));
      }
      const nBlobs = lod ? 7 : 13;
      for (let i = 0; i < nBlobs; i++) {
        let c: V3;
        if (i < ends.length) c = [ends[i][0], ends[i][1] + 0.6, ends[i][2]];
        else { const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * bp.crownR * 0.75; c = [Math.cos(a) * rr, crownC[1] + (rnd() - 0.3) * (H - tH) * 0.5, Math.sin(a) * rr]; }
        const r = bp.crownR * (0.38 + 0.18 * rnd());
        parts.push(...canopy(c, [r, r * 0.72, r], 0, noise, rnd, bp.foliage, bp.foliageTip, H, crownC, lod, 0.2));
      }
      break;
    }
    case "aspen":
    case "birch": {
      const lean: V3 = [rngRange(rnd, -0.25, 0.25), 0, rngRange(rnd, -0.25, 0.25)];
      parts.push(trunkPart([[0, 0, 0], [lean[0] * 0.5, H * 0.5, lean[2] * 0.5], [lean[0], H * 0.96, lean[2]]], bp.trunkR, 0.03, bp.bark, barkTop, H, segs, 7));
      const n = lod ? 4 : 7;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const y = H * (bp.crownBase + (0.93 - bp.crownBase) * t);
        const prof = Math.sin(Math.PI * (0.15 + 0.85 * t));
        const r = bp.crownR * (0.45 + 0.45 * prof) * (0.85 + 0.3 * rnd());
        const a = rnd() * Math.PI * 2;
        const droop = bp.form === "birch" ? 1.15 : 0.9;
        parts.push(...canopy([lean[0] * (y / H) + Math.cos(a) * r * 0.3, y, lean[2] * (y / H) + Math.sin(a) * r * 0.3], [r * 0.85, r * droop * 0.75, r * 0.85], 2, noise, rnd, bp.foliage, bp.foliageTip, H, [lean[0], y, lean[2]], lod, 0.2));
      }
      break;
    }
    case "juniper": {
      for (let s = 0; s < 2; s++) {
        const a = rnd() * Math.PI * 2;
        parts.push(trunkPart([[0, 0, 0], [Math.cos(a) * 0.4, H * 0.3, Math.sin(a) * 0.4], [Math.cos(a) * 0.8, H * 0.65, Math.sin(a) * 0.6]], bp.trunkR * (s ? 0.7 : 1), 0.05, bp.bark, barkTop, H, 6, 5));
      }
      const n = lod ? 4 : 7;
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, rr = rnd() * bp.crownR * 0.6;
        const y = H * (0.3 + 0.6 * rnd());
        const r = bp.crownR * (0.45 + 0.35 * rnd()) * (1 - (y / H) * 0.4);
        parts.push(...canopy([Math.cos(a) * rr, y, Math.sin(a) * rr], [r, r * 0.8, r], 1, noise, rnd, bp.foliage, bp.foliageTip, H, [0, y, 0], lod, 0.2));
      }
      break;
    }
    case "willow": {
      const stems = lod ? 3 : 5;
      for (let s = 0; s < stems; s++) {
        const a = (s / stems) * Math.PI * 2 + rnd();
        const tipP: V3 = [Math.cos(a) * bp.crownR * 0.6, H * (0.75 + 0.2 * rnd()), Math.sin(a) * bp.crownR * 0.6];
        parts.push(trunkPart([[Math.cos(a) * 0.15, 0, Math.sin(a) * 0.15], [tipP[0] * 0.4, H * 0.45, tipP[2] * 0.4], tipP], bp.trunkR, 0.03, bp.bark, barkTop, H, 5, 4));
        const r = bp.crownR * (0.5 + 0.25 * rnd());
        parts.push(...canopy([tipP[0], tipP[1] - 0.4, tipP[2]], [r, r * 0.85, r], 2, noise, rnd, bp.foliage, bp.foliageTip, H, [0, H * 0.6, 0], lod, 0.2));
      }
      break;
    }
    case "snag": {
      parts.push(trunkPart([[0, 0, 0], [0.1, H * 0.5, 0], [0.15, H, 0.05]], bp.trunkR, 0.06, bp.bark, barkTop, H, segs, 6));
      for (let i = 0; i < (lod ? 2 : 5); i++) {
        const y = H * (0.4 + 0.5 * rnd()), a = rnd() * Math.PI * 2, l = 0.8 + rnd() * 1.6;
        parts.push(trunkPart([[0.1, y, 0], [Math.cos(a) * l, y + l * 0.25, Math.sin(a) * l]], 0.06, 0.02, bp.bark, barkTop, H, 4, 2));
      }
      break;
    }
    case "shrub":
    case "sage":
    case "heather": {
      const n = lod ? 3 : 5;
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, rr = rnd() * bp.crownR * 0.45;
        const r = bp.crownR * (0.45 + 0.3 * rnd());
        parts.push(...canopy([Math.cos(a) * rr, r * 0.55, Math.sin(a) * rr], [r, H * (0.45 + 0.25 * rnd()), r], (bp.form === "sage" ? 2 : bp.form === "heather" ? 1 : 0), noise, rnd, bp.foliage, bp.foliageTip, H, [0, 0, 0], lod, 0.05));
      }
      break;
    }
    case "boulder": {
      const r = bp.crownR;
      const b = blob([0, H * 0.32, 0], [r, H * 0.62, r * 0.85], noise, 0.28, mixc(bp.foliage, [0.2, 0.2, 0.2], 0.25), bp.foliageTip, H, [0, 0, 0], true, 0);
      for (let i = 0; i < b.sway.length; i++) b.sway[i] = 0;
      parts.push(b);
      break;
    }
    case "log": {
      const len = bp.crownR;
      parts.push(trunkPart([[-len / 2, bp.trunkR * 0.8, 0], [0, bp.trunkR * 0.9, 0.1], [len / 2, bp.trunkR * 0.75, 0]], bp.trunkR, bp.trunkR * 0.55, bp.bark, barkTop, 4, 8, 6));
      for (const p of parts) for (let i = 0; i < p.sway.length; i++) p.sway[i] = 0;
      break;
    }
    case "reeds": {
      const n = lod ? 8 : 18;
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * bp.crownR;
        const h = H * (0.6 + 0.4 * rnd());
        const x = Math.cos(a) * rr, z = Math.sin(a) * rr, lx = (rnd() - 0.5) * 0.3, lz = (rnd() - 0.5) * 0.3;
        parts.push(trunkPart([[x, 0, z], [x + lx, h, z + lz]], 0.012, 0.004, bp.foliage, bp.foliage, H, 3, 2));
        if (rnd() < 0.45) parts.push(trunkPart([[x + lx * 0.85, h * 0.82, z + lz * 0.85], [x + lx * 0.95, h * 0.95, z + lz * 0.95]], 0.022, 0.02, bp.foliageTip, bp.foliageTip, H, 5, 2));
      }
      break;
    }
  }
  void C;
  return merge(parts, `${bp.id}-lod${lod}`);
}
