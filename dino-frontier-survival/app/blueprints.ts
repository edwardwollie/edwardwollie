/**
 * Dino Frontier 3D blueprints.
 *
 * Every model in the game (ranger, drone, dinosaurs, structures and props) is
 * described here as plain data: a bone hierarchy used for animation, a list of
 * primitive parts measured in metres, and named sockets (muzzles, mouths).
 * The game engine and the blueprint viewer both build meshes from this single
 * source, so the orthographic drawings always match what ships in the game.
 *
 * Coordinate system (Babylon, left-handed): +X right, +Y up, +Z forward.
 * Creatures face +Z and stand on Y = 0. Anatomical left is −X ("_L" bones),
 * and every "_L" bone/part is mirrored automatically to "_R".
 *
 * This module is dependency-free so node tests can import it directly.
 */

export type Vec3 = [number, number, number];
export type MatSlot = "skin" | "belly" | "dark" | "glow" | "eye" | "claw" | "accent" | "armor" | "suit" | "visor" | "metal";

export type Shape =
  | { kind: "box"; w: number; h: number; d: number }
  | { kind: "sphere"; d: number; seg?: number; slice?: number }
  | { kind: "capsule"; h: number; r: number }
  | { kind: "cylinder"; h: number; top: number; bottom: number; tess?: number }
  | { kind: "torus"; d: number; t: number; tess?: number }
  | { kind: "poly"; type: number; size: number };

/** A primitive. `axis` (start → end) replaces pos/rot for limb segments. */
export type Part = {
  id: string;
  bone: string;
  shape: Shape;
  mat: MatSlot;
  pos: Vec3;
  rot?: Vec3;
  scale?: Vec3;
  axis?: { a: Vec3; b: Vec3 };
};
export type Bone = { id: string; parent: string | null; pivot: Vec3 };
export type Socket = { id: string; bone: string; pos: Vec3 };
export type Category = "ranger" | "support" | "dinosaur" | "structure" | "prop";

export type Blueprint = {
  key: string;
  code: string;
  name: string;
  category: Category;
  role: string;
  palette: Partial<Record<MatSlot, string>>;
  bones: Bone[];
  parts: Part[];
  sockets: Socket[];
  /** Ground-plane collision radius and body height used by gameplay. */
  collider: { radius: number; height: number };
  notes: string[];
};

/** Default emissive strength per material slot (0 = matte, 1 = fully lit). */
export const GLOW: Record<MatSlot, number> = { skin: 0.06, belly: 0.05, dark: 0.03, glow: 0.95, eye: 1, claw: 0.08, accent: 0.45, armor: 0.12, suit: 0.02, visor: 0.95, metal: 0.04 };

const PI = Math.PI;
const v = (x: number, y: number, z: number): Vec3 => [x, y, z];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** Limb segment between two points: a capsule, or a tapered cylinder when `top` is given. */
function seg(id: string, bone: string, a: Vec3, b: Vec3, r: number, mat: MatSlot, top?: number): Part {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const shape: Shape = top === undefined ? { kind: "capsule", h: len + 2 * r, r } : { kind: "cylinder", h: len, bottom: 2 * r, top: 2 * top, tess: 12 };
  return { id, bone, shape, mat, pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], axis: { a, b } };
}
function ell(id: string, bone: string, pos: Vec3, size: Vec3, mat: MatSlot, seg = 18): Part {
  return { id, bone, shape: { kind: "sphere", d: 1, seg }, pos, scale: size, mat };
}
function box(id: string, bone: string, pos: Vec3, w: number, h: number, d: number, mat: MatSlot, rot?: Vec3): Part {
  return { id, bone, shape: { kind: "box", w, h, d }, pos, rot, mat };
}
/** Cone: tip points along +Y before rotation; rot [PI/2,0,0] points it forward (+Z). */
function cone(id: string, bone: string, pos: Vec3, h: number, base: number, mat: MatSlot, rot?: Vec3, tess = 8): Part {
  return { id, bone, shape: { kind: "cylinder", h, top: 0, bottom: base, tess }, pos, rot, mat };
}

const mirrorId = (id: string) => (id.endsWith("_L") ? id.slice(0, -2) + "_R" : id);
/** Duplicate every "_L" bone and part onto the right side (x → −x). */
function mirror(bones: Bone[], parts: Part[], sockets: Socket[] = []) {
  const mb = bones.flatMap(b => (b.id.endsWith("_L") ? [b, { id: mirrorId(b.id), parent: b.parent ? mirrorId(b.parent) : null, pivot: v(-b.pivot[0], b.pivot[1], b.pivot[2]) }] : [b]));
  const mp = parts.flatMap(p => {
    if (!p.bone.endsWith("_L") && !p.id.endsWith("_L")) return [p];
    const flip = (q: Vec3): Vec3 => [-q[0], q[1], q[2]];
    const twin: Part = { ...p, id: mirrorId(p.id) === p.id ? p.id + "_R" : mirrorId(p.id), bone: mirrorId(p.bone), pos: flip(p.pos), rot: p.rot ? [p.rot[0], -p.rot[1], -p.rot[2]] : undefined, axis: p.axis ? { a: flip(p.axis.a), b: flip(p.axis.b) } : undefined };
    return [p, twin];
  });
  return { bones: mb, parts: mp, sockets };
}

/* ───────────────────────────── Bipeds (theropods) ───────────────────────────── */

type BipedSpec = {
  H: number; L: number; W: number; B: number;
  neck: number; neckRise: number; neckR: number;
  head: number; headH: number; headW: number;
  tail: number; tailR: number; tailDrop: number;
  legR: number; arm: number; armR: number; teeth: number;
};
type Rig = { bones: Bone[]; parts: Part[]; sockets: Socket[]; at: Record<string, Vec3> };

