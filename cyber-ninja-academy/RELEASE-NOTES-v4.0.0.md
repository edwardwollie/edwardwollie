# Cyber Ninja Academy 4.0.0 — Full 3D upgrade

## New realistic operative (3D blueprint series 04)
- Rebuilt from scratch with athletic human proportions: 1.92 m tall, 0.56 m across the shoulders. The old model was a blocky 2.75 m suit.
- The body is a smooth lofted carbon under-suit made from anatomical cross sections. The armour is a set of conformal shells offset from that body: chest plate, back plate, pauldrons with lames, bracers, thigh plates, knee caps, greaves and calf guards. There is a wrap-around light visor, sensor pods, a faceplate, a back reactor ring with thrusters, a katana sheath, a scarf, and a photon katana with a tsuba.
- The model has 131 parts and 23,332 triangles, about three times the detail of 3.1.
- A 16-joint skeleton (neck, head, spine, chest, shoulders, elbows, wrists, hips, knees, ankles), plus the blade and scarf, drives real animation. The poses are stance, sprint, airborne tuck, double-jump somersault, power slide, phase dash, a three-hit katana chain and a hurt reaction.

## Blueprints
- A six-plate atlas (PDF and PNG), rendered from the exact game geometry with anti-aliasing and technical contour lines:
  1. six orthographic sides with dimensions
  2. four quarter views
  3. detail review (helmet, reactor, katana)
  4. joint map and pose sheet, read back from the game's own pose functions
  5. City Ops assets
  6. survival hazards
- GLB models of the operative, the hunter drone and the uplink beacon.
- The atlas is also downloadable inside the game from the Blueprint Hangar.

## City Ops — free-roam 3D mode
- Four deterministic rooftop sectors, from 4×4 up to 6×6 blocks. Rooftops climb toward a summit beacon. Every roof is guaranteed reachable through a spanning tree of bridges, and a launch pad is added wherever a rise is higher than a double jump.
- Third-person orbit camera with mouse-look, pointer lock, camera collision and speed FOV.
- Movement: sprint, coyote time, jump buffering, double-jump somersault, phase dash with invulnerability frames, step-up onto low ledges, launch pads and fall recovery.
- Combat: a three-hit katana chain with soft lock-on, lunge and air juggling, homing shuriken, hit-stop and screen shake, and bolt deflection.
- Hunter drones orbit, strafe, telegraph each shot and fire leading plasma bolts. Elite sentinels are larger and fire three-shot spreads.
- HUD: objective marker, lock-on reticle with drone health, radar, ability meters, altitude, and time against par.
- Mobile: analog stick, look-drag zone and four action buttons.

## Presentation (both modes)
- Cinematic pipeline: ACES tone mapping, bloom, FXAA, vignette, light grain and subtle chromatic aberration. Mobile turns the heaviest effects off.
- Starfield sky dome, a glowing city grid far below, lit window facades, a hero fill light, fresnel rim on the armour, and softer PCF shadows.
- Procedural synthwave soundtrack (toggle ♪) and new sound effects.

## Compatibility
- The save key `cyber-ninja-save-v1` is unchanged, so credits, upgrades, trial unlocks and stars carry forward. New City Ops progress is added to the same save.
- Host port 8099, `/healthz` and the portal manifest location are unchanged. The manifest reports 4.0.0.

## Validation
- `npm test` passes 15 checks.
- Lint and typecheck are clean.
- In headless Chromium (software WebGL) the following were checked: academy, City Ops, Survival Trials, Hangar, and a phone layout in landscape. A scripted City Ops playthrough collected all shards, destroyed all drones, activated the beacon, completed the operation and saved credits and the unlock, with no console errors.
- Real-GPU frame rate and the public host still need to be checked after installation.
