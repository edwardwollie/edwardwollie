export class HypernovaAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineOscillator: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private muted = false;

  async activate(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.42;
      this.master.connect(this.context.destination);

      this.engineOscillator = this.context.createOscillator();
      this.engineGain = this.context.createGain();
      this.engineOscillator.type = "sawtooth";
      this.engineOscillator.frequency.value = 48;
      this.engineGain.gain.value = 0.018;
      this.engineOscillator.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOscillator.start();
    }
    if (this.context.state === "suspended") await this.context.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(
        muted ? 0 : 0.42,
        this.context.currentTime,
        0.025,
      );
    }
  }

  setSpeed(speed: number, boosting: boolean): void {
    if (!this.context || !this.engineOscillator || !this.engineGain) return;
    const now = this.context.currentTime;
    this.engineOscillator.frequency.setTargetAtTime(
      42 + speed * 0.42 + (boosting ? 22 : 0),
      now,
      0.06,
    );
    this.engineGain.gain.setTargetAtTime(boosting ? 0.035 : 0.018, now, 0.08);
  }

  coin(combo: number): void {
    this.tone(620 + combo * 95, 0.08, "sine", 0.15);
    window.setTimeout(
      () => this.tone(880 + combo * 70, 0.07, "triangle", 0.08),
      48,
    );
  }

  collision(): void {
    this.tone(82, 0.3, "sawtooth", 0.24, 36);
  }

  pickup(): void {
    this.tone(310, 0.12, "triangle", 0.14, 720);
  }

  sector(): void {
    [392, 523, 659].forEach((frequency, index) => {
      window.setTimeout(
        () => this.tone(frequency, 0.16, "sine", 0.12),
        index * 95,
      );
    });
  }

  nearMiss(): void {
    this.tone(190, 0.09, "square", 0.055, 460);
  }

  dispose(): void {
    this.engineOscillator?.stop();
    void this.context?.close();
    this.context = null;
    this.master = null;
    this.engineOscillator = null;
    this.engineGain = null;
  }

  private tone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    endFrequency = frequency,
  ): void {
    if (!this.context || !this.master || this.muted) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(1, endFrequency),
      now + duration,
    );
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }
}
