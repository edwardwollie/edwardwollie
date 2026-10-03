import type { AgePath } from "../../flight-data.ts";
import { createSpaceRushMission, type SpaceRushQuestion } from "../../space-rush-data.ts";

/**
 * Space Rush learning rules (preserved exactly from v2.1):
 *  1. The narrator reads the question and all three choices BEFORE any countdown.
 *  2. Then a 7-second thinking grace period.
 *  3. Then the answer window: 30/28/26/24/22 s by mission tier (every 6 missions).
 *  4. READ AGAIN restarts narration, the full grace period and the full window.
 *  5. Correct gates split open; wrong gates crash through, explain the right answer
 *     and the mission continues (no reset). When time runs out the rocket flies
 *     through the gate it is lined up with.
 * New in v3: a Star Fact stage reads the explanation in full before the next gate,
 * and "Relaxed timing" (grown-up setting) removes the countdown.
 */
export const READING_GRACE_SECONDS = 7;
export const ANSWER_WINDOWS = [30, 28, 26, 24, 22] as const;
export const IMPACT_SECONDS = 1.35;

export type RushStage = "narrating" | "grace" | "running" | "impact" | "fact" | "done";

export interface RushImpact {
  selected: number;
  correctGate: number;
  correct: boolean;
}

export function answerWindowFor(level: number) {
  return ANSWER_WINDOWS[Math.min(4, Math.floor((Math.max(1, level) - 1) / 6))];
}

/** v2.1 lane order: rotate the options by (mission + question index). */
export function rotate3<T>(items: readonly T[], amount: number): [T, T, T] {
  const n = ((amount % 3) + 3) % 3;
  const out = [...items.slice(n), ...items.slice(0, n)];
  return [out[0], out[1], out[2]];
}

/** v2.1 narration text: the question followed by all three choices. */
export function questionNarration(question: SpaceRushQuestion, choices: readonly string[]) {
  return `${question.prompt} Choice one: ${choices[0]}. Choice two: ${choices[1]}. Choice three: ${choices[2]}.`;
}

export function factNarration(question: SpaceRushQuestion, correct: boolean) {
  return correct ? `Correct! ${question.explanation}` : `Keep flying! The correct answer is ${question.correct}. ${question.explanation}`;
}

export interface RushSnapshot {
  stage: RushStage;
  index: number;
  total: number;
  question: SpaceRushQuestion | null;
  choices: [string, string, string];
  selected: number;
  graceLeft: number;
  timeLeft: number;
  window: number;
  relaxed: boolean;
  shields: number;
  combo: number;
  bestCombo: number;
  correct: number;
  mistakes: number;
  impact: RushImpact | null;
  narrationToken: number;
  answered: { id: string; correct: boolean }[];
}

export class RushSession {
  readonly questions: SpaceRushQuestion[];
  readonly window: number;
  stage: RushStage = "narrating";
  index = 0;
  selected = 1;
  graceLeft = READING_GRACE_SECONDS;
  timeLeft: number;
  shields = 3;
  combo = 0;
  bestCombo = 0;
  correct = 0;
  mistakes = 0;
  impact: RushImpact | null = null;
  /** Increments whenever narration must (re)start; stale completions are ignored. */
  narrationToken = 1;
  private impactLeft = 0;
  readonly answered: { id: string; correct: boolean }[] = [];
  onChange: (() => void) | null = null;

  readonly age: AgePath;
  readonly level: number;
  readonly relaxed: boolean;

  constructor(age: AgePath, level: number, relaxed = false) {
    this.age = age;
    this.level = level;
    this.relaxed = relaxed;
    this.questions = createSpaceRushMission(age, level);
    this.window = answerWindowFor(level);
    this.timeLeft = this.window;
  }

  get total() {
    return this.questions.length;
  }

  get question(): SpaceRushQuestion | null {
    return this.questions[this.index] ?? null;
  }

  get choices(): [string, string, string] {
    const q = this.question;
    return q ? rotate3(q.options, this.level + this.index) : ["", "", ""];
  }

  get correctGate() {
    const q = this.question;
    return q ? this.choices.findIndex((choice) => choice === q.correct) : -1;
  }

