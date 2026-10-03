// Renderer, frame loop, adaptive quality and "focus rect" camera framing.
// The canvas fills the screen behind the HTML interface; each screen tells the engine which
// part of the screen is free, and cameras are offset so the 3D action is centered there.
import * as THREE from './vendor/three.module.min.js?v=2.0.0';

const QUALITY = {
  high:   { pixelRatio: 2, shadows: true, shadowMap: 1024, density: 1 },
  medium: { pixelRatio: 1.5, shadows: true, shadowMap: 1024, density: 0.85 },
  low:    { pixelRatio: 1, shadows: false, shadowMap: 512, density: 0.6 }
};
const ORDER = ['low', 'medium', 'high'];

export class Engine {
  constructor(canvas, { quality = 'auto', reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.qualityPref = quality;
    this.reducedMotion = reducedMotion;
    this.scene = null;
    this.focus = null;
    this.width = 1; this.height = 1;
    this.running = false;
    this.listeners = new Set();
    this.frameTimes = [];
    this.lastAdapt = 0;
    this.goodSince = 0;
    this.time = 0;
  }

  init() {
    const coarse = matchMedia('(pointer: coarse)').matches;
    const lowCore = (navigator.hardwareConcurrency || 4) <= 4 && coarse;
    let start = this.qualityPref === 'auto' ? (lowCore ? 'low' : coarse ? 'medium' : 'high') : this.qualityPref;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: start !== 'low', alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    } catch (e) {
      console.warn('WebGL unavailable', e);
      return false;
    }
    if (!this.renderer.getContext()) return false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.maxQuality = start;
    this.setQuality(start);
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.emit('contextlost'); }, false);
    this.canvas.addEventListener('webglcontextrestored', () => location.reload(), false);
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    this.resize();
    this.buildEnvironment();
    return true;
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type, data) { for (const fn of this.listeners) fn(type, data); }

  setQuality(level) {
    this.qualityLevel = level;
    this.q = QUALITY[level];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.q.pixelRatio));
    this.renderer.shadowMap.enabled = this.q.shadows;
    this.renderer.shadowMap.needsUpdate = true;
    this.resize();
    this.emit('quality', level);
  }

  buildEnvironment() {
    const pm = new THREE.PMREMGenerator(this.renderer);
    const s = new THREE.Scene();
    s.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = mix(vec3(0.32,0.4,0.5), vec3(1.0,0.97,0.92), smoothstep(-0.25,0.85,h)); gl_FragColor = vec4(c*1.2,1.); }'
    })));
    this.envMap = pm.fromScene(s, 0.04).texture;
    pm.dispose();
  }

  setScene(scene) {
    if (this.scene === scene) return;
    this.scene?.onExit?.();
    this.scene = scene;
    scene?.onEnter?.();
    scene?.resize?.(this.width, this.height);
  }

  // rect in CSS pixels relative to the viewport
  setFocus(rect) {
    this.focus = rect;
    this.scene?.resize?.(this.width, this.height);
  }

  applyFocus(cam, { vFov = 50, hFovMin = 0, hFovMax = 0 } = {}) {
    const W = this.width, H = this.height;
    const r = this.focus && this.focus.w > 20 && this.focus.h > 20 ? this.focus : { x: 0, y: 0, w: W, h: H };
    const fv = r.h / 2 / Math.tan((vFov * Math.PI) / 360);
    let f = fv;
    if (hFovMin) f = Math.min(f, r.w / 2 / Math.tan((hFovMin * Math.PI) / 360));
    if (hFovMax) f = Math.max(f, Math.min(r.w / 2 / Math.tan((hFovMax * Math.PI) / 360), fv * 1.35));
    cam.aspect = W / H;
    cam.fov = (2 * Math.atan(H / 2 / f) * 180) / Math.PI;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    cam.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
    cam.updateProjectionMatrix();
  }

  resize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    this.width = w; this.height = h;
    this.renderer?.setSize(w, h, false);
    this.scene?.resize?.(w, h);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now) => {
      if (!this.running) return;
      requestAnimationFrame(tick);
      const raw = (now - this.last) / 1000;
      this.last = now;
      const dt = Math.min(0.05, Math.max(0, raw));
      this.time += dt;
      if (document.hidden) return;
      this.adapt(raw * 1000, now);
      const sc = this.scene;
      if (!sc) return;
      sc.update?.(dt, this.time);
      if (sc.render) sc.render(this.renderer);
      else this.renderer.render(sc.scene, sc.camera);
      window.__frames = (window.__frames || 0) + 1;
    };
    requestAnimationFrame(tick);
  }

  stop() { this.running = false; }

  adapt(ms, now) {
    if (this.qualityPref !== 'auto' || ms > 250) return;
    this.frameTimes.push(ms);
    if (this.frameTimes.length > 90) this.frameTimes.shift();
    if (now - this.lastAdapt < 2500 || this.frameTimes.length < 60) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    const idx = ORDER.indexOf(this.qualityLevel);
    if (avg > 25 && idx > 0) {
      this.lastAdapt = now; this.frameTimes = []; this.goodSince = 0;
      this.setQuality(ORDER[idx - 1]);
    } else if (avg < 13 && idx < ORDER.indexOf(this.maxQuality)) {
      if (!this.goodSince) this.goodSince = now;
      if (now - this.goodSince > 8000) { this.lastAdapt = now; this.frameTimes = []; this.goodSince = 0; this.setQuality(ORDER[idx + 1]); }
    } else this.goodSince = 0;
  }

  pick(clientX, clientY, camera, objects) {
    const ndc = new THREE.Vector2((clientX / this.width) * 2 - 1, -(clientY / this.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    return ray.intersectObjects(objects, true)[0] || null;
  }
}

// Soft round sprite texture used by particles and glows.
export function dotTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, inner); grd.addColorStop(0.35, inner); grd.addColorStop(1, outer);
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}

export { THREE };
