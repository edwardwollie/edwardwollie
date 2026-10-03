// Healthy Hero 3D — game controller. Learning rules from v1.3.1 are preserved: 30 missions,
// 72 encounters mixed across six topics, narration first, then a 7-second thinking grace,
// then 30 → 22 second answer windows, gentle crash-through, and saves on this device only.
import { speakSequence, stopSpeaking, onSpeakingChange } from './narrator.js?v=2.0.0';
import { RUN_LENGTH, READING_GRACE_MS, approachForMission, missionEncounterIds, missionTier } from './mission-plan.js?v=2.0.0';
import { Q, WORLDS, FAMILY, TUTORIAL, MOVES, TOPIC_FACTS } from './content.js?v=2.0.0';
import { BLUEPRINTS, HERO_ORDER } from './blueprints.js?v=2.0.0';
import { Engine, webglAvailable } from './engine.js?v=2.0.0';
import * as UI from './ui.js?v=2.0.0';
import { initAudio, sfx, setMusic, setSfx, duck, setMusicIntensity, pauseAudio, resumeAudio } from './audio.js?v=2.0.0';

const BUILD_VERSION = '2.0.0';
const SAVE_KEY = 'healthy-hero-save-v1';
const MISSION_NAMES = ['Starter Sprint', 'Power Mix-Up', 'Hero Relay', 'Vitality Circuit', 'Champion Gauntlet'];

// ----------------------------------------------------------------------------------------
// Save data (backward compatible with v1.3.1 saves)
// ----------------------------------------------------------------------------------------
function load() {
  const base = { unlocked: 1, selected: 0, stars: {}, xp: 0, badges: [], voice: true, tutorial: false, rushTutorial: false, familyDone: [], hero: 'pip', facts: {}, music: true, sfx: true, quality: 'auto', motion: 'auto', tutorial3d: false };
  try { return { ...base, ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') }; } catch { return base; }
}
let save = load();
const store = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* private mode */ } };
const totalStars = () => Object.values(save.stars).reduce((a, b) => a + b, 0);
const stats = () => ({ stars: totalStars(), xp: save.xp, badges: save.badges.length, facts: Object.keys(save.facts || {}).length, completed: save.unlocked - 1 });
const mastery = () => WORLDS.map((_, z) => Q.filter((q) => q.zone === z && save.facts[q.id] === 2).length / 12);

function mission(index) {
  const worldIndex = index % WORLDS.length, tier = missionTier(index);
  return { index, worldIndex, world: WORLDS[worldIndex], tier, number: index + 1, title: MISSION_NAMES[tier], qids: missionEncounterIds(index), approachMs: approachForMission(index) };
}

// ----------------------------------------------------------------------------------------
// State
// ----------------------------------------------------------------------------------------
let engine = null, island = null, runScene = null, stage = null;
let screen = 'title', overlay = null;
let run = null;
let approachTimer = null, readingTimer = null, advanceTimer = null, factTimer = null, graceTicker = null, activityTimer = null;
let narrationToken = 0;
let labState = { id: 'pip', view: 'iso', style: 'blueprint' };
let journalTab = 0;
let tutorialStep = 0;
let resumeRun = false;
const $ = (sel) => document.querySelector(sel);
const reducedMotion = () => save.motion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches;

function makeRun(index) {
  const m = mission(index);
  return { m, step: 0, lane: 1, state: 'ready', reading: true, phase: 'listen', hearts: 3, mistakes: 0, combo: 0, bestCombo: 0, score: 0, approachStarted: 0, results: [], factsNew: 0, feedback: 'Listen, read, then steer into the best wellness answer!' };
}
function currentEncounter() {
  const source = Q[run.m.qids[run.step]], count = source.choices.length, offset = (run.m.index + run.step) % count;
  return { ...source, choices: [...source.choices.slice(offset), ...source.choices.slice(0, offset)], answer: (source.answer - offset + count) % count };
}

// ----------------------------------------------------------------------------------------
// Narration helpers
// ----------------------------------------------------------------------------------------
function encounterChunks(prefix = '') {
  const q = currentEncounter();
  const ask = /[.!?]$/.test(q.q) ? q.q : `${q.q}.`;
  return [prefix, ask, 'Choices are.', ...q.choices.map((choice, index) => `Choice ${index + 1}: ${choice}.`)];
}
function encounterNarration() { return encounterChunks().filter(Boolean).join(' '); }
function say(text, opts = {}) { if (!save.voice) { opts.onEnd?.(); return; } speakSequence(Array.isArray(text) ? text : [text], opts); }
onSpeakingChange((active) => duck(active));

// ----------------------------------------------------------------------------------------
// Kid timing: narration → 7 s thinking grace → answer window (30 / 28 / 26 / 24 / 22 s)
// ----------------------------------------------------------------------------------------
function clearApproach() {
  narrationToken++;
  if (approachTimer) { clearTimeout(approachTimer); approachTimer = null; }
  if (readingTimer) { clearTimeout(readingTimer); readingTimer = null; }
  if (graceTicker) { clearInterval(graceTicker); graceTicker = null; }
  stopSpeaking();
  if (run) { run.approachStarted = 0; run.reading = false; }
  runScene?.setApproach(null);
  document.querySelectorAll('.answer-card.reading').forEach((c) => c.classList.remove('reading'));
}

