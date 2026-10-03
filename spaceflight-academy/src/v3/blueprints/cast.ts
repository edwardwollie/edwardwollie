import { G, P, S, fibonacciSphere, halfEllipse, seeded, starOutline } from "./kit.ts";
import { PALETTE } from "./palette.ts";
import type { Blueprint, MatSpec, Part } from "./types.ts";

/**
 * The Spaceflight Academy crew, modelled on the cover art (og.png): four cadets in
 * white flight suits with royal-blue panels and magenta trim, plus Cosmo the robot.
 * Names live here so they are easy to change.
 */
export type CadetId = "omari" | "mei" | "finn" | "sofia";
export type HairStyle = "curls" | "bun" | "wavy" | "long";

export interface CadetLook {
  id: CadetId;
  name: string;
  hairStyle: HairStyle;
  skin: string;
  skinShade: string;
  hair: string;
  hairAccent?: string;
  iris: string;
  tagline: string;
  code: string;
}

export const CADETS: readonly CadetLook[] = [
  { id: "omari", name: "Omari", hairStyle: "curls", skin: "#7a4a2c", skinShade: "#653a22", hair: "#24160f", iris: "#3a2214", tagline: "Loves loud countdowns and giant engines.", code: "C-01" },
  { id: "mei", name: "Mei", hairStyle: "bun", skin: "#f2c9a8", skinShade: "#e3b08c", hair: "#1c1822", hairAccent: "#f2338f", iris: "#2a1c15", tagline: "Plans every orbit with her star charts.", code: "C-02" },
  { id: "finn", name: "Finn", hairStyle: "wavy", skin: "#f5d0b4", skinShade: "#e8b896", hair: "#e2b24e", iris: "#3c7cd0", tagline: "Builds rockets out of anything he finds.", code: "C-03" },
  { id: "sofia", name: "Sofia", hairStyle: "long", skin: "#d9a17b", skinShade: "#c88a62", hair: "#5e341d", iris: "#6a4426", tagline: "Always the first to spot a new planet.", code: "C-04" },
];

/** Suit accent colours a cadet can choose in the Crew Lounge. */
export const SUIT_ACCENTS: Readonly<Record<string, { label: string; accent: string; panel: string }>> = {
  classic: { label: "Academy Magenta", accent: "#f2338f", panel: "#2f63e0" },
  comet: { label: "Comet Cyan", accent: "#2fd3f0", panel: "#2f63e0" },
  solar: { label: "Solar Gold", accent: "#ffc23a", panel: "#2f63e0" },
  nebula: { label: "Nebula Violet", accent: "#a77bff", panel: "#3b3fb8" },
  aurora: { label: "Aurora Green", accent: "#36d690", panel: "#1f6fb8" },
  mars: { label: "Mars Orange", accent: "#ff8a3d", panel: "#2f4fc0" },
};

// Head-local reference: neck top is the head joint; skull centre 0.15 m above it.
const SKULL_Y = 0.165;
const SKULL_R = 0.182;

