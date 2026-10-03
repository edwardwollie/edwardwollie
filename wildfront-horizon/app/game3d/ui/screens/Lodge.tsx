"use client";
// The lodge: main menu over the live reserve backdrop.

import { STUDIO_ENABLED, useApp, type Screen } from "../ctx.ts";
import { MISSIONS } from "../../data/missions.ts";
import { CondIcon } from "../components.tsx";

const ITEMS: { id: Screen; label: string; icon: string; sub: (n: { stars: number; trophies: number; unlocked: number }) => string }[] = [
  { id: "contracts", label: "Field Contracts", icon: "◎", sub: n => `12 contracts · ${n.unlocked} unlocked · ${n.stars} ★` },
  { id: "free", label: "Free Hunt", icon: "◇", sub: () => "Any unlocked reserve · your conditions" },
  { id: "locker", label: "Gear Locker", icon: "⌁", sub: () => "Rifles · optics · field kit" },
  { id: "trophies", label: "Trophy Lodge", icon: "✦", sub: n => `${n.trophies} trophies · achievements` },
  { id: "guide", label: "Field Guide", icon: "❖", sub: () => "Six species · tracks · vitals" },
  ...(STUDIO_ENABLED ? [{ id: "studio" as Screen, label: "Blueprint Studio", icon: "▦", sub: () => "Every model from every side" }] : []),
  { id: "settings", label: "Settings", icon: "⚙", sub: () => "Graphics · controls · audio" },
];

export default function Lodge({ backdropReady }: { backdropReady: boolean }) {
  const { save, go, brief, playUi, host } = useApp();
  const stars = Object.values(save.stars).reduce((a, b) => a + b, 0);
  const next = MISSIONS[Math.min(save.unlocked, MISSIONS.length) - 1];
  const allDone = MISSIONS.every(m => (save.stars[m.id] ?? 0) > 0);
  const n = { stars, trophies: save.v3.trophies.length, unlocked: save.unlocked };
  const bd = host.mode && "world" in host.mode ? (host.mode as unknown as { world: { def: { name: string }; env: { clockString(): string; weatherKey: string } } }).world : null;
  return (
    <div className="lodge">
      <div className="lodge-col">
        <div className="brand">
          <span className="brand-mark">W</span>
          <div><b>WILDFRONT</b><small>HORIZON 3D // FIELD SYSTEM 3.0</small></div>
        </div>
        <div className="eyebrow">LIVING RESERVES // BLUEPRINT-BUILT WILDLIFE</div>
        <h1 className="lodge-title">READ THE LAND.<br /><em>MOVE WITH IT.</em></h1>
        <p className="lodge-copy">Five 3D reserves, six species built from engineering blueprints, real ballistics and a full tracking game. Stalk into the wind, read fresh sign and make the first shot count.</p>
        <button className="primary big" onClick={() => { playUi("select"); brief(next.id); }}>
          <span className="pl-k">{allDone ? "REPLAY" : save.v3.stats.hunts ? "CONTINUE" : "BEGIN"}</span>
          <span className="pl-v">{String(next.id).padStart(2, "0")} · {next.name}</span>
          <span className="pl-arrow">→</span>
        </button>
        <nav className="lodge-menu">
          {ITEMS.map(it => (
            <button key={it.id} onClick={() => { playUi("select"); go(it.id); }}>
              <i>{it.icon}</i><span><b>{it.label}</b><small>{it.sub(n)}</small></span><em>›</em>
            </button>
          ))}
          <a className="classic-link" href="/classic"><i>↺</i><span><b>Classic 2.0</b><small>The original Wildfront Horizon</small></span><em>↗</em></a>
        </nav>
      </div>
      <div className="lodge-side">
        <div className="lodge-wallet">
          <div><small>CREDITS</small><b>◆ {save.credits}</b></div>
          <div><small>STARS</small><b>★ {stars}</b></div>
          <div><small>TROPHIES</small><b>✦ {save.v3.trophies.length}</b></div>
        </div>
      </div>
      <div className={`live-chip ${backdropReady && bd ? "on" : ""}`}>
        <span className="dot" />LIVE
        {bd && <><b>{bd.def.name.toUpperCase()}</b><span>{bd.env.clockString()}</span><CondIcon k={bd.env.weatherKey} size={14} /></>}
      </div>
    </div>
  );
}
