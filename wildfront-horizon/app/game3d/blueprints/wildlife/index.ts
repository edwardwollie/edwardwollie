import type { AnimalBlueprint } from "../types.ts";
import { MULE_DEER } from "./mule-deer.ts";
import { RED_DEER } from "./red-deer.ts";
import { ELK } from "./elk.ts";
import { WILD_BOAR } from "./wild-boar.ts";
import { BIGHORN } from "./bighorn.ts";
import { BISON } from "./bison.ts";
import { OVERALL } from "../overall.ts";

export const WILDLIFE: AnimalBlueprint[] = [MULE_DEER, RED_DEER, ELK, WILD_BOAR, BIGHORN, BISON];
for (const b of WILDLIFE) if (OVERALL[b.id]) b.overall = OVERALL[b.id];   // measured reference builds
export const WILDLIFE_BY_ID: Record<string, AnimalBlueprint> = Object.fromEntries(WILDLIFE.map(b => [b.id, b]));
export const WILDLIFE_BY_SPECIES: Record<string, AnimalBlueprint> = Object.fromEntries(WILDLIFE.map(b => [b.species, b]));
