import * as THREE from "three";
import type { ViewName } from "../blueprints/types.ts";

/**
 * Orthographic view directions using third-angle projection (ASME):
 *   TOP above FRONT, RIGHT to the right of FRONT, BOTTOM below FRONT.
 * The model's front faces +Z, so the FRONT camera sits on +Z looking toward -Z.
 */
export const VIEW_SETUP: Record<ViewName, { eye: THREE.Vector3; up: THREE.Vector3; label: string }> = {
  front: { eye: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0), label: "FRONT VIEW" },
  back: { eye: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0), label: "BACK VIEW" },
  right: { eye: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), label: "RIGHT VIEW" },
  left: { eye: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 1, 0), label: "LEFT VIEW" },
  top: { eye: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, -1), label: "TOP VIEW" },
  bottom: { eye: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, 1), label: "BOTTOM VIEW" },
  iso: { eye: new THREE.Vector3(1, 0.8165, 1).normalize(), up: new THREE.Vector3(0, 1, 0), label: "ISOMETRIC VIEW" },
};

export interface ViewFrame {
  camera: THREE.OrthographicCamera;
  /** Half extents of the framed region in world metres (before margin). */
  halfWidth: number;
  halfHeight: number;
  /** Metres per pixel once the camera is applied to a viewport. */
  metresPerPixel: (viewportWidth: number, viewportHeight: number) => number;
}

/** Projects the 8 corners of a box onto a view's screen axes. */
export function projectedExtent(box: THREE.Box3, view: ViewName) {
  const { eye, up } = VIEW_SETUP[view];
  const forward = eye.clone().negate();
  const right = new THREE.Vector3().crossVectors(forward, up).normalize();
  const trueUp = new THREE.Vector3().crossVectors(right, forward).normalize();
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const corner = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    const x = corner.dot(right), y = corner.dot(trueUp);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { minX, maxX, minY, maxY, right, up: trueUp, forward };
}

/**
 * Builds an orthographic camera framing `box` for `view` inside a viewport of the
 * given aspect ratio. `margin` is a fraction added around the object.
 * Pass `fixedHalfHeight` to share one scale across several views (blueprint sheets).
 */
export function frameView(box: THREE.Box3, view: ViewName, aspect: number, margin = 0.08, fixedHalfHeight?: number): ViewFrame {
  const ext = projectedExtent(box, view);
  const center = box.getCenter(new THREE.Vector3());
  const cx = (ext.minX + ext.maxX) / 2, cy = (ext.minY + ext.maxY) / 2;
  const halfWidth = (ext.maxX - ext.minX) / 2, halfHeight = (ext.maxY - ext.minY) / 2;
  let hh = fixedHalfHeight ?? Math.max(halfHeight, halfWidth / aspect) * (1 + margin);
  if (!fixedHalfHeight && hh <= 0) hh = 1;
  const hw = hh * aspect;
  const camera = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 0.01, 10000);
  const size = box.getSize(new THREE.Vector3()).length() + 10;
  // Camera looks at the projected centre; offset along the view axis.
  const target = ext.right.clone().multiplyScalar(cx).add(ext.up.clone().multiplyScalar(cy)).add(ext.forward.clone().multiplyScalar(center.dot(ext.forward)));
  camera.position.copy(target).addScaledVector(VIEW_SETUP[view].eye, size);
  camera.up.copy(VIEW_SETUP[view].up);
  camera.lookAt(target);
  camera.near = 0.01;
  camera.far = size * 2 + 10;
  camera.updateProjectionMatrix();
  return {
    camera,
    halfWidth,
    halfHeight,
    metresPerPixel: (_w: number, h: number) => (hh * 2) / h,
  };
}

/** A pleasant 3/4 perspective camera for colour previews. */
export function framePerspective(box: THREE.Box3, aspect: number, fov = 30, azimuthDeg = 35, elevationDeg = 18, margin = 1.12) {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = size.length() / 2;
  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.01, Math.max(100, radius * 40));
  const vFov = (fov * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const distance = (radius * margin) / Math.sin(Math.min(vFov, hFov) / 2);
  const az = (azimuthDeg * Math.PI) / 180, el = (elevationDeg * Math.PI) / 180;
  camera.position.set(center.x + Math.sin(az) * Math.cos(el) * distance, center.y + Math.sin(el) * distance, center.z + Math.cos(az) * Math.cos(el) * distance);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  return camera;
}
