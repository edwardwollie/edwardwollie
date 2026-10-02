// Blueprint Studio: renders the ND-3 blueprint plates from the exact runtime meshes.
// Driven headlessly by tools/blueprints.mjs, but it also works when opened in a browser
// (serve the project root and open /tools/blueprint-studio.html?plate=commander).

import * as THREE from "../app/vendor/three.js";
import { MODELS, MODEL_GROUPS } from "../app/blueprints/models.js";
import { buildModel, modelToGroup, applyPose, measure, createMaterial } from "../app/blueprints/kit.js";
import { poseFor, POSE_SHEET } from "../app/blueprints/rigs.js";
import { VIEWS, ORTHO_VIEWS, VIEW_AXES } from "../app/blueprints/views.js";

const PLATE_W = 2400;
const PLATE_H = 1500;
const INK = "#cfe9ff";
const INK_DIM = "rgba(160, 205, 255, 0.55)";
const PAPER = "#0b1d45";
const FONT = '"DejaVu Sans Mono", "Liberation Mono", monospace';
const VERSION = "3.0.0";
const SERIES = "ND-3";

const out = document.getElementById("out");
out.width = PLATE_W;
out.height = PLATE_H;
const ctx = out.getContext("2d");

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const pmrem = new THREE.PMREMGenerator(renderer);
const environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;

const models = new Map();
function model(id) {
  if (!models.has(id)) models.set(id, buildModel(MODELS[id]));
  return models.get(id);
}

// ---------------------------------------------------------------------------
// Scene builders
// ---------------------------------------------------------------------------

