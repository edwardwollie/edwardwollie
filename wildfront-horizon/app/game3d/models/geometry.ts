// Procedural geometry kernels used by every blueprint builder:
// lofts (sections swept along a side-elevation centreline), tubes with
// parallel-transport frames, closed sweeps with custom sections, ellipsoids.
// Parts are plain arrays so they can be built in Node tests and merged into
// one skinned BufferGeometry per model.

import { catmull2, catmull3, monotone, smoothstep } from "../core/math.ts";
import type { LoftKey, V3 } from "../blueprints/types.ts";

export interface GeoPart {
  pos: number[];
  nrm: number[];
  col: number[];
  idx: number[];
  /** up to 4 (bone index, weight) pairs per vertex */
  skinI: number[];
  skinW: number[];
  zone: number[];
  /** which builder made the part — used by the painter */
  kind: string;
}

export function newPart(kind: string): GeoPart {
  return { pos: [], nrm: [], col: [], idx: [], skinI: [], skinW: [], zone: [], kind };
}

export type SkinFn = (t: number) => [number, number][];

function pushSkin(part: GeoPart, sk: [number, number][]) {
  const s = sk.slice(0, 4);
  while (s.length < 4) s.push([0, 0]);
  let sum = 0;
  for (const [, w] of s) sum += w;
  for (const [i, w] of s) { part.skinI.push(i); part.skinW.push(sum > 0 ? w / sum : 0); }
}

/** Accumulate smooth vertex normals from the triangle list. */
export function computeNormals(part: GeoPart) {
  const n = new Float64Array(part.pos.length);
  const p = part.pos, idx = part.idx;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { n[k] += nx; n[k + 1] += ny; n[k + 2] += nz; }
  }
  part.nrm = new Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    part.nrm[i] = n[i] / l; part.nrm[i + 1] = n[i + 1] / l; part.nrm[i + 2] = n[i + 2] / l;
  }
}

/**
 * Loft along a centreline drawn in side elevation (z, y). Each key gives the
 * plan half-width and dorsal/ventral half-heights; sections are superellipses
 * perpendicular to the centreline. Skin weights blend between key bones.
 */
export function loft(keys: LoftKey[], segs: number, sub: number, boneIndex: (n: string) => number, zoneId: (z: LoftKey["zone"]) => number, xOffset = 0, kind = "body"): GeoPart {
  const part = newPart(kind);
  const P = keys.map(k => k.p);
  const us = keys.map((_, i) => i);
  const W = keys.map(k => k.w), UP = keys.map(k => k.up), DN = keys.map(k => k.dn), NN = keys.map(k => k.n ?? 2);
  const total = (keys.length - 1) * sub + 1;
  // section tilt per key: explicit `a`, else the smoothed centreline tangent at the key
  const keyAng = keys.map((k, i) => {
    if (k.a !== undefined) return k.a;
    const e = 0.35;
    const a = catmull2(P, Math.max(0, i - e)), b = catmull2(P, Math.min(keys.length - 1, i + e));
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  });
  const rings: { c: [number, number]; t: [number, number] }[] = [];
  for (let s = 0; s < total; s++) {
    const u = s / sub;
    const c = catmull2(P, u);
    const ang = monotone(us, keyAng, u);
    rings.push({ c, t: [Math.cos(ang), Math.sin(ang)] });
  }
  for (let s = 0; s < total; s++) {
    const u = s / sub;
    const { c, t } = rings[s];
    const w = Math.max(0.001, monotone(us, W, u));
    const up = Math.max(0.001, monotone(us, UP, u));
    const dn = Math.max(0.001, monotone(us, DN, u));
    const nexp = monotone(us, NN, u);
    // section axes: lateral X, vertical V = (0, tz, -ty)
    const vy = t[0], vz = -t[1];
    const i0 = Math.min(keys.length - 2, Math.floor(u)), f = u - i0;
    const ka = keys[i0], kb = keys[i0 + 1];
    const sk: [number, number][] = ka.bone === kb.bone ? [[boneIndex(ka.bone), 1]] : [[boneIndex(ka.bone), 1 - smoothstep(0, 1, f)], [boneIndex(kb.bone), smoothstep(0, 1, f)]];
    const zid = zoneId((f < 0.5 ? ka : kb).zone);
    const ex = 2 / nexp;
    for (let k = 0; k < segs; k++) {
      const th = (k / segs) * Math.PI * 2;
      const co = Math.cos(th), si = Math.sin(th);
      const lat = w * Math.sign(co) * Math.pow(Math.abs(co), ex);
      const ver = (si >= 0 ? up : dn) * Math.sign(si) * Math.pow(Math.abs(si), ex);
      part.pos.push(xOffset + lat, c[1] + vy * ver, c[0] + vz * ver);
      pushSkin(part, sk);
      part.zone.push(zid);
    }
  }
  for (let s = 0; s < total - 1; s++) {
    for (let k = 0; k < segs; k++) {
      const a = s * segs + k, b = s * segs + ((k + 1) % segs), c = (s + 1) * segs + k, d = (s + 1) * segs + ((k + 1) % segs);
      part.idx.push(a, b, c, b, d, c);
    }
  }
  // caps
  const capStart = part.pos.length / 3;
  {
    const r = rings[0];
    part.pos.push(xOffset, r.c[1] - r.t[1] * 0.002, r.c[0] - r.t[0] * 0.002);
    pushSkin(part, [[boneIndex(keys[0].bone), 1]]); part.zone.push(zoneId(keys[0].zone));
    for (let k = 0; k < segs; k++) part.idx.push(capStart, (k + 1) % segs, k);
  }
  const capEnd = part.pos.length / 3;
  {
    const r = rings[total - 1];
    const last = keys[keys.length - 1];
    part.pos.push(xOffset, r.c[1] + r.t[1] * 0.002, r.c[0] + r.t[0] * 0.002);
    pushSkin(part, [[boneIndex(last.bone), 1]]); part.zone.push(zoneId(last.zone));
    const base = (total - 1) * segs;
    for (let k = 0; k < segs; k++) part.idx.push(capEnd, base + k, base + ((k + 1) % segs));
  }
  return part;
}

