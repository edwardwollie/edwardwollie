// Neon Dominion 3D blueprint recipes (series ND-3).
//
// Units: metres. +Y is up and every unit faces +Z (its "front"). Its left side is +X.
// Each part is a machined primitive (see kit.js). `mirror: true` adds the X-mirrored twin,
// and `pivot` names the joint the part is bolted to, so the rig in rigs.js can animate it.
// `simRadius` is the collision radius used by the simulation (in game units, 25 = 1 m).
// The blueprint contract test checks that every model's footprint matches it.

import * as THREE from "../vendor/three.js";

const RAD = 180 / Math.PI;
const UP = new THREE.Vector3(0, 1, 0);

/** A cylinder or box strut between two points (used for limbs, braces and antennas). */
function strut(a, b, radius, m, extra = {}) {
  const start = new THREE.Vector3(...a);
  const end = new THREE.Vector3(...b);
  const direction = end.clone().sub(start);
  const length = direction.length();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize());
  const euler = new THREE.Euler().setFromQuaternion(quaternion, "XYZ");
  const middle = start.add(end).multiplyScalar(0.5);
  const base = extra.box
    ? { g: "box", s: [radius * 2, length, (extra.depth ?? radius) * 2], r: radius * 0.4 }
    : { g: "cyl", s: [extra.tip ?? radius, radius, length], n: extra.n ?? 10 };
  const { box, depth, tip, n, ...rest } = extra;
  return { ...base, p: [middle.x, middle.y, middle.z], rot: [euler.x * RAD, euler.y * RAD, euler.z * RAD], m, ...rest };
}

const FRIEND = { hull: "#e9f2fb", plate: "#1e2c58", alloy: "#69738a", dark: "#1a1e29", glass: "#06142b", hot: "#b8fbff" };
const LEGION = { hull: "#2b1624", plate: "#4f1c36", alloy: "#3c3f4d", dark: "#120e17", glass: "#1a0410", hot: "#ffc4dc" };

// ---------------------------------------------------------------------------
// Command units
// ---------------------------------------------------------------------------

const commander = {
  id: "commander",
  name: "VANGUARD Mk-III Command Exo-Frame",
  designation: "ND-C01",
  faction: "Dominion",
  role: "Squad commander. Auto-targeting pulse cannon, arm shield emitter, back-mounted hover jets.",
  simRadius: 23,
  hover: 0.22,
  palette: { ...FRIEND, glow: "#45f6ff", glow2: "#ff52ce" },
  pivots: {
    pelvis: { at: [0, 1.04, 0] },
    torso: { at: [0, 1.22, 0], parent: "pelvis" },
    head: { at: [0, 1.9, 0.02], parent: "torso" },
    armL: { at: [0.42, 1.68, 0], parent: "torso", mirror: true },
    foreL: { at: [0.5, 1.32, 0.02], parent: "armL", mirror: true },
    legL: { at: [0.17, 1.0, 0], parent: "pelvis", mirror: true },
    shinL: { at: [0.2, 0.58, 0.03], parent: "legL", mirror: true },
    jets: { at: [0, 1.22, -0.36], parent: "torso" }
  },
  parts: [
    // pelvis and hips
    { g: "box", s: [0.44, 0.2, 0.3], p: [0, 1.04, 0], m: "dark", pivot: "pelvis" },
    { g: "box", s: [0.34, 0.12, 0.34], p: [0, 1.12, 0.01], m: "alloy", pivot: "pelvis" },
    { g: "plate", pts: [[-0.09, 0.1], [0.09, 0.1], [0.11, -0.12], [0, -0.2], [-0.11, -0.12]], d: 0.05, p: [0, 1.0, 0.17], m: "plate", pivot: "pelvis" },
    { g: "plate", pts: [[-0.08, 0.1], [0.08, 0.1], [0.07, -0.16], [-0.06, -0.12]], d: 0.04, p: [0.25, 0.98, 0.02], rot: [0, 90, 8], m: "hull", pivot: "pelvis", mirror: true },
    // abdomen and chest
    { g: "box", s: [0.36, 0.22, 0.26], p: [0, 1.25, 0], m: "dark", pivot: "torso" },
    { g: "box", s: [0.4, 0.05, 0.28], p: [0, 1.31, 0.005], m: "alloy", pivot: "torso" },
    { g: "box", s: [0.6, 0.42, 0.4], p: [0, 1.56, 0], r: 0.09, m: "hull", pivot: "torso" },
    { g: "plate", pts: [[-0.3, 0.17], [0.3, 0.17], [0.27, -0.04], [0.1, -0.2], [-0.1, -0.2], [-0.27, -0.04]], d: 0.05, p: [0, 1.55, 0.2], m: "plate", pivot: "torso" },
    { g: "cyl", s: [0.08, 0.08, 0.05], p: [0, 1.56, 0.235], rot: [90, 0, 0], n: 6, m: "alloy", pivot: "torso" },
    { g: "cyl", s: [0.055, 0.055, 0.04], p: [0, 1.56, 0.26], rot: [90, 0, 0], n: 6, m: "glow", pivot: "torso" },
    { g: "box", s: [0.14, 0.018, 0.02], p: [0.17, 1.48, 0.235], rot: [0, 0, 18], r: 0.004, m: "glow", pivot: "torso", mirror: true },
    { g: "torus", s: [0.15, 0.035], p: [0, 1.79, -0.01], rot: [90, 0, 0], n: 24, m: "alloy", pivot: "torso" },
    // backpack reactor and jets
    { g: "box", s: [0.48, 0.52, 0.22], p: [0, 1.52, -0.29], r: 0.06, m: "alloy", pivot: "torso" },
    { g: "box", s: [0.3, 0.3, 0.05], p: [0, 1.56, -0.41], r: 0.02, m: "plate", pivot: "torso" },
    { g: "cyl", s: [0.06, 0.06, 0.3], p: [0, 1.58, -0.43], n: 12, m: "glow2", pivot: "torso" },
    { g: "box", s: [0.08, 0.3, 0.1], p: [0.25, 1.62, -0.33], r: 0.02, m: "dark", pivot: "torso", mirror: true },
    { g: "cyl", s: [0.012, 0.012, 0.42], p: [0.2, 1.98, -0.36], rot: [-8, 0, -6], n: 6, m: "alloy", pivot: "torso" },
    { g: "sphere", s: [0.022], p: [0.225, 2.19, -0.39], n: 8, m: "glow2", pivot: "torso" },
    { g: "cyl", s: [0.075, 0.1, 0.18], p: [0.16, 1.21, -0.36], n: 16, m: "alloy", pivot: "jets", mirror: true },
    { g: "cyl", s: [0.06, 0.06, 0.02], p: [0.16, 1.115, -0.36], n: 16, m: "hot", pivot: "jets", mirror: true },
    // head
    { g: "sphere", s: [0.135], p: [0, 2.0, 0.02], sc: [1, 1.08, 1.12], m: "hull", pivot: "head" },
    { g: "box", s: [0.2, 0.09, 0.12], p: [0, 1.95, 0.09], r: 0.035, m: "dark", pivot: "head" },
    { g: "slab", s: [0.22, 0.05, 0.03], p: [0, 2.01, 0.15], r: 0.02, m: "glow", pivot: "head" },
    { g: "plate", pts: [[0, 0.07], [0.22, 0.02], [0.22, -0.02], [0, -0.03]], d: 0.025, p: [0, 2.12, -0.02], rot: [0, -90, 0], m: "plate", pivot: "head" },
    { g: "box", s: [0.04, 0.1, 0.08], p: [0.13, 1.98, 0], r: 0.015, m: "alloy", pivot: "head", mirror: true },
    { g: "box", s: [0.11, 0.06, 0.1], p: [0, 1.88, 0.02], r: 0.02, m: "dark", pivot: "head" },
    // arms
    { g: "sphere", s: [0.17], arc: 0.5, p: [0.47, 1.7, 0], sc: [1.05, 0.85, 1.15], rot: [0, 0, -22], m: "hull", pivot: "armL", mirror: true },
    { g: "plate", pts: [[-0.12, 0.05], [0.12, 0.05], [0.1, -0.05], [-0.1, -0.05]], d: 0.03, p: [0.58, 1.66, 0], rot: [0, 90, -60], m: "plate", pivot: "armL", mirror: true },
    { g: "sphere", s: [0.09], p: [0.44, 1.66, 0], n: 14, m: "dark", pivot: "armL", mirror: true },
    { g: "capsule", s: [0.075, 0.22], p: [0.48, 1.48, 0], m: "alloy", pivot: "armL", mirror: true },
    { g: "box", s: [0.15, 0.2, 0.17], p: [0.49, 1.5, 0.01], r: 0.05, m: "hull", pivot: "armL", mirror: true },
    { g: "sphere", s: [0.075], p: [0.5, 1.32, 0.02], n: 14, m: "dark", pivot: "foreL", mirror: true },
    { g: "box", s: [0.17, 0.32, 0.19], p: [0.5, 1.15, 0.05], r: 0.05, m: "hull", pivot: "foreL", mirror: true },
    { g: "box", s: [0.13, 0.12, 0.13], p: [0.5, 0.95, 0.08], r: 0.03, m: "dark", pivot: "foreL", mirror: true },
    { g: "box", s: [0.02, 0.18, 0.012], p: [0.585, 1.15, 0.06], r: 0.004, m: "glow", pivot: "foreL", mirror: true },
    // right forearm pulse cannon (faces forward)
    { g: "box", s: [0.2, 0.17, 0.4], p: [-0.52, 1.1, 0.16], r: 0.05, m: "plate", pivot: "foreR" },
    { g: "cyl", s: [0.045, 0.055, 0.5], p: [-0.52, 1.08, 0.48], rot: [90, 0, 0], n: 14, m: "alloy", pivot: "foreR" },
    { g: "torus", s: [0.06, 0.012], p: [-0.52, 1.08, 0.36], n: 20, m: "glow", pivot: "foreR" },
    { g: "torus", s: [0.06, 0.012], p: [-0.52, 1.08, 0.46], n: 20, m: "glow", pivot: "foreR" },
    { g: "torus", s: [0.05, 0.014], p: [-0.52, 1.08, 0.73], n: 20, m: "hot", pivot: "foreR" },
    { g: "box", s: [0.05, 0.05, 0.22], p: [-0.52, 1.2, 0.3], r: 0.01, m: "dark", pivot: "foreR" },
    // left forearm hex shield emitter
    { g: "cyl", s: [0.2, 0.2, 0.04], p: [0.62, 1.13, 0.05], rot: [0, 0, 90], n: 6, m: "plate", pivot: "foreL" },
    { g: "cyl", s: [0.13, 0.13, 0.05], p: [0.63, 1.13, 0.05], rot: [0, 0, 90], n: 6, m: "glow", pivot: "foreL" },
    // legs
    { g: "box", s: [0.19, 0.42, 0.24], p: [0.19, 0.79, 0.01], r: 0.06, m: "hull", pivot: "legL", mirror: true },
    { g: "plate", pts: [[-0.08, 0.15], [0.08, 0.15], [0.07, -0.15], [-0.07, -0.12]], d: 0.035, p: [0.19, 0.82, 0.14], m: "plate", pivot: "legL", mirror: true },
    { g: "sphere", s: [0.085], p: [0.2, 0.58, 0.03], n: 14, m: "dark", pivot: "shinL", mirror: true },
    { g: "plate", pts: [[-0.07, 0.07], [0.07, 0.07], [0.05, -0.08], [0, -0.11], [-0.05, -0.08]], d: 0.04, p: [0.2, 0.6, 0.12], m: "hull", pivot: "shinL", mirror: true },
    { g: "box", s: [0.16, 0.42, 0.19], p: [0.21, 0.34, 0.02], r: 0.05, m: "hull", pivot: "shinL", mirror: true },
    { g: "box", s: [0.1, 0.3, 0.05], p: [0.21, 0.36, -0.09], r: 0.02, m: "dark", pivot: "shinL", mirror: true },
    { g: "box", s: [0.012, 0.22, 0.012], p: [0.21, 0.36, 0.115], r: 0.004, m: "glow", pivot: "shinL", mirror: true },
    { g: "box", s: [0.19, 0.11, 0.36], p: [0.21, 0.08, 0.06], r: 0.04, m: "alloy", pivot: "shinL", mirror: true },
    { g: "cyl", s: [0.08, 0.1, 0.03], p: [0.21, 0.02, 0.05], n: 16, m: "glow", pivot: "shinL", mirror: true }
  ]
};

