import { useGame, useUI } from "./common.tsx";
import { GATE_COLORS, GATE_SHAPES } from "../scenes/rush.ts";
import { READING_GRACE_SECONDS } from "../learning/rush.ts";

interface RushControls {
  select: (i: number) => void;
  boost: () => void;
  readAgain: () => void;
  continueFact: () => void;
}

export function RushHud() {
  const game = useGame();
  const rush = useUI((s) => s.rush);
  const run = useUI((s) => s.run);
  if (!rush || !run || !rush.question) return null;
  const scene = game.scenes.get("rush") as unknown as RushControls;
  const q = rush.question;
  const stage = rush.stage;
  const impact = rush.impact;
  const label =
    stage === "narrating" ? "🔊 LISTENING" :
    stage === "grace" ? `🤔 THINK ${Math.ceil(rush.graceLeft)}s` :
    stage === "running" ? (rush.relaxed ? "🚀 ANSWER WHEN READY" : `🚀 ANSWER ${Math.ceil(rush.timeLeft)}s`) :
    impact?.correct ? "✨ CORRECT!" : "💫 KEEP FLYING!";
  const badgeClass = stage === "narrating" ? "listen" : stage === "grace" ? "think" : stage === "running" ? "answer" : impact?.correct ? "good" : "oops";
  const timerPct = stage === "grace" ? (rush.graceLeft / READING_GRACE_SECONDS) * 100 : stage === "running" ? (rush.relaxed ? 100 : (rush.timeLeft / rush.window) * 100) : 0;
  const dots = Array.from({ length: rush.total }, (_, i) => {
    const a = rush.answered[i];
    return a ? (a.correct ? "ok" : "no") : i === rush.index ? "now" : "";
  });
  const showFact = stage === "fact" && impact;
  return (
    <>
      <div className="rush-top">
        <button className="btn round ui-on" aria-label="Pause" onClick={() => game.pause()}>⏸</button>
        <div className="stat">{run.mission.world.icon} M{run.level}</div>
        <div className="stat progress-dots" aria-label={`Gate ${rush.index + 1} of ${rush.total}`}>{dots.map((d, i) => <i key={i} className={d} />)}</div>
        <div className="spacer" />
        <div className="stat" title="Shields">🛡️ {rush.shields}</div>
        <div className="stat" title="Correct">✅ {rush.correct}/{rush.total}</div>
        <div className="stat" title="Combo">🔥 {rush.combo}</div>
        <button className="btn ui-on" onClick={() => scene.readAgain()} disabled={!(stage === "narrating" || stage === "grace" || stage === "running")}>🔊 <span>READ AGAIN</span></button>
      </div>
      {!showFact && (
        <section className="rush-q panel">
          <div className="topic">{q.icon} {q.topic} · Gate {rush.index + 1} of {rush.total}</div>
          <h2>{q.prompt}</h2>
          <div className={"stage-badge " + badgeClass}>{label}</div>
          {(stage === "grace" || stage === "running") && <div className="timer-bar"><i style={{ width: `${timerPct}%` }} /></div>}
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Narration first · {READING_GRACE_SECONDS}s thinking time · {rush.relaxed ? "relaxed timing" : `${rush.window}s answer window`}</div>
        </section>
      )}
      {showFact && (
        <section className="fact-card panel" aria-live="polite">
          <div className="big">{impact.correct ? "🌟" : "💡"}</div>
          <h3>{impact.correct ? "Correct! The gate split open!" : "Keep flying!"}</h3>
          {!impact.correct && <p style={{ color: "#c9ffe1" }}>The correct answer is <b>{q.correct}</b>.</p>}
          <p>⭐ Star Fact: {q.explanation}</p>
          <button className="btn primary" onClick={() => scene.continueFact()}>Next gate ▶</button>
        </section>
      )}
      <div className="choices">
        {rush.choices.map((choice, i) => {
          const isRight = impact && impact.correctGate === i;
          const isWrong = impact && impact.selected === i && !impact.correct;
          return (
            <button
              key={i}
              className={"choice" + (rush.selected === i && !impact ? " on" : "") + (isRight ? " right" : "") + (isWrong ? " wrong" : "")}
              style={{ ["--gate" as string]: GATE_COLORS[i] }}
              disabled={!!impact}
              onClick={() => {
                if (rush.selected === i && stage === "running") scene.boost();
                else scene.select(i);
              }}
              aria-label={`Gate ${i + 1}: ${choice}`}
            >
              <span className="num">{i + 1}</span>
              <span>{choice}</span>
              <span style={{ marginLeft: "auto", color: GATE_COLORS[i], fontSize: 14 }}>{GATE_SHAPES[i]}</span>
            </button>
          );
        })}
        <button className="btn pink boost" disabled={stage !== "running"} onClick={() => scene.boost()}>
          🚀 BOOST{stage === "running" ? ` ${rush.selected + 1}` : ""}
        </button>
      </div>
    </>
  );
}
