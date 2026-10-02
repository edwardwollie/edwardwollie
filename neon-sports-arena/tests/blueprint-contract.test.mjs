import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), "utf8"));
const spec = read("../app/blueprint-spec.json");
const runtime = read("../blueprints/runtime-extracted.json");
const poses = read("../blueprints/runtime-poses.json");
const pkg = read("../package.json");
const portal = read("../public/.well-known/flexzonic-game.json");
const V = spec.version;
const part = (asset, name) => spec.assets[asset].find((p) => p.name === name);
const near = (a, b, label, tol = .00002) => {
  assert.equal(a.length, b.length, `${label} length`);
  for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - b[i]) < tol, `${label}/${i}`);
};

test("one specification supplies complete production meshes", () => {
  assert.equal(V, "2.0.0");
  assert.equal(pkg.version, V);
  assert.equal(portal.version, V);
  assert.equal(spec.winding, "babylon-left-handed");
  for (const [asset, parts] of Object.entries(spec.assets)) {
    assert.ok(parts.length > 0, asset);
    assert.equal(new Set(parts.map((p) => p.name)).size, parts.length, `${asset} duplicate part`);
    for (const p of parts) {
      const m = p.mesh;
      assert.ok(spec.palette[p.material], `${asset}/${p.name} material`);
      assert.ok(!p.group || spec.groups[p.group], `${asset}/${p.name} joint`);
      assert.ok(m.positions.length >= 9 && m.positions.length % 3 === 0);
      assert.equal(m.normals.length, m.positions.length);
      assert.equal(m.colors.length, m.positions.length / 3 * 4);
      assert.equal(m.uvs.length, m.positions.length / 3 * 2);
      assert.ok(m.indices.length % 3 === 0 && m.indices.every((i) => Number.isInteger(i) && i >= 0 && i < m.positions.length / 3), `${asset}/${p.name} indices`);
    }
  }
  assert.ok(spec.assets.athlete.length >= 120, "detailed athlete");
  assert.ok(spec.assets.athlete.every((p) => p.group), "every athlete part is skinned to a joint");
  assert.ok(spec.assets.spectator.reduce((n, p) => n + p.mesh.indices.length / 3, 0) < 120, "crowd stays light");
});