function setPhase(phase) {
  if (!run) return;
  run.phase = phase;
  runScene?.setPhase(phase === 'answer' ? 'answer' : phase);
  const chip = $('#phase-chip'), bar = $('#timer-bar'), fill = $('#timer-fill');
  if (!chip) return;
  chip.className = `phase-chip ${phase}`;
  if (phase === 'listen') { chip.textContent = save.voice ? '🔊 Listening…' : '📖 Reading time'; bar.classList.add('reading'); fill.style.transform = 'scaleX(1)'; }
  if (phase === 'think') { bar.classList.add('reading'); fill.style.transform = 'scaleX(1)'; }
  if (phase === 'answer') { bar.classList.remove('reading'); chip.textContent = '⏱ Answer time'; }
}

// HUD ticker: answer-window bar and seconds left (runs every animation frame during a run).
function hudTick() {
  requestAnimationFrame(hudTick);
  if (screen !== 'run' || !run) return;
  const fill = document.getElementById('timer-fill');
  if (!fill) return;
  if (run.phase === 'answer' && run.approachStarted && run.state === 'ready') {
    const left = Math.max(0, run.m.approachMs - (Date.now() - run.approachStarted));
    fill.style.transform = `scaleX(${(left / run.m.approachMs).toFixed(4)})`;
    const chip = document.getElementById('phase-chip');
    const secs = Math.ceil(left / 1000);
    if (chip && chip.dataset.secs !== String(secs)) { chip.dataset.secs = String(secs); chip.textContent = `⏱ Answer time · ${secs}s`; }
  }
}
requestAnimationFrame(hudTick);

function armApproach() {
  if (!run || overlay || run.state !== 'ready' || run.approachStarted) return;
  run.reading = false;
  run.approachStarted = Date.now();
  setPhase('answer');
  sfx.unlock();
  runScene?.setApproach(run.approachStarted, run.m.approachMs);
  approachTimer = setTimeout(() => rush(undefined, true), run.m.approachMs);
}

function queueEncounter(prefix = '') {
  if (!run || overlay || run.state !== 'ready') return;
  clearApproach();
  run.reading = true;
  setPhase('listen');
  const token = ++narrationToken;
  const beginGrace = () => {
    if (token !== narrationToken || !run || overlay || run.state !== 'ready') return;
    document.querySelectorAll('.answer-card.reading').forEach((c) => c.classList.remove('reading'));
    setPhase('think');
    const graceEnds = Date.now() + READING_GRACE_MS;
    const chip = $('#phase-chip');
    const tick = () => { const left = Math.max(0, Math.ceil((graceEnds - Date.now()) / 1000)); if (chip && run?.phase === 'think') chip.textContent = `🤔 Think time · ${left}s`; };
    tick();
    graceTicker = setInterval(tick, 250);
    readingTimer = setTimeout(() => { if (token === narrationToken) { clearInterval(graceTicker); graceTicker = null; armApproach(); } }, READING_GRACE_MS);
  };
  if (save.voice) {
    const chunks = encounterChunks(prefix);
    speakSequence(chunks, {
      onChunk: (i) => {
        const card = i >= 3 ? document.querySelector(`[data-answer="${i - 3}"]`) : null;
        document.querySelectorAll('.answer-card.reading').forEach((c) => c.classList.remove('reading'));
        card?.classList.add('reading');
      },
      onEnd: beginGrace
    });
  } else beginGrace();
}

// ----------------------------------------------------------------------------------------
// Run flow
// ----------------------------------------------------------------------------------------
async function start(index = save.selected) {
  if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
  clearTimeout(factTimer);
  clearApproach();
  save.selected = Math.max(0, Math.min(index, 29));
  store();
  run = makeRun(save.selected);
  await ensureRunScene();
  runScene.setHero(save.hero);
  runScene.startMission(Q[run.m.qids[0]].zone);
  engine.setScene(runScene);
  setMusicIntensity(1);
  screen = 'run';
  overlay = null;
  closeModal();
  renderRun();
  prepareGate();
  if (!save.tutorial3d) { tutorialStep = 0; openModal('tutorial'); save.tutorial3d = true; save.rushTutorial = true; store(); say(TUTORIAL[0].join('. ')); return; }
  queueEncounter(`Mission ${run.m.number}. Wellness mix rush. Every Power Gate is a different world.`);
}

function prepareGate() {
  const q = currentEncounter();
  runScene.prepareEncounter({ topic: q.zone, choices: q.choices });
  runScene.setLane(run.lane);
  sfx.whoosh();
}

function renderRun() {
  const q = currentEncounter();
  mount(UI.runScreen({ save, mission: run.m, step: run.step, total: RUN_LENGTH, hearts: run.hearts, score: run.score, results: run.results, q, topic: WORLDS[q.zone], lane: run.lane }));
}

