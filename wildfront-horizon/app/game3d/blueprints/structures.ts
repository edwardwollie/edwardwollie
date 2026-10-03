// S-series (structures) and V-series (vehicle) blueprints. Frame: +Z = front,
// +Y up, origin at ground level under the footprint centre.

import { hex } from "../core/color.ts";
import type { AssemblyBlueprint, MatSpec, Prim } from "./assembly.ts";
import { OVERALL } from "./overall.ts";

const M = (label: string, c: string, metal = 0, rough = 0.85): MatSpec => ({ label, color: hex(c), metal, rough });
const H = Math.PI / 2;
const box = (id: string, name: string, mat: string, p: [number, number, number], size: [number, number, number], rot?: [number, number, number], explode?: [number, number, number], group?: string): Prim => ({ id, name, kind: "box", mat, p, size, rot, explode, group });
const cyl = (id: string, name: string, mat: string, p: [number, number, number], r: number, h: number, rot?: [number, number, number], r2?: number, explode?: [number, number, number]): Prim => ({ id, name, kind: "cyl", mat, p, r, r2: r2 ?? r, h, rot, seg: 10, explode });

// ---------------------------------------------------------------- S-01 lookout tower
function lookoutTower(): AssemblyBlueprint {
  const prims: Prim[] = [];
  const base = 2.4, top = 1.6, Ht = 9;
  const legs: [number, number][] = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
  legs.forEach(([sx, sz], i) => {
    const bx = sx * base, bz = sz * base, tx = sx * top, tz = sz * top;
    prims.push({ id: `leg${i}`, name: "Timber leg 200×200", kind: "tube", mat: "timber", p: [0, 0, 0], pts: [[bx, -0.6, bz], [tx, Ht, tz]], tr: 0.11, explode: [sx * 0.8, 0, sz * 0.8] });
  });
  for (let lvl = 0; lvl < 3; lvl++) {
    const y0 = lvl * 3, y1 = (lvl + 1) * 3;
    const w0 = base + (top - base) * (y0 / Ht), w1 = base + (top - base) * (y1 / Ht);
    for (const [a, b] of [[[1, 1], [-1, 1]], [[-1, -1], [1, -1]], [[1, 1], [1, -1]], [[-1, 1], [-1, -1]]] as [number, number][][]) {
      prims.push({ id: `brace${lvl}-${a}-${b}`, name: "Cross brace", kind: "tube", mat: "timber2", p: [0, 0, 0], pts: [[a[0] * w0, y0 + 0.2, a[1] * w0], [b[0] * w1, y1, b[1] * w1]], tr: 0.05 });
      prims.push({ id: `girt${lvl}-${a}-${b}`, name: "Girt", kind: "tube", mat: "timber2", p: [0, 0, 0], pts: [[a[0] * w1, y1, a[1] * w1], [b[0] * w1, y1, b[1] * w1]], tr: 0.05 });
    }
  }
  prims.push(box("deck", "Deck 4.2×4.2", "timber", [0, Ht + 0.08, 0], [4.2, 0.16, 4.2], undefined, [0, 0.6, 0]));
  prims.push(box("cab-floor", "Cab floor", "plank", [0, Ht + 0.2, 0], [3.0, 0.08, 3.0], undefined, [0, 1.2, 0], "cab"));
  for (const [sx, sz] of legs) prims.push(cyl(`post${sx}${sz}`, "Cab corner post", "timber", [sx * 1.45, Ht + 1.3, sz * 1.45], 0.07, 2.2, undefined, undefined, [0, 1.2, 0]));
  // lower walls + window band
  for (const [i, rot] of [[0, 0], [1, H], [2, Math.PI], [3, -H]] as [number, number][]) {
    const dx = Math.sin(rot) * 1.45, dz = Math.cos(rot) * 1.45;
    prims.push(box(`wall${i}`, "Board wall", "plank", [dx, Ht + 0.7, dz], [2.9, 1.0, 0.06], [0, rot, 0], [0, 1.2, 0], "cab"));
    prims.push(box(`glass${i}`, "Window band", "glass", [dx * 0.99, Ht + 1.7, dz * 0.99], [2.8, 1.0, 0.03], [0, rot, 0], [0, 1.2, 0], "cab"));
    prims.push(box(`rail${i}`, "Deck railing", "timber2", [Math.sin(rot) * 2.08, Ht + 1.05, Math.cos(rot) * 2.08], [4.2, 0.07, 0.07], [0, rot, 0], [0, 0.6, 0]));
  }
  prims.push({ id: "roof", name: "Hip roof", kind: "cyl", mat: "roof", p: [0, Ht + 2.75, 0], r: 2.45, r2: 0.05, h: 0.9, seg: 4, rot: [0, Math.PI / 4, 0], explode: [0, 2.2, 0] });
  prims.push(cyl("finial", "Finial / lightning rod", "metal", [0, Ht + 3.5, 0], 0.025, 0.7, undefined, undefined, [0, 2.4, 0]));
  // ladder
  for (let k = 0; k < 2; k++) prims.push({ id: `stringer${k}`, name: "Ladder stringer", kind: "tube", mat: "metal", p: [0, 0, 0], pts: [[-0.3 + k * 0.6, 0, 2.9], [-0.3 + k * 0.6, Ht, 1.75]], tr: 0.03, explode: [0, 0, 1.2] });
  for (let r = 1; r < 26; r++) { const u = r / 26; prims.push(box(`rung${r}`, "Rung", "metal", [0, u * Ht, 2.9 - 1.15 * u], [0.6, 0.03, 0.03], undefined, [0, 0, 1.2])); }
  return {
    id: "lookout-tower", drawing: "S-01", title: "Fire Lookout Tower", subtitle: "9 m timber tower with glazed cab", category: "structure", rev: "B", scale: "1:100",
    overall: { length: 6.0, width: 4.9, height: 12.85 }, notes: ["Climb (F) for a 360° view over the reserve through the glazed cab; your scent lifts above the game while you are aloft.", "Four battered timber legs, three braced bays, 3 m glazed cab (window band 0.95–1.95 m above the cab floor), hip roof."],
    materials: { timber: M("Weathered timber", "#6a5640"), timber2: M("Timber bracing", "#5c4a36"), plank: M("Painted boards", "#7a6a4e"), glass: { ...M("Glazing", "#9fc4d4", 0.1, 0.05), opacity: 0.16 }, roof: M("Green roof", "#3d4a36", 0.1, 0.7), metal: M("Galvanised steel", "#8a8e92", 0.8, 0.4) },
    prims, anchors: { deck: [0, Ht + 0.25, 0], ladder: [0, 0, 3.2] },
    // standing in the cab: eye 1.68 m above the floor, in the upper half of the window band
    perch: { kind: "tower", floor: Ht + 0.25, eye: null, roam: 0.95, at: [0, 0], exit: [0, 3.6], scent: 0.15 },
    specs: [{ label: "Deck height", value: "9.0 m" }, { label: "Cab", value: "3.0 × 3.0 m glazed" }, { label: "Footprint", value: "4.8 × 4.8 m" }],
    facts: ["Fire lookouts were staffed every summer to spot smoke across national forests."],
  };
}

