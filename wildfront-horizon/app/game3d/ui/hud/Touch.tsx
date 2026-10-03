"use client";
// Touch controls: floating move stick (push to the rim to sprint), drag-to-look
// on the right, and action buttons (v2 SCAN / ZOOM / STEADY / LOAD / FIRE
// plus aim, crouch, use, binoculars, call, map and pause).

import { useRef } from "react";
import type { Input } from "../../engine/input.ts";
import type { HudSnapshot } from "../../hunt/hunt.ts";

export default function TouchControls({ input, hud, onMap, onPause }: { input: Input; hud: HudSnapshot; onMap: () => void; onPause: () => void }) {
  const stick = useRef<{ id: number; x: number; y: number } | null>(null);
  const knob = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLDivElement>(null);
  const look = useRef<{ id: number; x: number; y: number } | null>(null);
  const R = 52;
  const stickDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    stick.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    if (base.current) { base.current.style.left = `${e.clientX - R}px`; base.current.style.top = `${e.clientY - R}px`; base.current.classList.add("on"); }
  };
  const stickMove = (e: React.PointerEvent) => {
    const s = stick.current; if (!s || s.id !== e.pointerId) return;
    let dx = e.clientX - s.x, dy = e.clientY - s.y;
    const l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; }
    input.setVirtualMove(dx / R, -dy / R);
    input.virtual("sprint", l > R * 1.25 && -dy > R * 0.6);
    if (knob.current) knob.current.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const stickUp = (e: React.PointerEvent) => {
    if (stick.current?.id !== e.pointerId) return;
    stick.current = null; input.setVirtualMove(0, 0); input.virtual("sprint", false);
    if (knob.current) knob.current.style.transform = "";
    base.current?.classList.remove("on");
  };
  const lookDown = (e: React.PointerEvent) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); look.current = { id: e.pointerId, x: e.clientX, y: e.clientY }; };
  const lookMove = (e: React.PointerEvent) => { const l = look.current; if (!l || l.id !== e.pointerId) return; input.addVirtualLook((e.clientX - l.x) * 1.2, (e.clientY - l.y) * 1.2); l.x = e.clientX; l.y = e.clientY; };
  const lookUp = (e: React.PointerEvent) => { if (look.current?.id === e.pointerId) look.current = null; };
  const tap = (a: Parameters<Input["tap"]>[0]) => (e: React.PointerEvent) => { e.stopPropagation(); input.tap(a); };
  const hold = (a: Parameters<Input["virtual"]>[0], down: boolean) => (e: React.PointerEvent) => { e.stopPropagation(); input.virtual(a, down); };
  return (
    <div className="mobile-controls">
      <div className="stick-zone" onPointerDown={stickDown} onPointerMove={stickMove} onPointerUp={stickUp} onPointerCancel={stickUp}>
        <div ref={base} className="stick-base"><div ref={knob} className="stick-knob" /></div>
        <span className="stick-hint">MOVE</span>
      </div>
      <div className="look-zone" onPointerDown={lookDown} onPointerMove={lookMove} onPointerUp={lookUp} onPointerCancel={lookUp} />
      <div className="actions">
        <button className="fire" onPointerDown={tap("fire")}>FIRE</button>
        <button className={`zoom ${hud.scoped ? "on" : ""}`} onPointerDown={tap("zoom")}>ZOOM<small>{hud.zoom}</small></button>
        <button className={`steady ${hud.steadyActive ? "on" : ""}`} onPointerDown={hold("steady", true)} onPointerUp={hold("steady", false)} onPointerCancel={hold("steady", false)} onPointerLeave={hold("steady", false)}>STEADY</button>
        <button className={`scan ${hud.scanActive ? "on" : ""}`} onPointerDown={tap("scan")}>SCAN<small>{hud.scan}%</small></button>
        <button className="load" onPointerDown={tap("reload")}>LOAD</button>
        <button className={`crouch ${hud.stance !== "stand" ? "on" : ""}`} onPointerDown={tap("crouch")}>{hud.stance === "crouch" ? "STAND" : "CROUCH"}</button>
        <button className="prone" onPointerDown={tap("prone")}>PRONE</button>
        <button className={`use ${hud.prompt ? "hot" : ""}`} onPointerDown={tap("interact")}>USE</button>
        <button className={`bino ${hud.binoculars ? "on" : ""}`} onPointerDown={tap("binoculars")}>BINO</button>
        {hud.hasCaller && <button className="call" onPointerDown={tap("call")}>CALL</button>}
      </div>
      <div className="top-actions">
        <button onPointerDown={e => { e.stopPropagation(); onMap(); }}>MAP</button>
        <button onPointerDown={e => { e.stopPropagation(); onPause(); }}>❚❚</button>
      </div>
    </div>
  );
}