function hairParts(look: CadetLook): Part[] {
  const c = SKULL_Y;
  const parts: Part[] = [];
  if (look.hairStyle === "curls") {
    const rand = seeded(7);
    const balls: number[][] = [];
    for (const [x, y, z] of fibonacciSphere(96)) {
      const face = z > 0.32 && y < 0.5;
      const low = y < -0.08 && z > -0.35;
      if (face || low || y < -0.62) continue;
      const r = 0.047 + rand() * 0.017;
      const rr = SKULL_R + 0.012 + rand() * 0.013;
      balls.push([x * rr * 1.05, c + 0.03 + y * rr, 0.005 + z * rr, r]);
    }
    parts.push(P("hairVolume", S.sph(0.19), "hair", { at: [0, c + 0.045, -0.01], scale: [1.04, 0.98, 1.02] }));
    parts.push(P("curls", { kind: "cluster", balls, seg: 10 }, "hair", { name: "Curly hair" }));
  } else {
    // Hair cap: a sphere shell tilted back so the forehead stays clear.
    parts.push(P("hairCap", { kind: "sphere", r: SKULL_R + 0.012, thetaStart: 0, thetaLength: 102, seg: 32 }, "hair", {
      name: "Hair", at: [0, c, 0.004], rot: [-36, 0, 0], scale: [1.03, 1.05, 1.03],
    }));
    if (look.hairStyle === "bun") {
      parts.push(P("bangs", { kind: "cluster", balls: [[-0.094, c + 0.108, 0.124, 0.053, 0.62], [-0.039, c + 0.124, 0.141, 0.055, 0.6], [0.022, c + 0.124, 0.143, 0.055, 0.6], [0.083, c + 0.11, 0.127, 0.051, 0.62], [-0.15, c + 0.05, 0.07, 0.045, 1.1], [0.15, c + 0.05, 0.07, 0.045, 1.1]] }, "hair"));
      parts.push(P("bun", S.sph(0.086), "hair", { name: "Top bun", at: [0, c + 0.226, -0.055], scale: [1, 0.92, 1] }));
      parts.push(P("bunBand", S.tor(0.066, 0.018), "hairAccent", { at: [0, c + 0.182, -0.044], rot: [72, 0, 0] }));
      parts.push(P("streak", S.cap(0.022, 0.13), "hairAccent", { name: "Magenta streak", at: [0.077, c + 0.116, 0.127], rot: [-50, 0, -38], scale: [1, 1, 0.55] }));
    } else if (look.hairStyle === "wavy") {
      parts.push(P("swoop", { kind: "cluster", balls: [[-0.11, c + 0.11, 0.11, 0.064, 0.75], [-0.05, c + 0.155, 0.13, 0.073, 0.72], [0.028, c + 0.157, 0.124, 0.07, 0.72], [0.1, c + 0.12, 0.1, 0.06, 0.75], [0.0, c + 0.2, 0.022, 0.077, 0.8], [-0.077, c + 0.188, -0.055, 0.068, 0.8], [0.077, c + 0.185, -0.05, 0.066, 0.8], [0.0, c + 0.165, -0.12, 0.077, 0.8], [-0.155, c + 0.06, 0.03, 0.05, 1.0], [0.155, c + 0.06, 0.03, 0.05, 1.0]] }, "hair", { name: "Wavy fringe" }));
    } else {
      parts.push(P("bangs", { kind: "cluster", balls: [[-0.1, c + 0.1, 0.12, 0.055, 0.66], [-0.044, c + 0.127, 0.138, 0.057, 0.6], [0.033, c + 0.11, 0.143, 0.055, 0.62], [0.1, c + 0.088, 0.119, 0.048, 0.66]] }, "hair"));
      parts.push(P("longBack", { kind: "cluster", balls: [[-0.12, c - 0.06, -0.09, 0.07, 2.4], [-0.06, c - 0.08, -0.125, 0.075, 2.6], [0, c - 0.085, -0.135, 0.078, 2.7], [0.06, c - 0.08, -0.125, 0.075, 2.6], [0.12, c - 0.06, -0.09, 0.07, 2.4]], seg: 14 }, "hair", { name: "Long hair" }));
      parts.push(P("lockL", S.cap(0.04, 0.24), "hair", { at: [0.168, c - 0.125, 0.04], rot: [8, 0, 7], mirrorX: true }));
      parts.push(P("hairClip", { kind: "extrude", outline: starOutline(0.034, 0.015), depth: 0.014, bevel: 0.002 }, "accent", { at: [-0.13, c + 0.115, 0.108], rot: [-15, -40, 0] }));
    }
  }
  return parts;
}

