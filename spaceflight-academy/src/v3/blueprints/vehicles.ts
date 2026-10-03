import { G, P, S, bell, dish, roundedRect, starOutline } from "./kit.ts";
import type { Blueprint, MatSpec, Part } from "./types.ts";

const DISH: MatSpec = { color: "#eef2f8", roughness: 0.35, metalness: 0.2, doubleSide: true };

const star = (id: string, r: number, extra: Partial<Part> = {}): Part =>
  G(id, [
    P(id + "Disc", S.cyl(r, 0.04), "navy", { rot: [90, 0, 0] }),
    P(id + "Star", S.ext(starOutline(r * 0.72, r * 0.31), 0.04, 0.004), "white", { at: [0, 0, 0.025] }),
    P(id + "Ring", S.tor(r, r * 0.07), "cyan", { at: [0, 0, 0.012] }),
  ], extra);

// ---------------------------------------------------------------- Moon lander

export const lander: Blueprint = {
  id: "lander-hopper", code: "V-02", name: "Moon Hopper Lander", category: "vehicle", subtitle: "Lunar lander · Moon Base missions",
  description: "Moon Hopper lands cadets gently on the Moon. The gold-foil descent stage holds the landing engine and four springy legs; the white cabin on top has a big window so the pilot can pick a safe, flat landing spot.",
  overall: { w: 4.44, h: 5.37, d: 4.44 },
  parts: [
    P("descent", S.cyl(1.6, 1.3, 1.6, 8), "goldFoil", { name: "Descent stage (gold foil)", at: [0, 2.05, 0], rot: [0, 22.5, 0] }),
    P("descentTrim", S.cyl(1.64, 0.14, 1.64, 8), "darkMetal", { at: [0, 2.72, 0], rot: [0, 22.5, 0] }),
    P("engineBell", S.lathe(bell(0.26, 0.62, 0.95), 32), "engineBell", { name: "Descent engine", at: [0, 0.45, 0] }),
    G("leg", [
      P("strut", S.tube([[1.15, 2.3, 0], [1.9, 1.1, 0], [2.55, 0.18, 0]], 0.085, 16, 10), "silver", { name: "Landing leg" }),
      P("brace", S.tube([[1.45, 1.45, 0], [1.95, 0.85, 0], [2.3, 0.5, 0]], 0.055, 10, 8), "steel"),
      P("pad", S.cyl(0.36, 0.1, 0.4, 28), "gunmetal", { name: "Footpad", at: [2.58, 0.06, 0] }),
    ], { radial: { count: 4, offsetDeg: 45 } }),
    G("cabin", [
      P("shell", S.box(2.3, 1.75, 2.1, 0.45), "hull", { name: "Crew cabin" }),
      P("band", S.box(2.34, 0.24, 2.14, 0.1), "magenta", { at: [0, -0.62, 0] }),
      P("window", S.ext(roundedRect(1.2, 0.7, 0.2), 0.08, 0.015), "window", { name: "Landing window", at: [0, 0.2, 1.05] }),
      P("windowFrame", S.ext(roundedRect(1.36, 0.86, 0.26), 0.06, 0.012), "royal", { at: [0, 0.2, 1.03] }),
      P("hatch", S.box(0.75, 0.9, 0.06, 0.12), "pearl", { name: "Front hatch", at: [0, -0.35, 1.06] }),
      G("rcs", [
        P("block", S.box(0.2, 0.3, 0.2, 0.04), "gunmetal", {}),
        P("jet", S.cone(0.05, 0.1), "steel", { at: [0.13, 0, 0], rot: [0, 0, -90] }),
      ], { name: "Steering thrusters", at: [1.22, 0.45, 1.05], radial: { count: 4, offsetDeg: 0 } }),
      P("dishMast", S.cyl(0.05, 0.6), "silver", { at: [0.7, 1.15, -0.5] }),
      P("dish", S.lathe(dish(0.42, 0.14).map(([r, y]) => [r, 0.14 - y] as [number, number]), 28), "dish", { name: "Radio dish", at: [0.7, 1.45, -0.5], rot: [-30, 0, 0] }),
      star("logo", 0.22, { at: [-0.75, 0.25, 1.06] }),
    ], { at: [0, 3.6, 0] }),
    P("ladder", S.box(0.5, 1.4, 0.08, 0.03), "silver", { name: "Ladder", at: [0, 1.1, 1.75], rot: [-18, 0, 0] }),
  ],
  materials: { dish: DISH },
  facts: ["The Moon has no air, so landers cannot use parachutes — they slow down with their engine.", "Gold foil reflects the Sun's heat and helps keep the lander from getting too hot or too cold."],
};

