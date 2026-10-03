// Builds an animal from its blueprint: skeleton + skinned parts (body loft,
// legs, hooves, ears, eyes, tail, headgear, appendages) painted with the coat.
// Pure data (no three.js) so Node tests can verify the model against the
// blueprint's stated overall dimensions.

import { mulberry32, rngRange } from "../core/rng.ts";
import { smoothstep } from "../core/math.ts";
import type { AnimalBlueprint, AnimalVariant, AntlerSpec, BoneSpec, CoatSpec, LegSpec, RGB, V3 } from "../blueprints/types.ts";
import { ZONE_IDS } from "../blueprints/types.ts";
import { computeNormals, ellipsoid, loft, mirrorPart, newPart, rotate, sweep, tube, type GeoPart } from "./geometry.ts";
import { paintCoat, paintSolid, srgbToLinear } from "./paint.ts";

export interface BuildQuality { segs: number; sub: number; legSegs: number; legSamples: number; hornSegs: number; hornSamples: number }
export const QUALITY_HIGH: BuildQuality = { segs: 26, sub: 4, legSegs: 12, legSamples: 28, hornSegs: 8, hornSamples: 10 };
export const QUALITY_LOW: BuildQuality = { segs: 12, sub: 2, legSegs: 6, legSamples: 10, hornSegs: 5, hornSamples: 5 };

export interface AnimalBuild {
  parts: GeoPart[];
  bones: BoneSpec[];
  boneIndex: Map<string, number>;
  bbox: { min: V3; max: V3 };
  /** uniform scale to apply to the finished object (sex / individual) */
  scale: number;
  headgearScore: number;
}

const LEG_SUFFIX = { L: "L", R: "R" } as const;

export function legBoneNames(leg: LegSpec, side: "L" | "R"): string[] { return leg.bones.map(b => b + LEG_SUFFIX[side]); }

/** Full bone list (spine/head/tail/ears from the blueprint + both sides of every leg). */
export function skeletonSpec(bp: AnimalBlueprint): BoneSpec[] {
  const out: BoneSpec[] = bp.bones.map(b => ({ ...b, p: [...b.p] as V3 }));
  for (const leg of bp.legs) {
    for (const side of ["L", "R"] as const) {
      const names = legBoneNames(leg, side);
      names.forEach((n, i) => {
        const j = leg.joints[i].p;
        out.push({ name: n, parent: i === 0 ? leg.parent : names[i - 1], p: [side === "L" ? j[0] : -j[0], j[1], j[2]] });
      });
    }
  }
  return out;
}

function antlerTransform(a: AntlerSpec, scale: number) {
  return (p: V3): V3 => {
    let v: V3 = [p[0] * scale, p[1] * scale, p[2] * scale];
    v = rotate(v, [1, 0, 0], -a.rake);
    v = rotate(v, [0, 0, 1], -a.splay);
    return [v[0] + a.base[0], v[1] + a.base[1], v[2] + a.base[2]];
  };
}

