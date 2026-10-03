"use client";
// Contract briefing: reserve topo map with reported areas, conditions,
// licence, field notes and loadout.

import { useState } from "react";
import { useApp } from "../ctx.ts";
import { FIELD_NOTES, licensedFor, MISSIONS } from "../../data/missions.ts";
import { reserveByName } from "../../blueprints/reserves.ts";
import { WILDLIFE_BY_SPECIES } from "../../blueprints/wildlife/index.ts";
import { CondIcon, Drawing, TopBar } from "../components.tsx";
import { defaultLoadout, LoadoutPicker, ReserveMap } from "../widgets.tsx";

export default function Briefing() {
  const { save, missionId, go, startContract, playUi } = useApp();
  const m = MISSIONS.find(x => x.id === missionId) ?? MISSIONS[0];
  const [lo, setLo] = useState(() => defaultLoadout(save));
  const def = reserveByName(m.reserve);
  const lic = licensedFor(m);
  const locked = m.id > save.unlocked;
  return (
    <div className="screen briefing">
      <TopBar title={`Briefing · ${m.name}`} sub={`CONTRACT ${String(m.id).padStart(2, "0")} · ${m.difficulty.toUpperCase()}`} onBack={() => go("contracts")} />
      <div className="brief-grid">
        <section className="panel brief-map">
          <div className="section-title"><span>{def.drawing} · {def.name.toUpperCase()}</span><small>{def.tagline}</small></div>
          <ReserveMap reserve={m.reserve} species={lic} />
        </section>
        <aside className="brief-side">
          <section className="panel brief-cond">
            <div className="section-title"><span>CONDITIONS</span><small>{m.reserve === "All Reserves" ? "ALL RESERVES" : m.reserve.toUpperCase()}</small></div>
            <div className="cond-row">
              <div><CondIcon k={m.time} size={26} /><small>TIME</small><b>{m.time}</b></div>
              <div><CondIcon k={m.weather} size={26} /><small>WEATHER</small><b>{m.weather}</b></div>
              <div><span className="big-n">{m.count}</span><small>OBJECTIVE</small><b>Clean harvest</b></div>
              <div><span className="big-n lime">◆{m.reward}</span><small>REWARD</small><b>Credits</b></div>
            </div>
            <div className="licence">
              <small>LICENCE</small>
              <div className="lic-list">
                {lic.map(s => (
                  <div key={s} className="lic">
                    <Drawing id={WILDLIFE_BY_SPECIES[s].id} w={160} h={84} view="left" style="ink" margin={0.05} />
                    <span>{s}</span>
                  </div>
                ))}
              </div>
              <p className="lic-note">Shooting any other species costs 150 points and does not count.{m.species === "Mixed" ? " Grand Slam: each species counts once." : ""}</p>
            </div>
            <ul className="notes">{(FIELD_NOTES[m.id] ?? []).map((t, i) => <li key={i}>{t}</li>)}</ul>
          </section>
          <section className="panel brief-lo">
            <div className="section-title"><span>LOADOUT</span><small>GEAR LOCKER ›</small></div>
            <LoadoutPicker value={lo} onChange={setLo} />
          </section>
          <button className="primary big start" disabled={locked} onClick={() => { playUi("select"); startContract(m.id, lo); }}>
            <span className="pl-k">BEGIN HUNT</span><span className="pl-v">{m.name}</span><span className="pl-arrow">→</span>
          </button>
        </aside>
      </div>
    </div>
  );
}
