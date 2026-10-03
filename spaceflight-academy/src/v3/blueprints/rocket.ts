import { G, P, R, S, bell, dish, ogive, roundedRect, starOutline } from "./kit.ts";
import type { Blueprint, MatSpec, Part } from "./types.ts";

/**
 * The Comet rocket family (cover-art rocket: white hull, magenta nose and fins,
 * cyan glow lines, panorama window, three-engine cluster) and the 12 Academy
 * rocket systems from v2.1 as real, attachable 3D parts.
 *
 * Core diameter is 3.0 m. Stack parts have y = 0 at their bottom joint.
 */
export const CORE_R = 1.5;

const DISH: MatSpec = { color: "#eef2f8", roughness: 0.35, metalness: 0.2, doubleSide: true };
const ACADEMY_STAR = (id: string, at: [number, number, number], rot: [number, number, number], r = 0.32): Part =>
  G(id, [
    P(id + "Disc", S.cyl(r, 0.03), "navy", { rot: [90, 0, 0] }),
    P(id + "Ring", S.tor(r, r * 0.07), "cyan", { at: [0, 0, 0.012] }),
    P(id + "Star", S.ext(starOutline(r * 0.72, r * 0.31), 0.03, 0.004), "white", { at: [0, 0, 0.02] }),
  ], { at, rot });

// ---------------------------------------------------------------- base airframe

export const thrustSection: Blueprint = {
  id: "part-thrust", code: "S-00", name: "Thrust Structure", category: "system", subtitle: "Base airframe · holds the engines",
  description: "The strong skirt at the bottom of the rocket. Every engine bolts to its thrust plate, and the whole push of the engines travels up through it into the rocket.",
  overall: { w: 3.24, h: 1.3, d: 3.24 },
  parts: [
    P("skirt", S.lathe([[0, 0], [1.62, 0], [1.61, 0.16], [1.53, 0.52], [1.5, 1.2], [0, 1.2]], 48), "navy", { name: "Flared skirt" }),
    P("skirtRing", S.tor(1.535, 0.035, 360, 64), "cyanGlow", { at: [0, 0.56, 0], rot: [90, 0, 0] }),
    P("plate", S.cyl(1.3, 0.1), "darkMetal", { name: "Thrust plate", at: [0, -0.05, 0] }),
    P("bolt", S.cyl(0.06, 0.05), "steel", { at: [1.42, 0.9, 0.0], rot: [0, 0, 90], radial: { count: 12 } }),
  ],
  facts: ["The thrust structure has to be very strong: big rocket engines push with the weight of thousands of cars."],
};

export const engine: Blueprint = {
  id: "part-engine", code: "S-01", name: "Main Engine", category: "system", subtitle: "Propulsion · v2.1 system “Mount Main Engine”",
  description: "A rocket engine burns propellant in the combustion chamber and squirts the hot gas out of the bell nozzle very fast. Pushing gas down pushes the rocket up!",
  overall: { w: 1.24, h: 1.9, d: 1.24 },
  parts: [
    P("mount", S.cyl(0.34, 0.22), "gunmetal", { name: "Gimbal mount", at: [0, -0.11, 0] }),
    P("chamber", S.cyl(0.3, 0.44, 0.27), "darkMetal", { name: "Combustion chamber", at: [0, -0.44, 0] }),
    P("pump", S.cyl(0.15, 0.5), "steel", { name: "Turbopump", at: [0.47, -0.38, 0] }),
    P("pumpCap", S.sph(0.15), "gunmetal", { at: [0.47, -0.13, 0], scale: [1, 0.5, 1] }),
    P("feedA", S.tube([[0.47, -0.62, 0], [0.42, -0.72, 0], [0.26, -0.62, 0]], 0.045), "copper", { name: "Propellant feed line" }),
    P("feedB", S.tube([[0.4, -0.2, 0.08], [0.2, -0.22, 0.2], [0.1, -0.3, 0.26]], 0.04), "copper"),
    P("bell", S.lathe(bell(0.21, 0.62, 1.26), 40), "engineBell", { name: "Nozzle bell", at: [0, -1.9, 0] }),
    P("ringA", S.tor(0.44, 0.022, 360, 40), "copper", { at: [0, -1.26, 0], rot: [90, 0, 0] }),
    P("ringB", S.tor(0.3, 0.02, 360, 40), "copper", { at: [0, -0.92, 0], rot: [90, 0, 0] }),
  ],
  facts: ["Rocket engines carry their own oxygen supply, so they can work in space where there is no air.", "The bell shape helps the exhaust leave in one direction, giving a stronger push."],
  sheet: { notes: ["Engine origin is its mounting face (top). Up to three engines fit the thrust plate."] },
};

