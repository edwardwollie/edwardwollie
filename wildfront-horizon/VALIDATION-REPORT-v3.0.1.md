# Wildfront Horizon v3.0.1 — Validation Report

Validated on 2026-10-02 before packaging. The checks were repeated from a clean unzip of the delivered archive using `npm ci`.

## The reported problem
"When I climbed, I am blocked in all directions and can't see anything."

Reproduced in 3.0.0 by climbing every tower, stand and blind in all five reserves (15 positions) and capturing four headings from each:
- **Lookout towers:** the cab glazing was opaque, and the climb put the hunter in a crouch with the eye at the top of the board walls. The view was blocked on all four sides.
- **Ground blinds:** the blind was a closed box. Its windows were painted-on black panels.
- **Tripod stands:** the view was open, but the shooting rail cut across the lower part of it.

## The fix, checked three ways
1. **Unit test (blueprints):**
   - Each climbable structure is built from its blueprint.
   - From the hunter's eye, rays are cast at 8 headings, level and 0.12 rad down. Nothing opaque may sit within 3 m.
   - The 3.0.0 geometry fails this test: 16 of 16 rays blocked with the opaque glazing, and 8 of 16 with the crouched eye. 3.0.1 passes with 0 of 16 blocked.
2. **All five reserves (dev harness):**
   - All 15 towers, stands and blinds were climbed through the game's own climb action.
   - Every one gives an open view: 0 of 16 rays blocked, and the direction the hunter faces after climbing is open.
   - From each blind, a test shot out of the chosen window travels clear of the blind. It met terrain or a tree 17–257 m away.
3. **End-to-end, real UI:** in the contract reserve, all 4 positions (tower, 2 stands, blind) were climbed with an open view from each, at both desktop and phone sizes. Screenshots from the cab, the stand and the blind were reviewed.

## Automated tests
- **Unit tests (`npm run test:unit`): 26/26 PASS**, including two new tests:
  - the view from every tower, stand and blind, with the eye heights checked against the window band, the shooting rail and the blind's window openings;
  - a shot from inside a blind leaves the blind, while a tree down range still stops it.
- **Blueprint conformance:** all 37 blueprints rebuild within ±15 mm of their recorded overall dimensions (`npm run blueprints:sync`).
- **Server-render smoke test against the production build: 3/3 PASS** (`/`, `/classic` and `/healthz` → `wildfront-ok`).
- **End-to-end (`npm run e2e`): PASS at 1280×720 (desktop) and 390×844 (touch).** Each run covers:
  - lodge → briefing → engage card → HUD;
  - climbing every tower, stand and blind, with an open view from each;
  - a vital shot graded GREAT → shot card → tag → debrief → claim;
  - the save after claiming;
  - no page errors.

## Static checks
- **ESLint:** 0 errors.
- **TypeScript:** 0 errors in the 3D edition and tools. The same 6 errors as in 3.0.0 remain in code this release does not touch: the classic Babylon engine, and the template's Cloudflare `db/` and `worker/` typings.

## Build and deployment metadata
- `vinext build` succeeds.
- Version 3.0.1 in `package.json`, `package-lock.json`, `public/version.json`, the portal manifest, Settings and the blueprint book cover.
- Port 8096 and health `wildfront-ok`. `Dockerfile`, `docker-compose.yml` and `deploy.sh` are unchanged.

## Blueprint book
- Regenerated: 47 A3 sheets and the bookmarked PDF.
- Reviewed:
  - S-01 (rev B): clear glazing, with the eye line at 10.93 m inside the window band.
  - S-02: the eye line at 5.77 m, above the shooting rail.
  - S-03 (rev B): window openings, with the eye line at 1.22 m through the windows.
  - The cover now shows release 3.0.1.
- The single-view plates for S-01 and S-03 were re-rendered.

## Not verified here
- Real-GPU frame rates. Software WebGL is used for every check.
- The Ubuntu Docker deployment itself: `./deploy.sh` on the host is the final gate.