function droneShell(id, name, designation, glow, extraParts, options = {}) {
  return {
    id,
    name,
    designation,
    faction: "Dominion",
    role: options.role,
    simRadius: options.simRadius ?? 15,
    hover: options.hover ?? 1.25,
    palette: { ...FRIEND, glow, glow2: options.glow2 ?? "#ffffff" },
    pivots: options.pivots ?? {
      rotorFL: { at: [0.34, 0.04, 0.26], mirror: true },
      rotorBL: { at: [0.34, 0.04, -0.26], mirror: true }
    },
    parts: extraParts
  };
}

const quadRotors = (spread = [0.34, 0.26]) => [
  ...[[spread[0], spread[1], "rotorFL"], [spread[0], -spread[1], "rotorBL"]].flatMap(([x, z, pivot]) => [
    strut([0.12, 0.0, Math.sign(z) * 0.08], [x, 0.03, z], 0.022, "alloy", { box: true, depth: 0.012, mirror: true }),
    { g: "torus", s: [0.13, 0.022], p: [x, 0.04, z], rot: [90, 0, 0], n: 28, m: "hull", mirror: true },
    { g: "torus", s: [0.135, 0.006], p: [x, 0.065, z], rot: [90, 0, 0], n: 28, m: "glow", mirror: true },
    { g: "cyl", s: [0.03, 0.035, 0.05], p: [x, 0.04, z], n: 10, m: "dark", pivot, mirror: true },
    { g: "box", s: [0.24, 0.008, 0.035], p: [x, 0.05, z], r: 0.003, m: "dark", pivot, mirror: true },
    { g: "box", s: [0.035, 0.008, 0.24], p: [x, 0.05, z], r: 0.003, m: "dark", pivot, mirror: true }
  ])
];

const striker = droneShell("striker", "STRIKER Assault Drone", "ND-D11", "#45f6ff", [
  { g: "lathe", pts: [[0, 0.11], [0.12, 0.105], [0.2, 0.06], [0.23, 0], [0.19, -0.06], [0.09, -0.1], [0, -0.1]], n: 6, m: "hull" },
  { g: "cyl", s: [0.235, 0.235, 0.025], n: 6, m: "plate" },
  { g: "sphere", s: [0.085], arc: 0.5, p: [0, 0.1, 0.02], m: "glass" },
  { g: "slab", s: [0.14, 0.035, 0.03], p: [0, 0.02, 0.2], rot: [0, 0, 0], r: 0.015, m: "glow" },
  { g: "cyl", s: [0.025, 0.03, 0.26], p: [0.07, -0.07, 0.2], rot: [90, 0, 0], n: 10, m: "alloy", mirror: true },
  { g: "cyl", s: [0.03, 0.03, 0.015], p: [0.07, -0.07, 0.335], rot: [90, 0, 0], n: 10, m: "glow", mirror: true },
  { g: "box", s: [0.06, 0.05, 0.12], p: [0, -0.1, -0.05], r: 0.015, m: "dark" },
  ...quadRotors()
], { role: "Front-line burst fire. Twin pulse guns, quad ducted lift.", simRadius: 15 });

