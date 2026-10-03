// Warm narration with kid-friendly pacing. v2 speaks in short chunks (avoids the Chrome
// long-utterance cut-off), reports which chunk is being read so answer cards can light up,
// and has a safety timer so the game never waits forever if a browser forgets `onend`.
let preferredVoice = null;
let session = 0;
let safetyTimer = null;
const listeners = new Set();

const feminineNames = [
  'samantha', 'victoria', 'ava', 'susan', 'zira', 'jenny', 'aria', 'sonia',
  'emma', 'karen', 'moira', 'tessa', 'serena', 'libby', 'natasha', 'female'
];
const masculineNames = ['david', 'mark', 'guy', 'george', 'james', 'daniel', 'ryan', 'male'];
const naturalNames = ['natural', 'premium', 'enhanced', 'neural', 'online'];

function scoreVoice(voice) {
  const name = `${voice.name} ${voice.voiceURI}`.toLowerCase();
  let score = voice.lang?.toLowerCase().startsWith('en') ? 35 : -100;
  if (feminineNames.some((token) => name.includes(token))) score += 90;
  if (naturalNames.some((token) => name.includes(token))) score += 28;
  if (masculineNames.some((token) => name.includes(token))) score -= 120;
  if (voice.localService) score += 8;
  return score;
}

function chooseVoice() {
  if (!('speechSynthesis' in window)) return null;
  const voices = speechSynthesis.getVoices();
  preferredVoice = [...voices].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] || null;
  return preferredVoice;
}

export function prepareNarration(text) {
  return String(text)
    .replace(/\b911\b/g, 'nine one one')
    .replace(/\bWASD\b/g, 'W, A, S, D')
    .replace(/&/g, ' and ')
    .replace(/\//g, ' or ')
    .replace(/([.!?])\s*/g, '$1  ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Rough duration so a missing `onend` cannot stall the game.
export function estimateMs(text, rate = 0.72) {
  const words = String(text).trim().split(/\s+/).filter(Boolean).length;
  return (words / (2.6 * rate)) * 1000 + 700;
}

export function onSpeakingChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function notify(active) { for (const fn of listeners) { try { fn(active); } catch { /* ignore */ } } }

export function isSpeechAvailable() { return 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'; }

// Speak several chunks back to back. onChunk(index) fires as each chunk starts.
export function speakSequence(chunks, { rate = 0.72, pitch = 1.15, onChunk, onEnd } = {}) {
  const list = chunks.map((c) => String(c || '').trim()).filter(Boolean);
  const my = ++session;
  clearTimeout(safetyTimer);
  let finished = false;
  const finish = () => {
    if (finished || my !== session) return;
    finished = true;
    clearTimeout(safetyTimer);
    notify(false);
    onEnd?.();
  };
  if (!isSpeechAvailable() || !list.length) { setTimeout(finish, 0); return null; }
  try { speechSynthesis.cancel(); } catch { /* ignore */ }
  const voice = preferredVoice || chooseVoice();
  const total = list.reduce((sum, t) => sum + estimateMs(t, rate), 0);
  const armSafety = (ms) => { clearTimeout(safetyTimer); safetyTimer = setTimeout(finish, ms); };
  armSafety(total + 4000);
  notify(true);
  list.forEach((text, index) => {
    const u = new SpeechSynthesisUtterance(prepareNarration(text));
    u.lang = 'en-US';
    u.rate = rate;
    u.pitch = pitch;
    u.volume = 0.9;
    if (voice) u.voice = voice;
    u.onstart = () => {
      if (my !== session) return;
      onChunk?.(index);
      // Re-arm the safety timer from the current chunk so slow voices are not cut short.
      const remaining = list.slice(index).reduce((sum, t) => sum + estimateMs(t, rate), 0);
      armSafety(remaining + 3500);
    };
    if (index === list.length - 1) { u.onend = finish; }
    u.onerror = (e) => { if (e?.error === 'interrupted' || e?.error === 'canceled') return; if (index === list.length - 1) finish(); };
    try { speechSynthesis.speak(u); } catch { finish(); }
  });
  // Some engines never start speaking (no voices installed): fall back after a short wait.
  setTimeout(() => {
    if (my === session && !finished && 'speechSynthesis' in window && !speechSynthesis.speaking && !speechSynthesis.pending) finish();
  }, 1600);
  return my;
}

export function speak(text, { rate = 0.72, pitch = 1.15, onEnd } = {}) {
  return speakSequence([text], { rate, pitch, onEnd });
}

export function stopSpeaking() {
  session++;
  clearTimeout(safetyTimer);
  if ('speechSynthesis' in window) { try { speechSynthesis.cancel(); } catch { /* ignore */ } }
  notify(false);
}

if ('speechSynthesis' in window) {
  chooseVoice();
  speechSynthesis.addEventListener?.('voiceschanged', chooseVoice);
}