// ---------------------------------------------------------------- S-02 tripod stand
function tripodStand(): AssemblyBlueprint {
  const Ht = 4.5;
  const prims: Prim[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    prims.push({ id: `leg${i}`, name: "Steel leg 50 mm", kind: "tube", mat: "steel", p: [0, 0, 0], pts: [[Math.cos(a) * 1.7, -0.2, Math.sin(a) * 1.7], [Math.cos(a) * 0.35, Ht, Math.sin(a) * 0.35]], tr: 0.028, explode: [Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6] });
  }
  prims.push(cyl("platform", "Platform 1.0 m", "grate", [0, Ht, 0], 0.55, 0.06, undefined, undefined, [0, 0.5, 0]));
  prims.push(cyl("seat", "Swivel seat", "camo", [0, Ht + 0.45, 0], 0.22, 0.08, undefined, undefined, [0, 0.9, 0]));
  prims.push(cyl("seat-post", "Seat post", "steel", [0, Ht + 0.22, 0], 0.03, 0.42, undefined, undefined, [0, 0.9, 0]));
  prims.push({ id: "rail", name: "Shooting rail", kind: "torus", mat: "camo", p: [0, Ht + 0.85, 0], rot: [H, 0, 0], tor: [0.62, 0.025, Math.PI * 1.4], explode: [0, 1.3, 0] });
  for (let r = 1; r < 13; r++) { const u = r / 13; const a = 0.3; prims.push(box(`rung${r}`, "Rung", "steel", [Math.cos(a) * (1.7 - 1.35 * u), u * Ht, Math.sin(a) * (1.7 - 1.35 * u)], [0.38, 0.025, 0.04], [0, -a + H, 0])); }
  return {
    id: "tree-stand", drawing: "S-02", title: "Tripod Stand", subtitle: "4.5 m free-standing shooting stand", category: "structure", rev: "A", scale: "1:40",
    overall: { length: 3.4, width: 3.3, height: 5.4 }, notes: ["Elevated stands lift your scent and outline above the game's eye line.", "Swivel seat and padded rail give a rock-steady rest (sway −40 %)."],
    materials: { steel: M("Powder-coated steel", "#3a3e36", 0.6, 0.5), grate: M("Steel grate", "#2e322c", 0.6, 0.6), camo: M("Camo fabric", "#4a5236", 0, 0.9) },
    prims, anchors: { seat: [0, Ht + 0.49, 0], ladder: [1.75, 0, 0.55] },
    // on the swivel seat: eye 1.24 m above the platform, well above the shooting rail
    perch: { kind: "stand", floor: Ht + 0.03, eye: 1.24, roam: 0, at: [0, 0], exit: [2.3, 0.7], scent: 0.35 },
    specs: [{ label: "Platform height", value: "4.5 m" }, { label: "Footprint", value: "3.4 m triangle" }, { label: "Load", value: "150 kg" }],
  };
}