const rail = droneShell("rail", "RAIL Lancer Drone", "ND-D12", "#ff63d9", [
  { g: "capsule", s: [0.1, 0.42], p: [0, 0, -0.02], rot: [90, 0, 0], sc: [1.1, 0.75, 1], m: "hull" },
  { g: "box", s: [0.03, 0.04, 0.86], p: [0.055, 0.1, 0.12], r: 0.008, m: "alloy", mirror: true },
  { g: "box", s: [0.05, 0.012, 0.66], p: [0, 0.1, 0.16], r: 0.004, m: "glow" },
  { g: "box", s: [0.15, 0.03, 0.04], p: [0, 0.1, 0.5], r: 0.01, m: "dark" },
  { g: "torus", s: [0.05, 0.01], p: [0, 0.1, 0.56], n: 18, m: "glow" },
  { g: "plate", pts: [[0, 0.12], [0.36, -0.14], [0.38, -0.2], [0.05, -0.12], [0, -0.16]], d: 0.025, p: [0.03, -0.01, -0.08], rot: [90, 0, 0], m: "plate", mirror: true },
  { g: "box", s: [0.012, 0.012, 0.3], p: [0.22, -0.01, -0.1], rot: [0, -40, 0], r: 0.004, m: "glow", mirror: true },
  { g: "cyl", s: [0.05, 0.065, 0.14], p: [0.08, 0, -0.3], rot: [90, 0, 0], n: 14, m: "alloy", mirror: true },
  { g: "cyl", s: [0.042, 0.042, 0.01], p: [0.08, 0, -0.375], rot: [90, 0, 0], n: 14, m: "hot", mirror: true },
  { g: "plate", pts: [[0, 0], [0.1, 0], [0.04, 0.16], [0, 0.14]], d: 0.02, p: [0, 0.06, -0.22], rot: [0, -90, 0], m: "plate" },
  { g: "sphere", s: [0.06], arc: 0.5, p: [0, 0.06, 0.12], sc: [1, 0.8, 1.6], m: "glass" },
  ...quadRotors([0.3, 0.18]).map((part) => ({ ...part, sc: [0.8, 0.8, 0.8] }))
], {
  role: "Long-range rail lance. Highest per-shot damage and range.",
  simRadius: 15,
  pivots: { rotorFL: { at: [0.24, 0.032, 0.144], mirror: true }, rotorBL: { at: [0.24, 0.032, -0.144], mirror: true } }
});
// Rail rotors are scaled 0.8 about the origin; keep pivot origins on the scaled hubs.
rail.parts = rail.parts.map((part) => (part.sc && part.sc[0] === 0.8 && part.p ? { ...part, p: part.p.map((v) => v * 0.8) } : part));

const bulwark = droneShell("bulwark", "BULWARK Aegis Drone", "ND-D13", "#768cff", [
  { g: "cyl", s: [0.25, 0.29, 0.22], n: 6, m: "hull" },
  { g: "cyl", s: [0.21, 0.25, 0.06], p: [0, 0.14, 0], n: 6, m: "plate" },
  { g: "cyl", s: [0.09, 0.09, 0.05], p: [0, 0.18, 0], n: 6, m: "glow" },
  { g: "cyl", s: [0.2, 0.15, 0.08], p: [0, -0.15, 0], n: 6, m: "dark" },
  { g: "cyl", s: [0.5, 0.5, 0.34], p: [0, 0.02, -0.08], start: -55, arc: 110, open: true, n: 18, m: "plate" },
  { g: "cyl", s: [0.51, 0.51, 0.26], p: [0, 0.02, -0.08], start: -48, arc: 96, open: true, n: 18, m: "glow2" },
  { g: "torus", s: [0.5, 0.018], p: [0, 0.19, -0.08], rot: [90, 0, 35], arc: 110, n: 18, m: "alloy" },
  { g: "box", s: [0.06, 0.06, 0.3], p: [0.18, 0.02, 0.17], rot: [0, -30, 0], r: 0.015, m: "alloy", mirror: true },
  { g: "cyl", s: [0.03, 0.03, 0.18], p: [0, -0.02, 0.3], rot: [90, 0, 0], n: 10, m: "alloy" },
  { g: "cyl", s: [0.034, 0.034, 0.012], p: [0, -0.02, 0.39], rot: [90, 0, 0], n: 10, m: "glow" },
  { g: "cyl", s: [0.07, 0.09, 0.08], p: [0.2, -0.18, -0.12], n: 12, m: "alloy", mirror: true },
  { g: "cyl", s: [0.07, 0.09, 0.08], p: [0, -0.18, 0.2], n: 12, m: "alloy" },
  { g: "cyl", s: [0.06, 0.06, 0.012], p: [0.2, -0.225, -0.12], n: 12, m: "hot", mirror: true },
  { g: "cyl", s: [0.06, 0.06, 0.012], p: [0, -0.225, 0.2], n: 12, m: "hot" }
], {
  role: "Damage soak. Forward arc shield projector and heavy plating.",
  simRadius: 17,
  hover: 1.1,
  glow2: "#9fb2ff",
  pivots: {}
});

const medic = droneShell("medic", "MEDIC Nanite Drone", "ND-D14", "#56ffb5", [
  { g: "sphere", s: [0.2], sc: [1.1, 0.68, 1.2], m: "hull" },
  { g: "sphere", s: [0.205], arc: 0.5, sc: [1.1, 0.2, 1.2], p: [0, -0.01, 0], rot: [180, 0, 0], m: "plate" },
  { g: "box", s: [0.06, 0.03, 0.2], p: [0, 0.14, 0], r: 0.012, m: "glow" },
  { g: "box", s: [0.2, 0.03, 0.06], p: [0, 0.14, 0], r: 0.012, m: "glow" },
  { g: "sphere", s: [0.06], arc: 0.5, p: [0, 0.03, 0.2], rot: [90, 0, 0], m: "glass" },
  { g: "torus", s: [0.36, 0.014], p: [0, 0.02, 0], rot: [90, 0, 0], n: 40, m: "glow", pivot: "halo" },
  { g: "box", s: [0.05, 0.03, 0.03], p: [0.36, 0.02, 0], r: 0.008, m: "alloy", pivot: "halo", radial: { count: 3 } },
  { g: "cyl", s: [0.012, 0.03, 0.12], p: [0, -0.18, 0.06], n: 8, m: "alloy" },
  { g: "sphere", s: [0.025], p: [0, -0.25, 0.06], n: 10, m: "glow" },
  ...[0, 120, 240].flatMap((angle) => {
    const x = Math.sin((angle * Math.PI) / 180) * 0.24;
    const z = Math.cos((angle * Math.PI) / 180) * 0.24;
    return [
      { g: "cyl", s: [0.07, 0.06, 0.06], p: [x, -0.07, z], n: 14, m: "alloy" },
      { g: "cyl", s: [0.05, 0.05, 0.01], p: [x, -0.1, z], n: 14, m: "hot" }
    ];
  })
], { role: "Field repair. Nanite halo restores the most damaged squad unit.", simRadius: 15, pivots: { halo: { at: [0, 0.02, 0] } } });

// ---------------------------------------------------------------------------
// Rift Legion
// ---------------------------------------------------------------------------

function legion(id, name, designation, glow, simRadius, role, pivots, parts, extra = {}) {
  return { id, name, designation, faction: "Rift Legion", role, simRadius, hover: extra.hover ?? 0, palette: { ...LEGION, glow, glow2: extra.glow2 ?? "#ffd2e6", ...(extra.palette || {}) }, pivots, parts };
}

function insectLeg(hip, knee, foot, pivot, radius = 0.035) {
  return [
    strut(hip, knee, radius, "plate", { pivot, mirror: true, n: 8 }),
    strut(knee, foot, radius * 0.95, "alloy", { pivot, mirror: true, tip: radius * 0.25, n: 8 }),
    { g: "sphere", s: [radius * 1.5], p: knee, n: 10, m: "dark", pivot, mirror: true }
  ];
}

