// Reference-build measurements for every blueprint (Node-safe: no DOM / WebGL).
import * as THREE from "three";
import { WILDLIFE } from "../../app/game3d/blueprints/wildlife/index.ts";
import { GEAR } from "../../app/game3d/blueprints/gear.ts";
import { STRUCTURES } from "../../app/game3d/blueprints/structures.ts";
import { FLORA } from "../../app/game3d/blueprints/flora.ts";
import { buildAnimalParts } from "../../app/game3d/models/animal-builder.ts";
import { buildAssembly } from "../../app/game3d/models/assembly-builder.ts";
import { buildFlora } from "../../app/game3d/models/flora-builder.ts";

export interface Measured { id: string; length: number; width: number; height: number }

export function measureAll(): Measured[] {
  const out: Measured[] = [];
  for (const bp of WILDLIFE) {
    const b = buildAnimalParts(bp, { sex: "male", age: 1, seed: 1, scale: 1 });
    const s = b.scale;
    out.push({ id: bp.id, length: (b.bbox.max[2] - b.bbox.min[2]) * s, width: (b.bbox.max[0] - b.bbox.min[0]) * s, height: (b.bbox.max[1] - Math.min(0, b.bbox.min[1])) * s });
  }
  for (const a of [...GEAR, ...STRUCTURES]) {
    const built = buildAssembly(a, {});
    built.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(built.root);
    const sz = box.getSize(new THREE.Vector3());
    out.push({ id: a.id, length: sz.z, width: sz.x, height: sz.y });
    built.root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
  }
  for (const f of FLORA) {
    const g = buildFlora(f, 1, 0);
    g.computeBoundingBox();
    const sz = g.boundingBox!.getSize(new THREE.Vector3());
    out.push({ id: f.id, length: sz.z, width: sz.x, height: g.boundingBox!.max.y });
    g.dispose();
  }
  return out;
}
