import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the 3D edition reads and writes the SAME save as v2.1 without losing anything", async () => {
  const { SAVE_KEY, loadSave, writeSave, normalizeSave } = await import("../src/v3/state/save.ts");
  assert.equal(SAVE_KEY, "spaceflight-academy-save-v1");
  // A real v2.1 save (no v3 data) keeps every field.
  const v21 = { age: "8–10", progress: { "5–7": 4, "8–10": 12, "11–12": 1 }, stars: { "8–10-1": 3, "8–10-2": 2 }, xp: 4210, badges: ["Launch Deck Ace"], starCores: 33, bestCombo: 6, familyWins: 2, sound: false, ship: "Comet", futureField: { keep: true } };
  const memory = new Map([[SAVE_KEY, JSON.stringify(v21)]]);
  const storage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };
  const save = loadSave(storage);
  assert.equal(save.age, "8–10");
  assert.deepEqual(save.progress, v21.progress);
  assert.deepEqual(save.stars, v21.stars);
  assert.equal(save.xp, 4210);
  assert.equal(save.sound, false);
  assert.deepEqual(save.futureField, { keep: true }, "unknown keys survive (Classic and 3D share the save)");
  assert.equal(save.v3.version, 3);
  assert.equal(save.v3.cadet, "omari");
  writeSave(save, storage);
  const written = JSON.parse(memory.get(SAVE_KEY));
  assert.deepEqual(written.progress, v21.progress);
  assert.ok(written.v3);
  // Malformed data is repaired.
  const repaired = normalizeSave({ age: "99", progress: { "5–7": 400 }, xp: -5, v3: { cadet: "nobody", journal: "x", observatory: ["mars", 7] } });
  assert.equal(repaired.age, null);
  assert.equal(repaired.progress["5–7"], 30);
  assert.equal(repaired.xp, 0);
  assert.equal(repaired.v3.cadet, "omari");
  assert.deepEqual(repaired.v3.journal, []);
  assert.deepEqual(repaired.v3.observatory, ["mars"]);
});

test("the Classic edition keeps the v3 data when it saves", async () => {
  const classic = await readFile(new URL("../src/SpaceflightAcademyV2.tsx", import.meta.url), "utf8");
  // Classic spreads the raw saved object, so the nested v3 object is preserved on write.
  assert.match(classic, /\{ \.\.\.DEFAULT_SAVE, \.\.\.raw,/);
  assert.match(classic, /spaceflight-academy-save-v1|SAVE_KEY/);
});

test("Star Journal covers all 216 questions and achievements are well formed", async () => {
  const { createSpaceRushDeck } = await import("../src/space-rush-data.ts");
  const ids = ["5–7", "8–10", "11–12"].flatMap((age) => createSpaceRushDeck(age).map((q) => q.id));
  assert.equal(new Set(ids).size, 216);
  const { ACHIEVEMENTS, checkAchievements } = await import("../src/v3/data/achievements.ts");
  const { defaultSave } = await import("../src/v3/state/save.ts");
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length);
  const fresh = defaultSave();
  assert.deepEqual(checkAchievements(fresh, fresh), []);
  const explorer = { ...fresh, v3: { ...fresh.v3, observatory: Array.from({ length: 11 }, (_, i) => String(i)), jumps: ["moon", "mars", "pluto", "earth", "venus"] } };
  const got = checkAchievements(explorer, fresh);
  assert.ok(got.includes("star-gazer"));
  assert.ok(got.includes("gravity-jumper"));
});

test("Observatory data: real planet facts, today's positions and gravity jumps", async () => {
  const { BODIES, BODY_BY_ID, heliocentric, daysSinceJ2000, jumpOn, ageOn } = await import("../src/v3/data/solar.ts");
  assert.equal(BODIES.length, 11);
  const order = BODIES.filter((b) => b.orbit).map((b) => b.orbit.a);
  assert.deepEqual(order, [...order].sort((a, b) => a - b), "planets are listed from the Sun outward");
  assert.equal(BODY_BY_ID.earth.gravity, 1);
  assert.ok(BODY_BY_ID.jupiter.diameterKm > BODY_BY_ID.saturn.diameterKm);
  assert.ok(BODY_BY_ID.saturn.moons > BODY_BY_ID.jupiter.moons);
  assert.ok(BODY_BY_ID.pluto.diameterKm < BODY_BY_ID.moon.diameterKm);
  // Known geometry checks (approximate elements are good to about a degree).
  const lon = (id, date) => { const p = heliocentric(BODY_BY_ID[id].orbit, daysSinceJ2000(new Date(date))); return ((Math.atan2(p.y, p.x) * 180) / Math.PI + 360) % 360; };
  const sep = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  assert.ok(sep(lon("earth", "2026-01-10T00:00:00Z"), lon("jupiter", "2026-01-10T00:00:00Z")) < 3, "Jupiter opposition, 10 Jan 2026");
  assert.ok(sep(lon("earth", "2026-10-04T00:00:00Z"), lon("saturn", "2026-10-04T00:00:00Z")) < 3, "Saturn opposition, 4 Oct 2026");
  const r = (id) => { const p = heliocentric(BODY_BY_ID[id].orbit, 9000); return Math.hypot(p.x, p.y, p.z); };
  assert.ok(Math.abs(r("earth") - 1) < 0.02);
  // Same push, different gravity: the Moon jump is about six times higher than on Earth.
  const earth = jumpOn(1), moon = jumpOn(BODY_BY_ID.moon.gravity);
  assert.ok(Math.abs(earth.height - 0.5) < 1e-9);
  assert.ok(moon.height / earth.height > 5.5 && moon.height / earth.height < 6.5);
  assert.ok(Math.abs(ageOn(BODY_BY_ID.mercury, 9) - 37.4) < 0.2);
});
