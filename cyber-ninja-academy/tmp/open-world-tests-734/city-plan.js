// app/city-plan.ts
var SECTORS = [
  { id: 1, name: "Neon Sprawl", zone: "Academy District", grid: 4, shards: 6, drones: 4, elite: 0, reward: 260, par: 240, color: "#27efff", seed: 7101 },
  { id: 2, name: "Circuit Heights", zone: "Circuit Ward", grid: 5, shards: 8, drones: 7, elite: 1, reward: 420, par: 320, color: "#a970ff", seed: 7202 },
  { id: 3, name: "Ember Spire", zone: "Ember Spire", grid: 5, shards: 10, drones: 10, elite: 2, reward: 600, par: 400, color: "#ff435f", seed: 7303 },
  { id: 4, name: "Void Crown", zone: "Void Crown", grid: 6, shards: 12, drones: 14, elite: 3, reward: 900, par: 480, color: "#cfff45", seed: 7404 }
];
var CELL = 22;
var DOUBLE_JUMP_RISE = 2.4;
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = s * 1664525 + 1013904223 >>> 0;
    return s / 4294967296;
  };
}
var box = (min, max, kind) => ({ min, max, kind });
function planCity(sector) {
  const rnd = seeded(sector.seed), n = sector.grid, roofs = [], solids = [];
  const at = (i, j) => roofs[i * n + j];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const w = 12.5 + rnd() * 4.5, d = 12.5 + rnd() * 4.5;
    const x = i * CELL + (rnd() - 0.5) * 2, z = j * CELL + (rnd() - 0.5) * 2;
    const climb = (i + j) / (2 * (n - 1));
    const h = i === 0 && j === 0 ? 0 : Math.round((climb * sector.grid * 1.9 + (rnd() - 0.5) * 3.2) * 2) / 2;
    const roof = { i, j, x, z, w, d, h: Math.max(0, h), box: box([x - w / 2, -60, z - d / 2], [x + w / 2, Math.max(0, h), z + d / 2], "roof") };
    roofs.push(roof);
    solids.push(roof.box);
  }
  const pads = [];
  const linked = /* @__PURE__ */ new Set(["0,0"]), edges = [];
  const frontier = [[at(0, 0), at(1, 0)], [at(0, 0), at(0, 1)]];
  while (linked.size < n * n && frontier.length) {
    const k = Math.floor(rnd() * frontier.length), [a, b] = frontier.splice(k, 1)[0];
    if (linked.has(`${b.i},${b.j}`)) continue;
    linked.add(`${b.i},${b.j}`);
    edges.push([a, b]);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = b.i + di, nj = b.j + dj;
      if (ni >= 0 && nj >= 0 && ni < n && nj < n && !linked.has(`${ni},${nj}`)) frontier.push([b, at(ni, nj)]);
    }
  }
  for (const [a, b] of edges) {
    const low = a.h <= b.h ? a : b, high = low === a ? b : a;
    const horizontal = a.i !== b.i;
    const y = low.h;
    if (horizontal) {
      const x0 = Math.min(a.x, b.x) + (a.x < b.x ? a.w : b.w) / 2 - 0.4, x1 = Math.max(a.x, b.x) - (a.x < b.x ? b.w : a.w) / 2 + 0.4;
      const zc = (a.z + b.z) / 2;
      solids.push(box([x0, y - 0.35, zc - 1.1], [x1, y, zc + 1.1], "bridge"));
    } else {
      const z0 = Math.min(a.z, b.z) + (a.z < b.z ? a.d : b.d) / 2 - 0.4, z1 = Math.max(a.z, b.z) - (a.z < b.z ? b.d : a.d) / 2 + 0.4;
      const xc = (a.x + b.x) / 2;
      solids.push(box([xc - 1.1, y - 0.35, z0], [xc + 1.1, y, z1], "bridge"));
    }
    if (high.h - low.h > DOUBLE_JUMP_RISE) {
      const dx = Math.sign(high.x - low.x) * (horizontal ? 1 : 0), dz = Math.sign(high.z - low.z) * (horizontal ? 0 : 1);
      pads.push({ x: low.x + dx * (low.w / 2 - 3.2), y: low.h, z: low.z + dz * (low.d / 2 - 3.2), dx, dz });
    }
  }
  const propTops = [];
  for (const r of roofs) {
    const count = 2 + Math.floor(rnd() * 3);
    for (let k = 0; k < count; k++) {
      const pw = 1.2 + rnd() * 2.2, pd = 1.2 + rnd() * 2.2, ph = [0.9, 1.3, 1.8, 2.2][Math.floor(rnd() * 4)];
      const px = r.x + (rnd() < 0.5 ? -1 : 1) * (1.8 + rnd() * (r.w / 2 - 3.6)), pz = r.z + (rnd() < 0.5 ? -1 : 1) * (1.8 + rnd() * (r.d / 2 - 3.6));
      if (pads.some((p) => Math.hypot(p.x - px, p.z - pz) < 3.4)) continue;
      if (r.i === 0 && r.j === 0 && Math.hypot(px - r.x, pz - r.z) < 3) continue;
      if (r.i === n - 1 && r.j === n - 1 && Math.hypot(px - r.x, pz - r.z) < 4.5) continue;
      solids.push(box([px - pw / 2, r.h, pz - pd / 2], [px + pw / 2, r.h + ph, pz + pd / 2], "prop"));
      propTops.push({ x: px, y: r.h + ph, z: pz });
    }
    if (r.i === 0) solids.push(box([r.x - r.w / 2, r.h, r.z - r.d / 2], [r.x - r.w / 2 + 0.35, r.h + 0.32, r.z + r.d / 2], "lip"));
    if (r.i === n - 1) solids.push(box([r.x + r.w / 2 - 0.35, r.h, r.z - r.d / 2], [r.x + r.w / 2, r.h + 0.32, r.z + r.d / 2], "lip"));
    if (r.j === 0) solids.push(box([r.x - r.w / 2, r.h, r.z - r.d / 2], [r.x + r.w / 2, r.h + 0.32, r.z - r.d / 2 + 0.35], "lip"));
    if (r.j === n - 1) solids.push(box([r.x - r.w / 2, r.h, r.z + r.d / 2 - 0.35], [r.x + r.w / 2, r.h + 0.32, r.z + r.d / 2], "lip"));
  }
  const walls = [];
  const bridged = new Set(edges.flatMap(([a, b]) => [`${a.i},${a.j}>${b.i},${b.j}`, `${b.i},${b.j}>${a.i},${a.j}`]));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (const [di, dj] of [[1, 0], [0, 1]]) {
    const a = at(i, j), b = i + di < n && j + dj < n ? at(i + di, j + dj) : void 0;
    if (!b || bridged.has(`${a.i},${a.j}>${b.i},${b.j}`) || rnd() > 0.55) continue;
    const y0 = Math.min(a.h, b.h) + 0.4, y1 = Math.max(a.h, b.h) + 3.6, side = rnd() < 0.5 ? -1 : 1;
    let wall;
    if (di) {
      const x0 = a.x + a.w / 2 - 1.2, x1 = b.x - b.w / 2 + 1.2, zc = (a.z + b.z) / 2 + side * Math.min(a.d, b.d) * 0.32;
      wall = box([x0, y0, zc - 0.2], [x1, y1, zc + 0.2], "wall");
    } else {
      const z0 = a.z + a.d / 2 - 1.2, z1 = b.z - b.d / 2 + 1.2, xc = (a.x + b.x) / 2 + side * Math.min(a.w, b.w) * 0.32;
      wall = box([xc - 0.2, y0, z0], [xc + 0.2, y1, z1], "wall");
    }
    walls.push(wall);
    solids.push(wall);
  }
  const order = [...roofs].sort((a, b) => a.i + a.j - (b.i + b.j) || a.i - b.i);
  const summit = order[order.length - 1];
  const shards = [], pool = order.slice(1);
  for (let k = 0; k < sector.shards; k++) {
    const r = pool[Math.floor((k + 0.5) * pool.length / sector.shards)];
    const onProp = k % 3 === 2 ? propTops.find((p) => Math.abs(p.x - r.x) < r.w / 2 && Math.abs(p.z - r.z) < r.d / 2 && p.y - r.h < 2) : void 0;
    if (onProp) shards.push({ x: onProp.x, y: onProp.y + 1.1, z: onProp.z });
    else {
      const x = r.x + (rnd() - 0.5) * (r.w - 5), z = r.z + (rnd() - 0.5) * (r.d - 5);
      const under = solids.find((b) => b.kind === "prop" && x > b.min[0] - 0.4 && x < b.max[0] + 0.4 && z > b.min[2] - 0.4 && z < b.max[2] + 0.4);
      if (under) shards.push({ x: (under.min[0] + under.max[0]) / 2, y: under.max[1] + 1.2, z: (under.min[2] + under.max[2]) / 2 });
      else shards.push({ x, y: r.h + 1.2, z });
    }
  }
  const drones = [];
  for (let k = 0; k < sector.drones; k++) {
    const r = pool[Math.floor((k + 0.3) * pool.length / sector.drones) % pool.length];
    drones.push({ x: r.x + (rnd() - 0.5) * 6, y: r.h + 3.2 + rnd() * 1.6, z: r.z + (rnd() - 0.5) * 6, elite: k >= sector.drones - sector.elite });
  }
  const repairs = [order[Math.floor(order.length * 0.35)], order[Math.floor(order.length * 0.7)]].map((r) => ({ x: r.x + r.w / 2 - 2.2, y: r.h + 0.9, z: r.z - r.d / 2 + 2.2 }));
  const start = at(0, 0);
  return {
    roofs,
    solids,
    pads,
    shards,
    repairs,
    drones,
    spawn: { x: start.x, y: start.h, z: start.z, yaw: Math.PI / 4 },
    beacon: { x: summit.x, y: summit.h, z: summit.z },
    boss: { x: summit.x, y: summit.h + 3.7, z: summit.z, hp: 24 + 10 * (sector.id - 1) },
    walls,
    bounds: { min: -CELL, max: n * CELL }
  };
}
export {
  CELL,
  DOUBLE_JUMP_RISE,
  SECTORS,
  planCity
};
