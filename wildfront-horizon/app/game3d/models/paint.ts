// Coat painter: turns blueprint paint rules into per-vertex colours.
// Rules are evaluated in order over the rest pose, so every individual of a
// species carries the same markings (rump patch, throat patch, mane, socks…)
// with seeded variation in tone and mottling.

import { smoothstep } from "../core/math.ts";
import { Simplex2 } from "../core/noise.ts";
import type { CoatSpec, PaintRule, RGB } from "../blueprints/types.ts";
import { ZONE_BY_ID } from "../blueprints/types.ts";
import type { GeoPart } from "./geometry.ts";

export function srgbToLinear(c: number): number { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

function ruleMask(r: PaintRule, x: number, y: number, z: number, nx: number, ny: number, nz: number, zoneName: string, kind: string): number {
  if ("zones" in r && r.zones && r.kind !== "zone" && !r.zones.includes(zoneName as never)) return 0;
  const soft = ("soft" in r && r.soft !== undefined) ? r.soft : 0.35;
  switch (r.kind) {
    case "ellipsoid": {
      const m = (px: number) => {
        const dx = (px - r.center[0]) / r.radii[0], dy = (y - r.center[1]) / r.radii[1], dz = (z - r.center[2]) / r.radii[2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        return 1 - smoothstep(1 - soft, 1, d);
      };
      return Math.max(m(x), r.mirror ? m(-x) : 0);
    }
    case "ventral": return smoothstep(r.threshold - soft, r.threshold + soft, -ny);
    case "dorsal": return smoothstep(r.threshold - soft, r.threshold + soft, ny);
    case "below": return 1 - smoothstep(r.y - soft, r.y + soft, y);
    case "above": return smoothstep(r.y - soft, r.y + soft, y);
    case "zBand": return smoothstep(r.z0 - soft, r.z0 + soft, z) * (1 - smoothstep(r.z1 - soft, r.z1 + soft, z));
    case "zone": return r.zones.includes(zoneName as never) ? 1 : 0;
    case "inner": return kind === "leg" ? smoothstep(0.15, 0.75, -Math.sign(x || 1) * nx) : 0;
    case "facing": return smoothstep(r.threshold - soft, r.threshold + soft, nx * r.dir[0] + ny * r.dir[1] + nz * r.dir[2]);
  }
  return 0;
}

/** Paint every vertex of a part whose colours are still empty. */
export function paintCoat(part: GeoPart, coat: CoatSpec, seed: number, tint: number) {
  const noise = new Simplex2(seed);
  const noise2 = new Simplex2(seed + 77);
  part.col = new Array(part.pos.length);
  for (let i = 0; i < part.pos.length; i += 3) {
    const x = part.pos[i], y = part.pos[i + 1], z = part.pos[i + 2];
    const nx = part.nrm[i], ny = part.nrm[i + 1], nz = part.nrm[i + 2];
    const zoneName = ZONE_BY_ID[part.zone[i / 3]] ?? "torso";
    let c: RGB = [coat.base[0], coat.base[1], coat.base[2]];
    for (const r of coat.rules) {
      const m = ruleMask(r, x, y, z, nx, ny, nz, zoneName, part.kind) * (r.amount ?? 1);
      if (m <= 0) continue;
      c = [c[0] + (r.color[0] - c[0]) * m, c[1] + (r.color[1] - c[1]) * m, c[2] + (r.color[2] - c[2]) * m];
    }
    // fur mottling: low-frequency patches + fine grain, plus individual tint
    const n1 = noise.noise(x * coat.mottleScale + z * 0.37, y * coat.mottleScale + z * coat.mottleScale * 0.8);
    const n2 = noise2.noise(x * 31 + z * 9, y * 29 - z * 17);
    const k = (1 + coat.mottle * n1 + 0.035 * n2) * tint;
    part.col[i] = srgbToLinear(Math.min(1, Math.max(0, c[0] * k)));
    part.col[i + 1] = srgbToLinear(Math.min(1, Math.max(0, c[1] * k)));
    part.col[i + 2] = srgbToLinear(Math.min(1, Math.max(0, c[2] * k)));
  }
}

/** Solid colour (with optional gradient along a scalar) for hooves, eyes, antlers… */
export function paintSolid(part: GeoPart, color: RGB, color2?: RGB, along?: (x: number, y: number, z: number, vi: number) => number) {
  part.col = new Array(part.pos.length);
  for (let i = 0; i < part.pos.length; i += 3) {
    let c = color;
    if (color2 && along) {
      const t = Math.max(0, Math.min(1, along(part.pos[i], part.pos[i + 1], part.pos[i + 2], i / 3)));
      c = [color[0] + (color2[0] - color[0]) * t, color[1] + (color2[1] - color[1]) * t, color[2] + (color2[2] - color[2]) * t];
    }
    part.col[i] = srgbToLinear(c[0]); part.col[i + 1] = srgbToLinear(c[1]); part.col[i + 2] = srgbToLinear(c[2]);
  }
}

export { hex } from "../core/color.ts";