function biped(s: BipedSpec): Rig {
  const { H, L, W, B } = s;
  const hips = v(0, H, 0), chest = v(0, H + B * 0.1, L * 0.32);
  const n0 = v(0, H + B * 0.24, L * 0.5), n1 = v(0, n0[1] + s.neckRise, n0[2] + s.neck);
  const jaw = v(0, n1[1] - s.headH * 0.2, n1[2] + s.head * 0.05);
  const t0 = v(0, H + B * 0.02, -L * 0.36);
  const t1 = add(t0, v(0, -s.tailDrop * 0.35, -s.tail * 0.36)), t2 = add(t1, v(0, -s.tailDrop * 0.35, -s.tail * 0.34)), t3 = add(t2, v(0, -s.tailDrop * 0.3, -s.tail * 0.3));
  const hip = v(-W * 0.36, H - B * 0.05, -L * 0.02), knee = v(-W * 0.4, H * 0.52, L * 0.14), ankle = v(-W * 0.4, H * 0.2, -L * 0.1), foot = v(-W * 0.4, 0.06, -L * 0.02);
  const shoulder = v(-W * 0.3, H + B * 0.02, L * 0.5), hand = add(shoulder, v(-0.04, -s.arm * 0.55, s.arm * 0.75));
  const bones: Bone[] = [
    { id: "root", parent: null, pivot: v(0, 0, 0) },
    { id: "hips", parent: "root", pivot: hips },
    { id: "chest", parent: "hips", pivot: chest },
    { id: "neck", parent: "chest", pivot: n0 },
    { id: "head", parent: "neck", pivot: n1 },
    { id: "jaw", parent: "head", pivot: jaw },
    { id: "tail1", parent: "hips", pivot: t0 },
    { id: "tail2", parent: "tail1", pivot: t1 },
    { id: "tail3", parent: "tail2", pivot: t2 },
    { id: "thigh_L", parent: "hips", pivot: hip },
    { id: "shin_L", parent: "thigh_L", pivot: knee },
    { id: "foot_L", parent: "shin_L", pivot: ankle },
    { id: "arm_L", parent: "chest", pivot: shoulder },
  ];
  const parts: Part[] = [
    ell("torso", "hips", v(0, H + B * 0.08, L * 0.08), v(W, B, L), "skin"),
    ell("belly", "hips", v(0, H - B * 0.14, L * 0.14), v(W * 0.76, B * 0.66, L * 0.78), "belly"),
    ell("chestMass", "chest", v(0, H + B * 0.1, L * 0.4), v(W * 0.86, B * 0.92, L * 0.52), "skin"),
    seg("neck", "neck", n0, n1, s.neckR, "skin"),
    ell("throat", "neck", add(n0, v(0, s.neckRise * 0.4 - s.neckR * 0.5, s.neck * 0.45)), v(s.neckR * 1.7, s.neckR * 1.9, s.neck * 0.8), "belly"),
    ell("skull", "head", add(n1, v(0, s.headH * 0.08, s.head * 0.22)), v(s.headW, s.headH, s.head * 0.62), "skin"),
    box("snout", "head", add(n1, v(0, -s.headH * 0.02, s.head * 0.62)), s.headW * 0.68, s.headH * 0.5, s.head * 0.56, "skin"),
    box("brow_L", "head", add(n1, v(-s.headW * 0.3, s.headH * 0.36, s.head * 0.3)), s.headW * 0.26, s.headH * 0.12, s.head * 0.3, "dark", v(0, 0, 0.25)),
    ell("eye_L", "head", add(n1, v(-s.headW * 0.42, s.headH * 0.2, s.head * 0.32)), v(s.headW * 0.2, s.headW * 0.2, s.headW * 0.2), "eye", 10),
    box("lowerJaw", "jaw", add(n1, v(0, -s.headH * 0.36, s.head * 0.5)), s.headW * 0.6, s.headH * 0.2, s.head * 0.84, "dark"),
    seg("tailBase", "tail1", t0, t1, s.tailR, "skin", s.tailR * 0.72),
    seg("tailMid", "tail2", t1, t2, s.tailR * 0.72, "skin", s.tailR * 0.4),
    seg("tailTip", "tail3", t2, t3, s.tailR * 0.4, "skin", s.tailR * 0.08),
    ell("thighMuscle_L", "thigh_L", v(hip[0] * 1.02, H - B * 0.2, L * 0.04), v(s.legR * 2.4, s.legR * 3.6, s.legR * 3), "skin"),
    seg("thigh_L", "thigh_L", hip, knee, s.legR, "skin"),
    seg("shin_L", "shin_L", knee, ankle, s.legR * 0.58, "skin"),
    seg("metatarsal_L", "foot_L", ankle, foot, s.legR * 0.42, "dark"),
    seg("upperArm_L", "arm_L", shoulder, hand, s.armR, "skin"),
  ];
  for (const dx of [-1, 0, 1]) parts.push(cone(`toe${dx + 1}_L`, "foot_L", add(foot, v(dx * s.legR * 0.55, -0.02, s.legR * 0.9)), s.legR * 1.9, s.legR * 0.55, "claw", v(PI / 2, dx * 0.3, 0), 6));
  for (const dx of [-1, 1]) parts.push(cone(`handClaw${dx + 1}_L`, "arm_L", add(hand, v(dx * s.armR, -s.armR, s.armR)), s.armR * 4, s.armR * 1.1, "claw", v(PI * 0.75, 0, 0), 6));
  for (let i = 0; i < s.teeth; i++) {
    const z = s.head * (0.42 + (i / Math.max(1, s.teeth - 1)) * 0.42);
    parts.push(cone(`toothU${i}_L`, "head", add(n1, v(-s.headW * 0.28, -s.headH * 0.27, z)), s.headH * 0.18, s.headH * 0.07, "claw", v(PI, 0, 0), 5));
    parts.push(cone(`toothD${i}_L`, "jaw", add(n1, v(-s.headW * 0.25, -s.headH * 0.24, z - s.head * 0.05)), s.headH * 0.14, s.headH * 0.06, "claw", undefined, 5));
  }
  const m = mirror(bones, parts);
  return { ...m, sockets: [{ id: "mouth", bone: "jaw", pos: add(n1, v(0, -s.headH * 0.2, s.head * 0.9)) }, { id: "eyeline", bone: "head", pos: add(n1, v(0, s.headH * 0.4, s.head * 0.3)) }], at: { hips, chest, n0, n1, jaw, t0, t1, t2, t3, hip, knee, ankle, foot, shoulder, hand } };
}

/* ─────────────────────────── Quadrupeds (ornithischians) ─────────────────────────── */

type QuadSpec = { H: number; L: number; W: number; B: number; legR: number; neck: number; neckR: number; headDrop: number; head: number; headH: number; headW: number; tail: number; tailR: number; tailDrop: number };

