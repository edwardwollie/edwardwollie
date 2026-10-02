/**
 * Convert keyboard and touch controls into the world's screen-forward Z axis.
 * The gameplay camera sits behind the player on negative Z, so positive Z is
 * visually forward/up-screen. Mobile pads report an upward drag as -1.
 */
export function screenForwardZ(forward: boolean, backward: boolean, touchZ = 0) {
  return (forward ? 1 : 0) - (backward ? 1 : 0) - touchZ;
}
