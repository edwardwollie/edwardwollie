import type { RGB } from "../blueprints/types.ts";
/** "#rrggbb" → sRGB triple 0..1 */
export function hex(h: string): RGB {
  const v = parseInt(h.replace("#", ""), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}
export function toHex(c: RGB): string {
  return "#" + c.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");
}
export function mix(a: RGB, b: RGB, t: number): RGB { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
export function shade(a: RGB, k: number): RGB { return [a[0] * k, a[1] * k, a[2] * k]; }
