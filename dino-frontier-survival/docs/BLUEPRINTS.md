# Dino Frontier Survival — 3D Blueprints

Every model in the game is a **blueprint**: plain data in [`app/blueprints.ts`](../app/blueprints.ts) describing
a bone hierarchy, primitive parts measured in metres, named sockets and a gameplay collider. The same data drives
three things, so the drawings can never drift from what ships:

1. **The game** — [`app/model-builder.ts`](../app/model-builder.ts) turns a blueprint into a rigged Babylon.js
   model (parts merged per bone and material to keep draw calls low). The engine animates the bones procedurally
   (walk cycles, tail sway, jaw, frill flare, recoil) and fires from the sockets (`muzzle`, `mouth`).
2. **The blueprint archive** — open **`/blueprints`** on the running site. Each sheet renders six true-scale
   orthographic elevations (front, rear, left, right, plan, underside) at one shared scale, a perspective view you
   can orbit, measured overall dimensions, the rig overlay, material palette and design notes. Switch between
   *Blueprint*, *X-ray* and *Shaded* modes, toggle the rig, or print the sheet.
3. **The field guide** — the in-game species archive shows each discovered dinosaur as a live 3D specimen.

## Conventions

| | |
| --- | --- |
| Units | metres; the sheet grid is 1.00 m (minor lines 0.25 m) |
| Axes | +X right, +Y up, +Z forward (Babylon left-handed). Creatures face +Z and stand on Y = 0 |
| Sides | anatomical left is −X. Any bone or part ending in `_L` is mirrored automatically to `_R` |
| Bones | pivot points with no rest rotation, so animating `bone.rotation` turns about the joint |
| Limbs | `seg(a, b, r)` builds a capsule or tapered cylinder between two joints |
| Materials | slots (`skin`, `belly`, `dark`, `glow`, `eye`, `claw`, `accent`, `armor`, `suit`, `visor`, `metal`) coloured by each blueprint's palette; `glow`, `eye`, `visor` and `accent` feed the bloom/glow pass |

## Index

