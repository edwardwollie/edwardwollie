import * as THREE from "three";
import type { Game } from "../app/game.ts";
import { BLUEPRINTS } from "../blueprints/registry.ts";
import type { Blueprint, ViewName } from "../blueprints/types.ts";
import { sfx } from "../engine/audio.ts";
import type { PointerInfo, SceneController } from "../engine/engine.ts";
import { damp } from "../engine/fx.ts";
import { BlueprintRenderer } from "../models/blueprint-render.ts";
import { measure, setExplode, type BuiltModel } from "../models/build.ts";
import { applyPose } from "../models/rig.ts";
import { frameView, projectedExtent } from "../models/views.ts";

export type StudioView = ViewName | "orbit";

export interface StudioDim { x1: number; y1: number; x2: number; y2: number; label: string; vertical: boolean }
export interface StudioCallout { ax: number; ay: number; lx: number; ly: number; name: string; side: "left" | "right" }
export interface StudioDetective {
  active: boolean;
  round: number;
  score: number;
  answer: ViewName;
  options: ViewName[];
  picked: ViewName | null;
  id: string;
  best: number;
}

export interface StudioState {
  id: string;
  view: StudioView;
  blueprintMode: boolean;
  dims: boolean;
  labels: boolean;
  exploded: boolean;
  canExplode: boolean;
  /** Screen-space dimension lines (CSS px). */
  dimLines: StudioDim[];
  callouts: StudioCallout[];
  detective: StudioDetective | null;
}

export interface StudioInsets { l: number; r: number; t: number; b: number }

export const STUDIO_VIEW_WORDS: Record<ViewName, string> = { front: "Front view", back: "Back view", left: "Left view", right: "Right view", top: "Top view", bottom: "Bottom view", iso: "Isometric view" };

const DETECTIVE_ROUNDS = 10;
const MASK = 48;

/**
 * Blueprint Studio: every model in the game, from all sides, as a live blueprint.
 * Switch between line-art and colour, show dimensions and part callouts, pull
 * assemblies apart into exploded views, and play View Detective.
 */
