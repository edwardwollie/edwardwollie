# Neon Sports Arena 2.0.0 — Full 3D upgrade

## 3D blueprints (series NS-02)
- `blueprints/design_model.py` is the single geometry recipe for 21 assets: 412 parts and 65,948 triangles. The game builds its meshes from it, the plates are rendered from it and the GLBs are exported from it.
- **Athlete:** 1.89 m, 127 parts, 25,160 triangles. The body is lofted anatomy under conformal kit shells: jersey, shorts, Aegis armour, a helmet with a wrap visor, the Nova Reactor pack, the Pulse Launcher gauntlet and Velocity Boot hover-skates. It has a 17-joint rig and is tinted at runtime with each team's kit.
- **Equipment and venue:** energy ball, gravity orb, power core, holo target, three pickups, launch pad, Infinity Cup, goal frame, keeper drone, gravity hoop rig, capture zone, pitch, dasher boards, 8-tier stand, floodlight tower, jumbotron, spectator and skyline tower.
- **11-plate atlas** (PDF and PNG):
  1. athlete six sides with dimensions
  2. four quarter views
  3. detail review
  4. joint map and 12-pose sheet
  5. six team kits
  6. sport equipment
  7. scoring structures (front, side, top and iso)
  8. venue plan with two sections
  9. sport configurations
  10. venue modules
  11. arena circuit (the six venues)
- Ten GLB models.

## Full 3D game
- Six themed 3D stadiums assembled from the blueprint layout. Repeated modules are GPU instances, and the crowd (up to about 4,000 fans) is a single draw call that jumps for goals.
- Athletes are skinned meshes, about 9 draws each, with blended poses: skate stride, boost tuck, kick, two-hand shot, throw, blast, tackle, air, dunk, carry, stun and celebration.
- **New:**
  - AI teammates and passing
  - keeper drones
  - charged and perfect shots
  - jump and launch-pad slam dunks
  - walk-in goals
  - rim, post and backboard physics
  - telegraphed rival tackles
  - drifting and golden targets
  - moving hoops in later arenas
- **Match flow:** intro flyover, kickoff countdown, slow-motion celebrations, instant replays, final-whistle fireworks and a pause menu (resume, camera, restart, quit).
- **HUD:** radar, charge meter with the perfect band, off-screen ball arrow, ability chips, dunk cue and team names.
- **Controls:** a mobile analog stick, look-drag and six buttons; gamepad support; three camera modes.
- **Visuals and sound:** ACES tone mapping, bloom, glow, shadows, light shafts, a themed sky and procedural crowd audio. AUTO, HIGH and LOW graphics settings.

## Compatibility
- The save key `neon-sports-arena-save-v1` is unchanged, so credits, upgrades, stars and unlocks carry over. Returning players see the new six-step tutorial once.
- Host port 8105, `/healthz` and the portal manifest location are unchanged. The manifest now reports `version` 2.0.0 and its `url`.
- The service worker now loads pages network-first. Version 1.x served the cached page first, which would have kept players on the old build.

## Validation
- `npm test` passes 23 checks (blueprint contract, GLB parity, Babylon winding, physics, missions, metadata and health). Lint and typecheck are clean.
- Headless Chromium (software WebGL) was used for screenshots of all six arenas, the hangar, the hub, the settings menu and a phone layout, with no console errors.
- Scripted bot matches won 2-0 (match 1), 7-0 (match 2), 3-0 (matches 3 and 7), 2-0 (match 4), 4-1 (match 10), 4-0 (matches 13 and 15) and 8-5 (match 30, the final). The bot has no upgrades, so it lost the late matches 22 and 25.
- Still to check after installation: real-GPU frame rate and the public host.
