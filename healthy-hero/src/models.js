// Builds Three.js models from src/blueprints.js. Used by the game, the Blueprint Lab and
// the printable blueprint sheet renderer, so every view is generated from one spec.
import * as THREE from './vendor/three.module.min.js?v=2.0.1';
import { BLUEPRINTS, expandSpec } from './blueprints.js?v=2.0.1';

const D2R = Math.PI / 180;
const geometryCache = new Map();

// ---------------------------------------------------------------------------------------
// 2D outlines for extruded parts (all centered on the origin, fitted to size [w, h]).
// ---------------------------------------------------------------------------------------
function outlinePoints(name) {
  switch (name) {
    case 'heart': {
      const pts = [];
      for (let i = 0; i <= 64; i++) {
        const t = (i / 64) * Math.PI * 2;
        pts.push([16 * Math.sin(t) ** 3, 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)]);
      }
      return pts;
    }
    case 'star': {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 0.45 : 1;
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      return pts;
    }
    case 'bolt': return [[0.15, 1], [-0.55, -0.08], [-0.05, -0.08], [-0.2, -1], [0.55, 0.12], [0.05, 0.12], [0.3, 1]];
    case 'crescent': {
      const pts = [];
      for (let i = 0; i <= 40; i++) { const a = Math.PI / 2 + (i / 40) * Math.PI; pts.push([Math.cos(a), Math.sin(a)]); }
      for (let i = 40; i >= 0; i--) { const a = Math.PI / 2 + (i / 40) * Math.PI; pts.push([Math.cos(a) * 0.62 + 0.28, Math.sin(a) * 0.82]); }
      return pts;
    }
    case 'leaf': {
      const pts = [];
      for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push([t * 2 - 1, Math.sin(t * Math.PI) * 0.62]); }
      for (let i = 23; i > 0; i--) { const t = i / 24; pts.push([t * 2 - 1, -Math.sin(t * Math.PI) * 0.62]); }
      return pts;
    }
    case 'flag': {
      const pts = [];
      for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push([t, 1 + Math.sin(t * Math.PI * 2) * 0.08]); }
      for (let i = 16; i >= 0; i--) { const t = i / 16; pts.push([t, Math.sin(t * Math.PI * 2) * 0.08]); }
      return pts;
    }
    default: return [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  }
}

function extrudeGeometry(part) {
  const raw = outlinePoints(part.outline);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of raw) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const [w, h] = part.size;
  const bevel = Math.min(part.depth * 0.3, Math.min(w, h) * 0.06);
  const sx = (w - bevel * 2) / (maxX - minX), sy = (h - bevel * 2) / (maxY - minY);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const shape = new THREE.Shape(raw.map(([x, y]) => new THREE.Vector2((x - cx) * sx, (y - cy) * sy)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, part.depth - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: 2, curveSegments: 8, steps: 1
  });
  g.translate(0, 0, -(part.depth - bevel * 2) / 2);
  return g;
}

// Deterministic random for generated details (hair twists).
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function twistsGeometry(part, lod) {
  const rand = mulberry32(part.seed || 1);
  const [ex, ey, ez] = part.ellipsoid, [cx, cy, cz] = part.center;
  const tilt = (part.tiltBack || 0) * D2R;
  const pieces = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const maxCos = Math.cos((part.polarMax || 80) * D2R);
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), m = new THREE.Matrix4();
  for (let i = 0; i < part.count; i++) {
    const t = (i + 0.5) / part.count;
    const cosP = 1 - t * (1 - maxCos);
    const sinP = Math.sqrt(1 - cosP * cosP);
    const az = i * golden + rand() * 0.35;
    // Point on unit sphere, tilted back around X.
    let x = Math.cos(az) * sinP, y = cosP, z = Math.sin(az) * sinP;
    const y2 = y * Math.cos(tilt) + z * Math.sin(tilt), z2 = -y * Math.sin(tilt) + z * Math.cos(tilt);
    y = y2; z = z2;
    const n = new THREE.Vector3(x / ex, y / ey, z / ez).normalize();
    const surf = new THREE.Vector3(x * ex, y * ey, z * ez);
    const len = part.len * (0.82 + rand() * 0.36), r = part.r * (0.9 + rand() * 0.2);
    const g = new THREE.CapsuleGeometry(r, len, lod > 1 ? 4 : 2, lod > 1 ? 8 : 6);
    const lean = new THREE.Vector3(n.x * 0.8 + (rand() - 0.5) * 0.2, n.y + 0.55, n.z * 0.8 + (rand() - 0.5) * 0.2).normalize();
    q.setFromUnitVectors(up, lean);
    const center = surf.add(lean.clone().multiplyScalar(len * 0.42 + r * 0.2)).add(new THREE.Vector3(cx, cy, cz));
    m.compose(center, q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    pieces.push(ensureIndexed(g));
  }
  return mergeGeometriesSafe(pieces);
}

