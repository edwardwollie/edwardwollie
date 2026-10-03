// Small math helpers shared by the simulation, blueprints and renderer.
// Pure functions only — safe to import from Node tests.

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function clamp(v: number, a: number, b: number): number { return v < a ? a : v > b ? b : v; }
export function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }
export function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
export function invLerp(a: number, b: number, v: number): number { return a === b ? 0 : (v - a) / (b - a); }
export function remap(v: number, a0: number, a1: number, b0: number, b1: number): number { return lerp(b0, b1, clamp01(invLerp(a0, a1, v))); }
export function smoothstep(a: number, b: number, v: number): number { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); }
export function smootherstep(a: number, b: number, v: number): number { const t = clamp01((v - a) / (b - a)); return t * t * t * (t * (t * 6 - 15) + 10); }
/** Frame-rate independent exponential approach. */
export function damp(current: number, target: number, rate: number, dt: number): number { return lerp(current, target, 1 - Math.exp(-rate * dt)); }
export function wrapAngle(a: number): number { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }
export function dampAngle(current: number, target: number, rate: number, dt: number): number { return current + wrapAngle(target - current) * (1 - Math.exp(-rate * dt)); }
export function sign(v: number): number { return v < 0 ? -1 : 1; }
export function len2(x: number, y: number): number { return Math.sqrt(x * x + y * y); }
export function dist2(ax: number, az: number, bx: number, bz: number): number { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); }
export function fract(v: number): number { return v - Math.floor(v); }

/** Monotone cubic (Fritsch–Carlson) interpolation over sorted keys. */
export function monotone(xs: number[], ys: number[], x: number): number {
  const n = xs.length;
  if (n === 0) return 0;
  if (n === 1 || x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let i = 0;
  while (i < n - 2 && x > xs[i + 1]) i++;
  const h = xs[i + 1] - xs[i];
  const t = (x - xs[i]) / h;
  const d = (k: number) => {
    if (k <= 0) return (ys[1] - ys[0]) / (xs[1] - xs[0]);
    if (k >= n - 1) return (ys[n - 1] - ys[n - 2]) / (xs[n - 1] - xs[n - 2]);
    const a = (ys[k] - ys[k - 1]) / (xs[k] - xs[k - 1]);
    const b = (ys[k + 1] - ys[k]) / (xs[k + 1] - xs[k]);
    if (a * b <= 0) return 0;
    return (2 * a * b) / (a + b);
  };
  const m0 = d(i) * h, m1 = d(i + 1) * h;
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * m1;
}

/** Catmull–Rom through 2D points; returns point at global parameter u in [0, n-1]. */
export function catmull2(pts: [number, number][], u: number): [number, number] {
  const n = pts.length;
  const i = Math.min(n - 2, Math.max(0, Math.floor(u)));
  const t = u - i;
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
  const t2 = t * t, t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
}

export function catmull3(pts: [number, number, number][], u: number): [number, number, number] {
  const n = pts.length;
  const i = Math.min(n - 2, Math.max(0, Math.floor(u)));
  const t = u - i;
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
  const t2 = t * t, t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), f(p0[2], p1[2], p2[2], p3[2])];
}

export function formatDistance(m: number, imperial = false): string {
  if (!isFinite(m)) return "—";
  return imperial ? `${Math.round(m * 1.09361)} yd` : `${Math.round(m)} m`;
}
