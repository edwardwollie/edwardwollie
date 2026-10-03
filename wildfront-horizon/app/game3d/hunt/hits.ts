// Bullet vs. wildlife: broad phase on bounding spheres, exact raycast against
// the posed (skinned) mesh — what you see is what you hit — then the bullet
// path is traced through the blueprint's organ ellipsoids, which ride on their
// bones, to decide the v2.0.3 grade.

import * as THREE from "three";
import type { OrganId, Zone } from "../blueprints/types.ts";
import { ZONE_BY_ID } from "../blueprints/types.ts";
import type { Animal } from "./animals.ts";

export interface HitResult {
  animal: Animal;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  t: number;                 // fraction along the tested segment
  zone: Zone;
  organs: OrganId[];
  inVital: boolean;
  /** contact point in the animal's model (rest) space — for the shot analysis card */
  local: THREE.Vector3;
  /** bullet direction in model space */
  localDir: THREE.Vector3;
}

const ray = new THREE.Raycaster();
const tmpInv = new THREE.Matrix4();
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();

function segDistToPoint(a: THREE.Vector3, b: THREE.Vector3, p: THREE.Vector3): number {
  const ab = v1.copy(b).sub(a), ap = v2.copy(p).sub(a);
  const t = Math.max(0, Math.min(1, ap.dot(ab) / Math.max(1e-9, ab.lengthSq())));
  return v3.copy(a).addScaledVector(ab, t).distanceTo(p);
}

/** Ray (origin o, unit dir d) vs ellipsoid (centre c, radii r) in the same frame. Returns entry/exit t or null. */
export function rayEllipsoid(o: THREE.Vector3, d: THREE.Vector3, c: THREE.Vector3, r: THREE.Vector3): [number, number] | null {
  const ox = (o.x - c.x) / r.x, oy = (o.y - c.y) / r.y, oz = (o.z - c.z) / r.z;
  const dx = d.x / r.x, dy = d.y / r.y, dz = d.z / r.z;
  const A = dx * dx + dy * dy + dz * dz, B = 2 * (ox * dx + oy * dy + oz * dz), C = ox * ox + oy * oy + oz * oz - 1;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  return [(-B - s) / (2 * A), (-B + s) / (2 * A)];
}

export function testSegment(a: THREE.Vector3, b: THREE.Vector3, animals: Animal[]): HitResult | null {
  const len = a.distanceTo(b);
  if (len < 1e-6) return null;
  const dir = new THREE.Vector3().subVectors(b, a).divideScalar(len);
  let best: HitResult | null = null;
  for (const an of animals) {
    const c = an.center(new THREE.Vector3());
    if (segDistToPoint(a, b, c) > an.radius * 1.15 + 0.3) continue;
    const mesh = an.obj.mesh;
    an.obj.root.updateMatrixWorld(true);
    mesh.computeBoundingSphere();
    ray.set(a, dir);
    ray.near = 0; ray.far = len;
    const hits = ray.intersectObject(mesh, false);
    if (!hits.length) continue;
    const h = hits[0];
    if (best && h.distance / len >= best.t) continue;
    const zones = mesh.geometry.userData.zones as Uint8Array;
    const zone = ZONE_BY_ID[zones[h.face!.a]] ?? "torso";
    // organs along the path through the body (up to 1.8 m beyond the entry)
    const organs: OrganId[] = [];
    for (const org of an.bp.organs) {
      const bone = an.obj.bones[org.bone];
      if (!bone) continue;
      const rest = an.obj.build.bones.find(x => x.name === org.bone)!;
      tmpInv.copy(bone.matrixWorld).invert();
      const lo = h.point.clone().applyMatrix4(tmpInv);
      const ld = dir.clone().transformDirection(tmpInv);
      // transformDirection normalises; recover the metric scale of the local frame
      const lc = new THREE.Vector3(org.c[0] - rest.p[0], org.c[1] - rest.p[1], org.c[2] - rest.p[2]);
      const hit = rayEllipsoid(lo, ld, lc, new THREE.Vector3(...org.r));
      if (hit && hit[1] > -0.05 && hit[0] < 1.8 / an.scale) organs.push(org.id);
    }
    // GREAT region (upper torso / shoulder) contact test
    const vr = an.bp.vitalRegion;
    const vb = an.obj.bones[vr.bone];
    const vrest = an.obj.build.bones.find(x => x.name === vr.bone)!;
    tmpInv.copy(vb.matrixWorld).invert();
    const lp = h.point.clone().applyMatrix4(tmpInv);
    const q = new THREE.Vector3((lp.x - (vr.c[0] - vrest.p[0])) / vr.r[0], (lp.y - (vr.c[1] - vrest.p[1])) / vr.r[1], (lp.z - (vr.c[2] - vrest.p[2])) / vr.r[2]);
    const inVital = q.length() <= 1;
    // model-space (rest pose) contact for the analysis card: the hit triangle's bind-pose
    // corners weighted by the barycentric coordinates of the posed hit, so the card shows
    // exactly where the bullet entered the body even mid-stride. The direction is taken
    // into the frame of the bone that dominates that vertex (bones carry no rest rotation).
    let local: THREE.Vector3, localDir: THREE.Vector3;
    const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    const bc = (h as THREE.Intersection & { barycoord?: THREE.Vector3 }).barycoord;
    if (h.face && bc) {
      local = new THREE.Vector3().fromBufferAttribute(pos, h.face.a).multiplyScalar(bc.x)
        .addScaledVector(new THREE.Vector3().fromBufferAttribute(pos, h.face.b), bc.y)
        .addScaledVector(new THREE.Vector3().fromBufferAttribute(pos, h.face.c), bc.z);
      const si = mesh.geometry.getAttribute("skinIndex") as THREE.BufferAttribute | undefined;
      const sw = mesh.geometry.getAttribute("skinWeight") as THREE.BufferAttribute | undefined;
      let bone = an.obj.root as THREE.Object3D;
      if (si && sw) {
        let best = -1, bi = 0;
        for (let k = 0; k < 4; k++) { const w = sw.getComponent(h.face.a, k); if (w > best) { best = w; bi = si.getComponent(h.face.a, k); } }
        bone = mesh.skeleton.bones[bi] ?? bone;
      }
      tmpInv.copy(bone.matrixWorld).invert();
      localDir = dir.clone().transformDirection(tmpInv);
    } else {
      tmpInv.copy(an.obj.root.matrixWorld).invert();
      local = h.point.clone().applyMatrix4(tmpInv);
      localDir = dir.clone().transformDirection(tmpInv);
    }
    best = { animal: an, point: h.point.clone(), normal: h.face ? h.face.normal.clone() : dir.clone().negate(), t: h.distance / len, zone, organs, inVital, local, localDir };
  }
  return best;
}
