"use client";
// Trophy Lodge: every tagged animal rebuilt from its blueprint and seed and
// mounted on a turntable, plus career statistics and achievements.

import { useEffect, useMemo, useState } from "react";
import { playableAchievement, useApp } from "../ctx.ts";
import { WILDLIFE, WILDLIFE_BY_SPECIES } from "../../blueprints/wildlife/index.ts";
import { ACHIEVEMENTS } from "../../data/save.ts";
import type { TrophyRecord } from "../../hunt/hunt.ts";
import { GRADE_LABEL } from "../../hunt/scoring.ts";
import { Medal, StudioViewport, TopBar } from "../components.tsx";
import { fmtDate, fmtDist, fmtKg, fmtTime, GRADE_COLOR, RATING_COLOR, RATING_LABEL } from "../format.ts";

type Tab = "trophies" | "records" | "achievements";

const SHOWN_ACHIEVEMENTS = ACHIEVEMENTS.filter(a => playableAchievement(a.id));

export default function Trophies() {
  const { save, studio, units, playUi } = useApp();
  const [tab, setTab] = useState<Tab>("trophies");
  const [filter, setFilter] = useState<string>("all");
  const list = useMemo(() => [...save.v3.trophies].reverse().filter(t => filter === "all" || t.species === filter), [save.v3.trophies, filter]);
  const [sel, setSel] = useState<TrophyRecord | null>(list[0] ?? null);
  useEffect(() => {
    const st = studio();
    st.style = "trophy"; st.view = "orbit"; st.autoRotate = true; st.rotateSpeed = 0.22; st.zoom = 1; st.pitch = 0.12; st.yaw = 0.9;
    st.pad = { top: 20, right: 20, bottom: 110, left: 20 };
    st.setPose("rest");
    if (sel) void st.load({ id: WILDLIFE_BY_SPECIES[sel.species].id, sex: sel.sex, age: sel.age, seed: sel.seed, individual: true });
    else void st.load({ id: "elk", sex: "male", age: 1, seed: 7 });
  }, [sel, studio]);
  const s = save.v3.stats;
  return (
    <div className="screen trophies">
      <TopBar title="Trophy Lodge" sub={`${save.v3.trophies.length} TROPHIES · ${save.v3.achievements.filter(playableAchievement).length}/${SHOWN_ACHIEVEMENTS.length} ACHIEVEMENTS`}>
        <div className="tabs">{(["trophies", "records", "achievements"] as Tab[]).map(t => <button key={t} className={tab === t ? "on" : ""} onClick={() => { playUi("select"); setTab(t); }}>{t.toUpperCase()}</button>)}</div>
      </TopBar>
      <div className="trophy-grid">
        <StudioViewport className="trophy-view">
          <div className="plaque">
            {sel ? (
              <>
                <Medal rating={sel.rating} size={44} />
                <div>
                  <small>{sel.reserve.toUpperCase()} · {fmtDate(sel.date)}</small>
                  <b>{sel.label}</b>
                  <span style={{ color: RATING_COLOR[sel.rating] }}>{RATING_LABEL[sel.rating]} · {sel.score} {WILDLIFE_BY_SPECIES[sel.species].trophy.unit} · {fmtKg(sel.weight, units)}</span>
                  <em style={{ color: GRADE_COLOR[sel.grade] }}>{GRADE_LABEL[sel.grade]} · {sel.organ} · {fmtDist(sel.distance, units)}{sel.oneShot ? " · ONE SHOT" : " · RECOVERED"}</em>
                </div>
              </>
            ) : <div><small>AWAITING YOUR FIRST HARVEST</small><b>Your trophies are mounted here</b><span>Every tagged animal is rebuilt from its blueprint and seed — the exact animal you took.</span></div>}
          </div>
        </StudioViewport>
        <aside className="panel trophy-side">
          {tab === "trophies" && (
            <>
              <div className="chips">
                <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>ALL</button>
                {WILDLIFE.map(w => <button key={w.id} className={filter === w.species ? "on" : ""} onClick={() => setFilter(w.species)}>{w.species.toUpperCase()}</button>)}
              </div>
              <div className="trophy-list">
                {list.length === 0 && <p className="empty">No trophies yet. Complete a contract or a free hunt and tag your harvest with F.</p>}
                {list.map(t => (
                  <button key={t.id} className={`trophy-row ${sel?.id === t.id ? "on" : ""}`} onClick={() => { playUi("select"); setSel(t); }}>
                    <Medal rating={t.rating} size={30} />
                    <span><b>{t.label}</b><small>{t.reserve} · {fmtDate(t.date)}</small></span>
                    <strong><b>{t.score}</b><small>{WILDLIFE_BY_SPECIES[t.species].trophy.unit}</small></strong>
                  </button>
                ))}
              </div>
            </>
          )}
          {tab === "records" && (
            <div className="records">
              <div className="rec-grid">
                <span><small>HUNTS</small><b>{s.hunts}</b></span>
                <span><small>HARVESTS</small><b>{s.harvests}</b></span>
                <span><small>ACCURACY</small><b>{s.shots ? Math.round(s.hits / s.shots * 100) : 0}%</b></span>
                <span><small>LONGEST SHOT</small><b>{fmtDist(s.longest, units)}</b></span>
                <span className="grade-perfect"><small>PERFECT</small><b>{s.perfect}</b></span>
                <span className="grade-great"><small>GREAT</small><b>{s.great}</b></span>
                <span className="grade-good"><small>GOOD</small><b>{s.good}</b></span>
                <span><small>SIGN READ</small><b>{s.tracks}</b></span>
                <span><small>DISTANCE WALKED</small><b>{units === "imperial" ? `${(s.distance / 1609).toFixed(1)} mi` : `${(s.distance / 1000).toFixed(1)} km`}</b></span>
                <span><small>TIME AFIELD</small><b>{fmtTime(s.time)}</b></span>
              </div>
              <div className="journal">
                <div className="section-title"><span>SPECIES JOURNAL</span></div>
                {WILDLIFE.map(w => {
                  const j = save.v3.journal[w.species];
                  return (
                    <div key={w.id} className="journal-row">
                      <b>{w.species}</b>
                      <span>Seen {j?.spotted ?? 0}</span><span>Taken {j?.harvested ?? 0}</span>
                      <span style={{ color: RATING_COLOR[j?.bestRating ?? "none"] }}>{j?.bestScore ? `Best ${j.bestScore}` : "—"}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {tab === "achievements" && (
            <div className="ach-grid">
              {SHOWN_ACHIEVEMENTS.map(a => {
                const got = save.v3.achievements.includes(a.id);
                return <div key={a.id} className={`ach ${got ? "got" : ""}`}><i>{got ? "✦" : "◇"}</i><b>{a.title}</b><small>{a.detail}</small></div>;
              })}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