const TANK_H = 3.2;
export const tank: Blueprint = {
  id: "part-tank", code: "S-02", name: "Fuel Tank", category: "system", subtitle: "Energy · v2.1 system “Add Fuel Tank”",
  description: "Holds the propellant the engines burn. More tanks mean the rocket can burn longer and travel farther — but they also make the rocket heavier to lift.",
  overall: { w: 3.08, h: 3.2, d: 3.05 },
  parts: [
    P("shell", S.cyl(CORE_R, TANK_H, CORE_R, 56), "hull", { name: "Tank shell", at: [0, TANK_H / 2, 0] }),
    P("band", S.cyl(CORE_R + 0.012, 0.34, CORE_R + 0.012, 56), "royal", { name: "Blue band", at: [0, 0.44, 0] }),
    P("glow", S.tor(CORE_R + 0.004, 0.032, 360, 72), "cyanGlow", { at: [0, 2.95, 0], rot: [90, 0, 0] }),
    P("weldBottom", S.tor(CORE_R, 0.024, 360, 64), "silver", { at: [0, 0.025, 0], rot: [90, 0, 0] }),
    P("weldTop", S.tor(CORE_R, 0.024, 360, 64), "silver", { at: [0, TANK_H - 0.025, 0], rot: [90, 0, 0] }),
    P("gauge", S.box(0.26, 1.9, 0.06, 0.03), "screen", { name: "Fuel gauge window", at: [0, 1.78, CORE_R - 0.005] }),
    P("gaugeFill", S.box(0.15, 1.3, 0.04, 0.02), "goldGlow", { at: [0, 1.48, CORE_R + 0.02], tag: "fuelFill" }),
    ACADEMY_STAR("starL", [CORE_R + 0.005, 1.8, 0], [0, 90, 0]),
    ACADEMY_STAR("starR", [-CORE_R - 0.005, 1.8, 0], [0, -90, 0]),
  ],
  facts: ["Most of a rocket's weight at liftoff is propellant.", "Liquid-fuel rockets often carry a fuel (like kerosene or hydrogen) and an oxidizer (like liquid oxygen) in separate tanks."],
};

const FIN_OUTLINE = [[0, 3.3], [0, 0.25], [1.85, -1.0], [1.85, 0.45]] as const;
export const fins: Blueprint = {
  id: "part-fins", code: "S-03", name: "Stability Fins", category: "system", subtitle: "Control · v2.1 system “Fit Stability Fins”",
  description: "Four swept fins at the bottom work like the feathers on an arrow. Air pushing on them keeps the rocket pointing straight while it flies through the atmosphere.",
  overall: { w: 4.76, h: 4.39, d: 4.76 },
  parts: [
    G("fin", [
      P("blade", S.ext(FIN_OUTLINE.map(([x, y]) => [x, y] as [number, number]), 0.16, 0.035), "magenta", { name: "Swept fin" }),
      P("rootStrip", S.box(0.12, 2.8, 0.2, 0.04), "white", { at: [0.02, 1.75, 0] }),
      P("tipLight", S.box(0.06, 1.1, 0.05, 0.02), "pinkGlow", { at: [1.86, -0.27, 0] }),
    ], { name: "Fin", at: [1.42, 0, 0], radial: { count: 4, offsetDeg: 45 } }),
  ],
  facts: ["Fins only work in air. In space, rockets steer by tilting the engine or firing small thrusters."],
};

