// Animation rigs for the blueprint models.
//
// A rig turns a small state object into joint rotations for the pivots declared
// in models.js. The game renderer, the hangar and the blueprint pose sheets call
// the same functions, so a pose printed on a plate is exactly what runs in game.
//
// state = {
//   t      seconds (animation clock)
//   phase  per-unit random offset
//   move   0..1 locomotion speed fraction
//   aim    radians, upper-body yaw relative to the root (positive = towards +X / unit's left)
//   fire   0..1 recoil pulse (1 = the instant of firing)
//   lean   -1..1 lateral lean
//   charge 0..1 special state (boss phase, shield up, charger boost...)
// }

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function walk(pose, state, { speed = 8, swing = 0.5, knee = 0.45, prefix = "leg", shin = null }) {
  const cycle = state.t * speed + state.phase;
  const amount = state.move;
  pose[`${prefix}L`] = { rx: Math.sin(cycle) * swing * amount };
  pose[`${prefix}R`] = { rx: -Math.sin(cycle) * swing * amount };
  if (shin) {
    pose[`${shin}L`] = { rx: Math.max(0, -Math.cos(cycle)) * knee * amount };
    pose[`${shin}R`] = { rx: Math.max(0, Math.cos(cycle)) * knee * amount };
  }
}

function quadWalk(pose, state, speed = 12, swing = 0.38) {
  const cycle = state.t * speed + state.phase;
  const a = Math.sin(cycle) * swing * state.move;
  const lift = Math.max(0, Math.cos(cycle)) * 0.25 * state.move;
  const lift2 = Math.max(0, -Math.cos(cycle)) * 0.25 * state.move;
  pose.legFL = { ry: a, rz: lift };
  pose.legBR = { ry: a, rz: -lift };
  pose.legFR = { ry: -a, rz: -lift2 };
  pose.legBL = { ry: -a, rz: lift2 };
}

const spinRotors = (pose, state, speed = 46) => {
  for (const name of ["rotorFL", "rotorFR", "rotorBL", "rotorBR"]) pose[name] = { ry: (state.t * speed + state.phase * 3) % (Math.PI * 2) };
};

