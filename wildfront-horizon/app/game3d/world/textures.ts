// Procedural, tileable detail textures (generated once at load — no image
// assets). Values are luminance-ish multipliers centred on 0.5.

import * as THREE from "three";
import { mulberry32 } from "../core/rng.ts";

function makeLattice(period: number, seed: number): Float32Array {
  const r = mulberry32(seed);
  const a = new Float32Array(period * period);
  for (let i = 0; i < a.length; i++) a[i] = r();
  return a;
}
function pnoise(lat: Float32Array, period: number, x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const tx = x - xi, ty = y - yi;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const i0 = ((xi % period) + period) % period, j0 = ((yi % period) + period) % period;
  const i1 = (i0 + 1) % period, j1 = (j0 + 1) % period;
  const a = lat[j0 * period + i0], b = lat[j0 * period + i1], c = lat[j1 * period + i0], d = lat[j1 * period + i1];
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
}
function pfbm(lats: Float32Array[], base: number, x: number, y: number, oct: number, gain = 0.5): number {
  let s = 0, a = 1, n = 0, p = base;
  for (let o = 0; o < oct; o++) { s += a * pnoise(lats[o], p, x * (p / base), y * (p / base)); n += a; a *= gain; p *= 2; }
  return s / n;
}

function toTexture(data: Uint8Array, size: number, name: string): THREE.DataTexture {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.name = name;
  t.needsUpdate = true;
  return t;
}

export interface DetailTextures { grass: THREE.DataTexture; dirt: THREE.DataTexture; rock: THREE.DataTexture }

let cache: DetailTextures | null = null;
export function detailTextures(size = 256): DetailTextures {
  if (cache) return cache;
  const base = 8;
  const L = (seed: number) => [0, 1, 2, 3, 4, 5].map(o => makeLattice(base << o, seed + o));
  const lg = L(11), ld = L(29), lr = L(47), lb = L(83);
  const grass = new Uint8Array(size * size * 4), dirt = new Uint8Array(size * size * 4), rock = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x / size) * base, v = (y / size) * base, k = (y * size + x) * 4;
    // grass: fine blades (anisotropic) + clumps; G channel carries a dry-tip mask
    const blades = pfbm(lg, base, u * 1.0, v * 4.0, 6, 0.62);
    const clump = pfbm(lb, base, u, v, 3);
    const g = 0.36 + 0.42 * blades + 0.22 * clump;
    grass[k] = grass[k + 1] = grass[k + 2] = Math.max(0, Math.min(255, g * 230));
    grass[k + 3] = Math.min(255, Math.max(0, (pfbm(ld, base, u * 2, v * 2, 3) - 0.35) * 600));
    // dirt: pebbles (thresholded noise) + grain
    const peb = pfbm(ld, base, u * 2.2, v * 2.2, 4);
    const grain = pfbm(lr, base, u * 8 % base, v * 8 % base, 2);
    const d = 0.42 + 0.25 * grain + (peb > 0.62 ? 0.22 : 0) - (peb < 0.3 ? 0.12 : 0);
    dirt[k] = dirt[k + 1] = dirt[k + 2] = Math.max(0, Math.min(255, d * 235));
    dirt[k + 3] = 255;
    // rock: strata streaks + cracks
    const strata = Math.sin((v * 3.1 + pfbm(lr, base, u, v, 4) * 4.5) * Math.PI) * 0.5 + 0.5;
    const crack = Math.abs(pfbm(lb, base, u * 1.5, v * 1.5, 5) - 0.5);
    const r = 0.38 + 0.22 * strata + 0.3 * pfbm(lg, base, u * 2, v * 2, 5) - (crack < 0.03 ? 0.25 : 0);
    rock[k] = rock[k + 1] = rock[k + 2] = Math.max(0, Math.min(255, r * 235));
    rock[k + 3] = 255;
    void g; void d; void r;
  }
  cache = { grass: toTexture(grass, size, "grass-detail"), dirt: toTexture(dirt, size, "dirt-detail"), rock: toTexture(rock, size, "rock-detail") };
  return cache;
}

/** Soft round sprite (particles, impact puffs, fireflies). */
let spriteTex: THREE.DataTexture | null = null;
export function softSprite(): THREE.DataTexture {
  if (spriteTex) return spriteTex;
  const s = 64, d = new Uint8Array(s * s * 4);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = (x + 0.5) / s * 2 - 1, dy = (y + 0.5) / s * 2 - 1;
    const r = Math.sqrt(dx * dx + dy * dy);
    const a = Math.max(0, 1 - r); const k = (y * s + x) * 4;
    d[k] = d[k + 1] = d[k + 2] = 255; d[k + 3] = Math.round(255 * a * a);
  }
  spriteTex = new THREE.DataTexture(d, s, s, THREE.RGBAFormat);
  spriteTex.needsUpdate = true;
  spriteTex.magFilter = THREE.LinearFilter; spriteTex.minFilter = THREE.LinearFilter;
  return spriteTex;
}

/**
 * Foliage atlas (512²): Q0 broadleaf cluster, Q1 needle tufts, Q2 small round
 * leaves, Q3 solid white (opaque parts sample here). Greyscale luminance in RGB,
 * coverage in alpha. UV quadrant origins: Q0 (0,0.5) Q1 (0.5,0.5) Q2 (0,0) Q3 (0.5,0).
 */
let leafTex: THREE.Texture | null = null;
export function foliageAtlas(): THREE.Texture {
  if (leafTex) return leafTex;
  const S = 512, Q = 256;
  const c = document.createElement("canvas");
  c.width = S; c.height = S;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, S, S);
  const r = mulberry32(4242);
  const shade = () => { const v = Math.floor(150 + r() * 105); return `rgb(${v},${v},${v})`; };
  // Q0 (top-left in canvas = v 0.5..1): broad leaves
  const leafAt = (ox: number, oy: number, n: number, len: number, wid: number, spread: number) => {
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * spread;
      const x = ox + Q / 2 + Math.cos(a) * d, y = oy + Q / 2 + Math.sin(a) * d;
      g.save(); g.translate(x, y); g.rotate(r() * Math.PI * 2);
      g.fillStyle = shade();
      g.beginPath(); g.ellipse(0, 0, len * (0.7 + r() * 0.5), wid * (0.7 + r() * 0.5), 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "rgba(60,60,60,0.5)"; g.lineWidth = 1; g.beginPath(); g.moveTo(-len, 0); g.lineTo(len, 0); g.stroke();
      g.restore();
    }
  };
  leafAt(0, 0, 70, 16, 8, 100);
  // Q1: needle tufts
  for (let t = 0; t < 26; t++) {
    const a0 = r() * Math.PI * 2, d0 = Math.sqrt(r()) * 82;
    const cx = Q + Q / 2 + Math.cos(a0) * d0, cy = Q / 2 + Math.sin(a0) * d0;
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, l = 14 + r() * 22;
      g.strokeStyle = shade(); g.lineWidth = 1.6 + r();
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l); g.stroke();
    }
  }
  // Q2 (bottom-left in canvas = v 0..0.5): small round leaves
  leafAt(0, Q, 120, 9, 7, 104);
  // Q3: solid
  g.fillStyle = "#ffffff"; g.fillRect(Q, Q, Q, Q);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.flipY = true;
  leafTex = tex;
  return tex;
}
