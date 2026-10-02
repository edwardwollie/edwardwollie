import assert from "node:assert/strict";

const classList = { add() {}, remove() {}, toggle() {} };
const uiElement = () => ({
  classList,
  style: { setProperty() {} },
  dataset: {},
  textContent: ""
});

globalThis.window = {
  devicePixelRatio: 1,
  addEventListener() {},
  visualViewport: { addEventListener() {} },
  matchMedia: () => ({ matches: true })
};
globalThis.document = { getElementById: () => uiElement() };
globalThis.requestAnimationFrame = () => 0;

const { RiftCommandGame } = await import("../app/game.js");
const canvas = {
  width: 0,
  height: 0,
  getBoundingClientRect: () => ({ width: 390, height: 844 }),
  getContext: () => ({})
};
const audio = new Proxy({}, { get: () => () => {} });
const events = [];
const game = new RiftCommandGame(canvas, audio, {
  onToast: (message) => events.push(message),
  onFinish: (result) => events.push(result)
});

game.start(1, { damage: 1, armor: 1, squad: 1 });
assert.equal(game.mode, "playing");
assert.equal(game.sector, 1);
assert.equal(game.squad.length, 3);
assert.ok(game.gates.length >= 4);
assert.ok(game.enemies.length >= 10);

const startY = game.player.y;
game.setMoveInput(0, -1);
for (let index = 0; index < 60; index += 1) game.update(1 / 60);
assert.ok(game.player.y > startY + 100, "Commander should advance when joystick points up");

assert.equal(game.activateNova(), true, "NOVA should activate when ready");
assert.equal(game.activateNova(), false, "NOVA should respect cooldown");
assert.ok(game.novaCooldown > 0);
assert.ok(game.rings.length >= 2);

const initialStance = game.stance;
assert.equal(game.cycleStance(), true, "Formation should cycle while playing");
assert.notEqual(game.stance, initialStance);
assert.ok(game.squad.some((drone) => drone.role === "striker"));
assert.ok(game.squad.some((drone) => drone.role === "rail"));
const shieldEnemy = game.createEnemy("shield", game.player.x, game.player.y + 120);
const shieldBefore = shieldEnemy.shield;
game.damageEnemy(shieldEnemy, 10, false);
assert.ok(shieldEnemy.shield < shieldBefore && shieldEnemy.hp === shieldEnemy.maxHp, "Shield carrier should absorb damage first");
const jammer = game.createEnemy("jammer", game.player.x, game.player.y + 130);
assert.equal(jammer.type, "jammer");
const splitter = game.createEnemy("splitter", game.player.x, game.player.y + 150);
assert.equal(splitter.type, "splitter");

const beforeDamage = game.runDamage;
game.applyGate(game.makeGate(game.player.x, game.player.y, "damage", 999));
assert.ok(game.runDamage > beforeDamage, "Damage gate should increase run damage");

const snapshot = game.getState();
assert.equal(snapshot.sector, 1);
assert.ok(snapshot.squad >= 1);
assert.ok(events.length >= 2);

console.log(`Logic checks passed: movement, specialist squad, tactical formations, Legion elites, NOVA cooldown, and gate upgrades.`);
