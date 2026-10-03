let audio: AudioContext | null = null;

export function playTone(kind: "move" | "collect" | "bump" | "win" | "build") {
  if (!("AudioContext" in window)) return;
  audio ??= new AudioContext();
  const now = audio.currentTime;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const tones = { move: 260, collect: 680, bump: 120, win: 520, build: 390 };
  oscillator.frequency.setValueAtTime(tones[kind], now);
  if (kind === "win") oscillator.frequency.exponentialRampToValueAtTime(1040, now + .32);
  gain.gain.setValueAtTime(.0001, now);
  gain.gain.exponentialRampToValueAtTime(.09, now + .015);
  gain.gain.exponentialRampToValueAtTime(.0001, now + (kind === "win" ? .42 : .12));
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(now);
  oscillator.stop(now + (kind === "win" ? .44 : .14));
}
