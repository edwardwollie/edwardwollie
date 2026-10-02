# Cyber Ninja Academy — Full 3D 4.1

A browser-based 3D cyber-ninja action game built with Babylon.js. Version 4 added a free-roam open-city mode, a rebuilt realistic operative and an in-game 3D blueprint hangar. Version 4.1 adds the Warden sector bosses, wall-running, ghost replays of your best run, and an online leaderboard.

## Modes

- **City Ops (new):** free-roam third-person action across four rooftop sectors (Neon Sprawl, Circuit Heights, Ember Spire and Void Crown). Collect every data shard and destroy every hunter drone to wake the Warden boss. Destroy it to bring the uplink beacon online, then reach it. You get stars for time, integrity and falls. Your best run is saved as a ghost to race, and times can be posted to the sector leaderboard.
- **Survival Trials:** the 12 classic three-lane rooftop runs, now played with the new operative and cinematic renderer.
- **3D Blueprint Hangar:** orbit the exact playable model. You can switch between the six sides and a quarter view, preview seven poses, toggle a wireframe, and download the PDF atlas.

## City Ops controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Move / sprint | WASD or arrows / hold Shift | left stick |
| Look | mouse (click the game to capture, Esc releases) | drag right half of screen |
| Jump / double jump | Space (again in the air) | JUMP |
| Wall-run / wall jump | jump at a tall wall while moving along it, Space to kick off | same |
| Phase dash (brief invulnerability) | E or Q | DASH |
| Katana chain (3 hits, auto-aim lunge) | left click or F | STRIKE |
| Homing photon shuriken (3 charges) | right click or R | STAR |

Hunter drones charge a shrinking red ring before they fire. Dash through the bolt, or swing as it arrives to deflect it back. Magenta launch pads throw you onto higher rooftops. Red cells restore 35 integrity. Falling off the city returns you to your last safe roof and costs 15 integrity.

## Survival controls

A/D or arrows shift lanes, Space/W/up jumps, S/down slides, and F or K strikes. On mobile there are five bottom controls.

## Development

```bash
npm ci
npm run build
npm test        # 19 checks: blueprint contract, GLBs, poses, city layouts, physics, wall-run, ghost, leaderboard, rig, courses, server
```

See `INSTALL.md` for the Ubuntu deployment on host port `8099`, `RELEASE-NOTES-v4.1.0.md` and `RELEASE-NOTES-v4.0.0.md` for what changed, and `blueprints/README.md` for the geometry pipeline.

## Leaderboard API

- `GET /api/leaderboard?sector=1..4` returns the top 10.
- `POST /api/leaderboard` with `{sector, name, time, health, stars, score, falls}` submits a run.
- Scores are stored in `$LEADERBOARD_DIR/leaderboard.json` (default `/game/data`, a Docker named volume).
- Submissions are validated and rate-limited (6 per minute per IP). Times faster than a sector's minimum are rejected. This is a casual board: a determined player could still post a forged time.
