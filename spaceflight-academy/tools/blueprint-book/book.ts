/**
 * Spaceflight Academy blueprint book generator (runs in the browser via Vite).
 *
 * Every sheet is drawn from the SAME blueprint specs the game uses
 * (src/v3/blueprints), so the book can never drift from the 3D models.
 *   window.__book.list()          → sheet specs in book order
 *   window.__book.sheet(spec)     → draws one A3 landscape sheet (2339 × 1654 px)
 *   window.__book.single(spec)    → draws one view of one blueprint for the views pack
 * tools/blueprint-book/render.mjs drives this page with Playwright.
 */
import "@fontsource-variable/fredoka";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { BLUEPRINTS, getBlueprint } from "../../src/v3/blueprints/registry.ts";
import type { Blueprint, Part, ViewName } from "../../src/v3/blueprints/types.ts";
import { G, P, S } from "../../src/v3/blueprints/kit.ts";
import { CADETS } from "../../src/v3/blueprints/cast.ts";
import { buildBlueprint, measure, setExplode, type BuiltModel } from "../../src/v3/models/build.ts";
import { applyPose } from "../../src/v3/models/rig.ts";
import { frameView, projectedExtent } from "../../src/v3/models/views.ts";
import { BLUEPRINT_STYLE, BlueprintRenderer } from "../../src/v3/models/blueprint-render.ts";
import { BUILDINGS, CAMPUS, PLANET_WALK, PLANET_WALK_Z, stationPads, toWorld, walkStopX } from "../../src/v3/world/campus.ts";
import { BODIES, MOON_COUNT_NOTE } from "../../src/v3/data/solar.ts";
import { PHYSICS, SYSTEM_IDS, partInfo } from "../../src/v3/engineering/systems.ts";
import { ACTIVITY_BY_WORLD, DESTINATIONS, RANGE_BY_WORLD } from "../../src/v3/engineering/missions.ts";
import { WORLDS } from "../../src/flight-data.ts";

declare const __APP_VERSION__: string;

export type SheetSpec =
  | { kind: "cover" }
  | { kind: "howto" }
  | { kind: "cast" }
  | { kind: "part"; id: string }
  | { kind: "exploded"; id: string }
  | { kind: "systems" }
  | { kind: "site" }
  | { kind: "solar" }
  | { kind: "route" };

export interface SingleSpec { id: string; view: ViewName | "colour"; width: number; height: number }

const W = 2339, H = 1654;
/** A3 landscape: 420 mm across 2339 px. */
const MM_PER_PX = 420 / W;
const DATE = "2026-10-01";
const VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "3.0.0";
const NICE_SCALES = [1, 2, 2.5, 5, 10, 15, 20, 25, 40, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000, 1250, 1500, 2000, 2500, 5000];
const VIEW_TITLE: Record<ViewName, string> = { front: "FRONT VIEW", back: "BACK VIEW", left: "LEFT VIEW", right: "RIGHT VIEW", top: "TOP VIEW", bottom: "BOTTOM VIEW", iso: "ISOMETRIC VIEW" };
const GOLD = "#ffe27a";
const LINE = "#f4f8ff";

const sheetEl = document.getElementById("sheet") as HTMLDivElement;
const canvas = document.getElementById("gl") as HTMLCanvasElement;
const svgEl = document.getElementById("svg") as unknown as SVGSVGElement;
const htmlEl = document.getElementById("html") as HTMLDivElement;
const bgEl = document.getElementById("bg") as HTMLDivElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const pmrem = new THREE.PMREMGenerator(renderer);
const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const lineArt = new BlueprintRenderer(renderer, { ...BLUEPRINT_STYLE, transparentBackground: true, lineWidth: 1.35 });
const lineArtOpaque = new BlueprintRenderer(renderer, { ...BLUEPRINT_STYLE, lineWidth: 1.6, gridSize: 28 });

// ------------------------------------------------------------------ helpers

function setSize(width: number, height: number, plain = false) {
  sheetEl.style.width = `${width}px`;
  sheetEl.style.height = `${height}px`;
  sheetEl.classList.toggle("plain", plain);
  renderer.setSize(width, height, false);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  svgEl.setAttribute("width", String(width));
  svgEl.setAttribute("height", String(height));
  svgEl.setAttribute("viewBox", `0 0 ${width} ${height}`);
}

function clearAll() {
  renderer.setScissorTest(false);
  renderer.setRenderTarget(null);
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, true, true);
  svgEl.innerHTML = "";
  htmlEl.innerHTML = "";
  bgEl.innerHTML = "";
  sheetEl.style.background = "";
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function html(markup: string) {
  htmlEl.insertAdjacentHTML("beforeend", markup);
}

function svg(markup: string) {
  svgEl.insertAdjacentHTML("beforeend", markup);
}

/** Panel: the background goes UNDER the WebGL canvas, the text goes on top, so renders inside panels stay visible. */
function box(x: number, y: number, w: number, h: number, inner: string, extra = "", style = "") {
  bgEl.insertAdjacentHTML("beforeend", `<div class="box ${extra}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;box-sizing:border-box;${style}"></div>`);
  if (inner) html(`<div class="box-c" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;padding:16px 20px">${inner}</div>`);
}

function fmt(m: number) {
  if (m >= 100) return `${m.toFixed(1)} m`;
  if (m >= 1) return `${m.toFixed(2)} m`;
  return `${(m * 100).toFixed(m < 0.1 ? 1 : 0)} cm`;
}

interface Built { bp: Blueprint; model: BuiltModel; scene: THREE.Scene; box: THREE.Box3 }

function lights(scene: THREE.Scene) {
  scene.environment = env;
  scene.add(new THREE.HemisphereLight(0xe2ecff, 0x3a3550, 0.95));
  const key = new THREE.DirectionalLight(0xffffff, 2.3);
  key.position.set(5, 9, 7);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fd8ff, 1.0);
  rim.position.set(-6, 4, -5);
  scene.add(rim);
}

function build(bpOrId: Blueprint | string, explode = 0): Built {
  const bp = typeof bpOrId === "string" ? getBlueprint(bpOrId)! : bpOrId;
  const model = buildBlueprint(bp, { resolve: getBlueprint, quality: "high", shadows: false });
  if (bp.rig) applyPose(model, "rest");
  if (explode) setExplode(model, explode);
  const scene = new THREE.Scene();
  lights(scene);
  scene.add(model.root);
  model.root.updateMatrixWorld(true);
  return { bp, model, scene, box: measure(model.root) };
}

/** CSS-pixel rectangle (top-left origin) → WebGL viewport (bottom-left origin). */
function glRect(x: number, y: number, w: number, h: number, sheetH = H) {
  return { x: Math.round(x), y: Math.round(sheetH - y - h), width: Math.round(w), height: Math.round(h) };
}

function renderLine(scene: THREE.Scene, camera: THREE.Camera, x: number, y: number, w: number, h: number, sheetH = H, opaque = false) {
  (opaque ? lineArtOpaque : lineArt).render(scene, camera, glRect(x, y, w, h, sheetH));
}

function renderColour(scene: THREE.Scene, camera: THREE.Camera, x: number, y: number, w: number, h: number, sheetH = H) {
  const r = glRect(x, y, w, h, sheetH);
  renderer.setScissorTest(true);
  renderer.setViewport(r.x, r.y, r.width, r.height);
  renderer.setScissor(r.x, r.y, r.width, r.height);
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, true, true);
  renderer.render(scene, camera);
  renderer.setScissorTest(false);
  const size = renderer.getSize(new THREE.Vector2());
  renderer.setViewport(0, 0, size.x, size.y);
}

/** Orthographic camera showing `view` of `bx` at `pxPerM`, centred in a w × h viewport. */
function orthoCamera(bx: THREE.Box3, view: ViewName, w: number, h: number, pxPerM: number) {
  const hh = h / 2 / pxPerM;
  return frameView(bx, view, w / h, 0, hh).camera;
}

/** Colour isometric (or 3/4) camera fitting the box into w × h with a margin. */
function isoCamera(bx: THREE.Box3, w: number, h: number, margin = 0.1) {
  return frameView(bx, "iso", w / h, margin).camera;
}

function niceScale(pxPerM: number) {
  const exact = 1000 / (pxPerM * MM_PER_PX);
  const S = NICE_SCALES.find((s) => s >= exact) ?? Math.ceil(exact / 1000) * 1000;
  return { S, pxPerM: 1000 / (S * MM_PER_PX) };
}

function arrowDefs() {
  svg(`<defs>
    <marker id="arr" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M0,0.5 L10,5 L0,9.5 z" fill="${GOLD}"/></marker>
    <marker id="arrw" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M0,0.5 L10,5 L0,9.5 z" fill="${LINE}"/></marker>
  </defs>`);
}

/** Dimension line with extension lines and a centred label. */
function dimH(x1: number, x2: number, y: number, fromY: number, text: string) {
  svg(`<line x1="${x1}" y1="${fromY}" x2="${x1}" y2="${y + (y > fromY ? 10 : -10)}" stroke="${GOLD}" stroke-width="1.3" opacity=".85"/>
    <line x1="${x2}" y1="${fromY}" x2="${x2}" y2="${y + (y > fromY ? 10 : -10)}" stroke="${GOLD}" stroke-width="1.3" opacity=".85"/>
    <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${GOLD}" stroke-width="2" marker-start="url(#arr)" marker-end="url(#arr)"/>
    <text x="${(x1 + x2) / 2}" y="${y - 10}" fill="${GOLD}" font-size="22" font-weight="700" text-anchor="middle" font-family="Fredoka Variable" paint-order="stroke" stroke="#0d3b8e" stroke-width="6">${esc(text)}</text>`);
}

