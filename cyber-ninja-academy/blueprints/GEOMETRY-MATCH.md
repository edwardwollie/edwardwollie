# Runtime geometry match

The playable game creates Babylon `VertexData` directly from the indexed arrays in `app/blueprint-spec.json`. `extract_runtime.mjs` instantiates those assets in a Babylon scene, with the operative built by the game's own rig (`app/ninja-rig.ts`). It applies the neutral-pose hierarchy and reads back the transformed positions, normals, colours, UVs and triangle indices. The plates and GLBs use that extracted geometry. The pose sheet uses positions read back after the game's pose functions ran. World coordinates are rounded to 0.00001 m.

| Asset | Meshes | Triangles |
| --- | ---: | ---: |
| ninja | 131 | 23,332 |
| drone | 28 | 3,208 |
| barrier | 14 | 584 |
| beam | 14 | 1,032 |
| wall | 21 | 732 |
| spike | 11 | 340 |
| sweep | 11 | 508 |
| crusher | 14 | 568 |
| shard | 2 | 488 |
| finish_gate | 9 | 324 |
| roof_tile | 36 | 1,584 |
| sky_tower | 37 | 1,628 |
| beacon | 13 | 2,560 |
| jump_pad | 7 | 1,152 |
| repair_cell | 5 | 944 |
| **Total** | **353** | **38,984** |

`npm test` checks:
- every part's index range and attribute lengths
- that the extractor's material, name and index data match the game specification
- the GLB attributes against the runtime extraction
- the pose sheet and joint data
- the grouped hazard geometry
- course and city layouts, character physics and rig limits
- the plates, production metadata and the health endpoint

The match covers geometry and the shared texture images. The plates are orthographic software renders with studio lighting. The game uses perspective, animation, fog, bloom, tone mapping and dynamic shadows, so pixels differ while the underlying model is the same.
