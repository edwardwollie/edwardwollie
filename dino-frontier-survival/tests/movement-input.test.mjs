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
