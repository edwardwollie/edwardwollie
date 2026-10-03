import { G, P, S, dish, starOutline } from "./kit.ts";
import type { Blueprint, MatSpec, Part } from "./types.ts";

/**
 * Spaceport buildings, the launch complex (cover-art tower) and campus props.
 * Every building's front faces +Z (toward Academy Plaza when placed on campus).
 */
const DISH: MatSpec = { color: "#eef2f8", roughness: 0.35, metalness: 0.2, doubleSide: true };
const WALL: MatSpec = { color: "#f2f5fa", roughness: 0.8 };
const GLASS_WALL: MatSpec = { color: "#2b5fb8", roughness: 0.12, metalness: 0.35, emissive: "#3a7bea", emissiveIntensity: 0.32 };
const BLUEPRINT_WALL: MatSpec = { color: "#1d4fa8", roughness: 0.2, metalness: 0.2, emissive: "#2f6fe0", emissiveIntensity: 0.5 };

const logo = (id: string, r: number, at: [number, number, number], rot: [number, number, number] = [0, 0, 0]): Part =>
  G(id, [
    P(id + "Disc", S.cyl(r, 0.12), "navy", { rot: [90, 0, 0] }),
    P(id + "Ring", S.tor(r, r * 0.07, 360, 48), "cyanGlow", { at: [0, 0, 0.05] }),
    P(id + "Star", S.ext(starOutline(r * 0.72, r * 0.31), 0.1, 0.01), "white", { at: [0, 0, 0.07] }),
  ], { at, rot, name: "Academy star logo" });

const sign = (id: string, text: string, w: number, h: number, at: [number, number, number], rot: [number, number, number] = [0, 0, 0], bg = "#14205a"): Part =>
  P(id, S.label(text, w, h, "#ffffff", bg, "#62e8ff"), "white", { at, rot, name: `Sign “${text}”` });

// ---------------------------------------------------------------- Launch complex

