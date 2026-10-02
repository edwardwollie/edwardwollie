"use client";
/* eslint-disable react-hooks/set-state-in-effect -- saved progress is restored from localStorage after hydration */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { DEFAULT_SETTINGS, FrontierEngine, type Hud, type Result, type Settings } from "./frontier-engine";
import { SECTORS, SPECIES, STATS, UPGRADES, type UpgradeKey } from "./frontier-data";
import ModelViewer from "./ModelViewer";

type Save = { unlocked: number; credits: number; stars: Record<number, number>; upgrades: Record<UpgradeKey, number>; trained: boolean; discoveries: string[]; best: Record<number, number> };
type Screen = "base" | "tutorial" | "play" | "complete" | "failed" | "fieldguide";
const fresh: Save = { unlocked: 1, credits: 200, stars: {}, upgrades: { rifle: 0, armor: 0, boots: 0, drone: 0, emp: 0 }, trained: false, discoveries: ["raptor"], best: {} };
const SAVE_KEY = "dino-frontier-save-v1", SETTINGS_KEY = "dino-frontier-settings-v1";
const EMPTY_HUD: Hud = { health: 100, kills: "0/0", cores: 0, score: 0, combo: 0, dash: 0, dashMax: 4.6, emp: 0, threat: 0, airborne: false, boss: null, locked: false, camera: "third", hint: null };

const lessons = [
  { icon: "✥", title: "MOVE & LOOK", text: "WASD or arrow keys move relative to the camera. Click the battlefield to lock your aim, then steer with the mouse. Touch: the left stick moves, drag the right side to look." },
  { icon: "⌁", title: "ARC RIFLE", text: "Hold the left mouse button (or F) to fire bolts at the crosshair. Head hits crit ×1.5. Your Pulse Drone automatically shoots the nearest dinosaur." },
  { icon: "↯", title: "JUMP & FLUX DASH", text: "SPACE jumps, which clears the Tyrant's shockwave rings. SHIFT dashes with a burst of invulnerability, so dash through charges and pounces." },
  { icon: "✺", title: "EMP PULSE", text: "Every kill charges the EMP. At 100% press Q to blast, stun and hurl back everything nearby. Shock Core upgrades widen the blast." },
  { icon: "◇", title: "READ THE HUNT", text: "A dinosaur flashing red is about to attack. Collect glowing cores and pink med-cells. Press V to switch to the tactical camera and ESC to pause." },
];
const pad2 = (n: number) => String(n).padStart(2, "0");