export const computer: Blueprint = {
  id: "part-computer", code: "S-04", name: "Guidance Computer", category: "system", subtitle: "Navigation · v2.1 system “Program Guidance”",
  description: "The rocket's brain. Gyroscopes and star trackers measure which way the rocket points, and the computer steers to keep it on the planned path.",
  overall: { w: 3, h: 0.7, d: 3.28 },
  parts: [
    P("ring", S.cyl(CORE_R, 0.7, CORE_R, 56), "gunmetal", { name: "Avionics ring", at: [0, 0.35, 0] }),
    P("lightRing", S.tor(CORE_R + 0.004, 0.026, 360, 72), "cyanGlow", { at: [0, 0.18, 0], rot: [90, 0, 0] }),
    P("status", S.box(0.26, 0.12, 0.06, 0.02), "goldGlow", { at: [0, 0.48, CORE_R], radial: { count: 8, offsetDeg: 22.5 } }),
    P("imu", S.box(0.56, 0.4, 0.2, 0.05), "pearl", { name: "Gyroscope unit (IMU)", at: [0, 0.36, CORE_R + 0.06] }),
    P("trackerL", S.cyl(0.1, 0.26), "black", { name: "Star tracker", at: [0.4, 0.42, CORE_R + 0.12], rot: [60, 0, 0], mirrorX: true }),
  ],
  facts: ["Star trackers recognise patterns of stars, just like you might spot the Big Dipper, to tell which way a spacecraft is facing."],
};

export const parachute: Blueprint = {
  id: "part-parachute", code: "S-05", name: "Parachute Bay", category: "system", subtitle: "Recovery · v2.1 system “Pack Parachute”",
  description: "Three big parachutes are packed tightly in this bay. When the capsule comes home through the air, they open and slow it down for a gentle splashdown.",
  overall: { w: 3.03, h: 0.6, d: 3.06 },
  parts: [
    P("bay", S.cyl(CORE_R, 0.6, CORE_R, 56), "orange", { name: "Parachute bay", at: [0, 0.3, 0] }),
    P("cover", S.arc(CORE_R + 0.015, 0.46, 0, 100, 24), "white", { name: "Bay cover", at: [0, 0.3, 0], radial: { count: 3, offsetDeg: 10 } }),
    P("pin", S.cyl(0.05, 0.08), "red", { at: [CORE_R + 0.02, 0.3, 0], rot: [0, 0, 90], radial: { count: 3, offsetDeg: -35 } }),
  ],
  facts: ["Parachutes work by catching lots of air. The air pushes back (drag) and slows the capsule down."],
};

export const antenna: Blueprint = {
  id: "part-antenna", code: "S-06", name: "Comms Antenna", category: "system", subtitle: "Communication · v2.1 system “Connect Antenna”",
  description: "A dish antenna sends radio messages to Mission Control and listens for commands. Pointing the dish carefully makes the signal much stronger.",
  overall: { w: 1.98, h: 1.14, d: 1.64 },
  materials: { dish: DISH },
  parts: [
    P("base", S.cyl(0.2, 0.22), "gunmetal", { name: "Pivot base", at: [0.1, 0, 0], rot: [0, 0, 90] }),
    P("boom", S.cyl(0.06, 1.0), "silver", { name: "Antenna boom", at: [0.65, 0, 0], rot: [0, 0, 90] }),
    P("joint", S.sph(0.11), "royal", { at: [1.15, 0, 0] }),
    P("dish", S.lathe(dish(0.82, 0.3).map(([r, y]) => [r, 0.3 - y] as [number, number]), 40), "dish", { name: "Dish reflector", at: [1.15, 0.08, 0] }),
    P("feed", S.cyl(0.03, 0.5), "steel", { at: [1.15, 0.6, 0] }),
    P("horn", S.sph(0.08), "gold", { name: "Feed horn", at: [1.15, 0.86, 0] }),
    P("strut", S.tube([[1.15 + 0.78, 0.37, 0], [1.15 + 0.3, 0.68, 0], [1.15 + 0.05, 0.84, 0]], 0.012, 8, 5), "steel"),
  ],
  facts: ["Radio waves travel at the speed of light: about 300,000 kilometres every second."],
};

