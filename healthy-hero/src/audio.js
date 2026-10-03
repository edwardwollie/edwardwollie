// Synthesized sound — no audio files to download. Soft, kid-friendly effects plus a gentle
// pentatonic music loop that ducks while narration speaks.
let ctx = null, master = null, sfxBus = null, musicBus = null, duckGain = null;
let musicOn = true, sfxOn = true, musicTimer = null, nextNoteTime = 0, step = 0, intensity = 0;
let noiseBuffer = null;

const CHORDS = [
  [48, 55, 60, 64, 67], // C
  [45, 52, 57, 60, 64], // Am
  [41, 48, 53, 57, 60], // F
  [43, 50, 55, 59, 62]  // G
];
const PENTA = [0, 2, 4, 7, 9];
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return ctx; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 4;
  master = ctx.createGain(); master.gain.value = 0.85;
  sfxBus = ctx.createGain(); sfxBus.gain.value = sfxOn ? 0.8 : 0;
  musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? 0.5 : 0;
  duckGain = ctx.createGain(); duckGain.gain.value = 1;
  musicBus.connect(duckGain); duckGain.connect(master);
  sfxBus.connect(master); master.connect(comp); comp.connect(ctx.destination);
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuffer.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

export function setMusic(on) {
  musicOn = !!on;
  if (musicBus) musicBus.gain.setTargetAtTime(musicOn ? 0.5 : 0, ctx.currentTime, 0.2);
  if (musicOn) startMusic(); else stopMusic();
}
export function setSfx(on) { sfxOn = !!on; if (sfxBus) sfxBus.gain.setTargetAtTime(sfxOn ? 0.8 : 0, ctx.currentTime, 0.05); }
export function setMusicIntensity(v) { intensity = v; }
export function duck(active) { if (duckGain) duckGain.gain.setTargetAtTime(active ? 0.32 : 1, ctx.currentTime, 0.25); }

function env(g, t, a, peak, d) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function tone(freq, { type = 'sine', t = 0, a = 0.008, d = 0.25, vol = 0.25, bus = sfxBus, glide = null, detune = 0 } = {}) {
  if (!ctx) return;
  const now = ctx.currentTime + t;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, now); o.detune.value = detune;
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, now + a + d);
  env(g, now, a, vol, d);
  o.connect(g); g.connect(bus);
  o.start(now); o.stop(now + a + d + 0.05);
}
function noise({ t = 0, d = 0.3, vol = 0.2, from = 800, to = 3000, q = 0.8, type = 'bandpass' } = {}) {
  if (!ctx) return;
  const now = ctx.currentTime + t;
  const s = ctx.createBufferSource(); s.buffer = noiseBuffer;
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(from, now); f.frequency.exponentialRampToValueAtTime(to, now + d);
  const g = ctx.createGain(); env(g, now, 0.02, vol, d);
  s.connect(f); f.connect(g); g.connect(sfxBus);
  s.start(now); s.stop(now + d + 0.1);
}

