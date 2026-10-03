// Builds three.js objects from assembly blueprints. Static parts are merged per
// material; animation groups (bolt, magazine, trigger, scope…) stay separate
// so the viewmodel can move them. `explode` spreads parts for exploded views.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { AssemblyBlueprint, MatSpec, Prim } from "../blueprints/assembly.ts";

const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function assemblyMaterial(m: MatSpec): THREE.MeshStandardMaterial {
  const key = `${m.color.join(",")}|${m.metal}|${m.rough}|${m.opacity ?? 1}`;
  let mat = matCache.get(key);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(m.color[0], m.color[1], m.color[2], THREE.SRGBColorSpace), metalness: m.metal, roughness: m.rough, envMapIntensity: 1 });
    if (m.opacity !== undefined && m.opacity < 1) { mat.transparent = true; mat.opacity = m.opacity; mat.depthWrite = false; }
    mat.name = m.label;
    matCache.set(key, mat);
  }
  return mat;
}

export function primGeometry(p: Prim): THREE.BufferGeometry {
  let g: THREE.BufferGeometry;
  const seg = p.seg ?? 18;
  switch (p.kind) {
    case "box": g = new THREE.BoxGeometry(...(p.size ?? [0.1, 0.1, 0.1])); break;
    case "cyl": g = new THREE.CylinderGeometry(p.r2 ?? p.r ?? 0.05, p.r ?? 0.05, p.h ?? 0.1, seg); break;
    case "lathe": g = new THREE.LatheGeometry((p.profile ?? [[0, 0], [0.05, 0.1]]).map(([r, y]) => new THREE.Vector2(r, y)), seg); break;
    case "extrude": {
      const pr = p.profile ?? [[0, 0], [0.1, 0], [0, 0.1]];
      const sh = new THREE.Shape(pr.map(([x, y]) => new THREE.Vector2(x, y)));
      const bevel = p.bevel ?? 0;
      g = new THREE.ExtrudeGeometry(sh, { depth: p.depth ?? 0.02, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 6 });
      g.translate(0, 0, -(p.depth ?? 0.02) / 2);
      break;
    }
    case "tube": {
      const pts = (p.pts ?? [[0, 0, 0], [0, 0.1, 0]]).map(v => new THREE.Vector3(...v));
      const curve = pts.length === 2 ? new THREE.LineCurve3(pts[0], pts[1]) : new THREE.CatmullRomCurve3(pts);
      g = new THREE.TubeGeometry(curve as THREE.Curve<THREE.Vector3>, Math.max(4, pts.length * 6), p.tr ?? 0.01, 8, false);
      break;
    }
    case "sphere": g = new THREE.SphereGeometry(p.r ?? 0.05, 16, 12); break;
    case "torus": { const t = p.tor ?? [0.05, 0.01, Math.PI * 2]; g = new THREE.TorusGeometry(t[0], t[1], 10, 28, t[2]); break; }
    case "ring": g = new THREE.RingGeometry(p.r2 ?? 0.01, p.r ?? 0.02, seg); break;
  }
  if (g.index === null) { /* keep non-indexed */ }
  for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal") g.deleteAttribute(name);
  return g.index ? g.toNonIndexed() : g;
}

export function primMatrix(p: Prim, explode = 0): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  const e = new THREE.Euler(...(p.rot ?? [0, 0, 0]), "XYZ");
  const pos = new THREE.Vector3(...p.p);
  if (explode && p.explode) pos.addScaledVector(new THREE.Vector3(...p.explode), explode);
  m.compose(pos, new THREE.Quaternion().setFromEuler(e), new THREE.Vector3(1, 1, 1));
  return m;
}

export interface BuiltAssembly { root: THREE.Group; groups: Record<string, THREE.Group>; meshes: THREE.Mesh[] }

export function buildAssembly(bp: AssemblyBlueprint, opts: { explode?: number; shadows?: boolean; only?: (p: Prim) => boolean; materialOverride?: THREE.Material; includeHidden?: boolean } = {}): BuiltAssembly {
  const root = new THREE.Group();
  root.name = `assembly:${bp.id}`;
  const groups: Record<string, THREE.Group> = {};
  const buckets = new Map<string, { group: string; mat: string; geos: THREE.BufferGeometry[] }>();
  for (const p of bp.prims) {
    if (p.hidden && !opts.includeHidden) continue;
    if (opts.only && !opts.only(p)) continue;
    const g = primGeometry(p);
    g.applyMatrix4(primMatrix(p, opts.explode ?? 0));
    const grp = p.group ?? "static";
    const key = `${grp}|${p.mat}`;
    let b = buckets.get(key);
    if (!b) { b = { group: grp, mat: p.mat, geos: [] }; buckets.set(key, b); }
    b.geos.push(g);
  }
  const meshes: THREE.Mesh[] = [];
  for (const b of buckets.values()) {
    let G = groups[b.group];
    if (!G) { G = new THREE.Group(); G.name = b.group; groups[b.group] = G; root.add(G); }
    const merged = mergeGeometries(b.geos, false)!;
    merged.computeBoundingSphere();
    const spec = bp.materials[b.mat];
    const mesh = new THREE.Mesh(merged, opts.materialOverride ?? (spec ? assemblyMaterial(spec) : new THREE.MeshStandardMaterial()));
    mesh.castShadow = !!opts.shadows; mesh.receiveShadow = !!opts.shadows;
    mesh.name = `${bp.id}:${b.group}:${b.mat}`;
    G.add(mesh);
    meshes.push(mesh);
    for (const g of b.geos) g.dispose();
  }
  return { root, groups, meshes };
}
