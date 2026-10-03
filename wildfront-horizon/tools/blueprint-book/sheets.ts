// Wildfront Horizon 3D — blueprint book sheets. Every view is rendered live
// from the game's blueprint data with the same line-art renderer the in-game
// Blueprint Studio uses; dimensions are measured from the built models.

import * as THREE from "three";
import { human, MM, pickScale, Sheet, SW, type SheetMeta } from "./kit.ts";
import type { Snap, Snapshotter } from "../../app/game3d/render/snapshots.ts";
import { buildBlueprintObject } from "../../app/game3d/models/registry.ts";
import { projectedExtent, VIEWS, type ViewName } from "../../app/game3d/render/views.ts";
import { WILDLIFE } from "../../app/game3d/blueprints/wildlife/index.ts";
import type { AnimalBlueprint, BlueprintMeta, V3 } from "../../app/game3d/blueprints/types.ts";
import { BINOCULARS, CALLER, CARTRIDGE, RIFLES, type RifleBlueprint } from "../../app/game3d/blueprints/gear.ts";
import { perchEyeY, specRows, type AssemblyBlueprint } from "../../app/game3d/blueprints/assembly.ts";
import { STRUCTURES } from "../../app/game3d/blueprints/structures.ts";
import { FLORA, type FloraBlueprint } from "../../app/game3d/blueprints/flora.ts";
import { RESERVES, type ReserveDef } from "../../app/game3d/blueprints/reserves.ts";
import { generateTerrain, heightAt, waterLevelAt, type TerrainData } from "../../app/game3d/world/terrain-gen.ts";
import { drawLandmark, renderTopo, worldToMap } from "../../app/game3d/render/topo.ts";
import { trajectoryTable } from "../../app/game3d/hunt/ballistics.ts";
import { drawHoofPrint } from "../../app/game3d/hunt/sign.ts";
import { ORGAN_COLORS } from "../../app/game3d/render/blueprint-render.ts";
import { GAITS, type Gait } from "../../app/game3d/sim/animal-anim.ts";
import { MISSIONS } from "../../app/game3d/data/missions.ts";
import { VERSION } from "../../app/game3d/version.ts";

export interface BookCtx { snap: Snapshotter; date: string }
/** `rev` is the drawing revision letter shown in the title block (the blueprint's own revision; book-level sheets are issue A). */
export interface SheetDef { id: string; drawing: string; title: string; subtitle: string; section: string; paper?: boolean; rev?: string; build: (ctx: BookCtx, meta: SheetMeta) => Promise<Sheet> }

// ------------------------------------------------------------------ helpers
const boxCache = new Map<string, THREE.Box3>();
async function boxOf(id: string, o: { sex?: "male" | "female"; pose?: string; phase?: number } = {}): Promise<THREE.Box3> {
  const k = JSON.stringify([id, o.sex ?? "male", o.pose ?? "", o.phase ?? 0]);
  let b = boxCache.get(k);
  if (!b) {
    const built = await buildBlueprintObject(id, { sex: o.sex ?? "male", age: 1, seed: 1, pose: o.pose, phase: o.phase });
    built.object.updateMatrixWorld(true);
    b = (built.box ?? new THREE.Box3().setFromObject(built.object)).clone();
    built.object.traverse(x => { const m = x as THREE.Mesh; if (m.isMesh) m.geometry?.dispose(); });
    boxCache.set(k, b);
  }
  return b;
}
const size3 = (b: THREE.Box3) => b.getSize(new THREE.Vector3());
const m2 = (v: number) => `${v.toFixed(2)} m`;
const mm = (v: number) => `${Math.round(v * 1000)} mm`;
const len = (v: number) => (v >= 1 ? m2(v) : mm(v));

interface Placed { snap: Snap; x: number; y: number; w: number; h: number; s: number; P: (p: V3) => [number, number] }

/** Render `id` in `view` at `s` px/m with the object's projected extents starting at (x, y). */
async function place(ctx: BookCtx, sh: Sheet, id: string, view: ViewName, s: number, x: number, y: number, o: { sex?: "male" | "female"; pose?: string; phase?: number; pad?: number; frameBox?: THREE.Box3; thick?: number } = {}): Promise<Placed> {
  const box = o.frameBox ?? await boxOf(id, o);
  const ext = projectedExtent(box, view);
  const pad = o.pad ?? 10;
  const ew = ext.maxX - ext.minX, eh = ext.maxY - ext.minY;
  const w = Math.max(8, Math.round(ew * s + 2 * pad)), h = Math.max(8, Math.round(eh * s + 2 * pad));
  const fb = o.frameBox ? [o.frameBox.min.x, o.frameBox.min.y, o.frameBox.min.z, o.frameBox.max.x, o.frameBox.max.y, o.frameBox.max.z] as [number, number, number, number, number, number] : undefined;
  const snap = await ctx.snap.get(id, { view, w, h, style: sh.paper ? "sheetPaper" : "sheet", sex: o.sex ?? "male", age: 1, seed: 1, pose: o.pose, phase: o.phase, halfHeight: h / 2 / s, margin: 0, ss: 2, noUrl: true, thick: o.thick ?? 1.25, frameBox: fb });
  const ox = Math.round(x - pad), oy = Math.round(y - pad);
  sh.image(snap.canvas, ox, oy);
  return { snap, x, y, w: ew * s, h: eh * s, s, P: (p: V3) => { const q = snap.project(p); return [q[0] + ox, q[1] + oy]; } };
}

function header(sh: Sheet, meta: SheetMeta, sub: string) {
  const x = sh.area.x + 8, y = sh.area.y + 50;
  sh.text(meta.drawing, x, y, { size: 50, weight: 900 });
  const w = sh.measure(meta.drawing, { size: 50, weight: 900 });
  sh.text(meta.title.toUpperCase(), x + w + 26, y, { size: 42, weight: 800, spacing: 2 });
  sh.text(sub, x + 2, y + 34, { size: 20, weight: 600, color: sh.ink2, spacing: 1 });
}

function notesBlock(sh: Sheet, x: number, y: number, w: number, title: string, notes: string[], size = 18): number {
  sh.text(title, x, y, { size: 22, weight: 800, spacing: 2 });
  sh.line(x, y + 8, x + sh.measure(title, { size: 22, weight: 800, spacing: 2 }), y + 8, sh.ink, 2);
  let yy = y + 40;
  notes.forEach((n, i) => {
    sh.text(`${i + 1}.`, x, yy, { size, weight: 700, font: "body" });
    yy = sh.para(n, x + 28, yy, w - 28, { size, font: "body", weight: 450 }) + 6;
  });
  return yy;
}

/** Shoulder (withers) height of a standing animal from its body loft and fore-leg position. */
function shoulderHeight(bp: AnimalBlueprint): number {
  const fz = bp.legs.find(l => l.id === "F")?.joints[0].p[2] ?? 0;
  let best = bp.body[0], bd = Infinity;
  for (const k of bp.body) { const d = Math.abs(k.p[0] - fz); if (d < bd) { bd = d; best = k; } }
  return best.p[1] + best.up;
}

// ------------------------------------------------------------------ cover & notes
async function cover(ctx: BookCtx, meta: SheetMeta, list: SheetDef[]): Promise<Sheet> {
  const sh = new Sheet(false);
  sh.frame(meta);
  const A = sh.area;
  sh.text("WILDFRONT", A.x + 40, A.y + 150, { size: 150, weight: 900, spacing: 16 });
  sh.text("HORIZON 3D", A.x + 46, A.y + 270, { size: 104, weight: 800, spacing: 22, color: sh.accent2 });
  sh.text(`BLUEPRINT BOOK · RELEASE ${VERSION}`, A.x + 50, A.y + 330, { size: 30, weight: 700, spacing: 8, color: sh.ink2 });
  const box = await boxOf("elk");
  const ie = projectedExtent(box, "iso");
  const s = Math.min(1180 / (ie.maxX - ie.minX), 800 / (ie.maxY - ie.minY));
  await place(ctx, sh, "elk", "iso", s, A.x + 60 + (1180 - (ie.maxX - ie.minX) * s) / 2, A.y + 400, { thick: 1.6 });
  sh.para("Every animal, rifle, structure, plant and reserve in Wildfront Horizon 3D is generated from the engineering data drawn on these sheets. The game, the in-game Blueprint Studio and this book read the same blueprints — what you see here is exactly what you hunt.", A.x + 50, A.y + 1270, 1150, { size: 22, font: "body", weight: 450, color: sh.ink2 });
  // index
  const ix = A.x + 1330, iy = A.y + 60;
  sh.text("SHEET INDEX", ix, iy, { size: 28, weight: 800, spacing: 4 });
  const rows = list.map((d, i) => [String(i + 1), d.drawing, d.title]);
  const half = Math.ceil(rows.length / 2);
  sh.table(ix, iy + 22, [46, 120, 330], rows.slice(0, half), { size: 15, rowH: 25, head: ["#", "DRAWING", "TITLE"] });
  sh.table(ix + 520, iy + 22, [46, 120, 330], rows.slice(half), { size: 15, rowH: 25, head: ["#", "DRAWING", "TITLE"] });
  return sh;
}

