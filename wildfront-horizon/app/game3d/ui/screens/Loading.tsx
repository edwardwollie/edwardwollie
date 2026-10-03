"use client";
// Loading screen shown while the reserve is generated and shaders compile.

import type { HuntConfig } from "../../hunt/hunt.ts";
import type { Mission } from "../../data/missions.ts";
import { reserveByName } from "../../blueprints/reserves.ts";
import { WILDLIFE_BY_SPECIES } from "../../blueprints/wildlife/index.ts";
import { CondIcon, Drawing } from "../components.tsx";

const TIPS = [
  "Wind carries your scent downwind in a widening cone — keep the wind in your face and circle wide.",
  "Fresh tracks have crisp edges; old ones soften and fade. Press F on sign to read its age and direction.",
  "Grazing animals can't see well with their heads down — move then, freeze when heads come up.",
  "Crouch (C) and go prone (Z) to cut noise and visibility. Prone is the steadiest rest for a long shot.",
  "Hold your breath (Shift) only for the shot — the meter drains fast and sway returns when it's empty.",
  "Your shot report travels at 343 m/s; distant animals hear it a moment later and may not run straight away.",
  "Heart-lung and upper-shoulder hits are GREAT and drop game quickly. Paunch and liver hits mean a tracking job.",
  "Binoculars (B) range and identify game, and tell you whether it's on your licence.",
  "Thunder and heavy rain mask your footsteps — use them to close the distance.",
  "Climb towers and tree stands (F): your scent drifts above the game below.",
  "The scope's BDC marks show holdover for 200–500 m with your rifle's real trajectory.",
];

export default function Loading({ plan }: { plan: { cfg: HuntConfig; mission: Mission | null } }) {
  const tip = TIPS[(plan.cfg.seed >>> 0) % TIPS.length];
  const def = reserveByName(plan.cfg.reserve);
  const sp = plan.cfg.licensed[0];
  return (
    <div className="loading-screen">
      <div className="ld-grid" />
      <div className="ld-card">
        <small className="eyebrow">{plan.mission ? `CONTRACT ${String(plan.mission.id).padStart(2, "0")} · ${plan.mission.difficulty.toUpperCase()}` : "FREE HUNT"}</small>
        <h2>{plan.cfg.name}</h2>
        <div className="ld-art">{WILDLIFE_BY_SPECIES[sp] && <Drawing id={WILDLIFE_BY_SPECIES[sp].id} w={640} h={300} view="left" style="ink" />}</div>
        <div className="ld-meta">
          <span>{def.drawing} · {def.name.toUpperCase()}</span>
          <span><CondIcon k={plan.cfg.time} size={15} /> {plan.cfg.time}</span>
          <span><CondIcon k={plan.cfg.weather} size={15} /> {plan.cfg.weather}</span>
        </div>
        <div className="ld-bar"><span /></div>
        <div className="ld-steps"><span>TERRAIN</span><span>WATER</span><span>FOREST</span><span>WILDLIFE</span><span>SHADERS</span></div>
        <p className="ld-tip"><b>FIELD TIP</b> {tip}</p>
      </div>
    </div>
  );
}
