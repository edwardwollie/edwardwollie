import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { applyRocketPart, availableParts, makeFlightMission, missionComplete, readinessScore, ROCKET_PARTS, STAT_INFO, WORLDS, type AgePath, type FlightStats, type RocketPart } from "./flight-data";
import { createSpaceRushMission, type SpaceRushQuestion } from "./space-rush-data";
import { playTone } from "./game-audio";
import { speakFriendly, stopNarration } from "./narrator";

type Screen = "home" | "map" | "mission" | "result" | "family" | "guide";
type Phase = "brief" | "rush" | "build";
type RushStage = "narrating" | "grace" | "running" | "impact";
type Save = { age: AgePath | null; progress: Record<AgePath, number>; stars: Record<string, number>; xp: number; badges: string[]; starCores: number; bestCombo: number; familyWins: number; sound: boolean; ship: string };
type Turn = { stats: FlightStats; energy: number; part: RocketPart };
type Impact = { selected: number; correctLane: number; correct: boolean } | null;

const SAVE_KEY = "spaceflight-academy-save-v1";
const READING_GRACE_SECONDS = 7;
const ANSWER_WINDOWS = [30, 28, 26, 24, 22] as const;
const DEFAULT_SAVE: Save = { age: null, progress: { "5–7": 1, "8–10": 1, "11–12": 1 }, stars: {}, xp: 0, badges: [], starCores: 0, bestCombo: 0, familyWins: 0, sound: true, ship: "Comet" };
const AGES = [
  { age: "5–7" as AgePath, name: "Star Scout", icon: "🛸", color: "#66f4ff", copy: "Listen first, steer through space-science answer gates, then build a mission-ready rocket." },
  { age: "8–10" as AgePath, name: "Orbit Pilot", icon: "🚀", color: "#a88cff", copy: "Race through forces, planets, orbits, navigation, and spacecraft systems before engineering the vehicle." },
  { age: "11–12" as AgePath, name: "Mission Commander", icon: "🛰️", color: "#ff66bf", copy: "Master deeper flight science and orbital concepts, then optimize a spacecraft for the mission." },
];
const FAMILY = [
  { icon: "🎈", title: "Balloon Rocket Race", time: "10 MIN", text: "With a grown-up, thread string through a straw, tape on an inflated balloon, release it, and compare how far it travels. Never put balloons in a young child's mouth." },
  { icon: "🌑", title: "Crater Maker", time: "15 MIN", text: "A grown-up fills a tray with flour and cocoa. Drop small clean balls from different safe heights, then compare crater width. Keep powder away from faces." },
  { icon: "🌙", title: "Moon Detective", time: "5 MIN", text: "Look at the Moon together on several evenings. Draw its shape, notice where it appears, and talk about how sunlight makes the bright part." },
];
const keyFor = (age: AgePath, level: number) => `${age}-${level}`;
function loadSave(): Save { try { const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || "{}"); return { ...DEFAULT_SAVE, ...raw, progress: { ...DEFAULT_SAVE.progress, ...raw.progress }, stars: { ...DEFAULT_SAVE.stars, ...raw.stars }, badges: Array.isArray(raw.badges) ? raw.badges : [] }; } catch { return DEFAULT_SAVE; } }
function narrationRate(age: AgePath) { return age === "5–7" ? .67 : age === "8–10" ? .71 : .74; }
function rotate3<T>(items: readonly T[], amount: number): [T, T, T] { const n = ((amount % 3) + 3) % 3; const out = [...items.slice(n), ...items.slice(0, n)]; return [out[0], out[1], out[2]]; }
function questionNarration(question: SpaceRushQuestion, choices: readonly string[]) { return `${question.prompt} Choice one: ${choices[0]}. Choice two: ${choices[1]}. Choice three: ${choices[2]}.`; }

