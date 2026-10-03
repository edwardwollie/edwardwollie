// G-series blueprints: rifles (with scope), binoculars, caller, cartridge and
// first-person arms. Frame: +Z toward the muzzle / objective, +Y up,
// +X the shooter's LEFT. Origin: rear face of the receiver on the bore axis.

import { hex } from "../core/color.ts";
import type { AssemblyBlueprint, MatSpec, Prim } from "./assembly.ts";
import type { V2 } from "./types.ts";
import { OVERALL } from "./overall.ts";

const H = Math.PI / 2;

export interface Ballistics {
  caliber: string;
  bullet: string;
  grains: number;
  massKg: number;
  mv: number;            // muzzle velocity m/s
  bcG1: number;
  /** quadratic drag constant k (1/m) in dv/dx = −k·v, fitted to published retained velocity */
  k: number;
  zero: number;          // m
  sightHeight: number;   // m above bore
  recoil: number;        // relative kick
  magazine: number;
}

export interface RifleBlueprint extends AssemblyBlueprint {
  ballistics: Ballistics;
  scope: { minMag: number; maxMag: number; objective: number; tube: number; reticle: "duplex-bdc" | "mil-dot" };
  price: number;
  weightKg: number;
}

const MAT = (label: string, c: string, metal: number, rough: number): MatSpec => ({ label, color: hex(c), metal, rough });

function stockProfile(len: number): V2[] {
  // side profile (z, y) — butt at negative z, forend tip at positive z
  const s = len / 0.85;
  const P: V2[] = [
    [-0.395, -0.010], [-0.33, -0.018], [-0.20, -0.012], [-0.10, -0.022], [-0.05, -0.018], [-0.025, -0.013],
    [0.215, -0.013], [0.42, -0.012], [0.445, -0.018], [0.452, -0.035], [0.445, -0.052], [0.40, -0.058],
    [0.20, -0.062], [0.16, -0.068], [0.03, -0.068], [-0.01, -0.07], [-0.045, -0.095], [-0.06, -0.125],
    [-0.095, -0.13], [-0.11, -0.10], [-0.15, -0.075], [-0.30, -0.105], [-0.395, -0.16],
  ];
  return P.map(([z, y]) => [z > 0.3 ? 0.3 + (z - 0.3) * s : z, y]);
}

interface RifleOpts {
  id: string; drawing: string; title: string; subtitle: string;
  stock: MatSpec; barrel: MatSpec; barrelLen: number; brake: boolean; fluted: boolean;
  scope: { minMag: number; maxMag: number; objectiveMM: number };
  ballistics: Ballistics; price: number; weightKg: number; facts: string[];
}