async function conventions(ctx: BookCtx, meta: SheetMeta): Promise<Sheet> {
  const sh = new Sheet(false);
  sh.frame(meta);
  header(sh, meta, "Coordinate system · views · line types · scoring rules · drawing series");
  const A = sh.area;
  // axes diagram
  const ax = A.x + 220, ay = A.y + 420;
  sh.text("MODEL COORDINATES", A.x + 30, A.y + 150, { size: 26, weight: 800, spacing: 3 });
  const arrow = (dx: number, dy: number, label: string, col: string) => {
    sh.line(ax, ay, ax + dx, ay + dy, col, 4); sh.arrowHead(ax + dx, ay + dy, Math.atan2(dy, dx), 22, col);
    // keep the label inside the frame
    const half = sh.measure(label, { size: 26, weight: 800 }) / 2;
    const lx = Math.max(A.x + 24 + half, ax + dx * 1.18);
    sh.text(label, lx, ay + dy * 1.18 + 8, { size: 26, weight: 800, align: "center", color: col });
  };
  arrow(0, -200, "+Y  UP", sh.ink);
  arrow(-190, 110, "+Z  FORWARD", sh.accent2);
  arrow(190, 110, "+X  SUBJECT'S LEFT", sh.accent);
  sh.para("Units are metres; angles radians; masses kilograms. Origin on the ground plane under the subject. Animals and rifles face +Z (head / muzzle forward), so the LEFT SIDE ELEVATION looks from +X and shows the head to the left. Plans are drawn aligned with the left elevation.", A.x + 30, A.y + 620, 620, { size: 19, font: "body" });
  // six-view arrangement
  const vx = A.x + 760, vy = A.y + 150;
  sh.text("THIRD-ANGLE ARRANGEMENT", vx, vy, { size: 26, weight: 800, spacing: 3 });
  sh.projSymbol(vx + 470, vy - 12, 0.8);
  const cell = (x: number, y: number, w: number, h: number, t: string) => { sh.rect(x, y, w, h, sh.ink, 2); sh.text(t, x + w / 2, y + h / 2 + 8, { size: 20, weight: 800, align: "center" }); };
  const bx = vx + 10, by = vy + 40;
  cell(bx + 150, by, 260, 90, "PLAN (TOP)");
  cell(bx, by + 110, 130, 170, "FRONT");
  cell(bx + 150, by + 110, 260, 170, "LEFT SIDE");
  cell(bx + 430, by + 110, 130, 170, "REAR");
  cell(bx + 580, by + 110, 260, 170, "RIGHT SIDE");
  cell(bx + 150, by + 300, 260, 90, "UNDERSIDE");
  sh.para("The left side elevation is the principal view. Views are projected onto the sides they are seen from (third angle): the view from the head end sits on the head side, the plan above, the underside below and the opposite side at the far right. Isometric views are added for clarity.", vx, by + 450, 840, { size: 19, font: "body" });
  // line types
  const lx = A.x + 1660, ly = A.y + 150;
  sh.text("LINE TYPES", lx, ly, { size: 26, weight: 800, spacing: 3 });
  const lt = [["Visible outline / silhouette", [], 3.5], ["Crease (surface discontinuity)", [], 1.8], ["Dimension & extension lines", [], 1.4], ["Centre / ground line", [26, 6, 4, 6], 1.4], ["GREAT vital region (x-ray)", [10, 7], 2]] as [string, number[], number][];
  lt.forEach(([t, dash, w], i) => { const y = ly + 50 + i * 46; sh.line(lx, y, lx + 150, y, sh.ink, w, dash.length ? dash : undefined); sh.text(t, lx + 170, y + 7, { size: 19, font: "body" }); });
  sh.text("ORGANS (X-RAY SHEETS)", lx, ly + 330, { size: 22, weight: 800, spacing: 2 });
  Object.entries(ORGAN_COLORS).forEach(([k, c], i) => { const y = ly + 370 + i * 36; sh.g.fillStyle = c; sh.g.beginPath(); sh.g.ellipse(lx + 22, y - 6, 18, 11, 0, 0, Math.PI * 2); sh.g.fill(); sh.text(k.toUpperCase(), lx + 56, y, { size: 19, weight: 700 }); });
  // shot grading
  const gx = A.x + 30, gy = A.y + 830;
  sh.text("SHOT GRADING (v2.0.3 RULES, UNCHANGED)", gx, gy, { size: 26, weight: 800, spacing: 3 });
  sh.table(gx, gy + 18, [190, 640, 560], [
    ["PERFECT", "Head contact (brain / skull) — vital headshot", "340 + max(0, 130 − d) + 25 breath held"],
    ["GREAT", "Heart, lungs, or the upper torso / shoulder vital region", "260 + max(0, 130 − d) + 25 breath held"],
    ["GOOD", "Any other body contact (liver, paunch, legs, neck): animal runs wounded", "75 + max(0, 70 − d) × 0.35"],
    ["GRAZE", "Antler or horn only — no body contact", "−5"],
    ["MISS", "No contact", "−5 (score never below 0)"],
    ["NO TAG", "Species not on the contract licence — shot does not count", "−150"],
  ], { head: ["GRADE", "CONTACT", "POINTS (d = distance, m)"], size: 18, rowH: 34 });
  sh.text("Stars per contract: accuracy ≥ 80 % → 3 ★ · ≥ 50 % → 2 ★ · otherwise 1 ★.  Accuracy = registered hits ÷ shots fired.", gx, gy + 300, { size: 19, font: "body" });
  // series
  const sx = A.x + 1450, sy = A.y + 830;
  sh.text("DRAWING SERIES", sx, sy, { size: 26, weight: 800, spacing: 3 });
  sh.table(sx, sy + 18, [110, 520], [
    ["A-01…06", "Wildlife — general arrangement, anatomy, gaits & sign"],
    ["G-01…06", "Gear — rifles, binoculars, caller, cartridge"],
    ["S-01…09", "Structures — towers, stands, blinds, cabins, lodge"],
    ["V-01", "Vehicles — reserve pickup"],
    ["F-01…15", "Flora — trees, shrubs, rocks, logs, reeds"],
    ["M-01…05", "Reserves — topographic survey sheets"],
    ["B-01", "Ballistics & reticle"],
  ], { head: ["SERIES", "CONTENT"], size: 18, rowH: 34 });
  sh.text(`${MISSIONS.length} field contracts · ${WILDLIFE.length} species · ${RIFLES.length} rifles · ${STRUCTURES.length} structures · ${FLORA.length} flora · ${Object.keys(RESERVES).length} reserves`, gx, A.y + A.h - 300, { size: 22, weight: 700, color: sh.accent2, spacing: 2 });
  return sh;
}

// ------------------------------------------------------------------ wildlife
async function animalGA(ctx: BookCtx, meta: SheetMeta, bp: AnimalBlueprint): Promise<Sheet> {
  const sh = new Sheet(false);
  sh.frame(meta);
  header(sh, meta, `${bp.subtitle ?? ""} · six-view general arrangement (third angle) with isometric`);
  const box = await boxOf(bp.id);
  const sz = size3(box);
  const L = sz.z, Wd = sz.x, Ht = sz.y;
  const A = sh.area;
  const gx = 150, gy = 150, top = A.y + 140;
  const availW = A.w - 80 - 3 * gx;
  const availH = A.y + A.h - top - 2 * gy - 60;
  const sc = pickScale(Math.min(availW / (2 * L + 2 * Wd), availH / (Ht + 2 * Wd)));
  const s = sc.pxPerM;
  meta.scale = sc.label;
  const xF = A.x + 50, xL = xF + Wd * s + gx, xR = xL + L * s + gx, xRt = xR + Wd * s + gx;
  const yTop = top, yMid = yTop + Wd * s + gy, yBot = yMid + Ht * s + gy;
  await place(ctx, sh, bp.id, "top", s, xL, yTop);
  await place(ctx, sh, bp.id, "front", s, xF, yMid);
  const left = await place(ctx, sh, bp.id, "left", s, xL, yMid);
  await place(ctx, sh, bp.id, "back", s, xR, yMid);
  await place(ctx, sh, bp.id, "right", s, xRt, yMid);
  await place(ctx, sh, bp.id, "bottom", s, xL, yBot);
  // ground line under the elevations
  sh.line(xF - 30, yMid + Ht * s, xRt + L * s + 30, yMid + Ht * s, sh.ink2, 1.4, [26, 6, 4, 6]);
  // captions
  sh.caption(xL + L * s / 2, yTop + Wd * s + 52, "PLAN — TOP", sc.label);
  sh.caption(xF + Wd * s / 2, yMid + Ht * s + 120, "FRONT", sc.label);
  sh.caption(xL + L * s / 2, yMid + Ht * s + 52, "LEFT SIDE ELEVATION", sc.label);
  sh.caption(xR + Wd * s / 2, yMid + Ht * s + 52, "REAR", sc.label);
  sh.caption(xRt + L * s / 2, yMid + Ht * s + 52, "RIGHT SIDE ELEVATION", sc.label);
  sh.caption(xL + L * s / 2, yBot + Wd * s + 52, "UNDERSIDE", sc.label);
  // dimensions
  sh.dimH(xL, xL + L * s, yTop - 34, `LENGTH ${m2(L)}`, yTop);
  sh.dimV(yMid, yMid + Ht * s, xL + L * s + 60, `HEIGHT ${m2(Ht)}`, xL + L * s);
  sh.dimH(xF, xF + Wd * s, yMid + Ht * s + 50, `${mm(Wd)}`, yMid + Ht * s);
  const shH = shoulderHeight(bp);
  const fz = bp.legs.find(l => l.id === "F")!.joints[0].p[2];
  const [wx, wy] = left.P([0.05, shH, fz]);
  sh.callout(wx, wy, xL + L * s * 0.5 + 150, yMid - 46, `SHOULDER (WITHERS) ${m2(shH)}`, sh.accent, "left");
  // isometric + facts (top right)
  const isoX = xR, isoY = A.y + 120, isoH = yMid - 110 - isoY;
  const ie = projectedExtent(box, "iso");
  const isc = pickScale(Math.min(420 / (ie.maxX - ie.minX), isoH / (ie.maxY - ie.minY)));
  const iw = (ie.maxX - ie.minX) * isc.pxPerM;
  await place(ctx, sh, bp.id, "iso", isc.pxPerM, isoX, isoY + 6);
  sh.text(`ISOMETRIC · ${isc.label}`, isoX + iw / 2, isoY + isoH + 34, { size: 19, weight: 800, align: "center", spacing: 2 });
  const fxT = isoX + Math.max(iw, 300) + 70, fwT = A.x + A.w - fxT - 20;
  if (fwT > 420) {
    const f = bp.facts;
    sh.table(fxT, isoY - 10, [170, fwT - 170], [["LATIN", f.latin], ["FAMILY", f.family], ["SHOULDER", f.shoulder], ["WEIGHT", f.weight], ["TOP SPEED", f.topSpeed], ["HABITAT", f.habitat]], { size: 16, rowH: 33, title: "SPECIES DATA" });
  }
  // notes (top left, above FRONT)
  notesBlock(sh, A.x + 40, A.y + 150, xL - A.x - 120, "NOTES", bp.notes.slice(0, 3), 16);
  return sh;
}

