# Neon Sports Arena — Full 3D 2.0

A futuristic 3D sports game for the Flexzonic Games portal, built with Babylon.js. Four sports, six themed stadiums, thirty matches, six teams and four upgrade modules. Version 2.0 rebuilds the game in full 3D from a set of blueprints (series NS-02): one geometry recipe produces the playable meshes, the printed plates and the GLB models.

## Gameplay

- **Four sports:** Goal Rush (beat the keeper drone), Gravity Hoops (arcing shots and launch-pad slam dunks), Core Capture (carry or throw the core into the zone) and Target Blitz (blast drifting holographic targets).
- **Squads:** from match 5 you play with up to two AI teammates. Pass to the best-placed one, or call for the ball back. Rivals press, mark, defend and telegraph their tackles with a red ring.
- **Skill shots:** hold to charge and release in the lime band for a **perfect** strike. Perfect strikes are faster and more accurate, and keeper drones react to them more slowly.
- **Movement:** camera-relative hover-skating, jump, Nova boost, pulse tackle and Team Overdrive.
- **Presentation:** an intro flyover, a kickoff countdown, slow-motion goal celebrations with an **instant replay**, live jumbotron scores, thousands of cheering fans, floodlights and fireworks. The audio is procedural: crowd noise that follows the attack, whistle, horn and an optional soundtrack.
- **Cameras:** chase, broadcast and tactical (press V). You can also orbit the view with the middle mouse button, the gamepad's right stick or a drag on a phone.
- **Six venues:** Prism Training Deck, Solar City Stadium, Aurora Skycourt, Quantum Harbor, Titan Pulse Dome and the Infinity Championship. Each has its own sky, stands, crowd and set dressing.
- **3D Blueprint Hangar:** orbit any blueprinted asset in your team kit. You can snap to the six sides or a quarter view, preview 12 poses, toggle a wireframe, browse the 11 plates and download the PDF atlas and GLB models.
- **Progress:** credits, upgrades, stars, wins, goals, assists, perfect releases and dunks are saved in the browser. 1.x saves carry over.

## Controls

| Action | Keyboard / mouse | Gamepad | Touch |
| --- | --- | --- | --- |
| Skate | WASD / arrows | Left stick | Left stick |
| Shoot / throw / blast (hold to charge) | Space or left click | A | ACTION |
| Pass / call for the ball | F or right click | X | PASS |
| Jump | C | LB / LT | JUMP |
| Boost | Shift | RB / RT | BOOST |
| Tackle | E | B | TACKLE |
| Overdrive (at 100 energy) | Q | Y | OVERDRIVE |
| Camera mode / orbit | V / middle-drag | Back / right stick | drag right side |
| Pause | P or Esc | Start | ❚❚ |

## Local validation

Requires Node.js 22.13 or newer.

```bash
npm ci
npm run typecheck
npm run lint
npm test          # builds, then runs the 23 checks
```

To regenerate the blueprints (needs Python 3 with numpy, scipy, pillow and reportlab), run `npm run blueprints`. See `blueprints/README.md`.

## Deployment

Docker listens on host port `8105` and serves `/healthz` (`neon-sports-ok`) and the portal manifest at `/.well-known/flexzonic-game.json` (version `2.0.0`). To upgrade the live server with automatic rollback, follow `INSTALL.md`.