export const sfx = {
  tap() { tone(880, { type: 'sine', d: 0.06, vol: 0.12 }); },
  lane(i = 1) { tone([523, 659, 784][i] || 659, { type: 'triangle', d: 0.12, vol: 0.18 }); tone(([523, 659, 784][i] || 659) * 2, { type: 'sine', d: 0.08, vol: 0.05, t: 0.01 }); },
  unlock() { noise({ d: 0.45, vol: 0.12, from: 400, to: 2600 }); tone(330, { type: 'sine', d: 0.4, vol: 0.12, glide: 880 }); },
  dash() { noise({ d: 0.35, vol: 0.2, from: 2400, to: 500, type: 'lowpass', q: 0.6 }); tone(220, { type: 'triangle', d: 0.25, vol: 0.08, glide: 440 }); },
  correct() {
    [72, 76, 79, 84].forEach((n, i) => { tone(midi(n), { type: 'triangle', t: i * 0.075, d: 0.28, vol: 0.2 }); tone(midi(n + 12), { type: 'sine', t: i * 0.075, d: 0.2, vol: 0.06 }); });
    noise({ t: 0.05, d: 0.5, vol: 0.06, from: 5000, to: 9000, q: 2 });
  },
  wrong() { tone(330, { type: 'sine', d: 0.38, vol: 0.18, glide: 170 }); tone(250, { type: 'triangle', t: 0.08, d: 0.3, vol: 0.08, glide: 140 }); },
  star(i = 0) { const n = [79, 83, 86][i] || 86; tone(midi(n), { type: 'sine', d: 0.6, vol: 0.18 }); tone(midi(n + 12), { type: 'sine', d: 0.5, vol: 0.06, t: 0.01 }); },
  fanfare() { [[60, 64, 67], [65, 69, 72], [67, 71, 74], [72, 76, 79]].forEach((ch, i) => ch.forEach((n) => tone(midi(n), { type: 'triangle', t: i * 0.16, d: i === 3 ? 0.9 : 0.2, vol: 0.12 }))); },
  whoosh() { noise({ d: 0.9, vol: 0.09, from: 300, to: 4000, q: 0.5 }); },
  pop() { tone(620, { type: 'sine', d: 0.08, vol: 0.14, glide: 980 }); },
  breatheIn() { tone(392, { type: 'sine', a: 1.2, d: 2.6, vol: 0.06 }); },
  breatheOut() { tone(330, { type: 'sine', a: 0.5, d: 3.2, vol: 0.05 }); }
};

// --- Music ------------------------------------------------------------------------------
function scheduleNote(time) {
  const bar = Math.floor(step / 8) % 8;
  const chord = CHORDS[Math.floor(bar / 2) % 4];
  const beat = step % 8;
  if (beat === 0) {
    // Soft pad
    for (const n of chord.slice(0, 3)) {
      const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = 'triangle'; o.frequency.value = midi(n); o.detune.value = (Math.random() - 0.5) * 8;
      f.type = 'lowpass'; f.frequency.value = 900;
      g.gain.setValueAtTime(0.0001, time); g.gain.exponentialRampToValueAtTime(0.045, time + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, time + 2.4);
      o.connect(f); f.connect(g); g.connect(musicBus); o.start(time); o.stop(time + 2.5);
    }
  }
  // Arpeggio pluck
  const root = chord[0] + 24;
  const pick = (step * 3 + bar) % PENTA.length;
  if (beat % 2 === 0 || Math.random() < 0.35) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = midi(root - 12 + PENTA[pick] + (beat > 4 ? 12 : 0));
    g.gain.setValueAtTime(0.0001, time); g.gain.exponentialRampToValueAtTime(0.05, time + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, time + 0.35);
    o.connect(g); g.connect(musicBus); o.start(time); o.stop(time + 0.4);
  }
  if (intensity > 0) {
    if (beat === 0 || beat === 4) { // soft kick
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(120, time); o.frequency.exponentialRampToValueAtTime(48, time + 0.18);
      g.gain.setValueAtTime(0.0001, time); g.gain.exponentialRampToValueAtTime(0.12, time + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
      o.connect(g); g.connect(musicBus); o.start(time); o.stop(time + 0.25);
    }
    if (beat % 2 === 1) { // shaker
      const s = ctx.createBufferSource(); s.buffer = noiseBuffer;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, time); g.gain.exponentialRampToValueAtTime(0.025, time + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
      s.connect(f); f.connect(g); g.connect(musicBus); s.start(time); s.stop(time + 0.08);
    }
  }
}

function startMusic() {
  if (!ctx || musicTimer || !musicOn) return;
  nextNoteTime = ctx.currentTime + 0.1;
  const spb = 60 / 96 / 2; // eighth notes at 96 bpm
  musicTimer = setInterval(() => {
    if (!ctx || ctx.state !== 'running') return;
    while (nextNoteTime < ctx.currentTime + 0.35) { scheduleNote(nextNoteTime); nextNoteTime += spb; step++; }
  }, 90);
}
function stopMusic() { clearInterval(musicTimer); musicTimer = null; }
export function resumeMusic() { if (musicOn) startMusic(); }
export function pauseAudio() { stopMusic(); if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); }
export function resumeAudio() { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); resumeMusic(); }