function rifle(o: RifleOpts): RifleBlueprint {
  const rEnd = 0.215, muzzle = rEnd + o.barrelLen;
  const objR = (o.scope.objectiveMM / 1000) / 2 + 0.002;
  const sy = 0.040; // scope axis height
  const prims: Prim[] = [
    { id: "stock", name: "Stock", kind: "extrude", mat: "stock", p: [0.0, 0, 0], rot: [0, -H, 0], profile: stockProfile(0.85), depth: 0.034, bevel: 0.008, explode: [0, -0.12, 0] },
    { id: "pad", name: "Recoil pad", kind: "box", mat: "rubber", p: [0, -0.085, -0.405], size: [0.05, 0.152, 0.024], explode: [0, -0.12, -0.08] },
    { id: "grip-cap", name: "Grip cap", kind: "box", mat: "black", p: [0, -0.13, -0.078], size: [0.034, 0.006, 0.034], rot: [0.35, 0, 0], explode: [0, -0.16, 0] },
    { id: "receiver", name: "Receiver", kind: "cyl", mat: "metal", p: [0, 0, 0.095], rot: [H, 0, 0], r: 0.0165, r2: 0.0165, h: 0.24, seg: 20 },
    { id: "recoil-lug", name: "Recoil lug", kind: "box", mat: "metal", p: [0, -0.018, 0.205], size: [0.03, 0.01, 0.012] },
    { id: "barrel", name: o.fluted ? "Fluted barrel" : "Barrel", kind: "cyl", mat: "barrel", p: [0, 0, rEnd + o.barrelLen / 2], rot: [H, 0, 0], r: 0.0135, r2: 0.0085, h: o.barrelLen, seg: o.fluted ? 12 : 20, explode: [0, 0.1, 0.12] },
    { id: "crown", name: "Muzzle crown", kind: "ring", mat: "metal", p: [0, 0, muzzle], r: 0.0086, r2: 0.003, seg: 20, explode: [0, 0.1, 0.16] },
    { id: "bolt", name: "Bolt body", kind: "cyl", mat: "bolt", p: [0, 0, -0.0075], rot: [H, 0, 0], r: 0.0095, r2: 0.0095, h: 0.135, group: "bolt", explode: [0, 0.06, -0.22] },
    { id: "shroud", name: "Bolt shroud", kind: "cyl", mat: "metal", p: [0, 0, -0.088], rot: [H, 0, 0], r: 0.0118, r2: 0.0108, h: 0.03, group: "bolt", explode: [0, 0.06, -0.22] },
    { id: "handle", name: "Bolt handle", kind: "tube", mat: "bolt", p: [0, 0, 0], pts: [[-0.010, 0, -0.022], [-0.034, -0.008, -0.026], [-0.052, -0.026, -0.03]], tr: 0.0042, group: "bolt", explode: [0, 0.06, -0.22] },
    { id: "knob", name: "Bolt knob", kind: "sphere", mat: "bolt", p: [-0.056, -0.03, -0.031], r: 0.0105, group: "bolt", explode: [0, 0.06, -0.22] },
    { id: "safety", name: "Safety", kind: "box", mat: "black", p: [-0.017, 0.006, -0.035], size: [0.004, 0.006, 0.012] },
    { id: "guard", name: "Trigger guard", kind: "tube", mat: "black", p: [0, 0, 0], pts: [[0, -0.068, 0.036], [0, -0.09, 0.028], [0, -0.096, 0.0], [0, -0.09, -0.028], [0, -0.072, -0.045]], tr: 0.0034, explode: [0, -0.2, 0] },
    { id: "trigger", name: "Trigger", kind: "box", mat: "metal", p: [0, -0.078, 0.002], rot: [0.28, 0, 0], size: [0.006, 0.024, 0.007], group: "trigger", explode: [0, -0.2, 0.02] },
    { id: "floorplate", name: "Floorplate", kind: "box", mat: "black", p: [0, -0.07, 0.10], size: [0.031, 0.006, 0.095], explode: [0, -0.24, 0] },
    { id: "magazine", name: "Detachable magazine (5)", kind: "box", mat: "black", p: [0, -0.045, 0.10], size: [0.026, 0.05, 0.086], group: "mag", explode: [0, -0.3, 0] },
    { id: "base-r", name: "Scope base (rear)", kind: "box", mat: "black", p: [0, 0.019, 0.005], size: [0.02, 0.006, 0.045], explode: [0, 0.18, 0] },
    { id: "base-f", name: "Scope base (front)", kind: "box", mat: "black", p: [0, 0.019, 0.155], size: [0.02, 0.006, 0.045], explode: [0, 0.18, 0] },
    { id: "ring-r", name: "Scope ring (rear)", kind: "torus", mat: "black", p: [0, sy, 0.0], tor: [0.0148, 0.0042, Math.PI * 2], explode: [0, 0.26, 0] },
    { id: "ring-f", name: "Scope ring (front)", kind: "torus", mat: "black", p: [0, sy, 0.15], tor: [0.0148, 0.0042, Math.PI * 2], explode: [0, 0.26, 0] },
    { id: "ringleg-r", name: "Ring clamp (rear)", kind: "box", mat: "black", p: [0, 0.025, 0.0], size: [0.022, 0.01, 0.014], explode: [0, 0.26, 0] },
    { id: "ringleg-f", name: "Ring clamp (front)", kind: "box", mat: "black", p: [0, 0.025, 0.15], size: [0.022, 0.01, 0.014], explode: [0, 0.26, 0] },
    // scope
    { id: "scope-tube", name: "Scope main tube (25.4 mm)", kind: "cyl", mat: "scope", p: [0, sy, 0.05], rot: [H, 0, 0], r: 0.0127, r2: 0.0127, h: 0.16, group: "scope", explode: [0, 0.34, 0] },
    { id: "scope-obj", name: `Objective bell (${o.scope.objectiveMM} mm)`, kind: "lathe", mat: "scope", p: [0, sy, 0.13], rot: [H, 0, 0], profile: [[0.0127, 0], [0.0135, 0.01], [objR - 0.002, 0.04], [objR, 0.05], [objR, 0.105], [objR - 0.002, 0.108]], seg: 28, group: "scope", explode: [0, 0.34, 0.06] },
    { id: "scope-lens", name: "Objective lens", kind: "cyl", mat: "glass", p: [0, sy, 0.236], rot: [H, 0, 0], r: objR - 0.003, r2: objR - 0.003, h: 0.003, group: "scope", explode: [0, 0.34, 0.1] },
    { id: "scope-ocular", name: "Ocular bell / eyepiece", kind: "lathe", mat: "scope", p: [0, sy, -0.11], rot: [H, 0, 0], profile: [[0.0181, 0], [0.0196, 0.005], [0.0192, 0.05], [0.016, 0.07], [0.0127, 0.08]], seg: 28, group: "scope", explode: [0, 0.34, -0.06] },
    { id: "scope-eyelens", name: "Ocular lens", kind: "cyl", mat: "glass", p: [0, sy, -0.111], rot: [H, 0, 0], r: 0.0165, r2: 0.0165, h: 0.002, group: "scope", explode: [0, 0.34, -0.1] },
    { id: "scope-zoom", name: `Magnification ring ${o.scope.minMag}–${o.scope.maxMag}×`, kind: "cyl", mat: "knurl", p: [0, sy, -0.042], rot: [H, 0, 0], r: 0.0188, r2: 0.0188, h: 0.022, seg: 24, group: "scope", explode: [0, 0.34, -0.03] },
    { id: "turret-e", name: "Elevation turret", kind: "cyl", mat: "knurl", p: [0, sy + 0.0127 + 0.01, 0.055], r: 0.0115, r2: 0.0115, h: 0.022, seg: 22, group: "scope", explode: [0, 0.42, 0] },
    { id: "turret-w", name: "Windage turret", kind: "cyl", mat: "knurl", p: [-0.0127 - 0.01, sy, 0.055], rot: [0, 0, H], r: 0.0105, r2: 0.0105, h: 0.02, seg: 22, group: "scope", explode: [-0.08, 0.34, 0] },
    { id: "turret-p", name: "Side-focus (parallax) knob", kind: "cyl", mat: "knurl", p: [0.0127 + 0.009, sy, 0.055], rot: [0, 0, H], r: 0.0145, r2: 0.0145, h: 0.016, seg: 22, group: "scope", explode: [0.08, 0.34, 0] },
    { id: "swivel-r", name: "Sling swivel (rear)", kind: "torus", mat: "metal", p: [0, -0.112, -0.30], rot: [0, H, 0], tor: [0.009, 0.0018, Math.PI * 2], explode: [0, -0.2, -0.05] },
    { id: "swivel-f", name: "Sling swivel (front)", kind: "torus", mat: "metal", p: [0, -0.072, 0.40], rot: [0, H, 0], tor: [0.009, 0.0018, Math.PI * 2], explode: [0, -0.2, 0.05] },
  ];
  if (o.brake) prims.push({ id: "brake", name: "Muzzle brake", kind: "cyl", mat: "barrel", p: [0, 0, muzzle + 0.03], rot: [H, 0, 0], r: 0.0105, r2: 0.0105, h: 0.06, seg: 12, explode: [0, 0.1, 0.24] });
  const len = (o.brake ? muzzle + 0.06 : muzzle) + 0.43;
  return {
    id: o.id, drawing: o.drawing, title: o.title, subtitle: o.subtitle, category: "gear", rev: "B", scale: "1:4",
    overall: { length: len, width: 0.12, height: 0.25 },
    notes: [
      "Bolt-action, push-feed, 5-round detachable box magazine. Bolt group animates for cycling and reload.",
      `Scope axis ${Math.round(sy * 1000)} mm above the bore; rifle zeroed at ${o.ballistics.zero} m.`,
      "Stock drawn as an extruded side profile with 8 mm edge radius.",
    ],
    materials: {
      stock: o.stock, barrel: o.barrel, metal: MAT("Blued steel", "#22262c", 0.85, 0.34), bolt: MAT("Polished bolt", "#7c8288", 0.95, 0.22),
      black: MAT("Matte black", "#16181a", 0.35, 0.6), rubber: MAT("Rubber", "#111111", 0, 0.92), scope: MAT("Anodised aluminium", "#1c1e21", 0.6, 0.42),
      glass: MAT("Coated glass", "#0b2030", 0.7, 0.04), knurl: MAT("Knurled aluminium", "#2a2d32", 0.7, 0.55),
    },
    prims,
    anchors: { muzzle: [0, 0, o.brake ? muzzle + 0.06 : muzzle], eye: [0, sy, -0.195], grip: [-0.002, -0.095, -0.075], forend: [0, -0.045, 0.31], butt: [0, -0.085, -0.415], scope: [0, sy, 0.05], ejection: [-0.018, 0.006, 0.06] },
    specs: [
      { label: "Calibre", value: o.ballistics.caliber },
      { label: "Load", value: `${o.ballistics.grains} gr ${o.ballistics.bullet}` },
      { label: "Muzzle velocity", value: `${o.ballistics.mv} m/s` },
      { label: "Ballistic coefficient (G1)", value: o.ballistics.bcG1.toFixed(3) },
      { label: "Barrel", value: `${Math.round(o.barrelLen * 1000)} mm (${Math.round(o.barrelLen / 0.0254)}″)` },
      { label: "Overall length", value: `${Math.round(len * 1000)} mm` },
      { label: "Weight (scoped)", value: `${o.weightKg.toFixed(1)} kg` },
      { label: "Optic", value: `${o.scope.minMag}–${o.scope.maxMag}×${o.scope.objectiveMM}` },
      { label: "Magazine", value: `${o.ballistics.magazine} rounds` },
      { label: "Zero", value: `${o.ballistics.zero} m` },
    ],
    facts: o.facts,
    ballistics: o.ballistics,
    scope: { minMag: o.scope.minMag, maxMag: o.scope.maxMag, objective: o.scope.objectiveMM, tube: 25.4, reticle: "duplex-bdc" },
    price: o.price, weightKg: o.weightKg,
  };
}