// ---------------------------------------------------------------- S-03 ground blind
function groundBlind(): AssemblyBlueprint {
  // Hub panels are built around real window openings (1.4 × 0.6 m, sill 0.9 m) so a
  // seated hunter (eye ≈ 1.2 m) looks and shoots straight out on all four sides.
  const S = 1.8, half = S / 2, T = 0.04, sill = 0.9, head = 1.5, winW = 1.4;
  const jamb = (S - winW) / 2;
  const prims: Prim[] = [];
  for (const [i, rot] of [[0, 0], [1, H], [2, Math.PI], [3, -H]] as [number, number][]) {
    const nx = Math.sin(rot), nz = Math.cos(rot);           // panel normal
    const tx = Math.cos(rot), tz = -Math.sin(rot);          // along the panel
    const at = (u: number, y: number): [number, number, number] => [nx * half + tx * u, y, nz * half + tz * u];
    const ex: [number, number, number] = [nx * 0.5, 0, nz * 0.5];
    prims.push(box(`low${i}`, "Hub panel (lower)", "camo", at(0, sill / 2), [S, sill, T], [0, rot, 0], ex));
    prims.push(box(`up${i}`, "Hub panel (upper)", "camo", at(0, (head + S) / 2), [S, S - head, T], [0, rot, 0], ex));
    for (const sgn of [-1, 1]) prims.push(box(`jamb${i}${sgn > 0 ? "r" : "l"}`, "Window jamb", "camo", at(sgn * (winW / 2 + jamb / 2), (sill + head) / 2), [jamb, head - sill, T], [0, rot, 0], ex));
    prims.push({ ...cyl(`flap${i}`, "Window flap (rolled up)", "dark", [nx * (half + 0.05), head + 0.05, nz * (half + 0.05)], 0.045, winW, [0, rot, H]), explode: ex });
  }
  prims.push(box("door", "Zip door", "dark", [0, 0.47, -half - 0.012], [0.7, 0.86, 0.02], undefined, [0, 0, -0.5]));
  prims.push(box("floor", "Ground sheet", "floor", [0, 0.01, 0], [S - 0.1, 0.02, S - 0.1]));
  prims.push(cyl("stool", "Folding stool", "dark", [0, 0.24, 0.15], 0.17, 0.05, undefined, undefined, [0, 0.4, 0]));
  prims.push({ id: "roof", name: "Hub roof", kind: "cyl", mat: "camo2", p: [0, 1.95, 0], r: 1.3, r2: 0.2, h: 0.3, seg: 4, rot: [0, Math.PI / 4, 0], explode: [0, 0.8, 0] });
  // brush-in stays outside the panels and below the windows; the door side is kept clear
  [-120, -70, -25, 25, 70, 120].forEach((deg, i) => { const a = deg * Math.PI / 180; prims.push({ id: `brush${i}`, name: "Brush-in", kind: "sphere", mat: "brush", p: [Math.sin(a) * 1.3, 0.28, Math.cos(a) * 1.3], r: 0.38 }); });
  return {
    id: "ground-blind", drawing: "S-03", title: "Ground Blind", subtitle: "Hub-style pop-up blind, brushed in", category: "structure", rev: "B", scale: "1:25",
    overall: { length: 2.4, width: 2.4, height: 2.1 }, notes: ["Inside a blind you can move and draw without being seen (visibility −45 %); four shoot-through windows at seated eye height.", "Brush it in with local vegetation and set it up days ahead."],
    materials: { camo: M("Camo shell", "#4c4a36"), camo2: M("Roof", "#3e3c2c"), dark: M("Black interior", "#0c0c0c", 0, 1), brush: M("Brush", "#3a4a2a"), floor: M("Ground sheet", "#2a2a22") },
    prims, anchors: { seat: [0, 0.27, 0.15], eye: [0, 1.2, 0.15], ladder: [0, 0, -1.4] },
    // on the stool: eye level with the shoot-through windows (sill 0.9 m, head 1.5 m)
    perch: { kind: "blind", floor: 0.02, eye: 1.2, roam: 0.3, at: [0, 0.15], exit: [0, -1.8], scent: 0.8 },
    specs: [{ label: "Hub size", value: "1.8 × 1.8 × 1.8 m" }, { label: "Windows", value: "4 × 1.4 × 0.6 m, sill 0.9 m" }],
  };
}

