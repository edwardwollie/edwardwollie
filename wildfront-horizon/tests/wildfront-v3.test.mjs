// Wildfront Horizon 3D — unit tests (run: node --experimental-strip-types --test tests/wildfront-v3.test.mjs)
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { MISSIONS, licensedFor, GRAND_SLAM_SPECIES, FIELD_NOTES } from "../app/game3d/data/missions.ts";
import { MISSIONS as CLASSIC_MISSIONS, UPGRADE_INFO as CLASSIC_UPGRADES } from "../app/classic/game-data.ts";
import { migrate, claimContract, upgradeCost, FRESH_V2, SAVE_KEY, ACHIEVEMENTS, reserveUnlocked } from "../app/game3d/data/save.ts";
import { UPGRADE_INFO, STORE } from "../app/game3d/data/store.ts";
import { gradeHit, shotPoints, starsFor, accuracyOf, UNLICENSED_PENALTY, ratingFor, harvestCredits } from "../app/game3d/hunt/scoring.ts";
import { trajectoryTable } from "../app/game3d/hunt/ballistics.ts";
import { RIFLES } from "../app/game3d/blueprints/gear.ts";
import { scentStrength, hearingStrength, sightStrength } from "../app/game3d/hunt/senses.ts";
import { WILDLIFE } from "../app/game3d/blueprints/wildlife/index.ts";
import { RESERVES, reserveByName } from "../app/game3d/blueprints/reserves.ts";
import { generateTerrain, heightAt, waterLevelAt } from "../app/game3d/world/terrain-gen.ts";
import { OVERALL } from "../app/game3d/blueprints/overall.ts";
import { measureAll } from "../tools/dev/measure.ts";
import { checkAchievements, STUDIO_IDS } from "../app/game3d/data/achievements.ts";
import { STRUCTURES } from "../app/game3d/blueprints/structures.ts";
import { GEAR } from "../app/game3d/blueprints/gear.ts";
import { localizeMessage, fmtDist } from "../app/game3d/ui/format.ts";
import * as THREE from "three";
import { buildAssembly } from "../app/game3d/models/assembly-builder.ts";
import { perchEyeY, specRows } from "../app/game3d/blueprints/assembly.ts";
import { segCircle, outside } from "../app/game3d/world/colliders.ts";
import { EYE } from "../app/game3d/hunt/player.ts";
import { VERSION } from "../app/game3d/version.ts";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");

test("keeps the twelve v2.0.3 contracts exactly", () => {
  assert.equal(MISSIONS.length, 12);
  for (const [i, m] of MISSIONS.entries()) {
    const c = CLASSIC_MISSIONS[i];
    for (const k of ["id", "name", "reserve", "species", "count", "reward", "time", "weather", "difficulty", "brief"]) assert.equal(m[k], c[k], `contract ${m.id} ${k}`);
    assert.ok(FIELD_NOTES[m.id]?.length >= 2, `field notes for ${m.id}`);
  }
  assert.deepEqual(licensedFor(MISSIONS[11]), GRAND_SLAM_SPECIES);
  assert.deepEqual(licensedFor(MISSIONS[0]), ["Mule Deer"]);
});

test("Field Kit upgrades keep the v2 names and 120 × (level + 1) pricing", () => {
  for (const k of ["optics", "stability", "tracking"]) assert.equal(UPGRADE_INFO[k].label, CLASSIC_UPGRADES[k].label);
  assert.deepEqual([0, 1, 2].map(upgradeCost), [120, 240, 360]);
  assert.ok(STORE.some(s => s.id === "ridgeline-308" && s.price === 0), "starter rifle is free");
});