const lineMaterial = new THREE.LineBasicMaterial({ color: 0xd6eeff, transparent: true, opacity: 0.95 });
const fillMaterial = new THREE.MeshBasicMaterial({ color: 0x10285c, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
const glowFill = new THREE.MeshBasicMaterial({ color: 0x1f5c8f, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
const edgeCache = new WeakMap();

function inkGroup(target, pose) {
  const group = modelToGroup(target, {
    materialFor: (mat) => (MODELS[target.id].palette[mat] && /glow|hot/.test(mat) ? glowFill : fillMaterial)
  });
  group.traverse((child) => {
    if (!child.isMesh) return;
    let edges = edgeCache.get(child.geometry);
    if (!edges) {
      edges = new THREE.EdgesGeometry(child.geometry, 24);
      edgeCache.set(child.geometry, edges);
    }
    child.add(new THREE.LineSegments(edges, lineMaterial));
  });
  applyPose(group, pose);
  return group;
}

const shadedMaterials = new Map();
function shadedGroup(target, pose) {
  const group = modelToGroup(target, { materials: shadedMaterials });
  applyPose(group, pose);
  return group;
}

function studioScene(object, { floor = true, dark = false } = {}) {
  const scene = new THREE.Scene();
  scene.environment = environment;
  scene.add(object);
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(4, 7, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3()).length();
  Object.assign(key.shadow.camera, { left: -size, right: size, top: size, bottom: -size, near: 0.1, far: size * 6 + 20 });
  key.position.multiplyScalar(Math.max(1, size / 3));
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x5fd8ff, 1.6);
  rim.position.set(-5, 3, -6);
  scene.add(rim);
  const fill = new THREE.HemisphereLight(0x9fc4ff, 0x14102a, dark ? 0.4 : 0.8);
  scene.add(fill);
  if (floor) {
    const ground = new THREE.Mesh(new THREE.CircleGeometry(size * 1.4, 64), new THREE.ShadowMaterial({ opacity: 0.45 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = Math.min(0, box.min.y) - 0.001;
    ground.receiveShadow = true;
    scene.add(ground);
  }
  object.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = !child.material.userData?.glow;
      child.receiveShadow = true;
    }
  });
  return scene;
}

function cameraFor(viewKey, bounds, aspect, halfExtent) {
  const view = VIEWS[viewKey];
  const center = bounds.getCenter(new THREE.Vector3());
  const dir = new THREE.Vector3(...view.dir).normalize();
  const radius = bounds.getSize(new THREE.Vector3()).length() * 0.5;
  let camera;
  if (view.ortho) {
    camera = new THREE.OrthographicCamera(-halfExtent * aspect, halfExtent * aspect, halfExtent, -halfExtent, 0.01, radius * 8 + 10);
  } else {
    camera = new THREE.PerspectiveCamera(30, aspect, 0.05, radius * 20 + 50);
  }
  const distance = view.ortho ? radius * 3 + 2 : (radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.08;
  camera.position.copy(center).addScaledVector(dir, distance);
  camera.up.set(...view.up);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  return camera;
}

function renderToCanvas(scene, camera, width, height, background = null) {
  renderer.setSize(width, height, false);
  renderer.setClearColor(background ?? 0x000000, background === null ? 0 : 1);
  renderer.render(scene, camera);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(renderer.domElement, 0, 0);
  return canvas;
}

function bloomPass(canvas) {
  // Cheap 2D glow: blur a brightened copy and screen it on top.
  const glow = document.createElement("canvas");
  glow.width = canvas.width;
  glow.height = canvas.height;
  const g = glow.getContext("2d");
  g.filter = "blur(10px) brightness(1.4)";
  g.drawImage(canvas, 0, 0);
  const result = canvas.getContext("2d");
  result.globalCompositeOperation = "screen";
  result.globalAlpha = 0.55;
  result.drawImage(glow, 0, 0);
  result.globalAlpha = 1;
  result.globalCompositeOperation = "source-over";
  return canvas;
}

// ---------------------------------------------------------------------------
// 2D drafting helpers
// ---------------------------------------------------------------------------

function paper() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const gradient = ctx.createRadialGradient(PLATE_W * 0.45, PLATE_H * 0.4, 100, PLATE_W * 0.5, PLATE_H * 0.5, PLATE_W * 0.75);
  gradient.addColorStop(0, "#10285c");
  gradient.addColorStop(1, "#071431");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, PLATE_W, PLATE_H);
  for (let x = 0; x <= PLATE_W; x += 20) {
    ctx.strokeStyle = x % 100 === 0 ? "rgba(120,170,255,0.13)" : "rgba(120,170,255,0.05)";
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, PLATE_H);
    ctx.stroke();
  }
  for (let y = 0; y <= PLATE_H; y += 20) {
    ctx.strokeStyle = y % 100 === 0 ? "rgba(120,170,255,0.13)" : "rgba(120,170,255,0.05)";
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(PLATE_W, y + 0.5);
    ctx.stroke();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.strokeRect(30, 30, PLATE_W - 60, PLATE_H - 60);
  ctx.lineWidth = 1;
  ctx.strokeRect(40, 40, PLATE_W - 80, PLATE_H - 80);
}

function text(value, x, y, { size = 18, color = INK, align = "left", weight = "normal", baseline = "alphabetic" } = {}) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(value, x, y);
}

function wrap(value, x, y, width, lineHeight, options) {
  ctx.font = `${options?.weight || "normal"} ${options?.size || 18}px ${FONT}`;
  const words = value.split(" ");
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > width && line) {
      text(line, x, y, options);
      line = word;
      y += lineHeight;
    } else line = test;
  }
  if (line) text(line, x, y, options);
  return y + lineHeight;
}

function arrow(x1, y1, x2, y2) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  for (const [x, y, a] of [[x1, y1, angle + Math.PI], [x2, y2, angle]]) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - Math.cos(a - 0.35) * 11, y - Math.sin(a - 0.35) * 11);
    ctx.lineTo(x - Math.cos(a + 0.35) * 11, y - Math.sin(a + 0.35) * 11);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function dimension(x1, y1, x2, y2, label, vertical) {
  ctx.strokeStyle = "#7fd8ff";
  ctx.fillStyle = "#7fd8ff";
  ctx.lineWidth = 1.2;
  arrow(x1, y1, x2, y2);
  ctx.save();
  ctx.translate((x1 + x2) / 2, (y1 + y2) / 2);
  if (vertical) ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = PAPER;
  ctx.font = `bold 15px ${FONT}`;
  const width = ctx.measureText(label).width + 12;
  ctx.fillRect(-width / 2, -10, width, 20);
  text(label, 0, 1, { size: 15, color: "#9be4ff", align: "center", baseline: "middle", weight: "bold" });
  ctx.restore();
}

