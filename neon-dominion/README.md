# Neon Dominion: Rift Command

An original, mobile-first futuristic squad-action game created for Flexzonic Games, rendered in full 3D since v3.0.0. The project uses the broad idea of guiding a growing combat group through upgrade choices and enemy formations, but all branding, visual design, interface, audio synthesis, progression, units, and code in this package are original.

## What is playable

- Smooth virtual joystick on phones and tablets
- WASD and arrow-key movement on computers
- Automatic commander and squad targeting
- Recruit, shield, repair, damage, fire-rate, and squad-multiplier gates
- Six permanent upgrade paths/levels across three command systems
- Grunts, ranged attackers, brutes, turrets, and sector bosses
- NOVA shockwave ability with a visible cooldown
- Combo scoring, core collection, mission rewards, and local high scores
- Increasing difficulty across up to 99 sectors
- Synthesized sci-fi sound effects with no copyrighted audio files
- Local save data for unlocked sectors, credits, upgrades, and settings
- Offline-capable Progressive Web App after the first successful load
- Responsive portrait and landscape layouts
- Docker, Nginx, health checks, security headers, and log rotation

## Controls

| Device | Move | NOVA | Pause |
| --- | --- | --- | --- |
| Phone/tablet | Drag the lower-left joystick | Tap the lower-right NOVA control | Tap `Ⅱ` |
| Keyboard | WASD or arrow keys | Space | P or Escape |

Weapons fire automatically at nearby enemies. The main choice is how you position the squad, which upgrade gate you take, when you use NOVA, and how aggressively you advance.

## Fast local test

No JavaScript packages or external CDNs are required.

```bash
cd neon-dominion
npm test
python3 -m http.server 8108
```

Open `http://localhost:8108`. Service-worker installation requires HTTPS or localhost; the game itself will still run over a LAN HTTP address.

## Fast Docker start

```bash
cd neon-dominion
sudo docker compose up -d --build
sudo docker compose ps
curl http://127.0.0.1:8108/healthz
```

Expected health response:

```text
neon-dominion-ok
```

The default host port is `8108`. To use another port:

```bash
GAME_PORT=8104 sudo docker compose up -d --build
```

See `DEPLOY-PROXMOX.md` for the complete beginner-friendly Proxmox, Ubuntu, Docker, and Cloudflare Tunnel procedure.

## Project map

| Path | Purpose |
| --- | --- |
| `index.html` | Game shell, menus, HUD, tutorial, results, and accessibility labels |
| `styles.css` | Responsive neon interface and touch-control styling |
| `app/game.js` | Game simulation, procedural battlefield, combat, progression, classic 2D fallback renderer |
| `app/render3d.js` | Full 3D renderer: instanced blueprint units, environment, effects, cameras, post-processing, quality tiers |
| `app/blueprints/` | Unit blueprints: parametric recipes (`models.js`), geometry kit (`kit.js`), rigs (`rigs.js`), view presets |
| `app/hangar.js` | In-game 3D Blueprint Hangar |
| `app/vendor/three.js` | Self-hosted three.js bundle (no CDN; built by `tools/vendor-three.mjs`) |
| `app/audio.js` | Runtime-generated music bed and sound effects |
| `app/main.js` | Menus, saves, upgrades, input, pause, install, graphics setting, and service worker |
| `assets/blueprints/` | Blueprint plates (JPG), per-unit GLB models and the PDF atlas |
| `tools/` | Blueprint studio and atlas generator, three.js vendoring |
| `security-headers.conf` | CSP and security headers included by every nginx location |
| `sw.js` | Offline application shell |
| `compose.yaml` | Proxmox/Ubuntu container configuration |
| `nginx.conf` | Static hosting, PWA behavior, security headers, and `/healthz` |

## Progress and saved data

Progress is stored in the browser's local storage on each device. It does not require a database or player account. Clearing browser/site data resets that device's credits, upgrades, and unlocked sector.

For a future multi-device account system, keep this static game as the front end and add an authenticated API/database separately. Do not expose a database directly to the browser.

## Recommended VM size

- Ubuntu Server 24.04 LTS or 26.04 LTS, 64-bit
- 2 virtual CPU cores
- 2 GB RAM
- 16 GB virtual disk
- One VirtIO network adapter

The game server is static and normally consumes very little CPU or memory. Player rendering happens on the phone, tablet, or computer—not on the Proxmox server.

## Updating the game

Replace the project folder with a newer release, then run:

```bash
cd /opt/flexzonic/neon-dominion
sudo docker compose up -d --build
curl http://127.0.0.1:8108/healthz
```

The service worker uses a versioned cache. When you make a future release, change `CACHE_NAME` in `sw.js` so installed devices receive the new assets cleanly.

## Ownership note

The supplied reference images are not included in the game or Docker image. The package does not use the reference game's name, logo, characters, screenshots, art files, or source code.


## v3.0.0 Full 3D Rift Engine

See `RELEASE-NOTES-v3.0.0.md`. Summary:

- Real-time 3D (three.js / WebGL2) with PBR materials, shadows, bloom and cinematic cameras.
- Every unit is built from the ND-3 3D blueprints, so the meshes on the plates are the ones in the game.
- 3D Blueprint Hangar (private design tool): six-side views, quarter views, poses, blueprint ink and wireframe. It is hidden from players, and the blueprint PDF, plates and GLBs are not shipped in the Docker image (nginx also returns 404 for `/assets/blueprints/`). To use it, serve the project locally and open `http://localhost:8108/?hangar`, or set `blueprintHangar: true` in `app/features.js`.
- Graphics setting (AUTO / HIGH / MEDIUM / LOW) with automatic resolution scaling. The classic 2D renderer is used automatically on devices without WebGL2.

### Tests

```bash
npm test               # syntax, deployment smoke, game logic, tactics, blueprint contract (no browser needed)
npm run test:browser   # boots the 3D game in headless Chromium with the production CSP
npm run blueprints     # regenerate plates, GLBs, dimensions and the PDF atlas (Playwright + Chromium)
```

## v2.0.0 Tactical Overhaul

- Four specialist drone roles: Striker, Rail, Bulwark, Medic.
- Three live tactical formations: Balanced, Assault Wedge, Bulwark Wall.
- New Rift Legion specialists: Charger, Shield Carrier, Jammer, Splitter.
- Shield absorption, jammer fire-rate disruption, splitter reinforcements.
- Named guardians with multi-phase reinforcement events.
- Sector-specific battlefield color palettes.
- Existing save key and deployment port retained.
