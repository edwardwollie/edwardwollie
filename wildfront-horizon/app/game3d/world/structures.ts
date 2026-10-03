// Places the reserve's landmarks (S/V-series blueprints) on the terrain and
// returns colliders, climbable perches and walkable bridge decks.

import * as THREE from "three";
import { STRUCTURES_BY_ID } from "../blueprints/structures.ts";
import type { Landmark } from "../blueprints/reserves.ts";
import { buildAssembly } from "../models/assembly-builder.ts";
import { patchWorldFog } from "../render/atmosphere.ts";
import { heightAt } from "./terrain-gen.ts";
import type { Collider } from "./colliders.ts";
import type { World } from "./world.ts";
import type { Perch } from "../hunt/player.ts";

export interface Deck { x: number; z: number; rot: number; halfW: number; halfL: number; y: number }

const KIND_TO_BP: Record<Landmark["kind"], string> = {
  "lookout-tower": "lookout-tower", "tree-stand": "tree-stand", "ground-blind": "ground-blind", cabin: "cabin", kiosk: "kiosk", truck: "truck", footbridge: "footbridge", fence: "fence", "ranger-station": "ranger-station",
};

function rotXZ(x: number, z: number, rot: number): [number, number] {
  const c = Math.cos(rot), s = Math.sin(rot);
  return [x * c + z * s, -x * s + z * c];
}

export function buildLandmarks(world: World): { group: THREE.Group; perches: Perch[]; colliders: Collider[]; decks: Deck[] } {
  const group = new THREE.Group();
  group.name = "landmarks";
  const t = world.terrain;
  const perches: Perch[] = [];
  const colliders: Collider[] = [];
  const decks: Deck[] = [];
  const cache = new Map<string, THREE.Group>();
  let id = 100000;
  const shadows = world.quality.shadows;
  for (const lm of world.def.landmarks) {
    const bpId = KIND_TO_BP[lm.kind];
    const bp = STRUCTURES_BY_ID[bpId];
    if (!bp) continue;
    let proto = cache.get(bpId);
    if (!proto) {
      const a = buildAssembly(bp, { shadows });
      a.meshes.forEach(m => { const mat = (m.material as THREE.MeshStandardMaterial).clone(); m.material = patchWorldFog(mat); });
      proto = a.root; cache.set(bpId, proto);
    }
    const obj = proto.clone();
    let x = lm.x, z = lm.z, rot = lm.rot;
    // bridges: orient across the nearest river and sit above the banks
    if (lm.kind === "footbridge") {
      let best = Infinity, bx = x, bz = z, ang = rot;
      for (const rv of t.rivers) for (let i = 0; i < rv.pts.length - 1; i++) {
        const a = rv.pts[i], b = rv.pts[i + 1];
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        const d = Math.hypot(mx - lm.x, mz - lm.z);
        if (d < best) { best = d; bx = mx; bz = mz; ang = Math.atan2(b[0] - a[0], b[1] - a[1]) + Math.PI / 2; }
      }
      x = bx; z = bz; rot = ang;
      const e1 = rotXZ(0, 13, rot), e2 = rotXZ(0, -13, rot);
      const y = Math.max(heightAt(t, x + e1[0], z + e1[1]), heightAt(t, x + e2[0], z + e2[1])) + 0.05;
      obj.position.set(x, y, z);
      decks.push({ x, z, rot, halfW: 0.85, halfL: 13, y: y + 0.32 });
    } else {
      // seat on the lowest point of the footprint so nothing floats
      const r = Math.max(bp.overall.length, bp.overall.width) * 0.45;
      let y = Infinity;
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; y = Math.min(y, heightAt(t, x + Math.cos(a) * r, z + Math.sin(a) * r)); }
      y = Math.min(y, heightAt(t, x, z));
      obj.position.set(x, y, z);
    }
    obj.rotation.y = rot;
    obj.name = `landmark:${lm.kind}`;
    group.add(obj);
    const gy = obj.position.y;
    const W = (lx: number, lz: number): [number, number] => { const [rx, rz] = rotXZ(lx, lz, rot); return [x + rx, z + rz]; };
    const add = (lx: number, lz: number, r: number, h: number, kind: Collider["kind"] = "structure") => { const [cx, cz] = W(lx, lz); colliders.push({ x: cx, z: cz, r, y0: gy - 1, h, kind, id: id++ }); };
    // climbable structures: where the hunter stands or sits comes from the blueprint
    const ps = bp.perch;
    if (ps) {
      const [px, pz] = W(ps.at[0], ps.at[1]), [ex, ez] = W(ps.exit[0], ps.exit[1]);
      const name = ps.kind === "tower" ? lm.name ?? "Lookout" : ps.kind === "stand" ? "Tripod stand" : "Ground blind";
      perches.push({ x: px, z: pz, y: gy + ps.floor, r: ps.roam, name, exitX: ex, exitZ: ez, kind: ps.kind, eye: ps.eye, scent: ps.scent, rot });
    }
    switch (lm.kind) {
      case "lookout-tower":
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(sx * 2.3, sz * 2.3, 0.28, 13);
        break;
      case "tree-stand":
        for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + 0.3; add(Math.cos(a) * 1.65, Math.sin(a) * 1.65, 0.15, 5); }
        break;
      case "ground-blind":
        add(0, 0, 1.15, 2.1);
        break;
      case "cabin": case "ranger-station": {
        const w = lm.kind === "cabin" ? 5.4 : 7.5, d = lm.kind === "cabin" ? 4.2 : 5.5;
        const n = Math.ceil(w / d) + 1;
        for (let i = 0; i < n; i++) add(-w / 2 + d / 2 + (i * (w - d)) / Math.max(1, n - 1), 0, d / 2 + 0.25, 5);
        break;
      }
      case "kiosk": add(-1.1, 0, 0.15, 2.6); add(1.1, 0, 0.15, 2.6); break;
      case "truck": add(0, 1.7, 1.0, 2); add(0, 0, 1.0, 2); add(0, -1.7, 1.0, 2); break;
      case "fence": for (let i = 0; i < 6; i++) add(0, -7.5 + i * 3, 0.14, 1.3); break;
      case "footbridge": break;
    }
  }
  world.decks = decks;
  return { group, perches, colliders, decks };
}

/** Walkable deck height at (x,z) or null. */
export function deckHeightAt(decks: Deck[], x: number, z: number): number | null {
  for (const d of decks) {
    const dx = x - d.x, dz = z - d.z;
    const c = Math.cos(d.rot), s = Math.sin(d.rot);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) <= d.halfW + 0.2 && Math.abs(lz) <= d.halfL + 0.4) return d.y;
  }
  return null;
}