const PANEL_W = 1.25, PANEL_H = 1.7;
export const solar: Blueprint = {
  id: "part-solar", code: "S-07", name: "Solar Array", category: "system", subtitle: "Energy · v2.1 system “Deploy Solar Array”",
  description: "Two wings of solar cells turn sunlight into electricity for the computers, radios, heaters and science instruments.",
  overall: { w: 12.08, h: 1.78, d: 3.06 },
  parts: [
    P("collar", S.cyl(CORE_R + 0.03, 0.4, CORE_R + 0.03, 56), "gunmetal", { name: "Mounting collar" }),
    G("wingL", [
      P("boom", S.cyl(0.07, 0.5), "silver", { at: [CORE_R + 0.25, 0, 0], rot: [0, 0, 90] }),
      P("hinge", S.sph(0.13), "royal", { at: [CORE_R + 0.5, 0, 0] }),
      ...[0, 1, 2].flatMap((i) => [
        P(`frame${i}`, S.box(PANEL_W + 0.06, PANEL_H + 0.08, 0.05, 0.02), "silver", { at: [CORE_R + 0.6 + PANEL_W / 2 + i * (PANEL_W + 0.08), 0, 0] }),
        P(`cells${i}`, S.box(PANEL_W, PANEL_H, 0.07, 0.01), "solarCell", { name: i === 0 ? "Solar panel" : undefined, at: [CORE_R + 0.6 + PANEL_W / 2 + i * (PANEL_W + 0.08), 0, 0] }),
        P(`bar${i}`, S.box(0.03, PANEL_H, 0.08), "silver", { at: [CORE_R + 0.6 + PANEL_W / 2 + i * (PANEL_W + 0.08), 0, 0] }),
        P(`barH${i}`, S.box(PANEL_W, 0.03, 0.08), "silver", { at: [CORE_R + 0.6 + PANEL_W / 2 + i * (PANEL_W + 0.08), 0, 0] }),
      ]),
    ], { name: "Solar wing", mirrorX: true }),
  ],
  facts: ["Solar panels make less power far from the Sun. Missions to Jupiter need really big solar wings!"],
  sheet: { notes: ["Shown deployed. Wings fold flat against the hull for launch."] },
};

export const shield: Blueprint = {
  id: "part-shield", code: "S-08", name: "Heat Shield", category: "system", subtitle: "Protection · v2.1 system “Install Heat Shield”",
  description: "Coming home, a capsule hits the air so fast that the air glows hotter than lava. The heat shield slowly chars away and carries that heat off, keeping the crew cool.",
  overall: { w: 3.32, h: 0.5, d: 3.32 },
  parts: [
    P("dish", S.lathe(dish(1.62, 0.44, 16, true), 56), "ablative", { name: "Ablative heat shield" }),
    P("rim", S.tor(1.6, 0.06, 360, 64), "silver", { name: "Shield rim", rot: [90, 0, 0] }),
    P("tileA", S.tor(1.18, 0.018, 360, 56), "heatTile", { at: [0, -0.22, 0], rot: [90, 0, 0] }),
    P("tileB", S.tor(0.7, 0.016, 360, 48), "heatTile", { at: [0, -0.37, 0], rot: [90, 0, 0] }),
  ],
  facts: ["Heat shields can face temperatures of more than 2,000 °C during re-entry."],
};

export const habitat: Blueprint = {
  id: "part-habitat", code: "S-09", name: "Life-Support Cabin", category: "system", subtitle: "Crew · v2.1 system “Add Life-Support Cabin”",
  description: "Extra living space for long trips. It makes fresh oxygen, cleans the air, stores water and keeps the cabin at a comfy temperature.",
  overall: { w: 3.13, h: 2.6, d: 3.13 },
  parts: [
    P("hull", S.cyl(CORE_R, 2.6, CORE_R, 56), "pearl", { name: "Cabin hull", at: [0, 1.3, 0] }),
    P("bandTop", S.cyl(CORE_R + 0.012, 0.22, CORE_R + 0.012, 56), "royal", { at: [0, 2.42, 0] }),
    G("porthole", [
      P("rim", S.tor(0.3, 0.055), "silver", {}),
      P("pane", S.disc(0.28), "window", { at: [0, 0, 0.01] }),
    ], { name: "Porthole", at: [0, 1.4, CORE_R + 0.01], radial: { count: 4, offsetDeg: 0 } }),
    P("o2", S.sph(0.36), "white", { name: "Oxygen tank", at: [1.02, 0.62, 1.02] }),
    P("o2Band", S.tor(0.36, 0.03), "cyan", { at: [1.02, 0.62, 1.02], rot: [90, 0, 0] }),
    P("water", S.sph(0.36), "sky", { name: "Water tank", at: [-1.02, 0.62, -1.02] }),
    P("rail", S.tube([[1.05, 2.1, 1.05], [1.2, 1.4, 0.88], [1.05, 0.9, 1.05]], 0.03, 16, 6), "gold", { radial: { count: 2, offsetDeg: 90 } }),
  ],
  facts: ["On the International Space Station, machines turn water into oxygen and even recycle the crew's sweat back into clean drinking water."],
};

