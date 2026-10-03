"use client";
// Settings: graphics, controls, audio, HUD and realism. Also embedded in the
// pause menu (inHunt) with the options that apply live.

import { useState } from "react";
import { useApp } from "../ctx.ts";
import { DEFAULT_SETTINGS, FRESH_V2, freshV3, type Settings } from "../../data/save.ts";
import { autoQuality, type QualityName } from "../../render/quality.ts";
import { TopBar } from "../components.tsx";
import { VERSION } from "../../version.ts";

export default function SettingsScreen({ inHunt }: { inHunt: boolean }) {
  const { save, update, host, playUi, toast } = useApp();
  const s = save.v3.settings;
  const [confirmReset, setConfirmReset] = useState(false);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    update(x => ({ ...x, v3: { ...x.v3, settings: { ...x.v3.settings, [k]: v } } }));
    if (k === "quality" && !inHunt) {
      const q: QualityName = v === "auto" ? autoQuality() : (v as QualityName);
      host.setQuality(q);
      toast(`GRAPHICS: ${String(v).toUpperCase()}${v === "auto" ? ` (${q.toUpperCase()})` : ""} — APPLIES TO THE NEXT RESERVE YOU LOAD`, "info");
    }
  };
  const vol = (k: keyof Settings["volume"], v: number) => update(x => ({ ...x, v3: { ...x.v3, settings: { ...x.v3.settings, volume: { ...x.v3.settings.volume, [k]: v } } } }));
  const body = (
    <div className="settings-body">
      {!inHunt && (
        <section className="panel">
          <div className="section-title"><span>GRAPHICS</span><small>ADAPTIVE RESOLUTION KEEPS 45–60 FPS</small></div>
          <Row label="Quality" hint={`Auto picks ${autoQuality().toUpperCase()} on this device`}>
            <Seg value={s.quality} options={["auto", "low", "medium", "high", "ultra"]} onChange={v => { playUi("select"); set("quality", v as Settings["quality"]); }} />
          </Row>
        </section>
      )}
      <section className="panel">
        <div className="section-title"><span>VIEW & CONTROLS</span></div>
        <Row label="Field of view" hint={`${s.fov}° vertical`}><input type="range" min={55} max={85} step={1} value={s.fov} onChange={e => set("fov", Number(e.target.value))} /></Row>
        <Row label="Look sensitivity" hint={`× ${s.sensitivity.toFixed(2)}`}><input type="range" min={0.3} max={2.5} step={0.05} value={s.sensitivity} onChange={e => set("sensitivity", Number(e.target.value))} /></Row>
        <Row label="Scoped sensitivity" hint={`× ${s.scopedSensitivity.toFixed(2)}`}><input type="range" min={0.2} max={1.5} step={0.05} value={s.scopedSensitivity} onChange={e => set("scopedSensitivity", Number(e.target.value))} /></Row>
        <Row label="Invert look" hint="Vertical mouse / stick"><Seg value={s.invertY ? "on" : "off"} options={["off", "on"]} onChange={v => set("invertY", v === "on")} /></Row>
        <Row label="Aim" hint="Right mouse button"><Seg value={s.aimHold ? "hold" : "toggle"} options={["hold", "toggle"]} onChange={v => set("aimHold", v === "hold")} /></Row>
      </section>
      <section className="panel">
        <div className="section-title"><span>HUNTING</span></div>
        <Row label="Assist" hint={s.assist === "relaxed" ? "Calmer game, steadier aim" : s.assist === "realistic" ? "Warier game, more sway" : "The intended balance"}><Seg value={s.assist} options={["relaxed", "standard", "realistic"]} onChange={v => set("assist", v as Settings["assist"])} /></Row>
        <Row label="Hit sign" hint={s.hitSign === "stylized" ? "Amber tracking marks" : "Natural blood drops"}><Seg value={s.hitSign} options={["stylized", "realistic"]} onChange={v => set("hitSign", v as Settings["hitSign"])} /></Row>
        <Row label="Shot analysis card" hint="Blueprint x-ray after each hit"><Seg value={s.shotCard ? "on" : "off"} options={["on", "off"]} onChange={v => set("shotCard", v === "on")} /></Row>
        <Row label="Units" hint="Distances, wind, drop and weight"><Seg value={s.units} options={["metric", "imperial"]} onChange={v => set("units", v as Settings["units"])} /></Row>
        <Row label="HUD" hint="Minimal hides the minimap and meters"><Seg value={s.hud} options={["full", "minimal"]} onChange={v => set("hud", v as Settings["hud"])} /></Row>
      </section>
      <section className="panel">
        <div className="section-title"><span>AUDIO</span><small>PROCEDURAL 3D SOUND</small></div>
        {(["master", "effects", "ambience", "ui"] as const).map(k => (
          <Row key={k} label={k[0].toUpperCase() + k.slice(1)} hint={`${Math.round(s.volume[k] * 100)}%`}><input type="range" min={0} max={1} step={0.05} value={s.volume[k]} onChange={e => vol(k, Number(e.target.value))} /></Row>
        ))}
      </section>
      {!inHunt && (
        <section className="panel">
          <div className="section-title"><span>PROGRESS</span><small>SAVED IN THIS BROWSER · SHARED WITH CLASSIC 2.0</small></div>
          <Row label="Defaults" hint="Restore every setting"><button className="ghost small" onClick={() => { update(x => ({ ...x, v3: { ...x.v3, settings: { ...DEFAULT_SETTINGS, volume: { ...DEFAULT_SETTINGS.volume } } } })); toast("SETTINGS RESTORED", "info"); }}>RESET SETTINGS</button></Row>
          <Row label="Reset progress" hint="Contracts, credits, trophies — cannot be undone">
            {confirmReset
              ? <span className="confirm"><button className="danger small" onClick={() => { update(() => ({ ...FRESH_V2, stars: {}, upgrades: { optics: 0, stability: 0, tracking: 0 }, v3: { ...freshV3(), seenIntro: true } })); setConfirmReset(false); toast("PROGRESS RESET", "warn"); }}>YES, ERASE</button><button className="ghost small" onClick={() => setConfirmReset(false)}>CANCEL</button></span>
              : <button className="ghost small" onClick={() => setConfirmReset(true)}>RESET…</button>}
          </Row>
          <p className="kit-note">Wildfront Horizon 3D {VERSION} · Flexzonic Games · <a href="/classic">Play Classic 2.0</a></p>
        </section>
      )}
    </div>
  );
  if (inHunt) return body;
  return (
    <div className="screen settings">
      <TopBar title="Settings" sub="GRAPHICS · CONTROLS · AUDIO" />
      {body}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <div className="set-row"><div><b>{label}</b>{hint && <small>{hint}</small>}</div><div className="set-ctl">{children}</div></div>;
}
function Seg({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return <div className="seg">{options.map(o => <button key={o} className={value === o ? "on" : ""} onClick={() => onChange(o)}>{o.toUpperCase()}</button>)}</div>;
}