function cellFrame(x, y, w, h, title) {
  ctx.strokeStyle = INK_DIM;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  ctx.fillStyle = "rgba(9, 22, 56, 0.85)";
  ctx.fillRect(x + 1, y + 1, Math.min(w - 2, 300), 30);
  text(title, x + 12, y + 21, { size: 16, weight: "bold" });
}

function titleBlock(spec, sheet, extra = {}) {
  const x = PLATE_W - 760;
  const y = PLATE_H - 260;
  ctx.fillStyle = "rgba(7, 18, 46, 0.92)";
  ctx.fillRect(x, y, 720, 220);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, 720, 220);
  ctx.lineWidth = 1;
  for (const row of [60, 120, 170]) {
    ctx.beginPath();
    ctx.moveTo(x, y + row);
    ctx.lineTo(x + 720, y + row);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(x + 470, y + 60);
  ctx.lineTo(x + 470, y + 220);
  ctx.stroke();
  text("FLEXZONIC GAMES  //  NEON DOMINION: RIFT COMMAND", x + 16, y + 26, { size: 15, color: INK_DIM });
  text(extra.title || spec.name.toUpperCase(), x + 16, y + 50, { size: 22, weight: "bold" });
  text("DESIGNATION", x + 16, y + 82, { size: 13, color: INK_DIM });
  text(extra.designation || spec.designation, x + 16, y + 108, { size: 22, weight: "bold" });
  text("FACTION", x + 250, y + 82, { size: 13, color: INK_DIM });
  text((extra.faction || spec.faction).toUpperCase(), x + 250, y + 108, { size: 20, weight: "bold" });
  text("UNITS  METRES  +Y UP  FACES +Z", x + 16, y + 150, { size: 14 });
  text(extra.scaleNote || "ORTHOGRAPHIC VIEWS SHARE ONE SCALE", x + 16, y + 202, { size: 14, color: INK_DIM });
  text("SHEET", x + 486, y + 82, { size: 13, color: INK_DIM });
  text(sheet, x + 486, y + 110, { size: 24, weight: "bold" });
  text(`SERIES ${SERIES}`, x + 486, y + 150, { size: 14 });
  text(`REV ${VERSION}`, x + 486, y + 202, { size: 14, color: INK_DIM });
}

// ---------------------------------------------------------------------------
// Plates
// ---------------------------------------------------------------------------