export const booster: Blueprint = {
  id: "part-booster", code: "S-10", name: "Booster Stage", category: "system", subtitle: "Staging · v2.1 system “Attach Booster Stage”",
  description: "Two strap-on boosters add a huge extra push at liftoff. When their fuel runs out they drop away, so the rocket doesn't have to carry their empty weight.",
  overall: { w: 5.96, h: 9.66, d: 1.46 },
  parts: [
    G("boosterL", [
      P("body", S.cyl(0.72, 7.2, 0.72, 40), "hull", { name: "Booster casing", at: [0, 3.0, 0] }),
      P("cap", S.lathe(ogive(0.72, 1.5, 14), 40), "magenta", { name: "Booster nose", at: [0, 6.6, 0] }),
      P("band", S.cyl(0.73, 0.3, 0.73, 40), "royal", { at: [0, 5.8, 0] }),
      P("stripe", S.tor(0.725, 0.025, 360, 48), "cyanGlow", { at: [0, 0.4, 0], rot: [90, 0, 0] }),
      P("nozzle", S.lathe(bell(0.28, 0.55, 0.95), 32), "engineBell", { name: "Booster nozzle", at: [0, -1.55, 0] }),
      P("strutA", S.box(0.4, 0.2, 0.3, 0.05), "gunmetal", { at: [-0.75, 5.0, 0] }),
      P("strutB", S.box(0.4, 0.2, 0.3, 0.05), "gunmetal", { at: [-0.75, 0.6, 0] }),
    ], { name: "Strap-on booster", at: [2.25, 0, 0], mirrorX: true }),
  ],
  facts: ["Many real rockets use boosters for liftoff. Space Shuttle boosters were even recovered from the ocean and reused."],
  sheet: { notes: ["Origin is the core vehicle base. Boosters burn first, then separate."] },
};

export const legs: Blueprint = {
  id: "part-legs", code: "S-11", name: "Landing Legs", category: "system", subtitle: "Landing · v2.1 system “Fit Landing Legs”",
  description: "Four springy legs unfold for touchdown. Wide feet spread the weight so the rocket stays upright, even on bumpy Moon rocks.",
  overall: { w: 4.77, h: 3.14, d: 4.77 },
  parts: [
    G("leg", [
      P("hinge", S.box(0.3, 0.32, 0.36, 0.06), "gunmetal", { at: [0, 0.9, 0] }),
      P("strut", S.tube([[0.05, 0.9, 0], [0.7, -0.5, 0], [1.25, -1.95, 0]], 0.09, 20, 10), "silver", { name: "Main strut" }),
      P("brace", S.tube([[0.05, -0.05, 0], [0.5, -0.6, 0], [0.92, -1.12, 0]], 0.06, 12, 8), "steel", { name: "Brace" }),
      P("pad", S.cyl(0.4, 0.12, 0.44, 32), "gunmetal", { name: "Footpad", at: [1.3, -2.02, 0] }),
      P("spring", S.cyl(0.13, 0.4, 0.13, 16), "gold", { at: [0.6, -0.25, 0], rot: [0, 0, -25] }),
    ], { name: "Landing leg", at: [CORE_R - 0.05, 0, 0], radial: { count: 4, offsetDeg: 45 } }),
  ],
  facts: ["The Apollo lunar modules had crushable honeycomb inside their legs to soak up the bump of landing."],
  sheet: { notes: ["Legs share the fin positions (45° spacing) and stow under them during launch."] },
};

