// F-series blueprints: trees, shrubs, rocks and ground cover. Heights are the
// reference specimen; reserves scale instances ±25 %.

import { hex } from "../core/color.ts";
import type { BlueprintMeta, RGB } from "./types.ts";
import { OVERALL } from "./overall.ts";

export type FloraForm = "spruce" | "pole-pine" | "scots-pine" | "broadleaf" | "aspen" | "birch" | "juniper" | "willow" | "snag" | "shrub" | "sage" | "heather" | "boulder" | "log" | "reeds";

export interface FloraBlueprint extends BlueprintMeta {
  category: "flora";
  form: FloraForm;
  latin: string;
  height: number;          // reference height (m)
  trunkR: number;          // trunk radius at the base (m)
  crownBase: number;       // fraction of height where foliage begins
  crownR: number;          // widest crown radius (m)
  bark: RGB; barkTop?: RGB;
  foliage: RGB; foliageTip: RGB;
  collider: number;        // collision / bullet-stop radius at the base (m)
  facts: string[];
}

const meta = (id: string, drawing: string, title: string, latin: string): Pick<FloraBlueprint, "id" | "drawing" | "title" | "category" | "rev" | "scale" | "notes" | "latin" | "overall"> =>
  ({ id, drawing, title, latin, category: "flora", rev: "B", scale: "1:100", notes: [], overall: { length: 0, width: 0, height: 0 } });

