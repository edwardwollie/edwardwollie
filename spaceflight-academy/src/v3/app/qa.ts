import type { Game } from "./game.ts";
import { enumerateBuilds, meetsGoals } from "../engineering/missions.ts";

/** Helpers for automated QA (Playwright) and debugging: window.__sfa */
export function installQA(game: Game) {
  const w = window as unknown as Record<string, unknown>;
  w.__sfa = {
    game,
    ui: () => game.ui.get(),
    save: () => game.save.get(),
    scene: () => game.engine.current?.id,
    setAge: (age: "5–7" | "8–10" | "11–12") => game.save.set({ age }),
    hub: () => game.goHub(),
    map: (level?: number) => game.openMap(level),
    start: (level: number) => game.startMission(level, true),
    rush: () => game.beginRush(),
    call: (sceneId: string, method: string, ...args: unknown[]) => {
      const scene = game.scenes.get(sceneId) as unknown as Record<string, (...a: unknown[]) => unknown> | undefined;
      return scene?.[method]?.(...args);
    },
    unlockAll: () => game.save.set({ progress: { "5–7": 30, "8–10": 30, "11–12": 30 } }),
    step: (seconds: number) => game.engine.step(seconds),
    /** Jumps straight to the hangar for a mission with a pretend Space Rush result. */
    buildFor: async (level: number, correct = 5) => {
      await game.startMission(level, false);
      const answered = Array.from({ length: 6 }, (_, i) => ({ id: "qa-" + i, correct: i < correct }));
      await game.finishRush({ stage: "done", index: 5, total: 6, question: null, choices: ["", "", ""], selected: 1, graceLeft: 0, timeLeft: 0, window: 30, relaxed: false, shields: 3, combo: 0, bestCombo: correct, correct, mistakes: 6 - correct, impact: null, narrationToken: 1, answered });
    },
    add: (...ids: string[]) => { const h = game.scenes.get("hangar") as unknown as { addPart: (id: string) => void }; for (const id of ids) h.addPart(id); },
    pauseLoop: () => { game.engine.paused = true; },
    /** Adds the cheapest winning set of parts for the current mission in the hangar. */
    solve: () => {
      const run = game.ui.get().run;
      if (!run) return false;
      const m = run.mission;
      const best = enumerateBuilds(m.age, m.start, m.energy, m.needs).filter((b) => meetsGoals(b.analysis, m)).sort((a, b) => a.cost - b.cost)[0];
      if (!best) return false;
      const h = game.scenes.get("hangar") as unknown as { addPart: (id: string) => void };
      const start = m.start as unknown as Record<string, number>;
      for (const [id, n] of Object.entries(best.counts as unknown as Record<string, number>)) for (let i = start[id] ?? 0; i < n; i++) h.addPart(id);
      return true;
    },
  };
}
