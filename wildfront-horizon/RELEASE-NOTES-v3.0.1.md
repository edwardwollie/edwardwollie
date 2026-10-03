# Wildfront Horizon 3.0.1 — Clear Views From Towers, Stands and Blinds

This release fixes the view after climbing. In 3.0.0, climbing a lookout tower left you behind solid walls and dark glass, and entering a ground blind shut you inside a closed box, so you could not see in any direction.

## What was wrong
- The lookout cab's glazing was an opaque dark panel. Climbing also put you in a crouch, with your eye level with the top of the board walls.
- The ground blind was a solid box. Its windows were black panels on the walls, and brush filled the inside.
- Shots fired from inside the blind hit the blind itself.
- On slopes, terrain could poke through the blind's floor, and forest crowded the lookout summits.
- The climb message promised that your scent lifts above the game, but this was not applied.

## Fixes
- **Lookout towers (S-01 rev B):**
  - Clear glazing runs all round the cab.
  - You stand in the cab with your eye in the window band, and you can move about the cab floor.
  - The forest around each tower is cleared, so the 360° panorama is open.
- **Tripod stands (S-02):** you sit on the swivel seat with your eye 0.4 m above the shooting rail, so the view is open on every side. The rail still steadies the rifle (sway −40 %).
- **Ground blinds (S-03 rev B):**
  - Rebuilt with four real window openings, each 1.4 × 0.6 m with a 0.9 m sill.
  - You sit on the stool with your eye level with the windows, facing whichever window has the longest clear view.
  - Shots pass out through the windows.
  - The brush-in stays outside the blind and below the windows, and the door side is kept clear.
- **Level ground:** towers, stands, blinds, cabins, the ranger station, the kiosk and the truck now sit on levelled pads, so terrain no longer pokes through floors on slopes.
- **Scent:** the share of your scent that reaches the game drops to 15 % while you are up a tower, 35 % on a stand and 80 % in a blind. Game also comes closer to a hunter on a tower or stand before taking alarm.
- **Prompts:** F — CLIMB / F — CLIMB DOWN for towers and stands, and F — ENTER BLIND / F — LEAVE BLIND for blinds. Each spot shows a message describing it.

## Under the hood
- Each climbable structure's blueprint now records where you stand or sit: floor, eye height, room to move, exit point and scent. The game reads these values from the blueprint.
- New unit tests:
  - Build each climbable structure from its blueprint and cast rays from the hunter's eye in eight directions, level and looking slightly down. Nothing opaque may sit within 3 m.
  - Check that a shot from inside a blind leaves the blind, while a tree down range still stops it.
- The end-to-end test climbs every tower, stand and blind in the contract reserve and checks the view from each one. It saves screenshots from a lookout cab, a tripod stand and a ground blind.
- The blueprint sheets for S-01, S-02 and S-03 draw the hunter's eye line on both elevations and list it under Specifications. The Blueprint Studio shows the same eye height.
- Regenerated:
  - the blueprint book, with S-01 and S-03 at rev B and survey sheets that show the cleared summits;
  - the single-view plates for S-01 and S-03.
- One version number (`app/game3d/version.ts`) now feeds Settings and the blueprint book cover.

## Unchanged
- Contracts, grading, scoring and controls.
- Saves on the `wildfront-save-v1` key.
- Port 8096, `/healthz` → `wildfront-ok`, the `/opt/wildfront-horizon` install folder, and the Classic edition at `/classic`.
