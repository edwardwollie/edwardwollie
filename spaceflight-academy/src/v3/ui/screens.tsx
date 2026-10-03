import { useEffect, useState } from "react";
import type { AgePath } from "../../flight-data.ts";
import { STUDIO_ENABLED } from "../app/features.ts";
import { CADETS, SUIT_ACCENTS } from "../blueprints/cast.ts";
import { AGE_PATHS } from "../engineering/missions.ts";
import { Joystick, Sheet, TopBar, useGame, useSave, useUI } from "./common.tsx";

declare const __APP_VERSION__: string;

/** v2.1 age paths (names unchanged). */
export const AGE_INFO: Record<AgePath, { name: string; icon: string; color: string; copy: string }> = {
  "5–7": { name: "Star Scout", icon: "🛸", color: "#66f4ff", copy: "Listen first, steer through answer gates, then snap a rocket together." },
  "8–10": { name: "Orbit Pilot", icon: "🚀", color: "#a88cff", copy: "Forces, planets, orbits and spacecraft systems — then engineer the vehicle." },
  "11–12": { name: "Mission Commander", icon: "🛰️", color: "#ff66bf", copy: "Deeper flight science, delta-v, staging and stability — optimise the spacecraft." },
};

export function TitleScreen() {
  const game = useGame();
  const hasSave = useSave((s) => s.age !== null);
  return (
    <div className="title-screen">
      <div className="logo ui-on" role="img" aria-label="Spaceflight Academy">
        <div className="top">SPACEFLIGHT</div>
        <div className="bottom">ACADEMY</div>
        <div className="tag">BUILD · LAUNCH · EXPLORE</div>
      </div>
      <div className="title-actions">
        <button className="btn primary big" onClick={() => void game.enterAcademy()}>▶ {hasSave ? "CONTINUE" : "PLAY"}</button>
        <button className="btn big ghost" onClick={() => { game.unlock(); game.setScreen("grownups"); }}>👪 Grown-ups</button>
      </div>
      <p className="muted" style={{ marginTop: 10, fontSize: 14 }}>Questions are read aloud · Turn the sound on</p>
      <div className="version-tag">v{__APP_VERSION__} · 3D</div>
    </div>
  );
}

export function Onboarding() {
  const game = useGame();
  const age = useSave((s) => s.age);
  const cadet = useSave((s) => s.v3.cadet);
  const suit = useSave((s) => s.v3.suit);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  useEffect(() => {
    const t: Record<string, string> = {};
    for (const c of CADETS) t[c.id] = game.thumbnail(`cadet-${c.id}`, 96);
    setThumbs(t);
  }, [game]);
  return (
    <div className="onboard">
      <div className="onboard-head">
        <div className="kicker">Flexzonic Space Corps</div>
        <div className="h2">Choose your crew path and your cadet</div>
      </div>
      <div className="age-grid ui-on" style={{ alignSelf: "start" }}>
        {AGE_PATHS.map((a) => {
          const info = AGE_INFO[a];
          return (
            <button key={a} className={"age-card" + (age === a ? " on" : "")} style={{ ["--accent" as string]: info.color }} onClick={() => game.chooseAge(a)}>
              <span className="icon">{info.icon}</span>
              <small>AGES {a}</small>
              <b>{info.name}</b>
              <p>{info.copy}</p>
            </button>
          );
        })}
      </div>
      <div className="onboard-foot">
        <div className="cadet-pick">
          {CADETS.map((c) => (
            <button key={c.id} className={"cadet-btn" + (cadet === c.id ? " on" : "")} onClick={() => game.chooseCadet(c.id)}>
              {thumbs[c.id] ? <img src={thumbs[c.id]} alt="" /> : <span style={{ width: 44 }} />} {c.name}
            </button>
          ))}
        </div>
        <div className="suit-pick" aria-label="Suit colour">
          {Object.entries(SUIT_ACCENTS).map(([key, value]) => (
            <button key={key} className={"suit-dot" + (suit === key ? " on" : "")} style={{ background: value.accent }} title={value.label} aria-label={value.label} onClick={() => game.chooseSuit(key)} />
          ))}
        </div>
        <button className="btn primary big" disabled={!age} onClick={() => void game.goHub()}>🚀 ENTER THE SPACEPORT</button>
      </div>
    </div>
  );
}

