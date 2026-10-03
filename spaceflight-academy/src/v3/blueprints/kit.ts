import type { Part, Shape, Vec2, Vec3 } from "./types.ts";

/** Part factory: P(id, shape, material, extras). */
export function P(id: string, shape: Shape, mat: string, extra: Partial<Part> = {}): Part {
  return { id, shape, mat, ...extra };
}

/** Group / pivot node. */
export function G(id: string, children: readonly Part[], extra: Partial<Part> = {}): Part {
  return { id, children, ...extra };
}

/** Reference another blueprint as a sub-assembly. */
export function R(id: string, ref: string, extra: Partial<Part> = {}): Part {
  return { id, ref, ...extra };
}

export const S = {
  box: (w: number, h: number, d: number, radius = 0, seg?: number): Shape => ({ kind: "box", size: [w, h, d], radius, seg }),
  cyl: (r: number, h: number, rBot = r, seg?: number, open?: boolean): Shape => ({ kind: "cyl", rTop: r, rBot, h, seg, open }),
  arc: (r: number, h: number, thetaStart: number, thetaLength: number, seg?: number): Shape => ({ kind: "cyl", rTop: r, rBot: r, h, seg, open: true, thetaStart, thetaLength }),
  cone: (r: number, h: number, seg?: number): Shape => ({ kind: "cyl", rTop: 0.0001, rBot: r, h, seg }),
  sph: (r: number, seg?: number): Shape => ({ kind: "sphere", r, seg }),
  dome: (r: number, thetaLength = 90, seg?: number): Shape => ({ kind: "sphere", r, seg, thetaStart: 0, thetaLength }),
  cap: (r: number, len: number, seg?: number): Shape => ({ kind: "capsule", r, len, seg }),
  tor: (R: number, r: number, arc = 360, seg?: number, tube?: number): Shape => ({ kind: "torus", R, r, arc, seg, tube }),
  lathe: (profile: readonly Vec2[], seg?: number, phiStart?: number, phiLength?: number): Shape => ({ kind: "lathe", profile, seg, phiStart, phiLength }),
  ext: (outline: readonly Vec2[], depth: number, bevel = 0, curveSeg?: number): Shape => ({ kind: "extrude", outline, depth, bevel, curveSeg }),
  tube: (path: readonly Vec3[], r: number, seg?: number, radial?: number, closed?: boolean): Shape => ({ kind: "tube", path, r, seg, radial, closed }),
  plane: (w: number, h: number): Shape => ({ kind: "plane", size: [w, h] }),
  disc: (r: number, inner = 0, seg?: number): Shape => ({ kind: "disc", r, inner, seg }),
  label: (text: string, w: number, h: number, fg = "#ffffff", bg = "#14205a", border?: string): Shape => ({ kind: "label", text, size: [w, h], fg, bg, border }),
};

// ---------------------------------------------------------------- outlines

export function starOutline(outer: number, inner: number, points = 5, rotationDeg = 90): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (rotationDeg + (i * 180) / points) * (Math.PI / 180);
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

export function roundedRect(w: number, h: number, r: number, steps = 5): Vec2[] {
  const hw = w / 2, hh = h / 2, rr = Math.min(r, hw, hh);
  const out: Vec2[] = [];
  const corners: [number, number, number][] = [[hw - rr, hh - rr, 0], [-hw + rr, hh - rr, 90], [-hw + rr, -hh + rr, 180], [hw - rr, -hh + rr, 270]];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= steps; i++) {
      const a = (start + (90 * i) / steps) * (Math.PI / 180);
      out.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
  }
  return out;
}

export function circleOutline(r: number, steps = 32): Vec2[] {
  return Array.from({ length: steps }, (_, i) => {
    const a = (i / steps) * Math.PI * 2;
    return [Math.cos(a) * r, Math.sin(a) * r] as Vec2;
  });
}

export function polygon(r: number, sides: number, rotationDeg = 0): Vec2[] {
  return Array.from({ length: sides }, (_, i) => {
    const a = ((rotationDeg + (360 * i) / sides) * Math.PI) / 180;
    return [Math.cos(a) * r, Math.sin(a) * r] as Vec2;
  });
}

/** Swept rocket fin in the XY plane: root along +Y at x = 0, span toward +X. */
export function finOutline(root: number, tip: number, span: number, sweep: number): Vec2[] {
  return [[0, 0], [span, sweep - tip * 0.15], [span, sweep + tip * 0.85], [0, root]];
}

// ---------------------------------------------------------------- lathe profiles

/** Tangent ogive nose cone: base radius r, length l, from y = 0 to y = l. */
export function ogive(r: number, l: number, steps = 18, tip = 0.02): Vec2[] {
  const rho = (r * r + l * l) / (2 * r);
  const out: Vec2[] = [[0, 0]];
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * l; // distance from base
    const y = Math.sqrt(Math.max(0, rho * rho - x * x)) + r - rho;
    out.push([Math.max(tip, y), x]);
  }
  out.push([0, l + tip * 0.5]);
  return out;
}

/** Rocket engine bell: throat radius rt at the top (y = l), exit radius re at y = 0. */
export function bell(rt: number, re: number, l: number, steps = 14, lip = 0.03): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps; // 0 = exit, 1 = throat
    const r = rt + (re - rt) * Math.pow(1 - t, 1.7);
    out.push([r, t * l]);
  }
  // inner lip so the bell reads as hollow from below
  out.unshift([re - lip, lip * 0.5]);
  return out;
}

/** Smooth dome profile (heat shield / dish) from rim radius r with depth d. */
export function dish(r: number, d: number, steps = 12, inverted = false): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const rr = r * Math.sin((t * Math.PI) / 2);
    const y = d * Math.cos((t * Math.PI) / 2);
    out.push([rr, inverted ? -y : y]);
  }
  return out;
}

/** Round to millimetres (keeps generated specs readable in tests and sheets). */
export function mm(value: number) {
  return Math.round(value * 1000) / 1000;
}

/** Half ellipse with the flat edge on top (an open smiling mouth). */
export function halfEllipse(rx: number, ry: number, steps = 14): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = Math.PI + (i / steps) * Math.PI;
    out.push([Math.cos(a) * rx, Math.sin(a) * ry]);
  }
  return out;
}

/** Deterministic pseudo-random numbers for procedural detail (same result every build). */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return (s % 100000) / 100000;
  };
}

/** Evenly spread directions on a sphere (Fibonacci lattice). */
export function fibonacciSphere(count: number): Vec3[] {
  const out: Vec3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const radius = Math.sqrt(1 - y * y);
    const theta = golden * i;
    out.push([Math.cos(theta) * radius, y, Math.sin(theta) * radius]);
  }
  return out;
}
