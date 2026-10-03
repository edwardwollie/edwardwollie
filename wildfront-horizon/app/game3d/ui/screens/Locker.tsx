"use client";
// Gear Locker: the v2.0.3 Field Kit upgrades (same names, effects, prices)
// plus rifles and kit, each shown as its blueprint drawing with real
// ballistic data.

import { useMemo, useState } from "react";
import { useApp } from "../ctx.ts";
import { RIFLES } from "../../blueprints/gear.ts";
import { STORE, UPGRADE_INFO } from "../../data/store.ts";
import { upgradeCost, type UpgradeKey } from "../../data/save.ts";
import { trajectoryTable } from "../../hunt/ballistics.ts";
import { Drawing, TopBar } from "../components.tsx";
import { fix1, fmtCm, fmtDist, fmtEnergy, fmtVel } from "../format.ts";

type Tab = "kit" | "rifles" | "gear";

export default function Locker() {
  const { save, update, units, playUi, toast } = useApp();
  const [tab, setTab] = useState<Tab>("kit");
  const owned = new Set(save.v3.owned);
  const buyUpgrade = (k: UpgradeKey) => {
    const lvl = save.upgrades[k], cost = upgradeCost(lvl);
    if (lvl >= 3 || save.credits < cost) { playUi("error"); return; }
    playUi("buy");
    update(s => ({ ...s, credits: s.credits - cost, upgrades: { ...s.upgrades, [k]: lvl + 1 } }));
    toast(`${UPGRADE_INFO[k].label.toUpperCase()} UPGRADED TO LEVEL ${lvl + 1}`, "good");
  };
  const buy = (id: string, price: number, name: string) => {
    if (owned.has(id)) return;
    if (save.credits < price) { playUi("error"); toast(`NOT ENOUGH CREDITS — ${name.toUpperCase()} COSTS ◆ ${price}`, "warn"); return; }
    playUi("buy");
    update(s => ({ ...s, credits: s.credits - price, v3: { ...s.v3, owned: [...s.v3.owned, id] } }));
    toast(`${name.toUpperCase()} ADDED TO YOUR LOCKER`, "good");
  };
  const equip = (id: string, kind: "rifle" | "camo") => { playUi("select"); update(s => ({ ...s, v3: { ...s.v3, [kind]: id } })); };
  return (
    <div className="screen locker">
      <TopBar title="Gear Locker" sub="FIELD KIT · RIFLES · GEAR">
        <div className="tabs">
          {(["kit", "rifles", "gear"] as Tab[]).map(t => <button key={t} className={tab === t ? "on" : ""} onClick={() => { playUi("select"); setTab(t); }}>{t === "kit" ? "FIELD KIT" : t.toUpperCase()}</button>)}
        </div>
      </TopBar>
      {tab === "kit" && (
        <div className="locker-body kit">
          <section className="panel upgrades">
            <div className="section-title"><span>FIELD KIT</span><small>LEVEL ≤ 3 · COST 120 × (LEVEL + 1)</small></div>
            {(Object.keys(UPGRADE_INFO) as UpgradeKey[]).map(k => {
              const u = UPGRADE_INFO[k], lvl = save.upgrades[k], cost = upgradeCost(lvl);
              return (
                <button key={k} onClick={() => buyUpgrade(k)} disabled={lvl >= 3 || save.credits < cost}>
                  <i>{u.icon}</i><span><b>{u.label}</b><small>{u.detail}</small></span>
                  <strong>{lvl >= 3 ? "MAX" : `◆ ${cost}`}<em>{"●".repeat(lvl)}{"○".repeat(3 - lvl)}</em></strong>
                </button>
              );
            })}
            <p className="kit-note">Quantum Optics adds 1.5× maximum zoom per level and steadies the reticle. Kinetic Stock lengthens breath hold and speeds reloads (v2.0.3 rule: max(650, 1320 − 150 × level) ms). Trail Scanner pulses last longer and reach further.</p>
          </section>
        </div>
      )}
      {tab === "rifles" && (
        <div className="locker-body rifles">
          {RIFLES.map(r => <RifleCard key={r.id} id={r.id} owned={owned.has(r.id)} equipped={save.v3.rifle === r.id} onBuy={() => buy(r.id, r.price, r.title)} onEquip={() => equip(r.id, "rifle")} units={units} credits={save.credits} />)}
        </div>
      )}
      {tab === "gear" && (
        <div className="locker-body gear">
          {STORE.filter(s => s.kind !== "rifle").map(it => {
            const has = owned.has(it.id);
            return (
              <section key={it.id} className={`panel gear-card ${has ? "owned" : ""}`}>
                <div className="gear-art">
                  {it.blueprint ? <Drawing id={it.blueprint} w={420} h={200} view="iso" style="ink" /> : <GearGlyph kind={it.kind} />}
                </div>
                <div className="gear-info">
                  <b>{it.name}</b>
                  <small>{it.detail}</small>
                  <div className="gear-actions">
                    {has ? (it.kind === "camo" ? <button className={`ghost ${save.v3.camo === it.id ? "on" : ""}`} onClick={() => equip(it.id, "camo")}>{save.v3.camo === it.id ? "EQUIPPED" : "EQUIP"}</button> : <span className="owned-tag">OWNED</span>)
                      : <button className="primary small" disabled={save.credits < it.price} onClick={() => buy(it.id, it.price, it.name)}>BUY ◆ {it.price}</button>}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RifleCard({ id, owned, equipped, onBuy, onEquip, units, credits }: { id: string; owned: boolean; equipped: boolean; onBuy: () => void; onEquip: () => void; units: "metric" | "imperial"; credits: number }) {
  const r = RIFLES.find(x => x.id === id)!;
  const rows = useMemo(() => trajectoryTable(r.ballistics, [100, 200, 300, 400]), [r]);
  const b = r.ballistics;
  return (
    <section className={`panel rifle-card ${equipped ? "equipped" : ""}`}>
      <div className="rifle-art"><Drawing id={r.id} w={760} h={200} view="left" style="ink" margin={0.03} /><span className="art-draw">{r.drawing} · {r.title.toUpperCase()}</span></div>
      <div className="rifle-info">
        <div className="rifle-head"><div><b>{r.title}</b><small>{r.subtitle}</small></div>
          {owned ? <button className={`ghost ${equipped ? "on" : ""}`} onClick={onEquip}>{equipped ? "EQUIPPED" : "EQUIP"}</button> : <button className="primary small" disabled={credits < r.price} onClick={onBuy}>BUY ◆ {r.price}</button>}
        </div>
        <div className="spec-grid">
          <span><small>CARTRIDGE</small><b>{b.caliber}</b></span>
          <span><small>BULLET</small><b>{b.grains} gr {b.bullet}</b></span>
          <span><small>MUZZLE</small><b>{fmtVel(b.mv, units)}</b></span>
          <span><small>ZERO</small><b>{fmtDist(b.zero, units)}</b></span>
          <span><small>OPTIC</small><b>{r.scope.minMag}–{r.scope.maxMag}×{r.scope.objective}</b></span>
          <span><small>WEIGHT</small><b>{units === "imperial" ? `${(r.weightKg * 2.2046).toFixed(1)} lb` : `${r.weightKg.toFixed(1)} kg`}</b></span>
        </div>
        <table className="traj">
          <thead><tr><th>RANGE</th>{rows.map(x => <th key={x.range}>{fmtDist(x.range, units)}</th>)}</tr></thead>
          <tbody>
            <tr><td>DROP</td>{rows.map(x => <td key={x.range}>{x.range === 100 ? "0" : fmtCm(x.dropCm, units)}</td>)}</tr>
            <tr><td>HOLD</td>{rows.map(x => <td key={x.range}>{fix1(x.dropMil)} mil</td>)}</tr>
            <tr><td>{units === "imperial" ? "9 MPH WIND" : "4 M/S WIND"}</td>{rows.map(x => <td key={x.range}>{fmtCm(Math.abs(x.driftCm), units)}</td>)}</tr>
            <tr><td>ENERGY</td>{rows.map(x => <td key={x.range}>{fmtEnergy(x.energyJ, units)}</td>)}</tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function GearGlyph({ kind }: { kind: string }) {
  if (kind === "camo") return <svg viewBox="0 0 120 60" className="glyph"><g fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M20 50 C 30 20, 50 10, 60 10 C 70 10, 90 20, 100 50 Z" /><path d="M30 40c8-6 14-2 20-8M60 22c6 4 12 2 18 8M44 46c6-5 14-3 20-9" opacity=".7" /></g></svg>;
  return <svg viewBox="0 0 120 60" className="glyph"><g fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="44" y="8" width="32" height="46" rx="6" /><path d="M50 8V3h20v5M52 22h16M52 30h16" /><path d="M86 20c8 4 8 16 0 20M94 14c12 8 12 24 0 32" opacity=".7" /></g></svg>;
}