// ---------------------------------------------------------------- S-04 cabin / S-08 ranger station
function logCabin(id: string, drawing: string, title: string, w: number, d: number, porch: boolean, flag: boolean): AssemblyBlueprint {
  const prims: Prim[] = [];
  const logs = 9, lh = 0.27;
  for (let i = 0; i < logs; i++) {
    const y = 0.15 + i * lh;
    prims.push(cyl(`logF${i}`, "Log course (front)", "log", [0, y, d / 2], 0.15, w + 0.5, [0, 0, H]));
    prims.push(cyl(`logB${i}`, "Log course (back)", "log", [0, y, -d / 2], 0.15, w + 0.5, [0, 0, H]));
    prims.push(cyl(`logL${i}`, "Log course (left)", "log2", [w / 2, y + lh / 2, 0], 0.15, d + 0.5, [H, 0, 0]));
    prims.push(cyl(`logR${i}`, "Log course (right)", "log2", [-w / 2, y + lh / 2, 0], 0.15, d + 0.5, [H, 0, 0]));
  }
  const wallH = 0.15 + logs * lh;
  prims.push(box("fill", "Chinking / interior", "chink", [0, wallH / 2, 0], [w - 0.1, wallH, d - 0.1]));
  // gable roof
  const pitch = 0.6, rw = d / 2 + 0.6;
  prims.push(box("roofF", "Roof slope", "roof", [0, wallH + Math.sin(pitch) * rw / 2, rw * Math.cos(pitch) / 2], [w + 1.0, 0.12, rw], [pitch, 0, 0], [0, 1.2, 0.4]));
  prims.push(box("roofB", "Roof slope", "roof", [0, wallH + Math.sin(pitch) * rw / 2, -rw * Math.cos(pitch) / 2], [w + 1.0, 0.12, rw], [-pitch, 0, 0], [0, 1.2, -0.4]));
  prims.push({ id: "gableL", name: "Gable", kind: "extrude", mat: "plank", p: [w / 2, wallH, 0], rot: [0, H, 0], profile: [[-d / 2, 0], [d / 2, 0], [0, Math.tan(pitch) * d / 2]], depth: 0.1 });
  prims.push({ id: "gableR", name: "Gable", kind: "extrude", mat: "plank", p: [-w / 2, wallH, 0], rot: [0, H, 0], profile: [[-d / 2, 0], [d / 2, 0], [0, Math.tan(pitch) * d / 2]], depth: 0.1 });
  prims.push(box("door", "Plank door", "door", [w * 0.18, 1.0, d / 2 + 0.16], [0.9, 2.0, 0.08]));
  prims.push(box("win1", "Window", "glass", [-w * 0.25, 1.4, d / 2 + 0.16], [0.9, 0.8, 0.06]));
  prims.push(box("win2", "Window", "glass", [w / 2 + 0.16, 1.4, 0], [0.06, 0.8, 0.9]));
  prims.push(box("chimney", "Stone chimney", "stone", [-w / 2 + 0.6, wallH + 1.0, -d / 4], [0.7, 3.4, 0.7], undefined, [0, 1.6, 0]));
  if (porch) {
    prims.push(box("porch", "Porch deck", "plank", [0, 0.3, d / 2 + 1.1], [w, 0.12, 2.0]));
    for (const sx of [-1, 1]) prims.push(cyl(`porchpost${sx}`, "Porch post", "log", [sx * (w / 2 - 0.2), 1.4, d / 2 + 2.0], 0.1, 2.3));
    prims.push(box("porchroof", "Porch roof", "roof", [0, 2.55, d / 2 + 1.1], [w + 0.4, 0.1, 2.3], [0.2, 0, 0]));
  }
  if (flag) {
    prims.push(cyl("flagpole", "Flag pole", "metal", [w / 2 + 3, 3.5, d / 2 + 2], 0.04, 7));
    prims.push(box("flag", "Flag", "flag", [w / 2 + 3.55, 6.4, d / 2 + 2], [1.0, 0.6, 0.02]));
  }
  return {
    id, drawing, title, subtitle: `${w.toFixed(1)} × ${d.toFixed(1)} m saddle-notched log building`, category: "structure", rev: "A", scale: "1:75",
    overall: { length: d + 3, width: w + 1.5, height: wallH + 3 }, notes: ["Saddle-notched round logs, chinked; gable roof at 34°.", "Landmark and rally point — game avoids the immediate surroundings."],
    materials: { log: M("Peeled logs", "#7a5a3c"), log2: M("Peeled logs (end)", "#6e5236"), chink: M("Chinking", "#bfae90"), roof: M("Cedar shakes", "#4a3a2c"), plank: M("Planks", "#6a5038"), door: M("Door", "#4e3a28"), glass: M("Window", "#203038", 0.4, 0.15), stone: M("Fieldstone", "#7a766c"), metal: M("Steel", "#9a9ea2", 0.8, 0.4), flag: M("Flag", "#b8402a") },
    prims, anchors: { door: [w * 0.18, 0, d / 2 + 0.8] }, specs: [{ label: "Footprint", value: `${w.toFixed(1)} × ${d.toFixed(1)} m` }, { label: "Wall", value: `${logs} log courses, Ø 300 mm` }],
  };
}