export function buildAnimalParts(bp: AnimalBlueprint, v: AnimalVariant, q: BuildQuality = QUALITY_HIGH): AnimalBuild {
  const rnd = mulberry32(v.seed * 7919 + 13);
  const bones = skeletonSpec(bp);
  const boneIndex = new Map<string, number>();
  bones.forEach((b, i) => boneIndex.set(b.name, i));
  const bi = (n: string) => {
    const i = boneIndex.get(n);
    if (i === undefined) throw new Error(`${bp.id}: unknown bone ${n}`);
    return i;
  };
  const zid = (z: keyof typeof ZONE_IDS) => ZONE_IDS[z];
  const female = v.sex === "female";
  const coat0: CoatSpec = female && bp.coatFemale ? { ...bp.coat, ...bp.coatFemale, rules: bp.coatFemale.rules ?? bp.coat.rules } : bp.coat;
  const coat: CoatSpec = { ...coat0, rules: [...coat0.rules, { kind: "ellipsoid", center: bp.nose.p, radii: bp.nose.r, color: bp.nose.color, soft: 0.3, zones: ["head"] }] };
  const tint = rngRange(rnd, 0.9, 1.08);
  const parts: GeoPart[] = [];

  // ---- body
  const body = loft(bp.body, q.segs, q.sub, bi, zid, 0, "body");
  computeNormals(body); paintCoat(body, coat, v.seed, tint); parts.push(body);

  // ---- tail
  const tail = loft(bp.tail.keys, Math.max(6, Math.round(q.segs * 0.45)), Math.max(2, q.sub - 1), bi, zid, 0, "tail");
  computeNormals(tail); paintCoat(tail, coat, v.seed + 1, tint);
  if (bp.tail.color) recolorAlong(tail, bp.tail.color, bp.tail.tip ?? bp.tail.color, bp.tail.keys[0].p, bp.tail.keys[bp.tail.keys.length - 1].p);
  parts.push(tail);

  // ---- appendages (beards, crests, dewlaps)
  for (const ap of bp.appendages ?? []) {
    const p = loft(ap.keys, ap.segs ?? Math.max(8, Math.round(q.segs * 0.6)), Math.max(2, q.sub - 1), bi, zid, 0, ap.name);
    computeNormals(p);
    if (ap.color) paintSolid(p, ap.color); else paintCoat(p, coat, v.seed + 3, tint);
    parts.push(p);
  }

  // ---- legs + hooves
  for (const leg of bp.legs) {
    const names = legBoneNames(leg, "L");
    const nSeg = leg.joints.length - 1;
    const pts = leg.joints.map(j => j.p);
    const rs = leg.joints.map(j => j.r);
    const rzs = leg.joints.map(j => j.rz ?? j.r * 0.8);
    const radAt = (arr: number[], t: number) => {
      const u = t * nSeg, i = Math.min(nSeg - 1, Math.floor(u)), f = u - i;
      const s = f * f * (3 - 2 * f);
      return arr[i] + (arr[i + 1] - arr[i]) * s;
    };
    const skin = (t: number): [number, number][] => {
      const u = t * nSeg, k = Math.min(nSeg - 1, Math.floor(u)), f = u - k;
      if (k === 0 && f < 0.35) { const w = 0.5 + 0.5 * (f / 0.35); return [[bi(names[0]), w], [bi(leg.parent), 1 - w]]; }
      if (f < 0.15 && k > 0) { const w = 0.5 + 0.5 * (f / 0.15); return [[bi(names[k]), w], [bi(names[k - 1]), 1 - w]]; }
      if (f > 0.85 && k < nSeg - 1) { const w = 0.5 * ((f - 0.85) / 0.15); return [[bi(names[k]), 1 - w], [bi(names[k + 1]), w]]; }
      return [[bi(names[k]), 1]];
    };
    const legPart = sweep(pts, {
      segs: q.legSegs, samples: q.legSamples, skin, zone: zid("leg"), kind: "leg", up: [0, 0, 1], closeStart: true, closeEnd: true,
      section: (t, phi) => [Math.cos(phi) * radAt(rzs, t), Math.sin(phi) * radAt(rs, t)],
    });
    computeNormals(legPart); paintCoat(legPart, coat, v.seed + 2, tint);
    parts.push(legPart, mirrorPart(legPart, i => remapSide(bones, i, boneIndex)));

    // hoof (rigid to the last bone)
    const hoof = buildHoof(leg, bi(names[nSeg - 1]), zid("leg"), q);
    parts.push(hoof, mirrorPart(hoof, i => remapSide(bones, i, boneIndex)));
  }

  // ---- ears
  {
    const e = bp.ears;
    const d = normalize(e.dir);
    const tip: V3 = [e.base[0] + d[0] * e.len, e.base[1] + d[1] * e.len, e.base[2] + d[2] * e.len];
    const ear = sweep([e.base, tip], {
      segs: Math.max(8, q.legSegs), samples: Math.max(6, Math.round(q.legSamples / 3)), zone: zid("head"), kind: "ear",
      skin: () => [[bi("earL"), 1]], up: [0, 0, 1],
      section: (t, phi) => {
        const hw = (e.wid / 2) * Math.pow(Math.sin(Math.PI * (0.12 + 0.88 * t)), 0.75);
        const th = 0.007 * (1 - 0.75 * t) + 0.002;
        const cup = e.cup * Math.sin(Math.PI * Math.min(1, t * 1.1)) * (hw / (e.wid / 2 + 1e-6));
        const s = Math.sin(phi);
        return [Math.cos(phi) * hw, th * s - cup * s * s];
      },
    });
    computeNormals(ear);
    // inner face (facing forward/out) lighter
    ear.col = new Array(ear.pos.length);
    for (let i = 0; i < ear.pos.length; i += 3) {
      const facing = ear.nrm[i + 2] * 0.85 + ear.nrm[i] * 0.35;
      const tt = Math.min(1, Math.max(0, ((ear.pos[i] - e.base[0]) * d[0] + (ear.pos[i + 1] - e.base[1]) * d[1] + (ear.pos[i + 2] - e.base[2]) * d[2]) / e.len));
      const m = smoothstep(-0.1, 0.45, facing) * smoothstep(0.02, 0.2, tt);
      let c: RGB = [e.outer[0] + (e.inner[0] - e.outer[0]) * m, e.outer[1] + (e.inner[1] - e.outer[1]) * m, e.outer[2] + (e.inner[2] - e.outer[2]) * m];
      if (e.tip) { const k = smoothstep(0.78, 0.98, tt); c = [c[0] + (e.tip[0] - c[0]) * k, c[1] + (e.tip[1] - c[1]) * k, c[2] + (e.tip[2] - c[2]) * k]; }
      ear.col[i] = srgbToLinear(c[0]); ear.col[i + 1] = srgbToLinear(c[1]); ear.col[i + 2] = srgbToLinear(c[2]);
    }
    parts.push(ear, mirrorPart(ear, i => remapSide(bones, i, boneIndex)));
  }

  // ---- eyes
  {
    const eye = ellipsoid(bp.eyes.p, [bp.eyes.r * 0.7, bp.eyes.r, bp.eyes.r], 10, 6, [[bi("head"), 1]], zid("head"), "eye");
    computeNormals(eye); paintSolid(eye, [0.025, 0.02, 0.018]);
    parts.push(eye, mirrorPart(eye, i => remapSide(bones, i, boneIndex)));
  }

  // ---- headgear
  let headgearScore = 0;
  const gear = female ? (bp.femaleHasHeadgear ? (bp.headgearFemale ?? bp.headgear) : []) : bp.headgear;
  const ageScale = female ? 1 : 0.62 + 0.38 * v.age;
  for (const a of gear) {
    const tf = antlerTransform(a, ageScale);
    for (const ts of a.tubes) {
      if (ts.minAge !== undefined && !female && v.age < ts.minAge) continue;
      const jitter = 0.04 * (rnd() - 0.5);
      const pts = ts.pts.map(p => tf([p[0] * (1 + jitter), p[1] * (1 + jitter * 0.5), p[2]]));
      const len = polyLength(pts);
      headgearScore += len * 100;
      const r0 = ts.r0 * (0.75 + 0.25 * ageScale), r1 = ts.r1;
      const burr = ts.burr ?? 0;
      const ridge = ts.ridge ?? 0, freq = ts.ridgeFreq ?? 0;
      const t = tube(pts, (t) => {
        let r = r0 + (r1 - r0) * Math.pow(t, 0.9);
        if (burr > 0 && t < 0.06) r *= 1 + burr * (1 - t / 0.06);
        if (ridge > 0) r *= 1 + ridge * Math.max(0, Math.sin(t * freq * Math.PI * 2));
        return r;
      }, q.hornSegs, Math.max(4, Math.round(q.hornSamples * Math.min(2.5, len / 0.35))), () => [[bi(a.bone), 1]], a.kind === "tusk" ? zid("head") : zid("antler"), a.kind, ts.flat ?? 1, [0, 0, 1]);
      computeNormals(t);
      const rings = t.pos.length / 3;
      const per = q.hornSegs;
      paintSolid(t, ts.colorBase, ts.colorTip, (_x, _y, _z, vi) => vi >= rings - 2 ? 1 : Math.floor(vi / per) / Math.max(1, Math.floor((rings - 2) / per) - 1));
      parts.push(t, mirrorPart(t, i => remapSide(bones, i, boneIndex)));
    }
    if (a.palm) {
      const palm = buildPalm(a, tf, bi(a.bone), zid("antler"));
      headgearScore += 40 * ageScale;
      parts.push(palm, mirrorPart(palm, i => remapSide(bones, i, boneIndex)));
    }
  }

  // bounding box
  const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) for (let i = 0; i < p.pos.length; i += 3) for (let k = 0; k < 3; k++) { const c = p.pos[i + k]; if (c < min[k]) min[k] = c; if (c > max[k]) max[k] = c; }
  const indiv = v.scale ?? rngRange(rnd, 0.95, 1.05) * (0.9 + 0.1 * v.age);
  const scale = (female ? bp.femaleScale : 1) * indiv;
  return { parts, bones, boneIndex, bbox: { min, max }, scale, headgearScore };
}

