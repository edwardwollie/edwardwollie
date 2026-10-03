import assert from "node:assert/strict";
import test from "node:test";

const AGES = ["5–7", "8–10", "11–12"];

test("all 90 rocket-engineering missions are solvable, never pre-solved, and allow 3 stars", async () => {
  const { makeEngineeringMission, enumerateBuilds, meetsGoals } = await import("../src/v3/engineering/missions.ts");
  const { analyzeRocket } = await import("../src/v3/engineering/physics.ts");
  for (const age of AGES) {
    for (let level = 1; level <= 30; level++) {
      const m = makeEngineeringMission(age, level);
      assert.equal(m.level, level);
      assert.equal(m.worldIndex, Math.floor((level - 1) / 5));
      assert.equal(m.boss, level % 5 === 0);
      const start = analyzeRocket(m.start, m.needs);
      assert.equal(meetsGoals(start, m), false, `${age} M${level}: the starting rocket must need work`);
      const builds = enumerateBuilds(age, m.start, m.energy, m.needs);
      const winners = builds.filter((b) => meetsGoals(b.analysis, m));
      assert.ok(winners.length > 0, `${age} M${level} must be solvable`);
      assert.ok(winners.some((b) => m.energy - b.cost >= 4), `${age} M${level} must allow 3 stars (4+ energy left)`);
    }
  }
});

test("rocket physics behaves like real rockets", async () => {
  const { analyzeRocket, simulateAscent, LIFTOFF_TWR } = await import("../src/v3/engineering/physics.ts");
  const { emptyCounts } = await import("../src/v3/engineering/systems.ts");
  const needs = { range: 2200, required: [], helpful: [] };
  const base = { ...emptyCounts(), engine: 1, tank: 1 };
  const a = analyzeRocket(base, needs);
  assert.ok(a.mass > a.dryMass && a.fuelMass > 0);
  assert.ok(Math.abs(a.twr - a.thrust * 1000 / (a.mass * 1000 * 9.81)) < 0.05, "TWR = thrust / weight");
  // More fuel → more delta-v but lower thrust-to-weight.
  const b = analyzeRocket({ ...base, tank: 2 }, needs);
  assert.ok(b.dv > a.dv);
  assert.ok(b.twr < a.twr);
  // More engines → more thrust-to-weight.
  const c = analyzeRocket({ ...base, engine: 3 }, needs);
  assert.ok(c.twr > a.twr);
  // A rocket that is too heavy cannot lift off.
  const heavy = analyzeRocket({ ...base, tank: 3, habitat: 1, lab: 1 }, needs);
  assert.equal(heavy.canLift, heavy.twr >= LIFTOFF_TWR);
  // Fins move the centre of pressure back → more stable.
  const finned = analyzeRocket({ ...base, fins: 1 }, needs);
  assert.ok(finned.margin > a.margin);
  // Ascent simulation climbs when it can lift.
  const samples = simulateAscent({ ...base, engine: 3, tank: 2 });
  assert.ok(samples.length > 10);
  assert.ok(samples[samples.length - 1].altitude > samples[0].altitude);
});

test("the four v2.1 meters stay within 0–100 for every enumerated build", async () => {
  const { makeEngineeringMission, enumerateBuilds } = await import("../src/v3/engineering/missions.ts");
  for (const age of AGES) {
    const m = makeEngineeringMission(age, 17);
    for (const b of enumerateBuilds(age, m.start, m.energy, m.needs)) {
      for (const v of Object.values(b.analysis.meters)) assert.ok(v >= 0 && v <= 100);
    }
  }
});

test("Cosmo's coach hint always gives a concrete next step", async () => {
  const { makeEngineeringMission, coachHint } = await import("../src/v3/engineering/missions.ts");
  const { analyzeRocket } = await import("../src/v3/engineering/physics.ts");
  for (const age of AGES) for (const level of [1, 8, 15, 22, 30]) {
    const m = makeEngineeringMission(age, level);
    const hint = coachHint(m, analyzeRocket(m.start, m.needs), m.start);
    assert.ok(hint.length > 20);
    assert.notEqual(hint, "All systems green! Start the countdown.");
  }
});
