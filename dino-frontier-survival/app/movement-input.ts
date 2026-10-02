/**
 * Convert keyboard and touch controls into the world's screen-forward Z axis.
 * The gameplay camera sits behind the player on negative Z, so positive Z is
 * visually forward/up-screen. Mobile pads report an upward drag as -1.
 */
export function screenForwardZ(forward: boolean, backward: boolean, touchZ = 0) {
  return (forward ? 1 : 0) - (backward ? 1 : 0) - touchZ;
}

/**
 * Rotate a local stick vector (x = strafe right, z = forward) into world space
 * for a camera looking along `yaw` (radians, 0 = +Z, positive turns toward +X).
 * Returns a vector no longer than 1 so diagonals aren't faster.
 */
export function cameraRelative(x: number, z: number, yaw: number) {
  const len = Math.hypot(x, z);
  if (len < 1e-4) return { x: 0, z: 0 };
  const k = len > 1 ? 1 / len : 1, s = Math.sin(yaw), c = Math.cos(yaw);
  return { x: (x * c + z * s) * k, z: (z * c - x * s) * k };
}
