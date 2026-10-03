import { useState } from "react";
import type { ActivityControl, ActivityView } from "../activities/base.ts";
import { Joystick, useGame, useUI } from "./common.tsx";

interface ActivityControls {
  control: (name: ActivityControl, down: boolean) => void;
  finishNow: () => void;
}

const LABELS: Record<ActivityControl, string> = {
  hold: "HOLD", left: "◀", right: "▶", up: "▲", down: "▼", deploy: "🪂 DEPLOY", snap: "📸 SNAP", grab: "🦾 GRAB", brake: "BRAKE", scan: "🔬 SCAN",
};

function HoldButton({ label, onChange, className = "" }: { label: string; onChange: (down: boolean) => void; className?: string }) {
  const [down, setDown] = useState(false);
  const set = (value: boolean) => { setDown(value); onChange(value); };
  return (
    <button
      className={`btn pink hold ${down ? "active" : ""} ${className}`}
      onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); set(true); }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onPointerLeave={() => down && set(false)}
      onContextMenu={(e) => e.preventDefault()}
    >{label}</button>
  );
}

export function ActivityHud() {
  const game = useGame();
  const view = useUI((s) => s.activity) as ActivityView | null;
  const run = useUI((s) => s.run);
  if (!view || !run) return null;
  const scene = game.engine.current as unknown as ActivityControls;
  const press = (name: ActivityControl) => { scene.control(name, true); window.setTimeout(() => scene.control(name, false), 120); };
  return (
    <>
      <div className="rush-top">
        <button className="btn round ui-on" aria-label="Pause" onClick={() => game.pause()}>⏸</button>
        <div className="stat">{run.mission.world.icon} {run.practice ? "Practice" : `M${run.level}`}</div>
        {view.progress && <div className="stat">{view.progress}</div>}
        <div className="spacer" />
        {run.practice && <button className="btn small" onClick={() => void game.openTraining()}>✕ Exit practice</button>}
      </div>
      <section className="act-help panel">
        <div className="kicker">{view.title}</div>
        <div>{view.message ?? view.help}</div>
        <div className="row wrap" style={{ justifyContent: "center", gap: 14, marginTop: 8 }}>
          {view.gauges.map((g) => (
            <div key={g.label} className="gauge">
              <div className="row" style={{ justifyContent: "space-between", fontSize: 13 }}><b>{g.label}</b><span>{g.value}{g.unit ?? ""}</span></div>
              <div className="bar" style={{ position: "relative" }}>
                {g.good && <span style={{ position: "absolute", left: `${(g.good[0] / g.max) * 100}%`, width: `${((g.good[1] - g.good[0]) / g.max) * 100}%`, top: 0, bottom: 0, background: "rgba(92,242,160,.35)" }} />}
                <i style={{ width: `${Math.max(0, Math.min(100, (g.value / g.max) * 100))}%`, position: "relative" }} />
              </div>
            </div>
          ))}
        </div>
      </section>
      {view.card && view.phase !== "retry" && (
        <section className="panel" style={{ position: "absolute", left: "50%", bottom: "calc(150px + var(--safe-bottom))", transform: "translateX(-50%)", width: "min(560px, calc(100vw - 24px))", padding: 14, textAlign: "center" }}>
          <div style={{ fontSize: 30 }}>{view.card.icon}</div>
          <b style={{ fontSize: 19 }}>{view.card.title}</b>
          <p style={{ margin: "6px 0 0", fontSize: 15, lineHeight: 1.4 }}>{view.card.text}</p>
        </section>
      )}
      {view.phase === "success" && (
        <div className="event panel" style={{ top: "40%", fontSize: 26 }}>✨ {view.message} <span className="stars">{"★".repeat(view.score)}</span></div>
      )}
      {view.phase === "retry" && <div className="event panel" style={{ top: "42%" }}>🔁 {view.message}</div>}
      {view.steer && <Joystick />}
      {view.kind === "photo" && <div style={{ position: "absolute", left: "50%", top: "50%", width: "min(40vh, 40vw)", height: "min(40vh, 40vw)", transform: "translate(-50%,-50%)", border: "3px dashed rgba(255,255,255,.75)", borderRadius: "50%", boxShadow: "0 0 0 2000px rgba(0,0,0,.18)" }} />}
      <div className="act-controls">
        {view.controls.map((c) => c === "hold" ? (
          <HoldButton key={c} label={view.holdLabel} onChange={(d) => scene.control("hold", d)} />
        ) : c === "left" || c === "right" || c === "up" || c === "down" || c === "brake" ? (
          <HoldButton key={c} label={LABELS[c]} className="small-hold" onChange={(d) => scene.control(c, d)} />
        ) : (
          <button key={c} className="btn pink big" onClick={() => press(c)}>{LABELS[c]}</button>
        ))}
      </div>
    </>
  );
}