export const FLORA: FloraBlueprint[] = [
  { ...meta("lodgepole-pine", "F-01", "Lodgepole Pine", "Pinus contorta var. latifolia"), form: "pole-pine", height: 20, trunkR: 0.22, crownBase: 0.58, crownR: 2.3, bark: hex("#6b5a4a"), barkTop: hex("#8a6a50"), foliage: hex("#2c4a2a"), foliageTip: hex("#4a6a38"), collider: 0.32,
    facts: ["Tall, straight 'lodge-pole' trunk used for tipis and cabins.", "Serotinous cones open after fire, reseeding burned slopes."] },
  { ...meta("engelmann-spruce", "F-02", "Engelmann Spruce", "Picea engelmannii"), form: "spruce", height: 22, trunkR: 0.3, crownBase: 0.06, crownR: 3.4, bark: hex("#5a4a40"), foliage: hex("#22402e"), foliageTip: hex("#3e6248"), collider: 0.4,
    facts: ["Dense spire crown down to the ground — prime bedding cover.", "Blue-green needles; thrives near treeline."] },
  { ...meta("scots-pine", "F-03", "Scots Pine", "Pinus sylvestris"), form: "scots-pine", height: 18, trunkR: 0.26, crownBase: 0.55, crownR: 3.4, bark: hex("#5e4a3e"), barkTop: hex("#b0643a"), foliage: hex("#2e4a30"), foliageTip: hex("#52703e"), collider: 0.34,
    facts: ["Orange upper bark and a flat, irregular crown.", "The native pine of the Scottish highlands."] },
  { ...meta("quaking-aspen", "F-04", "Quaking Aspen", "Populus tremuloides"), form: "aspen", height: 13, trunkR: 0.16, crownBase: 0.45, crownR: 2.6, bark: hex("#d8d4c4"), barkTop: hex("#e6e2d4"), foliage: hex("#7a9a3a"), foliageTip: hex("#c8b440"), collider: 0.22,
    facts: ["Flat leaf stalks make the leaves tremble in the lightest breeze.", "Groves are often one clone joined by a single root system."] },
  { ...meta("bur-oak", "F-05", "Bur Oak", "Quercus macrocarpa"), form: "broadleaf", height: 17, trunkR: 0.45, crownBase: 0.32, crownR: 7.0, bark: hex("#4e4238"), foliage: hex("#3a5a26"), foliageTip: hex("#6a8434"), collider: 0.55,
    facts: ["Huge fringed acorns — a magnet for deer and boar in autumn.", "Thick corky bark survives prairie fires."] },
  { ...meta("silver-birch", "F-06", "Silver Birch", "Betula pendula"), form: "birch", height: 15, trunkR: 0.17, crownBase: 0.4, crownR: 2.8, bark: hex("#e8e6dc"), barkTop: hex("#d0ccc0"), foliage: hex("#6a8a34"), foliageTip: hex("#b8a83c"), collider: 0.22,
    facts: ["Papery white bark with black diamond scars.", "Pioneer tree of heath and moorland edges."] },
  { ...meta("rocky-juniper", "F-07", "Rocky Mountain Juniper", "Juniperus scopulorum"), form: "juniper", height: 6, trunkR: 0.2, crownBase: 0.15, crownR: 2.2, bark: hex("#6e5446"), foliage: hex("#3e5240"), foliageTip: hex("#6a7a5e"), collider: 0.3,
    facts: ["Shaggy, twisted and slow growing — some are over 1,000 years old.", "Blue 'berries' (cones) feed birds through winter."] },
  { ...meta("willow", "F-08", "Sandbar Willow", "Salix interior"), form: "willow", height: 6.5, trunkR: 0.12, crownBase: 0.2, crownR: 3.0, bark: hex("#5a5040"), foliage: hex("#6a8a40"), foliageTip: hex("#9aaa58"), collider: 0.25,
    facts: ["Thicket-forming shrub of riverbanks and marsh edges.", "Browse favourite of moose and deer."] },
  { ...meta("dead-snag", "F-09", "Dead Snag", "standing dead conifer"), form: "snag", height: 14, trunkR: 0.24, crownBase: 0.5, crownR: 1.8, bark: hex("#8a8278"), barkTop: hex("#a49c92"), foliage: hex("#8a8278"), foliageTip: hex("#a49c92"), collider: 0.3,
    facts: ["Woodpecker cavities shelter owls and bats.", "Snags and fallen logs mark old burns."] },
  { ...meta("forest-shrub", "F-10", "Forest Shrub", "Ribes / Vaccinium spp."), form: "shrub", height: 1.2, trunkR: 0.03, crownBase: 0, crownR: 1.0, bark: hex("#4a3e30"), foliage: hex("#3e5a2c"), foliageTip: hex("#6a7e3a"), collider: 0,
    facts: ["Understorey berries feed bears, birds and deer.", "Cover for a crouching hunter — and for bedded game."] },
  { ...meta("sagebrush", "F-11", "Big Sagebrush", "Artemisia tridentata"), form: "sage", height: 1.1, trunkR: 0.03, crownBase: 0, crownR: 0.8, bark: hex("#5a5048"), foliage: hex("#7a8a74"), foliageTip: hex("#a8b4a0"), collider: 0,
    facts: ["Silver-grey, strongly scented shrub of the steppe.", "Winter food for pronghorn and mule deer."] },
  { ...meta("heather", "F-12", "Heather", "Calluna vulgaris"), form: "heather", height: 0.6, trunkR: 0.02, crownBase: 0, crownR: 0.7, bark: hex("#4a3a30"), foliage: hex("#5a4a46"), foliageTip: hex("#9a5a8a"), collider: 0,
    facts: ["Turns the highland moors purple in late summer.", "Young shoots are grazed by red deer and grouse."] },
  { ...meta("boulder", "F-13", "Boulder Set", "granite / sandstone / basalt"), form: "boulder", height: 1.6, trunkR: 0, crownBase: 0, crownR: 1.4, bark: hex("#77736c"), foliage: hex("#77736c"), foliageTip: hex("#8a867e"), collider: 1.1,
    facts: ["Glacial erratics and rockfall make solid cover and a steady rest for a shot."] },
  { ...meta("fallen-log", "F-14", "Fallen Log", "windthrown conifer"), form: "log", height: 0.6, trunkR: 0.3, crownBase: 0, crownR: 6, bark: hex("#6a5a4a"), foliage: hex("#5a5040"), foliageTip: hex("#7a6a58"), collider: 0,
    facts: ["Bears tear logs apart for grubs; grouse drum on them in spring."] },
  { ...meta("reeds", "F-15", "Cattail Reeds", "Typha latifolia"), form: "reeds", height: 1.8, trunkR: 0.01, crownBase: 0, crownR: 0.6, bark: hex("#6a6a3a"), foliage: hex("#6a7a3a"), foliageTip: hex("#5a3e26"), collider: 0,
    facts: ["Brown 'cattail' seed heads; shelter for ducks and herons."] },
];

for (const f of FLORA) if (OVERALL[f.id]) f.overall = OVERALL[f.id];
export const FLORA_BY_ID: Record<string, FloraBlueprint> = Object.fromEntries(FLORA.map(f => [f.id, f]));
