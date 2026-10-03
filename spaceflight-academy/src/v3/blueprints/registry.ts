import { CADETS, cadetBlueprint, robotBlueprint } from "./cast.ts";
import { ROCKET_PART_BLUEPRINTS, cometRocket } from "./rocket.ts";
import { VEHICLE_BLUEPRINTS } from "./vehicles.ts";
import { SPACEPORT_BLUEPRINTS } from "./spaceport.ts";
import { DESTINATION_BLUEPRINTS } from "./destinations.ts";
import type { Blueprint } from "./types.ts";

const list: Blueprint[] = [
  ...CADETS.map(cadetBlueprint),
  robotBlueprint(),
  cometRocket,
  ...VEHICLE_BLUEPRINTS,
  ...ROCKET_PART_BLUEPRINTS,
  ...SPACEPORT_BLUEPRINTS,
  ...DESTINATION_BLUEPRINTS,
];

export const BLUEPRINTS: readonly Blueprint[] = list;

const byId = new Map(list.map((bp) => [bp.id, bp]));

export function getBlueprint(id: string): Blueprint | undefined {
  return byId.get(id);
}

export function requireBlueprint(id: string): Blueprint {
  const bp = byId.get(id);
  if (!bp) throw new Error(`Unknown blueprint "${id}"`);
  return bp;
}