| Code | Model | Category | L × W × H (m) | Parts | Bones | Role |
| --- | --- | --- | --- | --- | --- | --- |
| DF-BP-01 | [Frontier Ranger](#df-bp-01) | Ranger | 1.60 × 0.79 × 2.03 | 48 | 12 | Player · Arc Rifle, Flux Boots, Titan Weave |
| DF-BP-02 | [Pulse Drone](#df-bp-02) | Support | 0.71 × 0.71 × 0.30 | 12 | 2 | Autonomous support turret · orbits the ranger |
| DF-BP-03 | [Feathered Raptor](#df-bp-03) | Dinosaur | 4.58 × 0.82 × 1.88 | 71 | 17 | Fast pack hunter · flanks and pounces |
| DF-BP-04 | [Venom Spitter](#df-bp-04) | Dinosaur | 4.92 × 1.35 × 2.57 | 76 | 18 | Ranged skirmisher · lobs acid globs |
| DF-BP-05 | [Ironhide Anky](#df-bp-05) | Dinosaur | 5.94 × 1.94 × 1.90 | 72 | 16 | Armoured tank · spinning tail-club sweep |
| DF-BP-06 | [Storm Triceratops](#df-bp-06) | Dinosaur | 5.92 × 2.42 × 2.71 | 54 | 17 | Charger · telegraphed horn rush |
| DF-BP-07 | [Crimson Tyrant](#df-bp-07) | Dinosaur (boss) | 8.29 × 1.94 × 3.46 | 78 | 17 | Apex boss · bite, roar and seismic stomp |
| DF-BP-08 | [Frontier Outpost](#df-bp-08) | Structure | 8.42 × 8.10 × 6.45 | 22 | 2 | Ranger drop zone · arena landmark |
| DF-BP-09 | [Fern Palm](#df-bp-09) | Prop | 4.51 × 4.62 × 4.02 | 13 | 1 | Cover and canopy · biome-tinted |
| DF-BP-10 | [Energy Crystal](#df-bp-10) | Prop | 1.75 × 1.34 × 2.25 | 6 | 1 | Glowing cover cluster · biome-tinted |

Dimensions are measured from the built meshes by the blueprint viewer.

## Sheets

### DF-BP-01

**Frontier Ranger** — Player · Arc Rifle, Flux Boots, Titan Weave

- 1.95 m to the helmet fin, 2.03 m to the antenna tip
- Arc rifle on its own bone so the torso can aim independently of the legs
- Muzzle socket at +1.23 m forward — origin of every bolt

| Blueprint (orthographic, 1 m grid) | Shaded |
| --- | --- |
| ![Frontier Ranger blueprint](blueprints/ranger-blueprint.png) | ![Frontier Ranger shaded](blueprints/ranger-shaded.png) |

Live: `/blueprints?model=ranger`

### DF-BP-02

**Pulse Drone** — Autonomous support turret · orbits the ranger

- Hovers 2.4 m up, 1.1 m off the ranger's left shoulder
- Ring bone spins independently of the hull
- Fire rate scales with Pulse Drone upgrades

| Blueprint (orthographic, 1 m grid) | Shaded |
| --- | --- |
| ![Pulse Drone blueprint](blueprints/drone-blueprint.png) | ![Pulse Drone shaded](blueprints/drone-shaded.png) |

Live: `/blueprints?model=drone`

### DF-BP-03

**Feathered Raptor** — Fast pack hunter · flanks and pounces

- Luminous feather crest runs skull → shoulders (6 quills)
- Retractable sickle claw on digit II of each foot
- Pack AI flanks 2–5 m wide, then a 0.35 s crouch and 0.55 s pounce leap

| Blueprint (orthographic, 1 m grid) | Shaded |
| --- | --- |
| ![Feathered Raptor blueprint](blueprints/raptor-blueprint.png) | ![Feathered Raptor shaded](blueprints/raptor-shaded.png) |

Live: `/blueprints?model=raptor`

### DF-BP-04

**Venom Spitter** — Ranged skirmisher · lobs acid globs

- Collapsible warning frill Ø1.30 m on its own bone (flares before a spit)
- Venom sac and dorsal spots are bioluminescent warning markings
- Keeps 7–12 m from the ranger and strafes

| Blueprint (orthographic, 1 m grid) | Shaded |
| --- | --- |
| ![Venom Spitter blueprint](blueprints/spitter-blueprint.png) | ![Venom Spitter shaded](blueprints/spitter-shaded.png) |

Live: `/blueprints?model=spitter`

### DF-BP-05

**Ironhide Anky** — Armoured tank · spinning tail-club sweep

- 18 glowing osteoderm plates in three rows
- Tail club Ø0.82 m — 360° sweep hits within 4.4 m
- Slow but takes 30 % less damage from the front

| Blueprint (orthographic, 1 m grid) | Shaded |
| --- | --- |
| ![Ironhide Anky blueprint](blueprints/anky-blueprint.png) | ![Ironhide Anky shaded](blueprints/anky-shaded.png) |

Live: `/blueprints?model=anky`

### DF-BP-06

**Storm Triceratops** — Charger · telegraphed horn rush

- Shield frill Ø2.20 m tilted 29° back, ringed by 10 bone knobs
- Brow horns 1.15 m — 0.85 s pawing wind-up before a 13 m/s charge
- Stunned and takes ×1.5 damage after a missed charge

| Blueprint (orthographic, 1 m grid) | Shaded |
| --- | --- |
| ![Storm Triceratops blueprint](blueprints/trike-blueprint.png) | ![Storm Triceratops shaded](blueprints/trike-shaded.png) |

Live: `/blueprints?model=trike`

### DF-BP-07

**Crimson Tyrant** — Apex boss · bite, roar and seismic stomp

- 12 upper and 12 lower teeth on a hinged jaw that opens 0.65 rad to bite
- Stomp emits a 15 m shockwave ring — jump to clear it
- Glowing scar lines run along both flanks

| Blueprint (orthographic, 1 m grid) | Shaded |
| --- | --- |
| ![Crimson Tyrant blueprint](blueprints/rex-blueprint.png) | ![Crimson Tyrant shaded](blueprints/rex-shaded.png) |

Live: `/blueprints?model=rex`

### DF-BP-08

**Frontier Outpost** — Ranger drop zone · arena landmark

- Hexagonal landing pad 7.4 m across the flats
- Beacon ring spins continuously above the drop zone
- Stands 25 m ahead of the arena centre in every sector

| Blueprint (orthographic, 1 m grid) | Shaded |
| --- | --- |
| ![Frontier Outpost blueprint](blueprints/outpost-blueprint.png) | ![Frontier Outpost shaded](blueprints/outpost-shaded.png) |

Live: `/blueprints?model=outpost`

### DF-BP-09

**Fern Palm** — Cover and canopy · biome-tinted

- Seven drooping fronds 2.5 m long
- Bioluminescent seed pods light the canopy at night
- Thin-instanced: one draw call per material per biome

| Blueprint (orthographic, 1 m grid) | Shaded |
| --- | --- |
| ![Fern Palm blueprint](blueprints/fern-blueprint.png) | ![Fern Palm shaded](blueprints/fern-shaded.png) |

Live: `/blueprints?model=fern`

### DF-BP-10

**Energy Crystal** — Glowing cover cluster · biome-tinted

- Five hexagonal shards, tallest 2.2 m
- Emissive — feeds the bloom pass
- Tint follows each biome's crystal colour

| Blueprint (orthographic, 1 m grid) | Shaded |
| --- | --- |
| ![Energy Crystal blueprint](blueprints/crystal-blueprint.png) | ![Energy Crystal shaded](blueprints/crystal-shaded.png) |

Live: `/blueprints?model=crystal`
## Changing a blueprint

1. Edit the generator for the model in `app/blueprints.ts` (`raptor()`, `trike()`, `ranger()` …). Body proportions
   for the theropods come from `biped({ ... })` and for the armoured herbivores from `quadruped({ ... })`.
2. Run `node --experimental-strip-types --test tests/blueprints.test.mjs`. It checks the rig (no orphan bones,
   mirrored pairs, required animation bones and sockets), that creatures stand on the ground, and the size order
   of the species.
3. Open `/blueprints?model=<key>` to inspect the six elevations before deploying.
