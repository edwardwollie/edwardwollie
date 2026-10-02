// Blueprint geometry kit.
//
// Every 3D unit in Neon Dominion is described as data in ./models.js: a list of
// machined primitives (rounded boxes, lathed hulls, extruded plates, rings...)
// placed in metres, +Y up, facing +Z. This module turns that recipe into
// merged BufferGeometry chunks grouped by animation pivot and material.
//
// The same build is used by the game renderer, the in-game blueprint hangar,
// the Node blueprint contract test and the blueprint plate/GLB generator, so
// the published blueprints are always the exact meshes that ship in the game.

import * as THREE from "../vendor/three.js";

const DEG = Math.PI / 180;
export const METRES_PER_UNIT = 1 / 25; // simulation units -> metres

// Physically based finishes. Colours come from each model's palette.
export const FINISHES = {
  hull: { metalness: 0.55, roughness: 0.32, clearcoat: 0.6 },
  plate: { metalness: 0.7, roughness: 0.26, clearcoat: 0.35 },
  alloy: { metalness: 0.85, roughness: 0.38 },
  dark: { metalness: 0.6, roughness: 0.55 },
  rubber: { metalness: 0.05, roughness: 0.85 },
  glass: { metalness: 0.1, roughness: 0.04, clearcoat: 1, transmission: 0 },
  glow: { emissive: true, intensity: 2.2 },
  glow2: { emissive: true, intensity: 1.8 },
  hot: { emissive: true, intensity: 3.6 }
};

// ---------------------------------------------------------------------------
// Primitive builders. Each returns a BufferGeometry centred on its own origin.
// ---------------------------------------------------------------------------

function roundedRectShape(width, height, radius) {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  const r = Math.min(radius, width / 2 - 1e-4, height / 2 - 1e-4);
  shape.moveTo(x + r, y);
  shape.lineTo(x + width - r, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + r);
  shape.lineTo(x + width, y + height - r);
  shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  shape.lineTo(x + r, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

function polygonShape(points) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], index) => (index === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  shape.closePath();
  return shape;
}

