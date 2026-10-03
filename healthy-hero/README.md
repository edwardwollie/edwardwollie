# Healthy Hero 3D — v2.0.1

Healthy Hero is a wellness learning game for ages 5–12 at **https://healthy.flexzonicgames.com**.
Version 2 rebuilds the game as a full 3D experience while keeping every learning rule from v1.3.1.

## What children do

- **Choose a hero** — Pip the wellness robot, Mia, Leo, or Ginger the fox (the cast from the cover art).
- **Explore Wellness Island** — a 3D hub with six worlds (Fuel Garden, Hydration Falls, Move Mountain, Sleep Sky, Hygiene Harbor, Calm Grove), 30 mission stones on a spiral path, and world statues that read short facts aloud when tapped.
- **Run a mission** — the hero runs a three-lane track. Each of the six Power Gates asks a question from a different wellness world, and the world morphs to match the topic.
- **Steer to answer** — tap an answer card, use A/D or the arrow keys, press 1/2/3, or swipe. W, the Up arrow, swiping up, or DASH goes early; otherwise the hero reaches the gate when the timer ends.
- **Learn a Power Fact** — a helpful answer bursts the gate open; a miss is a gentle crash-through that shows the helpful answer. Either way the explanation is shown and read aloud before the next gate.
- **Extras** — Power Journal (all 72 facts, discovered/mastered), 60-second Move Break (copy the hero, seated options included), Bubble Breathing (5 calm breaths), Family Play deck, and a private Grown-up View with per-topic mastery.

## Learning rules kept from v1.3.1

- 72 encounters, 12 per topic; every mission mixes all six topics; missions 1–12 use all 72 before any repeat.
- Narration reads the question and all three choices first (each card lights up as it is read), then a **7-second thinking grace**, then answer windows of **30, 28, 26, 24, 22 seconds** across the five tiers.
- READ restarts the full read → think → answer cycle; pausing or switching tabs does the same when play resumes.
- Same scoring, hearts, stars, XP and badges; saves stay on the device under `healthy-hero-save-v1` (old saves keep working).
- No weight, calorie, appearance or body-shaming mechanics; not medical advice; no accounts, ads, microphone, camera or location.

## 3D blueprints

Every 3D model is generated from one spec file, `src/blueprints.js` (dimensions, joints, parts, colors).
The same file drives:

- the game's models (`src/models.js`) and animation rigs (`src/rig.js`),
- the **Blueprint Lab** (`src/blueprint-render.js`: edge-detected line art, orthographic views, live cm dimensions),
- the printable 21-sheet **blueprint book**: `blueprints/healthy-hero-3d-blueprints.pdf`.

The Blueprint Lab and the blueprint book are **internal**. The Lab only appears when the game is opened
from `localhost` (run `npm start`, then open http://localhost:3000). The public site does not show it, the
Docker image does not include `blueprints/` or `tools/`, and the production server returns 404 for them.

Regenerate the sheets after changing a model:

```bash
npm i -D playwright pdf-lib
npx playwright install chromium
node tools/render-blueprints.mjs          # all sheets + PDF
node tools/render-blueprints.mjs pip-elev # one sheet
```

`scripts/blueprints.test.mjs` fails if a model drifts more than 1.5 cm from its blueprint's overall size.

## Project layout

```
index.html, styles.css          app shell + interface (fonts self-hosted in assets/fonts)
src/main.js                     game controller: timing rules, screens, saves, input
src/content.js                  72 encounters, worlds, family deck, facts, moves
src/mission-plan.js             mission mixing + kid timing constants
src/blueprints.js               3D blueprint specs + gameplay layout
src/models.js, rig.js           model builder + procedural animation
src/world.js, gates.js, run.js  3D run: biomes, Power Gates, camera
src/island.js, stage.js         Wellness Island hub; hero select / celebration / lab / activities
src/engine.js, effects.js       renderer, adaptive quality, particles
src/audio.js, narrator.js       synthesized sound + narration
src/vendor/three.module.min.js  three.js r186 (MIT), served locally for the strict CSP
classic/                        v1.3.1 2D game kept as a fallback (/classic/)
blueprints/                     blueprint book PDF (+ sheet images; private, not deployed)
tools/                          blueprint sheet generator and preview pages (not deployed)
scripts/                        node --test suites
```

## Run locally

```bash
npm test
npm start            # http://localhost:3000 (Blueprint Lab visible here only)
```

Devices without WebGL are offered Healthy Hero Classic automatically. The Grown-up View has Motion (reduced) and 3D quality settings; quality also adapts automatically to the device's frame rate.
