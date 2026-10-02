const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class SynthAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.last = new Map();
    this.ambience = null;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (this.master) {
      this.master.gain.setTargetAtTime(this.enabled ? 0.38 : 0, this.ctx.currentTime, 0.035);
    }
  }

  unlock() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.38 : 0;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  }

  throttle(name, gap = 0.04) {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    if (now - (this.last.get(name) || -99) < gap) return false;
    this.last.set(name, now);
    return true;
  }

  tone({ frequency = 440, endFrequency = frequency, duration = 0.12, gain = 0.12, type = "sine", delay = 0 }) {
    if (!this.enabled) return;
    this.unlock();
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime + delay;
    const oscillator = this.ctx.createOscillator();
    const envelope = this.ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(20, frequency), now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(clamp(gain, 0.0001, 0.5), now + Math.min(0.018, duration * 0.22));
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.025);
  }

  noise({ duration = 0.12, gain = 0.07, frequency = 1200, delay = 0 }) {
    if (!this.enabled) return;
    this.unlock();
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime + delay;
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / length);
    }
    const source = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const envelope = this.ctx.createGain();
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = 1.2;
    envelope.gain.setValueAtTime(Math.max(0.0001, gain), now);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.buffer = buffer;
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.master);
    source.start(now);
  }

  shoot(friendly = true) {
    if (!this.throttle(friendly ? "friendlyShot" : "enemyShot", friendly ? 0.045 : 0.065)) return;
    this.tone({
      frequency: friendly ? 880 : 310,
      endFrequency: friendly ? 340 : 145,
      duration: friendly ? 0.075 : 0.11,
      gain: friendly ? 0.045 : 0.035,
      type: friendly ? "sawtooth" : "square"
    });
  }

  hit(heavy = false) {
    if (!this.throttle(heavy ? "heavyHit" : "hit", heavy ? 0.08 : 0.035)) return;
    this.noise({ duration: heavy ? 0.15 : 0.07, gain: heavy ? 0.12 : 0.045, frequency: heavy ? 320 : 900 });
    if (heavy) this.tone({ frequency: 130, endFrequency: 55, duration: 0.18, gain: 0.11, type: "sine" });
  }

  pickup() {
    if (!this.throttle("pickup", 0.08)) return;
    this.tone({ frequency: 740, endFrequency: 1180, duration: 0.09, gain: 0.07, type: "triangle" });
    this.tone({ frequency: 990, endFrequency: 1420, duration: 0.1, gain: 0.045, type: "sine", delay: 0.055 });
  }

  gate(positive = true) {
    const notes = positive ? [392, 523, 659] : [260, 196, 130];
    notes.forEach((frequency, index) => {
      this.tone({
        frequency,
        endFrequency: positive ? frequency * 1.22 : frequency * 0.78,
        duration: 0.19,
        gain: 0.07,
        type: positive ? "triangle" : "sawtooth",
        delay: index * 0.07
      });
    });
  }

  nova() {
    if (!this.throttle("nova", 0.3)) return;
    this.tone({ frequency: 82, endFrequency: 34, duration: 0.62, gain: 0.22, type: "sine" });
    this.tone({ frequency: 350, endFrequency: 1450, duration: 0.44, gain: 0.09, type: "sawtooth" });
    this.noise({ duration: 0.55, gain: 0.13, frequency: 480 });
  }

  alert() {
    this.tone({ frequency: 230, endFrequency: 180, duration: 0.18, gain: 0.08, type: "square" });
    this.tone({ frequency: 230, endFrequency: 180, duration: 0.18, gain: 0.08, type: "square", delay: 0.25 });
  }

  victory() {
    [392, 523, 659, 784].forEach((frequency, index) => {
      this.tone({ frequency, endFrequency: frequency * 1.03, duration: 0.34, gain: 0.08, type: "triangle", delay: index * 0.11 });
    });
  }

  defeat() {
    [330, 247, 165].forEach((frequency, index) => {
      this.tone({ frequency, endFrequency: frequency * 0.74, duration: 0.42, gain: 0.075, type: "sawtooth", delay: index * 0.14 });
    });
  }

  startAmbience() {
    if (!this.enabled) return;
    this.unlock();
    if (!this.ctx || this.ambience) return;
    const gain = this.ctx.createGain();
    const low = this.ctx.createOscillator();
    const high = this.ctx.createOscillator();
    gain.gain.value = 0.017;
    low.type = "sine";
    high.type = "triangle";
    low.frequency.value = 54;
    high.frequency.value = 108;
    low.connect(gain);
    high.connect(gain);
    gain.connect(this.master);
    low.start();
    high.start();
    this.ambience = { low, high, gain };
  }

  stopAmbience() {
    if (!this.ambience) return;
    const now = this.ctx.currentTime;
    this.ambience.gain.gain.setTargetAtTime(0.0001, now, 0.08);
    this.ambience.low.stop(now + 0.5);
    this.ambience.high.stop(now + 0.5);
    this.ambience = null;
  }
}
