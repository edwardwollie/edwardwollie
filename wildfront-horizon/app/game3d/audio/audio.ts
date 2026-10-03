// Procedural WebAudio: no sample files. Wind, rain, birdsong, crickets and owls;
// footsteps by surface; rifle report with valley echoes; bolt and magazine
// clicks; impacts that arrive at the speed of sound; and synthesized animal
// voices (elk bugle, stag roar, buck grunt, boar grunt, bison bellow, ram bleat,
// alarm snorts) placed in 3D.

import * as THREE from "three";

type V = { master: number; effects: number; ambience: number; ui: number };

export class GameAudio {
  ctx: AudioContext | null = null;
  private master!: GainNode; private sfx!: GainNode; private amb!: GainNode; private uiBus!: GainNode;
  private noise!: AudioBuffer; private pink!: AudioBuffer;
  private wind?: { src: AudioBufferSourceNode; filt: BiquadFilterNode; gain: GainNode };
  private rain?: { src: AudioBufferSourceNode; filt: BiquadFilterNode; gain: GainNode };
  private crickets?: { osc: OscillatorNode; am: OscillatorNode; gain: GainNode };
  private water?: { src: AudioBufferSourceNode; filt: BiquadFilterNode; gain: GainNode };
  private birdT = 2; private owlT = 20;
  volumes: V = { master: 0.9, effects: 1, ambience: 0.8, ui: 0.7 };
  private night = 0; private day = 1; private listenerPos = new THREE.Vector3();