function syncLaneDom() {
  document.querySelectorAll('.answer-card').forEach((card, index) => card.classList.toggle('selected', index === run.lane));
}
function changeLane(direction) {
  if (!run || overlay || run.state !== 'ready' || screen !== 'run') return;
  const next = Math.max(0, Math.min(2, run.lane + direction));
  if (next === run.lane) return;
  run.lane = next;
  run.feedback = `Power lane ${run.lane + 1} selected — keep running or dash now!`;
  syncLaneDom(); runScene.setLane(run.lane); sfx.lane(run.lane);
}
function selectLane(index) {
  if (!run || overlay || run.state !== 'ready' || screen !== 'run') return;
  run.lane = Math.max(0, Math.min(2, index));
  run.feedback = `Power lane ${run.lane + 1} selected — keep running or dash now!`;
  syncLaneDom(); runScene.setLane(run.lane); sfx.lane(run.lane);
}
function calmMove() {
  if (!run || overlay || run.state !== 'ready' || screen !== 'run') return;
  runScene.calm();
  sfx.pop();
  toast('💚 Calm shield up — you are still moving!');
}

function rush(choiceIndex = run?.lane, auto = false) {
  if (!run || overlay || run.state !== 'ready' || screen !== 'run') return;
  if (Number.isInteger(choiceIndex)) run.lane = Math.max(0, Math.min(2, choiceIndex));
  clearApproach();
  const q = currentEncounter(), correct = run.lane === q.answer;
  if (correct) {
    run.state = 'correct'; run.combo++; run.bestCombo = Math.max(run.bestCombo, run.combo);
    run.score += 100 + run.combo * 20 + (auto ? 0 : 25);
    run.feedback = `Power burst! ${q.explain}`;
  } else {
    run.state = 'wrong'; run.mistakes++; run.combo = 0; run.hearts = Math.max(0, run.hearts - 1);
    run.feedback = `Crash-through! ${q.hint} Helpful answer: ${q.choices[q.answer]}. Keep running.`;
  }
  run.results[run.step] = correct;
  if (!save.facts[q.id]) run.factsNew++;
  save.facts[q.id] = Math.max(save.facts[q.id] || 0, correct ? 2 : 1);
  store();
  syncLaneDom();
  runScene.setLane(run.lane);
  runScene.resolve({ lane: run.lane, correct, answerLane: q.answer, auto });
  sfx.dash();
  // Cards show the outcome
  document.querySelectorAll('.answer-card').forEach((card, i) => {
    card.disabled = true;
    if (i === q.answer) card.classList.add('correct');
    else if (i === run.lane && !correct) card.classList.add('wrong');
  });
  const impact = $('#impact');
  setTimeout(() => {
    if (!run) return;
    if (correct) sfx.correct(); else sfx.wrong();
    if (impact) { impact.textContent = correct ? '✨ POWER CLEAR!' : '💥 CRASH-THROUGH!'; impact.classList.remove('show'); void impact.offsetWidth; impact.classList.add('show'); }
    if (correct && run.combo > 1) { const c = $('#combo'); if (c) { c.textContent = `🔥 ${run.combo}× combo!`; c.classList.remove('show'); void c.offsetWidth; c.classList.add('show'); } }
    const hearts = $('#hearts'); if (hearts) hearts.textContent = '💚'.repeat(run.hearts) + '🤍'.repeat(3 - run.hearts);
    const score = $('#score'); if (score) score.textContent = `⚡ ${run.score}`;
    const pip = document.querySelectorAll('.pip')[run.step]; pip?.classList.add(correct ? 'done' : 'miss');
  }, 430);
  advanceTimer = setTimeout(() => showFact(correct, q), correct ? 980 : 1280);
}

function showFact(correct, q) {
  advanceTimer = null;
  if (!run || screen !== 'run') return;
  document.querySelector('#fact-card')?.remove();
  const voice = save.voice;
  const text = correct ? `Power burst! ${q.explain}` : `Nice try! The helpful answer is: ${q.choices[q.answer]}. ${q.explain} Keep running!`;
  const readMs = Math.min(9000, Math.max(3500, 2200 + text.length * 45));
  const card = UI.factCard({ correct, q, autoMs: readMs });
  $('#screen .run-screen')?.append(card);
  const bar = $('#fact-progress');
  const countdown = (ms) => {
    clearTimeout(factTimer);
    if (bar) { bar.style.transition = 'none'; bar.style.width = '0%'; void bar.offsetWidth; bar.style.transition = `width ${ms}ms linear`; bar.style.width = '100%'; }
    factTimer = setTimeout(advanceRun, ms);
  };
  if (voice) say(text, { onEnd: () => { if (run && (run.state === 'correct' || run.state === 'wrong') && !overlay) countdown(1600); } });
  else countdown(readMs);
}

function advanceRun() {
  advanceTimer = null;
  clearTimeout(factTimer);
  if (!run) return;
  stopSpeaking();
  if (run.step >= RUN_LENGTH - 1) { complete(); return; }
  run.step++;
  run.lane = 1;
  run.state = 'ready';
  run.reading = true;
  run.feedback = 'Next power obstacle incoming — listen or read first!';
  run.approachStarted = 0;
  renderRun();
  prepareGate();
  queueEncounter();
}