const towerX = -7.6;
export const launchComplex: Blueprint = {
  id: "launch-complex", code: "B-01", name: "Launch Complex 1", category: "spaceport", subtitle: "Launch pad · service tower from the cover art",
  description: "Where every Academy rocket begins its journey. The rocket stands over the flame trench, the tall service tower holds the crew access arm, and lightning masts protect everything from storms.",
  overall: { w: 29.03, h: 40.2, d: 25.93 },
  materials: { wall: WALL },
  parts: [
    P("pad", S.cyl(13, 1.2, 13.4, 8), "concrete", { name: "Launch pad", at: [0, 0.6, 0], rot: [0, 22.5, 0] }),
    P("padEdge", S.cyl(13.05, 0.2, 13.05, 8), "royal", { at: [0, 1.1, 0], rot: [0, 22.5, 0] }),
    P("trench", S.box(4.2, 0.08, 20, 0.02), "black", { name: "Flame trench", at: [0, 1.24, 2.0] }),
    P("trenchGlow", S.box(4.5, 0.06, 0.25), "pinkGlow", { at: [0, 1.25, -8.0] }),
    G("mount", [
      P("beamA", S.box(6.2, 0.9, 0.9, 0.08), "gunmetal", { at: [0, 0, 2.6] }),
      P("beamB", S.box(6.2, 0.9, 0.9, 0.08), "gunmetal", { at: [0, 0, -2.6] }),
      P("beamC", S.box(0.9, 0.9, 4.3, 0.08), "gunmetal", { at: [2.6, 0, 0] }),
      P("beamD", S.box(0.9, 0.9, 4.3, 0.08), "gunmetal", { at: [-2.6, 0, 0] }),
      P("clamp", S.box(0.5, 1.1, 0.5, 0.08), "magenta", { at: [1.75, 0.8, 1.75], radial: { count: 4 } }),
    ], { name: "Launch mount", at: [0, 1.65, 0] }),
    G("tower", [
      P("core", S.box(3.6, 30, 3.6, 0.3), "wall", { name: "Service tower", at: [0, 15, 0] }),
      P("cornerGlow", S.box(0.18, 29, 0.18), "cyanGlow", { at: [1.82, 15, 1.82], radial: { count: 4 } }),
      P("frontPanel", S.box(2.2, 26, 0.2, 0.06), "screen", { at: [0, 15, 1.82] }),
      ...[6, 12, 18, 24].map((y) => P(`deck${y}`, S.box(5.4, 0.35, 5.4, 0.1), "gunmetal", { at: [0, y, 0] })),
      P("spire", S.cyl(0.05, 9, 1.2, 12), "wall", { name: "Tower spire", at: [0, 34.5, 0] }),
      P("spireB", S.cyl(0.03, 6, 0.32, 8), "silver", { at: [1.2, 32.5, 1.2] }),
      P("spireC", S.cyl(0.03, 5, 0.28, 8), "silver", { at: [-1.2, 32, -1.2] }),
      P("beacon", S.sph(0.35), "redGlow", { at: [0, 39.1, 0], tag: "beacon" }),
      G("arm", [
        P("tunnel", S.box(4.6, 2.2, 2.2, 0.2), "wall", { name: "Crew access arm" }),
        P("armWindows", S.box(3.6, 0.6, 2.25, 0.05), "window", { at: [0, 0.3, 0] }),
        P("whiteRoom", S.box(1.6, 2.6, 2.8, 0.25), "pearl", { at: [2.4, 0, 0] }),
      ], { at: [4.0, 13.4, 0], joint: "arm" }),
      P("elevator", S.box(1.4, 30, 1.0, 0.1), "royal", { at: [-1.6, 15, -1.6] }),
    ], { at: [towerX, 1.2, 0] }),
    G("mast", [
      P("pole", S.cyl(0.18, 30, 0.35, 10), "silver", { name: "Lightning mast" }),
      P("tip", S.cone(0.3, 1.6), "gunmetal", { at: [0, 15.8, 0] }),
    ], { at: [12.6, 16.2, -9.5], mirrorX: true }),
    G("waterTower", [
      P("tank", S.sph(2.6, 28), "wall", { name: "Sound-suppression water tower" }),
      P("band", S.tor(2.6, 0.1, 360, 40), "royal", { rot: [90, 0, 0] }),
      P("leg", S.cyl(0.18, 9, 0.18, 8), "gunmetal", { at: [1.6, -5.6, 0], radial: { count: 4, offsetDeg: 45 } }),
    ], { at: [13.4, 10.2, 10.4] }),
    G("floodlight", [
      P("pole", S.cyl(0.12, 7, 0.16, 8), "gunmetal", {}),
      P("lamp", S.box(1.2, 0.5, 0.4, 0.1), "white", { at: [0, 3.6, 0.2] }),
      P("glow", S.box(1.0, 0.3, 0.05), "goldGlow", { at: [0, 3.6, 0.42] }),
    ], { at: [10.2, 4.7, 7.0], rot: [0, -125, 0], mirrorX: true }),
    sign("sign", "LAUNCH COMPLEX 1", 7.5, 1.0, [0, 1.0, 13.42], [-15, 0, 0]),
  ],
  facts: ["Big launch pads spray huge amounts of water during liftoff. The water soaks up the rumble so the sound doesn't damage the rocket.", "The flame trench under the rocket guides the fiery exhaust safely away."],
  sheet: { notes: ["Rocket centreline at the origin; the crew access arm swings away 30 seconds before liftoff."] },
};

// ---------------------------------------------------------------- Mission Control

