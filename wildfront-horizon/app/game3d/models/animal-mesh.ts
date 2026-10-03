// three.js side of the animal builder: merges blueprint parts into a single
// skinned mesh bound to the blueprint skeleton.

import * as THREE from "three";
import type { AnimalBlueprint, AnimalVariant } from "../blueprints/types.ts";
import { buildAnimalParts, QUALITY_HIGH, type AnimalBuild, type BuildQuality } from "./animal-builder.ts";
import type { GeoPart } from "./geometry.ts";

export function partsToGeometry(parts: GeoPart[], skinned = true): THREE.BufferGeometry {
  let nv = 0, ni = 0;
  for (const p of parts) { nv += p.pos.length / 3; ni += p.idx.length; }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
  const si = skinned ? new Uint16Array(nv * 4) : null, sw = skinned ? new Float32Array(nv * 4) : null;
  const zones = new Uint8Array(nv);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const p of parts) {
    const n = p.pos.length / 3;
    pos.set(p.pos, vo * 3); nrm.set(p.nrm, vo * 3);
    if (p.col.length === p.pos.length) col.set(p.col, vo * 3); else col.fill(0.5, vo * 3, (vo + n) * 3);
    if (si && sw) { si.set(p.skinI, vo * 4); sw.set(p.skinW, vo * 4); }
    zones.set(p.zone, vo);
    for (let i = 0; i < p.idx.length; i++) idx[io + i] = p.idx[i] + vo;
    vo += n; io += p.idx.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  if (si && sw) {
    g.setAttribute("skinIndex", new THREE.BufferAttribute(si, 4));
    g.setAttribute("skinWeight", new THREE.BufferAttribute(sw, 4));
  }
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.userData.zones = zones;
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

let sharedAnimalMaterial: THREE.MeshStandardMaterial | null = null;
export function animalMaterial(): THREE.MeshStandardMaterial {
  if (!sharedAnimalMaterial) {
    sharedAnimalMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0, envMapIntensity: 0.6 });
    sharedAnimalMaterial.name = "wildlife-coat";
  }
  return sharedAnimalMaterial;
}

export interface AnimalObject {
  root: THREE.Group;           // world transform (position / heading / scale)
  mesh: THREE.SkinnedMesh;
  bones: Record<string, THREE.Bone>;
  build: AnimalBuild;
  bp: AnimalBlueprint;
  variant: AnimalVariant;
}

export function createAnimalObject(bp: AnimalBlueprint, variant: AnimalVariant, q: BuildQuality = QUALITY_HIGH, material?: THREE.Material): AnimalObject {
  const build = buildAnimalParts(bp, variant, q);
  const geo = partsToGeometry(build.parts, true);
  const boneObjs: THREE.Bone[] = [];
  const byName: Record<string, THREE.Bone> = {};
  for (const b of build.bones) {
    const bone = new THREE.Bone();
    bone.name = b.name;
    byName[b.name] = bone;
    boneObjs.push(bone);
  }
  for (const b of build.bones) {
    const bone = byName[b.name];
    if (b.parent) {
      const parent = build.bones.find(x => x.name === b.parent)!;
      bone.position.set(b.p[0] - parent.p[0], b.p[1] - parent.p[1], b.p[2] - parent.p[2]);
      byName[b.parent].add(bone);
    } else {
      bone.position.set(b.p[0], b.p[1], b.p[2]);
    }
  }
  const mesh = new THREE.SkinnedMesh(geo, material ?? animalMaterial());
  const rootBone = boneObjs[0];
  mesh.add(rootBone);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(boneObjs));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false; // skinned bounds change with pose; the root group is culled manually by distance
  mesh.name = `${bp.id}-${variant.sex}`;
  const root = new THREE.Group();
  root.name = `animal:${bp.id}`;
  root.add(mesh);
  root.scale.setScalar(build.scale);
  return { root, mesh, bones: byName, build, bp, variant };
}
