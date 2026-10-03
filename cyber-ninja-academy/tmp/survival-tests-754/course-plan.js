// app/course-plan.ts
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = state * 1664525 + 1013904223 >>> 0;
    return state / 4294967296;
  };
}
var LANES = [-1, 0, 1];
var ACTIONS = ["barrier", "beam", "spike", "sweep"];
var PICKS = ["barrier", "beam", "wall", "spike", "sweep", "crusher"];
function planCourse(mission) {
  const rnd = seeded(41e3 + mission.id * 733);
  const difficulty = (mission.id - 1) / 11;
  const first = 48, last = mission.distance - 48;
  const step = (last - first) / (mission.hazards - 1);
  const waves = [];
  for (let i = 0; i < mission.hazards; i++) {
    const jitter = i === 0 || i === mission.hazards - 1 ? 0 : (rnd() - 0.5) * 3.5;
    const z = first + i * step + jitter;
    const lane = LANES[Math.floor(rnd() * 3)];
    let hazards;
    if (i === 0) hazards = [{ kind: "barrier", lane: 0 }];
    else if (i === 1) hazards = [{ kind: "beam", lane: 0 }];
    else if (i === 2) hazards = [{ kind: "wall", lane: 0 }];
    else {
      const available = mission.id === 1 ? PICKS.slice(0, 5) : PICKS;
      const kind = available[(i + mission.id + Math.floor(rnd() * available.length)) % available.length];
      const fullChance = i >= 7 ? mission.id >= 3 ? 0.06 + difficulty * 0.3 : 0 : 0;
      const pairChance = 0.22 + difficulty * 0.2;
      const roll = rnd();
      if (roll < fullChance) {
        const action = ACTIONS[Math.floor(rnd() * ACTIONS.length)];
        hazards = LANES.map((l) => ({ kind: l === lane ? action : rnd() < 0.5 ? "wall" : "crusher", lane: l }));
      } else if (roll < fullChance + pairChance) {
        const second = LANES[(LANES.indexOf(lane) + 1 + Math.floor(rnd() * 2)) % 3];
        hazards = [{ kind, lane }, { kind: available[Math.floor(rnd() * available.length)], lane: second }];
      } else hazards = [{ kind, lane }];
    }
    waves.push({ z, hazards });
  }
  const bonusKinds = [
    ...Array.from({ length: mission.shards }, () => "shard"),
    ...Array.from({ length: mission.drones }, () => "drone")
  ];
  for (let i = bonusKinds.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [bonusKinds[i], bonusKinds[j]] = [bonusKinds[j], bonusKinds[i]];
  }
  const bonuses = bonusKinds.map((kind, i) => {
    const slot = Math.floor((i + 1) * waves.length / (bonusKinds.length + 1));
    return { kind, lane: LANES[Math.floor(rnd() * 3)], z: (waves[slot - 1].z + waves[slot].z) / 2 };
  }).sort((a, b) => a.z - b.z);
  return { waves, bonuses };
}
export {
  planCourse
};