// k fitted so v(300 m) matches typical published retained velocity for the load
const kFit = (mv: number, v300: number) => Math.log(mv / v300) / 300;

export const RIFLES: RifleBlueprint[] = [
  rifle({
    id: "ridgeline-308", drawing: "G-01", title: "Ridgeline .308", subtitle: "Bolt-action hunting rifle · walnut stock · 3–9×40",
    stock: MAT("Oiled walnut", "#6a3a1e", 0, 0.42), barrel: MAT("Blued steel", "#22262c", 0.85, 0.34), barrelLen: 0.56, brake: false, fluted: false,
    scope: { minMag: 3, maxMag: 9, objectiveMM: 40 },
    ballistics: { caliber: ".308 Winchester", bullet: "soft point", grains: 150, massKg: 0.00972, mv: 860, bcG1: 0.40, k: kFit(860, 645), zero: 100, sightHeight: 0.04, recoil: 1.0, magazine: 5 },
    price: 0, weightKg: 3.6,
    facts: ["The .308 Winchester is one of the most popular big-game cartridges in the world.", "Ideal for deer, boar and sheep out to about 300 m."],
  }),
  rifle({
    id: "summit-270", drawing: "G-02", title: "Summit .270", subtitle: "Mountain rifle · synthetic stock · fluted stainless · 4–12×44",
    stock: MAT("Synthetic (olive)", "#4a5246", 0.05, 0.82), barrel: MAT("Stainless steel", "#8f959b", 0.9, 0.3), barrelLen: 0.61, brake: false, fluted: true,
    scope: { minMag: 4, maxMag: 12, objectiveMM: 44 },
    ballistics: { caliber: ".270 Winchester", bullet: "polymer tip", grains: 130, massKg: 0.00842, mv: 930, bcG1: 0.43, k: kFit(930, 735), zero: 100, sightHeight: 0.04, recoil: 0.85, magazine: 5 },
    price: 420, weightKg: 3.1,
    facts: ["A flat-shooting favourite for mountain sheep and open-country deer.", "Lighter rifle, flatter trajectory, slightly less energy than the .308 at long range."],
  }),
  rifle({
    id: "warden-338", drawing: "G-03", title: "Warden .338", subtitle: "Heavy rifle · laminated stock · muzzle brake · 3–12×50",
    stock: MAT("Brown laminate", "#5a4636", 0, 0.5), barrel: MAT("Cerakote black", "#1e2023", 0.5, 0.45), barrelLen: 0.66, brake: true, fluted: false,
    scope: { minMag: 3, maxMag: 12, objectiveMM: 50 },
    ballistics: { caliber: ".338 Winchester Magnum", bullet: "bonded", grains: 225, massKg: 0.01458, mv: 860, bcG1: 0.48, k: kFit(860, 700), zero: 100, sightHeight: 0.045, recoil: 1.55, magazine: 5 },
    price: 680, weightKg: 4.1,
    facts: ["A heavy, deep-penetrating cartridge for elk and bison.", "The muzzle brake vents gas sideways to tame the recoil."],
  }),
];
export const RIFLES_BY_ID: Record<string, RifleBlueprint> = Object.fromEntries(RIFLES.map(r => [r.id, r]));