export const missionControl: Blueprint = {
  id: "mission-control", code: "B-02", name: "Mission Control", category: "spaceport", subtitle: "Flight operations centre",
  description: "Flight controllers watch every mission from here. The big dish on the roof talks to spacecraft, and the giant screens show where every rocket is flying.",
  overall: { w: 22.4, h: 13.46, d: 18.8 },
  materials: { wall: WALL, glassWall: GLASS_WALL, dish: DISH },
  parts: [
    P("block", S.box(22, 8, 14, 0.4), "wall", { name: "Operations building", at: [0, 4, 0] }),
    P("roofTrim", S.box(22.4, 0.7, 14.4, 0.2), "royal", { at: [0, 8.2, 0] }),
    P("roofGlow", S.box(22.5, 0.12, 14.5), "cyanGlow", { at: [0, 7.8, 0] }),
    P("facade", S.box(18, 5.6, 0.3, 0.1), "glassWall", { name: "Glass control-room wall", at: [0, 4.2, 7.02] }),
    ...[-6, -3, 0, 3, 6].map((x) => P(`mullion${x}`, S.box(0.18, 5.6, 0.4), "silver", { at: [x, 4.2, 7.1] })),
    P("screenGlow", S.box(10, 2.2, 0.1), "cyanGlow", { at: [0, 5.2, 6.7] }),
    P("door", S.box(3.0, 3.0, 0.3, 0.1), "navy", { name: "Entrance", at: [0, 1.5, 7.25] }),
    P("doorFrame", S.box(3.4, 3.3, 0.2, 0.1), "cyanGlow", { at: [0, 1.55, 7.18] }),
    P("canopy", S.box(7, 0.3, 3.4, 0.12), "white", { at: [0, 3.65, 8.8] }),
    P("canopyPost", S.cyl(0.14, 3.5), "silver", { at: [3.2, 1.75, 10.2], mirrorX: true }),
    sign("sign", "MISSION CONTROL", 12, 1.4, [0, 7.25, 7.25]),
    G("bigDish", [
      P("pedestal", S.cyl(0.7, 2.2, 0.9, 16), "gunmetal", {}),
      P("yoke", S.box(1.6, 0.6, 1.0, 0.1), "silver", { at: [0, 1.3, 0] }),
      P("reflector", S.lathe(dish(3.0, 0.9).map(([r, y]) => [r, 0.9 - y] as [number, number]), 40), "dish", { name: "Deep-space dish", at: [0, 1.7, 0], rot: [-35, 0, 0] }),
      P("feed", S.cyl(0.06, 2.0), "steel", { at: [0, 2.9, 0.75], rot: [-35, 0, 0] }),
    ], { at: [5.5, 9.3, -2.5], joint: "dish" }),
    G("smallDish", [
      P("post", S.cyl(0.25, 1.4), "gunmetal", {}),
      P("reflector", S.lathe(dish(1.3, 0.4).map(([r, y]) => [r, 0.4 - y] as [number, number]), 28), "dish", { at: [0, 0.75, 0], rot: [-50, 30, 0] }),
    ], { at: [-6.5, 9.2, -3] }),
    G("flag", [
      P("pole", S.cyl(0.08, 9, 0.1, 8), "silver", {}),
      P("cloth", S.label("★", 2.4, 1.5, "#ffffff", "#2f63e0"), "white", { at: [1.25, 3.6, 0] }),
    ], { at: [-9.5, 4.5, 11.5] }),
    logo("logo", 1.4, [-8.5, 5.6, 7.22]),
  ],
  facts: ["Mission controllers use the call sign 'Houston' for NASA's Mission Control in Texas.", "Flight controllers work in shifts so someone is always watching the spacecraft."],
};

// ---------------------------------------------------------------- Rocket hangar