test("v2.0.3 shot grades and points are unchanged", () => {
  assert.equal(gradeHit({ zone: "head", organs: ["brain"], inVitalRegion: false }).grade, "perfect");
  assert.equal(gradeHit({ zone: "head", organs: [], inVitalRegion: false }).grade, "perfect");
  assert.equal(gradeHit({ zone: "torso", organs: ["heart"], inVitalRegion: false }).grade, "great");
  assert.equal(gradeHit({ zone: "torso", organs: ["lungs"], inVitalRegion: false }).grade, "great");
  assert.equal(gradeHit({ zone: "torso", organs: [], inVitalRegion: true }).grade, "great");
  assert.equal(gradeHit({ zone: "torso", organs: ["liver"], inVitalRegion: false }).grade, "good");
  assert.equal(gradeHit({ zone: "torso", organs: ["stomach"], inVitalRegion: false }).wound, "gut");
  assert.equal(gradeHit({ zone: "leg", organs: [], inVitalRegion: false }).grade, "good");
  assert.equal(gradeHit({ zone: "antler", organs: [], inVitalRegion: false }).grade, "graze");
  assert.equal(shotPoints("perfect", 80, true), 340 + 50 + 25);
  assert.equal(shotPoints("great", 200, false), 260);
  assert.equal(shotPoints("good", 30, false), Math.round(75 + 40 * 0.35));
  assert.equal(shotPoints("miss", 10, false), -5);
  assert.deepEqual([80, 79, 50, 49].map(starsFor), [3, 2, 2, 1]);
  assert.equal(accuracyOf(3, 4), 75);
  assert.equal(accuracyOf(0, 0), 0);
  assert.equal(UNLICENSED_PENALTY, 150);
});

test("trophy ratings and free-hunt credits", () => {
  const tiers = { bronze: 100, silver: 120, gold: 140, diamond: 160 };
  assert.deepEqual([90, 100, 125, 150, 170].map(s => ratingFor(s, tiers)), ["none", "bronze", "silver", "gold", "diamond"]);
  assert.ok(harvestCredits("diamond", "perfect") > harvestCredits("gold", "great"));
  assert.ok(harvestCredits("bronze", "good") < harvestCredits("bronze", "great"));
});

test("saves stay on the v2 key and migrate v2 progress", () => {
  assert.equal(SAVE_KEY, "wildfront-save-v1");
  const v2 = { unlocked: 5, credits: 999, stars: { 1: 3, 2: 2 }, upgrades: { optics: 2, stability: 1, tracking: 3 }, tutorial: true };
  const s = migrate(v2);
  assert.equal(s.unlocked, 5); assert.equal(s.credits, 999); assert.deepEqual(s.stars, { 1: 3, 2: 2 });
  assert.deepEqual(s.upgrades, { optics: 2, stability: 1, tracking: 3 }); assert.equal(s.tutorial, true);
  assert.equal(s.v3.version, 3); assert.ok(s.v3.owned.includes("ridgeline-308"));
  const bad = migrate({ unlocked: 99, credits: -5, upgrades: { optics: 9 } });
  assert.equal(bad.unlocked, 12); assert.equal(bad.credits, 0); assert.equal(bad.upgrades.optics, 3);
  const fresh = migrate(null);
  assert.deepEqual({ unlocked: fresh.unlocked, credits: fresh.credits, tutorial: fresh.tutorial }, { unlocked: FRESH_V2.unlocked, credits: FRESH_V2.credits, tutorial: false });
  // classic keeps unknown keys, so v3 data survives a round trip through the classic edition's spread
  const roundTrip = migrate({ ...JSON.parse(JSON.stringify(s)), credits: 1000 });
  assert.equal(roundTrip.v3.owned.length, s.v3.owned.length);
  const c = claimContract(s, 5, 2);
  assert.equal(c.credits, 999 + 285); assert.equal(c.unlocked, 6); assert.equal(c.stars[5], 2);
  const c2 = claimContract(c, 5, 1);
  assert.equal(c2.stars[5], 2, "best stars kept");
});

test("free-hunt reserves unlock with contract stars", () => {
  const s = migrate(null);
  assert.ok(reserveUnlocked(s, "Aurora Pines"));
  assert.ok(!reserveUnlocked(s, "Crimson Highlands"));
  assert.ok(reserveUnlocked({ ...s, stars: { 3: 1 } }, "Crimson Highlands"));
  assert.ok(reserveUnlocked({ ...s, stars: { 12: 1 } }, "Horizon Crossing"));
});