async function animalAnatomy(ctx: BookCtx, meta: SheetMeta, bp: AnimalBlueprint): Promise<Sheet> {
  const sh = new Sheet(false);
  sh.frame(meta);
  header(sh, meta, "X-ray elevation and plan · skeleton · organs · shot placement · female comparison");
  const box = await boxOf(bp.id);
  const sz = size3(box);
  const A = sh.area;
  // organ callouts sit in a column right of the elevation and must clear the shot-angle block
  const grade: Record<string, string> = { brain: "PERFECT", heart: "GREAT", lungs: "GREAT", liver: "GOOD · slow", stomach: "GOOD · paunch", spine: "GREAT*" };
  const zoneLabel = "UPPER-TORSO ZONE · GREAT";
  const calloutW = Math.max(sh.measure(zoneLabel, { size: 20, weight: 700 }), ...Object.entries(grade).map(([k, v]) => sh.measure(`${k.toUpperCase()} · ${v}`, { size: 20, weight: 700 }))) + 24;
  const angleX0 = A.x + A.w - 900;
  const sc = pickScale(Math.min(1380 / sz.z, 700 / sz.y, (angleX0 - 30 - (A.x + 70) - 60 - calloutW) / sz.z));
  const s = sc.pxPerM;
  meta.scale = sc.label;
  const x0 = A.x + 70, y0 = A.y + 150;
  const left = await place(ctx, sh, bp.id, "left", s, x0, y0);
  const plan = await place(ctx, sh, bp.id, "top", s, x0, y0 + sz.y * s + 150);
  const g = sh.g;
  // organs and vital region on both views
  const ell = (P: Placed, view: "left" | "top", c: V3, r: V3, fill: string | null, dashed: boolean) => {
    const [cx, cy] = P.P(c);
    const rx = (view === "left" ? r[2] : r[2]) * s, ry = (view === "left" ? r[1] : r[0]) * s;
    g.save(); g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    if (fill) { g.globalAlpha = 0.62; g.fillStyle = fill; g.fill(); g.globalAlpha = 1; }
    g.strokeStyle = dashed ? sh.accent2 : "rgba(255,255,255,0.85)"; g.lineWidth = dashed ? 3 : 1.5; if (dashed) g.setLineDash([12, 8]); g.stroke(); g.restore();
    return [cx, cy] as [number, number];
  };
  for (const P of [left, plan]) ell(P, P === left ? "left" : "top", bp.vitalRegion.c, bp.vitalRegion.r, null, true);
  const centres: Record<string, [number, number]> = {};
  for (const o of bp.organs) {
    if (o.id === "spine") continue;
    centres[o.id] = ell(left, "left", o.c, o.r, ORGAN_COLORS[o.id], false);
    ell(plan, "top", o.c, o.r, ORGAN_COLORS[o.id], false);
  }
  // spine as a band
  const sp = bp.organs.find(o => o.id === "spine");
  if (sp) { const [a0, b0] = left.P([0, sp.c[1], sp.c[2] - sp.r[2]]); const [a1, b1] = left.P([0, sp.c[1], sp.c[2] + sp.r[2]]); sh.line(a0, b0, a1, b1, ORGAN_COLORS.spine, 7); centres.spine = [(a0 + a1) / 2, (b0 + b1) / 2]; }
  // skeleton
  const bones = new Map(bp.bones.map(b => [b.name, b]));
  for (const b of bp.bones) {
    if (!b.parent || b.name.startsWith("ear")) continue;
    const pb = bones.get(b.parent)!;
    if (pb.name === "root") continue;
    const [ax, ay] = left.P(pb.p), [bx, by] = left.P(b.p);
    sh.line(ax, ay, bx, by, sh.accent, 3);
  }
  for (const leg of bp.legs) {
    const pts = leg.joints.map(j => left.P(j.p));
    const parent = bones.get(leg.parent)!;
    const [px, py] = left.P(parent.p);
    sh.line(px, py, pts[0][0], pts[0][1], sh.accent, 3);
    for (let i = 1; i < pts.length; i++) sh.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], sh.accent, 3);
    for (const [x, y] of pts) { g.save(); g.fillStyle = sh.bg; g.strokeStyle = sh.accent; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill(); g.stroke(); g.restore(); }
  }
  for (const b of bp.bones) { if (b.name === "root" || b.name.startsWith("ear")) continue; const [x, y] = left.P(b.p); g.save(); g.fillStyle = sh.accent; g.beginPath(); g.arc(x, y, 5.5, 0, Math.PI * 2); g.fill(); g.restore(); }
  // callouts to organs
  const rx = x0 + sz.z * s + 60;
  const order = ["brain", "heart", "lungs", "liver", "stomach", "spine"];
  order.forEach((id, i) => {
    const c = centres[id]; if (!c) return;
    const ly = y0 + 40 + i * 62;
    sh.callout(c[0], c[1], rx, ly, `${id.toUpperCase()} · ${grade[id]}`, ORGAN_COLORS[id] ?? sh.ink);
  });
  const [vx, vy] = left.P([0, bp.vitalRegion.c[1] + bp.vitalRegion.r[1] * 0.9, bp.vitalRegion.c[2]]);
  sh.callout(vx, vy, rx, y0 + 40 + 6 * 62, zoneLabel, sh.accent2);
  sh.caption(x0 + sz.z * s / 2, y0 + sz.y * s + 60, "LEFT SIDE ELEVATION — X-RAY", sc.label);
  sh.caption(x0 + sz.z * s / 2, y0 + sz.y * s + 150 + sz.x * s + 60, "PLAN — X-RAY", sc.label);
  // shot angles in plan: broadside, quartering away, quartering to
  {
    const ax0 = angleX0, ay0 = A.y + 150;
    sh.text("SHOT ANGLES · PLAN", ax0, ay0, { size: 24, weight: 800, spacing: 3 });
    const as = pickScale(270 / sz.z);
    const vit: V3 = [0, (bp.organs.find(o => o.id === "lungs")?.c[1] ?? 0.7), ((bp.organs.find(o => o.id === "lungs")?.c[2] ?? 0) + (bp.organs.find(o => o.id === "heart")?.c[2] ?? 0)) / 2];
    const cases: [string, string, [number, number], string][] = [
      ["BROADSIDE", "Behind the shoulder, through both lungs", [0, -1], sh.accent2],
      ["QUARTERING AWAY", "Enter behind the last rib, exit the far shoulder", [-0.7071, -0.7071], sh.accent],
      ["QUARTERING TO", "Into the near shoulder point — tighter window", [0.7071, -0.7071], "#ffb38a"],
    ];
    for (let i = 0; i < cases.length; i++) {
      const [t, d, dir, col] = cases[i];
      const cx = ax0 + 20 + i * 300, cy = ay0 + 110;
      const pl = await place(ctx, sh, bp.id, "top", as.pxPerM, cx, cy, { pad: 6, thick: 1.0 });
      const [vx2, vy2] = pl.P(vit);
      for (const o of bp.organs) { if (o.id !== "heart" && o.id !== "lungs") continue; const [ox, oy] = pl.P(o.c); g.save(); g.globalAlpha = 0.6; g.fillStyle = ORGAN_COLORS[o.id]; g.beginPath(); g.ellipse(ox, oy, o.r[2] * as.pxPerM, o.r[0] * as.pxPerM, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
      const Lh = 120;
      const sx0 = vx2 - dir[0] * Lh, sy0 = vy2 - dir[1] * Lh, sx1 = vx2 + dir[0] * Lh * 0.7, sy1 = vy2 + dir[1] * Lh * 0.7;
      sh.line(sx0, sy0, sx1, sy1, col, 3.5);
      sh.arrowHead(sx1, sy1, Math.atan2(dir[1], dir[0]), 18, col);
      sh.text(t, cx + pl.w / 2, cy + 190, { size: 19, weight: 800, align: "center", color: col, spacing: 1 });
      sh.text(d, cx + pl.w / 2, cy + 216, { size: 14, weight: 500, font: "body", align: "center", color: sh.ink2, maxWidth: 290 });
    }
    sh.text(`Shooter at the bottom of each plan (the animal's left side) · ${as.label}`, ax0, ay0 + 360, { size: 15, weight: 600, font: "body", color: sh.ink2 });
  }
  // organ table
  const tx = A.x + A.w - 860, ty = A.y + 610;
  const rows = bp.organs.map(o => [o.id.toUpperCase(), `${o.c[1].toFixed(2)} / ${o.c[2].toFixed(2)}`, `${Math.round(o.r[0] * 200)}×${Math.round(o.r[1] * 200)}×${Math.round(o.r[2] * 200)} cm`, o.lethal === "vital" ? "VITAL" : o.lethal === "slow" ? "SLOW" : "NON-VITAL", o.id === "brain" ? "PERFECT" : o.id === "heart" || o.id === "lungs" ? "GREAT" : o.id === "spine" ? "GREAT*" : "GOOD"]);
  const vr = bp.vitalRegion;
  rows.push(["GREAT ZONE", `${vr.c[1].toFixed(2)} / ${vr.c[2].toFixed(2)}`, `${Math.round(vr.r[0] * 200)}×${Math.round(vr.r[1] * 200)}×${Math.round(vr.r[2] * 200)} cm`, "REGION", "GREAT"]);
  sh.table(tx, ty, [170, 170, 200, 140, 120], rows, { head: ["ORGAN", "HEIGHT / FWD (m)", "SIZE (W×H×L)", "LETHALITY", "GRADE"], size: 17, rowH: 32, title: "ORGANS (ELLIPSOIDS RIDING ON BONES)" });
  sh.para("Bullet paths are traced through these ellipsoids after an exact hit test against the posed, skinned mesh — so the grade always matches where the bullet really went. * The spine counts as GREAT only where it lies inside the upper-torso zone.", tx, ty + 320, 830, { size: 16, font: "body", color: sh.ink2 });
  // female comparison (bottom left, under the plan), ground-aligned at one scale
  const fBox = await boxOf(bp.id, { sex: "female" });
  const fsz = size3(fBox);
  const fy = y0 + sz.y * s + 150 + sz.x * s + 150;
  const maxH = Math.max(fsz.y, sz.y);
  const fsc = pickScale(Math.min(s * 0.7, (A.y + A.h - fy - 70) / maxH, (sh.tb.x - A.x - 260) / (fsz.z + sz.z)));
  const fs = fsc.pxPerM;
  const fx = A.x + 70;
  sh.text(`SEX COMPARISON · ${fsc.label}`, fx, fy - 18, { size: 22, weight: 800, spacing: 2 });
  await place(ctx, sh, bp.id, "left", fs, fx, fy + (maxH - fsz.y) * fs + 10, { sex: "female" });
  await place(ctx, sh, bp.id, "left", fs, fx + fsz.z * fs + 120, fy + (maxH - sz.y) * fs + 10);
  sh.line(fx - 20, fy + maxH * fs + 10, fx + (fsz.z + sz.z) * fs + 140, fy + maxH * fs + 10, sh.ink2, 1.4, [26, 6, 4, 6]);
  sh.text(`${bp.femaleName.toUpperCase()} · ×${bp.femaleScale.toFixed(2)}`, fx + fsz.z * fs / 2, fy + maxH * fs + 44, { size: 19, weight: 800, align: "center", spacing: 2 });
  sh.text(bp.maleName.toUpperCase(), fx + fsz.z * fs + 120 + sz.z * fs / 2, fy + maxH * fs + 44, { size: 19, weight: 800, align: "center", spacing: 2 });
  return sh;
}

async function animalGaits(ctx: BookCtx, meta: SheetMeta, bp: AnimalBlueprint): Promise<Sheet> {
  const sh = new Sheet(false);
  sh.frame(meta);
  header(sh, meta, "Gait sequences · footfall timing · tracks, trail and droppings · senses · trophy classes");
  const A = sh.area;
  const base = await boxOf(bp.id);
  const sz = size3(base);
  const frame = new THREE.Box3(new THREE.Vector3(base.min.x - 0.05, 0, base.min.z - sz.z * 0.08), new THREE.Vector3(base.max.x + 0.05, base.max.y * 1.02, base.max.z + sz.z * 0.08));
  const fsz = size3(frame);
  const frames = 6;
  const cellGap = 8;
  const gaits: Gait[] = bp.gait.stot ? ["walk", "trot", "gallop", "stot"] : ["walk", "trot", "gallop"];
  const colR = A.x + A.w - 560;                 // right column: senses & trophy tables
  const x0 = A.x + 210, y0 = A.y + 140;
  const footW = 330;
  const cellW = (colR - 60 - footW - 40 - x0) / frames - cellGap;
  const s = Math.min(cellW / fsz.z, (gaits.length > 3 ? 150 : 185) / fsz.y);
  const rowH = fsz.y * s + 66;
  for (let gi = 0; gi < gaits.length; gi++) {
    const gname = gaits[gi];
    const y = y0 + gi * rowH;
    sh.text(gname.toUpperCase(), A.x + 30, y + fsz.y * s * 0.45, { size: 30, weight: 900, spacing: 3 });
    const spd = gname === "stot" ? "bounding" : `${bp.gait[gname as "walk" | "trot" | "gallop"].speed} m/s`;
    sh.text(spd, A.x + 30, y + fsz.y * s * 0.45 + 30, { size: 18, weight: 700, color: sh.ink2 });
    for (let k = 0; k < frames; k++) {
      const x = x0 + k * (fsz.z * s + cellGap);
      await place(ctx, sh, bp.id, "left", s, x, y, { pose: gname, phase: k / frames, frameBox: frame, pad: 4, thick: 1.0 });
      sh.text(`${Math.round(k / frames * 100)}%`, x + fsz.z * s / 2, y + fsz.y * s + 24, { size: 15, weight: 700, align: "center", color: sh.ink2 });
    }
    // footfall diagram
    const T = GAITS[gname];
    const fx = x0 + frames * (fsz.z * s + cellGap) + 30, fw = footW;
    const legs: ("FL" | "FR" | "HL" | "HR")[] = ["FL", "FR", "HL", "HR"];
    legs.forEach((lg, i) => {
      const yy = y + 12 + i * 34;
      sh.text(lg, fx, yy + 20, { size: 17, weight: 800 });
      sh.rect(fx + 44, yy + 4, fw - 50, 22, sh.ink2, 1);
      const off = T.offsets[lg], beta = T.beta;
      // stance from off to off+beta (wrapping)
      const seg = (a: number, b: number) => { sh.g.fillStyle = sh.accent2; sh.g.fillRect(fx + 44 + a * (fw - 50), yy + 4, (b - a) * (fw - 50), 22); };
      const a = off % 1, b = a + beta;
      if (b <= 1) seg(a, b); else { seg(a, 1); seg(0, b - 1); }
    });
    sh.text(`STANCE (FOOT ON GROUND) · DUTY FACTOR ${Math.round(T.beta * 100)}%`, fx, y + 12 + 4 * 34 + 18, { size: 14, weight: 700, color: sh.ink2 });
  }
  const yB = y0 + gaits.length * rowH + 30;
  // track plate at 1:2
  const tr = bp.track;
  const pxcm = MM * 10 / 2;            // 1:2
  sh.text("TRACK · 1:2", A.x + 30, yB, { size: 24, weight: 800, spacing: 2 });
  const tx = A.x + 140, ty = yB + 40 + tr.length * pxcm / 2 + 10;
  sh.g.save(); sh.g.fillStyle = sh.ink; drawHoofPrint(sh.g, tx, ty, tr.length * pxcm / 0.9, tr.shape, tr.dewclaws); sh.g.restore();
  sh.dimV(ty - tr.length * pxcm / 2, ty + tr.length * pxcm / 2, tx + tr.width * pxcm / 2 + 60, `${tr.length} cm`, tx + tr.width * pxcm / 2);
  sh.dimH(tx - tr.width * pxcm / 2, tx + tr.width * pxcm / 2, ty + tr.length * pxcm / 2 + 50, `${tr.width} cm`, ty + tr.length * pxcm / 2);
  // trail pattern (walking) at 1:20
  const trS = MM * 1000 / 20;   // px per m
  const px0 = A.x + 520, py0 = yB + 70;
  sh.text("WALKING TRAIL · 1:20", px0, yB, { size: 24, weight: 800, spacing: 2 });
  const n = Math.max(4, Math.min(7, Math.floor(820 / (tr.stride * trS))));
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1;
    const x = px0 + 40 + i * tr.stride * trS, y = py0 + 90 + side * tr.straddle * trS / 2;
    sh.g.save(); sh.g.translate(x, y); sh.g.rotate(Math.PI / 2); sh.g.fillStyle = sh.ink; drawHoofPrint(sh.g, 0, 0, Math.max(10, tr.length / 100 * trS / 0.9), tr.shape, false); sh.g.restore();
  }
  sh.line(px0 + 20, py0 + 90, px0 + 40 + (n - 1) * tr.stride * trS + 30, py0 + 90, sh.ink2, 1.2, [26, 6, 4, 6]);
  sh.dimH(px0 + 40, px0 + 40 + tr.stride * trS, py0 + 190, `STRIDE ${Math.round(tr.stride * 100)} cm`, py0 + 120);
  sh.dimV(py0 + 90 - tr.straddle * trS / 2, py0 + 90 + tr.straddle * trS / 2, px0 + 40 + (n - 1) * tr.stride * trS + 70, `STRADDLE ${Math.round(tr.straddle * 100)} cm`);
  sh.text("→ DIRECTION OF TRAVEL", px0 + 40, py0 + 250, { size: 17, weight: 700, color: sh.ink2 });
  // droppings
  const dx = px0, dy = py0 + 300;
  sh.text(`DROPPINGS · ${tr.dropping.kind.toUpperCase()}`, dx, dy, { size: 20, weight: 800, spacing: 2 });
  sh.g.save(); sh.g.fillStyle = sh.ink;
  const ds = tr.dropping.size;
  for (let i = 0; i < (tr.dropping.kind === "pellets" ? 16 : tr.dropping.kind === "log" ? 3 : 1); i++) {
    const a = i * 2.4, r = tr.dropping.kind === "pellets" ? 8 + (i % 5) * 7 : i * 18;
    sh.g.beginPath();
    if (tr.dropping.kind === "pat") sh.g.ellipse(dx + 90, dy + 70, 70 * ds / 3, 46 * ds / 3, 0, 0, Math.PI * 2);
    else if (tr.dropping.kind === "log") sh.g.ellipse(dx + 60 + r * 2, dy + 70, 26 * ds, 10 * ds, 0.3 * i, 0, Math.PI * 2);
    else sh.g.ellipse(dx + 90 + Math.cos(a) * r, dy + 70 + Math.sin(a) * r * 0.6, 7 * ds, 5 * ds, a, 0, Math.PI * 2);
    sh.g.fill();
  }
  sh.g.restore();
  // senses, gaits and trophy classes (right column)
  const S = bp.senses;
  const kx = colR, kw = A.x + A.w - kx - 20;
  let ky = A.y + 130;
  ky = sh.table(kx, ky, [150, kw - 150], [
    ["SIGHT", `${S.sight} m — moving hunter in the open`], ["HEARING", `× ${S.hearing.toFixed(2)} hunter noise radius`], ["SMELL", `${S.smell} m downwind`], ["WARINESS", `${Math.round(S.wariness * 100)} %`],
    ["GROUP", `${S.group}, ${S.herd[0]}–${S.herd[1]}`], ["FLIGHT", `${S.fleeDistance[0]}–${S.fleeDistance[1]} m`],
  ], { head: ["SENSE", "VALUE"], size: 16, rowH: 30, title: "SENSES" }) + 40;
  const G = bp.gait;
  ky = sh.table(kx, ky, [150, kw - 150], [["WALK", `${G.walk.speed} m/s · stride ${G.walk.stride} m`], ["TROT", `${G.trot.speed} m/s · stride ${G.trot.stride} m`], ["GALLOP", `${G.gallop.speed} m/s · stride ${G.gallop.stride} m`], ["FLEE", `${G.flee} m/s sustained${G.stot ? " · stots" : ""}`]], { head: ["GAIT", "SPEED · STRIDE"], size: 16, rowH: 30, title: "GAITS" }) + 40;
  const T = bp.trophy;
  sh.table(kx, ky, [200, kw - 200], [["BRONZE", `${T.tiers.bronze}+ ${T.unit}`], ["SILVER", `${T.tiers.silver}+ ${T.unit}`], ["GOLD", `${T.tiers.gold}+ ${T.unit}`], ["DIAMOND", `${T.tiers.diamond}+ ${T.unit}`], ["MALE RANGE", `${T.maleScore[0]}–${T.maleScore[1]} ${T.unit}`], ["WEIGHT ♂ / ♀", `${T.weightMale[0]}–${T.weightMale[1]} / ${T.weightFemale[0]}–${T.weightFemale[1]} kg`]], { head: ["CLASS", "SCORE"], size: 16, rowH: 30, title: `TROPHY · ${T.measure.toUpperCase()}` });
  return sh;
}

