"use client";
// Blueprint Studio: every model in the game, from every side, in blueprint
// line art, paper, shaded or x-ray, with dimension lines, gaits, exploded
// assemblies, parts lists and sheet export.

import { Fragment, useEffect, useMemo, useState } from "react";
import { useApp } from "../ctx.ts";
import { WILDLIFE, WILDLIFE_BY_ID } from "../../blueprints/wildlife/index.ts";
import { GEAR, GEAR_BY_ID } from "../../blueprints/gear.ts";
import { STRUCTURES, STRUCTURES_BY_ID } from "../../blueprints/structures.ts";
import { FLORA, FLORA_BY_ID } from "../../blueprints/flora.ts";
import type { BlueprintMeta } from "../../blueprints/types.ts";
import { specRows, type AssemblyBlueprint } from "../../blueprints/assembly.ts";
import { ORGAN_COLORS } from "../../render/blueprint-render.ts";
import { VIEWS, type ViewName } from "../../render/views.ts";
import type { DimLine, StudioPose, StudioStyle, StudioView } from "../../modes/studio.ts";
import { StudioViewport, TopBar } from "../components.tsx";
import { fmtLen } from "../format.ts";
import { checkAchievements } from "../../data/achievements.ts";
import { ACHIEVEMENTS } from "../../data/save.ts";

const GROUPS: { title: string; items: BlueprintMeta[] }[] = [
  { title: "WILDLIFE · A", items: WILDLIFE },
  { title: "GEAR · G", items: GEAR },
  { title: "STRUCTURES · S / V", items: STRUCTURES },
  { title: "FLORA · F", items: FLORA },
];
const VIEW_ORDER: StudioView[] = ["orbit", "iso", "front", "back", "left", "right", "top", "bottom"];
const POSES: StudioPose[] = ["rest", "walk", "trot", "gallop", "graze", "alert", "bed"];

function metaFor(id: string): BlueprintMeta | undefined { return WILDLIFE_BY_ID[id] ?? GEAR_BY_ID[id] ?? STRUCTURES_BY_ID[id] ?? FLORA_BY_ID[id]; }

