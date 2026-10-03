import { useMemo } from "react";
import { STAT_INFO, WORLDS } from "../../flight-data.ts";
import { AGE_PATHS, makeEngineeringMission } from "../engineering/missions.ts";
import { answerWindowFor, READING_GRACE_SECONDS } from "../learning/rush.ts";
import { missionKey } from "../state/save.ts";
import { Stars, TopBar, useGame, useSave, useUI } from "./common.tsx";
import { AGE_INFO } from "./screens.tsx";

const ACTIVITY_LABEL: Record<string, string> = {
  orbit: "🌍 Steer into orbit",
  docking: "🛰️ Dock with Orbital School",
  "moon-landing": "🌙 Land on the Moon",
  "mars-landing": "🔴 Land on Mars and drive Dusty",
  asteroid: "☄️ Grab an asteroid sample",
  photo: "📸 Photograph a giant planet",
};

export function MapUI() {
  const game = useGame();
  const selected = useUI((s) => s.map.selected);
  const screen = useUI((s) => s.screen);
  const age = useSave((s) => s.age) ?? "5–7";
  const unlocked = useSave((s) => s.progress[age]);
  const stars = useSave((s) => s.stars);
  const level = selected ?? unlocked;
  const mission = useMemo(() => makeEngineeringMission(age, level), [age, level]);
  const sectorStars = (i: number) => Array.from({ length: 5 }, (_, k) => stars[missionKey(age, i * 5 + k + 1)] ?? 0).reduce((a, b) => a + b, 0);
  const mapScene = () => game.scenes.get("map") as unknown as { focusSector: (i: number) => void; select: (l: number) => void; refresh: () => void } | undefined;
  const locked = level > unlocked;
  const earned = stars[missionKey(age, level)] ?? 0;
  if (screen === "brief") return null;
  return (
    <div className="map-ui">
      <TopBar>
        <div className="age-switch ui-on">
          {AGE_PATHS.map((a) => (
            <button key={a} className={"btn small" + (a === age ? " primary" : "")} onClick={() => { game.chooseAge(a); mapScene()?.refresh(); game.ui.set({ map: { selected: null } }); }} title={AGE_INFO[a].name}>
              {AGE_INFO[a].icon} <span style={{ display: "inline" }}>{a}</span>
            </button>
          ))}
        </div>
      </TopBar>
      <div className="sector-strip">
        {WORLDS.map((w, i) => (
          <button key={w.name} className="btn small" onClick={() => { mapScene()?.focusSector(i); mapScene()?.select(Math.min(unlocked, i * 5 + 1) >= i * 5 + 1 ? i * 5 + 1 : i * 5 + 1); }}>
            {w.icon} <span>{w.name}</span> <span className="stars" style={{ fontSize: 12 }}>★{sectorStars(i)}</span>
          </button>
        ))}
      </div>
      <section className="map-card panel">
        <div className="kicker">{mission.world.icon} {mission.world.name} · Mission {level} of 30</div>
        <div className="h2">{mission.boss ? "☄️ Boss: Meteor Command" : mission.objective}</div>
        {mission.boss && <p className="muted" style={{ margin: "4px 0" }}>{mission.objective}</p>}
        <div className="meta">
          <span className="chip">{STAT_INFO[mission.focus].icon} Focus: {STAT_INFO[mission.focus].name}</span>
          <span className="chip">{ACTIVITY_LABEL[mission.activity]}</span>
          <span className="chip">⚡ {mission.energy} build energy</span>
        </div>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <Stars count={earned} />
          <span className="muted" style={{ fontSize: 13 }}>{AGE_INFO[age].icon} {AGE_INFO[age].name} · {unlocked - 1} / 30 complete</span>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          {locked ? (
            <button className="btn" disabled>🔒 Finish mission {unlocked} first</button>
          ) : (
            <button className="btn primary big" style={{ flex: 1 }} onClick={() => void game.startMission(level)}>🚀 {earned ? "FLY AGAIN" : "START MISSION"}</button>
          )}
        </div>
      </section>
    </div>
  );
}

export function Briefing() {
  const game = useGame();
  const run = useUI((s) => s.run);
  if (!run) return null;
  const m = run.mission;
  const answerWindow = answerWindowFor(m.level);
  const relaxed = game.save.get().v3.timing === "relaxed";
  return (
    <div className="brief">
      <section className="panel">
        <div className="kicker">Mission briefing · {m.world.icon} {m.world.name} · Mission {m.level}</div>
        <div className="h2">{m.boss ? "☄️ Boss mission: Meteor Command" : m.objective}</div>
        <p className="muted" style={{ margin: "6px 0 0" }}>{m.boss ? `${m.objective}. ` : ""}Destination: <b>{m.destination}</b></p>
        <div className="goal-list">
          <div><b>1 · Space Rush</b>Fly through 6 answer gates. Every question and all 3 answers are read aloud first.</div>
          <div><b>2 · Build</b>Engineer a rocket in the hangar. Focus: {STAT_INFO[m.focus].icon} {STAT_INFO[m.focus].name}.</div>
          <div><b>3 · Launch &amp; explore</b>{ACTIVITY_LABEL[m.activity]}.</div>
        </div>
        <div className="keys">
          <span><b>A/D ←→</b> or <b>1·2·3</b> pick a gate</span>
          <span><b>W ↑ SPACE</b> boost</span>
          <span><b>R</b> read again</span>
          <span>Narration → {READING_GRACE_SECONDS}s think → {relaxed ? "no countdown (relaxed)" : `${answerWindow}s to answer`}</span>
        </div>
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="btn" onClick={() => { game.quiet(); game.setScreen("map"); }}>← Back</button>
          <button className="btn" onClick={() => void game.say(game.briefingText(m))}>🔊 Read</button>
          <button className="btn primary big" onClick={() => void game.beginRush()}>START SPACE RUSH</button>
        </div>
      </section>
    </div>
  );
}
