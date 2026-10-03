import { Engine } from '../src/engine.js?v=2.0.0';
import { RunScene } from '../src/run.js?v=2.0.0';
import { Q } from '../src/content.js?v=2.0.0';
const p = new URLSearchParams(location.search);
const topic = Number(p.get('topic') || 0);
const engine = new Engine(document.getElementById('c'), { quality: p.get('q') || 'high' });
engine.init();
const run = new RunScene(engine);
run.setHero(p.get('hero') || 'pip');
engine.setScene(run);
const ft = Number(p.get('ft') || 0), fb = Number(p.get('fb') || 0);
if (ft || fb) engine.setFocus({ x: 0, y: ft, w: innerWidth, h: innerHeight - ft - fb });
run.startMission(topic);
const q = Q.find((x) => x.zone === topic);
run.prepareEncounter({ topic, choices: q.choices });
run.setLane(Number(p.get('lane') || 1));
const phase = p.get('phase') || 'parked';
let t = 0; const dt = 1 / 30; const total = Number(p.get('t') || 2.5);
let approachStart = null;
function step(n) { for (let i = 0; i < n; i++) { t += dt; engine.time = t; run.update(dt, t); } }
// Simulate time deterministically
step(Math.round(total / dt));
if (phase === 'approach' || phase === 'resolve') { run.setPhase('answer'); run.setApproach(Date.now() - 15000, 30000); step(30); }
if (phase === 'resolve') { run.resolve({ lane: run.lane, correct: p.get('correct') !== '0', answerLane: q.answer }); step(Math.round(Number(p.get('rt') || 0.6) / dt)); }
if (p.get('next')) { const q2 = Q.find((x) => x.zone === Number(p.get('next'))); run.prepareEncounter({ topic: Number(p.get('next')), choices: q2.choices }); step(Math.round(Number(p.get('nt') || 1.5) / dt)); }
engine.renderer.render(run.scene, run.camera);
window.__ready = true;
