// GameHost: owns the single WebGL renderer, the frame loop, input, audio,
// a shared environment map, and an adaptive-resolution governor. Screens plug
// in as "modes" (lodge backdrop, hunt, studio, trophy room).

import * as THREE from "three";
import { Input } from "./input.ts";
import { GameAudio } from "../audio/audio.ts";
import { QUALITY, type QualityName, type QualitySettings } from "../render/quality.ts";

export interface Mode {
  update(dt: number, aspect: number): void;
  render(renderer: THREE.WebGLRenderer): void;
  dispose(): void;
}

export class GameHost {
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  input: Input;
  audio = new GameAudio();
  quality: QualitySettings;
  mode: Mode | null = null;
  envMap: THREE.Texture | null = null;
  running = false;
  timeScale = 1;
  fps = 60;
  /** frame cap for menus (0 = uncapped) */
  maxFps = 0;
  private lastDraw = 0;
  private raf = 0;
  private last = 0;
  private scale = 1;            // dynamic resolution factor
  private ftAvg = 16;
  private resizeObs: ResizeObserver | null = null;
  onFrame?: (dt: number) => void;
  constructor(canvas: HTMLCanvasElement, quality: QualityName) {
    this.canvas = canvas;
    this.quality = QUALITY[quality];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality.antialias, powerPreference: "high-performance", stencil: false, preserveDrawingBuffer: new URLSearchParams(location.search).has("qa") });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.input = new Input(canvas);
    this.input.enabled = false;
    this.input.onLockRequest = () => { this.audio.init(); this.input.requestLock(); };
    this.envMap = this.makeEnvMap();
    this.resize();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(canvas.parentElement ?? canvas);
  }

  setQuality(q: QualityName) {
    this.quality = QUALITY[q];
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.scale = 1;
    this.resize();
  }

  private makeEnvMap(): THREE.Texture {
    const scene = new THREE.Scene();
    const geo = new THREE.SphereGeometry(10, 32, 16);
    const col: number[] = [];
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 10;
      const c = y > 0 ? new THREE.Color(0.55, 0.68, 0.85).lerp(new THREE.Color(0.85, 0.88, 0.9), 1 - y) : new THREE.Color(0.25, 0.22, 0.18).lerp(new THREE.Color(0.45, 0.42, 0.36), 1 + y);
      col.push(c.r, c.g, c.b);
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const pm = new THREE.PMREMGenerator(this.renderer);
    const rt = pm.fromScene(scene, 0.02);
    pm.dispose();
    return rt.texture;
  }

  resize() {
    const el = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, el.clientWidth || window.innerWidth), h = Math.max(1, el.clientHeight || window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio) * this.scale;
    this.renderer.setPixelRatio(Math.max(0.5, dpr));
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + "px"; this.canvas.style.height = h + "px";
  }
  /** CSS-pixel size of the canvas */
  get cssSize(): [number, number] { const el = this.canvas; return [el.clientWidth || 1, el.clientHeight || 1]; }
  get aspect() { const s = this.renderer.getSize(new THREE.Vector2()); return s.x / Math.max(1, s.y); }

  /** Switch the active mode. The previous one is disposed unless `keep` (the caller then owns it). */
  setMode(m: Mode | null, keep = false) {
    if (this.mode && this.mode !== m && !keep) this.mode.dispose();
    this.mode = m;
    this.renderer.info.reset();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.input.attach();
    this.last = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      if (this.maxFps > 0 && now - this.lastDraw < 1000 / this.maxFps - 2) return;
      this.lastDraw = now;
      const raw = (now - this.last) / 1000;
      this.last = now;
      const dt = Math.min(0.05, Math.max(0, raw)) * this.timeScale;
      this.input.poll();
      try {
        this.mode?.update(dt, this.aspect);
        this.mode?.render(this.renderer);
        this.onFrame?.(dt);
      } catch (e) { console.error(e); }
      this.input.endFrame();
      if (!this.maxFps) this.govern(raw * 1000);
    };
    this.raf = requestAnimationFrame(tick);
  }
  /** Adaptive resolution: hold ~45–60 fps by scaling the drawing buffer. */
  private govern(ms: number) {
    if (!isFinite(ms) || ms <= 0 || ms > 250) return;
    this.ftAvg = this.ftAvg * 0.95 + ms * 0.05;
    this.fps = 1000 / this.ftAvg;
    if (this.ftAvg > 26 && this.scale > 0.6) { this.scale = Math.max(0.6, this.scale - 0.08); this.ftAvg = 18; this.resize(); }
    else if (this.ftAvg < 13 && this.scale < 1) { this.scale = Math.min(1, this.scale + 0.05); this.ftAvg = 15; this.resize(); }
  }
  stop() { this.running = false; cancelAnimationFrame(this.raf); this.input.detach(); }
  dispose() { this.stop(); this.mode?.dispose(); this.mode = null; this.resizeObs?.disconnect(); this.renderer.dispose(); this.audio.dispose(); }
}
