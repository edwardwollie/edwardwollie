// Feature switches for the public build.
//
// The 3D Blueprint Hangar is a private design tool. It is hidden from players and the
// blueprint files (atlas PDF, plates, GLBs) are not shipped in the Docker image.
// Developers can still open it on a local server: http://localhost:8108/?hangar
export const FEATURES = {
  blueprintHangar: false
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function hangarAllowed(location = globalThis.location) {
  if (FEATURES.blueprintHangar) return true;
  if (!location) return false;
  return LOCAL_HOSTS.has(location.hostname) && new URLSearchParams(location.search).has("hangar");
}