// ---------------------------------------------------------------- Mars rover

export const rover: Blueprint = {
  id: "rover-dusty", code: "V-03", name: "Dusty the Mars Rover", category: "vehicle", subtitle: "Six-wheel rover · Mars Canyon missions",
  description: "Dusty drives across Mars on six wheels with a rocker-bogie suspension that climbs over rocks. The camera head on the mast is Dusty's 'eyes', and the robot arm drills into rocks to find out what they are made of.",
  overall: { w: 2.9, h: 3.03, d: 4 },
  parts: [
    P("chassis", S.box(2.0, 0.62, 2.7, 0.12), "hull", { name: "Body (warm electronics box)", at: [0, 1.18, 0] }),
    P("deck", S.box(2.08, 0.1, 2.78, 0.04), "royal", { at: [0, 1.53, 0] }),
    P("stripe", S.box(2.04, 0.12, 2.74, 0.04), "magenta", { at: [0, 0.92, 0] }),
    G("rtg", [
      P("core", S.cyl(0.24, 0.9, 0.24, 20), "gunmetal", { rot: [70, 0, 0] }),
      P("fin", S.box(0.04, 0.85, 0.5), "steel", { rot: [70, 0, 0], radial: { count: 6 } }),
    ], { name: "Power generator", at: [0, 1.45, -1.55] }),
    P("hga", S.cyl(0.36, 0.06, 0.36, 6), "silver", { name: "High-gain antenna", at: [-0.55, 1.62, -0.3], rot: [10, 0, 0] }),
    P("lga", S.cyl(0.06, 0.4), "silver", { at: [0.62, 1.72, -0.6] }),
    P("mast", S.cyl(0.075, 1.25, 0.075, 16), "silver", { name: "Camera mast", at: [0.6, 2.15, 0.95] }),
    G("head", [
      P("box", S.box(0.62, 0.28, 0.34, 0.08), "hull", {}),
      P("eyeL", S.cyl(0.075, 0.08), "black", { at: [0.15, 0, 0.18], rot: [90, 0, 0], mirrorX: true, tag: "eye" }),
      P("lensL", S.sph(0.04), "cyanGlow", { at: [0.15, 0.01, 0.22], mirrorX: true }),
      P("brow", S.box(0.5, 0.05, 0.06, 0.02), "royal", { at: [0, 0.15, 0.13] }),
    ], { name: "Camera head", at: [0.6, 2.85, 0.98], joint: "head" }),
    G("armBase", [
      P("turret", S.cyl(0.14, 0.18), "gunmetal", {}),
      P("upper", S.cap(0.06, 0.62), "silver", { at: [-0.38, 0, 0.1], rot: [0, 15, 90] }),
      P("elbow", S.sph(0.09), "royal", { at: [-0.72, 0, 0.18] }),
      P("lower", S.cap(0.055, 0.45), "silver", { at: [-0.5, 0, 0.3], rot: [0, -50, 90] }),
      P("drill", S.cyl(0.11, 0.22), "gold", { name: "Drill and sensors", at: [-0.28, -0.08, 0.42] }),
    ], { name: "Robot arm", at: [0.55, 1.0, 1.42] }),
    G("wheelSet", [
      G("bogie", [
        P("rocker", S.tube([[0.14, 0.34, 1.1], [0.2, 0.86, 0.3], [0.14, 0.34, -0.05]], 0.05, 12, 8), "silver", { name: "Rocker-bogie suspension" }),
        P("rockerBack", S.tube([[0.2, 0.86, 0.3], [0.2, 0.7, -0.6], [0.14, 0.34, -1.1]], 0.05, 12, 8), "silver"),
      ], {}),
      P("wheelF", S.cyl(0.34, 0.3, 0.34, 24), "rubber", { name: "Wheel", at: [0.14, 0.34, 1.1], rot: [0, 0, 90] }),
      P("wheelM", S.cyl(0.34, 0.3, 0.34, 24), "rubber", { at: [0.14, 0.34, -0.0], rot: [0, 0, 90] }),
      P("wheelB", S.cyl(0.34, 0.3, 0.34, 24), "rubber", { at: [0.14, 0.34, -1.1], rot: [0, 0, 90] }),
      P("hubF", S.cyl(0.16, 0.32), "royal", { at: [0.14, 0.34, 1.1], rot: [0, 0, 90] }),
      P("hubM", S.cyl(0.16, 0.32), "royal", { at: [0.14, 0.34, -0.0], rot: [0, 0, 90] }),
      P("hubB", S.cyl(0.16, 0.32), "royal", { at: [0.14, 0.34, -1.1], rot: [0, 0, 90] }),
    ], { at: [1.15, 0, 0], mirrorX: true }),
  ],
  facts: ["Real Mars rovers drive slowly — about as fast as a turtle — so they don't bump into anything.", "Rocker-bogie suspension lets a rover keep all six wheels on the ground while climbing over rocks."],
};