function face(): Part[] {
  const c = SKULL_Y;
  return [
    G("eyeL", [
      P("eyeWhite", S.sph(0.046), "eyeWhite", { scale: [1, 1.2, 0.5] }),
      P("iris", S.sph(0.031), "iris", { at: [0, -0.005, 0.014], scale: [1, 1.12, 0.5] }),
      P("pupil", S.sph(0.0165), "pupil", { at: [0, -0.005, 0.025], scale: [1, 1.1, 0.5] }),
      P("shine", S.sph(0.009), "eyeWhite", { at: [0.011, 0.012, 0.031], scale: [1, 1, 0.4], noShadow: true }),
    ], { at: [0.068, c - 0.006, 0.157], mirrorX: true, tag: "eye", rot: [0, 9, 0] }),
    P("browL", S.box(0.062, 0.015, 0.015, 0.0065), "brow", { at: [0.07, c + 0.072, 0.165], rot: [10, 10, 7], mirrorX: true, tag: "brow" }),
    P("nose", S.sph(0.022), "skinShade", { at: [0, c - 0.04, 0.18], scale: [1.15, 0.8, 0.9] }),
    G("mouth", [
      P("mouthOpen", S.ext(halfEllipse(0.05, 0.036), 0.018, 0.004), "mouth", {}),
      P("tongue", S.ext(halfEllipse(0.028, 0.017), 0.012, 0.003), "tongue", { at: [0, -0.017, 0.004] }),
      P("teeth", S.box(0.066, 0.012, 0.01, 0.004), "teeth", { at: [0, -0.006, 0.006] }),
    ], { at: [0, c - 0.075, 0.16], rot: [-16, 0, 0], tag: "mouth" }),
    P("cheekL", S.disc(0.028), "blush", { at: [0.11, c - 0.052, 0.147], rot: [0, 38, 0], mirrorX: true, noShadow: true }),
    P("earL", S.sph(0.039), "skin", { at: [0.18, c - 0.012, 0.005], scale: [0.45, 1, 0.8], mirrorX: true }),
  ];
}

function arm(): Part {
  // Left arm (character's left = +X); mirrored to make the right arm.
  return G("armL", [
    P("shoulderBall", S.sph(0.066), "panel", { at: [0, -0.01, 0], scale: [1, 0.9, 1] }),
    P("upperArm", S.cap(0.057, 0.1), "suit", { at: [0, -0.095, 0] }),
    P("armStripe", S.box(0.014, 0.13, 0.052, 0.006), "panel", { at: [0.055, -0.095, 0] }),
    G("foreL", [
      P("elbow", S.sph(0.054), "suit", {}),
      P("forearm", S.cap(0.052, 0.085), "suit", { at: [0, -0.07, 0] }),
      P("cuff", S.cyl(0.058, 0.036), "accent", { at: [0, -0.14, 0] }),
      G("handL", [
        P("palm", S.sph(0.054), "glove", { scale: [0.86, 1, 0.72] }),
        P("thumb", S.cap(0.02, 0.032), "glove", { at: [-0.035, 0.006, 0.028], rot: [30, 0, 35] }),
      ], { at: [0, -0.19, 0], joint: "handL" }),
    ], { at: [0, -0.19, 0], joint: "foreL" }),
  ], { at: [0.198, 0.268, 0], rot: [0, 0, 9], joint: "armL", mirrorX: true });
}

function leg(): Part {
  return G("legL", [
    P("thigh", S.cap(0.074, 0.09), "suit", { at: [0, -0.1, 0] }),
    P("thighStripe", S.box(0.014, 0.13, 0.064, 0.006), "panel", { at: [0.07, -0.105, 0] }),
    P("kneePad", S.sph(0.05), "panel", { at: [0, -0.215, 0.052], scale: [1, 1, 0.55] }),
    G("shinL", [
      P("shin", S.cap(0.064, 0.07), "suit", { at: [0, -0.075, 0] }),
      P("bootCuff", S.cyl(0.075, 0.042), "panel", { at: [0, -0.13, 0] }),
      P("bootTrim", S.tor(0.074, 0.009), "accent", { at: [0, -0.107, 0], rot: [90, 0, 0] }),
      P("boot", S.box(0.135, 0.105, 0.225, 0.048), "suit", { name: "Moon boot", at: [0, -0.18, 0.026] }),
      P("sole", S.box(0.14, 0.03, 0.23, 0.012), "panel", { at: [0, -0.229, 0.026] }),
    ], { at: [0, -0.22, 0], joint: "shinL" }),
  ], { at: [0.092, -0.04, 0], joint: "legL", mirrorX: true });
}

