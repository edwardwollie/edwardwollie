import {
  type AbstractEngine, type Camera, Color3, Color4, DefaultRenderingPipeline, DirectionalLight, DynamicTexture, GlowLayer,
  HemisphericLight, ImageProcessingConfiguration, Mesh, MeshBuilder, Scene, ShadowGenerator, StandardMaterial, Texture, Vector3,
} from "@babylonjs/core";
import type {ArenaTheme} from "./arena-themes";

/** Shared cinematic look: themed sky, fog, glow, ACES grading and bloom. */
export type Quality = "high" | "low";
export const isMobile = () => typeof window !== "undefined" && (window.innerWidth < 760 || matchMedia("(pointer: coarse)").matches);
export const autoQuality = (): Quality => (isMobile() ? "low" : "high");
const isNull = (engine: {getClassName(): string}) => engine.getClassName() === "NullEngine";
const hex = (h: string) => Color3.FromHexString(h);

export function arenaScene(engine: AbstractEngine, theme: ArenaTheme, quality: Quality) {
  const scene = new Scene(engine);
  const fog = hex(theme.fog);
  scene.clearColor = new Color4(fog.r * .5, fog.g * .5, fog.b * .5, 1);
  scene.fogMode = Scene.FOGMODE_EXP2; scene.fogDensity = theme.fogDensity; scene.fogColor = fog;
  scene.ambientColor = new Color3(.14, .15, .24);
  scene.skipPointerMovePicking = true;
  if (!isNull(engine)) {
    const glow = new GlowLayer("neonGlow", scene, {blurKernelSize: quality === "high" ? 40 : 18, mainTextureRatio: quality === "high" ? .5 : .33});
    glow.intensity = .72;
  }
  return scene;
}

export function arenaLights(scene: Scene, theme: ArenaTheme, quality: Quality) {
  const hemi = new HemisphericLight("stadiumSky", new Vector3(0, 1, 0), scene);
  hemi.intensity = theme.hemi; hemi.diffuse = new Color3(.62, .72, 1); hemi.groundColor = new Color3(.12, .08, .22); hemi.specular = new Color3(.15, .18, .25);
  const key = new DirectionalLight("floodKey", new Vector3(-.38, -1, .42), scene);
  key.position = new Vector3(22, 40, -26); key.intensity = theme.key; key.diffuse = hex(theme.sun);
  const rim = new DirectionalLight("accentRim", new Vector3(.6, -.45, -.65), scene);
  rim.position = new Vector3(-20, 18, 30); rim.intensity = .55; rim.diffuse = hex(theme.accent); rim.specular = hex(theme.accent).scale(.6);
  let shadow: ShadowGenerator | null = null;
  if (quality === "high" && !isNull(scene.getEngine())) {
    shadow = new ShadowGenerator(2048, key);
    shadow.usePercentageCloserFiltering = true; shadow.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    shadow.bias = .0015; shadow.normalBias = .02; shadow.darkness = .3;
    key.shadowMinZ = 1; key.shadowMaxZ = 120;
  }
  return {hemi, key, rim, shadow};
}

/** Bloom, ACES tone mapping, FXAA, vignette, light grain (desktop). */
export function postFx(scene: Scene, camera: Camera, theme: ArenaTheme, quality: Quality) {
  if (isNull(scene.getEngine())) return null;
  const p = new DefaultRenderingPipeline("broadcast", true, scene, [camera]);
  p.fxaaEnabled = true;
  p.bloomEnabled = true; p.bloomThreshold = .58; p.bloomWeight = quality === "high" ? .42 : .3; p.bloomKernel = quality === "high" ? 64 : 32; p.bloomScale = .5;
  p.imageProcessingEnabled = true;
  const ip = p.imageProcessing;
  ip.toneMappingEnabled = true; ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  ip.exposure = theme.exposure; ip.contrast = 1.16;
  ip.vignetteEnabled = true; ip.vignetteWeight = 1.8; ip.vignetteColor = new Color4(.02, 0, .08, 0);
  if (quality === "high") {p.grainEnabled = true; p.grain.intensity = 3; p.grain.animated = true; p.chromaticAberrationEnabled = true; p.chromaticAberration.aberrationAmount = 2.5}
  return p;
}

/** Gradient sky dome with stars and a themed horizon glow. */
export function skyDome(scene: Scene, theme: ArenaTheme, seed = 7) {
  if (isNull(scene.getEngine())) return null;
  const tex = new DynamicTexture("skyTex", {width: 1024, height: 512}, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const [top, mid, horizon, below] = theme.sky;
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, top); g.addColorStop(.36, mid); g.addColorStop(.49, horizon); g.addColorStop(.53, mid); g.addColorStop(1, below);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 512);
  let s = seed; const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000;
  for (let i = 0; i < 650; i++) {const y = r() * 220; ctx.fillStyle = `rgba(${200 + r() * 55 | 0},${205 + r() * 50 | 0},255,${.2 + r() * .7})`; ctx.fillRect(r() * 1024, y, r() < .08 ? 2 : 1, r() < .08 ? 2 : 1)}
  if (theme.decor === "clouds") {
    // Aurora curtains.
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = `rgba(${120 + k * 40},255,${170 - k * 30},.16)`; ctx.lineWidth = 34 - k * 8;
      ctx.beginPath(); for (let x = 0; x <= 1024; x += 16) ctx.lineTo(x, 120 + k * 26 + Math.sin(x * .012 + k) * 28); ctx.stroke();
    }
  }
  if (theme.decor === "city" || theme.decor === "halo") {
    ctx.fillStyle = theme.decor === "city" ? "rgba(255,140,90,.9)" : "rgba(255,220,140,.8)";
    ctx.beginPath(); ctx.arc(300, 238, 30, 0, Math.PI * 2); ctx.fill();
  }
  tex.update();
  const dome = MeshBuilder.CreateSphere("skyDome", {diameter: 1600, segments: 24, sideOrientation: Mesh.BACKSIDE}, scene);
  const m = new StandardMaterial("skyMat", scene);
  m.emissiveTexture = tex; m.disableLighting = true; m.fogEnabled = false; m.diffuseColor = Color3.Black(); m.specularColor = Color3.Black();
  dome.material = m; dome.infiniteDistance = true; dome.isPickable = false; dome.applyFog = false;
  return dome;
}