// ---------------------------------------------------------------- S-05 kiosk
function kiosk(): AssemblyBlueprint {
  return {
    id: "kiosk", drawing: "S-05", title: "Trailhead Kiosk", subtitle: "Map board with shingle roof", category: "structure", rev: "A", scale: "1:25",
    overall: { length: 1.0, width: 2.6, height: 2.9 }, notes: ["Reserve map, regulations and the day's contract are posted here."],
    materials: { post: M("Post", "#5c4630"), board: M("Map board", "#d8cfb8"), roof: M("Shingles", "#3c3028"), frame: M("Frame", "#4a3828") },
    prims: [
      cyl("postL", "Post 150 mm", "post", [-1.1, 1.3, 0], 0.075, 2.6), cyl("postR", "Post 150 mm", "post", [1.1, 1.3, 0], 0.075, 2.6),
      box("frame", "Board frame", "frame", [0, 1.45, 0.02], [2.1, 1.25, 0.08]), box("board", "Map board", "board", [0, 1.45, 0.07], [1.9, 1.05, 0.02]),
      box("roofF", "Roof", "roof", [0, 2.62, 0.25], [2.6, 0.08, 0.7], [0.45, 0, 0]), box("roofB", "Roof", "roof", [0, 2.62, -0.25], [2.6, 0.08, 0.7], [-0.45, 0, 0]),
    ],
    anchors: {}, specs: [{ label: "Board", value: "1.9 × 1.05 m" }],
  };
}