  narrationText() {
    const q = this.question;
    return q ? questionNarration(q, this.choices) : "";
  }

  factText() {
    const q = this.question;
    return q && this.impact ? factNarration(q, this.impact.correct) : "";
  }

  private changed() {
    this.onChange?.();
  }

  /** Narration of the question (or the Star Fact) finished. */
  narrationDone(token: number) {
    if (token !== this.narrationToken) return;
    if (this.stage === "narrating") {
      this.stage = "grace";
      this.graceLeft = READING_GRACE_SECONDS;
      this.changed();
    } else if (this.stage === "fact") {
      this.next();
    }
  }

  /** Re-reads the question: narration + full grace + full window restart. */
  readAgain() {
    if (this.stage !== "narrating" && this.stage !== "grace" && this.stage !== "running") return false;
    this.stage = "narrating";
    this.graceLeft = READING_GRACE_SECONDS;
    this.timeLeft = this.window;
    this.narrationToken++;
    this.changed();
    return true;
  }

  select(gate: number) {
    if (this.stage === "impact" || this.stage === "fact" || this.stage === "done") return false;
    const next = Math.max(0, Math.min(2, Math.round(gate)));
    if (next === this.selected) return false;
    this.selected = next;
    this.changed();
    return true;
  }

  /** Boost through the selected gate — only while the answer window is running. */
  boost() {
    if (this.stage !== "running") return false;
    this.resolve(this.selected);
    return true;
  }

  tick(dt: number) {
    if (this.stage === "grace") {
      this.graceLeft = Math.max(0, this.graceLeft - dt);
      if (this.graceLeft <= 0) {
        this.stage = "running";
        this.timeLeft = this.window;
        this.changed();
      }
    } else if (this.stage === "running") {
      if (this.relaxed) return;
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (this.timeLeft <= 0) this.resolve(this.selected);
    } else if (this.stage === "impact") {
      this.impactLeft -= dt;
      if (this.impactLeft <= 0) {
        this.stage = "fact";
        this.narrationToken++;
        this.changed();
      }
    }
  }

  private resolve(selected: number) {
    const q = this.question;
    if (!q) return;
    const correctGate = this.correctGate;
    const correct = selected === correctGate;
    this.impact = { selected, correctGate, correct };
    this.stage = "impact";
    this.impactLeft = IMPACT_SECONDS;
    this.answered.push({ id: q.id, correct });
    if (correct) {
      this.combo++;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.correct++;
    } else {
      this.combo = 0;
      this.mistakes++;
      this.shields = Math.max(0, this.shields - 1);
    }
    this.changed();
  }

  private next() {
    if (this.index >= this.questions.length - 1) {
      this.stage = "done";
      this.changed();
      return;
    }
    this.index++;
    this.selected = 1;
    this.impact = null;
    this.stage = "narrating";
    this.graceLeft = READING_GRACE_SECONDS;
    this.timeLeft = this.window;
    this.narrationToken++;
    this.changed();
  }

  /** Skip the Star Fact (after it has been shown) — used by the Continue button. */
  skipFact() {
    if (this.stage === "fact") this.next();
  }

  snapshot(): RushSnapshot {
    return {
      stage: this.stage, index: this.index, total: this.questions.length, question: this.question, choices: this.choices,
      selected: this.selected, graceLeft: this.graceLeft, timeLeft: this.timeLeft, window: this.window, relaxed: this.relaxed,
      shields: this.shields, combo: this.combo, bestCombo: this.bestCombo, correct: this.correct, mistakes: this.mistakes,
      impact: this.impact, narrationToken: this.narrationToken, answered: [...this.answered],
    };
  }
}

/** v2.1 star rule: 3 = no mistakes and ≥4 energy left; 2 = ≤2 mistakes and ≥2 energy left; else 1. */
export function missionStars(mistakes: number, energyLeft: number) {
  return mistakes === 0 && energyLeft >= 4 ? 3 : mistakes <= 2 && energyLeft >= 2 ? 2 : 1;
}

/** v2.1 XP rule. */
export function missionXp(level: number, stars: number, correct: number) {
  return 190 + level * 12 + stars * 30 + correct * 6;
}
