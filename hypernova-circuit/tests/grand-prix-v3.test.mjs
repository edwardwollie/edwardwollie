import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { loadGameModules } from "./sim-helper.mjs";

const m = await loadGameModules();
const { TRACKS, getTrack, TRACK_HALF_WIDTH, lapDelta } = m.track;
const { stepCar, aiInput, createCarState, resolveContacts, WALL_LIMIT } = m["race-physics"];
const { RIVALS, rivalStats, rivalSkill, driveStats, raceReward, recordRace, isTrackUnlocked, sanitizeGrandPrix } = m["grand-prix"];
const { CARS, sanitizeSave, createDefaultSave } = m.progression;
const { assetGeometries, blueprintBounds, BLUEPRINT_VERSION, thrusterAnchors } = m["blueprint-mesh"];
const spec = JSON.parse(fs.readFileSync(new URL("../app/game/blueprint-spec.json", import.meta.url)));
const manifest = JSON.parse(fs.readFileSync(new URL("../public/.well-known/flexzonic-game.json", import.meta.url)));
const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url)));

test("runtime meshes are built from the exact blueprint geometry", () => {
  assert.equal(BLUEPRINT_VERSION, pkg.version);
  for (const id of Object.keys(spec.assets)) {
    const box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    let triangles = 0;
    for (const geometry of assetGeometries(id).values()) {
      geometry.computeBoundingBox();
      const b = geometry.boundingBox;
      ["x", "y", "z"].forEach((k, i) => {
        box.min[i] = Math.min(box.min[i], b.min[k]);
        box.max[i] = Math.max(box.max[i], b.max[k]);
      });
      triangles += geometry.getIndex().count / 3;
      assert.ok(geometry.getAttribute("normal").array.every(Number.isFinite), `${id} normals`);
    }
    const expected = blueprintBounds(id);
    for (let i = 0; i < 3; i += 1) {
      assert.ok(Math.abs(box.min[i] - spec.assets[id].bounds.min[i]) < 0.002, `${id} min`);
      assert.ok(Math.abs(box.max[i] - expected.max.getComponent(i)) < 0.002, `${id} max`);
    }
    const specTriangles = spec.assets[id].parts.reduce((n, p) => n + p.indices.length / 3, 0);
    assert.equal(triangles, specTriangles, `${id} triangle count`);
  }
});

test("every car has a blueprint, six-view plate, GLB, paint matching the garage and thrusters", () => {
  const plates = fs.readdirSync(new URL("../blueprints/renders/", import.meta.url));
  for (const car of CARS) {
    const asset = spec.assets[car.id];
    assert.equal(asset.kind, "car");
    assert.equal(asset.materials.paint.color, car.cssPrimary);
    assert.equal(asset.materials.glow.color, car.cssSecondary);
    assert.ok(thrusterAnchors(car.id).length >= 2);
    const size = asset.bounds.max.map((v, i) => v - asset.bounds.min[i]);
    assert.ok(size[2] > 4.5 && size[2] < 6 && size[0] < 3.4 && size[1] < 2, `${car.id} is car-sized`);
    assert.ok(asset.bounds.max[2] > 0 && asset.bounds.min[1] > 0.05, `${car.id} faces +Z and hovers`);
  }
  assert.equal(plates.filter((f) => /^0\d-.*\.png$/.test(f)).length, 9);
  const models = fs.readdirSync(new URL("../blueprints/models/", import.meta.url));
  assert.equal(models.filter((f) => f.endsWith(`-v${pkg.version}.glb`)).length, Object.keys(spec.assets).length);
  for (const f of models) {
    const head = fs.readFileSync(new URL(`../blueprints/models/${f}`, import.meta.url)).subarray(0, 4).toString();
    assert.equal(head, "glTF");
  }
});

test("six closed, banked circuits with a real bridge and features on the road", () => {
  assert.equal(TRACKS.length, 6);
  for (let i = 0; i < TRACKS.length; i += 1) {
    const track = getTrack(i);
    const first = track.positions[0];
    const last = track.positions[track.count - 1];
    assert.ok(Math.abs(first.distanceTo(last) - track.step) < 0.6, `${track.spec.id} closes`);
    assert.ok(track.length > 2200 && track.length < 3800);
    assert.ok(track.spec.minRadius >= 40);
    assert.equal(track.spec.checkpoints.length, 4);
    for (let k = 0; k < track.count; k += 7) {
      const f = track.frameAt(k * track.step);
      assert.ok(Math.abs(f.tangent.dot(f.up)) < 0.02 && Math.abs(f.right.dot(f.up)) < 0.02);
      assert.ok(f.up.y > 0.9, "road never tips over");
    }
    for (const item of [...track.spec.boostPads, ...track.spec.items, ...track.spec.hazards, ...track.spec.coinLines]) {
      assert.ok(Math.abs(item.d) < TRACK_HALF_WIDTH - 1, `${track.spec.id} feature on road`);
    }
    assert.ok(track.spec.boostPads.length >= 1 && track.spec.items.length >= 3);
  }
  const voidTrack = getTrack(3);
  assert.ok(voidTrack.bounds.maxY - voidTrack.bounds.minY >= 11.5, "Void Bridge rises 12 m");
  assert.ok(getTrack(1).spec.climb >= 35, "Solar Rift climbs to the crest");
});