export const BINOCULARS: AssemblyBlueprint = {
  id: "binoculars-10x42", drawing: "G-04", title: "Binoculars 10×42 LRF", subtitle: "Roof-prism binoculars with laser rangefinder", category: "gear", rev: "B", scale: "1:2",
  overall: { length: 0.16, width: 0.13, height: 0.06 },
  notes: ["Open-bridge roof-prism body; 10× magnification, 42 mm objectives.", "Laser rangefinder (button on the right barrel) reads 10–1,200 m in the eyepiece."],
  materials: { armor: MAT("Rubber armour (olive)", "#2e3a2c", 0, 0.85), metal: MAT("Magnesium frame", "#2a2c2e", 0.6, 0.45), glass: MAT("Coated glass", "#0b2030", 0.7, 0.04), knurl: MAT("Focus wheel", "#1d1f21", 0.4, 0.6), accent: MAT("LRF button", "#c84a1e", 0.1, 0.5) },
  prims: [
    { id: "barrel-l", name: "Left barrel", kind: "cyl", mat: "armor", p: [0.034, 0, 0.0], rot: [H, 0, 0], r: 0.02, r2: 0.0235, h: 0.15, seg: 24, explode: [0.05, 0, 0] },
    { id: "barrel-r", name: "Right barrel (LRF)", kind: "cyl", mat: "armor", p: [-0.034, 0, 0.0], rot: [H, 0, 0], r: 0.02, r2: 0.0235, h: 0.15, seg: 24, explode: [-0.05, 0, 0] },
    { id: "obj-l", name: "Objective lens L", kind: "cyl", mat: "glass", p: [0.034, 0, 0.0755], rot: [H, 0, 0], r: 0.021, r2: 0.021, h: 0.002, explode: [0.05, 0, 0.04] },
    { id: "obj-r", name: "Objective lens R", kind: "cyl", mat: "glass", p: [-0.034, 0, 0.0755], rot: [H, 0, 0], r: 0.021, r2: 0.021, h: 0.002, explode: [-0.05, 0, 0.04] },
    { id: "eye-l", name: "Eyecup L", kind: "cyl", mat: "metal", p: [0.034, 0, -0.082], rot: [H, 0, 0], r: 0.018, r2: 0.018, h: 0.016, explode: [0.05, 0, -0.04] },
    { id: "eye-r", name: "Eyecup R", kind: "cyl", mat: "metal", p: [-0.034, 0, -0.082], rot: [H, 0, 0], r: 0.018, r2: 0.018, h: 0.016, explode: [-0.05, 0, -0.04] },
    { id: "bridge-f", name: "Front bridge", kind: "box", mat: "metal", p: [0, 0.004, 0.035], size: [0.05, 0.012, 0.022], explode: [0, 0.03, 0] },
    { id: "bridge-r", name: "Rear bridge / hinge", kind: "box", mat: "metal", p: [0, 0.004, -0.045], size: [0.05, 0.014, 0.026], explode: [0, 0.03, 0] },
    { id: "focus", name: "Focus wheel", kind: "cyl", mat: "knurl", p: [0, 0.012, -0.012], rot: [0, 0, H], r: 0.011, r2: 0.011, h: 0.03, seg: 24, explode: [0, 0.06, 0] },
    { id: "lrf", name: "Rangefinder button", kind: "cyl", mat: "accent", p: [-0.034, 0.022, -0.03], r: 0.005, r2: 0.005, h: 0.006, explode: [-0.05, 0.04, 0] },
  ],
  anchors: { eyes: [0, 0, -0.1], objectives: [0, 0, 0.076] },
  specs: [{ label: "Magnification", value: "10×" }, { label: "Objective", value: "42 mm" }, { label: "Field of view", value: "6.0° (105 m @ 1,000 m)" }, { label: "Exit pupil", value: "4.2 mm" }, { label: "Rangefinder", value: "10–1,200 m, ±1 m" }, { label: "Weight", value: "780 g" }],
  facts: ["Glass first: experienced hunters spend far more time behind binoculars than behind the rifle.", "A 10× view at 4.2 mm exit pupil keeps detail bright at dawn and dusk."],
};

