/**
 * Synthesised sound effects and a gentle generative soundtrack (no audio files).
 */
export type Sfx =
  | "tap" | "select" | "correct" | "wrong" | "boost" | "beep" | "liftoff" | "build" | "unbuild" | "star"
  | "win" | "fanfare" | "chute" | "dock" | "land" | "shutter" | "scan" | "error" | "whoosh" | "stage" | "badge";

export type Mood = "hub" | "space" | "build" | "tension" | "calm" | "none";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let noise: AudioBuffer | null = null;
let sfxOn = true;
let musicOn = true;
let mood: Mood = "none";
let musicTimer = 0;
let step = 0;
const loops = new Map<string, { source: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode }>();

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.ratio.value = 4;
  master = ctx.createGain();
  master.gain.value = 0.9;
  sfxBus = ctx.createGain();
  sfxBus.gain.value = sfxOn ? 0.8 : 0;
  musicBus = ctx.createGain();
  musicBus.gain.value = musicOn ? 0.32 : 0;
  sfxBus.connect(master);
  musicBus.connect(master);
  master.connect(compressor).connect(ctx.destination);
  const length = ctx.sampleRate * 2;
  noise = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return ctx;
}

/** Must be called from a user gesture (iOS/Safari audio unlock). */
export function unlockAudio() {
  const c = ensure();
  if (c && c.state === "suspended") void c.resume();
}

export function setSoundEnabled(on: boolean) {
  sfxOn = on;
  if (sfxBus && ctx) sfxBus.gain.setTargetAtTime(on ? 0.8 : 0, ctx.currentTime, 0.05);
}

export function setMusicEnabled(on: boolean) {
  musicOn = on;
  if (musicBus && ctx) musicBus.gain.setTargetAtTime(on ? 0.32 : 0, ctx.currentTime, 0.2);
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.12, bus = sfxBus, glideTo?: number) {
  if (!ctx || !bus) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(bus);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

function noiseBurst(start: number, dur: number, gain: number, type: BiquadFilterType, freq: number, freqTo?: number, q = 1) {
  if (!ctx || !sfxBus || !noise) return;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, start);
  if (freqTo) filter.frequency.exponentialRampToValueAtTime(freqTo, start + dur);
  filter.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + Math.min(0.05, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(filter).connect(g).connect(sfxBus);
  src.start(start, Math.random() * 1.2);
  src.stop(start + dur + 0.05);
}

export function sfx(kind: Sfx) {
  const c = ensure();
  if (!c || !sfxOn) return;
  const t = c.currentTime + 0.005;
  switch (kind) {
    case "tap": tone(660, t, 0.08, "sine", 0.08); break;
    case "select": tone(260, t, 0.11, "triangle", 0.1); tone(390, t + 0.04, 0.08, "sine", 0.05); break;
    case "correct": [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.07, 0.28, "triangle", 0.11)); noiseBurst(t + 0.2, 0.4, 0.05, "highpass", 6000); break;
    case "wrong": tone(150, t, 0.25, "sine", 0.16, sfxBus, 90); noiseBurst(t, 0.22, 0.08, "lowpass", 900); break;
    case "boost": noiseBurst(t, 0.7, 0.16, "bandpass", 300, 2400, 1.4); tone(180, t, 0.5, "sawtooth", 0.03, sfxBus, 420); break;
    case "beep": tone(880, t, 0.14, "square", 0.05); break;
    case "liftoff": noiseBurst(t, 3.6, 0.32, "lowpass", 220, 900, 0.7); tone(55, t, 3.0, "sawtooth", 0.05, sfxBus, 40); break;
    case "build": tone(390, t, 0.09, "square", 0.06); noiseBurst(t, 0.08, 0.12, "highpass", 2500); tone(780, t + 0.06, 0.12, "sine", 0.06); break;
    case "unbuild": tone(520, t, 0.1, "triangle", 0.06, sfxBus, 260); break;
    case "star": tone(1320, t, 0.18, "sine", 0.08); tone(1760, t + 0.06, 0.22, "sine", 0.07); break;
    case "win": [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.09, 0.35, "triangle", 0.1)); break;
    case "fanfare": [523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.12, 0.3, "square", 0.045)); [262, 330, 392].forEach((f) => tone(f, t + 0.72, 0.9, "triangle", 0.06)); break;
    case "chute": noiseBurst(t, 0.18, 0.2, "bandpass", 1200, 300); noiseBurst(t + 0.1, 1.0, 0.05, "lowpass", 600); break;
    case "dock": tone(120, t, 0.2, "square", 0.1); noiseBurst(t + 0.05, 0.6, 0.06, "highpass", 3000, 1500); tone(660, t + 0.35, 0.3, "sine", 0.06); break;
    case "land": tone(90, t, 0.3, "sine", 0.18, sfxBus, 50); noiseBurst(t, 0.35, 0.12, "lowpass", 500); break;
    case "shutter": noiseBurst(t, 0.05, 0.2, "highpass", 3000); noiseBurst(t + 0.07, 0.06, 0.15, "highpass", 2500); break;
    case "scan": tone(500, t, 0.5, "sine", 0.05, sfxBus, 1500); break;
    case "error": tone(330, t, 0.14, "triangle", 0.08); tone(247, t + 0.13, 0.2, "triangle", 0.08); break;
    case "whoosh": noiseBurst(t, 0.5, 0.08, "bandpass", 600, 3000, 0.8); break;
    case "stage": tone(140, t, 0.15, "square", 0.08); noiseBurst(t, 0.4, 0.12, "lowpass", 1500, 300); break;
    case "badge": [784, 988, 1175, 1568].forEach((f, i) => tone(f, t + i * 0.08, 0.4, "sine", 0.08)); break;
  }
}

