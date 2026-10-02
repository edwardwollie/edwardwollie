/**
 * Procedural sound for Dino Frontier — every effect is synthesised with Web Audio,
 * so the game ships no audio files. One AudioContext is shared across missions.
 */
let shared: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!shared) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    shared = new Ctor();
  }
  if (shared.state === "suspended") shared.resume().catch(() => {});
  return shared;
}

export class FrontierAudio {
  ctx: AudioContext | null;
  master: GainNode | null = null;
  music: GainNode | null = null;
  noise: AudioBuffer | null = null;
  ambience: { stop(): void } | null = null;
  heartbeat = 0;
  last: Record<string, number> = {};

  constructor(volume: number) {
    this.ctx = context();
    if (!this.ctx) return;
    this.master = this.ctx.createGain();
    this.master.gain.value = volume;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(this.ctx.destination);
    this.music = this.ctx.createGain();
    this.music.gain.value = 0.32;
    this.music.connect(this.master);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setVolume(v: number) {
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  /** Rate-limit identical sounds so 12 dinosaurs dying at once doesn't clip. */
  private gate(name: string, gap: number) {
    if (!this.ctx) return false;
    const t = this.ctx.currentTime;
    if ((this.last[name] ?? -1) + gap > t) return false;
    this.last[name] = t;
    return true;
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, delay = 0, dest?: AudioNode) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest ?? this.master!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private hiss(dur: number, gain: number, f0: number, f1: number, q = 1, delay = 0, type: BiquadFilterType = "bandpass") {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noise;
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  shot() { if (!this.gate("shot", 0.05)) return; this.tone("square", 1250, 180, 0.11, 0.12); this.tone("sine", 2400, 600, 0.06, 0.06); this.hiss(0.06, 0.08, 4000, 1500, 1.5); }
  droneShot() { if (!this.gate("drone", 0.07)) return; this.tone("triangle", 1900, 900, 0.07, 0.05); }
  hit() { if (!this.gate("hit", 0.04)) return; this.hiss(0.08, 0.14, 1800, 500, 2); this.tone("sine", 320, 140, 0.07, 0.08); }
  kill(big = false) { if (!this.gate("kill", 0.06)) return; this.hiss(big ? 0.9 : 0.35, big ? 0.5 : 0.28, 900, 80, 0.8); this.tone("sawtooth", big ? 160 : 260, 40, big ? 0.8 : 0.3, 0.16); this.tone("sine", 880, 1760, 0.12, 0.05, 0.05); }
  pickup() { if (!this.gate("pickup", 0.05)) return; this.tone("sine", 880, 880, 0.09, 0.12); this.tone("sine", 1320, 1320, 0.14, 0.1, 0.07); this.tone("sine", 1760, 1760, 0.16, 0.07, 0.13); }
  heal() { this.tone("sine", 520, 1040, 0.35, 0.12); this.tone("triangle", 780, 1560, 0.4, 0.06, 0.08); }
  dash() { this.hiss(0.32, 0.25, 600, 3800, 0.7); this.tone("sine", 200, 520, 0.25, 0.08); }
  jump() { this.tone("sine", 240, 520, 0.16, 0.08); this.hiss(0.12, 0.08, 1400, 2600, 1); }
  land() { if (!this.gate("land", 0.2)) return; this.hiss(0.12, 0.12, 400, 120, 1, 0, "lowpass"); }
  hurt() { if (!this.gate("hurt", 0.12)) return; this.tone("sawtooth", 140, 60, 0.25, 0.22); this.hiss(0.2, 0.2, 700, 200, 1); }
  emp() { this.tone("sawtooth", 60, 900, 0.5, 0.25); this.tone("sine", 1800, 90, 1.1, 0.25, 0.1); this.hiss(1.2, 0.45, 5000, 120, 0.6); }
  spit() { if (!this.gate("spit", 0.15)) return; this.hiss(0.25, 0.18, 2500, 700, 3); this.tone("sine", 600, 200, 0.2, 0.06); }
  splash() { if (!this.gate("splash", 0.1)) return; this.hiss(0.3, 0.14, 1200, 300, 1.2); }
  windup() { if (!this.gate("windup", 0.25)) return; this.tone("sawtooth", 90, 180, 0.5, 0.08); }
  stomp() { this.tone("sine", 70, 28, 0.9, 0.55); this.hiss(0.8, 0.4, 300, 40, 0.7, 0, "lowpass"); }
  zap() { if (!this.gate("zap", 0.12)) return; this.hiss(0.18, 0.1, 6000, 2000, 4); this.tone("square", 2200, 700, 0.12, 0.04); }
  thunder() { this.hiss(2.4, 0.5, 200, 30, 0.5, 0, "lowpass"); this.hiss(0.25, 0.3, 3000, 400, 0.6); }
  roar(big = true) {
    if (!this.ctx || !this.gate("roar", 0.8)) return;
    const ctx = this.ctx, t = ctx.currentTime, dur = big ? 1.6 : 0.6;
    const o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = "sawtooth"; o.frequency.setValueAtTime(big ? 95 : 210, t); o.frequency.linearRampToValueAtTime(big ? 62 : 150, t + dur);
    lfo.frequency.value = big ? 23 : 31; lg.gain.value = big ? 18 : 30;
    lfo.connect(lg).connect(o.frequency);
    f.type = "lowpass"; f.frequency.setValueAtTime(big ? 900 : 1600, t); f.frequency.linearRampToValueAtTime(big ? 300 : 700, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(big ? 0.5 : 0.18, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.master!);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.1); lfo.stop(t + dur + 0.1);
    this.hiss(dur, big ? 0.3 : 0.1, 1200, 250, 0.8);
  }
  /** Low heartbeat when the ranger is badly hurt. */
  pulse(dt: number, danger: boolean) {
    if (!this.ctx || !danger) { this.heartbeat = 0; return; }
    this.heartbeat -= dt;
    if (this.heartbeat <= 0) { this.heartbeat = 0.85; this.tone("sine", 62, 40, 0.16, 0.35); this.tone("sine", 58, 38, 0.14, 0.25, 0.2); }
  }

  /** Slow evolving pad: two detuned saws through a breathing low-pass, chord changes every 8 s. */
  startAmbience(root: number) {
    if (!this.ctx || !this.music || this.ambience) return;
    const ctx = this.ctx, out = this.music;
    const f = ctx.createBiquadFilter(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    f.type = "lowpass"; f.frequency.value = 520; f.Q.value = 3;
    lfo.frequency.value = 0.07; lg.gain.value = 340; lfo.connect(lg).connect(f.frequency); lfo.start();
    f.connect(out);
    const chords = [[0, 7, 15], [-2, 5, 12], [-4, 3, 10], [-5, 2, 9]];
    const voices = [0, 1, 2].map(() => {
      const g = ctx.createGain(); g.gain.value = 0.05; g.connect(f);
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
      o1.type = "sawtooth"; o2.type = "sawtooth"; o2.detune.value = 9;
      o1.connect(g); o2.connect(g); o1.start(); o2.start();
      return { o1, o2, g };
    });
    const sub = ctx.createOscillator(), sg = ctx.createGain();
    sub.type = "sine"; sg.gain.value = 0.09; sub.connect(sg).connect(out); sub.start();
    let step = 0;
    const play = () => {
      const c = chords[step++ % chords.length], t = ctx.currentTime;
      voices.forEach((v, i) => {
        const hz = root * Math.pow(2, c[i] / 12);
        v.o1.frequency.setTargetAtTime(hz, t, 0.8);
        v.o2.frequency.setTargetAtTime(hz, t, 0.8);
      });
      sub.frequency.setTargetAtTime(root / 2 * Math.pow(2, c[0] / 12), t, 0.6);
    };
    play();
    const timer = window.setInterval(play, 8000);
    out.gain.setValueAtTime(0.0001, ctx.currentTime);
    out.gain.exponentialRampToValueAtTime(0.32, ctx.currentTime + 3);
    this.ambience = {
      stop: () => {
        window.clearInterval(timer);
        const t = ctx.currentTime;
        out.gain.setTargetAtTime(0.0001, t, 0.3);
        const all = [lfo, sub, ...voices.flatMap(v => [v.o1, v.o2])];
        all.forEach(o => { try { o.stop(t + 1.5); } catch { /* already stopped */ } });
      },
    };
  }

  /** Raise the music bed during boss fights. */
  tension(on: boolean) {
    if (this.music && this.ctx) this.music.gain.setTargetAtTime(on ? 0.5 : 0.32, this.ctx.currentTime, 1);
  }

  dispose() {
    this.ambience?.stop();
    this.ambience = null;
    const m = this.master;
    if (m && this.ctx) { m.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.2); window.setTimeout(() => m.disconnect(), 2000); }
  }
}
