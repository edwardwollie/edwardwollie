import { useState } from "react";
import { BODIES, BODY_BY_ID, MOON_COUNT_NOTE, ageOn, jumpOn, type Body } from "../data/solar.ts";
import { SPEEDS, type ObservatoryScene, type ObservatoryView, type ObsMode } from "../scenes/observatory.ts";
import { Sheet, TopBar, usePanelInsets, useGame, useSave, useUI } from "./common.tsx";

const MODES: { id: ObsMode; label: string; icon: string }[] = [
  { id: "orbits", label: "Orbits", icon: "🪐" },
  { id: "sizes", label: "Sizes", icon: "📏" },
  { id: "jump", label: "Gravity Jump", icon: "🦘" },
];

const SPEED_SHORT = ["⏸ Stop", "Day/s", "Week/s", "Month/s", "Year/s"];
const AGE_FOR_PATH: Record<string, number> = { "5–7": 6, "8–10": 9, "11–12": 12 };

function km(n: number) {
  return `${n.toLocaleString("en-US")} km`;
}

function metres(m: number) {
  return m < 1 ? `${Math.round(m * 100)} cm` : `${m.toFixed(m < 10 ? 2 : 1)} m`;
}

function elapsed(days: number) {
  if (days < 1) return "today";
  if (days < 60) return `+${Math.floor(days)} days`;
  if (days < 730) return `+${Math.floor(days / 30.44)} months`;
  return `+${(days / 365.25).toFixed(days < 3652 ? 1 : 0)} years`;
}

function BodyInfo({ body, scene, view }: { body: Body; scene: ObservatoryScene; view: ObservatoryView }) {
  const path = useSave((s) => s.age ?? "8–10");
  const age = AGE_FOR_PATH[path] ?? 9;
  const planetAge = ageOn(body, age);
  const jump = jumpOn(body.gravity);
  return (
    <>
      <div className="kicker">{body.icon} {body.type}</div>
      <div className="h2" style={{ marginBottom: 6 }}>{body.name}</div>
      <div className="row wrap" style={{ gap: 6 }}>
        <button className="btn small primary" onClick={() => scene.readAloud()}>🔊 Read to me</button>
        {view.mode !== "jump" && body.jump !== "no" && <button className="btn small" onClick={() => { scene.setMode("jump"); }}>🦘 Jump here</button>}
        {view.mode !== "sizes" && <button className="btn small" onClick={() => scene.setMode("sizes")}>📏 Compare size</button>}
      </div>
      <div className="planet-facts">
        <div><b>{body.diameterKm >= 1e6 ? "1.39 million km" : km(body.diameterKm)}</b>wide</div>
        <div><b>{body.distanceText.replace(/ \(.*\)/, "")}</b>{body.id === "moon" ? "from Earth" : body.id === "sun" ? "" : "from the Sun"}</div>
        <div><b>{body.spinText}</b>one spin (day)</div>
        <div><b>{body.yearText}</b>{body.id === "sun" ? "galaxy trip" : body.id === "moon" ? "trip around Earth" : "one trip around the Sun"}</div>
        <div><b>{body.moons === null ? "—" : body.moons}</b>{body.moons === null ? (body.id === "sun" ? "8 planets orbit it" : "moons") : body.moons === 1 ? "moon" : "known moons"}</div>
        <div><b>{body.gravity < 1 ? `${Math.round(body.gravity * 100)}%` : `${body.gravity.toFixed(body.gravity >= 10 ? 0 : 2)}×`}</b>{body.gravity < 1 ? "of Earth's gravity" : "Earth's gravity"}</div>
        <div><b>{body.tempText}</b>temperature</div>
        <div><b>{body.lightText}</b>{body.id === "sun" ? "" : "for sunlight to arrive"}</div>
      </div>
      <div className="journal-item">📦 {body.fits}</div>
      {planetAge !== null && body.id !== "earth" && (
        <div className="journal-item">🎂 A {age}-year-old Earthling would be <b>{planetAge < 1 ? planetAge.toFixed(2) : planetAge < 10 ? planetAge.toFixed(1) : Math.round(planetAge)}</b> in {body.name} years!</div>
      )}
      {body.jump !== "no" && <div className="journal-item">🦘 A jump that goes {metres(0.5)} high on Earth goes <b>{metres(jump.height)}</b> high here.</div>}
      {body.facts.map((f) => <div key={f} className="journal-item">💡 {f}</div>)}
      {body.moons !== null && body.moons > 3 && <p className="muted" style={{ fontSize: 12, margin: "4px 2px" }}>{MOON_COUNT_NOTE}</p>}
    </>
  );
}

function JumpInfo({ view, scene }: { view: ObservatoryView; scene: ObservatoryScene }) {
  const body = BODY_BY_ID[view.jump.world];
  const info = jumpOn(body.gravity);
  return (
    <>
      <div className="kicker">🦘 Gravity Jump lab</div>
      <div className="h2" style={{ marginBottom: 4 }}>{body.name}</div>
      <p style={{ fontSize: 15, lineHeight: 1.4, margin: "6px 0" }}>Your legs push just as hard on every world. Gravity decides how high you go and how long you float!</p>
      {body.jumpNote && <div className="journal-item">💭 {body.jumpNote}</div>}
      <div className="planet-facts">
        <div><b>{body.gravity < 1 ? `${Math.round(body.gravity * 100)}%` : `${body.gravity.toFixed(2)}×`}</b>{body.gravity < 1 ? "of Earth's gravity" : "Earth's gravity"}</div>
        <div><b>{metres(info.height)}</b>jump height</div>
        <div><b>{info.airTime.toFixed(1)} s</b>time in the air</div>
        <div><b>{(10 * body.gravity).toFixed(body.gravity < 1 ? 1 : 0)} kg</b>a 10 kg backpack feels like</div>
      </div>
      <div className="journal-item">🌍 On Earth the same jump is 50 cm high and lasts 0.6 seconds.</div>
      <button className="btn small primary" onClick={() => scene.readAloud()}>🔊 About {body.name}</button>
    </>
  );
}

