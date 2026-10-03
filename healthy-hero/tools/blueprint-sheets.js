// Healthy Hero 3D — printable blueprint sheet generator.
// Open tools/blueprint-sheets.html?sheet=<id> (served by server.mjs). Every drawing is
// rendered live from src/blueprints.js through src/models.js, so the sheets always match
// the models used in the game. tools/render-blueprints.mjs captures all sheets to PNG/PDF.
import * as THREE from '../src/vendor/three.module.min.js?v=2.0.0';
import { BLUEPRINTS, BIOMES, LAYOUT, DRAWING, BLUEPRINT_VERSION, HERO_ORDER, EMBLEM_BY_TOPIC, partsTable, toCm, laneX } from '../src/blueprints.js?v=2.0.0';
import { buildModel, measure, materialSpec } from '../src/models.js?v=2.0.0';
import { Rig } from '../src/rig.js?v=2.0.0';
import { BlueprintRenderer, orthoCamera, perspectiveCamera, fitPerspective, projectToPixels, VIEWS, BP } from '../src/blueprint-render.js?v=2.0.0';

const W = 3508, H = 2480;
const PX_PER_M_AT_1 = 11811.02; // 300 dpi
const SS = 2;
const SCALES = [2, 2.5, 4, 5, 7.5, 10, 12.5, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 200, 250, 300, 400, 500];
const SVGNS = 'http://www.w3.org/2000/svg';

export const SHEETS = [
  { id: 'cover', title: 'Cover & Contents' },
  { id: 'lineup', title: 'Cast Lineup & Scale' },
  { id: 'pip-elev', title: 'Pip — Elevations' }, { id: 'pip-detail', title: 'Pip — Plan, Parts & Color' },
  { id: 'mia-elev', title: 'Mia — Elevations' }, { id: 'mia-detail', title: 'Mia — Plan, Parts & Color' },
  { id: 'leo-elev', title: 'Leo — Elevations' }, { id: 'leo-detail', title: 'Leo — Plan, Parts & Color' },
  { id: 'ginger-elev', title: 'Ginger — Elevations' }, { id: 'ginger-detail', title: 'Ginger — Plan, Parts & Color' },
  { id: 'gate-elev', title: 'Power Gate — Elevations & Open State' }, { id: 'gate-detail', title: 'Power Gate — Parts, Sign & Color' },
  { id: 'emblems', title: 'Topic Emblems' },
  { id: 'track', title: 'Track, Lanes, Camera & Timing' },
  ...BIOMES.map((b, i) => ({ id: `biome-${b.key}`, title: `${b.name} — Biome Kit`, biome: i })),
  { id: 'rig', title: 'Rig & Animation Reference' }
];

// ---------------------------------------------------------------------------------------
const el = (tag, cls, parent, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
};
const pos = (e, x, y, w, h) => { e.style.left = `${x}px`; e.style.top = `${y}px`; if (w !== undefined) e.style.width = `${w}px`; if (h !== undefined) e.style.height = `${h}px`; return e; };
const svg = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const bpr = new BlueprintRenderer(renderer);
let envTex = null;
function environment() {
  if (envTex) return envTex;
  const pm = new THREE.PMREMGenerator(renderer);
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = mix(vec3(0.3,0.38,0.5), vec3(1.0,0.97,0.92), smoothstep(-0.3,0.8,h)); gl_FragColor = vec4(c*1.25,1.); }'
  })));
  envTex = pm.fromScene(s, 0.03).texture;
  return envTex;
}

function chooseScale(sizeX, sizeY, panelW, panelH, fill = 0.8) {
  for (const d of SCALES) {
    const k = PX_PER_M_AT_1 / d;
    if (sizeX * k <= panelW * fill && sizeY * k <= panelH * fill) return d;
  }
  return SCALES[SCALES.length - 1];
}
const pxm = (denom) => PX_PER_M_AT_1 / denom;
const fmtScale = (d) => `SCALE 1:${d}`;

// ---------------------------------------------------------------------------------------
// Sheet chrome
// ---------------------------------------------------------------------------------------
function sheetChrome(sheetIndex, title, kicker = 'Healthy Hero 3D · Production Blueprints') {
  const sheet = el('div', 'sheet', document.body);
  el('div', 'frame-outer', sheet);
  el('div', 'frame-inner', sheet);
  const cols = 8, rows = 6;
  for (let i = 0; i < cols; i++) {
    const x = 100 + ((W - 200) / cols) * (i + 0.5);
    for (const y of [62, H - 92]) { const z = el('div', 'zone', sheet, String(i + 1)); pos(z, x - 25, y); }
    if (i) for (const y of [50, H - 100]) { const t = el('div', 'zone-tick', sheet); pos(t, 100 + ((W - 200) / cols) * i, y, 3, 50); }
  }
  for (let j = 0; j < rows; j++) {
    const y = 100 + ((H - 200) / rows) * (j + 0.5);
    for (const x of [50, W - 100]) { const z = el('div', 'zone', sheet, 'ABCDEF'[j]); pos(z, x, y - 15); }
    if (j) for (const x of [50, W - 100]) { const t = el('div', 'zone-tick', sheet); pos(t, x, 100 + ((H - 200) / rows) * j, 50, 3); }
  }
  const head = el('header', 'sheet-head', sheet);
  el('span', 'kicker', head, kicker);
  el('h1', '', head, title);
  el('span', 'sheet-no', head, `SHEET ${String(sheetIndex + 1).padStart(2, '0')} / ${SHEETS.length}`);
  return sheet;
}

function titleBlock(sheet, { name, sheetTitle, scale, index, source = 'src/blueprints.js', extra }) {
  const tb = el('div', 'title-block', sheet);
  const t = el('div', 'tb-title', tb);
  el('b', '', t, 'HEALTHY HERO 3D');
  el('span', '', t, `${DRAWING.studio.toUpperCase()} · HEALTHY.FLEXZONICGAMES.COM`);
  const cell = (label, value, cls = '') => { const c = el('div', cls, tb); el('label', '', c, label); el('div', `v ${value.length > 22 ? 'small' : ''}`, c, value); return c; };
  cell('Drawing', sheetTitle || name, 'wide');
  cell('Sheet', `${String(index + 1).padStart(2, '0')} / ${SHEETS.length}`);
  cell('Scale', scale || 'AS NOTED');
  cell('Units', 'CENTIMETERS');
  const pj = cell('Projection', 'THIRD-ANGLE');
  const sym = svg('svg', { width: 120, height: 44, viewBox: '0 0 120 44' }, pj);
  svg('path', { d: 'M4 10 L44 4 L44 40 L4 34 Z', fill: 'none', stroke: '#eef7ff', 'stroke-width': 3 }, sym);
  svg('circle', { cx: 84, cy: 22, r: 18, fill: 'none', stroke: '#eef7ff', 'stroke-width': 3 }, sym);
  svg('circle', { cx: 84, cy: 22, r: 8, fill: 'none', stroke: '#eef7ff', 'stroke-width': 3 }, sym);
  cell('Version', `v${BLUEPRINT_VERSION}`);
  cell('Date', DRAWING.date);
  cell('Source', extra || source);
  return tb;
}

function box(sheet, x, y, w, h, title) {
  const b = el('div', 'box', sheet);
  pos(b, x, y, w, h);
  if (title) el('h3', '', b, title);
  return b;
}

function notesBox(sheet, x, y, w, h, title, notes) {
  const b = box(sheet, x, y, w, h, title);
  const ul = el('ul', '', b);
  for (const n of notes) el('li', '', ul, n);
  return b;
}

function paletteBox(sheet, x, y, w, h, spec, keys, title = 'Color & Material') {
  const b = box(sheet, x, y, w, h, title);
  const grid = el('div', `swatches ${w < 560 ? 'one' : ''}`, b);
  const list = keys || Object.keys(spec.materials);
  for (const k of list) {
    const m = spec.materials[k];
    if (!m) continue;
    const s = el('div', 'swatch', grid);
    const chip = el('i', '', s);
    chip.style.background = m.hex;
    if (m.emissive >= 1) chip.style.boxShadow = `0 0 18px ${m.hex}`;
    const t = el('div', '', s);
    el('b', '', t, m.name || k);
    el('small', '', t, `${m.hex.toUpperCase()}${m.emissive ? ` · glow ${m.emissive}` : ''}${m.opacity ? ` · α${m.opacity}` : ''}${m.runtime ? ' · runtime' : ''}`);
  }
  return b;
}

