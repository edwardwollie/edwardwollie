# Blueprint series NS-02

`design_model.py` is the editable geometry recipe. It writes indexed positions, normals, vertex colours, UVs and triangle indices, plus the stadium layout and the per-sport placements, to `../app/blueprint-spec.json`. The game (`app/blueprint-mesh.ts`, `app/athlete-rig.ts`, `app/stadium.ts`) feeds those arrays straight into Babylon `VertexData`.

## How the models are built
- Body forms are `loft` parts through superellipse cross sections given as (height, width, depth, forward offset, roundness).
- Kit and armour are `shell` parts: partial lofts cut from the same anatomical profile, inflated outward, with real thickness.
- `mesh_geometry.py` provides the other primitives: `ico`, `tube`, `prism` (ear-clipped extrusions such as the stand tiers and pickup badges), arc `torus`, `cuboid`, `box`, `cylinder`, `sphere`, `capsule`, `blade` and `octa`.
- **Winding:** primitives are authored with (b−a)×(c−a) pointing outward, and `build()` swaps the last two indices so the spec uses Babylon's left-handed front-face order. The contract test verifies this.
- **Tints:** `jersey`, `trim` and `glow` take the team kit at runtime (`kitPrimary` = team accent, `kitTrim` = team colour). `accent` and `seat` take the arena colour.

## Rig and poses
- `groups` define the 17 joints.
- `app/athlete-rig.ts` bakes the athlete into one skinned mesh per material, with one rigid bone per vertex. The bones follow the joint TransformNodes, and the same file holds every pose function.
- `extract_runtime.mjs` builds every asset with the game's own code in a NullEngine. It reads back the props and the skinned athlete (CPU skinning) into `runtime-extracted.json`, then applies each pose-sheet entry and records `runtime-poses.json`.

## Outputs
- `render_blueprints.py` renders the 11 plates: orthographic, depth-buffered, 2× supersampled, with a glass/net transparency pass and contour lines.
- `export_glb.py` writes 10 GLBs, mirroring X into glTF's right-handed frame.
- `make_atlas_pdf.py` assembles the PDF.
- These outputs are private. Nothing in `blueprints/` is copied to `public/`, and a contract test fails if anything is.

## Orientation and units
- Metres, +Y up, every asset faces +Z, and the athlete's right hand is +X. Views are front (+Z), rear (−Z), left (−X), right (+X), top (+Y) and underside (−Y). Quarter views are at 45° azimuth.
- The pitch is 32 × 48 m, x ±16 and z ±24. The player's team attacks +Z.

## Regenerating

```bash
pip install numpy scipy pillow reportlab
npm run blueprints   # design → extract → render → GLB → PDF
npm test
```