test("real ballistics: .308 drop, drift and energy", () => {
  const r308 = RIFLES.find(r => r.id === "ridgeline-308");
  const t = Object.fromEntries(trajectoryTable(r308.ballistics, [0, 100, 200, 300, 400]).map(x => [x.range, x]));
  assert.ok(Math.abs(t[100].dropCm) < 1, "zeroed at 100 m");
  assert.ok(t[200].dropCm > 9 && t[200].dropCm < 15, `200 m drop ${t[200].dropCm}`);
  assert.ok(t[300].dropCm > 36 && t[300].dropCm < 50, `300 m drop ${t[300].dropCm}`);
  assert.ok(t[400].dropCm > 85 && t[400].dropCm < 110, `400 m drop ${t[400].dropCm}`);
  assert.ok(t[300].driftCm > 15 && t[300].driftCm < 30, `300 m drift ${t[300].driftCm}`);
  assert.ok(Math.abs(t[0].energyJ - 0.5 * r308.ballistics.massKg * r308.ballistics.mv ** 2) < 1);
  assert.ok(t[400].velocity < t[200].velocity && t[200].velocity < r308.ballistics.mv);
  const r270 = RIFLES.find(r => r.id === "summit-270");
  assert.ok(trajectoryTable(r270.ballistics, [400])[0].dropCm < t[400].dropCm, ".270 shoots flatter");
});

test("senses: scent travels downwind, hearing and sight fade with distance", () => {
  const base = { hx: 0, hz: 0, smell: 220, blocker: 0, windX: 0, windZ: -4 };   // wind blows toward −Z (north)
  const down = scentStrength({ ...base, ax: 0, az: -80 });
  const up = scentStrength({ ...base, ax: 0, az: 80 });
  assert.ok(down > 0.15, `downwind ${down}`);
  assert.equal(up, 0, "no scent upwind");
  assert.ok(scentStrength({ ...base, ax: 0, az: -80, blocker: 0.6 }) < down, "scent blocker works");
  assert.ok(hearingStrength(30, 1, 10) > hearingStrength(30, 1, 25));
  assert.ok(sightStrength(175, 0.8, 50, 0, false) > sightStrength(175, 0.8, 150, 0, false));
});

test("every blueprint conforms to its measured reference build (±15 mm)", () => {
  const rows = measureAll();
  assert.equal(rows.length, WILDLIFE.length + GEAR.length + STRUCTURES.length + 15);
  for (const r of rows) {
    const o = OVERALL[r.id];
    assert.ok(o, `${r.id} in overall table`);
    for (const k of ["length", "width", "height"]) assert.ok(Math.abs(o[k] - r[k]) <= 0.015, `${r.id} ${k}: table ${o[k]} vs built ${r[k].toFixed(3)} — run tools/dev/sync-overall.mjs --write`);
  }
  for (const bp of WILDLIFE) assert.deepEqual(bp.overall, OVERALL[bp.id]);
});

test("species blueprints are complete and plausible", () => {
  assert.deepEqual(WILDLIFE.map(w => w.species), ["Mule Deer", "Red Deer", "Elk", "Wild Boar", "Bighorn Sheep", "Bison"]);
  for (const w of WILDLIFE) {
    const ids = w.organs.map(o => o.id);
    for (const id of ["brain", "heart", "lungs", "liver", "stomach"]) assert.ok(ids.includes(id), `${w.id} ${id}`);
    const T = w.trophy.tiers;
    assert.ok(T.bronze < T.silver && T.silver < T.gold && T.gold < T.diamond, `${w.id} tiers`);
    assert.ok(w.gait.walk.speed < w.gait.trot.speed && w.gait.trot.speed < w.gait.gallop.speed, `${w.id} gaits`);
    assert.ok(w.femaleScale > 0.5 && w.femaleScale <= 1, `${w.id} female scale`);
    for (const k of ["latin", "family", "range", "habitat", "diet", "shoulder", "weight", "senses"]) assert.ok(w.facts[k]?.length > 3, `${w.id} facts.${k}`);
    assert.ok(w.bones.some(b => b.name === w.vitalRegion.bone), `${w.id} vital region bone`);
  }
});

