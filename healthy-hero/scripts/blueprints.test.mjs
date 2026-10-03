import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const bp = await import(new URL('src/blueprints.js', root));
const models = await import(new URL('src/models.js', root));
const { BLUEPRINTS, CAST, HERO_ORDER, BIOMES, LAYOUT, EMBLEM_BY_TOPIC, expandSpec, partsTable, laneX } = bp;

test('cast of four playable heroes with greetings', () => {
  assert.deepEqual(HERO_ORDER, ['pip', 'mia', 'leo', 'ginger']);
  for (const id of HERO_ORDER) {
    assert.equal(CAST[id].kind, 'character');
    assert.ok(CAST[id].greeting.length > 20);
    assert.ok(['hover', 'humanoid', 'quadruped'].includes(CAST[id].rig));
  }
});

test('every blueprint references existing joints and materials', () => {
  for (const [id, spec] of Object.entries(BLUEPRINTS)) {
    const { joints, parts } = expandSpec(spec);
    assert.ok(joints.root, `${id} needs a root joint`);
    assert.ok(parts.length > 0, `${id} has parts`);
    const ids = new Set();
    for (const p of parts) {
      assert.ok(joints[p.joint], `${id}.${p.id} joint ${p.joint}`);
      assert.ok(spec.materials[p.mat], `${id}.${p.id} material ${p.mat}`);
      assert.ok(!ids.has(p.id), `${id} duplicate part id ${p.id}`);
      ids.add(p.id);
    }
    for (const j of Object.values(joints)) if (j.parent) assert.ok(joints[j.parent], `${id} joint ${j.name} parent ${j.parent}`);
  }
});

test('mirrored parts always come in left/right pairs', () => {
  for (const [id, spec] of Object.entries(BLUEPRINTS)) {
    const { parts } = expandSpec(spec);
    for (const p of spec.parts.filter((q) => q.mirror)) {
      const twin = parts.find((q) => q.mirrorOf === p.id);
      assert.ok(twin, `${id}.${p.id} twin`);
      assert.equal(twin.pos[0], -p.pos[0]);
    }
  }
});

test('3D models conform to their blueprint dimensions (±1.5 cm)', () => {
  for (const [id, spec] of Object.entries(BLUEPRINTS)) {
    const m = models.buildModel(id, { lod: 2 });
    const b = models.measure(m.root);
    const w = b.max.x - b.min.x, d = b.max.z - b.min.z;
    const h = spec.kind === 'emblem' ? b.max.y - b.min.y : b.max.y;
    const o = spec.overall;
    assert.ok(Math.abs(w - o.width) < 0.015, `${id} width ${w.toFixed(3)} vs ${o.width}`);
    assert.ok(Math.abs(h - o.height) < 0.015, `${id} height ${h.toFixed(3)} vs ${o.height}`);
    assert.ok(Math.abs(d - o.depth) < 0.015, `${id} depth ${d.toFixed(3)} vs ${o.depth}`);
  }
});

test('characters stand on the track (or hover just above it)', () => {
  for (const id of HERO_ORDER) {
    const b = models.measure(models.buildModel(id, { lod: 1 }).root);
    assert.ok(b.min.y >= -0.005 && b.min.y < 0.1, `${id} min y ${b.min.y}`);
  }
});

test('game-detail models stay within mobile triangle budgets', () => {
  const budget = { pip: 14000, mia: 26000, leo: 24000, ginger: 20000, gate: 10000 };
  for (const [id, max] of Object.entries(budget)) {
    let tris = 0;
    models.buildModel(id, { lod: 1 }).root.traverse((o) => { if (o.isMesh) tris += o.geometry.index.count / 3; });
    assert.ok(tris <= max, `${id} has ${tris} triangles (budget ${max})`);
  }
});

test('gameplay layout is consistent', () => {
  assert.equal(LAYOUT.lanes, 3);
  assert.equal(laneX(0), -laneX(2));
  assert.equal(laneX(1), 0);
  assert.ok(LAYOUT.gate.hitDistance < LAYOUT.gate.parkDistance && LAYOUT.gate.parkDistance < LAYOUT.gate.spawnDistance);
  assert.ok(BLUEPRINTS.gate.overall.width < LAYOUT.laneWidth, 'gates fit inside their lanes');
});

test('six biome kits use real blueprint props and topic emblems', () => {
  assert.equal(BIOMES.length, 6);
  assert.equal(EMBLEM_BY_TOPIC.length, 6);
  for (const b of BIOMES) for (const p of b.props) assert.equal(BLUEPRINTS[p]?.kind, 'prop', p);
  for (const e of EMBLEM_BY_TOPIC) assert.equal(BLUEPRINTS[e].kind, 'emblem');
});

test('parts tables collapse mirrored pairs and count every piece', () => {
  const rows = partsTable(BLUEPRINTS.mia);
  const total = rows.reduce((s, r) => s + r.qty, 0);
  const { parts } = expandSpec(BLUEPRINTS.mia);
  assert.equal(total, parts.length);
  assert.ok(rows.every((r) => r.size.length > 0));
});

test('blueprint sheet generator covers every asset family', async () => {
  const sheets = await readFile(new URL('tools/blueprint-sheets.js', root), 'utf8');
  for (const id of ['cover', 'lineup', 'pip-elev', 'mia-detail', 'leo-elev', 'ginger-detail', 'gate-elev', 'gate-detail', 'emblems', 'track', 'rig']) assert.match(sheets, new RegExp(`'${id}'`));
  assert.match(sheets, /biome-\$\{b\.key\}/);
});
