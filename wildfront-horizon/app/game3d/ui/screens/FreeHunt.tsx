"use client";
// Free Hunt: any unlocked reserve, chosen time and weather, open licence for
// the reserve's native species. Harvests pay credits by trophy rating.

import { useState } from "react";
import { useApp } from "../ctx.ts";
import { RESERVES } from "../../blueprints/reserves.ts";
import { reserveUnlocked } from "../../data/save.ts";
import { WILDLIFE_BY_SPECIES } from "../../blueprints/wildlife/index.ts";
import { CondIcon, Drawing, TopBar } from "../components.tsx";
import { defaultLoadout, LoadoutPicker, ReserveMap } from "../widgets.tsx";

const TIMES = ["Dawn", "Morning", "Afternoon", "Sunset", "Dusk", "Night"];
const WEATHERS = ["Clear", "Mist", "Wind", "Rain", "Storm", "Snow"];

export default function FreeHunt() {
  const { save, startFree, playUi } = useApp();
  const reserves = Object.values(RESERVES);
  const firstOpen = reserves.find(r => reserveUnlocked(save, r.name)) ?? reserves[0];
  const [reserve, setReserve] = useState(firstOpen.name);
  const [time, setTime] = useState("Morning");
  const [weather, setWeather] = useState("Clear");
  const def = reserves.find(r => r.name === reserve)!;
  const [species, setSpecies] = useState<string[]>(def.fauna);
  const [lo, setLo] = useState(() => defaultLoadout(save));
  const unlocked = reserveUnlocked(save, reserve);
  const pickReserve = (name: string) => { playUi("select"); setReserve(name); setSpecies(reserves.find(r => r.name === name)!.fauna); };
  const toggle = (s: string) => setSpecies(v => v.includes(s) ? (v.length > 1 ? v.filter(x => x !== s) : v) : [...v, s]);
  return (
    <div className="screen freehunt">
      <TopBar title="Free Hunt" sub="OPEN SEASON · TROPHIES PAY CREDITS" />
      <div className="brief-grid">
        <section className="panel brief-map">
          <div className="section-title"><span>{def.drawing} · {def.name.toUpperCase()}</span><small>{def.tagline}</small></div>
          <ReserveMap reserve={reserve} species={species} />
        </section>
        <aside className="brief-side">
          <section className="panel">
            <div className="section-title"><span>RESERVE</span><small>COMPLETE A CONTRACT THERE TO UNLOCK</small></div>
            <div className="reserve-pick">
              {reserves.map(r => {
                const ok = reserveUnlocked(save, r.name);
                return (
                  <button key={r.id} className={`${r.name === reserve ? "on" : ""} ${ok ? "" : "locked"}`} onClick={() => pickReserve(r.name)}>
                    <small>{r.drawing}</small><b>{r.name}</b><em>{ok ? r.fauna.join(" · ") : "LOCKED"}</em>
                  </button>
                );
              })}
            </div>
            <div className="lo-row"><div className="lo-label">TIME</div><div className="seg icons">{TIMES.map(t => <button key={t} className={time === t ? "on" : ""} onClick={() => setTime(t)}><CondIcon k={t} size={16} />{t}</button>)}</div></div>
            <div className="lo-row"><div className="lo-label">WEATHER</div><div className="seg icons">{WEATHERS.map(w => <button key={w} className={weather === w ? "on" : ""} onClick={() => setWeather(w)}><CondIcon k={w} size={16} />{w}</button>)}</div></div>
            <div className="lo-label">LICENCE</div>
            <div className="lic-list pick">
              {def.fauna.map(s => (
                <button key={s} className={`lic ${species.includes(s) ? "on" : ""}`} onClick={() => toggle(s)}>
                  <Drawing id={WILDLIFE_BY_SPECIES[s].id} w={160} h={84} view="left" style="ink" margin={0.05} />
                  <span>{s}</span>
                </button>
              ))}
            </div>
          </section>
          <section className="panel brief-lo">
            <div className="section-title"><span>LOADOUT</span></div>
            <LoadoutPicker value={lo} onChange={setLo} />
          </section>
          <button className="primary big start" disabled={!unlocked} onClick={() => { playUi("select"); startFree({ reserve, time, weather, species, loadout: lo }); }}>
            <span className="pl-k">{unlocked ? "BEGIN FREE HUNT" : "RESERVE LOCKED"}</span><span className="pl-v">{reserve}</span><span className="pl-arrow">→</span>
          </button>
        </aside>
      </div>
    </div>
  );
}
