# Runtime geometry match

The game builds every mesh from the indexed arrays in `app/blueprint-spec.json`. `extract_runtime.mjs` creates each asset with the game's own `BlueprintBuilder`, and the athlete with the game's skinned rig. It then reads back world positions, normals, colours, UVs and indices, rounded to 0.00001 m. The plates and GLBs are made from that read-back.

| Asset | Parts | Triangles |
| --- | ---: | ---: |
| athlete | 127 | 25,160 |
| energy_ball | 10 | 3,752 |
| gravity_orb | 5 | 3,392 |
| power_core | 11 | 2,304 |
| goal_frame | 16 | 1,036 |
| keeper_drone | 19 | 2,600 |
| hoop_rig | 24 | 4,040 |
| capture_zone | 25 | 6,648 |
| holo_target | 14 | 2,896 |
| pickup_energy | 4 | 1,032 |
| pickup_shield | 4 | 664 |
| pickup_turbo | 4 | 664 |
| launch_pad | 8 | 2,204 |
| trophy | 8 | 1,936 |
| pitch | 16 | 2,316 |
| board_section | 6 | 264 |
| stand_section | 33 | 1,056 |
| floodlight | 23 | 1,096 |
| jumbotron | 14 | 1,236 |
| spectator | 5 | 68 |
| sky_tower | 36 | 1,584 |
| **Total** | **412** | **65,948** |

`npm test` checks:
- every part's attribute lengths and index range
- Babylon front-face winding
- that the extraction matches the specification (names, materials, indices, colours and UVs)
- the athlete's skinned rest height
- the pose sheet and joint heights
- GLB vertices and indices against the extraction
- arena dimensions and sport placements
- the packaged plates and PDF

The plates are orthographic software renders with studio lighting. The game uses perspective, animation, fog, bloom, tone mapping and shadows, so the pixels differ while the geometry is the same.
