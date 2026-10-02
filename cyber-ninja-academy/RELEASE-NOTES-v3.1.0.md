# Cyber Ninja Academy 3.1.0 — Survival course

- **Win condition:** Reach the finish gate with integrity above zero. The number of shards collected and drones destroyed no longer determines success or trial unlocks. An ignored drone does not cause damage.
- **Denser courses:** Trial 1 now has 22 hazard waves; trial 12 has 80. Hazard waves are planned independently from optional bonuses, with more two-lane formations and later full gates that always offer a jump or slide route. Each wave is spaced at least 21 m from the next.
- **New hazards:** Floor spikes require a jump, sweep bars require a slide, and crusher shutters require a lane change. A visible finish gate marks the end. Classic barriers, lasers, and walls remain.
- **Reward balance:** Passing hazard waves cleanly drives Flow and score. Finishing earns the full base reward, with optional shards and drones adding at most 20% credits. Stars depend on integrity and clean waves, never bonus quotas.
- **Interface:** Trial cards, tutorial, live HUD, action cues, results, and failure advice now prioritize distance, hazard waves, integrity, and survival. PREPARE changes to JUMP NOW or SLIDE NOW at a speed-adjusted distance.
- **Assets:** New obstacle meshes use the shared indexed blueprint data. The four-page atlas adds a survival hazard plate. The runner and drone 3D exports remain available.

The `cyber-ninja-save-v1` key is retained, so earned credits, upgrades, unlocked trials, and best stars carry forward. Returning players see the new survival tutorial once. The host port remains 8099.

## Validation

`npm test` passes 11 checks covering all 12 course layouts, geometric match, bonus and hazard collision behavior, build, metadata, and health endpoint. Babylon's NullEngine rendered complete trial 1 and trial 12 scenes. Browser WebGL gameplay and the public host must be checked after installation.
