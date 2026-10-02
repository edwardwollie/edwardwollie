# Blueprint source and orientation (series 04)

`design_model.py` is the editable mesh recipe. It writes indexed positions, normals, vertex colours, UVs and triangle indices to `../app/blueprint-spec.json`, and `app/blueprint-mesh.ts` feeds those arrays directly to Babylon `VertexData`.

**How the operative is built**
- Body forms are `loft` parts: smooth surfaces through superellipse cross sections given as (height, width, depth, forward offset, roundness). The pelvis, abdomen, ribcage, neck, skull, arms, legs and hands are all lofts.
- Armour is made of `shell` parts. Each one is a partial loft cut from the same anatomical profile, inflated outward, with real thickness and crisp edge walls, so the plates follow the musculature.
- `mesh_geometry.py` contains these primitives and the older box, panel, capsule, blade, octahedron and torus shapes.

**Rig and poses**
- `groups` in the recipe define the 16-joint skeleton, plus `bladePivot` and `scarf`.
- `app/ninja-rig.ts` builds the rig and holds every pose function the game uses.
- `extract_runtime.mjs` builds the real Babylon rig, reads back neutral-pose world triangles into `runtime-extracted.json`, and applies the pose sheet with the same functions into `runtime-poses.json`. It also records the joint positions.

**Outputs**
- `render_blueprints.py` projects the extracted triangles with a depth buffer, 2× supersampling, camera-relative studio lighting and a contour pass. It produces the six plates and `public/og.png`.
- `export_glb.py` packages the operative, drone and beacon as standalone GLBs.
- `make_atlas_pdf.py` assembles the PDF.

**Orientation and units**
- World units are metres and +Y is up. The operative is 1.92 m tall and faces +Z.
- Front (+Z), rear (−Z), left (−X), right (+X), top (+Y), underside (−Y). Quarter views are at 45° azimuth and about 20° elevation.
- Survival lanes are at X = −3, 0 and +3 on a 12.3 m rooftop.

To regenerate after a change:

```bash
pip install numpy scipy pillow reportlab
python3 blueprints/design_model.py
node blueprints/extract_runtime.mjs
python3 blueprints/render_blueprints.py
python3 blueprints/export_glb.py
python3 blueprints/make_atlas_pdf.py && cp blueprints/Cyber-Ninja-3D-Blueprint-Atlas-v*.pdf public/blueprints/
npm test
```
