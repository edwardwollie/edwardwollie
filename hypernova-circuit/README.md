# Hypernova Circuit

Current release: **2.0.0 — Grand Circuit Upgrade**. See `RELEASE-NOTES-v2.0.0.md`.

Hypernova Circuit is a mobile-first futuristic 3D racing game built for Flexzonic Games. It runs entirely in the browser and is packaged for Docker deployment on the existing Ubuntu server.

## Game systems

- Grand Circuit 2.0: six rotating environments with 2.4 km sectors and four checkpoint splits per sector
- Continuous sweeping bends, S-curves, banking, checkpoint arches, and a wider raceway
- Four distinct hovercars with unique silhouettes plus different speed, handling, armor, and coin-magnet strengths
- Automatic high-speed drifting that builds Drift Charge, restores nitro, and banks bonus coins
- Warp boost lanes, rival packs, overtaking rewards, gold coin chains, near-miss rewards, and a daily cache
- Seven readable encounter families instead of continuously stacking random hazards
- Four five-level upgrades: Ion Drive, Vector Fins, Aegis Shell, and Quantum Magnet
- Touch drag steering, large mobile buttons, keyboard controls, pause, fullscreen, and procedural sound
- Local progress saving and offline replay after the first successful load
- Expanded portal/SEO metadata for `www.flexzonicgames.com`

## Deployment target

| Setting | Value |
| --- | --- |
| Container | `hypernova-racer` |
| Host port | `8091` |
| Container port | `3000` |
| Health endpoint | `/healthz` |
| Suggested hostname | `racer.flexzonicgames.com` |
| Tunnel origin | `http://172.17.0.1:8091` |

See `BEGINNER-SETUP.md` for the complete Ubuntu and Cloudflare walkthrough.

## Local development

Requirements: Node.js 22.13 or newer, Linux `flock`, `curl`, and GNU `timeout`.

```bash
npm run install:ci
npm run dev
```

Useful checks:

```bash
npm run typecheck
npm run lint
npm run build
node --test tests/rendered-html.test.mjs
```

Progress is stored in the browser under `hypernova-circuit-save-v1`. No account or database is required.
