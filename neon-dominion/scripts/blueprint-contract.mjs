// Blueprint contract: the published blueprints, the GLBs and the game must describe the same units.
import assert from "node:assert/strict";
import { readFile, access, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { MODELS, MODEL_GROUPS, GUARDIAN_VARIANTS, guardianVariant } from "../app/blueprints/models.js";
import { buildModel, measure } from "../app/blueprints/kit.js";
import { poseFor, POSE_SHEET } from "../app/blueprints/rigs.js";

const root = resolve(import.meta.dirname, "..");
const version = JSON.parse(await readFile(resolve(root, "version.json"), "utf8")).version;
const published = JSON.parse(await readFile(resolve(root, "blueprints/dimensions.json"), "utf8"));
const plates = JSON.parse(await readFile(resolve(root, "assets/blueprints/plates/index.json"), "utf8"));
const game = await readFile(resolve(root, "app/game.js"), "utf8");

let checks = 0;
const units = new Set(MODEL_GROUPS.slice(0, 2).flatMap((group) => group.ids));

for (const [id, spec] of Object.entries(MODELS)) {
  const model = buildModel(spec);
  const dims = measure(model);
  const sheet = published[id];
  assert.ok(sheet, `${id}: missing from blueprints/dimensions.json (run npm run blueprints)`);
  for (const key of ["width", "height", "length", "triangles", "parts"]) {
    assert.ok(Math.abs(dims[key] - sheet[key]) <= (key === "triangles" || key === "parts" ? 0 : 0.002), `${id}: ${key} ${dims[key]} differs from published blueprint ${sheet[key]} (re-run npm run blueprints)`);
  }
  checks += 1;

  // Collision footprint printed on the plate must match the simulation radius.
  if (units.has(id)) {
    const footprint = Math.max(dims.width, dims.length) / 2;
    const radius = spec.simRadius / 25;
    assert.ok(footprint / radius > 0.45 && footprint / radius < 1.9, `${id}: footprint ${footprint.toFixed(2)} m does not fit hit radius ${radius.toFixed(2)} m`);
    checks += 1;
  }

  // Triangle budgets keep mobile GPUs comfortable with instancing.
  const budget = id === "commander" ? 24000 : id === "guardian" || id === "riftgate" ? 16000 : 13000;
  assert.ok(dims.triangles <= budget, `${id}: ${dims.triangles} triangles exceeds budget ${budget}`);
  assert.ok(dims.minY > -0.3, `${id}: geometry sinks ${dims.minY} m below its base`);

  // Every joint a rig animates must exist on the model.
  for (const entry of Object.values(POSE_SHEET)) {
    for (const joint of Object.keys(poseFor(id, { t: 1.3, ...entry.state }))) {
      assert.ok(model.pivots.has(joint), `${id}: rig animates missing joint "${joint}"`);
    }
  }
  checks += 2;

  await access(resolve(root, `assets/blueprints/models/${id}.glb`));
  const glb = await readFile(resolve(root, `assets/blueprints/models/${id}.glb`));
  assert.equal(glb.readUInt32LE(0), 0x46546c67, `${id}.glb is not binary glTF`);
  assert.ok(plates.some((plate) => plate.id === id), `${id}: no blueprint plate`);
  await access(resolve(root, `assets/blueprints/plates/${plates.find((plate) => plate.id === id).key}.jpg`));
  checks += 2;
}

for (let index = 0; index < GUARDIAN_VARIANTS.length; index += 1) {
  const variant = guardianVariant(index);
  assert.equal(buildModel(variant).triangles, published.guardian.triangles, "guardian variants must share the blueprint mesh");
  assert.ok(game.includes(`"${GUARDIAN_VARIANTS[index].name}"`), `boss name ${GUARDIAN_VARIANTS[index].name} missing from game.js`);
}

// Every simulated unit type has a blueprint.
const enemyTypes = [...game.matchAll(/^\s{6}(\w+): \{ hp:/gm)].map((match) => match[1]);
assert.ok(enemyTypes.length >= 9, "could not read enemy templates from game.js");
for (const type of enemyTypes) assert.ok(MODELS[type] || type === "boss", `enemy type ${type} has no blueprint`);
for (const role of ["striker", "rail", "bulwark", "medic"]) assert.ok(MODELS[role], `drone role ${role} has no blueprint`);
for (const prop of ["crystal", "beacon", "rock", "wreck"]) assert.ok(game.includes(`"${prop}"`) && MODELS[prop], `scenery ${prop} mismatch`);

const atlas = await stat(resolve(root, `assets/blueprints/Neon-Dominion-3D-Blueprint-Atlas-v${version}.pdf`));
assert.ok(atlas.size > 100000, "blueprint atlas PDF missing or empty");
const hangar = await readFile(resolve(root, "app/hangar.js"), "utf8");
assert.ok(hangar.includes(`Atlas-v${version}.pdf`), "hangar links to a different atlas version");

console.log(`Blueprint contract passed: ${Object.keys(MODELS).length} models, ${plates.length} plates, ${checks} checks (dimensions, footprints, budgets, rigs, GLBs).`);