export const CALLER: AssemblyBlueprint = {
  id: "game-caller", drawing: "G-05", title: "Game Caller", subtitle: "Grunt / bugle tube with interchangeable reeds", category: "gear", rev: "A", scale: "1:3",
  overall: { length: 0.42, width: 0.08, height: 0.09 },
  notes: ["Corrugated flexible tube projects low-frequency grunts; the reed cartridge swaps for elk bugles, red-stag roars and boar grunts.", "Use sparingly: over-calling makes game suspicious."],
  materials: { tube: MAT("Corrugated tube", "#3a4232", 0.05, 0.75), reed: MAT("Reed housing", "#1a1a1a", 0.2, 0.5), band: MAT("Blaze orange band", "#e8601c", 0, 0.6), bell: MAT("Bell", "#2c2f28", 0.1, 0.6) },
  prims: [
    { id: "mouth", name: "Mouthpiece", kind: "cyl", mat: "reed", p: [0, 0, -0.18], rot: [H, 0, 0], r: 0.009, r2: 0.012, h: 0.05, explode: [0, 0, -0.06] },
    { id: "reed", name: "Reed cartridge", kind: "cyl", mat: "reed", p: [0, 0, -0.14], rot: [H, 0, 0], r: 0.014, r2: 0.014, h: 0.03, explode: [0, 0.04, -0.04] },
    { id: "band", name: "Blaze band", kind: "cyl", mat: "band", p: [0, 0, -0.118], rot: [H, 0, 0], r: 0.0145, r2: 0.0145, h: 0.012 },
    { id: "tube", name: "Corrugated tube", kind: "tube", mat: "tube", p: [0, 0, 0], pts: [[0, 0, -0.11], [0, 0.01, -0.02], [0, 0.03, 0.08], [0, 0.04, 0.16]], tr: 0.016 },
    { id: "bell", name: "Bell", kind: "lathe", mat: "bell", p: [0, 0.04, 0.155], rot: [H, 0, 0], profile: [[0.016, 0], [0.02, 0.02], [0.03, 0.045], [0.042, 0.06]], seg: 24, explode: [0, 0, 0.06] },
  ],
  anchors: { mouth: [0, 0, -0.205] },
  specs: [{ label: "Calls", value: "Deer grunt · elk bugle · stag roar · boar grunt · sheep bleat" }, { label: "Range (calm air)", value: "≈ 400 m" }, { label: "Length", value: "420 mm" }],
  facts: ["Rutting males answer challenges — and come in looking for the rival."],
};