// ---------------------------------------------------------------- Space station

const moduleTube = (id: string, length: number, at: [number, number, number], rot: [number, number, number], mat = "hull", name?: string): Part =>
  G(id, [
    P(id + "Body", S.cyl(1.7, length, 1.7, 32), mat, { name }),
    P(id + "RingA", S.tor(1.72, 0.08, 360, 40), "silver", { at: [0, length / 2 - 0.15, 0], rot: [90, 0, 0] }),
    P(id + "RingB", S.tor(1.72, 0.08, 360, 40), "silver", { at: [0, -length / 2 + 0.15, 0], rot: [90, 0, 0] }),
    P(id + "Glow", S.tor(1.715, 0.04, 360, 40), "cyanGlow", { at: [0, 0, 0], rot: [90, 0, 0] }),
  ], { at, rot });

const solarWing = (id: string, x: number, flip = 1): Part =>
  G(id, [
    P(id + "Mast", S.cyl(0.12, 11, 0.12, 8), "silver", { at: [0, flip * 5.5, 0] }),
    ...[0, 1].map((side) => P(`${id}Blanket${side}`, S.box(3.0, 10.4, 0.08, 0.02), "solarCell", { name: side === 0 && id === "wing0" ? "Solar array wing" : undefined, at: [side === 0 ? -1.65 : 1.65, flip * 5.6, 0] })),
    ...[0, 1].map((side) => P(`${id}Frame${side}`, S.box(3.08, 0.12, 0.12), "silver", { at: [side === 0 ? -1.65 : 1.65, flip * 10.8, 0] })),
  ], { at: [x, 0, 0] });