// ------------------------------------------------------------------ assemblies (gear, structures, vehicle)
function partsRows(a: AssemblyBlueprint): string[][] {
  const seen = new Map<string, { name: string; mat: string; qty: number; group: string }>();
  for (const p of a.prims) { const k = `${p.name}|${p.mat}`; const e = seen.get(k); if (e) e.qty++; else seen.set(k, { name: p.name, mat: a.materials[p.mat]?.label ?? p.mat, qty: 1, group: p.group ?? "" }); }
  return [...seen.values()].map((e, i) => [String(i + 1), e.name, e.mat, String(e.qty)]);
}

async function assemblySheet(ctx: BookCtx, meta: SheetMeta, a: AssemblyBlueprint): Promise<Sheet> {
  const sh = new Sheet(false);
  sh.frame(meta);
  header(sh, meta, `${a.subtitle ?? ""} · front, side, plan, isometric and exploded views`);
  const box = await boxOf(a.id);
  const sz = size3(box);
  const A = sh.area;
  // a seated eye above the structure's top (tripod stand) needs a little headroom under the sheet header
  const eyeHigh = a.perch ? perchEyeY(a.perch) > box.max.y : false;
  const gx = 160, gy = 150, top = A.y + (eyeHigh ? 210 : 160);
  // left 60 % for the three orthographic views (specifications table underneath)
  const specs = specRows(a);
  const specH = specs.length ? specs.length * 30 + 100 : 0;
  // tall objects: FRONT | SIDE | PLAN in one ground-aligned row (bigger drawings); others: plan above front (third angle)
  const tall = sz.y > sz.z * 1.25 && sz.y > sz.x * 1.1;
  const colX = A.x + A.w - 880;               // right column: isometric, exploded, parts list
  const availW = colX - A.x - 100 - (tall ? 2 : 1) * gx, availH = A.y + A.h - top - (tall ? 0 : gy) - 120 - specH;
  const sc = tall ? pickScale(Math.min(availW / (2 * sz.x + sz.z), availH / Math.max(sz.y, sz.z))) : pickScale(Math.min(availW / (sz.x + sz.z), availH / (sz.z + sz.y)));
  const s = sc.pxPerM;
  meta.scale = sc.label;
  const xF = A.x + 60, xS = xF + sz.x * s + gx;
  const yP = top, yF = tall ? top : yP + sz.z * s + gy;
  const xP = tall ? xS + sz.z * s + gx : xF;
  await place(ctx, sh, a.id, "planF", s, xP, yP);
  const front = await place(ctx, sh, a.id, "front", s, xF, yF);
  await place(ctx, sh, a.id, "left", s, xS, yF);
  sh.line(xF - 30, yF + sz.y * s, xS + sz.z * s + 30, yF + sz.y * s, sh.ink2, 1.4, [26, 6, 4, 6]);
  sh.caption(xP + sz.x * s / 2, yP + sz.z * s + 52, tall ? "PLAN (RELOCATED)" : "PLAN", sc.label);
  sh.caption(xF + sz.x * s / 2, yF + sz.y * s + 100, "FRONT ELEVATION", sc.label);
  sh.caption(xS + sz.z * s / 2, yF + sz.y * s + 100, "SIDE ELEVATION", sc.label);
  sh.dimH(xF, xF + sz.x * s, yF + sz.y * s + 46, `${len(sz.x)}`, yF + sz.y * s);
  sh.dimV(yF, yF + sz.y * s, xF - 50, `${len(sz.y)}`, xF);
  sh.dimH(xS, xS + sz.z * s, yF + sz.y * s + 46, `${len(sz.z)}`, yF + sz.y * s);
  // climbable structures: the hunter's eye line across both elevations (the game reads the same perch)
  if (a.perch) {
    const eyeY = perchEyeY(a.perch), yE = front.P([a.perch.at[0], eyeY, a.perch.at[1]])[1];
    sh.line(xF - 30, yE, xS + sz.z * s + 30, yE, sh.accent, 2, [14, 7]);
    const tag = `EYE ${m2(eyeY)}`, tw = sh.measure(tag, { size: 18, weight: 800 }) + 14, tx = xF + sz.x * s + gx / 2;
    sh.rect(tx - tw / 2, yE - 14, tw, 28, sh.accent, 1.5, sh.bg);
    sh.text(tag, tx, yE + 7, { size: 18, weight: 800, align: "center", color: sh.accent });
  }
  // isometric + exploded (right column)
  const rx = colX, rw = A.x + A.w - rx - 20;
  const ie = projectedExtent(box, "iso");
  const isc = pickScale(Math.min(rw * 0.48 / (ie.maxX - ie.minX), 430 / (ie.maxY - ie.minY)));
  await place(ctx, sh, a.id, "iso", isc.pxPerM, rx, A.y + 160);
  sh.text(`ISOMETRIC · ${isc.label}`, rx + (ie.maxX - ie.minX) * isc.pxPerM / 2, A.y + 160 + (ie.maxY - ie.minY) * isc.pxPerM + 44, { size: 20, weight: 800, align: "center", spacing: 2 });
  const ebox = await boxOf(a.id, { pose: "explode" });
  const ee = projectedExtent(ebox, "iso");
  const esc = pickScale(Math.min(rw * 0.5 / (ee.maxX - ee.minX), 430 / (ee.maxY - ee.minY)));
  const ex = rx + rw * 0.5;
  await place(ctx, sh, a.id, "iso", esc.pxPerM, ex, A.y + 160, { pose: "explode" });
  sh.text(`EXPLODED · ${esc.label}`, ex + (ee.maxX - ee.minX) * esc.pxPerM / 2, A.y + 160 + (ee.maxY - ee.minY) * esc.pxPerM + 44, { size: 20, weight: 800, align: "center", spacing: 2 });
  // parts list + specs
  const rows = partsRows(a);
  const py = A.y + 720;
  const maxRows = Math.floor((sh.tb.y - py - 80) / 27);
  sh.table(rx, py, [50, 360, 260, 60], rows.slice(0, maxRows), { head: ["#", "PART", "MATERIAL", "QTY"], size: 15, rowH: 27, title: `PARTS LIST (${a.prims.length} PRIMITIVES)` });
  if (specs.length) sh.table(A.x + 60, A.y + A.h - specH + 20, [220, 420], specs.map(s2 => [s2.label.toUpperCase(), s2.value]), { size: 16, rowH: 30, title: "SPECIFICATIONS" });
  return sh;
}

