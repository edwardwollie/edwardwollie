// Standard blueprint view set — shared by the preview tool, the in-game
// Blueprint Studio and the printed book so every drawing uses the same
// projection conventions (third-angle; plan aligned with the left elevation).

import * as THREE from "three";

export type ViewName = "front" | "back" | "left" | "right" | "top" | "bottom" | "iso" | "isoRear" | "planF";

export interface ViewDef { dir: [number, number, number]; up: [number, number, number]; label: string; short: string }

const n = (v: [number, number, number]): [number, number, number] => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; };

export const VIEWS: Record<ViewName, ViewDef> = {
  front: { dir: [0, 0, 1], up: [0, 1, 0], label: "FRONT ELEVATION", short: "FRONT" },
  back: { dir: [0, 0, -1], up: [0, 1, 0], label: "REAR ELEVATION", short: "REAR" },
  left: { dir: [1, 0, 0], up: [0, 1, 0], label: "LEFT SIDE ELEVATION", short: "LEFT" },
  right: { dir: [-1, 0, 0], up: [0, 1, 0], label: "RIGHT SIDE ELEVATION", short: "RIGHT" },
  top: { dir: [0, 1, 0], up: [-1, 0, 0], label: "PLAN — TOP VIEW", short: "TOP" },
  bottom: { dir: [0, -1, 0], up: [1, 0, 0], label: "UNDERSIDE — BOTTOM VIEW", short: "BOTTOM" },
  iso: { dir: n([0.78, 0.62, 0.78]), up: [0, 1, 0], label: "ISOMETRIC — FRONT LEFT", short: "ISO" },
  isoRear: { dir: n([-0.78, 0.62, -0.78]), up: [0, 1, 0], label: "ISOMETRIC — REAR RIGHT", short: "ISO R" },
  /** plan aligned with the front elevation (structures, gear end views) */
  planF: { dir: [0, 1, 0], up: [0, 0, -1], label: "PLAN — TOP VIEW", short: "PLAN" },
};

export const ALL_VIEWS: ViewName[] = ["front", "back", "left", "right", "top", "bottom", "iso", "isoRear"];

/** Screen-space axes of a view: returns [right, up] unit vectors in world space. */
export function viewAxes(v: ViewName): [THREE.Vector3, THREE.Vector3, THREE.Vector3] {
  const d = new THREE.Vector3(...VIEWS[v].dir).normalize();
  const upHint = new THREE.Vector3(...VIEWS[v].up);
  const forward = d.clone().negate();
  const right = new THREE.Vector3().crossVectors(forward, upHint).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  return [right, up, d];
}

/** Extent of a box projected onto a view's screen axes. */
export function projectedExtent(box: THREE.Box3, v: ViewName): { minX: number; maxX: number; minY: number; maxY: number; center: THREE.Vector3 } {
  const [r, u] = viewAxes(v);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    const x = p.dot(r), y = p.dot(u);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { minX, maxX, minY, maxY, center: box.getCenter(new THREE.Vector3()) };
}

/**
 * Configure an orthographic camera for a view of `box`.
 * If `unitsPerPx` is given, the scale is fixed (for consistent drawing scales across views).
 */
export function fitOrthoCamera(cam: THREE.OrthographicCamera, box: THREE.Box3, v: ViewName, aspect: number, margin = 0.08, halfHeight?: number) {
  const [r, u, d] = viewAxes(v);
  const ext = projectedExtent(box, v);
  const cx = (ext.minX + ext.maxX) / 2, cy = (ext.minY + ext.maxY) / 2;
  const w = ext.maxX - ext.minX, h = ext.maxY - ext.minY;
  let hh = halfHeight ?? Math.max(h / 2, w / 2 / aspect) * (1 + margin);
  if (!isFinite(hh) || hh <= 0) hh = 1;
  const size = box.getSize(new THREE.Vector3()).length() + 10;
  const center3 = ext.center.clone();
  // move the look target so that projected centre is at (cx, cy)
  const target = d.clone().multiplyScalar(center3.dot(d)).add(r.clone().multiplyScalar(cx)).add(u.clone().multiplyScalar(cy));
  cam.position.copy(target).addScaledVector(d, size);
  cam.up.copy(u);
  cam.lookAt(target);
  cam.left = -hh * aspect; cam.right = hh * aspect; cam.top = hh; cam.bottom = -hh;
  cam.near = 0.01; cam.far = size * 2 + 10;
  cam.updateProjectionMatrix();
  return { halfHeight: hh, target, axes: { right: r, up: u, dir: d } };
}