// ---------------------------------------------------------------- V-01 truck
function truck(): AssemblyBlueprint {
  const prims: Prim[] = [
    box("chassis", "Chassis", "dark", [0, 0.55, 0], [1.8, 0.3, 5.2]),
    box("hood", "Hood", "paint", [0, 1.0, 1.75], [1.85, 0.55, 1.7], undefined, [0, 0.3, 0.4]),
    box("cab", "Cab", "paint", [0, 1.35, 0.3], [1.9, 1.15, 1.6], undefined, [0, 0.4, 0]),
    box("windshield", "Windshield", "glass", [0, 1.55, 1.12], [1.7, 0.6, 0.05], [-0.35, 0, 0], [0, 0.4, 0.2]),
    box("sideglassL", "Side glass", "glass", [0.955, 1.6, 0.3], [0.03, 0.5, 1.3]), box("sideglassR", "Side glass", "glass", [-0.955, 1.6, 0.3], [0.03, 0.5, 1.3]),
    box("bed", "Bed floor", "dark", [0, 0.85, -1.55], [1.85, 0.08, 2.1], undefined, [0, 0.2, -0.6]),
    box("bedL", "Bed side", "paint", [0.9, 1.1, -1.55], [0.08, 0.5, 2.1], undefined, [0.3, 0.2, -0.6]), box("bedR", "Bed side", "paint", [-0.9, 1.1, -1.55], [0.08, 0.5, 2.1], undefined, [-0.3, 0.2, -0.6]),
    box("gate", "Tailgate", "paint", [0, 1.1, -2.6], [1.85, 0.5, 0.08], undefined, [0, 0.2, -0.9]),
    box("bumper", "Bumper", "chrome", [0, 0.7, 2.62], [1.9, 0.22, 0.12]), box("grille", "Grille", "chrome", [0, 1.0, 2.6], [1.3, 0.4, 0.05]),
    box("lightL", "Head lamp", "lamp", [0.72, 1.0, 2.61], [0.28, 0.16, 0.04]), box("lightR", "Head lamp", "lamp", [-0.72, 1.0, 2.61], [0.28, 0.16, 0.04]),
  ];
  for (const [i, x, z] of [[0, 0.88, 1.65], [1, -0.88, 1.65], [2, 0.88, -1.6], [3, -0.88, -1.6]] as [number, number, number][]) {
    prims.push(cyl(`tire${i}`, "Tyre 31″", "tire", [x, 0.4, z], 0.4, 0.3, [0, 0, H], undefined, [x * 0.5, 0, 0]));
    prims.push(cyl(`hub${i}`, "Wheel", "chrome", [x * 1.01, 0.4, z], 0.22, 0.31, [0, 0, H], undefined, [x * 0.5, 0, 0]));
  }
  return {
    id: "truck", drawing: "V-01", title: "Pickup Truck", subtitle: "Hunter's 4×4 at the trailhead", category: "vehicle", rev: "A", scale: "1:40",
    overall: { length: 5.36, width: 1.96, height: 2.0 }, notes: ["Marks the trailhead — your start point and return point on the compass."],
    materials: { paint: M("Forest green paint", "#2e4434", 0.3, 0.45), dark: M("Black trim", "#1a1b1c", 0.2, 0.7), glass: M("Glass", "#1a2a32", 0.5, 0.1), chrome: M("Chrome", "#b8bcc0", 1, 0.2), lamp: M("Lamp", "#f0ead0", 0.2, 0.2), tire: M("Tyre", "#141414", 0, 0.9) },
    prims, anchors: {}, specs: [{ label: "Length", value: "5.4 m" }, { label: "Drive", value: "4×4" }],
  };
}

