"use client";
// Reserve map and loadout picker shared by the briefing and Free Hunt.

import { useEffect, useState } from "react";
import { terrainFor, useApp, type Loadout } from "./ctx.ts";
import { renderTopo, worldToMap } from "../render/topo.ts";
import { reserveByName } from "../blueprints/reserves.ts";
import { RIFLES, RIFLES_BY_ID } from "../blueprints/gear.ts";
import { STORE_BY_ID, UPGRADE_INFO } from "../data/store.ts";
import type { UpgradeKey } from "../data/save.ts";
import { CanvasView, Drawing } from "./components.tsx";
import { fmtVel } from "./format.ts";

export function ReserveMap({ reserve, species, size = 620 }: { reserve: string; species: string[]; size?: number }) {
  const [map, setMap] = useState<{ reserve: string; canvas: HTMLCanvasElement } | null>(null);
  const def = reserveByName(reserve);
  useEffect(() => {
    let live = true;
    const id = window.setTimeout(() => {
      const t = terrainFor(reserve);
      const c = renderTopo(t, { size: 900, style: "field", grid: true });
      if (live) setMap({ reserve, canvas: c });
    }, 30);
    return () => { live = false; window.clearTimeout(id); };
  }, [reserve]);
  const base = map && map.reserve === reserve ? map.canvas : null;
  return (
    <div className="reserve-map">
      {!base && <div className="map-wait"><span>SURVEYING {def.name.toUpperCase()}…</span></div>}
      {base && (
        <CanvasView width={size * 2} height={size * 2} className="map-canvas" deps={[base, species.join(",")]} draw={(g, W, H) => {
          g.drawImage(base, 0, 0, W, H);
          const t = terrainFor(reserve);
          // reported areas for the licensed species
          const zones = def.zones.filter(z => z.kind !== "bed" && (z.species ? z.species.some(s => species.includes(s)) : false));
          const show = zones.length ? zones : def.zones.filter(z => z.kind === "feed").slice(0, 3);
          g.save();
          for (const z of show) {
            const [x, y] = worldToMap(t, z.x, z.z, W);
            const r = Math.max(26, z.r / (t.half * 2) * W * 1.2);
            g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
            g.fillStyle = "rgba(202,255,71,0.10)"; g.fill();
            g.setLineDash([10, 8]); g.strokeStyle = "rgba(202,255,71,0.8)"; g.lineWidth = 3; g.stroke(); g.setLineDash([]);
          }
          g.restore();
          // trailhead
          const [sx, sy] = worldToMap(t, def.spawn.x, def.spawn.z, W);
          g.beginPath(); g.arc(sx, sy, 16, 0, Math.PI * 2); g.fillStyle = "#53f3dc"; g.fill();
          g.lineWidth = 4; g.strokeStyle = "#07131f"; g.stroke();
          g.font = "800 30px 'Barlow Condensed', sans-serif"; g.fillStyle = "#e9fffb"; g.strokeStyle = "rgba(4,14,22,0.85)"; g.lineWidth = 6;
          // label on whichever side of the marker has room, so it never runs off the sheet
          const tw = g.measureText("TRAILHEAD").width;
          const lx = sx + 24 + tw > W - 12 ? sx - 24 - tw : sx + 24;
          g.strokeText("TRAILHEAD", lx, sy + 10); g.fillText("TRAILHEAD", lx, sy + 10);
          // north arrow (top right, or top left when the trailhead sits under it)
          const nx = sx > W - 260 && sy < 220 ? 70 : W - 70;
          g.save(); g.translate(nx, 80);
          g.beginPath(); g.moveTo(0, -40); g.lineTo(16, 18); g.lineTo(0, 8); g.lineTo(-16, 18); g.closePath();
          g.fillStyle = "#e9fffb"; g.fill();
          g.font = "800 30px 'Barlow Condensed', sans-serif"; g.textAlign = "center"; g.fillText("N", 0, 52);
          g.restore();
          // scale bar (100 m)
          const px100 = 100 / (t.half * 2) * W;
          g.fillStyle = "rgba(4,14,22,0.7)"; g.fillRect(30, H - 70, px100 * 2 + 40, 46);
          g.fillStyle = "#e9fffb"; g.fillRect(50, H - 44, px100, 8); g.strokeStyle = "#e9fffb"; g.lineWidth = 2; g.strokeRect(50 + px100, H - 44, px100, 8);
          g.font = "700 22px 'Barlow Condensed', sans-serif"; g.textAlign = "left"; g.fillText("0", 44, H - 52); g.fillText("100", 40 + px100, H - 52); g.fillText("200 m", 30 + px100 * 2, H - 52);
        }} />
      )}
      <div className="map-legend"><span className="lg-th">● Trailhead</span><span className="lg-zone">◌ Reported areas</span><span className="lg-trail">┅ Trails</span><span className="lg-bound">┅ Boundary</span></div>
    </div>
  );
}

