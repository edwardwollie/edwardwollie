# Spaceflight Academy v3.0.2 · 3D edition

Spaceflight Academy is a space-science and rocket-engineering game for ages 5–12.
Version 3 turns the whole Academy into a 3D world built from engineering blueprints, while
keeping every learning rule, all 216 questions, the 90 missions and the saved progress of v2.1.
The Classic 2D edition is still included at **/classic/** and shares the same save.

## What players do

1. **Walk the Spaceport.** Choose a crew path (Star Scout 5–7, Orbit Pilot 8–10, Mission
   Commander 11–12), a cadet (Omari, Mei, Finn or Sofia) and a suit colour, then explore the
   campus with Cosmo the robot. Glowing door rings open each building. A true-distance Planet
   Walk runs from the plaza to the beach.
2. **Fly the 3D Space Rush.** Six learning gates per mission, built from the v2.1 question decks.
   The narrator reads the question **and all three answers** before anything starts, then there
   are 7 seconds to think and an answer window of 30 → 28 → 26 → 24 → 22 seconds by mission
   tier. READ AGAIN restarts the narration, the thinking time and the full window. Correct
   gates split open; wrong gates crash through, explain the right answer and the mission goes on.
   A Star Fact is read in full after every gate. Grown-ups can switch on Relaxed timing.
3. **Engineer the rocket.** In the Rocket Hangar, parts fly in and stack on the real 3D rocket.
   Real (simplified) physics decides the result: thrust-to-weight of at least 1.1 to lift off,
   delta-v from the rocket equation (with booster staging) to reach the destination, and the
   centre of pressure behind the centre of mass to fly straight. Engineer view shows the force
   arrows. Every mission is checked by tests to be solvable, never pre-solved, and 3-star-able.
4. **Launch.** Countdown, ignition, ascent through the clouds, Max-Q, booster separation and
   the view from space.
5. **Finish the mission at the destination:** orbit insertion, docking with Orbital School,
   Moon landing, Mars landing plus rover drive, asteroid sample grab, or an Outer Worlds photo
   flyby. Stars and XP use the exact v2.1 rules.

## Free-play stations

* **Star Observatory**: the Solar System with the planets where they really are today
  (JPL orbital elements), time speed from a day to a year per second, true-distance mode, a
  true-scale size line-up, and the **Gravity Jump** lab (same legs, different gravity: Moon,
  Mars, Pluto and more).
* **Blueprint Studio (internal)**: all 41 blueprints in 3D, in line-art or colour, from every
  side, with live dimensions, part callouts, exploded views and the **View Detective** game.
  It is hidden in production builds (no building, menu button, screen or achievements) and
  appears only when you run `npm run dev` locally.
* **Training Center**: practise any of the six flight finales without stars at stake.
* **Crew Lounge**: cadet and suit, rank, Star Journal (every fact collected), badges and
  achievements, Space Passport, photo album and saved rocket designs.
* **Family Space Lab**: six safe, offline activities for a child and a grown-up.
* **Grown-ups page**: progress per path, what is being learned, the learning rules, privacy.

## Blueprints are the source of truth

Every object (cadets, Cosmo, rockets and the 15 rocket parts, spacecraft, every building and prop,
the Moon and Mars bases) is a blueprint in `src/v3/blueprints` with a drawing number, overall
size in metres, named parts, materials and facts. The same spec builds the in-game 3D model,
the (internal) Studio views and the printable **3D Blueprint Book** (`tools/blueprint-book`,
never served by the site). A test
fails if any model drifts more than 1.5 cm from its blueprint.

## Controls

| | Keyboard | Touch |
|---|---|---|
| Spaceport | WASD / arrows to walk, Q/E to turn | joystick, tap the ground, drag to look |
| Space Rush | A/D or ←/→ (or 1/2/3) to pick a gate, W/↑/Space/Enter to boost, R to read again | tap a gate, BOOST |
| Activities | Space / W to hold the engine, arrows to steer | on-screen HOLD and arrow buttons, joystick |
| Everywhere | Esc or P to pause | ⏸ |

## Development

```bash
npm ci
npm run dev          # http://localhost:5173  (Classic: /classic/)
npm test             # type-check, production build, 29 tests (learning, engineering, blueprints, save, graphics, server)
npm run lint
```

Optional browser tooling (not part of the game build):

```bash
npm i --no-save playwright && npx playwright install chromium
npm run e2e          # full mission end to end through the real UI (needs npm run dev)
npm run blueprints   # renders the blueprint book sheets and single views (see tools/blueprint-book)
```

`?quality=low|medium|high` forces a graphics level; `?qa=1` exposes test helpers as `window.__sfa`.

## Project layout

```
src/                 v2.1 Classic edition (unchanged) and shared data (questions, missions)
src/v3/blueprints    blueprint specs (types, kit, cast, rocket, vehicles, spaceport, destinations)
src/v3/models        blueprint → three.js builder, rig/poses, views, blueprint line-art renderer
src/v3/engine        renderer/loop, input, audio, narrator, procedural planets and effects
src/v3/learning      Space Rush rules (RushSession)
src/v3/engineering   rocket physics and the 90 engineering missions
src/v3/scenes        hub, map, rush, hangar, launch, studio, observatory
src/v3/activities    orbit, docking, Moon/Mars landing, asteroid, photo flyby
src/v3/ui            React HUD and screens
tools/               blueprint book generator, preview and QA scripts
tests/               node --test suites
```

## Deploy

Docker publishes host port **8119** (container port 3000) on Docker's built-in bridge network;
`/healthz` returns `spaceflight-academy-ok`. See [INSTALL.md](INSTALL.md).
