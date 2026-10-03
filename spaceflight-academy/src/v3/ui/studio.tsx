import { useEffect, useMemo, useState } from "react";
import { BLUEPRINTS } from "../blueprints/registry.ts";
import type { BlueprintCategory, Part, ViewName } from "../blueprints/types.ts";
import { STUDIO_VIEW_WORDS, type StudioScene, type StudioState, type StudioView } from "../scenes/studio.ts";
import { Sheet, TopBar, usePanelInsets, useGame, useSave, useUI } from "./common.tsx";

const CATEGORIES: { id: BlueprintCategory; label: string; icon: string }[] = [
  { id: "vehicle", label: "Spacecraft", icon: "🚀" },
  { id: "system", label: "Rocket parts", icon: "🔩" },
  { id: "cast", label: "Crew", icon: "🧑‍🚀" },
  { id: "spaceport", label: "Spaceport", icon: "🏗️" },
  { id: "destination", label: "Bases", icon: "🌙" },
];

const VIEWS: { id: StudioView; label: string; short: string }[] = [
  { id: "front", label: "Front", short: "Front" },
  { id: "back", label: "Back", short: "Back" },
  { id: "left", label: "Left", short: "Left" },
  { id: "right", label: "Right", short: "Right" },
  { id: "top", label: "Top", short: "Top" },
  { id: "bottom", label: "Bottom", short: "Bottom" },
  { id: "iso", label: "3D corner", short: "3D" },
  { id: "orbit", label: "360° spin", short: "360°" },
];

const VIEW_ICON: Record<ViewName, string> = { front: "🙂", back: "🎒", left: "⬅️", right: "➡️", top: "🐦", bottom: "🐛", iso: "🧊" };

export const VIEW_HINTS: Record<StudioView, string> = {
  front: "FRONT view — you look straight at the front, like taking a photo of someone's face.",
  back: "BACK view — you walk all the way around and look at the back.",
  left: "LEFT view — stand in front, then step around to YOUR left and look again.",
  right: "RIGHT view — stand in front, then step around to YOUR right and look again.",
  top: "TOP view — look straight down from above, like a bird flying over.",
  bottom: "BOTTOM view — look straight up from underneath, like a bug on the floor.",
  iso: "3D corner view (isometric) — shows the front, a side and the top all at once.",
  orbit: "360° view — drag to spin it around. Use 🔍 or the mouse wheel to zoom.",
};

function Overlay({ state }: { state: StudioState }) {
  const gold = "#ffe27a";
  return (
    <svg className="studio-overlay" aria-hidden="true">
      <defs>
        <marker id="sfa-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={gold} />
        </marker>
      </defs>
      {state.dimLines.map((d, i) => {
        const mx = (d.x1 + d.x2) / 2, my = (d.y1 + d.y2) / 2;
        return (
          <g key={i}>
            {d.vertical ? (
              <>
                <line x1={d.x1 + 4} y1={d.y1} x2={d.x1 + 30} y2={d.y1} stroke={gold} strokeWidth={1.2} opacity={0.8} />
                <line x1={d.x2 + 4} y1={d.y2} x2={d.x2 + 30} y2={d.y2} stroke={gold} strokeWidth={1.2} opacity={0.8} />
              </>
            ) : (
              <>
                <line x1={d.x1} y1={d.y1 - 4} x2={d.x1} y2={d.y1 - 30} stroke={gold} strokeWidth={1.2} opacity={0.8} />
                <line x1={d.x2} y1={d.y2 - 4} x2={d.x2} y2={d.y2 - 30} stroke={gold} strokeWidth={1.2} opacity={0.8} />
              </>
            )}
            <line x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke={gold} strokeWidth={2} markerStart="url(#sfa-arrow)" markerEnd="url(#sfa-arrow)" />
            <text
              x={mx}
              y={my}
              dy={d.vertical ? -8 : 20}
              fill={gold}
              fontSize={17}
              textAnchor="middle"
              transform={d.vertical ? `rotate(-90 ${mx} ${my})` : undefined}
              className="studio-text"
            >{d.label}</text>
          </g>
        );
      })}
      {state.callouts.map((c, i) => (
        <g key={`c${i}`}>
          <circle cx={c.ax} cy={c.ay} r={3.5} fill="#fff" />
          <polyline points={`${c.ax},${c.ay} ${c.lx + (c.side === "left" ? 14 : -14)},${c.ly} ${c.lx},${c.ly}`} fill="none" stroke="#fff" strokeWidth={1.4} opacity={0.9} />
          <text x={c.lx + (c.side === "left" ? -6 : 6)} y={c.ly + 5} fill="#fff" fontSize={14} textAnchor={c.side === "left" ? "end" : "start"} className="studio-text">{c.name}</text>
        </g>
      ))}
    </svg>
  );
}