export default function DinoFrontier() {
  const canvas = useRef<HTMLCanvasElement>(null), engine = useRef<FrontierEngine | null>(null);
  const dmgRef = useRef<HTMLDivElement>(null), radarRef = useRef<HTMLCanvasElement>(null), xhairRef = useRef<HTMLDivElement>(null), vigRef = useRef<HTMLDivElement>(null);
  const [save, setSave] = useState<Save>(fresh), [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS), [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState(0), [screen, setScreen] = useState<Screen>("base"), [step, setStep] = useState(0);
  const [hud, setHud] = useState<Hud>(EMPTY_HUD), [toast, setToast] = useState<{ text: string; kind: string; id: number } | null>(null);
  const [banner, setBanner] = useState<{ title: string; sub: string; id: number } | null>(null), [result, setResult] = useState<Result | null>(null);
  const [paused, setPaused] = useState(false), [showSettings, setShowSettings] = useState(false), [guide, setGuide] = useState(0), [touch, setTouch] = useState(false);
  const sector = SECTORS[selected];

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) { const p = JSON.parse(raw); setSave({ ...fresh, ...p, upgrades: { ...fresh.upgrades, ...p.upgrades }, best: { ...(p.best ?? {}) } }); }
      const rs = localStorage.getItem(SETTINGS_KEY);
      const coarse = window.matchMedia?.("(pointer: coarse)").matches;
      setTouch(!!coarse);
      setSettings({ ...DEFAULT_SETTINGS, quality: coarse ? "medium" : "high", ...(rs ? JSON.parse(rs) : {}) });
      if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    } catch { /* storage unavailable */ }
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* ignore */ } }, [save, loaded]);
  useEffect(() => { if (loaded) try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ } engine.current?.setSettings(settings); }, [settings, loaded]);

  const message = useCallback((text: string, kind: string) => {
    const id = Date.now() + Math.random();
    setToast({ text, kind, id });
    window.setTimeout(() => setToast(t => (t?.id === id ? null : t)), 1500);
  }, []);
  const showBanner = useCallback((title: string, sub: string) => {
    const id = Date.now();
    setBanner({ title, sub, id });
    window.setTimeout(() => setBanner(b => (b?.id === id ? null : b)), 3200);
  }, []);
  const complete = useCallback((r: Result) => { setResult(r); setScreen("complete"); }, []);
  const fail = useCallback((r: Result) => { setResult(r); setScreen("failed"); }, []);
  const pause = useCallback(() => { engine.current?.pause(); setPaused(true); }, []);
  const padResume = useCallback(() => { setPaused(false); engine.current?.resume(false); }, []);
  const onCamera = useCallback((camera: Settings["camera"]) => setSettings(s => ({ ...s, camera })), []);

  // The engine is created once per deployment; live settings are pushed via setSettings.
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => {
    if (screen !== "play" || !canvas.current) return;
    setHud({ ...EMPTY_HUD, kills: `0/${sector.target}` });
    setPaused(false);
    const game = new FrontierEngine(canvas.current, sector, save.upgrades, { hud: setHud, message, complete, fail, pause, resume: padResume, banner: showBanner, camera: onCamera }, settingsRef.current, { damage: dmgRef.current, radar: radarRef.current, crosshair: xhairRef.current, vignette: vigRef.current });
    engine.current = game;
    showBanner(`SECTOR ${pad2(sector.id)} · ${sector.name.toUpperCase()}`, `${sector.biome} — eliminate ${sector.target} targets`);
    return () => { game.destroy(); engine.current = null; };
  }, [screen, sector, save.upgrades, message, complete, fail, pause, padResume, showBanner, onCamera]);

  const launch = () => { if (save.trained) setScreen("play"); else { setStep(0); setScreen("tutorial"); } };
  const nextLesson = () => { if (step < lessons.length - 1) setStep(s => s + 1); else { setSave(s => ({ ...s, trained: true })); setScreen("play"); } };
  const claim = () => {
    if (!result) return;
    const stars = result.health > 74 ? 3 : result.health > 34 ? 2 : 1;
    const seen = [...new Set([...save.discoveries, ...sector.species, ...(sector.boss ? [sector.boss] : [])])];
    setSave(s => ({ ...s, credits: s.credits + sector.reward + result.cores * 15, unlocked: Math.min(10, Math.max(s.unlocked, sector.id + 1)), stars: { ...s.stars, [sector.id]: Math.max(stars, s.stars[sector.id] || 0) }, best: { ...s.best, [sector.id]: Math.max(result.score, s.best[sector.id] || 0) }, discoveries: seen }));
    setScreen("base");
  };
  const buy = (key: UpgradeKey) => { const level = save.upgrades[key], cost = 160 * (level + 1); if (level >= 4 || save.credits < cost) return; setSave(s => ({ ...s, credits: s.credits - cost, upgrades: { ...s.upgrades, [key]: level + 1 } })); };
  const resume = () => { setPaused(false); engine.current?.resume(); };
  const abort = () => { setPaused(false); setScreen("base"); };

  if (!loaded) return <main className="frontier-loading">CALIBRATING FRONTIER GRID…</main>;
  const discovered = SPECIES.filter(s => save.discoveries.includes(s.key));
  const guideSpecies = SPECIES[guide];

  return <main className={`frontier ${screen}`}>
    {screen === "base" && <>
      <header>
        <div className="brand"><i>DF</i><span><b>DINO FRONTIER</b><small>SURVIVAL COMMAND</small></span></div>
        <nav>
          <a className="navlink" href="/blueprints">BLUEPRINTS</a>
          <button onClick={() => setScreen("fieldguide")}>FIELD GUIDE</button>
          <button onClick={() => setShowSettings(true)}>SETTINGS</button>
          <strong>◇ {save.credits}</strong>
        </nav>
      </header>
      <section className="frontier-hero">
        <div>
          <small>EXOPLANET V-17 // FRONTIER SIGNAL ACTIVE</small>
          <h1>TRACK.<br /><em>DEFEND.</em><br />EVOLVE.</h1>
          <p>Hold the line against living legends in full 3D. Aim an arc rifle over the shoulder, leap shockwaves, dash through stampedes and survive ten escalating dinosaur sectors.</p>
          <button className="primary" onClick={launch}>DEPLOY TO SECTOR {sector.id} →</button>
        </div>
        <article className="threat-card" style={{ "--sector": sector.color } as CSSProperties}>
          <small>CURRENT DEPLOYMENT</small><b>{pad2(sector.id)}</b><h2>{sector.name}</h2><span>{sector.biome}</span>
          <div><i style={{ width: `${sector.threat * 10}%` }} /></div>
          <p>THREAT {sector.threat}/10 · {sector.target} TARGETS{save.best[sector.id] ? ` · BEST ${save.best[sector.id]}` : ""}</p>
        </article>
      </section>
      <section className="command-grid">
        <div className="sectors">
          <div className="section-title"><b>FRONTIER SECTORS</b><span>{save.unlocked}/10 ACCESSIBLE</span></div>
          {SECTORS.map((s, i) => <button key={s.id} disabled={s.id > save.unlocked} className={selected === i ? "active" : ""} onClick={() => setSelected(i)} style={{ "--sector": s.color } as CSSProperties}>
            <i>{pad2(s.id)}</i><span><b>{s.name}</b><small>{s.biome} · THREAT {s.threat}{s.boss ? " · APEX" : ""}</small></span>
            <strong>{s.id > save.unlocked ? "LOCKED" : `${"★".repeat(save.stars[s.id] || 0)}${"☆".repeat(3 - (save.stars[s.id] || 0))}`}</strong>
          </button>)}
        </div>
        <aside>
          <div className="briefing">
            <small>MISSION PROFILE</small><h2>{sector.name}</h2>
            <div className="objectives">
              <span>ELIMINATE<b>{sector.target}</b></span><span>SPECIES<b>{sector.species.length + (sector.boss && !sector.species.includes(sector.boss) ? 1 : 0)}</b></span>
              <span>REWARD<b>◇ {sector.reward}</b></span><span>BOSS<b>{sector.boss ? "YES" : "NO"}</b></span>
            </div>
            <div className="intel">{[...new Set([...sector.species, ...(sector.boss ? [sector.boss] : [])])].map(k => { const sp = SPECIES.find(s => s.key === k)!; return <span key={k} style={{ "--species": sp.color } as CSSProperties}>{sp.icon}<em>{sp.name}</em></span>; })}</div>
          </div>
          <div className="upgrade-lab">
            <small>EVOLUTION LAB</small>
            {UPGRADES.map(u => { const level = save.upgrades[u.key] ?? 0, cost = 160 * (level + 1); return <button key={u.key} disabled={level >= 4 || save.credits < cost} onClick={() => buy(u.key)}>
              <i style={{ color: u.color }}>{u.icon}</i><span><b>{u.name}</b><small>{u.detail}</small></span>
              <strong>{level >= 4 ? "MAX" : `◇ ${cost}`}<em>{"●".repeat(level)}{"○".repeat(4 - level)}</em></strong>
            </button>; })}
          </div>
        </aside>
      </section>
    </>}

    {screen === "tutorial" && <div className="overlay"><article className="tutorial">
      <small>RANGER TRAINING // {step + 1} OF {lessons.length}</small><i>{lessons[step].icon}</i><h2>{lessons[step].title}</h2><p>{lessons[step].text}</p>
      <div className="tutorial-dots">{lessons.map((_, i) => <span key={i} className={i === step ? "on" : ""} />)}</div>
      <button className="primary" onClick={nextLesson}>{step < lessons.length - 1 ? "NEXT SYSTEM" : "BEGIN DEPLOYMENT"} →</button>
      <button className="skip" onClick={() => { setSave(s => ({ ...s, trained: true })); setScreen("play"); }}>SKIP TRAINING</button>
    </article></div>}

    {screen === "play" && <section className={`game ${touch ? "touch" : ""}`}>
      <canvas ref={canvas} />
      <div className="vignette" ref={vigRef} />
      <div className="dmg-layer" ref={dmgRef} />
      <div className="crosshair" ref={xhairRef}><i /><i /><i /><i /><b /></div>
      <div className="game-hud">
        <span><small>SECTOR {pad2(sector.id)}</small><b>{sector.name}</b></span>
        <span><small>TARGETS</small><b>{hud.kills}</b></span>
        <span><small>CORES</small><b>◇ {hud.cores}</b></span>
        <span><small>SCORE</small><b>{hud.score}</b></span>
      </div>
      <div className="wave"><i><em style={{ width: `${hud.threat}%` }} /></i><b>WAVE {hud.threat}%</b></div>
      {hud.boss && <div className="boss-bar"><small>APEX // {hud.boss.name.toUpperCase()}</small><i><em style={{ width: `${hud.boss.hp * 100}%` }} /></i></div>}
      <canvas className="radar" ref={radarRef} width={150} height={150} />
      <div className="vitals">
        <div className="health"><span>RANGER INTEGRITY</span><i><em style={{ width: `${hud.health}%` }} /></i><b>{hud.health}%</b></div>
        <div className="abilities">
          <span className={hud.dash > 0 ? "cool" : "ready"} style={{ "--p": `${(1 - hud.dash / hud.dashMax) * 100}%` } as CSSProperties}><b>↯</b><small>{hud.dash > 0 ? hud.dash.toFixed(1) : "SHIFT"}</small></span>
          <span className={hud.airborne ? "cool" : "ready"} style={{ "--p": hud.airborne ? "0%" : "100%" } as CSSProperties}><b>⤒</b><small>SPACE</small></span>
          <span className={hud.emp >= 100 ? "ready emp" : "cool"} style={{ "--p": `${hud.emp}%` } as CSSProperties}><b>✺</b><small>{hud.emp >= 100 ? "Q · EMP" : `${hud.emp}%`}</small></span>
        </div>
      </div>
      {hud.combo > 1 && <div className="combo">×{hud.combo}<small>HUNT CHAIN</small></div>}
      {hud.hint && hud.camera === "third" && !hud.locked && !paused && <div className="aim-hint">{hud.hint}</div>}
      {toast && <div key={toast.id} className={`toast ${toast.kind}`}>{toast.text}</div>}
      {banner && <div key={banner.id} className="banner"><b>{banner.title}</b><small>{banner.sub}</small></div>}
      <TouchControls engine={engine} emp={hud.emp} />
      <div className="desktop-help">WASD MOVE · MOUSE AIM · LMB/F FIRE · SPACE JUMP · SHIFT DASH · Q EMP · V CAMERA · ESC PAUSE</div>
      <button className="exit" aria-label="Pause mission" onClick={pause}>❚❚</button>
      {paused && <div className="pause-menu"><article>
        <small>MISSION PAUSED</small><h2>{sector.name}</h2>
        <button className="primary" onClick={resume}>RESUME HUNT →</button>
        <SettingsPanel settings={settings} onChange={setSettings} inGame />
        <button className="abort" onClick={abort}>ABORT TO COMMAND</button>
      </article></div>}
    </section>}

    {screen === "complete" && result && <div className="overlay"><article className="tutorial result">
      <small>SECTOR SECURED</small><i>✦</i><h2>FRONTIER HELD</h2>
      <div className="stars">{[1, 2, 3].map(n => <span key={n} className={n <= (result.health > 74 ? 3 : result.health > 34 ? 2 : 1) ? "on" : ""}>★</span>)}</div>
      <div className="result-grid">
        <span>TARGETS<b>{result.kills}</b></span><span>CORES<b>{result.cores}</b></span><span>INTEGRITY<b>{result.health}%</b></span><span>TIME<b>{result.time}s</b></span>
        <span>SCORE<b>{result.score}</b></span><span>ACCURACY<b>{result.accuracy}%</b></span><span>BEST CHAIN<b>×{result.bestCombo}</b></span><span>BEST<b>{Math.max(result.score, save.best[sector.id] || 0)}</b></span>
      </div>
      <p>Command has logged the expedition and released your upgrade credits.</p>
      <button className="primary" onClick={claim}>CLAIM ◇ {sector.reward + result.cores * 15}</button>
    </article></div>}

    {screen === "failed" && <div className="overlay"><article className="tutorial result">
      <small>FRONTIER BREACHED</small><i className="danger">!</i><h2>REGROUP, RANGER</h2>
      {result && <div className="result-grid"><span>TARGETS<b>{result.kills}/{sector.target}</b></span><span>SCORE<b>{result.score}</b></span><span>ACCURACY<b>{result.accuracy}%</b></span><span>TIME<b>{result.time}s</b></span></div>}
      <p>Watch for the red attack flash, jump the Tyrant&apos;s shockwaves, dash through charges, and invest in Titan Weave or the Arc Rifle before redeploying.</p>
      <div className="row"><button className="primary" onClick={() => setScreen("play")}>REDEPLOY →</button><button className="skip" onClick={() => setScreen("base")}>RETURN TO COMMAND</button></div>
    </article></div>}

    {screen === "fieldguide" && <div className="guide">
      <header><div className="brand"><i>DF</i><span><b>SPECIES ARCHIVE</b><small>FRONTIER FIELD GUIDE</small></span></div><button onClick={() => setScreen("base")}>RETURN TO COMMAND</button></header>
      <section>
        <small>DISCOVERY DATABASE · {discovered.length}/{SPECIES.length} IDENTIFIED</small><h1>Know the frontier</h1>
        <p>Every species is built from a measured 3D blueprint with its own silhouette, glow signature, movement and attack pattern. Drag to orbit the specimen.</p>
        <div className="guide-stage">
          <div className="guide-tabs">{SPECIES.map((s, i) => { const seen = save.discoveries.includes(s.key); return <button key={s.key} className={`${i === guide ? "on" : ""} ${seen ? "" : "locked"}`} style={{ "--species": s.color } as CSSProperties} onClick={() => setGuide(i)}><i>{seen ? s.icon : "?"}</i><span>{seen ? s.name : "Unknown Signal"}</span></button>; })}</div>
          {save.discoveries.includes(guideSpecies.key) ? <div className="specimen" style={{ "--species": guideSpecies.color } as CSSProperties}>
            <ModelViewer model={guideSpecies.key} accent={guideSpecies.color} />
            <div className="dossier">
              <small>DISCOVERED</small><h2>{guideSpecies.name}</h2><p>{guideSpecies.detail}</p>
              <dl><div><dt>HEALTH</dt><dd>{STATS[guideSpecies.key].hp}</dd></div><div><dt>SPEED</dt><dd>{STATS[guideSpecies.key].speed} m/s</dd></div><div><dt>BITE</dt><dd>{STATS[guideSpecies.key].damage}</dd></div></dl>
              <h3>FIELD TACTICS</h3><p className="tactic">{guideSpecies.behavior}</p>
              <a href={`/blueprints?model=${guideSpecies.key}`}>OPEN 3D BLUEPRINT →</a>
            </div>
          </div> : <div className="specimen locked"><p>Secure more frontier sectors to identify this lifeform.</p></div>}
        </div>
      </section>
    </div>}

    {showSettings && <div className="overlay"><article className="tutorial settings-card">
      <small>RANGER CONFIGURATION</small><h2>SETTINGS</h2>
      <SettingsPanel settings={settings} onChange={setSettings} />
      <button className="primary" onClick={() => setShowSettings(false)}>DONE</button>
    </article></div>}
  </main>;
}

