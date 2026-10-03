"use client";
/* eslint-disable react-hooks/immutability -- GameHost and HuntSession are imperative
   engine objects that live outside React; screens configure them from callbacks and effects by design
   (the React Compiler is not enabled for this project). */
// In-hunt HUD. React renders the slow-changing parts at ~12 Hz from
// HuntSession snapshots; the compass strip and the minimap are driven every
// frame through `frameRef` so they track the view without lag.

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactElement } from "react";
import type { HuntSession, HudSnapshot, ShotAnalysis, TrophyRecord, HuntConfig } from "../../hunt/hunt.ts";
import type { Mission } from "../../data/missions.ts";
import { renderTopo } from "../../render/topo.ts";
import { useApp } from "../ctx.ts";
import { CondIcon } from "../components.tsx";
import { fmtDist, fmtSpeed } from "../format.ts";
import { BinocularOverlay, ScopeOverlay } from "./Scope.tsx";
import { ShotCard, TagCard } from "./Cards.tsx";
import MapOverlay, { drawHunter, drawScentCone } from "./MapOverlay.tsx";
import TouchControls from "./Touch.tsx";
import SettingsScreen from "../screens/Settings.tsx";
import type { Overlay } from "../App.tsx";

const PXDEG = 3.4;
const CARD = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export interface HudProps {
  hunt: HuntSession | null; plan: { cfg: HuntConfig; mission: Mission | null }; hud: HudSnapshot; frameRef: MutableRefObject<((h: HuntSession) => void) | null>;
  overlay: Overlay; engaged: boolean; locked: boolean;
  onEngage: () => void; onPause: () => void; onResume: () => void; onMap: () => void; onAbandon: () => void; onRestart: () => void; onEndFree: () => void;
  shotCard: ShotAnalysis | null; onShotCardDone: () => void; tagCard: TrophyRecord | null; onTagDone: () => void;
}

