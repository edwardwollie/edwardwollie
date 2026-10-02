# Cyber Ninja Academy 3.0.0 — Blueprint upgrade

- Rebuilt the playable ninja as 145 indexed meshes with a faceted helmet and visor, segmented composite armor, a back reactor, layered gauntlets and greaves, light conduits, boots, scarf, and Photon Edge held near the right glove. The full playable asset family has 297 meshes and 16,736 triangles.
- Rebuilt the Aegis drone, red jump barrier, magenta slide gate, orange shift wall, and shard. The colors and silhouettes preserve the game's movement cues.
- Rebuilt the rooftop into repeating 18 m modules with lane rails, edge kerbs, pylons, emitters, and skyline towers. Repeated static geometry uses Babylon instances to avoid multiplying draw calls with course length.
- Added shared UV mapped finish textures and per vertex color and normal data. The renderer feeds the indexed triangles directly into Babylon rather than rebuilding approximate primitives.
- Created front, rear, left, right, top, underside, and isometric blueprint images by extracting the actual neutral-pose Babylon meshes. The three-page PDF atlas includes a large hero view and closeups. Self-contained hero and drone GLB models use the same extracted triangles and texture images.
- Updated the academy cover from that model and advanced the portal and install metadata to 3.0.0. The 12 trials, upgrades, local save key, host port 8099, and health endpoint are retained.

## Validation

`npm test` builds the app and checks mesh arrays, extracted geometry, GLB structures, and all blueprint plates. The blueprint asset family was instantiated with Babylon's NullEngine; the three PDF pages were rendered and visually reviewed. Browser WebGL rendering and the public server still require verification after installation.
