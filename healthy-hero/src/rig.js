// Procedural animation for blueprint-built models. No keyframe files: every motion is a
// small function of time so it stays light on phones and matches the blueprint joints.
const TAU = Math.PI * 2;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (v) => v * v * (3 - 2 * v);

export const MOVE_BREAK = ['march', 'reach', 'sideStretch', 'armCircles', 'balance', 'wiggle'];

export class Rig {
  constructor(model) {
    this.model = model;
    this.type = model.spec.rig;
    this.j = model.joints;
    this.meshes = model.meshes;
    this.state = 'idle';
    this.prev = null;
    this.blend = 1;
    this.t = 0;
    this.stateT = 0;
    this.speed = 1;
    this.phase = 0;
    this.blinkT = 2 + Math.random() * 2;
    this.blink = 0;
    this.lookYaw = 0;
    this.spring = { tail: 0, tailV: 0, pony: 0, ponyV: 0 };
    this.root = model.root;
    this.baseY = 0;
    this.extraYaw = 0;
  }

  setState(name, { restart = false } = {}) {
    if (name === this.state && !restart) return;
    this.prev = { state: this.state, t: this.stateT, phase: this.phase };
    this.state = name;
    this.stateT = 0;
    this.blend = 0;
  }

  update(dt) {
    this.t += dt;
    this.stateT += dt;
    this.blend = Math.min(1, this.blend + dt / 0.22);
    const freq = this.cadence(this.state);
    this.phase += dt * freq * TAU * this.speed;
    // Blink
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 0.14; this.blinkT = 2.4 + Math.random() * 3; }
    this.blink = Math.max(0, this.blink - dt);
    const cur = this.evaluate(this.state, this.stateT, this.phase);
    let pose = cur;
    if (this.blend < 1 && this.prev) {
      const old = this.evaluate(this.prev.state, this.prev.t + this.stateT, this.prev.phase + this.stateT * this.cadence(this.prev.state) * TAU);
      pose = mixPose(old, cur, ease(this.blend));
    }
    this.apply(pose, dt);
  }

  cadence(state) {
    if (this.type === 'quadruped') return state === 'dash' ? 2.6 : state === 'run' ? 1.9 : state === 'jog' ? 1.5 : 0.5;
    if (this.type === 'hover') return state === 'dash' ? 2.4 : state === 'run' ? 1.6 : state === 'jog' ? 1.25 : 0.6;
    return state === 'dash' ? 1.9 : state === 'run' ? 1.45 : state === 'jog' ? 1.15 : 0.5;
  }

  // Static pose for blueprint sheets, e.g. poseAt('run', 0.25) = quarter of the run cycle.
  poseAt(state, cycleFraction, stateTime = 0.4) {
    const pose = this.evaluate(state, stateTime, cycleFraction * TAU);
    this.blink = 0;
    this.apply(pose, 0, true);
  }

  evaluate(state, t, ph) {
    const fn = this[`${this.type}Pose`];
    return fn ? fn.call(this, state, t, ph) : { joints: {}, y: 0, yaw: 0 };
  }

  apply(pose, dt, immediate = false) {
    for (const [name, obj] of Object.entries(this.j)) {
      const rest = obj.userData.restRot;
      if (!rest || obj === this.root) continue;
      const r = pose.joints[name];
      obj.rotation.set(rest.x + (r?.[0] || 0), rest.y + (r?.[1] || 0), rest.z + (r?.[2] || 0));
      const restPos = obj.userData.restPos;
      const p = pose.offsets?.[name];
      if (p) obj.position.set(restPos.x + p[0], restPos.y + p[1], restPos.z + p[2]);
      else obj.position.copy(restPos);
    }
    const hips = this.j.hips || this.j.body || this.j.hover;
    if (hips && pose.y !== undefined && this.type !== 'hover') {
      hips.position.y = hips.userData.restPos.y + pose.y;
    }
    if (this.type === 'hover' && this.j.hover) this.j.hover.position.y = pose.y || 0;
    this.root.rotation.y = (pose.yaw || 0) + this.extraYaw;
    // Eyes blink by squashing.
    const squash = immediate ? 1 : this.blink > 0 ? 0.12 : pose.eyesClosed ? 0.15 : 1;
    for (const id of ['eyeL', 'eyeR', 'scleraL', 'scleraR', 'irisL', 'irisR', 'pupilL', 'pupilR']) {
      const m = this.meshes[id];
      if (m) m.scale.y = (m.userData.part.scale?.[1] || 1) * squash;
    }
  }

  // ---------------------------------------------------------------------------------
  humanoidPose(state, t, ph) {
    const J = {};
    const sym = (n, x, y = 0, z = 0) => { J[`${n}L`] = [x, y, z]; J[`${n}R`] = [x, -y, -z]; };
    const set = (n, x, y = 0, z = 0) => { J[n] = [x, y, z]; };
    let y = 0, yaw = 0, eyesClosed = false;
    const s = Math.sin(ph), c = Math.cos(ph);
    switch (state) {
      case 'run': case 'jog': case 'dash': {
        const k = state === 'dash' ? 1.15 : state === 'jog' ? 0.75 : 1;
        set('hipL', -s * 0.62 * k); set('hipR', s * 0.62 * k);
        set('kneeL', (Math.pow(clamp01(c * 0.5 + 0.5), 1.4) * 1.25 + 0.12) * k);
        set('kneeR', (Math.pow(clamp01(-c * 0.5 + 0.5), 1.4) * 1.25 + 0.12) * k);
        set('ankleL', -0.15 + Math.max(0, -s) * 0.3); set('ankleR', -0.15 + Math.max(0, s) * 0.3);
        set('shoulderL', s * 0.75 * k, 0, -0.12); set('shoulderR', -s * 0.75 * k, 0, 0.12);
        sym('elbow', -1.25, 0, 0.04);
        set('spine', (state === 'dash' ? 0.26 : 0.12));
        set('chest', 0.02, s * 0.14 * k, 0);
        set('head', -0.1 - (state === 'dash' ? 0.12 : 0), -s * 0.06, 0);
        set('neck', 0, 0, 0);
        set('ponytail', 0.35 + Math.sin(ph * 2 - 0.9) * 0.18, 0, Math.sin(ph) * 0.14);
        y = Math.abs(Math.sin(ph)) * 0.045 * k - 0.01;
        break;
      }
      case 'stumble': {
        const p = clamp01(t / 0.9);
        yaw = ease(p) * TAU;
        y = Math.sin(p * Math.PI) * 0.22;
        sym('shoulder', -0.3, 0, 1.3 * Math.sin(p * Math.PI));
        sym('elbow', -0.4);
        set('hipL', -0.4 * Math.sin(p * Math.PI)); set('hipR', 0.3 * Math.sin(p * Math.PI));
        sym('knee', 0.5 * Math.sin(p * Math.PI));
        set('head', 0.1, 0, Math.sin(t * 18) * 0.12 * (1 - p));
        set('ponytail', 0.6, 0, Math.sin(t * 12) * 0.3);
        break;
      }
      case 'cheer': {
        const hop = Math.abs(Math.sin(t * Math.PI * 1.6));
        y = hop * 0.22;
        sym('shoulder', -0.25, 0, 2.55 + Math.sin(t * 9) * 0.12);
        sym('elbow', -0.25);
        sym('hip', -0.2 * hop); sym('knee', 0.5 * hop);
        set('head', -0.18); set('spine', -0.06);
        set('ponytail', 0.5 + hop * 0.3);
        break;
      }
      case 'wave': {
        sym('hip', 0); set('spine', 0.02);
        set('shoulderL', 0.05, 0, 0.1); set('elbowL', -0.15);
        set('shoulderR', -0.2, 0, -2.45); set('elbowR', -0.35, 0, Math.sin(t * 9) * 0.45);
        set('head', 0, 0.1 * Math.sin(t * 1.3), 0.08);
        set('ponytail', 0.25 + Math.sin(t * 2) * 0.05);
        y = Math.sin(t * 3) * 0.006;
        break;
      }
      case 'calm': {
        eyesClosed = true;
        sym('shoulder', -0.95, 0.25, -0.18);
        sym('elbow', -1.55, 0, 0.2);
        set('head', 0.12); set('spine', 0.02);
        set('ponytail', 0.2);
        y = 0.02 + Math.sin(t * 2.2) * 0.012;
        break;
      }
      case 'march': {
        const m = Math.sin(t * TAU * 0.9);
        set('hipL', -Math.max(0, m) * 1.25); set('hipR', -Math.max(0, -m) * 1.25);
        set('kneeL', Math.max(0, m) * 1.5); set('kneeR', Math.max(0, -m) * 1.5);
        set('shoulderL', m * 0.7, 0, -0.1); set('shoulderR', -m * 0.7, 0, 0.1);
        sym('elbow', -1.3);
        set('ponytail', 0.3 + Math.abs(m) * 0.15);
        y = -Math.abs(m) * 0.02;
        break;
      }
      case 'reach': {
        const r = Math.sin(t * TAU * 0.45);
        set('shoulderL', -0.1, 0, 2.7 + Math.max(0, r) * 0.25); set('shoulderR', -0.1, 0, -2.7 - Math.max(0, -r) * 0.25);
        sym('elbow', -0.05);
        set('spine', -0.05, 0, r * 0.08);
        set('head', -0.2);
        set('ankleL', 0.35 + Math.abs(r) * 0.2); set('ankleR', 0.35 + Math.abs(r) * 0.2);
        y = 0.03 + Math.abs(r) * 0.025;
        set('ponytail', 0.2);
        break;
      }
      case 'sideStretch': {
        const r = Math.sin(t * TAU * 0.3);
        const lean = r * 0.34;
        set('spine', 0, 0, -lean * 0.6); set('chest', 0, 0, -lean * 0.6);
        if (r > 0) { set('shoulderL', 0, 0, 2.6); set('shoulderR', 0, 0, 0.05); }
        else { set('shoulderR', 0, 0, -2.6); set('shoulderL', 0, 0, -0.05); }
        sym('elbow', -0.35);
        set('head', 0, 0, -lean * 0.4);
        set('ponytail', 0.2, 0, lean);
        break;
      }
      case 'armCircles': {
        const a = t * TAU * 0.75;
        sym('shoulder', Math.sin(a) * 0.55, 0, 1.45 + Math.cos(a) * 0.35);
        sym('elbow', -0.1);
        set('ponytail', 0.25 + Math.sin(a) * 0.05);
        y = Math.sin(a * 2) * 0.006;
        break;
      }
      case 'balance': {
        const w = Math.sin(t * 2.3) * 0.05;
        set('hipL', -0.55); set('kneeL', 1.5); set('ankleL', 0.3);
        set('hipR', 0, 0, w * 0.4);
        sym('shoulder', 0, 0, 1.35 + w);
        sym('elbow', -0.1);
        set('spine', 0, 0, w);
        set('ponytail', 0.25, 0, w * 3);
        break;
      }
      case 'wiggle': {
        const w = Math.sin(t * TAU * 1.4);
        set('hips', 0, w * 0.25, w * 0.08);
        set('chest', 0, -w * 0.3, -w * 0.06);
        set('shoulderL', -0.4, 0, 0.6 + w * 0.4); set('shoulderR', -0.4, 0, -0.6 + w * 0.4);
        sym('elbow', -1.6);
        sym('knee', 0.18 + Math.abs(w) * 0.12); sym('hip', -0.1);
        set('head', 0, w * 0.2, w * 0.12);
        set('ponytail', 0.3, 0, -w * 0.4);
        y = -0.02 - Math.abs(w) * 0.02;
        break;
      }
      case 'think': {
        set('shoulderR', -1.2, 0, 0.2); set('elbowR', -2.2, 0, 0.6);
        set('shoulderL', 0.1, 0, 0.12);
        set('head', 0.08, 0.2, 0.12);
        set('ponytail', 0.2);
        y = Math.sin(t * 1.8) * 0.006;
        break;
      }
      default: { // idle
        const b = Math.sin(t * 1.7);
        set('spine', b * 0.012); set('chest', -b * 0.01);
        set('shoulderL', 0.02 * b, 0, 0.03 * b); set('shoulderR', 0.02 * b, 0, -0.03 * b);
        sym('elbow', -0.12);
        set('head', 0.02 * Math.sin(t * 0.7), 0.18 * Math.sin(t * 0.45), 0.04 * Math.sin(t * 0.6));
        set('ponytail', 0.18 + b * 0.03, 0, Math.sin(t * 0.9) * 0.05);
        y = b * 0.004;
      }
    }
    return { joints: J, y, yaw, eyesClosed };
  }

  // ---------------------------------------------------------------------------------
  hoverPose(state, t, ph) {
    const J = {};
    const sym = (n, x, y = 0, z = 0) => { J[`${n}L`] = [x, y, z]; J[`${n}R`] = [x, -y, -z]; };
    const set = (n, x, y = 0, z = 0) => { J[n] = [x, y, z]; };
    let y = 0, yaw = 0, eyesClosed = false;
    const s = Math.sin(ph);
    switch (state) {
      case 'run': case 'jog': case 'dash': {
        const k = state === 'dash' ? 1.3 : state === 'jog' ? 0.7 : 1;
        set('body', 0.16 * k + (state === 'dash' ? 0.12 : 0), 0, Math.sin(ph) * 0.05);
        set('head', -0.08 * k, -s * 0.06);
        set('shoulderL', s * 0.9 * k, 0, 0.1); set('shoulderR', -s * 0.9 * k, 0, -0.1);
        set('antenna', Math.sin(ph * 2) * 0.1 - 0.2 * k, 0, Math.sin(ph) * 0.18);
        y = 0.02 + Math.sin(ph * 2) * 0.022;
        break;
      }
      case 'stumble': {
        const p = clamp01(t / 0.9);
        yaw = ease(p) * TAU;
        y = 0.02 + Math.sin(p * Math.PI) * 0.25;
        sym('shoulder', -0.2, 0, 1.4 * Math.sin(p * Math.PI));
        set('head', 0, 0, Math.sin(t * 18) * 0.15 * (1 - p));
        set('antenna', 0, 0, Math.sin(t * 22) * 0.5 * (1 - p));
        break;
      }
      case 'cheer': {
        const hop = Math.abs(Math.sin(t * Math.PI * 1.6));
        y = 0.04 + hop * 0.26;
        sym('shoulder', 0, 0, 2.3 + Math.sin(t * 10) * 0.15);
        set('head', -0.15, 0, Math.sin(t * 3) * 0.08);
        set('antenna', 0, 0, Math.sin(t * 14) * 0.3);
        break;
      }
      case 'wave': {
        set('shoulderR', 0, 0, -2.3 + Math.sin(t * 9) * 0.35); set('shoulderL', 0, 0, 0.1);
        set('head', 0, 0.12 * Math.sin(t * 1.4), 0.1);
        set('antenna', 0, 0, Math.sin(t * 6) * 0.2);
        y = 0.04 + Math.sin(t * 2.4) * 0.02;
        break;
      }
      case 'calm': {
        eyesClosed = true;
        sym('shoulder', -0.9, 0.3, -0.45);
        set('head', 0.12);
        y = 0.06 + Math.sin(t * 2) * 0.03;
        break;
      }
      case 'march': case 'balance': case 'reach': case 'sideStretch': case 'armCircles': case 'wiggle': {
        const m = Math.sin(t * TAU * 0.9);
        if (state === 'reach') { sym('shoulder', 0, 0, 2.7); y = 0.06 + Math.abs(Math.sin(t * TAU * 0.45)) * 0.08; }
        else if (state === 'armCircles') { const a = t * TAU * 0.75; sym('shoulder', Math.sin(a) * 0.6, 0, 1.5 + Math.cos(a) * 0.35); y = 0.04; }
        else if (state === 'sideStretch') { const r = Math.sin(t * TAU * 0.3); set('body', 0, 0, -r * 0.3); if (r > 0) set('shoulderL', 0, 0, 2.6); else set('shoulderR', 0, 0, -2.6); y = 0.04; }
        else if (state === 'balance') { set('body', 0, 0, Math.sin(t * 2.3) * 0.12); sym('shoulder', 0, 0, 1.4); y = 0.08; }
        else if (state === 'wiggle') { const w = Math.sin(t * TAU * 1.4); set('body', 0, w * 0.4, w * 0.12); sym('shoulder', -0.4, 0, 0.8 + w * 0.4); set('head', 0, -w * 0.3, 0); y = 0.04 + Math.abs(w) * 0.03; }
        else { set('body', 0, 0, m * 0.08); set('shoulderL', m * 0.8); set('shoulderR', -m * 0.8); y = 0.03 + Math.abs(m) * 0.06; }
        set('antenna', 0, 0, Math.sin(t * 7) * 0.2);
        break;
      }
      case 'think': {
        set('shoulderR', -1.4, 0, 0.3); set('head', 0.08, 0.25, 0.12); y = 0.04 + Math.sin(t * 1.8) * 0.015;
        break;
      }
      default: {
        y = 0.03 + Math.sin(t * TAU * 0.6) * 0.025;
        set('head', 0.02 * Math.sin(t * 0.8), 0.2 * Math.sin(t * 0.5), 0);
        sym('shoulder', 0.04 * Math.sin(t * 1.2), 0, 0.05 * Math.sin(t * 1.2));
        set('antenna', 0, 0, Math.sin(t * 1.9) * 0.08);
      }
    }
    return { joints: J, y, yaw, eyesClosed };
  }

  // ---------------------------------------------------------------------------------
  quadrupedPose(state, t, ph) {
    const J = {};
    const set = (n, x, y = 0, z = 0) => { J[n] = [x, y, z]; };
    let y = 0, yaw = 0, eyesClosed = false;
    const s = Math.sin(ph);
    const legs = (amp, kneeAmp) => {
      set('frontL', Math.sin(ph) * amp); set('frontR', Math.sin(ph + 0.45) * amp);
      set('backL', Math.sin(ph + Math.PI) * amp); set('backR', Math.sin(ph + Math.PI + 0.45) * amp);
      set('frontKneeL', Math.max(0, Math.sin(ph + 1.6)) * kneeAmp); set('frontKneeR', Math.max(0, Math.sin(ph + 2.05)) * kneeAmp);
      set('backKneeL', -Math.max(0, Math.sin(ph + Math.PI + 1.6)) * kneeAmp * 0.8); set('backKneeR', -Math.max(0, Math.sin(ph + Math.PI + 2.05)) * kneeAmp * 0.8);
    };
    switch (state) {
      case 'run': case 'jog': case 'dash': {
        const k = state === 'dash' ? 1.2 : state === 'jog' ? 0.7 : 1;
        legs(0.75 * k, 1.1 * k);
        set('body', Math.sin(ph * 2) * 0.07 * k);
        set('neck', -0.1 - Math.sin(ph * 2) * 0.06);
        set('head', 0.05 - Math.sin(ph * 2) * 0.05);
        set('tailBase', -0.35 + Math.sin(ph * 2) * 0.12, Math.sin(ph) * 0.15);
        set('tail1', Math.sin(ph * 2 - 0.7) * 0.18, Math.sin(ph - 0.5) * 0.15);
        set('tail2', Math.sin(ph * 2 - 1.3) * 0.22, Math.sin(ph - 1) * 0.15);
        set('earL', -0.25 * k, 0, 0); set('earR', -0.25 * k, 0, 0);
        y = Math.abs(Math.sin(ph)) * 0.05 * k;
        break;
      }
      case 'stumble': {
        const p = clamp01(t / 0.9);
        yaw = ease(p) * TAU;
        y = Math.sin(p * Math.PI) * 0.25;
        legs(0.4 * Math.sin(p * Math.PI), 0.6);
        set('tailBase', 0.2, Math.sin(t * 20) * 0.4);
        set('head', 0, 0, Math.sin(t * 16) * 0.2 * (1 - p));
        break;
      }
      case 'cheer': case 'wave': case 'march': case 'reach': case 'wiggle': case 'balance': case 'sideStretch': case 'armCircles': {
        const hop = Math.abs(Math.sin(t * Math.PI * (state === 'cheer' ? 1.6 : 1.1)));
        y = hop * (state === 'cheer' ? 0.2 : 0.08);
        if (state === 'wave' || state === 'reach') { set('frontR', -1.1 + Math.sin(t * 9) * 0.25); set('frontKneeR', 0.9); set('body', -0.25); y = 0.04; }
        else if (state === 'balance') { set('frontL', -0.6); set('frontKneeL', 1.0); set('backR', 0.5); set('backKneeR', -0.8); }
        else if (state === 'sideStretch') { set('body', 0, 0, Math.sin(t * TAU * 0.3) * 0.18); }
        else if (state === 'armCircles') { yaw = (t * 1.6) % TAU; }
        else legs(0.35 * hop, 0.6);
        set('tailBase', -0.7, Math.sin(t * 10) * 0.5);
        set('tail1', 0, Math.sin(t * 10 - 0.6) * 0.3);
        set('tail2', 0, Math.sin(t * 10 - 1.2) * 0.3);
        set('head', -0.15, 0, Math.sin(t * 3) * 0.1);
        break;
      }
      case 'calm': {
        eyesClosed = true;
        set('frontL', -0.5); set('frontR', -0.5); set('frontKneeL', 1.2); set('frontKneeR', 1.2);
        set('backL', -0.9); set('backR', -0.9); set('backKneeL', 0.2); set('backKneeR', 0.2);
        set('body', -0.18); set('head', 0.15); set('tailBase', 0.1, 0.9);
        y = -0.12;
        break;
      }
      case 'think': {
        set('head', 0.05, 0.25, 0.3); set('tailBase', -0.4, Math.sin(t * 3) * 0.3); set('earL', 0, 0, 0.2);
        break;
      }
      default: {
        const b = Math.sin(t * 1.6);
        set('body', b * 0.01);
        set('head', 0.03 * Math.sin(t * 0.7), 0.25 * Math.sin(t * 0.45), 0.06 * Math.sin(t * 0.55));
        set('tailBase', -0.45 + b * 0.04, Math.sin(t * 2.2) * 0.35);
        set('tail1', 0, Math.sin(t * 2.2 - 0.6) * 0.25);
        set('tail2', 0, Math.sin(t * 2.2 - 1.2) * 0.25);
        const tw = Math.max(0, Math.sin(t * 0.9) - 0.96) * 6;
        set('earL', -tw * 0.5); set('earR', -tw * 0.3);
      }
    }
    return { joints: J, y, yaw, eyesClosed };
  }
}

function mixPose(a, b, w) {
  const joints = {};
  const names = new Set([...Object.keys(a.joints), ...Object.keys(b.joints)]);
  for (const n of names) {
    const x = a.joints[n] || [0, 0, 0], y = b.joints[n] || [0, 0, 0];
    joints[n] = [x[0] + (y[0] - x[0]) * w, x[1] + (y[1] - x[1]) * w, x[2] + (y[2] - x[2]) * w];
  }
  const wrap = (v) => Math.atan2(Math.sin(v), Math.cos(v));
  let yawA = wrap(a.yaw || 0), yawB = wrap(b.yaw || 0);
  if (yawB - yawA > Math.PI) yawA += Math.PI * 2; else if (yawA - yawB > Math.PI) yawB += Math.PI * 2;
  return { joints, y: (a.y || 0) + ((b.y || 0) - (a.y || 0)) * w, yaw: yawA + (yawB - yawA) * w, eyesClosed: w > 0.5 ? b.eyesClosed : a.eyesClosed };
}