const grunt = legion("grunt", "SCUTTLER Legion Drone", "RL-01", "#ff4d8d", 18,
  "Swarm melee unit. Four-legged crawler that rushes the closest target.",
  {
    legFL: { at: [0.18, 0.5, 0.18], mirror: true },
    legBL: { at: [0.18, 0.5, -0.2], mirror: true },
    body: { at: [0, 0.52, 0] }
  },
  [
    { g: "sphere", s: [0.3], p: [0, 0.54, -0.02], sc: [1, 0.66, 1.3], m: "hull", pivot: "body" },
    { g: "sphere", s: [0.31], arc: 0.5, p: [0, 0.56, -0.05], sc: [1.02, 0.55, 1.2], m: "plate", pivot: "body" },
    { g: "plate", pts: [[-0.2, 0], [0.2, 0], [0.12, 0.08], [-0.12, 0.08]], d: 0.03, p: [0, 0.72, -0.18], rot: [-70, 0, 0], m: "plate", pivot: "body" },
    { g: "box", s: [0.28, 0.16, 0.16], p: [0, 0.52, 0.34], r: 0.05, m: "dark", pivot: "body" },
    { g: "slab", s: [0.24, 0.045, 0.03], p: [0, 0.55, 0.42], r: 0.02, m: "glow", pivot: "body" },
    strut([0.08, 0.46, 0.38], [0.13, 0.36, 0.56], 0.025, "alloy", { pivot: "body", mirror: true, tip: 0.004, n: 8 }),
    { g: "sphere", s: [0.06], p: [0, 0.58, -0.3], n: 10, m: "glow", pivot: "body" },
    ...insectLeg([0.18, 0.5, 0.18], [0.5, 0.72, 0.36], [0.62, 0, 0.44], "legFL"),
    ...insectLeg([0.18, 0.5, -0.2], [0.5, 0.72, -0.4], [0.6, 0, -0.52], "legBL")
  ]);

const shooter = legion("shooter", "GUNNER Legion Walker", "RL-02", "#ff9f51", 20,
  "Ranged fire support. Digitigrade walker with a shoulder plasma cannon.",
  {
    legL: { at: [0.16, 0.86, 0], mirror: true },
    torso: { at: [0, 0.95, 0] }
  },
  [
    { g: "box", s: [0.36, 0.2, 0.3], p: [0, 0.94, 0], r: 0.06, m: "dark", pivot: "torso" },
    { g: "box", s: [0.5, 0.42, 0.4], p: [0, 1.24, -0.02], r: 0.1, m: "hull", pivot: "torso" },
    { g: "plate", pts: [[-0.22, 0.14], [0.22, 0.14], [0.16, -0.16], [-0.16, -0.16]], d: 0.04, p: [0, 1.24, 0.19], rot: [-8, 0, 0], m: "plate", pivot: "torso" },
    { g: "box", s: [0.16, 0.13, 0.2], p: [0, 1.5, 0.08], r: 0.05, m: "dark", pivot: "torso" },
    { g: "slab", s: [0.12, 0.035, 0.03], p: [0, 1.51, 0.18], r: 0.015, m: "glow", pivot: "torso" },
    { g: "box", s: [0.2, 0.2, 0.62], p: [0.36, 1.48, 0.12], r: 0.05, m: "plate", pivot: "torso" },
    { g: "cyl", s: [0.05, 0.06, 0.44], p: [0.36, 1.48, 0.58], rot: [90, 0, 0], n: 12, m: "alloy", pivot: "torso" },
    { g: "torus", s: [0.065, 0.014], p: [0.36, 1.48, 0.8], n: 18, m: "glow", pivot: "torso" },
    { g: "box", s: [0.012, 0.06, 0.4], p: [0.47, 1.48, 0.1], r: 0.004, m: "glow", pivot: "torso" },
    { g: "box", s: [0.12, 0.34, 0.14], p: [-0.33, 1.1, 0.05], rot: [20, 0, 10], r: 0.04, m: "alloy", pivot: "torso" },
    { g: "box", s: [0.1, 0.08, 0.2], p: [-0.36, 0.93, 0.13], r: 0.03, m: "dark", pivot: "torso" },
    strut([0.16, 0.86, 0], [0.24, 0.5, 0.18], 0.06, "plate", { pivot: "legL", mirror: true, box: true, depth: 0.07 }),
    strut([0.24, 0.5, 0.18], [0.22, 0.12, -0.04], 0.045, "alloy", { pivot: "legL", mirror: true, box: true, depth: 0.05 }),
    { g: "box", s: [0.14, 0.06, 0.3], p: [0.22, 0.05, 0.04], r: 0.025, m: "dark", pivot: "legL", mirror: true },
    { g: "sphere", s: [0.07], p: [0.24, 0.5, 0.18], n: 10, m: "glow", pivot: "legL", mirror: true }
  ]);

const charger = legion("charger", "RAM Legion Charger", "RL-03", "#ff6a54", 21,
  "Shock unit. Low quadruped that boosts into a ramming charge.",
  {
    legFL: { at: [0.2, 0.46, 0.3], mirror: true },
    legBL: { at: [0.2, 0.5, -0.36], mirror: true },
    body: { at: [0, 0.5, 0] }
  },
  [
    { g: "capsule", s: [0.24, 0.62], p: [0, 0.56, -0.02], rot: [90, 0, 0], sc: [1, 0.8, 1], m: "hull", pivot: "body" },
    { g: "box", s: [0.42, 0.32, 0.34], p: [0, 0.58, 0.42], r: 0.08, m: "plate", pivot: "body" },
    { g: "plate", pts: [[-0.24, 0.16], [0.24, 0.16], [0.18, -0.16], [0, -0.22], [-0.18, -0.16]], d: 0.06, p: [0, 0.6, 0.6], rot: [-12, 0, 0], m: "dark", pivot: "body" },
    { g: "slab", s: [0.3, 0.04, 0.03], p: [0, 0.66, 0.64], r: 0.015, m: "glow", pivot: "body" },
    { g: "cyl", s: [0.0, 0.07, 0.42], p: [0.22, 0.72, 0.66], rot: [70, 0, -25], n: 10, m: "alloy", pivot: "body", mirror: true },
    { g: "cyl", s: [0.0, 0.03, 0.12], p: [0.31, 0.79, 0.84], rot: [70, 0, -25], n: 10, m: "glow", pivot: "body", mirror: true },
    ...[0, 1, 2, 3].map((index) => ({ g: "plate", pts: [[-0.02, 0], [0.16, 0], [0.04, 0.2 - index * 0.02]], d: 0.025, p: [0, 0.78, 0.2 - index * 0.2], rot: [0, -90, 0], m: "plate", pivot: "body" })),
    { g: "cyl", s: [0.07, 0.09, 0.12], p: [0.1, 0.6, -0.48], rot: [90, 0, 0], n: 12, m: "alloy", pivot: "body", mirror: true },
    { g: "cyl", s: [0.06, 0.06, 0.012], p: [0.1, 0.6, -0.545], rot: [90, 0, 0], n: 12, m: "hot", pivot: "body", mirror: true },
    ...insectLeg([0.2, 0.46, 0.3], [0.38, 0.4, 0.42], [0.34, 0, 0.5], "legFL", 0.05),
    ...insectLeg([0.2, 0.5, -0.36], [0.4, 0.5, -0.5], [0.36, 0, -0.42], "legBL", 0.055)
  ]);

