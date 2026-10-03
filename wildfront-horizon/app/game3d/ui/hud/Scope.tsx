"use client";
// Riflescope and binocular overlays. The scope is a second-focal-plane
// duplex reticle with BDC holdover marks computed from the equipped rifle's
// real trajectory and 1-mil windage dots, scaled to the current zoom.

import { useEffect, useState } from "react";
import type { HudSnapshot } from "../../hunt/hunt.ts";
import { fmtDist, fmtSpeed, type Units } from "../format.ts";

function useViewport(): [number, number] {
  const [s, setS] = useState<[number, number]>(() => [typeof window !== "undefined" ? window.innerWidth : 1280, typeof window !== "undefined" ? window.innerHeight : 720]);
  useEffect(() => { const f = () => setS([window.innerWidth, window.innerHeight]); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  return s;
}

export function ScopeOverlay({ hud, bdc, units }: { hud: HudSnapshot; bdc: { range: number; mil: number }[]; units: Units }) {
  const [W, H] = useViewport();
  const cx = W / 2, cy = H / 2;
  const R = Math.min(W, H) * 0.47;
  const pxPerMil = (H / 2) / Math.tan((hud.fov * Math.PI / 180) / 2) / 1000;
  const inner = R * 0.3;          // thin-wire zone radius
  const ink = hud.steadyActive ? "#caff47" : "#101410";
  const glow = hud.steadyActive ? "rgba(202,255,71,0.35)" : "rgba(255,255,255,0.18)";
  const breath = hud.steady;
  return (
    <div className={`scope-system active ${hud.steadyActive ? "steady" : ""}`}>
      <svg className="scope-svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <mask id="scope-hole"><rect width={W} height={H} fill="white" /><circle cx={cx} cy={cy} r={R} fill="black" /></mask>
          <radialGradient id="scope-edge" cx="50%" cy="50%" r="50%"><stop offset="78%" stopColor="#000" stopOpacity="0" /><stop offset="94%" stopColor="#000" stopOpacity="0.45" /><stop offset="100%" stopColor="#000" stopOpacity="0.95" /></radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={R + 1} fill="url(#scope-edge)" />
        <rect width={W} height={H} fill="#020403" mask="url(#scope-hole)" />
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="#0b0f0c" strokeWidth="6" />
        <g stroke={glow} strokeWidth="4" strokeLinecap="butt" opacity="0.5">
          <line x1={cx - R} y1={cy} x2={cx - inner} y2={cy} /><line x1={cx + inner} y1={cy} x2={cx + R} y2={cy} /><line x1={cx} y1={cy - R} x2={cx} y2={cy - inner} />
        </g>
        {/* duplex posts */}
        <g stroke={ink} strokeLinecap="butt">
          <line x1={cx - R} y1={cy} x2={cx - inner} y2={cy} strokeWidth="5" />
          <line x1={cx + inner} y1={cy} x2={cx + R} y2={cy} strokeWidth="5" />
          <line x1={cx} y1={cy - R} x2={cx} y2={cy - inner} strokeWidth="5" />
          <line x1={cx} y1={cy + R} x2={cx} y2={cy + inner} strokeWidth="5" />
          <line x1={cx - inner} y1={cy} x2={cx + inner} y2={cy} strokeWidth="1.2" />
          <line x1={cx} y1={cy - inner} x2={cx} y2={cy + inner} strokeWidth="1.2" />
        </g>
        {/* windage dots, 1 mil apart */}
        <g fill={ink}>
          {[-5, -4, -3, -2, -1, 1, 2, 3, 4, 5].map(m => { const x = cx + m * pxPerMil; return Math.abs(m * pxPerMil) < inner - 4 ? <circle key={m} cx={x} cy={cy} r={m % 5 === 0 ? 2.2 : 1.5} /> : null; })}
        </g>
        {/* BDC holdover marks */}
        <g stroke={ink} fill={ink} fontFamily="'Barlow Condensed', sans-serif" fontWeight={700} fontSize="11">
          {bdc.map(b => {
            const y = cy + b.mil * pxPerMil;
            if (y - cy < 3 || y - cy > inner - 2) return null;
            const half = 5 + b.range / 100;
            return <g key={b.range}><line x1={cx - half} x2={cx + half} y1={y} y2={y} strokeWidth="1.2" /><text x={cx + half + 4} y={y + 4} stroke="none">{units === "imperial" ? Math.round(b.range * 1.09361 / 100) : b.range / 100}</text></g>;
          })}
        </g>
        <circle cx={cx} cy={cy} r="1.4" fill={hud.steadyActive ? "#caff47" : "#e8320c"} />
      </svg>
      <div className="scope-glass" />
      <div className="scope-readout left" style={{ left: Math.max(12, cx - R - 150) }}>
        <small>WIND</small><b>{fmtSpeed(hud.windSpeed, units)}</b>
        <span className="wind-arrow" style={{ transform: `rotate(${hud.windRel}rad)` }}>↑</span>
        <small>ZOOM</small><b>{hud.zoom}</b>
      </div>
      <div className="scope-readout right" style={{ right: Math.max(12, W - cx - R - 150) }}>
        <small>RANGE</small><b>{fmtDist(hud.rangeM, units)}</b>
        <small>STATE</small><b>{hud.state}</b>
        <small>TARGET</small><b className="tgt">{hud.species}</b>
      </div>
      <div className="scope-target"><b>{hud.species}</b><small>{fmtDist(hud.rangeM, units)} · {hud.state}</small></div>
      <div className="breath"><span style={{ width: `${breath}%` }} /><small>{hud.steadyActive ? "BREATH HELD" : "STEADY BREATH"} · {breath}%</small></div>
    </div>
  );
}

export function BinocularOverlay({ hud, units }: { hud: HudSnapshot; units: Units }) {
  const [W, H] = useViewport();
  const r = Math.min(W * 0.27, H * 0.46);
  const cy = H / 2, c1 = W / 2 - r * 0.62, c2 = W / 2 + r * 0.62;
  return (
    <div className="bino-system">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <defs><mask id="bino-hole"><rect width={W} height={H} fill="white" /><circle cx={c1} cy={cy} r={r} fill="black" /><circle cx={c2} cy={cy} r={r} fill="black" /></mask></defs>
        <rect width={W} height={H} fill="#030506" mask="url(#bino-hole)" />
        <g fill="none" stroke="rgba(255,90,60,0.85)" strokeWidth="1.3">
          <rect x={W / 2 - 34} y={cy - 22} width="68" height="44" />
          <line x1={W / 2 - 6} x2={W / 2 + 6} y1={cy} y2={cy} /><line x1={W / 2} x2={W / 2} y1={cy - 6} y2={cy + 6} />
        </g>
      </svg>
      <div className="bino-readout">
        <b>{fmtDist(hud.rangeM, units)}</b>
        <small>{hud.binoInfo || "SCANNING"}</small>
      </div>
      <div className="bino-tag">10×42 LRF · {hud.clock}</div>
    </div>
  );
}
