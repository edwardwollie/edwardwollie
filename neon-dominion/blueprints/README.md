# ND-3 3D blueprints

The blueprints are the source of truth for every 3D model in Neon Dominion.

## How it fits together

| File | Role |
| --- | --- |
| `app/blueprints/models.js` | Parametric recipes: machined primitives (rounded boxes, lathed hulls, extruded plates, struts, rings) placed in metres, with materials and joints |
| `app/blueprints/kit.js` | Builds the recipe into merged geometry chunks per joint and material. Shared by the game, the hangar, the tests and the plate generator |
| `app/blueprints/rigs.js` | Joint animation for every unit. The pose sheets and the game call the same functions |
| `app/render3d.js` | Draws the built meshes with GPU instancing, one pool per unit type |
| `tools/blueprint-studio.js` | Renders the plates in headless Chromium from the same meshes |
| `tools/blueprints.mjs` | Writes the plates, GLBs, `dimensions.json` and the PDF atlas |
| `scripts/blueprint-contract.mjs` | Fails `npm test` if a mesh no longer matches its published blueprint, outgrows its hit radius, exceeds its triangle budget, or has a rig that animates a missing joint |

## Conventions

- Units are metres. +Y is up and every unit faces +Z. The unit's left side is +X.
- Views: front (camera on +Z), rear (−Z), left (+X), right (−X), top (+Y, front at the bottom of the sheet) and underside (−Y). Quarter views are at 45° azimuth and about 22° elevation.
- In game, 25 simulation units = 1 m. Game `x` maps to world X and game `y` (forward) maps to world −Z.
- `simRadius` on each recipe is the simulation hit radius. The contract test keeps the mesh footprint consistent with it.
- `mirror: true` duplicates a part across X. A joint whose name ends in `L` automatically gets its `R` twin.

## Changing a unit

1. Edit its recipe in `app/blueprints/models.js` (and its rig in `rigs.js` if needed).
2. Preview it by serving the project root and opening `/tools/blueprint-studio.html?plate=01-commander`, or use the in-game hangar.
3. Regenerate and test:

```bash
npm install            # Playwright must be available (global install is fine)
npm run blueprints     # about 5 minutes with software WebGL
npm test
```