function quadruped(s: QuadSpec): Rig {
  const { H, L, W, B } = s;
  const body = v(0, H, 0), n0 = v(0, H + B * 0.02, L * 0.42), n1 = v(0, H - s.headDrop, L * 0.42 + s.neck);
  const jaw = v(0, n1[1] - s.headH * 0.22, n1[2] + s.head * 0.15);
  const t0 = v(0, H + B * 0.02, -L * 0.44), t1 = add(t0, v(0, -s.tailDrop * 0.4, -s.tail * 0.38)), t2 = add(t1, v(0, -s.tailDrop * 0.35, -s.tail * 0.34)), t3 = add(t2, v(0, -s.tailDrop * 0.25, -s.tail * 0.28));
  const bones: Bone[] = [
    { id: "root", parent: null, pivot: v(0, 0, 0) },
    { id: "hips", parent: "root", pivot: body },
    { id: "neck", parent: "hips", pivot: n0 },
    { id: "head", parent: "neck", pivot: n1 },
    { id: "jaw", parent: "head", pivot: jaw },
    { id: "tail1", parent: "hips", pivot: t0 },
    { id: "tail2", parent: "tail1", pivot: t1 },
    { id: "tail3", parent: "tail2", pivot: t2 },
  ];
  const parts: Part[] = [
    ell("torso", "hips", body, v(W, B, L), "skin"),
    ell("belly", "hips", add(body, v(0, -B * 0.2, 0.02)), v(W * 0.86, B * 0.62, L * 0.86), "belly"),
    seg("neck", "neck", n0, n1, s.neckR, "skin"),
    ell("skull", "head", add(n1, v(0, 0, s.head * 0.28)), v(s.headW, s.headH, s.head * 0.72), "skin"),
    ell("eye_L", "head", add(n1, v(-s.headW * 0.44, s.headH * 0.18, s.head * 0.2)), v(s.headW * 0.16, s.headW * 0.16, s.headW * 0.16), "eye", 10),
    box("lowerJaw", "jaw", add(n1, v(0, -s.headH * 0.36, s.head * 0.5)), s.headW * 0.56, s.headH * 0.22, s.head * 0.7, "dark"),
    seg("tailBase", "tail1", t0, t1, s.tailR, "skin", s.tailR * 0.72),
    seg("tailMid", "tail2", t1, t2, s.tailR * 0.72, "skin", s.tailR * 0.45),
    seg("tailTip", "tail3", t2, t3, s.tailR * 0.45, "skin", s.tailR * 0.12),
  ];
  const at: Record<string, Vec3> = { body, n0, n1, jaw, t0, t1, t2, t3 };
  for (const [tag, z] of [["F", L * 0.3], ["B", -L * 0.3]] as const) {
    // Foot point sits one capsule radius up so the rounded end rests inside the pad, not below ground.
    const top = v(-W * 0.36, H - B * 0.18, z), knee = v(-W * 0.4, H * 0.46, z + (tag === "F" ? -0.06 : 0.08)), foot = v(-W * 0.4, s.legR * 0.82 + 0.02, z + 0.04);
    bones.push({ id: `leg${tag}_L`, parent: "hips", pivot: top }, { id: `low${tag}_L`, parent: `leg${tag}_L`, pivot: knee });
    parts.push(
      ell(`haunch${tag}_L`, `leg${tag}_L`, add(top, v(0.02, 0.02, 0)), v(s.legR * 2.6, s.legR * 3.4, s.legR * 3), "skin"),
      seg(`upper${tag}_L`, `leg${tag}_L`, top, knee, s.legR, "skin"),
      seg(`lower${tag}_L`, `low${tag}_L`, knee, foot, s.legR * 0.82, "skin"),
      { id: `pad${tag}_L`, bone: `low${tag}_L`, shape: { kind: "cylinder", h: 0.16, top: s.legR * 2.2, bottom: s.legR * 2.6, tess: 10 }, pos: v(foot[0], 0.08, foot[2] + 0.04), mat: "dark" },
    );
    for (const dx of [-1, 0, 1]) parts.push(cone(`claw${tag}${dx + 1}_L`, `low${tag}_L`, v(foot[0] + dx * s.legR * 0.7, 0.07, foot[2] + s.legR * 1.25), s.legR * 0.7, s.legR * 0.45, "claw", v(PI / 2, 0, 0), 5));
    at[`foot${tag}`] = foot;
  }
  const m = mirror(bones, parts);
  return { ...m, sockets: [{ id: "mouth", bone: "jaw", pos: add(n1, v(0, -s.headH * 0.2, s.head * 0.8)) }, { id: "eyeline", bone: "head", pos: add(n1, v(0, s.headH * 0.5, s.head * 0.2)) }], at };
}

/* ───────────────────────────────── Species ───────────────────────────────── */

function raptor(): Blueprint {
  const r = biped({ H: 1, L: 1.25, W: 0.62, B: 0.62, neck: 0.55, neckRise: 0.38, neckR: 0.14, head: 0.62, headH: 0.32, headW: 0.3, tail: 2.2, tailR: 0.16, tailDrop: 0.22, legR: 0.13, arm: 0.5, armR: 0.055, teeth: 4 });
  const { n0, n1, t3, ankle, hand } = r.at;
  for (let i = 0; i < 6; i++) {
    const k = i / 5, p: Vec3 = [0, n1[1] + 0.2 - k * (n1[1] - n0[1]) * 0.9, n1[2] + 0.12 - k * (n1[2] - n0[2] + 0.35)];
    r.parts.push(cone(`crest${i}`, i < 2 ? "head" : i < 5 ? "neck" : "chest", p, 0.38 - k * 0.12, 0.11, "glow", v(-1.05, 0, 0), 5));
  }
  for (let i = 0; i < 7; i++) r.parts.push(box(`dorsal${i}`, i < 3 ? "chest" : "hips", v(0, 1.36 - Math.abs(i - 3) * 0.015, 0.62 - i * 0.2), 0.05, 0.035, 0.12, "glow"));
  for (const dx of [-1, 0, 1]) r.parts.push(cone(`tailFan${dx + 1}`, "tail3", add(t3, v(dx * 0.1, 0.02, 0.08)), 0.5, 0.16, "glow", v(-PI / 2, dx * 0.4, 0), 4));
  r.parts.push(
    cone("sickleClaw_L", "foot_L", add(ankle, v(0.02, -0.08, 0.2)), 0.24, 0.07, "claw", v(0.5, 0, 0), 6),
    cone("sickleClaw_R", "foot_R", add([-ankle[0], ankle[1], ankle[2]], v(-0.02, -0.08, 0.2)), 0.24, 0.07, "claw", v(0.5, 0, 0), 6),
    box("armFeather_L", "arm_L", add(hand, v(-0.07, 0.12, -0.12)), 0.03, 0.12, 0.36, "glow", v(0.6, 0, 0)),
    box("armFeather_R", "arm_R", add([-hand[0], hand[1], hand[2]], v(0.07, 0.12, -0.12)), 0.03, 0.12, 0.36, "glow", v(0.6, 0, 0)),
  );
  return {
    key: "raptor", code: "DF-BP-03", name: "Feathered Raptor", category: "dinosaur", role: "Fast pack hunter · flanks and pounces",
    palette: { skin: "#2f9e63", belly: "#c4f2cf", dark: "#123a2a", glow: "#61ff9a", eye: "#ffe45b", claw: "#eef4ea" },
    ...r, collider: { radius: 0.8, height: 1.9 },
    notes: ["Luminous feather crest runs skull → shoulders (6 quills)", "Retractable sickle claw on digit II of each foot", "Pack AI flanks 2–5 m wide, then a 0.35 s crouch and 0.55 s pounce leap"],
  };
}