/** Continuous sounds (engine roar, thrusters). Returns a setter for intensity 0..1. */
export function loop(name: "engine" | "thruster" | "wind", intensity: number) {
  const c = ensure();
  if (!c || !sfxBus || !noise) return;
  let entry = loops.get(name);
  if (!entry) {
    const source = c.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = name === "thruster" ? "bandpass" : "lowpass";
    filter.frequency.value = name === "engine" ? 380 : name === "wind" ? 800 : 1400;
    filter.Q.value = 0.8;
    const gain = c.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(sfxBus);
    source.start();
    entry = { source, gain, filter };
    loops.set(name, entry);
  }
  const level = sfxOn ? Math.max(0, Math.min(1, intensity)) : 0;
  const peak = name === "engine" ? 0.3 : name === "wind" ? 0.06 : 0.12;
  entry.gain.gain.setTargetAtTime(level * peak, c.currentTime, 0.08);
  if (name === "engine") entry.filter.frequency.setTargetAtTime(200 + level * 500, c.currentTime, 0.1);
}

export function stopLoops() {
  if (!ctx) return;
  for (const entry of loops.values()) entry.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
}

// ---------------------------------------------------------------- music

const SCALES: Record<Exclude<Mood, "none">, { chords: number[][]; arp: number[]; tempo: number; wave: OscillatorType }> = {
  hub: { chords: [[261.6, 329.6, 392], [220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7]], arp: [523, 587, 659, 784, 880], tempo: 0.42, wave: "triangle" },
  space: { chords: [[220, 329.6, 493.9], [196, 293.7, 440], [174.6, 261.6, 392], [196, 293.7, 392]], arp: [440, 493.9, 587, 659, 880], tempo: 0.55, wave: "sine" },
  build: { chords: [[293.7, 370, 440], [329.6, 415.3, 493.9], [246.9, 311.1, 370], [277.2, 349.2, 415.3]], arp: [587, 659, 740, 880, 988], tempo: 0.36, wave: "triangle" },
  tension: { chords: [[220, 261.6, 329.6], [207.7, 261.6, 311.1], [196, 233.1, 293.7], [207.7, 246.9, 311.1]], arp: [440, 523, 622, 659], tempo: 0.32, wave: "sawtooth" },
  calm: { chords: [[261.6, 392, 493.9], [220, 329.6, 440], [246.9, 370, 440], [196, 293.7, 392]], arp: [523, 659, 784, 988], tempo: 0.7, wave: "sine" },
};

export function setMood(next: Mood) {
  if (next === mood) return;
  mood = next;
  step = 0;
  window.clearInterval(musicTimer);
  if (next === "none") return;
  const scale = SCALES[next];
  musicTimer = window.setInterval(() => {
    const c = ctx;
    if (!c || !musicBus || !musicOn || c.state !== "running") return;
    const t = c.currentTime + 0.02;
    if (step % 8 === 0) {
      const chord = scale.chords[(step / 8) % scale.chords.length];
      for (const f of chord) tone(f / 2, t, scale.tempo * 8.2, scale.wave === "sawtooth" ? "triangle" : scale.wave, 0.035, musicBus);
    }
    if (step % 2 === 0 || Math.random() < 0.25) {
      const f = scale.arp[Math.floor(Math.random() * scale.arp.length)];
      tone(f, t, scale.tempo * 1.6, "sine", 0.02 + Math.random() * 0.015, musicBus);
    }
    step++;
  }, scale.tempo * 1000);
}
