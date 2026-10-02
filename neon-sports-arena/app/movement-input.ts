/** Map keyboard and touch controls to the camera's positive-Z screen-forward axis. */
export function screenForwardZ(forward: boolean, backward: boolean, touchZ = 0) {
  return (forward ? 1 : 0) - (backward ? 1 : 0) - touchZ;
}

/** Rotate a screen-space move (x right, z forward) into world space for a camera yaw. */
export function cameraRelative(x: number, z: number, yaw: number) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: x * c + z * s, z: -x * s + z * c };
}