function unitPlate(id, sheet) {
  const spec = MODELS[id];
  const target = model(id);
  const dims = measure(target);
  paper();
  text(`${spec.designation}  ${spec.name.toUpperCase()}`, 70, 100, { size: 40, weight: "bold" });
  text("3D BLUEPRINT  //  SIX-SIDE ORTHOGRAPHIC SET WITH QUARTER VIEWS  //  EXACT RUNTIME MESH", 72, 136, { size: 17, color: INK_DIM });

  const ink = inkGroup(target, {});
  const inkScene = new THREE.Scene();
  inkScene.add(ink);
  const bounds = target.bounds.clone();
  const size = bounds.getSize(new THREE.Vector3());
  const halfExtent = Math.max(size.x, size.y, size.z) * 0.62;
  const cellW = 500;
  const cellH = 520;
  const originX = 70;
  const originY = 170;
  const gap = 20;
  ORTHO_VIEWS.forEach((viewKey, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = originX + col * (cellW + gap);
    const y = originY + row * (cellH + gap);
    cellFrame(x, y, cellW, cellH, `${String(index + 1).padStart(2, "0")}  ${VIEWS[viewKey].label}`);
    const renderSize = 470;
    const camera = cameraFor(viewKey, bounds, 1, halfExtent);
    const image = renderToCanvas(inkScene, camera, renderSize, renderSize);
    const imageX = x + (cellW - renderSize) / 2 - 18;
    const imageY = y + 30;
    ctx.drawImage(image, imageX, imageY);
    // dimensions
    const ppm = renderSize / (halfExtent * 2);
    const [hAxis, vAxis] = VIEW_AXES[viewKey];
    const w = size[hAxis] * ppm;
    const h = size[vAxis] * ppm;
    const cx = imageX + renderSize / 2;
    const cy = imageY + renderSize / 2;
    const left = cx - w / 2;
    const top = cy - h / 2;
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = "rgba(127, 216, 255, 0.35)";
    ctx.strokeRect(left, top, w, h);
    ctx.setLineDash([]);
    const below = Math.min(y + cellH - 16, top + h + 22);
    dimension(left, below, left + w, below, `${size[hAxis].toFixed(2)} m`, false);
    const side = Math.min(x + cellW - 16, left + w + 24);
    dimension(side, top, side, top + h, `${size[vAxis].toFixed(2)} m`, true);
  });

  // Hero quarter renders (PBR)
  const heroX = 1640;
  const heroY = 170;
  const heroW = 690;
  cellFrame(heroX, heroY, heroW, 560, "07  QUARTER FRONT-LEFT  //  PBR");
  const shadedA = shadedGroup(target, poseFor(id, { t: 0.4, move: spec.faction === "Terrain" ? 0 : 0.35 }));
  const sceneA = studioScene(shadedA);
  const heroCamera = cameraFor("quarterFront", bounds, heroW / 528, 0);
  const hero = bloomPass(renderToCanvas(sceneA, heroCamera, heroW - 2, 528));
  ctx.drawImage(hero, heroX + 1, heroY + 31);

  cellFrame(heroX, heroY + 580, 330, 300, "08  QUARTER REAR");
  const rearCamera = cameraFor("quarterRear", bounds, 328 / 268, 0);
  ctx.drawImage(bloomPass(renderToCanvas(sceneA, rearCamera, 328, 268)), heroX + 1, heroY + 611);

  // Spec table
  const tableX = heroX + 350;
  const tableY = heroY + 580;
  cellFrame(tableX, tableY, 340, 300, "SPECIFICATION");
  const rows = [
    ["WIDTH", `${dims.width.toFixed(3)} m`],
    ["HEIGHT", `${dims.height.toFixed(3)} m`],
    ["LENGTH", `${dims.length.toFixed(3)} m`],
    ["HIT RADIUS", `${(spec.simRadius / 25).toFixed(2)} m`],
    ["HOVER", `${(spec.hover || 0).toFixed(2)} m`],
    ["TRIANGLES", dims.triangles.toLocaleString("en-US")],
    ["PARTS", String(dims.parts)],
    ["JOINTS", String(dims.pivots - 1)]
  ];
  rows.forEach(([label, value], index) => {
    text(label, tableX + 16, tableY + 62 + index * 30, { size: 15, color: INK_DIM });
    text(value, tableX + 324, tableY + 62 + index * 30, { size: 16, align: "right", weight: "bold" });
  });

  // Role, palette and joints
  const notesY = 1260;
  text("ROLE", 70, notesY, { size: 14, color: INK_DIM });
  wrap(spec.role, 70, notesY + 28, 1000, 24, { size: 18 });
  text("FINISH SCHEDULE", 70, notesY + 100, { size: 14, color: INK_DIM });
  let swatchX = 70;
  for (const [mat, color] of Object.entries(spec.palette)) {
    ctx.fillStyle = color;
    ctx.fillRect(swatchX, notesY + 114, 26, 26);
    ctx.strokeStyle = INK_DIM;
    ctx.strokeRect(swatchX + 0.5, notesY + 114.5, 26, 26);
    text(`${mat.toUpperCase()} ${color}`, swatchX + 34, notesY + 133, { size: 13 });
    swatchX += 170;
  }
  const joints = [...target.pivots.keys()].filter((name) => name !== "root");
  text("ARTICULATION", 1110, notesY, { size: 14, color: INK_DIM });
  wrap(joints.length ? joints.join("  ") : "RIGID BODY", 1110, notesY + 28, 460, 22, { size: 15 });

  titleBlock(spec, sheet);
  return out.toDataURL("image/png");
}