async function rifleGA(ctx: BookCtx, meta: SheetMeta, r: RifleBlueprint): Promise<Sheet> {
  const sh = new Sheet(false);
  sh.frame(meta);
  header(sh, meta, `${r.subtitle} · all six views (long-object arrangement)`);
  const box = await boxOf(r.id);
  const sz = size3(box);
  const A = sh.area;
  const x0 = A.x + 330, gap = 100;
  const labelW = 300;   // view labels sit to the right of each view
  const availH = sh.tb.y - (A.y + 170) - 40 - 3 * gap;
  const sc = pickScale(Math.min((A.w - 330 - 40 - labelW) / sz.z, availH / (sz.y * 2 + sz.x * 2)));
  const s = sc.pxPerM;
  meta.scale = sc.label;
  let y = A.y + 170;
  const rows: [ViewName, string, number][] = [["top", "PLAN", sz.x], ["left", "LEFT ELEVATION", sz.y], ["bottom", "UNDERSIDE", sz.x], ["right", "RIGHT ELEVATION", sz.y]];
  for (const [v, t, hh] of rows) {
    await place(ctx, sh, r.id, v, s, x0, y);
    sh.text(`${t} · ${sc.label}`, x0 + sz.z * s + 40, y + hh * s / 2 + 8, { size: 20, weight: 800, spacing: 2 });
    if (v === "left") { sh.dimH(x0, x0 + sz.z * s, y - 30, `OVERALL ${mm(sz.z)}`, y); sh.dimV(y, y + hh * s, x0 - 30, mm(hh), x0); }
    y += hh * s + gap;
  }
  // end views
  const ex = A.x + 20;
  await place(ctx, sh, r.id, "front", s, ex, A.y + 200);
  sh.text("MUZZLE END", ex + sz.x * s / 2, A.y + 200 + sz.y * s + 34, { size: 17, weight: 800, align: "center", spacing: 1 });
  await place(ctx, sh, r.id, "back", s, ex + 140, A.y + 200);
  sh.text("BUTT END", ex + 140 + sz.x * s / 2, A.y + 200 + sz.y * s + 34, { size: 17, weight: 800, align: "center", spacing: 1 });
  const b = r.ballistics;
  sh.table(A.x + 40, A.y + A.h - 318, [220, 330], [["CARTRIDGE", b.caliber], ["BULLET", `${b.grains} gr ${b.bullet}`], ["MUZZLE VELOCITY", `${b.mv} m/s`], ["BC (G1)", b.bcG1.toFixed(2)], ["ZERO", `${b.zero} m`], ["SIGHT HEIGHT", `${Math.round(b.sightHeight * 1000)} mm`], ["MAGAZINE", `${b.magazine} rounds`], ["OPTIC", `${r.scope.minMag}–${r.scope.maxMag}×${r.scope.objective}, ${r.scope.reticle}`], ["WEIGHT", `${r.weightKg} kg`]], { size: 16, rowH: 30, title: "SPECIFICATIONS" });
  return sh;
}