export const lab: Blueprint = {
  id: "part-lab", code: "S-12", name: "Science Module", category: "system", subtitle: "Science · v2.1 system “Load Science Module”",
  description: "A flying laboratory. Cameras take pictures, a spectrometer reads what rocks and gases are made of, and the sample arm can collect bits of a new world.",
  overall: { w: 3.91, h: 1.8, d: 3.04 },
  parts: [
    P("shell", S.cyl(CORE_R, 1.8, CORE_R, 56), "pearl", { name: "Lab shell", at: [0, 0.9, 0] }),
    P("band", S.cyl(CORE_R + 0.012, 0.18, CORE_R + 0.012, 56), "violet", { at: [0, 1.62, 0] }),
    P("bay", S.box(1.05, 0.7, 0.1, 0.06), "screen", { name: "Instrument bay", at: [0, 0.9, CORE_R - 0.02] }),
    P("spectro", S.box(0.5, 0.42, 0.42, 0.06), "gunmetal", { name: "Spectrometer", at: [CORE_R + 0.12, 0.95, 0.45] }),
    G("camera", [
      P("body", S.box(0.34, 0.26, 0.3, 0.05), "white", {}),
      P("lens", S.cyl(0.09, 0.08), "black", { at: [0, 0, 0.18], rot: [90, 0, 0] }),
    ], { name: "Science camera", at: [CORE_R + 0.08, 1.38, -0.55] }),
    G("arm", [
      P("upper", S.cap(0.07, 0.6), "silver", { rot: [0, 0, 70] }),
      P("elbow", S.sph(0.1), "royal", { at: [-0.35, -0.13, 0] }),
      P("lower", S.cap(0.06, 0.5), "silver", { at: [-0.35, -0.42, 0], rot: [0, 0, 8] }),
      P("scoop", S.box(0.2, 0.14, 0.18, 0.04), "gold", { name: "Sample scoop", at: [-0.4, -0.78, 0] }),
    ], { name: "Sample arm", at: [-CORE_R - 0.04, 1.4, 0.3] }),
  ],
  facts: ["Spectrometers split light into colours. Each material leaves its own colour 'barcode'."],
};

const CAP_H = 2.8;
export const capsule: Blueprint = {
  id: "part-capsule", code: "S-13", name: "Crew Capsule", category: "system", subtitle: "Base airframe · where the crew rides",
  description: "The cadets ride here. The big panorama window lets them watch Earth shrink behind them, and the little thrusters around the top help steer in space.",
  overall: { w: 3.1, h: 2.81, d: 3.07 },
  parts: [
    P("hull", S.cyl(CORE_R, CAP_H, CORE_R, 56), "hull", { name: "Crew cabin", at: [0, CAP_H / 2, 0] }),
    P("band", S.cyl(CORE_R + 0.012, 0.26, CORE_R + 0.012, 56), "royal", { at: [0, 0.2, 0] }),
    P("bandLine", S.tor(CORE_R + 0.006, 0.026, 360, 72), "cyanGlow", { at: [0, 0.45, 0], rot: [90, 0, 0] }),
    P("frame", S.ext(roundedRect(1.12, 2.0, 0.3), 0.1, 0.02), "magenta", { name: "Window frame", at: [0, 1.5, CORE_R - 0.02] }),
    P("window", S.ext(roundedRect(0.9, 1.78, 0.22), 0.1, 0.015), "window", { name: "Panorama window", at: [0, 1.5, CORE_R + 0.01] }),
    P("screenA", S.box(0.5, 0.18, 0.02, 0.04), "cyanGlow", { at: [0, 2.05, CORE_R + 0.065] }),
    P("screenB", S.box(0.42, 0.14, 0.02, 0.04), "pinkGlow", { at: [0, 1.6, CORE_R + 0.065] }),
    P("screenC", S.box(0.5, 0.16, 0.02, 0.04), "goldGlow", { at: [0, 1.15, CORE_R + 0.065] }),
    P("hatch", S.box(0.86, 1.2, 0.08, 0.16), "pearl", { name: "Crew hatch", at: [-CORE_R, 1.4, 0], rot: [0, -90, 0] }),
    P("hatchHandle", S.box(0.3, 0.06, 0.06, 0.02), "gold", { at: [-CORE_R - 0.06, 1.4, 0.2], rot: [0, -90, 0] }),
    G("rcs", [
      P("block", S.box(0.22, 0.34, 0.24, 0.04), "gunmetal", {}),
      P("jetUp", S.cone(0.06, 0.12), "steel", { at: [0.13, 0.12, 0], rot: [0, 0, -90] }),
    ], { name: "RCS thrusters", at: [CORE_R + 0.05, 2.35, 0], radial: { count: 4, offsetDeg: 45 } }),
    P("topRing", S.tor(CORE_R - 0.04, 0.045, 360, 64), "silver", { at: [0, CAP_H - 0.03, 0], rot: [90, 0, 0] }),
  ],
  facts: ["A crew capsule is pressurised, so inside it the cadets can breathe normal air without a spacesuit."],
};