function spitter(): Blueprint {
  const r = biped({ H: 1.15, L: 1.4, W: 0.7, B: 0.7, neck: 0.7, neckRise: 0.5, neckR: 0.15, head: 0.66, headH: 0.34, headW: 0.32, tail: 2.4, tailR: 0.17, tailDrop: 0.3, legR: 0.14, arm: 0.55, armR: 0.06, teeth: 4 });
  const { n1, n0 } = r.at;
  const frill = add(n1, v(0, 0.06, -0.02));
  r.bones.push({ id: "frill", parent: "head", pivot: frill });
  r.parts.push(
    { id: "frillWeb", bone: "frill", shape: { kind: "cylinder", h: 0.025, top: 1.3, bottom: 1.3, tess: 24 }, pos: frill, rot: v(PI / 2 - 0.2, 0, 0), mat: "accent" },
    { id: "frillRim", bone: "frill", shape: { kind: "torus", d: 1.3, t: 0.05, tess: 32 }, pos: frill, rot: v(PI / 2 - 0.2, 0, 0), mat: "glow" },
    box("crestBlade_L", "head", add(n1, v(-0.08, 0.26, 0.25)), 0.03, 0.2, 0.5, "glow", v(-0.15, 0, 0)),
    ell("venomSac", "neck", add(n0, v(0, 0.12, 0.45)), v(0.26, 0.24, 0.34), "glow", 12),
  );
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2;
    r.parts.push({ id: `frillSpine${i}`, bone: "frill", shape: { kind: "cylinder", h: 0.6, top: 0.015, bottom: 0.04, tess: 5 }, pos: add(frill, v(Math.cos(a) * 0.32, Math.sin(a) * 0.31, -Math.sin(a) * 0.06)), rot: v(-0.2, 0, a - PI / 2), mat: "dark" });
  }
  for (let i = 0; i < 6; i++) r.parts.push(ell(`spot${i}_L`, "hips", v(-0.26 + (i % 2) * 0.05, 1.42 - (i % 3) * 0.08, 0.5 - i * 0.22), v(0.12, 0.08, 0.14), "glow", 8));
  const m = mirror(r.bones.filter(b => !b.id.endsWith("_R")), r.parts.filter(p => !p.bone.endsWith("_R") && !p.id.endsWith("_R")));
  return {
    key: "spitter", code: "DF-BP-04", name: "Venom Spitter", category: "dinosaur", role: "Ranged skirmisher · lobs acid globs",
    palette: { skin: "#6e8a1a", belly: "#ecf7b8", dark: "#26300a", glow: "#d9ff3f", eye: "#ff4fba", claw: "#f0f2df", accent: "#ff4fba" },
    ...m, sockets: r.sockets, collider: { radius: 0.9, height: 2.3 },
    notes: ["Collapsible warning frill Ø1.30 m on its own bone (flares before a spit)", "Venom sac and dorsal spots are bioluminescent warning markings", "Keeps 7–12 m from the ranger and strafes"],
  };
}

function rex(): Blueprint {
  const r = biped({ H: 2.1, L: 2.6, W: 1.35, B: 1.35, neck: 0.7, neckRise: 0.32, neckR: 0.44, head: 1.45, headH: 0.78, headW: 0.72, tail: 4, tailR: 0.42, tailDrop: 0.5, legR: 0.34, arm: 0.6, armR: 0.11, teeth: 6 });
  const { n1, hips } = r.at;
  for (let i = 0; i < 9; i++) r.parts.push({ id: `osteoderm${i}`, bone: i < 3 ? "chest" : i < 6 ? "hips" : "tail1", shape: { kind: "poly", type: 1, size: 0.16 - i * 0.008 }, pos: v(0, hips[1] + 0.72 - i * 0.07, 1.25 - i * 0.42), scale: v(0.6, 1.4, 1), mat: "dark" });
  for (let i = 0; i < 4; i++) r.parts.push(box(`scar${i}_L`, "hips", v(-0.62, 2.35 - i * 0.12, 0.6 - i * 0.38), 0.03, 0.06, 0.55, "glow", v(0.5, 0, 0)));
  r.parts.push(box("browHorn_L", "head", add(n1, v(-0.24, 0.42, 0.3)), 0.16, 0.12, 0.3, "glow", v(0.3, 0, 0.3)));
  const m = mirror(r.bones.filter(b => !b.id.endsWith("_R")), r.parts.filter(p => !p.bone.endsWith("_R") && !p.id.endsWith("_R")));
  return {
    key: "rex", code: "DF-BP-07", name: "Crimson Tyrant", category: "dinosaur", role: "Apex boss · bite, roar and seismic stomp",
    palette: { skin: "#7c1a24", belly: "#e9b9a6", dark: "#2a0b10", glow: "#ff4d62", eye: "#ffe45b", claw: "#f3ead6" },
    ...m, sockets: r.sockets, collider: { radius: 1.7, height: 4.2 },
    notes: ["12 upper and 12 lower teeth on a hinged jaw that opens 0.65 rad to bite", "Stomp emits a 15 m shockwave ring — jump to clear it", "Glowing scar lines run along both flanks"],
  };
}

