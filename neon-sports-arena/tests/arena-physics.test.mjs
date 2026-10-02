import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { crossingAt, goalAim, GRAVITY, keeperTarget, leadTarget, ringCrossing, rng, solveBallistic, solveShot, stepBall } from "../app/arena-physics.ts";
import { cameraRelative } from "../app/movement-input.ts";

const dims = JSON.parse(fs.readFileSync(new URL("../app/blueprint-spec.json", import.meta.url), "utf8")).arena;
const ball = (p, v) => ({ p: { ...p }, v: { ...v }, spin: 0 });
function fly(b, goalMode, seconds = 3) {
  const events = [];
  for (let t = 0; t < seconds; t += 1 / 60) {
    for (const e of stepBall(b, 1 / 60, dims, goalMode)) {events.push(e); if (e.type === "goal") return events}
  }
  return events;
}

test("a shot solved toward the goal mouth scores, one wide of the post does not", () => {
  const from = { x: -3, y: .4, z: 10 };
  const good = solveShot(from, { x: 2.5, y: 1.2, z: 24.6 }, 26).velocity;
  assert.ok(fly(ball(from, good), true).some((e) => e.type === "goal" && e.end === 1));
  const wide = solveShot(from, { x: 7, y: 1, z: 24.6 }, 26).velocity;
  const events = fly(ball(from, wide), true);
  assert.ok(!events.some((e) => e.type === "goal"));
  assert.ok(events.some((e) => e.type === "wall"));
});

test("end boards return the ball outside goal mode", () => {
  const b = ball({ x: 0, y: .4, z: 20 }, { x: 0, y: 0, z: 20 });
  assert.ok(!fly(b, false, 1).some((e) => e.type === "goal"));
  assert.ok(b.v.z < 0 && Math.abs(b.p.z) <= dims.pitchHalfLength);
});

test("ballistic solver lands on its target", () => {
  const from = { x: 1, y: .4, z: 5 }, to = { x: -2, y: 4.6, z: 18 }, t = 1.1;
  const v = solveBallistic(from, to, t);
  assert.ok(Math.abs(from.x + v.x * t - to.x) < 1e-9);
  assert.ok(Math.abs(from.y + v.y * t - .5 * GRAVITY * t * t - to.y) < 1e-9);
  const c = crossingAt({ p: from, v }, to.z);
  assert.ok(Math.abs(c.x - to.x) < 1e-9 && Math.abs(c.y - to.y) < 1e-6);
});

test("gravity hoop: through the ring scores, the tube is a rim-out", () => {
  const centre = { x: 0, y: dims.hoopCentreY, z: dims.hoopZ };
  assert.equal(ringCrossing({ x: .5, y: 4.4, z: 17.8 }, { x: .5, y: 4.4, z: 18.2 }, centre, dims.hoopScoreRadius, dims.hoopRimRadius), "score");
  assert.equal(ringCrossing({ x: 2.3, y: 4.6, z: 17.8 }, { x: 2.3, y: 4.6, z: 18.2 }, centre, dims.hoopScoreRadius, dims.hoopRimRadius), "rim");
  assert.equal(ringCrossing({ x: 4, y: 4.6, z: 17.8 }, { x: 4, y: 4.6, z: 18.2 }, centre, dims.hoopScoreRadius, dims.hoopRimRadius), null);
});

test("goal aim follows the striker's facing and stays inside the posts", () => {
  const straight = goalAim({ x: 0, y: 0, z: 10 }, 0, 24, dims.goalHalfWidth, .4);
  assert.ok(straight.aimed && Math.abs(straight.x) < 1e-9);
  const hard = goalAim({ x: -10, y: 0, z: 10 }, .9, 24, dims.goalHalfWidth, .4);
  assert.ok(hard.aimed && hard.x < dims.goalHalfWidth);
  assert.equal(goalAim({ x: 0, y: 0, z: 10 }, Math.PI, 24, dims.goalHalfWidth, .4).aimed, false);
});

test("keeper tracks the predicted crossing of an incoming shot", () => {
  const from = { x: -2, y: .5, z: 12 };
  const v = solveShot(from, { x: 3, y: 1, z: 24.6 }, 28).velocity;
  const k = keeperTarget({ p: from, v }, 23.1, dims.goalHalfWidth, 1);
  assert.ok(k.urgent && k.x > 2 && k.x < 3.2);
  assert.equal(keeperTarget({ p: from, v: { x: 0, y: 0, z: -5 } }, 23.1, dims.goalHalfWidth, 1).urgent, false);
});

test("passes lead a running receiver", () => {
  const lead = leadTarget({ x: 0, y: 0, z: 0 }, { x: 8, y: 0, z: 8 }, { x: 0, y: 0, z: 6 }, 16);
  assert.ok(lead.target.z > 8);
});

test("camera-relative input and deterministic rng", () => {
  const f = cameraRelative(0, 1, 0); assert.ok(Math.abs(f.z - 1) < 1e-9 && Math.abs(f.x) < 1e-9);
  const r = cameraRelative(1, 0, Math.PI / 2); assert.ok(Math.abs(r.z + 1) < 1e-9);
  const a = rng(42), b = rng(42);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
});