// ---------------------------------------------------------------------------------------
// Panels and rendering
// ---------------------------------------------------------------------------------------
function panel(sheet, x, y, w, h, label, sub, cls = '') {
  const p = el('div', `panel ${cls}`, sheet);
  pos(p, x, y, w, h);
  const canvas = el('canvas', '', p);
  canvas.width = w; canvas.height = h;
  const s = svg('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}` }, p);
  const defs = svg('defs', {}, s);
  const mk = svg('marker', { id: `arw${Math.random().toString(36).slice(2, 8)}`, viewBox: '0 0 10 10', refX: 9.5, refY: 5, markerWidth: 9, markerHeight: 9, orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse' }, defs);
  mk.setAttribute('markerWidth', '26'); mk.setAttribute('markerHeight', '26');
  svg('path', { d: 'M0 1 L10 5 L0 9 Z', fill: BP.dim }, mk);
  if (label) {
    const l = el('div', 'plabel', p, label);
    if (sub) el('small', '', l, sub);
  }
  return { el: p, canvas, svg: s, arrow: mk.id, x, y, w, h };
}

function renderLine(pn, object, camera, { lineWidth = 1.35, pixelWorld, depthK = 0.015, crease = 0.22, fill = 0.85 } = {}) {
  const w = pn.w * SS, h = pn.h * SS;
  renderer.setSize(w, h, false);
  bpr.render(object, camera, { width: w, height: h, lineWidth: lineWidth * SS * 0.75, pixelWorld: pixelWorld / SS, depthK, crease, fillAmount: fill });
  const ctx = pn.canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(renderer.domElement, 0, 0, pn.w, pn.h);
}

function renderColor(pn, object, camera, { exposure = 1.0 } = {}) {
  const scene = new THREE.Scene();
  scene.environment = environment();
  scene.environmentIntensity = 0.7;
  scene.add(new THREE.HemisphereLight('#ffffff', '#4a5a7a', 1.25));
  const d = new THREE.DirectionalLight('#ffffff', 2.3); d.position.set(3, 5, 4); scene.add(d);
  const prevParent = object.parent;
  scene.add(object);
  renderer.setSize(pn.w * SS, pn.h * SS, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.setClearColor(0x000000, 0);
  renderer.render(scene, camera);
  renderer.toneMapping = THREE.NoToneMapping;
  const ctx = pn.canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(renderer.domElement, 0, 0, pn.w, pn.h);
  if (prevParent) prevParent.add(object); else scene.remove(object);
}

function partBox(model, ids) {
  const box = new THREE.Box3();
  for (const id of ids) { const m = model.meshes[id]; if (m) box.union(measure(m)); }
  return box;
}

function screenBox(box, cam, pn) {
  const pts = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) pts.push(projectToPixels(new THREE.Vector3(x, y, z), cam, pn.w, pn.h));
  return { minX: Math.min(...pts.map((p) => p.x)), maxX: Math.max(...pts.map((p) => p.x)), minY: Math.min(...pts.map((p) => p.y)), maxY: Math.max(...pts.map((p) => p.y)) };
}

// Draw a dimension. orient 'h': measures x1→x2 at height yDim; extension lines from yFrom.
function dim(pn, orient, a1, a2, at, from1, from2, label, { color = BP.dim, text = true, size = 30 } = {}) {
  const g = svg('g', {}, pn.svg);
  const stroke = { stroke: color, 'stroke-width': 2.4, fill: 'none' };
  if (orient === 'h') {
    const dir = Math.sign(at - from1) || -1;
    svg('line', { x1: a1, y1: from1 + dir * 10, x2: a1, y2: at + dir * 16, ...stroke }, g);
    svg('line', { x1: a2, y1: from2 + dir * 10, x2: a2, y2: at + dir * 16, ...stroke }, g);
    const line = svg('line', { x1: a1, y1: at, x2: a2, y2: at, ...stroke }, g);
    line.setAttribute('marker-start', `url(#${pn.arrow})`); line.setAttribute('marker-end', `url(#${pn.arrow})`);
    if (text) {
      const t = svg('text', { x: (a1 + a2) / 2, y: at - 12, 'text-anchor': 'middle', fill: '#ffffff', 'font-family': 'Nunito', 'font-weight': 900, 'font-size': size, 'letter-spacing': 1.5 }, g);
      t.textContent = label;
      halo(t);
    }
  } else {
    const dir = Math.sign(at - from1) || -1;
    svg('line', { x1: from1 + dir * 10, y1: a1, x2: at + dir * 16, y2: a1, ...stroke }, g);
    svg('line', { x1: from2 + dir * 10, y1: a2, x2: at + dir * 16, y2: a2, ...stroke }, g);
    const line = svg('line', { x1: at, y1: a1, x2: at, y2: a2, ...stroke }, g);
    line.setAttribute('marker-start', `url(#${pn.arrow})`); line.setAttribute('marker-end', `url(#${pn.arrow})`);
    if (text) {
      const cx = at - 14, cy = (a1 + a2) / 2;
      const t = svg('text', { x: cx, y: cy, 'text-anchor': 'middle', fill: '#ffffff', 'font-family': 'Nunito', 'font-weight': 900, 'font-size': size, 'letter-spacing': 1.5, transform: `rotate(-90 ${cx} ${cy})` }, g);
      t.textContent = label;
      halo(t);
    }
  }
  return g;
}
function halo(t) { t.setAttribute('paint-order', 'stroke'); t.setAttribute('stroke', '#0b3778'); t.setAttribute('stroke-width', '8'); t.setAttribute('stroke-linejoin', 'round'); }

function centerLine(pn, x1, y1, x2, y2) {
  svg('line', { x1, y1, x2, y2, stroke: '#9fe9ff', 'stroke-width': 2, 'stroke-dasharray': '46 10 8 10', opacity: 0.75 }, pn.svg);
}
function groundLine(pn, y, x1, x2, label = 'GROUND') {
  svg('line', { x1, y1: y, x2, y2: y, stroke: '#eef7ff', 'stroke-width': 3.5 }, pn.svg);
  for (let x = x1; x < x2; x += 26) svg('line', { x1: x, y1: y + 2, x2: x - 16, y2: y + 18, stroke: '#9fd0ff', 'stroke-width': 2, opacity: 0.7 }, pn.svg);
  const t = svg('text', { x: x1 + 4, y: y - 10, 'text-anchor': 'start', fill: '#9fd0ff', 'font-family': 'Nunito', 'font-weight': 800, 'font-size': 22, 'letter-spacing': 2 }, pn.svg);
  t.textContent = label;
}
function balloon(pn, x, y, tx, ty, n) {
  svg('line', { x1: x, y1: y, x2: tx, y2: ty, stroke: '#ffd45b', 'stroke-width': 2 }, pn.svg);
  svg('circle', { cx: tx, cy: ty, r: 6, fill: '#ffd45b' }, pn.svg);
  svg('circle', { cx: x, cy: y, r: 24, fill: '#0b3778', stroke: '#ffd45b', 'stroke-width': 3 }, pn.svg);
  const t = svg('text', { x, y: y + 9, 'text-anchor': 'middle', fill: '#ffd45b', 'font-family': 'Nunito', 'font-weight': 900, 'font-size': 26 }, pn.svg);
  t.textContent = String(n);
}
function svgText(parent, x, y, text, { size = 26, color = '#eef7ff', anchor = 'start', weight = 800, rotate = 0, spacing = 1 } = {}) {
  const t = svg('text', { x, y, 'text-anchor': anchor, fill: color, 'font-family': 'Nunito', 'font-weight': weight, 'font-size': size, 'letter-spacing': spacing }, parent);
  if (rotate) t.setAttribute('transform', `rotate(${rotate} ${x} ${y})`);
  t.textContent = text;
  return t;
}

// View helpers -------------------------------------------------------------------------
const AXIS_SCREEN = {
  front: { h: 'x', v: 'y' }, back: { h: 'x', v: 'y' }, left: { h: 'z', v: 'y' }, right: { h: 'z', v: 'y' },
  top: { h: 'x', v: 'z' }, bottom: { h: 'x', v: 'z' }
};

function drawElevation(pn, model, viewName, denom, { center, groundY = 0, overall = true, specDims = true, groundLabel = 'GROUND' } = {}) {
  const k = pxm(denom);
  const box = measure(model.root);
  const c = center || box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const camDist = Math.max(size.x, size.y, size.z) * 2 + 2;
  const cam = orthoCamera(viewName, c, k, pn.w, pn.h, camDist);
  renderLine(pn, model.root, cam, { pixelWorld: 1 / k, depthK: Math.max(0.006, Math.max(size.x, size.y, size.z) * 0.012) });
  const sb = screenBox(box, cam, pn);
  const isElev = ['front', 'back', 'left', 'right'].includes(viewName);
  // center line
  if (viewName === 'front' || viewName === 'back') { const p = projectToPixels(new THREE.Vector3(0, 0, 0), cam, pn.w, pn.h); centerLine(pn, p.x, sb.minY - 50, p.x, sb.maxY + 40); }
  if (viewName === 'left' || viewName === 'right') { const p = projectToPixels(new THREE.Vector3(0, 0, 0), cam, pn.w, pn.h); centerLine(pn, p.x, sb.minY - 50, p.x, sb.maxY + 40); }
  if (viewName === 'top' || viewName === 'bottom') {
    const p = projectToPixels(new THREE.Vector3(0, 0, 0), cam, pn.w, pn.h);
    centerLine(pn, p.x, sb.minY - 40, p.x, sb.maxY + 40); centerLine(pn, sb.minX - 40, p.y, sb.maxX + 40, p.y);
  }
  let gy = null;
  if (isElev) {
    gy = projectToPixels(new THREE.Vector3(c.x, groundY, c.z), cam, pn.w, pn.h).y;
    groundLine(pn, gy, Math.max(10, sb.minX - 120), Math.min(pn.w - 10, sb.maxX + 120), groundLabel);
  }
  if (overall) {
    const ax = AXIS_SCREEN[viewName];
    const hLen = size[ax.h];
    const bottomRef = isElev ? gy : sb.maxY;
    dim(pn, 'h', sb.minX, sb.maxX, bottomRef + 74, bottomRef, bottomRef, `${toCm(hLen)}`);
    if (isElev) {
      const topY = projectToPixels(new THREE.Vector3(c.x, box.max.y, c.z), cam, pn.w, pn.h).y;
      dim(pn, 'v', gy, topY, sb.minX - 70, sb.minX, sb.minX, `${toCm(box.max.y - groundY)}`);
    } else {
      dim(pn, 'v', sb.maxY, sb.minY, sb.minX - 70, sb.minX, sb.minX, `${toCm(size[ax.v])}`);
    }
  }
  if (specDims) {
    let stackR = 0, stackT = 0;
    for (const d of model.spec.dims || []) {
      if (!d.views.includes(viewName)) continue;
      const ids = d.type === 'span' ? d.parts : d.type === 'between' ? [d.a, d.b] : [d.part];
      const pb = partBox(model, ids);
      if (pb.isEmpty()) continue;
      const psb = screenBox(pb, cam, pn);
      const horizontal = AXIS_SCREEN[viewName].h === d.axis;
      let v1, v2, len;
      if (d.type === 'between') {
        const ca = measure(model.meshes[d.a]).getCenter(new THREE.Vector3()), cb = measure(model.meshes[d.b]).getCenter(new THREE.Vector3());
        const pa = projectToPixels(ca, cam, pn.w, pn.h), pbp = projectToPixels(cb, cam, pn.w, pn.h);
        len = Math.abs(ca[d.axis] - cb[d.axis]);
        if (horizontal) { v1 = pa.x; v2 = pbp.x; } else { v1 = pa.y; v2 = pbp.y; }
      } else if (d.type === 'ground') {
        len = pb.min.y - groundY;
        v1 = gy; v2 = projectToPixels(new THREE.Vector3(c.x, pb.min.y, c.z), cam, pn.w, pn.h).y;
      } else {
        len = pb.max[d.axis] - pb.min[d.axis];
        if (horizontal) { v1 = psb.minX; v2 = psb.maxX; } else { v1 = psb.maxY; v2 = psb.minY; }
      }
      const label = `${d.label} ${toCm(len)}`;
      if (horizontal) {
        const at = sb.minY - 70 - stackT * 74;
        dim(pn, 'h', Math.min(v1, v2), Math.max(v1, v2), at, psb.minY, psb.minY, label, { size: 26 });
        stackT++;
      } else {
        const at = sb.maxX + 74 + stackR * 74;
        dim(pn, 'v', v1, v2, at, d.type === 'ground' ? sb.maxX - 40 : psb.maxX, psb.maxX, label, { size: 26 });
        stackR++;
      }
    }
  }
  const lab = pn.el.querySelector('.plabel');
  if (lab) {
    const below = (isElev ? gy : sb.maxY) + 150;
    if (below < pn.h - 20) { lab.style.bottom = 'auto'; lab.style.top = `${below}px`; }
  }
  return cam;
}

function explodedModel(model, amount = 0.55) {
  model.root.updateMatrixWorld(true);
  const group = new THREE.Group();
  const center = measure(model.root).getCenter(new THREE.Vector3());
  const items = [];
  const meshes = [];
  model.root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const m of meshes) {
    const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
    m.matrixWorld.decompose(wp, wq, ws);
    const clone = new THREE.Mesh(m.geometry, m.material);
    clone.position.copy(wp); clone.quaternion.copy(wq); clone.scale.copy(ws);
    const pc = measure(m).getCenter(new THREE.Vector3());
    const dir = pc.clone().sub(center);
    dir.y *= 1.15;
    const off = dir.multiplyScalar(amount);
    clone.position.add(off);
    clone.userData.part = m.userData.part;
    group.add(clone);
    items.push({ mesh: clone, center: pc.add(off), part: m.userData.part });
  }
  return { group, items };
}

// ---------------------------------------------------------------------------------------
// Sheet builders
// ---------------------------------------------------------------------------------------
async function sheetElevations(index, id) {
  const spec = BLUEPRINTS[id];
  const sheet = sheetChrome(index, `${spec.name} — Orthographic Elevations`);
  const model = buildModel(id, { lod: 2 });
  const bbx = measure(model.root), size = bbx.getSize(new THREE.Vector3());
  const views = ['right', 'front', 'left', 'back'];
  const pw = 780, ph = 1250, gap = 36, x0 = 140, y0 = 280;
  const denom = chooseScale(Math.max(size.x, size.z), bbx.max.y, pw - 260, ph - 330, 1);
  const center = new THREE.Vector3(0, bbx.max.y / 2 + 0.02 * (bbx.max.y), 0);
  views.forEach((v, i) => {
    const pn = panel(sheet, x0 + i * (pw + gap), y0, pw, ph, VIEWS[v].label, VIEWS[v].sub || fmtScale(denom));
    drawElevation(pn, model, v, denom, { center: new THREE.Vector3(v === 'left' || v === 'right' ? 0 : 0, center.y, 0) });
  });
  notesBox(sheet, 140, 1640, 1360, 700, `${spec.title}`, [spec.role, ...(spec.notes || [])]);
  paletteBox(sheet, 1540, 1640, 640, 700, spec, Object.keys(spec.materials).filter((k) => !['white'].includes(k)).slice(0, 12));
  // Color key
  const key = panel(sheet, 2218, 1640, 1150, 250, '', '', 'color');
  const keyModel = buildModel(id, { lod: 2 });
  const kb = measure(keyModel.root), kc = kb.getCenter(new THREE.Vector3());
  void kc;
  renderColor(key, keyModel.root, fitPerspective(kb, key.w / key.h, [0.9, 0.35, 1.2], 22, 1.12));
  svgText(key.svg, 20, 40, 'COLOR KEY · 3/4', { size: 24, color: '#9fe9ff', weight: 900, spacing: 3 });
  titleBlock(sheet, { name: spec.title, sheetTitle: `${spec.name} — Elevations`, scale: `1:${denom}`, index });
  return sheet;
}

async function sheetDetails(index, id) {
  const spec = BLUEPRINTS[id];
  const sheet = sheetChrome(index, `${spec.name} — Plan, Parts & Color`);
  const model = buildModel(id, { lod: 2 });
  const bbx = measure(model.root), size = bbx.getSize(new THREE.Vector3());
  const denom = chooseScale(size.x, size.z, 900 - 260, 860 - 220, 1);
  const top = panel(sheet, 140, 300, 900, 860, 'TOP (PLAN)', `front faces down · ${fmtScale(denom)}`);
  drawElevation(top, model, 'top', denom, { center: new THREE.Vector3(0, bbx.max.y / 2, 0), specDims: false });
  const bot = panel(sheet, 140, 1300, 900, 860, 'BOTTOM', `front faces up · ${fmtScale(denom)}`);
  drawElevation(bot, model, 'bottom', denom, { center: new THREE.Vector3(0, bbx.max.y / 2, 0), specDims: false });
  // Color reference
  const col = panel(sheet, 1090, 300, 1000, 860, '3/4 COLOR REFERENCE', 'Lit render of the in-game model', 'color');
  const cm = buildModel(id, { lod: 2 });
  const cb = measure(cm.root), cc = cb.getCenter(new THREE.Vector3());
  void cc;
  renderColor(col, cm.root, fitPerspective(cb, col.w / col.h, [0.85, 0.4, 1.2], 26, 1.25));
  // Exploded
  const ex = panel(sheet, 1090, 1260, 1000, 960, 'EXPLODED ASSEMBLY', 'Balloon numbers match the parts list', 'boxed');
  const em = buildModel(id, { lod: 2 });
  const { group, items } = explodedModel(em, spec.kind === 'character' ? 0.62 : 0.5);
  const gb = measure(group), gc = gb.getCenter(new THREE.Vector3());
  void gc;
  const ecam = fitPerspective(gb, ex.w / ex.h, [0.75, 0.4, 1.25], 26, 1.55);
  renderLine(ex, group, ecam, { pixelWorld: gb.getSize(new THREE.Vector3()).length() / ex.h, depthK: 0.01 });
  // Balloons (one per parts-table row), placed on a ring.
  const rows = partsTable(spec);
  const cx = ex.w / 2, cy = ex.h / 2;
  const anchors = [];
  rows.forEach((row, i) => {
    const it = items.find((q) => q.part.id === row.id);
    if (!it) return;
    const p = projectToPixels(it.center, ecam, ex.w, ex.h);
    anchors.push({ n: i + 1, p, a: Math.atan2(p.y - cy, p.x - cx) });
  });
  anchors.sort((a, b) => a.a - b.a);
  const R = Math.min(ex.w, ex.h) * 0.46;
  anchors.forEach((q, i) => {
    const a = -Math.PI + (i + 0.5) * (Math.PI * 2 / anchors.length);
    const bx = cx + Math.cos(a) * R * 1.02, by = cy + Math.sin(a) * R * 0.98;
    balloon(ex, bx, by, q.p.x, q.p.y, q.n);
  });
  // Parts table
  const tb = box(sheet, 2130, 300, 1238, 1580, `Parts List · ${rows.reduce((s, r) => s + r.qty, 0)} pieces`);
  const table = el('table', 'parts', tb);
  const hr = el('tr', '', el('thead', '', table));
  for (const h of ['#', 'PART', 'SHAPE', 'QTY', 'SIZE (CM)', 'MATERIAL']) el('th', '', hr, h);
  const body = el('tbody', '', table);
  const maxRows = 44;
  rows.slice(0, maxRows).forEach((r, i) => {
    const tr = el('tr', '', body);
    el('td', 'n', tr, String(i + 1));
    el('td', '', tr, r.name);
    el('td', 'mono', tr, r.shape);
    el('td', 'mono', tr, `×${r.qty}`);
    el('td', 'mono', tr, r.size);
    const mt = el('td', '', tr);
    const chip = el('i', '', mt); chip.style.background = materialSpec(spec, r.mat).hex;
    mt.append(document.createTextNode(r.mat));
  });
  const rowsPx = Math.min(rows.length, maxRows);
  if (rowsPx > 30) table.style.fontSize = '19px';
  titleBlock(sheet, { name: spec.title, sheetTitle: `${spec.name} — Plan, Parts & Color`, scale: `1:${denom}`, index });
  return sheet;
}

async function sheetGateElev(index) {
  const id = 'gate', spec = BLUEPRINTS.gate;
  const sheet = sheetChrome(index, 'Power Gate — Elevations & Open State');
  const model = buildModel(id, { lod: 2 });
  const bbx = measure(model.root);
  const pw = 980, ph = 1270;
  const denom = chooseScale(2.3, bbx.max.y, pw - 296, ph - 270, 1);
  const center = new THREE.Vector3(0, bbx.max.y / 2, 0);
  const pf = panel(sheet, 140, 280, pw, ph, 'FRONT', fmtScale(denom));
  drawElevation(pf, model, 'front', denom, { center });
  const pl = panel(sheet, 140 + pw + 30, 280, 560, ph, 'LEFT SIDE', fmtScale(denom));
  drawElevation(pl, model, 'left', denom, { center, overall: true });
  const pt = panel(sheet, 140 + pw + 620, 280, pw, 560, 'TOP (PLAN)', fmtScale(denom));
  drawElevation(pt, model, 'top', denom, { center, specDims: false });
  // Open state
  const open = buildModel(id, { lod: 2 });
  open.joints.panelL.position.x += 0.95; open.joints.panelR.position.x -= 0.95;
  open.joints.panelL.rotation.y = -0.5; open.joints.panelR.rotation.y = 0.5;
  open.meshes.core.visible = false;
  const po = panel(sheet, 140 + pw + 620, 920, pw, 600, 'OPEN STATE — HELPFUL ANSWER', 'panels slide ±95 cm and swing 29°');
  const ob = measure(open.root);
  const ocam = orthoCamera('front', new THREE.Vector3(0, bbx.max.y / 2, 0), pxm(chooseScale(ob.getSize(new THREE.Vector3()).x, ob.max.y, pw - 120, 600 - 80, 1)), po.w, po.h, 10);
  renderLine(po, open.root, ocam, { pixelWorld: 0.01, depthK: 0.02 });
  // Back
  const pb = panel(sheet, 140 + pw * 2 + 650, 280, 3368 - (140 + pw * 2 + 650), ph, 'BACK', fmtScale(denom));
  drawElevation(pb, model, 'back', denom, { center, overall: false });
  notesBox(sheet, 140, 1640, 1360, 700, spec.title, [spec.role, ...spec.notes]);
  paletteBox(sheet, 1540, 1640, 640, 700, spec, ['metal', 'frame', 'frameLight', 'panel', 'core', 'laneGlow', 'thruster', 'beacon']);
  const key = panel(sheet, 2218, 1640, 1150, 250, '', '', 'color');
  const km = buildModel(id, { lod: 2 });
  const kb = measure(km.root);
  renderColor(key, km.root, fitPerspective(kb, key.w / key.h, [0.8, 0.3, 1.3], 22, 1.12));
  svgText(key.svg, 20, 40, 'COLOR KEY · 3/4', { size: 24, color: '#9fe9ff', weight: 900, spacing: 3 });
  titleBlock(sheet, { name: spec.title, sheetTitle: 'Power Gate — Elevations', scale: `1:${denom}`, index });
  return sheet;
}

async function sheetGateDetail(index) {
  const spec = BLUEPRINTS.gate;
  const sheet = sheetChrome(index, 'Power Gate — Parts, Sign & Color');
  // Exploded
  const ex = panel(sheet, 140, 290, 1300, 1230, 'EXPLODED ASSEMBLY', 'Balloon numbers match the parts list', 'boxed');
  const em = buildModel('gate', { lod: 2 });
  const { group, items } = explodedModel(em, 0.42);
  const gb = measure(group), gc = gb.getCenter(new THREE.Vector3());
  void gc;
  const cam = fitPerspective(gb, ex.w / ex.h, [0.7, 0.35, 1.3], 26, 1.5);
  renderLine(ex, group, cam, { pixelWorld: gb.getSize(new THREE.Vector3()).length() / ex.h, depthK: 0.02 });
  const rows = partsTable(spec);
  const cx = ex.w / 2, cy = ex.h / 2, anchors = [];
  rows.forEach((row, i) => { const it = items.find((q) => q.part.id === row.id); if (!it) return; const p = projectToPixels(it.center, cam, ex.w, ex.h); anchors.push({ n: i + 1, p, a: Math.atan2(p.y - cy, p.x - cx) }); });
  anchors.sort((a, b) => a.a - b.a);
  anchors.forEach((q, i) => { const a = -Math.PI + (i + 0.5) * (Math.PI * 2 / anchors.length); balloon(ex, cx + Math.cos(a) * ex.w * 0.45, cy + Math.sin(a) * ex.h * 0.45, q.p.x, q.p.y, q.n); });
  // Sign texture layout
  const sg = box(sheet, 1480, 300, 1100, 640, 'Answer Sign Texture · 1024 × 512 px');
  const ss = svg('svg', { width: 1040, height: 520, viewBox: '0 0 1040 520' }, sg);
  svg('rect', { x: 10, y: 10, width: 1000, height: 500, rx: 18, fill: 'rgba(99,242,192,0.15)', stroke: '#eef7ff', 'stroke-width': 3 }, ss);
  svg('line', { x1: 510, y1: 10, x2: 510, y2: 510, stroke: '#ffd45b', 'stroke-width': 3, 'stroke-dasharray': '18 10' }, ss);
  svg('circle', { cx: 80, cy: 80, r: 46, fill: 'rgba(255,179,71,0.4)', stroke: '#eef7ff', 'stroke-width': 3 }, ss);
  svgText(ss, 80, 92, '1', { size: 40, anchor: 'middle', weight: 900 });
  svgText(ss, 510, 240, 'ANSWER TEXT', { size: 54, anchor: 'middle', weight: 900 });
  svgText(ss, 510, 300, 'Baloo 2 · 800 · auto-fit 3 lines max', { size: 26, anchor: 'middle', color: '#bfe3ff' });
  svgText(ss, 260, 480, 'LEFT PANEL  u 0.0–0.5', { size: 24, anchor: 'middle', color: '#ffd45b', weight: 900 });
  svgText(ss, 760, 480, 'RIGHT PANEL  u 0.5–1.0', { size: 24, anchor: 'middle', color: '#ffd45b', weight: 900 });
  svgText(ss, 140, 92, 'lane badge + shape', { size: 22, color: '#bfe3ff' });
  // Runtime colors
  const rc = box(sheet, 2620, 300, 748, 640, 'Runtime Tints');
  const lanes = [['Lane 1 ▲', '#ff9f43'], ['Lane 2 ●', '#4dabff'], ['Lane 3 ◆', '#c06cff']];
  const g1 = el('div', 'swatches one', rc);
  for (const [n, c] of lanes) { const s = el('div', 'swatch', g1); const i = el('i', '', s); i.style.background = c; const t = el('div', '', s); el('b', '', t, n); el('small', '', t, `${c.toUpperCase()} · badge + light strip`); }
  el('p', '', rc, 'Frame & panels take the obstacle’s topic color: garden #FF695F, falls #49D9FF, mountain #FFD45B, sky #B889FF, harbor #63F2C0, grove #8AF06A.');
  // Color renders: closed + open
  const c1 = panel(sheet, 1480, 1000, 1100, 600, '', '', 'color');
  const m1 = buildModel('gate', { lod: 2 }), m2 = buildModel('gate', { lod: 2 });
  m2.root.position.x = 2.5;
  m2.joints.panelL.position.x += 0.9; m2.joints.panelR.position.x -= 0.9; m2.joints.panelL.rotation.y = -0.45; m2.joints.panelR.rotation.y = 0.45;
  const pair = new THREE.Group(); pair.add(m1.root, m2.root);
  const pb = measure(pair);
  renderColor(c1, pair, fitPerspective(pb, c1.w / c1.h, [0.25, 0.25, 1.3], 24, 1.12));
  svgText(c1.svg, 24, 44, 'COLOR · CLOSED / OPEN', { size: 24, color: '#9fe9ff', weight: 900, spacing: 3 });
  // Parts list
  const tb = box(sheet, 2620, 1000, 748, 870, 'Parts List');
  const table = el('table', 'parts', tb);
  const hr = el('tr', '', el('thead', '', table));
  for (const h of ['#', 'PART', 'QTY', 'SIZE (CM)']) el('th', '', hr, h);
  const body = el('tbody', '', table);
  rows.forEach((r, i) => { const tr = el('tr', '', body); el('td', 'n', tr, String(i + 1)); el('td', '', tr, r.name); el('td', 'mono', tr, `×${r.qty}`); el('td', 'mono', tr, r.size); });
  notesBox(sheet, 140, 1680, 2040, 660, 'Behavior', [
    'Gates spawn 64 m ahead, fly in and park 24 m ahead while the question is read and during the 7-second thinking time.',
    'During the answer window (30 → 22 s by tier) the gates glide from 24 m to the runner. DASH NOW closes the gap in 0.6 s.',
    'Selected lane: gate core pulses, lane light brightens, the matching answer card glows. Colors never hint which answer is right.',
    'Helpful answer → panels split open with sparkles in the topic color. Miss → soft wobble, cracked panels sink; the run continues.',
    'The sign texture is drawn once per encounter on a canvas (Baloo 2, auto-fit). Text is also shown on large HTML answer cards.'
  ]);
  titleBlock(sheet, { name: spec.title, sheetTitle: 'Power Gate — Details', scale: 'AS NOTED', index });
  return sheet;
}

async function sheetEmblems(index) {
  const sheet = sheetChrome(index, 'Topic Emblems — Six Wellness Worlds');
  const denom = 15;
  const k = pxm(denom);
  EMBLEM_BY_TOPIC.forEach((id, i) => {
    const spec = BLUEPRINTS[id];
    const col = i % 2, row = Math.floor(i / 2);
    const x = 140 + col * 1634, y = 280 + row * 540;
    const head = el('div', 'big-note', sheet);
    pos(head, x, y, 1590);
    head.textContent = `${spec.title.replace('Topic Emblem — ', '').toUpperCase()} · ${spec.name.toUpperCase()} · ${fmtScale(denom)}`;
    head.style.font = "900 30px/1.2 'Nunito'"; head.style.letterSpacing = '0.08em'; head.style.color = '#ffd45b';
    const m = buildModel(id, { lod: 2 });
    const b = measure(m.root), sz = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    let cx = x;
    const view = (name, w, label, hAxis, vAxis) => {
      const pn = panel(sheet, cx, y + 50, w, 400, label, '');
      const cam = orthoCamera(name, c, k, pn.w, pn.h, 3);
      renderLine(pn, m.root, cam, { pixelWorld: 1 / k, depthK: 0.004 });
      const sb = screenBox(b, cam, pn);
      dim(pn, 'h', sb.minX, sb.maxX, sb.maxY + 46, sb.maxY, sb.maxY, toCm(sz[hAxis]), { size: 24 });
      if (vAxis) dim(pn, 'v', sb.maxY, sb.minY, sb.minX - 40, sb.minX, sb.minX, toCm(sz[vAxis]), { size: 24 });
      const lb = pn.el.querySelector('.plabel'); lb.style.bottom = 'auto'; lb.style.top = `${sb.maxY + 70}px`;
      cx += w + 16;
    };
    view('front', Math.round(Math.max(sz.x * k + 150, 300)), 'FRONT', 'x', 'y');
    view('left', Math.round(Math.max(sz.z * k + 80, 190)), 'SIDE', 'z', null);
    view('top', Math.round(Math.max(sz.x * k + 80, 260)), 'TOP', 'x', null);
    const cw = x + 1590 - cx;
    const cp = panel(sheet, cx, y + 50, cw, 400, '', '', 'color');
    const cm = buildModel(id, { lod: 2 });
    renderColor(cp, cm.root, fitPerspective(measure(cm.root), cp.w / cp.h, [0.6, 0.35, 1.2], 26, 1.35));
  });
  notesBox(sheet, 140, 1900, 2040, 440, 'Where emblems appear', [
    'Inside the glass beacon on top of every Power Gate (spinning slowly), sized to fit a 42 cm globe.',
    'As giant monuments in each wedge of Wellness Island and on the badge medals earned for perfect missions.',
    'Shapes are extrusions and lathes, so they read clearly as silhouettes from any side — no emoji fonts needed in 3D.'
  ]);
  titleBlock(sheet, { name: 'Topic Emblems', sheetTitle: 'Topic Emblems', scale: `1:${denom}`, index });
  return sheet;
}

async function sheetTrack(index) {
  const sheet = sheetChrome(index, 'Track, Lanes, Camera & Timing');
  const L = LAYOUT;
  const layer = svg('svg', { class: 'svg-layer', width: W, height: H, viewBox: `0 0 ${W} ${H}` }, sheet);
  const defs = svg('defs', {}, layer);
  const mk = svg('marker', { id: 'tarw', viewBox: '0 0 10 10', refX: 9.5, refY: 5, markerWidth: 22, markerHeight: 22, orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse' }, defs);
  svg('path', { d: 'M0 1 L10 5 L0 9 Z', fill: BP.dim }, mk);
  const S = { stroke: '#eef7ff', 'stroke-width': 3, fill: 'none' };
  const dimL = (x1, y1, x2, y2, label, off = -24) => {
    const l = svg('line', { x1, y1, x2, y2, stroke: BP.dim, 'stroke-width': 2.4 }, layer);
    l.setAttribute('marker-start', 'url(#tarw)'); l.setAttribute('marker-end', 'url(#tarw)');
    const vertical = Math.abs(x2 - x1) < Math.abs(y2 - y1);
    const t = svgText(layer, (x1 + x2) / 2 + (vertical ? off : 0), (y1 + y2) / 2 + (vertical ? 0 : off), label, { size: 26, anchor: 'middle', weight: 900, rotate: vertical ? -90 : 0 });
    halo(t);
  };
  // PLAN VIEW — track runs left → right (runner at left).
  const scale = 40; // px per meter (≈1:295 at 300 dpi)
  const ox = 520, oy = 640; // runner position
  const half = (L.lanes * L.laneWidth) / 2 + L.curbWidth;
  svgText(layer, 140, 330, 'PLAN — TRACK & GATE POSITIONS', { size: 34, weight: 900, spacing: 4 });
  svgText(layer, 140, 370, `≈1:${Math.round(PX_PER_M_AT_1 / scale)} · runner fixed at 0 m · world scrolls toward the camera`, { size: 24, color: '#a9d8ff' });
  const xAt = (m) => ox + m * scale, yAt = (m) => oy + m * scale;
  svg('rect', { x: xAt(-8), y: yAt(-half), width: (66 + 8) * scale, height: half * 2 * scale, fill: 'rgba(47,107,189,0.55)', stroke: '#eef7ff', 'stroke-width': 3 }, layer);
  for (let i = 0; i <= L.lanes; i++) {
    const y = yAt(-half + L.curbWidth + i * L.laneWidth);
    svg('line', { x1: xAt(-8), y1: y, x2: xAt(66), y2: y, stroke: '#eef7ff', 'stroke-width': i === 0 || i === L.lanes ? 3 : 2, 'stroke-dasharray': i === 0 || i === L.lanes ? '' : '30 20' }, layer);
  }
  for (let i = 0; i < L.lanes; i++) {
    const y = yAt(laneX(i));
    svg('line', { x1: xAt(-8), y1: y, x2: xAt(66), y2: y, stroke: '#9fe9ff', 'stroke-width': 1.6, 'stroke-dasharray': '46 10 8 10', opacity: 0.7 }, layer);
    svgText(layer, xAt(6), y + 9, `LANE ${i + 1}`, { size: 24, weight: 900, color: '#ffd45b' });
  }
  for (let t = 0; t <= 66; t += L.tileLength) svg('line', { x1: xAt(t), y1: yAt(-half) - 14, x2: xAt(t), y2: yAt(-half), stroke: '#eef7ff', 'stroke-width': 3 }, layer);
  const gateMark = (m, label) => {
    for (let i = 0; i < L.lanes; i++) svg('rect', { x: xAt(m) - 0.32 * scale, y: yAt(laneX(i)) - 1.13 * scale, width: 0.64 * scale, height: 2.26 * scale, fill: 'rgba(99,242,192,0.35)', stroke: '#eef7ff', 'stroke-width': 2.5, rx: 4 }, layer);
    svgText(layer, xAt(m), yAt(-half) - 34, label, { size: 24, weight: 900, anchor: 'middle', color: '#63f2c0' });
  };
  gateMark(L.gate.spawnDistance, `SPAWN ${L.gate.spawnDistance} m`);
  gateMark(L.gate.parkDistance, `PARK ${L.gate.parkDistance} m`);
  svg('circle', { cx: xAt(0), cy: yAt(laneX(1)), r: 0.45 * scale, fill: '#ffd45b', stroke: '#fff', 'stroke-width': 3 }, layer);
  svgText(layer, xAt(0), yAt(half) + 50, 'RUNNER 0 m', { size: 24, weight: 900, anchor: 'middle', color: '#ffd45b' });
  svg('path', { d: `M${xAt(-L.camera.back)} ${yAt(laneX(1)) - 18} l 30 18 l -30 18 z`, fill: '#ff8a7a', stroke: '#fff', 'stroke-width': 2 }, layer);
  svgText(layer, xAt(-L.camera.back), yAt(half) + 50, `CAMERA −${L.camera.back} m`, { size: 24, weight: 900, anchor: 'middle', color: '#ff8a7a' });
  dimL(xAt(66) + 50, yAt(laneX(0)), xAt(66) + 50, yAt(laneX(1)), `${toCm(L.laneWidth)}`, 30);
  dimL(xAt(66) + 120, yAt(-half), xAt(66) + 120, yAt(half), `${toCm(half * 2)}`, 30);
  dimL(xAt(0), yAt(half) + 110, xAt(L.gate.parkDistance), yAt(half) + 110, `${toCm(L.gate.parkDistance)}`);
  dimL(xAt(0), yAt(half) + 180, xAt(L.gate.spawnDistance), yAt(half) + 180, `${toCm(L.gate.spawnDistance)}`);
  // SIDE ELEVATION — camera frustum
  const oy2 = 1560;
  svgText(layer, 140, 1180, 'SIDE ELEVATION — CAMERA RIG', { size: 34, weight: 900, spacing: 4 });
  svg('line', { x1: xAt(-9), y1: oy2, x2: xAt(40), y2: oy2, ...S }, layer);
  for (let x = xAt(-9); x < xAt(40); x += 26) svg('line', { x1: x, y1: oy2 + 2, x2: x - 16, y2: oy2 + 18, stroke: '#9fd0ff', 'stroke-width': 2, opacity: 0.6 }, layer);
  const camX = xAt(-L.camera.back), camY = oy2 - L.camera.height * scale;
  const lookX = xAt(L.camera.lookAhead), lookY = oy2 - L.camera.lookHeight * scale;
  const ang = Math.atan2(lookY - camY, lookX - camX), half2 = (L.camera.fov / 2) * Math.PI / 180;
  const ray = (a) => {
    const dx = Math.cos(a), dy = Math.sin(a);
    let t = (xAt(40) - camX) / dx;
    if (dy > 0) t = Math.min(t, (oy2 - camY) / dy);
    if (dy < 0) t = Math.min(t, (1230 - camY) / dy);
    return `${camX + dx * t},${camY + dy * t}`;
  };
  svg('polygon', { points: `${camX},${camY} ${ray(ang - half2)} ${ray(ang + half2)}`, fill: 'rgba(255,212,91,0.12)', stroke: '#ffd45b', 'stroke-width': 2, 'stroke-dasharray': '16 10' }, layer);
  svg('line', { x1: camX, y1: camY, x2: lookX, y2: lookY, stroke: '#ff8a7a', 'stroke-width': 2.5, 'stroke-dasharray': '10 8' }, layer);
  svg('circle', { cx: camX, cy: camY, r: 16, fill: '#ff8a7a', stroke: '#fff', 'stroke-width': 3 }, layer);
  svg('circle', { cx: lookX, cy: lookY, r: 9, fill: '#ff8a7a' }, layer);
  svgText(layer, lookX + 16, lookY - 14, 'LOOK-AT', { size: 22, weight: 900, color: '#ff8a7a' });
  svg('rect', { x: xAt(0) - 0.3 * scale, y: oy2 - 1.3 * scale, width: 0.6 * scale, height: 1.3 * scale, rx: 10, fill: '#ffd45b' }, layer);
  for (const m of [L.gate.parkDistance]) svg('rect', { x: xAt(m) - 0.32 * scale, y: oy2 - 3.1 * scale, width: 0.64 * scale, height: 2.85 * scale, fill: 'rgba(99,242,192,0.35)', stroke: '#eef7ff', 'stroke-width': 2.5 }, layer);
  dimL(camX - 50, oy2, camX - 50, camY, `${toCm(L.camera.height)}`, -22);
  dimL(camX, oy2 + 60, xAt(0), oy2 + 60, `${toCm(L.camera.back)}`);
  dimL(xAt(0), oy2 + 60, lookX, oy2 + 60, `${toCm(L.camera.lookAhead)}`);
  svgText(layer, camX + 30, camY - 40, `FOV ${L.camera.fov}° vertical`, { size: 26, weight: 900, color: '#ffd45b' });
  // TIMING diagram
  const tx = 140, ty = 1720, tw = 2040, th = 540;
  const tbox = box(sheet, tx, ty, tw, th + 80, 'Kid Timing — gate distance over one encounter');
  void tbox;
  const gx = tx + 120, gy = ty + 140, gw = tw - 200, gh = th - 170;
  const total = 12 + 7 + 30 + 2;
  const X = (s) => gx + (s / total) * gw, Y = (d) => gy + gh - (d / 66) * gh;
  svg('line', { x1: gx, y1: gy + gh, x2: gx + gw, y2: gy + gh, ...S }, layer);
  svg('line', { x1: gx, y1: gy, x2: gx, y2: gy + gh, ...S }, layer);
  const band = (s0, s1, label, color) => { svg('rect', { x: X(s0), y: gy, width: X(s1) - X(s0), height: gh, fill: color }, layer); svgText(layer, (X(s0) + X(s1)) / 2, gy + 34, label, { size: 22, anchor: 'middle', weight: 900 }); };
  band(0, 12, 'NARRATION (reads question + 3 choices)', 'rgba(159,233,255,0.12)');
  band(12, 19, '7 s THINK', 'rgba(255,212,91,0.16)');
  band(19, 49, 'ANSWER WINDOW 30 s (tier 1)', 'rgba(99,242,192,0.12)');
  const path = `M${X(0)} ${Y(64)} L${X(1.2)} ${Y(24)} L${X(19)} ${Y(24)} L${X(49)} ${Y(0.9)} L${X(51)} ${Y(0.9)}`;
  svg('path', { d: path, fill: 'none', stroke: '#63f2c0', 'stroke-width': 6 }, layer);
  svg('path', { d: `M${X(30)} ${Y(24 - (11 / 30) * 23.1)} L${X(30.6)} ${Y(0.9)}`, fill: 'none', stroke: '#ffd45b', 'stroke-width': 4, 'stroke-dasharray': '10 8' }, layer);
  svgText(layer, X(30.8), Y(10), 'DASH NOW (any time)', { size: 22, weight: 900, color: '#ffd45b' });
  svgText(layer, gx - 20, Y(64) + 8, '64 m', { size: 22, anchor: 'end', weight: 900 });
  svgText(layer, gx - 20, Y(24) + 8, '24 m', { size: 22, anchor: 'end', weight: 900 });
  svgText(layer, gx - 20, Y(0) + 8, '0 m', { size: 22, anchor: 'end', weight: 900 });
  svgText(layer, gx + gw, gy + gh + 44, 'time (s) →  answer windows by tier: 30 · 28 · 26 · 24 · 22 s', { size: 22, anchor: 'end', color: '#a9d8ff', weight: 800 });
  // Parameters
  const pbox = box(sheet, 2218, 1180, 1150, 690, 'Layout Parameters');
  const table = el('table', 'parts', pbox);
  const rows = [
    ['Lanes × width', `${L.lanes} × ${toCm(L.laneWidth)} cm`], ['Curb width', `${toCm(L.curbWidth)} cm`], ['Track tile length', `${toCm(L.tileLength)} cm (×${L.tilesAhead} recycled)`],
    ['Sprint / jog scenery speed', `${L.runSpeed} / ${L.jogSpeed} m/s`], ['Gate spawn / park / hit', `${L.gate.spawnDistance} / ${L.gate.parkDistance} / ${L.gate.hitDistance} m`],
    ['Camera height / back / look-ahead', `${L.camera.height} / ${L.camera.back} / ${L.camera.lookAhead} m`], ['Camera FOV', `${L.camera.fov}° (auto-widens on narrow phones)`],
    ['Reading grace', '7 s after narration ends'], ['Answer windows', '30 · 28 · 26 · 24 · 22 s']
  ];
  const body = el('tbody', '', table);
  for (const [a, b] of rows) { const tr = el('tr', '', body); el('td', '', tr, a); el('td', 'mono', tr, b); }
  titleBlock(sheet, { name: 'Track & Camera', sheetTitle: 'Track, Lanes, Camera & Timing', scale: 'AS NOTED', index });
  return sheet;
}

async function sheetBiome(index, biomeIndex) {
  const biome = BIOMES[biomeIndex];
  const sheet = sheetChrome(index, `${biome.name} — Biome Kit`);
  const ids = biome.props;
  const n = ids.length;
  const colW = Math.floor((3228 - (n - 1) * 30) / n);
  ids.forEach((id, i) => {
    const x = 140 + i * (colW + 30);
    const m = buildModel(id, { lod: 2 });
    const b = measure(m.root), s = b.getSize(new THREE.Vector3());
    const denom = chooseScale(Math.max(s.x, s.z), b.max.y, colW - 260, 720 - 250, 1);
    const k = pxm(denom);
    const spec = BLUEPRINTS[id];
    const fp = panel(sheet, x, 280, colW, 720, `${spec.name.toUpperCase()} · FRONT`, fmtScale(denom));
    drawElevation(fp, m, 'front', denom, { center: new THREE.Vector3(b.getCenter(new THREE.Vector3()).x, b.max.y / 2, 0), specDims: false });
    const sdenom = chooseScale(s.z, b.max.y, colW - 200, 470 - 170, 1);
    const sk = pxm(sdenom);
    const sp = panel(sheet, x, 1090, colW, 470, 'LEFT SIDE', fmtScale(sdenom));
    const sm = buildModel(id, { lod: 2 });
    const cam = orthoCamera('left', new THREE.Vector3(0, b.max.y / 2, b.getCenter(new THREE.Vector3()).z), sk, sp.w, sp.h, Math.max(s.x, s.y, s.z) * 2 + 2);
    renderLine(sp, sm.root, cam, { pixelWorld: 1 / sk, depthK: Math.max(0.01, s.length() * 0.01) });
    const ssb = screenBox(b, cam, sp);
    dim(sp, 'h', ssb.minX, ssb.maxX, ssb.maxY + 56, ssb.maxY, ssb.maxY, `${toCm(s.z)}`, { size: 24 });
    sp.el.querySelector('.plabel').style.bottom = 'auto';
    sp.el.querySelector('.plabel').style.top = `${Math.min(sp.h - 10, ssb.maxY + 110)}px`;
    void k;
  });
  // Color strip
  const cp = panel(sheet, 140, 1760, 1360, 580, '', '', 'color');
  const strip = new THREE.Group();
  let cursor = 0;
  ids.forEach((id) => {
    const m = buildModel(id, { lod: 2 });
    const b = measure(m.root), s = b.getSize(new THREE.Vector3());
    const sc = 2.6 / Math.max(s.y, s.x * 0.8);
    m.root.scale.setScalar(sc);
    m.root.position.x = cursor + (s.x * sc) / 2 - b.getCenter(new THREE.Vector3()).x * sc;
    cursor += s.x * sc + 0.5;
    strip.add(m.root);
  });
  const stb = measure(strip);
  renderColor(cp, strip, fitPerspective(stb, cp.w / cp.h, [0.15, 0.3, 1.3], 24, 1.1));
  svgText(cp.svg, 24, 44, 'COLOR KIT (not to scale)', { size: 24, color: '#9fe9ff', weight: 900, spacing: 3 });
  // Biome palette
  const pal = box(sheet, 1540, 1760, 640, 580, 'Biome Palette');
  const grid = el('div', 'swatches one', pal);
  const chips = [['Sky zenith', biome.sky[0]], ['Sky middle', biome.sky[1]], ['Horizon / fog', biome.fog], ['Ground', biome.ground], ['Path', biome.path[0]], ['Sun light', biome.sun]];
  for (const [nme, hex] of chips) { const s = el('div', 'swatch', grid); const i = el('i', '', s); i.style.background = hex; const t = el('div', '', s); el('b', '', t, nme); el('small', '', t, hex.toUpperCase()); }
  const fx = { petals: 'Drifting petals', drops: 'Floating water drops', sparks: 'Energy sparks', stars: 'Twinkling stars + night sky', bubbles: 'Rising soap bubbles', fireflies: 'Glowing fireflies' }[biome.ambient];
  const nb = box(sheet, 2218, 1700, 1150, 180, 'Ambient');
  el('p', '', nb, `${fx}. Props merge into 1–3 draw calls each; ${biome.water ? 'animated water planes flank the track.' : 'ground strips recolor per biome.'}`);
  titleBlock(sheet, { name: biome.name, sheetTitle: `${biome.name} — Biome Kit`, scale: 'AS NOTED', index });
  return sheet;
}

async function sheetRig(index) {
  const sheet = sheetChrome(index, 'Rig & Animation Reference');
  const denom = 15, k = pxm(denom);
  const poses = [0, 0.25, 0.5, 0.75];
  poses.forEach((f, i) => {
    const m = buildModel('mia', { lod: 2 });
    const rig = new Rig(m); rig.poseAt('run', f); m.root.updateMatrixWorld(true);
    const pn = panel(sheet, 140 + i * 640, 300, 620, 1180, `RUN ${Math.round(f * 100)}%`, i === 0 ? 'left leg passing' : i === 1 ? 'left leg reach' : i === 2 ? 'right leg passing' : 'right leg reach');
    const cam = orthoCamera('left', new THREE.Vector3(0, 0.66, 0), k, pn.w, pn.h, 4);
    renderLine(pn, m.root, cam, { pixelWorld: 1 / k, depthK: 0.008 });
    const gy = projectToPixels(new THREE.Vector3(0, 0, 0), cam, pn.w, pn.h).y;
    groundLine(pn, gy, 40, pn.w - 40, '');
  });
  const pm = buildModel('pip', { lod: 2 });
  new Rig(pm).poseAt('run', 0.25); pm.root.updateMatrixWorld(true);
  const pp = panel(sheet, 140 + 4 * 640, 300, 668, 1180, 'PIP HOVER-RUN', 'lean 9° · bob ±2.2 cm');
  const pcam = orthoCamera('left', new THREE.Vector3(0, 0.66, 0), k, pp.w, pp.h, 4);
  renderLine(pp, pm.root, pcam, { pixelWorld: 1 / k, depthK: 0.008 });
  groundLine(pp, projectToPixels(new THREE.Vector3(0, 0, 0), pcam, pp.w, pp.h).y, 40, pp.w - 40, '');
  const fk = pxm(30);
  poses.forEach((f, i) => {
    const m = buildModel('ginger', { lod: 2 });
    new Rig(m).poseAt('run', f); m.root.updateMatrixWorld(true);
    const pn = panel(sheet, 140 + i * 520, 1560, 510, 400, `GALLOP ${Math.round(f * 100)}%`, '');
    const cam = orthoCamera('left', new THREE.Vector3(0, 0.36, -0.03), fk, pn.w, pn.h, 4);
    renderLine(pn, m.root, cam, { pixelWorld: 1 / fk, depthK: 0.008 });
    groundLine(pn, projectToPixels(new THREE.Vector3(0, 0, 0), cam, pn.w, pn.h).y, 20, pn.w - 20, '');
  });
  // Joint tree
  const jt = box(sheet, 2218, 1560, 1150, 320, 'Humanoid joints');
  el('p', 'mono', jt, 'root › hips › spine › chest › neck › head › ponytail');
  el('p', 'mono', jt, 'chest › shoulderL/R › elbowL/R › wristL/R · hips › hipL/R › kneeL/R › ankleL/R');
  const ct = box(sheet, 140, 2090, 2040, 250, 'Cadence & states');
  el('p', '', ct, 'Cadence (cycles/s): humanoid jog 1.15 · run 1.45 · dash 1.9 — Pip jog 1.25 · run 1.6 · dash 2.4 — Ginger jog 1.5 · run 1.9 · dash 2.6. States: idle, jog, run, dash, stumble (gentle 360° spin), cheer, wave, calm, think, plus six Move Break moves (march, reach, side stretch, arm circles, balance, wiggle). Transitions cross-fade over 0.22 s.');
  titleBlock(sheet, { name: 'Rig reference', sheetTitle: 'Rig & Animation Reference', scale: '1:15 · fox 1:30', index, extra: 'src/rig.js' });
  return sheet;
}

async function sheetLineup(index) {
  const sheet = sheetChrome(index, 'Cast Lineup & Scale');
  const denom = 15, k = pxm(denom);
  const pn = panel(sheet, 140, 280, 3228, 1500, '', '');
  const ground = 1320;
  // Ruler
  for (let cmv = 0; cmv <= 150; cmv += 10) {
    const y = ground - (cmv / 100) * k;
    svg('line', { x1: 60, y1: y, x2: cmv % 50 === 0 ? 120 : 96, y2: y, stroke: '#eef7ff', 'stroke-width': cmv % 50 === 0 ? 3 : 2 }, pn.svg);
    svgText(pn.svg, 52, y + 9, String(cmv), { size: 24, anchor: 'end', weight: 900 });
    svg('line', { x1: 130, y1: y, x2: 3200, y2: y, stroke: 'rgba(190,225,255,0.12)', 'stroke-width': 1.5 }, pn.svg);
  }
  svg('line', { x1: 60, y1: ground, x2: 60, y2: ground - 1.5 * k, stroke: '#eef7ff', 'stroke-width': 3 }, pn.svg);
  const group = new THREE.Group();
  const placements = [['pip', 'front', 520], ['mia', 'front', 1180], ['leo', 'front', 1800], ['ginger', 'left', 2620]];
  const labels = [];
  for (const [id, view, cx] of placements) {
    const m = buildModel(id, { lod: 2 });
    if (view === 'left') m.root.rotation.y = -Math.PI / 2;
    m.root.position.x = (cx - pn.w / 2) / k;
    m.root.updateMatrixWorld(true);
    const b = measure(m.root);
    labels.push({ id, cx, top: b.max.y, name: BLUEPRINTS[id].name, view });
    group.add(m.root);
  }
  const cam = orthoCamera('front', new THREE.Vector3(0, (ground - pn.h / 2) / k, 0), k, pn.w, pn.h, 6);
  renderLine(pn, group, cam, { pixelWorld: 1 / k, depthK: 0.008 });
  groundLine(pn, ground, 130, 3200, 'TRACK SURFACE');
  for (const l of labels) {
    const y = ground - l.top * k;
    svg('line', { x1: l.cx - 120, y1: y, x2: l.cx + 120, y2: y, stroke: '#ffd45b', 'stroke-width': 2.5, 'stroke-dasharray': '12 8' }, pn.svg);
    svgText(pn.svg, l.cx, y - 26, `${toCm(l.top)} cm`, { size: 34, anchor: 'middle', weight: 900, color: '#ffd45b' });
    svgText(pn.svg, l.cx, ground + 80, l.name.toUpperCase(), { size: 46, anchor: 'middle', weight: 900, spacing: 6 });
    svgText(pn.svg, l.cx, ground + 124, l.view === 'left' ? 'side view' : 'front view', { size: 24, anchor: 'middle', color: '#a9d8ff', weight: 800 });
  }
  // Color lineup
  const cp = panel(sheet, 140, 1830, 2040, 510, '', '', 'color');
  const cg = new THREE.Group();
  HERO_ORDER.forEach((id, i) => {
    const m = buildModel(id, { lod: 2 });
    const rig = new Rig(m); rig.poseAt(i % 2 ? 'wave' : 'idle', 0.3, 0.8);
    m.root.position.x = i * 1.15 - 1.7;
    if (id === 'ginger') m.root.rotation.y = -0.9;
    cg.add(m.root);
  });
  const cgb = measure(cg);
  renderColor(cp, cg, fitPerspective(cgb, cp.w / cp.h, [0.1, 0.25, 1.3], 22, 1.1));
  svgText(cp.svg, 24, 44, 'COLOR LINEUP', { size: 24, color: '#9fe9ff', weight: 900, spacing: 3 });
  titleBlock(sheet, { name: 'Cast lineup', sheetTitle: 'Cast Lineup & Scale', scale: `1:${denom}`, index });
  return sheet;
}

async function sheetCover(index) {
  const sheet = sheetChrome(index, 'Production Blueprints', 'Flexzonic Games · Healthy Hero 3D');
  const t = el('div', 'cover-title', sheet);
  el('div', 'kicker', t, 'VERSION 2.0.0 · 3D LEARNING EDITION');
  const h = el('h1', '', t);
  h.append(document.createTextNode('Healthy '));
  const sp = el('span', '', h, 'Hero 3D');
  void sp;
  el('p', '', t, 'Orthographic views from every side, dimensions, parts, colors and motion for every 3D model in the game. All drawings are generated from the same source file the game uses: src/blueprints.js.');
  // Hero render
  const cp = panel(sheet, 1850, 230, 1518, 1240, '', '', 'color');
  const g = new THREE.Group();
  const gate = buildModel('gate', { lod: 2 });
  gate.root.position.set(0, 0, -2.2);
  g.add(gate.root);
  const order = [['mia', -1.15, 0.15], ['pip', 0, 0.55], ['leo', 1.15, 0.15], ['ginger', 0.25, 1.2]];
  for (const [id, x, z] of order) {
    const m = buildModel(id, { lod: 2 });
    const rig = new Rig(m); rig.poseAt(id === 'ginger' ? 'idle' : 'cheer', 0.2, 0.25);
    m.root.position.set(x, 0, z);
    if (id === 'ginger') m.root.rotation.y = -0.7;
    g.add(m.root);
  }
  const gb = measure(g);
  renderColor(cp, g, fitPerspective(gb, cp.w / cp.h, [0.35, 0.28, 1.2], 30, 1.06), { exposure: 1.05 });
  const cb = box(sheet, 160, 860, 1640, 990, 'Contents');
  const ul = el('ul', 'contents', cb);
  SHEETS.forEach((s, i) => { const li = el('li', '', ul); el('b', '', li, String(i + 1).padStart(2, '0')); li.append(document.createTextNode(s.title)); });
  const es = panel(sheet, 160, 1890, 1640, 450, '', '', 'color');
  const eg = new THREE.Group();
  EMBLEM_BY_TOPIC.forEach((eid, i) => { const em = buildModel(eid, { lod: 2 }); em.root.position.x = i * 0.5; em.root.rotation.y = -0.35; eg.add(em.root); });
  renderColor(es, eg, fitPerspective(measure(eg), es.w / es.h, [0.0, 0.15, 1], 18, 1.12));
  svgText(es.svg, 24, 44, 'SIX WELLNESS WORLDS · FOOD · WATER · MOVEMENT · SLEEP · HYGIENE · FEELINGS', { size: 24, color: '#9fe9ff', weight: 900, spacing: 2 });
  const lg = box(sheet, 1850, 1500, 1518, 370, 'How to read these sheets');
  for (const line of [
    'Third-angle projection: side views sit beside the front view, the top view above it.',
    'White lines = visible edges. Dash-dot = center lines. Arrows = dimensions in centimeters.',
    '1 game unit = 1 meter. Characters face +Z (toward you in the FRONT view).',
    'Yellow balloons number the parts; the same numbers appear in each parts list.',
    'Colors marked “runtime” change in the game (topic color, lane color, answer sign).'
  ]) el('p', '', lg, `• ${line}`);
  titleBlock(sheet, { name: 'Healthy Hero 3D', sheetTitle: 'Cover & Contents', scale: 'AS NOTED', index });
  return sheet;
}

// ---------------------------------------------------------------------------------------
async function main() {
  const params = new URLSearchParams(location.search);
  const id = params.get('sheet') || 'cover';
  const index = SHEETS.findIndex((s) => s.id === id);
  await document.fonts.ready;
  try {
    await Promise.all(["800 40px 'Baloo 2'", "900 40px 'Nunito'", "800 40px 'Nunito'", "700 40px 'Nunito'"].map((f) => document.fonts.load(f)));
  } catch { /* fonts optional */ }
  const s = SHEETS[index];
  if (!s) throw new Error(`Unknown sheet ${id}`);
  if (id === 'cover') await sheetCover(index);
  else if (id === 'lineup') await sheetLineup(index);
  else if (id.endsWith('-elev') && id !== 'gate-elev') await sheetElevations(index, id.replace('-elev', ''));
  else if (id.endsWith('-detail') && id !== 'gate-detail') await sheetDetails(index, id.replace('-detail', ''));
  else if (id === 'gate-elev') await sheetGateElev(index);
  else if (id === 'gate-detail') await sheetGateDetail(index);
  else if (id === 'emblems') await sheetEmblems(index);
  else if (id === 'track') await sheetTrack(index);
  else if (id.startsWith('biome-')) await sheetBiome(index, s.biome);
  else if (id === 'rig') await sheetRig(index);
  document.title = `Blueprint ${String(index + 1).padStart(2, '0')} — ${s.title}`;
  window.__ready = true;
}
window.__sheets = SHEETS.map((s) => s.id);
main().catch((e) => { console.error(e); const p = el('pre', '', document.body, String(e.stack || e)); p.style.color = '#fff'; window.__ready = true; });