export class StudioScene implements SceneController {
  readonly id = "studio";
  readonly scene = new THREE.Scene();
  camera: THREE.Camera;
  bloom = null;
  private readonly game: Game;
  private readonly ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 1000);
  private readonly persp = new THREE.PerspectiveCamera(30, 1, 0.05, 6000);
  private model: BuiltModel | null = null;
  private box = new THREE.Box3();
  private boxExploded = new THREE.Box3();
  private readonly frameBox = new THREE.Box3();
  private state: StudioState;
  private explode = 0;
  private yaw = 0.7;
  private pitch = 0.32;
  private zoom = 1;
  private blueprint: BlueprintRenderer | null = null;
  private readonly turntable = new THREE.Group();
  private readonly grid: THREE.GridHelper;
  private uiTimer = 0;
  private dragging = false;
  private active = false;
  private overlayKey = "";
  private insets: StudioInsets = { l: 280, r: 350, t: 120, b: 96 };
  private detectiveToken = 0;
  private lastDetectiveId = "";
  private maskTarget: THREE.WebGLRenderTarget | null = null;
  private readonly maskMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });

  constructor(game: Game) {
    this.game = game;
    this.camera = this.ortho;
    this.scene.background = new THREE.Color("#0f1d48");
    this.scene.add(new THREE.HemisphereLight(0xe6efff, 0x2a2a44, 1.15));
    const key = new THREE.DirectionalLight(0xffffff, 2.3);
    key.position.set(5, 8, 6);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fd8ff, 1.0);
    rim.position.set(-6, 4, -5);
    this.scene.add(rim);
    this.grid = new THREE.GridHelper(10, 20, 0x3a6ad8, 0x22408c);
    this.scene.add(this.grid, this.turntable);
    this.state = { id: "rocket-comet", view: "iso", blueprintMode: true, dims: true, labels: false, exploded: false, canExplode: false, dimLines: [], callouts: [], detective: null };
  }

  enter(params?: unknown) {
    this.active = true;
    if (!this.blueprint) this.blueprint = new BlueprintRenderer(this.game.engine.renderer);
    const id = (params as { id?: string } | undefined)?.id;
    this.state = { ...this.state, detective: null };
    this.select(id ?? this.state.id, false);
    void this.game.say("Welcome to the Blueprint Studio! Pick a model, then look at it from every side. Engineers draw the front, the sides and the top so anyone can build it.");
  }

  exit() {
    this.active = false;
    this.detectiveToken++;
    this.game.quiet();
  }

  /** The UI reports how much of the screen its panels cover so the model stays centred in the free space. */
  setInsets(insets: StudioInsets) {
    this.insets = insets;
    this.uiTimer = 0;
  }

  get current(): Blueprint | undefined {
    return BLUEPRINTS.find((b) => b.id === this.state.id);
  }

  select(id: string, speak = true) {
    const bp = BLUEPRINTS.find((b) => b.id === id);
    if (!bp) return;
    if (this.model) this.turntable.remove(this.model.root);
    this.model = bp.id.startsWith("cadet-") ? this.game.cadetModel(bp.id.slice(6) as never, "classic") : this.game.model(bp.id);
    if (bp.rig) applyPose(this.model, "rest");
    this.turntable.add(this.model.root);
    let canExplode = false;
    this.model.root.traverse((node) => { if (node.userData.explode) canExplode = true; });
    setExplode(this.model, 1);
    this.boxExploded = measure(this.model.root);
    setExplode(this.model, 0);
    this.box = measure(this.model.root);
    this.boxExploded.union(this.box);
    this.explode = 0;
    this.zoom = 1;
    this.state = { ...this.state, id, exploded: false, canExplode };
    const size = this.box.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.z) * 1.6;
    this.grid.scale.setScalar(Math.max(0.2, span / 10));
    this.grid.position.y = this.box.min.y - 0.001;
    if (!this.game.save.get().v3.studioSeen.includes(id)) {
      this.game.save.set((s) => ({ v3: { ...s.v3, studioSeen: [...s.v3.studioSeen, id] } }));
      if (!this.state.detective) this.game.awardAchievements();
    }
    if (speak) {
      sfx("select");
      void this.game.say(`${bp.name}. ${bp.description}`);
    }
    this.uiTimer = 0;
    this.publish();
  }

  readAloud() {
    const bp = this.current;
    if (!bp) return;
    const facts = bp.facts?.length ? ` ${bp.facts.join(" ")}` : "";
    void this.game.say(`${bp.name}. ${bp.description}${facts}`);
  }

  setView(view: StudioView) {
    if (view === "orbit" && this.state.view !== "orbit") { this.yaw = 0.7; this.pitch = 0.32; }
    this.zoom = 1;
    this.state = { ...this.state, view };
    sfx("tap");
    this.uiTimer = 0;
    this.publish();
  }

  toggle(key: "blueprintMode" | "dims" | "labels") {
    this.state = { ...this.state, [key]: !this.state[key] };
    sfx("tap");
    this.uiTimer = 0;
    this.publish();
  }

  setExploded(on: boolean) {
    if (!this.state.canExplode) return;
    this.state = { ...this.state, exploded: on };
    sfx("whoosh");
    if (on) void this.game.say("Exploded view! Every part slides apart along its own line so you can see how it all fits together.");
    this.publish();
  }

  zoomBy(factor: number) {
    this.zoom = THREE.MathUtils.clamp(this.zoom * factor, 0.35, 2.5);
    this.uiTimer = 0;
  }

  wheel(deltaY: number) {
    this.zoomBy(1 + deltaY * 0.001);
  }

  // ------------------------------------------------------------ View Detective

  startDetective() {
    this.detectiveToken++;
    const best = this.game.save.get().v3.detectiveBest;
    this.state = { ...this.state, blueprintMode: true, labels: false, exploded: false, detective: { active: true, round: 0, score: 0, answer: "front", options: [], picked: null, id: this.state.id, best } };
    sfx("select");
    this.nextRound();
  }

  stopDetective() {
    this.detectiveToken++;
    this.state = { ...this.state, detective: null };
    this.game.quiet();
    this.publish();
  }

  /** Renders the model's silhouette from one view into a small mask (used to make fair multiple-choice options). */
  private viewMask(view: ViewName): Uint8Array {
    const renderer = this.game.engine.renderer;
    this.maskTarget ??= new THREE.WebGLRenderTarget(MASK, MASK);
    const frame = frameView(this.box, view, 1, 0.06);
    const hidden: THREE.Object3D[] = [];
    this.scene.traverse((node) => {
      if (node.visible && (node === this.grid || node.userData.ghost || node.userData.fx || (node as THREE.Sprite).isSprite || (node as THREE.Points).isPoints)) {
        hidden.push(node);
        node.visible = false;
      }
    });
    const background = this.scene.background;
    this.scene.background = null;
    this.scene.overrideMaterial = this.maskMaterial;
    const previous = renderer.getRenderTarget();
    const clear = renderer.getClearColor(new THREE.Color());
    const alpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.maskTarget);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(this.scene, frame.camera);
    const pixels = new Uint8Array(MASK * MASK * 4);
    renderer.readRenderTargetPixels(this.maskTarget, 0, 0, MASK, MASK, pixels);
    renderer.setRenderTarget(previous);
    renderer.setClearColor(clear, alpha);
    this.scene.overrideMaterial = null;
    this.scene.background = background;
    for (const node of hidden) node.visible = true;
    const mask = new Uint8Array(MASK * MASK);
    for (let i = 0; i < MASK * MASK; i++) mask[i] = pixels[i * 4] > 40 ? 1 : 0;
    return mask;
  }

  /** 0 = identical silhouettes, 1 = nothing in common. */
  private static maskDistance(a: Uint8Array, b: Uint8Array, mirror: boolean) {
    let union = 0, diff = 0;
    for (let y = 0; y < MASK; y++) {
      for (let x = 0; x < MASK; x++) {
        const va = a[y * MASK + x];
        const vb = b[y * MASK + (mirror ? MASK - 1 - x : x)];
        if (va || vb) union++;
        if (va !== vb) diff++;
      }
    }
    return union ? diff / union : 0;
  }

  private nextRound() {
    const det = this.state.detective;
    if (!det || !this.active) return;
    if (det.round >= DETECTIVE_ROUNDS) {
      const best = Math.max(this.game.save.get().v3.detectiveBest, det.score);
      this.game.save.set((s) => ({ v3: { ...s.v3, detectiveBest: best } }));
      this.game.awardAchievements();
      sfx("fanfare");
      const praise = det.score >= 9 ? "Master detective!" : det.score >= 6 ? "Great detective work!" : "Nice work — every engineer practises this.";
      void this.game.say(`Case closed! You scored ${det.score} out of ${DETECTIVE_ROUNDS}. ${praise}`);
      this.state = { ...this.state, detective: { ...det, active: false, best } };
      this.publish();
      return;
    }
    const young = this.game.age === "5–7";
    const pool = BLUEPRINTS.filter((b) => !b.code.startsWith("P-") && b.id !== this.lastDetectiveId);
    const views: ViewName[] = ["front", "back", "left", "right", "top", "bottom"];
    let chosen: { bp: Blueprint; answer: ViewName; options: ViewName[] } | null = null;
    for (let attempt = 0; attempt < 12 && !chosen; attempt++) {
      const bp = pool[Math.floor(Math.random() * pool.length)];
      this.select(bp.id, false);
      const masks = Object.fromEntries(views.map((v) => [v, this.viewMask(v)])) as Record<ViewName, Uint8Array>;
      const order = [...views].sort(() => Math.random() - 0.5);
      for (const answer of order) {
        // Options must look clearly different from the answer (young cadets: not even a mirror image).
        const distinct = views.filter((v) => v !== answer
          && StudioScene.maskDistance(masks[answer], masks[v], false) > 0.1
          && (!young || StudioScene.maskDistance(masks[answer], masks[v], true) > 0.1));
        // ...and from each other, so no two buttons show the same picture.
        const picks: ViewName[] = [];
        for (const v of distinct.sort(() => Math.random() - 0.5)) {
          if (picks.every((p) => StudioScene.maskDistance(masks[p], masks[v], false) > 0.1)) picks.push(v);
          if (picks.length === 2) break;
        }
        if (picks.length === 2) {
          chosen = { bp, answer, options: [answer, ...picks].sort(() => Math.random() - 0.5) };
          break;
        }
      }
    }
    if (!chosen) {
      // Fallback that is always fair: front / top / bottom of the Comet rocket.
      const bp = BLUEPRINTS.find((b) => b.id === "rocket-comet")!;
      this.select(bp.id, false);
      chosen = { bp, answer: "top", options: ["front", "top", "bottom"] };
    }
    this.lastDetectiveId = chosen.bp.id;
    this.zoom = 1;
    const { bp, answer, options } = chosen;
    this.state = { ...this.state, view: answer, blueprintMode: true, dims: false, labels: false, detective: { ...det, active: true, round: det.round + 1, answer, options, picked: null, id: bp.id } };
    void this.game.say(`Round ${det.round + 1}. Which view of the ${bp.name} is this? ${options.map((v, i) => `Choice ${i + 1}: ${STUDIO_VIEW_WORDS[v]}.`).join(" ")}`);
    this.uiTimer = 0;
    this.publish();
  }

  answer(view: ViewName) {
    const det = this.state.detective;
    if (!det || !det.active || det.picked) return;
    const correct = view === det.answer;
    sfx(correct ? "correct" : "wrong");
    const why: Record<ViewName, string> = {
      front: "you are looking straight at its front",
      back: "you walked all the way around behind it",
      left: "you stepped around to your left of the front",
      right: "you stepped around to your right of the front",
      top: "you are looking straight down from above",
      bottom: "you are looking straight up from underneath",
      iso: "you see three sides at once",
    };
    void this.game.say(correct ? `Yes! It's the ${STUDIO_VIEW_WORDS[det.answer]}, because ${why[det.answer]}.` : `Good try! This is the ${STUDIO_VIEW_WORDS[det.answer]}, because ${why[det.answer]}.`);
    this.state = { ...this.state, detective: { ...det, picked: view, score: det.score + (correct ? 1 : 0) } };
    this.publish();
    const token = ++this.detectiveToken;
    window.setTimeout(() => { if (token === this.detectiveToken) this.nextRound(); }, correct ? 2600 : 3600);
  }

  // ------------------------------------------------------------ camera, render & update

  private publish() {
    this.game.ui.set({ studio: { ...this.state } });
  }

  private currentBox() {
    const t = this.explode;
    this.frameBox.min.lerpVectors(this.box.min, this.boxExploded.min, t);
    this.frameBox.max.lerpVectors(this.box.max, this.boxExploded.max, t);
    return this.frameBox;
  }

  private placeCamera() {
    const W = this.game.engine.width, H = this.game.engine.height;
    const view = this.state.view;
    // Leave room for the dimension lines (left and below the drawing).
    const dimRoom = this.state.dims && !this.state.detective && view !== "orbit" && view !== "iso" ? 46 : 0;
    const l = this.insets.l + dimRoom, r = this.insets.r, t = this.insets.t, b = this.insets.b + dimRoom;
    const aw = Math.max(120, W - l - r), ah = Math.max(120, H - t - b);
    const cx = Math.min(W - 60, l + aw / 2), cy = Math.min(H - 60, t + ah / 2);
    const box = this.currentBox();
    if (view === "orbit" || (view === "iso" && !this.state.blueprintMode)) {
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const radius = Math.max(0.2, size.length() / 2);
      const tanV = Math.tan(THREE.MathUtils.degToRad(this.persp.fov) / 2) * (ah / H);
      const tanH = tanV * (aw / ah);
      const tanMin = Math.min(tanV, tanH);
      const dist = ((radius * Math.sqrt(1 + tanMin * tanMin)) / tanMin) * this.zoom;
      this.persp.aspect = W / H;
      this.persp.near = Math.max(0.01, dist - radius * 3);
      this.persp.far = dist + radius * 4;
      this.persp.position.set(
        center.x + Math.sin(this.yaw) * Math.cos(this.pitch) * dist,
        center.y + Math.sin(this.pitch) * dist,
        center.z + Math.cos(this.yaw) * Math.cos(this.pitch) * dist,
      );
      this.persp.lookAt(center);
      this.persp.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
      this.persp.updateProjectionMatrix();
      this.camera = this.persp;
      return;
    }
    const frame = frameView(box, view, aw / ah, 0.14);
    const cam = frame.camera;
    const mpp = ((cam.top * 2) / ah) * this.zoom;
    cam.left = -cx * mpp;
    cam.right = (W - cx) * mpp;
    cam.top = cy * mpp;
    cam.bottom = -(H - cy) * mpp;
    cam.zoom = 1;
    cam.updateProjectionMatrix();
    this.ortho.copy(cam);
    this.camera = this.ortho;
  }

  render(renderer: THREE.WebGLRenderer) {
    this.placeCamera();
    this.grid.visible = !this.state.blueprintMode;
    if (this.state.blueprintMode && this.blueprint) {
      renderer.setRenderTarget(null);
      renderer.setClearColor(0x0d3b8e, 1);
      renderer.clear();
      this.blueprint.render(this.scene, this.camera);
    } else {
      renderer.render(this.scene, this.camera);
    }
  }

  update(dt: number) {
    if (this.model) {
      const target = this.state.exploded ? 1 : 0;
      if (Math.abs(this.explode - target) > 0.0005) {
        this.explode = damp(this.explode, target, 4, dt);
        setExplode(this.model, this.explode);
        this.uiTimer = Math.min(this.uiTimer, 0.04);
      }
    }
    if (this.state.view === "orbit" && !this.dragging && !this.game.reduceMotion) {
      this.yaw += dt * 0.25;
      if (this.state.labels) this.uiTimer = Math.min(this.uiTimer, 0.06);
    }
    this.uiTimer -= dt;
    if (this.uiTimer <= 0) {
      this.uiTimer = 0.25;
      this.computeOverlay();
    }
  }

  private computeOverlay() {
    if (!this.model) return;
    const view = this.state.view;
    const W = this.game.engine.width, H = this.game.engine.height;
    this.placeCamera();
    const cam = this.camera;
    cam.updateMatrixWorld();
    const toScreen = (p: THREE.Vector3) => {
      const v = p.clone().project(cam);
      return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H };
    };
    const box = this.currentBox();
    const dimLines: StudioDim[] = [];
    const callouts: StudioCallout[] = [];
    if (this.state.dims && view !== "orbit" && view !== "iso" && !this.state.detective) {
      const ext = projectedExtent(box, view);
      const depth = box.getCenter(new THREE.Vector3()).dot(ext.forward);
      const point = (x: number, y: number) => ext.right.clone().multiplyScalar(x).add(ext.up.clone().multiplyScalar(y)).add(ext.forward.clone().multiplyScalar(depth));
      const bl = toScreen(point(ext.minX, ext.minY)), br = toScreen(point(ext.maxX, ext.minY)), tl = toScreen(point(ext.minX, ext.maxY));
      const width = ext.maxX - ext.minX, height = ext.maxY - ext.minY;
      dimLines.push({ x1: bl.x, y1: bl.y + 28, x2: br.x, y2: br.y + 28, label: formatMetres(width), vertical: false });
      dimLines.push({ x1: bl.x - 28, y1: bl.y, x2: tl.x - 28, y2: tl.y, label: formatMetres(height), vertical: true });
    }
    if (this.state.labels && !this.state.detective) {
      // Model outline on screen
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < 8; i++) {
        const p = toScreen(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      }
      // Prefer the big assemblies (shallow nodes) over tiny details.
      const named: { node: THREE.Object3D; depth: number; name: string }[] = [];
      const seen = new Set<string>();
      const walk = (node: THREE.Object3D, depth: number) => {
        if (!node.visible || node.userData.fx) return;
        const name = node.userData.partName as string | undefined;
        if (name && !seen.has(name)) { seen.add(name); named.push({ node, depth, name }); }
        for (const child of node.children) walk(child, depth + 1);
      };
      this.model.root.updateMatrixWorld(true);
      walk(this.model.root, 0);
      named.sort((a, b) => a.depth - b.depth);
      const anchors: { x: number; y: number; name: string }[] = [];
      for (const item of named) {
        if (anchors.length >= 12) break;
        const nodeBox = measure(item.node, false);
        if (nodeBox.isEmpty()) continue;
        nodeBox.applyMatrix4(item.node.matrixWorld);
        const p = toScreen(nodeBox.getCenter(new THREE.Vector3()));
        anchors.push({ x: p.x, y: p.y, name: item.name });
      }
      anchors.sort((a, b) => a.y - b.y);
      const { l, r } = this.insets;
      const columns = { left: [] as typeof anchors, right: [] as typeof anchors };
      const mid = (minX + maxX) / 2;
      anchors.forEach((a, i) => {
        // Clearly off-centre anchors keep their side; centred ones alternate so both columns fill.
        const side = Math.abs(a.x - mid) > (maxX - minX) * 0.18 ? (a.x < mid ? "left" : "right") : i % 2 ? "right" : "left";
        columns[side].push(a);
      });
      for (const side of ["left", "right"] as const) {
        const lx = side === "left" ? Math.max(l + 12, minX - 46) : Math.min(W - r - 12, maxX + 46);
        let lastY = -Infinity;
        const placed = columns[side].map((a) => {
          const ly = Math.max(a.y, lastY + 24);
          lastY = ly;
          return { ax: a.x, ay: a.y, lx, ly, name: a.name, side };
        });
        const overflow = lastY - (H - this.insets.b - 10);
        if (overflow > 0) for (const c of placed) c.ly -= overflow;
        callouts.push(...placed);
      }
    }
    const key = JSON.stringify([dimLines, callouts]);
    if (key === this.overlayKey) return;
    this.overlayKey = key;
    this.state = { ...this.state, dimLines, callouts };
    this.publish();
  }

  pointer(info: PointerInfo) {
    if (info.type === "down") this.dragging = false;
    if (info.type === "move" && info.pointers > 0 && Math.abs(info.dx) + Math.abs(info.dy) > 1) {
      if (this.state.detective?.active) return;
      this.dragging = true;
      if (this.state.view !== "orbit") {
        // Start orbiting from the direction we were looking.
        const dir = this.camera.position.clone().sub(this.currentBox().getCenter(new THREE.Vector3())).normalize();
        this.yaw = Math.atan2(dir.x, dir.z);
        this.pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -0.99, 0.99));
        this.state = { ...this.state, view: "orbit" };
        this.publish();
      }
      this.yaw -= info.dx * 0.01;
      this.pitch = THREE.MathUtils.clamp(this.pitch + info.dy * 0.006, -1.3, 1.35);
      this.uiTimer = Math.min(this.uiTimer, 0.05);
    }
    if (info.type === "up") window.setTimeout(() => { this.dragging = false; }, 60);
  }
}

function formatMetres(m: number) {
  if (m < 1) return `${Math.round(m * 100)} cm`;
  return `${m.toFixed(m < 10 ? 2 : 1)} m`;
}