const BUILDERS = {
  // Machined block with rounded edges: s=[w,h,d], r=edge radius
  box(part) {
    const [w, h, d] = part.s;
    const radius = part.r ?? Math.min(w, h, d) * 0.12;
    if (radius <= 0.0005) return new THREE.BoxGeometry(w, h, d);
    return new THREE.RoundedBoxGeometry(w, h, d, part.seg ?? 2, radius);
  },
  // Tapered cylinder / cone: s=[rTop, rBottom, height], n=radial segments
  cyl(part) {
    const [rt, rb, h] = part.s;
    return new THREE.CylinderGeometry(rt, rb, h, part.n ?? 20, 1, part.open ?? false, (part.start ?? 0) * DEG, (part.arc ?? 360) * DEG);
  },
  sphere(part) {
    const [r] = part.s;
    const geometry = new THREE.SphereGeometry(r, part.n ?? 24, Math.max(8, Math.round((part.n ?? 24) * 0.6)),
      0, Math.PI * 2, 0, (part.arc ?? 1) * Math.PI);
    return geometry;
  },
  capsule(part) {
    const [r, length] = part.s;
    return new THREE.CapsuleGeometry(r, length, 6, part.n ?? 16);
  },
  // Torus lying in the XY plane: s=[radius, tube], arc in degrees
  torus(part) {
    const [radius, tube] = part.s;
    return new THREE.TorusGeometry(radius, tube, part.tn ?? 10, part.n ?? 40, (part.arc ?? 360) * DEG);
  },
  // Flat annulus in the XZ plane: s=[inner, outer]
  ring(part) {
    const [inner, outer] = part.s;
    const geometry = new THREE.RingGeometry(inner, outer, part.n ?? 40, 1, 0, (part.arc ?? 360) * DEG);
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  },
  // Lathed hull around Y: pts=[[radius, y], ...]
  lathe(part) {
    const points = part.pts.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y));
    return new THREE.LatheGeometry(points, part.n ?? 28, 0, (part.arc ?? 360) * DEG);
  },
  // Extruded armour plate: pts=[[x,y],...] outline in XY, d=thickness along Z
  plate(part) {
    const depth = part.d ?? 0.05;
    const bevel = part.b ?? Math.min(0.015, depth * 0.3);
    const geometry = new THREE.ExtrudeGeometry(polygonShape(part.pts), {
      depth: Math.max(0.001, depth - bevel * 2),
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 1,
      curveSegments: 4
    });
    geometry.translate(0, 0, -(depth - bevel * 2) / 2);
    return geometry;
  },
  // Rounded slab: s=[w,h,d], r=corner radius in XY (pill shapes, panels)
  slab(part) {
    const [w, h, d] = part.s;
    const bevel = part.b ?? Math.min(0.012, d * 0.3);
    const geometry = new THREE.ExtrudeGeometry(roundedRectShape(w - bevel * 2, h - bevel * 2, part.r ?? Math.min(w, h) * 0.25), {
      depth: Math.max(0.001, d - bevel * 2),
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 1,
      curveSegments: 6
    });
    geometry.translate(0, 0, -(d - bevel * 2) / 2);
    return geometry;
  },
  octa(part) {
    return new THREE.OctahedronGeometry(part.s[0], part.detail ?? 0);
  },
  ico(part) {
    return new THREE.IcosahedronGeometry(part.s[0], part.detail ?? 0);
  },
  // Faceted rock: icosahedron displaced by a seeded hash
  rock(part) {
    const geometry = new THREE.IcosahedronGeometry(part.s[0], part.detail ?? 1);
    const position = geometry.getAttribute("position");
    const seed = part.seed ?? 1;
    const vertex = new THREE.Vector3();
    for (let index = 0; index < position.count; index += 1) {
      vertex.fromBufferAttribute(position, index);
      const key = Math.round(vertex.x * 97) * 73856093 ^ Math.round(vertex.y * 97) * 19349663 ^ Math.round(vertex.z * 97) * 83492791 ^ seed * 2654435761;
      const noise = ((Math.sin(key) * 43758.5453) % 1 + 1) % 1;
      vertex.multiplyScalar(0.78 + noise * 0.38);
      position.setXYZ(index, vertex.x, vertex.y, vertex.z);
    }
    geometry.computeVertexNormals();
    return geometry;
  }
};

export const PRIMITIVES = Object.keys(BUILDERS);

// ---------------------------------------------------------------------------
// Recipe -> geometry
// ---------------------------------------------------------------------------

function mirrorName(name) {
  if (/L$/.test(name)) return name.replace(/L$/, "R");
  if (/R$/.test(name)) return name.replace(/R$/, "L");
  return name;
}

function partMatrix(part, mirrored) {
  const position = new THREE.Vector3(...(part.p || [0, 0, 0]));
  const [rx, ry, rz] = (part.rot || [0, 0, 0]).map((value) => value * DEG);
  const euler = new THREE.Euler(rx, ry, rz, part.order || "XYZ");
  const scale = new THREE.Vector3(...(part.sc || [1, 1, 1]));
  const matrix = new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromEuler(euler), scale);
  if (mirrored) matrix.premultiply(new THREE.Matrix4().makeScale(-1, 1, 1));
  return matrix;
}

function flipWinding(geometry) {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  for (let index = 0; index < position.count; index += 3) {
    for (const attribute of [position, normal]) {
      if (!attribute) continue;
      const x = attribute.getX(index + 1);
      const y = attribute.getY(index + 1);
      const z = attribute.getZ(index + 1);
      attribute.setXYZ(index + 1, attribute.getX(index + 2), attribute.getY(index + 2), attribute.getZ(index + 2));
      attribute.setXYZ(index + 2, x, y, z);
    }
  }
}

function clean(geometry) {
  let result = geometry.index ? geometry.toNonIndexed() : geometry;
  if (result !== geometry) geometry.dispose();
  for (const name of Object.keys(result.attributes)) {
    if (name !== "position" && name !== "normal") result.deleteAttribute(name);
  }
  if (!result.getAttribute("normal")) result.computeVertexNormals();
  result.clearGroups();
  return result;
}