// ---------------------------------------------------------------- S-06 footbridge, S-07 fence
function footbridge(): AssemblyBlueprint {
  const L = 26, prims: Prim[] = [];
  prims.push(box("beamL", "Glulam beam", "beam", [0.7, 0.0, 0], [0.18, 0.5, L], undefined, [0.5, -0.4, 0]));
  prims.push(box("beamR", "Glulam beam", "beam", [-0.7, 0.0, 0], [0.18, 0.5, L], undefined, [-0.5, -0.4, 0]));
  for (let i = 0; i < 52; i++) prims.push(box(`plank${i}`, "Deck plank", "plank", [0, 0.29, -L / 2 + 0.25 + i * 0.5], [1.7, 0.06, 0.44]));
  for (const sx of [-1, 1]) {
    prims.push(box(`rail${sx}`, "Hand rail", "beam", [sx * 0.85, 1.25, 0], [0.08, 0.08, L], undefined, [sx * 0.6, 0.6, 0]));
    for (let i = 0; i <= 13; i++) prims.push(box(`post${sx}-${i}`, "Rail post", "beam", [sx * 0.85, 0.75, -L / 2 + i * 2], [0.09, 1.0, 0.09], undefined, [sx * 0.6, 0.6, 0]));
  }
  return {
    id: "footbridge", drawing: "S-06", title: "Footbridge", subtitle: "26 m timber river crossing", category: "structure", rev: "A", scale: "1:100",
    overall: { length: L, width: 1.9, height: 1.55 }, notes: ["Cross rivers without wading — water noise and wet boots carry."],
    materials: { beam: M("Glulam", "#6a5038"), plank: M("Deck planks", "#7a6448") }, prims, anchors: {}, specs: [{ label: "Span", value: "26 m" }, { label: "Deck", value: "1.7 m wide" }],
  };
}
function fence(): AssemblyBlueprint {
  const prims: Prim[] = [];
  for (let i = 0; i < 6; i++) prims.push(cyl(`post${i}`, "Post", "wood", [0, 0.6, -7.5 + i * 3], 0.08, 1.3));
  for (let i = 0; i < 5; i++) for (const y of [0.45, 0.95]) prims.push(cyl(`rail${i}-${y}`, "Split rail", "wood2", [0, y, -6 + i * 3], 0.055, 3.2, [H, 0, 0]));
  return {
    id: "fence", drawing: "S-07", title: "Split-Rail Fence", subtitle: "15 m homestead fence line", category: "structure", rev: "A", scale: "1:50",
    overall: { length: 15.4, width: 0.17, height: 1.25 }, notes: ["Old homestead boundary — bison rub on the posts."],
    materials: { wood: M("Grey cedar", "#7c766a"), wood2: M("Split rail", "#8a8274") }, prims, anchors: {}, specs: [{ label: "Length", value: "15 m (5 bays)" }],
  };
}

// ---------------------------------------------------------------- S-09 Wildfront Lodge (menu hub)
function lodge(): AssemblyBlueprint {
  const c = logCabin("wildfront-lodge", "S-09", "Wildfront Lodge", 12, 8, true, true);
  c.subtitle = "Hunters' lodge on Aurora Lake — the game's hub";
  c.notes = ["Trophy room, gear locker and the contract board live here.", "Built from the same log-course blueprint as the trapper's cabin at 2.2× scale."];
  c.prims.push(box("sign", "WILDFRONT sign board", "door", [0, 3.2, 4 + 2.15], [3.4, 0.6, 0.08]));
  c.prims.push({ id: "antlers", name: "Antler mount", kind: "torus", mat: "chink", p: [0, 3.75, 4 + 2.2], rot: [0, 0, 0], tor: [0.45, 0.05, Math.PI] });
  c.prims.push(box("bigwin", "Great-room window", "glass", [-3.2, 1.6, 4.16], [3.0, 1.6, 0.06]));
  return c;
}

export const STRUCTURES: AssemblyBlueprint[] = [lookoutTower(), tripodStand(), groundBlind(), logCabin("cabin", "S-04", "Trapper's Cabin", 5.4, 4.2, true, false), kiosk(), footbridge(), fence(), logCabin("ranger-station", "S-08", "Ranger Station", 7.5, 5.5, true, true), lodge(), truck()];
for (const st of STRUCTURES) if (OVERALL[st.id]) st.overall = OVERALL[st.id];
export const STRUCTURES_BY_ID: Record<string, AssemblyBlueprint> = Object.fromEntries(STRUCTURES.map(s => [s.id, s]));