export default function Hud(p: HudProps) {
  const { hud, hunt, plan } = p;
  const { units, touch, host, save } = useApp();
  const stripRef = useRef<HTMLDivElement>(null);
  const compassRef = useRef<HTMLDivElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const lastMini = useRef(0);
  const minimal = save.v3.settings.hud === "minimal";
  const miniBase = useMemo(() => hunt ? renderTopo(hunt.world.terrain, { size: 1024, style: "field", grid: false, labels: false, contours: true }) : null, [hunt]);

  // ---- per-frame compass + minimap
  useEffect(() => {
    p.frameRef.current = (h: HuntSession) => {
      const heading = ((-h.player.yaw * 180 / Math.PI) % 360 + 360) % 360;
      const cw = compassRef.current?.clientWidth ?? 560;
      if (stripRef.current) stripRef.current.style.transform = `translate3d(${cw / 2 - (heading + 360) * PXDEG}px,0,0)`;
      const now = performance.now();
      const c = miniRef.current;
      if (c && miniBase && now - lastMini.current > 33) {
        lastMini.current = now;
        const g = c.getContext("2d")!;
        const S = c.width, R = S / 2, k = R / 140;   // 140 m to the rim
        const px = h.player.pos.x, pz = h.player.pos.z, yaw = h.player.yaw;
        const t = h.world.terrain;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, S, S);
        g.save();
        g.beginPath(); g.arc(R, R, R - 2, 0, Math.PI * 2); g.clip();
        g.fillStyle = "#0b1a22"; g.fillRect(0, 0, S, S);
        g.translate(R, R); g.rotate(yaw); g.scale(k, k); g.translate(-px, -pz);
        g.drawImage(miniBase, -t.half, -t.half, t.half * 2, t.half * 2);
        drawScentCone(g, h, (x, z) => [x, z]);
        g.setTransform(1, 0, 0, 1, 0, 0);
        const scr = (x: number, z: number): [number, number] => {
          const dx = (x - px) * k, dz = (z - pz) * k, c0 = Math.cos(yaw), s0 = Math.sin(yaw);
          return [R + dx * c0 - dz * s0, R + dx * s0 + dz * c0];
        };
        // 100 m ring
        g.beginPath(); g.arc(R, R, 100 * k, 0, Math.PI * 2); g.strokeStyle = "rgba(233,255,251,0.18)"; g.lineWidth = 1.5; g.stroke();
        const def = h.world.def;
        const clampR = (q: [number, number]): [number, number, boolean] => { const dx = q[0] - R, dy = q[1] - R, l = Math.hypot(dx, dy); return l > R - 12 ? [R + dx / l * (R - 12), R + dy / l * (R - 12), true] : [q[0], q[1], false]; };
        const [tx, ty] = clampR(scr(def.spawn.x, def.spawn.z));
        g.beginPath(); g.arc(tx, ty, 6, 0, Math.PI * 2); g.fillStyle = "#e9fffb"; g.fill(); g.strokeStyle = "#04121a"; g.lineWidth = 2; g.stroke();
        if (h.waypoint) { const [wx, wy] = clampR(scr(h.waypoint.x, h.waypoint.z)); g.beginPath(); g.moveTo(wx, wy + 6); g.lineTo(wx - 7, wy - 9); g.lineTo(wx + 7, wy - 9); g.closePath(); g.fillStyle = "#53f3dc"; g.fill(); }
        for (const a of h.animals.animals) {
          const d = Math.hypot(a.x - px, a.z - pz);
          if (d > 200) continue;
          if (!a.alive && a.harvested && !a.tagged) { const [x, y] = clampR(scr(a.x, a.z)); g.fillStyle = "#caff47"; g.fillRect(x - 2.5, y - 8, 5, 16); g.fillRect(x - 8, y - 2.5, 16, 5); }
          else if (a.alive && a.spotted && d < 160) { const [x, y, edge] = clampR(scr(a.x, a.z)); g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.globalAlpha = edge ? 0.6 : 1; g.fillStyle = a.wound !== "none" ? "#ff5a5a" : "#ff9c38"; g.fillRect(-4.5, -4.5, 9, 9); g.restore(); }
        }
        drawHunter(g, R, R, 0, 10);
        g.restore();
        // north marker on the rim
        const [ax, ay] = clampR(scr(px, pz - 1e4));
        g.font = "800 22px 'Barlow Condensed', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillStyle = "#04121a"; g.beginPath(); g.arc(ax, ay, 13, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#ff9c38"; g.fillText("N", ax, ay + 1);
        g.beginPath(); g.arc(R, R, R - 2, 0, Math.PI * 2); g.strokeStyle = "rgba(83,243,220,0.55)"; g.lineWidth = 3; g.stroke();
      }
    };
    return () => { p.frameRef.current = null; };
  }, [p.frameRef, miniBase]);

  // ---- compass contents (ticks are static; markers update with the snapshot)
  const ticks = useMemo(() => {
    const out: ReactElement[] = [];
    for (let d = -360; d < 720; d += 5) {
      const n = ((d % 360) + 360) % 360;
      const x = (d + 360) * PXDEG;
      if (n % 45 === 0) out.push(<span key={d} className={`ct card ${n === 0 ? "north" : ""}`} style={{ left: x }}>{CARD[n / 45]}</span>);
      else if (n % 15 === 0) out.push(<span key={d} className="ct num" style={{ left: x }}>{n}</span>);
      else out.push(<i key={d} className="ct tick" style={{ left: x }} />);
    }
    return out;
  }, []);
  const markers = useMemo(() => {
    const out: ReactElement[] = [];
    const place = (deg: number, key: string, cls: string, label: string, sub?: string) => {
      const n = ((deg % 360) + 360) % 360;
      for (const k of [-360, 0, 360]) out.push(<span key={`${key}${k}`} className={`cm ${cls}`} style={{ left: (n + k + 360) * PXDEG }}><b>{label}</b>{sub && <small>{sub}</small>}</span>);
    };
    for (const [i, m] of hud.markers.entries()) {
      const deg = (m.a - hud.yaw) * 180 / Math.PI;
      const glyph = m.kind === "home" ? "⌂" : m.kind === "waypoint" ? "▼" : m.kind === "harvest" ? "✚" : "◆";
      place(deg, `m${i}`, m.kind, glyph, fmtDist(m.d, units, true));
    }
    if (hunt) place(hunt.world.env.windDir * 180 / Math.PI, "scent", "scent", "SCENT", "▼");
    return out;
  }, [hud.markers, hud.yaw, units, hunt]);

  const scentState = hud.scent > 0.4 ? "danger" : hud.scent > 0.15 ? "careful" : "safe";
  const W = typeof window !== "undefined" ? window.innerWidth : 1280, H = typeof window !== "undefined" ? window.innerHeight : 720;
  const bdc = useMemo(() => hunt?.bdc() ?? [], [hunt]);
  const optic = hud.scoped || hud.binoculars;

  const engage = useCallback(() => p.onEngage(), [p]);

  return (
    <div className={`hud-root ${optic ? "optic" : ""} ${minimal ? "minimal" : ""}`}>
      {hud.scoped && <ScopeOverlay hud={hud} bdc={bdc} units={units} />}
      {hud.binoculars && !hud.scoped && <BinocularOverlay hud={hud} units={units} />}
      {!optic && <div className="field-reticle"><i /><span /><b /><em /></div>}
      {/* scanner highlights */}
      {hud.scanTargets.map((s, i) => <div key={i} className="scan-target" style={{ left: (s.x + 1) / 2 * W, top: (1 - s.y) / 2 * H }}><i /><small>{s.label}</small></div>)}
      {hud.shotFeedback && <div className={`shot-confirm ${hud.shotFeedback}`}><i /><b>{hud.shotLabel}</b></div>}
      {hud.prompt && !optic && <div className="prompt">{touch ? hud.prompt.replace(/^F — /, "USE — ") : hud.prompt}</div>}
      {hud.boundary > 0.2 && <div className="boundary" style={{ opacity: Math.min(1, hud.boundary) }}><b>RESERVE BOUNDARY</b><small>TURN BACK</small></div>}

      <div className="hud top">
        <div><small>{plan.mission ? "CONTRACT" : "FREE HUNT"}</small><b>{plan.mission ? plan.mission.name : plan.cfg.reserve}</b></div>
        <div className="objective"><small>{plan.mission ? "CLEAN HARVEST" : "TAGGED"}</small><b>{plan.mission ? hud.target : hud.collected}</b></div>
        <div><small>SCORE</small><b>{hud.score}</b></div>
      </div>
      <div className="compass" ref={compassRef}>
        <div className="compass-strip" ref={stripRef}>{ticks}{markers}</div>
        <div className="compass-needle" />
        <div className="compass-heading">{String(Math.round(hud.heading) % 360).padStart(3, "0")}°</div>
      </div>
      <div className="hud-tr">
        <div className="clock"><CondIcon k={plan.cfg.weather} size={15} /><span>{hud.clock}</span></div>
        {!minimal && <canvas ref={miniRef} className="minimap" width={360} height={360} onClick={p.onMap} />}
      </div>
      <div className={`wind-panel scent-${scentState}`}>
        <div className="wind-dial"><span className="wind-arrow" style={{ transform: `rotate(${hud.windRel}rad)` }}>↑</span></div>
        <div><small>WIND</small><b>{fmtSpeed(hud.windSpeed, units)}</b><em>SCENT · {scentState === "safe" ? "CLEAR" : scentState === "careful" ? "DRIFTING NEAR GAME" : "GAME DOWNWIND"}</em></div>
      </div>
      {!minimal && (
        <div className="body-panel">
          <div className={`stance st-${hud.stance}`}><StanceIcon s={hud.stance} /><b>{hud.stance.toUpperCase()}</b></div>
          <div className="mini-meter"><small>NOISE</small><span><i style={{ width: `${Math.round(hud.noise * 100)}%` }} className={hud.noise > 0.5 ? "hot" : ""} /></span></div>
          <div className="mini-meter"><small>VISIBLE</small><span><i style={{ width: `${Math.round(hud.visibility * 100)}%` }} className={hud.visibility > 0.6 ? "hot" : ""} /></span></div>
          <div className="mini-meter"><small>STAMINA</small><span><i style={{ width: `${Math.round(hud.stamina)}%` }} /></span></div>
          <div className="heart"><span className="beat" style={{ animationDuration: `${60 / Math.max(50, hud.heart)}s` }}>♥</span><b>{hud.heart}</b><small>BPM</small></div>
        </div>
      )}
      <div className="ammo"><span>{hud.ammo}</span><small>/ {hud.reserve}<br />{hud.reloading ? "RELOADING…" : hud.weaponState === "cycling" ? "CYCLING BOLT" : "FIELD ROUNDS"}</small></div>
      <div className={`scan-meter ${hud.scanActive ? "active" : ""}`}>TRAIL SCAN <b>{hud.scan}%</b>{hud.hasCaller && <em className={hud.callReady ? "" : "cool"}>CALL {hud.callReady ? "READY" : "…"}</em>}</div>
      {!touch && !minimal && <div className="desktop-help">WASD MOVE · MOUSE LOOK/FIRE · RMB AIM · Q ZOOM · SHIFT STEADY · E SCAN · F USE · B BINOCULARS · C CROUCH · Z PRONE · T CALL · M MAP · R RELOAD · ESC PAUSE</div>}
      {touch && host && <TouchControls input={host.input} hud={hud} onMap={p.onMap} onPause={p.onPause} />}
      {p.shotCard && <ShotCard a={p.shotCard} units={units} onDone={p.onShotCardDone} />}
      {p.tagCard && <TagCard t={p.tagCard} units={units} onDone={p.onTagDone} />}
      {!p.engaged && <EngageCard plan={plan} touch={touch} onEngage={engage} />}
      {p.engaged && !touch && !p.locked && p.overlay === "none" && <div className="lock-hint" onClick={() => host.input.requestLock()}>CLICK TO TAKE AIM</div>}
      {p.overlay === "pause" && <PauseMenu {...p} />}
      {p.overlay === "map" && hunt && <MapOverlay hunt={hunt} units={units} onClose={p.onResume} />}
    </div>
  );
}