const shield = legion("shield", "BASTION Legion Shieldbearer", "RL-04", "#879cff", 24,
  "Escort tank. Tower shield and regenerating barrier absorb damage first.",
  {
    legL: { at: [0.2, 0.8, 0], mirror: true },
    torso: { at: [0, 0.9, 0] },
    shield: { at: [-0.2, 1.1, 0.46], parent: "torso" }
  },
  [
    { g: "box", s: [0.46, 0.24, 0.34], p: [0, 0.86, 0], r: 0.07, m: "dark", pivot: "torso" },
    { g: "box", s: [0.66, 0.56, 0.46], p: [0, 1.24, -0.04], r: 0.12, m: "hull", pivot: "torso" },
    { g: "box", s: [0.22, 0.16, 0.22], p: [0, 1.6, 0.04], r: 0.06, m: "dark", pivot: "torso" },
    { g: "slab", s: [0.16, 0.04, 0.03], p: [0, 1.61, 0.15], r: 0.015, m: "glow", pivot: "torso" },
    { g: "sphere", s: [0.18], arc: 0.5, p: [0.36, 1.42, -0.02], sc: [1, 0.8, 1.1], rot: [0, 0, -20], m: "plate", pivot: "torso", mirror: true },
    { g: "box", s: [0.16, 0.44, 0.18], p: [0.42, 1.12, 0.06], rot: [-25, 0, 0], r: 0.05, m: "alloy", pivot: "torso", mirror: true },
    { g: "cyl", s: [0.12, 0.12, 0.3], p: [0, 1.3, -0.33], rot: [90, 0, 0], n: 8, m: "alloy", pivot: "torso" },
    { g: "cyl", s: [0.08, 0.08, 0.02], p: [0, 1.3, -0.49], rot: [90, 0, 0], n: 8, m: "glow", pivot: "torso" },
    // tower shield
    { g: "plate", pts: [[-0.42, 0.62], [0.42, 0.62], [0.5, 0.2], [0.42, -0.6], [0, -0.74], [-0.42, -0.6], [-0.5, 0.2]], d: 0.09, p: [-0.2, 1.08, 0.5], m: "plate", pivot: "shield" },
    { g: "plate", pts: [[-0.3, 0.48], [0.3, 0.48], [0.36, 0.16], [0.3, -0.46], [0, -0.57], [-0.3, -0.46], [-0.36, 0.16]], d: 0.03, p: [-0.2, 1.08, 0.56], m: "hull", pivot: "shield" },
    { g: "box", s: [0.05, 0.9, 0.02], p: [-0.2, 1.08, 0.58], r: 0.008, m: "glow", pivot: "shield" },
    { g: "box", s: [0.6, 0.05, 0.02], p: [-0.2, 1.3, 0.58], r: 0.008, m: "glow", pivot: "shield" },
    // legs
    strut([0.2, 0.8, 0], [0.26, 0.44, 0.08], 0.09, "plate", { pivot: "legL", mirror: true, box: true, depth: 0.1 }),
    strut([0.26, 0.44, 0.08], [0.26, 0.1, 0], 0.075, "alloy", { pivot: "legL", mirror: true, box: true, depth: 0.08 }),
    { g: "box", s: [0.22, 0.1, 0.36], p: [0.26, 0.05, 0.04], r: 0.03, m: "dark", pivot: "legL", mirror: true }
  ]);

const jammer = legion("jammer", "SIREN Legion Jammer", "RL-05", "#ba62ff", 23,
  "Electronic warfare spire. Disrupts squad fire rate inside 14.6 m.",
  { rings: { at: [0, 1.25, 0] }, dish: { at: [0, 2.05, 0] } },
  [
    { g: "lathe", pts: [[0, 0.4], [0.2, 0.5], [0.28, 0.9], [0.22, 1.5], [0.12, 1.95], [0, 2.1]], n: 6, m: "hull" },
    { g: "lathe", pts: [[0, 0.1], [0.16, 0.18], [0.24, 0.4], [0, 0.42]], n: 6, m: "plate" },
    { g: "cyl", s: [0.0, 0.08, 0.3], p: [0, 0.05, 0], rot: [180, 0, 0], n: 6, m: "glow" },
    { g: "box", s: [0.03, 1.1, 0.03], p: [0, 1.2, 0.235], rot: [3, 0, 0], r: 0.008, m: "glow", radial: { count: 3 } },
    { g: "torus", s: [0.48, 0.03], p: [0, 1.25, 0], rot: [90, 0, 0], n: 40, m: "plate", pivot: "rings" },
    { g: "torus", s: [0.5, 0.012], p: [0, 1.25, 0], rot: [90, 0, 0], n: 40, m: "glow", pivot: "rings" },
    { g: "torus", s: [0.38, 0.02], p: [0, 1.25, 0], rot: [70, 0, 0], n: 40, m: "alloy", pivot: "rings" },
    { g: "box", s: [0.08, 0.08, 0.08], p: [0.48, 1.25, 0], r: 0.02, m: "glow", pivot: "rings", radial: { count: 4 } },
    { g: "cyl", s: [0.03, 0.03, 0.3], p: [0, 2.2, 0], n: 8, m: "alloy", pivot: "dish" },
    { g: "lathe", pts: [[0, 0], [0.12, 0.02], [0.2, 0.08], [0.21, 0.09]], p: [0, 2.3, 0.04], rot: [70, 0, 0], n: 18, m: "plate", pivot: "dish" },
    { g: "sphere", s: [0.035], p: [0, 2.37, 0.16], n: 10, m: "glow", pivot: "dish" }
  ], { hover: 0.15 });

const splitter = legion("splitter", "FISSION Legion Splitter", "RL-06", "#ff7bb7", 24,
  "Unstable core. Splits into two fast Scuttler shards when destroyed.",
  { halfL: { at: [0.06, 1.0, 0], mirror: true }, core: { at: [0, 1.0, 0] } },
  [
    { g: "sphere", s: [0.2], p: [0, 1.0, 0], n: 20, m: "hot", pivot: "core" },
    { g: "octa", s: [0.3], p: [0, 1.0, 0], m: "glow", pivot: "core", sc: [0.6, 1.1, 0.6] },
    { g: "sphere", s: [0.46], arc: 0.5, p: [0.06, 1.0, 0], rot: [0, 0, -90], n: 18, m: "hull", pivot: "halfL", mirror: true },
    { g: "torus", s: [0.46, 0.025], p: [0.07, 1.0, 0], rot: [0, 90, 0], n: 36, m: "glow", pivot: "halfL", mirror: true },
    { g: "cyl", s: [0.0, 0.07, 0.34], p: [0.52, 1.0, 0], rot: [0, 0, -90], n: 6, m: "plate", pivot: "halfL", mirror: true },
    { g: "cyl", s: [0.0, 0.06, 0.28], p: [0.36, 1.32, 0], rot: [0, 0, -45], n: 6, m: "plate", pivot: "halfL", mirror: true },
    { g: "cyl", s: [0.0, 0.06, 0.28], p: [0.36, 0.68, 0], rot: [0, 0, -135], n: 6, m: "plate", pivot: "halfL", mirror: true },
    { g: "cyl", s: [0.0, 0.06, 0.28], p: [0.36, 1.0, 0.32], rot: [45, 0, -90], n: 6, m: "plate", pivot: "halfL", mirror: true },
    { g: "cyl", s: [0.0, 0.06, 0.28], p: [0.36, 1.0, -0.32], rot: [-45, 0, -90], n: 6, m: "plate", pivot: "halfL", mirror: true },
    { g: "lathe", pts: [[0, 0], [0.22, 0.04], [0.16, 0.14], [0, 0.2]], p: [0, 0.18, 0], n: 6, m: "dark" },
    { g: "cyl", s: [0.03, 0.06, 0.4], p: [0, 0.48, 0], n: 8, m: "glow" }
  ]);