function poseSheet(id, sheet) {
  const spec = MODELS[id];
  const target = model(id);
  paper();
  text(`${spec.designation}  ${spec.name.toUpperCase()}  //  ARTICULATION`, 70, 100, { size: 40, weight: "bold" });
  text("POSE SHEET  //  RIG FUNCTIONS FROM src/blueprints/rigs.js APPLIED TO THE RUNTIME MESH", 72, 136, { size: 17, color: INK_DIM });
  const entries = Object.entries(POSE_SHEET);
  const cellW = 740;
  const cellH = 520;
  entries.forEach(([key, entry], index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = 70 + col * (cellW + 20);
    const y = 170 + row * (cellH + 20);
    cellFrame(x, y, cellW, cellH, `${String(index + 1).padStart(2, "0")}  ${entry.label.toUpperCase()}`);
    const pose = poseFor(id, { phase: 0, ...entry.state });
    const group = shadedGroup(target, pose);
    const scene = studioScene(group);
    const ink = inkGroup(target, pose);
    ink.position.x = 0;
    const camera = cameraFor("quarterFront", target.bounds, (cellW / 2 - 2) / (cellH - 32), 0);
    ctx.drawImage(bloomPass(renderToCanvas(scene, camera, cellW / 2 - 2, cellH - 32)), x + 1, y + 31);
    const inkScene = new THREE.Scene();
    inkScene.add(ink);
    const size = target.bounds.getSize(new THREE.Vector3());
    const side = cameraFor("left", target.bounds, (cellW / 2 - 2) / (cellH - 32), Math.max(size.y, size.z) * 0.6);
    ctx.drawImage(renderToCanvas(inkScene, side, cellW / 2 - 2, cellH - 32), x + cellW / 2, y + 31);
    const joints = Object.entries(pose).filter(([, joint]) => Object.values(joint).some((value) => Math.abs(value) > 0.01 && value !== 1));
    text(joints.slice(0, 3).map(([name, joint]) => `${name} ${joint.rx ? `rx${(joint.rx * 57.3).toFixed(0)}°` : ""}${joint.ry ? ` ry${(joint.ry * 57.3).toFixed(0)}°` : ""}`).join("  "), x + 12, y + cellH - 12, { size: 13, color: INK_DIM });
  });
  titleBlock(spec, sheet, { scaleNote: "LEFT: PBR QUARTER  RIGHT: LEFT ORTHO INK" });
  return out.toDataURL("image/png");
}

function lineupPlate(sheet) {
  paper();
  text("ND-3 FORCE LINEUP  //  ALL UNITS AT COMMON SCALE", 70, 100, { size: 40, weight: "bold" });
  text("QUARTER VIEW, SAME CAMERA DISTANCE PER METRE. GRID SQUARE = 0.5 m.", 72, 136, { size: 17, color: INK_DIM });
  const ids = ["guardian", "brute", "turret", "shield", "jammer", "splitter", "shooter", "charger", "grunt", "commander", "bulwark", "striker", "rail", "medic"];
  const scene = new THREE.Scene();
  let x = 0;
  const placed = [];
  for (const id of ids) {
    const target = model(id);
    const size = target.bounds.getSize(new THREE.Vector3());
    const group = shadedGroup(target, poseFor(id, { t: 0.2 }));
    x += size.x / 2 + 0.35;
    group.position.x = -x;
    group.position.y = MODELS[id].faction === "Dominion" && id !== "commander" ? MODELS[id].hover * 0.5 : 0;
    group.rotation.y = 0.35;
    scene.add(group);
    placed.push({ id, x: -x, size });
    x += size.x / 2 + 0.35;
  }
  const total = x;
  const studio = studioScene(new THREE.Group());
  for (const child of [...scene.children]) studio.add(child);
  studio.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = !child.material.userData?.glow;
      child.receiveShadow = true;
    }
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(total + 6, 8), new THREE.ShadowMaterial({ opacity: 0.5 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(-total / 2, 0, 0);
  ground.receiveShadow = true;
  studio.add(ground);
  const key = studio.children.find((child) => child.isDirectionalLight);
  Object.assign(key.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, far: 120 });
  key.position.set(-total / 2 + 8, 16, 14);
  key.target.position.set(-total / 2, 0, 0);
  studio.add(key.target);
  key.shadow.camera.updateProjectionMatrix();
  const width = PLATE_W - 140;
  const height = 1000;
  const halfHeight = (total / 2 + 0.6) * (height / width);
  const camera = new THREE.OrthographicCamera(-(total / 2 + 0.6), total / 2 + 0.6, halfHeight, -halfHeight, 0.1, 200);
  camera.position.set(-total / 2, 2.4 + 8, 40);
  camera.lookAt(-total / 2, 2.4, 0);
  const image = bloomPass(renderToCanvas(studio, camera, width, height));
  ctx.drawImage(image, 70, 170);
  // height ticks
  const ppm = width / (total + 1.2);
  const groundY = 170 + height / 2 + ((2.4 - 0) * ppm) * Math.cos(Math.atan2(8, 40));
  ctx.strokeStyle = INK_DIM;
  ctx.beginPath();
  ctx.moveTo(70, groundY);
  ctx.lineTo(70 + width, groundY);
  ctx.stroke();
  for (const item of placed) {
    const sx = 70 + width / 2 + (item.x + total / 2) * ppm;
    text(MODELS[item.id].designation, sx, groundY + 44, { size: 16, align: "center", weight: "bold" });
    text(`${item.size.y.toFixed(2)} m`, sx, groundY + 66, { size: 14, align: "center", color: INK_DIM });
  }
  titleBlock({ name: "Force lineup", designation: "ND-3-L", faction: "All" }, sheet, { title: "FORCE LINEUP", scaleNote: "ORTHOGRAPHIC QUARTER, COMMON SCALE" });
  return out.toDataURL("image/png");
}