function Detective({ scene, state }: { scene: StudioScene; state: StudioState }) {
  const game = useGame();
  const det = state.detective!;
  const bp = BLUEPRINTS.find((b) => b.id === det.id);
  const thumb = useMemo(() => (bp ? game.thumbnail(bp.id, 112) : ""), [game, bp]);
  if (!det.active) {
    return (
      <section className="detective panel">
        <div className="kicker">🕵️ View Detective · Case closed</div>
        <div className="h2">{det.score} / 10 {det.score >= 9 ? "🏆" : det.score >= 6 ? "⭐" : "👍"}</div>
        <p className="muted" style={{ margin: "4px 0 10px" }}>Best score: <b>{det.best}</b>. Real engineers read views like this every day to build rockets!</p>
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="btn primary" onClick={() => scene.startDetective()}>🔁 Play again</button>
          <button className="btn" onClick={() => scene.stopDetective()}>📐 Back to the Studio</button>
        </div>
      </section>
    );
  }
  return (
    <section className="detective panel">
      <div className="row">
        <span className="kicker">🕵️ View Detective · Round {det.round}/10</span>
        <div className="spacer" />
        <span className="chip">⭐ {det.score}</span>
        <button className="btn small" aria-label="Stop View Detective" onClick={() => scene.stopDetective()}>✕</button>
      </div>
      <div className="det-q">
        {thumb && <img src={thumb} alt={bp?.name ?? ""} />}
        <div>
          <b>Which view of the {bp?.name ?? "model"} is the blueprint showing?</b>
          <div className="muted" style={{ fontSize: 14 }}>The small picture shows the model from a corner. Imagine where you would have to stand.</div>
        </div>
      </div>
      <div className="opts">
        {det.options.map((v) => {
          const cls = det.picked ? (v === det.answer ? " right" : v === det.picked ? " wrong" : "") : "";
          return (
            <button key={v} className={"btn opt" + cls} disabled={!!det.picked} onClick={() => scene.answer(v)}>
              <span style={{ fontSize: 22 }}>{VIEW_ICON[v]}</span> {STUDIO_VIEW_WORDS[v]}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function InfoBody({ scene, state }: { scene: StudioScene; state: StudioState }) {
  const bp = BLUEPRINTS.find((b) => b.id === state.id);
  if (!bp) return null;
  const cat = CATEGORIES.find((c) => c.id === bp.category);
  return (
    <>
      <div className="kicker">{bp.code} · {cat?.label ?? bp.category}</div>
      <div className="h2" style={{ marginBottom: 2 }}>{bp.name}</div>
      <div className="muted" style={{ fontSize: 14 }}>{bp.subtitle}</div>
      <p style={{ fontSize: 15, lineHeight: 1.45, margin: "10px 0" }}>{bp.description}</p>
      <button className="btn small primary" onClick={() => scene.readAloud()}>🔊 Read to me</button>
      <div className="planet-facts">
        <div><b>{fmt(bp.overall.w)}</b>wide</div>
        <div><b>{fmt(bp.overall.h)}</b>tall</div>
        <div><b>{fmt(bp.overall.d)}</b>deep</div>
        <div><b>{countParts(bp.id)}</b>named parts</div>
      </div>
      {bp.facts?.map((f) => <div key={f} className="journal-item">💡 {f}</div>)}
      <div className="journal-item" style={{ borderColor: "rgba(98,232,255,.45)" }}><small>HOW TO READ THIS VIEW</small><br />{VIEW_HINTS[state.view]}</div>
    </>
  );
}

function fmt(m: number) {
  return m < 1 ? `${Math.round(m * 100)} cm` : `${m.toFixed(m < 10 ? 2 : 1)} m`;
}

/** Counts every named part, including the parts inside re-used sub-assemblies. */
function countParts(id: string, depth = 0): number {
  const bp = BLUEPRINTS.find((b) => b.id === id);
  if (!bp || depth > 4) return 0;
  let count = 0;
  const visit = (parts: readonly Part[]) => {
    for (const part of parts) {
      const copies = (part.mirrorX ? 2 : 1) * (part.radial?.count ?? 1);
      if (part.name) count += copies;
      if (part.ref) count += copies * countParts(part.ref, depth + 1);
      if (part.children) visit(part.children);
    }
  };
  visit(bp.parts);
  return count;
}

export function StudioUI() {
  const game = useGame();
  const state = useUI((s) => s.studio) as StudioState | null;
  const seen = useSave((s) => s.v3.studioSeen);
  const [cat, setCat] = useState<BlueprintCategory>("vehicle");
  const [info, setInfo] = useState(false);
  const scene = game.scene("studio") as StudioScene;
  const items = useMemo(() => BLUEPRINTS.filter((b) => b.category === cat), [cat]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const detective = !!state?.detective;

  // Follow the selected blueprint's category.
  useEffect(() => {
    const bp = BLUEPRINTS.find((b) => b.id === state?.id);
    if (bp && !state?.detective) setCat(bp.category);
  }, [state?.id, state?.detective]);

  // Thumbnails are rendered lazily, a few per frame, so opening the Studio stays snappy.
  useEffect(() => {
    let cancelled = false;
    const queue = items.filter((b) => !thumbs[b.id]).map((b) => b.id);
    const pump = () => {
      if (cancelled || !queue.length) return;
      const batch = queue.splice(0, 2);
      const add: Record<string, string> = {};
      for (const id of batch) add[id] = game.thumbnail(id, 96);
      setThumbs((t) => ({ ...t, ...add }));
      requestAnimationFrame(pump);
    };
    requestAnimationFrame(pump);
    return () => { cancelled = true; };
  }, [items, game]);

  // Tell the scene which part of the screen is free so the model is centred there.
  const mobile = usePanelInsets(scene, [detective, state?.detective?.active]);

  if (!state) return null;
  const total = BLUEPRINTS.length;
  const explored = seen.filter((id) => BLUEPRINTS.some((b) => b.id === id)).length;

  return (
    <>
      <TopBar>
        <div className="stat" title="Blueprints explored">📐 {explored}/{total}</div>
        {mobile && !detective && <button className="btn round ui-on" aria-label="About this model" onClick={() => setInfo(true)}>ℹ️</button>}
      </TopBar>
      <Overlay state={state} />
      {!detective && (
        <section className="studio-list panel">
          <div className="studio-tabs">
            {CATEGORIES.map((c) => (
              <button key={c.id} className={"btn small" + (cat === c.id ? " on" : "")} onClick={() => setCat(c.id)} title={c.label} aria-label={c.label}>
                {c.icon}<span className="tab-label"> {c.label}</span>
              </button>
            ))}
          </div>
          <div className="items scroll">
            {items.map((b) => (
              <button key={b.id} className={"btn studio-item" + (state.id === b.id ? " on" : "")} onClick={() => scene.select(b.id)}>
                {thumbs[b.id] ? <img src={thumbs[b.id]} alt="" /> : <span className="ph" />}
                <span className="txt"><small>{b.code}</small>{b.name}</span>
                {seen.includes(b.id) && <span className="seen" aria-label="explored">✓</span>}
              </button>
            ))}
          </div>
        </section>
      )}
      {!detective && !mobile && (
        <section className="studio-info panel scroll">
          <InfoBody scene={scene} state={state} />
        </section>
      )}
      {detective && <Detective scene={scene} state={state} />}
      <div className="studio-bar">
        {!detective && (
          <div className="group" role="group" aria-label="Views">
            {VIEWS.map((v) => (
              <button key={v.id} className={"btn" + (state.view === v.id ? " on" : "")} onClick={() => scene.setView(v.id)}><span className="long-label">{v.label}</span><span className="short-label">{v.short}</span></button>
            ))}
          </div>
        )}
        <div className="group" role="group" aria-label="Drawing options">
          {!detective && <button className={"btn" + (state.blueprintMode ? " on" : "")} onClick={() => scene.toggle("blueprintMode")}>{state.blueprintMode ? <>📐<span className="long-label"> Blueprint</span></> : <>🎨<span className="long-label"> Colour</span></>}</button>}
          {!detective && <button className={"btn" + (state.dims ? " on" : "")} onClick={() => scene.toggle("dims")}>📏<span className="long-label"> Sizes</span></button>}
          {!detective && <button className={"btn" + (state.labels ? " on" : "")} onClick={() => scene.toggle("labels")}>🏷️<span className="long-label"> Names</span></button>}
          {!detective && state.canExplode && <button className={"btn" + (state.exploded ? " on" : "")} onClick={() => scene.setExploded(!state.exploded)}>💥<span className="long-label"> Explode</span></button>}
          <button className="btn" aria-label="Zoom in" onClick={() => scene.zoomBy(0.8)}>🔍+</button>
          <button className="btn" aria-label="Zoom out" onClick={() => scene.zoomBy(1.25)}>🔍−</button>
          {!detective && <button className="btn gold" onClick={() => scene.startDetective()}>🕵️ <span className="long-label">View </span>Detective</button>}
        </div>
      </div>
      {info && mobile && (
        <Sheet title="About this blueprint" onClose={() => setInfo(false)}>
          <InfoBody scene={scene} state={state} />
        </Sheet>
      )}
    </>
  );
}