function dimV(y1: number, y2: number, x: number, fromX: number, text: string) {
  const mid = (y1 + y2) / 2;
  svg(`<line x1="${fromX}" y1="${y1}" x2="${x + (x > fromX ? 10 : -10)}" y2="${y1}" stroke="${GOLD}" stroke-width="1.3" opacity=".85"/>
    <line x1="${fromX}" y1="${y2}" x2="${x + (x > fromX ? 10 : -10)}" y2="${y2}" stroke="${GOLD}" stroke-width="1.3" opacity=".85"/>
    <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${GOLD}" stroke-width="2" marker-start="url(#arr)" marker-end="url(#arr)"/>
    <text x="${x - 10}" y="${mid}" fill="${GOLD}" font-size="22" font-weight="700" text-anchor="middle" font-family="Fredoka Variable" transform="rotate(-90 ${x - 10} ${mid})" paint-order="stroke" stroke="#0d3b8e" stroke-width="6">${esc(text)}</text>`);
}

function centreLine(x1: number, y1: number, x2: number, y2: number) {
  svg(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#9fe8ff" stroke-width="1.4" stroke-dasharray="26 6 4 6" opacity=".85"/>`);
}

function scaleBar(x: number, y: number, pxPerM: number, label = "") {
  // Pick a round length that is ~180–320 px long.
  const candidates = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100];
  const len = candidates.find((c) => c * pxPerM >= 180) ?? 100;
  const total = len * pxPerM;
  let blocks = "";
  for (let i = 0; i < 4; i++) blocks += `<rect x="${x + (total / 4) * i}" y="${y}" width="${total / 4}" height="12" fill="${i % 2 ? "#0d3b8e" : LINE}" stroke="${LINE}" stroke-width="1.5"/>`;
  svg(`${blocks}
    <text x="${x}" y="${y + 36}" fill="${LINE}" font-size="17" font-family="Fredoka Variable" font-weight="600">0</text>
    <text x="${x + total}" y="${y + 36}" fill="${LINE}" font-size="17" font-family="Fredoka Variable" font-weight="600" text-anchor="middle">${len >= 1 ? `${len} m` : `${len * 100} cm`}</text>
    ${label ? `<text x="${x}" y="${y - 10}" fill="${LINE}" font-size="16" font-family="Fredoka Variable" font-weight="700" letter-spacing="2">${esc(label)}</text>` : ""}`);
}

/** Third-angle projection symbol (truncated cone + end view). */
function projectionSymbol(x: number, y: number, s = 1) {
  svg(`<g transform="translate(${x} ${y}) scale(${s})" stroke="${LINE}" stroke-width="2" fill="none">
    <path d="M0,0 L44,10 L44,30 L0,40 Z"/>
    <line x1="-6" y1="20" x2="50" y2="20" stroke-dasharray="10 3 2 3" stroke-width="1.2"/>
    <circle cx="82" cy="20" r="20"/><circle cx="82" cy="20" r="10"/>
    <line x1="56" y1="20" x2="108" y2="20" stroke-dasharray="10 3 2 3" stroke-width="1.2"/>
    <line x1="82" y1="-6" x2="82" y2="46" stroke-dasharray="10 3 2 3" stroke-width="1.2"/>
  </g>`);
}

function frame(zones = true) {
  html(`<div class="frame"></div>`);
  if (!zones) return;
  const cols = 8, rows = 6;
  for (let i = 0; i < cols; i++) {
    const cx = 36 + ((W - 72) / cols) * (i + 0.5);
    html(`<div class="zone" style="left:${cx - 4}px;top:12px">${i + 1}</div><div class="zone" style="left:${cx - 4}px;top:${H - 32}px">${i + 1}</div>`);
  }
  for (let j = 0; j < rows; j++) {
    const cy = 36 + ((H - 72) / rows) * (j + 0.5);
    const letter = "ABCDEF"[j];
    html(`<div class="zone" style="left:10px;top:${cy - 10}px">${letter}</div><div class="zone" style="left:${W - 26}px;top:${cy - 10}px">${letter}</div>`);
  }
}

interface TitleInfo { title: string; code: string; scale: string; sheet: number; of: number; subtitle?: string }

function titleBlock(x: number, y: number, w: number, h: number, t: TitleInfo) {
  html(`<div class="tb" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;grid-template-columns:1.25fr .75fr .75fr .8fr;grid-template-rows:1.15fr 1fr 1fr">
    <div style="grid-column:1/3"><small>SPACEFLIGHT ACADEMY · 3D BLUEPRINTS</small><b style="font-size:27px">${esc(t.title)}</b>${t.subtitle ? `<div style="font-size:15px;color:#bfe9ff;margin-top:2px">${esc(t.subtitle)}</div>` : ""}</div>
    <div style="grid-column:3/5"><small>DRAWING NUMBER</small><b style="font-size:34px;color:${GOLD}">${esc(t.code)}</b></div>
    <div><small>SCALE (PRINTED ON A3)</small><b>${esc(t.scale)}</b></div>
    <div><small>UNITS</small><b>METRES</b></div>
    <div><small>PROJECTION</small><b style="font-size:16px">THIRD ANGLE</b></div>
    <div><small>SHEET</small><b>${t.sheet} OF ${t.of}</b></div>
    <div><small>DRAWN BY</small><b style="font-size:17px">SFA BLUEPRINT ENGINE</b></div>
    <div><small>DATE</small><b style="font-size:18px">${DATE}</b></div>
    <div><small>REVISION</small><b>v${esc(VERSION)}</b></div>
    <div><small>STUDIO</small><b style="font-size:16px">FLEXZONIC GAMES</b></div>
  </div>`);
  projectionSymbol(x + w * 0.5 + 92, y + h / 3 + h / 6 - 2, 0.62);
}

const MAT_NAMES: Record<string, string> = {
  white: "Suit white", pearl: "Pearl white", hull: "Hull white", royal: "Royal blue", navy: "Navy blue", sky: "Sky blue", magenta: "Magenta", pink: "Pink",
  cyan: "Cyan", cyanGlow: "Cyan light", pinkGlow: "Pink light", goldGlow: "Gold light", greenGlow: "Green light", redGlow: "Red light", gold: "Gold", goldFoil: "Gold foil",
  orange: "Orange", violet: "Violet", green: "Green", red: "Red", silver: "Silver", steel: "Steel", gunmetal: "Gunmetal", darkMetal: "Dark metal", engineBell: "Nozzle alloy",
  copper: "Copper", black: "Black", rubber: "Rubber", visor: "Visor", screen: "Screen", glass: "Glass", window: "Window glass", solarCell: "Solar cells", heatTile: "Heat tiles",
  ablative: "Ablative shield", concrete: "Concrete", asphalt: "Asphalt", grass: "Grass", sand: "Sand", water: "Water", leaf: "Leaves", bark: "Bark", moonDust: "Moon dust", marsDust: "Mars dust",
};
const matName = (key?: string) => (key ? MAT_NAMES[key] ?? key.replace(/\d+$/, "").replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()) : "—");

interface PartRow { name: string; qty: number; info: string }

function partsList(bp: Blueprint): PartRow[] {
  const rows = new Map<string, PartRow>();
  const add = (name: string, qty: number, info: string) => {
    const hit = rows.get(name);
    if (hit) hit.qty += qty; else rows.set(name, { name, qty, info });
  };
  const visit = (parts: readonly Part[], mult: number) => {
    for (const p of parts) {
      const copies = mult * (p.mirrorX ? 2 : 1) * (p.radial?.count ?? 1);
      if (p.fx || p.hidden) continue;
      if (p.ref) {
        const sub = getBlueprint(p.ref);
        add(p.name ?? sub?.name ?? p.ref, copies, sub ? `Sub-assembly ${sub.code}` : "Sub-assembly");
      } else if (p.name) {
        add(p.name, copies, matName(p.mat ?? firstMat(p)));
      } else if (p.children) visit(p.children, copies);
    }
  };
  visit(bp.parts, 1);
  return [...rows.values()];
}

function firstMat(p: Part): string | undefined {
  if (p.mat) return p.mat;
  for (const c of p.children ?? []) { const m = firstMat(c); if (m) return m; }
  return undefined;
}

