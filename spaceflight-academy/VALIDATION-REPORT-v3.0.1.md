# Spaceflight Academy v3.0.1 Validation Report

Patch release for the High graphics brightness problem. Validated on 2026-10-02.

## The problem (reproduced)

Screenshots with `?quality=high` showed the Spaceport and Rocket Hangar almost completely white
and the Space Rush answers unreadable, while `?quality=medium` looked correct. Cause: the High
pipeline ran full-screen bloom on the untone-mapped (HDR) frame, so every bright surface
(white buildings in sunlight, white suits, text panels) crossed the bloom threshold.

## The fix

* High renders the normal frame exactly like Medium, then renders only glowing objects into a
  half-resolution target (everything else black so it still blocks glows behind it), blurs it
  with UnrealBloomPass and adds the halo on top with a soft clip.
* What glows: emissive materials with intensity ≥ 1 (the blueprint light materials), additive
  effects, and objects flagged `userData.bloom` (gate rings, door rings and arrows, the Sun).
  Atmospheres, star fields, rush dust and gate membranes are flagged `noBloom`.

## Checks

* Side-by-side screenshots, High vs Medium, of the Spaceport, mission map, Space Rush (idle and
  selected gate), Rocket Hangar, launch, Observatory, orbit, Mars landing and photo flyby:
  High now matches Medium with added glow only on lights, rings, flames and the Sun; gate answers
  stay readable.
* `npm test`: type check, production build and **28 / 28 tests passed**, including two new
  regression tests: white, text and normally lit materials never glow (and every blueprint
  palette material is classified correctly), and the engine draws the normal frame before the
  glow with no full-frame post-processing chain.
* ESLint clean. Version metadata, service-worker cache name (`spaceflight-academy-v3.0.1-3d`),
  compose image tag and deploy script updated to 3.0.1.
* End-to-end mission test (title → Space Rush → hangar → launch → orbit → results) passed.
