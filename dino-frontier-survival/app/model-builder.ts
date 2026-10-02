import { Color3, Mesh, MeshBuilder, Quaternion, Scene, StandardMaterial, TransformNode, Vector3, type Material } from "@babylonjs/core";
import { GLOW, type Blueprint, type MatSlot, type Part } from "./blueprints";

export type Model = {
  root: TransformNode;
  bones: Record<string, TransformNode>;
  meshes: Mesh[];
  /** Socket positions in bone-local space. */
  sockets: Record<string, { bone: TransformNode; local: Vector3 }>;
};

export type BuildOptions = {
  name?: string;
  palette?: Partial<Record<MatSlot, string>>;
  /** Merge all parts that share a bone and material into one mesh (fewer draw calls). */
  merge?: boolean;
  /** Supply materials yourself (e.g. the blueprint viewer's line material). */
  material?: (slot: MatSlot, hex: string) => Material;
};

const FALLBACK: Record<MatSlot, string> = { skin: "#557766", belly: "#ccddcc", dark: "#1a2420", glow: "#61ff9a", eye: "#ffe45b", claw: "#eeeeee", accent: "#35e8ff", armor: "#0ea5b5", suit: "#101a1d", visor: "#ffa52e", metal: "#2a3a40" };

/** Shared StandardMaterial per (slot, colour) so dozens of dinosaurs reuse a handful of materials. */
export function slotMaterial(scene: Scene, slot: MatSlot, hex: string): StandardMaterial {
  const cache = ((scene.metadata ??= {}).slotMaterials ??= new Map<string, StandardMaterial>()) as Map<string, StandardMaterial>;
  const key = `${slot}:${hex}`;
  let m = cache.get(key);
  if (m) return m;
  const color = Color3.FromHexString(hex);
  m = new StandardMaterial(`mat-${key}`, scene);
  m.diffuseColor = color;
  m.emissiveColor = color.scale(GLOW[slot]);
  const shiny = slot === "metal" || slot === "armor" || slot === "visor" || slot === "eye" || slot === "claw";
  m.specularColor = new Color3(1, 1, 1).scale(shiny ? 0.55 : 0.12);
  m.specularPower = shiny ? 48 : 18;
  m.metadata = { glow: GLOW[slot] >= 0.4 };
  cache.set(key, m);
  return m;
}

function primitive(scene: Scene, p: Part, name: string): Mesh {
  const s = p.shape;
  switch (s.kind) {
    case "box": return MeshBuilder.CreateBox(name, { width: s.w, height: s.h, depth: s.d }, scene);
    case "sphere": return MeshBuilder.CreateSphere(name, { diameter: s.d, segments: s.seg ?? 16, slice: s.slice ?? 1 }, scene);
    case "capsule": return MeshBuilder.CreateCapsule(name, { height: Math.max(s.h, 2 * s.r + 0.001), radius: s.r, tessellation: 12, subdivisions: 2 }, scene);
    case "cylinder": return MeshBuilder.CreateCylinder(name, { height: s.h, diameterTop: s.top, diameterBottom: s.bottom, tessellation: s.tess ?? 12 }, scene);
    case "torus": return MeshBuilder.CreateTorus(name, { diameter: s.d, thickness: s.t, tessellation: s.tess ?? 24 }, scene);
    case "poly": return MeshBuilder.CreatePolyhedron(name, { type: s.type, size: s.size }, scene);
  }
}

const UP = new Vector3(0, 1, 0);

/** Place a part in model space (bone pivot subtracted later). */
function placePart(mesh: Mesh, p: Part) {
  if (p.scale) mesh.scaling.set(p.scale[0], p.scale[1], p.scale[2]);
  if (p.axis) {
    const a = Vector3.FromArray(p.axis.a), b = Vector3.FromArray(p.axis.b), dir = b.subtract(a).normalize();
    const q = new Quaternion();
    Quaternion.FromUnitVectorsToRef(UP, dir, q);
    mesh.rotationQuaternion = q;
    mesh.position = a.add(b).scale(0.5);
  } else {
    mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
    if (p.rot) mesh.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
  }
}

/**
 * Build a blueprint into a bone hierarchy of TransformNodes with meshes attached.
 * Bones carry no rest rotation, so animating `bone.rotation` rotates about the joint.
 */
export function buildModel(scene: Scene, bp: Blueprint, opts: BuildOptions = {}): Model {
  const name = opts.name ?? bp.key;
  const palette = { ...FALLBACK, ...bp.palette, ...opts.palette };
  const root = new TransformNode(name, scene);
  const bones: Record<string, TransformNode> = {};
  const pivots: Record<string, Vector3> = {};
  for (const b of bp.bones) {
    const node = b.id === "root" ? root : new TransformNode(`${name}:${b.id}`, scene);
    pivots[b.id] = Vector3.FromArray(b.pivot);
    bones[b.id] = node;
  }
  for (const b of bp.bones) {
    if (b.id === "root" || !b.parent) continue;
    bones[b.id].parent = bones[b.parent];
    bones[b.id].position = pivots[b.id].subtract(pivots[b.parent]);
  }
  const groups = new Map<string, Mesh[]>();
  const meshes: Mesh[] = [];
  for (const p of bp.parts) {
    const mesh = primitive(scene, p, `${name}:${p.id}`);
    placePart(mesh, p);
    mesh.position.subtractInPlace(pivots[p.bone] ?? Vector3.Zero());
    const mat = opts.material ? opts.material(p.mat, palette[p.mat]) : slotMaterial(scene, p.mat, palette[p.mat]);
    mesh.material = mat;
    if (opts.merge) {
      const key = `${p.bone}|${p.mat}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(mesh);
    } else {
      mesh.parent = bones[p.bone] ?? root;
      meshes.push(mesh);
    }
  }
  for (const [key, list] of groups) {
    const [bone] = key.split("|");
    const merged = list.length === 1 ? list[0] : Mesh.MergeMeshes(list, true, true);
    if (!merged) continue;
    merged.name = `${name}:${key}`;
    merged.parent = bones[bone] ?? root;
    meshes.push(merged);
  }
  const sockets: Model["sockets"] = {};
  for (const s of bp.sockets) sockets[s.id] = { bone: bones[s.bone] ?? root, local: Vector3.FromArray(s.pos).subtract(pivots[s.bone] ?? Vector3.Zero()) };
  return { root, bones, meshes, sockets };
}

/** World-space position of a socket. */
export function socketWorld(model: Model, id: string, out = new Vector3()): Vector3 {
  const s = model.sockets[id];
  if (!s) return out.copyFrom(model.root.getAbsolutePosition());
  s.bone.computeWorldMatrix(true);
  return Vector3.TransformCoordinatesToRef(s.local, s.bone.getWorldMatrix(), out);
}

/**
 * Bake a single-bone prop blueprint into one mesh per material, ready for thin instancing.
 * Returns meshes positioned at the origin with identity transforms.
 */
export function buildPropMeshes(scene: Scene, bp: Blueprint, palette?: Partial<Record<MatSlot, string>>, name = bp.key): Mesh[] {
  const model = buildModel(scene, bp, { name, palette, merge: true });
  const out: Mesh[] = [];
  for (const m of model.meshes) {
    m.parent = null;
    m.bakeCurrentTransformIntoVertices();
    out.push(m);
  }
  model.root.dispose();
  return out;
}