function ensureIndexed(g) {
  if (!g.index) {
    const n = g.attributes.position.count;
    const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
  if (!g.attributes.uv) {
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  }
  return g;
}

function mergeGeometriesSafe(list) {
  const merged = THREE.mergeGeometries(list, false);
  if (!merged) throw new Error('mergeGeometries failed');
  for (const g of list) g.dispose();
  return merged;
}

// Approximate largest dimension of a part (meters) for size-aware detail.
export function partSize(p) {
  switch (p.shape) {
    case 'sphere': case 'cap': case 'box': return Math.max(...p.size);
    case 'capsule': return p.len + p.r * 2;
    case 'cylinder': return Math.max(p.h, Math.max(p.rt, p.rb) * 2);
    case 'cone': return Math.max(p.h, p.r * 2);
    case 'torus': return (p.R + p.r) * 2;
    case 'octa': case 'dodeca': return p.r * 2;
    case 'extrude': case 'plane': return Math.max(...p.size);
    case 'lathe': return 0.3;
    default: return 0.3;
  }
}

// lod: 0 = scenery, 1 = game hero, 2 = blueprint/high detail
export function geometryFor(part, lod = 1) {
  const key = `${lod}|${part.shape}|${JSON.stringify([part.size, part.r, part.len, part.rt, part.rb, part.h, part.R, part.arc, part.pts, part.smooth, part.outline, part.depth, part.theta, part.phi, part.seg, part.count, part.seed, part.ellipsoid, part.center, part.polarMax, part.tiltBack])}`;
  if (geometryCache.has(key)) return geometryCache.get(key);
  const seg = (a, b, c) => (lod >= 2 ? c : lod === 1 ? b : a);
  let g;
  switch (part.shape) {
    case 'sphere': {
      g = new THREE.SphereGeometry(0.5, seg(12, 22, 48), seg(8, 15, 32));
      g.scale(part.size[0], part.size[1], part.size[2]);
      break;
    }
    case 'cap': {
      const [t0, tl] = part.theta || [0, 90];
      const [p0, pl] = part.phi || [0, 360];
      g = new THREE.SphereGeometry(0.5, seg(14, 26, 56), seg(8, 14, 28), p0 * D2R, pl * D2R, t0 * D2R, tl * D2R);
      g.scale(part.size[0], part.size[1], part.size[2]);
      break;
    }
    case 'box': {
      const r = Math.min(part.r || 0, Math.min(...part.size) / 2 - 1e-4);
      g = r > 0.0005 ? new THREE.RoundedBoxGeometry(part.size[0], part.size[1], part.size[2], seg(2, 3, 5), r)
        : new THREE.BoxGeometry(part.size[0], part.size[1], part.size[2]);
      break;
    }
    case 'capsule': g = new THREE.CapsuleGeometry(part.r, part.len, seg(3, 4, 10), seg(8, 12, 28)); break;
    case 'cylinder': g = new THREE.CylinderGeometry(part.rt, part.rb, part.h, part.seg || seg(10, 18, 40)); break;
    case 'cone': g = new THREE.ConeGeometry(part.r, part.h, part.seg || seg(10, 20, 36)); break;
    case 'torus': g = new THREE.TorusGeometry(part.R, part.r, seg(6, 9, 18), seg(16, 30, 64), (part.arc || 360) * D2R); break;
    case 'octa': g = new THREE.OctahedronGeometry(part.r, 0); break;
    case 'dodeca': g = new THREE.DodecahedronGeometry(part.r, 0); break;
    case 'lathe': {
      let pts = part.pts.map(([r, y]) => new THREE.Vector2(r, y));
      if (part.smooth) pts = new THREE.SplineCurve(pts).getPoints(seg(14, 28, 48)).map((v) => new THREE.Vector2(Math.max(0, v.x), v.y));
      g = new THREE.LatheGeometry(pts, seg(12, 28, 48));
      break;
    }
    case 'extrude': g = extrudeGeometry(part); break;
    case 'plane': g = new THREE.PlaneGeometry(part.size[0], part.size[1]); break;
    case 'twists': g = twistsGeometry(part, lod); break;
    default: throw new Error(`Unknown shape ${part.shape}`);
  }
  g = ensureIndexed(g);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  geometryCache.set(key, g);
  return g;
}

// ---------------------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------------------
export function materialSpec(spec, key) {
  const m = spec.materials?.[key];
  if (!m) throw new Error(`Missing material ${key} in ${spec.id}`);
  return m;
}

export function makeMaterial(m, kind = 'standard') {
  const color = new THREE.Color(m.hex);
  const params = { color };
  if (m.opacity !== undefined && m.opacity < 1) { params.transparent = true; params.opacity = m.opacity; params.depthWrite = m.opacity > 0.7; }
  if (kind === 'basic') return new THREE.MeshBasicMaterial(params);
  // Strong emissive parts are "lights": unlit and not tone-mapped so the hue stays saturated.
  if (m.emissive >= 1) return new THREE.MeshBasicMaterial({ ...params, toneMapped: false });
  if (m.emissive) { params.emissive = color.clone(); params.emissiveIntensity = m.emissive; }
  if (kind === 'lambert') return new THREE.MeshLambertMaterial(params);
  return new THREE.MeshStandardMaterial({ ...params, roughness: m.rough ?? 0.6, metalness: m.metal ?? 0 });
}

// ---------------------------------------------------------------------------------------
// Hierarchical (animatable) model
// ---------------------------------------------------------------------------------------
export function buildModel(id, opts = {}) {
  const spec = BLUEPRINTS[id];
  if (!spec) throw new Error(`No blueprint for ${id}`);
  const lod = opts.lod ?? 1;
  const { joints, parts } = expandSpec(spec);
  const root = new THREE.Group();
  root.name = id;
  root.userData.blueprint = id;
  const jointObjs = {};
  const pending = Object.values(joints);
  let guard = 0;
  while (pending.length && guard++ < 500) {
    const j = pending.shift();
    if (j.parent && !jointObjs[j.parent]) { pending.push(j); continue; }
    const o = j.parent ? new THREE.Group() : root;
    o.name = j.name;
    if (j.parent) {
      o.position.fromArray(j.pos);
      if (j.rest) o.rotation.set(j.rest[0] * D2R, j.rest[1] * D2R, j.rest[2] * D2R);
      jointObjs[j.parent].add(o);
    }
    o.userData.restPos = o.position.clone();
    o.userData.restRot = o.rotation.clone();
    jointObjs[j.name] = o;
  }
  const materials = {};
  const getMat = (key) => {
    if (!materials[key]) {
      const m = materialSpec(spec, key);
      materials[key] = makeMaterial(m, opts.materialKind || 'standard');
      materials[key].name = key;
      materials[key].userData.spec = m;
    }
    return materials[key];
  };
  const meshes = {};
  for (const p of parts) {
    const partLod = lod === 1 && partSize(p) < 0.07 ? 0 : lod;
    const mesh = new THREE.Mesh(geometryFor(p, partLod), getMat(p.mat));
    mesh.name = p.id;
    mesh.position.fromArray(p.pos || [0, 0, 0]);
    if (p.rot) mesh.rotation.set(p.rot[0] * D2R, p.rot[1] * D2R, p.rot[2] * D2R, p.order || 'XYZ');
    if (p.scale) mesh.scale.fromArray(p.scale);
    mesh.userData.part = p;
    mesh.userData.restPos = mesh.position.clone();
    mesh.castShadow = !!opts.shadows && !(materialSpec(spec, p.mat).opacity < 1);
    mesh.receiveShadow = false;
    const parent = jointObjs[p.joint];
    if (!parent) throw new Error(`Part ${p.id} references missing joint ${p.joint}`);
    parent.add(mesh);
    meshes[p.id] = mesh;
  }
  root.updateMatrixWorld(true);
  return { id, spec, root, joints: jointObjs, meshes, materials };
}

// Measure a model (rest pose) — used by tests and blueprint dimensioning.
export function measure(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3();
  object.traverse((o) => {
    if (o.isMesh && o.visible) {
      const g = o.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      // Precise box: transform vertices (bounding boxes of rotated parts overestimate).
      const pos = g.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); box.expandByPoint(v); }
    }
  });
  return box;
}