test("front faces use Babylon's winding (outward normal = (c-a) x (b-a))", () => {
  for (const asset of ["energy_ball", "athlete", "goal_frame"]) {
    let agree = 0, total = 0;
    for (const p of spec.assets[asset]) {
      const P = p.mesh.positions, N = p.mesh.normals, I = p.mesh.indices;
      for (let f = 0; f < I.length; f += 3) {
        const [a, b, c] = [I[f], I[f + 1], I[f + 2]].map((i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
        const u = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], v = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const vn = [N[I[f] * 3], N[I[f] * 3 + 1], N[I[f] * 3 + 2]];
        if (n[0] * vn[0] + n[1] * vn[1] + n[2] * vn[2] > 0) agree++;
        total++;
      }
    }
    assert.ok(agree / total > .97, `${asset} winding ${agree}/${total}`);
  }
});

test("blueprint renderer input is the playable Babylon geometry", () => {
  assert.equal(runtime.version, V);
  for (const [asset, parts] of Object.entries(spec.assets)) {
    const out = runtime.assets[asset];
    assert.equal(out.length, parts.length, asset);
    parts.forEach((source, i) => {
      assert.equal(out[i].name, source.name);
      assert.equal(out[i].material, source.material);
      assert.deepEqual(out[i].indices, source.mesh.indices, `${asset}/${source.name}`);
      near(out[i].colors, source.mesh.colors, `${asset}/${source.name} colors`);
      near(out[i].uvs, source.mesh.uvs, `${asset}/${source.name} uvs`);
      assert.equal(out[i].positions.length, source.mesh.positions.length);
    });
  }
  const ys = runtime.assets.athlete.flatMap((p) => p.positions.filter((_, i) => i % 3 === 1));
  assert.ok(Math.abs(Math.max(...ys) - spec.dimensions.athleteHeight) < .01, "skinned athlete height");
  assert.ok(Math.min(...ys) > -.02, "hover pads rest on the deck");
});

test("pose sheet is read back from the skinned game rig", () => {
  assert.equal(poses.version, V);
  assert.deepEqual(Object.keys(poses.poses).sort(), ["blast", "boost", "carry", "celebrate", "dunk", "jump", "kick", "shoot", "skate", "stance", "tackle", "throw"]);
  for (const list of Object.values(poses.poses)) assert.equal(list.length, spec.assets.athlete.length);
  assert.ok(poses.joints.head[1] > 1.55 && poses.joints.head[1] < 1.75);
  const handY = (pose) => poses.poseJoints[pose].rightHand[1];
  assert.ok(handY("celebrate") > poses.joints.head[1], "arms up when celebrating");
  assert.ok(handY("dunk") > poses.joints.head[1], "dunk reaches overhead");
});

function glb(asset, file) {
  const data = fs.readFileSync(new URL(`../blueprints/models/${file}`, import.meta.url));
  assert.equal(data.toString("ascii", 0, 4), "glTF");
  assert.equal(data.readUInt32LE(8), data.length);
  const jsonLength = data.readUInt32LE(12);
  const doc = JSON.parse(data.toString("utf8", 20, 20 + jsonLength));
  const base = 28 + jsonLength;
  assert.equal(doc.meshes.length, runtime.assets[asset].length);
  doc.meshes.forEach((mesh, i) => {
    const src = runtime.assets[asset][i];
    assert.equal(mesh.name, src.name);
    const prim = mesh.primitives[0];
    const a = doc.accessors[prim.attributes.POSITION], v = doc.bufferViews[a.bufferView];
    for (let j = 0; j < src.positions.length; j++) {
      const expected = j % 3 === 0 ? -src.positions[j] : src.positions[j];  // X mirrored into glTF's right-handed frame
      assert.ok(Math.abs(data.readFloatLE(base + v.byteOffset + j * 4) - expected) < .00002);
    }
    const ia = doc.accessors[prim.indices], iv = doc.bufferViews[ia.bufferView];
    for (let j = 0; j < src.indices.length; j++) assert.equal(data.readUInt32LE(base + iv.byteOffset + j * 4), src.indices[j]);
  });
}

test("standalone GLBs carry the exact runtime vertices", () => {
  for (const [asset, name] of [["athlete", "Neon-Athlete"], ["energy_ball", "Energy-Ball"], ["goal_frame", "Goal-Frame"], ["hoop_rig", "Gravity-Hoop-Rig"], ["trophy", "Infinity-Cup"]])
    glb(asset, `${name}-Exact-Mesh-v${V}.glb`);
});

test("arena dimensions and sport placements agree with the layout", () => {
  const A = spec.arena;
  assert.equal(A.pitchHalfWidth * 2, 32); assert.equal(A.pitchHalfLength * 2, 48);
  assert.ok(part("goal_frame", "goalFrame"));
  const hoop = part("hoop_rig", "hoopRing");
  assert.equal(hoop.position[1], A.hoopCentreY);
  assert.ok(A.hoopScoreRadius < A.hoopRimRadius && A.hoopRimRadius < hoop.diameter / 2);
  assert.equal(spec.modes.goal.filter((m) => m.asset === "goal_frame").map((m) => m.position[2]).sort((a, b) => a - b).join(), [-24, 24].join());
  assert.ok(spec.modes.hoops.some((m) => m.asset === "hoop_rig" && m.position[2] === A.hoopZ));
  for (const [x, z] of A.launchPads) assert.ok(spec.modes.hoops.some((m) => m.asset === "launch_pad" && m.position[0] === x && m.position[2] === z));
  for (let arena = 0; arena < 6; arena++) {
    const stands = spec.layout.filter((e) => e.asset === "stand_section" && e.arenas.includes(arena));
    assert.ok(stands.length >= 4, `arena ${arena} has a crowd`);
  }
  // Every board keeps out of the goal mouth in Goal Rush.
  for (const e of spec.layout.filter((e) => e.asset === "board_section" && !e.modes)) {
    if (Math.abs(e.position[2]) > 24) assert.ok(Math.abs(e.position[0]) - 2 >= A.goalHalfWidth - .01, `board at ${e.position}`);
  }
});

test("eleven plates and the PDF atlas are packaged", () => {
  const plates = fs.readdirSync(new URL("../blueprints/renders/", import.meta.url)).filter((f) => /^\d\d-.*\.png$/.test(f));
  assert.equal(plates.length, 11);
  for (const f of plates) assert.ok(fs.statSync(new URL(`../blueprints/renders/${f}`, import.meta.url)).size > 100000, f);
  for (const path of [`../blueprints/Neon-Sports-Arena-3D-Blueprint-Atlas-v${V}.pdf`, `../public/blueprints/Neon-Sports-Arena-3D-Blueprint-Atlas-v${V}.pdf`])
    assert.ok(fs.statSync(new URL(path, import.meta.url)).size > 1000000, path);
  assert.equal(fs.readdirSync(new URL("../public/blueprints/plates/", import.meta.url)).length, 11);
});
