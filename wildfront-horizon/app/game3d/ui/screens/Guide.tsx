"use client";
// Field Guide: each species as a live 3D model (shaded, line art or x-ray),
// with gaits, facts, senses, vitals, tracks and trophy classes — all read
// from the same blueprint the game animal is built from.

import { useEffect, useState } from "react";
import { useApp } from "../ctx.ts";
import { WILDLIFE } from "../../blueprints/wildlife/index.ts";
import type { AnimalBlueprint } from "../../blueprints/types.ts";
import { drawHoofPrint } from "../../hunt/sign.ts";
import { ORGAN_COLORS } from "../../render/blueprint-render.ts";
import type { StudioPose, StudioStyle } from "../../modes/studio.ts";
import { CanvasView, Drawing, StudioViewport, TopBar } from "../components.tsx";
import { fmtSpeed } from "../format.ts";

const POSES: { id: StudioPose; label: string }[] = [
  { id: "rest", label: "STAND" }, { id: "walk", label: "WALK" }, { id: "trot", label: "TROT" }, { id: "gallop", label: "GALLOP" }, { id: "graze", label: "GRAZE" }, { id: "alert", label: "ALERT" }, { id: "bed", label: "BEDDED" },
];
const maxOf = (f: (b: AnimalBlueprint) => number) => Math.max(...WILDLIFE.map(f));