async function complete() {
  clearApproach();
  const stars = run.mistakes === 0 && run.hearts === 3 ? 3 : run.mistakes <= 2 && run.hearts >= 1 ? 2 : 1, old = save.stars[run.m.index] || 0;
  save.stars[run.m.index] = Math.max(old, stars);
  save.xp += Math.max(0, stars * 40 - old * 15);
  save.unlocked = Math.max(save.unlocked, Math.min(30, run.m.index + 2));
  let newBadge = null;
  if (run.mistakes === 0 && !save.badges.includes(run.m.world.badge)) { save.badges.push(run.m.world.badge); newBadge = run.m.world.badge; }
  save.selected = Math.min(29, run.m.index + (run.m.index < 29 ? 1 : 0));
  store();
  runScene.finish();
  const result = { stars, score: run.score, bestCombo: run.bestCombo, facts: run.factsNew, badge: newBadge, isLast: run.m.index >= 29, index: run.m.index };
  await ensureStage();
  stage.showCelebration(save.hero, { badgeTopic: newBadge ? run.m.worldIndex : null });
  engine.setScene(stage);
  setMusicIntensity(0);
  screen = 'complete';
  mount(UI.completeScreen(result));
  sfx.fanfare();
  [0, 1, 2].slice(0, stars).forEach((i) => setTimeout(() => sfx.star(i), 400 + i * 350));
  say(`World powered up! You earned ${stars} star${stars === 1 ? '' : 's'}. ${newBadge ? `You earned the ${newBadge} badge! ` : ''}Healthy heroes learn what helps their own body feel ready.`);
  run.completed = true;
}

// ----------------------------------------------------------------------------------------
// Screens
// ----------------------------------------------------------------------------------------
let focusObserver = null;
function mount(el) {
  const host = $('#screen');
  host.replaceChildren(el);
  const focus = el.querySelector('.focus-area');
  focusObserver?.disconnect();
  const update = () => { if (!engine) return; const r = focus?.getBoundingClientRect(); engine.setFocus(r && r.width > 20 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null); };
  if (focus && 'ResizeObserver' in window) { focusObserver = new ResizeObserver(update); focusObserver.observe(focus); }
  requestAnimationFrame(update);
}

function leaveRun() {
  clearApproach();
  clearTimeout(factTimer);
  if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
  run = null;
  runScene?.pauseRun(false);
  setMusicIntensity(0);
}

function stopActivity() { clearInterval(activityTimer); clearTimeout(activityTimer); activityTimer = null; stopSpeaking(); }

async function showTitle() {
  stopActivity();
  if (screen === 'run') leaveRun();
  screen = 'title';
  closeModal();
  island.setHero(save.hero);
  island.setProgress({ unlocked: save.unlocked, stars: save.stars, badges: save.badges }, save.selected);
  island.setMode('title');
  engine.setScene(island);
  mount(UI.titleScreen({ save, stats: stats(), mission: mission(save.selected), version: BUILD_VERSION }));
}

function showMap() {
  stopActivity();
  if (screen === 'run') leaveRun();
  screen = 'map';
  closeModal();
  island.setHero(save.hero);
  island.setProgress({ unlocked: save.unlocked, stars: save.stars, badges: save.badges }, save.selected);
  island.setMode('map');
  engine.setScene(island);
  renderMapSheet();
}
function renderMapSheet() {
  mount(UI.mapScreen({ save, stats: stats(), mission: mission(save.selected), unlocked: save.unlocked, stars: save.stars[save.selected] || 0 }));
}

async function showHeroes() {
  stopActivity();
  await ensureStage();
  screen = 'heroes';
  closeModal();
  stage.showHeroes(save.hero);
  engine.setScene(stage);
  mount(UI.heroesScreen({ selected: save.hero }));
}

async function showLab(id = labState.id) {
  stopActivity();
  await ensureStage();
  screen = 'lab';
  closeModal();
  labState.id = id;
  stage.labView = labState.view;
  stage.setLabStyle(labState.style);
  stage.showLab(id);
  engine.setScene(stage);
  mount(UI.labScreen({ ...labState, groups: (await import('./stage.js?v=2.0.0')).LAB_GROUPS }));
  const wrap = $('#lab-dims');
  if (wrap) { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('class', 'lab-dims'); s.setAttribute('id', 'lab-svg'); wrap.replaceWith(s); }
  requestAnimationFrame(() => requestAnimationFrame(drawLabDims));
}

function drawLabDims() {
  const svg = $('#lab-svg');
  if (!svg || screen !== 'lab') return;
  svg.replaceChildren();
  const d = stage.labDims();
  if (!d) return;
  const NS = 'http://www.w3.org/2000/svg';
  const line = (x1, y1, x2, y2) => { const l = document.createElementNS(NS, 'line'); for (const [k, v] of Object.entries({ x1, y1, x2, y2, stroke: '#bfe3ff', 'stroke-width': 2 })) l.setAttribute(k, v); svg.append(l); };
  const text = (x, y, t, rot) => { const e = document.createElementNS(NS, 'text'); for (const [k, v] of Object.entries({ x, y, fill: '#ffffff', 'font-size': 15, 'font-weight': 900, 'text-anchor': 'middle', 'font-family': 'Nunito', 'paint-order': 'stroke', stroke: '#0b3778', 'stroke-width': 5 })) e.setAttribute(k, v); if (rot) e.setAttribute('transform', `rotate(-90 ${x} ${y})`); e.textContent = t; svg.append(e); };
  const yb = d.maxY + 26, xl = d.minX - 26;
  line(d.minX, yb, d.maxX, yb); line(d.minX, yb - 8, d.minX, yb + 8); line(d.maxX, yb - 8, d.maxX, yb + 8);
  text((d.minX + d.maxX) / 2, yb + 20, `${Math.round(d.w * 100)} cm`);
  line(xl, d.minY, xl, d.maxY); line(xl - 8, d.minY, xl + 8, d.minY); line(xl - 8, d.maxY, xl + 8, d.maxY);
  text(xl - 12, (d.minY + d.maxY) / 2, `${Math.round(d.h * 100)} cm`, true);
}