export function ObservatoryUI() {
  const game = useGame();
  const view = useUI((s) => s.observatory) as ObservatoryView | null;
  const seen = useSave((s) => s.v3.observatory);
  const scene = game.scene("observatory") as ObservatoryScene;
  const [info, setInfo] = useState(false);
  const mobile = usePanelInsets(scene, [view?.mode]);
  if (!view) return null;
  const body = BODY_BY_ID[view.selected];
  const list = view.mode === "jump" ? BODIES.filter((b) => b.jump !== "no") : BODIES;
  const jumping = view.jump.phase === "air" || view.jump.phase === "crouch";
  return (
    <>
      <TopBar>
        <div className="stat" title="Worlds explored">🔭 {seen.length}/{BODIES.length}</div>
        {mobile && <button className="btn round ui-on" aria-label="About this world" onClick={() => setInfo(true)}>ℹ️</button>}
      </TopBar>
      <section className="studio-list panel">
        <div className="kicker" style={{ padding: "2px 4px" }}>{view.mode === "jump" ? "Pick a world to jump on" : "Worlds"}</div>
        <div className="items scroll">
          {list.map((b) => (
            <button key={b.id} className={"btn studio-item" + (view.selected === b.id ? " on" : "")} onClick={() => scene.select(b.id)}>
              <span className="ph" style={{ display: "grid", placeItems: "center", fontSize: 24, background: `radial-gradient(circle at 35% 30%, ${b.color}, rgba(10,17,52,.2) 72%)` }}>{b.icon}</span>
              <span className="txt"><small>{b.type}</small>{b.name}</span>
              {seen.includes(b.id) && <span className="seen" aria-label="explored">✓</span>}
            </button>
          ))}
        </div>
      </section>
      {!mobile && (
        <section className="studio-info panel scroll">
          {view.mode === "jump" ? <JumpInfo view={view} scene={scene} /> : <BodyInfo body={body} scene={scene} view={view} />}
        </section>
      )}
      {view.mode === "jump" && (view.jump.phase !== "ready") && (
        <div className="obs-readout panel" aria-live="polite">
          ⬆ <b>{metres(jumping ? view.jump.current : view.jump.height)}</b>
          {!jumping && <> · ⏱ <b>{view.jump.airTime.toFixed(1)} s</b></>}
        </div>
      )}
      {view.mode === "orbits" && (
        <div className="obs-date panel">
          📅 <b>{view.dateText}</b> <span className="muted">({elapsed(view.daysFromNow)})</span>
        </div>
      )}
      <div className="studio-bar">
        <div className="group" role="group" aria-label="Observatory mode">
          {MODES.map((m) => (
            <button key={m.id} className={"btn" + (view.mode === m.id ? " on" : "")} onClick={() => scene.setMode(m.id)}>{m.icon} {m.label}</button>
          ))}
        </div>
        {view.mode === "orbits" && (
          <>
            <div className="group" role="group" aria-label="Time speed">
              {SPEEDS.map((sp, i) => (
                <button key={sp.label} className={"btn" + (view.speed === i ? " on" : "")} title={sp.label} onClick={() => scene.setSpeed(i)}>{SPEED_SHORT[i]}</button>
              ))}
              <button className="btn" onClick={() => scene.resetTime()} title="Back to today">⟲<span className="long-label"> Today</span></button>
            </div>
            <div className="group" role="group" aria-label="Distances">
              <button className={"btn" + (view.scale === "fit" ? " on" : "")} onClick={() => scene.setScale("fit")}>🔎<span className="long-label"> Close-up</span></button>
              <button className={"btn" + (view.scale === "true" ? " on" : "")} onClick={() => scene.setScale("true")}>📐 True<span className="long-label"> distances</span></button>
              <button className="btn" aria-label="Zoom in" onClick={() => scene.zoomBy(0.75)}>🔍+</button>
              <button className="btn" aria-label="Zoom out" onClick={() => scene.zoomBy(1.33)}>🔍−</button>
            </div>
          </>
        )}
        {view.mode === "sizes" && (
          <div className="group" role="group" aria-label="Size line-up">
            <button className="btn" onClick={() => scene.showWholeFamily()}>👪 Whole family</button>
            <button className="btn" aria-label="Zoom in" onClick={() => scene.zoomBy(0.75)}>🔍+</button>
            <button className="btn" aria-label="Zoom out" onClick={() => scene.zoomBy(1.33)}>🔍−</button>
          </div>
        )}
        {view.mode === "jump" && (
          <div className="group" role="group" aria-label="Jump">
            <button className="btn pink jump-btn" disabled={jumping} onClick={() => scene.jump()}>🦘 JUMP!</button>
          </div>
        )}
      </div>
      {info && mobile && (
        <Sheet title={view.mode === "jump" ? "Gravity Jump" : body.name} onClose={() => setInfo(false)}>
          {view.mode === "jump" ? <JumpInfo view={view} scene={scene} /> : <BodyInfo body={body} scene={scene} view={view} />}
        </Sheet>
      )}
    </>
  );
}
