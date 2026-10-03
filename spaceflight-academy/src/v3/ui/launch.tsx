import type { LaunchView } from "../scenes/launch.ts";
import { useGame, useUI } from "./common.tsx";

export function LaunchHud() {
  const game = useGame();
  const view = useUI((s) => s.launch) as LaunchView | null;
  if (!view) return null;
  const scene = game.scenes.get("launch") as unknown as { skip: () => void; backToHangar: () => void };
  if (view.phase === "summary" && view.summary) {
    const s = view.summary;
    return (
      <div className="results">
        <section className="panel">
          <div className="kicker">Test flight report</div>
          <div className="h2">{s.reached ? `🚀 It can reach ${view.destination}!` : "🪂 Not enough to get there yet"}</div>
          <div className="earned">
            <div><b>{Math.round(s.apogeeKm)} km</b><small>HIGHEST POINT</small></div>
            <div><b>{s.twr.toFixed(2)}×</b><small>THRUST ÷ WEIGHT</small></div>
            <div><b>{Math.round(s.dv)}</b><small>Δv m/s (ACADEMY)</small></div>
          </div>
          <p className="muted">{s.reached ? "Great engineering! Try a mission with this design." : "Add fuel, add engines, or make the rocket lighter — then test again."}</p>
          <button className="btn primary big" onClick={() => scene.backToHangar()}>🔧 Back to the hangar</button>
        </section>
      </div>
    );
  }
  return (
    <>
      {view.count !== null && view.count > 0 && <div className="countdown" key={view.count}>{view.count}</div>}
      {view.event && <div className="event panel" key={view.eventId}>{view.event}</div>}
      <div className="telemetry panel">
        <div className="kicker">Telemetry</div>
        <div className="row" style={{ gap: 16 }}>
          <div><div className="v">{view.altitudeKm.toFixed(1)}</div><small className="muted">km high</small></div>
          <div><div className="v">{Math.round(view.speedKmh).toLocaleString()}</div><small className="muted">km/h</small></div>
          <div><div className="v">{Math.round(view.fuel * 100)}%</div><small className="muted">fuel</small></div>
        </div>
      </div>
      <div className="act-controls">
        <button className="btn" onClick={() => scene.skip()}>Skip ⏭</button>
      </div>
    </>
  );
}