test("the full AI field finishes three clean laps on every circuit", () => {
  for (let t = 0; t < TRACKS.length; t += 1) {
    const track = getTrack(t);
    const field = RIVALS.map((r, k) => {
      const stats = rivalStats(r, t);
      const s = track.length - 10 - Math.floor(k / 2) * 9;
      return {
        stats, walls: 0, finish: 0,
        st: createCarState(s, k % 2 ? 4.2 : -4.2, s - track.length),
        ai: { skill: rivalSkill(r, t), aggression: r.aggression, lineBias: ((k % 3) - 1) * 0.8, lane: 0,
          profile: track.buildSpeedProfile(stats.grip * 0.92, stats.topSpeed, stats.braking * 0.8) },
      };
    });
    const dt = 1 / 120;
    let time = 0;
    while (time < 300 && field.some((c) => !c.finish)) {
      time += dt;
      const obstacles = field.map((c) => ({ s: c.st.s, d: c.st.d, v: c.st.v }));
      for (const c of field) {
        const input = aiInput(c.st, c.ai, track, c.stats, obstacles.filter((o) => o.s !== c.st.s), 1);
        const report = stepCar(c.st, input, c.stats, track, dt);
        if (report.wallImpact > 6) c.walls += 1;
        assert.ok(Number.isFinite(c.st.s + c.st.d + c.st.v + c.st.psi));
        assert.ok(Math.abs(c.st.d) <= WALL_LIMIT + 1e-6);
        if (!c.finish && c.st.total >= track.spec.laps * track.length) c.finish = time;
      }
      resolveContacts(field.map((c) => c.st), track.length);
    }
    const laps = field.map((c) => c.finish / track.spec.laps);
    assert.ok(field.every((c) => c.finish > 0), `${track.spec.id}: everyone finishes`);
    assert.ok(Math.max(...laps) < 55 && Math.min(...laps) > 25, `${track.spec.id}: lap times ${laps.map((l) => l.toFixed(1))}`);
    assert.ok(field.reduce((n, c) => n + c.walls, 0) <= 2, `${track.spec.id}: AI keeps off the walls`);
  }
});

test("driving model: brake-tap drifts, barriers contain, contacts separate", () => {
  const track = getTrack(0);
  const stats = driveStats(CARS[0], { engine: 0, handling: 0, shield: 0, magnet: 0 });
  const car = createCarState(100, 0, 100);
  car.v = 60;
  for (let i = 0; i < 60; i += 1) stepCar(car, { steer: 1, throttle: 1, brake: 0, boost: false }, stats, track, 1 / 120);
  assert.equal(car.drifting, false, "full lock alone keeps traction");
  stepCar(car, { steer: 1, throttle: 1, brake: 1, boost: false }, stats, track, 1 / 120);
  assert.equal(car.drifting, true, "tap the brake to drift");
  let ended = 0;
  for (let i = 0; i < 400 && !ended; i += 1) ended = stepCar(car, { steer: 0, throttle: 1, brake: 0, boost: false }, stats, track, 1 / 120).driftEnded;
  assert.ok(ended > 0, "releasing the wheel banks the drift");

  const wall = createCarState(300, 7, 300);
  wall.v = 70;
  wall.psi = wall.slip = 0.5;
  let impact = 0;
  for (let i = 0; i < 30; i += 1) impact = Math.max(impact, stepCar(wall, { steer: 0, throttle: 1, brake: 0, boost: false }, stats, track, 1 / 120).wallImpact);
  assert.ok(impact > 6 && wall.v < 70 && Math.abs(wall.d) <= WALL_LIMIT);

  const a = createCarState(500, 0, 500);
  const b = createCarState(504, 0.5, 504);
  a.v = 70;
  b.v = 50;
  assert.equal(resolveContacts([a, b], track.length).length, 1);
  assert.ok(Math.abs(lapDelta(a.s, b.s, track.length)) >= 4.6 - 1e-6 || Math.abs(b.d - a.d) >= 2.3 - 1e-6);
  assert.ok(a.v < 70);
});

test("v2 saves load unchanged; Grand Prix records, unlocks and prizes", () => {
  const legacy = { version: 1, coins: 777, selectedCar: "vortex", ownedCars: ["pulse", "vortex"], upgrades: { engine: 3, handling: 1, shield: 0, magnet: 2 }, bestDistance: 9000, highestSector: 4, totalCoins: 5000, totalRuns: 12, dailyClaimDate: "2026-10-01" };
  const save = sanitizeSave(legacy);
  assert.equal(save.coins, 777);
  assert.equal(save.selectedCar, "vortex");
  assert.deepEqual(save.grandPrix, {});
  assert.equal(save.graphics, "auto");
  assert.ok(isTrackUnlocked(save, 0) && isTrackUnlocked(save, 1) && !isTrackUnlocked(save, 2));
  let gp = recordRace(save.grandPrix, TRACKS[1].id, 5, 38.2, 120);
  assert.ok(!isTrackUnlocked({ ...save, grandPrix: gp }, 2));
  gp = recordRace(gp, TRACKS[1].id, 3, 36.9, 118);
  assert.ok(isTrackUnlocked({ ...save, grandPrix: gp }, 2));
  assert.deepEqual(gp[TRACKS[1].id], { bestPosition: 3, bestLap: 36.9, bestRace: 118, wins: 0 });
  assert.deepEqual(sanitizeGrandPrix({ bogus: 1, [TRACKS[0].id]: { bestPosition: -4, bestLap: "x" } })[TRACKS[0].id].bestPosition, 8);
  assert.ok(raceReward(1, 0) > raceReward(2, 0) && raceReward(8, 0) > 0 && raceReward(1, 5) > raceReward(1, 0));
  assert.deepEqual(createDefaultSave().grandPrix, {});
});

test("portal metadata advertises the 3.0 Grand Prix", () => {
  assert.equal(manifest.version, pkg.version);
  assert.equal(pkg.version, "3.0.0");
  for (const feature of ["Full 3D Grand Prix", "Six 3D circuits", "AI rivals", "Ghost laps"]) {
    assert.ok(manifest.features.includes(feature), feature);
  }
});