async function rifleData(ctx: BookCtx, meta: SheetMeta, r: RifleBlueprint): Promise<Sheet> {
  const sh = new Sheet(false);
  sh.frame(meta);
  header(sh, meta, "Exploded assembly · parts list · trajectory table and chart (quadratic drag, 4 m/s full-value crosswind)");
  const A = sh.area;
  const ebox = await boxOf(r.id, { pose: "explode" });
  const el = projectedExtent(ebox, "left");
  const lsc = pickScale(Math.min(1300 / (el.maxX - el.minX), 420 / (el.maxY - el.minY)));
  await place(ctx, sh, r.id, "left", lsc.pxPerM, A.x + 60, A.y + 150, { pose: "explode" });
  const lh = (el.maxY - el.minY) * lsc.pxPerM;
  sh.text(`EXPLODED SIDE ELEVATION · ${lsc.label}`, A.x + 60, A.y + 150 + lh + 44, { size: 22, weight: 800, spacing: 2 });
  const ee = projectedExtent(ebox, "iso");
  const isoTop = A.y + 150 + lh + 80, isoH = A.y + 840 - isoTop;
  if (isoH > 120) {
    const esc = pickScale(Math.min(700 / (ee.maxX - ee.minX), isoH / (ee.maxY - ee.minY)));
    await place(ctx, sh, r.id, "iso", esc.pxPerM, A.x + 600, isoTop, { pose: "explode", thick: 1.0 });
    sh.text(`EXPLODED ISOMETRIC · ${esc.label}`, A.x + 60, isoTop + 30, { size: 19, weight: 800, spacing: 2, color: sh.ink2 });
  }
  const rows = partsRows(r);
  sh.table(A.x + 1450, A.y + 130, [50, 330, 230, 60], rows.slice(0, 24), { head: ["#", "PART", "MATERIAL", "QTY"], size: 15, rowH: 26, title: "PARTS LIST" });
  const tt = trajectoryTable(r.ballistics, [0, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500]);
  const ty = A.y + 880;
  const z1 = (v: number, d: number) => { const s0 = v.toFixed(d); return /^-0\.?0*$/.test(s0) ? s0.slice(1) : s0; };
  sh.table(A.x + 60, ty, [110, 110, 110, 120, 120, 140, 110], tt.map(t => [`${t.range} m`, t.range === 0 ? "—" : z1(t.dropCm, 1), z1(t.dropMil, 2), Math.abs(t.driftCm).toFixed(1), Math.round(t.velocity).toString(), Math.round(t.energyJ).toLocaleString(), t.time.toFixed(3)]), { head: ["RANGE", "DROP cm", "HOLD mil", "DRIFT cm", "VEL m/s", "ENERGY J", "TOF s"], size: 16, rowH: 30, title: "TRAJECTORY" });
  const maxDrop = Math.ceil(tt[tt.length - 1].dropCm / 50) * 50;
  sh.chart(A.x + 1100, ty + 70, 1080, 340, {
    xMax: 500, yMin: -maxDrop, yMax: 10, xStep: 100, yStep: maxDrop > 150 ? 50 : 25, xLabel: "RANGE (m)", yLabel: "DROP vs LINE OF SIGHT (cm)", title: "BULLET PATH",
    series: [{ label: r.ballistics.caliber, color: sh.accent, pts: trajectoryTable(r.ballistics, Array.from({ length: 51 }, (_, i) => i * 10)).map(t => [t.range, t.range === 0 ? -r.ballistics.sightHeight * 100 : -t.dropCm] as [number, number]) }],
  });
  return sh;
}

// ------------------------------------------------------------------ flora
async function floraPlate(ctx: BookCtx, meta: SheetMeta, items: FloraBlueprint[], subtitle: string): Promise<Sheet> {
  const sh = new Sheet(false);
  sh.frame(meta);
  header(sh, meta, subtitle);
  const A = sh.area;
  const boxes = await Promise.all(items.map(f => boxOf(f.id)));
  const hmax = Math.max(...boxes.map(b => b.max.y)) + 0.2;
  const wsum = boxes.reduce((a, b) => a + (b.max.z - b.min.z), 0) + items.length * 0.4;
  const sc = pickScale(Math.min((A.w - 200) / wsum, (sh.tb.y - A.y - 360) / hmax));
  const s = sc.pxPerM;
  meta.scale = sc.label;
  const ground = A.y + 220 + hmax * s;
  let x = A.x + 150;
  human(sh, A.x + 80, ground, s);
  for (let i = 0; i < items.length; i++) {
    const b = boxes[i], f = items[i];
    const w = b.max.z - b.min.z, h = b.max.y;
    await place(ctx, sh, f.id, "left", s, x, ground - (b.max.y - b.min.y) * s);
    sh.text(f.drawing, x + w * s / 2, ground + 44, { size: 22, weight: 900, align: "center" });
    sh.text(f.title.toUpperCase(), x + w * s / 2, ground + 72, { size: 17, weight: 700, align: "center", maxWidth: Math.max(140, w * s + 40) });
    sh.text(f.latin, x + w * s / 2, ground + 98, { size: 15, weight: 500, align: "center", italic: true, font: "body", color: sh.ink2, maxWidth: Math.max(140, w * s + 40) });
    sh.text(len(h), x + w * s / 2, ground - h * s - 14, { size: 16, weight: 700, align: "center", color: sh.ink2 });
    x += w * s + 0.4 * s + 20;
  }
  sh.line(A.x + 30, ground, x, ground, sh.ink, 2);
  const ny = ground + 170;
  const colW = (A.w - 100) / 3;
  items.forEach((f, i) => {
    const cx = A.x + 40 + (i % 3) * colW, cy = ny + Math.floor(i / 3) * 70;
    if (cy > sh.tb.y - 40 && cx + colW > sh.tb.x) return;
    sh.text(`${f.drawing} ${f.title}`, cx, cy, { size: 17, weight: 800 });
    sh.text(f.facts[0] ?? "", cx, cy + 24, { size: 15, font: "body", color: sh.ink2, maxWidth: colW - 30 });
  });
  void ny;
  return sh;
}

