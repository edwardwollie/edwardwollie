import * as THREE from "three";
import spec from "./blueprint-spec.json";

/**
 * Builds three.js meshes straight from blueprint-spec.json, the same arrays the
 * offline blueprint renderer projects. Smooth parts use indexed geometry with
 * computeVertexNormals(); flat parts are un-welded first, matching
 * blueprints/mesh_geometry.py:vertex_normals.
 */

type MaterialSpec = {
  color: string;
  emissive: number;
  metalness: number;
  roughness: number;
  opacity?: number;
  clearcoat?: number;
};

type PartSpec = {
  name: string;
  material: string;
  flat: boolean;
  positions: number[];
  indices: number[];
};

type AssetSpec = {
  title: string;
  kind: string;
  notes: string;
  materials: Record<string, MaterialSpec>;
  bounds: { min: number[]; max: number[] };
  parts: PartSpec[];
};

export type BlueprintAssetId =
  | "pulse"
  | "vortex"
  | "solar"
  | "prism"
  | "barrier"
  | "mine"
  | "drone"
  | "coin"
  | "nitro"
  | "repair"
  | "boostPad"
  | "gate";

export const BLUEPRINT_VERSION: string = (spec as { version: string }).version;
const ASSETS = (spec as unknown as { assets: Record<string, AssetSpec> }).assets;

export function blueprintAsset(id: BlueprintAssetId): AssetSpec {
  return ASSETS[id];
}

export function blueprintBounds(id: BlueprintAssetId): THREE.Box3 {
  const b = ASSETS[id].bounds;
  return new THREE.Box3(
    new THREE.Vector3(b.min[0], b.min[1], b.min[2]),
    new THREE.Vector3(b.max[0], b.max[1], b.max[2]),
  );
}

/** One merged BufferGeometry per material, cached for every instance. */
const geometryCache = new Map<string, Map<string, THREE.BufferGeometry>>();

export function partGeometry(part: PartSpec): THREE.BufferGeometry {
  let geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(part.positions, 3),
  );
  geometry.setIndex(part.indices);
  if (part.flat) {
    const unwelded = geometry.toNonIndexed();
    geometry.dispose();
    geometry = unwelded;
  }
  geometry.computeVertexNormals();
  return geometry;
}

function mergeGeometries(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let total = 0;
  for (const g of list) total += g.getAttribute("position").count;
  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  const indices: number[] = [];
  let offset = 0;
  for (const g of list) {
    const position = g.getAttribute("position");
    const normal = g.getAttribute("normal");
    positions.set(position.array as Float32Array, offset * 3);
    normals.set(normal.array as Float32Array, offset * 3);
    const index = g.getIndex();
    if (index) {
      for (let i = 0; i < index.count; i += 1) indices.push(index.getX(i) + offset);
    } else {
      for (let i = 0; i < position.count; i += 1) indices.push(i + offset);
    }
    offset += position.count;
    g.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  merged.setIndex(indices);
  merged.computeBoundingSphere();
  return merged;
}

export function assetGeometries(
  id: BlueprintAssetId,
): Map<string, THREE.BufferGeometry> {
  const cached = geometryCache.get(id);
  if (cached) return cached;
  const byMaterial = new Map<string, THREE.BufferGeometry[]>();
  for (const part of ASSETS[id].parts) {
    const list = byMaterial.get(part.material) ?? [];
    list.push(partGeometry(part));
    byMaterial.set(part.material, list);
  }
  const merged = new Map<string, THREE.BufferGeometry>();
  for (const [material, list] of byMaterial) {
    merged.set(material, mergeGeometries(list));
  }
  geometryCache.set(id, merged);
  return merged;
}

export type PaintOverride = { primary?: number; secondary?: number };

const materialCache = new Map<string, THREE.Material>();

export function blueprintMaterial(
  id: BlueprintAssetId,
  key: string,
  paint: PaintOverride = {},
  envIntensity = 1,
): THREE.Material {
  const m = ASSETS[id].materials[key];
  let color = new THREE.Color(m.color);
  if ((key === "paint" || key === "under") && paint.primary !== undefined) {
    color = new THREE.Color(paint.primary);
  }
  if ((key === "glow" || key === "thrust") && paint.secondary !== undefined) {
    color = new THREE.Color(paint.secondary);
  }
  const cacheKey = `${id}:${key}:${color.getHexString()}:${envIntensity}`;
  const cached = materialCache.get(cacheKey);
  if (cached) return cached;

  let material: THREE.Material;
  if (m.emissive >= 1.5) {
    // Light sources: unlit so they always bloom, regardless of scene lights.
    material = new THREE.MeshBasicMaterial({
      color: color.clone().multiplyScalar(Math.min(1.7, 0.5 + m.emissive * 0.24)),
      toneMapped: false,
    });
  } else if (m.clearcoat) {
    material = new THREE.MeshPhysicalMaterial({
      color,
      metalness: m.metalness,
      roughness: m.roughness,
      clearcoat: m.clearcoat,
      clearcoatRoughness: 0.08,
      emissive: color.clone().multiplyScalar(m.emissive),
      envMapIntensity: envIntensity * 1.3,
    });
  } else {
    material = new THREE.MeshStandardMaterial({
      color,
      metalness: m.metalness,
      roughness: m.roughness,
      emissive: color.clone().multiplyScalar(m.emissive),
      transparent: m.opacity !== undefined,
      opacity: m.opacity ?? 1,
      envMapIntensity: envIntensity,
    });
  }
  material.userData.shared = true;
  materialCache.set(cacheKey, material);
  return material;
}

/** A ready-to-place group for one blueprint asset (faces +Z, road at Y = 0). */
export function createBlueprintModel(
  id: BlueprintAssetId,
  paint: PaintOverride = {},
  options: { castShadow?: boolean } = {},
): THREE.Group {
  const group = new THREE.Group();
  group.name = id;
  for (const [key, geometry] of assetGeometries(id)) {
    const mesh = new THREE.Mesh(geometry, blueprintMaterial(id, key, paint));
    mesh.name = key;
    mesh.castShadow = Boolean(options.castShadow) && key !== "glass";
    mesh.userData.shared = true;
    group.add(mesh);
  }
  return group;
}

/** Thruster exhaust anchor points (model space) for flame effects. */
export function thrusterAnchors(id: BlueprintAssetId): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (const part of ASSETS[id].parts) {
    if (part.material !== "thrust") continue;
    const p = part.positions;
    let x = 0;
    let y = 0;
    let z = Infinity;
    let n = 0;
    for (let i = 0; i < p.length; i += 3) {
      x += p[i];
      y += p[i + 1];
      z = Math.min(z, p[i + 2]);
      n += 1;
    }
    out.push(new THREE.Vector3(x / n, y / n, z));
  }
  return out;
}