function anky(): Blueprint {
  const r = quadruped({ H: 1.05, L: 2.6, W: 1.6, B: 1, legR: 0.17, neck: 0.35, neckR: 0.26, headDrop: 0.2, head: 0.7, headH: 0.42, headW: 0.6, tail: 2.4, tailR: 0.28, tailDrop: 0.35 });
  const { t3, n1 } = r.at;
  for (let row = -1; row <= 1; row++) for (let i = 0; i < 6; i++) {
    const z = 0.95 - i * 0.38, x = row * 0.42, y = 1.05 + 0.5 * Math.sqrt(Math.max(0, 1 - (z / 1.3) ** 2)) * (1 - Math.abs(row) * 0.32) - 0.02;
    r.parts.push({ id: `plate${row + 1}${i}`, bone: "hips", shape: { kind: "poly", type: 1, size: row ? 0.13 : 0.17 }, pos: v(x, y, z), scale: v(1, 1.5, 1.2), mat: "glow" });
  }
  for (let i = 0; i < 5; i++) r.parts.push(cone(`flankSpike${i}_L`, "hips", v(-0.78, 1.0, 0.85 - i * 0.42), 0.36, 0.14, "dark", v(0, 0, PI / 2 - 0.15)));
  r.parts.push(
    ell("tailClub", "tail3", add(t3, v(0, 0, 0.05)), v(0.72, 0.42, 0.82), "dark", 12),
    { id: "clubKnob_L", bone: "tail3", shape: { kind: "poly", type: 1, size: 0.14 }, pos: add(t3, v(-0.34, 0.05, 0.05)), mat: "glow" },
    box("headPlate", "head", add(n1, v(0, 0.2, 0.28)), 0.5, 0.06, 0.5, "dark"),
    cone("cheekHorn_L", "head", add(n1, v(-0.28, 0, 0.05)), 0.24, 0.1, "dark", v(0, 0, PI / 2 + 0.4)),
  );
  r.bones.push();
  const m = mirror(r.bones.filter(b => !b.id.endsWith("_R")), r.parts.filter(p => !p.bone.endsWith("_R") && !p.id.endsWith("_R")));
  return {
    key: "anky", code: "DF-BP-05", name: "Ironhide Anky", category: "dinosaur", role: "Armoured tank · spinning tail-club sweep",
    palette: { skin: "#9b6a35", belly: "#ead0a6", dark: "#3b2614", glow: "#ffb238", eye: "#35e8ff", claw: "#efe5d2" },
    ...m, sockets: r.sockets, collider: { radius: 1.3, height: 1.8 },
    notes: ["18 glowing osteoderm plates in three rows", "Tail club Ø0.82 m — 360° sweep hits within 4.4 m", "Slow but takes 30 % less damage from the front"],
  };
}

function trike(): Blueprint {
  const r = quadruped({ H: 1.45, L: 2.9, W: 1.55, B: 1.3, legR: 0.24, neck: 0.4, neckR: 0.36, headDrop: 0.25, head: 1.35, headH: 0.7, headW: 0.78, tail: 1.6, tailR: 0.3, tailDrop: 0.4 });
  const { n1 } = r.at;
  const frill = add(n1, v(0, 0.42, -0.12));
  r.bones.push({ id: "frill", parent: "head", pivot: frill });
  r.parts.push(
    { id: "frillShield", bone: "frill", shape: { kind: "sphere", d: 2.2, seg: 20 }, pos: frill, rot: v(-0.5, 0, 0), scale: v(1, 1, 0.12), mat: "accent" },
    { id: "frillRim", bone: "frill", shape: { kind: "torus", d: 2.1, t: 0.07, tess: 36 }, pos: frill, rot: v(PI / 2 - 0.5, 0, 0), mat: "glow" },
    cone("browHorn_L", "head", add(n1, v(-0.24, 0.32, 0.45)), 1.15, 0.2, "claw", v(PI / 2 - 0.35, 0.08, 0)),
    cone("noseHorn", "head", add(n1, v(0, 0.12, 1.05)), 0.45, 0.16, "claw", v(PI / 2 - 0.7, 0, 0)),
    cone("beak", "head", add(n1, v(0, -0.12, 1.12)), 0.5, 0.36, "dark", v(PI / 2 + 0.2, 0, 0), 6),
  );
  for (let i = 0; i < 10; i++) {
    const a = (i / 9) * PI * 1.1 - PI * 0.05;
    r.parts.push({ id: `frillKnob${i}`, bone: "frill", shape: { kind: "poly", type: 1, size: 0.1 }, pos: add(frill, v(Math.cos(a) * 1.08, Math.sin(a) * 1.08 * Math.cos(0.5), -Math.sin(a) * 1.08 * Math.sin(0.5))), mat: "dark" });
  }
  const m = mirror(r.bones.filter(b => !b.id.endsWith("_R")), r.parts.filter(p => !p.bone.endsWith("_R") && !p.id.endsWith("_R")));
  return {
    key: "trike", code: "DF-BP-06", name: "Storm Triceratops", category: "dinosaur", role: "Charger · telegraphed horn rush",
    palette: { skin: "#2a6f8f", belly: "#c4e9f4", dark: "#12303d", glow: "#35e8ff", eye: "#ffb238", claw: "#ece6d4", accent: "#1fb6e0" },
    ...m, sockets: r.sockets, collider: { radius: 1.4, height: 2.6 },
    notes: ["Shield frill Ø2.20 m tilted 29° back, ringed by 10 bone knobs", "Brow horns 1.15 m — 0.85 s pawing wind-up before a 13 m/s charge", "Stunned and takes ×1.5 damage after a missed charge"],
  };
}

/* ───────────────────────────────── Ranger & drone ───────────────────────────────── */