async function showMove() {
  stopActivity();
  await ensureStage();
  screen = 'move';
  closeModal();
  stage.showMove(save.hero, 'idle');
  engine.setScene(stage);
  mount(UI.moveScreen({ hero: save.hero, index: 0, remaining: 60, running: false }));
}

function startMove() {
  stopActivity();
  let remaining = 60;
  let index = 0;
  const show = () => {
    mount(UI.moveScreen({ hero: save.hero, index, remaining, running: true }));
    stage.showMove(save.hero, MOVES[index].id);
  };
  show();
  say(`Movement break! ${MOVES[0].name}. ${MOVES[0].tip} Choose a comfortable move, and stop if anything hurts.`);
  activityTimer = setInterval(() => {
    remaining--;
    const ring = $('#count-ring'), num = $('#count-num');
    if (ring) ring.style.setProperty('--p', String(Math.round((1 - remaining / 60) * 100)));
    if (num) num.textContent = String(remaining);
    if (remaining > 0 && remaining % 10 === 0) {
      index = Math.min(MOVES.length - 1, Math.floor((60 - remaining) / 10));
      show();
      sfx.pop();
      say(`${MOVES[index].name}! ${MOVES[index].tip}`);
    }
    if (remaining <= 0) {
      clearInterval(activityTimer); activityTimer = null;
      stage.showMove(save.hero, 'cheer');
      mount(UI.moveScreen({ hero: save.hero, index: MOVES.length, remaining: 0, running: false }));
      const name = $('#move-name'); if (name) name.textContent = 'Power-up complete! ★';
      sfx.fanfare();
      say('Movement power-up complete! Great moving, hero.');
    }
  }, 1000);
}

async function showBreathe() {
  stopActivity();
  await ensureStage();
  screen = 'breathe';
  closeModal();
  stage.showBreathe(save.hero);
  engine.setScene(stage);
  mount(UI.breatheScreen({ running: false, cycle: 0 }));
}

function startBreathe() {
  stopActivity();
  let cycle = 1, phase = 'in', t0 = Date.now();
  mount(UI.breatheScreen({ running: true, cycle }));
  say('Let us breathe with the bubble. Breathe in slowly while it grows, and breathe out slowly while it shrinks.');
  const word = () => $('#breathe-word');
  const setWord = (w, sub) => { const el = word(); if (!el) return; el.firstChild.textContent = w; const s = $('#breathe-count'); if (s) s.textContent = sub; };
  stage.setBreath(1); sfx.breatheIn();
  activityTimer = setInterval(() => {
    const el = Date.now() - t0;
    const sec = Math.floor(el / 1000) + 1;
    if (phase === 'in') setWord(`Breathe in… ${Math.min(4, sec)}`, `Bubble ${cycle} of 5`);
    else setWord(`Breathe out… ${Math.min(4, sec)}`, `Bubble ${cycle} of 5`);
    if (el >= 4000) {
      t0 = Date.now();
      if (phase === 'in') { phase = 'out'; stage.setBreath(0); sfx.breatheOut(); }
      else {
        cycle++;
        if (cycle > 5) { clearInterval(activityTimer); activityTimer = null; stage.setBreath(0.35); setWord('Nice and calm ✨', 'You can do this any time you need it.'); say('Nice and calm. You can use bubble breathing any time a feeling feels big.'); return; }
        phase = 'in'; stage.setBreath(1); sfx.breatheIn();
      }
    }
  }, 200);
}

// ----------------------------------------------------------------------------------------
// Modals
// ----------------------------------------------------------------------------------------
function openModal(type) {
  overlay = type;
  const root = $('#modal-root');
  let el;
  if (type === 'tutorial') el = UI.tutorialModal(tutorialStep);
  else if (type === 'family') el = UI.familyModal(save);
  else if (type === 'grownup') el = UI.grownupModal(save, stats(), mastery());
  else if (type === 'journal') el = UI.journalModal(save, journalTab);
  else if (type === 'pause') el = UI.pauseModal(save);
  else if (type === 'confirm-reset') el = UI.confirmModal('This erases stars, badges, power facts and unlocked missions on this device.', 'reset-yes');
  else if (type === 'fallback') el = UI.fallbackModal();
  root.replaceChildren(el);
  el.querySelector('button, a')?.focus({ preventScroll: true });
}
function closeModal() { overlay = null; $('#modal-root')?.replaceChildren(); }