export function LoadoutPicker({ value, onChange }: { value: Loadout; onChange: (l: Loadout) => void }) {
  const { save, units, playUi } = useApp();
  const owned = new Set(save.v3.owned);
  const rifles = RIFLES.filter(r => owned.has(r.id));
  const camos = ["camo-forest", "camo-ghillie"].filter(c => owned.has(c));
  return (
    <div className="loadout">
      <div className="lo-label">RIFLE</div>
      <div className="lo-rifles">
        {rifles.map(r => (
          <button key={r.id} className={`lo-rifle ${value.rifleId === r.id ? "on" : ""}`} onClick={() => { playUi("select"); onChange({ ...value, rifleId: r.id }); }}>
            <Drawing id={r.id} w={300} h={84} view="left" style="ink" margin={0.04} />
            <b>{r.title}</b>
            <small>{r.ballistics.caliber} · {r.scope.minMag}–{r.scope.maxMag}× · {fmtVel(r.ballistics.mv, units)}</small>
          </button>
        ))}
      </div>
      <div className="lo-row">
        <div className="lo-label">CAMO</div>
        <div className="seg">
          {camos.map(c => <button key={c} className={value.camo === c ? "on" : ""} onClick={() => { playUi("select"); onChange({ ...value, camo: c }); }}>{STORE_BY_ID[c].name}</button>)}
        </div>
      </div>
      <div className="lo-row">
        <div className="lo-label">KIT</div>
        <div className="seg">
          <button className={value.caller && owned.has("caller") ? "on" : ""} disabled={!owned.has("caller")} onClick={() => onChange({ ...value, caller: !value.caller })}>{owned.has("caller") ? "Game Caller (T)" : "Caller — not owned"}</button>
          <button className={value.scent && owned.has("scent") ? "on" : ""} disabled={!owned.has("scent")} onClick={() => onChange({ ...value, scent: !value.scent })}>{owned.has("scent") ? "Scent Blocker" : "Scent — not owned"}</button>
        </div>
      </div>
      <div className="lo-kit">
        {(Object.keys(UPGRADE_INFO) as UpgradeKey[]).map(k => (
          <span key={k}><i>{UPGRADE_INFO[k].icon}</i>{UPGRADE_INFO[k].label}<em>{"●".repeat(save.upgrades[k])}{"○".repeat(3 - save.upgrades[k])}</em></span>
        ))}
      </div>
    </div>
  );
}

export function defaultLoadout(save: ReturnType<typeof useApp>["save"]): Loadout {
  const rifle = RIFLES_BY_ID[save.v3.rifle] && save.v3.owned.includes(save.v3.rifle) ? save.v3.rifle : "ridgeline-308";
  return { rifleId: rifle, camo: save.v3.owned.includes(save.v3.camo) ? save.v3.camo : "camo-forest", caller: save.v3.owned.includes("caller"), scent: save.v3.owned.includes("scent") };
}
