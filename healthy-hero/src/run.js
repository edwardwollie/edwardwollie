// The 3D run: hero + companion on a three-lane track, Power Gates, biome world and camera.
// Game rules and timers live in main.js; this file only shows what is happening.
import * as THREE from './vendor/three.module.min.js?v=2.0.1';
import { LAYOUT, laneX } from './blueprints.js?v=2.0.1';
import { buildModel } from './models.js?v=2.0.1';
import { Rig } from './rig.js?v=2.0.1';
import { World } from './world.js?v=2.0.1';
import { GateTrio } from './gates.js?v=2.0.1';
import { Bursts, fresnelMaterial, glowSprite } from './effects.js?v=2.0.1';
import { dotTexture } from './engine.js?v=2.0.1';
import { LANES, WORLDS } from './content.js?v=2.0.1';

const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

export class RunScene {
  constructor(engine) {
    this.engine = engine;
    this.scene = new THREE.Scene();
    this.scene.environment = engine.envMap;
    this.scene.environmentIntensity = 0.45;
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 700);
    this.world = new World(this.scene, { density: engine.q.density, shadows: engine.q.shadows });
    this.bursts = new Bursts(this.scene, 240);
    this.gates = new GateTrio(this.scene, this.bursts);
    this.models = {};
    this.lane = 1;
    this.heroX = laneX(1);
    this.heroVX = 0;
    this.speed = LAYOUT.jogSpeed;
    this.targetSpeed = LAYOUT.jogSpeed;
    this.fovKick = 0;
    this.shake = 0;
    this.camX = 0;
    this.approach = null;
    this.reducedMotion = engine.reducedMotion;
    this.buildLaneHighlight();
    this.buildBlob();
    this.buildShield();
    this.buildSpeedLines();
    this.setHero('pip');
    engine.on((type) => { if (type === 'quality') this.world.setShadows(this.engine.q.shadows); });
  }

  // --- Setup ---------------------------------------------------------------------------
  getModel(id) {
    if (!this.models[id]) {
      const m = buildModel(id, { lod: 1, shadows: true });
      const rig = new Rig(m);
      rig.extraYaw = Math.PI; // models face +Z; the run goes toward −Z
      rig.setState('jog');
      this.models[id] = { m, rig };
    }
    return this.models[id];
  }

  setHero(id) {
    if (this.hero) this.scene.remove(this.hero.m.root);
    if (this.buddy) this.scene.remove(this.buddy.m.root);
    this.heroId = id;
    this.hero = this.getModel(id);
    this.buddy = this.getModel(id === 'pip' ? 'ginger' : 'pip');
    this.scene.add(this.hero.m.root, this.buddy.m.root);
    this.hero.m.root.position.set(this.heroX, 0, 0);
    this.buddy.m.root.position.set(LAYOUT.lanes * LAYOUT.laneWidth / 2 + 0.3, 0, -0.9);
    this.hero.rig.setState('jog', { restart: true });
    this.buddy.rig.setState('jog', { restart: true });
  }

  buildLaneHighlight() {
    const c = document.createElement('canvas'); c.width = 16; c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.9)'); grd.addColorStop(1, 'rgba(255,255,255,0.15)');
    g.fillStyle = grd; g.fillRect(0, 0, 16, 256);
    const tex = new THREE.CanvasTexture(c);
    this.laneMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: '#ffffff' });
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2); geo.translate(0, 0, -0.5);
    this.laneGlow = new THREE.Mesh(geo, this.laneMat);
    this.laneGlow.position.y = 0.03;
    this.laneGlow.renderOrder = 2;
    this.scene.add(this.laneGlow);
  }

  buildBlob() {
    const m = new THREE.MeshBasicMaterial({ map: dotTexture('rgba(0,0,0,0.45)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false });
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    this.blob = new THREE.Mesh(geo, m); this.blob.position.y = 0.025; this.blob.scale.set(0.9, 1, 0.75);
    this.buddyBlob = this.blob.clone(); this.buddyBlob.scale.set(0.6, 1, 0.8);
    this.scene.add(this.blob, this.buddyBlob);
  }

  buildShield() {
    this.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), fresnelMaterial('#7af8ff', 2.0, 1.4, 0.04));
    this.shieldMesh.visible = false;
    this.shieldT = 0;
    this.scene.add(this.shieldMesh);
    this.heartGlow = glowSprite('#63f2c0', 1.4);
    this.heartGlow.visible = false;
    this.scene.add(this.heartGlow);
  }

  buildSpeedLines() {
    const geo = new THREE.PlaneGeometry(0.04, 3.2); geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.lines = new THREE.InstancedMesh(geo, mat, 40);
    this.lines.frustumCulled = false;
    this.lineData = Array.from({ length: 40 }, () => ({ x: (Math.random() - 0.5) * 16, y: 0.4 + Math.random() * 4, z: -Math.random() * 40 }));
    this.scene.add(this.lines);
    this.dashT = 0;
  }

  // --- API used by main.js ---------------------------------------------------------------
  startMission(topic) {
    this.world.setBiome(topic, { instant: true });
    this.gates.hide();
    this.approach = null;
    this.lane = 1;
    this.targetSpeed = LAYOUT.jogSpeed;
    this.hero.rig.setState('jog');
    this.buddy.rig.setState('jog');
    this.finished = false;
  }

  prepareEncounter({ topic, choices }) {
    if (topic !== this.world.biome) this.world.setBiome(topic);
    this.gates.setEncounter({ topic, choices });
    this.gates.flyIn();
    this.gates.select(this.lane);
    this.approach = null;
    this.topic = topic;
    this.targetSpeed = LAYOUT.jogSpeed;
    this.hero.rig.setState('jog');
  }

  setPhase(phase) {
    this.phase = phase;
    if (phase === 'answer') { this.gates.unlock(); this.targetSpeed = LAYOUT.runSpeed; this.hero.rig.setState('run'); this.buddy.rig.setState('run'); }
    else if (phase === 'listen' || phase === 'think') { this.gates.locked = true; this.targetSpeed = LAYOUT.jogSpeed; this.hero.rig.setState('jog'); this.buddy.rig.setState('jog'); }
  }

  setApproach(startedAt, ms) { this.approachInfo = startedAt ? { startedAt, ms } : null; }

  setLane(lane) {
    this.lane = lane;
    this.gates.select(lane);
  }

  resolve(outcome) {
    this.approachInfo = null;
    this.gates.resolve(outcome);
    this.hero.rig.setState('dash');
    this.targetSpeed = 15;
    this.dashT = 0.7;
    if (!this.reducedMotion) this.fovKick = 7;
    const topicColor = WORLDS[this.topic]?.color || '#63f2c0';
    clearTimeout(this.resolveTimer);
    this.resolveTimer = setTimeout(() => {
      if (outcome.correct) {
        this.hero.rig.setState('run');
        this.heartPulse = 0.8;
        this.bursts.burst(new THREE.Vector3(this.heroX, 1.0, -0.2), [topicColor, '#ffffff'], { count: 14, speed: 3, up: 2.6, size: 0.06, life: 0.7, gravity: -5 });
      } else {
        this.hero.rig.setState('stumble', { restart: true });
        if (!this.reducedMotion) this.shake = 0.35;
        setTimeout(() => this.hero.rig.setState('run'), 900);
      }
      this.targetSpeed = LAYOUT.runSpeed;
    }, 430);
  }

  calm() {
    this.shieldT = 0.7;
    const prev = this.hero.rig.state;
    this.hero.rig.setState('calm');
    clearTimeout(this.calmTimer);
    this.calmTimer = setTimeout(() => this.hero.rig.setState(prev === 'calm' ? 'jog' : prev), 650);
  }

  finish() {
    this.finished = true;
    this.targetSpeed = 0;
    this.gates.hide();
    this.hero.rig.setState('cheer');
    this.buddy.rig.setState('cheer');
  }

  pauseRun(paused) { this.paused = paused; }

  resize() {
    const f = this.engine.focus || { w: this.engine.width, h: this.engine.height };
    const portrait = f.w / Math.max(1, f.h) < 1.1;
    const C = LAYOUT.camera;
    // Narrow screens: a lower, closer camera keeps the gates large while all lanes stay visible.
    this.cam = portrait ? { ...C, height: C.height - 0.35, back: C.back - 0.9, lookAhead: C.lookAhead + 1.5, lookHeight: C.lookHeight + 0.1 } : C;
    this.engine.applyFocus(this.camera, { vFov: 50, hFovMin: portrait ? 62 : 64, hFovMax: 82 });
    // Effective half-FOV over the focus rect (tangent), used to aim the camera.
    const H = this.engine.height, fr = this.engine.focus && this.engine.focus.h > 20 ? this.engine.focus.h : H;
    const fpx = (H / 2) / Math.tan((this.camera.fov * Math.PI) / 360);
    this.tanHalf = (fr / 2) / fpx;
  }

  // --- Frame ---------------------------------------------------------------------------
  update(dt, t) {
    const speedTarget = this.paused ? LAYOUT.jogSpeed * 0.6 : this.targetSpeed;
    this.speed = damp(this.speed, speedTarget, 2.2, dt);
    let progress = null;
    if (this.approachInfo) progress = Math.min(1, (Date.now() - this.approachInfo.startedAt) / this.approachInfo.ms);
    this.world.update(dt, t, this.speed);
    this.gates.update(dt, t, { approach: progress, speed: this.speed });
    this.bursts.update(dt, this.speed * 0.6);
    // Hero lane motion (spring)
    const tx = laneX(this.lane);
    const ax = (tx - this.heroX) * 70 - this.heroVX * 14;
    this.heroVX += ax * dt;
    this.heroX += this.heroVX * dt;
    const hr = this.hero.m.root;
    hr.position.x = this.heroX;
    hr.rotation.z = THREE.MathUtils.clamp(-this.heroVX * 0.035, -0.25, 0.25);
    this.hero.rig.speed = this.finished ? 1 : 0.75 + this.speed / 18;
    this.hero.rig.update(dt);
    // Buddy follows on the curb opposite the hero
    const edge = LAYOUT.lanes * LAYOUT.laneWidth / 2 + 0.3;
    const side = this.lane === 0 ? 1 : this.lane === 2 ? -1 : (this.buddySide || 1);
    this.buddySide = side;
    const br = this.buddy.m.root;
    br.position.x = damp(br.position.x, side * edge, 3, dt);
    br.position.z = -0.9 + Math.sin(t * 0.7) * 0.35;
    this.buddy.rig.speed = 0.75 + this.speed / 18;
    this.buddy.rig.update(dt);
    this.blob.position.x = this.heroX; this.blob.position.z = 0.05;
    this.buddyBlob.position.set(br.position.x, 0.025, br.position.z);
    // Lane highlight up to the gates
    const showLane = this.gates.phase === 'parked' || this.gates.phase === 'approach' || this.gates.phase === 'flyIn';
    this.laneGlow.visible = showLane;
    if (showLane) {
      const len = Math.max(1, this.gates.distance - 0.6);
      this.laneGlow.scale.set(LAYOUT.laneWidth * 0.86, 1, len);
      this.laneGlow.position.x = damp(this.laneGlow.position.x, tx, 14, dt);
      this.laneGlow.position.z = -0.6;
      this.laneMat.color.set(LANES[this.lane].color);
      this.laneMat.opacity = 0.28 + Math.sin(t * 5) * 0.08 + (this.phase === 'answer' ? 0.1 : 0);
    }
    // Calm shield + heart pulse
    if (this.shieldT > 0) {
      this.shieldT -= dt;
      const k = Math.max(0, this.shieldT / 0.7);
      this.shieldMesh.visible = true;
      this.shieldMesh.position.set(this.heroX, 0.75, 0);
      this.shieldMesh.scale.setScalar(0.85 + (1 - k) * 0.35);
      this.shieldMesh.material.uniforms.uOpacity.value = Math.sin(k * Math.PI);
    } else this.shieldMesh.visible = false;
    if (this.heartPulse > 0) {
      this.heartPulse -= dt;
      this.heartGlow.visible = true;
      this.heartGlow.position.set(this.heroX, 0.9, 0.3);
      this.heartGlow.material.opacity = Math.max(0, this.heartPulse / 0.8);
      this.heartGlow.scale.setScalar(1 + (0.8 - this.heartPulse) * 2.4);
    } else this.heartGlow.visible = false;
    // Speed lines while dashing
    this.dashT = Math.max(0, this.dashT - dt);
    this.lines.material.opacity = this.reducedMotion ? 0 : Math.min(0.5, this.dashT * 0.9);
    if (this.lines.material.opacity > 0.01) {
      const d = new THREE.Object3D();
      this.lineData.forEach((L, i) => {
        L.z += (this.speed * 2.5) * dt;
        if (L.z > 6) { L.z = -40; L.x = (Math.random() - 0.5) * 16; L.y = 0.4 + Math.random() * 4; }
        d.position.set(L.x, L.y, L.z); d.updateMatrix(); this.lines.setMatrixAt(i, d.matrix);
      });
      this.lines.instanceMatrix.needsUpdate = true;
    }
    // Camera
    const C = this.cam || LAYOUT.camera;
    this.camX = damp(this.camX, this.heroX * 0.55, 4, dt);
    this.fovKick = damp(this.fovKick, 0, 3, dt);
    this.shake = Math.max(0, this.shake - dt);
    const sx = this.shake > 0 ? Math.sin(t * 70) * 0.08 * this.shake : 0;
    const sy = this.shake > 0 ? Math.cos(t * 63) * 0.06 * this.shake : 0;
    const bob = this.reducedMotion ? 0 : Math.sin(t * 9) * 0.015 * (this.speed / 9);
    this.camera.position.set(this.camX + sx, C.height + bob + sy, C.back);
    // Aim so the runner's middle sits halfway between the focus center and its bottom edge.
    const alphaRunner = Math.atan2(C.height - 0.6, C.back);
    const pitch = alphaRunner - Math.atan(0.5 * (this.tanHalf || 0.47));
    const lookDist = 12;
    this.camera.lookAt(this.heroX * 0.35 + (this.camX - this.heroX * 0.55) * 0, C.height - Math.tan(pitch) * lookDist, C.back - lookDist);
    if (this.fovKick > 0.05) {
      this.engine.applyFocus(this.camera, { vFov: 50 + this.fovKick, hFovMin: 64 + this.fovKick, hFovMax: 82 + this.fovKick });
      this.kicked = true;
    } else if (this.kicked) { this.kicked = false; this.resize(); }
    this.world.sunTarget.position.set(this.heroX, 0, -5);
    this.world.sun.position.set(this.heroX + 5, 11, 6);
  }
}