export interface SweepOpts {
  segs: number;
  samples: number;
  /** cross-section: returns [lateral, normal] offsets for ring angle phi at path parameter t∈[0,1] */
  section: (t: number, phi: number) => [number, number];
  skin: SkinFn;
  zone: number;
  kind: string;
  closeStart?: boolean;
  closeEnd?: boolean;
  /** preferred "up" for the first frame (defaults to world up / forward) */
  up?: V3;
}

function norm3(v: V3): V3 { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function cross(a: V3, b: V3): V3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot(a: V3, b: V3) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

/** Sweep a custom cross-section along a smoothed 3D polyline with parallel-transport frames. */
export function sweep(pts: V3[], o: SweepOpts): GeoPart {
  const part = newPart(o.kind);
  const n = o.samples;
  const C: V3[] = [], T: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const u = (i / n) * (pts.length - 1);
    C.push(pts.length === 2 ? [pts[0][0] + (pts[1][0] - pts[0][0]) * (i / n), pts[0][1] + (pts[1][1] - pts[0][1]) * (i / n), pts[0][2] + (pts[1][2] - pts[0][2]) * (i / n)] : catmull3(pts, u));
  }
  for (let i = 0; i <= n; i++) {
    const a = C[Math.max(0, i - 1)], b = C[Math.min(n, i + 1)];
    T.push(norm3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]));
  }
  // initial frame
  let up: V3 = o.up ?? [0, 1, 0];
  if (Math.abs(dot(up, T[0])) > 0.95) up = [0, 0, 1];
  let N = norm3(cross(T[0], up));      // lateral
  let B = cross(N, T[0]);              // "normal" direction
  const frames: { N: V3; B: V3 }[] = [];
  for (let i = 0; i <= n; i++) {
    if (i > 0) {
      // parallel transport N from T[i-1] to T[i]
      const axis = cross(T[i - 1], T[i]);
      const s = Math.hypot(axis[0], axis[1], axis[2]);
      if (s > 1e-6) {
        const ax = norm3(axis);
        const ang = Math.atan2(s, dot(T[i - 1], T[i]));
        N = rotate(N, ax, ang);
      }
      B = cross(N, T[i]);
    }
    frames.push({ N: [...N] as V3, B: [...B] as V3 });
  }
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const sk = o.skin(t);
    for (let k = 0; k < o.segs; k++) {
      const phi = (k / o.segs) * Math.PI * 2;
      const [lx, ny] = o.section(t, phi);
      const f = frames[i], c = C[i];
      part.pos.push(c[0] + f.N[0] * lx + f.B[0] * ny, c[1] + f.N[1] * lx + f.B[1] * ny, c[2] + f.N[2] * lx + f.B[2] * ny);
      pushSkin(part, sk);
      part.zone.push(o.zone);
    }
  }
  const S = o.segs;
  for (let i = 0; i < n; i++) for (let k = 0; k < S; k++) {
    const a = i * S + k, b = i * S + ((k + 1) % S), c = (i + 1) * S + k, d = (i + 1) * S + ((k + 1) % S);
    part.idx.push(a, c, b, b, c, d);
  }
  if (o.closeStart !== false) {
    const ci = part.pos.length / 3; const c = C[0];
    part.pos.push(c[0], c[1], c[2]); pushSkin(part, o.skin(0)); part.zone.push(o.zone);
    for (let k = 0; k < S; k++) part.idx.push(ci, k, (k + 1) % S);
  }
  if (o.closeEnd !== false) {
    const ci = part.pos.length / 3; const c = C[n];
    part.pos.push(c[0], c[1], c[2]); pushSkin(part, o.skin(1)); part.zone.push(o.zone);
    const base = n * S;
    for (let k = 0; k < S; k++) part.idx.push(ci, base + ((k + 1) % S), base + k);
  }
  return part;
}

