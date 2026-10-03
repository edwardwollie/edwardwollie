# Spaceflight Academy v3.0.0 · 3D edition

## A full 3D Academy

* **3D Spaceport hub** with seven buildings, Launch Complex 1 with the Comet on the pad, paths,
  beach and a true-distance **Planet Walk** (2.15 m per astronomical unit). Walk with a joystick,
  WASD or tap-to-walk; Cosmo the robot follows you; crew members share space facts.
* **Four cadets and Cosmo** built from blueprints with an 11-joint rig (idle, walk, run, wave,
  cheer, point, float, sit, jump, clap, think, pilot) and blinking eyes. Six suit colours.
* **3D mission map**: six sectors, 30 mission beacons per path, boss beacons, "you are here" Comet.

## Learning (unchanged rules, new world)

* Same 216 questions (72 per crew path), same six topics, same mission decks and lane rotation.
* Narration of the question **and all three answers** first → 7-second thinking time → answer
  window 30/28/26/24/22 s by tier. READ AGAIN restarts everything. Wrong answers never reset a
  mission.
* New: the Star Fact is read in full after every gate and saved to the **Star Journal**.
* New: **Relaxed timing** setting for grown-ups (no countdown).

## Engineering with real physics

* The 12 v2.1 rocket systems are real 3D parts (S-00…S-14) that fly in and stack in the hangar.
* Thrust-to-weight, two-stage rocket-equation delta-v with booster staging, and centre of
  mass / centre of pressure stability drive the four familiar meters (Thrust, Fuel & Energy,
  Stability & Safety, Mission Systems).
* Mission goals are generated from every buildable rocket: all 90 missions are tested to be
  solvable, never solved at the start, and always 3-star-able. Cosmo explains the next step.
* Engineer view with force arrows, CoM/CoP markers and live numbers for older cadets.

## Launch and six destination finales

* Cinematic launch: countdown, tower arm swing, steam, ignition, clouds, Max-Q, booster
  separation, Earth from space.
* Orbit insertion · docking with Orbital School · Moon landing · Mars entry, parachute, landing
  and rover drive · asteroid sample grab · Outer Worlds photo flyby. Difficulty adapts by age.

## New stations

* **Star Observatory**: real planet positions for today, time controls, true distances, a
  true-scale size line-up and the **Gravity Jump** lab. Data from NASA fact sheets; moon counts
  as reported by NASA in mid-2026.
* **Blueprint Studio**: all 41 blueprints from every side, line-art or colour, dimensions, part
  callouts, exploded views and the **View Detective** game.
* **Training Center**, **Crew Lounge** (journal, badges, passport, photo album, saved rockets),
  **Family Space Lab**, and a **Grown-ups** page. 19 achievements.

## 3D Blueprint Book

* 49 A3 sheets generated from the game's own blueprint specs: cover, how to read a blueprint,
  crew line-up, one third-angle sheet per object (front, back, left, right, top, bottom, colour
  isometric, dimensions, parts list, title block), Comet exploded assembly, the 12 rocket
  systems, site plan, Solar System to scale and the mission route. Plus single views of every
  object from every side.

## Platform

* three.js r186 + React 19 + Vite 8. Quality levels with automatic downgrade on slow devices,
  bloom on high quality, baked static geometry and instancing for props.
* The Classic 2D edition is served at `/classic/`; both editions share the save.
* Devices without WebGL 2 open the Classic edition automatically.
* Offline-ready service worker for both editions; immutable caching for hashed assets.
* Server: `/classic/` directory index, real 404s for missing assets, permissions policy
  (no camera, microphone or location).

## Portal metadata

* Title: Spaceflight Academy · Category: Educational · Version: 3.0.0 · Order: 38
* Tagline: Listen. Think. Fly the gates. Build for orbit.