const brute = legion("brute", "JUGGERNAUT Legion Brute", "RL-07", "#ff4378", 29,
  "Heavy assault frame. Massive armoured fists and a pulsing reactor.",
  {
    legL: { at: [0.26, 0.86, -0.05], mirror: true },
    torso: { at: [0, 1.0, 0] },
    armL: { at: [0.62, 1.62, 0.05], parent: "torso", mirror: true }
  },
  [
    { g: "box", s: [0.6, 0.3, 0.46], p: [0, 0.98, -0.04], r: 0.1, m: "dark", pivot: "torso" },
    { g: "box", s: [1.04, 0.74, 0.7], p: [0, 1.48, 0.0], r: 0.18, m: "hull", pivot: "torso" },
    { g: "plate", pts: [[-0.44, 0.3], [0.44, 0.3], [0.36, -0.1], [0.14, -0.32], [-0.14, -0.32], [-0.36, -0.1]], d: 0.07, p: [0, 1.5, 0.36], rot: [-6, 0, 0], m: "plate", pivot: "torso" },
    { g: "cyl", s: [0.14, 0.14, 0.06], p: [0, 1.46, 0.42], rot: [90, 0, 0], n: 6, m: "glow", pivot: "torso" },
    { g: "box", s: [0.26, 0.2, 0.26], p: [0, 1.82, 0.26], r: 0.07, m: "dark", pivot: "torso" },
    { g: "slab", s: [0.2, 0.04, 0.03], p: [0, 1.83, 0.4], r: 0.015, m: "glow", pivot: "torso" },
    { g: "box", s: [0.7, 0.3, 0.3], p: [0, 1.62, -0.42], r: 0.08, m: "alloy", pivot: "torso" },
    { g: "cyl", s: [0.06, 0.08, 0.36], p: [0.22, 1.86, -0.42], n: 10, m: "alloy", pivot: "torso", mirror: true },
    { g: "cyl", s: [0.05, 0.05, 0.02], p: [0.22, 2.05, -0.42], n: 10, m: "hot", pivot: "torso", mirror: true },
    { g: "sphere", s: [0.27], arc: 0.55, p: [0.66, 1.72, 0.02], sc: [1, 0.9, 1.1], rot: [0, 0, -25], m: "plate", pivot: "armL", mirror: true },
    { g: "box", s: [0.24, 0.5, 0.26], p: [0.72, 1.32, 0.08], rot: [-12, 0, 6], r: 0.07, m: "alloy", pivot: "armL", mirror: true },
    { g: "box", s: [0.36, 0.36, 0.4], p: [0.76, 0.86, 0.2], r: 0.1, m: "hull", pivot: "armL", mirror: true },
    { g: "box", s: [0.38, 0.06, 0.06], p: [0.76, 0.86, 0.42], r: 0.02, m: "glow", pivot: "armL", mirror: true },
    strut([0.26, 0.86, -0.05], [0.32, 0.46, 0.08], 0.12, "plate", { pivot: "legL", mirror: true, box: true, depth: 0.13 }),
    strut([0.32, 0.46, 0.08], [0.32, 0.12, -0.02], 0.1, "alloy", { pivot: "legL", mirror: true, box: true, depth: 0.1 }),
    { g: "box", s: [0.3, 0.12, 0.44], p: [0.32, 0.06, 0.05], r: 0.04, m: "dark", pivot: "legL", mirror: true }
  ]);

const turret = legion("turret", "WARDEN Rift Emplacement", "RL-08", "#ff3d91", 34,
  "Fixed emplacement. Twin-barrel plasma battery on an armoured plinth.",
  { head: { at: [0, 1.0, 0] } },
  [
    { g: "cyl", s: [0.86, 1.0, 0.36], p: [0, 0.18, 0], n: 6, m: "dark" },
    { g: "cyl", s: [0.7, 0.84, 0.3], p: [0, 0.5, 0], n: 6, m: "hull" },
    { g: "cyl", s: [0.72, 0.72, 0.04], p: [0, 0.38, 0], n: 6, m: "glow" },
    { g: "plate", pts: [[-0.3, 0.12], [0.3, 0.12], [0.36, -0.14], [-0.36, -0.14]], d: 0.06, p: [0, 0.32, 0.86], rot: [-30, 0, 0], m: "plate", radial: { count: 6 } },
    { g: "cyl", s: [0.4, 0.5, 0.2], p: [0, 0.74, 0], n: 16, m: "alloy" },
    { g: "box", s: [0.92, 0.42, 0.88], p: [0, 1.04, -0.04], r: 0.14, m: "hull", pivot: "head" },
    { g: "plate", pts: [[-0.42, 0.18], [0.42, 0.18], [0.3, -0.18], [-0.3, -0.18]], d: 0.06, p: [0, 1.06, 0.42], rot: [-15, 0, 0], m: "plate", pivot: "head" },
    { g: "box", s: [0.22, 0.12, 0.14], p: [0, 1.3, 0.2], r: 0.04, m: "dark", pivot: "head" },
    { g: "slab", s: [0.18, 0.04, 0.03], p: [0, 1.3, 0.28], r: 0.015, m: "glow", pivot: "head" },
    { g: "box", s: [0.2, 0.22, 0.5], p: [0.28, 1.0, 0.5], r: 0.05, m: "alloy", pivot: "head", mirror: true },
    { g: "cyl", s: [0.07, 0.08, 0.8], p: [0.28, 1.0, 0.98], rot: [90, 0, 0], n: 14, m: "dark", pivot: "head", mirror: true },
    { g: "torus", s: [0.09, 0.018], p: [0.28, 1.0, 1.2], n: 18, m: "glow", pivot: "head", mirror: true },
    { g: "torus", s: [0.085, 0.02], p: [0.28, 1.0, 1.38], n: 18, m: "hot", pivot: "head", mirror: true },
    { g: "box", s: [0.4, 0.3, 0.2], p: [0, 1.06, -0.54], r: 0.06, m: "alloy", pivot: "head" },
    { g: "cyl", s: [0.015, 0.015, 0.5], p: [0.3, 1.45, -0.4], n: 6, m: "alloy", pivot: "head" },
    { g: "sphere", s: [0.03], p: [0.3, 1.71, -0.4], n: 8, m: "glow", pivot: "head" }
  ]);

