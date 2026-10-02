# Cyber Ninja Academy 2.0.0 — Combat 2.0

This release is a full gameplay-quality upgrade rather than a cosmetic patch.

## Strike system

- Replaced the ambiguous single-color strike target with concentric rings, slash glyph geometry, lock-on state, ready state, and directional target guidance.
- Target colors transition from violet at distance, to orange during lock, to bright cyan in the strike window.
- Added large HUD prompts: `LOCKING TARGET`, `TARGET LEFT/RIGHT`, and `STRIKE NOW`.
- Added a longer, multi-stage Photon Edge slash with body rotation, visible blade arc, multiple energy afterimages, forward dash, FOV punch, hit-stop, camera shake, sparks, and procedural audio.

## Obstacle rhythm

- Removed the old random obstacle-every-13-meters generator.
- Added deterministic mission-based course generation so retries remain learnable and fair.
- Encounter spacing starts around 32 meters and progressively tightens while preserving readable reaction time.
- Added tall orange shift walls alongside jump barriers, slide lasers, strike drones, and data shards.
- Repeated action streaks are broken up so three identical actions are not deliberately queued in a row.

## Cyber Ninja identity

- Rebuilt the procedural hero with an angular helmet, cyan helmet fins, magenta visor, armored shoulders, chest energy core, shin guards, animated scarf strips, and a larger cyan Photon Edge.
- Added running limb animation, torso motion, scarf movement, strike pose changes, and blade trails.

## UI and feedback

- Added distinct center-screen action telegraphs for strike, jump, slide, and shift.
- Added velocity readout, scanline overlay, stronger combo effects, and improved impact messaging.
- Mobile STRIKE is larger than surrounding controls, uses a sword icon, and has dedicated cyan/magenta treatment.
- Expanded first-time training from four to five steps to explicitly teach the new target-ring language and Flow Combo system.

## Compatibility

- Existing local save key is unchanged, preserving unlocked missions, stars, credits, upgrades, and tutorial completion.
- Port remains 8099.
- Health response remains `cyber-ninja-ok`.
- Portal hostname remains `ninja.flexzonicgames.com`.
