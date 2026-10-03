import assert from "node:assert/strict";
import test from "node:test";

test("every blueprint has a unique id and drawing number, and all references resolve", async () => {
  const { BLUEPRINTS, getBlueprint } = await import("../src/v3/blueprints/registry.ts");
  assert.ok(BLUEPRINTS.length >= 40, "the blueprint library covers cast, vehicles, parts, spaceport and destinations");
  assert.equal(new Set(BLUEPRINTS.map((b) => b.id)).size, BLUEPRINTS.length);
  assert.equal(new Set(BLUEPRINTS.map((b) => b.code)).size, BLUEPRINTS.length);
  const categories = new Set(BLUEPRINTS.map((b) => b.category));
  for (const c of ["cast", "vehicle", "system", "spaceport", "destination"]) assert.ok(categories.has(c), c);
  const visit = (parts, bp) => {
    for (const p of parts) {
      if (p.ref) assert.ok(getBlueprint(p.ref), `${bp.id}: missing reference ${p.ref}`);
      if (p.children) visit(p.children, bp);
    }
  };
  for (const bp of BLUEPRINTS) {
    assert.match(bp.code, /^[A-Z]-\d\d$/, bp.id);
    assert.ok(bp.description.length > 40, `${bp.id} needs a kid-friendly description`);
    assert.ok(bp.overall.w > 0 && bp.overall.h > 0 && bp.overall.d > 0);
    visit(bp.parts, bp);
  }
});

test("3D models match their blueprint dimensions within 1.5 cm", async () => {
  const { BLUEPRINTS, getBlueprint } = await import("../src/v3/blueprints/registry.ts");
  const { buildBlueprint, measure } = await import("../src/v3/models/build.ts");
  for (const bp of BLUEPRINTS) {
    const model = buildBlueprint(bp, { resolve: getBlueprint, quality: "high" });
    const box = measure(model.root);
    const w = box.max.x - box.min.x, h = box.max.y - box.min.y, d = box.max.z - box.min.z;
    for (const [axis, real, declared] of [["w", w, bp.overall.w], ["h", h, bp.overall.h], ["d", d, bp.overall.d]]) {
      assert.ok(Math.abs(real - declared) <= 0.015, `${bp.code} ${bp.id} ${axis}: model ${real.toFixed(3)} m vs blueprint ${declared} m`);
    }
  }
});

test("orthographic views follow third-angle projection", async () => {
  const THREE = await import("three");
  const { VIEW_SETUP, projectedExtent, frameView } = await import("../src/v3/models/views.ts");
  const box = new THREE.Box3(new THREE.Vector3(-1, 0, -0.5), new THREE.Vector3(1, 3, 0.5));
  const ext = (v) => projectedExtent(box, v);
  const width = (v) => ext(v).maxX - ext(v).minX, height = (v) => ext(v).maxY - ext(v).minY;
  // Front/back show width × height; left/right show depth × height; top/bottom show width × depth.
  for (const v of ["front", "back"]) { assert.ok(Math.abs(width(v) - 2) < 1e-9); assert.ok(Math.abs(height(v) - 3) < 1e-9); }
  for (const v of ["left", "right"]) { assert.ok(Math.abs(width(v) - 1) < 1e-9); assert.ok(Math.abs(height(v) - 3) < 1e-9); }
  for (const v of ["top", "bottom"]) { assert.ok(Math.abs(width(v) - 2) < 1e-9); assert.ok(Math.abs(height(v) - 1) < 1e-9); }
  // The front of the object (+Z) faces the front view; the top view's lower edge is the front.
  assert.deepEqual(VIEW_SETUP.front.eye.toArray(), [0, 0, 1]);
  assert.deepEqual(VIEW_SETUP.top.up.toArray(), [0, 0, -1]);
  // In the RIGHT view the front of the object points left, toward the front view.
  assert.ok(ext("right").right.z < 0);
  const cam = frameView(box, "front", 1, 0).camera;
  assert.ok(cam.top > 0 && cam.right > 0);
});

test("the Comet rocket stacks its systems bottom-to-top and explodes in order", async () => {
  const { layoutRocket, COMET_CONFIG, cometRocket } = await import("../src/v3/blueprints/rocket.ts");
  const { items, height } = layoutRocket(COMET_CONFIG);
  assert.ok(Math.abs(height - 17.6) < 0.05, "stack height (the nose-tip ball adds 9 cm → 17.69 m overall)");
  assert.equal(items.filter((i) => i.system === "engine").length, 3);
  assert.equal(Math.min(...items.map((i) => i.y0)), 0, "the lowest point stands on the pad");
  const stack = cometRocket.parts.filter((p) => p.explode && p.explode[0] === 0 && p.explode[2] === 0 && p.explode[1] >= 0);
  const ordered = [...stack].sort((a, b) => a.at[1] - b.at[1]);
  for (let i = 1; i < ordered.length; i++) assert.ok(ordered[i].explode[1] >= ordered[i - 1].explode[1], "higher parts move further up");
});
