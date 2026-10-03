"use client";
// Shared UI pieces: live blueprint drawings, studio viewport, top bar,
// medals, stars, meters and condition icons.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useApp } from "./ctx.ts";
import type { Snap, SnapStyle } from "../render/snapshots.ts";
import type { ViewName } from "../render/views.ts";
import { RATING_COLOR } from "./format.ts";

export function Drawing(p: { id: string; view?: ViewName; w: number; h: number; style?: SnapStyle; sex?: "male" | "female"; age?: number; seed?: number; pose?: string; margin?: number; className?: string; overlay?: (s: Snap) => ReactNode; alt?: string }) {
  const { snap } = useApp();
  const { id, view = "left", w, h, style = "ink", sex, age, seed, pose, margin } = p;
  const key = `${id}|${view}|${w}|${h}|${style}|${sex}|${age}|${seed}|${pose}|${margin}`;
  const [res, setRes] = useState<{ key: string; snap: Snap } | null>(null);
  useEffect(() => {
    let live = true;
    snap.get(id, { view, w, h, style, sex, age, seed, pose, margin }).then(r => { if (live) setRes({ key, snap: r }); }).catch(e => console.warn("drawing", id, e));
    return () => { live = false; };
  }, [snap, key, id, view, w, h, style, sex, age, seed, pose, margin]);
  const s = res && res.key === key ? res.snap : null;
  return (
    <div className={`drawing ${p.className ?? ""} ${s ? "ready" : ""}`} style={{ aspectRatio: `${w} / ${h}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- runtime-generated blueprint snapshot (data URL), not an optimisable asset */}
      {s ? <img src={s.url} alt={p.alt ?? ""} draggable={false} /> : <div className="drawing-wait" />}
      {s && p.overlay && <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">{p.overlay(s)}</svg>}
    </div>
  );
}

/** Transparent box that frames the Studio subject and turns drags / wheel / pinch into orbit + zoom. */
export function StudioViewport({ className, children }: { className?: string; children?: ReactNode }) {
  const { host, studio } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const st = studio();
    const el = ref.current!;
    const measure = () => {
      const r = el.getBoundingClientRect(), c = host.canvas.getBoundingClientRect();
      st.setRect(r.left - c.left, r.top - c.top, r.width, r.height, c.width || 1, c.height || 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el); ro.observe(host.canvas);
    window.addEventListener("resize", measure);
    const pts = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    const down = (e: PointerEvent) => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); el.setPointerCapture(e.pointerId); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } };
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId); if (!p) return;
      if (pts.size === 2) {
        p.x = e.clientX; p.y = e.clientY;
        const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) st.dolly(d / pinch); pinch = d;
        return;
      }
      st.orbit(e.clientX - p.x, e.clientY - p.y);
      p.x = e.clientX; p.y = e.clientY;
    };
    const up = (e: PointerEvent) => { pts.delete(e.pointerId); pinch = 0; };
    const wheel = (e: WheelEvent) => { e.preventDefault(); st.dolly(e.deltaY > 0 ? 0.9 : 1.11); };
    el.addEventListener("pointerdown", down); el.addEventListener("pointermove", move); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    const iv = window.setInterval(measure, 500);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); window.clearInterval(iv); el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); el.removeEventListener("wheel", wheel); };
  }, [host, studio]);
  return <div ref={ref} className={`viewport ${className ?? ""}`}>{children}</div>;
}

export function TopBar({ title, sub, onBack, children }: { title: string; sub?: string; onBack?: () => void; children?: ReactNode }) {
  const { save, go, playUi } = useApp();
  const stars = Object.values(save.stars).reduce((a, b) => a + b, 0);
  return (
    <header className="topbar">
      <button className="back" onClick={() => { playUi("back"); (onBack ?? (() => go("lodge")))(); }} aria-label="Back"><span>‹</span> LODGE</button>
      <div className="tb-title"><small>{sub}</small><b>{title}</b></div>
      <div className="tb-right">{children}<span className="tb-stars">★ {stars}</span><span className="tb-credits">◆ {save.credits}</span></div>
    </header>
  );
}

export function Stars({ n, max = 3 }: { n: number; max?: number }) {
  return <span className="stars-row">{Array.from({ length: max }, (_, i) => <i key={i} className={i < n ? "on" : ""}>★</i>)}</span>;
}

export function Medal({ rating, size = 34 }: { rating: string; size?: number }) {
  const c = RATING_COLOR[rating] ?? RATING_COLOR.none;
  if (rating === "none") return <svg width={size} height={size} viewBox="0 0 40 40" className="medal"><circle cx="20" cy="22" r="11" fill="none" stroke={c} strokeWidth="1.5" strokeDasharray="3 3" /></svg>;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className="medal">
      <path d="M12 2 L20 14 L28 2 Z" fill={c} opacity="0.55" />
      <circle cx="20" cy="23" r="12" fill={c} />
      <circle cx="20" cy="23" r="8.5" fill="none" stroke="#07131f" strokeOpacity="0.45" strokeWidth="1.4" />
      {rating === "diamond" ? <path d="M20 16 L25 22 L20 30 L15 22 Z" fill="#07131f" fillOpacity="0.55" /> : <path d="M20 17 l2 4.2 4.6.6-3.3 3.2.8 4.6-4.1-2.2-4.1 2.2.8-4.6-3.3-3.2 4.6-.6z" fill="#07131f" fillOpacity="0.5" />}
    </svg>
  );
}

export function Meter({ value, label, tone = "cyan", right }: { value: number; label: string; tone?: "cyan" | "lime" | "orange" | "red"; right?: string }) {
  return (
    <div className={`meter tone-${tone}`}>
      <div className="meter-head"><small>{label}</small>{right && <b>{right}</b>}</div>
      <div className="meter-bar"><span style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} /></div>
    </div>
  );
}

export function CondIcon({ k, size = 18 }: { k: string; size?: number }) {
  const s = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className: "cond-icon" };
  switch (k) {
    case "Dawn": case "Snowrise": return <svg {...s}><path d="M3 17h18M6 17a6 6 0 0 1 12 0M12 5v3M5 9l2 2M19 9l-2 2" /></svg>;
    case "Morning": case "Afternoon": case "Clear": return <svg {...s}><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></svg>;
    case "Sunset": case "Dusk": return <svg {...s}><path d="M3 18h18M7 18a5 5 0 0 1 10 0M12 13v-2M12 3v4M9 6l3 3 3-3" /></svg>;
    case "Night": return <svg {...s}><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></svg>;
    case "Mist": return <svg {...s}><path d="M4 9h12M6 13h14M3 17h11" /></svg>;
    case "Wind": return <svg {...s}><path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h7" /></svg>;
    case "Rain": return <svg {...s}><path d="M7 14a4 4 0 1 1 1-7.9A5 5 0 0 1 18 8a3.5 3.5 0 0 1 0 7H7zM8 18l-1 2M12 18l-1 2M16 18l-1 2" /></svg>;
    case "Storm": return <svg {...s}><path d="M7 13a4 4 0 1 1 1-7.9A5 5 0 0 1 18 7a3.5 3.5 0 0 1 0 7M12 12l-2 4h4l-2 5" /></svg>;
    case "Snow": return <svg {...s}><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M10 4.5l2 1.5 2-1.5M10 19.5l2-1.5 2 1.5" /></svg>;
    case "Dynamic": return <svg {...s}><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4" /></svg>;
    default: return <svg {...s}><circle cx="12" cy="12" r="3" /></svg>;
  }
}

export function Section({ title, right, children, className }: { title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`panel ${className ?? ""}`}><div className="section-title"><span>{title}</span>{right && <small>{right}</small>}</div>{children}</section>;
}

/** Canvas that redraws itself with a drawing callback whenever `deps` change. */
export function CanvasView({ width, height, draw, className, deps, onPointer }: { width: number; height: number; draw: (g: CanvasRenderingContext2D, w: number, h: number) => void; className?: string; deps: unknown[]; onPointer?: (x: number, y: number, e: React.PointerEvent) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const g = c.getContext("2d"); if (!g) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    draw(g, c.width, c.height);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return <canvas ref={ref} width={width} height={height} className={className} onPointerDown={onPointer ? (e) => { const r = (e.target as HTMLCanvasElement).getBoundingClientRect(); onPointer((e.clientX - r.left) / r.width * width, (e.clientY - r.top) / r.height * height, e); } : undefined} />;
}
