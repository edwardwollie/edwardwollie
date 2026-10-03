// Blueprint → three.js object factory used by the tools, the Blueprint Studio,
// the trophy lodge and the book. Game systems use the specialised builders
// directly (instancing, LODs) but always from the same blueprint data.

import * as THREE from "three";
import { WILDLIFE_BY_ID } from "../blueprints/wildlife/index.ts";
import { createAnimalObject } from "./animal-mesh.ts";
import { FLORA_BY_ID } from "../blueprints/flora.ts";
import { buildFlora } from "./flora-builder.ts";
import { GEAR_BY_ID } from "../blueprints/gear.ts";
import { buildAssembly } from "./assembly-builder.ts";
import { STRUCTURES_BY_ID } from "../blueprints/structures.ts";

export interface BuildOpts { sex?: "male" | "female"; age?: number; seed?: number; pose?: string; phase?: number; lod?: "high" | "low" }
export interface BuiltObject { object: THREE.Object3D; box?: THREE.Box3; info?: string; kind: string }

type Factory = (o: BuildOpts) => Promise<BuiltObject> | BuiltObject;
const extra: Record<string, Factory> = {};
export function registerFactory(id: string, f: Factory) { extra[id] = f; }

export async function buildBlueprintObject(id: string, o: BuildOpts = {}): Promise<BuiltObject> {
  const bp = WILDLIFE_BY_ID[id];
  if (bp) {
    const a = createAnimalObject(bp, { sex: o.sex ?? "male", age: o.age ?? 1, seed: o.seed ?? 1, scale: 1 });
    a.root.scale.setScalar(o.sex === "female" ? bp.femaleScale : 1);
    if (o.pose && o.pose !== "rest") {
      const { posePreview } = await import("../sim/animal-anim.ts");
      posePreview(a, o.pose, o.phase ?? 0);
    }
    a.root.updateMatrixWorld(true);
    const b = a.build.bbox;
    const s = a.root.scale.x;
    const box = o.pose && o.pose !== "rest" ? new THREE.Box3().setFromObject(a.root, true) : new THREE.Box3(new THREE.Vector3(b.min[0] * s, b.min[1] * s, b.min[2] * s), new THREE.Vector3(b.max[0] * s, b.max[1] * s, b.max[2] * s));
    const verts = (a.mesh.geometry.getAttribute("position") as THREE.BufferAttribute).count;
    return { object: a.root, box, kind: "wildlife", info: `${verts} verts · headgear ${a.build.headgearScore.toFixed(0)}` };
  }
  const fl = FLORA_BY_ID[id];
  if (fl) {
    const geo = buildFlora(fl, o.seed ?? 1, o.lod === "low" ? 1 : 0);
    const { plainFloraMaterial } = await import("../world/vegetation.ts");
    const mesh = new THREE.Mesh(geo, plainFloraMaterial());
    mesh.castShadow = true;
    const verts = (geo.getAttribute("position") as THREE.BufferAttribute).count;
    return { object: mesh, box: geo.boundingBox!.clone(), kind: "flora", info: `${verts} verts` };
  }
  const gb = GEAR_BY_ID[id] ?? STRUCTURES_BY_ID[id];
  if (gb) {
    const a = buildAssembly(gb, { explode: o.pose === "explode" ? 1 : 0, shadows: true });
    a.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(a.root);
    return { object: a.root, box, kind: gb.category, info: `${gb.prims.length} parts` };
  }
  const f = extra[id];
  if (f) return await f(o);
  throw new Error(`No blueprint factory for ${id}`);
}
