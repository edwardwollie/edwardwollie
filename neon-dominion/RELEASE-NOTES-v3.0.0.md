# Neon Dominion: Rift Command v3.0.0 — Full 3D Rift Engine

## Highlights

- **Full 3D battlefield.** The game now renders in real time with three.js (WebGL2): physically based materials, a key light with soft shadows that follows the squad, image-based reflections, HDR bloom, ACES tone mapping, fog and a colour grade with hit, flash and defeat effects.
- **Blueprint-built units.** Twenty-one ND-3 blueprints define the commander, four drone specialists, eight Rift Legion units, the colossus guardian (four colour variants), gates, core shards, the Rift Gate and the scenery. The game, the blueprint plates, the GLB downloads and the in-game hangar are all built from the same recipe, and a contract test keeps them identical.
- **Animated rigs.** The exo-frame skates on hover pads with leg stride, a torso that twists to aim, cannon recoil and jet glow. Drones spin their rotors and bank. Scuttlers and Rams scuttle on four legs. Gunners, Bastions and Juggernauts walk. The Siren's rings rotate, the Fission core pulses open, turrets track you, and the colossus stomps, aims its arm batteries and flares its crown between phases.
- **3D world.** Each sector has a themed sky (nebula, stars, rift glow), a hex-grid terrain, a glowing causeway with animated chevrons and lane lines, edge bollards, a procedurally lit megacity skyline, orbital rings, an energy boundary fence and the Rift Gate with a swirling vortex and sky beam at the end of the sector.
- **Combat effects.** Plasma bolts, muzzle flashes with dynamic lights, explosions with debris physics, smoke, embers and scorch marks. Also included: a shield bubble and Bastion barrier domes, the NOVA shockwave dome, jammer range rings, enemy ground markers, health and shield bars, and gate fields with holographic labels.
- **Cinematics.** The guardian's arrival gets a 2-second reveal camera, during which the battlefield waits. Victory gets a slow-motion orbit and defeat a desaturated pull-back. Reduced-motion users get no cinematics and less shake.
- **3D Blueprint Hangar** (private, not shown to players; open it locally at `http://localhost:8108/?hangar`). You can orbit any unit, snap to front, rear, left, right, top, underside or quarter views, and preview the rest, move, aim/fire and special poses. Ink, wireframe and turntable modes are available, along with the measured dimensions. You can open the unit's plate, download its GLB, or open the full PDF atlas.
- **Graphics setting.** AUTO, HIGH, MEDIUM and LOW live in the pause menu. AUTO picks a tier from the device and lowers the resolution, then the tier, if the frame rate drops. The classic 2D renderer remains as an automatic fallback.

## Blueprint atlas (ND-3)

27 sheets: an index, 21 unit or prop sheets, two pose sheets (commander and guardian), a force lineup at common scale, and sector 01 and 05 layouts generated from the real level generator. Each unit sheet has front, rear, left, right, top and underside orthographic views at one shared scale with dimension callouts, PBR quarter views from the front-left and rear-right, a specification table, a finish schedule and the joint list.

The blueprint files stay in the repository for the team and are excluded from the public Docker image. Files: `assets/blueprints/Neon-Dominion-3D-Blueprint-Atlas-v3.0.0.pdf`, `assets/blueprints/plates/*.jpg`, `assets/blueprints/models/*.glb`, `blueprints/dimensions.json`.

## Fixes and infrastructure

- **Stale code after upgrades.** v2 served `/src/*.js` and `/styles.css` as `immutable` for 7 days, so returning players could get new HTML with old scripts. Code now lives in `/app/`, the stylesheet is versioned, code revalidates on every load, and the service worker fetches code network-first.
- **Security headers were missing.** nginx drops server-level `add_header` lines inside any location that sets its own headers, so v2's CSP never reached `index.html`. Every location now includes `security-headers.conf`.
- **Compression.** gzip is enabled for JS, CSS, JSON, SVG and GLB.
- three.js is self-hosted in `app/vendor/three.js` (r186, about 209 KB gzipped), so the strict `script-src 'self'` CSP is kept.

## Unchanged

The save key (`flexzonic.neonDominion.save.v1`), so progress, credits and upgrades carry over. Port `8108`, the `/healthz` response `neon-dominion-ok`, the portal discovery file and the Cloudflare route are also unchanged. Gameplay rules and balance are unchanged. The only addition is the 2-second hold during the guardian reveal in 3D.