function ranger(): Blueprint {
  const bones: Bone[] = [
    { id: "root", parent: null, pivot: v(0, 0, 0) },
    { id: "pelvis", parent: "root", pivot: v(0, 0.98, 0) },
    { id: "spine", parent: "pelvis", pivot: v(0, 1.1, 0) },
    { id: "chest", parent: "spine", pivot: v(0, 1.34, 0) },
    { id: "head", parent: "chest", pivot: v(0, 1.6, 0.01) },
    { id: "rifle", parent: "chest", pivot: v(0.15, 1.3, 0.2) },
    { id: "armR", parent: "chest", pivot: v(0.25, 1.5, 0) },
    { id: "armL", parent: "chest", pivot: v(-0.25, 1.5, 0) },
    { id: "thigh_L", parent: "pelvis", pivot: v(-0.11, 0.94, 0) },
    { id: "shin_L", parent: "thigh_L", pivot: v(-0.12, 0.52, 0.03) },
  ];
  const parts: Part[] = [
    box("pelvis", "pelvis", v(0, 0.97, 0), 0.36, 0.2, 0.24, "suit"),
    box("belt", "pelvis", v(0, 1.06, 0), 0.39, 0.06, 0.27, "armor"),
    box("beltLight", "pelvis", v(0, 1.06, 0.14), 0.1, 0.035, 0.02, "glow"),
    ell("abdomen", "spine", v(0, 1.2, 0), v(0.34, 0.3, 0.23), "suit"),
    box("chestPlate", "chest", v(0, 1.4, 0.015), 0.48, 0.36, 0.3, "armor"),
    box("collar", "chest", v(0, 1.57, 0), 0.32, 0.06, 0.24, "metal"),
    box("emblem", "chest", v(0, 1.45, 0.17), 0.12, 0.05, 0.02, "glow"),
    box("backpack", "chest", v(0, 1.38, -0.24), 0.36, 0.42, 0.18, "metal"),
    { id: "cell_L", bone: "chest", shape: { kind: "cylinder", h: 0.32, top: 0.08, bottom: 0.08, tess: 10 }, pos: v(-0.09, 1.38, -0.35), mat: "glow" },
    { id: "antenna", bone: "chest", shape: { kind: "cylinder", h: 0.45, top: 0.01, bottom: 0.025, tess: 6 }, pos: v(-0.13, 1.78, -0.28), mat: "metal" },
    ell("antennaTip", "chest", v(-0.13, 2.01, -0.28), v(0.05, 0.05, 0.05), "glow", 8),
    ell("pauldron_L", "chest", v(-0.29, 1.55, 0), v(0.2, 0.14, 0.23), "armor"),
    { id: "neck", bone: "chest", shape: { kind: "cylinder", h: 0.1, top: 0.12, bottom: 0.14, tess: 10 }, pos: v(0, 1.62, 0), mat: "suit" },
    ell("helmet", "head", v(0, 1.75, 0), v(0.3, 0.32, 0.31), "metal"),
    ell("visor", "head", v(0, 1.75, 0.085), v(0.26, 0.12, 0.17), "visor"),
    box("helmetFin", "head", v(0, 1.92, -0.02), 0.035, 0.05, 0.26, "glow"),
    { id: "earPiece_L", bone: "head", shape: { kind: "cylinder", h: 0.05, top: 0.1, bottom: 0.1, tess: 10 }, pos: v(-0.155, 1.74, 0), rot: v(0, 0, PI / 2), mat: "armor" },
    // Right arm: grips the rifle stock.
    seg("upperArmR", "armR", v(0.25, 1.5, 0), v(0.3, 1.24, -0.02), 0.065, "suit"),
    seg("foreArmR", "armR", v(0.3, 1.24, -0.02), v(0.18, 1.25, 0.2), 0.06, "armor"),
    { id: "gauntletR", bone: "armR", shape: { kind: "torus", d: 0.13, t: 0.025, tess: 14 }, pos: v(0.21, 1.25, 0.15), rot: v(PI / 2, -0.5, 0), mat: "glow" },
    ell("handR", "armR", v(0.17, 1.25, 0.22), v(0.09, 0.09, 0.1), "suit", 8),
    // Left arm: supports the barrel shroud.
    seg("upperArmL", "armL", v(-0.25, 1.5, 0), v(-0.14, 1.26, 0.22), 0.065, "suit"),
    seg("foreArmL", "armL", v(-0.14, 1.26, 0.22), v(0.1, 1.28, 0.52), 0.06, "armor"),
    { id: "gauntletL", bone: "armL", shape: { kind: "torus", d: 0.13, t: 0.025, tess: 14 }, pos: v(0.05, 1.28, 0.46), rot: v(PI / 2, 0.9, 0), mat: "glow" },
    ell("handL", "armL", v(0.11, 1.28, 0.53), v(0.09, 0.09, 0.1), "suit", 8),
    // Arc rifle.
    box("rifleBody", "rifle", v(0.15, 1.3, 0.4), 0.1, 0.14, 0.62, "metal"),
    box("rifleStock", "rifle", v(0.15, 1.27, 0.04), 0.07, 0.12, 0.2, "armor"),
    box("rifleMag", "rifle", v(0.15, 1.19, 0.35), 0.06, 0.12, 0.1, "glow"),
    { id: "rifleScope", bone: "rifle", shape: { kind: "cylinder", h: 0.22, top: 0.05, bottom: 0.05, tess: 10 }, pos: v(0.15, 1.41, 0.36), rot: v(PI / 2, 0, 0), mat: "armor" },
    { id: "rifleBarrel", bone: "rifle", shape: { kind: "cylinder", h: 0.5, top: 0.045, bottom: 0.055, tess: 10 }, pos: v(0.15, 1.31, 0.96), rot: v(PI / 2, 0, 0), mat: "metal" },
    // Thighs, shins and flux boots (mirrored).
    seg("thigh_L", "thigh_L", v(-0.11, 0.94, 0), v(-0.12, 0.52, 0.03), 0.085, "suit"),
    box("thighPlate_L", "thigh_L", v(-0.12, 0.76, 0.07), 0.13, 0.22, 0.06, "armor"),
    ell("kneePad_L", "shin_L", v(-0.12, 0.52, 0.08), v(0.12, 0.12, 0.1), "armor", 10),
    seg("shin_L", "shin_L", v(-0.12, 0.52, 0.03), v(-0.12, 0.13, 0), 0.07, "armor"),
    box("boot_L", "shin_L", v(-0.12, 0.07, 0.04), 0.14, 0.13, 0.29, "metal"),
    box("fluxStrip_L", "shin_L", v(-0.195, 0.07, 0.03), 0.015, 0.035, 0.22, "glow"),
  ];
  for (let i = 0; i < 3; i++) parts.push({ id: `coil${i}`, bone: "rifle", shape: { kind: "torus", d: 0.1, t: 0.022, tess: 14 }, pos: v(0.15, 1.31, 0.82 + i * 0.1), rot: v(PI / 2, 0, 0), mat: "glow" });
  const m = mirror(bones, parts);
  return {
    key: "ranger", code: "DF-BP-01", name: "Frontier Ranger", category: "ranger", role: "Player · Arc Rifle, Flux Boots, Titan Weave",
    palette: { suit: "#0c1519", armor: "#0ea5b5", metal: "#2a3a40", glow: "#35e8ff", visor: "#ffa52e" },
    ...m, sockets: [{ id: "muzzle", bone: "rifle", pos: v(0.15, 1.31, 1.23) }, { id: "eyeline", bone: "head", pos: v(0, 1.76, 0.1) }], collider: { radius: 0.45, height: 1.95 },
    notes: ["1.95 m to the helmet fin, 2.03 m to the antenna tip", "Arc rifle on its own bone so the torso can aim independently of the legs", "Muzzle socket at +1.23 m forward — origin of every bolt"],
  };
}

