# Wildfront Horizon 3.0.0 — 3D Blueprint Edition

Wildfront Horizon is now a full 3D hunting game. Every animal, rifle, optic, building and plant is built from an engineering blueprint. The same blueprints drive the in-game models, the in-game Blueprint Studio and the printed A3 blueprint book.

## Blueprints: one source of truth (37 blueprints)
- **Wildlife (A-series):** mule deer, red deer, elk, wild boar, bighorn sheep and bison. Each one includes:
  - a skeleton rig, body sections and male/female variants;
  - antlers, horns or tusks that grow with age;
  - organs, a vital region, gaits (walk, trot, gallop and the mule deer's stot), senses, tracks and trophy scoring.
- **Gear (G-series):**
  - three rifles: Ridgeline .308 (3–9×40), Summit .270 (4–12×44) and Warden .338 (3–12×50);
  - 10×42 rangefinding binoculars, the game caller and a .308 Winchester cartridge;
  - every part is named, has a material and can be exploded.
- **Structures (S-01…S-09, V-01):** lookout tower, tree stand, ground blind, trapper's cabin, trail kiosk, footbridge, fence, ranger station, Wildfront Lodge and the hunter's pickup truck. Towers and stands can be climbed.
- **Flora (F-series):** 15 plants and ground features, from lodgepole pine to reeds, placed by reserve biome.
- **Accuracy check:** a conformance test rebuilds every model and fails if it drifts more than 15 mm from its blueprint's overall dimensions.

## Five 3D reserves
- **Reserves:** Aurora Pines, Crimson Highlands, Verdant Basin, Obsidian Steppe and the new Horizon Crossing (the Grand Slam ground).
- **Terrain:** generated heightfield terrain with lakes, rivers, ridges, canyons, trails and named landmarks.
- **Vegetation:** instanced forests with impostors, and wind-animated grass.
- **Water, sky and weather:** water, a dynamic sky with sun, moon and stars, and fog, rain, snow and thunderstorms. Each reserve has a time of day that changes during the hunt.
- **Maps:** surveyed topographic maps with contours, hillshade, trails and landmarks. They appear in the briefings, on the minimap and on the full field map (M), where you can set a waypoint.

## Hunting
- **Wildlife AI:**
  - Herds graze, walk, drink, bed, investigate, go alert and flee.
  - Animals smell you downwind, hear noise that depends on your stance and the surface, and see movement. Rain and storms mask your sound.
  - Every shot alarms all animals that hear it; the report travels at 343 m/s.
- **Tracking:** tracks, droppings, beds and hit sign can be read (F) for species, heading and pace. The Trail Scanner (E) highlights fresh sign.
- **Recovery:** wounded animals leave a blood trail to follow. The default hit sign is stylised amber; a realistic option is in Settings. There is no gore.
- **Hunter:** stand, crouch and prone stances, plus stamina and heart rate. Noise and visibility meters, camo, the scent blocker and the game caller (T) all affect how close you can get.
- **Ballistics:** each cartridge's drag is fitted to published velocity data. Every shot is simulated with bullet drop, wind drift, time of flight and retained energy.
- **Optics:**
  - Second-focal-plane duplex scopes. The BDC holdover marks come from each rifle's own trajectory, and windage dots are 1 mil apart.
  - Variable zoom, plus a steady-breath hold (Shift).
  - 10×42 laser-rangefinder binoculars (B) spot game, identify it and estimate trophy class.
- **Shot analysis card:** shows an X-ray side and plan view with the bullet path, the organ hit, range, energy and grade.
- **Trophy tag card:** shows the score and a rating (bronze, silver, gold or diamond).

## Kept from 2.0.3 (unchanged rules)
- All twelve contracts: same names, reserves, species, times, weather and objectives.
- PERFECT / GREAT / GOOD shot grades, points and stars.
- Field Kit upgrades: names and 120 × (level + 1) pricing.
- Q/E/Shift/R controls and the save key `wildfront-save-v1`.
- Existing progress migrates automatically.
- Shooting an unlicensed species costs 150 points and does not count toward the contract.

## New screens
- **Lodge:** has a live 3D backdrop of the next reserve, plus a first-run intro and a 5-step field training.
- **Contracts and briefing:** contract board, and briefings with a surveyed map, conditions, licence, field notes and loadout.
- **Free Hunt:** choose the reserve, time, weather and species. Tagged trophies earn credits.
- **Gear Locker:** rifles with trajectory tables, a gear store (ghillie wrap, game caller, scent blocker) and the Field Kit.
- **Trophy Lodge:** trophy turntable with plaques, records, a hunting journal and 16 achievements.
- **Field Guide:** each species in shaded, line-art and X-ray views, with senses, shot placement, tracks at true scale and trophy tiers.
- **Blueprint Studio:** every blueprint with orthographic and isometric views, blueprint, paper and X-ray styles, poses, sex and an exploded view. Includes dimensions, a title block and PNG sheet export.
- **Settings:** quality (auto, low, medium, high, ultra), FOV, look and scoped sensitivity, invert look, hold or toggle aim, difficulty (relaxed, standard or realistic), hit sign, shot card, metric or imperial units, minimal HUD and volumes.

## Engineering
- **Rendering:** three.js on a single persistent WebGL2 canvas. Adaptive resolution aims for 45–60 fps. Audio is generated in the browser with no sample files: wind, birdsong, crickets and owls, rain, thunder, footsteps by surface, rifle reports with valley echoes, impacts, hooves and calls.
- **Fallback:** browsers without WebGL2 are offered the Classic 2.0 edition. Classic 2.0.3 stays fully playable at `/classic` and shares the same save.
- **Blueprint book:** a bookmarked A3 PDF of 47 sheets in third-angle projection with standard scales, generated by `tools/blueprint-book`.
- **Deployment (unchanged):** hostname `hunt.flexzonicgames.com`, port 8096, health `/healthz` → `wildfront-ok`, Docker build and `deploy.sh`.