export const hangar: Blueprint = {
  id: "rocket-hangar", code: "B-03", name: "Rocket Hangar", category: "spaceport", subtitle: "Vehicle assembly building",
  description: "Rockets are stacked standing up inside this giant building. The tall doors open all the way to the roof so finished rockets can roll out to the launch pad.",
  overall: { w: 38.25, h: 26.45, d: 23.15 },
  materials: { wall: WALL, glassWall: GLASS_WALL },
  parts: [
    P("hall", S.box(28, 26, 22, 0.5), "wall", { name: "Assembly hall", at: [0, 13, 0] }),
    P("stripeL", S.box(2.2, 26, 0.2), "royal", { at: [-12.5, 13, 11.02], mirrorX: true }),
    P("roofTrim", S.box(28.3, 0.5, 22.3, 0.1), "royal", { at: [0, 26.2, 0] }),
    P("roofGlow", S.box(28.4, 0.12, 22.4), "cyanGlow", { at: [0, 25.8, 0] }),
    G("doors", [
      ...[-4.5, -1.5, 1.5, 4.5].map((x) => P(`door${x}`, S.box(2.9, 21, 0.4, 0.05), "gunmetal", { name: x === -4.5 ? "Rollout door panels" : undefined, at: [x, 10.5, 0] })),
      ...[3, 7, 11, 15, 19].map((y) => P(`doorBand${y}`, S.box(12, 0.25, 0.45), "silver", { at: [0, y, 0] })),
      P("hazard", S.box(12, 0.6, 0.46), "gold", { at: [0, 0.3, 0] }),
      P("doorFrame", S.box(13, 22, 0.2, 0.1), "cyanGlow", { at: [0, 11, -0.15] }),
    ], { at: [0, 0, 11.1], joint: "doors" }),
    logo("logo", 2.6, [-9.0, 20.5, 11.15]),
    sign("sign", "ROCKET HANGAR", 11, 1.8, [3.0, 23.6, 11.15]),
    G("annex", [
      P("block", S.box(10, 9, 16, 0.3), "wall", { name: "Engineering annex" }),
      P("windows", S.box(10.1, 1.4, 16.1), "glassWall", { at: [0, 1.8, 0] }),
      P("trim", S.box(10.2, 0.4, 16.2, 0.1), "royal", { at: [0, 4.6, 0] }),
    ], { at: [19, 4.5, -1.5] }),
    P("crane", S.box(26, 0.8, 0.8, 0.1), "gold", { name: "Crane rail", at: [0, 24.5, 11.6] }),
  ],
  facts: ["NASA's Vehicle Assembly Building is so tall that clouds have formed inside it on humid days."],
};

// ---------------------------------------------------------------- Observatory

export const observatory: Blueprint = {
  id: "observatory", code: "B-04", name: "Star Observatory", category: "spaceport", subtitle: "Planetarium and telescope dome",
  description: "Under the silver dome is a big telescope. The slit in the dome opens at night so the telescope can peek at planets, moons and faraway galaxies.",
  overall: { w: 14.4, h: 13.26, d: 16.05 },
  materials: { wall: WALL },
  parts: [
    P("drum", S.cyl(7, 6, 7, 48), "wall", { name: "Observatory drum", at: [0, 3, 0] }),
    P("band", S.cyl(7.06, 0.6, 7.06, 48), "royal", { at: [0, 5.7, 0] }),
    P("dome", S.dome(7.2, 90, 48), "silver", { name: "Rotating dome", at: [0, 6, 0] }),
    P("slit", { kind: "sphere", r: 7.26, phiStart: 80, phiLength: 20, thetaStart: 0, thetaLength: 88, seg: 48 }, "black", { name: "Shutter slit", at: [0, 6, 0] }),
    P("telescope", S.cyl(0.9, 6, 1.0, 24), "royal", { name: "Telescope", at: [0, 10.2, 2.2], rot: [-38, 0, 0] }),
    P("lens", S.cyl(0.92, 0.2, 0.92, 24), "cyanGlow", { at: [0, 12.6, 4.05], rot: [-38, 0, 0] }),
    P("door", S.box(2.4, 3.0, 0.4, 0.1), "navy", { name: "Entrance", at: [0, 1.5, 6.95] }),
    P("doorGlow", S.box(2.7, 3.2, 0.2, 0.1), "cyanGlow", { at: [0, 1.55, 6.88] }),
    sign("sign", "OBSERVATORY", 7.0, 1.1, [0, 4.4, 7.08]),
    P("step", S.box(4.2, 0.3, 1.8, 0.05), "concrete", { at: [0, 0.15, 7.95] }),
  ],
  facts: ["Big observatories are often built on mountains, above the clouds and far from city lights."],
};

// ---------------------------------------------------------------- Training center

