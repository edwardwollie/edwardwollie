import type { SceneFactoryMap } from "../app/game.ts";
import { HangarScene } from "./hangar.ts";
import { HubScene } from "./hub.ts";
import { LaunchScene } from "./launch.ts";
import { MapScene } from "./map.ts";
import { RushScene } from "./rush.ts";
import { OrbitActivity } from "../activities/orbit.ts";
import { DockingActivity } from "../activities/docking.ts";
import { LandingActivity } from "../activities/landing.ts";
import { AsteroidActivity } from "../activities/asteroid.ts";
import { PhotoActivity } from "../activities/photo.ts";
import { StudioScene } from "./studio.ts";
import { ObservatoryScene } from "./observatory.ts";
import { STUDIO_ENABLED } from "../app/features.ts";

export const SCENES: SceneFactoryMap = {
  hub: (game) => new HubScene(game),
  map: (game) => new MapScene(game),
  rush: (game) => new RushScene(game),
  hangar: (game) => new HangarScene(game),
  launch: (game) => new LaunchScene(game),
  "act-orbit": (game) => new OrbitActivity(game),
  "act-docking": (game) => new DockingActivity(game),
  "act-moon-landing": (game) => new LandingActivity(game, "moon"),
  "act-mars-landing": (game) => new LandingActivity(game, "mars"),
  "act-asteroid": (game) => new AsteroidActivity(game),
  "act-photo": (game) => new PhotoActivity(game),
  ...(STUDIO_ENABLED ? { studio: (game) => new StudioScene(game) } : {}),
  observatory: (game) => new ObservatoryScene(game),
};
