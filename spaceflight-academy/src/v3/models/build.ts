import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Blueprint, MatSpec, Part, Shape } from "../blueprints/types.ts";
import { PALETTE } from "../blueprints/palette.ts";

const HAS_DOM = typeof document !== "undefined";
const DEG = Math.PI / 180;

export type Quality = "low" | "medium" | "high";

export interface BuildOptions {
  /** Material overrides (e.g. a cadet's skin and hair, a suit accent colour). */
  palette?: Readonly<Record<string, MatSpec>>;
  quality?: Quality;
  shadows?: boolean;
  /** Resolve blueprint references (sub-assemblies). */
  resolve?: (id: string) => Blueprint | undefined;
  /** Shared caches so many instances reuse GPU resources. */
  cache?: BuildCache;
}

export interface BuiltModel {
  root: THREE.Group;
  nodes: Map<string, THREE.Object3D>;
  joints: Map<string, THREE.Object3D>;
  tags: Map<string, THREE.Object3D[]>;
  blueprint: Blueprint;
}

export class BuildCache {
  readonly geometries = new Map<string, THREE.BufferGeometry>();
  readonly materials = new Map<string, THREE.Material>();
  dispose() {
    for (const geometry of this.geometries.values()) geometry.dispose();
    for (const material of this.materials.values()) {
      const map = (material as THREE.MeshStandardMaterial).map;
      map?.dispose();
      material.dispose();
    }
    this.geometries.clear();
    this.materials.clear();
  }
}

export const SHARED_CACHE = new BuildCache();

const SEG_SCALE: Record<Quality, number> = { low: 0.55, medium: 0.8, high: 1 };

function seg(base: number, quality: Quality, min = 6) {
  return Math.max(min, Math.round(base * SEG_SCALE[quality]));
}

export function makeGeometry(shape: Shape, quality: Quality = "high"): THREE.BufferGeometry {
  switch (shape.kind) {
    case "box": {
      const [w, h, d] = shape.size;
      if (shape.radius && shape.radius > 0) {
        const r = Math.min(shape.radius, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
        return new RoundedBoxGeometry(w, h, d, Math.max(1, Math.round((shape.seg ?? 3) * SEG_SCALE[quality])), Math.max(r, 1e-4));
      }
      return new THREE.BoxGeometry(w, h, d);
    }
    case "cyl":
      return new THREE.CylinderGeometry(shape.rTop, shape.rBot, shape.h, seg(shape.seg ?? 32, quality), 1, shape.open ?? false,
        (shape.thetaStart ?? 0) * DEG, (shape.thetaLength ?? 360) * DEG);
    case "sphere": {
      const s = seg(shape.seg ?? 32, quality, 8);
      return new THREE.SphereGeometry(shape.r, s, Math.max(6, Math.round(s * 0.66)),
        (shape.phiStart ?? 0) * DEG, (shape.phiLength ?? 360) * DEG, (shape.thetaStart ?? 0) * DEG, (shape.thetaLength ?? 180) * DEG);
    }
    case "capsule":
      return new THREE.CapsuleGeometry(shape.r, shape.len, seg(6, quality, 3), seg(shape.seg ?? 20, quality, 8));
    case "torus":
      return new THREE.TorusGeometry(shape.R, shape.r, seg(shape.tube ?? 12, quality, 5), seg(shape.seg ?? 40, quality, 10), (shape.arc ?? 360) * DEG);
    case "lathe": {
      const points = shape.profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y));
      return new THREE.LatheGeometry(points, seg(shape.seg ?? 36, quality, 8), (shape.phiStart ?? 0) * DEG, (shape.phiLength ?? 360) * DEG);
    }
    case "extrude": {
      const outline = new THREE.Shape(shape.outline.map(([x, y]) => new THREE.Vector2(x, y)));
      const bevel = shape.bevel ?? 0;
      const geometry = new THREE.ExtrudeGeometry(outline, {
        depth: Math.max(1e-4, shape.depth - bevel * 2),
        bevelEnabled: bevel > 0,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelSegments: bevel > 0 ? 2 : 0,
        curveSegments: seg(shape.curveSeg ?? 12, quality, 4),
      });
      geometry.translate(0, 0, -(shape.depth - bevel * 2) / 2);
      return geometry;
    }
    case "tube": {
      const curve = new THREE.CatmullRomCurve3(shape.path.map(([x, y, z]) => new THREE.Vector3(x, y, z)), shape.closed ?? false, "catmullrom", 0.5);
      return new THREE.TubeGeometry(curve, seg(shape.seg ?? 24, quality), shape.r, seg(shape.radial ?? 10, quality, 5), shape.closed ?? false);
    }
    case "plane":
      return new THREE.PlaneGeometry(shape.size[0], shape.size[1]);
    case "disc":
      return shape.inner && shape.inner > 0
        ? new THREE.RingGeometry(shape.inner, shape.r, seg(shape.seg ?? 40, quality, 10))
        : new THREE.CircleGeometry(shape.r, seg(shape.seg ?? 40, quality, 10));
    case "label":
      return new THREE.PlaneGeometry(shape.size[0], shape.size[1]);
    case "cluster": {
      const s = seg(shape.seg ?? 12, quality, 6);
      const parts = shape.balls.map(([x, y, z, r, sy]) => {
        const ball = new THREE.SphereGeometry(r, s, Math.max(4, Math.round(s * 0.7)));
        if (sy !== undefined && sy !== 1) ball.scale(1, sy, 1);
        ball.translate(x, y, z);
        return ball;
      });
      const merged = mergeGeometries(parts, false);
      for (const part of parts) part.dispose();
      if (!merged) throw new Error("cluster merge failed");
      return merged;
    }
  }
}