function drone(): Blueprint {
  const bones: Bone[] = [{ id: "root", parent: null, pivot: v(0, 0, 0) }, { id: "ring", parent: "root", pivot: v(0, 0, 0) }];
  const parts: Part[] = [
    ell("hull", "root", v(0, 0, 0), v(0.34, 0.3, 0.38), "metal"),
    ell("lens", "root", v(0, 0, 0.16), v(0.15, 0.15, 0.1), "glow", 12),
    box("emitter", "root", v(0, -0.12, 0.12), 0.06, 0.05, 0.16, "armor"),
    { id: "halo", bone: "ring", shape: { kind: "torus", d: 0.62, t: 0.035, tess: 32 }, pos: v(0, 0, 0), mat: "glow" },
  ];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + PI / 4, x = Math.cos(a) * 0.36, z = Math.sin(a) * 0.36;
    parts.push(
      box(`arm${i}`, "ring", v(x / 2, 0.02, z / 2), 0.05, 0.03, 0.36, "armor", v(0, PI / 2 - a, 0)),
      { id: `rotor${i}`, bone: "ring", shape: { kind: "cylinder", h: 0.02, top: 0.2, bottom: 0.2, tess: 16 }, pos: v(x, 0.05, z), mat: "accent" },
    );
  }
  return {
    key: "drone", code: "DF-BP-02", name: "Pulse Drone", category: "support", role: "Autonomous support turret · orbits the ranger",
    palette: { metal: "#26343a", armor: "#0ea5b5", glow: "#ff4fba", accent: "#ff9be0" },
    bones, parts, sockets: [{ id: "muzzle", bone: "root", pos: v(0, -0.12, 0.22) }], collider: { radius: 0.4, height: 0.3 },
    notes: ["Hovers 2.4 m up, 1.1 m off the ranger's left shoulder", "Ring bone spins independently of the hull", "Fire rate scales with Pulse Drone upgrades"],
  };
}

/* ─────────────────────────────── Structures & props ─────────────────────────────── */

function outpost(): Blueprint {
  const bones: Bone[] = [{ id: "root", parent: null, pivot: v(0, 0, 0) }, { id: "beacon", parent: "root", pivot: v(0, 6.2, 0) }];
  const parts: Part[] = [
    { id: "pad", bone: "root", shape: { kind: "cylinder", h: 0.35, top: 7, bottom: 7.4, tess: 6 }, pos: v(0, 0.17, 0), mat: "metal" },
    { id: "padRing", bone: "root", shape: { kind: "torus", d: 6.4, t: 0.08, tess: 6 }, pos: v(0, 0.36, 0), rot: v(0, PI / 6, 0), mat: "glow" },
    { id: "dome", bone: "root", shape: { kind: "sphere", d: 3.6, seg: 24, slice: 0.5 }, pos: v(-1.2, 0.35, -0.8), mat: "accent" },
    box("hab", "root", v(1.5, 1.2, -0.6), 2, 1.7, 2.6, "armor"),
    box("habWindow", "root", v(1.5, 1.45, 0.71), 1.4, 0.3, 0.04, "glow"),
    box("door", "root", v(0.49, 0.95, -0.6), 0.04, 1.2, 0.8, "dark"),
    { id: "mast", bone: "root", shape: { kind: "cylinder", h: 5.8, top: 0.18, bottom: 0.36, tess: 8 }, pos: v(0, 3.25, 1.8), mat: "metal" },
    { id: "beaconRing", bone: "beacon", shape: { kind: "torus", d: 1.4, t: 0.09, tess: 32 }, pos: v(0, 6.2, 1.8), mat: "glow" },
    ell("beaconCore", "beacon", v(0, 6.2, 1.8), v(0.5, 0.5, 0.5), "glow", 14),
    box("dish", "root", v(0.8, 4.4, 1.8), 1.2, 0.08, 1.2, "armor", v(0.5, 0, 0.3)),
  ];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2;
    parts.push({ id: `pylon${i}`, bone: "root", shape: { kind: "cylinder", h: 1.6, top: 0.12, bottom: 0.2, tess: 6 }, pos: v(Math.cos(a) * 3.3, 1.15, Math.sin(a) * 3.3), mat: "metal" }, ell(`pylonLight${i}`, "root", v(Math.cos(a) * 3.3, 2.02, Math.sin(a) * 3.3), v(0.18, 0.18, 0.18), "glow", 8));
  }
  return {
    key: "outpost", code: "DF-BP-08", name: "Frontier Outpost", category: "structure", role: "Ranger drop zone · arena landmark",
    palette: { metal: "#25343a", armor: "#334a52", accent: "#2fc4d6", glow: "#61ff9a", dark: "#0b1416" },
    bones, parts, sockets: [{ id: "beacon", bone: "beacon", pos: v(0, 6.2, 1.8) }], collider: { radius: 3.7, height: 7 },
    notes: ["Hexagonal landing pad 7.4 m across the flats", "Beacon ring spins continuously above the drop zone", "Stands 25 m ahead of the arena centre in every sector"],
  };
}

