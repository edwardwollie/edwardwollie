# Spaceflight Academy v3.0.0 Validation Report (3D edition)

Validated on 2026-10-01 in an isolated Linux build environment (Node 22, Chromium with
SwiftShader software WebGL for browser checks).

## Automated tests: 26 / 26 passed (`npm test`)

`npm test` type-checks, builds both editions and runs every suite:

* **v2.1 learning suite (kept):** age-adaptive progression, all 90 classic builds solvable,
  72 encounters per path with no repeat in missions 1–12, narration voice/units, Classic Variety
  Rush rules.
* **3D Space Rush:** narration of the question and all three answers comes first (no countdown
  and no answering while it plays); stale narration callbacks ignored; 7-second thinking time;
  windows 30/28/26/24/22 s by tier; READ AGAIN restarts narration + thinking + full window;
  wrong gates crash through and the mission continues; Star Fact read after every gate;
  relaxed timing has no countdown; time-outs fly through the lined-up gate; same six questions and
  lane rotation as v2.1; v2.1 star and XP rules.
* **Rocket engineering:** all 90 missions (3 paths × 30) are solvable, never solved by the
  starting rocket, and always allow 3 stars; TWR = thrust / weight; more fuel raises delta-v and
  lowers TWR; more engines raise TWR; fins increase the stability margin; ascent simulation
  climbs; meters stay within 0–100; Cosmo always gives a concrete next step.
* **Blueprints:** 41 blueprints with unique ids and drawing numbers, every sub-assembly reference
  resolves, **every 3D model matches its blueprint within 1.5 cm on all three axes**,
  third-angle view conventions, Comet stack order and exploded-view order.
* **Save compatibility:** a real v2.1 save loads with progress, stars, XP, settings and unknown
  keys intact and is written back intact; malformed data is repaired; the Classic edition keeps
  the nested v3 data when it saves.
* **Content:** 216 unique Star Journal questions, 19 achievements, observatory data ordering,
  Jupiter (10 Jan 2026) and Saturn (4 Oct 2026) oppositions reproduced by the orbit model,
  gravity-jump physics (Moon ≈ 6× Earth).
* **Server:** `/healthz`, 3D page, `/classic/` page, `/classic` → `/classic/` redirect,
  immutable caching for hashed assets, no-cache for HTML/JSON/service worker, 404 for missing
  assets, SPA fallback, metadata v3.0.0, 405 for POST, no path traversal.
* **Deployment metadata:** package, version.json, portal JSON (Educational, order 38, v3.0.0),
  manifest start URL, compose image tag, deploy script, service-worker cache name
  `spaceflight-academy-v3.0.0-3d` precaching `/` and `/classic/`.

## End-to-end mission test (`tools/qa/e2e.mjs`): passed on desktop and phone

Drives the real UI in Chromium from a fresh save: title → crew path and cadet → Spaceport →
Mission Control map → briefing → Space Rush (6 gates, one answered wrong on purpose) → Rocket
Hangar (cheapest winning build) → launch → orbit insertion → results.
Result at 1280 × 720 and at 390 × 844 (touch): mission 2 unlocked, 2 stars (one mistake),
292 XP, 5 Star Journal facts, Launch Deck passport stamp, "First Liftoff" achievement.

## Other checks

* `tsc --noEmit` and ESLint: clean.
* Clean install from the lockfile (`npm ci`) and production build in a fresh copy: passed.
  The runtime stage (dist + server.mjs only, as in the Dockerfile) answered `/healthz`,
  `/`, `/classic/` and `/version.json` correctly. Docker itself was not available in this
  environment; `./deploy.sh` performs the same build inside Docker on the server.
* `npm audit --omit=dev`: 0 vulnerabilities.
* Classic edition loaded at `/classic/` with a v3 save: shared stars, star cores, XP and
  unlocked missions displayed; v3 data preserved after Classic wrote the save.
* Visual review of every screen at desktop and phone sizes: title, onboarding, hub, map,
  briefing, Space Rush (question, crash-through, fact), hangar (mission, sandbox, engineer view),
  launch phases, all six destination activities, results, Observatory (orbits, true distances,
  sizes, gravity jump on 8 worlds), Blueprint Studio (all views, labels, dimensions, exploded,
  View Detective), Crew Lounge tabs, Training Center, Grown-ups page, settings and pause.
* Blueprint book: 49 A3 sheets and 328 single-view images rendered from the live specs; PDF
  has 49 bookmarked A3 landscape pages.
* Science data: planet facts from NASA fact sheets; known moon counts as published by NASA in
  mid-2026 (Jupiter 115, Saturn 293, Uranus 29, Neptune 16), labelled "known moons, mid-2026".

## Notes for the live server

* Rendering was verified with software WebGL. Please also try a real phone and tablet; the
  game starts at a quality level picked for the device and steps down automatically if the frame
  rate is low (Settings → Graphics can force Low/Medium/High).
* Devices without WebGL 2 are redirected to `/classic/` after showing a short message.