export const trainingCenter: Blueprint = {
  id: "training-center", code: "B-05", name: "Astronaut Training Center", category: "spaceport", subtitle: "Simulators and the centrifuge",
  description: "Cadets practise landings and dockings in simulators here. Outside, the centrifuge spins a pod around and around so astronauts can feel the strong push of a rocket launch.",
  overall: { w: 35.48, h: 7.35, d: 13.6 },
  materials: { wall: WALL, glassWall: GLASS_WALL },
  parts: [
    P("block", S.box(18, 7, 12, 0.4), "wall", { name: "Simulator hall", at: [-7, 3.5, 0] }),
    P("windows", S.box(18.1, 1.6, 12.1), "glassWall", { at: [-7, 4.2, 0] }),
    P("trim", S.box(18.3, 0.5, 12.3, 0.12), "magenta", { at: [-7, 7.1, 0] }),
    P("door", S.box(2.8, 3.0, 0.3, 0.1), "navy", { name: "Entrance", at: [-7, 1.5, 6.05] }),
    P("doorGlow", S.box(3.1, 3.2, 0.2, 0.1), "cyanGlow", { at: [-7, 1.55, 6.0] }),
    sign("sign", "TRAINING CENTER", 9, 1.1, [-7, 5.9, 6.1]),
    P("pit", S.cyl(6.8, 1.0, 6.8, 48, true), "concrete", { name: "Centrifuge pit wall", at: [9.3, 0.5, 0] }),
    P("pitFloor", S.disc(6.8, 0, 48), "asphalt", { at: [9.3, 0.02, 0], rot: [-90, 0, 0] }),
    P("pivot", S.cyl(0.9, 4, 1.2, 20), "gunmetal", { name: "Centrifuge pivot", at: [9.3, 2, 0] }),
    G("centrifuge", [
      P("arm", S.box(12, 0.6, 0.8, 0.15), "royal", { name: "Centrifuge arm", at: [3, 0, 0] }),
      P("pod", S.sph(1.25, 24), "white", { name: "Training pod", at: [8.7, 0, 0] }),
      P("podWindow", S.disc(0.55), "window", { at: [8.7, 0.1, 1.24] }),
      P("podStripe", S.tor(1.25, 0.08, 360, 32), "magenta", { at: [8.7, 0, 0], rot: [90, 0, 0] }),
      P("counter", S.box(1.4, 0.9, 1.2, 0.2), "gunmetal", { at: [-3.3, 0, 0] }),
    ], { at: [9.3, 3.4, 0], joint: "centrifuge" }),
  ],
  facts: ["During launch, astronauts feel about three times heavier than normal. Centrifuges let them practise that feeling safely."],
};

// ---------------------------------------------------------------- Family Space Lab

export const familyLab: Blueprint = {
  id: "family-lab", code: "B-06", name: "Family Space Lab", category: "spaceport", subtitle: "Hands-on activities to try at home",
  description: "A cosy workshop full of experiments families can try together: balloon rockets on a string, flour craters, and a Moon-watching chart.",
  overall: { w: 13.4, h: 9, d: 15.9 },
  materials: { wall: { color: "#eaf4ff", roughness: 0.8 } },
  parts: [
    P("base", S.box(12, 4.5, 9, 0.3), "wall", { name: "Workshop", at: [0, 2.25, 0] }),
    P("roof", { kind: "cyl", rTop: 4.6, rBot: 4.6, h: 12.4, seg: 32, thetaStart: 0, thetaLength: 180 }, "orange", { name: "Barrel roof", at: [0, 4.4, 0], rot: [0, 0, 90] }),
    P("roofTrim", S.box(12.5, 0.3, 9.4, 0.1), "royal", { at: [0, 4.5, 0] }),
    P("window", S.disc(1.3), "window", { name: "Round window", at: [-3, 2.6, 4.52] }),
    P("windowRim", S.tor(1.3, 0.14, 360, 32), "magenta", { at: [-3, 2.6, 4.55] }),
    P("door", S.box(2.2, 3.0, 0.3, 0.3), "royal", { name: "Entrance", at: [2.5, 1.5, 4.6] }),
    sign("sign", "FAMILY SPACE LAB", 7, 1.0, [0, 4.25, 4.7]),
    G("balloonLine", [
      P("poleA", S.cyl(0.08, 3), "silver", { at: [-3, 1.5, 0] }),
      P("poleB", S.cyl(0.08, 3), "silver", { at: [3, 1.5, 0] }),
      P("string", S.cyl(0.015, 6), "white", { at: [0, 2.9, 0], rot: [0, 0, 90] }),
      P("balloon", S.sph(0.55, 20), "pink", { name: "Balloon rocket", at: [0.6, 2.9, 0], scale: [1.5, 1, 1] }),
      P("straw", S.cyl(0.05, 0.6), "gold", { at: [0.6, 2.95, 0], rot: [0, 0, 90] }),
    ], { at: [-2.5, 0, 9.2] }),
    G("sandbox", [
      P("frame", S.cyl(2.2, 0.4, 2.2, 6, true), "bark", { name: "Crater sandbox" }),
      P("sand", S.disc(2.15, 0, 6), "sand", { at: [0, 0.15, 0], rot: [-90, 0, 0] }),
      P("crater", S.tor(0.35, 0.08, 360, 20), "moonDust", { at: [0.6, 0.17, 0.4], rot: [90, 0, 0] }),
      P("craterB", S.tor(0.5, 0.1, 360, 20), "moonDust", { at: [-0.7, 0.17, -0.3], rot: [90, 0, 0] }),
    ], { at: [5.0, 0.2, 9.0] }),
  ],
  facts: ["A balloon rocket shows Newton's third law: air rushes out backwards, so the balloon zooms forwards."],
};