// ------------------------------------------------------------------ reserves (paper survey sheets)
async function reserveSheet(_ctx: BookCtx, meta: SheetMeta, def: ReserveDef): Promise<Sheet> {
  const sh = new Sheet(true);
  sh.frame(meta);
  header(sh, meta, `${def.tagline} · 5 m contours, 25 m index contours · grid 100 m`);
  const A = sh.area;
  const t: TerrainData = generateTerrain(def, 257);
  const S = Math.round(sh.tb.y - (A.y + 120) - 14);           // keep the map clear of the title block
  const map = renderTopo(t, { size: S, style: "print", grid: true, labels: true, landmarks: true });
  const mx = A.x + 40, my = A.y + 120;
  sh.image(map, mx, my, S, S);
  sh.rect(mx, my, S, S, sh.ink, 3);
  // trailhead and need-zones
  const g = sh.g;
  const [tx, ty] = worldToMap(t, def.spawn.x, def.spawn.z, S);
  g.save(); g.fillStyle = sh.accent; g.beginPath(); g.arc(mx + tx, my + ty, 13, 0, Math.PI * 2); g.fill(); g.restore();
  const thW = sh.measure("TRAILHEAD", { size: 20, weight: 800 });
  const thRight = tx + 20 + thW < S - 10;
  sh.text("TRAILHEAD", thRight ? mx + tx + 20 : mx + tx - 20, my + ty + 8, { size: 20, weight: 800, color: sh.accent, align: thRight ? "left" : "right" });
  for (const z of def.zones) {
    const [zx, zy] = worldToMap(t, z.x, z.z, S);
    g.save(); g.strokeStyle = z.kind === "water" ? "#1f6f8b" : z.kind === "bed" ? "#6b4aa0" : "#4f7a26"; g.lineWidth = 2.5; g.setLineDash([10, 7]);
    g.beginPath(); g.arc(mx + zx, my + zy, z.r / (t.half * 2) * S, 0, Math.PI * 2); g.stroke(); g.restore();
  }
  // north arrow + scale bar
  const nx = tx > S - 220 && ty < 200 ? mx + 70 : mx + S - 70, ny = my + 90;   // dodge a trailhead in the corner
  g.save(); g.fillStyle = sh.ink; g.beginPath(); g.moveTo(nx, ny - 50); g.lineTo(nx + 20, ny + 20); g.lineTo(nx, ny + 8); g.lineTo(nx - 20, ny + 20); g.closePath(); g.fill(); g.restore();
  sh.text("N", nx, ny + 56, { size: 30, weight: 900, align: "center" });
  const k = S / (t.half * 2);
  g.save(); g.fillStyle = "rgba(246,242,231,0.9)"; g.fillRect(mx + 30, my + S - 90, 300 * k + 60, 64); g.restore();
  for (let i = 0; i < 3; i++) { g.save(); g.fillStyle = i % 2 ? sh.bg : sh.ink; g.fillRect(mx + 50 + i * 100 * k, my + S - 52, 100 * k, 12); g.restore(); }
  sh.rect(mx + 50, my + S - 52, 300 * k, 12, sh.ink, 1.5);
  [0, 100, 200, 300].forEach(v => sh.text(v === 300 ? "300 m" : String(v), mx + 50 + v * k, my + S - 60, { size: 16, weight: 700, align: "center" }));
  // legend
  const lx = mx + S + 60, lw = A.x + A.w - lx - 30;
  let ly = A.y + 140;
  sh.text("LEGEND", lx, ly, { size: 26, weight: 800, spacing: 3 }); ly += 30;
  const legend: [string, (x: number, y: number) => void][] = [
    ["Contour, 5 m", (x, y) => sh.line(x, y, x + 70, y, "rgba(160,110,60,0.6)", 1.3)],
    ["Index contour, 25 m", (x, y) => sh.line(x, y, x + 70, y, "rgba(140,90,40,0.9)", 2.4)],
    ["Trail", (x, y) => sh.line(x, y, x + 70, y, "rgba(120,60,30,0.9)", 2.4, [10, 6])],
    ["Play boundary", (x, y) => sh.line(x, y, x + 70, y, "rgba(200,40,40,0.8)", 2, [12, 8])],
    ["Water (by depth)", (x, y) => { g.save(); g.fillStyle = "#6aa6d2"; g.fillRect(x, y - 12, 70, 22); g.restore(); }],
    ["Forest cover", (x, y) => { g.save(); g.fillStyle = "#b5d29b"; g.fillRect(x, y - 12, 70, 22); g.restore(); }],
    ["Feeding / water / bedding area", (x, y) => { g.save(); g.lineWidth = 2.5; g.setLineDash([8, 6]); g.strokeStyle = "#4f7a26"; g.beginPath(); g.arc(x + 14, y, 12, 0, Math.PI * 2); g.stroke(); g.strokeStyle = "#1f6f8b"; g.beginPath(); g.arc(x + 40, y, 12, 0, Math.PI * 2); g.stroke(); g.strokeStyle = "#6b4aa0"; g.beginPath(); g.arc(x + 66, y, 12, 0, Math.PI * 2); g.stroke(); g.restore(); }],
  ];
  for (const [label, draw] of legend) { ly += 40; draw(lx, ly - 6); sh.text(label, lx + 96, ly, { size: 19, font: "body" }); }
  ly += 30;
  const kinds = [...new Set(def.landmarks.map(l => l.kind))];
  for (const kd of kinds) { ly += 40; drawLandmark(g, { kind: kd, x: 0, z: 0, rot: 0 }, [lx + 30, ly - 7], 1400, "print"); sh.text(kd.replace("-", " ").toUpperCase(), lx + 96, ly, { size: 18, weight: 700 }); }
  ly += 50;
  ly = sh.table(lx, ly, [210, Math.max(200, lw - 210)], [
    ["SIZE", `${def.size} × ${def.size} m (playable ${def.size - 100} m)`],
    ["RELIEF", `${Math.round(t.minH)} to ${Math.round(t.maxH)} m`],
    ["NATIVE GAME", def.fauna.join(", ")],
    ["CONTRACTS", MISSIONS.filter(m => m.reserve === def.name || (def.id === "horizon-crossing" && m.reserve === "All Reserves")).map(m => String(m.id).padStart(2, "0")).join(" · ") || "—"],
    ["LANDMARKS", String(def.landmarks.length)],
  ], { size: 17, rowH: 32, title: "SURVEY DATA" });
  // terrain profile from the trailhead across the reserve (right column, above the title block)
  const px0 = lx, pyTop = ly + 70, pw = lw, ph = Math.min(220, sh.tb.y - pyTop - 40);
  if (ph > 80) {
    const p0 = [def.spawn.x, def.spawn.z], p1 = [-def.spawn.x * 0.9, -def.spawn.z * 0.9];
    const N = 240, hs: number[] = [], ws: (number | null)[] = [];
    for (let i = 0; i <= N; i++) { const u = i / N; const x = p0[0] + (p1[0] - p0[0]) * u, z = p0[1] + (p1[1] - p0[1]) * u; hs.push(heightAt(t, x, z)); ws.push(waterLevelAt(t, x, z)); }
    const lo = Math.min(...hs) - 5, hi = Math.max(...hs) + 5;
    const Y = (h: number) => pyTop + ph - (h - lo) / (hi - lo) * ph;
    g.save(); g.beginPath(); g.moveTo(px0, pyTop + ph);
    hs.forEach((h, i) => g.lineTo(px0 + i / N * pw, Y(h)));
    g.lineTo(px0 + pw, pyTop + ph); g.closePath(); g.fillStyle = "rgba(23,35,52,0.12)"; g.fill();
    g.beginPath(); hs.forEach((h, i) => { const x = px0 + i / N * pw; if (i) g.lineTo(x, Y(h)); else g.moveTo(x, Y(h)); }); g.strokeStyle = sh.ink; g.lineWidth = 2.5; g.stroke();
    ws.forEach((w, i) => { if (w !== null && hs[i] < w) { g.fillStyle = "rgba(60,130,190,0.55)"; g.fillRect(px0 + i / N * pw, Y(w), pw / N + 1, Y(hs[i]) - Y(w)); } });
    g.restore();
    sh.rect(px0, pyTop, pw, ph, sh.ink, 1.5);
    const dist = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const ve = (ph / (hi - lo)) / (pw / dist);
    sh.text(`TERRAIN PROFILE · TRAILHEAD → ACROSS THE RESERVE · ${Math.round(dist)} m`, px0, pyTop - 14, { size: 18, weight: 800, spacing: 1, maxWidth: pw });
    sh.text(`ELEVATION ${Math.round(lo + 5)} to ${Math.round(hi - 5)} m · VERTICAL EXAGGERATION ×${ve.toFixed(1)}`, px0, pyTop + ph + 26, { size: 16, weight: 700, color: sh.ink2, maxWidth: pw });
  }
  return sh;
}