  /** Must be called from a user gesture. */
  init() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {}); return; }
    const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 4;
    comp.connect(this.master);
    this.sfx = ctx.createGain(); this.sfx.connect(comp);
    this.amb = ctx.createGain(); this.amb.connect(comp);
    this.uiBus = ctx.createGain(); this.uiBus.connect(comp);
    this.applyVolumes();
    const n = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, n, ctx.sampleRate);
    this.pink = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = this.noise.getChannelData(0), p = this.pink.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1; d[i] = w;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
    this.wind = this.loop(this.pink, "bandpass", 420, 0.0, this.amb);
    this.rain = this.loop(this.noise, "highpass", 1800, 0.0, this.amb);
    this.water = this.loop(this.pink, "lowpass", 700, 0.0, this.amb);
    const osc = ctx.createOscillator(); osc.frequency.value = 4400;
    const am = ctx.createOscillator(); am.frequency.value = 28;
    const amG = ctx.createGain(); amG.gain.value = 0.5;
    const cg = ctx.createGain(); cg.gain.value = 0.5;
    am.connect(amG); amG.connect(cg.gain);
    const outG = ctx.createGain(); outG.gain.value = 0;
    osc.connect(cg); cg.connect(outG); outG.connect(this.amb);
    osc.start(); am.start();
    this.crickets = { osc, am, gain: outG };
  }

  setVolumes(v: Partial<V>) { this.volumes = { ...this.volumes, ...v }; this.applyVolumes(); }
  private applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.sfx.gain.value = this.volumes.effects;
    this.amb.gain.value = this.volumes.ambience;
    this.uiBus.gain.value = this.volumes.ui;
  }
  suspend() { this.ctx?.suspend().catch(() => {}); }
  resume() { this.ctx?.resume().catch(() => {}); }

  private loop(buf: AudioBuffer, type: BiquadFilterType, f: number, g: number, out: AudioNode) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const filt = ctx.createBiquadFilter(); filt.type = type; filt.frequency.value = f; filt.Q.value = 0.7;
    const gain = ctx.createGain(); gain.gain.value = g;
    src.connect(filt); filt.connect(gain); gain.connect(out);
    src.start();
    return { src, filt, gain };
  }

  private t() { return this.ctx!.currentTime; }

  /** Positional output node at a world point (HRTF panner). */
  private at(x: number, y: number, z: number, ref = 12): AudioNode {
    const ctx = this.ctx!;
    const p = ctx.createPanner();
    p.panningModel = "HRTF"; p.distanceModel = "inverse"; p.refDistance = ref; p.rolloffFactor = 0.85; p.maxDistance = 4000;
    p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;
    p.connect(this.sfx);
    return p;
  }

  private burst(out: AudioNode, when: number, dur: number, type: BiquadFilterType, freq: number, q: number, gain: number, attack = 0.002, buf?: AudioBuffer) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource(); s.buffer = buf ?? this.noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(gain, when + attack); g.gain.exponentialRampToValueAtTime(0.0008, when + dur);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(when, Math.random() * 1.5); s.stop(when + dur + 0.05);
  }
  private tone(out: AudioNode, when: number, type: OscillatorType, f0: number, f1: number, dur: number, gain: number, attack = 0.01, filterF?: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, when); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), when + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(gain, when + attack); g.gain.exponentialRampToValueAtTime(0.0008, when + dur);
    let node: AudioNode = o;
    if (filterF) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = filterF; o.connect(f); node = f; }
    node.connect(g); g.connect(out);
    o.start(when); o.stop(when + dur + 0.05);
    return o;
  }

  // ------------------------------------------------------------ per-frame
  update(camera: THREE.Camera, env: { windSpeed: number; w: { rain: number; storm: number }; night: number; sunElev: number }, player: { wading: number; pos: THREE.Vector3 }) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    const p = camera.getWorldPosition(new THREE.Vector3());
    const f = camera.getWorldDirection(new THREE.Vector3());
    this.listenerPos.copy(p);
    if (L.positionX) { L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z; L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
    const now = this.t();
    const ws = env.windSpeed;
    this.wind?.gain.gain.setTargetAtTime(Math.min(0.55, 0.05 + ws * 0.045), now, 0.4);
    this.wind?.filt.frequency.setTargetAtTime(260 + ws * 70 + Math.sin(now * 0.4) * 60, now, 0.3);
    this.rain?.gain.gain.setTargetAtTime(env.w.rain * 0.22 + env.w.storm * 0.08, now, 0.8);
    this.water?.gain.gain.setTargetAtTime(player.wading > 0.05 ? 0.18 : 0, now, 0.3);
    this.night = env.night; this.day = 1 - env.night;
    this.crickets?.gain.gain.setTargetAtTime(this.night > 0.4 && env.w.rain < 0.3 ? 0.012 : 0, now, 1.5);
    // birdsong by day, owls at night
    const dt = 1 / 30;
    this.birdT -= dt; this.owlT -= dt;
    if (this.birdT <= 0) { this.birdT = 2 + Math.random() * 6; if (this.day > 0.5 && env.w.rain < 0.5 && ws < 9) this.bird(); }
    if (this.owlT <= 0) { this.owlT = 18 + Math.random() * 25; if (this.night > 0.6) this.owl(); }
  }

  private bird() {
    const a = Math.random() * Math.PI * 2, d = 25 + Math.random() * 70;
    const out = this.at(this.listenerPos.x + Math.cos(a) * d, this.listenerPos.y + 6 + Math.random() * 8, this.listenerPos.z + Math.sin(a) * d, 20);
    const t0 = this.t() + 0.05;
    const kind = Math.floor(Math.random() * 4);
    const notes = kind === 0 ? 5 : kind === 1 ? 3 : kind === 2 ? 8 : 2;
    let t = t0;
    for (let i = 0; i < notes; i++) {
      const base = kind === 0 ? 3200 : kind === 1 ? 2200 : kind === 2 ? 4200 : 1500;
      const f0 = base * (1 + (Math.random() - 0.5) * 0.25), f1 = f0 * (kind === 1 ? 0.7 : kind === 3 ? 1.6 : 1.25);
      const dur = kind === 2 ? 0.06 : kind === 3 ? 0.35 : 0.12;
      this.tone(out, t, "sine", f0, f1, dur, 0.06);
      t += dur + (kind === 2 ? 0.02 : 0.07);
    }
  }
  private owl() {
    const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 120;
    const out = this.at(this.listenerPos.x + Math.cos(a) * d, this.listenerPos.y + 10, this.listenerPos.z + Math.sin(a) * d, 30);
    const t = this.t() + 0.1;
    [0, 0.45, 0.75, 1.35].forEach((o, i) => this.tone(out, t + o, "sine", i === 2 ? 420 : 380, i === 2 ? 400 : 360, i === 3 ? 0.6 : 0.3, 0.12, 0.05));
  }

  // ------------------------------------------------------------ hunter
  footstep(surface: string, loud: number) {
    if (!this.ctx) return;
    const t = this.t();
    const g = 0.04 + loud * 0.11;
    if (surface === "water") { this.burst(this.sfx, t, 0.28, "lowpass", 900, 0.8, g * 1.4, 0.01); this.burst(this.sfx, t + 0.04, 0.2, "bandpass", 2400, 1.5, g * 0.6); return; }
    if (surface === "snow") { this.burst(this.sfx, t, 0.16, "bandpass", 1300, 2.5, g, 0.02); this.tone(this.sfx, t, "triangle", 900, 1200, 0.08, g * 0.12); return; }
    if (surface === "rock") { this.burst(this.sfx, t, 0.08, "highpass", 2500, 0.8, g * 0.9); return; }
    if (surface === "dirt" || surface === "sand") { this.burst(this.sfx, t, 0.12, "bandpass", 1800, 0.9, g); for (let i = 0; i < 3; i++) this.burst(this.sfx, t + 0.015 * i, 0.03, "highpass", 4000, 1, g * 0.4); return; }
    this.burst(this.sfx, t, 0.18, "bandpass", 2600, 0.6, g * 0.8, 0.02); // grass swish
  }

  shot(_rifle: string, recoil: number) {
    if (!this.ctx) return;
    const t = this.t();
    // supersonic crack + muzzle blast
    this.burst(this.sfx, t, 0.08, "highpass", 1800, 0.6, 1.0 * recoil, 0.001);
    this.burst(this.sfx, t, 0.6, "lowpass", 700, 0.5, 0.9 * recoil, 0.002);
    this.tone(this.sfx, t, "sine", 120, 38, 0.45, 0.8 * recoil, 0.002);
    // valley echoes, panned around
    const ctx = this.ctx;
    for (let i = 0; i < 4; i++) {
      const d = 0.55 + i * 0.6 + Math.random() * 0.4;
      const pan = ctx.createStereoPanner(); pan.pan.value = (Math.random() - 0.5) * 1.6; pan.connect(this.sfx);
      this.burst(pan, t + d, 1.1 + i * 0.4, "lowpass", 600 - i * 90, 0.4, 0.28 / (i + 1), 0.04);
    }
  }
  dryFire() { if (!this.ctx) return; this.burst(this.sfx, this.t(), 0.03, "highpass", 3000, 1, 0.25); }
  bolt() {
    if (!this.ctx) return;
    const t = this.t();
    [0, 0.12, 0.28, 0.4].forEach((o, i) => { this.burst(this.sfx, t + o, 0.05, "bandpass", i % 2 ? 2600 : 3800, 3, 0.18); this.tone(this.sfx, t + o, "square", 1800, 1600, 0.02, 0.02); });
  }
  reload(dur: number) {
    if (!this.ctx) return;
    const t = this.t();
    this.burst(this.sfx, t + 0.05, 0.05, "bandpass", 2400, 3, 0.2);
    for (let i = 0; i < 4; i++) this.burst(this.sfx, t + 0.2 + i * (dur - 0.4) / 4, 0.04, "bandpass", 3200, 4, 0.16);
    this.burst(this.sfx, t + dur - 0.1, 0.06, "bandpass", 2000, 3, 0.22);
  }
  impact(kind: string, x: number, y: number, z: number, delay: number) {
    if (!this.ctx) return;
    const t = this.t() + Math.min(delay, 3.5);
    const out = this.at(x, y, z, 30);
    if (kind === "flesh") { this.tone(out, t, "sine", 160, 60, 0.18, 0.9, 0.002); this.burst(out, t, 0.1, "lowpass", 900, 0.7, 0.6); return; }
    if (kind === "bark") { this.burst(out, t, 0.12, "bandpass", 900, 3, 0.7); this.tone(out, t, "triangle", 520, 380, 0.1, 0.25); return; }
    if (kind === "spark") { this.burst(out, t, 0.06, "highpass", 3000, 1, 0.6); this.tone(out, t + 0.02, "sine", 3400, 1300, 0.45, 0.12); return; }
    if (kind === "splash") { this.burst(out, t, 0.4, "lowpass", 1200, 0.7, 0.8); return; }
    this.burst(out, t, 0.18, "lowpass", 500, 0.8, 0.8); // dirt thud
  }
  hoof(x: number, y: number, z: number, loud: number) { if (!this.ctx) return; this.burst(this.at(x, y, z, 8), this.t(), 0.07, "lowpass", 380, 1, 0.25 * loud); }
  thunder(delay: number, strength: number) {
    if (!this.ctx) return;
    const t = this.t() + delay;
    this.burst(this.amb, t, 3.5 + strength * 2, "lowpass", 140, 0.6, 0.6 * strength + 0.15, 0.08, this.pink);
    this.burst(this.amb, t + 0.1, 0.6, "lowpass", 400, 0.8, 0.3 * strength, 0.01);
  }

  // ------------------------------------------------------------ voices
  /** Animal vocalisation at a world point. */
  animal(species: string, kind: "snort" | "stomp" | "bark" | "call", x: number, y: number, z: number) {
    if (!this.ctx) return;
    const out = this.at(x, y, z, 18);
    const t = this.t() + 0.02;
    if (kind === "stomp") { this.tone(out, t, "sine", 90, 45, 0.15, 0.5, 0.002); this.tone(out, t + 0.35, "sine", 90, 45, 0.15, 0.4, 0.002); return; }
    if (kind === "snort") { this.burst(out, t, 0.28, "bandpass", 1100, 1.2, 0.7, 0.01); if (species !== "Bison") this.burst(out, t + 0.33, 0.22, "bandpass", 1300, 1.2, 0.45, 0.01); return; }
    if (kind === "bark") { this.burst(out, t, 0.25, "bandpass", 600, 1.5, 0.7, 0.01); this.tone(out, t, "sawtooth", 160, 110, 0.22, 0.2, 0.01, 900); return; }
    this.voice(out, species, t);
  }
  /** The hunter's caller (close, not positional). */
  caller(species: string) { if (!this.ctx) return; this.voice(this.sfx, species, this.t() + 0.05, 0.7); }

  private voice(out: AudioNode, species: string, t: number, k = 1) {
    const ctx = this.ctx!;
    if (species === "Elk") {
      // bugle: growl → rising whistle with vibrato → chuckles
      this.tone(out, t, "sawtooth", 140, 220, 0.5, 0.18 * k, 0.05, 1200);
      const o = ctx.createOscillator(); o.type = "sine";
      o.frequency.setValueAtTime(700, t + 0.35); o.frequency.exponentialRampToValueAtTime(1750, t + 0.9); o.frequency.setValueAtTime(1750, t + 1.7); o.frequency.exponentialRampToValueAtTime(1200, t + 2.1);
      const vib = ctx.createOscillator(); vib.frequency.value = 6; const vg = ctx.createGain(); vg.gain.value = 22; vib.connect(vg); vg.connect(o.frequency);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t + 0.35); g.gain.linearRampToValueAtTime(0.28 * k, t + 0.6); g.gain.setValueAtTime(0.28 * k, t + 1.8); g.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
      o.connect(g); g.connect(out); o.start(t + 0.35); o.stop(t + 2.3); vib.start(t + 0.35); vib.stop(t + 2.3);
      for (let i = 0; i < 4; i++) this.tone(out, t + 2.3 + i * 0.22, "sawtooth", 180, 120, 0.15, 0.16 * k, 0.01, 900);
      return;
    }
    if (species === "Red Deer") { for (let i = 0; i < 3; i++) this.tone(out, t + i * 0.9, "sawtooth", 115, 82, 0.75, 0.32 * k, 0.08, 520); return; }
    if (species === "Mule Deer") { for (let i = 0; i < 3; i++) this.tone(out, t + i * 0.32, "sawtooth", 95, 80, 0.2, 0.28 * k, 0.02, 600); return; }
    if (species === "Wild Boar") { for (let i = 0; i < 4; i++) { this.tone(out, t + i * 0.25, "sawtooth", 110, 85, 0.16, 0.22 * k, 0.01, 700); this.burst(out, t + i * 0.25, 0.14, "bandpass", 500, 2, 0.25 * k); } return; }
    if (species === "Bison") { this.tone(out, t, "sawtooth", 78, 62, 1.6, 0.4 * k, 0.15, 380); this.tone(out, t, "sawtooth", 117, 94, 1.6, 0.15 * k, 0.15, 500); return; }
    if (species === "Bighorn Sheep") {
      const o = this.tone(out, t, "sawtooth", 310, 280, 0.7, 0.2 * k, 0.04, 1600);
      const vib = ctx.createOscillator(); vib.frequency.value = 9; const vg = ctx.createGain(); vg.gain.value = 18; vib.connect(vg); vg.connect(o.frequency); vib.start(t); vib.stop(t + 0.75);
      return;
    }
    this.tone(out, t, "sawtooth", 140, 100, 0.4, 0.2 * k, 0.02, 800);
  }

  ui(kind: "zoom" | "scan" | "spot" | "tag" | "inspect" | "bino" | "loaded" | "click" | "complete" | "select" | "back" | "buy" | "achievement" | "error" | "page" | (string & {})) {
    if (!this.ctx) return;
    const t = this.t();
    const out = this.uiBus;
    switch (kind) {
      case "zoom": this.burst(out, t, 0.03, "bandpass", 3500, 4, 0.12); break;
      case "scan": this.tone(out, t, "sine", 880, 1320, 0.35, 0.12, 0.02); this.tone(out, t + 0.12, "sine", 1320, 1760, 0.3, 0.08, 0.02); break;
      case "spot": this.tone(out, t, "sine", 1500, 1500, 0.08, 0.06); break;
      case "tag": [0, 0.1, 0.2].forEach((o, i) => this.tone(out, t + o, "triangle", [660, 880, 1320][i], [660, 880, 1320][i], 0.4, 0.12)); break;
      case "inspect": this.tone(out, t, "sine", 700, 900, 0.08, 0.06); break;
      case "bino": this.burst(out, t, 0.06, "bandpass", 1200, 2, 0.08); break;
      case "loaded": this.burst(out, t, 0.05, "bandpass", 2800, 4, 0.12); break;
      case "click": this.tone(out, t, "sine", 1200, 1000, 0.05, 0.05); break;
      case "complete": [0, 0.15, 0.3, 0.5].forEach((o, i) => this.tone(out, t + o, "triangle", [523, 659, 784, 1046][i], [523, 659, 784, 1046][i], 0.6, 0.12)); break;
      case "select": this.tone(out, t, "sine", 980, 1180, 0.06, 0.05); break;
      case "back": this.tone(out, t, "sine", 900, 640, 0.07, 0.05); break;
      case "buy": [0, 0.07].forEach((o, i) => this.tone(out, t + o, "triangle", [1046, 1568][i], [1046, 1568][i], 0.25, 0.1)); break;
      case "achievement": [0, 0.1, 0.2, 0.34].forEach((o, i) => this.tone(out, t + o, "triangle", [784, 988, 1175, 1568][i], [784, 988, 1175, 1568][i], 0.5, 0.1)); break;
      case "error": this.tone(out, t, "square", 180, 150, 0.16, 0.05); break;
      case "page": this.burst(out, t, 0.12, "highpass", 2400, 0.7, 0.06); break;
    }
  }

  dispose() { this.ctx?.close().catch(() => {}); this.ctx = null; }
}
