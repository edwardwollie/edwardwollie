// Blueprint book renderer. Open index.html?sheet=N to preview a sheet; the
// export script drives window.__book to write every sheet and every single
// view (the "view packs") as PNG files.

import "@fontsource/barlow-condensed/latin-500.css";
import "@fontsource/barlow-condensed/latin-600.css";
import "@fontsource/barlow-condensed/latin-700.css";
import "@fontsource/barlow-condensed/latin-800.css";
import "@fontsource/barlow-condensed/latin-900.css";
import "@fontsource-variable/inter/wght.css";
import * as THREE from "three";
import { Snapshotter } from "../../app/game3d/render/snapshots.ts";
import { ALL_VIEWS, projectedExtent, VIEWS, type ViewName } from "../../app/game3d/render/views.ts";
import { buildBlueprintObject } from "../../app/game3d/models/registry.ts";
import { WILDLIFE } from "../../app/game3d/blueprints/wildlife/index.ts";
import { GEAR } from "../../app/game3d/blueprints/gear.ts";
import { STRUCTURES } from "../../app/game3d/blueprints/structures.ts";
import { FLORA } from "../../app/game3d/blueprints/flora.ts";
import type { BlueprintMeta } from "../../app/game3d/blueprints/types.ts";
import { pickScale } from "./kit.ts";
import { sheetList, type BookCtx } from "./sheets.ts";

const canvas = document.createElement("canvas");
canvas.width = 64; canvas.height = 64;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const snap = new Snapshotter(renderer);
const ctx: BookCtx = { snap, date: new URLSearchParams(location.search).get("date") ?? new Date().toISOString().slice(0, 10) };
const list = sheetList();

async function fonts() {
  const fams = ["500 20px 'Barlow Condensed'", "600 20px 'Barlow Condensed'", "700 20px 'Barlow Condensed'", "800 20px 'Barlow Condensed'", "900 20px 'Barlow Condensed'", "400 20px 'Inter Variable'", "italic 400 20px 'Inter Variable'"];
  await Promise.all(fams.map(f => document.fonts.load(f).catch(() => null)));
  await document.fonts.ready;
}

async function renderSheet(i: number): Promise<HTMLCanvasElement> {
  const d = list[i];
  const meta = { drawing: d.drawing, title: d.title, subtitle: d.subtitle, scale: "AS SHOWN", rev: d.rev ?? "A", sheetNo: i + 1, sheetCount: list.length, section: d.section, date: ctx.date };
  const sh = await d.build(ctx, meta);
  sh.finish();                     // frame + title block last, with the final scale
  return sh.c;
}

// ------------------------------------------------------------------ single-view plates (view packs)
interface PlateOpts { sex?: "male" | "female"; style?: "blueprint" | "shaded"; pose?: string }
const META: Record<string, BlueprintMeta & { latin?: string }> = Object.fromEntries([...WILDLIFE, ...GEAR, ...STRUCTURES, ...FLORA].map(m => [m.id, m]));

