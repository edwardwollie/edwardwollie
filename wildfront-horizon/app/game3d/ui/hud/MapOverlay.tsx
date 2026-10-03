"use client";
/* eslint-disable react-hooks/immutability -- GameHost and HuntSession are imperative
   engine objects that live outside React; screens configure them from callbacks and effects by design
   (the React Compiler is not enabled for this project). */
// Full field map (M): topographic map of the reserve with the hunter,
// heading, wind/scent cone, spotted game, harvests, trailhead and a
// click-to-set waypoint that also shows on the compass and minimap.

import { useEffect, useMemo, useRef, useState } from "react";
import type { HuntSession } from "../../hunt/hunt.ts";
import { mapToWorld, renderTopo, worldToMap } from "../../render/topo.ts";
import { fmtDist, fmtSpeed, type Units } from "../format.ts";

export function drawHunter(g: CanvasRenderingContext2D, x: number, y: number, yaw: number, s: number) {
  g.save(); g.translate(x, y); g.rotate(-yaw);
  g.beginPath(); g.moveTo(0, -s * 1.3); g.lineTo(s * 0.8, s * 0.8); g.lineTo(0, s * 0.35); g.lineTo(-s * 0.8, s * 0.8); g.closePath();
  g.fillStyle = "#53f3dc"; g.fill(); g.lineWidth = Math.max(1.5, s * 0.18); g.strokeStyle = "#04121a"; g.stroke();
  g.restore();
}

/** Scent cone: where the wind carries the hunter's scent (world space → map px via `P`). */
export function drawScentCone(g: CanvasRenderingContext2D, h: HuntSession, P: (x: number, z: number) => [number, number]) {
  const [wx, wz] = h.world.env.windVector();
  const sp = Math.hypot(wx, wz);
  if (sp < 0.3) return;
  const ux = wx / sp, uz = wz / sp;
  const len = 70 + sp * 22, half = 0.32;
  const px = h.player.pos.x, pz = h.player.pos.z;
  const a = Math.atan2(uz, ux);
  const [cx, cy] = P(px, pz);
  const [ex, ey] = P(px + Math.cos(a - half) * len, pz + Math.sin(a - half) * len);
  const [fx, fy] = P(px + Math.cos(a + half) * len, pz + Math.sin(a + half) * len);
  const grd = g.createLinearGradient(cx, cy, (ex + fx) / 2, (ey + fy) / 2);
  grd.addColorStop(0, "rgba(255,156,56,0.42)"); grd.addColorStop(1, "rgba(255,156,56,0)");
  g.beginPath(); g.moveTo(cx, cy); g.lineTo(ex, ey); g.lineTo(fx, fy); g.closePath(); g.fillStyle = grd; g.fill();
}