export default function Guide() {
  const { save, studio, units, playUi } = useApp();
  const [idx, setIdx] = useState(0);
  const [sex, setSex] = useState<"male" | "female">("male");
  const [pose, setPose] = useState<StudioPose>("walk");
  const [style, setStyle] = useState<StudioStyle>("shaded");
  const bp = WILDLIFE[idx];
  useEffect(() => {
    const st = studio();
    st.view = "orbit"; st.autoRotate = true; st.rotateSpeed = 0.16; st.zoom = 1; st.pitch = 0.16;
    st.pad = { top: 56, right: 10, bottom: 10, left: 10 };
    st.style = style;
    void st.load({ id: bp.id, sex, age: 1, seed: 3 }).then(() => st.setPose(pose));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bp.id, sex, studio]);
  useEffect(() => { const st = studio(); st.setPose(pose); }, [pose, studio]);
  useEffect(() => { const st = studio(); st.style = style; }, [style, studio]);
  const f = bp.facts, S = bp.senses, j = save.v3.journal[bp.species];
  const pp: { id: StudioPose; label: string }[] = bp.gait.stot ? [...POSES, { id: "stot", label: "STOT" }] : POSES;
  return (
    <div className="screen guide">
      <TopBar title="Field Guide" sub={`${bp.drawing} · ${bp.species.toUpperCase()} · ${f.latin.toUpperCase()}`} />
      <div className="guide-tabs">
        {WILDLIFE.map((w, i) => (
          <button key={w.id} className={i === idx ? "on" : ""} onClick={() => { playUi("page"); setIdx(i); }}>
            <Drawing id={w.id} w={150} h={78} view="left" style="ink" margin={0.05} />
            <span>{w.species}</span>
            <small>{save.v3.journal[w.species]?.harvested ? `✦ ${save.v3.journal[w.species].harvested}` : save.v3.journal[w.species]?.spotted ? "SEEN" : "—"}</small>
          </button>
        ))}
      </div>
      <div className="guide-grid">
        <StudioViewport className="guide-view">
          <div className="view-tools">
            <div className="seg">{pp.map(p => <button key={p.id} className={pose === p.id ? "on" : ""} onClick={() => setPose(p.id)}>{p.label}</button>)}</div>
            <div className="seg">
              {(["shaded", "lines", "xray"] as StudioStyle[]).map(s => <button key={s} className={style === s ? "on" : ""} onClick={() => setStyle(s)}>{s === "xray" ? "X-RAY" : s.toUpperCase()}</button>)}
              <button className={sex === "male" ? "on" : ""} onClick={() => setSex("male")}>{bp.maleName.toUpperCase()}</button>
              <button className={sex === "female" ? "on" : ""} onClick={() => setSex("female")}>{bp.femaleName.toUpperCase()}</button>
            </div>
          </div>
          {style === "xray" && <div className="xray-legend">{bp.organs.map(o => <span key={o.id}><i style={{ background: ORGAN_COLORS[o.id] }} />{o.id.toUpperCase()}</span>)}<span><i className="vital" />GREAT ZONE</span></div>}
        </StudioViewport>
        <aside className="panel guide-side">
          <div className="g-head">
            <h2>{bp.species}</h2>
            <small><i>{f.latin}</i> · {f.family}</small>
            <div className="g-journal"><span>SEEN <b>{j?.spotted ?? 0}</b></span><span>TAKEN <b>{j?.harvested ?? 0}</b></span><span>BEST <b>{j?.bestScore || "—"}</b></span></div>
          </div>
          <dl className="facts-list">
            <dt>RANGE</dt><dd>{f.range}</dd>
            <dt>HABITAT</dt><dd>{f.habitat}</dd>
            <dt>DIET</dt><dd>{f.diet}</dd>
            <dt>SHOULDER</dt><dd>{f.shoulder}</dd>
            <dt>WEIGHT</dt><dd>{f.weight}</dd>
            <dt>SPEED</dt><dd>{f.topSpeed}</dd>
            <dt>LIFESPAN</dt><dd>{f.lifespan}</dd>
            <dt>ACTIVITY</dt><dd>{f.season}</dd>
            <dt>VOICE</dt><dd>{f.call}</dd>
          </dl>
          <div className="g-block">
            <div className="section-title"><span>SENSES</span><small>{S.group.toUpperCase()} OF {S.herd[0]}–{S.herd[1]}</small></div>
            <SenseBar label="SIGHT" v={S.sight / maxOf(b => b.senses.sight)} right={`${S.sight} m`} />
            <SenseBar label="HEARING" v={S.hearing / maxOf(b => b.senses.hearing)} right={`×${S.hearing.toFixed(2)}`} />
            <SenseBar label="SMELL" v={S.smell / maxOf(b => b.senses.smell)} right={`${S.smell} m`} />
            <SenseBar label="WARINESS" v={S.wariness} right={`${Math.round(S.wariness * 100)}%`} />
            <p className="g-note">{f.senses}</p>
          </div>
          <div className="g-block">
            <div className="section-title"><span>SHOT PLACEMENT</span><small>X-RAY · LEFT SIDE</small></div>
            <Drawing id={bp.id} w={520} h={300} view="left" style="ink" sex={sex} overlay={s => (
              <g>
                {s.vital && <ellipse cx={s.vital.cx} cy={s.vital.cy} rx={s.vital.rx} ry={s.vital.ry} fill="rgba(83,243,220,0.10)" stroke="#53f3dc" strokeDasharray="5 4" strokeWidth="1.5" />}
                {s.organs.filter(o => o.id !== "spine").map(o => <ellipse key={o.id} cx={o.cx} cy={o.cy} rx={o.rx} ry={o.ry} fill={ORGAN_COLORS[o.id]} fillOpacity={o.id === "heart" || o.id === "brain" ? 0.85 : 0.45} />)}
              </g>
            )} />
            <p className="g-note">Head = <b className="c-perfect">PERFECT</b>. Heart, lungs or the dashed upper-shoulder zone = <b className="c-great">GREAT</b>. Liver, paunch, legs and neck = <b className="c-good">GOOD</b> — the animal runs wounded and must be tracked.</p>
          </div>
          <div className="g-block tracks">
            <div className="section-title"><span>SIGN</span><small>TRACK {bp.track.length}×{bp.track.width} cm · STRIDE {Math.round(bp.track.stride * 100)} cm</small></div>
            <div className="sign-row">
              <CanvasView width={220} height={260} className="track-canvas" deps={[bp.id]} draw={(g, w, h) => {
                const pxcm = Math.min(20, (h * 0.78) / bp.track.length);
                g.fillStyle = "rgb(20,40,52)"; g.fillRect(0, 0, w, h);
                g.strokeStyle = "rgba(83,243,220,0.16)"; g.lineWidth = 1;
                for (let x = w / 2 % pxcm; x < w; x += pxcm) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
                for (let y = h / 2 % pxcm; y < h; y += pxcm) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
                g.fillStyle = "#cfe9e4";
                drawHoofPrint(g, w / 2, h / 2 - pxcm * 0.4, (bp.track.length * pxcm) / 0.9, bp.track.shape, bp.track.dewclaws);
              }} />
              <div className="sign-info">
                <p><b>Tracks.</b> {bp.track.shape === "heart" ? "Heart-shaped split hoof, tips pointing the way of travel." : bp.track.shape === "boar" ? "Rounded split hoof with dewclaws printing wide behind." : bp.track.shape === "bison" ? "Large, round cow-like print." : bp.track.shape === "blocky" ? "Square, blunt-toed split hoof with straight edges." : "Split hoof."}{bp.track.dewclaws ? " Dewclaws print in soft ground." : ""}</p>
                <p><b>Droppings.</b> {bp.track.dropping.kind === "pellets" ? "Pellet groups." : bp.track.dropping.kind === "pile" ? "Clumped piles." : bp.track.dropping.kind === "pat" ? "Flat round pats." : "Segmented logs."}</p>
                <p><b>Gaits.</b> Walk {fmtSpeed(bp.gait.walk.speed, units)} · trot {fmtSpeed(bp.gait.trot.speed, units)} · gallop {fmtSpeed(bp.gait.gallop.speed, units)}; flees at {fmtSpeed(bp.gait.flee, units)}.</p>
                <p className="g-note">Grid squares are 1 cm.</p>
              </div>
            </div>
          </div>
          <div className="g-block">
            <div className="section-title"><span>TROPHY CLASSES</span><small>{bp.trophy.measure.toUpperCase()} SCORE · {bp.trophy.unit}</small></div>
            <div className="tiers">
              {(["bronze", "silver", "gold", "diamond"] as const).map(t => <span key={t} className={`tier ${t}`}><small>{t.toUpperCase()}</small><b>{bp.trophy.tiers[t]}+</b></span>)}
            </div>
          </div>
          <ul className="notes">{f.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </aside>
      </div>
    </div>
  );
}

function SenseBar({ label, v, right }: { label: string; v: number; right: string }) {
  return <div className="sense"><small>{label}</small><div className="meter-bar"><span style={{ width: `${Math.round(Math.max(0.05, Math.min(1, v)) * 100)}%` }} /></div><b>{right}</b></div>;
}