function partsTable(rows: PartRow[], max: number) {
  const shown = rows.slice(0, max);
  const more = rows.length - shown.length;
  return `<table><tr><th class="num">No.</th><th>Part</th><th class="num">Qty</th><th>Material / note</th></tr>
    ${shown.map((r, i) => `<tr><td class="num">${i + 1}</td><td>${esc(r.name)}</td><td class="num">${r.qty}</td><td>${esc(r.info)}</td></tr>`).join("")}
    ${more > 0 ? `<tr><td></td><td colspan="3" style="color:#bfe9ff">…plus ${more} more named parts (see the game's Blueprint Studio)</td></tr>` : ""}</table>`;
}

const symmetricX = (b: THREE.Box3) => Math.abs(b.min.x + b.max.x) < (b.max.x - b.min.x) * 0.02;
const symmetricZ = (b: THREE.Box3) => Math.abs(b.min.z + b.max.z) < (b.max.z - b.min.z) * 0.02;

// ------------------------------------------------------------------ sheet list

const ORDER: SheetSpec[] = (() => {
  const list: SheetSpec[] = [{ kind: "cover" }, { kind: "howto" }, { kind: "cast" }];
  const by = (cat: Blueprint["category"]) => BLUEPRINTS.filter((b) => b.category === cat);
  for (const b of by("cast")) list.push({ kind: "part", id: b.id });
  for (const b of by("vehicle")) {
    list.push({ kind: "part", id: b.id });
    if (b.sheet?.exploded) list.push({ kind: "exploded", id: b.id });
  }
  list.push({ kind: "systems" });
  for (const b of by("system")) list.push({ kind: "part", id: b.id });
  list.push({ kind: "site" });
  for (const b of by("spaceport")) list.push({ kind: "part", id: b.id });
  for (const b of by("destination")) list.push({ kind: "part", id: b.id });
  list.push({ kind: "solar" }, { kind: "route" });
  return list;
})();

function sheetCode(spec: SheetSpec) {
  switch (spec.kind) {
    case "cover": return "A-00";
    case "howto": return "A-01";
    case "cast": return "C-00";
    case "systems": return "S-XX";
    case "site": return "B-00";
    case "solar": return "X-01";
    case "route": return "X-02";
    case "exploded": return `${getBlueprint(spec.id)!.code}X`;
    case "part": return getBlueprint(spec.id)!.code;
  }
}

function sheetTitle(spec: SheetSpec) {
  switch (spec.kind) {
    case "cover": return "Cover & contents";
    case "howto": return "How to read a blueprint";
    case "cast": return "Crew line-up";
    case "systems": return "The 12 rocket systems";
    case "site": return "Spaceport site plan";
    case "solar": return "Solar System to scale";
    case "route": return "Mission route";
    case "exploded": return `${getBlueprint(spec.id)!.name}: exploded view`;
    case "part": return getBlueprint(spec.id)!.name;
  }
}

function fileName(spec: SheetSpec, index: number) {
  const code = sheetCode(spec).toLowerCase();
  const slug = sheetTitle(spec).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${String(index + 1).padStart(2, "0")}-${code}-${slug}`;
}

// ------------------------------------------------------------------ orthographic part sheet

function partSheet(bp: Blueprint, index: number) {
  setSize(W, H);
  clearAll();
  arrowDefs();
  frame();
  const built = build(bp);
  const bx = built.box;
  const size = bx.getSize(new THREE.Vector3());
  const Wm = size.x, Hm = size.y, Dm = size.z;
  // Header
  html(`<div style="position:absolute;left:52px;top:44px;width:1560px">
    <div class="kicker">${esc(bp.code)} · ${esc(bp.subtitle)}</div>
    <h1>${esc(bp.name)}</h1></div>`);
  // Drawing area
  const area = { x: 52, y: 150, w: 1580, h: 1450 };
  const gapX = 120, gapY = 128, labelH = 40;
  const fitW = (area.w - 2 * 50 - 3 * gapX) / (2 * Dm + 2 * Wm);
  const fitH = (area.h - 2 * 30 - 2 * gapY - labelH) / (2 * Dm + Hm);
  const { S, pxPerM: s } = niceScale(Math.min(fitW, fitH));
  const cw = [Dm * s, Wm * s, Dm * s, Wm * s];
  const rh = [Dm * s, Hm * s, Dm * s];
  const totalW = cw.reduce((a, b) => a + b, 0) + 3 * gapX;
  const totalH = rh.reduce((a, b) => a + b, 0) + 2 * gapY;
  const left = area.x + (area.w - totalW) / 2 + 20;
  const top = area.y + (area.h - totalH - labelH) / 2 + 30;
  const colX = [left, left + cw[0] + gapX, left + cw[0] + cw[1] + 2 * gapX, left + cw[0] + cw[1] + cw[2] + 3 * gapX];
  const rowY = [top, top + rh[0] + gapY, top + rh[0] + rh[1] + 2 * gapY];
  const layout: Record<Exclude<ViewName, "iso">, { x: number; y: number; w: number; h: number }> = {
    top: { x: colX[1], y: rowY[0], w: cw[1], h: rh[0] },
    left: { x: colX[0], y: rowY[1], w: cw[0], h: rh[1] },
    front: { x: colX[1], y: rowY[1], w: cw[1], h: rh[1] },
    right: { x: colX[2], y: rowY[1], w: cw[2], h: rh[1] },
    back: { x: colX[3], y: rowY[1], w: cw[3], h: rh[1] },
    bottom: { x: colX[1], y: rowY[2], w: cw[1], h: rh[2] },
  };
  const pad = 8;
  for (const [view, r] of Object.entries(layout) as [Exclude<ViewName, "iso">, { x: number; y: number; w: number; h: number }][]) {
    const vw = r.w + pad * 2, vh = r.h + pad * 2;
    renderLine(built.scene, orthoCamera(bx, view, vw, vh, s), r.x - pad, r.y - pad, vw, vh);
    const labelY = view === "top" ? r.y - 64 : r.y + r.h + 18;
    html(`<div class="label" style="left:${r.x + r.w / 2}px;top:${labelY}px">${VIEW_TITLE[view]}<small>SCALE 1:${S}</small></div>`);
  }
  // Centre lines for symmetric objects
  const ext = 18;
  if (symmetricX(bx)) {
    for (const v of ["front", "back", "top", "bottom"] as const) {
      const r = layout[v];
      centreLine(r.x + r.w / 2, r.y - ext, r.x + r.w / 2, r.y + r.h + ext);
    }
  }
  if (symmetricZ(bx)) {
    for (const v of ["left", "right"] as const) {
      const r = layout[v];
      centreLine(r.x + r.w / 2, r.y - ext, r.x + r.w / 2, r.y + r.h + ext);
    }
    for (const v of ["top", "bottom"] as const) {
      const r = layout[v];
      centreLine(r.x - ext, r.y + r.h / 2, r.x + r.w + ext, r.y + r.h / 2);
    }
  }
  // Projection guide lines between views (thin dashes)
  const f = layout.front;
  svg(`<g stroke="#9fc3ff" stroke-width="1" stroke-dasharray="4 7" opacity=".55">
    <line x1="${f.x}" y1="${layout.top.y + layout.top.h + 8}" x2="${f.x}" y2="${f.y - 8}"/><line x1="${f.x + f.w}" y1="${layout.top.y + layout.top.h + 8}" x2="${f.x + f.w}" y2="${f.y - 8}"/>
    <line x1="${f.x + f.w + 8}" y1="${f.y}" x2="${layout.right.x - 8}" y2="${f.y}"/><line x1="${f.x + f.w + 8}" y1="${f.y + f.h}" x2="${layout.right.x - 8}" y2="${f.y + f.h}"/>
  </g>`);
  // Overall dimensions
  const lv = layout.left;
  dimV(lv.y, lv.y + lv.h, lv.x - 46, lv.x - 6, `H ${fmt(Hm)}`);
  const tv = layout.top;
  dimH(tv.x, tv.x + tv.w, tv.y - 26 - 64, tv.y - 6, `W ${fmt(Wm)}`);
  const rv = layout.right;
  dimH(rv.x, rv.x + rv.w, rv.y + rv.h + 92, rv.y + rv.h + 6, `D ${fmt(Dm)}`);
  scaleBar(area.x + 40, area.y + area.h - 40, s, `SCALE 1:${S} ON A3`);

  // Right column
  const cx = 1652, colW = 640;
  const isoH = 520;
  box(cx, 44, colW, isoH, "");
  renderColour(built.scene, isoCamera(bx, colW - 20, isoH - 60, 0.12), cx + 10, 54, colW - 20, isoH - 60);
  html(`<div class="label" style="left:${cx + colW / 2}px;top:${44 + isoH - 46}px">ISOMETRIC VIEW · COLOUR</div>`);
  const notes = [...(bp.facts ?? []).map((t) => `💡 ${t}`), ...(bp.sheet?.notes ?? []).map((t) => `📝 ${t}`)];
  box(cx, 44 + isoH + 14, colW, 430, `<h2>About this design</h2><p>${esc(bp.description)}</p><ul>${notes.slice(0, 4).map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
    <p style="margin-top:10px;font-size:16px;color:#bfe9ff">Overall size: ${fmt(Wm)} wide × ${fmt(Hm)} tall × ${fmt(Dm)} deep. All dimensions in metres.</p>`);
  const rows = partsList(bp);
  box(cx, 44 + isoH + 14 + 444, colW, 380, `<h2>Parts list</h2>${partsTable(rows, 9)}`);
  titleBlock(cx, H - 36 - 238 - 8, colW, 238, { title: bp.name, code: bp.code, scale: `1:${S}`, sheet: index + 1, of: ORDER.length, subtitle: bp.subtitle });
}

// ------------------------------------------------------------------ exploded assembly sheet

function explodedSheet(bp: Blueprint, index: number) {
  setSize(W, H);
  clearAll();
  arrowDefs();
  frame();
  const built = build(bp, 1);
  const bx = built.box;
  html(`<div style="position:absolute;left:52px;top:44px;width:1500px">
    <div class="kicker">${esc(bp.code)}X · Exploded assembly</div><h1>${esc(bp.name)}: how it fits together</h1></div>`);
  // Exploded front view (line-art) on the left, exploded colour iso in the middle.
  const area = { x: 60, y: 160, w: 760, h: 1420 };
  const size = bx.getSize(new THREE.Vector3());
  const { S, pxPerM: s } = niceScale(Math.min((area.w - 200) / size.x, (area.h - 120) / size.y));
  const vw = size.x * s + 20, vh = size.y * s + 20;
  const vx = area.x + 130 + (area.w - 200 - vw) / 2, vy = area.y + (area.h - 60 - vh) / 2;
  const cam = orthoCamera(bx, "front", vw, vh, s);
  renderLine(built.scene, cam, vx, vy, vw, vh);
  html(`<div class="label" style="left:${vx + vw / 2}px;top:${vy + vh + 14}px">EXPLODED FRONT VIEW<small>SCALE 1:${S}</small></div>`);
  // Balloons: one per top-level part, numbered bottom to top.
  const items = bp.parts.map((p) => {
    const node = built.model.nodes.get(p.id);
    if (!node) return null;
    const nb = measure(node, false).applyMatrix4(node.matrixWorld);
    if (nb.isEmpty()) return null;
    const c = nb.getCenter(new THREE.Vector3());
    const sub = p.ref ? getBlueprint(p.ref) : undefined;
    return { part: p, sub, c };
  }).filter((x): x is NonNullable<typeof x> => x !== null);
  const toPx = (p: THREE.Vector3) => {
    const v = p.clone().project(cam);
    return { x: vx + ((v.x + 1) / 2) * vw, y: vy + ((1 - v.y) / 2) * vh };
  };
  const sorted = [...items].sort((a, b) => b.c.y - a.c.y);
  const groups = new Map<string, { n: number; name: string; code: string; qty: number }>();
  let n = 0;
  for (const it of sorted) {
    const key = it.sub?.id ?? it.part.id;
    if (!groups.has(key)) groups.set(key, { n: ++n, name: it.sub?.name ?? it.part.name ?? it.part.id, code: it.sub?.code ?? "", qty: 0 });
    groups.get(key)!.qty++;
  }
  let lastY = -Infinity;
  const used = new Set<string>();
  for (const it of sorted) {
    const key = it.sub?.id ?? it.part.id;
    const g = groups.get(key)!;
    const a = toPx(it.c);
    if (used.has(key)) {
      svg(`<circle cx="${a.x}" cy="${a.y}" r="5" fill="${GOLD}"/>`);
      continue;
    }
    used.add(key);
    const bxp = vx - 70;
    const by = Math.max(a.y, lastY + 62);
    lastY = by;
    svg(`<circle cx="${a.x}" cy="${a.y}" r="5" fill="${GOLD}"/><polyline points="${a.x},${a.y} ${bxp + 28},${by} ${bxp + 22},${by}" fill="none" stroke="${GOLD}" stroke-width="1.6"/>
      <circle cx="${bxp}" cy="${by}" r="24" fill="#0d3b8e" stroke="${GOLD}" stroke-width="3"/>
      <text x="${bxp}" y="${by + 8}" fill="${GOLD}" font-size="24" font-weight="700" text-anchor="middle" font-family="Fredoka Variable">${g.n}</text>`);
  }
  // Colour exploded iso
  const ix = 850, iy = 150, iw = 760, ih = 1300;
  renderColour(built.scene, isoCamera(bx, iw, ih, 0.08), ix, iy, iw, ih);
  html(`<div class="label" style="left:${ix + iw / 2}px;top:${iy + ih + 8}px">EXPLODED ISOMETRIC VIEW · COLOUR</div>`);
  // Bill of materials
  const cx = 1652, colW = 640;
  const bom = [...groups.values()];
  const rows = bom.map((g) => {
    const sys = Object.entries(PHYSICS).find(([, ph]) => ph.blueprint === [...BLUEPRINTS].find((b) => b.name === g.name)?.id);
    const mass = sys ? `${sys[1].mass} t` : g.code === "S-00" ? "0.8 t" : g.code === "S-13" ? "3.2 t" : g.code === "S-14" ? "0.3 t" : "—";
    return `<tr><td class="num">${g.n}</td><td>${esc(g.name)}</td><td>${esc(g.code)}</td><td class="num">${g.qty}</td><td class="num">${mass}</td></tr>`;
  }).join("");
  box(cx, 44, colW, 760, `<h2>Bill of materials</h2><table><tr><th class="num">No.</th><th>Assembly</th><th>Sheet</th><th class="num">Qty</th><th class="num">Dry mass each</th></tr>${rows}</table>
    <p style="margin-top:12px;font-size:16px;color:#bfe9ff">Masses are the simplified values used by the game's rocket-engineering model (tonnes, dry). Each fuel tank also carries 10 t of propellant.</p>`);
  box(cx, 818, colW, 520, `<h2>Assembly order</h2><ul>
    <li>Bolt the Main Engines to the thrust plate of the Thrust Structure.</li>
    <li>Stack the Fuel Tanks, then the Guidance Computer ring.</li>
    <li>Fit the Crew Capsule with its panorama window facing front.</li>
    <li>Cap the stack with the Nose Cone.</li>
    <li>Slide the four Stability Fins over the skirt at the bottom.</li></ul>
    <p style="margin-top:10px">In an exploded view every part slides apart along a straight line, so you can see the order it was put together.</p>`);
  titleBlock(cx, H - 36 - 238 - 8, colW, 238, { title: `${bp.name} (exploded)`, code: `${bp.code}X`, scale: `1:${S}`, sheet: index + 1, of: ORDER.length, subtitle: "Exploded assembly drawing" });
}

// ------------------------------------------------------------------ cover

function coverSheet(index: number) {
  setSize(W, H);
  clearAll();
  frame(false);
  const comet = build("rocket-comet");
  renderColour(comet.scene, isoCamera(comet.box, 600, 1420, 0.03), 60, 120, 600, 1420);
  html(`<div class="tag" style="left:110px;top:1520px;font-size:20px">V-01 Comet Rocket</div>`);
  html(`<div style="position:absolute;left:720px;top:100px;width:1560px">
    <div class="kicker" style="font-size:26px">Flexzonic Games · Spaceflight Academy v${esc(VERSION)}</div>
    <div style="font-size:124px;font-weight:700;line-height:.95;margin-top:12px">3D BLUEPRINT <span style="color:#ff66bf">BOOK</span></div>
    <p style="font-size:29px;max-width:1500px;margin-top:24px">Every rocket, cadet, building and base in the 3D Academy is built from these blueprints. Each sheet shows the object from all six sides (front, back, left, right, top and bottom) plus a 3D corner view, with real sizes in metres.</p>
  </div>`);
  // Crew, same scale, standing on one line
  const crew = ["cadet-omari", "cadet-mei", "cadet-finn", "cadet-sofia", "robot-cosmo"].filter((id) => getBlueprint(id));
  const pxPerM = 250, ground = 1540;
  crew.forEach((id, i) => {
    const b = build(id);
    const sz = b.box.getSize(new THREE.Vector3());
    const w = 190, h = sz.y * pxPerM + 50;
    const cam = new THREE.PerspectiveCamera(22, w / h, 0.1, 100);
    const c = b.box.getCenter(new THREE.Vector3());
    const dist = ((sz.y / 2 + 0.1) / Math.tan((11 * Math.PI) / 180)) * 1.02;
    cam.position.set(c.x + Math.sin(0.4) * dist, c.y + 0.25, c.z + Math.cos(0.4) * dist);
    cam.lookAt(c);
    renderColour(b.scene, cam, 720 + i * 150, ground - h, w, h);
  });
  svg(`<line x1="720" y1="${ground - 8}" x2="1470" y2="${ground - 8}" stroke="${LINE}" stroke-width="2" opacity=".6"/>`);
  html(`<div class="label" style="left:1095px;top:${ground + 4}px;font-size:16px">THE CREW · C-01 TO C-05</div>`);
  const half = Math.ceil(ORDER.length / 2);
  const entry = (sp: SheetSpec, i: number) => `<div style="display:flex;gap:10px;font-size:17px;line-height:1.56"><b style="width:30px;text-align:right;color:#bfe9ff">${i + 1}</b><b style="width:66px;color:${GOLD}">${esc(sheetCode(sp))}</b><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(sheetTitle(sp))}</span></div>`;
  box(1500, 590, 790, 1000, `<h2>Contents</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;column-gap:18px">
      <div>${ORDER.slice(0, half).map((sp, i) => entry(sp, i)).join("")}</div>
      <div>${ORDER.slice(half).map((sp, i) => entry(sp, i + half)).join("")}</div>
    </div>`);
  void index;
}

// ------------------------------------------------------------------ how to read

const PRACTICE_HOUSE: Blueprint = {
  id: "practice-house", code: "A-01", name: "Practice House", category: "spaceport", subtitle: "Teaching model",
  description: "A simple house used to explain views.",
  overall: { w: 2.3, h: 2.25, d: 1.8 },
  parts: [
    P("walls", S.box(2.0, 1.4, 1.6), "hull", { at: [0, 0.7, 0] }),
    P("roof", S.ext([[-1.15, 0], [1.15, 0], [0, 0.85]], 1.8), "magenta", { at: [0, 1.4, 0] }),
    P("door", S.box(0.45, 0.8, 0.08), "royal", { at: [-0.5, 0.4, 0.82] }),
    P("window", S.box(0.55, 0.42, 0.08), "window", { at: [0.48, 0.85, 0.82] }),
    P("chimney", S.box(0.3, 0.75, 0.3), "navy", { at: [0.62, 1.78, -0.35] }),
    G("porthole", [P("ring", S.cyl(0.24, 0.08), "cyan", { rot: [0, 0, 90] })], { at: [1.03, 0.85, 0] }),
  ],
};

function howToSheet(index: number) {
  setSize(W, H);
  clearAll();
  arrowDefs();
  frame();
  const house = build(PRACTICE_HOUSE);
  const bx = house.box;
  html(`<div style="position:absolute;left:52px;top:44px;width:2200px"><div class="kicker">Start here</div><h1>How to read a blueprint</h1></div>`);
  // 1. The object in 3D
  renderColour(house.scene, isoCamera(bx, 560, 560, 0.25), 70, 190, 560, 560);
  box(60, 170, 580, 620, "", "clear", "border-style:dashed");
  html(`<div class="label" style="left:350px;top:760px">1 · THE OBJECT IN 3D</div>`);
  svg(`<g font-family="Fredoka Variable" font-weight="700" font-size="22">
    <line x1="300" y1="700" x2="250" y2="610" stroke="${GOLD}" stroke-width="3" marker-end="url(#arr)"/><text x="235" y="740" fill="${GOLD}">FRONT</text>
    <line x1="560" y1="590" x2="490" y2="520" stroke="${GOLD}" stroke-width="3" marker-end="url(#arr)"/><text x="520" y="625" fill="${GOLD}">RIGHT</text>
    <line x1="350" y1="215" x2="350" y2="300" stroke="${GOLD}" stroke-width="3" marker-end="url(#arr)"/><text x="365" y="235" fill="${GOLD}">TOP</text></g>`);
  // 2. The unfolded views (third angle)
  const { S: howS, pxPerM: s } = niceScale(125);
  const ox = 770, oy = 236;
  const sz = bx.getSize(new THREE.Vector3());
  const fw = sz.x * s, fh = sz.y * s, fd = sz.z * s;
  const front = { x: ox, y: oy + fd + 116, w: fw, h: fh };
  const top = { x: ox, y: oy, w: fw, h: fd };
  const right = { x: ox + fw + 130, y: front.y, w: fd, h: fh };
  for (const [view, r] of [["front", front], ["top", top], ["right", right]] as const) {
    renderLine(house.scene, orthoCamera(bx, view, r.w + 16, r.h + 16, s), r.x - 8, r.y - 8, r.w + 16, r.h + 16);
    html(`<div class="label" style="left:${r.x + r.w / 2}px;top:${r.y + r.h + 16}px">${VIEW_TITLE[view]}<small>SCALE 1:${howS}</small></div>`);
  }
  svg(`<g stroke="#9fc3ff" stroke-width="1.4" stroke-dasharray="5 7" opacity=".8">
    <line x1="${front.x}" y1="${top.y + top.h + 6}" x2="${front.x}" y2="${front.y - 6}"/><line x1="${front.x + front.w}" y1="${top.y + top.h + 6}" x2="${front.x + front.w}" y2="${front.y - 6}"/>
    <line x1="${front.x + front.w + 6}" y1="${front.y}" x2="${right.x - 6}" y2="${front.y}"/><line x1="${front.x + front.w + 6}" y1="${front.y + front.h}" x2="${right.x - 6}" y2="${front.y + front.h}"/></g>`);
  dimH(front.x, front.x + front.w, top.y - 30, top.y - 6, `W ${fmt(sz.x)}`);
  dimV(front.y, front.y + front.h, front.x - 40, front.x - 6, `H ${fmt(sz.y)}`);
  dimH(right.x, right.x + right.w, right.y + right.h + 100, right.y + right.h + 6, `D ${fmt(sz.z)}`);
  html(`<div class="label" style="left:${(ox + right.x + right.w) / 2}px;top:${front.y + front.h + 120}px">2 · UNFOLD THE GLASS BOX (THIRD-ANGLE PROJECTION)</div>`);
  // 3. The rules
  box(1560, 170, 720, 820, `<h2>3 · The rules</h2><ul style="font-size:21px">
    <li>Imagine the object inside a <b>glass box</b>. Draw what you see through each wall, then unfold the box flat.</li>
    <li>The <b>TOP</b> view always sits <b>above</b> the FRONT view. The <b>BOTTOM</b> view sits below it.</li>
    <li>The <b>RIGHT</b> view sits to the <b>right</b> of the FRONT view, the <b>LEFT</b> view to its left, and the <b>BACK</b> view at the far right.</li>
    <li>Views line up: the height in the front view is the same as the height in the side views.</li>
    <li>Every sheet uses one <b>scale</b>. 1:100 means 1 cm on the paper is 100 cm (1 m) in real life.</li>
    <li>All sizes are in <b>metres</b>. W = width, H = height, D = depth.</li></ul>`);
  // 4. Line legend
  const ly = 1080;
  box(60, ly, 1460, 500, `<h2>4 · Lines and symbols</h2>`);
  svg(`<g font-family="Fredoka Variable" font-size="21" font-weight="600" fill="${LINE}">
    <line x1="100" y1="${ly + 110}" x2="330" y2="${ly + 110}" stroke="${LINE}" stroke-width="3"/><text x="360" y="${ly + 117}">Visible edge: a corner or outline you can see</text>
    <line x1="100" y1="${ly + 175}" x2="330" y2="${ly + 175}" stroke="#9fe8ff" stroke-width="2" stroke-dasharray="26 6 4 6"/><text x="360" y="${ly + 182}">Centre line: the middle of a round or symmetric part</text>
    <line x1="100" y1="${ly + 240}" x2="330" y2="${ly + 240}" stroke="${GOLD}" stroke-width="2.5" marker-start="url(#arr)" marker-end="url(#arr)"/><text x="360" y="${ly + 247}">Dimension line: shows a real size, like 2.30 m</text>
    <line x1="100" y1="${ly + 305}" x2="330" y2="${ly + 305}" stroke="#9fc3ff" stroke-width="1.5" stroke-dasharray="5 7"/><text x="360" y="${ly + 312}">Projection line: shows how two views line up</text>
    <rect x="100" y="${ly + 345}" width="230" height="60" fill="#1f56b8" stroke="${LINE}" stroke-width="3"/><text x="360" y="${ly + 383}">Solid surface: light-blue fill, white outline</text>
  </g>`);
  projectionSymbol(1000, ly + 410, 1.4);
  svg(`<text x="1000" y="${ly + 500}" fill="${LINE}" font-family="Fredoka Variable" font-size="20" font-weight="600">Third-angle projection symbol</text>`);
  scaleBar(1180, ly + 440, 100, "SCALE BAR");
  box(1560, 1010, 720, 300, `<h2>Try it in the game!</h2><p>Open the <b>Blueprint Studio</b> at the Spaceport. Tap Front, Top or Right to see each view, then play <b>View Detective</b> to test your eyes.</p>`);
  titleBlock(1560, H - 36 - 238 - 8, 720, 238, { title: "How to read a blueprint", code: "A-01", scale: `1:${howS}`, sheet: index + 1, of: ORDER.length, subtitle: "Teaching sheet" });
}

// ------------------------------------------------------------------ cast line-up

function castSheet(index: number) {
  setSize(W, H);
  clearAll();
  arrowDefs();
  frame();
  html(`<div style="position:absolute;left:52px;top:44px;width:2200px"><div class="kicker">C-00 · The Academy crew</div><h1>Crew line-up (same scale)</h1></div>`);
  const ids = [...CADETS.map((c) => `cadet-${c.id}`), "robot-cosmo"].filter((id) => getBlueprint(id));
  const items = ids.map((id) => build(id));
  const maxH = Math.max(...items.map((b) => b.box.max.y));
  const { S, pxPerM: s } = niceScale(560 / maxH);
  const ground = 760;
  const slot = 1420 / items.length;
  // Height ruler
  const rx = 120;
  svg(`<line x1="${rx}" y1="${ground}" x2="${rx}" y2="${ground - 1.6 * s}" stroke="${LINE}" stroke-width="2"/>`);
  for (let m = 0; m <= 1.6 + 1e-6; m += 0.1) {
    const y = ground - m * s;
    const major = Math.abs(m - Math.round(m * 2) / 2) < 1e-6;
    svg(`<line x1="${rx}" y1="${y}" x2="${rx + (major ? 24 : 12)}" y2="${y}" stroke="${LINE}" stroke-width="${major ? 2 : 1.2}"/>`);
    if (major) svg(`<text x="${rx - 10}" y="${y + 7}" fill="${LINE}" font-size="19" text-anchor="end" font-family="Fredoka Variable" font-weight="700">${m.toFixed(1)} m</text>`);
  }
  svg(`<line x1="${rx}" y1="${ground}" x2="${rx + 1550}" y2="${ground}" stroke="${LINE}" stroke-width="2.5"/>`);
  items.forEach((b, i) => {
    const sz = b.box.getSize(new THREE.Vector3());
    const cx = 220 + slot * i + slot / 2;
    const vw = Math.max(sz.x, sz.z) * s + 40, vh = sz.y * s + 20;
    renderLine(b.scene, orthoCamera(b.box, "front", vw, vh, s), cx - vw / 2, ground - sz.y * s - 10, vw, vh);
    dimV(ground - sz.y * s, ground, cx + vw / 2 + 18, cx + sz.x * s / 2 + 4, fmt(sz.y));
    html(`<div class="label" style="left:${cx}px;top:${ground + 18}px">${esc(b.bp.name.toUpperCase())}<small>${esc(b.bp.code)} · ${esc(b.bp.subtitle)}</small></div>`);
    renderColour(b.scene, isoCamera(b.box, 300, 420, 0.1), cx - 150, 900, 300, 420);
  });
  html(`<div class="label" style="left:1000px;top:1330px">ISOMETRIC VIEWS · COLOUR</div>`);
  box(1700, 150, 590, 1000, `<h2>Meet the crew</h2>
    ${CADETS.map((c) => `<p><b style="color:${GOLD}">${esc(c.name)}</b> · ${esc(c.tagline)}</p>`).join("")}
    <p><b style="color:${GOLD}">Cosmo</b> · the Academy's hover-robot helper, who cheers you on in the hangar and on missions.</p>
    <p style="font-size:16px;color:#bfe9ff">Every cadet wears the same flight suit blueprint; players can pick the accent colour. Suits keep the right pressure, air and temperature, like a tiny spaceship.</p>`);
  scaleBar(140, 1420, s, `SCALE 1:${S} ON A3`);
  titleBlock(1700, H - 36 - 238 - 8, 590, 238, { title: "Crew line-up", code: "C-00", scale: `1:${S}`, sheet: index + 1, of: ORDER.length, subtitle: "Cadets C-01 to C-04 and Cosmo C-05" });
}

// ------------------------------------------------------------------ systems table

function systemsSheet(index: number) {
  setSize(W, H);
  clearAll();
  frame();
  html(`<div style="position:absolute;left:52px;top:44px;width:2200px"><div class="kicker">S-00 to S-14 · Rocket engineering</div><h1>The 12 rocket systems</h1></div>`);
  const rows = SYSTEM_IDS.map((id, i) => {
    const ph = PHYSICS[id];
    const info = partInfo(id);
    const bp = getBlueprint(ph.blueprint)!;
    return { id, i, ph, info, bp };
  });
  const rowH = 92, top = 196, tx = 60;
  html(`<div class="box clear" style="left:${tx}px;top:${top - 50}px;width:2220px;height:46px;border:none">
    <div style="display:grid;grid-template-columns:150px 330px 90px 140px 110px 110px 110px 110px 90px 1fr;font-size:15px;letter-spacing:.12em;color:#bfe9ff;font-weight:700;padding:0 12px">
      <span>3D PART</span><span>SYSTEM</span><span>SHEET</span><span>AGES</span><span>MASS</span><span>FUEL</span><span>THRUST</span><span>ISP</span><span>MAX</span><span>WHAT IT DOES</span></div></div>`);
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    box(tx, y, 2220, rowH - 8, "");
    html(`<div class="box-c" style="left:${tx}px;top:${y}px;width:2220px;height:${rowH - 8}px;padding:0 12px;display:grid;grid-template-columns:150px 330px 90px 140px 110px 110px 110px 110px 90px 1fr;align-items:center;font-size:19px">
      <span></span>
      <span><b style="font-size:22px">${r.info.icon} ${esc(r.info.name)}</b><br/><small style="color:#bfe9ff">${esc(r.info.category)} · ${r.info.cost} energy</small></span>
      <b style="color:${GOLD}">${esc(r.bp.code)}</b>
      <span>${esc(r.info.minAge)}+</span>
      <span>${r.ph.mass} t</span>
      <span>${r.ph.fuel ? `${r.ph.fuel} t` : "—"}</span>
      <span>${r.ph.thrust ? `${r.ph.thrust} kN` : "—"}</span>
      <span>${r.ph.isp ? `${r.ph.isp} s` : "—"}</span>
      <span>×${r.ph.max}</span>
      <span style="font-size:17px;line-height:1.25">${esc(r.ph.does)}. <span style="color:#bfe9ff">${esc(r.info.fact)}</span></span></div>`);
    const b = build(r.bp);
    renderColour(b.scene, isoCamera(b.box, 130, rowH - 16, 0.08), tx + 10, y + 4, 130, rowH - 16);
  });
  box(60, top + 12 * rowH + 10, 1500, 190, `<h2>How the engineering works</h2><p style="font-size:18px">Lift-off needs thrust bigger than weight (thrust-to-weight ratio of at least 1.1). Fuel gives the rocket its change in speed (delta-v, using the rocket equation). Fins and a pointy nose keep the centre of pressure behind the centre of mass so the rocket flies straight. Airframe parts always on board: thrust structure 0.8 t, crew capsule 3.2 t, nose cone 0.3 t.</p>`);
  titleBlock(1580, H - 36 - 238 - 8, 700, 238, { title: "The 12 rocket systems", code: "S-XX", scale: "NTS", sheet: index + 1, of: ORDER.length, subtitle: "Masses in tonnes · thrust in kilonewtons" });
}