function remapSide(bones: BoneSpec[], i: number, idx: Map<string, number>): number {
  const n = bones[i]?.name;
  if (!n) return i;
  let m: string | null = null;
  if (n.endsWith("L")) m = n.slice(0, -1) + "R";
  else if (n.endsWith("R")) m = n.slice(0, -1) + "L";
  if (m && idx.has(m)) return idx.get(m)!;
  return i;
}

function normalize(v: V3): V3 { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function polyLength(p: V3[]) { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1], p[i][2] - p[i - 1][2]); return s; }

function recolorAlong(part: GeoPart, base: RGB, tip: RGB, a: [number, number], b: [number, number]) {
  const dz = b[0] - a[0], dy = b[1] - a[1], l2 = dz * dz + dy * dy || 1;
  for (let i = 0; i < part.pos.length; i += 3) {
    const t = Math.max(0, Math.min(1, ((part.pos[i + 2] - a[0]) * dz + (part.pos[i + 1] - a[1]) * dy) / l2));
    const k = smoothstep(0.55, 0.8, t);
    const c: RGB = [base[0] + (tip[0] - base[0]) * k, base[1] + (tip[1] - base[1]) * k, base[2] + (tip[2] - base[2]) * k];
    part.col[i] = srgbToLinear(c[0]); part.col[i + 1] = srgbToLinear(c[1]); part.col[i + 2] = srgbToLinear(c[2]);
  }
}

