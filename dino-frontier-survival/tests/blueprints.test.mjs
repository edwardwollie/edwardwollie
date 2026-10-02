import assert from "node:assert/strict";
import test from "node:test";
import { BLUEPRINTS, BLUEPRINT, approxBounds } from "../app/blueprints.ts";

const BIPED = ["hips", "chest", "neck", "head", "jaw", "tail1", "tail2", "tail3", "thigh_L", "thigh_R", "shin_L", "shin_R", "foot_L", "foot_R", "arm_L", "arm_R"];
const QUAD = ["hips", "neck", "head", "jaw", "tail1", "tail2", "tail3", "legF_L", "legF_R", "lowF_L", "lowF_R", "legB_L", "legB_R", "lowB_L", "lowB_R"];
const REQUIRED = {
  ranger: { bones: ["pelvis", "spine", "chest", "head", "rifle", "armR", "armL", "thigh_L", "thigh_R", "shin_L", "shin_R"], sockets: ["muzzle"] },
  drone: { bones: ["ring"], sockets: ["muzzle"] },
  raptor: { bones: BIPED, sockets: ["mouth", "eyeline"] },
  spitter: { bones: [...BIPED, "frill"], sockets: ["mouth", "eyeline"] },
  rex: { bones: BIPED, sockets: ["mouth", "eyeline"] },
  anky: { bones: QUAD, sockets: ["mouth", "eyeline"] },
  trike: { bones: [...QUAD, "frill"], sockets: ["mouth", "eyeline"] },
  outpost: { bones: ["beacon"], sockets: [] },
};

test("every blueprint has a unique key and drawing code", () => {
  assert.equal(new Set(BLUEPRINTS.map(b => b.key)).size, BLUEPRINTS.length);
  assert.equal(new Set(BLUEPRINTS.map(b => b.code)).size, BLUEPRINTS.length);
  assert.ok(BLUEPRINTS.length >= 10);
});

for (const bp of BLUEPRINTS) {
  test(`${bp.code} ${bp.name}: rig and parts are consistent`, () => {
    const ids = bp.bones.map(b => b.id);
    assert.equal(new Set(ids).size, ids.length, "duplicate bone ids");
    assert.deepEqual(bp.bones.filter(b => b.parent === null).map(b => b.id), ["root"]);
    const byId = new Map(bp.bones.map(b => [b.id, b]));
    for (const b of bp.bones) {
      let node = b, depth = 0;
      while (node.parent) { node = byId.get(node.parent); assert.ok(node, `${b.id} has a missing ancestor`); assert.ok(++depth < 32, `${b.id} is in a cycle`); }
      if (b.id.endsWith("_L")) {
        const twin = byId.get(b.id.slice(0, -2) + "_R");
        assert.ok(twin, `${b.id} is not mirrored`);
        assert.deepEqual([twin.pivot[0], twin.pivot[1], twin.pivot[2]], [-b.pivot[0], b.pivot[1], b.pivot[2]]);
      }
    }
    const partIds = bp.parts.map(p => p.id);
    assert.equal(new Set(partIds).size, partIds.length, "duplicate part ids");
    for (const p of bp.parts) {
      assert.ok(byId.has(p.bone), `part ${p.id} references missing bone ${p.bone}`);
      const sh = p.shape;
      const dims = sh.kind === "box" ? [sh.w, sh.h, sh.d] : sh.kind === "sphere" ? [sh.d] : sh.kind === "capsule" ? [sh.h, sh.r] : sh.kind === "cylinder" ? [sh.h, Math.max(sh.top, sh.bottom)] : sh.kind === "torus" ? [sh.d, sh.t] : [sh.size];
      for (const d of dims) assert.ok(Number.isFinite(d) && d > 0, `part ${p.id} has a non-positive dimension`);
      for (const n of [...p.pos, ...(p.rot ?? []), ...(p.scale ?? [])]) assert.ok(Number.isFinite(n), `part ${p.id} has a non-finite transform`);
    }
    for (const s of bp.sockets) assert.ok(byId.has(s.bone), `socket ${s.id} references missing bone ${s.bone}`);
    const need = REQUIRED[bp.key];
    if (need) {
      for (const b of need.bones) assert.ok(byId.has(b), `${bp.key} is missing animated bone ${b}`);
      for (const s of need.sockets) assert.ok(bp.sockets.some(x => x.id === s), `${bp.key} is missing socket ${s}`);
    }
    assert.ok(bp.collider.radius > 0 && bp.collider.height > 0);
  });
}

test("creatures and the ranger stand on the ground plane", () => {
  for (const key of ["ranger", "raptor", "spitter", "anky", "trike", "rex", "outpost"]) {
    const { min } = approxBounds(BLUEPRINT[key]);
    assert.ok(min[1] > -0.12 && min[1] < 0.15, `${key} floats or sinks (min y ${min[1].toFixed(3)})`);
  }
});

test("proportions match the design brief", () => {
  const size = key => approxBounds(BLUEPRINT[key]).size;
  const ranger = size("ranger");
  assert.ok(ranger[1] > 1.8 && ranger[1] < 2.15, `ranger height ${ranger[1]}`);
  const dinos = ["raptor", "spitter", "anky", "trike", "rex"];
  for (const k of dinos.filter(k => k !== "rex")) {
    assert.ok(size("rex")[2] > size(k)[2], `rex should be longer than ${k}`);
    assert.ok(size("rex")[1] > size(k)[1], `rex should be taller than ${k}`);
  }
  for (const k of dinos.filter(k => k !== "raptor")) assert.ok(size(k)[2] > size("raptor")[2], `${k} should be longer than the raptor`);
});
