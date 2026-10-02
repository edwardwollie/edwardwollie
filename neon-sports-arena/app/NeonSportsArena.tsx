/* eslint-disable @typescript-eslint/no-explicit-any,react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ArenaEngine, CameraMode, EngineSettings } from "./arena-engine";
import { MISSIONS, MODE_INFO, TEAMS, UPGRADES, type SportMode, type UpgradeKey } from "./arena-data";

const VERSION = "2.0.0";

type Settings = { camera: CameraMode; quality: "auto" | "high" | "low"; music: boolean; replays: boolean };
type Save = {
  unlocked: number;
  credits: number;
  stars: Record<number, number>;
  upgrades: Record<UpgradeKey, number>;
  trained: boolean;
  team: number;
  wins: number;
  bestCombo: number;
  modeWins: Record<SportMode, number>;
  goals: number;
  assists: number;
  perfects: number;
  dunks: number;
  tackles: number;
  saves: number;
  tutorialVersion: number;
  settings: Settings;
};

const fresh: Save = {
  unlocked: 1,
  credits: 420,
  stars: {},
  upgrades: { speed: 0, power: 0, shield: 0, energy: 0 },
  trained: false,
  team: 0,
  wins: 0,
  bestCombo: 0,
  modeWins: { goal: 0, hoops: 0, capture: 0, targets: 0 },
  goals: 0,
  assists: 0,
  perfects: 0,
  dunks: 0,
  tackles: 0,
  saves: 0,
  tutorialVersion: 0,
  settings: { camera: "chase", quality: "auto", music: true, replays: true },
};

const tutorials = [
  { icon: "✥", title: "SKATE IN FULL 3D", text: "WASD or the arrow keys skate relative to the camera. Drag with the middle mouse button (or the right side of a phone screen) to look around; V switches between chase, broadcast and tactical cameras." },
  { icon: "◉", title: "CONTROL THE OBJECTIVE", text: "Skate into the ball, orb or core to collect it. A glowing ring marks whoever has it and the radar shows everyone. An arrow on the edge of the screen points to a ball you can't see." },
  { icon: "✦", title: "CHARGE THE PERFECT SHOT", text: "Hold Space, the left mouse button or ACTION to charge, then release. Let go while the aim line glows lime for a PERFECT strike: faster, more accurate and harder for keeper drones to stop." },
  { icon: "⇄", title: "PLAY AS A TEAM", text: "From match 5 you get AI teammates. Press F, right-click or PASS to pass to the best-placed teammate, or press it while a teammate has the ball to call for it back. Assists are tracked in your records." },
  { icon: "⤒", title: "JUMP, LAUNCH, DUNK", text: "C or JUMP hops over tackles. In Gravity Hoops, skate over a lime launch pad while carrying the orb, then press ACTION in the air near the ring to slam dunk." },
  { icon: "⬡", title: "BOOST, TACKLE, OVERDRIVE", text: "Shift boosts, E charges a pulse tackle that steals the ball, and Q unleashes Team Overdrive at 100 energy. A red ring under a rival means a tackle is coming, so jump or boost away." },
];

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.max(0, seconds) % 60).padStart(2, "0")}`;
}

function rivalTeamFor(team: number, missionId: number) {
  let index = (team + 1 + missionId) % TEAMS.length;
  if (index === team) index = (index + 1) % TEAMS.length;
  return index;
}


export default function NeonSportsArena() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const radar = useRef<HTMLCanvasElement>(null);
  const gameRoot = useRef<HTMLElement>(null);
  const engine = useRef<ArenaEngine | null>(null);
  const [save, setSave] = useState<Save>(fresh);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState(0);
  const [screen, setScreen] = useState<"arena" | "tutorial" | "play" | "complete" | "failed" | "records">("arena");
  const [step, setStep] = useState(0);
  const [hud, setHud] = useState<any>({ score: 0, rival: 0, target: 3, rivalTarget: 2, time: 120, shield: 100, energy: 55, combo: 0, boost: 0, tackle: 0, overdrive: 0, possession: false, phase: "intro" });
  const [toast, setToast] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [matchKey, setMatchKey] = useState(0);
  const toastTimer = useRef<number | null>(null);
  const mission = MISSIONS[selected];
  const mode = MODE_INFO[mission.mode];
  const team = TEAMS[save.team];
  const rivalTeam = TEAMS[rivalTeamFor(save.team, mission.id)];
  const totalStars = useMemo(() => Object.values(save.stars).reduce((sum, value) => sum + value, 0), [save.stars]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("neon-sports-arena-save-v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        setSave({ ...fresh, ...parsed, settings: { ...fresh.settings, ...(parsed.settings || {}) }, modeWins: { ...fresh.modeWins, ...(parsed.modeWins || {}) } });
        setSelected(Math.max(0, Math.min(29, (parsed.unlocked || 1) - 1)));
      }
      if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem("neon-sports-arena-save-v1", JSON.stringify(save)); } catch {}
  }, [save, loaded]);

  const message = useCallback((text: string, kind: string) => {
    setToast({ text, kind, id: Math.random() });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), kind === "perfect" ? 1400 : 1150);
  }, []);
  const complete = useCallback((value: any) => { setResult(value); setScreen("complete"); }, []);
  const fail = useCallback((value: any) => { setResult(value); setScreen("failed"); }, []);
  const settings = save.settings;
  const engineSettings: EngineSettings = useMemo(() => ({ camera: settings.camera, quality: settings.quality, music: settings.music, replays: settings.replays, sfx: true }),
    // Settings are read once per match; changing them mid-match applies to the next one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matchKey]);

  useEffect(() => {
    if (screen !== "play" || !canvas.current) return;
    let cancelled = false;
    let game: ArenaEngine | null = null;
    setReady(false);
    void import("./arena-engine").then(({ ArenaEngine: Game }) => {
      if (cancelled || !canvas.current) return;
      game = new Game(canvas.current, mission, save.upgrades, team, { hud: setHud, message, complete, fail, ready: () => setReady(true) },
        { settings: engineSettings, rivalTeam, root: gameRoot.current, radar: radar.current });
      engine.current = game;
    });
    return () => {
      cancelled = true;
      game?.destroy();
      if (engine.current === game) engine.current = null;
    };
    // The match is rebuilt only when a new match starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, matchKey]);


  const startMatch = () => { setMatchKey((k) => k + 1); setHud((h: any) => ({ ...h, phase: "intro", score: 0, rival: 0, time: mission.time })); setScreen("play"); };
  const launch = () => {
    if (save.trained && save.tutorialVersion >= 2) startMatch();
    else { setStep(0); setScreen("tutorial"); }
  };

  const nextTutorial = () => {
    if (step < tutorials.length - 1) setStep((value) => value + 1);
    else {
      setSave((current) => ({ ...current, trained: true, tutorialVersion: 2 }));
      startMatch();
    }
  };

  const claim = () => {
    const stars = result.rival === 0 && result.shield >= 70 ? 3 : result.shield >= 35 ? 2 : 1;
    const bonus = result.time * 4 + result.combo * 25 + (result.perfects || 0) * 15 + (result.assists || 0) * 30 + (result.dunks || 0) * 40;
    setSave((current) => ({
      ...current,
      unlocked: Math.max(current.unlocked, Math.min(30, mission.id + 1)),
      credits: current.credits + mission.reward + bonus,
      stars: { ...current.stars, [mission.id]: Math.max(stars, current.stars[mission.id] || 0) },
      wins: current.wins + 1,
      bestCombo: Math.max(current.bestCombo, result.combo),
      modeWins: { ...current.modeWins, [mission.mode]: current.modeWins[mission.mode] + 1 },
      goals: current.goals + (result.goals || 0), assists: current.assists + (result.assists || 0), perfects: current.perfects + (result.perfects || 0),
      dunks: current.dunks + (result.dunks || 0), tackles: current.tackles + (result.tackles || 0), saves: current.saves + (result.saves || 0),
    }));
    if (mission.id < 30) setSelected(mission.id);
    setScreen("arena");
  };

  const buy = (key: UpgradeKey) => {
    const level = save.upgrades[key];
    const cost = 200 * (level + 1);
    if (level >= 5 || save.credits < cost) return;
    setSave((current) => ({ ...current, credits: current.credits - cost, upgrades: { ...current.upgrades, [key]: level + 1 } }));
  };
  const setSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => setSave((current) => ({ ...current, settings: { ...current.settings, [key]: value } }));

  // --- Mobile analog stick and look zone -----------------------------------
  const stick = useRef<{ id: number; x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const stickDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    stick.current = { id: e.pointerId, x: r.left + r.width / 2, y: r.top + r.height / 2 };
    stickMove(e);
  };
  const stickMove = (e: React.PointerEvent) => {
    if (!stick.current || stick.current.id !== e.pointerId) return;
    const R = 46, dx = e.clientX - stick.current.x, dy = e.clientY - stick.current.y, d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / R);
    const x = dx / d * k, y = dy / d * k;
    setKnob({ x: x * R, y: y * R });
    engine.current?.setMove(x, y);
  };
  const stickUp = () => { stick.current = null; setKnob({ x: 0, y: 0 }); engine.current?.clearMove(); };
  const look = useRef<{ id: number; x: number; y: number } | null>(null);
  const lookDown = (e: React.PointerEvent) => { look.current = { id: e.pointerId, x: e.clientX, y: e.clientY }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); if (hud.phase === "intro" || hud.phase === "replay") engine.current?.skip(); };
  const lookMove = (e: React.PointerEvent) => {
    if (!look.current || look.current.id !== e.pointerId) return;
    engine.current?.look(e.clientX - look.current.x, e.clientY - look.current.y);
    look.current.x = e.clientX; look.current.y = e.clientY;
  };
  const lookUp = () => { look.current = null; };
  const fire = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault(); e.stopPropagation();
    const game = engine.current as unknown as Record<string, () => void> | null, name = e.currentTarget.dataset.act;
    if (game && name) game[name]();
  };

  const actionLabel = mission.mode === "targets" ? "BLAST" : mission.mode === "hoops" ? "SHOOT" : mission.mode === "capture" ? "THROW" : "KICK";
  const squad = mission.allies ? `YOU + ${mission.allies} TEAMMATE${mission.allies > 1 ? "S" : ""}` : "SOLO";

  if (!loaded) return <main className="arena-loading">IGNITING NEON SPORTS ARENA…</main>;

  return <main className={`sports ${screen}`}>
    {screen === "arena" && <>
      <header><div className="brand"><i>NS</i><span><b>NEON SPORTS</b><small>ARENA LEAGUE · FULL 3D {VERSION.slice(0, 3)}</small></span></div><nav><button onClick={() => setScreen("records")}>RECORDS</button><button onClick={() => setShowSettings(true)}>SETTINGS</button><strong>⬡ {save.credits}</strong></nav></header>
      <section className="sports-hero"><div><small>FLEXZONIC ARENA NETWORK // SEASON ONLINE</small><h1>COMPETE.<br/><em>UPGRADE.</em><br/>DOMINATE.</h1><p>Four futuristic sports in fully 3D stadiums. Skate with your squad, charge perfect shots past keeper drones, slam dunk off launch pads and climb from the rookie deck to the Infinity Championship.</p><div className="hero-actions"><button className="primary" onClick={launch}>ENTER MATCH {mission.id} →</button></div></div><article className="match-card" style={{ "--mission": mission.color } as React.CSSProperties}><small>NEXT EVENT</small><b>{String(mission.id).padStart(2, "0")}</b><i>{mode.icon}</i><h2>{mission.name}</h2><span>{mode.name} · {mission.arena}</span><p>FIRST TO {mission.target} · {squad} VS {mission.bots} · {formatTime(mission.time)}{mission.keeper ? " · KEEPER DRONES" : ""}</p><div className="versus"><span style={{ color: team.color }}>{team.name}</span><em>VS</em><span style={{ color: rivalTeam.color }}>{rivalTeam.name}</span></div></article></section>
      <section className="arena-grid"><div className="schedule"><div className="section-head"><b>SEASON SCHEDULE</b><span>{save.unlocked}/30 OPEN</span></div>{MISSIONS.map((item, index) => <button key={item.id} disabled={item.id > save.unlocked} className={selected === index ? "active" : ""} onClick={() => setSelected(index)} style={{ "--mission": item.color } as React.CSSProperties}><i>{String(item.id).padStart(2, "0")}</i><span><b>{item.name}</b><small>{MODE_INFO[item.mode].name} · {item.arena}{item.allies ? ` · +${item.allies} MATES` : ""}</small></span><strong>{item.id > save.unlocked ? "LOCKED" : `${"★".repeat(save.stars[item.id] || 0)}${"☆".repeat(3 - (save.stars[item.id] || 0))}`}</strong></button>)}</div>
      <aside><div className="event-brief"><small>EVENT RULES</small><h2>{mode.icon} {mode.name}</h2><p>{mode.instruction}</p><div><span>YOUR TARGET<b>{mission.target}</b></span><span>RIVAL LIMIT<b>{mission.rivalTarget}</b></span><span>TIME<b>{formatTime(mission.time)}</b></span><span>REWARD<b>⬡ {mission.reward}</b></span><span>SQUAD<b>{mission.allies ? `+${mission.allies}` : "SOLO"}</b></span><span>RIVALS<b>{mission.bots}{mission.keeper ? " + GK" : ""}</b></span></div></div>
      <div className="team-picker"><small>CHOOSE YOUR TEAM</small><div>{TEAMS.map((item, index) => { const open = index <= Math.floor((save.unlocked - 1) / 5); return <button key={item.name} disabled={!open} className={save.team === index ? "active" : ""} onClick={() => setSave((current) => ({ ...current, team: index }))} style={{ "--team": item.color } as React.CSSProperties}><i>{open ? item.icon : "🔒"}</i><span>{open ? item.name : `UNLOCK AT ${index * 5 + 1}`}</span></button>; })}</div></div>
      <div className="upgrade-lab"><small>ATHLETE LAB</small>{UPGRADES.map((upgrade) => { const level = save.upgrades[upgrade.key]; const cost = 200 * (level + 1); return <button key={upgrade.key} disabled={level >= 5 || save.credits < cost} onClick={() => buy(upgrade.key)}><i style={{ color: upgrade.color }}>{upgrade.icon}</i><span><b>{upgrade.name}</b><small>{upgrade.detail}</small></span><strong>{level >= 5 ? "MAX" : `⬡ ${cost}`}<em>{"●".repeat(level)}{"○".repeat(5 - level)}</em></strong></button>; })}</div></aside></section>
      {showSettings && <div className="overlay" onClick={() => setShowSettings(false)}><article className="tutorial settings" onClick={(e) => e.stopPropagation()}><small>MATCH SETTINGS</small><h2>SETTINGS</h2>
        <label>DEFAULT CAMERA<div className="seg">{(["chase", "broadcast", "tactical"] as CameraMode[]).map((c) => <button key={c} className={settings.camera === c ? "on" : ""} onClick={() => setSetting("camera", c)}>{c.toUpperCase()}</button>)}</div></label>
        <label>GRAPHICS<div className="seg">{(["auto", "high", "low"] as const).map((q) => <button key={q} className={settings.quality === q ? "on" : ""} onClick={() => setSetting("quality", q)}>{q.toUpperCase()}</button>)}</div></label>
        <label>MUSIC<div className="seg"><button className={settings.music ? "on" : ""} onClick={() => setSetting("music", true)}>ON</button><button className={!settings.music ? "on" : ""} onClick={() => setSetting("music", false)}>OFF</button></div></label>
        <label>INSTANT REPLAYS<div className="seg"><button className={settings.replays ? "on" : ""} onClick={() => setSetting("replays", true)}>ON</button><button className={!settings.replays ? "on" : ""} onClick={() => setSetting("replays", false)}>OFF</button></div></label>
        <p>LOW graphics turns off shadows, light shafts and film grain and seats a smaller crowd. AUTO picks LOW on phones.</p>
        <div className="row"><button className="ghost" onClick={() => { setStep(0); setScreen("tutorial"); setShowSettings(false); }}>REPLAY TUTORIAL</button><button className="primary" onClick={() => setShowSettings(false)}>DONE</button></div></article></div>}
    </>}

    {screen === "tutorial" && <div className="overlay"><article className="tutorial"><small>ROOKIE BOOT CAMP // {step + 1} OF {tutorials.length}</small><i>{tutorials[step].icon}</i><h2>{tutorials[step].title}</h2><p>{tutorials[step].text}</p><div className="tutorial-dots">{tutorials.map((_, index) => <span key={index} className={index === step ? "on" : ""}/>)}</div><button className="primary" onClick={nextTutorial}>{step < tutorials.length - 1 ? "NEXT DRILL" : "START MATCH"} →</button></article></div>}

    {screen === "play" && <section className={`game phase-${hud.phase}${hud.paused ? " paused" : ""}`} ref={gameRoot} style={{ "--home": team.color, "--rival": rivalTeam.color, "--accent": mission.color } as React.CSSProperties}>
      <canvas ref={canvas}/>
      {!ready && <div className="game-loading"><small>{mission.arena.toUpperCase()}</small><b>BUILDING 3D ARENA…</b><i/></div>}
      <div className="scoreboard"><span><small>{team.name}</small><b>{hud.score}/{hud.target}</b></span><div><small>{mission.name}</small><strong className={hud.time <= 10 ? "hurry" : ""}>{formatTime(hud.time)}</strong><em>{mode.name}</em></div><span><small>{rivalTeam.name}</small><b className="rival">{hud.rival}/{hud.rivalTarget}</b></span></div>
      <canvas className="radar" ref={radar} width={104} height={152}/>
      <div className="player-status"><span>SHIELD {hud.shield}%</span><i><em style={{ width: `${hud.shield}%` }}/></i><span>ENERGY {hud.energy}%{hud.overdriveReady ? " · OVERDRIVE READY" : ""}</span><i className="energy"><em style={{ width: `${hud.energy}%` }}/></i><b>{hud.possession ? "BALL SECURED" : hud.teamBall ? "TEAMMATE ON THE BALL · F TO CALL" : hud.rivalBall ? "RIVAL BALL · TACKLE!" : mission.mode === "targets" ? "BLAST THE TARGETS" : "CHASE THE OBJECTIVE"}</b></div>
      <div className="ability-row"><span className={hud.boost > 0 ? "cool" : ""}><b>⇧</b>BOOST{hud.boost > 0 ? ` ${hud.boost.toFixed(1)}` : ""}</span><span className={hud.tackle > 0 ? "cool" : ""}><b>E</b>TACKLE{hud.tackle > 0 ? ` ${hud.tackle.toFixed(1)}` : ""}</span><span className={hud.overdriveReady ? "ready" : "cool"}><b>Q</b>OVERDRIVE</span>{hud.mates > 0 && <span><b>F</b>PASS</span>}<span><b>C</b>JUMP</span><span><b>V</b>{String(hud.camera || "chase").toUpperCase()}</span></div>
      <div className="charge"><i/><em/><b>{actionLabel}</b></div>
      <div className="ball-arrow">➤</div>
      {hud.combo > 1 && <div className="combo">×{hud.combo}<small>SPORT CHAIN</small></div>}
      {hud.dunk && <div className="dunk-cue">PRESS {actionLabel === "SHOOT" ? "ACTION" : actionLabel} · SLAM DUNK</div>}
      {hud.phase === "intro" && ready && <div className="banner intro"><small>MATCH {String(mission.id).padStart(2, "0")} · {mission.arena}</small><b>{mode.name}</b><span>{team.name} <em>VS</em> {rivalTeam.name}</span><p>TAP OR PRESS ANY KEY TO SKIP</p></div>}
      {hud.phase === "kickoff" && <div className="banner kickoff"><b>{hud.kickoff}</b></div>}
      {hud.phase === "goal" && <div className={`banner goal ${hud.bannerKind}`}><b>{hud.banner}</b><span>{hud.score} – {hud.rival}</span></div>}
      {hud.phase === "replay" && <div className="replay-tag">● INSTANT REPLAY <small>TAP TO SKIP</small></div>}
      <div className="look-zone" onPointerDown={lookDown} onPointerMove={lookMove} onPointerUp={lookUp} onPointerCancel={lookUp}/>
      <div className="stick" onPointerDown={stickDown} onPointerMove={stickMove} onPointerUp={stickUp} onPointerCancel={stickUp}><i style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}/></div>
      <div className="action-pad">
        <button className="action" data-act="actionDown" onPointerDown={fire} onPointerUp={() => engine.current?.actionUp()} onPointerCancel={() => engine.current?.actionUp()}><b>{mode.icon}</b><small>{actionLabel}</small></button>
        <button data-act="pass" onPointerDown={fire}><b>⇄</b><small>PASS</small></button>
        <button data-act="jump" onPointerDown={fire}><b>⤒</b><small>JUMP</small></button>
        <button data-act="boost" onPointerDown={fire}><b>↯</b><small>{hud.boost > 0 ? hud.boost.toFixed(1) : "BOOST"}</small></button>
        <button data-act="tackle" onPointerDown={fire}><b>✥</b><small>{hud.tackle > 0 ? hud.tackle.toFixed(1) : "TACKLE"}</small></button>
        <button data-act="overdrive" className={hud.overdriveReady ? "ready" : ""} onPointerDown={fire}><b>⬡</b><small>{hud.overdrive > 0 ? hud.overdrive.toFixed(1) : "OVERDRIVE"}</small></button>
      </div>
      <div className="desktop-help">WASD SKATE · HOLD SPACE / CLICK {actionLabel} · F PASS · C JUMP · SHIFT BOOST · E TACKLE · Q OVERDRIVE · V CAMERA · P PAUSE</div>
      {toast && hud.phase !== "goal" && <div key={toast.id} className={`toast ${toast.kind}`}>{toast.text}</div>}
      <button className="exit" aria-label="Pause match" onClick={() => engine.current?.setPaused(!hud.paused)}>{hud.paused ? "▶" : "❚❚"}</button>
      {hud.paused && <div className="overlay pause"><article className="tutorial"><small>MATCH PAUSED</small><h2>TIMEOUT</h2><p>{mission.name} · {mode.name} · {formatTime(hud.time)} left · {hud.score}–{hud.rival}</p><div className="row"><button className="primary" onClick={() => engine.current?.setPaused(false)}>RESUME</button><button className="ghost" onClick={() => engine.current?.cycleCamera()}>CAMERA: {String(hud.camera).toUpperCase()}</button><button className="ghost" onClick={startMatch}>RESTART</button><button className="ghost" onClick={() => setScreen("arena")}>QUIT TO ARENA</button></div></article></div>}
    </section>}

    {screen === "complete" && <div className="overlay"><article className="tutorial result"><small>MATCH COMPLETE</small><i>🏆</i><h2>{mission.championship ? "CHAMPIONS!" : "ARENA VICTORY!"}</h2><div className="result-grid"><span>SCORE<b>{result?.score}–{result?.rival}</b></span><span>TIME LEFT<b>{result?.time}s</b></span><span>SHIELD<b>{result?.shield}%</b></span><span>BEST CHAIN<b>×{result?.combo}</b></span><span>YOUR GOALS<b>{result?.goals ?? 0}</b></span><span>ASSISTS<b>{result?.assists ?? 0}</b></span><span>PERFECTS<b>{result?.perfects ?? 0}</b></span><span>{mission.mode === "hoops" ? "DUNKS" : "TACKLES"}<b>{mission.mode === "hoops" ? result?.dunks ?? 0 : result?.tackles ?? 0}</b></span></div><p>Your team earned league credits and moved one event closer to the Infinity Championship.</p><button className="primary" onClick={claim}>CLAIM ⬡ {mission.reward + (result?.time || 0) * 4 + (result?.combo || 0) * 25 + (result?.perfects || 0) * 15 + (result?.assists || 0) * 30 + (result?.dunks || 0) * 40}</button></article></div>}
    {screen === "failed" && <div className="overlay"><article className="tutorial result"><small>MATCH ENDED</small><i className="danger">!</i><h2>RUN IT BACK</h2><p>{result?.reason} Charge shots into the lime band, pass out of pressure, and save full energy for Overdrive.</p><div className="row"><button className="primary" onClick={startMatch}>REMATCH</button><button className="ghost" onClick={() => setScreen("arena")}>RETURN TO ARENA</button></div></article></div>}

    {screen === "records" && <div className="records"><header><div className="brand"><i>NS</i><span><b>LEAGUE RECORDS</b><small>ATHLETE PROFILE</small></span></div><button onClick={() => setScreen("arena")}>RETURN TO ARENA</button></header><section><small>SEASON PERFORMANCE</small><h1>{team.name}</h1><div className="record-summary"><span>MATCH WINS<b>{save.wins}</b></span><span>LEAGUE STARS<b>{totalStars}/90</b></span><span>BEST CHAIN<b>×{save.bestCombo}</b></span><span>MISSIONS OPEN<b>{save.unlocked}/30</b></span><span>GOALS<b>{save.goals}</b></span><span>ASSISTS<b>{save.assists}</b></span><span>PERFECT RELEASES<b>{save.perfects}</b></span><span>SLAM DUNKS<b>{save.dunks}</b></span></div><h2>SPORT MASTERY</h2><div className="mode-grid">{(Object.keys(MODE_INFO) as SportMode[]).map((key) => <article key={key} style={{ "--mode": MODE_INFO[key].accent } as React.CSSProperties}><i>{MODE_INFO[key].icon}</i><small>{MODE_INFO[key].name}</small><b>{save.modeWins[key]} WINS</b><p>{MODE_INFO[key].instruction}</p></article>)}</div><p className="privacy">Season progress is saved only in this browser. No account is required.</p></section></div>}

  </main>;
}