function pauseRunForOverlay(type) {
  if (screen === 'run' && run) {
    clearApproach();
    clearTimeout(factTimer);
    if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
    runScene.pauseRun(true);
    resumeRun = true;
  }
  openModal(type);
}

function closeOverlayAndResume() {
  const wasRun = resumeRun;
  resumeRun = false;
  closeModal();
  if (wasRun && screen === 'run' && run) {
    runScene.pauseRun(false);
    if (run.state === 'ready') { run.reading = true; queueEncounter(); }
    else if (run.state === 'correct' || run.state === 'wrong') showFact(run.state === 'correct', currentEncounter());
  }
}

// ----------------------------------------------------------------------------------------
// Actions
// ----------------------------------------------------------------------------------------
async function action(a, el) {
  initAudio();
  if (save.music) setMusic(true);
  switch (a) {
    case 'play': sfx.tap(); return start(save.selected);
    case 'play-selected': sfx.tap(); return start(save.selected);
    case 'map': sfx.tap(); return showMap();
    case 'home': sfx.tap(); return showTitle();
    case 'heroes': sfx.tap(); return showHeroes();
    case 'lab': sfx.tap(); return showLab();
    case 'lab-hero': sfx.tap(); return showLab(save.hero);
    case 'move': sfx.tap(); return showMove();
    case 'move-start': sfx.tap(); return startMove();
    case 'breathe': sfx.tap(); return showBreathe();
    case 'breathe-start': sfx.tap(); return startBreathe();
    case 'stop-activity': sfx.tap(); return showTitle();
    case 'journal': sfx.tap(); return pauseRunForOverlay('journal');
    case 'family': sfx.tap(); return pauseRunForOverlay('family');
    case 'grownup': sfx.tap(); return pauseRunForOverlay('grownup');
    case 'pause': sfx.tap(); return pauseRunForOverlay('pause');
    case 'resume': case 'close': sfx.tap(); return closeOverlayAndResume();
    case 'restart': sfx.tap(); closeModal(); resumeRun = false; return start(run?.m.index ?? save.selected);
    case 'voice':
      save.voice = !save.voice; store();
      if (!save.voice) stopSpeaking();
      el?.setAttribute('aria-pressed', String(save.voice)); if (el) el.textContent = save.voice ? '🔊' : '🔇';
      toast(save.voice ? '🔊 Narration on' : '🔇 Narration off');
      if (screen === 'run' && run?.state === 'ready' && !overlay) queueEncounter(save.voice ? 'Warm narration is on.' : '');
      else if (screen === 'run' && (run?.state === 'correct' || run?.state === 'wrong') && !overlay) { clearTimeout(factTimer); factTimer = setTimeout(advanceRun, 3500); }
      return;
    case 'music':
      save.music = !save.music; store(); setMusic(save.music);
      el?.setAttribute('aria-pressed', String(save.music));
      toast(save.music ? '🎵 Music on' : '🎵 Music off');
      return;
    case 'speak': if (run?.state === 'ready') { run.reading = true; queueEncounter(); } return;
    case 'speak-fact': { if (!run) return; const q = currentEncounter(); clearTimeout(factTimer); say(run.state === 'correct' ? `Power burst! ${q.explain}` : `The helpful answer is: ${q.choices[q.answer]}. ${q.explain}`, { onEnd: () => { factTimer = setTimeout(advanceRun, 1600); } }); return; }
    case 'rush': return rush();
    case 'guard': return calmMove();
    case 'next-gate': sfx.tap(); return advanceRun();
    case 'next': sfx.tap(); return start(Math.min(29, (run?.m.index ?? save.selected) + 1));
    case 'replay': sfx.tap(); return start(run?.m.index ?? save.selected);
    case 'tutorial-next':
      if (tutorialStep < TUTORIAL.length - 1) { tutorialStep++; openModal('tutorial'); say(TUTORIAL[tutorialStep].join('. ')); }
      else { closeModal(); stopSpeaking(); if (screen === 'run' && run) queueEncounter(`Mission ${run.m.number}. Let us go!`); }
      return;
    case 'tutorial-back': tutorialStep = Math.max(0, tutorialStep - 1); openModal('tutorial'); say(TUTORIAL[tutorialStep].join('. ')); return;
    case 'tutorial-skip': closeModal(); stopSpeaking(); if (screen === 'run' && run) queueEncounter(); return;
    case 'replay-tutorial': save.tutorial3d = false; store(); closeModal(); resumeRun = false; return start(save.selected);
    case 'choose-hero': sfx.fanfare(); toast(`✔ ${BLUEPRINTS[save.hero].name} is ready!`); return showTitle();
    case 'hero-hello': say(BLUEPRINTS[save.hero].greeting); return;
    case 'build': stage?.build(); sfx.whoosh(); return;
    case 'hear-world': { const w = Number(el.dataset.world); say([WORLDS[w].name, ...TOPIC_FACTS[w]]); return; }
    case 'close-world': $('#world-card')?.setAttribute('hidden', ''); return;
    case 'reset': return openModal('confirm-reset');
    case 'reset-yes':
      try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
      save = load(); store(); closeModal(); resumeRun = false; toast('Progress reset on this device'); return showTitle();
    default: return undefined;
  }
}