/** Hoof: from the coronet ring down to a wedge-shaped sole on the ground, split into two claws. */
function buildHoof(leg: LegSpec, bone: number, zone: number, q: BuildQuality): GeoPart {
  const top = leg.joints[leg.joints.length - 1];
  const h = leg.hoof;
  const out = newPart("hoof");
  const claws = h.split ? [-1, 1] : [0];
  for (const side of claws) {
    const cw = h.split ? h.w * 0.5 : h.w;
    const ox = side * h.w * 0.26;
    const segs = Math.max(6, q.legSegs);
    const part = sweep([[top.p[0] + ox * 0.4, top.p[1], top.p[2]], [top.p[0] + ox, 0.0005, top.p[2] + h.len * 0.18]], {
      segs, samples: 4, zone, kind: "hoof", skin: () => [[bone, 1]], up: [0, 0, 1],
      section: (t, phi) => {
        const rTop = top.r * 0.95 * (h.split ? 0.62 : 1);
        const lat = (1 - t) * rTop + t * cw * 0.5;
        const fwdR = (1 - t) * rTop + t * h.len * 0.5;
        const s = Math.sin(phi);
        // toe pointed forward: stretch the front half
        const fwd = s > 0 ? s * fwdR * (1 + 0.25 * t) : s * fwdR * 0.75;
        return [Math.cos(phi) * lat * (h.split ? (Math.cos(phi) * side > 0 ? 1 : 0.8) : 1), fwd];
      },
    });
    computeNormals(part); paintSolid(part, h.color);
    const base = out.pos.length / 3;
    out.pos.push(...part.pos); out.nrm.push(...part.nrm); out.col.push(...part.col); out.skinI.push(...part.skinI); out.skinW.push(...part.skinW); out.zone.push(...part.zone);
    out.idx.push(...part.idx.map(i => i + base));
  }
  if (h.dewclaw) {
    const j = leg.joints[leg.joints.length - 2];
    for (const side of [-1, 1]) {
      const d = ellipsoid([j.p[0] + side * j.r * 0.45, j.p[1] - 0.01, j.p[2] - j.r * 0.95], [0.012, 0.016, 0.014], 6, 4, [[bone, 1]], zone, "hoof");
      computeNormals(d); paintSolid(d, h.color);
      const base = out.pos.length / 3;
      out.pos.push(...d.pos); out.nrm.push(...d.nrm); out.col.push(...d.col); out.skinI.push(...d.skinI); out.skinW.push(...d.skinW); out.zone.push(...d.zone);
      out.idx.push(...d.idx.map(i => i + base));
    }
  }
  return out;
}

