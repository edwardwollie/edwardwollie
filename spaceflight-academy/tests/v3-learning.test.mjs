import assert from "node:assert/strict";
import test from "node:test";

const AGES = ["5–7", "8–10", "11–12"];

test("3D Space Rush keeps the v2.1 timing rules: narration first, 7 s grace, 30→22 s windows", async () => {
  const { RushSession, READING_GRACE_SECONDS, ANSWER_WINDOWS, answerWindowFor } = await import("../src/v3/learning/rush.ts");
  assert.equal(READING_GRACE_SECONDS, 7);
  assert.deepEqual([...ANSWER_WINDOWS], [30, 28, 26, 24, 22]);
  // tier = floor((level − 1) / 6)
  const expected = { 1: 30, 6: 30, 7: 28, 12: 28, 13: 26, 19: 24, 25: 22, 30: 22 };
  for (const [level, seconds] of Object.entries(expected)) assert.equal(answerWindowFor(Number(level)), seconds, `level ${level}`);

  const s = new RushSession("8–10", 7);
  assert.equal(s.window, 28);
  assert.equal(s.stage, "narrating");
  // No countdown while the question and all three answers are being read.
  s.tick(60);
  assert.equal(s.stage, "narrating");
  assert.equal(s.boost(), false, "cannot fly through a gate before the narration ends");
  // A stale narration callback is ignored.
  s.narrationDone(s.narrationToken - 1);
  assert.equal(s.stage, "narrating");
  s.narrationDone(s.narrationToken);
  assert.equal(s.stage, "grace");
  s.tick(6.9);
  assert.equal(s.stage, "grace");
  assert.equal(s.boost(), false, "no answering during the 7 s thinking time");
  s.tick(0.2);
  assert.equal(s.stage, "running");
  assert.equal(s.timeLeft, 28);
  // READ AGAIN restarts narration, grace and the full window.
  s.tick(10);
  assert.ok(s.readAgain());
  assert.equal(s.stage, "narrating");
  assert.equal(s.timeLeft, 28);
  assert.equal(s.graceLeft, 7);
});

test("the narration text reads the question and all three choices", async () => {
  const { RushSession } = await import("../src/v3/learning/rush.ts");
  for (const age of AGES) {
    const s = new RushSession(age, 3);
    const text = s.narrationText();
    assert.ok(text.startsWith(s.question.prompt));
    for (const [i, choice] of s.choices.entries()) assert.match(text, new RegExp(`Choice ${["one", "two", "three"][i]}: ${choice.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.`));
  }
});

test("wrong gates crash through without ending the mission; the Star Fact is read in full", async () => {
  const { RushSession, IMPACT_SECONDS } = await import("../src/v3/learning/rush.ts");
  const s = new RushSession("5–7", 1);
  for (let i = 0; i < 6; i++) {
    s.narrationDone(s.narrationToken);
    s.tick(7.01);
    assert.equal(s.stage, "running");
    const wrong = (s.correctGate + 1) % 3;
    s.select(i % 2 ? s.correctGate : wrong);
    assert.ok(s.boost());
    assert.equal(s.stage, "impact");
    s.tick(IMPACT_SECONDS + 0.01);
    assert.equal(s.stage, "fact");
    assert.match(s.factText(), i % 2 ? /^Correct!/ : /^Keep flying! The correct answer is/);
    s.narrationDone(s.narrationToken);
  }
  assert.equal(s.stage, "done");
  assert.equal(s.correct, 3);
  assert.equal(s.mistakes, 3);
  assert.equal(s.answered.length, 6);
});

test("relaxed timing removes the countdown; time-outs fly through the lined-up gate", async () => {
  const { RushSession } = await import("../src/v3/learning/rush.ts");
  const relaxed = new RushSession("5–7", 2, true);
  relaxed.narrationDone(relaxed.narrationToken);
  relaxed.tick(7.01);
  relaxed.tick(500);
  assert.equal(relaxed.stage, "running");
  const timed = new RushSession("5–7", 2);
  timed.narrationDone(timed.narrationToken);
  timed.tick(7.01);
  timed.select(timed.correctGate);
  timed.tick(30.01);
  assert.equal(timed.stage, "impact");
  assert.equal(timed.impact.correct, true);
});

test("each 3D mission uses the same six v2.1 questions in the same lane rotation", async () => {
  const { RushSession, rotate3 } = await import("../src/v3/learning/rush.ts");
  const { createSpaceRushMission } = await import("../src/space-rush-data.ts");
  for (const age of AGES) for (const level of [1, 12, 13, 30]) {
    const s = new RushSession(age, level);
    assert.deepEqual(s.questions.map((q) => q.id), createSpaceRushMission(age, level).map((q) => q.id));
    assert.deepEqual(s.choices, rotate3(s.questions[0].options, level));
    assert.ok(s.choices.includes(s.question.correct));
  }
});

test("mission stars and XP follow the v2.1 rules", async () => {
  const { missionStars, missionXp } = await import("../src/v3/learning/rush.ts");
  assert.equal(missionStars(0, 4), 3);
  assert.equal(missionStars(0, 3), 2);
  assert.equal(missionStars(2, 2), 2);
  assert.equal(missionStars(3, 9), 1);
  assert.equal(missionXp(10, 3, 6), 190 + 120 + 90 + 36);
});
