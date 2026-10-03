// Spatial hash of vertical cylinders (tree trunks, boulders, structures) for
// player/animal collision, bullet stops and line-of-sight occlusion.

export interface Collider { x: number; z: number; r: number; y0: number; h: number; kind: "tree" | "rock" | "structure" | "log"; id: number; soft?: number }

export class ColliderGrid {
  cell: number;
  map = new Map<number, Collider[]>();
  all: Collider[] = [];
  constructor(cell = 8) { this.cell = cell; }
  private key(i: number, j: number) { return ((i + 4096) << 13) | (j + 4096); }
  add(c: Collider) {
    this.all.push(c);
    const r = c.r;
    const i0 = Math.floor((c.x - r) / this.cell), i1 = Math.floor((c.x + r) / this.cell);
    const j0 = Math.floor((c.z - r) / this.cell), j1 = Math.floor((c.z + r) / this.cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = this.key(i, j);
      let a = this.map.get(k);
      if (!a) { a = []; this.map.set(k, a); }
      a.push(c);
    }
  }
  query(x: number, z: number, r: number, out: Collider[] = []): Collider[] {
    out.length = 0;
    const i0 = Math.floor((x - r) / this.cell), i1 = Math.floor((x + r) / this.cell);
    const j0 = Math.floor((z - r) / this.cell), j1 = Math.floor((z + r) / this.cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const a = this.map.get(this.key(i, j));
      if (!a) continue;
      for (const c of a) if (!out.includes(c)) out.push(c);
    }
    return out;
  }
  /** Push a circle (x,z,r) out of any colliders; returns corrected position. */
  resolve(x: number, z: number, r: number, y: number): [number, number] {
    const near = this.query(x, z, r + 2);
    for (const c of near) {
      if (y > c.y0 + c.h || y + 1.8 < c.y0) continue;
      const dx = x - c.x, dz = z - c.z;
      const d = Math.hypot(dx, dz), m = c.r + r;
      if (d < m && d > 1e-5) { x = c.x + dx / d * m; z = c.z + dz / d * m; }
    }
    return [x, z];
  }
  /**
   * First cylinder hit along a 3D segment. Returns parametric t in [0,1] or null.
   * Cylinders are vertical: (x,z) circle extruded from y0 to y0+h.
   */
  segment(ax: number, ay: number, az: number, bx: number, by: number, bz: number, filter?: (c: Collider) => boolean): { t: number; c: Collider } | null {
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(len / this.cell));
    let best: { t: number; c: Collider } | null = null;
    const seen = new Set<Collider>();
    const tmp: Collider[] = [];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      for (const c of this.query(x, z, this.cell * 0.75, tmp)) {
        if (seen.has(c)) continue;
        seen.add(c);
        if (filter && !filter(c)) continue;
        const hit = segCircle(ax, az, bx, bz, c.x, c.z, c.r);
        if (hit === null) continue;
        const y = ay + (by - ay) * hit;
        if (y < c.y0 || y > c.y0 + c.h) continue;
        if (!best || hit < best.t) best = { t: hit, c };
      }
      if (best && best.t <= t) break;
    }
    return best;
  }
}

/** 2D segment vs circle: smallest t in [0,1] where the segment enters the circle. */
export function segCircle(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, r: number): number | null {
  const dx = bx - ax, dz = bz - az;
  const fx = ax - cx, fz = az - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return fx * fx + fz * fz <= r * r ? 0 : null;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / (2 * a);
  if (t1 >= 0 && t1 <= 1) return t1;
  // a segment that starts inside is blocked straight away (callers that must pass
  // out of a collider, like a shot from a ground blind, filter that collider out)
  return c <= 0 ? 0 : null;
}

/** True when the point lies outside the collider's footprint. */
export function outside(c: Collider, x: number, z: number): boolean {
  return (c.x - x) ** 2 + (c.z - z) ** 2 > c.r * c.r;
}