function StanceIcon({ s }: { s: string }) {
  const c = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "currentColor" };
  if (s === "prone") return <svg {...c}><circle cx="19" cy="15" r="2.4" /><rect x="3" y="16" width="14" height="3.2" rx="1.6" /></svg>;
  if (s === "crouch") return <svg {...c}><circle cx="12" cy="5.5" r="2.6" /><path d="M9 9.5h6l1 5-3 1 2 5h-2.6l-2.2-4.6-2.2 4.6H5.4l2.4-6z" /></svg>;
  if (s === "perched") return <svg {...c}><circle cx="12" cy="4" r="2.4" /><path d="M9.5 7.5h5l.6 6h-6.2zM5 14h14v1.6H5zM7 15.6h1.6V22H7zm8.4 0H17V22h-1.6z" /></svg>;
  return <svg {...c}><circle cx="12" cy="4" r="2.6" /><path d="M9.2 8h5.6l.8 7h-2l-.6 7h-2l-.6-7h-2z" /></svg>;
}

function EngageCard({ plan, touch, onEngage }: { plan: { cfg: HuntConfig; mission: Mission | null }; touch: boolean; onEngage: () => void }) {
  const m = plan.mission;
  return (
    <div className="engage" onClick={onEngage}>
      <div className="engage-card">
        <small className="eyebrow">{m ? `CONTRACT ${String(m.id).padStart(2, "0")} · ${plan.cfg.reserve.toUpperCase()}` : `FREE HUNT · ${plan.cfg.reserve.toUpperCase()}`}</small>
        <h2>{m ? m.name : "Open Season"}</h2>
        <p>{m ? m.brief : "Every native species is on your licence. Tag trophies for credits — end the hunt from the pause menu."}</p>
        <div className="eg-row">
          <span><CondIcon k={plan.cfg.time} size={16} />{plan.cfg.time}</span>
          <span><CondIcon k={plan.cfg.weather} size={16} />{plan.cfg.weather}</span>
          <span>LICENCE · {plan.cfg.licensed.join(" · ")}</span>
          {m && <span>OBJECTIVE · {m.count} CLEAN</span>}
        </div>
        {!touch && (
          <div className="keys">
            <span><kbd>W A S D</kbd>move</span><span><kbd>MOUSE</kbd>look · fire</span><span><kbd>RMB</kbd>aim</span><span><kbd>Q</kbd>zoom</span>
            <span><kbd>SHIFT</kbd>steady / sprint</span><span><kbd>E</kbd>trail scan</span><span><kbd>F</kbd>read sign · tag · climb</span><span><kbd>B</kbd>binoculars</span>
            <span><kbd>C</kbd>crouch</span><span><kbd>Z</kbd>prone</span><span><kbd>T</kbd>call</span><span><kbd>M</kbd>map</span>
          </div>
        )}
        <button className="primary big">{touch ? "TAP TO BEGIN" : "CLICK TO BEGIN"} <span>→</span></button>
      </div>
    </div>
  );
}