function geometryFor(shape: Shape, quality: Quality, cache: BuildCache) {
  const key = quality + "|" + JSON.stringify(shape);
  let geometry = cache.geometries.get(key);
  if (!geometry) {
    geometry = makeGeometry(shape, quality);
    geometry.computeBoundingBox();
    cache.geometries.set(key, geometry);
  }
  return geometry;
}

export function materialFromSpec(spec: MatSpec): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(spec.color),
    roughness: spec.roughness ?? 0.55,
    metalness: spec.metalness ?? 0,
    flatShading: spec.flat ?? false,
    side: spec.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (spec.emissive) {
    material.emissive = new THREE.Color(spec.emissive);
    material.emissiveIntensity = spec.emissiveIntensity ?? 1;
  }
  if (spec.opacity !== undefined && spec.opacity < 1) {
    material.transparent = true;
    material.opacity = spec.opacity;
    material.depthWrite = false;
  }
  return material;
}

function labelTexture(shape: Extract<Shape, { kind: "label" }>): THREE.CanvasTexture | null {
  if (!HAS_DOM) return null;
  const aspect = shape.size[0] / shape.size[1];
  const height = 128;
  const width = Math.min(2048, Math.max(64, Math.round(height * aspect)));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = shape.bg ?? "#0d1531";
  const radius = Math.min(28, height * 0.22);
  ctx.beginPath();
  ctx.roundRect(2, 2, width - 4, height - 4, radius);
  ctx.fill();
  if (shape.border) {
    ctx.lineWidth = 8;
    ctx.strokeStyle = shape.border;
    ctx.stroke();
  }
  ctx.fillStyle = shape.fg ?? "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let size = height * 0.62;
  const family = "'Fredoka Variable', 'Fredoka', system-ui, sans-serif";
  ctx.font = `${shape.weight ?? 700} ${size}px ${family}`;
  while (ctx.measureText(shape.text).width > width * 0.88 && size > 10) {
    size -= 2;
    ctx.font = `${shape.weight ?? 700} ${size}px ${family}`;
  }
  ctx.fillText(shape.text, width / 2, height / 2 + size * 0.04);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function materialFor(key: string | undefined, bp: Blueprint, opts: BuildOptions, cache: BuildCache, shape?: Shape): THREE.Material {
  if (shape?.kind === "label") {
    const cacheKey = "label|" + JSON.stringify(shape);
    let material = cache.materials.get(cacheKey);
    if (!material) {
      const texture = labelTexture(shape);
      material = new THREE.MeshStandardMaterial({ map: texture, color: texture ? 0xffffff : new THREE.Color(shape.bg ?? "#0d1531"), roughness: 0.6, emissive: new THREE.Color("#ffffff"), emissiveIntensity: texture ? 0.12 : 0, emissiveMap: texture, side: THREE.DoubleSide });
      material.userData.label = true;
      cache.materials.set(cacheKey, material);
    }
    return material;
  }
  const name = key ?? "white";
  const spec = opts.palette?.[name] ?? bp.materials?.[name] ?? PALETTE[name];
  if (!spec) throw new Error(`Blueprint ${bp.id}: unknown material "${name}"`);
  const cacheKey = "mat|" + JSON.stringify(spec);
  let material = cache.materials.get(cacheKey);
  if (!material) {
    material = materialFromSpec(spec);
    material.userData.key = name;
    material.userData.ghost = spec.ghost ?? false;
    cache.materials.set(cacheKey, material);
  }
  return material;
}

function mirroredId(id: string) {
  if (/L$/.test(id)) return id.replace(/L$/, "R");
  if (/Left$/.test(id)) return id.replace(/Left$/, "Right");
  return id + "_m";
}

interface Ctx {
  bp: Blueprint;
  opts: BuildOptions;
  quality: Quality;
  cache: BuildCache;
  model: BuiltModel;
  idSuffix: string;
  mirrored: boolean;
  depth: number;
}

function register(ctx: Ctx, part: Part, node: THREE.Object3D, id: string) {
  ctx.model.nodes.set(id, node);
  if (part.joint) {
    const joint = (ctx.mirrored ? mirroredId(part.joint) : part.joint) + ctx.idSuffix;
    ctx.model.joints.set(joint, node);
  }
  if (part.tag) {
    const list = ctx.model.tags.get(part.tag) ?? [];
    list.push(node);
    ctx.model.tags.set(part.tag, list);
  }
}

function buildPart(part: Part, ctx: Ctx, parent: THREE.Object3D) {
  if (part.radial && part.radial.count > 1) {
    const { count, offsetDeg = 0 } = part.radial;
    for (let i = 0; i < count; i++) {
      const spin = new THREE.Group();
      spin.name = `${part.id}#${i}`;
      spin.rotation.y = (offsetDeg + (360 / count) * i) * DEG;
      parent.add(spin);
      buildPart({ ...part, radial: undefined }, { ...ctx, idSuffix: `${ctx.idSuffix}#${i}` }, spin);
    }
    return;
  }
  buildSingle(part, ctx, parent, false);
  if (part.mirrorX) buildSingle(part, { ...ctx, mirrored: true }, parent, true);
}

/**
 * `mirror` mirrors this node's transform across the YZ plane (children inherit it);
 * `ctx.mirrored` only renames ids/joints (armL → armR) for the mirrored subtree.
 */
function buildSingle(part: Part, ctx: Ctx, parent: THREE.Object3D, mirror: boolean) {
  const id = (ctx.mirrored ? mirroredId(part.id) : part.id) + ctx.idSuffix;
  let node: THREE.Object3D;
  if (part.ref) {
    const resolve = ctx.opts.resolve;
    const sub = resolve?.(part.ref);
    if (!sub) throw new Error(`Blueprint ${ctx.bp.id}: unknown reference "${part.ref}"`);
    const group = new THREE.Group();
    const subCtx: Ctx = { ...ctx, bp: sub, idSuffix: "", mirrored: false, depth: ctx.depth + 1 };
    if (subCtx.depth > 6) throw new Error("Blueprint reference depth exceeded");
    const subModel: BuiltModel = { root: group, nodes: new Map(), joints: new Map(), tags: new Map(), blueprint: sub };
    subCtx.model = subModel;
    for (const child of sub.parts) buildPart(child, subCtx, group);
    for (const [key, value] of subModel.nodes) ctx.model.nodes.set(`${id}/${key}`, value);
    for (const [key, value] of subModel.tags) ctx.model.tags.set(key, [...(ctx.model.tags.get(key) ?? []), ...value]);
    group.userData.ref = part.ref;
    // A re-used sub-assembly is labelled with its own blueprint name (e.g. "Main Engine").
    group.userData.partName = sub.name;
    node = group;
  } else if (part.shape) {
    const geometry = geometryFor(part.shape, ctx.quality, ctx.cache);
    const material = materialFor(part.mat, ctx.bp, ctx.opts, ctx.cache, part.shape);
    const mesh = new THREE.Mesh(geometry, material);
    const ghost = (material.userData.ghost as boolean | undefined) ?? false;
    const shadows = ctx.opts.shadows ?? true;
    mesh.castShadow = shadows && !part.noShadow && !part.fx && !ghost;
    mesh.receiveShadow = shadows && !part.fx && !ghost;
    if (part.fx) mesh.userData.fx = true;
    if (ghost) mesh.userData.ghost = true;
    node = mesh;
  } else {
    node = new THREE.Group();
  }
  node.name = id;
  node.userData.partId = part.id;
  if (part.name) node.userData.partName = part.name;
  if (part.fx) node.userData.fx = true;
  const [x, y, z] = part.at ?? [0, 0, 0];
  const [rx, ry, rz] = part.rot ?? [0, 0, 0];
  const [sx, sy, sz] = part.scale ?? [1, 1, 1];
  if (mirror) {
    node.position.set(-x, y, z);
    node.rotation.set(rx * DEG, -ry * DEG, -rz * DEG);
    node.scale.set(-sx, sy, sz);
  } else {
    node.position.set(x, y, z);
    node.rotation.set(rx * DEG, ry * DEG, rz * DEG);
    node.scale.set(sx, sy, sz);
  }
  if (part.explode) {
    const [ex, ey, ez] = part.explode;
    node.userData.explode = new THREE.Vector3(mirror ? -ex : ex, ey, ez);
    node.userData.basePosition = node.position.clone();
  }
  if (part.hidden) node.visible = false;
  parent.add(node);
  register(ctx, part, node, id);
  if (part.children) {
    for (const child of part.children) buildPart(child, ctx, node);
  }
}

export function buildBlueprint(bp: Blueprint, opts: BuildOptions = {}): BuiltModel {
  const cache = opts.cache ?? SHARED_CACHE;
  const root = new THREE.Group();
  root.name = bp.id;
  root.userData.blueprintId = bp.id;
  const model: BuiltModel = { root, nodes: new Map(), joints: new Map(), tags: new Map(), blueprint: bp };
  const ctx: Ctx = { bp, opts, quality: opts.quality ?? "high", cache, model, idSuffix: "", mirrored: false, depth: 0 };
  for (const part of bp.parts) buildPart(part, ctx, root);
  return model;
}

/** Visible, solid (non-effect) bounding box in the model's own space. */
export function measure(root: THREE.Object3D, precise = true): THREE.Box3 {
  root.updateWorldMatrix(true, true);
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const box = new THREE.Box3();
  const vertex = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const visit = (object: THREE.Object3D) => {
    if (!object.visible || object.userData.fx) return;
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && !mesh.userData.ghost) {
      matrix.multiplyMatrices(inverse, mesh.matrixWorld);
      const position = mesh.geometry.getAttribute("position");
      if (precise) {
        for (let i = 0; i < position.count; i++) {
          vertex.fromBufferAttribute(position, i).applyMatrix4(matrix);
          box.expandByPoint(vertex);
        }
      } else {
        mesh.geometry.computeBoundingBox();
        const local = mesh.geometry.boundingBox!.clone().applyMatrix4(matrix);
        box.union(local);
      }
    }
    for (const child of object.children) visit(child);
  };
  visit(root);
  return box;
}

/** Applies an exploded-view factor (0 = assembled, 1 = fully exploded). */
export function setExplode(model: BuiltModel, amount: number) {
  model.root.traverse((node) => {
    const offset = node.userData.explode as THREE.Vector3 | undefined;
    const base = node.userData.basePosition as THREE.Vector3 | undefined;
    if (offset && base) node.position.copy(base).addScaledVector(offset, amount);
  });
}
