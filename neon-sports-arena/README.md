# Neon Sports Arena

A colorful futuristic 3D sports game for the Flexzonic Games portal. Compete across four distinct arena sports, build a six-team career, and upgrade your athlete through 30 escalating matches.

## Gameplay

- Four sports: Goal Rush, Gravity Hoops, Core Capture, and Target Blitz
- 30 matches across six glowing arenas, including six championships
- Six distinct teams and four five-level athlete upgrade modules
- Rival AI, energy pickups, boost, tackle, shooting, and overdrive
- Full five-step desktop/mobile control tutorial
- Large touch controls plus keyboard controls
- Persistent credits, upgrades, stars, wins, and best scores
- Offline-ready PWA files and device-local progress

## Local validation

Requires Node.js 22.13 or newer.

```bash
npm ci
npm run typecheck
npm run lint
npm test
```

The production build creates a compact standalone server under `dist/standalone`.

## Deployment

The Docker deployment listens on host port `8105` by default and exposes `/healthz` plus Flexzonic portal metadata at `/.well-known/flexzonic-game.json`.

See `INSTALL.md` for Ubuntu and Cloudflare Tunnel instructions.

## Controls

- Move: `WASD` or arrow keys
- Shoot/use held core: `Space`
- Boost: `Shift`
- Tackle: `Q`
- Overdrive: `E`

Large touch controls appear on mobile devices.