export const nose: Blueprint = {
  id: "part-nose", code: "S-14", name: "Nose Cone", category: "system", subtitle: "Base airframe · cuts through the air",
  description: "The pointy magenta nose helps the rocket slice through the air with less drag, like the pointy front of a race car.",
  overall: { w: 3, h: 4.69, d: 3 },
  parts: [
    P("cone", S.lathe(ogive(CORE_R, 4.6, 24, 0.05), 56), "magenta", { name: "Ogive nose cone" }),
    P("tip", S.sph(0.09), "white", { at: [0, 4.6, 0] }),
    P("baseRing", S.tor(CORE_R, 0.035, 360, 72), "cyanGlow", { at: [0, 0.03, 0], rot: [90, 0, 0] }),
    P("stripe", S.tor(1.3, 0.03, 360, 64), "white", { at: [0, 1.3, 0], rot: [90, 0, 0] }),
  ],
  facts: ["An ogive is a smooth, curved point. It is a favourite nose shape for rockets that fly fast through air."],
};

export const ROCKET_PART_BLUEPRINTS: readonly Blueprint[] = [thrustSection, engine, tank, fins, computer, parachute, antenna, solar, shield, habitat, booster, legs, lab, capsule, nose];

// ---------------------------------------------------------------- assembly

/** Counts of each Academy system on a rocket (v2.1 part ids). */
export interface RocketConfig {
  engine: number; // 1–3
  tank: number; // 0–3
  fins: number; // 0–1
  computer: number;
  parachute: number;
  antenna: number;
  solar: number;
  shield: number;
  habitat: number;
  booster: number;
  lander: number; // landing legs (v2.1 id "lander")
  lab: number;
}

export const EMPTY_CONFIG: RocketConfig = { engine: 1, tank: 0, fins: 0, computer: 0, parachute: 0, antenna: 0, solar: 0, shield: 0, habitat: 0, booster: 0, lander: 0, lab: 0 };
export const COMET_CONFIG: RocketConfig = { ...EMPTY_CONFIG, engine: 3, tank: 2, fins: 1, computer: 1 };

export const STACK_HEIGHTS = { thrust: 1.2, tank: TANK_H, computer: 0.7, lab: 1.8, habitat: 2.6, shield: 0.45, capsule: CAP_H, parachute: 0.6, nose: 4.6 } as const;

export interface Placement {
  /** Blueprint id of the part. */
  part: string;
  /** v2.1 system id (or "thrust" | "capsule" | "nose" for the base airframe). */
  system: string;
  at: [number, number, number];
  rot?: [number, number, number];
  /** Centre of this item's mass (m, rocket space) for centre-of-mass maths. */
  massY: number;
  /** Stacked items occupy [y0, y1]. */
  y0: number;
  y1: number;
}

const ENGINE_SPOTS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-0.72, 0], [0.72, 0]],
  3: [[0, 0.8], [-0.7, -0.42], [0.7, -0.42]],
};

/**
 * Lays out a rocket from a config: bottom-to-top stack plus radial parts.
 * Returns placements in rocket space where y = 0 is the lowest point (engine bells,
 * booster nozzles or landing feet) so the rocket stands on the pad.
 */