// ---------------------------------------------------------------- Blueprint Studio

export const studio: Blueprint = {
  id: "blueprint-studio", code: "B-07", name: "Blueprint Studio", category: "spaceport", subtitle: "Design lab · every blueprint in the game",
  description: "Engineers draw every part from all sides before anything is built. Inside you can spin each model, see it from the front, side and top, and pull it apart into an exploded view.",
  overall: { w: 14.4, h: 12.26, d: 12.4 },
  materials: { blueprintWall: BLUEPRINT_WALL },
  parts: [
    P("glassBox", S.box(14, 8, 12, 0.2), "blueprintWall", { name: "Glass studio", at: [0, 4, 0] }),
    ...[-7, 7].flatMap((x) => [-6, 6].map((z) => P(`post${x}${z}`, S.box(0.4, 8.2, 0.4), "silver", { at: [x, 4, z] }))),
    P("roofFrame", S.box(14.4, 0.4, 12.4, 0.1), "silver", { at: [0, 8.1, 0] }),
    P("panelA", S.label("FRONT · SIDE · TOP", 5.5, 1.2, "#ffffff", "#123b8c", "#ffffff"), "white", { at: [-3.6, 5.7, 6.02] }),
    P("panelB", S.label("EXPLODED VIEW", 5.0, 1.2, "#ffffff", "#123b8c", "#ffffff"), "white", { at: [3.8, 5.7, 6.02] }),
    sign("sign", "BLUEPRINT STUDIO", 8, 1.2, [0, 7.35, 6.05]),
    P("door", S.box(2.4, 3.0, 0.2, 0.1), "navy", { name: "Entrance", at: [0, 1.5, 6.05] }),
    P("triangle", S.ext([[0, 0], [5, 0], [0, 3.8]], 0.4, 0.05), "magenta", { name: "Drafting-triangle sculpture", at: [-2.2, 8.3, 0] }),
    P("ruler", S.box(6, 0.5, 0.3, 0.05), "gold", { at: [2.2, 8.55, 0], rot: [0, 0, 18] }),
  ],
  facts: ["A blueprint is a drawing that shows a part from different sides with exact sizes, so anyone can build it the same way."],
};

// ---------------------------------------------------------------- Academy Plaza with orrery

