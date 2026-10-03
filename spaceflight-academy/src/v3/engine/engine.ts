import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

export type QualityLevel = "low" | "medium" | "high";

export interface PointerInfo {
  type: "down" | "move" | "up" | "tap";
  /** Normalised device coordinates (-1..1). */
  x: number;
  y: number;
  /** CSS pixels relative to the canvas. */
  px: number;
  py: number;
  dx: number;
  dy: number;
  id: number;
  pointers: number;
}

export interface SceneController {
  readonly id: string;
  readonly scene: THREE.Scene;
  camera: THREE.Camera;
  /**
   * Glow settings for this scene (high quality only). Only things that are meant to glow get a
   * halo: emissive materials (intensity ≥ 1), additive effects, and materials/objects flagged
   * with `userData.bloom`. Flag `userData.noBloom` to opt out. `threshold` is kept for
   * compatibility; the glow pass uses its own small threshold.
   */
  bloom?: { strength: number; radius: number; threshold: number } | null;
  enter?(params?: unknown): void;
  exit?(): void;
  update(dt: number, time: number): void;
  resize?(width: number, height: number): void;
  pointer?(info: PointerInfo): void;
  wheel?(deltaY: number): void;
  /** Optional custom rendering (e.g. the blueprint line-art pass). */
  render?(renderer: THREE.WebGLRenderer): void;
}

const PIXEL_CAP: Record<QualityLevel, number> = { low: 1, medium: 1.5, high: 2 };
/** Only fairly bright parts of glowing objects make a halo. */
const GLOW_THRESHOLD = 0.12;

/** Does this material glow on High graphics? */
export function isGlowing(material: THREE.Material): boolean {
  if (material.userData.noBloom) return false;
  if (material.userData.bloom) return true;
  if (material.blending === THREE.AdditiveBlending) return true;
  const m = material as THREE.MeshStandardMaterial;
  return !!m.emissive && m.emissiveIntensity >= 1 && m.emissive.r + m.emissive.g + m.emissive.b > 0.05;
}