export const station: Blueprint = {
  id: "station-orbital-school", code: "V-04", name: "Orbital School Station", category: "vehicle", subtitle: "Space station · Orbital School missions",
  description: "The Academy's classroom in orbit. Cadets dock at the front port, study in the science modules, sleep in the habitat, and the big ring slowly spins to give a little pretend gravity. Solar wings on the long truss make all the station's power.",
  overall: { w: 33.38, h: 22, d: 20.44 },
  parts: [
    P("hub", S.sph(2.4, 32), "hull", { name: "Central node" }),
    star("hubLogo", 0.9, { at: [0, 0.6, 2.42] }),
    moduleTube("dockModule", 6, [0, 0, 5.2], [90, 0, 0], "hull", "Docking module"),
    G("port", [
      P("collar", S.cyl(1.2, 0.6, 1.3, 32), "silver", { rot: [90, 0, 0] }),
      P("ring", S.tor(1.05, 0.14, 360, 40), "goldGlow", { name: "Docking port (target)", at: [0, 0, 0.32] }),
      P("crossV", S.box(0.12, 1.4, 0.05), "greenGlow", { at: [0, 0, 0.36] }),
      P("crossH", S.box(1.4, 0.12, 0.05), "greenGlow", { at: [0, 0, 0.36] }),
    ], { at: [0, 0, 8.55], tag: "dockPort" }),
    moduleTube("habModule", 7, [0, 0, -5.7], [90, 0, 0], "pearl", "Habitat module"),
    moduleTube("labA", 6, [-5.2, 0, 0], [0, 0, 90], "hull", "Science lab"),
    moduleTube("labB", 6, [5.2, 0, 0], [0, 0, 90], "hull"),
    P("cupola", S.dome(1.1, 90, 24), "glass", { name: "Cupola window", at: [0, -2.3, 0], rot: [180, 0, 0] }),
    P("cupolaFrame", S.tor(1.1, 0.1, 360, 24), "silver", { at: [0, -2.3, 0], rot: [90, 0, 0] }),
    P("truss", S.box(28, 0.9, 0.9, 0.08), "gunmetal", { name: "Main truss", at: [0, 3.2, 0] }),
    P("trussLights", S.box(27.6, 0.12, 0.95), "cyanGlow", { at: [0, 3.2, 0] }),
    P("trussPost", S.box(0.6, 1.8, 0.6, 0.06), "gunmetal", { at: [0, 2.2, 0] }),
    G("wings", [
      solarWing("wing0", -13.5), solarWing("wing1", 13.5), solarWing("wing2", -13.5, -1), solarWing("wing3", 13.5, -1),
    ], { at: [0, 3.2, 0] }),
    P("radiator", S.box(2.6, 0.08, 5.0), "white", { name: "Radiator panel", at: [-8.5, 3.2, 3.2], mirrorX: true }),
    G("ring", [
      P("torus", S.tor(9.2, 1.0, 360, 72, 14), "pearl", { name: "Spinning gravity ring", rot: [90, 0, 0] }),
      P("windows", S.tor(9.2, 1.02, 360, 72, 6), "window", { rot: [90, 0, 0], scale: [1, 1, 0.35] }),
      P("spoke", S.cyl(0.32, 6.6, 0.32, 10), "silver", { name: "Spoke", at: [5.7, 0, 0], rot: [0, 0, 90], radial: { count: 4, offsetDeg: 45 } }),
    ], { joint: "ring", at: [0, 0, -1.2] }),
    P("beacon", S.sph(0.25), "redGlow", { at: [0, 4.0, 0], tag: "beacon" }),
  ],
  facts: ["The International Space Station circles Earth about 16 times every day.", "Astronauts on a space station see a sunrise or sunset about every 45 minutes."],
  sheet: { notes: ["Docking approach is along +Z toward the gold target ring."] },
};

// ---------------------------------------------------------------- Deep-space probe

