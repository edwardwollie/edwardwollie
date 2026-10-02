# Cyber Ninja Academy — Full 3D 4.0

A browser-based 3D cyber-ninja action game built with Babylon.js. Version 4 adds a free-roam open-city mode, a rebuilt realistic operative, and an in-game 3D blueprint hangar.

## Modes

- **City Ops (new):** free-roam third-person action across four rooftop sectors (Neon Sprawl, Circuit Heights, Ember Spire and Void Crown). Collect every data shard and destroy every hunter drone to bring the uplink beacon online, then reach it. You get stars for time, integrity and falls.
- **Survival Trials:** the 12 classic three-lane rooftop runs, now played with the new operative and cinematic renderer.
- **3D Blueprint Hangar:** orbit the exact playable model. You can switch between the six sides and a quarter view, preview seven poses, toggle a wireframe, and download the PDF atlas.

## City Ops controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Move / sprint | WASD or arrows / hold Shift | left stick |
| Look | mouse (click the game to capture, Esc releases) | drag right half of screen |
| Jump / double jump | Space (again in the air) | JUMP |
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
npm test        # 15 checks: blueprint contract, GLBs, pose sheet, city layouts, physics, rig, courses, server
```

See `INSTALL.md` for the Ubuntu deployment on host port `8099`, `RELEASE-NOTES-v4.0.0.md` for what changed, and `blueprints/README.md` for the geometry pipeline.
