# Hypernova Circuit

Current release: **3.0.0 — Full 3D Grand Prix**. See `RELEASE-NOTES-v3.0.0.md`.

Hypernova Circuit is a browser-based 3D hovercar racing game (three.js) for Flexzonic Games. It is mobile-first and is packaged for Docker deployment on the existing Ubuntu server.

## Modes

- **Grand Prix:** six real 3D circuits (hills, banked bends, tunnels, a figure-eight bridge). Each race is 8 cars over 3 laps against AI rivals, with slipstream, drifting, warp pads, pickups, hazards, ghost laps and four cameras. A podium unlocks the next round.
- **Endless Storm:** the classic v2 Grand Circuit run with lanes, sectors and checkpoints, now using the blueprint models.
- **Garage & Showroom:** buy cars and upgrades and view your car from every side.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Steer | ← → or A D | ← → buttons, or drag anywhere |
| Boost (nitro) | Space / Shift | BOOST |
| Brake / start a drift | ↓ or S (tap while steering hard) | BRAKE |
| Camera | C | camera button |
| Look back | hold B | — |
| Pause | P / Esc | Ⅱ |

## Deployment target

| Setting | Value |
| --- | --- |
| Container | `hypernova-racer` |
| Host port | `8091` |
| Container port | `3000` |
| Health endpoint | `/healthz` → `hypernova-ok` |
| Hostname | `racer.flexzonicgames.com` |
| Tunnel origin | `http://172.17.0.1:8091` |

To upgrade an existing server, follow `INSTALL.md`. For a first-time install, follow `BEGINNER-SETUP.md`.

## Development

```bash
npm run install:ci
npm run dev          # local dev server (also shows the internal BLUEPRINT wireframe toggle in the garage)
npm run typecheck
npm run lint
npm test             # build + 17 checks: blueprint↔runtime geometry, GLBs, circuits, full AI races on every track, physics, saves, server
```

## Source map

| File | Purpose |
| --- | --- |
| `app/game/GrandPrixEngine.ts` | Grand Prix renderer, cameras, race flow, pickups, ghosts, showroom |
| `app/game/race-physics.ts` | Driving model in track space, AI driver and car-to-car contact |
| `app/game/track.ts` | Circuit frames, curvature, racing line and AI speed profile |
| `app/game/track-scene.ts` | Road, barriers, kerbs, tunnels, viaducts, sky and themed scenery |
| `app/game/blueprint-mesh.ts` | Builds three.js meshes directly from `blueprint-spec.json` |
| `app/game/grand-prix.ts` | Rivals, rewards, unlocks, records and ghost storage |
| `app/game/HypernovaEngine.ts` | Endless Storm (classic) engine |
| `blueprints/` | Python design sources, plates, PDF atlas and GLB models (`npm run blueprints` regenerates them) |

Progress is stored in the browser under `hypernova-circuit-save-v1`; ghost laps are stored under `hypernova-ghost-v3-<circuit>`. No account or database is needed.