const PLANET_COLORS = ["#c9b8a6", "#e8c27a", "#3f8fe8", "#d4643a"];
export const plaza: Blueprint = {
  id: "academy-plaza", code: "B-08", name: "Academy Plaza Orrery", category: "spaceport", subtitle: "Campus centre · holographic solar system",
  description: "The heart of the campus. A glowing model of the inner solar system floats above the fountain: four planets circle the Sun, each at its own speed, just like the real ones.",
  overall: { w: 24, h: 4.77, d: 24 },
  parts: [
    P("floor", S.cyl(12, 0.2, 12, 64), "concrete", { name: "Plaza floor", at: [0, 0.1, 0] }),
    P("ring", S.disc(11.2, 10.4, 64), "royal", { at: [0, 0.21, 0], rot: [-90, 0, 0] }),
    P("ringGlow", S.disc(10.3, 10.1, 64), "cyanGlow", { at: [0, 0.22, 0], rot: [-90, 0, 0] }),
    P("mosaic", S.ext(starOutline(6.5, 2.8), 0.06, 0), "white", { at: [0, 0.23, 0], rot: [-90, 0, 0] }),
    P("basin", S.tor(4.6, 0.45, 360, 64), "pearl", { name: "Fountain basin", at: [0, 0.45, 0], rot: [90, 0, 0] }),
    P("water", S.disc(4.5, 0, 48), "water", { at: [0, 0.6, 0], rot: [-90, 0, 0] }),
    P("pillar", S.cyl(0.6, 3.6, 0.9, 20), "pearl", { name: "Orrery pillar", at: [0, 1.8, 0] }),
    P("sun", S.sph(0.95, 32), "goldGlow", { name: "Sun", at: [0, 4.4, 0], tag: "sun" }),
    ...[1.9, 2.7, 3.5, 4.4].map((radius, i) => G(`orbit${i + 1}`, [
      P(`track${i}`, S.tor(radius, 0.03, 360, 64), "cyanGlow", { rot: [90, 0, 0] }),
      P(`planet${i}`, S.sph(0.22 + i * 0.05, 20), `planet${i}`, { name: i === 2 ? "Planet models" : undefined, at: [radius, 0, 0] }),
    ], { at: [0, 4.4, 0], joint: `orbit${i + 1}` })),
    G("bench", [
      P("seat", S.box(2.6, 0.12, 0.7, 0.04), "pearl", {}),
      P("legL", S.box(0.12, 0.45, 0.6), "gunmetal", { at: [1.1, -0.28, 0], mirrorX: true }),
    ], { at: [0, 0.55, 8.4], radial: { count: 4, offsetDeg: 45 } }),
  ],
  materials: Object.fromEntries(PLANET_COLORS.map((color, i) => [`planet${i}`, { color, roughness: 0.6, emissive: color, emissiveIntensity: 0.25 }])),
  facts: ["An orrery is a moving model of the solar system. The first ones were built with clockwork gears about 300 years ago."],
};

// ---------------------------------------------------------------- Props

export const lampPost: Blueprint = {
  id: "prop-lamp", code: "P-01", name: "Campus Lamp", category: "spaceport", subtitle: "Prop", description: "Path lights with a cyan glow strip so cadets can find their way at night.",
  overall: { w: 0.9, h: 4.72, d: 2.03 },
  parts: [
    P("base", S.cyl(0.3, 0.3, 0.38, 12), "gunmetal", { at: [0, 0.15, 0] }),
    P("pole", S.cyl(0.08, 4.4, 0.1, 10), "silver", { name: "Pole", at: [0, 2.5, 0] }),
    P("arm", S.box(0.14, 0.14, 1.4, 0.05), "silver", { at: [0, 4.6, 0.6] }),
    P("head", S.box(0.9, 0.24, 0.7, 0.1), "white", { name: "Lamp head", at: [0, 4.6, 1.3] }),
    P("glow", S.box(0.75, 0.05, 0.55), "cyanGlow", { at: [0, 4.47, 1.3] }),
  ],
};