/** Resolve pivots (joints) including automatic mirrored pairs. */
function resolvePivots(spec) {
  const pivots = new Map();
  pivots.set("root", { name: "root", parent: null, at: [0, 0, 0] });
  for (const [name, def] of Object.entries(spec.pivots || {})) {
    pivots.set(name, { name, parent: def.parent || "root", at: def.at });
    if (def.mirror) {
      const twin = mirrorName(name);
      pivots.set(twin, { name: twin, parent: def.parent ? mirrorName(def.parent) : "root", at: [-def.at[0], def.at[1], def.at[2]] });
    }
  }
  return pivots;
}

/** Expand recipe parts, applying `mirror` (pairs across X) and `array` (radial copies). */
export function expandParts(spec) {
  const result = [];
  for (const part of spec.parts) {
    const copies = [];
    if (part.radial) {
      const { count, axis = "y", offset = 0, center = [0, 0, 0] } = part.radial;
      for (let index = 0; index < count; index += 1) {
        const angle = offset + (index / count) * 360;
        copies.push({ ...part, radial: undefined, spin: { axis, angle, center } });
      }
    } else copies.push(part);
    for (const copy of copies) {
      result.push({ ...copy, mirrored: false, pivot: copy.pivot || "root" });
      if (copy.mirror) result.push({ ...copy, mirrored: true, pivot: mirrorName(copy.pivot || "root") });
    }
  }
  return result;
}

/**
 * Build a blueprint model.
 * Returns { id, spec, pivots: Map, chunks: [{pivot, mat, geometry, triangles}], bounds, triangles }.
 * Chunk geometry is expressed relative to its pivot origin (world-at-rest minus pivot.at).
 */
export function buildModel(spec) {
  const pivots = resolvePivots(spec);
  const buckets = new Map();
  for (const part of expandParts(spec)) {
    const builder = BUILDERS[part.g];
    if (!builder) throw new Error(`${spec.id}: unknown primitive "${part.g}"`);
    if (!pivots.has(part.pivot)) throw new Error(`${spec.id}: part references missing pivot "${part.pivot}"`);
    if (!spec.palette[part.m] && !FINISHES[part.m]) throw new Error(`${spec.id}: unknown material "${part.m}"`);
    let geometry = clean(builder(part));
    const matrix = partMatrix(part, false);
    if (part.spin) {
      const axis = new THREE.Vector3(part.spin.axis === "x" ? 1 : 0, part.spin.axis === "y" ? 1 : 0, part.spin.axis === "z" ? 1 : 0);
      const [cx, cy, cz] = part.spin.center;
      matrix.premultiply(new THREE.Matrix4().makeTranslation(-cx, -cy, -cz));
      matrix.premultiply(new THREE.Matrix4().makeRotationAxis(axis, part.spin.angle * DEG));
      matrix.premultiply(new THREE.Matrix4().makeTranslation(cx, cy, cz));
    }
    if (part.mirrored) matrix.premultiply(new THREE.Matrix4().makeScale(-1, 1, 1));
    geometry.applyMatrix4(matrix);
    if (part.mirrored) flipWinding(geometry);
    const pivot = pivots.get(part.pivot);
    geometry.translate(-pivot.at[0], -pivot.at[1], -pivot.at[2]);
    const key = `${part.pivot}|${part.m}`;
    if (!buckets.has(key)) buckets.set(key, { pivot: part.pivot, mat: part.m, list: [] });
    buckets.get(key).list.push(geometry);
  }
  const chunks = [];
  let triangles = 0;
  for (const bucket of buckets.values()) {
    const geometry = bucket.list.length === 1 ? bucket.list[0] : THREE.mergeGeometries(bucket.list, false);
    for (const item of bucket.list) if (item !== geometry) item.dispose();
    geometry.computeBoundingSphere();
    const count = geometry.getAttribute("position").count / 3;
    triangles += count;
    chunks.push({ pivot: bucket.pivot, mat: bucket.mat, geometry, triangles: count });
  }
  const bounds = new THREE.Box3();
  for (const chunk of chunks) {
    const at = pivots.get(chunk.pivot).at;
    chunk.geometry.computeBoundingBox();
    const box = chunk.geometry.boundingBox.clone().translate(new THREE.Vector3(...at));
    bounds.union(box);
  }
  return { id: spec.id, spec, pivots, chunks, bounds, triangles };
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

/** Create (and cache) a PBR material for a palette entry. */
export function createMaterial(spec, matKey, cache = new Map(), options = {}) {
  const color = spec.palette[matKey] ?? "#8899aa";
  const finishKey = spec.finish?.[matKey] || matKey;
  const finish = FINISHES[finishKey] || FINISHES[matKey.replace(/\d+$/, "")] || FINISHES.hull;
  const key = `${spec.id}:${matKey}:${options.variant || ""}`;
  if (cache.has(key)) return cache.get(key);
  let material;
  if (finish.emissive) {
    material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).multiplyScalar(0.25),
      emissive: new THREE.Color(color),
      emissiveIntensity: finish.intensity,
      metalness: 0,
      roughness: 0.4
    });
    material.userData.glow = true;
  } else if (finish.clearcoat || finishKey === "glass") {
    material = new THREE.MeshPhysicalMaterial({
      color,
      metalness: finish.metalness,
      roughness: finish.roughness,
      clearcoat: finish.clearcoat ?? 0,
      clearcoatRoughness: 0.18,
      envMapIntensity: 1.1
    });
  } else {
    material = new THREE.MeshStandardMaterial({ color, metalness: finish.metalness, roughness: finish.roughness });
  }
  material.name = key;
  cache.set(key, material);
  return material;
}