const caseProfile: V2[] = [[0.0001, 0], [0.00597, 0], [0.00597, 0.00137], [0.0049, 0.0016], [0.0049, 0.0027], [0.00598, 0.0031], [0.00577, 0.0396], [0.00436, 0.0439], [0.00436, 0.05118], [0.0041, 0.05118]];
const bulletProfile: V2[] = [[0.0001, 0.0475], [0.00391, 0.0475], [0.00391, 0.058], [0.0035, 0.064], [0.0022, 0.0688], [0.0006, 0.0711], [0.0001, 0.07112]];
export const CARTRIDGE: AssemblyBlueprint = {
  id: "cartridge-308", drawing: "G-06", title: ".308 Winchester Cartridge", subtitle: "150 gr soft point · SAAMI dimensions", category: "gear", rev: "A", scale: "2:1",
  overall: { length: 0.07112, width: 0.0119, height: 0.0119 },
  notes: ["Case length 51.18 mm, overall 71.12 mm, rim Ø 11.94 mm, bullet Ø 7.82 mm (.308″).", "20° shoulder; drawn as two lathe profiles (brass case, copper-jacketed bullet)."],
  materials: { brass: MAT("Brass", "#c69a4a", 1, 0.28), copper: MAT("Copper jacket", "#b5683a", 1, 0.3), lead: MAT("Exposed lead tip", "#6a6a70", 0.6, 0.5) },
  prims: [
    { id: "case", name: "Brass case", kind: "lathe", mat: "brass", p: [0, 0, 0], rot: [H, 0, 0], profile: caseProfile, seg: 32 },
    { id: "bullet", name: "150 gr soft-point bullet", kind: "lathe", mat: "copper", p: [0, 0, 0], rot: [H, 0, 0], profile: bulletProfile, seg: 32, explode: [0, 0, 0.03] },
  ],
  anchors: {},
  specs: [{ label: "Case length", value: "51.18 mm" }, { label: "Overall length", value: "71.12 mm" }, { label: "Rim diameter", value: "11.94 mm" }, { label: "Bullet diameter", value: "7.82 mm" }, { label: "Muzzle energy", value: "≈ 3,600 J" }],
};

export const GEAR: AssemblyBlueprint[] = [...RIFLES, BINOCULARS, CALLER, CARTRIDGE];
for (const g of GEAR) if (OVERALL[g.id]) g.overall = OVERALL[g.id];
export const GEAR_BY_ID: Record<string, AssemblyBlueprint> = Object.fromEntries(GEAR.map(g => [g.id, g]));
