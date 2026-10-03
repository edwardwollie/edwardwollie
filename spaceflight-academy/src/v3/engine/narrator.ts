import { prepareNarrationText, scoreVoice } from "../../narrator.ts";

/**
 * Read-aloud narrator with on-screen captions.
 * - Reuses the v2.1 voice preference (friendly feminine voices) and unit spelling.
 * - Every new line cancels the previous one (same as v2.1).
 * - A watchdog finishes lines whose `onend` never fires (some browsers/devices).
 * - Without speech synthesis (or with narration switched off) it waits a fair
 *   reading time instead, so "narration first, then the timer" still holds.
 */
type CaptionListener = (text: string | null, speaking: boolean) => void;

let session = 0;
let activeFinish: (() => void) | null = null;
let enabled = true;
let captionListener: CaptionListener | null = null;
const fast = typeof location !== "undefined" && new URLSearchParams(location.search).has("fastnarration");
let cachedVoice: SpeechSynthesisVoice | null | undefined;

export function onCaption(listener: CaptionListener) {
  captionListener = listener;
}

export function setNarrationEnabled(on: boolean) {
  enabled = on;
  if (!on) stopSpeaking();
}

export function hasSpeech() {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

/** Call from a user gesture (iOS needs the first utterance to come from a tap). */
export function unlockSpeech() {
  if (!hasSpeech()) return;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch { /* ignore */ }
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (!hasSpeech()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  if (cachedVoice !== undefined && cachedVoice && voices.includes(cachedVoice)) return cachedVoice;
  cachedVoice = voices.filter((v) => v.lang.toLowerCase().startsWith("en"))
    .sort((a, b) => scoreVoice(b.name, b.lang, b.localService) - scoreVoice(a.name, a.lang, a.localService))[0] ?? null;
  return cachedVoice;
}

function chunks(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text];
  const out: string[] = [];
  for (const sentence of sentences) {
    const clean = sentence.trim();
    if (!clean) continue;
    if (clean.length <= 185) { out.push(clean); continue; }
    let part = "";
    for (const word of clean.split(/\s+/)) {
      if (part && `${part} ${word}`.length > 185) { out.push(part); part = word; } else part = part ? `${part} ${word}` : word;
    }
    if (part) out.push(part);
  }
  return out;
}

/** Seconds a child might need to read (or hear) the text. */
export function readingSeconds(text: string, rate = 0.72) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1.6, words / (2.55 * (rate / 0.72)));
}

export function stopSpeaking() {
  session += 1;
  if (hasSpeech()) {
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
  }
  const finish = activeFinish;
  activeFinish = null;
  finish?.();
}

export interface SpeakOptions {
  rate?: number;
  pitch?: number;
  /** Caption shown while speaking (defaults to the spoken text). */
  caption?: string;
  /** Keep the caption visible after speaking ends. */
  keepCaption?: boolean;
}

export function speak(text: string, options: SpeakOptions = {}): Promise<void> {
  const clean = prepareNarrationText(text);
  stopSpeaking();
  const current = session;
  const caption = options.caption ?? text;
  const rate = options.rate ?? 0.72;
  if (!clean) return Promise.resolve();
  captionListener?.(caption, true);
  const done = () => {
    if (current === session && !options.keepCaption) captionListener?.(null, false);
    else if (current === session) captionListener?.(caption, false);
  };
  if (fast) {
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => { if (activeFinish === finish) activeFinish = null; done(); resolve(); }, 60);
      const finish = () => { window.clearTimeout(timer); resolve(); };
      activeFinish = finish;
    });
  }
  if (!enabled || !hasSpeech()) {
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => { if (activeFinish === finish) activeFinish = null; done(); resolve(); }, readingSeconds(clean, rate) * 1000);
      const finish = () => { window.clearTimeout(timer); resolve(); };
      activeFinish = finish;
    });
  }
  const synthesis = window.speechSynthesis;
  const parts = chunks(clean);
  let index = 0;
  return new Promise((resolve) => {
    let finished = false;
    let watchdog = 0;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(watchdog);
      if (activeFinish === finish) activeFinish = null;
      resolve();
    };
    activeFinish = finish;
    const next = () => {
      window.clearTimeout(watchdog);
      if (current !== session) { finish(); return; }
      if (index >= parts.length) { done(); finish(); return; }
      const text = parts[index];
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = pickVoice();
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang ?? "en-US";
      utterance.rate = rate;
      utterance.pitch = options.pitch ?? 1.14;
      utterance.volume = 0.94;
      let advanced = false;
      const advance = (delay: number) => {
        if (advanced) return;
        advanced = true;
        index += 1;
        window.setTimeout(next, delay);
      };
      utterance.onend = () => advance(150);
      utterance.onerror = () => advance(40);
      // Watchdog: some engines never fire onend.
      watchdog = window.setTimeout(() => advance(0), (readingSeconds(text, rate) * 1.9 + 2.5) * 1000);
      try { synthesis.speak(utterance); } catch { advance(0); }
    };
    if (synthesis.getVoices().length) next();
    else {
      let started = false;
      const go = () => { if (!started) { started = true; next(); } };
      synthesis.addEventListener?.("voiceschanged", go, { once: true });
      window.setTimeout(go, 350);
    }
  });
}

export function narrationRate(age: string) {
  return age === "5–7" ? 0.67 : age === "8–10" ? 0.71 : 0.74;
}
