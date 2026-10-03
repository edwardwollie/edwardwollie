import * as THREE from "three";
import type { BuiltModel } from "./build.ts";

/**
 * Procedural animation for the shared cadet skeleton (11 joints) and Cosmo the robot.
 * Poses are written for the LEFT side; right-side joints are mirrored nodes, so their
 * Y and Z rotations are negated automatically by `side()`.
 */
export type PoseName = "rest" | "idle" | "walk" | "run" | "wave" | "cheer" | "point" | "float" | "sit" | "jump" | "clap" | "think" | "pilot";

interface JointPose { x?: number; y?: number; z?: number; py?: number }
type PoseMap = Record<string, JointPose>;

function sides(map: PoseMap, joint: string, pose: JointPose, mirrorPose?: JointPose) {
  map[joint + "L"] = pose;
  const right = mirrorPose ?? pose;
  map[joint + "R"] = { x: right.x, y: right.y === undefined ? undefined : -right.y, z: right.z === undefined ? undefined : -right.z, py: right.py };
}

const TAU = Math.PI * 2;

/** Returns joint offsets (radians, metres) relative to the authored rest pose. */
export function poseOffsets(kind: "cadet" | "robot", pose: PoseName, t: number, amount = 1): PoseMap {
  const map: PoseMap = {};
  const breathe = Math.sin(t * 2.1);
  if (kind === "robot") {
    const hover = Math.sin(t * 2.4) * 0.025;
    map.torso = { py: hover, z: Math.sin(t * 1.3) * 0.03 };
    map.hover = { py: hover * 0.6 };
    map.head = { y: Math.sin(t * 0.7) * 0.25, z: Math.sin(t * 1.1) * 0.06 };
    sides(map, "arm", { x: Math.sin(t * 1.8) * 0.08, z: 0.05 }, { x: -Math.sin(t * 1.8) * 0.08, z: 0.05 });
    sides(map, "fore", { x: -0.25 });
    if (pose === "wave") {
      sides(map, "arm", { x: Math.sin(t * 1.8) * 0.08 }, { z: 2.5 });
      map.foreR = { x: -0.15, z: -Math.sin(t * 9) * 0.45 };
    } else if (pose === "cheer") {
      sides(map, "arm", { z: 2.4 + Math.sin(t * 8) * 0.15 });
      sides(map, "fore", { z: 0.3 });
      map.torso = { py: Math.abs(Math.sin(t * 5)) * 0.08, y: Math.sin(t * 3) * 0.3 };
    } else if (pose === "point") {
      map.armR = { x: -1.45, z: -0.25 };
      map.foreR = { x: -0.05 };
    } else if (pose === "think") {
      map.armR = { x: -0.9, z: -0.5 };
      map.foreR = { x: -1.9 };
      map.head = { z: 0.18, y: 0.2 };
    }
    return scale(map, amount);
  }

  switch (pose) {
    case "rest":
      return {};
    case "idle": {
      map.torso = { x: breathe * 0.015 };
      map.head = { y: Math.sin(t * 0.55) * 0.14, x: Math.sin(t * 0.8) * 0.03 };
      sides(map, "arm", { z: breathe * 0.025, x: Math.sin(t * 1.05) * 0.04 });
      sides(map, "fore", { x: -0.12 });
      break;
    }
    case "walk":
    case "run": {
      const run = pose === "run";
      const p = t * (run ? 9.5 : 6.8);
      const swing = run ? 0.75 : 0.5;
      map.hips = { py: Math.abs(Math.sin(p)) * (run ? 0.045 : 0.022) - (run ? 0.02 : 0) };
      map.torso = { x: run ? 0.18 : 0.03, y: Math.sin(p) * 0.07 };
      map.head = { x: run ? -0.12 : 0, y: -Math.sin(p) * 0.05 };
      map.legL = { x: -Math.sin(p) * swing };
      map.legR = { x: Math.sin(p) * swing };
      map.shinL = { x: Math.max(0, Math.sin(p + 1.2)) * (run ? 1.1 : 0.7) };
      map.shinR = { x: Math.max(0, -Math.sin(p + 1.2)) * (run ? 1.1 : 0.7) };
      map.armL = { x: Math.sin(p) * (run ? 0.85 : 0.45), z: run ? 0.1 : 0 };
      map.armR = { x: -Math.sin(p) * (run ? 0.85 : 0.45), z: run ? -0.1 : 0 };
      sides(map, "fore", { x: run ? -1.3 : -0.35 });
      break;
    }
    case "wave": {
      map.torso = { x: breathe * 0.015, z: -0.04 };
      map.head = { z: 0.1, y: -0.1 };
      map.armL = { z: 0.02 };
      map.armR = { z: -2.55, x: -0.15 };
      map.foreR = { z: -Math.sin(t * 9) * 0.5 - 0.15 };
      break;
    }
    case "cheer": {
      const bounce = Math.abs(Math.sin(t * 5.2));
      map.hips = { py: bounce * 0.08 };
      map.torso = { x: -0.08 };
      map.head = { x: -0.18 };
      sides(map, "arm", { z: 2.55 + Math.sin(t * 10) * 0.12, x: -0.1 });
      sides(map, "fore", { z: 0.25 });
      sides(map, "leg", { z: 0.08 });
      sides(map, "shin", { x: (1 - bounce) * 0.5 });
      sides(map, "leg", { x: -(1 - bounce) * 0.35, z: 0.08 });
      break;
    }
    case "point": {
      map.torso = { y: -0.12 };
      map.head = { y: -0.1, x: -0.12 };
      map.armR = { x: -2.1, z: -0.25 };
      map.foreR = { x: -0.1 };
      map.armL = { z: 0.05, x: 0.1 };
      sides(map, "fore", { x: -0.2 });
      map.foreR = { x: -0.1 };
      break;
    }
    case "float": {
      map.hips = { x: Math.sin(t * 0.6) * 0.15, z: Math.sin(t * 0.45) * 0.1, py: Math.sin(t * 1.1) * 0.05 };
      map.head = { x: -0.1 };
      sides(map, "arm", { z: 0.85 + Math.sin(t * 1.3) * 0.12, x: -0.2 });
      sides(map, "fore", { x: -0.5 });
      sides(map, "leg", { z: 0.22, x: -0.25 });
      sides(map, "shin", { x: 0.55 });
      break;
    }
    case "sit": {
      map.hips = { py: -0.22 };
      sides(map, "leg", { x: -1.5, z: 0.06 });
      sides(map, "shin", { x: 1.45 });
      sides(map, "arm", { x: -0.45, z: 0.1 });
      sides(map, "fore", { x: -0.75 });
      map.head = { y: Math.sin(t * 0.5) * 0.12 };
      break;
    }
    case "pilot": {
      map.hips = { py: -0.22 };
      sides(map, "leg", { x: -1.45, z: 0.05 });
      sides(map, "shin", { x: 1.3 });
      sides(map, "arm", { x: -0.95, z: 0.18 });
      sides(map, "fore", { x: -0.6 });
      map.head = { x: -0.05 };
      break;
    }
    case "jump": {
      const phase = (t % 1.2) / 1.2;
      const crouch = phase < 0.25 ? Math.sin((phase / 0.25) * Math.PI) : 0;
      map.hips = { py: -crouch * 0.12 };
      sides(map, "leg", { x: -crouch * 0.7 });
      sides(map, "shin", { x: crouch * 1.3 });
      sides(map, "arm", { z: phase > 0.25 ? 2.3 : 0.3, x: -0.2 });
      break;
    }
    case "clap": {
      const c = (Math.sin(t * 12) + 1) / 2;
      sides(map, "arm", { x: -1.0, z: -0.25 + c * 0.25 });
      sides(map, "fore", { x: -0.7, y: 0.4 });
      map.head = { x: -0.06 };
      break;
    }
    case "think": {
      map.armR = { x: -0.7, z: -0.35 };
      map.foreR = { x: -2.1 };
      map.armL = { x: -0.5, z: 0.25 };
      map.foreL = { x: -1.3, y: -0.5 };
      map.head = { z: 0.15, x: -0.12 };
      break;
    }
  }
  return scale(map, amount);
}

