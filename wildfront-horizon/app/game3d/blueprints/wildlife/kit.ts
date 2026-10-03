// Shorthand for authoring loft stations from the side elevation.
import type { LoftKey, Zone } from "../types.ts";

/** Torso station from the dorsal (top) and ventral (bottom) lines at z. */
export function T(z: number, top: number, bot: number, w: number, a: number, bone: string, zone: Zone = "torso", n?: number): LoftKey {
  return { p: [z, (top + bot) / 2], up: (top - bot) / 2, dn: (top - bot) / 2, w, a, bone, zone, n };
}
/** Tilted station (neck, head, tail) from centre point, dorsal/ventral half-heights and tilt angle. */
export function S(z: number, y: number, up: number, dn: number, w: number, a: number, bone: string, zone: Zone, n?: number): LoftKey {
  return { p: [z, y], up, dn, w, a, bone, zone, n };
}