export default function Studio() {
  const { studio, save, update, units, playUi, snap, toast } = useApp();
  const [id, setId] = useState("mule-deer");
  const [view, setView] = useState<StudioView>("iso");
  const [style, setStyle] = useState<StudioStyle>("lines");
  const [pose, setPose] = useState<StudioPose>("rest");
  const [sex, setSex] = useState<"male" | "female">("male");
  const [explode, setExplode] = useState(0);
  const [dims, setDims] = useState<DimLine[]>([]);
  const [ground, setGround] = useState<number | null>(null);
  const [info, setInfo] = useState("");
  const [size, setSize] = useState<[number, number, number]>([0, 0, 0]);
  const meta = metaFor(id)!;
  const wl = WILDLIFE_BY_ID[id];
  const asm: AssemblyBlueprint | undefined = GEAR_BY_ID[id] ?? STRUCTURES_BY_ID[id];

  useEffect(() => {
    const st = studio();
    st.autoRotate = true; st.rotateSpeed = 0.14; st.zoom = 1;
    st.pad = { top: 96, right: 24, bottom: 150, left: 24 };
    st.onLoaded = (s) => { setInfo(s.info); const v = s.box.getSize(s.box.min.clone()); setSize([v.z, v.x, v.y]); };
    return () => { st.onLoaded = undefined; };
  }, [studio]);
  useEffect(() => {
    const st = studio();
    st.explode = asm ? explode : 0;
    st.style = style;
    void st.load({ id, sex, age: 1, seed: 1 }).then(() => st.setPose(wl ? pose : "rest"));
    // mark as opened
    if (!save.v3.studioSeen.includes(id)) {
      const next = update(s => ({ ...s, v3: { ...s.v3, studioSeen: [...s.v3.studioSeen, id] } }));
      const got = checkAchievements(next, { kind: "studio" });
      if (got.length) { update(s => ({ ...s, v3: { ...s.v3, achievements: [...s.v3.achievements, ...got] } })); for (const g of got) toast(`ACHIEVEMENT · ${ACHIEVEMENTS.find(a => a.id === g)?.title.toUpperCase()}`, "ach"); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, sex, studio, explode, style === "xray"]);
  useEffect(() => { const st = studio(); st.view = view; st.zoom = 1; if (view === "orbit") { st.yaw = 0.8; st.pitch = 0.22; } }, [view, studio]);
  useEffect(() => { const st = studio(); st.style = style; }, [style, studio]);
  useEffect(() => { const st = studio(); if (wl) st.setPose(pose); }, [pose, studio, wl]);
  useEffect(() => {
    const iv = window.setInterval(() => { const st = studio(); setDims(st.dimensions()); setGround(st.groundY()); }, 120);
    return () => window.clearInterval(iv);
  }, [studio]);

  const exportSheet = async () => {
    playUi("page");
    const v: ViewName = view === "orbit" ? "iso" : view;
    const W = 2000, H = 1300;
    const s = await snap.get(id, { view: v, w: W, h: H, style: style === "paper" ? "paper" : "blueprint", sex, age: 1, seed: 1, pose: wl && pose !== "rest" ? pose : undefined, margin: 0.18, ss: 1.5 });
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d")!;
    const img = new Image(); img.src = s.url; await img.decode();
    g.drawImage(img, 0, 0);
    const ink = style === "paper" ? "#14202e" : "#eaf6ff";
    g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = 3; g.strokeRect(24, 24, W - 48, H - 48); g.lineWidth = 1.2; g.strokeRect(36, 36, W - 72, H - 72);
    const bx = W - 36 - 640, by = H - 36 - 200;
    g.lineWidth = 2; g.strokeRect(bx, by, 640, 200);
    g.beginPath(); g.moveTo(bx, by + 70); g.lineTo(bx + 640, by + 70); g.moveTo(bx, by + 135); g.lineTo(bx + 640, by + 135); g.moveTo(bx + 320, by + 70); g.lineTo(bx + 320, by + 200); g.stroke();
    g.font = "800 40px 'Barlow Condensed', sans-serif"; g.fillText(meta.title.toUpperCase(), bx + 18, by + 50);
    g.font = "700 22px 'Barlow Condensed', sans-serif";
    g.fillText(`DRAWING ${meta.drawing}   REV ${meta.rev}`, bx + 18, by + 110);
    g.fillText(`VIEW: ${VIEWS[v].label}`, bx + 338, by + 110);
    g.fillText(`OVERALL L ${fmtLen(size[0], units)} · W ${fmtLen(size[1], units)} · H ${fmtLen(size[2], units)}`, bx + 18, by + 176);
    g.fillText("WILDFRONT HORIZON 3.0 · FLEXZONIC GAMES", bx + 338, by + 176);
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = `${meta.drawing}-${meta.id}-${v}.png`;
    a.click();
  };

  const parts = useMemo(() => {
    if (asm) {
      const seen = new Map<string, { name: string; mat: string; qty: number }>();
      for (const p of asm.prims) { const k = `${p.name}|${p.mat}`; const e = seen.get(k); if (e) e.qty++; else seen.set(k, { name: p.name, mat: asm.materials[p.mat]?.label ?? p.mat, qty: 1 }); }
      return [...seen.values()];
    }
    return [];
  }, [asm]);

  return (
    <div className={`screen studio style-${style}`}>
      <TopBar title="Blueprint Studio" sub={`${meta.drawing} · ${meta.title.toUpperCase()} · REV ${meta.rev}`}>
        <button className="ghost small" onClick={exportSheet}>EXPORT SHEET PNG</button>
      </TopBar>
      <div className="studio-grid">
        <aside className="panel cat">
          {GROUPS.map(gp => (
            <div key={gp.title} className="cat-group">
              <div className="group-label">{gp.title}</div>
              {gp.items.map(it => (
                <button key={it.id} className={`cat-item ${it.id === id ? "on" : ""} ${save.v3.studioSeen.includes(it.id) ? "seen" : ""}`} onClick={() => { playUi("page"); setId(it.id); setExplode(0); }}>
                  <i>{it.drawing}</i><span>{it.title}</span>
                </button>
              ))}
            </div>
          ))}
        </aside>
        <StudioViewport className="studio-view">
          <div className="sheet-frame"><i className="zl">A</i><i className="zl b">B</i><i className="zl c">C</i><i className="zn">1</i><i className="zn b">2</i><i className="zn c">3</i></div>
          <div className="view-tools">
            <div className="seg">{VIEW_ORDER.map(v => <button key={v} className={view === v ? "on" : ""} onClick={() => { playUi("select"); setView(v); }}>{v === "orbit" ? "3D" : VIEWS[v].short}</button>)}</div>
            <div className="seg">{(["lines", "paper", "shaded", "xray"] as StudioStyle[]).map(s => <button key={s} className={style === s ? "on" : ""} onClick={() => { playUi("select"); setStyle(s); }} disabled={s === "xray" && !wl && !asm}>{s === "lines" ? "BLUEPRINT" : s === "xray" ? "X-RAY" : s.toUpperCase()}</button>)}</div>
            {wl && <div className="seg">{POSES.map(p => <button key={p} className={pose === p ? "on" : ""} onClick={() => setPose(p)}>{p === "rest" ? "STAND" : p.toUpperCase()}</button>)}</div>}
            {wl && <div className="seg"><button className={sex === "male" ? "on" : ""} onClick={() => setSex("male")}>{wl.maleName.toUpperCase()}</button><button className={sex === "female" ? "on" : ""} onClick={() => setSex("female")}>{wl.femaleName.toUpperCase()}</button></div>}
            {asm && <label className="explode">EXPLODE<input type="range" min={0} max={1} step={0.05} value={explode} onChange={e => setExplode(Number(e.target.value))} /></label>}
          </div>
          <div className="title-block">
            <div className="tb-a"><small>TITLE</small><b>{meta.title}</b></div>
            <div className="tb-b"><small>DRAWING</small><b>{meta.drawing}</b></div>
            <div className="tb-c"><small>REV</small><b>{meta.rev}</b></div>
            <div className="tb-d"><small>VIEW</small><b>{view === "orbit" ? "PERSPECTIVE" : VIEWS[view].label}</b></div>
            <div className="tb-e"><small>OVERALL L × W × H</small><b>{fmtLen(size[0], units)} × {fmtLen(size[1], units)} × {fmtLen(size[2], units)}</b></div>
          </div>
          {style === "xray" && wl && <div className="xray-legend">{wl.organs.map(o => <span key={o.id}><i style={{ background: ORGAN_COLORS[o.id] }} />{o.id.toUpperCase()}</span>)}<span><i className="vital" />GREAT ZONE</span></div>}
        </StudioViewport>
        <aside className="panel spec">
          <div className="section-title"><span>{meta.drawing}</span><small>{meta.category.toUpperCase()} · SCALE {meta.scale}</small></div>
          <div className="spec-body">
            <h3>{meta.title}</h3>
            {meta.subtitle && <p className="sub">{meta.subtitle}</p>}
            <p className="build-info">{info}</p>
            {asm && specRows(asm).length > 0 && <dl className="facts-list">{specRows(asm).map((sp, i) => <Fragment key={i}><dt>{sp.label.toUpperCase()}</dt><dd>{sp.value}</dd></Fragment>)}</dl>}
            {wl && (
              <dl className="facts-list">
                <dt>LATIN</dt><dd><i>{wl.facts.latin}</i></dd>
                <dt>SHOULDER</dt><dd>{wl.facts.shoulder}</dd>
                <dt>WEIGHT</dt><dd>{wl.facts.weight}</dd>
                <dt>LOFT</dt><dd>{wl.body.length} stations · superelliptic sections</dd>
                <dt>ORGANS</dt><dd>{wl.organs.map(o => o.id).join(", ")}</dd>
              </dl>
            )}
            {meta.notes.length > 0 && <><div className="lo-label">NOTES</div><ul className="notes">{meta.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></>}
            {parts.length > 0 && (
              <>
                <div className="lo-label">PARTS LIST</div>
                <table className="parts"><tbody>{parts.slice(0, 40).map((p, i) => <tr key={i}><td>{i + 1}</td><td>{p.name}</td><td>{p.mat}</td><td>×{p.qty}</td></tr>)}</tbody></table>
              </>
            )}
            {asm?.facts && <ul className="notes">{asm.facts.map((n, i) => <li key={i}>{n}</li>)}</ul>}
            {"facts" in meta && Array.isArray((meta as { facts?: unknown }).facts) && !asm && !wl && <ul className="notes">{((meta as unknown as { facts: string[] }).facts).map((n, i) => <li key={i}>{n}</li>)}</ul>}
          </div>
        </aside>
      </div>
      <svg className="dims-layer">
        {ground !== null && dims.length > 0 && <line x1={dims[0].x0 - 60} x2={dims[0].x1 + 60} y1={ground} y2={ground} className="ground-line" />}
        {dims.map((d, i) => (
          <g key={i} className="dim">
            {d.kind === "h" ? (<>
              <line x1={d.x0} x2={d.x0} y1={d.oy + 4} y2={d.y0 + 6} /><line x1={d.x1} x2={d.x1} y1={d.oy + 4} y2={d.y0 + 6} />
              <line x1={d.x0} x2={d.x1} y1={d.y0} y2={d.y1} markerStart="url(#arr)" markerEnd="url(#arr)" />
              <text x={(d.x0 + d.x1) / 2} y={d.y0 + 18} textAnchor="middle">{d.label} {fmtLen(d.value, units)}</text>
            </>) : (<>
              <line x1={d.ox + 4} x2={d.x0 + 6} y1={d.y0} y2={d.y0} /><line x1={d.ox + 4} x2={d.x0 + 6} y1={d.y1} y2={d.y1} />
              <line x1={d.x0} x2={d.x1} y1={d.y0} y2={d.y1} markerStart="url(#arr)" markerEnd="url(#arr)" />
              <text x={d.x0 + 10} y={(d.y0 + d.y1) / 2} transform={`rotate(-90 ${d.x0 + 10} ${(d.y0 + d.y1) / 2})`} textAnchor="middle" dy="-4">{d.label} {fmtLen(d.value, units)}</text>
            </>)}
          </g>
        ))}
        <defs><marker id="arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1 L10 5 L0 9 z" className="arrowhead" /></marker></defs>
      </svg>
    </div>
  );
}