test("reserves generate deterministically with a dry trailhead inside the boundary", () => {
  for (const def of Object.values(RESERVES)) {
    const a = generateTerrain(def, 129), b = generateTerrain(def, 129);
    let sa = 0, sb = 0; for (let i = 0; i < a.h.length; i += 7) { sa += a.h[i]; sb += b.h[i]; }
    assert.equal(sa, sb, `${def.name} deterministic`);
    const t = generateTerrain(def, 257);
    const wl = waterLevelAt(t, def.spawn.x, def.spawn.z);
    assert.ok(wl === null || heightAt(t, def.spawn.x, def.spawn.z) > wl, `${def.name} trailhead is dry`);
    assert.ok(Math.abs(def.spawn.x) < def.size / 2 - 50 && Math.abs(def.spawn.z) < def.size / 2 - 50, `${def.name} trailhead inside boundary`);
    for (const s of def.fauna) assert.ok(WILDLIFE.some(w => w.species === s), `${def.name} fauna ${s}`);
  }
  assert.equal(reserveByName("All Reserves").id, "horizon-crossing");
  for (const m of MISSIONS) for (const s of licensedFor(m)) assert.ok(reserveByName(m.reserve).fauna.includes(s), `contract ${m.id}: ${s} lives in ${m.reserve}`);
});

test("achievements", () => {
  assert.equal(ACHIEVEMENTS.length, 16);
  assert.equal(new Set(ACHIEVEMENTS.map(a => a.id)).size, 16);
  const s = migrate(null);
  const trophy = { id: "t", species: "Elk", label: "Elk Bull", sex: "male", score: 380, weight: 320, rating: "diamond", grade: "great", organ: "lungs", distance: 180, reserve: "Aurora Pines", date: 0, seed: 1, age: 1, oneShot: true, credits: 0, recovered: false };
  const got = checkAchievements(s, { kind: "tag", t: trophy, free: true, calls: 0 });
  for (const id of ["first-harvest", "one-shot", "diamond", "free-roam"]) assert.ok(got.includes(id), id);
  assert.ok(STUDIO_IDS.length === WILDLIFE.length + GEAR.length + STRUCTURES.length);
  assert.ok(checkAchievements({ ...s, v3: { ...s.v3, studioSeen: STUDIO_IDS } }, { kind: "studio" }).includes("blueprints"));
});

test("climbable structures: the hunter sees out of every tower, stand and blind", () => {
  const perched = STRUCTURES.filter(s => s.perch);
  assert.deepEqual(perched.map(s => s.id), ["lookout-tower", "tree-stand", "ground-blind"]);
  const prim = (bp, id) => bp.prims.find(p => p.id === id);
  const ray = new THREE.Raycaster();
  for (const bp of perched) {
    const ps = bp.perch;
    const eyeY = ps.floor + (ps.eye ?? EYE.stand);
    // nothing opaque within 3 m of the eye: 8 headings between the corner posts, level and 0.12 rad down
    const built = buildAssembly(bp, {});
    built.root.updateMatrixWorld(true);
    const eye = new THREE.Vector3(ps.at[0], eyeY, ps.at[1]);
    for (let k = 0; k < 16; k++) {
      const a = ((k >> 1) + 0.5) * Math.PI / 4, pitch = k & 1 ? -0.12 : 0;
      ray.set(eye, new THREE.Vector3(-Math.sin(a) * Math.cos(pitch), Math.sin(pitch), -Math.cos(a) * Math.cos(pitch))); ray.far = 3;
      const hits = ray.intersectObject(built.root, true).filter(i => !i.object.material.transparent);
      assert.equal(hits.length, 0, `${bp.id}: view blocked at heading ${Math.round(a * 180 / Math.PI)}°, pitch ${pitch} by ${hits[0]?.object.name}`);
    }
    built.root.traverse(o => o.geometry?.dispose());
    assert.ok(Math.hypot(ps.exit[0], ps.exit[1]) > 1.5, `${bp.id}: steps off clear of the structure`);
  }
  // lookout: see-through glazing, standing eye inside the window band
  const tower = STRUCTURES.find(s => s.id === "lookout-tower");
  assert.ok(tower.materials.glass.opacity < 0.5, "cab glazing is see-through");
  const band = prim(tower, "glass0"), towerEye = tower.perch.floor + EYE.stand;
  assert.ok(towerEye > band.p[1] - band.size[1] / 2 + 0.3 && towerEye < band.p[1] + band.size[1] / 2 - 0.1, `tower eye ${towerEye} in window band`);
  assert.equal(tower.perch.eye, null, "stand up in the cab");
  // tripod stand: seated eye clears the shooting rail
  const stand = STRUCTURES.find(s => s.id === "tree-stand"), rail = prim(stand, "rail");
  assert.ok(stand.perch.floor + stand.perch.eye > rail.p[1] + rail.tor[1] + 0.3, "eye above the rail");
  // ground blind: seated eye inside the window opening on all four sides
  const blind = STRUCTURES.find(s => s.id === "ground-blind"), blindEye = blind.perch.floor + blind.perch.eye;
  for (let i = 0; i < 4; i++) {
    const low = prim(blind, `low${i}`), up = prim(blind, `up${i}`);
    const sill = low.p[1] + low.size[1] / 2, head = up.p[1] - up.size[1] / 2;
    assert.ok(blindEye > sill + 0.15 && blindEye < head - 0.1, `blind side ${i}: eye ${blindEye} between sill ${sill} and head ${head}`);
  }
  // the Studio and the sheets state the eye height from the same perch
  assert.equal(perchEyeY(tower.perch), towerEye);
  assert.deepEqual(specRows(blind).at(-1), { label: "Hunter's eye", value: "1.22 m (seated, 1.20 m above the floor)" });
  assert.deepEqual(specRows(tower).at(-1), { label: "Hunter's eye", value: "10.93 m (standing, 1.68 m above the floor)" });
  // scent: aloft, much less of it reaches the game
  assert.ok(tower.perch.scent < stand.perch.scent && stand.perch.scent < blind.perch.scent && blind.perch.scent < 1);
});