export function HubHud() {
  const game = useGame();
  const prompt = useUI((s) => s.hub.prompt);
  const [hint, setHint] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setHint(false), 9000);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <>
      <TopBar>
        <button className="btn round ui-on" aria-label="Pause" onClick={() => game.pause()}>⏸</button>
      </TopBar>
      {hint && <div className="hint-bubble panel">Walk with the joystick or <b>WASD</b>, or tap the ground. Step on a glowing ring to enter a building!</div>}
      <div className="hub-menu">
        <button className="btn primary" onClick={() => void game.openMap()}>🗺️ <span>Missions</span></button>
        <button className="btn" onClick={() => void game.openHangarSandbox()}>🔧 <span>Rocket Hangar</span></button>
        <button className="btn" onClick={() => void game.openObservatory()}>🔭 <span>Observatory</span></button>
        {STUDIO_ENABLED && <button className="btn" onClick={() => void game.openStudio()}>📐 <span>Blueprint Studio</span></button>}
        <button className="btn" onClick={() => void game.openTraining()}>🧑‍🚀 <span>Training</span></button>
        <button className="btn" onClick={() => game.setScreen("family")}>🎈 <span>Family Lab</span></button>
        <button className="btn" onClick={() => game.setScreen("lounge")}>🏅 <span>Crew Lounge</span></button>
      </div>
      <Joystick />
      {prompt && (
        <div className="prompt">
          <button className="btn pink" onClick={() => game.openStation(prompt.id)}>{prompt.icon} Enter {prompt.label}</button>
        </div>
      )}
    </>
  );
}

export function Caption() {
  const caption = useUI((s) => s.caption);
  const speaking = useUI((s) => s.speaking);
  const enabled = useSave((s) => s.v3.captions);
  const screen = useUI((s) => s.screen);
  // The Space Rush and the briefing show their own text, so captions would only cover it.
  if (!caption || !enabled || screen === "rush" || screen === "brief") return null;
  return <div className="caption">{speaking && <span className="spk">🔊</span>}{caption}</div>;
}

export function Toast() {
  const toast = useUI((s) => s.toast);
  const [visible, setVisible] = useState<typeof toast>(null);
  useEffect(() => {
    if (!toast) return;
    setVisible(toast);
    const t = window.setTimeout(() => setVisible(null), Math.min(9000, 2600 + toast.text.length * 45));
    return () => window.clearTimeout(t);
  }, [toast]);
  if (!visible) return null;
  return <div className="toast panel" key={visible.id}><span className="ico">{visible.icon}</span><span>{visible.text}</span></div>;
}

function Toggle({ on, onChange, labels = ["On", "Off"] }: { on: boolean; onChange: (v: boolean) => void; labels?: [string, string] }) {
  return (
    <div className="seg">
      <button className={on ? "on" : ""} onClick={() => onChange(true)}>{labels[0]}</button>
      <button className={!on ? "on" : ""} onClick={() => onChange(false)}>{labels[1]}</button>
    </div>
  );
}

export function SettingsSheet() {
  const game = useGame();
  const s = useSave((x) => x);
  return (
    <Sheet title="Settings" kicker="Sound · Reading · Graphics" onClose={() => game.closeOverlay()}>
      <div className="setting"><div><b>Sound effects</b><small>Beeps, whooshes and launches</small></div><Toggle on={s.sound} onChange={(v) => { game.save.set({ sound: v }); game.applySettings(); }} /></div>
      <div className="setting"><div><b>Music</b><small>Gentle space music</small></div><Toggle on={s.v3.music} onChange={(v) => game.updateV3({ music: v })} /></div>
      <div className="setting"><div><b>Read-aloud narrator</b><small>Questions and all answers are read before the timer</small></div><Toggle on={s.v3.narration} onChange={(v) => game.updateV3({ narration: v })} /></div>
      <div className="setting"><div><b>Captions</b><small>Show what the narrator says</small></div><Toggle on={s.v3.captions} onChange={(v) => game.updateV3({ captions: v })} /></div>
      <div className="setting"><div><b>Answer timing</b><small>Standard: 7 s thinking + 30→22 s window. Relaxed: no countdown.</small></div>
        <div className="seg"><button className={s.v3.timing === "standard" ? "on" : ""} onClick={() => game.updateV3({ timing: "standard" })}>Standard</button><button className={s.v3.timing === "relaxed" ? "on" : ""} onClick={() => game.updateV3({ timing: "relaxed" })}>Relaxed</button></div></div>
      <div className="setting"><div><b>Calm motion</b><small>Less camera shake and spinning</small></div><Toggle on={s.v3.reduceMotion} onChange={(v) => game.updateV3({ reduceMotion: v })} /></div>
      <div className="setting"><div><b>Graphics</b><small>Lower settings run faster on older tablets</small></div>
        <div className="seg">{(["auto", "low", "medium", "high"] as const).map((q) => <button key={q} className={s.v3.quality === q ? "on" : ""} onClick={() => game.updateV3({ quality: q })}>{q[0].toUpperCase() + q.slice(1)}</button>)}</div></div>
      <p className="muted" style={{ fontSize: 13 }}>Classic 2D edition: <a href="/classic/" style={{ color: "var(--cyan)" }}>open Spaceflight Academy Classic</a> (shares the same saved progress).</p>
    </Sheet>
  );
}