export function layoutRocket(config: RocketConfig) {
  const items: Placement[] = [];
  let y = 0; // base of the thrust section, shifted later
  const push = (part: string, system: string, h: number, offsetY = 0) => {
    items.push({ part, system, at: [0, y + offsetY, 0], massY: y + h / 2, y0: y, y1: y + h });
    y += h;
  };
  const engines = Math.max(1, Math.min(3, Math.round(config.engine)));
  for (const [x, z] of ENGINE_SPOTS[engines]) items.push({ part: "part-engine", system: "engine", at: [x, 0, z], massY: -0.8, y0: -1.9, y1: 0 });
  push("part-thrust", "thrust", STACK_HEIGHTS.thrust);
  const tankStart = y;
  for (let i = 0; i < Math.min(3, config.tank); i++) push("part-tank", "tank", STACK_HEIGHTS.tank);
  const tankEnd = y;
  if (config.computer) push("part-computer", "computer", STACK_HEIGHTS.computer);
  if (config.lab) push("part-lab", "lab", STACK_HEIGHTS.lab);
  if (config.habitat) push("part-habitat", "habitat", STACK_HEIGHTS.habitat);
  const moduleTop = y;
  if (config.shield) push("part-shield", "shield", STACK_HEIGHTS.shield, STACK_HEIGHTS.shield);
  const capsuleBase = y;
  push("part-capsule", "capsule", STACK_HEIGHTS.capsule);
  if (config.parachute) push("part-parachute", "parachute", STACK_HEIGHTS.parachute);
  push("part-nose", "nose", STACK_HEIGHTS.nose);
  const top = y;
  if (config.fins) items.push({ part: "part-fins", system: "fins", at: [0, 0, 0], massY: 1.0, y0: -1.04, y1: 3.3 });
  if (config.lander) items.push({ part: "part-legs", system: "lander", at: [0, 0, 0], massY: -0.4, y0: -2.08, y1: 1.0 });
  if (config.booster) items.push({ part: "part-booster", system: "booster", at: [0, 0, 0], massY: 3.2, y0: -1.55, y1: 8.1 });
  if (config.solar) {
    // Wings ride on the highest tank or module below the capsule.
    const mountY = moduleTop > tankEnd ? (moduleTop + tankEnd) / 2 : tankEnd > tankStart ? tankEnd - 1.0 : 0.7;
    items.push({ part: "part-solar", system: "solar", at: [0, mountY, 0], rot: [0, 0, 0], massY: mountY, y0: mountY - 0.85, y1: mountY + 0.85 });
  }
  if (config.antenna) items.push({ part: "part-antenna", system: "antenna", at: [CORE_R, capsuleBase + 1.9, 0], rot: [0, 0, 0], massY: capsuleBase + 1.9, y0: capsuleBase + 1.6, y1: capsuleBase + 2.9 });
  const lowest = Math.min(...items.map((item) => item.y0));
  for (const item of items) {
    item.at = [item.at[0], item.at[1] - lowest, item.at[2]];
    item.massY -= lowest;
    item.y0 -= lowest;
    item.y1 -= lowest;
  }
  return { items, height: top - lowest, baseY: -lowest, capsuleY: capsuleBase - lowest };
}

export function rocketParts(config: RocketConfig): Part[] {
  const { items } = layoutRocket(config);
  const counters: Record<string, number> = {};
  // Stacked items (bottom to top) spread apart evenly in the exploded view.
  const stacked = items.filter((item) => STACK_SYSTEMS.includes(item.system)).sort((a, b) => a.y0 - b.y0);
  return items.map((item) => {
    const n = (counters[item.system] = (counters[item.system] ?? 0) + 1);
    return R(`${item.system}${n}`, item.part, { at: item.at, rot: item.rot, explode: explodeFor(item, stacked.indexOf(item)), tag: `system:${item.system}` });
  });
}

const STACK_SYSTEMS = ["thrust", "tank", "computer", "lab", "habitat", "shield", "capsule", "parachute", "nose"];

/** Exploded-view offsets: the stack opens up 1 m per level, side parts move outward. */
function explodeFor(item: Placement, stackIndex: number): [number, number, number] {
  switch (item.system) {
    case "engine": return [0, -2.0, 0];
    case "fins": return [0, -0.7, 0];
    case "lander": return [0, -2.6, 0];
    case "booster": return [0, 0, 0];
    case "solar": return [0, 0, 1.6];
    case "antenna": return [2.2, 0, 0];
    default: return [0, Math.max(0, stackIndex) * 1.0, 0];
  }
}

export const cometRocket: Blueprint = {
  id: "rocket-comet", code: "V-01", name: "Comet Rocket", category: "vehicle", subtitle: "Academy launch vehicle · cover-art rocket",
  description: "The Academy's own rocket: three main engines, two fuel tanks, a guidance computer, the crew capsule with its panorama window, swept magenta fins and a magenta nose cone. In the hangar you can rebuild it with any of the 12 systems.",
  overall: { w: 4.76, h: 17.69, d: 4.76 },
  parts: rocketParts(COMET_CONFIG),
  facts: ["Comet stands about as tall as a five-storey building.", "Three engines share the push; if one is weak, the computer can tilt the others to stay on course."],
  sheet: { exploded: true, notes: ["Default stack: 3 × Main Engine, Thrust Structure, 2 × Fuel Tank, Guidance Computer, Crew Capsule, Nose Cone, Stability Fins."] },
};