// ------------------------------------------------------------------ site plan

function siteSheet(index: number) {
  setSize(W, H);
  clearAll();
  arrowDefs();
  frame();
  html(`<div style="position:absolute;left:52px;top:44px;width:1500px"><div class="kicker">B-00 · Spaceport campus</div><h1>Spaceport site plan</h1></div>`);
  const scene = new THREE.Scene();
  lights(scene);
  for (const b of BUILDINGS) {
    const built = buildBlueprint(getBlueprint(b.blueprint)!, { resolve: getBlueprint, quality: "high", shadows: false });
    built.root.position.set(b.x, 0, b.z);
    built.root.rotation.y = (b.rot * Math.PI) / 180;
    scene.add(built.root);
  }
  const launch = BUILDINGS.find((b) => b.id === "launch-complex")!;
  const rocket = buildBlueprint(getBlueprint("rocket-comet")!, { resolve: getBlueprint, quality: "high", shadows: false });
  const [rx, rz] = toWorld(launch, 0, 0);
  rocket.root.position.set(rx, 2, rz);
  scene.add(rocket.root);
  scene.updateMatrixWorld(true);
  // Region: x −125…125, z −125…125
  const area = { x: 70, y: 150, w: 1560, h: 1450 };
  const span = 250;
  const { S, pxPerM: s } = niceScale(Math.min(area.w, area.h) / span);
  const cx = area.x + area.w / 2, cy = area.y + area.h / 2;
  const toPx = (x: number, z: number) => ({ x: cx + x * s, y: cy + z * s });
  // Ground features first (SVG under the line art is not possible; they sit on top, kept light)
  const ring = toPx(0, 0);
  svg(`<circle cx="${ring.x}" cy="${ring.y}" r="${CAMPUS.radius * s}" fill="none" stroke="#9fc3ff" stroke-width="2" stroke-dasharray="14 8"/>`);
  const coast = toPx(CAMPUS.coastX, 0);
  svg(`<line x1="${coast.x}" y1="${area.y + 10}" x2="${coast.x}" y2="${area.y + area.h - 10}" stroke="#7fe9ff" stroke-width="3"/>
    <rect x="${coast.x + 2}" y="${area.y + 10}" width="${area.x + area.w - coast.x - 12}" height="${area.h - 20}" fill="url(#waves)" opacity=".7"/>
    <defs><pattern id="waves" width="40" height="20" patternUnits="userSpaceOnUse"><path d="M0,10 Q10,2 20,10 T40,10" fill="none" stroke="#7fe9ff" stroke-width="1.4"/></pattern></defs>
    <text x="${coast.x + 24}" y="${area.y + 60}" fill="#7fe9ff" font-size="22" font-weight="700" font-family="Fredoka Variable">OCEAN</text>`);
  for (const pad of stationPads()) {
    const p = toPx(pad.x, pad.z), a = Math.atan2(pad.x, pad.z);
    const from = toPx(Math.sin(a) * 11.5, Math.cos(a) * 11.5);
    svg(`<line x1="${from.x}" y1="${from.y}" x2="${p.x}" y2="${p.y}" stroke="#dfeaff" stroke-width="${4.2 * s}" opacity=".18" stroke-linecap="round"/>
      <circle cx="${p.x}" cy="${p.y}" r="${2.2 * s}" fill="none" stroke="#ff8fd2" stroke-width="2.5"/>`);
  }
  // Line art of all buildings (top view)
  const camera = orthoCamera(new THREE.Box3(new THREE.Vector3(-span / 2, -1, -span / 2), new THREE.Vector3(span / 2, 60, span / 2)), "top", area.w, area.h, s);
  renderLine(scene, camera, area.x, area.y, area.w, area.h);
  // Planet Walk (the four rocky planets sit within 3 m of the Sun, so they share one label)
  const w0 = toPx(walkStopX(PLANET_WALK[0]), PLANET_WALK_Z), w1 = toPx(walkStopX(PLANET_WALK[PLANET_WALK.length - 1]), PLANET_WALK_Z);
  svg(`<line x1="${w0.x}" y1="${w0.y}" x2="${w1.x}" y2="${w1.y}" stroke="${GOLD}" stroke-width="3"/>`);
  const inner = PLANET_WALK.filter((st) => st.au > 0 && st.au < 2);
  PLANET_WALK.forEach((stop) => {
    const p = toPx(walkStopX(stop), PLANET_WALK_Z);
    svg(`<circle cx="${p.x}" cy="${p.y}" r="${stop.au === 0 ? 8 : 5.5}" fill="${stop.color}" stroke="${LINE}" stroke-width="1.5"/>`);
  });
  const labelled = PLANET_WALK.filter((st) => st.au === 0 || st.au >= 2);
  labelled.forEach((stop, i) => {
    const p = toPx(walkStopX(stop), PLANET_WALK_Z);
    const up = i % 2 === 1;
    svg(`<line x1="${p.x}" y1="${p.y}" x2="${p.x}" y2="${p.y + (up ? -30 : 30)}" stroke="${GOLD}" stroke-width="1"/>
      <text x="${p.x}" y="${p.y + (up ? -36 : 48)}" fill="${GOLD}" font-size="16" font-weight="700" text-anchor="middle" font-family="Fredoka Variable">${esc(stop.name.replace("The ", ""))}</text>`);
  });
  const a0 = toPx(walkStopX(inner[0]), PLANET_WALK_Z), a1 = toPx(walkStopX(inner[inner.length - 1]), PLANET_WALK_Z);
  svg(`<path d="M${a0.x},${a0.y - 12} L${a0.x},${a0.y - 20} L${a1.x},${a1.y - 20} L${a1.x},${a1.y - 12}" fill="none" stroke="${GOLD}" stroke-width="1.4"/>
    <line x1="${(a0.x + a1.x) / 2}" y1="${a0.y - 20}" x2="${(a0.x + a1.x) / 2 + 40}" y2="${a0.y - 70}" stroke="${GOLD}" stroke-width="1"/>
    <text x="${(a0.x + a1.x) / 2 + 44}" y="${a0.y - 74}" fill="${GOLD}" font-size="16" font-weight="700" font-family="Fredoka Variable">Mercury · Venus · Earth · Mars</text>`);
  svg(`<text x="${w1.x}" y="${w1.y + 84}" fill="${GOLD}" font-size="15" font-family="Fredoka Variable" font-weight="600" text-anchor="end">PLANET WALK · 2.15 m PER AU</text>`);
  // Building labels, pushed outward from the plaza with leader lines
  const names: Record<string, string> = { plaza: "Academy Plaza", "mission-control": "Mission Control", "rocket-hangar": "Rocket Hangar", "launch-complex": "Launch Complex 1", observatory: "Star Observatory", "training-center": "Training Center", "family-lab": "Family Space Lab", "blueprint-studio": "Blueprint Studio" };
  for (const b of BUILDINGS) {
    const bp = getBlueprint(b.blueprint)!;
    const p = toPx(b.x, b.z);
    const len = Math.hypot(b.x, b.z) || 1;
    const dir = b.id === "plaza" ? { x: -0.7, y: 0.7 } : { x: b.x / len, y: b.z / len };
    const reach = Math.max(bp.overall.d, bp.overall.w) / 2 * s + 26;
    const lx = p.x + dir.x * reach, ly = p.y + dir.y * reach;
    const anchor = dir.x > 0.25 ? "left" : dir.x < -0.25 ? "right" : "center";
    const tx = anchor === "center" ? "translateX(-50%)" : anchor === "right" ? "translateX(-100%)" : "";
    svg(`<line x1="${p.x + dir.x * (reach - 22)}" y1="${p.y + dir.y * (reach - 22)}" x2="${lx}" y2="${ly}" stroke="${LINE}" stroke-width="1.2" opacity=".8"/>`);
    html(`<div class="tag" style="left:${lx}px;top:${ly - 16}px;transform:${tx}">${esc(bp.code)} · ${esc(names[b.id] ?? bp.name)}</div>`);
  }
  // North arrow + scale
  svg(`<g transform="translate(${area.x + 90} ${area.y + 120})"><circle r="52" fill="none" stroke="${LINE}" stroke-width="2"/><path d="M0,-46 L16,10 L0,0 L-16,10 Z" fill="${LINE}"/><text y="-60" fill="${LINE}" font-size="24" font-weight="700" text-anchor="middle" font-family="Fredoka Variable">N</text></g>`);
  scaleBar(area.x + 40, area.y + area.h - 50, s, `SCALE 1:${S} ON A3`);
  box(1652, 44, 640, 820, `<h2>Spaceport campus</h2>
    <p>The whole Academy, seen from straight above (a TOP view). Walk your cadet along the paths to each building's glowing pink door ring.</p>
    <ul>
      <li><b>Mission Control</b> · the mission map and briefings</li>
      <li><b>Rocket Hangar</b> · build and test rockets</li>
      <li><b>Launch Complex 1</b> · where the Comet stands</li>
      <li><b>Star Observatory</b> · the Solar System explorer</li>
      <li><b>Training Center</b> · practise every flight skill</li>
      <li><b>Blueprint Studio</b> · these drawings, in 3D</li>
      <li><b>Family Space Lab</b> · real-world activities</li>
      <li><b>Planet Walk</b> · the Sun to Pluto with true distances: 2.15 m per astronomical unit</li></ul>`);
  box(1652, 878, 640, 290, `<h2>Key</h2>
    <p><span style="color:#ff8fd2">◯</span> Station door ring &nbsp; <span style="color:${GOLD}">━</span> Planet Walk<br/><span style="color:#9fc3ff">┅</span> Campus boundary (radius ${CAMPUS.radius} m) &nbsp; <span style="color:#7fe9ff">━</span> Coastline</p>`);
  titleBlock(1652, H - 36 - 238 - 8, 640, 238, { title: "Spaceport site plan", code: "B-00", scale: `1:${S}`, sheet: index + 1, of: ORDER.length, subtitle: "Top view of the campus" });
}