/** Palmate antler plate (moose): an extruded outline with rounded thickness. */
function buildPalm(a: AntlerSpec, tf: (p: V3) => V3, bone: number, zone: number): GeoPart {
  const pm = a.palm!;
  const part = newPart("palm");
  const n = pm.pts.length;
  // outline in palm-local (u = outward, v = forward); plate tilted by tilt (about the outward axis) and yaw
  const toLocal = (u: number, w: number, th: number): V3 => {
    let p: V3 = [u, th, w];
    p = rotate(p, [1, 0, 0], pm.tilt);
    p = rotate(p, [0, 1, 0], pm.yaw);
    return tf([p[0] + pm.at[0], p[1] + pm.at[1], p[2] + pm.at[2]]);
  };
  let cx = 0, cz = 0; for (const p of pm.pts) { cx += p[0]; cz += p[1]; } cx /= n; cz /= n;
  // top face, bottom face, rim
  const top = part.pos.length / 3;
  part.pos.push(...toLocal(cx, cz, pm.thick * 0.6));
  for (const p of pm.pts) part.pos.push(...toLocal(p[0], p[1], pm.thick * 0.5));
  const bot = part.pos.length / 3;
  part.pos.push(...toLocal(cx, cz, -pm.thick * 0.6));
  for (const p of pm.pts) part.pos.push(...toLocal(p[0], p[1], -pm.thick * 0.5));
  for (let i = 0; i < n; i++) {
    const a1 = top + 1 + i, b1 = top + 1 + ((i + 1) % n);
    part.idx.push(top, a1, b1);
    const a2 = bot + 1 + i, b2 = bot + 1 + ((i + 1) % n);
    part.idx.push(bot, b2, a2);
    part.idx.push(a1, a2, b1, b1, a2, b2);
  }
  const count = part.pos.length / 3;
  for (let i = 0; i < count; i++) { part.skinI.push(bone, 0, 0, 0); part.skinW.push(1, 0, 0, 0); part.zone.push(zone); }
  computeNormals(part);
  paintSolid(part, pm.color);
  return part;
}
