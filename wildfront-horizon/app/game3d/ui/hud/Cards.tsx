"use client";
// Shot analysis (blueprint x-ray of the hit, with the bullet path in side and
// plan view) and the trophy tag card.

import { useEffect } from "react";
import type { ShotAnalysis, TrophyRecord } from "../../hunt/hunt.ts";
import { GRADE_LABEL } from "../../hunt/scoring.ts";
import { WILDLIFE_BY_ID, WILDLIFE_BY_SPECIES } from "../../blueprints/wildlife/index.ts";
import { ORGAN_COLORS } from "../../render/blueprint-render.ts";
import type { Snap } from "../../render/snapshots.ts";
import type { V3 } from "../../blueprints/types.ts";
import { Drawing, Medal } from "../components.tsx";
import { fmtCm, fmtDist, fmtEnergy, fmtKg, fmtVel, GRADE_COLOR, RATING_COLOR, RATING_LABEL, type Units } from "../format.ts";

function PathOverlay({ s, a, organs }: { s: Snap; a: ShotAnalysis; organs: boolean }) {
  const e = a.local, d = a.dir;
  const p0 = s.project([e[0] - d[0] * 1.4, e[1] - d[1] * 1.4, e[2] - d[2] * 1.4] as V3);
  const p1 = s.project([e[0] + d[0] * 1.1, e[1] + d[1] * 1.1, e[2] + d[2] * 1.1] as V3);
  const pe = s.project(e as V3);
  const col = GRADE_COLOR[a.grade];
  return (
    <g>
      {organs && s.vital && <ellipse cx={s.vital.cx} cy={s.vital.cy} rx={s.vital.rx} ry={s.vital.ry} fill="rgba(83,243,220,0.08)" stroke="#53f3dc" strokeDasharray="4 3" strokeWidth="1" />}
      {organs && s.organs.filter(o => o.id !== "spine").map(o => <ellipse key={o.id} cx={o.cx} cy={o.cy} rx={o.rx} ry={o.ry} fill={ORGAN_COLORS[o.id]} fillOpacity={0.42} />)}
      <line x1={p0[0]} y1={p0[1]} x2={pe[0]} y2={pe[1]} stroke={col} strokeWidth="1.6" strokeDasharray="5 3" />
      <line x1={pe[0]} y1={pe[1]} x2={p1[0]} y2={p1[1]} stroke={col} strokeWidth="2.2" />
      <circle cx={pe[0]} cy={pe[1]} r="6" fill="none" stroke={col} strokeWidth="2" />
      <circle cx={pe[0]} cy={pe[1]} r="2" fill={col} />
    </g>
  );
}

export function ShotCard({ a, units, onDone }: { a: ShotAnalysis; units: Units; onDone: () => void }) {
  useEffect(() => { const t = window.setTimeout(onDone, 8000); return () => window.clearTimeout(t); }, [a, onDone]);
  const bp = WILDLIFE_BY_ID[a.animalId];
  const side = a.dir[0] < 0 ? "left" : "right";
  const col = GRADE_COLOR[a.grade];
  return (
    <div className="shot-card" onClick={onDone} style={{ borderColor: col }}>
      <div className="sc-head">
        <small>SHOT ANALYSIS · {bp?.drawing}</small>
        <b style={{ color: col }}>{GRADE_LABEL[a.grade]}</b>
        <span>{a.label} · {a.organ.toUpperCase()}</span>
      </div>
      <div className="sc-art">
        <Drawing id={a.animalId} w={340} h={176} view={side} style="ink" sex={a.sex} age={a.age} seed={a.seed} margin={0.06} overlay={s => <PathOverlay s={s} a={a} organs />} />
        <Drawing id={a.animalId} w={340} h={112} view="top" style="ink" sex={a.sex} age={a.age} seed={a.seed} margin={0.06} overlay={s => <PathOverlay s={s} a={a} organs={false} />} />
        <span className="sc-lab l1">{side === "left" ? "LEFT SIDE" : "RIGHT SIDE"}</span><span className="sc-lab l2">PLAN</span>
      </div>
      <div className="sc-grid">
        <span><small>DISTANCE</small><b>{fmtDist(a.distance, units)}</b></span>
        <span><small>DROP</small><b>{fmtCm(a.dropCm, units)}</b></span>
        <span><small>DRIFT</small><b>{fmtCm(Math.abs(a.driftCm), units)}</b></span>
        <span><small>FLIGHT</small><b>{a.tof.toFixed(2)} s</b></span>
        <span><small>IMPACT</small><b>{fmtVel(a.impactVelocity, units)}</b></span>
        <span><small>ENERGY</small><b>{fmtEnergy(a.energyJ, units)}</b></span>
      </div>
      <div className="sc-foot"><b style={{ color: col }}>{a.points > 0 ? `+${a.points}` : a.points}</b>{a.steady && <span>BREATH HELD +25</span>}<em>{a.fatal ? "DOWN" : a.grade === "good" ? "WOUNDED — FOLLOW THE HIT SIGN" : ""}</em></div>
    </div>
  );
}

export function TagCard({ t, units, onDone }: { t: TrophyRecord; units: Units; onDone: () => void }) {
  useEffect(() => { const id = window.setTimeout(onDone, 6500); return () => window.clearTimeout(id); }, [t, onDone]);
  const bp = WILDLIFE_BY_SPECIES[t.species];
  return (
    <div className="tag-card" onClick={onDone}>
      <div className="tg-medal"><Medal rating={t.rating} size={56} /></div>
      <div className="tg-body">
        <small>TAGGED · {t.reserve.toUpperCase()}</small>
        <b>{t.label}</b>
        <span style={{ color: RATING_COLOR[t.rating] }}>{RATING_LABEL[t.rating]} · {t.score} {bp?.trophy.unit} · {fmtKg(t.weight, units)}</span>
        <em style={{ color: GRADE_COLOR[t.grade] }}>{GRADE_LABEL[t.grade]} · {t.organ} · {fmtDist(t.distance, units)}{t.oneShot ? " · ONE SHOT" : " · RECOVERED"}</em>
        {t.credits > 0 && <strong>+◆ {t.credits}</strong>}
      </div>
    </div>
  );
}