export const palmTree: Blueprint = {
  id: "prop-palm", code: "P-02", name: "Palm Tree", category: "spaceport", subtitle: "Prop", description: "Like the palm trees at real coastal spaceports, where rockets launch over the ocean.",
  overall: { w: 6.61, h: 7.03, d: 6.62 },
  parts: [
    P("trunk", S.tube([[0, 0, 0], [0.25, 2.2, 0.1], [0.75, 4.5, 0.2], [1.2, 6.4, 0.25]], 0.24, 24, 10), "bark", { name: "Trunk" }),
    G("crown", [
      P("leaf", S.ext([[0, 0], [1.4, 0.35], [3.0, 0.1], [3.4, -0.45], [1.6, -0.15]], 0.05, 0), "leaf", { name: "Palm frond", rot: [90, 0, 0], at: [0, 0, 0], radial: { count: 7, offsetDeg: 10 } }),
      P("coconut", { kind: "cluster", balls: [[0.2, -0.2, 0.1, 0.18], [-0.15, -0.25, 0.1, 0.17], [0.0, -0.22, -0.2, 0.17]] }, "bark"),
    ], { at: [1.2, 6.5, 0.25], rot: [0, 0, -8] }),
  ],
};

export const radarDish: Blueprint = {
  id: "prop-radar", code: "P-03", name: "Tracking Radar", category: "spaceport", subtitle: "Prop", description: "Tracking radars follow a rocket as it climbs, measuring exactly where it is every second.",
  overall: { w: 4.6, h: 7.74, d: 2.56 },
  materials: { dish: DISH },
  parts: [
    P("tower", S.cyl(0.6, 4.6, 1.1, 8), "pearl", { name: "Radar tower", at: [0, 2.3, 0] }),
    P("band", S.cyl(0.66, 0.4, 0.66, 8), "royal", { at: [0, 4.2, 0] }),
    G("head", [
      P("yoke", S.box(1.0, 0.8, 0.8, 0.1), "gunmetal", {}),
      P("reflector", S.lathe(dish(2.3, 0.7).map(([r, y]) => [r, 0.7 - y] as [number, number]), 36), "dish", { name: "Radar dish", at: [0, 0.4, 0.3], rot: [-60, 0, 0] }),
    ], { at: [0, 5.0, 0], joint: "dish" }),
  ],
};

export const fuelSphere: Blueprint = {
  id: "prop-fuel-sphere", code: "P-04", name: "Propellant Sphere", category: "spaceport", subtitle: "Prop", description: "Liquid oxygen is stored in giant round tanks near the pad. A sphere holds the most liquid for the least amount of metal.",
  overall: { w: 6.24, h: 7.9, d: 6.43 },
  parts: [
    P("tank", S.sph(3.0, 32), "pearl", { name: "Storage sphere", at: [0, 4.9, 0] }),
    P("band", S.tor(3.0, 0.12, 360, 48), "royal", { at: [0, 4.9, 0], rot: [90, 0, 0] }),
    P("leg", S.cyl(0.18, 4.4, 0.22, 8), "gunmetal", { at: [2.4, 2.2, 0], radial: { count: 6 } }),
    P("pipe", S.tube([[0, 1.9, 0], [0, 0.6, 1.0], [0, 0.4, 3.3]], 0.15, 12, 8), "silver", { name: "Feed pipe" }),
  ],
};

export const signpost: Blueprint = {
  id: "prop-signpost", code: "P-05", name: "Campus Signpost", category: "spaceport", subtitle: "Prop", description: "Arrows point the way to every Academy building.",
  overall: { w: 3.8, h: 3.8, d: 2.05 },
  parts: [
    P("pole", S.cyl(0.09, 3.6, 0.11, 10), "silver", { at: [0, 1.8, 0] }),
    P("topper", S.sph(0.15), "magenta", { at: [0, 3.65, 0] }),
    P("arrowA", S.label("HANGAR ➜", 2.0, 0.45, "#ffffff", "#2f63e0"), "white", { at: [0.9, 3.1, 0] }),
    P("arrowB", S.label("➜ LAUNCH PAD", 2.0, 0.45, "#ffffff", "#f2338f"), "white", { at: [0, 2.5, 0.9], rot: [0, 90, 0] }),
    P("arrowC", S.label("PLAZA ➜", 2.0, 0.45, "#0d1531", "#62e8ff"), "white", { at: [-0.9, 1.9, 0], rot: [0, 180, 0] }),
  ],
};

export const SPACEPORT_BLUEPRINTS: readonly Blueprint[] = [launchComplex, missionControl, hangar, observatory, trainingCenter, familyLab, studio, plaza, lampPost, palmTree, radarDish, fuelSphere, signpost];