/** Soft round sprite used by every particle effect. */
export function sparkTexture(scene: Scene) {
  const tex = new DynamicTexture("spark", {width: 64, height: 64}, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(.25, "rgba(255,255,255,.85)"); g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64); tex.hasAlpha = true; tex.update();
  tex.wrapU = tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  return tex;
}

/**
 * Procedural audio: sound effects, a crowd bed that swells with the action,
 * whistle and goal horn, and an optional synthwave pulse.
 */
export class Synth {
  ctx: AudioContext | null = null; master: GainNode | null = null; crowdGain: GainNode | null = null;
  music = false; timer: number | null = null; step = 0; bass = [55, 65.4, 49, 58.3]; crowdLevel = .2;
  wake() {
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext(); this.master = this.ctx.createGain(); this.master.gain.value = .85; this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
    } catch {}
  }
  tone(freq: number, duration = .08, volume = .035, type: OscillatorType = "sawtooth", slide = 0, delay = 0) {
    try {
      this.wake(); if (!this.ctx || !this.master) return;
      const t = this.ctx.currentTime + delay, osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
      osc.type = type; osc.frequency.setValueAtTime(freq, t); if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + duration);
      gain.gain.setValueAtTime(volume, t); gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
      osc.connect(gain).connect(this.master); osc.start(t); osc.stop(t + duration + .02);
    } catch {}
  }
  noise(duration = .2, volume = .05, cutoff = 1800, type: BiquadFilterType = "lowpass") {
    try {
      this.wake(); if (!this.ctx || !this.master) return;
      const t = this.ctx.currentTime, n = Math.floor(this.ctx.sampleRate * duration), buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
      src.buffer = buf; f.type = type; f.frequency.value = cutoff; g.gain.value = volume;
      src.connect(f).connect(g).connect(this.master); src.start(t);
    } catch {}
  }
  /** Looping filtered-noise crowd murmur; level 0..1 sets how loud it is. */
  startCrowd(level = .2) {
    try {
      this.wake(); if (!this.ctx || !this.master || this.crowdGain) return;
      const n = this.ctx.sampleRate * 3, buf = this.ctx.createBuffer(2, n, this.ctx.sampleRate);
      for (let c = 0; c < 2; c++) {const d = buf.getChannelData(c); let last = 0; for (let i = 0; i < n; i++) {last = last * .97 + (Math.random() * 2 - 1) * .03; d[i] = last * 6}}
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const band = this.ctx.createBiquadFilter(); band.type = "bandpass"; band.frequency.value = 700; band.Q.value = .6;
      this.crowdGain = this.ctx.createGain(); this.crowdGain.gain.value = level * .12;
      src.connect(band).connect(this.crowdGain).connect(this.master); src.start();
      this.crowdLevel = level;
    } catch {}
  }
  crowd(level: number, ramp = .4) {
    if (!this.ctx || !this.crowdGain) return;
    this.crowdLevel = level;
    try {this.crowdGain.gain.cancelScheduledValues(this.ctx.currentTime); this.crowdGain.gain.linearRampToValueAtTime(level * .12, this.ctx.currentTime + ramp)} catch {}
  }
  whistle(long = false) {this.tone(2600, long ? .55 : .22, .05, "sine", 1.02); this.tone(2900, long ? .55 : .22, .03, "sine", .99)}
  horn() {for (const [f, d] of [[155.6, 0], [196, 0], [233, 0]] as const) this.tone(f, 1.1, .06, "sawtooth", 1, d); this.noise(1.2, .08, 900)}
  kick(power = .6) {this.tone(140 + power * 80, .12, .07 + power * .04, "triangle", .35); this.noise(.06, .05, 3000)}
  swish() {this.noise(.35, .06, 5200, "highpass"); this.tone(880, .25, .02, "sine", 1.6)}
  clang() {this.tone(620, .35, .05, "square", .7); this.tone(1240, .2, .03, "triangle", .8)}
  beep(high = false) {this.tone(high ? 1320 : 880, .12, .04, "square")}
  setMusic(on: boolean, bass?: number[]) {
    if (bass) this.bass = bass;
    this.music = on;
    if (!on) {if (this.timer !== null) clearInterval(this.timer); this.timer = null; return}
    this.wake(); if (this.timer !== null) return;
    const arp = [220, 277.2, 329.6, 440, 329.6, 277.2, 246.9, 293.7];
    this.timer = window.setInterval(() => {
      if (!this.ctx || document.hidden) return;
      const k = this.step++;
      if (k % 4 === 0) this.tone(this.bass[(k >> 4) % 4], .38, .045, "sawtooth", .98);
      if (k % 2 === 0) this.tone(arp[(k >> 1) % 8] * ((k >> 5) % 2 ? 1.5 : 1), .14, .011, "triangle");
      if (k % 8 === 4) this.noise(.05, .025, 7000, "highpass");
      if (k % 8 === 0) this.tone(55, .1, .05, "sine", .5);
    }, 128);
  }
  close() {this.setMusic(false); try {void this.ctx?.close()} catch {} this.ctx = null; this.crowdGain = null}
}