async function plate(id: string, view: ViewName, o: PlateOpts = {}): Promise<HTMLCanvasElement> {
  const W = 1800, H = 1200, band = 120;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  const shaded = o.style === "shaded";
  // background + grid
  g.fillStyle = shaded ? "#1b2a36" : "#1f5c99"; g.fillRect(0, 0, W, H);
  if (!shaded) {
    for (let x = 0, i = 0; x <= W; x += 24, i++) { g.fillStyle = i % 5 ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.12)"; g.fillRect(x, 0, 1, H - band); }
    for (let y = 0, i = 0; y <= H - band; y += 24, i++) { g.fillStyle = i % 5 ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.12)"; g.fillRect(0, y, W, 1); }
  }
  // drawing, scaled to fit with a standard scale
  const built = await buildBlueprintObject(id, { sex: o.sex ?? "male", age: 1, seed: 1, pose: o.pose });
  built.object.updateMatrixWorld(true);
  const box = (built.box ?? new THREE.Box3().setFromObject(built.object)).clone();
  built.object.traverse(x => { const m = x as THREE.Mesh; if (m.isMesh) m.geometry?.dispose(); });
  const ext = projectedExtent(box, view);
  const aw = W - 220, ah = H - band - 200;
  const MMpx = 1800 / 297;                                  // plate printed at A4 landscape width ≈ 297 mm
  const fitPxPerM = Math.min(aw / (ext.maxX - ext.minX), ah / (ext.maxY - ext.minY));
  const sc = (() => { const p = pickScale(fitPxPerM * (5.905 / MMpx)); return { label: p.label, pxPerM: p.pxPerM * (MMpx / 5.905) }; })();
  const s = sc.pxPerM;
  const pad = 10;
  const w = Math.round((ext.maxX - ext.minX) * s + 2 * pad), h = Math.round((ext.maxY - ext.minY) * s + 2 * pad);
  const sn = await snap.get(id, { view, w, h, style: shaded ? "shaded" : "sheet", sex: o.sex ?? "male", age: 1, seed: 1, pose: o.pose, halfHeight: h / 2 / s, margin: 0, ss: 2, noUrl: true, thick: 1.3 });
  const x0 = Math.round((W - w) / 2), y0 = Math.round((H - band - h) / 2);
  g.drawImage(sn.canvas, x0, y0);
  // dimension lines (orthographic views)
  const ink = "#f2f8ff";
  const label = (t: string, x: number, y: number, size: number, weight = 700, align: CanvasTextAlign = "left", color = ink) => { g.font = `${weight} ${size}px 'Barlow Condensed', sans-serif`; g.fillStyle = color; g.textAlign = align; g.fillText(t, x, y); };
  const isIso = view === "iso" || view === "isoRear";
  if (!isIso) {
    const L = x0 + pad, R = x0 + w - pad, T = y0 + pad, B = y0 + h - pad;
    g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = 1.5;
    const arrow = (x: number, y: number, a: number) => { g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.moveTo(0, 0); g.lineTo(-14, -4.5); g.lineTo(-14, 4.5); g.closePath(); g.fill(); g.restore(); };
    const dy = B + 50;
    g.beginPath(); g.moveTo(L, B + 8); g.lineTo(L, dy + 10); g.moveTo(R, B + 8); g.lineTo(R, dy + 10); g.moveTo(L, dy); g.lineTo(R, dy); g.stroke(); arrow(L, dy, Math.PI); arrow(R, dy, 0);
    const wv = ext.maxX - ext.minX, hv = ext.maxY - ext.minY;
    const fmt = (v: number) => (v >= 1 ? `${v.toFixed(2)} m` : `${Math.round(v * 1000)} mm`);
    g.fillStyle = shaded ? "#1b2a36" : "#1f5c99"; const tw = 160; g.fillRect((L + R) / 2 - tw / 2, dy - 14, tw, 28);
    label(fmt(wv), (L + R) / 2, dy + 8, 24, 700, "center");
    const dx = R + 50;
    g.beginPath(); g.moveTo(R + 8, T); g.lineTo(dx + 10, T); g.moveTo(R + 8, B); g.lineTo(dx + 10, B); g.moveTo(dx, T); g.lineTo(dx, B); g.stroke(); arrow(dx, T, -Math.PI / 2); arrow(dx, B, Math.PI / 2);
    g.save(); g.translate(dx, (T + B) / 2); g.rotate(-Math.PI / 2); g.fillStyle = shaded ? "#1b2a36" : "#1f5c99"; g.fillRect(-tw / 2, -14, tw, 28); label(fmt(hv), 0, 8, 24, 700, "center"); g.restore();
  }
  // title band
  const m = META[id];
  g.fillStyle = shaded ? "#101c26" : "#174a80"; g.fillRect(0, H - band, W, band);
  g.fillStyle = ink; g.fillRect(0, H - band, W, 3);
  label(m?.drawing ?? id, 40, H - band + 72, 60, 900);
  g.font = "900 60px 'Barlow Condensed', sans-serif";
  const dw = g.measureText(m?.drawing ?? id).width;
  label((m?.title ?? id).toUpperCase(), 40 + dw + 30, H - band + 56, 38, 800);
  label(`${shaded ? "COLOUR RENDER · " : ""}${VIEWS[view].label}${o.sex === "female" ? " · FEMALE" : ""}${o.pose === "explode" ? " · EXPLODED" : ""} · SCALE ${sc.label} ON A4`, 40 + dw + 32, H - band + 92, 22, 700, "left", "#c9def5");
  label("WILDFRONT HORIZON 3D · BLUEPRINT VIEW PACK", W - 40, H - band + 56, 24, 800, "right");
  label("FLEXZONIC GAMES · GENERATED FROM GAME DATA", W - 40, H - band + 90, 18, 700, "right", "#c9def5");
  return c;
}

