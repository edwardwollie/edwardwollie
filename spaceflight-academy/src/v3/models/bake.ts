import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Merges every static mesh under `root` into one mesh per material (huge draw-call
 * savings on phones). Subtrees for which `keep(node)` returns true (animated
 * joints, labels...) are left untouched.
 */
export function bakeStatic(root: THREE.Object3D, keep: (node: THREE.Object3D) => boolean = (n) => !!n.userData.keep) {
  root.updateWorldMatrix(true, true);
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<THREE.Material, { geometries: THREE.BufferGeometry[]; cast: boolean; receive: boolean }>();
  const remove: THREE.Mesh[] = [];
  const visit = (node: THREE.Object3D) => {
    if (node !== root && keep(node)) return;
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh && !Array.isArray(mesh.material) && mesh.visible && !(mesh as THREE.Mesh & { isInstancedMesh?: boolean }).isInstancedMesh) {
      const material = mesh.material as THREE.Material;
      if (!material.userData.label && !mesh.userData.fx) {
        let geometry = mesh.geometry.clone();
        const transform = new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
        geometry.applyMatrix4(transform);
        for (const name of Object.keys(geometry.attributes)) if (!["position", "normal", "uv"].includes(name)) geometry.deleteAttribute(name);
        if (!geometry.attributes.uv) geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
        if (!geometry.index) geometry = mergeVertices(geometry);
        // Mirrored parts (negative scale) need their triangle winding flipped once baked.
        if (transform.determinant() < 0 && geometry.index) {
          const index = geometry.index;
          for (let i = 0; i < index.count; i += 3) {
            const b = index.getX(i + 1);
            index.setX(i + 1, index.getX(i + 2));
            index.setX(i + 2, b);
          }
        }
        geometry.clearGroups();
        const bucket = buckets.get(material) ?? { geometries: [], cast: false, receive: false };
        bucket.geometries.push(geometry);
        bucket.cast ||= mesh.castShadow;
        bucket.receive ||= mesh.receiveShadow;
        buckets.set(material, bucket);
        remove.push(mesh);
      }
    }
    for (const child of [...node.children]) visit(child);
  };
  visit(root);
  for (const mesh of remove) mesh.parent?.remove(mesh);
  const merged = new THREE.Group();
  merged.name = "baked";
  for (const [material, bucket] of buckets) {
    const geometry = mergeGeometries(bucket.geometries, false);
    for (const g of bucket.geometries) g.dispose();
    if (!geometry) continue;
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = bucket.cast;
    mesh.receiveShadow = bucket.receive;
    merged.add(mesh);
  }
  root.add(merged);
  pruneEmpty(root, keep);
  return root;
}

function pruneEmpty(node: THREE.Object3D, keep: (node: THREE.Object3D) => boolean) {
  for (const child of [...node.children]) {
    if (keep(child)) continue;
    pruneEmpty(child, keep);
    if (!(child as THREE.Mesh).isMesh && child.children.length === 0 && child.name !== "baked") node.remove(child);
  }
}

/** Turns a (baked) template into instanced meshes placed at each transform. */
export function instance(template: THREE.Object3D, transforms: THREE.Matrix4[]) {
  template.updateWorldMatrix(true, true);
  const group = new THREE.Group();
  const inverse = new THREE.Matrix4().copy(template.matrixWorld).invert();
  template.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const local = new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
    const inst = new THREE.InstancedMesh(mesh.geometry, mesh.material, transforms.length);
    transforms.forEach((m, i) => inst.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(m, local)));
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = mesh.castShadow;
    inst.receiveShadow = mesh.receiveShadow;
    inst.computeBoundingSphere();
    group.add(inst);
  });
  return group;
}

/** Marks every joint node of a built model so `bakeStatic` keeps it animatable. */
export function keepJoints(joints: Map<string, THREE.Object3D>) {
  for (const node of joints.values()) node.userData.keep = true;
}