const guardian = legion("guardian", "RIFT GUARDIAN Colossus", "RL-X1", "#ff3e91", 67,
  "Sector boss. Three-phase colossus with twin arm batteries and a reactor crown.",
  {
    legL: { at: [0.62, 2.0, -0.1], mirror: true },
    torso: { at: [0, 2.2, 0] },
    head: { at: [0, 3.9, 0.3], parent: "torso" },
    armL: { at: [1.45, 3.5, 0], parent: "torso", mirror: true },
    crown: { at: [0, 4.5, -0.2], parent: "torso" }
  },
  [
    // pelvis and torso
    { g: "box", s: [1.5, 0.6, 1.0], p: [0, 2.15, -0.05], r: 0.2, m: "dark", pivot: "torso" },
    { g: "lathe", pts: [[0.7, 0], [1.05, 0.3], [1.3, 0.9], [1.22, 1.5], [0.85, 1.8], [0, 1.85]], p: [0, 2.35, 0], sc: [1, 1, 0.68], n: 10, m: "hull", pivot: "torso" },
    { g: "plate", pts: [[-0.95, 0.75], [0.95, 0.75], [0.8, -0.1], [0.3, -0.75], [-0.3, -0.75], [-0.8, -0.1]], d: 0.14, p: [0, 3.2, 0.82], rot: [-10, 0, 0], m: "plate", pivot: "torso" },
    { g: "cyl", s: [0.4, 0.4, 0.14], p: [0, 3.2, 0.92], rot: [80, 0, 0], n: 6, m: "alloy", pivot: "torso" },
    { g: "cyl", s: [0.3, 0.3, 0.12], p: [0, 3.2, 0.98], rot: [80, 0, 0], n: 6, m: "hot", pivot: "torso" },
    { g: "box", s: [0.08, 0.9, 0.04], p: [0.62, 3.1, 0.86], rot: [-10, 0, 18], r: 0.02, m: "glow", pivot: "torso", mirror: true },
    { g: "box", s: [1.6, 1.0, 0.6], p: [0, 3.3, -0.86], r: 0.16, m: "alloy", pivot: "torso" },
    ...[-0.5, 0, 0.5].map((x) => ({ g: "cyl", s: [0.12, 0.16, 0.9], p: [x, 3.95, -0.95], n: 12, m: "alloy", pivot: "torso" })),
    ...[-0.5, 0, 0.5].map((x) => ({ g: "cyl", s: [0.1, 0.1, 0.04], p: [x, 4.41, -0.95], n: 12, m: "hot", pivot: "torso" })),
    // head
    { g: "box", s: [0.7, 0.46, 0.6], p: [0, 3.95, 0.42], r: 0.14, m: "dark", pivot: "head" },
    { g: "plate", pts: [[-0.36, 0.2], [0.36, 0.2], [0.3, -0.12], [0, -0.26], [-0.3, -0.12]], d: 0.08, p: [0, 3.96, 0.74], m: "plate", pivot: "head" },
    { g: "slab", s: [0.44, 0.07, 0.05], p: [0, 3.98, 0.79], r: 0.03, m: "glow", pivot: "head" },
    { g: "cyl", s: [0.0, 0.08, 0.6], p: [0.34, 4.3, 0.4], rot: [-30, 0, -28], n: 8, m: "plate", pivot: "head", mirror: true },
    // crown
    ...[-50, -25, 0, 25, 50].map((angle, index) => ({ g: "cyl", s: [0.0, 0.13, 1.1 - Math.abs(index - 2) * 0.22], p: [Math.sin(angle * Math.PI / 180) * 0.9, 4.75 - Math.abs(index - 2) * 0.12, -0.2], rot: [-12, 0, -angle * 0.9], n: 6, m: "plate", pivot: "crown" })),
    { g: "torus", s: [0.95, 0.04], p: [0, 4.45, -0.2], rot: [0, 0, 0], arc: 180, n: 30, m: "glow", pivot: "crown" },
    // arms with batteries
    { g: "sphere", s: [0.6], arc: 0.55, p: [1.5, 3.62, 0], sc: [1, 0.85, 1.15], rot: [0, 0, -28], m: "plate", pivot: "armL", mirror: true },
    { g: "box", s: [0.46, 1.0, 0.5], p: [1.6, 2.9, 0.08], rot: [-10, 0, 6], r: 0.12, m: "alloy", pivot: "armL", mirror: true },
    { g: "box", s: [0.7, 0.62, 1.4], p: [1.66, 2.3, 0.5], r: 0.16, m: "hull", pivot: "armL", mirror: true },
    ...[-0.16, 0.16].flatMap((dy) => [
      { g: "cyl", s: [0.11, 0.13, 1.0], p: [1.66, 2.3 + dy, 1.5], rot: [90, 0, 0], n: 14, m: "dark", pivot: "armL", mirror: true },
      { g: "torus", s: [0.13, 0.025], p: [1.66, 2.3 + dy, 2.0], n: 18, m: "hot", pivot: "armL", mirror: true }
    ]),
    { g: "box", s: [0.06, 0.06, 1.2], p: [1.33, 2.45, 0.5], r: 0.02, m: "glow", pivot: "armL", mirror: true },
    // legs
    strut([0.62, 2.0, -0.1], [0.82, 1.1, 0.42], 0.28, "plate", { pivot: "legL", mirror: true, box: true, depth: 0.3 }),
    strut([0.82, 1.1, 0.42], [0.8, 0.28, -0.12], 0.22, "alloy", { pivot: "legL", mirror: true, box: true, depth: 0.24 }),
    { g: "sphere", s: [0.26], p: [0.82, 1.1, 0.42], n: 14, m: "glow", pivot: "legL", mirror: true },
    { g: "box", s: [0.66, 0.26, 1.1], p: [0.8, 0.13, 0.08], r: 0.08, m: "dark", pivot: "legL", mirror: true },
    { g: "plate", pts: [[-0.3, 0], [0.3, 0], [0.2, 0.18], [-0.2, 0.18]], d: 0.06, p: [0.8, 0.22, 0.66], rot: [-35, 0, 0], m: "plate", pivot: "legL", mirror: true }
  ]);

// ---------------------------------------------------------------------------
// Props and pickups
// ---------------------------------------------------------------------------

const gate = {
  id: "gate",
  name: "Upgrade Gate Frame",
  designation: "ND-P01",
  faction: "Dominion",
  role: "Two gates per row. Fly through one to take its upgrade. The field colour and label are applied in game.",
  simRadius: 54,
  hover: 0,
  palette: { hull: "#aab6cc", plate: "#1c2547", alloy: "#5d6680", dark: "#0f1324", glow: "#7fc8ff" },
  pivots: {},
  parts: [
    { g: "box", s: [0.42, 0.26, 0.9], p: [2.12, 0.13, 0], r: 0.06, m: "dark", mirror: true },
    { g: "box", s: [0.26, 3.1, 0.5], p: [2.12, 1.7, 0], rot: [0, 0, -3], r: 0.06, m: "plate", mirror: true },
    { g: "box", s: [0.08, 3.0, 0.56], p: [2.0, 1.7, 0], rot: [0, 0, -3], r: 0.02, m: "hull", mirror: true },
    { g: "box", s: [0.03, 2.8, 0.03], p: [1.96, 1.7, 0.29], rot: [0, 0, -3], r: 0.01, m: "glow", mirror: true },
    { g: "box", s: [4.6, 0.32, 0.56], p: [0, 3.36, 0], r: 0.08, m: "plate" },
    { g: "box", s: [4.0, 0.05, 0.04], p: [0, 3.2, 0.29], r: 0.015, m: "glow" },
    { g: "box", s: [1.2, 0.2, 0.62], p: [0, 3.52, 0], r: 0.06, m: "hull" },
    { g: "cyl", s: [0.06, 0.06, 0.3], p: [2.12, 3.6, 0], n: 8, m: "alloy", mirror: true },
    { g: "sphere", s: [0.06], p: [2.12, 3.78, 0], n: 10, m: "glow", mirror: true },
    { g: "box", s: [3.9, 0.05, 0.4], p: [0, 0.03, 0], r: 0.02, m: "alloy" }
  ]
};

const core = {
  id: "core",
  name: "Core Shard",
  designation: "ND-P02",
  faction: "Neutral",
  role: "Dropped by destroyed Legion units. Magnetised to the commander within 7.6 m.",
  simRadius: 10,
  hover: 0.55,
  palette: { glow: "#ffd85a", hot: "#fff3b0", alloy: "#8a6a20" },
  pivots: {},
  parts: [
    { g: "octa", s: [0.2], sc: [0.75, 1.3, 0.75], m: "glow" },
    { g: "octa", s: [0.1], sc: [0.75, 1.3, 0.75], m: "hot" },
    { g: "torus", s: [0.22, 0.01], rot: [90, 0, 0], n: 28, m: "alloy" }
  ]
};

const crystal = {
  id: "crystal",
  name: "Rift Crystal Cluster",
  designation: "ND-S01",
  faction: "Terrain",
  role: "Scenery. Light source along the causeway.",
  simRadius: 30,
  hover: 0,
  palette: { glow: "#7d6bff", glow2: "#45f6ff", dark: "#151227" },
  pivots: {},
  parts: [
    { g: "rock", s: [0.7], sc: [1.4, 0.45, 1.2], p: [0, 0.12, 0], seed: 4, m: "dark" },
    { g: "cyl", s: [0.0, 0.22, 2.2], p: [0, 1.1, 0], n: 6, m: "glow" },
    { g: "cyl", s: [0.0, 0.16, 1.5], p: [0.38, 0.7, 0.1], rot: [0, 0, -24], n: 6, m: "glow2" },
    { g: "cyl", s: [0.0, 0.14, 1.2], p: [-0.34, 0.58, 0.2], rot: [10, 0, 28], n: 6, m: "glow" },
    { g: "cyl", s: [0.0, 0.12, 1.0], p: [0.05, 0.48, -0.42], rot: [-30, 0, 4], n: 6, m: "glow2" },
    { g: "cyl", s: [0.0, 0.1, 0.8], p: [-0.2, 0.4, -0.3], rot: [-24, 0, 30], n: 6, m: "glow" }
  ]
};