// ---------------------------------------------------------------------------------------
// Merged static props (1 lit draw call + optional glow / transparent calls)
// ---------------------------------------------------------------------------------------
const mergedCache = new Map();
const sharedPropMaterials = {};
function propMaterial(kind, opacity = 1) {
  const key = `${kind}|${opacity}`;
  if (!sharedPropMaterials[key]) {
    if (kind === 'glow') sharedPropMaterials[key] = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    else if (kind === 'clear') sharedPropMaterials[key] = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity, roughness: 0.1, depthWrite: false });
    else sharedPropMaterials[key] = new THREE.MeshLambertMaterial({ vertexColors: true });
  }
  return sharedPropMaterials[key];
}

export function buildMergedGeometryBuckets(id, opts = {}) {
  const spec = BLUEPRINTS[id];
  const lod = opts.lod ?? 0;
  const model = buildModel(id, { lod });
  model.root.updateMatrixWorld(true);
  const buckets = {};
  const color = new THREE.Color();
  model.root.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.userData.part, m = materialSpec(spec, p.mat);
    const tag = (p.tags || [])[0];
    const kind = tag ? `tag:${tag}` : m.emissive && m.emissive >= 0.9 ? 'glow' : m.opacity !== undefined && m.opacity < 1 ? `clear:${m.opacity}` : 'lit';
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    color.set(opts.variant?.[p.mat] || m.hex);
    if (kind === 'glow') color.multiplyScalar(1.15);
    const n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = color.r; arr[i * 3 + 1] = color.g; arr[i * 3 + 2] = color.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    (buckets[kind] ||= []).push(g);
  });
  const out = {};
  for (const [kind, list] of Object.entries(buckets)) out[kind] = mergeGeometriesSafe(list);
  return out;
}

export function buildMergedProp(id, opts = {}) {
  const key = `${id}|${JSON.stringify(opts.variant || null)}|${opts.lod ?? 0}`;
  let buckets = mergedCache.get(key);
  if (!buckets) { buckets = buildMergedGeometryBuckets(id, opts); mergedCache.set(key, buckets); }
  const group = new THREE.Group();
  group.name = id;
  for (const [kind, geo] of Object.entries(buckets)) {
    let mat;
    if (kind === 'lit') mat = propMaterial('lit');
    else if (kind === 'glow') mat = propMaterial('glow');
    else if (kind.startsWith('clear:')) mat = propMaterial('clear', Number(kind.slice(6)));
    else mat = opts.tagMaterials?.[kind.slice(4)] || propMaterial('clear', 0.85);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `${id}:${kind}`;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  return group;
}

export function disposeModel(model) {
  for (const m of Object.values(model.materials || {})) { m.map?.dispose(); m.dispose(); }
}

export { THREE };