function fernTree(): Blueprint {
  const parts: Part[] = [
    seg("trunkLow", "root", v(0, 0, 0), v(0.12, 1.8, 0.05), 0.2, "dark", 0.15),
    seg("trunkHigh", "root", v(0.12, 1.8, 0.05), v(0.05, 3.6, -0.05), 0.15, "dark", 0.11),
    ell("crown", "root", v(0.05, 3.7, -0.05), v(0.5, 0.42, 0.5), "skin", 12),
  ];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * PI * 2, dx = Math.sin(a), dz = Math.cos(a);
    parts.push({ id: `frond${i}`, bone: "root", shape: { kind: "sphere", d: 1, seg: 10 }, pos: v(0.05 + dx * 1.15, 3.45, -0.05 + dz * 1.15), rot: v(0.42, a, 0), scale: v(0.55, 0.08, 2.5), mat: i % 2 ? "skin" : "accent" });
  }
  for (let i = 0; i < 3; i++) parts.push(ell(`seedPod${i}`, "root", v(Math.cos(i * 2.1) * 0.3, 3.45, Math.sin(i * 2.1) * 0.3), v(0.16, 0.22, 0.16), "glow", 8));
  return {
    key: "fern", code: "DF-BP-09", name: "Fern Palm", category: "prop", role: "Cover and canopy · biome-tinted",
    palette: { dark: "#3a2414", skin: "#1f7a46", accent: "#2b9a5a", glow: "#9dffcf" },
    bones: [{ id: "root", parent: null, pivot: v(0, 0, 0) }], parts, sockets: [], collider: { radius: 0.45, height: 4 },
    notes: ["Seven drooping fronds 2.5 m long", "Bioluminescent seed pods light the canopy at night", "Thin-instanced: one draw call per material per biome"],
  };
}

function crystal(): Blueprint {
  const parts: Part[] = [];
  const spikes: [number, number, number, number, number][] = [[0, 0, 2.2, 0, 0], [0.45, 0.2, 1.4, 0.35, -0.2], [-0.4, 0.25, 1.6, -0.3, 0.15], [0.1, -0.45, 1.1, 0.1, -0.4], [-0.2, -0.3, 0.8, -0.5, -0.3]];
  spikes.forEach(([x, z, h, rz, rx], i) => parts.push({ id: `shard${i}`, bone: "root", shape: { kind: "cylinder", h, top: 0, bottom: 0.38 * (h / 2.2) + 0.12, tess: 6 }, pos: v(x + Math.sin(-rz) * h * 0.45, h * 0.45, z + Math.sin(rx) * h * 0.45), rot: v(rx, 0, rz), mat: "glow" }));
  parts.push({ id: "base", bone: "root", shape: { kind: "poly", type: 2, size: 0.55 }, pos: v(0, 0.12, 0), scale: v(1.3, 0.5, 1.3), mat: "dark" });
  return {
    key: "crystal", code: "DF-BP-10", name: "Energy Crystal", category: "prop", role: "Glowing cover cluster · biome-tinted",
    palette: { glow: "#4ef0ff", dark: "#1a2a33" },
    bones: [{ id: "root", parent: null, pivot: v(0, 0, 0) }], parts, sockets: [], collider: { radius: 0.8, height: 2.2 },
    notes: ["Five hexagonal shards, tallest 2.2 m", "Emissive — feeds the bloom pass", "Tint follows each biome's crystal colour"],
  };
}

export const BLUEPRINTS: Blueprint[] = [ranger(), drone(), raptor(), spitter(), anky(), trike(), rex(), outpost(), fernTree(), crystal()];
export const BLUEPRINT = Object.fromEntries(BLUEPRINTS.map(b => [b.key, b])) as Record<string, Blueprint>;

/* ─────────────────────────────── Measurement helpers ─────────────────────────────── */

export type Bounds = { min: Vec3; max: Vec3; size: Vec3 };

/** Rotate a point by Babylon's Euler order (roll Z, then pitch X, then yaw Y). */
function rotate(p: Vec3, r: Vec3): Vec3 {
  let [x, y, z] = p;
  let c = Math.cos(r[2]), s = Math.sin(r[2]);
  [x, y] = [x * c - y * s, x * s + y * c];
  c = Math.cos(r[0]); s = Math.sin(r[0]);
  [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(r[1]); s = Math.sin(r[1]);
  [x, z] = [x * c + z * s, -x * s + z * c];
  return [x, y, z];
}
/** Half-extents of a rotated local box, from its eight rotated corners. */
function rotatedHalf(h: Vec3, r: Vec3): Vec3 {
  const out: Vec3 = [0, 0, 0];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const q = rotate([h[0] * sx, h[1] * sy, h[2] * sz], r);
    for (let i = 0; i < 3; i++) out[i] = Math.max(out[i], Math.abs(q[i]));
  }
  return out;
}

/** Axis-aligned extents of a single part (a box around its rotated local bounds). */
export function partExtent(p: Part): Bounds {
  const sh = p.shape, sc = p.scale || [1, 1, 1];
  let half: Vec3;
  if (p.axis) {
    const r = sh.kind === "capsule" ? sh.r : sh.kind === "cylinder" ? Math.max(sh.top, sh.bottom) / 2 : 0;
    const min: Vec3 = [0, 1, 2].map(i => Math.min(p.axis!.a[i], p.axis!.b[i]) - r) as Vec3, max: Vec3 = [0, 1, 2].map(i => Math.max(p.axis!.a[i], p.axis!.b[i]) + r) as Vec3;
    return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
  }
  switch (sh.kind) {
    case "box": half = [sh.w / 2, sh.h / 2, sh.d / 2]; break;
    case "sphere": half = [sh.d / 2, sh.d / 2, sh.d / 2]; break;
    case "capsule": half = [sh.r, sh.h / 2, sh.r]; break;
    case "cylinder": { const r = Math.max(sh.top, sh.bottom) / 2; half = [r, sh.h / 2, r]; break; }
    case "torus": half = [sh.d / 2 + sh.t / 2, sh.t / 2, sh.d / 2 + sh.t / 2]; break;
    case "poly": half = [sh.size, sh.size, sh.size]; break;
  }
  half = [half[0] * sc[0], half[1] * sc[1], half[2] * sc[2]];
  if (p.rot && p.rot.some(a => Math.abs(a) > 1e-3)) half = rotatedHalf(half, p.rot);
  const min: Vec3 = [p.pos[0] - half[0], p.pos[1] - half[1], p.pos[2] - half[2]], max: Vec3 = [p.pos[0] + half[0], p.pos[1] + half[1], p.pos[2] + half[2]];
  // A sliced sphere keeps only its top `slice` fraction (e.g. 0.5 = dome).
  if (sh.kind === "sphere" && sh.slice !== undefined && sh.slice < 1 && !p.rot) min[1] = p.pos[1] + half[1] * (1 - 2 * sh.slice);
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

export function approxBounds(bp: Blueprint): Bounds {
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of bp.parts) {
    const e = partExtent(p);
    for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], e.min[i]); max[i] = Math.max(max[i], e.max[i]); }
  }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}