/** Every single view in the packs: [file name, id, view, opts]. */
function viewJobs(): { file: string; group: string; id: string; view: ViewName; o: PlateOpts }[] {
  const jobs: { file: string; group: string; id: string; view: ViewName; o: PlateOpts }[] = [];
  const views8 = ALL_VIEWS;
  for (const w of WILDLIFE) {
    for (const v of views8) jobs.push({ file: `${w.drawing}_${w.id}_${v}.png`, group: "wildlife", id: w.id, view: v, o: {} });
    for (const v of ["left", "front", "iso"] as ViewName[]) jobs.push({ file: `${w.drawing}_${w.id}_female_${v}.png`, group: "wildlife", id: w.id, view: v, o: { sex: "female" } });
    jobs.push({ file: `${w.drawing}_${w.id}_colour_iso.png`, group: "wildlife", id: w.id, view: "iso", o: { style: "shaded" } });
  }
  for (const a of GEAR) {
    for (const v of views8) jobs.push({ file: `${a.drawing}_${a.id}_${v}.png`, group: "gear", id: a.id, view: v, o: {} });
    jobs.push({ file: `${a.drawing}_${a.id}_exploded_iso.png`, group: "gear", id: a.id, view: "iso", o: { pose: "explode" } });
    jobs.push({ file: `${a.drawing}_${a.id}_colour_iso.png`, group: "gear", id: a.id, view: "iso", o: { style: "shaded" } });
  }
  for (const a of STRUCTURES) {
    for (const v of views8) jobs.push({ file: `${a.drawing}_${a.id}_${v}.png`, group: "structures", id: a.id, view: v, o: {} });
    jobs.push({ file: `${a.drawing}_${a.id}_exploded_iso.png`, group: "structures", id: a.id, view: "iso", o: { pose: "explode" } });
    jobs.push({ file: `${a.drawing}_${a.id}_colour_iso.png`, group: "structures", id: a.id, view: "iso", o: { style: "shaded" } });
  }
  for (const f of FLORA) {
    for (const v of ["left", "front", "top", "iso"] as ViewName[]) jobs.push({ file: `${f.drawing}_${f.id}_${v}.png`, group: "flora", id: f.id, view: v, o: {} });
    jobs.push({ file: `${f.drawing}_${f.id}_colour_iso.png`, group: "flora", id: f.id, view: "iso", o: { style: "shaded" } });
  }
  return jobs;
}

const book = {
  list: () => list.map((d, i) => ({ n: i + 1, id: d.id, drawing: d.drawing, title: d.title, section: d.section })),
  async sheet(i: number): Promise<string> { const c = await renderSheet(i); return c.toDataURL("image/png"); },
  jobs: () => viewJobs().map(j => ({ file: j.file, group: j.group })),
  async view(k: number): Promise<string> { const j = viewJobs()[k]; const c = await plate(j.id, j.view, j.o); return c.toDataURL("image/png"); },
};
(window as unknown as { __book: typeof book }).__book = book;

(async () => {
  await fonts();
  const q = new URLSearchParams(location.search);
  const el = document.getElementById("out")!;
  if (q.has("sheet")) {
    const c = await renderSheet(Number(q.get("sheet")) - 1);
    c.style.width = "100%"; el.appendChild(c);
  } else if (q.has("view")) {
    const c = await plate(q.get("id") ?? "elk", q.get("view") as ViewName, { sex: (q.get("sex") as "male" | "female") ?? undefined, style: q.get("style") === "shaded" ? "shaded" : "blueprint", pose: q.get("pose") ?? undefined });
    c.style.width = "100%"; el.appendChild(c);
  } else {
    el.innerHTML = `<h1>Wildfront Horizon 3D — blueprint book</h1><ol>${list.map((d, i) => `<li><a href="?sheet=${i + 1}">${d.drawing} · ${d.title}</a></li>`).join("")}</ol>`;
  }
  (window as unknown as { __ready: boolean }).__ready = true;
})().catch(e => { document.body.insertAdjacentHTML("beforeend", `<pre style="color:#f88">${String((e as Error)?.stack ?? e)}</pre>`); (window as unknown as { __ready: boolean }).__ready = true; });