function toast(text) {
  document.querySelector('.toast')?.remove();
  const t = UI.h('div', { class: 'toast', role: 'status' }, text);
  document.body.append(t);
  setTimeout(() => t.remove(), 1800);
}

function applySetting(key, value) {
  const v = value === 'true' ? true : value === 'false' ? false : value;
  save[key] = v; store();
  if (key === 'music') setMusic(v);
  if (key === 'sfx') setSfx(v);
  if (key === 'voice' && !v) stopSpeaking();
  if (key === 'motion') { document.body.classList.toggle('reduce-motion', v === 'reduced'); if (engine) engine.reducedMotion = reducedMotion(); if (runScene) runScene.reducedMotion = reducedMotion(); }
  if (key === 'quality' && engine) { engine.qualityPref = v; if (v !== 'auto') engine.setQuality(v); }
  if (overlay) openModal(overlay);
}

function bindEvents() {
  const app = $('#app');
  app.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action],[data-lane],[data-answer],[data-mission],[data-hero],[data-family],[data-journal],[data-fact],[data-lab],[data-view],[data-style],[data-setting],[data-backdrop]');
    if (!t) return;
    if (t.dataset.backdrop && e.target === t) { if (overlay !== 'tutorial') action('close'); return; }
    if (t.dataset.action) { e.preventDefault(); action(t.dataset.action, t); return; }
    initAudio();
    if (t.dataset.lane) changeLane(Number(t.dataset.lane));
    else if (t.dataset.answer !== undefined) selectLane(Number(t.dataset.answer));
    else if (t.dataset.mission !== undefined) start(Number(t.dataset.mission));
    else if (t.dataset.hero) { save.hero = t.dataset.hero; store(); stage.selectHero(save.hero); mount(UI.heroesScreen({ selected: save.hero })); sfx.lane(HERO_ORDER.indexOf(save.hero) % 3); say(BLUEPRINTS[save.hero].greeting); }
    else if (t.dataset.family !== undefined) { const i = Number(t.dataset.family); if (!save.familyDone.includes(i)) save.familyDone.push(i); store(); openModal('family'); say(`${FAMILY[i][0]}. ${FAMILY[i][1]}`); }
    else if (t.dataset.journal !== undefined) { journalTab = Number(t.dataset.journal); openModal('journal'); }
    else if (t.dataset.fact !== undefined) { const q = Q[Number(t.dataset.fact)]; say([q.q, `Helpful answer: ${q.choices[q.answer]}.`, q.explain]); }
    else if (t.dataset.lab) { sfx.tap(); showLab(t.dataset.lab); }
    else if (t.dataset.view) { sfx.tap(); labState.view = t.dataset.view; stage.setLabView(labState.view); document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === labState.view)); requestAnimationFrame(() => requestAnimationFrame(drawLabDims)); }
    else if (t.dataset.style) { sfx.tap(); labState.style = t.dataset.style; showLab(labState.id); }
    else if (t.dataset.setting) applySetting(t.dataset.setting, t.dataset.value);
  });
  addEventListener('keydown', (e) => {
    if (overlay) {
      if (e.code === 'Escape' && overlay !== 'tutorial') action('close');
      return;
    }
    if (screen === 'run') {
      const map = { KeyA: () => changeLane(-1), ArrowLeft: () => changeLane(-1), KeyD: () => changeLane(1), ArrowRight: () => changeLane(1), KeyW: () => rush(), ArrowUp: () => rush(), KeyS: () => calmMove(), ArrowDown: () => calmMove(), Digit1: () => selectLane(0), Digit2: () => selectLane(1), Digit3: () => selectLane(2), KeyR: () => action('speak'), Escape: () => action('pause') };
      if (map[e.code]) { e.preventDefault(); initAudio(); map[e.code](); return; }
      if ((e.code === 'Enter' || e.code === 'Space') && $('#fact-card') && !e.target.closest?.('button')) { e.preventDefault(); action('next-gate'); }
    }
  });
  // Swipe controls on the 3D view during a run
  let sw = null;
  const canvas = $('#scene3d');
  canvas.addEventListener('pointerdown', (e) => { if (screen === 'run') sw = { x: e.clientX, y: e.clientY, t: Date.now() }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!sw || screen !== 'run') { sw = null; return; }
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
    sw = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 36) return;
    initAudio();
    if (Math.abs(dx) > Math.abs(dy)) changeLane(dx > 0 ? 1 : -1);
    else if (dy < 0) rush(); else calmMove();
  });
  addEventListener('resize', () => { if (screen === 'lab') requestAnimationFrame(() => requestAnimationFrame(drawLabDims)); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pauseAudio();
      if (screen === 'run' && run && !overlay) {
        if (run.state === 'ready') { clearApproach(); run.needsRequeue = true; }
        else if (run.state === 'correct' || run.state === 'wrong') { clearTimeout(factTimer); run.needsFact = true; }
      }
      stopSpeaking();
    } else {
      resumeAudio();
      if (screen === 'run' && run?.needsRequeue && !overlay) { run.needsRequeue = false; queueEncounter(); }
      else if (screen === 'run' && run?.needsFact && !overlay) { run.needsFact = false; showFact(run.state === 'correct', currentEncounter()); }
    }
  });
}