function SettingsPanel({ settings, onChange, inGame }: { settings: Settings; onChange: (s: Settings) => void; inGame?: boolean }) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });
  return <div className="settings">
    <label><span>CAMERA</span><div className="seg">{(["third", "tactical"] as const).map(c => <button key={c} className={settings.camera === c ? "on" : ""} onClick={() => set("camera", c)}>{c === "third" ? "THIRD-PERSON" : "TACTICAL"}</button>)}</div></label>
    <label><span>GRAPHICS{inGame ? " · NEXT DEPLOY" : ""}</span><div className="seg">{(["low", "medium", "high"] as const).map(q => <button key={q} className={settings.quality === q ? "on" : ""} onClick={() => set("quality", q)}>{q.toUpperCase()}</button>)}</div></label>
    <label><span>LOOK SENSITIVITY · {settings.sensitivity.toFixed(1)}</span><input type="range" min={0.3} max={2.5} step={0.1} value={settings.sensitivity} onChange={e => set("sensitivity", +e.target.value)} /></label>
    <label><span>VOLUME · {Math.round(settings.volume * 100)}%</span><input type="range" min={0} max={1} step={0.05} value={settings.volume} onChange={e => set("volume", +e.target.value)} /></label>
    <label className="check"><input type="checkbox" checked={settings.invertY} onChange={e => set("invertY", e.target.checked)} /><span>INVERT LOOK Y</span></label>
    <label className="check"><input type="checkbox" checked={settings.shake} onChange={e => set("shake", e.target.checked)} /><span>CAMERA SHAKE</span></label>
    <p className="keys">GAMEPAD: LEFT STICK MOVE · RIGHT STICK LOOK · RT FIRE · A JUMP · B DASH · Y EMP · VIEW CAMERA · START PAUSE</p>
  </div>;
}