export function cadetBlueprint(look: CadetLook): Blueprint {
  const materials: Record<string, MatSpec> = {
    suit: PALETTE.white,
    panel: PALETTE.royal,
    accent: PALETTE.magenta,
    trim: PALETTE.cyanGlow,
    glove: { color: "#2f63e0", roughness: 0.55 },
    skin: { color: look.skin, roughness: 0.62 },
    skinShade: { color: look.skinShade, roughness: 0.62 },
    hair: { color: look.hair, roughness: 0.72 },
    hairAccent: { color: look.hairAccent ?? "#f2338f", roughness: 0.6 },
    brow: { color: look.hairStyle === "wavy" ? "#b8862e" : look.hair, roughness: 0.7 },
    iris: { color: look.iris, roughness: 0.3 },
  };
  const torso = G("torso", [
    P("chest", S.box(0.36, 0.29, 0.23, 0.1), "suit", { name: "Flight suit", at: [0, 0.155, 0] }),
    P("chestPanel", S.box(0.22, 0.11, 0.03, 0.014), "panel", { at: [0, 0.19, 0.106] }),
    P("chestLight", S.box(0.12, 0.016, 0.012, 0.006), "trim", { at: [0, 0.125, 0.116] }),
    P("sidePanelL", S.box(0.03, 0.23, 0.18, 0.012), "panel", { at: [0.168, 0.14, 0], mirrorX: true }),
    P("collar", S.tor(0.078, 0.025), "accent", { name: "Magenta collar", at: [0, 0.305, 0], rot: [90, 0, 0] }),
    G("patch", [
      P("patchDisc", S.cyl(0.045, 0.012), "navy", { rot: [90, 0, 0] }),
      P("patchStar", S.ext(starOutline(0.032, 0.014), 0.008, 0.001), "white", { at: [0, 0, 0.008] }),
      P("patchRing", S.tor(0.045, 0.006), "trim", { at: [0, 0, 0.004] }),
    ], { name: "Academy star patch", at: [0.104, 0.232, 0.112], rot: [-8, 18, 0] }),
    P("strapL", S.box(0.04, 0.23, 0.02, 0.01), "panel", { at: [0.11, 0.18, 0.103], rot: [-6, 0, -4], mirrorX: true }),
    G("backpack", [
      P("packBody", S.box(0.26, 0.29, 0.12, 0.045), "suit", {}),
      P("packTop", S.box(0.26, 0.06, 0.125, 0.025), "panel", { at: [0, 0.128, 0] }),
      P("packLight", S.box(0.14, 0.018, 0.01, 0.006), "trim", { at: [0, -0.04, -0.061] }),
      P("packVentL", S.cyl(0.026, 0.05), "panel", { at: [0.085, -0.13, -0.02], mirrorX: true }),
    ], { name: "Life-support backpack", at: [0, 0.155, -0.163] }),
    P("neck", S.cyl(0.058, 0.06), "skin", { at: [0, 0.322, 0] }),
    G("head", [
      P("skull", S.sph(SKULL_R, 40), "skin", { name: "Head", at: [0, SKULL_Y, 0.005], scale: [1, 1.04, 0.98] }),
      ...face(),
      ...hairParts(look),
      G("helmet", [
        P("bubble", S.sph(0.27, 40), "glass", { at: [0, SKULL_Y + 0.025, 0.005] }),
        P("helmetRing", S.tor(0.12, 0.028), "panel", { at: [0, -0.02, 0], rot: [90, 0, 0] }),
      ], { hidden: true, tag: "helmet" }),
    ], { at: [0, 0.345, 0], joint: "head" }),
    arm(),
  ], { at: [0, 0.06, 0], joint: "torso" });
  const hips = G("hips", [
    P("pelvis", S.box(0.31, 0.15, 0.21, 0.07), "suit", { at: [0, -0.012, 0] }),
    P("belt", S.box(0.325, 0.046, 0.222, 0.02), "panel", { name: "Utility belt", at: [0, 0.05, 0] }),
    P("buckle", S.box(0.06, 0.036, 0.014, 0.008), "trim", { at: [0, 0.05, 0.112] }),
    torso,
    leg(),
  ], { at: [0, 0.504, 0], joint: "hips" });
  return {
    id: `cadet-${look.id}`,
    code: look.code,
    name: `Cadet ${look.name}`,
    category: "cast",
    subtitle: "Spaceflight Academy cadet",
    description: `${look.name} wears the Academy flight suit: a pressure-ready suit with a life-support backpack, magnetic moon boots and a bubble helmet for space walks. ${look.tagline}`,
    overall: OVERALL[look.id],
    materials,
    parts: [hips],
    rig: "cadet",
    facts: [
      "A real spacesuit is like a tiny spaceship: it gives air, keeps the right pressure, and protects from heat and cold.",
      "The backpack on a spacesuit holds oxygen and a fan that moves fresh air through the suit.",
      "Astronaut gloves are thick so hands stay warm and safe, but they make tiny jobs tricky — astronauts practise a lot!",
    ],
    sheet: { notes: ["Shared 11-joint cadet skeleton: hips, torso, head, arms, forearms, hands, legs, shins.", "Bubble helmet shown in the space-walk variant."] },
  };
}