// ----------------------------------------------------------------------------------------
// Scene construction (lazy) and boot
// ----------------------------------------------------------------------------------------
function setLoading(text, pct) {
  const card = $('#loading');
  if (!card) return;
  const p = card.querySelector('p'); if (p && text) p.textContent = text;
  const bar = card.querySelector('.loading-bar i'); if (bar && pct !== undefined) bar.style.width = `${pct}%`;
}
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
async function ensureRunScene() {
  if (runScene) return;
  showLoading('Building the Power Worlds…', 40);
  await frame();
  const { RunScene } = await import('./run.js?v=2.0.0');
  runScene = new RunScene(engine);
  setLoading('Warming up the gates…', 80);
  await precompile(runScene);
  hideLoading();
}
async function precompile(sc) {
  try {
    sc.resize?.(engine.width, engine.height);
    const job = engine.renderer.compileAsync ? engine.renderer.compileAsync(sc.scene, sc.camera) : Promise.resolve(engine.renderer.compile(sc.scene, sc.camera));
    await Promise.race([job, new Promise((r) => setTimeout(r, 4000))]);
  } catch { /* compile on first frame instead */ }
}
async function ensureStage() {
  if (stage) return;
  const { StageScene } = await import('./stage.js?v=2.0.0');
  stage = new StageScene(engine);
  await precompile(stage);
  stage.onPick = (d) => { if (d.kind === 'hero') { save.hero = d.id; store(); stage.selectHero(d.id); mount(UI.heroesScreen({ selected: d.id })); say(BLUEPRINTS[d.id].greeting); } };
}
function showLoading(text, pct) {
  let card = $('#loading');
  if (!card) { card = UI.h('section', { class: 'loading-card', id: 'loading', 'aria-live': 'polite' }, UI.h('span', { class: 'loading-orbit' }), UI.h('h1', {}, 'Healthy Hero'), UI.h('p', {}, text), UI.h('div', { class: 'loading-bar' }, UI.h('i'))); document.body.append(card); }
  card.classList.remove('done');
  setLoading(text, pct);
}
function hideLoading() { const c = $('#loading'); if (c) { c.classList.add('done'); setTimeout(() => c.remove(), 600); } }

async function boot() {
  const app = $('#app');
  app.replaceChildren(UI.h('canvas', { id: 'scene3d', 'aria-label': 'Healthy Hero 3D world' }), UI.h('div', { id: 'screen' }), UI.h('div', { id: 'modal-root' }));
  showLoading('Opening the Power Worlds…', 10);
  document.body.classList.toggle('reduce-motion', save.motion === 'reduced');
  bindEvents();
  setSfx(save.sfx);
  if (!save.music) setMusic(false);
  if (!webglAvailable()) { hideLoading(); openModal('fallback'); return; }
  engine = new Engine($('#scene3d'), { quality: save.quality || 'auto', reducedMotion: reducedMotion() });
  if (!engine.init()) { hideLoading(); openModal('fallback'); return; }
  engine.on((type) => { if (type === 'contextlost') toast('Graphics paused — reloading…'); });
  try { await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]); } catch { /* fonts optional */ }
  setLoading('Building Wellness Island…', 45);
  await frame();
  const { IslandScene } = await import('./island.js?v=2.0.0');
  island = new IslandScene(engine);
  await precompile(island);
  island.onPick = (d) => {
    if (screen !== 'map') return;
    if (d.kind === 'stone') {
      if (d.index >= save.unlocked) { sfx.wrong(); toast('🔒 Finish the mission before this one to unlock it'); return; }
      sfx.lane(d.index % 3);
      save.selected = d.index; store();
      island.select(d.index);
      renderMapSheet();
      const m = mission(d.index);
      say(`Mission ${m.number}. ${m.title}.`);
    } else if (d.kind === 'monument') {
      sfx.pop();
      island.focusWorld(d.world);
      const card = $('#world-card');
      if (card) { card.replaceChildren(...UI.worldCardContent(d.world)); card.removeAttribute('hidden'); }
      say([WORLDS[d.world].name, TOPIC_FACTS[d.world][0]]);
    }
  };
  setLoading('Ready!', 100);
  engine.start();
  await showTitle();
  hideLoading();
  window.__hh = { engine, get scenes() { return { island, runScene, stage }; }, get state() { return { screen, overlay, run: run && { step: run.step, lane: run.lane, state: run.state, phase: run.phase, hearts: run.hearts, score: run.score, approachStarted: run.approachStarted, results: [...run.results] }, save: JSON.parse(JSON.stringify(save)), quality: engine.qualityLevel }; }, rush, selectLane, changeLane, advanceRun, action, currentEncounter: () => run && currentEncounter(), encounterNarration: () => run && encounterNarration() };
  window.__ready = true;
}

if ('serviceWorker' in navigator && location.protocol === 'https:') addEventListener('load', () => navigator.serviceWorker.register('/sw.js?v=2.0.0').catch(() => {}));
boot();