async function sectorPlate(sheet, sector = 1) {
  const { RiftCommandGame } = await import("../app/game.js");
  const hidden = document.createElement("canvas");
  hidden.width = 10;
  hidden.height = 10;
  const audio = new Proxy({}, { get: () => () => {} });
  const game = new RiftCommandGame(hidden, audio, {}, { headless: true });
  game.start(sector, { damage: 0, armor: 0, squad: 0 });
  paper();
  text(`SECTOR ${String(sector).padStart(2, "0")} BATTLEFIELD LAYOUT`, 70, 100, { size: 40, weight: "bold" });
  text("TOP VIEW OF THE GENERATED SECTOR: CAUSEWAY, UPGRADE GATES, LEGION WAVES, EMPLACEMENTS AND GUARDIAN SPAWN", 72, 136, { size: 17, color: INK_DIM });
  // map: game y (forward) runs left -> right, game x runs top -> bottom
  const mapX = 90;
  const mapY = 200;
  const mapW = PLATE_W - 180;
  const mapH = 900;
  const minY = -200;
  const maxY = game.goal + 400;
  const scale = mapW / (maxY - minY);
  const toPlate = (gx, gy) => [mapX + (gy - minY) * scale, mapY + mapH / 2 + gx * scale];
  ctx.strokeStyle = INK_DIM;
  ctx.strokeRect(mapX, mapY, mapW, mapH);
  // world limits
  for (const limit of [-470, 470]) {
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    const [x1, y1] = toPlate(limit, minY);
    const [x2, y2] = toPlate(limit, maxY);
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // causeway
  ctx.beginPath();
  for (let y = minY; y <= maxY; y += 20) {
    const [px, py] = toPlate(game.pathX(y) - 205 - Math.sin(y * 0.0031) * 20, y);
    if (y === minY) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  for (let y = maxY; y >= minY; y -= 20) {
    const [px, py] = toPlate(game.pathX(y) + 205 + Math.sin(y * 0.0031) * 20, y);
    ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(69, 246, 255, 0.08)";
  ctx.fill();
  ctx.strokeStyle = "#45f6ff";
  ctx.stroke();
  ctx.setLineDash([3, 9]);
  ctx.beginPath();
  for (let y = minY; y <= maxY; y += 20) {
    const [px, py] = toPlate(game.pathX(y), y);
    if (y === minY) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  // distance ticks every 20 m (500 units)
  for (let y = 0; y <= maxY; y += 500) {
    const [px] = toPlate(0, y);
    ctx.strokeStyle = INK_DIM;
    ctx.beginPath();
    ctx.moveTo(px, mapY + mapH);
    ctx.lineTo(px, mapY + mapH + 12);
    ctx.stroke();
    text(`${(y / 25).toFixed(0)} m`, px, mapY + mapH + 32, { size: 14, align: "center", color: INK_DIM });
  }
  for (const item of game.scenery) {
    const [px, py] = toPlate(item.x, item.y);
    ctx.fillStyle = item.type === "crystal" ? "#7d6bff" : item.type === "beacon" ? "#45f6ff" : "rgba(160,170,200,0.5)";
    ctx.beginPath();
    ctx.arc(px, py, 3 + item.size * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  const colors = { grunt: "#ff4d8d", shooter: "#ff9f51", charger: "#ff6a54", shield: "#879cff", jammer: "#ba62ff", splitter: "#ff7bb7", brute: "#ff4378", turret: "#ff3d91" };
  for (const enemy of game.enemies) {
    const [px, py] = toPlate(enemy.x, enemy.y);
    ctx.fillStyle = colors[enemy.type] || "#fff";
    if (enemy.type === "turret") ctx.fillRect(px - 7, py - 7, 14, 14);
    else {
      ctx.beginPath();
      ctx.arc(px, py, enemy.type === "brute" ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const gate of game.gates) {
    const [px, py] = toPlate(gate.x, gate.y);
    ctx.strokeStyle = gate.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(px, py - gate.width * scale * 0.5);
    ctx.lineTo(px, py + gate.width * scale * 0.5);
    ctx.stroke();
    ctx.lineWidth = 1;
    text(gate.symbol, px + 8, py + 5, { size: 14, color: gate.color, weight: "bold" });
  }
  const [bx, by] = toPlate(game.pathX(game.goal + 70), game.goal + 150);
  ctx.strokeStyle = "#ff3e91";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(bx, by, 67 * scale * 1.4, 0, Math.PI * 2);
  ctx.stroke();
  text("GUARDIAN", bx, by - 30, { size: 15, align: "center", color: "#ff3e91", weight: "bold" });
  const [sx, sy] = toPlate(game.player.x, 0);
  ctx.fillStyle = "#e9f2fb";
  ctx.beginPath();
  ctx.moveTo(sx + 14, sy);
  ctx.lineTo(sx - 8, sy - 9);
  ctx.lineTo(sx - 8, sy + 9);
  ctx.fill();
  text("DEPLOY", sx, sy - 18, { size: 14, align: "center" });
  ctx.lineWidth = 1;
  // legend
  let lx = 90;
  const ly = 1180;
  for (const [type, color] of Object.entries(colors)) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(lx + 6, ly - 5, 6, 0, Math.PI * 2);
    ctx.fill();
    text(type.toUpperCase(), lx + 18, ly, { size: 14 });
    lx += 150;
  }
  const counts = {};
  for (const enemy of game.enemies) counts[enemy.type] = (counts[enemy.type] || 0) + 1;
  wrap(`LENGTH ${(game.goal / 25).toFixed(0)} m TO GUARDIAN ZONE.  ${game.gates.length / 2} GATE ROWS.  ${game.enemies.length} LEGION UNITS: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}.  PLAYABLE WIDTH ${(940 / 25).toFixed(1)} m, CAUSEWAY ${(410 / 25).toFixed(1)} m.`, 90, 1240, 1450, 26, { size: 17 });
  titleBlock({ name: `Sector ${sector} layout`, designation: `ND-3-S${String(sector).padStart(2, "0")}`, faction: "Battlefield" }, sheet, { title: `SECTOR ${String(sector).padStart(2, "0")} LAYOUT`, scaleNote: `1 m = ${(scale * 25).toFixed(2)} px` });
  game.showMenu();
  return out.toDataURL("image/png");
}

function coverPlate(sheet) {
  paper();
  text("NEON DOMINION: RIFT COMMAND", 70, 120, { size: 64, weight: "bold" });
  text(`3D BLUEPRINT ATLAS  //  SERIES ${SERIES}  //  REV ${VERSION}`, 74, 170, { size: 24, color: INK_DIM });
  let y = 260;
  let sheetNo = 2;
  for (const group of MODEL_GROUPS) {
    text(group.title.toUpperCase(), 74, y, { size: 22, weight: "bold" });
    y += 36;
    for (const id of group.ids) {
      const spec = MODELS[id];
      const dims = measure(model(id));
      text(`${String(sheetNo).padStart(2, "0")}  ${spec.designation.padEnd(8)} ${spec.name.padEnd(36)} ${dims.width.toFixed(2)} x ${dims.height.toFixed(2)} x ${dims.length.toFixed(2)} m`, 90, y, { size: 17 });
      y += 27;
      sheetNo += 1;
    }
    y += 20;
  }
  text("PLUS: COMMANDER AND GUARDIAN POSE SHEETS, FORCE LINEUP, SECTOR 01 AND 05 LAYOUTS", 74, y + 10, { size: 17, color: INK_DIM });
  const hero = shadedGroup(model("commander"), poseFor("commander", { t: 0.3, move: 0.5, aim: 0.4 }));
  const scene = studioScene(hero);
  const camera = cameraFor("quarterFront", model("commander").bounds, 700 / 1000, 0);
  ctx.drawImage(bloomPass(renderToCanvas(scene, camera, 700, 1000)), PLATE_W - 830, 230);
  titleBlock({ name: "Atlas index", designation: "ND-3-00", faction: "All" }, sheet, { title: "ATLAS INDEX", scaleNote: "SHEETS GENERATED BY tools/blueprints.mjs" });
  return out.toDataURL("image/png");
}

/** List of every plate in atlas order. */
function plates() {
  const list = [{ key: "00-index", kind: "cover" }];
  let index = 1;
  for (const group of MODEL_GROUPS) {
    for (const id of group.ids) {
      list.push({ key: `${String(index).padStart(2, "0")}-${id}`, kind: "unit", id });
      index += 1;
    }
  }
  list.push({ key: `${String(index).padStart(2, "0")}-commander-poses`, kind: "poses", id: "commander" });
  index += 1;
  list.push({ key: `${String(index).padStart(2, "0")}-guardian-poses`, kind: "poses", id: "guardian" });
  index += 1;
  list.push({ key: `${String(index).padStart(2, "0")}-lineup`, kind: "lineup" });
  index += 1;
  list.push({ key: `${String(index).padStart(2, "0")}-sector-01`, kind: "sector", sector: 1 });
  index += 1;
  list.push({ key: `${String(index).padStart(2, "0")}-sector-05`, kind: "sector", sector: 5 });
  return list;
}

async function renderPlate(key) {
  const list = plates();
  const plate = list.find((item) => item.key === key);
  if (!plate) throw new Error(`Unknown plate ${key}`);
  const sheet = `${String(list.indexOf(plate) + 1).padStart(2, "0")} / ${String(list.length).padStart(2, "0")}`;
  if (plate.kind === "cover") return coverPlate(sheet);
  if (plate.kind === "unit") return unitPlate(plate.id, sheet);
  if (plate.kind === "poses") return poseSheet(plate.id, sheet);
  if (plate.kind === "lineup") return lineupPlate(sheet);
  return sectorPlate(sheet, plate.sector);
}

async function exportGLB(id) {
  const target = model(id);
  const group = modelToGroup(target, { materials: new Map() });
  // Weld duplicate vertices so the downloadable GLB is indexed and much smaller.
  group.traverse((child) => {
    if (child.isMesh) child.geometry = THREE.mergeVertices(child.geometry, 1e-5);
  });
  group.userData = { designation: MODELS[id].designation, name: MODELS[id].name, units: "metres", forward: "+Z" };
  const exporter = new THREE.GLTFExporter();
  const buffer = await exporter.parseAsync(group, { binary: true });
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

function dimensions() {
  const result = {};
  for (const id of Object.keys(MODELS)) result[id] = { designation: MODELS[id].designation, name: MODELS[id].name, simRadius: MODELS[id].simRadius, ...measure(model(id)) };
  return result;
}

window.studio = { plates, renderPlate, exportGLB, dimensions, createMaterial };
window.studioReady = true;

const requested = new URLSearchParams(location.search).get("plate");
if (requested) renderPlate(requested);
