"use client";
// Client entry for the 3D edition. Checks for WebGL2, then loads the game
// (three.js and everything else) only in the browser. Without WebGL2 the
// player is offered the Classic 2.0 edition.

import { useEffect, useState, type ComponentType } from "react";

export default function Wildfront3D() {
  const [App, setApp] = useState<ComponentType | null>(null);
  const [state, setState] = useState<"boot" | "nogl" | "error">("boot");
  const [err, setErr] = useState("");
  useEffect(() => {
    let ok = false;
    try { const c = document.createElement("canvas"); ok = !!c.getContext("webgl2"); } catch { ok = false; }
    const load = ok ? import("./App.tsx").then(m => setApp(() => m.default)) : Promise.resolve().then(() => setState("nogl"));
    load.catch(e => { console.error(e); setErr(String(e?.message ?? e)); setState("error"); });
  }, []);
  if (state === "nogl" || state === "error") {
    return (
      <main className="wf3 wf-fallback">
        <div className="fb-card">
          <span className="brand-mark">W</span>
          <h1>WILDFRONT HORIZON 3D</h1>
          <p>{state === "nogl" ? "This browser or device doesn't support WebGL 2, which the 3D edition needs." : `The 3D edition failed to start (${err}).`} You can still play the full Classic 2.0 edition with all twelve contracts and your saved progress.</p>
          <a className="primary" href="/classic">PLAY CLASSIC 2.0 →</a>
        </div>
      </main>
    );
  }
  if (!App) return <main className="wf3"><div className="wf-boot"><b>WILDFRONT</b><span>CALIBRATING FIELD SYSTEM 3.0…</span></div></main>;
  return <App />;
}
