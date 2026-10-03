# Hypernova Circuit v3.0.0 Validation

Checked before release:

- `npm run typecheck` and `npm run lint` pass with no errors.
- `npm test` (production build + 17 checks) passes:
  - The runtime three.js geometry of all 12 blueprint assets matches `blueprint-spec.json` (bounds within 2 mm, identical triangle counts, finite normals).
  - Every car has a six-view plate, a valid GLB, garage-matching paint and thruster anchors.
  - All six circuits close, their frames are orthonormal and upright, every feature sits on the road, and the Void Bridge rises 12 m.
  - On every circuit the full 7-rival AI field finishes 3 laps with no instability and at most 2 barrier strikes; laps run 25–55 s.
  - Driving model: full lock alone keeps traction, a brake tap starts a drift and releasing banks it, barriers contain the car, contacts separate.
  - v2 saves load unchanged; Grand Prix records, unlocks and prize ordering work.
  - The production bundle has no internal BLUEPRINT toggle; the server renders the new menu and `/healthz`.
- `design_tracks.py` asserts a bend radius ≥ 40 m, grade < 14 % and bridge clearance ≥ 9 m.
- Played in headless Chromium (software WebGL): menu showcase, circuit select, countdown, racing with the chase/far/hood/TV cameras, slipstream, garage showroom views, Endless Storm, and the switch back to the menu. No console or page errors; a single WebGL canvas after mode switches.
- Not checked here: frame rate on real phones and GPUs. Software rendering in the container runs at about 2–3 fps, which says nothing about real hardware. AUTO graphics drops to LOW below about 38 fps.