/**
 * Build a ready-to-render hierarchy (THREE.Group) with one Object3D per pivot.
 * Used by the blueprint hangar, the plate renderer and the GLB exporter.
 */
export function modelToGroup(model, { materials = new Map(), materialFor } = {}) {
  const group = new THREE.Group();
  group.name = model.id;
  const nodes = new Map();
  const ordered = [...model.pivots.values()];
  // parents first
  ordered.sort((a, b) => depth(model.pivots, a) - depth(model.pivots, b));
  for (const pivot of ordered) {
    const node = pivot.name === "root" ? group : new THREE.Group();
    node.name = pivot.name;
    if (pivot.name !== "root") {
      const parent = model.pivots.get(pivot.parent);
      node.position.set(pivot.at[0] - parent.at[0], pivot.at[1] - parent.at[1], pivot.at[2] - parent.at[2]);
      nodes.get(pivot.parent).add(node);
    }
    node.userData.rest = node.position.clone();
    nodes.set(pivot.name, node);
  }
  for (const chunk of model.chunks) {
    const material = materialFor ? materialFor(chunk.mat) : createMaterial(model.spec, chunk.mat, materials);
    const mesh = new THREE.Mesh(chunk.geometry, material);
    mesh.name = `${chunk.pivot}:${chunk.mat}`;
    mesh.castShadow = !material.userData?.glow;
    mesh.receiveShadow = true;
    nodes.get(chunk.pivot).add(mesh);
  }
  group.userData.nodes = nodes;
  return group;
}

function depth(pivots, pivot) {
  let level = 0;
  let current = pivot;
  while (current && current.parent) {
    level += 1;
    current = pivots.get(current.parent);
  }
  return level;
}

/** Apply a rig pose ({pivot: {rx, ry, rz, px, py, pz, s}}) to a modelToGroup() hierarchy. */
export function applyPose(group, pose = {}) {
  for (const [name, node] of group.userData.nodes) {
    if (name === "root") continue;
    const joint = pose[name];
    const rest = node.userData.rest;
    node.position.set(rest.x + (joint?.px || 0), rest.y + (joint?.py || 0), rest.z + (joint?.pz || 0));
    node.rotation.set(joint?.rx || 0, joint?.ry || 0, joint?.rz || 0, "YXZ");
    const scale = joint?.s ?? 1;
    node.scale.set(scale, scale, scale);
  }
}

/** Measured dimensions in metres, as printed on the blueprint plates. */
export function measure(model) {
  const size = new THREE.Vector3();
  model.bounds.getSize(size);
  const round = (value) => Math.round(value * 1000) / 1000;
  return {
    width: round(size.x),
    height: round(size.y),
    length: round(size.z),
    minY: round(model.bounds.min.y),
    triangles: model.triangles,
    parts: expandParts(model.spec).length,
    pivots: model.pivots.size
  };
}