// ------------------------------------------------------------------ solar system to scale

function solarSheet(index: number) {
  setSize(W, H);
  clearAll();
  frame();
  html(`<div style="position:absolute;left:52px;top:44px;width:2200px"><div class="kicker">X-01 · Star Observatory data</div><h1>The Solar System to scale</h1></div>`);
  // Sizes: 1 px = 470 km
  const kmPerPx = 470;
  const y0 = 430;
  const sun = BODIES.find((b) => b.id === "sun")!;
  const sunR = sun.diameterKm / 2 / kmPerPx;
  svg(`<circle cx="${110 - sunR}" cy="${y0}" r="${sunR}" fill="#ffc93d" opacity=".95"/><text x="70" y="${y0 + 8}" fill="#5a3500" font-size="30" font-weight="700" font-family="Fredoka Variable" transform="rotate(-90 70 ${y0})" text-anchor="middle">THE SUN (edge)</text>`);
  let x = 150;
  for (const id of ["mercury", "venus", "earth", "moon", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"]) {
    const b = BODIES.find((q) => q.id === id)!;
    const r = b.diameterKm / 2 / kmPerPx;
    const span = id === "saturn" ? r * 2.3 : r;
    const cx = x + span;
    if (id === "saturn") svg(`<ellipse cx="${cx}" cy="${y0}" rx="${r * 2.27}" ry="${r * 0.62}" fill="none" stroke="#ead39b" stroke-width="${r * 0.32}" opacity=".7"/>`);
    svg(`<circle cx="${cx}" cy="${y0}" r="${Math.max(r, 1.5)}" fill="${b.color}" stroke="${LINE}" stroke-width="1.2"/>`);
    const up = ["mercury", "earth", "mars", "pluto"].includes(id);
    svg(`<text x="${cx}" y="${up ? y0 - Math.max(r, 8) - 26 : y0 + Math.max(r, 8) + 40}" fill="${LINE}" font-size="19" font-weight="700" text-anchor="middle" font-family="Fredoka Variable">${esc(b.name.replace("The ", ""))}</text>`);
    x = cx + span + (r < 20 ? 34 : 46);
  }
  html(`<div class="label" style="left:1150px;top:${y0 + 210}px">SIZES TO SCALE · 1 mm ON A3 = ${Math.round(kmPerPx / MM_PER_PX).toLocaleString("en-US")} km</div>`);
  // Distances: 0–50 AU
  const dy = 900, dx0 = 110, pxPerAU = 2100 / 50;
  svg(`<line x1="${dx0}" y1="${dy}" x2="${dx0 + 50 * pxPerAU}" y2="${dy}" stroke="${LINE}" stroke-width="2"/>`);
  for (let au = 0; au <= 50; au += 5) svg(`<line x1="${dx0 + au * pxPerAU}" y1="${dy - 8}" x2="${dx0 + au * pxPerAU}" y2="${dy + 8}" stroke="${LINE}" stroke-width="2"/><text x="${dx0 + au * pxPerAU}" y="${dy + 34}" fill="${LINE}" font-size="16" text-anchor="middle" font-family="Fredoka Variable">${au} AU</text>`);
  svg(`<rect x="${dx0 + 2.1 * pxPerAU}" y="${dy - 22}" width="${1.2 * pxPerAU}" height="44" fill="#b9a68e" opacity=".35"/><text x="${dx0 + 2.7 * pxPerAU}" y="${dy - 32}" fill="#e8d9c2" font-size="15" text-anchor="middle" font-family="Fredoka Variable">Asteroid belt</text>
    <rect x="${dx0 + 30 * pxPerAU}" y="${dy - 22}" width="${20 * pxPerAU}" height="44" fill="#9fc6ff" opacity=".18"/><text x="${dx0 + 42 * pxPerAU}" y="${dy - 32}" fill="#cfe3ff" font-size="15" text-anchor="middle" font-family="Fredoka Variable">Kuiper Belt</text>
    <circle cx="${dx0}" cy="${dy}" r="12" fill="#ffc93d"/>`);
  for (const b of BODIES) {
    if (!b.orbit) continue;
    const px = dx0 + b.orbit.a * pxPerAU;
    const outer = b.orbit.a > 4;
    svg(`<circle cx="${px}" cy="${dy}" r="7" fill="${b.color}" stroke="${LINE}" stroke-width="1.2"/>`);
    if (outer) svg(`<text x="${px}" y="${dy - 40}" fill="${LINE}" font-size="18" font-weight="700" text-anchor="middle" font-family="Fredoka Variable">${esc(b.name)}</text>`);
  }
  // Inner planets inset (0–2 AU)
  const ix = 110, iy = 1010, iPx = 420;
  svg(`<rect x="${ix - 20}" y="${iy - 50}" width="${2 * iPx + 60}" height="110" fill="none" stroke="#9fc3ff" stroke-dasharray="8 6" stroke-width="1.5"/>
    <line x1="${ix}" y1="${iy}" x2="${ix + 2 * iPx}" y2="${iy}" stroke="${LINE}" stroke-width="2"/><circle cx="${ix}" cy="${iy}" r="12" fill="#ffc93d"/>
    <text x="${ix + 2 * iPx + 60}" y="${iy + 8}" fill="#9fc3ff" font-size="17" font-family="Fredoka Variable">◀ Close-up of the first 2 AU (21× bigger)</text>`);
  for (const b of BODIES) {
    if (!b.orbit || b.orbit.a > 2) continue;
    const px = ix + b.orbit.a * iPx;
    svg(`<circle cx="${px}" cy="${iy}" r="9" fill="${b.color}" stroke="${LINE}" stroke-width="1.2"/><text x="${px}" y="${iy - 22}" fill="${LINE}" font-size="18" font-weight="700" text-anchor="middle" font-family="Fredoka Variable">${esc(b.name)}</text><text x="${px}" y="${iy + 38}" fill="#bfe9ff" font-size="15" text-anchor="middle" font-family="Fredoka Variable">${b.orbit.a.toFixed(2)} AU</text>`);
  }
  html(`<div class="label" style="left:1150px;top:${dy + 48}px">DISTANCES FROM THE SUN TO SCALE · 1 AU = 150 million km</div>`);
  // Data table
  const rows = BODIES.map((b) => `<tr><td>${b.icon} <b>${esc(b.name)}</b></td><td>${esc(b.type)}</td><td class="num">${b.diameterKm.toLocaleString("en-US")} km</td><td>${esc(b.distanceText)}</td><td>${esc(b.spinText)}</td><td>${esc(b.yearText)}</td><td class="num">${b.moons === null ? "—" : b.moons}</td><td class="num">${b.gravity < 1 ? b.gravity.toFixed(2) : b.gravity}×</td></tr>`).join("");
  box(60, 1130, 1570, 470, "");
  html(`<div class="box-c" style="left:60px;top:1130px;width:1570px;height:470px;padding:12px 16px;font-size:15px">
    <table style="font-size:15px"><tr><th>World</th><th>Type</th><th class="num">Diameter</th><th>Distance</th><th>One spin</th><th>One orbit</th><th class="num">Moons*</th><th class="num">Gravity</th></tr>${rows}</table>
    <div style="font-size:13px;color:#bfe9ff;margin-top:4px">* ${esc(MOON_COUNT_NOTE)} Data: NASA planetary fact sheets.</div></div>`);
  box(1652, 1130, 640, 220, `<h2>Did you notice?</h2><p style="font-size:17px">The four rocky planets huddle close to the Sun. Then the gaps get huge: Neptune is 30 times farther from the Sun than Earth!</p>`);
  titleBlock(1652, H - 36 - 238 - 8, 640, 238, { title: "Solar System to scale", code: "X-01", scale: "As noted", sheet: index + 1, of: ORDER.length, subtitle: "Sizes and distances use two different scales" });
}

// ------------------------------------------------------------------ mission route

function routeSheet(index: number) {
  setSize(W, H);
  clearAll();
  arrowDefs();
  frame();
  html(`<div style="position:absolute;left:52px;top:44px;width:2200px"><div class="kicker">X-02 · Mission Control</div><h1>Mission route: 6 sectors × 5 missions × 3 crew paths</h1></div>`);
  const objectives = ["Reach the target altitude", "Enter a stable orbit", "Deliver the exploration module", "Land and return safely", "Transmit the discovery data (boss)"];
  const activityText: Record<string, string> = { orbit: "Steer into orbit", docking: "Dock with Orbital School", "moon-landing": "Land on the Moon", "mars-landing": "Land on Mars + rover", asteroid: "Grab asteroid samples", photo: "Outer Worlds photo flyby" };
  const colW = 360, x0 = 70, y0 = 190;
  WORLDS.forEach((w, i) => {
    const x = x0 + i * (colW + 12);
    box(x, y0, colW, 1000, "", "", `border-color:${w.color}`);
    html(`<div class="box-c" style="left:${x}px;top:${y0}px;width:${colW}px;height:1000px;padding:14px 16px">
      <div style="font-size:46px">${w.icon}</div>
      <div class="kicker" style="color:${w.color}">Sector ${i + 1}</div>
      <h3 style="font-size:28px">${esc(w.name)}</h3>
      <p style="font-size:17px;color:#bfe9ff">${esc(w.detail)}</p>
      <p style="font-size:17px"><b>Destination:</b> ${esc(DESTINATIONS[i])}<br/><b>Trip needs:</b> ${RANGE_BY_WORLD[i].toLocaleString("en-US")} m/s of delta-v<br/><b>Finale:</b> ${esc(activityText[ACTIVITY_BY_WORLD[i]])}</p>
      ${objectives.map((o, k) => `<div style="margin:8px 0;padding:8px 10px;border:1.4px solid ${k === 4 ? GOLD : "rgba(223,234,255,.6)"};border-radius:10px;font-size:16px"><b style="color:${k === 4 ? GOLD : LINE}">M${i * 5 + k + 1}</b> · ${esc(o)}</div>`).join("")}
    </div>`);
    if (i < WORLDS.length - 1) svg(`<line x1="${x + colW - 4}" y1="${y0 + 40}" x2="${x + colW + 16}" y2="${y0 + 40}" stroke="${GOLD}" stroke-width="3" marker-end="url(#arr)"/>`);
  });
  box(70, 1210, 1540, 390, `<h2>Every mission, three stages</h2><ul style="font-size:20px">
    <li><b>Space Rush:</b> six learning gates. The question and all three answers are read aloud first, then 7 seconds to think and a 30 → 22 second answer window.</li>
    <li><b>Rocket Hangar:</b> build a rocket that can lift off (thrust-to-weight ≥ 1.1), reach the destination (delta-v) and fly straight (fins + nose).</li>
    <li><b>Destination:</b> a hands-on finale such as orbit insertion, docking, landing, sample grabbing or a photo flyby.</li>
    <li>Star Scouts (5–7), Orbit Pilots (8–10) and Mission Commanders (11–12) each have their own 30 missions: 90 in all.</li></ul>`);
  titleBlock(1652, H - 36 - 238 - 8, 640, 238, { title: "Mission route", code: "X-02", scale: "NTS", sheet: index + 1, of: ORDER.length, subtitle: "Sectors, objectives and finales" });
}

// ------------------------------------------------------------------ single views (views pack)

function singleView(spec: SingleSpec) {
  setSize(spec.width, spec.height, true);
  clearAll();
  const bp = getBlueprint(spec.id)!;
  const built = build(bp);
  const capH = 64;
  const w = spec.width, h = spec.height - capH;
  sheetEl.style.background = spec.view === "colour" ? "radial-gradient(circle at 50% 40%, #24408f, #0b1640)" : "";
  if (spec.view === "colour") {
    renderColour(built.scene, isoCamera(built.box, w, h, 0.1), 0, 0, w, h, spec.height);
  } else {
    const ext = projectedExtent(built.box, spec.view);
    const ew = ext.maxX - ext.minX, eh = ext.maxY - ext.minY;
    const s = Math.min((w * 0.84) / ew, (h * 0.84) / eh);
    renderLine(built.scene, orthoCamera(built.box, spec.view, w, h, s), 0, 0, w, h, spec.height, true);
  }
  const size = built.box.getSize(new THREE.Vector3());
  const viewName = spec.view === "colour" ? "ISOMETRIC VIEW · COLOUR" : VIEW_TITLE[spec.view];
  html(`<div class="caption"><span style="color:${GOLD}">${esc(bp.code)}</span><span>${esc(bp.name)}</span><span style="letter-spacing:.12em">${viewName}</span><small style="margin-left:auto">${fmt(size.x)} W × ${fmt(size.y)} H × ${fmt(size.z)} D</small></div>`);
}

// ------------------------------------------------------------------ API

async function drawSheet(spec: SheetSpec) {
  const index = ORDER.findIndex((s) => JSON.stringify(s) === JSON.stringify(spec));
  switch (spec.kind) {
    case "cover": coverSheet(index); break;
    case "howto": howToSheet(index); break;
    case "cast": castSheet(index); break;
    case "part": partSheet(getBlueprint(spec.id)!, index); break;
    case "exploded": explodedSheet(getBlueprint(spec.id)!, index); break;
    case "systems": systemsSheet(index); break;
    case "site": siteSheet(index); break;
    case "solar": solarSheet(index); break;
    case "route": routeSheet(index); break;
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

declare global {
  interface Window {
    __book?: { list: () => { spec: SheetSpec; file: string; code: string; title: string }[]; sheet: (spec: SheetSpec) => Promise<void>; single: (spec: SingleSpec) => Promise<void>; blueprints: () => { id: string; code: string; name: string }[] };
    __bookReady?: boolean;
    __bookError?: string;
  }
}

async function init() {
  try { await document.fonts.load("700 32px 'Fredoka Variable'"); await document.fonts.ready; } catch { /* fonts optional */ }
  window.__book = {
    list: () => ORDER.map((spec, i) => ({ spec, file: fileName(spec, i), code: sheetCode(spec), title: sheetTitle(spec) })),
    sheet: drawSheet,
    single: async (spec) => { singleView(spec); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); },
    blueprints: () => BLUEPRINTS.map((b) => ({ id: b.id, code: b.code, name: b.name })),
  };
  const first = new URLSearchParams(location.search).get("sheet");
  if (first !== null) await drawSheet(ORDER[Number(first)] ?? ORDER[0]);
  window.__bookReady = true;
}

init().catch((error: unknown) => { window.__bookError = String((error as Error)?.stack ?? error); console.error(error); });
