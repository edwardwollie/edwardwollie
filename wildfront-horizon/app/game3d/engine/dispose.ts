// Frees GPU resources held by a scene graph: geometries, materials and every
// texture they reference (including ShaderMaterial uniforms). Shared objects
// are safe to dispose — three.js re-uploads them if they are used again.

import * as THREE from "three";

function disposeMaterial(m: THREE.Material, seen: Set<unknown>) {
  if (m.userData?.shared) return;
  if (seen.has(m)) return;
  seen.add(m);
  for (const v of Object.values(m as unknown as Record<string, unknown>)) {
    if (v && (v as THREE.Texture).isTexture && !seen.has(v)) { seen.add(v); (v as THREE.Texture).dispose(); }
  }
  const u = (m as THREE.ShaderMaterial).uniforms;
  if (u) for (const k of Object.keys(u)) {
    const val = u[k]?.value as THREE.Texture | undefined;
    if (val && val.isTexture && !seen.has(val)) { seen.add(val); val.dispose(); }
  }
  m.dispose();
}

/** `keep`: textures / materials that are shared app-wide (e.g. the environment map). */
export function disposeObject(root: THREE.Object3D, keep: unknown[] = []) {
  const seen = new Set<unknown>(keep.filter(Boolean));
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry && !seen.has(mesh.geometry)) { seen.add(mesh.geometry); mesh.geometry.dispose(); }
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (mat) for (const m of Array.isArray(mat) ? mat : [mat]) disposeMaterial(m, seen);
    const sk = (o as THREE.SkinnedMesh).skeleton;
    if (sk) sk.dispose();
  });
  const s = root as THREE.Scene;
  if (s.background && (s.background as THREE.Texture).isTexture) (s.background as THREE.Texture).dispose();
  if (s.environment) s.environment.dispose();
}
