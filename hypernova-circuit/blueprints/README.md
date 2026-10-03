# Hypernova Circuit 3D blueprints (series 3.0.0)

The blueprints are the game's source geometry, not artwork of it.

| Step | File | Output |
| --- | --- | --- |
| Model recipe | `design_model.py` (+ `mesh_geometry.py`) | `app/game/blueprint-spec.json`: 12 assets as indexed triangles |
| Circuit recipe | `design_tracks.py` | `app/game/track-spec.json`: 6 circuits resampled every 4 m, with bank, gates, pads, pickups and hazards |
| Plates | `render_blueprints.py`, `render_circuits.py` | `renders/01–09*.png` |
| Models | `export_glb.py` | `models/*.glb` |
| Atlas | `make_atlas_pdf.py` | `Hypernova-Circuit-3D-Blueprint-Atlas-v3.0.0.pdf` |

`app/game/blueprint-mesh.ts` feeds the spec arrays straight into three.js `BufferGeometry`, and `app/game/track.ts` drives on the same centreline samples the plans draw. The renderer computes area-weighted normals the same way three.js `computeVertexNormals()` does, and flat parts are un-welded the same way as `toNonIndexed()`. `npm test` checks that the runtime bounding boxes and triangle counts match the spec.

## Plates

1–4. Six-side orthographic views (left, right, front, rear, top, underside) of Pulse GT, Vortex R9, Solar Wraith and Prism Titan, with overall dimensions and a part schedule.
5. The fleet at four quarter views, all at the same scale.
6. Hazards, pickups and track furniture (hero, front and top views).
7–8. Plans of all six circuits drawn to scale, with the road shaded by elevation, start/finish, checkpoints, tunnels, warp pads, coin lines, pickups, hazards, a 200 m scale bar and an elevation profile.
9. Raceway cross-section (18 m road, kerbs, barriers, tunnel arch, viaduct pillar), the checkpoint arch and the 8-car starting grid.

## Conventions

Metres. +Y is up. Vehicles face +Z and the road surface is Y = 0. On circuits, the start line faces −Z, positive lateral offset is to the driver's right, and positive bank lowers the right-hand edge.

`design_tracks.py` asserts that every bend is at least 40 m in radius, every grade is under 14 %, and wherever the road passes over itself the bridge clears by at least 9 m.

## Regenerate

```bash
pip install numpy scipy pillow reportlab
npm run blueprints
npm test
```

These files stay in the repository and are not served by the public game.