/** Full-screen quad that adds the blurred glow on top of the frame (soft-clipped). */
function makeGlowOverlay() {
  const material = new THREE.ShaderMaterial({
    uniforms: { tBloom: { value: null } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: "uniform sampler2D tBloom; varying vec2 vUv; void main(){ vec3 b = texture2D(tBloom, vUv).rgb; gl_FragColor = vec4(1.0 - exp(-b), 1.0); }",
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  return { scene, camera: new THREE.Camera(), material };
}

export function detectQuality(): QualityLevel {
  const params = new URLSearchParams(location.search);
  const forced = params.get("quality");
  if (forced === "low" || forced === "medium" || forced === "high") return forced;
  const ua = navigator.userAgent;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  if (mobile) return cores >= 8 && memory >= 6 ? "medium" : "low";
  return cores >= 8 ? "high" : "medium";
}

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly envMap: THREE.Texture;
  quality: QualityLevel;
  width = 1;
  height = 1;
  time = 0;
  paused = false;
  /** Called every frame after the scene update (UI throttles itself). */
  onFrame: ((dt: number) => void) | null = null;
  private active: SceneController | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private bloomTarget: THREE.WebGLRenderTarget | null = null;
  private readonly glowOverlay = makeGlowOverlay();
  private readonly darkMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
  private readonly swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
  private readonly hidden: THREE.Object3D[] = [];
  private last = 0;
  private raf = 0;
  private readonly fade: HTMLDivElement;
  private transitioning = false;
  private fpsSamples: number[] = [];
  private downgradeChecks = 0;
  private pixelRatio = 1;
  private readonly pointerState = new Map<number, { x: number; y: number; startX: number; startY: number; t: number; moved: boolean }>();

  readonly container: HTMLElement;

  constructor(container: HTMLElement, quality: QualityLevel) {
    this.container = container;
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ antialias: quality !== "low", powerPreference: "high-performance", alpha: false, stencil: false });
    this.canvas = this.renderer.domElement;
    this.canvas.className = "sfa-canvas";
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = quality !== "low";
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.canvas);
    this.fade = document.createElement("div");
    this.fade.className = "sfa-fade";
    container.appendChild(this.fade);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.applyPixelRatio();
    const resize = () => this.resize();
    new ResizeObserver(resize).observe(container);
    window.addEventListener("orientationchange", () => setTimeout(resize, 200));
    this.resize();
    this.bindPointer();
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.last = 0;
    });
  }

  private applyPixelRatio() {
    const params = new URLSearchParams(location.search);
    const forced = Number(params.get("pr"));
    this.pixelRatio = forced > 0 ? forced : Math.min(window.devicePixelRatio || 1, PIXEL_CAP[this.quality]);
    this.renderer.setPixelRatio(this.pixelRatio);
  }

  setQuality(quality: QualityLevel) {
    if (quality === this.quality) return;
    this.quality = quality;
    this.renderer.shadowMap.enabled = quality !== "low";
    this.applyPixelRatio();
    this.resize();
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    this.width = Math.max(1, Math.round(rect.width));
    this.height = Math.max(1, Math.round(rect.height));
    this.renderer.setSize(this.width, this.height, false);
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    if (this.active) this.fitCamera(this.active);
  }

  private fitCamera(controller: SceneController) {
    const camera = controller.camera as THREE.PerspectiveCamera;
    if (camera.isPerspectiveCamera) {
      camera.aspect = this.width / this.height;
      camera.updateProjectionMatrix();
    }
    controller.resize?.(this.width, this.height);
  }

  get aspect() {
    return this.width / this.height;
  }

  get current() {
    return this.active;
  }

  /** Switches scenes behind a short fade. */
  async show(controller: SceneController, params?: unknown, fade = true) {
    if (this.transitioning) await new Promise((r) => setTimeout(r, 380));
    this.transitioning = true;
    if (fade && this.active) {
      this.fade.classList.add("on");
      await new Promise((r) => setTimeout(r, 320));
    }
    this.active?.exit?.();
    this.active = controller;
    controller.scene.environment ??= this.envMap;
    this.fitCamera(controller);
    controller.enter?.(params);
    this.transitioning = false;
    if (fade) requestAnimationFrame(() => this.fade.classList.remove("on"));
  }

  start() {
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 1 / 60;
      this.last = now;
      if (this.paused) return;
      this.time += dt;
      const active = this.active;
      if (!active) return;
      active.update(dt, this.time);
      this.onFrame?.(dt);
      this.render(active);
      this.monitor(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  renderOnce() {
    if (this.active) this.render(this.active);
  }

  /** QA/testing: advance the simulation by `seconds` without waiting for real frames. */
  step(seconds: number, dt = 1 / 30) {
    const active = this.active;
    if (!active) return;
    for (let t = 0; t < seconds; t += dt) {
      this.time += dt;
      active.update(dt, this.time);
      this.onFrame?.(dt);
    }
    this.render(active);
  }

  private render(active: SceneController) {
    if (active.render) {
      active.render(this.renderer);
      return;
    }
    // The normal frame is identical on every quality level...
    this.renderer.render(active.scene, active.camera);
    // ...and High adds a soft glow around things that are meant to glow.
    const bloom = active.bloom;
    if (bloom && bloom.strength > 0 && this.quality === "high") this.renderGlow(active, bloom);
  }

  /**
   * Selective glow: draws only the glowing objects (everything else in black so it still
   * hides glows behind it) into a half-resolution target, blurs it with UnrealBloomPass and
   * adds the blurred halo on top of the finished frame. Unlike full-screen bloom this never
   * washes out bright daylight scenes, white buildings or text.
   */
  private renderGlow(active: SceneController, bloom: { strength: number; radius: number }) {
    const renderer = this.renderer;
    const w = Math.max(2, Math.round(this.width * this.pixelRatio * 0.5));
    const h = Math.max(2, Math.round(this.height * this.pixelRatio * 0.5));
    if (!this.bloomTarget || !this.bloomPass) {
      // 8-bit target: every pixel's glow is capped at 1, so big piles of additive particles
      // (rocket exhaust, explosions) can't flood the screen with light.
      this.bloomTarget = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType });
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), bloom.strength, bloom.radius, GLOW_THRESHOLD);
    } else if (this.bloomTarget.width !== w || this.bloomTarget.height !== h) {
      this.bloomTarget.setSize(w, h);
      this.bloomPass.setSize(w, h);
    }
    const pass = this.bloomPass;
    pass.strength = bloom.strength;
    pass.radius = bloom.radius;
    pass.threshold = GLOW_THRESHOLD;
    const scene = active.scene;
    const background = scene.background, fog = scene.fog;
    const clearColor = renderer.getClearColor(new THREE.Color()), clearAlpha = renderer.getClearAlpha();
    const shadowAuto = renderer.shadowMap.autoUpdate;
    scene.background = null;
    scene.fog = null;
    scene.traverseVisible((node) => this.darken(node));
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.bloomTarget);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(scene, active.camera);
    for (const [mesh, material] of this.swapped) mesh.material = material;
    for (const node of this.hidden) node.visible = true;
    this.swapped.length = 0;
    this.hidden.length = 0;
    scene.background = background;
    scene.fog = fog;
    renderer.shadowMap.autoUpdate = shadowAuto;
    pass.render(renderer, this.bloomTarget, this.bloomTarget, 0, false);
    renderer.setRenderTarget(null);
    renderer.setClearColor(clearColor, clearAlpha);
    this.glowOverlay.material.uniforms.tBloom.value = pass.renderTargetsHorizontal[0].texture;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.glowOverlay.scene, this.glowOverlay.camera);
    renderer.autoClear = autoClear;
  }

  /** Glow pass: keeps glowing objects, turns solid objects black and hides the rest. */
  private darken(node: THREE.Object3D) {
    const drawable = node as THREE.Mesh & { isSprite?: boolean; isPoints?: boolean; isLine?: boolean };
    if (!(drawable.isMesh || drawable.isSprite || drawable.isPoints || drawable.isLine)) return;
    const material = drawable.material as THREE.Material | THREE.Material[];
    const list = Array.isArray(material) ? material : [material];
    if (!node.userData.noBloom && (node.userData.bloom || list.some(isGlowing))) return;
    if (drawable.isMesh && !list.some((m) => m.transparent)) {
      this.swapped.push([drawable, material]);
      drawable.material = this.darkMaterial;
    } else {
      node.visible = false;
      this.hidden.push(node);
    }
  }

  /** Drops resolution automatically on slow devices. */
  private monitor(dt: number) {
    this.fpsSamples.push(dt);
    if (this.fpsSamples.length < 120) return;
    const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
    this.fpsSamples = [];
    if (new URLSearchParams(location.search).has("pr")) return;
    if (avg > 1 / 32 && this.downgradeChecks < 4) {
      this.downgradeChecks++;
      if (this.quality === "high") this.setQuality("medium");
      else if (this.pixelRatio > 0.75) {
        this.pixelRatio = Math.max(0.75, this.pixelRatio - 0.25);
        this.renderer.setPixelRatio(this.pixelRatio);
        this.resize();
      } else if (this.quality === "medium") this.setQuality("low");
    }
  }

  private bindPointer() {
    const el = this.canvas;
    el.style.touchAction = "none";
    const info = (event: PointerEvent, type: PointerInfo["type"], dx = 0, dy = 0): PointerInfo => {
      const rect = el.getBoundingClientRect();
      const px = event.clientX - rect.left, py = event.clientY - rect.top;
      return { type, x: (px / rect.width) * 2 - 1, y: -(py / rect.height) * 2 + 1, px, py, dx, dy, id: event.pointerId, pointers: this.pointerState.size };
    };
    el.addEventListener("pointerdown", (event) => {
      el.setPointerCapture?.(event.pointerId);
      this.pointerState.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, t: performance.now(), moved: false });
      this.active?.pointer?.(info(event, "down"));
    });
    el.addEventListener("pointermove", (event) => {
      const state = this.pointerState.get(event.pointerId);
      const dx = state ? event.clientX - state.x : 0, dy = state ? event.clientY - state.y : 0;
      if (state) {
        state.x = event.clientX;
        state.y = event.clientY;
        if (Math.hypot(event.clientX - state.startX, event.clientY - state.startY) > 10) state.moved = true;
      }
      this.active?.pointer?.(info(event, "move", dx, dy));
    });
    const end = (event: PointerEvent) => {
      const state = this.pointerState.get(event.pointerId);
      this.pointerState.delete(event.pointerId);
      this.active?.pointer?.(info(event, "up"));
      if (state && !state.moved && performance.now() - state.t < 450) this.active?.pointer?.(info(event, "tap"));
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("wheel", (event) => {
      event.preventDefault();
      this.active?.wheel?.(event.deltaY);
    }, { passive: false });
  }
}