export default function MapOverlay({ hunt, units, onClose }: { hunt: HuntSession; units: Units; onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const t = hunt.world.terrain;
  const base = useMemo(() => renderTopo(t, { size: 1100, style: "field", grid: true }), [t]);
  const [tick, setTick] = useState(0);
  const [showZones, setShowZones] = useState(true);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.code === "KeyM" || e.code === "Escape") { e.preventDefault(); onClose(); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const g = c.getContext("2d")!;
    const S = c.width;
    const P = (x: number, z: number) => worldToMap(t, x, z, S);
    g.clearRect(0, 0, S, S);
    g.drawImage(base, 0, 0, S, S);
    const def = hunt.world.def;
    if (showZones) {
      const zones = def.zones.filter(z => z.kind !== "bed" && z.species?.some(s => hunt.cfg.licensed.includes(s)));
      for (const z of zones) { const [x, y] = P(z.x, z.z); g.beginPath(); g.arc(x, y, Math.max(16, z.r / (t.half * 2) * S * 1.2), 0, Math.PI * 2); g.setLineDash([8, 6]); g.strokeStyle = "rgba(202,255,71,0.6)"; g.lineWidth = 2; g.stroke(); g.setLineDash([]); }
    }
    drawScentCone(g, hunt, P);
    // trailhead
    const [sx, sy] = P(def.spawn.x, def.spawn.z);
    g.beginPath(); g.arc(sx, sy, 9, 0, Math.PI * 2); g.fillStyle = "#e9fffb"; g.fill(); g.strokeStyle = "#04121a"; g.lineWidth = 3; g.stroke();
    // game
    for (const a of hunt.animals.animals) {
      const [x, y] = P(a.x, a.z);
      if (!a.alive && a.harvested && !a.tagged) { g.fillStyle = "#caff47"; g.fillRect(x - 3, y - 10, 6, 20); g.fillRect(x - 10, y - 3, 20, 6); }
      else if (!a.alive && a.tagged) { g.fillStyle = "rgba(200,220,220,0.7)"; g.fillRect(x - 2, y - 7, 4, 14); g.fillRect(x - 7, y - 2, 14, 4); }
      else if (a.alive && a.spotted) { g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillStyle = a.wound !== "none" ? "#ff5a5a" : "#ff9c38"; g.fillRect(-6, -6, 12, 12); g.restore(); }
    }
    // waypoint
    if (hunt.waypoint) { const [x, y] = P(hunt.waypoint.x, hunt.waypoint.z); g.beginPath(); g.moveTo(x, y); g.lineTo(x - 10, y - 22); g.lineTo(x + 10, y - 22); g.closePath(); g.fillStyle = "#53f3dc"; g.fill(); g.strokeStyle = "#04121a"; g.lineWidth = 2; g.stroke(); }
    // hunter
    const [hx, hy] = P(hunt.player.pos.x, hunt.player.pos.z);
    g.beginPath(); g.arc(hx, hy, 26, 0, Math.PI * 2); g.strokeStyle = "rgba(83,243,220,0.35)"; g.lineWidth = 2; g.stroke();
    drawHunter(g, hx, hy, hunt.player.yaw, 14);
  }, [base, hunt, t, tick, showZones]);
  useEffect(() => { const iv = window.setInterval(() => setTick(v => v + 1), 500); return () => window.clearInterval(iv); }, []);
  const click = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = ref.current!; const r = c.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width * c.width, py = (e.clientY - r.top) / r.height * c.height;
    const [x, z] = mapToWorld(t, px, py, c.width);
    hunt.waypoint = { x, z };
    setTick(v => v + 1);
  };
  const ctx = (e: React.MouseEvent) => { e.preventDefault(); hunt.waypoint = null; setTick(v => v + 1); };
  const p = hunt.player.pos;
  const d = hunt.waypoint ? Math.hypot(hunt.waypoint.x - p.x, hunt.waypoint.z - p.z) : null;
  const [wx, wz] = hunt.world.env.windVector();
  return (
    <div className="map-overlay">
      <div className="map-panel">
        <div className="map-head">
          <div><small>{hunt.world.def.drawing} · FIELD MAP</small><b>{hunt.world.def.name}</b></div>
          <div className="map-info">
            <span>{hunt.world.env.clockString()}</span>
            <span>WIND {fmtSpeed(Math.hypot(wx, wz), units)}</span>
            {d !== null && <span>WAYPOINT {fmtDist(d, units)}</span>}
            <button className={`ghost small ${showZones ? "on" : ""}`} onClick={() => setShowZones(v => !v)}>REPORTED AREAS</button>
            <button className="ghost small" onClick={onClose}>CLOSE · M</button>
          </div>
        </div>
        <canvas ref={ref} width={1100} height={1100} className="map-big" onClick={click} onContextMenu={ctx} />
        <div className="map-legend">
          <span className="lg-me">▲ You</span><span className="lg-scent">◣ Scent cone</span><span className="lg-spot">◆ Spotted game</span><span className="lg-harv">✚ Harvest to tag</span><span className="lg-wp">▼ Waypoint (click · right-click clears)</span><span className="lg-zone">◌ Reported areas</span>
        </div>
      </div>
    </div>
  );
}
