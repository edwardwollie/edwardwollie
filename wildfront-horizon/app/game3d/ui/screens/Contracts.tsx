"use client";
// Field contracts: the twelve v2.0.3 contracts with their stars, locks and
// rewards, plus a blueprint drawing of the licensed species.

import { useApp } from "../ctx.ts";
import { FIELD_NOTES, GRAND_SLAM_SPECIES, MISSIONS, RESERVE_ORDER } from "../../data/missions.ts";
import { WILDLIFE_BY_SPECIES } from "../../blueprints/wildlife/index.ts";
import { reserveByName } from "../../blueprints/reserves.ts";
import { CondIcon, Drawing, Stars, TopBar } from "../components.tsx";

export function SpeciesArt({ species, w = 520, h = 250, className }: { species: string; w?: number; h?: number; className?: string }) {
  if (species === "Mixed") {
    return (
      <div className={`species-art mixed ${className ?? ""}`}>
        {GRAND_SLAM_SPECIES.map(s => <Drawing key={s} id={WILDLIFE_BY_SPECIES[s].id} w={Math.round(w / 2)} h={Math.round(h / 2)} view="left" style="ink" />)}
      </div>
    );
  }
  const bp = WILDLIFE_BY_SPECIES[species];
  if (!bp) return null;
  return <div className={`species-art ${className ?? ""}`}><Drawing id={bp.id} w={w} h={h} view="left" style="ink" /></div>;
}

export default function Contracts() {
  const { save, missionId, setMissionId, brief, playUi, units } = useApp();
  const m = MISSIONS.find(x => x.id === missionId) ?? MISSIONS[0];
  const locked = m.id > save.unlocked;
  const def = reserveByName(m.reserve);
  void units;
  return (
    <div className="screen contracts">
      <TopBar title="Field Contracts" sub={`${save.unlocked}/${MISSIONS.length} UNLOCKED`} />
      <div className="contracts-grid">
        <section className="panel missions">
          <div className="section-title"><span>FIELD CONTRACTS</span><small>{Object.values(save.stars).reduce((a, b) => a + b, 0)} / 36 ★</small></div>
          <div className="mission-list">
            {RESERVE_ORDER.map(r => {
              const list = MISSIONS.filter(x => (x.reserve === "All Reserves" ? "Horizon Crossing" : x.reserve) === r);
              if (!list.length) return null;
              return (
                <div key={r} className="mission-group">
                  <div className="group-label">{r === "Horizon Crossing" ? "ALL RESERVES" : r.toUpperCase()}</div>
                  {list.map(x => {
                    const lk = x.id > save.unlocked;
                    return (
                      <button key={x.id} disabled={lk} onClick={() => { playUi("select"); setMissionId(x.id); }} onDoubleClick={() => !lk && brief(x.id)} className={`mission-row ${x.id === m.id ? "active" : ""}`}>
                        <i>{String(x.id).padStart(2, "0")}</i>
                        <span><b>{x.name}</b><small>{x.species} · {x.count} clean · {x.time} · {x.weather}</small></span>
                        <strong>{lk ? "LOCKED" : <Stars n={save.stars[x.id] ?? 0} />}</strong>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>
        <aside className="panel contract-detail">
          <div className="contract-art">
            <div className="rings" />
            <SpeciesArt species={m.species} />
            <span className="art-cond"><CondIcon k={m.weather} size={14} /> {m.weather} {"//"} {m.time} <CondIcon k={m.time} size={14} /></span>
            <span className="art-draw">{m.species === "Mixed" ? "A-SERIES · GRAND SLAM" : `${WILDLIFE_BY_SPECIES[m.species].drawing} · ${m.species.toUpperCase()}`}</span>
          </div>
          <div className="cd-body">
            <small className="eyebrow">CONTRACT {String(m.id).padStart(2, "0")} · {def.drawing} {m.reserve === "All Reserves" ? "HORIZON CROSSING" : m.reserve.toUpperCase()}</small>
            <h2>{m.name}</h2>
            <p className="mission-brief">{m.brief}</p>
            <div className="facts">
              <span>DIFFICULTY <b>{m.difficulty}</b></span>
              <span>OBJECTIVE <b>{m.count} CLEAN</b></span>
              <span>REWARD <b>◆ {m.reward}</b></span>
              <span>BEST <b>{save.v3.best[m.id] ? save.v3.best[m.id].toLocaleString() : "—"}</b></span>
            </div>
            <ul className="notes">{(FIELD_NOTES[m.id] ?? []).map((t, i) => <li key={i}>{t}</li>)}</ul>
            <button className="primary" disabled={locked} onClick={() => { playUi("select"); brief(m.id); }}>{locked ? `COMPLETE CONTRACT ${String(m.id - 1).padStart(2, "0")} TO UNLOCK` : <>OPEN BRIEFING <span>→</span></>}</button>
          </div>
        </aside>
      </div>
    </div>
  );
}
