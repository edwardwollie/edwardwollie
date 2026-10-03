# Hypernova Circuit v3.0.0 — Full 3D Grand Prix

Version 3 turns Hypernova Circuit into a full 3D racing game. Every car, hazard, pickup and circuit is now built from a 3D blueprint, and the blueprints and the game share the same geometry.

## Grand Prix (new main mode)

- **Six real 3D circuits**, one per environment: Neon Megacity Grandway, Solar Rift Canyon, Prism Glacier Run, Quantum Void Spiral, Verdant Ion Causeway and Nova Foundry Circuit. Laps are 2.4–3.5 km with hills (Solar Rift climbs 40 m), banked bends, tunnels, viaducts and a figure-eight with the Void Bridge 12 m above the lower leg.
- **Eight-car races over three laps** against seven named AI rivals. They follow racing lines, brake for bends, use warp pads and dodge slower cars and hazards. Early rounds are gentler; by round 6 rivals drive at full pace.
- **Real steering.** You steer the car yourself; it no longer slides between lanes. Speed, grip and turning rate come from the car and your upgrades.
- **Drift:** tap BRAKE while steering hard at speed, then hold the turn. Drifting banks coins and nitro.
- **Slipstream:** tuck in behind a rival for extra speed and nitro.
- **Contact:** cars can bump wheel-to-wheel and nose-to-tail. The energy barriers scrape speed and shield.
- **Ghost laps:** your best lap on each circuit is saved and replayed as a translucent ghost car.
- **Cameras:** chase, far chase, hood and TV (press C or tap the camera button). Hold B to look behind.
- **Championship progression:** rounds 1–2 are open at the start; a podium unlocks the next round. Prize money is paid by finishing position, plus the coins you collect during the race.
- **HUD:** position, lap, lap/best/ghost times, a live minimap, standings with gaps, countdown, final-lap banner and slipstream indicator.
- **Main menu backdrop:** the AI field races live behind the menus, filmed with TV, helicopter and tracking shots.

## Garage showroom

- Your car sits on a turntable on the start straight. You can view it from orbit, front, rear, left, right, top or underneath.

## Endless Storm (the classic run)

- The v2 endless mode is still here, now using the new blueprint cars, hazards and pickups.

## Graphics

- Bloom post-processing, reflective paint and environment lighting, soft shadows, thruster flames, wall sparks, speed lines and camera shake.
- Every environment has its own sky, ground and instanced scenery: towers, mesas, ice shards, asteroids, glowing trees and foundry stacks.
- Graphics quality: AUTO / HIGH / LOW from the header. AUTO starts LOW on phones and drops to LOW if the frame rate falls below about 38 fps.

## 3D blueprints

- `blueprints/` holds 9 plates and a PDF atlas: six-side orthographic views of the four cars with dimensions, quarter views of the fleet, a hazards and pickups sheet, circuit plans of all six tracks with elevation profiles, and the raceway cross-section and starting grid.
- There is a GLB model for every asset. The plates are not served on the public site.

## Compatibility

- The save key `hypernova-circuit-save-v1` is unchanged. Coins, cars, upgrades and endless records carry over, and Grand Prix records are added alongside them.
- Same container name, port 8091 and `/healthz` response (`hypernova-ok`).