export function rotate(v: V3, axis: V3, ang: number): V3 {
  const c = Math.cos(ang), s = Math.sin(ang);
  const d = dot(axis, v);
  const cr = cross(axis, v);
  return [v[0] * c + cr[0] * s + axis[0] * d * (1 - c), v[1] * c + cr[1] * s + axis[1] * d * (1 - c), v[2] * c + cr[2] * s + axis[2] * d * (1 - c)];
}

/** Round tube with radius profile r(t). */
export function tube(pts: V3[], r: (t: number) => number, segs: number, samples: number, skin: SkinFn, zone: number, kind: string, flat = 1, up?: V3): GeoPart {
  return sweep(pts, { segs, samples, skin, zone, kind, up, section: (t, phi) => [Math.cos(phi) * r(t) * flat, Math.sin(phi) * r(t)] });
}

/** UV-sphere style ellipsoid. */
export function ellipsoid(c: V3, rad: V3, segs: number, rings: number, skin: [number, number][], zone: number, kind: string): GeoPart {
  const part = newPart(kind);
  for (let i = 0; i <= rings; i++) {
    const v = i / rings, th = v * Math.PI;
    for (let k = 0; k < segs; k++) {
      const ph = (k / segs) * Math.PI * 2;
      const x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
      part.pos.push(c[0] + x * rad[0], c[1] + y * rad[1], c[2] + z * rad[2]);
      pushSkin(part, skin); part.zone.push(zone);
    }
  }
  for (let i = 0; i < rings; i++) for (let k = 0; k < segs; k++) {
    const a = i * segs + k, b = i * segs + ((k + 1) % segs), c2 = (i + 1) * segs + k, d = (i + 1) * segs + ((k + 1) % segs);
    part.idx.push(a, b, c2, b, d, c2);
  }
  return part;
}

/** Offset/transform helpers for parts. */
export function transformPart(part: GeoPart, fn: (x: number, y: number, z: number) => V3) {
  for (let i = 0; i < part.pos.length; i += 3) {
    const r = fn(part.pos[i], part.pos[i + 1], part.pos[i + 2]);
    part.pos[i] = r[0]; part.pos[i + 1] = r[1]; part.pos[i + 2] = r[2];
  }
}

/** Mirror a part across X (left → right side). Flips winding. */
export function mirrorPart(part: GeoPart, remapBone: (i: number) => number): GeoPart {
  const m = newPart(part.kind);
  m.pos = part.pos.slice(); m.col = part.col.slice(); m.zone = part.zone.slice(); m.skinW = part.skinW.slice();
  for (let i = 0; i < m.pos.length; i += 3) m.pos[i] = -m.pos[i];
  m.nrm = part.nrm.slice(); for (let i = 0; i < m.nrm.length; i += 3) m.nrm[i] = -m.nrm[i];
  m.skinI = part.skinI.map(remapBone);
  for (let i = 0; i < part.idx.length; i += 3) m.idx.push(part.idx[i], part.idx[i + 2], part.idx[i + 1]);
  return m;
}

export function vertexCount(p: GeoPart) { return p.pos.length / 3; }