// ------------------------------------------------------------------ ballistics & reticle
async function ballisticsSheet(_ctx: BookCtx, meta: SheetMeta): Promise<Sheet> {
  const sh = new Sheet(false);
  sh.frame(meta);
  header(sh, meta, "All rifles compared · drop, energy and wind drift · BDC reticle as drawn in the riflescope");
  const A = sh.area;
  const cols = [sh.accent, sh.accent2, "#ffb38a"];
  const pts = (f: (t: ReturnType<typeof trajectoryTable>[number]) => number, r: RifleBlueprint) => trajectoryTable(r.ballistics, Array.from({ length: 51 }, (_, i) => i * 10)).map(t => [t.range, f(t)] as [number, number]);
  const worst = Math.max(...RIFLES.map(r => trajectoryTable(r.ballistics, [500])[0].dropCm));
  const yMinD = -Math.ceil(worst / 50) * 50;
  sh.chart(A.x + 130, A.y + 200, 1000, 480, { xMax: 500, yMin: yMinD, yMax: 10, xStep: 100, yStep: 25, xLabel: "RANGE (m)", yLabel: "DROP (cm)", title: "BULLET DROP (100 m ZERO)", series: RIFLES.map((r, i) => ({ label: r.title, color: cols[i], pts: pts(t => (t.range === 0 ? -r.ballistics.sightHeight * 100 : -t.dropCm), r) })) });
  sh.chart(A.x + 130, A.y + 840, 1000, 420, { xMax: 500, yMin: 0, yMax: 6000, xStep: 100, yStep: 1000, xLabel: "RANGE (m)", yLabel: "ENERGY (J)", title: "RETAINED ENERGY", series: RIFLES.map((r, i) => ({ label: r.title, color: cols[i], pts: pts(t => t.energyJ, r) })) });
  // reticle
  const cx = A.x + 1700, cy = A.y + 560, R = 380;
  const g = sh.g;
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fillStyle = "rgba(255,255,255,0.06)"; g.fill(); g.lineWidth = 4; g.strokeStyle = sh.ink; g.stroke(); g.restore();
  const inner = R * 0.42, mag = 9;
  // centre detail drawn enlarged: 5 mil spans most of the fine-wire zone
  const pxPerMil = inner * 0.9 / 5;
  void mag;
  sh.line(cx - R, cy, cx - inner, cy, sh.ink, 10); sh.line(cx + inner, cy, cx + R, cy, sh.ink, 10);
  sh.line(cx, cy - R, cx, cy - inner, sh.ink, 10); sh.line(cx, cy + inner, cx, cy + R, sh.ink, 10);
  sh.line(cx - inner, cy, cx + inner, cy, sh.ink, 2); sh.line(cx, cy - inner, cx, cy + inner, sh.ink, 2);
  for (let m = -5; m <= 5; m++) if (m && Math.abs(m * pxPerMil) < inner) { g.save(); g.fillStyle = sh.ink; g.beginPath(); g.arc(cx + m * pxPerMil, cy, 4, 0, Math.PI * 2); g.fill(); g.restore(); }
  const t308 = trajectoryTable(RIFLES[0].ballistics, [200, 300, 400, 500]);
  for (const t of t308) { const y = cy + t.dropMil * pxPerMil; if (y - cy > inner) continue; const hw = 10 + t.range / 25; sh.line(cx - hw, y, cx + hw, y, sh.accent, 3); sh.text(`${t.range / 100}`, cx + hw + 10, y + 8, { size: 22, weight: 800, color: sh.accent }); }
  sh.text(`DUPLEX-BDC RETICLE · ${RIFLES[0].title} · CENTRE DETAIL, 1 DOT = 1 mil`, cx, cy + R + 50, { size: 22, weight: 800, align: "center", spacing: 2 });
  sh.para("Holdover marks sit at the computed drop for 200, 300, 400 and 500 m (100 m zero); windage dots are 1 mil apart. In the game the marks are scaled with the true field of view, so holds stay correct at every zoom (40° apparent field ÷ magnification).", cx - R, cy + R + 90, 2 * R, { size: 18, font: "body", color: sh.ink2 });
  const rows = RIFLES.map(r => { const tt = trajectoryTable(r.ballistics, [200, 300, 400, 500]); return [r.title, ...tt.map(t => `${t.dropMil.toFixed(1)} mil`)]; });
  sh.table(A.x + 1300, A.y + A.h - 480, [260, 120, 120, 120, 120], rows, { head: ["HOLD", "200 m", "300 m", "400 m", "500 m"], size: 17, rowH: 32, title: "HOLDOVER" });
  return sh;
}

// ------------------------------------------------------------------ the list
export function sheetList(): SheetDef[] {
  const list: SheetDef[] = [];
  const add = (d: SheetDef) => list.push(d);
  add({ id: "cover", drawing: "WH-00", title: "Blueprint Book", subtitle: "Cover and sheet index", section: "Front matter", build: (c, m) => cover(c, m, list) });
  add({ id: "conventions", drawing: "WH-01", title: "Conventions", subtitle: "Coordinate system, views, line types, scoring", section: "Front matter", build: conventions });
  for (const bp of WILDLIFE) {
    add({ id: `${bp.id}-ga`, drawing: `${bp.drawing}.1`, title: `${bp.title} — General Arrangement`, subtitle: bp.subtitle ?? "", section: "Wildlife", rev: bp.rev, build: (c, m) => animalGA(c, m, bp) });
    add({ id: `${bp.id}-anatomy`, drawing: `${bp.drawing}.2`, title: `${bp.title} — Anatomy & Vitals`, subtitle: "X-ray, skeleton, organs and shot placement", section: "Wildlife", rev: bp.rev, build: (c, m) => animalAnatomy(c, m, bp) });
    add({ id: `${bp.id}-gaits`, drawing: `${bp.drawing}.3`, title: `${bp.title} — Gaits & Sign`, subtitle: "Gait sequences, footfalls, tracks, senses, trophy", section: "Wildlife", rev: bp.rev, build: (c, m) => animalGaits(c, m, bp) });
  }
  for (const r of RIFLES) {
    add({ id: `${r.id}-ga`, drawing: `${r.drawing}.1`, title: `${r.title} — General Arrangement`, subtitle: r.subtitle ?? "", section: "Gear", rev: r.rev, build: (c, m) => rifleGA(c, m, r) });
    add({ id: `${r.id}-data`, drawing: `${r.drawing}.2`, title: `${r.title} — Assembly & Ballistics`, subtitle: "Exploded assembly, parts and trajectory", section: "Gear", rev: r.rev, build: (c, m) => rifleData(c, m, r) });
  }
  for (const a of [BINOCULARS, CALLER, CARTRIDGE]) add({ id: a.id, drawing: a.drawing, title: a.title, subtitle: a.subtitle ?? "", section: "Gear", rev: a.rev, build: (c, m) => assemblySheet(c, m, a) });
  for (const a of STRUCTURES) add({ id: a.id, drawing: a.drawing, title: a.title, subtitle: a.subtitle ?? "", section: a.category === "vehicle" ? "Vehicles" : "Structures", rev: a.rev, build: (c, m) => assemblySheet(c, m, a) });
  const trees = FLORA.filter(f => ["spruce", "pole-pine", "scots-pine", "broadleaf", "aspen", "birch", "juniper", "willow", "snag"].includes(f.form));
  const low = FLORA.filter(f => !trees.includes(f));
  add({ id: "flora-trees", drawing: "F-01…09", title: "Flora — Trees", subtitle: "Side elevations at a common scale with a 1.80 m figure", section: "Flora", rev: "B", build: (c, m) => floraPlate(c, m, trees, "Trees of the five reserves · side elevations at a common scale") });
  add({ id: "flora-ground", drawing: "F-10…15", title: "Flora — Shrubs, Rocks & Reeds", subtitle: "Ground cover and hunting cover", section: "Flora", rev: "B", build: (c, m) => floraPlate(c, m, low, "Shrubs, heather, sage, boulders, logs and reeds · cover for hunter and game") });
  for (const def of Object.values(RESERVES)) add({ id: def.id, drawing: def.drawing, title: `${def.name} — Survey Sheet`, subtitle: def.tagline, section: "Reserves", paper: true, build: (c, m) => reserveSheet(c, m, def) });
  add({ id: "ballistics", drawing: "B-01", title: "Ballistics & Reticle", subtitle: "Trajectories and BDC reticle", section: "Ballistics", build: ballisticsSheet });
  return list;
}

export type { BlueprintMeta };
export { VIEWS, SW };