export default function SpaceflightAcademyV2() {
  const [save, setSave] = useState<Save>(loadSave);
  const [screen, setScreen] = useState<Screen>("home");
  const [level, setLevel] = useState(1);
  const [phase, setPhase] = useState<Phase>("brief");
  const [shields, setShields] = useState(3);
  const [combo, setCombo] = useState(0);
  const [bestRunCombo, setBestRunCombo] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [lane, setLane] = useState(1);
  const [rushStage, setRushStage] = useState<RushStage>("narrating");
  const [graceLeft, setGraceLeft] = useState(READING_GRACE_SECONDS);
  const [timeLeft, setTimeLeft] = useState<number>(ANSWER_WINDOWS[0]);
  const [impact, setImpact] = useState<Impact>(null);
  const [narrationNonce, setNarrationNonce] = useState(0);
  const [message, setMessage] = useState("Mission Control is standing by.");
  const [stats, setStats] = useState<FlightStats>({ thrust: 0, fuel: 0, stability: 0, mission: 0 });
  const [energy, setEnergy] = useState(0);
  const [history, setHistory] = useState<Turn[]>([]);
  const laneRef = useRef(lane);
  const impactTimer = useRef<number | null>(null);

  const age = save.age ?? "5–7";
  const mission = useMemo(() => makeFlightMission(age, level), [age, level]);
  const questions = useMemo(() => createSpaceRushMission(age, level), [age, level]);
  const question = questions[questionIndex];
  const laneChoices = useMemo(() => question ? rotate3(question.options, level + questionIndex) : ["", "", ""] as [string, string, string], [question, level, questionIndex]);
  const answerWindow = ANSWER_WINDOWS[Math.min(4, Math.floor((level - 1) / 6))];
  const parts = availableParts(age);
  const ready = missionComplete(mission, stats);
  const boss = level % 5 === 0;
  const totalStars = Object.values(save.stars).reduce((sum, value) => sum + value, 0);

  useEffect(() => { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); }, [save]);
  useEffect(() => { laneRef.current = lane; }, [lane]);
  useEffect(() => () => { stopNarration(); if (impactTimer.current) window.clearTimeout(impactTimer.current); }, []);
  const sound = useCallback((kind: Parameters<typeof playTone>[0]) => { if (save.sound) playTone(kind); }, [save.sound]);

  const resetRush = useCallback(() => {
    setShields(3); setCombo(0); setBestRunCombo(0); setCorrectCount(0); setMistakes(0); setQuestionIndex(0); setLane(1); setImpact(null);
    setGraceLeft(READING_GRACE_SECONDS); setTimeLeft(answerWindow); setRushStage("narrating"); setNarrationNonce(value => value + 1);
    setMessage("Mission Control will read each question and all three choices before the timer begins.");
  }, [answerWindow]);

  const begin = (chosen: number) => {
    if (chosen > save.progress[age]) return;
    const next = makeFlightMission(age, chosen);
    setLevel(chosen); setStats(next.start); setEnergy(next.energy); setHistory([]); setPhase("brief"); setScreen("mission");
    setShields(3); setCombo(0); setBestRunCombo(0); setCorrectCount(0); setMistakes(0); setQuestionIndex(0); setLane(1); setImpact(null); setRushStage("narrating");
  };

  const resolveLane = useCallback((selected: number) => {
    if (screen !== "mission" || phase !== "rush" || rushStage !== "running" || !question) return;
    const chosen = laneChoices[selected];
    const correctLane = laneChoices.findIndex(item => item === question.correct);
    const isCorrect = chosen === question.correct;
    stopNarration();
    setRushStage("impact"); setImpact({ selected, correctLane, correct: isCorrect });
    if (isCorrect) {
      const nextCombo = combo + 1;
      setCombo(nextCombo); setBestRunCombo(value => Math.max(value, nextCombo)); setCorrectCount(value => value + 1);
      setMessage(`Correct! ${question.explanation}`); sound("collect");
    } else {
      setCombo(0); setMistakes(value => value + 1); setShields(value => Math.max(0, value - 1));
      setMessage(`Keep flying! The correct answer is ${question.correct}. ${question.explanation}`); sound("bump");
    }
    if (impactTimer.current) window.clearTimeout(impactTimer.current);
    impactTimer.current = window.setTimeout(() => {
      if (questionIndex >= questions.length - 1) {
        setPhase("build"); setMessage("Space Rush complete. Now engineer a spacecraft that meets both readiness targets."); sound("win");
      } else {
        setQuestionIndex(value => value + 1); setLane(1); setImpact(null); setNarrationNonce(value => value + 1);
      }
    }, 1350);
  }, [combo, laneChoices, phase, question, questionIndex, questions.length, rushStage, screen, sound]);

  useEffect(() => {
    if (screen !== "mission" || phase !== "rush" || !question) return;
    let cancelled = false;
    setRushStage("narrating"); setGraceLeft(READING_GRACE_SECONDS); setTimeLeft(answerWindow); setImpact(null);
    void speakFriendly(questionNarration(question, laneChoices), narrationRate(age)).then(() => { if (!cancelled) setRushStage("grace"); });
    return () => { cancelled = true; stopNarration(); };
  }, [age, answerWindow, laneChoices, narrationNonce, phase, question, screen]);

  useEffect(() => {
    if (rushStage !== "grace" || phase !== "rush") return;
    const timer = window.setInterval(() => setGraceLeft(value => {
      if (value <= 1) { window.clearInterval(timer); setRushStage("running"); return 0; }
      return value - 1;
    }), 1000);
    return () => window.clearInterval(timer);
  }, [phase, rushStage]);

  useEffect(() => {
    if (rushStage !== "running" || phase !== "rush") return;
    const started = performance.now(); setTimeLeft(answerWindow);
    const ticker = window.setInterval(() => setTimeLeft(Math.max(0, answerWindow - (performance.now() - started) / 1000)), 100);
    const collision = window.setTimeout(() => resolveLane(laneRef.current), answerWindow * 1000);
    return () => { window.clearInterval(ticker); window.clearTimeout(collision); };
  }, [answerWindow, phase, resolveLane, rushStage]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (screen !== "mission") return;
      const key = event.key.toLowerCase();
      if (phase === "brief" && event.code === "Space") { event.preventDefault(); setPhase("rush"); resetRush(); return; }
      if (phase === "rush") {
        if (key === "a" || key === "arrowleft") { event.preventDefault(); if (rushStage !== "impact") { setLane(value => Math.max(0, value - 1)); sound("move"); } }
        if (key === "d" || key === "arrowright") { event.preventDefault(); if (rushStage !== "impact") { setLane(value => Math.min(2, value + 1)); sound("move"); } }
        if ((key === "w" || key === "arrowup" || key === "enter" || event.code === "Space") && rushStage === "running") { event.preventDefault(); resolveLane(laneRef.current); }
        return;
      }
      if (phase === "build" && event.code === "Space" && ready) { event.preventDefault(); finish(); }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  });

  const addPart = (part: RocketPart) => { if (part.cost > energy || ready) return; setHistory(items => [...items, { stats, energy, part }]); setStats(value => applyRocketPart(value, part)); setEnergy(value => value - part.cost); setMessage(part.fact); sound("build"); void speakFriendly(`${part.name}. ${part.fact}`, narrationRate(age)); };
  const undo = () => { const last = history.at(-1); if (!last) return; setStats(last.stats); setEnergy(last.energy); setHistory(items => items.slice(0, -1)); };
  const resetBuild = () => { setStats(mission.start); setEnergy(mission.energy); setHistory([]); setMessage("Rocket bay reset. Try another plan—there is no penalty."); };
  const finish = () => {
    if (!ready) return;
    const stars = mistakes === 0 && energy >= 4 ? 3 : mistakes <= 2 && energy >= 2 ? 2 : 1;
    const xp = 190 + level * 12 + stars * 30 + correctCount * 6;
    setSave(current => ({ ...current, progress: { ...current.progress, [age]: Math.max(current.progress[age], Math.min(30, level + 1)) }, stars: { ...current.stars, [keyFor(age, level)]: Math.max(current.stars[keyFor(age, level)] || 0, stars) }, xp: current.xp + xp, starCores: current.starCores + stars + (boss ? 3 : 0), bestCombo: Math.max(current.bestCombo, bestRunCombo), badges: [...new Set([...current.badges, ...(boss ? [`${mission.world.name} Ace`] : [])])] }));
    sound("win"); setScreen("result");
  };

  if (!save.age) return <main className="sf2-onboard"><section><div className="sf2-logo">🚀</div><p className="sf2-kicker">FLEXZONIC SPACE CORPS</p><h1>SPACEFLIGHT <span>ACADEMY</span></h1><p>Listen, think, steer through answer gates, and engineer rockets through ninety age-adaptive missions.</p><div className="sf2-age-grid">{AGES.map(item => <button key={item.age} style={{ "--accent": item.color } as CSSProperties} onClick={() => setSave(current => ({ ...current, age: item.age }))}><span>{item.icon}</span><small>AGES {item.age}</small><b>{item.name}</b><p>{item.copy}</p></button>)}</div></section></main>;
  const Top = () => <header className="sf2-top"><button className="sf2-brand" onClick={() => setScreen("home")}>🚀 <b>SPACEFLIGHT</b> <span>ACADEMY</span></button><div><span>★ {totalStars}</span><span>✦ {save.starCores}</span><span>⚡ {save.xp} XP</span></div><button aria-label="Toggle sound" onClick={() => setSave(current => ({ ...current, sound: !current.sound }))}>{save.sound ? "🔊" : "🔇"}</button></header>;

  if (screen === "home") return <><Top/><main className="sf2-home"><section><p className="sf2-kicker">LISTEN · RUSH · BUILD · DISCOVER</p><h1>YOUR NEXT<br/><span>MISSION AWAITS</span></h1><p>Fly a continuous three-lane learning rush, clear six space-science gates, then use your engineering skills to build the mission spacecraft.</p><div className="sf2-actions"><button className="primary" onClick={() => setScreen("map")}>LAUNCH MISSION</button><button onClick={() => setScreen("family")}>FAMILY SPACE LAB</button><button onClick={() => setScreen("guide")}>ROCKET GUIDE</button></div><div className="sf2-profile"><span>{AGES.find(item => item.age === age)?.icon}</span><div><small>ACTIVE CREW · AGES {age}</small><b>{AGES.find(item => item.age === age)?.name}</b></div><button onClick={() => setSave(current => ({ ...current, age: null }))}>CHANGE</button></div></section><section className="sf2-orbit"><div className="sf2-planet">🌍</div><div className="sf2-ship">🚀</div><div className="sf2-moon">🌙</div><div className="sf2-status"><small>MISSION NETWORK</small><b>{save.progress[age]} / 30 OPEN</b><span>RUSH SYSTEM READY</span></div></section></main></>;
  if (screen === "map") return <><Top/><main className="sf2-content"><div className="sf2-heading"><div><p className="sf2-kicker">30 PLAYABLE MISSIONS · AGES {age}</p><h2>GALACTIC MISSION MAP</h2></div><button onClick={() => setScreen("home")}>HOME</button></div><section className="sf2-worlds">{WORLDS.map((world, zone) => <article key={world.name} style={{ "--accent": world.color } as CSSProperties}><div><span>{world.icon}</span><small>SECTOR {zone + 1}</small><h3>{world.name}</h3><p>{world.detail}</p></div><div className="sf2-levels">{Array.from({ length: 5 }, (_, index) => zone * 5 + index + 1).map(item => <button key={item} disabled={item > save.progress[age]} className={item % 5 === 0 ? "boss" : ""} onClick={() => begin(item)}><b>{item > save.progress[age] ? "🔒" : item % 5 === 0 ? "BOSS" : item}</b><span>{"★".repeat(save.stars[keyFor(age, item)] || 0)}</span></button>)}</div></article>)}</section></main></>;
  if (screen === "family") return <><Top/><main className="sf2-content"><div className="sf2-heading"><div><p className="sf2-kicker">PLAY TOGETHER OFF-SCREEN</p><h2>FAMILY SPACE LAB</h2><p>Short, safe activities designed for a child and grown-up to investigate together.</p></div><button onClick={() => setScreen("home")}>HOME</button></div><section className="sf2-family">{FAMILY.map(activity => <article key={activity.title}><span>{activity.icon}</span><small>{activity.time} · GROWN-UP HELPER</small><h3>{activity.title}</h3><p>{activity.text}</p><button onClick={() => { void speakFriendly(activity.title + ". " + activity.text, .69); setSave(current => ({ ...current, familyWins: current.familyWins + 1 })); }}>READ &amp; START</button></article>)}</section><div className="sf2-family-note">👨‍👩‍👧 <b>Family mission tip:</b> Ask your young pilot to predict first, observe second, and explain what changed afterward.</div></main></>;
  if (screen === "guide") return <><Top/><main className="sf2-content"><div className="sf2-heading"><div><p className="sf2-kicker">DISCOVERY DECK</p><h2>ROCKET PARTS</h2></div><button onClick={() => setScreen("home")}>HOME</button></div><section className="sf2-guide">{ROCKET_PARTS.map(part => <article key={part.id}><span>{part.icon}</span><small>{part.category}</small><h3>{part.name}</h3><p>{part.fact}</p><button onClick={() => void speakFriendly(part.fact, .7)}>🔊 LISTEN</button></article>)}</section></main></>;
  if (screen === "result") return <><Top/><main className="sf2-result"><section><div className="sf2-award">🏆</div><p className="sf2-kicker">MISSION {level} COMPLETE</p><h2>{boss ? "SECTOR BOSS CLEARED!" : "ORBIT ACHIEVED!"}</h2><p>You cleared the Space Rush gates, learned from every collision, and built a spacecraft ready for {mission.objective.toLowerCase()}.</p><div className="sf2-result-stars">{"★".repeat(save.stars[keyFor(age, level)] || 1)}</div><p className="sf2-result-detail">Rush score: {correctCount}/6 correct · Best combo: {bestRunCombo} · Mistakes never ended the mission.</p><div className="sf2-actions"><button onClick={() => setScreen("map")}>MISSION MAP</button><button className="primary" onClick={() => begin(Math.min(30, level + 1))}>{level === 30 ? "REPLAY FINALE" : "NEXT MISSION"}</button></div></section></main></>;

  const progress = rushStage === "narrating" ? .04 : rushStage === "grace" ? .08 : rushStage === "running" ? Math.min(.92, 1 - timeLeft / answerWindow) : .96;
  const gateTop = 10 + progress * 58;
  const stageLabel = rushStage === "narrating" ? "LISTENING" : rushStage === "grace" ? `THINK ${graceLeft}s` : rushStage === "running" ? `ANSWER ${Math.ceil(timeLeft)}s` : impact?.correct ? "CORRECT!" : "KEEP FLYING!";

  return <main className="sf2-mission"><header><button onClick={() => { stopNarration(); setScreen("map"); }}>✕</button><div><small>MISSION {level} · {mission.world.name}</small><b>{boss ? "☄️ BOSS: METEOR COMMAND" : mission.objective}</b></div><div className="sf2-hud"><span>🛡️ {shields}</span><span>✅ {correctCount}/6</span><span>🔥 {combo}</span></div><button onClick={() => phase === "rush" ? setNarrationNonce(value => value + 1) : void speakFriendly(`${mission.brief} ${mission.tip}`, narrationRate(age))}>🔊 READ</button></header>{phase === "brief" ? <section className="sf2-brief"><div className="sf2-brief-art">{boss ? "☄️" : mission.world.icon}</div><p className="sf2-kicker">MISSION BRIEFING</p><h1>{mission.objective}</h1><p>First, clear six space-science answer gates in a continuous three-lane flight. The question and all answers are read aloud before a 7-second thinking period and the answer timer. Correct gates split open. Wrong answers cause a crash-through animation, but the mission keeps going. Then build the rocket.</p><div className="sf2-controls"><span><b>A / ←</b> LEFT LANE</span><span><b>D / →</b> RIGHT LANE</span><span><b>W / ↑</b> BOOST / ANSWER</span><span><b>SPACE</b> BOOST / ANSWER</span></div><button className="primary" onClick={() => { setPhase("rush"); resetRush(); }}>START SPACE RUSH</button></section> : phase === "rush" && question ? <section className="sf2-rush-layout"><div className={`sf2-rush-course stage-${rushStage}`}><div className="sf2-speed-lines"/><div className="sf2-course-horizon">{boss ? "☄️ METEOR COMMAND" : mission.world.name.toUpperCase()}</div>{laneChoices.map((choice, index) => { const isCorrectGate = impact && index === impact.correctLane; const isCrash = impact && index === impact.selected && !impact.correct; const classes = ["sf2-rush-gate", lane === index ? "selected" : "", isCorrectGate && impact?.correct ? "open" : "", isCrash ? "crash" : ""].filter(Boolean).join(" "); return <button key={`${question.id}-${index}`} className={classes} style={{ left: `${16.67 + index * 33.33}%`, top: `${gateTop}%` }} onClick={() => rushStage !== "impact" && setLane(index)}><span className="sf2-gate-half left"/><span className="sf2-gate-half right"/><small>LANE {index + 1}</small><b>{choice}</b></button>; })}<div className="sf2-runner-ship" style={{ left: `${16.67 + lane * 33.33}%` }}><span>🚀</span><i/><i/></div><div className="sf2-course-meter"><i style={{ width: `${Math.max(4, progress * 100)}%` }}/></div></div><aside className="sf2-rush-panel"><div className="sf2-rush-status"><span>{question.icon} {question.topic}</span><b>{stageLabel}</b></div><small>GATE {questionIndex + 1} OF 6</small><h2>{question.prompt}</h2><div className="sf2-choice-list">{laneChoices.map((choice, index) => <button key={choice} className={lane === index ? "active" : ""} disabled={rushStage === "impact"} onClick={() => setLane(index)}><span>{index + 1}</span>{choice}</button>)}</div><div className="sf2-message">{message}</div><div className="sf2-rush-actions"><button onClick={() => setNarrationNonce(value => value + 1)}>🔊 READ AGAIN</button><button className="primary" disabled={rushStage !== "running"} onClick={() => resolveLane(lane)}>🚀 BOOST THROUGH LANE {lane + 1}</button></div><p className="sf2-timing-note">Narration first · 7s thinking time · {answerWindow}s answer window</p></aside></section> : <section className="sf2-build-layout"><div className="sf2-readiness"><p className="sf2-kicker">ORBITAL BUILD BAY</p><h2>ENGINEER THE ROCKET</h2><p>You cleared {correctCount} of 6 learning gates. Now focus on {STAT_INFO[mission.focus].name} and meet the total readiness goal before launch.</p><div className="sf2-meters">{(Object.keys(stats) as (keyof FlightStats)[]).map(key => <div key={key}><span>{STAT_INFO[key].icon} {STAT_INFO[key].name}<b>{stats[key]}</b></span><i><em style={{ width: `${stats[key]}%`, background: STAT_INFO[key].color }}/></i></div>)}</div><div className="sf2-goals"><span className={stats[mission.focus] >= mission.target ? "met" : ""}>FOCUS {stats[mission.focus]}/{mission.target}</span><span className={readinessScore(stats) >= mission.scoreGoal ? "met" : ""}>TOTAL {readinessScore(stats)}/{mission.scoreGoal}</span><b>⚡ {energy} ENERGY</b></div><div className="sf2-message">{message}</div><div className="sf2-build-actions"><button onClick={undo} disabled={!history.length}>↶ UNDO</button><button onClick={resetBuild}>↻ RESET</button><button className="primary" disabled={!ready} onClick={finish}>{ready ? "SPACE · LAUNCH" : "BUILD TO LAUNCH"}</button></div></div><div className="sf2-parts">{parts.map(part => <button key={part.id} disabled={part.cost > energy || ready} onClick={() => addPart(part)}><span>{part.icon}</span><div><small>{part.category}</small><b>{part.name}</b><em>{Object.entries(part.effects).map(([key, value]) => `+${value} ${STAT_INFO[key as keyof typeof STAT_INFO].name}`).join(" · ")}</em></div><strong>⚡{part.cost}</strong></button>)}</div></section>}</main>;
}
