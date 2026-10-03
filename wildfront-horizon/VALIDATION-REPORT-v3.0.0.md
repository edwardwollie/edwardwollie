# Wildfront Horizon v3.0.0 — Validation Report

Validated on 2026-10-02 before packaging. The checks were repeated from a clean unzip of the delivered archive using `npm ci`.

## Automated tests
- **Unit tests (`npm run test:unit`): 24/24 PASS.**
  - The 14 v3 tests cover:
    - the 12 contracts are identical to v2.0.3;
    - Field Kit names and the 120 × (level + 1) pricing;
    - PERFECT/GREAT/GOOD grades, points and stars;
    - trophy ratings and credits;
    - save key and v2 → v3 migration;
    - free-hunt unlocks;
    - ballistics (.308 drop, drift and energy);
    - senses (scent, hearing, sight);
    - blueprint conformance;
    - species completeness;
    - deterministic reserves with a dry trailhead;
    - achievements, imperial units, deployment metadata and the scoped classic CSS.
  - The 10 classic v2.0.3 regression tests now run against `app/classic`.
- **Blueprint conformance:** all 37 blueprints rebuild within ±15 mm of their recorded overall dimensions (`npm run blueprints:sync`).
- **Server-render smoke test (`tests/rendered-html.test.mjs`) against the production build: 3/3 PASS.**
  - `/` renders the 3D shell.
  - `/classic` renders the classic edition.
  - `/healthz` returns `wildfront-ok` with `no-store`.
- **End-to-end (`npm run e2e`, real UI, Chromium with software WebGL): PASS at 1280×720 (desktop) and 390×844 (touch).** Each run covers:
  - lodge → briefing → engage card → HUD;
  - a licensed animal at 100 m, scoped, then a vital shot graded GREAT;
  - shot analysis card → walk up and tag (tag card) → debrief with achievements → claim;
  - the save after claiming: contract 2 unlocked, 3 stars, 120 + 90 credits, 1 trophy;
  - no page errors.

## Static checks
- **ESLint:** 0 errors across the 3D edition, tools and tests. The whole project has 1 warning, an unused variable in the unchanged classic engine.
- **TypeScript (`tsc --noEmit`):** 0 errors in the 3D edition and tools. The remaining 6 errors existed before this release and are in code this release does not touch:
  - 3 in the classic Babylon engine (`Nullable<Vector3>`);
  - 3 in the template's Cloudflare `db/` and `worker/` typings.

## Build
- `vinext build` succeeds.
- On `/`, the browser preloads only the small 3D entry. The 3D app (about 1.0 MB, minified) loads after the WebGL2 check. The classic Babylon bundle loads only on `/classic`.
- `public/version.json` 3.0.0 · port 8096 · health `wildfront-ok`. Portal manifest version 3.0.0, `https://hunt.flexzonicgames.com`, `/healthz`, Adventure, order 40.
- Unchanged: `Dockerfile`, `docker-compose.yml` and `deploy.sh` (port 8096 → 3000, read-only container, health check).
- `package-lock.json`: the root version is 3.0.0. Added packages: `three` 0.186.1, `@types/three`, `@fontsource/barlow-condensed` and `@fontsource-variable/inter` (plus their transitive packages). A clean `npm ci` from the lock succeeds.

## Visual checks (software-rendered Chromium screenshots)
- **Desktop screens reviewed:** lodge with live 3D backdrop, contracts, briefing map, Free Hunt, Gear Locker, Field Guide, Blueprint Studio, Trophy Lodge, Settings, engage card, HUD, scope, shot analysis card, tag card, binoculars and debrief.
- **Phone screens reviewed (390×844):** lodge, contracts, briefing, engage, HUD with touch controls, scope, shot card and debrief.
- **Fixed during validation:**
  - Entrance animations no longer cancel the transform that centres the cards.
  - The shot card fits short viewports.
  - The scope label and breath meter now sit inside the ring.
  - The phone HUD no longer overlaps (minimap and compass).
  - Debrief achievements are listed on the card instead of in toasts.
  - Map labels avoid each other and the landmark symbols.
  - Animal labels no longer double the species name ("Wild Boar", not "Wild Boar Boar").
  - Wildlife, grass and water now share the world fog with the terrain and trees, so game fades into mist correctly.
  - On phones, toasts are capped at two and step aside while the shot card is open.
  - The briefing-map trailhead label and the north arrow no longer collide when the trailhead sits in a corner.

## Blueprint book
- 47 A3 sheets in third-angle projection at standard scales, each with a title block and zone frame.
  - The structure register is renumbered S-01…S-09 with no gaps.
  - Title blocks carry each drawing's own revision letter, the same as the Studio shows. The book release, 3.0.0, is on the cover.
- Spot-checked sheets:
  - cover and conventions;
  - all three mule deer sheets;
  - anatomy sheets for wild boar, elk, bighorn sheep and bison;
  - bighorn gaits;
  - the three rifle general arrangements at 1:5;
  - binoculars, lookout tower and flora trees;
  - survey sheets M-01 to M-03.
- 307 single-view plates (front, back, left, right, top, bottom, isometric, rear isometric, exploded, female and colour renders), rendered from the same blueprints.

## Not verified here
- Real-GPU frame rates. Software WebGL needs several seconds per reserve frame, so the end-to-end runs step the simulation directly. The adaptive-resolution governor and the auto quality preset are designed to hold 45–60 fps on real devices.
- The Ubuntu Docker deployment itself: `./deploy.sh` on the host is the final gate, as for 2.0.3.
