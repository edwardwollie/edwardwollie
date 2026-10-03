import { createSpaceRushDeck } from "../../space-rush-data.ts";
import { ACHIEVEMENTS } from "../data/achievements.ts";
import { useGame, useUI } from "./common.tsx";

export function Results() {
  const game = useGame();
  const results = useUI((s) => s.results);
  if (!results) return null;
  const deck = createSpaceRushDeck(results.age);
  const facts = results.facts.map((id) => deck.find((q) => q.id === id)).filter(Boolean).slice(0, 3);
  const earned = ACHIEVEMENTS.filter((a) => results.newAchievements.includes(a.id));
  return (
    <div className="results">
      <section className="panel scroll">
        <div className="kicker">Mission {results.level} complete{results.boss ? " · Boss cleared!" : ""}</div>
        <div className="h2">{results.boss ? "☄️ Meteor Command defeated!" : "🚀 Mission success!"}</div>
        <div className="big-stars" aria-label={`${results.stars} stars`}>{"★".repeat(results.stars)}<span className="dim">{"★".repeat(3 - results.stars)}</span></div>
        <div className="earned">
          <div><b>{results.correct}/{results.total}</b><small>GATES CORRECT</small></div>
          <div><b>+{results.xp}</b><small>XP</small></div>
          <div><b>⚡{results.energyLeft}</b><small>ENERGY LEFT</small></div>
          <div><b>{"★".repeat(results.activityScore)}</b><small>EXPLORER SKILL</small></div>
        </div>
        {results.badge && <div className="chip ok" style={{ fontSize: 17, margin: "4px 0 10px" }}>🏅 New badge: {results.badge}</div>}
        {earned.map((a) => <div key={a.id} className="badge-tile" style={{ margin: "6px 0" }}><span className="ico">{a.icon}</span><div><b>{a.name}</b><div className="muted" style={{ fontSize: 13 }}>{a.detail}</div></div></div>)}
        {facts.length > 0 && (
          <div style={{ textAlign: "left", marginTop: 10 }}>
            <div className="kicker">New in your Star Journal</div>
            {facts.map((q) => <div key={q!.id} className="journal-item"><small>{q!.icon} {q!.topic}</small><div>{q!.explanation}</div></div>)}
          </div>
        )}
        <p className="muted" style={{ fontSize: 13 }}>{results.stars < 3 ? "Tip: 3 stars = no gate mistakes and 4 or more build energy left." : "Perfect flight, cadet!"}</p>
        <div className="row wrap" style={{ justifyContent: "center", marginTop: 6 }}>
          <button className="btn" onClick={() => void game.openMap(results.level)}>🗺️ Mission map</button>
          <button className="btn" onClick={() => void game.replayMission()}>↻ Fly again</button>
          {results.level < 30 && <button className="btn primary big" onClick={() => void game.nextMission()}>NEXT MISSION ▶</button>}
          {results.level >= 30 && <button className="btn primary big" onClick={() => void game.goHub()}>🎓 Back to the Spaceport</button>}
        </div>
      </section>
    </div>
  );
}
