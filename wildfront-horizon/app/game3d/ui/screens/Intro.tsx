"use client";
// First-run "what's new" card and the v2-style five-step field training
// (updated for the 3D controls) shown before the first contract.

import { useState } from "react";
import { useApp } from "../ctx.ts";

export function Intro({ onDone }: { onDone: () => void }) {
  const { playUi } = useApp();
  return (
    <div className="modal-wrap">
      <div className="intro-card">
        <small className="eyebrow">WILDFRONT HORIZON · VERSION 3.0</small>
        <h2>The reserves are <em>real 3D</em> now.</h2>
        <ul className="intro-list">
          <li><b>Five living reserves</b> — alpine lake, red highland canyon, river basin, volcanic steppe and the Horizon Crossing, with weather, time of day and wind you can feel.</li>
          <li><b>Blueprint-built wildlife</b> — six species with real anatomy, gaits, senses and trophy scoring. Every model is drawn from an engineering blueprint.</li>
          <li><b>Real ballistics</b> — drop, wind drift and time of flight, BDC holdover marks in the scope, and a blueprint x-ray of every hit.</li>
          <li><b>Full tracking game</b> — tracks age, beds, droppings, hit sign, scent cones and herd behaviour. Wounded game must be recovered.</li>
          <li><b>Your progress carries over</b> — contracts, stars, credits and Field Kit from 2.0. Classic 2.0 is still one click away.</li>
        </ul>
        <div className="intro-actions">
          <button className="primary" onClick={() => { playUi("select"); onDone(); }}>ENTER THE LODGE <span>→</span></button>
          <a className="ghost" href="/classic">PLAY CLASSIC 2.0</a>
        </div>
      </div>
    </div>
  );
}

const STEPS = [
  { icon: "⌨", title: "STALK THE RESERVE", copy: "WASD moves and the mouse looks — click the view to capture the mouse. C crouches and Z goes prone: lower is quieter and harder to spot. Shift sprints, but game hears running feet. On touch screens the left stick moves and dragging the right side looks." },
  { icon: "◇", title: "READ FRESH SIGN", copy: "Look at tracks, droppings or beds on the ground and press F to read species, age and direction. Press E or SCAN to pulse the Trail Scanner: fresh sign and nearby game glow for a few seconds." },
  { icon: "◎", title: "USE THE OPTIC", copy: "Hold the right mouse button — or press Q — to aim through the scope. Q cycles 1× → 3× → 6×, the wheel fine-tunes. The scope shows range, wind, the animal's state and BDC holdover marks. B raises the rangefinding binoculars." },
  { icon: "◌", title: "STEADY YOUR BREATH", copy: "While scoped, hold SHIFT or the STEADY button. Sway drops sharply, but breath is limited and must recover. Crouching, going prone or resting in a stand steadies you further." },
  { icon: "✦", title: "SHOT GRADES", copy: "Headshots are PERFECT. Heart, lungs and the upper shoulder are GREAT. Other body hits are GOOD: the animal staggers and runs wounded — follow the hit sign and finish it. Walk up to a harvest and press F to tag it." },
];

export function Training({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const [step, setStep] = useState(0);
  const { playUi } = useApp();
  const s = STEPS[step];
  return (
    <div className="tutorial">
      <div className="tutorial-card">
        <small>FIELD TRAINING // {step + 1} OF {STEPS.length}</small>
        <div className="tutorial-icon">{s.icon}</div>
        <h2>{s.title}</h2>
        <p>{s.copy}</p>
        <div className="dots">{STEPS.map((_, i) => <i key={i} className={i === step ? "on" : ""} />)}</div>
        <button className="primary" onClick={() => { playUi("select"); if (step < STEPS.length - 1) setStep(v => v + 1); else onDone(); }}>{step < STEPS.length - 1 ? "NEXT LESSON" : "START HUNT"} →</button>
        <button className="ghost" onClick={onSkip}>SKIP TRAINING</button>
      </div>
    </div>
  );
}
