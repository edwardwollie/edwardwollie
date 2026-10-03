import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const design = await readFile(new URL('../app/game/circuit-design.ts', import.meta.url), 'utf8');
const engine = await readFile(new URL('../app/game/HypernovaEngine.ts', import.meta.url), 'utf8');
const game = await readFile(new URL('../app/components/HypernovaGame.tsx', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../public/.well-known/flexzonic-game.json', import.meta.url), 'utf8'));

test('Grand Circuit uses six named environments and long sectors', () => {
  assert.match(design, /SECTOR_LENGTH = 2400/);
  assert.match(design, /CHECKPOINT_INTERVAL = 600/);
  const profileCount = (design.match(/shortName: \"/g) ?? []).length;
  assert.equal(profileCount, 6);
});

test('course is continuously curved and banked', () => {
  assert.match(design, /courseCenterAtDistance/);
  assert.match(design, /courseBankAtDistance/);
  assert.match(design, /courseYawAtDistance/);
  assert.match(engine, /segment\.rotation\.z = this\.roadBankAtZ/);
  assert.match(engine, /this\.camera\.lookAt\(this\.roadCenterAtZ/);
});

test('encounter variety includes rivals, hazards, coins and warp lanes', () => {
  for (const kind of ['coin-line','coin-sweep','barrier-choice','mine-slalom','drone-pair','rival-pack','warp-lane']) {
    assert.ok(design.includes(`"${kind}"`), `missing ${kind}`);
  }
  assert.match(engine, /createBoostPad/);
  assert.match(engine, /rivalsPassed/);
});

test('drift rewards are implemented without adding another required control', () => {
  assert.match(engine, /driftEligible/);
  assert.match(engine, /type: "drift"/);
  assert.match(game, /DRIFT CHARGE/);
  assert.match(game, /HARD STEER AT SPEED TO DRIFT/);
  assert.match(game, /TAP BRAKE \(S\) IN A TURN TO DRIFT/);
});

test('endless storm drives the blueprint car and prop models', () => {
  assert.match(engine, /createBlueprintModel\(car\.id as BlueprintAssetId/);
  for (const asset of ['coin','barrier','mine','drone','nitro','repair','boostPad']) {
    assert.ok(engine.includes(`"${asset}"`), asset);
  }
});

test('portal metadata advertises the upgraded racing systems', () => {
  assert.equal(manifest.category, 'Racing');
  assert.ok(manifest.features.includes('Grand Circuit'));
  assert.ok(manifest.features.includes('Curved raceway'));
  assert.ok(manifest.gameplayTypes.includes('Racing'));
});
