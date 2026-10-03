import { useMemo } from "react";
import { STAT_INFO, type StatKey } from "../../flight-data.ts";
import { DESTINATIONS } from "../engineering/missions.ts";
import { PHYSICS, partInfo, type SystemId } from "../engineering/systems.ts";
import type { BuildView } from "../scenes/hangar.ts";
import { Meter, TopBar, useGame, useSave, useUI } from "./common.tsx";

interface HangarControls {
  addPart: (id: SystemId) => void;
  undo: () => void;
  reset: () => void;
  toggleEngineer: () => void;
  setDestination: (i: number) => void;
  launch: () => void;
  speakCoach: () => void;
  loadDesign: (c: Record<string, number>) => void;
}

const METER_KEYS: StatKey[] = ["thrust", "fuel", "stability", "mission"];

export function BuildPanel() {
  const game = useGame();
  const view = useUI((s) => s.build) as BuildView | null;
  const age = useSave((s) => s.age) ?? "5–7";
  const designs = useSave((s) => s.v3.designs);
  const thumbs = useMemo(() => {
    const out: Record<string, string> = {};
    for (const id of Object.keys(PHYSICS) as SystemId[]) out[id] = game.thumbnail(PHYSICS[id].blueprint, 128);
    return out;
  }, [game]);
  if (!view) return null;
  const scene = game.scenes.get("hangar") as unknown as HangarControls;
  const a = view.analysis;
  const young = age === "5–7";
  const saveDesign = () => {
    const name = `Rocket ${designs.length + 1}`;
    game.save.set((s) => ({ v3: { ...s.v3, designs: [...s.v3.designs, { name, counts: { ...view.counts }, savedAt: new Date().toISOString() }].slice(-12) } }));
    game.toast(`${name} saved to your Crew Lounge gallery!`, "💾");
    game.sound("badge");
  };
  return (
    <>
      <TopBar>
        {view.mode === "mission" && <button className="btn round ui-on" aria-label="Pause" onClick={() => game.pause()}>⏸</button>}
      </TopBar>
      <section className="build-left panel scroll">
        <div className="kicker">{view.mission ? `${view.mission.icon} Mission ${view.mission.level} · ${view.mission.world}` : "Free build · Rocket Hangar"}</div>
        <div className="h2" style={{ fontSize: 22 }}>{view.mission ? view.mission.objective : "Design any rocket"}</div>
        {view.mode === "sandbox" && (
          <div className="row wrap" style={{ gap: 6, margin: "6px 0" }}>
            {DESTINATIONS.map((d, i) => <button key={d} className={"btn small" + (view.destinationIndex === i ? " primary" : "")} onClick={() => scene.setDestination(i)}>{["🌍", "🛰️", "🌙", "🔴", "☄️", "🪐"][i]}</button>)}
          </div>
        )}
        <div className="checks">
          {view.checks.map((c) => (
            <div key={c.id} className={"check" + (c.ok ? " ok" : "")}><span className="tick">{c.ok ? "✓" : c.icon}</span>{c.label}</div>
          ))}
        </div>
        {METER_KEYS.map((key) => (
          <Meter key={key} label={STAT_INFO[key].name} icon={STAT_INFO[key].icon} value={a.meters[key]} color={STAT_INFO[key].color} target={view.focus === key ? view.focusTarget ?? undefined : undefined} focus={view.focus === key} />
        ))}
        <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
          <span className="energy">⚡ {view.energy}</span>
          <span className="muted" style={{ fontSize: 13 }}>build energy left{view.mode === "mission" ? " (4+ left = more stars)" : ""}</span>
        </div>
        {view.engineer && (
          <div className="engineer" style={{ marginTop: 8 }}>
            Mass {a.mass.toFixed(1)} t · Thrust {Math.round(a.thrust)} kN<br />
            TWR {a.twr.toFixed(2)} (needs ≥ 1.10)<br />
            Δv {Math.round(a.dv)} m/s{a.boosterDv ? ` (boosters ${Math.round(a.boosterDv)})` : ""} · Academy scale<br />
            Height {a.height.toFixed(1)} m · Stability margin {a.margin.toFixed(2)} cal
          </div>
        )}
        <div className="coach" style={{ marginTop: 8 }}>
          <span className="face">🤖</span>
          <div><b>Cosmo:</b> {view.coach} <button className="btn small ghost" style={{ minHeight: 30, padding: "2px 8px" }} onClick={() => scene.speakCoach()} aria-label="Read hint">🔊</button></div>
        </div>
      </section>
      <section className="build-right panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="kicker">Spacecraft systems</div>
          <button className={"btn small" + (view.engineer ? " primary" : "")} onClick={() => scene.toggleEngineer()}>📐 {young ? "Forces" : "Engineer view"}</button>
        </div>
        <div className="parts scroll" style={{ flex: 1, minHeight: 0 }}>
          {view.available.map((id) => {
            const info = partInfo(id);
            const max = PHYSICS[id].max;
            const count = view.counts[id];
            const disabled = count >= max || info.cost > view.energy;
            return (
              <button key={id} className="part" disabled={disabled} onClick={() => scene.addPart(id)} title={info.fact}>
                <span className="count">{count}/{max}</span>
                <span className="cost">⚡{info.cost}</span>
                <img src={thumbs[id]} alt="" />
                <span>{info.name}</span>
                <small>{PHYSICS[id].does}</small>
              </button>
            );
          })}
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          <button className="btn small" onClick={() => scene.undo()} disabled={!view.history.length}>↶ Undo</button>
          <button className="btn small" onClick={() => scene.reset()}>↻ Reset</button>
          {view.mode === "sandbox" && <button className="btn small" onClick={saveDesign}>💾 Save</button>}
          {view.mode === "sandbox" && designs.length > 0 && (
            <select className="btn small" style={{ maxWidth: 130 }} onChange={(e) => { const d = designs[Number(e.target.value)]; if (d) scene.loadDesign(d.counts); }} defaultValue="">
              <option value="" disabled>Load…</option>
              {designs.map((d, i) => <option key={i} value={i}>{d.name}</option>)}
            </select>
          )}
        </div>
        <button className={"btn big " + (view.ready ? "pink" : "")} disabled={!view.ready} onClick={() => scene.launch()}>
          {view.mode === "mission" ? (view.ready ? "🚀 START COUNTDOWN" : "BUILD TO LAUNCH") : view.ready ? "🚀 TEST LAUNCH" : "TOO HEAVY TO LAUNCH"}
        </button>
      </section>
    </>
  );
}
