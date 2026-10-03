# Wildfront Horizon 3.0.2 — 3D Blueprint Edition

A full 3D hunting game for the Flexzonic Games portal (https://hunt.flexzonicgames.com). Every model in the game is built from an engineering blueprint.

## Where things are

- **`app/game3d/`** — the 3D edition.
  - `blueprints/` — 37 blueprints: wildlife, gear, structures, flora and the reserves. This folder is the single source of truth.
  - `models/` — turns blueprints into meshes.
  - `world/` — terrain, vegetation, water, sky and weather.
  - `hunt/` — player, weapon and ballistics, wildlife AI, senses, sign and scoring.
  - `render/` — line-art blueprint renderer, snapshots and topographic maps.
  - `modes/` — lodge backdrop and Studio viewer. The Blueprint Studio screen is only shown by `npm run dev`; production builds leave it out.
  - `audio/` — procedural audio.
  - `ui/` — React screens and the HUD.
- **`app/classic/`** — the Classic 2.0.3 edition, served at `/classic`.
- **`tools/blueprint-book/`** — generates the A3 blueprint book (47 sheets) and the single-view PNG packs.
- **`tools/dev/sync-overall.mjs`** — measures every reference build and regenerates `blueprints/overall.ts`.
- **`tools/qa/e2e-hunt.mjs`** — plays a full contract end to end through the real UI (desktop or touch), including climbing every tower, stand and blind in the reserve.
- **`tools/hunt`, `tools/showcase`, `tools/world`, `tools/preview`** — dev harness pages served by `npm run blueprints:tools`.
- **`tests/`**:
  - `wildfront-v3.test.mjs` — rules, saves, ballistics, senses, blueprint conformance, the view from every tower, stand and blind, reserves and deployment metadata.
  - `wildfront-v2.test.mjs` — the classic regression suite.
  - `rendered-html.test.mjs` — server-render smoke test.

## Commands

```bash
npm ci
npm run dev                 # local development
npm run test:unit           # unit tests (Node 22.13+)
npm test                    # unit tests + production build + server-render test
npm run blueprints:sync     # check blueprint conformance (±15 mm)
npm run blueprints:tools    # sheet and view previews: /blueprint-book/index.html?sheet=3
npm i --no-save playwright && npx playwright install chromium   # once, for the two commands below
npm run blueprints:export && npm run blueprints:pdf   # A3 book (resumes if interrupted; pip install reportlab pillow)
npm run build && npm start                  # terminal 1
BASE=http://127.0.0.1:3000 npm run e2e      # terminal 2: full contract through the real UI (add -- 390 844 --touch for phones)
```

Deployment is unchanged: Docker, port 8096, `/healthz` → `wildfront-ok`. See `INSTALL.md` (installer: `install-v3.0.2.sh`).