export const probe: Blueprint = {
  id: "probe-pathfinder", code: "V-05", name: "Pathfinder Deep-Space Probe", category: "vehicle", subtitle: "Robot explorer · Outer Worlds missions",
  description: "Pathfinder flies past the giant outer planets. Far from the Sun, sunlight is too weak for solar panels, so it gets power from a long-lasting generator on a boom. Its huge dish sends photos home across billions of kilometres.",
  overall: { w: 6.98, h: 2.1, d: 6.1 },
  materials: { dish: DISH },
  parts: [
    P("bus", S.cyl(0.95, 0.55, 0.95, 10), "goldFoil", { name: "Electronics bus" }),
    P("busTop", S.cyl(0.98, 0.08, 0.98, 10), "darkMetal", { at: [0, 0.31, 0] }),
    P("dish", S.lathe(dish(1.85, 0.48).map(([r, y]) => [r, 0.48 - y] as [number, number]), 48), "dish", { name: "High-gain antenna dish", at: [0, 0.36, 0] }),
    P("dishFeed", S.cyl(0.05, 0.8), "steel", { at: [0, 1.1, 0] }),
    P("subReflector", S.cyl(0.22, 0.06), "silver", { at: [0, 1.52, 0] }),
    P("strutA", S.tube([[1.7, 0.75, 0], [0.9, 1.2, 0], [0.18, 1.5, 0]], 0.02, 8, 5), "steel", { radial: { count: 3 } }),
    P("rtgBoom", S.cyl(0.05, 2.6), "silver", { at: [-2.25, -0.1, 0], rot: [0, 0, 90] }),
    G("rtg", [
      P("can", S.cyl(0.2, 0.42, 0.2, 16), "gunmetal", {}),
      P("fins", S.box(0.03, 0.42, 0.55), "steel", { radial: { count: 4 } }),
    ], { name: "Power generator", at: [-2.9, -0.1, 0] }),
    P("rtg2", S.cyl(0.2, 0.42, 0.2, 16), "gunmetal", { at: [-3.4, -0.1, 0] }),
    P("rtg3", S.cyl(0.2, 0.42, 0.2, 16), "gunmetal", { at: [-2.4, -0.1, 0] }),
    P("sciBoom", S.cyl(0.05, 2.1), "silver", { at: [2.0, -0.1, 0], rot: [0, 0, 90] }),
    G("scan", [
      P("platform", S.box(0.55, 0.36, 0.5, 0.05), "white", { name: "Camera platform" }),
      P("wide", S.cyl(0.09, 0.42), "black", { at: [0.12, 0, 0.32], rot: [90, 0, 0] }),
      P("narrow", S.cyl(0.13, 0.6), "black", { at: [-0.12, 0, 0.38], rot: [90, 0, 0] }),
    ], { at: [3.1, -0.1, 0], joint: "scan" }),
    P("magBoom", S.cyl(0.025, 4.2), "silver", { name: "Magnetometer boom", at: [0, -0.2, -2.1], rot: [90, 0, 0] }),
    P("magTip", S.sph(0.09), "royal", { at: [0, -0.2, -4.2 + 0.04] }),
    P("thruster", S.lathe(bell(0.06, 0.16, 0.25), 16), "engineBell", { at: [0, -0.55, 0] }),
    P("plaque", S.disc(0.18), "gold", { name: "Greetings plaque", at: [0.7, 0.0, 0.62], rot: [0, 40, 0] }),
  ],
  facts: ["The Voyager probes launched in 1977 are still sending messages from beyond the planets.", "Radio signals from the edge of the solar system take many hours to reach Earth."],
};

// ---------------------------------------------------------------- Relay satellite

export const satellite: Blueprint = {
  id: "satellite-relay", code: "V-06", name: "Relay Satellite", category: "vehicle", subtitle: "Communications satellite · Launch Deck missions",
  description: "A relay satellite is a space post office: it catches radio messages and passes them on, so Mission Control can talk to spacecraft that are behind the curve of the Earth.",
  overall: { w: 11.26, h: 2.35, d: 2.26 },
  materials: { dish: DISH },
  parts: [
    P("bus", S.box(1.6, 1.8, 1.6, 0.08), "goldFoil", { name: "Satellite bus" }),
    P("busPanel", S.box(1.62, 0.5, 1.62, 0.04), "hull", { at: [0, 0.55, 0] }),
    P("dish", S.lathe(dish(0.75, 0.25).map(([r, y]) => [r, 0.25 - y] as [number, number]), 36), "dish", { name: "Relay dish", at: [0, 0, 0.82], rot: [90, 0, 0] }),
    P("feed", S.cyl(0.03, 0.4), "steel", { at: [0, 0, 1.25], rot: [90, 0, 0] }),
    P("horn", S.cone(0.1, 0.25), "gold", { at: [0, 0.95, 0.3] }),
    P("omni", S.cyl(0.03, 0.5), "steel", { at: [0.5, 1.15, -0.4] }),
    G("wingL", [
      P("yoke", S.cyl(0.05, 0.6), "silver", { at: [1.1, 0, 0], rot: [0, 0, 90] }),
      ...[0, 1, 2].map((i) => P(`panel${i}`, S.box(1.35, 1.9, 0.05, 0.02), "solarCell", { name: i === 0 ? "Solar panel" : undefined, at: [2.1 + i * 1.42, 0, 0] })),
      ...[0, 1, 2].map((i) => P(`edge${i}`, S.box(1.38, 0.06, 0.07), "silver", { at: [2.1 + i * 1.42, 0.97, 0] })),
    ], { mirrorX: true }),
    P("beacon", S.sph(0.08), "greenGlow", { at: [0, 0.98, -0.6], tag: "beacon" }),
  ],
  facts: ["Some satellites orbit so high (about 36,000 km) that they go around once a day and seem to hover over the same spot on Earth."],
};

export const VEHICLE_BLUEPRINTS: readonly Blueprint[] = [lander, rover, station, probe, satellite];