const beacon = {
  id: "beacon",
  name: "Nav Beacon Pylon",
  designation: "ND-S02",
  faction: "Terrain",
  role: "Scenery. Strobing navigation pylon that lights the causeway edge.",
  simRadius: 20,
  hover: 0,
  palette: { hull: "#b9c4da", plate: "#1d2547", alloy: "#59617a", dark: "#10131f", glow: "#45f6ff", hot: "#ff52ce" },
  pivots: { lamp: { at: [0, 3.2, 0] } },
  parts: [
    { g: "cyl", s: [0.5, 0.62, 0.3], p: [0, 0.15, 0], n: 8, m: "dark" },
    { g: "cyl", s: [0.18, 0.3, 0.5], p: [0, 0.55, 0], n: 8, m: "plate" },
    { g: "cyl", s: [0.09, 0.12, 2.5], p: [0, 1.9, 0], n: 8, m: "alloy" },
    { g: "box", s: [0.05, 2.2, 0.05], p: [0, 1.9, 0.11], r: 0.015, m: "glow", radial: { count: 4 } },
    { g: "torus", s: [0.26, 0.03], p: [0, 2.6, 0], rot: [90, 0, 0], n: 24, m: "hull" },
    { g: "sphere", s: [0.16], p: [0, 3.2, 0], n: 16, m: "hot", pivot: "lamp" },
    { g: "torus", s: [0.3, 0.015], p: [0, 3.2, 0], rot: [90, 0, 0], n: 28, m: "glow", pivot: "lamp" }
  ]
};

const rock = {
  id: "rock",
  name: "Basalt Outcrop",
  designation: "ND-S03",
  faction: "Terrain",
  role: "Scenery. Fractured rift basalt.",
  simRadius: 34,
  hover: 0,
  palette: { dark: "#241f2e", alloy: "#3a3446", glow: "#ff52ce" },
  finish: { dark: "rubber", alloy: "rubber" },
  pivots: {},
  parts: [
    { g: "rock", s: [0.9], sc: [1.3, 0.8, 1.1], p: [0, 0.5, 0], seed: 7, m: "dark" },
    { g: "rock", s: [0.55], sc: [1, 1.2, 1], p: [0.8, 0.4, 0.3], seed: 11, m: "alloy" },
    { g: "rock", s: [0.4], p: [-0.7, 0.25, -0.3], seed: 19, m: "dark" },
    { g: "box", s: [0.6, 0.02, 0.02], p: [0.1, 0.62, 0.86], rot: [0, 20, -12], r: 0.005, m: "glow" }
  ]
};

const wreck = {
  id: "wreck",
  name: "Hover Tank Wreck",
  designation: "ND-S04",
  faction: "Terrain",
  role: "Scenery. Burnt-out Dominion hover tank from an earlier push.",
  simRadius: 40,
  hover: 0,
  palette: { hull: "#3b4152", plate: "#22283a", alloy: "#4a4e5c", dark: "#14161e", hot: "#ff7a3a" },
  finish: { hull: "dark" },
  pivots: {},
  parts: [
    { g: "box", s: [1.6, 0.5, 2.6], p: [0, 0.32, 0], rot: [4, 12, -8], r: 0.14, m: "hull" },
    { g: "box", s: [1.0, 0.36, 1.1], p: [0.1, 0.72, -0.1], rot: [2, 30, -10], r: 0.1, m: "plate" },
    { g: "cyl", s: [0.07, 0.08, 1.6], p: [0.5, 0.78, 0.7], rot: [80, 0, -40], n: 10, m: "alloy" },
    { g: "box", s: [0.5, 0.06, 0.8], p: [-1.0, 0.1, 0.5], rot: [10, -20, 30], r: 0.02, m: "plate" },
    { g: "box", s: [0.4, 0.05, 0.5], p: [0.9, 0.06, -1.2], rot: [-6, 40, -12], r: 0.02, m: "hull" },
    { g: "cyl", s: [0.22, 0.26, 0.2], p: [-0.5, 0.25, -1.1], rot: [70, 0, 10], n: 12, m: "dark" },
    { g: "sphere", s: [0.12], p: [-0.2, 0.62, 0.4], n: 10, m: "hot" },
    { g: "sphere", s: [0.08], p: [0.4, 0.55, -0.7], n: 10, m: "hot" }
  ]
};

const riftgate = {
  id: "riftgate",
  name: "Rift Gate",
  designation: "ND-X01",
  faction: "Rift",
  role: "Sector objective. The guardian emerges from the rift. The vortex shader is applied in game.",
  simRadius: 230,
  hover: 0,
  palette: { hull: "#2a2140", plate: "#3a1a46", alloy: "#4b4660", dark: "#0d0a16", glow: "#ff3fd1", glow2: "#45f6ff" },
  pivots: { ring: { at: [0, 8.5, 0] } },
  parts: [
    { g: "torus", s: [7.2, 0.55], p: [0, 8.5, 0], n: 72, tn: 12, m: "plate", pivot: "ring" },
    { g: "torus", s: [7.2, 0.12], p: [0, 8.5, 0.5], n: 72, m: "glow", pivot: "ring" },
    { g: "torus", s: [6.4, 0.08], p: [0, 8.5, 0.3], n: 72, m: "glow2", pivot: "ring" },
    { g: "box", s: [0.8, 1.6, 1.4], p: [0, 15.7, 0], r: 0.2, m: "alloy", pivot: "ring", radial: { count: 8, axis: "z", center: [0, 8.5, 0] } },
    { g: "box", s: [0.3, 0.9, 0.3], p: [0, 16.2, 0.55], r: 0.1, m: "glow", pivot: "ring", radial: { count: 8, axis: "z", offset: 22.5, center: [0, 8.5, 0] } },
    { g: "box", s: [2.2, 4.0, 3.2], p: [6.6, 2.0, 0], rot: [0, 0, 8], r: 0.4, m: "hull", mirror: true },
    { g: "box", s: [1.4, 8.0, 1.6], p: [8.2, 5.0, 0], rot: [0, 0, 6], r: 0.3, m: "dark", mirror: true },
    { g: "box", s: [0.12, 6.0, 0.1], p: [7.5, 5.0, 0.82], rot: [0, 0, 6], r: 0.04, m: "glow", mirror: true },
    { g: "cyl", s: [9.5, 10.5, 0.6], p: [0, 0.3, 0], n: 8, m: "dark" },
    { g: "ring", s: [8.6, 9.2], p: [0, 0.62, 0], n: 64, m: "glow" }
  ]
};

export const MODELS = {
  commander, striker, rail, bulwark, medic,
  grunt, shooter, charger, shield, jammer, splitter, brute, turret, guardian,
  gate, core, crystal, beacon, rock, wreck, riftgate
};

export const MODEL_GROUPS = [
  { title: "Dominion command squad", ids: ["commander", "striker", "rail", "bulwark", "medic"] },
  { title: "Rift Legion", ids: ["grunt", "shooter", "charger", "shield", "jammer", "splitter", "brute", "turret", "guardian"] },
  { title: "Battlefield props", ids: ["gate", "core", "riftgate", "crystal", "beacon", "rock", "wreck"] }
];

// Guardian colour variants keyed by BOSS_NAMES order in game.js.
export const GUARDIAN_VARIANTS = [
  { name: "RIFT WARDEN", glow: "#ff3e91", hot: "#ffd0e8" },
  { name: "HEX TYRANT", glow: "#ba62ff", hot: "#f0d8ff" },
  { name: "NULL COLOSSUS", glow: "#45f6ff", hot: "#e0ffff" },
  { name: "OMEGA REGENT", glow: "#ffb347", hot: "#fff0c8" }
];

export function guardianVariant(index) {
  const variant = GUARDIAN_VARIANTS[index % GUARDIAN_VARIANTS.length];
  return { ...guardian, id: `guardian${index % GUARDIAN_VARIANTS.length}`, palette: { ...guardian.palette, glow: variant.glow, hot: variant.hot } };
}