/** Analog thumb-stick (left), drag-to-look area (right) and action buttons for touch screens. */
function TouchControls({ engine, emp }: { engine: React.RefObject<FrontierEngine | null>; emp: number }) {
  const stick = useRef<{ id: number; x: number; y: number } | null>(null), look = useRef<{ id: number; x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const R = 52;
  const stickDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    stick.current = { id: e.pointerId, x: r.left + r.width / 2, y: r.top + r.height / 2 };
    e.currentTarget.setPointerCapture(e.pointerId);
    stickMove(e);
  };
  const stickMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = stick.current;
    if (!s || s.id !== e.pointerId) return;
    let dx = e.clientX - s.x, dy = e.clientY - s.y;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    setKnob({ x: dx, y: dy });
    engine.current?.setMove(dx / R, dy / R);
  };
  const stickUp = () => { stick.current = null; setKnob({ x: 0, y: 0 }); engine.current?.clearMove(); };
  const lookDown = (e: ReactPointerEvent<HTMLDivElement>) => { look.current = { id: e.pointerId, x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); };
  const lookMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const l = look.current;
    if (!l || l.id !== e.pointerId) return;
    engine.current?.look((e.clientX - l.x) * 1.6, (e.clientY - l.y) * 1.6);
    l.x = e.clientX; l.y = e.clientY;
  };
  const lookUp = () => { look.current = null; };
  return <div className="touch-controls">
    <div className="look-zone" onPointerDown={lookDown} onPointerMove={lookMove} onPointerUp={lookUp} onPointerCancel={lookUp} />
    <div className="stick" onPointerDown={stickDown} onPointerMove={stickMove} onPointerUp={stickUp} onPointerCancel={stickUp}><i style={{ transform: `translate(${knob.x}px,${knob.y}px)` }} /></div>
    <div className="action-pad">
      <button className="emp-btn" disabled={emp < 100} onPointerDown={() => engine.current?.pulse()}><b>✺</b><small>EMP</small></button>
      <button onPointerDown={() => engine.current?.dash()}><b>↯</b><small>DASH</small></button>
      <button onPointerDown={() => engine.current?.jump()}><b>⤒</b><small>JUMP</small></button>
      <button className="fire" onPointerDown={() => engine.current?.setFiring(true)} onPointerUp={() => engine.current?.setFiring(false)} onPointerLeave={() => engine.current?.setFiring(false)} onPointerCancel={() => engine.current?.setFiring(false)}><b>⌁</b><small>FIRE</small></button>
    </div>
  </div>;
}