function PauseMenu(p: HudProps) {
  const [tab, setTab] = useState<"main" | "settings">("main");
  const { plan, hud } = p;
  const free = plan.cfg.mode === "free";
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.code === "Escape" || e.code === "KeyP") { e.preventDefault(); p.onResume(); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [p]);
  return (
    <div className="pause">
      <div className="pause-card">
        <small className="eyebrow">{free ? "FREE HUNT" : `CONTRACT ${String(plan.mission?.id ?? 0).padStart(2, "0")}`} · PAUSED</small>
        <h2>{plan.mission ? plan.mission.name : plan.cfg.reserve}</h2>
        <div className="pause-stats"><span>SCORE <b>{hud.score}</b></span><span>{free ? "TAGGED" : "HARVEST"} <b>{free ? hud.collected : hud.target}</b></span><span>TIME <b>{hud.clock}</b></span></div>
        <div className="tabs"><button className={tab === "main" ? "on" : ""} onClick={() => setTab("main")}>HUNT</button><button className={tab === "settings" ? "on" : ""} onClick={() => setTab("settings")}>SETTINGS</button></div>
        {tab === "main" && (
          <div className="pause-actions">
            <button className="primary" onClick={p.onResume}>RESUME <span>→</span></button>
            <button className="ghost" onClick={p.onMap}>FIELD MAP</button>
            {free ? <button className="ghost" onClick={p.onEndFree}>END HUNT &amp; DEBRIEF</button> : <button className="ghost" onClick={p.onRestart}>RESTART CONTRACT</button>}
            <button className="ghost danger-text" onClick={p.onAbandon}>{free ? "LEAVE WITHOUT DEBRIEF" : "ABANDON CONTRACT"}</button>
          </div>
        )}
        {tab === "settings" && <div className="pause-settings"><SettingsScreen inHunt /></div>}
      </div>
    </div>
  );
}
