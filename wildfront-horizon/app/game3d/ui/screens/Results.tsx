"use client";
// Debrief: the v2.0.3 result grid (score, accuracy, clean shots, grades,
// stars, claim) plus the trophies taken and field statistics.

import type { HuntStats } from "../../hunt/hunt.ts";
import type { Mission } from "../../data/missions.ts";
import { useApp } from "../ctx.ts";
import { Medal } from "../components.tsx";
import { fmtDist, fmtTime, GRADE_COLOR, RATING_COLOR, RATING_LABEL } from "../format.ts";
import { GRADE_LABEL } from "../../hunt/scoring.ts";
import { WILDLIFE_BY_SPECIES } from "../../blueprints/wildlife/index.ts";
import { ACHIEVEMENTS } from "../../data/save.ts";

export interface ResultsData { stats: HuntStats; mission: Mission | null; free: boolean; stars: number; reserve: string }

export default function Results({ data, achievements = [], onClaim }: { data: ResultsData; achievements?: string[]; onClaim: () => void }) {
  const { units, save } = useApp();
  const { stats, mission, free, stars } = data;
  const prevStars = mission ? save.stars[mission.id] ?? 0 : 0;
  const nextUnlock = mission && mission.id >= save.unlocked && mission.id < 12;
  return (
    <div className="results-screen">
      <div className="complete-card">
        <small>{free ? `FREE HUNT · ${data.reserve.toUpperCase()}` : "CONTRACT COMPLETE"}</small>
        <h2>{free ? "Hunt Summary" : mission?.name}</h2>
        <div className="trophy">✦</div>
        <div className="result-grid">
          <span><small>SCORE</small><b>{stats.score}</b></span>
          <span><small>ACCURACY</small><b>{stats.accuracy}%</b></span>
          <span><small>CLEAN SHOTS</small><b>{stats.clean}/{stats.shots}</b></span>
          <span className="grade-perfect"><small>PERFECT</small><b>{stats.perfect || 0}</b></span>
          <span className="grade-great"><small>GREAT</small><b>{stats.great || 0}</b></span>
          <span className="grade-good"><small>GOOD</small><b>{stats.good || 0}</b></span>
        </div>
        {!free && <h3>{"★".repeat(stars)}<span className="dim">{"★".repeat(3 - stars)}</span></h3>}
        {!free && <p>Patient fieldcraft rewarded. Fresh mission telemetry and reserve access have been synchronized.{stars > prevStars && prevStars > 0 ? ` New best: ${stars} stars.` : ""}{nextUnlock ? ` Contract ${String(mission!.id + 1).padStart(2, "0")} unlocked.` : ""}</p>}
        {stats.trophies.length > 0 && (
          <div className="res-trophies">
            {stats.trophies.map(t => (
              <div key={t.id} className="res-trophy">
                <Medal rating={t.rating} size={34} />
                <span><b>{t.label}</b><small style={{ color: GRADE_COLOR[t.grade] }}>{GRADE_LABEL[t.grade]} · {t.organ} · {fmtDist(t.distance, units)}</small></span>
                <strong style={{ color: RATING_COLOR[t.rating] }}>{t.score}<small>{WILDLIFE_BY_SPECIES[t.species]?.trophy.unit} · {RATING_LABEL[t.rating]}</small></strong>
              </div>
            ))}
          </div>
        )}
        <div className="res-stats">
          <span>LONGEST SHOT <b>{stats.longest ? fmtDist(stats.longest, units) : "—"}</b></span>
          <span>WALKED <b>{units === "imperial" ? `${(stats.distance / 1609).toFixed(2)} mi` : `${(stats.distance / 1000).toFixed(2)} km`}</b></span>
          <span>TIME <b>{fmtTime(stats.time)}</b></span>
          <span>SIGN READ <b>{stats.tracks}</b></span>
          <span>SPOOKED <b>{stats.spooked}</b></span>
          {stats.penalties > 0 && <span className="warn">NO-TAG HITS <b>{stats.penalties}</b></span>}
        </div>
        {achievements.length > 0 && (
          <div className="res-ach">
            <small>ACHIEVEMENTS UNLOCKED</small>
            <div>{achievements.map(id => { const a = ACHIEVEMENTS.find(x => x.id === id); return a ? <span key={id} title={a.detail}>✦ {a.title}</span> : null; })}</div>
          </div>
        )}
        {stats.lost > 0 && <p className="warn-note">{stats.lost} wounded animal{stats.lost > 1 ? "s were" : " was"} not recovered. Follow hit sign patiently — give a wounded animal time to bed, then close in quietly.</p>}
        <button className="primary" onClick={onClaim}>{free ? (stats.credits > 0 ? `CLAIM ◆ ${stats.credits}` : "RETURN TO LODGE") : `CLAIM ◆ ${mission?.reward}`}</button>
      </div>
    </div>
  );
}