test("a shot from inside a ground blind leaves it; other cover still stops it", () => {
  const blind = { x: 0, z: 0, r: 1.15, y0: -1, h: 3.1, kind: "structure", id: 1 };
  // from the stool (0, 0.15) out of the front window toward an elk 120 m away
  assert.equal(segCircle(0, 0.15, 0, 120, blind.x, blind.z, blind.r), 0, "starting inside counts as blocked by default");
  assert.equal(outside(blind, 0, 0.15), false, "so the hunt filters out the blind the shot starts in");
  assert.equal(outside(blind, 0, -1.8), true);
  // a tree further down range still stops the bullet
  const t = segCircle(0, 0.15, 0, 120, 0, 40, 0.4);
  assert.ok(t !== null && Math.abs(t * 119.85 - (40 - 0.15 - 0.4)) < 1e-6, `tree hit at ${t}`);
  assert.equal(segCircle(0, 0.15, 0, 120, 3, 40, 0.4), null, "a tree off the line does not");
});

test("imperial units rewrite engine messages", () => {
  assert.equal(localizeMessage("GREAT SHOT · VITAL ELK · 130m · +260", "imperial"), "GREAT SHOT · VITAL ELK · 142 yd · +260");
  assert.equal(localizeMessage("WIND 4.0 m/s", "imperial"), "WIND 4.0 m/s");
  assert.equal(fmtDist(100, "metric"), "100 m");
});

test("deployment metadata, health check and editions", () => {
  const v = JSON.parse(read("../public/version.json"));
  assert.deepEqual({ version: v.version, port: v.port, health: v.health }, { version: "3.0.2", port: 8096, health: "wildfront-ok" });
  const m = JSON.parse(read("../public/.well-known/flexzonic-game.json"));
  assert.equal(m.url, "https://hunt.flexzonicgames.com"); assert.equal(m.version, "3.0.2"); assert.equal(m.healthPath, "/healthz"); assert.equal(m.category, "Adventure"); assert.equal(m.order, 40);
  assert.match(read("../app/healthz/route.ts"), /wildfront-ok/);
  assert.equal(JSON.parse(read("../package.json")).version, "3.0.2");
  assert.equal(VERSION, "3.0.2", "Settings and the blueprint book show the same release");
  assert.match(read("../app/classic/page.tsx"), /WildfrontGame/);
  assert.match(read("../app/classic/WildfrontGame.tsx"), /PLAY 3D EDITION/);
  const entry = read("../app/game3d/ui/Wildfront3D.tsx");
  assert.match(entry, /webgl2/); assert.match(entry, /\/classic/);
  assert.match(read("../deploy.sh"), /8096/);
  // classic styles are scoped so they never leak into the 3D edition (one CSS bundle ships both)
  const css = read("../app/classic/classic.css");
  const unscoped = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "").split("}").map(r => r.split("{")[0].trim()).filter(Boolean).filter(sel => !sel.startsWith("@") && sel.split(",").some(x => !x.trim().startsWith(".wf-classic") && !/^(from|to|\d+%)$/.test(x.trim())));
  assert.deepEqual(unscoped, []);
});