function scale(map: PoseMap, amount: number): PoseMap {
  if (amount === 1) return map;
  const out: PoseMap = {};
  for (const [joint, pose] of Object.entries(map)) {
    out[joint] = { x: (pose.x ?? 0) * amount, y: (pose.y ?? 0) * amount, z: (pose.z ?? 0) * amount, py: (pose.py ?? 0) * amount };
  }
  return out;
}

interface RestState { rotation: THREE.Euler; position: THREE.Vector3 }

function rest(node: THREE.Object3D): RestState {
  let state = node.userData.rest as RestState | undefined;
  if (!state) {
    state = { rotation: node.rotation.clone(), position: node.position.clone() };
    node.userData.rest = state;
  }
  return state;
}

/** Sets a pose immediately (used by previews, blueprint sheets and tests). */
export function applyPose(model: BuiltModel, pose: string, t = 0) {
  const kind = model.blueprint.rig;
  if (!kind) return;
  const offsets = poseOffsets(kind, pose as PoseName, t);
  for (const [name, node] of model.joints) {
    const base = rest(node);
    const o = offsets[name];
    node.rotation.set(base.rotation.x + (o?.x ?? 0), base.rotation.y + (o?.y ?? 0), base.rotation.z + (o?.z ?? 0));
    node.position.y = base.position.y + (o?.py ?? 0);
  }
}

/**
 * Smoothly blends between poses every frame and adds blinking.
 */
export class Animator {
  pose: PoseName = "idle";
  time = Math.random() * 10;
  private blinkTimer = 2 + Math.random() * 3;
  private readonly eyes: THREE.Object3D[];
  readonly model: BuiltModel;
  readonly response: number;

  constructor(model: BuiltModel, response = 10) {
    this.model = model;
    this.response = response;
    this.eyes = model.tags.get("eye") ?? [];
    for (const node of model.joints.values()) rest(node);
  }
  set(pose: PoseName) {
    if (this.pose !== pose) this.pose = pose;
  }
  update(dt: number, speedScale = 1) {
    const kind = this.model.blueprint.rig;
    if (!kind) return;
    this.time += dt * speedScale;
    const offsets = poseOffsets(kind, this.pose, this.time);
    const k = 1 - Math.exp(-this.response * dt);
    for (const [name, node] of this.model.joints) {
      const base = rest(node);
      const o = offsets[name];
      node.rotation.x += (base.rotation.x + (o?.x ?? 0) - node.rotation.x) * k;
      node.rotation.y += (base.rotation.y + (o?.y ?? 0) - node.rotation.y) * k;
      node.rotation.z += (base.rotation.z + (o?.z ?? 0) - node.rotation.z) * k;
      node.position.y += (base.position.y + (o?.py ?? 0) - node.position.y) * k;
    }
    this.blinkTimer -= dt;
    let open = 1;
    if (this.blinkTimer < 0.14) open = Math.max(0.12, Math.abs(this.blinkTimer - 0.07) / 0.07);
    if (this.blinkTimer < 0) this.blinkTimer = 2.5 + Math.random() * 3.5;
    for (const eye of this.eyes) {
      const base = (eye.userData.baseScaleY as number | undefined) ?? (eye.userData.baseScaleY = eye.scale.y);
      eye.scale.y = base * open;
    }
  }
}

export const TWO_PI = TAU;
