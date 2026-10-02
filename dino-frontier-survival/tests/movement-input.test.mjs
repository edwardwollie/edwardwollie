import assert from "node:assert/strict";
import test from "node:test";
import { screenForwardZ } from "../app/movement-input.ts";

test("W and Up move screen-forward", () => {
  assert.equal(screenForwardZ(true, false), 1);
});

test("S and Down move screen-backward", () => {
  assert.equal(screenForwardZ(false, true), -1);
});

test("mobile up and down match keyboard direction", () => {
  assert.equal(screenForwardZ(false, false, -1), 1);
  assert.equal(screenForwardZ(false, false, 1), -1);
});

test("opposing keyboard inputs cancel", () => {
  assert.equal(screenForwardZ(true, true), 0);
});

import { cameraRelative } from "../app/movement-input.ts";

const close = (a, b) => Math.abs(a - b) < 1e-9;

test("camera-relative forward follows the camera yaw", () => {
  const ahead = cameraRelative(0, 1, Math.PI / 2);
  assert.ok(close(ahead.x, 1) && close(ahead.z, 0));
});

test("camera-relative strafe is perpendicular to forward", () => {
  const right = cameraRelative(1, 0, 0);
  assert.ok(close(right.x, 1) && close(right.z, 0));
  const turned = cameraRelative(1, 0, Math.PI / 2);
  assert.ok(close(turned.x, 0) && close(turned.z, -1));
});

test("diagonal input is normalised and idle input stays idle", () => {
  const d = cameraRelative(1, 1, 0.3);
  assert.ok(close(Math.hypot(d.x, d.z), 1));
  assert.deepEqual(cameraRelative(0, 0, 1), { x: 0, z: 0 });
});