export function PauseSheet() {
  const game = useGame();
  const screen = useUI((s) => s.screen);
  const inMission = ["rush", "build", "launch", "activity"].includes(screen);
  return (
    <div className="sheet-backdrop">
      <section className="sheet panel" style={{ width: "min(460px, 100%)", textAlign: "center" }}>
        <div className="kicker">Paused</div>
        <div className="h2">Take a breather, cadet!</div>
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <button className="btn primary big" onClick={() => game.closeOverlay()}>▶ Keep playing</button>
          <button className="btn" onClick={() => { game.closeOverlay(); game.setOverlay("settings"); }}>⚙️ Settings</button>
          {inMission && <button className="btn" onClick={() => { game.closeOverlay(); void game.openMap(); }}>🗺️ Mission map</button>}
          <button className="btn" onClick={() => { game.closeOverlay(); void game.goHub(); }}>🏠 Spaceport</button>
        </div>
      </section>
    </div>
  );
}

const FAMILY = [
  { icon: "🎈", title: "Balloon Rocket Race", time: "10 MIN", text: "With a grown-up, thread string through a straw, tape on an inflated balloon, release it, and compare how far it travels. Never put balloons in a young child's mouth." },
  { icon: "🌑", title: "Crater Maker", time: "15 MIN", text: "A grown-up fills a tray with flour and cocoa. Drop small clean balls from different safe heights, then compare crater width. Keep powder away from faces." },
  { icon: "🌙", title: "Moon Detective", time: "5 MIN", text: "Look at the Moon together on several evenings. Draw its shape, notice where it appears, and talk about how sunlight makes the bright part." },
  { icon: "🥤", title: "Straw Rocket Launch", time: "15 MIN", text: "Roll a paper tube around a pencil, tape it, fold and tape one end, and add paper fins. Slide it onto a drinking straw and blow! Try different fin shapes and compare which flies straightest. Only launch away from people's faces." },
  { icon: "🔦", title: "Phases with a Flashlight", time: "10 MIN", text: "In a dark room, a grown-up holds a flashlight as the Sun. Hold a ball at arm's length as the Moon and turn slowly in a circle. Watch the lit part of the ball change from a thin crescent to full!" },
  { icon: "⭐", title: "Backyard Star Hunt", time: "20 MIN", text: "On a clear night, step outside with a grown-up. Let your eyes adjust for 10 minutes, then find the brightest star and look for patterns. Bright dots that don't twinkle are often planets." },
];

export function FamilyLab() {
  const game = useGame();
  const wins = useSave((s) => s.familyWins);
  return (
    <Sheet title="Family Space Lab" kicker="Play together off-screen" onClose={() => void game.goHub()} wide>
      <p className="muted">Short, safe activities designed for a child and grown-up to investigate together. Started so far: <b>{wins}</b></p>
      <div className="grid-cards">
        {FAMILY.map((a) => (
          <article key={a.title} className="card">
            <div className="icon">{a.icon}</div>
            <small className="kicker">{a.time} · Grown-up helper</small>
            <h3>{a.title}</h3>
            <p>{a.text}</p>
            <button className="btn small primary" onClick={() => { void game.say(`${a.title}. ${a.text}`); game.save.set((s) => ({ familyWins: s.familyWins + 1 })); game.sound("star"); }}>🔊 Read &amp; start</button>
          </article>
        ))}
      </div>
      <div className="card" style={{ marginTop: 12 }}>👨‍👩‍👧 <b>Family mission tip:</b> Ask your young pilot to predict first, observe second, and explain what changed afterward.</div>
    </Sheet>
  );
}

export { TopBar, Joystick };