/** Declared overall sizes (metres). Kept in sync by tools/sync-overall.mjs. */
const OVERALL: Record<CadetId, { w: number; h: number; d: number }> = {
  omari: { w: 0.62, h: 1.37, d: 0.46 },
  mei: { w: 0.62, h: 1.38, d: 0.43 },
  finn: { w: 0.62, h: 1.34, d: 0.43 },
  sofia: { w: 0.62, h: 1.28, d: 0.43 },
};

// ---------------------------------------------------------------- Cosmo the robot

export const ROBOT_NAME = "Cosmo";

export function robotBlueprint(): Blueprint {
  const head = G("head", [
    P("dome", S.sph(0.215, 40), "hull", { name: "Head shell", scale: [1.07, 0.95, 1] }),
    P("visor", { kind: "sphere", r: 0.219, phiStart: 22, phiLength: 136, thetaStart: 40, thetaLength: 90, seg: 40 }, "visor", { name: "Face visor", scale: [1.075, 0.955, 1.02] }),
    P("eyeL", S.tor(0.037, 0.012, 180), "cyanGlow", { at: [0.073, 0.02, 0.206], rot: [0, 18, 0], mirrorX: true, tag: "eye" }),
    P("smile", S.tor(0.054, 0.01, 180), "cyanGlow", { at: [0, -0.055, 0.212], rot: [0, 0, 180], tag: "mouth" }),
    P("cheekL", S.disc(0.017), "pinkGlow", { at: [0.13, -0.043, 0.183], rot: [0, 38, 0], mirrorX: true }),
    G("earL", [
      P("earDisc", S.cyl(0.074, 0.05), "hull", { rot: [0, 0, 90] }),
      P("earRing", S.tor(0.053, 0.012), "cyanGlow", { at: [0.027, 0, 0], rot: [0, 90, 0] }),
      P("earCap", S.cyl(0.032, 0.02), "royal", { at: [0.03, 0, 0], rot: [0, 0, 90] }),
    ], { name: "Audio sensor", at: [0.222, 0, 0], mirrorX: true }),
    P("antennaStalk", S.cyl(0.008, 0.08), "steel", { at: [0.05, 0.215, -0.02], rot: [0, 0, -12] }),
    P("antennaTip", S.sph(0.022), "pinkGlow", { name: "Signal light", at: [0.06, 0.26, -0.02] }),
  ], { at: [0, 0.765, 0], joint: "head" });
  const armL = G("armL", [
    P("shoulder", S.sph(0.05), "royal", {}),
    P("upper", S.cap(0.036, 0.08), "hull", { at: [0, -0.075, 0] }),
    G("foreL", [
      P("elbow", S.sph(0.036), "steel", {}),
      P("fore", S.cap(0.034, 0.07), "hull", { at: [0, -0.062, 0] }),
      P("wrist", S.cyl(0.038, 0.028), "royal", { at: [0, -0.12, 0] }),
      G("handL", [
        P("palm", S.sph(0.04), "pearl", { scale: [1, 0.9, 0.8] }),
        P("finger", S.cap(0.012, 0.036), "steel", { at: [0.018, -0.045, 0.018], rot: [15, 0, 8], radial: { count: 3, offsetDeg: 0 } }),
      ], { at: [0, -0.16, 0], joint: "handL" }),
    ], { at: [0, -0.15, 0], joint: "foreL" }),
  ], { at: [0.172, 0.455, 0], rot: [0, 0, 16], joint: "armL", mirrorX: true });
  const body = G("torso", [
    P("bodyShell", S.lathe([[0, 0], [0.1, 0.008], [0.148, 0.055], [0.166, 0.13], [0.158, 0.21], [0.125, 0.272], [0.065, 0.305], [0, 0.31]], 40), "hull", { name: "Body shell", at: [0, 0.2, 0] }),
    P("chestDisc", S.cyl(0.072, 0.02), "royal", { at: [0, 0.345, 0.153], rot: [82, 0, 0] }),
    P("chestRing", S.tor(0.077, 0.011), "cyanGlow", { at: [0, 0.345, 0.16], rot: [-8, 0, 0] }),
    P("chestStar", S.ext(starOutline(0.05, 0.022), 0.012, 0.002), "hull", { name: "Academy star emblem", at: [0, 0.345, 0.167], rot: [-8, 0, 0] }),
    P("waistBand", S.tor(0.162, 0.014), "royal", { at: [0, 0.26, 0], rot: [90, 0, 0] }),
    P("neck", S.cyl(0.045, 0.06), "steel", { at: [0, 0.535, 0] }),
    head,
    armL,
  ], { joint: "torso" });
  const base = G("hover", [
    P("skirt", S.cyl(0.11, 0.1, 0.08), "pearl", { name: "Hover thruster", at: [0, 0.205, 0] }),
    P("thrusterRing", S.tor(0.085, 0.013), "cyanGlow", { at: [0, 0.155, 0], rot: [90, 0, 0] }),
    P("glow", S.disc(0.07), "cyanGlow", { at: [0, 0.146, 0], rot: [90, 0, 0], fx: true }),
  ], { joint: "hover" });
  return {
    id: "robot-cosmo",
    code: "C-05",
    name: `${ROBOT_NAME} the Robot`,
    category: "cast",
    subtitle: "Co-pilot and hangar helper",
    description: `${ROBOT_NAME} is the Academy's friendly co-pilot robot. A hover thruster lets ${ROBOT_NAME} glide around the hangar, the visor shows happy eyes, and the audio sensors listen for mission commands.`,
    overall: { w: 0.61, h: 0.94, d: 0.44 },
    parts: [{ id: "root", children: [body, base] }],
    rig: "robot",
    facts: [
      "Robots explore places that are too far or too dangerous for people, like the surface of Mars.",
      "Rovers on Mars wait for instructions because radio messages take minutes to travel between planets.",
    ],
    sheet: { notes: ["Cosmo hovers 0.14 m above the floor on a cushion of air from the thruster ring."] },
  };
}