export const RIGS = {
  commander(state) {
    const pose = {};
    const aim = clamp(state.aim, -1.25, 1.25);
    const stride = state.t * 7.5 + state.phase;
    pose.pelvis = { py: Math.sin(state.t * 2.6 + state.phase) * 0.02, rz: -state.lean * 0.08 };
    pose.torso = { ry: aim * 0.85, rx: state.move * 0.12 - state.fire * 0.04 };
    pose.head = { ry: aim * 0.25, rx: -state.move * 0.08 };
    pose.legL = { rx: -0.32 * state.move + Math.sin(stride) * 0.22 * state.move, rz: state.lean * 0.05 };
    pose.legR = { rx: -0.32 * state.move - Math.sin(stride) * 0.22 * state.move, rz: state.lean * 0.05 };
    pose.shinL = { rx: 0.42 * state.move + Math.max(0, Math.cos(stride)) * 0.2 * state.move };
    pose.shinR = { rx: 0.42 * state.move + Math.max(0, -Math.cos(stride)) * 0.2 * state.move };
    pose.armL = { rx: -0.1 - state.move * 0.25, rz: -0.12 };
    pose.foreL = { rx: -0.5 };
    pose.armR = { rx: -0.08 - state.fire * 0.18, rz: 0.08 };
    pose.foreR = { rx: -0.12 - state.fire * 0.12, pz: -state.fire * 0.04 };
    pose.jets = { s: 1 + state.move * 0.18 + Math.sin(state.t * 30) * 0.03 };
    return pose;
  },
  striker(state) {
    const pose = {};
    spinRotors(pose, state);
    return pose;
  },
  rail(state) {
    const pose = {};
    spinRotors(pose, state, 52);
    return pose;
  },
  bulwark() {
    return {};
  },
  medic(state) {
    return { halo: { ry: state.t * 2.2 + state.phase, rx: Math.sin(state.t * 1.4) * 0.18, s: 1 + state.charge * 0.25 } };
  },
  grunt(state) {
    const pose = {};
    quadWalk(pose, state, 13, 0.42);
    pose.body = { py: Math.abs(Math.sin(state.t * 13 + state.phase)) * 0.035 * state.move, rx: -state.fire * 0.25 };
    return pose;
  },
  shooter(state) {
    const pose = {};
    walk(pose, state, { speed: 7, swing: 0.45 });
    pose.torso = { ry: clamp(state.aim, -1.4, 1.4), rx: -state.fire * 0.16, py: Math.abs(Math.sin(state.t * 7 + state.phase)) * 0.03 * state.move };
    return pose;
  },
  charger(state) {
    const pose = {};
    const speed = 11 + state.charge * 9;
    quadWalk(pose, state, speed, 0.32 + state.charge * 0.12);
    pose.body = { rx: Math.sin(state.t * speed + state.phase) * 0.05 * state.move + state.charge * 0.12, py: -state.charge * 0.06 };
    return pose;
  },
  shield(state) {
    const pose = {};
    walk(pose, state, { speed: 5.5, swing: 0.35 });
    pose.torso = { ry: clamp(state.aim, -0.8, 0.8) * 0.6, py: Math.abs(Math.sin(state.t * 5.5 + state.phase)) * 0.03 * state.move };
    pose.shield = { rx: -state.fire * 0.12, ry: 0.18 - state.charge * 0.18, px: state.charge * 0.15 };
    return pose;
  },
  jammer(state) {
    return {
      rings: { ry: state.t * 1.7 + state.phase, rx: Math.sin(state.t * 1.1 + state.phase) * 0.22 },
      dish: { ry: state.t * 0.9 + state.phase }
    };
  },
  splitter(state) {
    const open = 0.05 + (Math.sin(state.t * 3 + state.phase) * 0.5 + 0.5) * 0.06 + state.charge * 0.2;
    return {
      halfL: { px: open, rz: -open * 0.4 },
      halfR: { px: -open, rz: open * 0.4 },
      core: { ry: state.t * 2, s: 1 + Math.sin(state.t * 6 + state.phase) * 0.08 }
    };
  },
  brute(state) {
    const pose = {};
    walk(pose, state, { speed: 4.5, swing: 0.32 });
    const cycle = state.t * 4.5 + state.phase;
    pose.torso = { ry: clamp(state.aim, -0.9, 0.9) * 0.5, rz: Math.sin(cycle) * 0.05 * state.move, py: Math.abs(Math.sin(cycle)) * 0.04 * state.move };
    pose.armL = { rx: -Math.sin(cycle) * 0.35 * state.move - state.fire * 1.1 };
    pose.armR = { rx: Math.sin(cycle) * 0.35 * state.move - state.fire * 0.4 };
    return pose;
  },
  turret(state) {
    return { head: { ry: state.aim, pz: -state.fire * 0.08 } };
  },
  guardian(state) {
    const pose = {};
    walk(pose, state, { speed: 2.6, swing: 0.22 });
    const cycle = state.t * 2.6 + state.phase;
    pose.torso = { ry: clamp(state.aim, -0.7, 0.7) * 0.6, py: Math.abs(Math.sin(cycle)) * 0.08 * state.move, rx: -state.fire * 0.05 };
    pose.head = { ry: clamp(state.aim, -0.7, 0.7) * 0.3 };
    pose.armL = { rx: -state.fire * 0.28 - 0.06, rz: -0.04 };
    pose.armR = { rx: -state.fire * 0.28 - 0.06, rz: 0.04 };
    pose.crown = { s: 1 + state.charge * 0.12, ry: Math.sin(state.t * 0.8) * 0.06 };
    return pose;
  },
  beacon(state) {
    return { lamp: { ry: state.t * 2.4, s: 1 + Math.max(0, Math.sin(state.t * 3 + state.phase)) * 0.25 } };
  },
  riftgate(state) {
    return { ring: { rz: state.t * 0.12 } };
  }
};

/** Pose a model by id. Variants such as guardian2 share the base rig. */
export function poseFor(id, state) {
  const base = id.replace(/\d+$/, "");
  const rig = RIGS[base];
  const full = { t: 0, phase: 0, move: 0, aim: 0, fire: 0, lean: 0, charge: 0, ...state };
  return rig ? rig(full) : {};
}

/** Named poses printed on the blueprint pose sheet and offered in the hangar. */
export const POSE_SHEET = {
  rest: { label: "Rest", state: {} },
  advance: { label: "Advance", state: { t: 0.32, move: 1 } },
  stride: { label: "Stride B", state: { t: 0.74, move: 1 } },
  aimLeft: { label: "Aim left", state: { aim: 0.9 } },
  aimRight: { label: "Aim right", state: { aim: -0.9, fire: 1 } },
  special: { label: "Special", state: { charge: 1, fire: 0.6 } }
};
