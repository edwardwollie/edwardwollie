// Three Power Gates built from the "gate" blueprint. Each carries an answer sign texture split
// across its two panels, a lane badge, and the topic emblem in its beacon.
import * as THREE from './vendor/three.module.min.js?v=2.0.1';
import { LAYOUT, laneX, EMBLEM_BY_TOPIC } from './blueprints.js?v=2.0.1';
import { buildModel } from './models.js?v=2.0.1';
import { LANES, WORLDS } from './content.js?v=2.0.1';

const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const SIGN_W = 1024, SIGN_H = 512;

function wrapLines(g, text, maxW) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

export function drawSign(canvas, text, lane, topicColor) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  g.clearRect(0, 0, W, H);
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#ffffff'); grd.addColorStop(1, '#e9f6ff');
  g.fillStyle = grd;
  g.beginPath(); g.roundRect(10, 10, W - 20, H - 20, 46); g.fill();
  g.lineWidth = 16; g.strokeStyle = topicColor; g.stroke();
  // Lane badge
  const L = LANES[lane];
  g.fillStyle = L.color; g.beginPath(); g.arc(92, 92, 58, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff'; g.font = "900 64px Nunito, system-ui, sans-serif"; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(lane + 1), 92, 96);
  g.fillStyle = L.color; g.font = "900 46px Nunito, system-ui, sans-serif"; g.fillText(L.shape, W - 86, 92);
  // Text (auto-fit, up to 4 lines)
  g.fillStyle = '#10203b';
  let size = 96, lines;
  for (; size >= 40; size -= 4) {
    g.font = `800 ${size}px 'Baloo 2', Nunito, system-ui, sans-serif`;
    lines = wrapLines(g, text, W - 150);
    if (lines.length * size * 1.02 <= H - 170 && lines.length <= 4) break;
  }
  const lh = size * 1.02;
  const top = H / 2 + 34 - ((lines.length - 1) * lh) / 2;
  lines.forEach((ln, i) => g.fillText(ln, W / 2, top + i * lh));
}

function badgeTexture(lane) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const L = LANES[lane];
  g.fillStyle = L.color; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
  g.lineWidth = 8; g.strokeStyle = '#ffffff'; g.stroke();
  g.fillStyle = '#ffffff'; g.font = "900 76px Nunito, system-ui, sans-serif"; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(lane + 1), 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const shieldMaterial = () => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
  uniforms: { uColor: { value: new THREE.Color('#63f2c0') }, uTime: { value: 0 }, uOpacity: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform vec3 uColor; uniform float uTime, uOpacity; varying vec2 vUv;
    void main(){ float stripes = smoothstep(0.35,0.5, fract((vUv.x + vUv.y*0.6)*7.0 - uTime*0.6));
      float edge = smoothstep(0.42, 0.5, max(abs(vUv.x-0.5), abs(vUv.y-0.5)));
      float hex = 0.25 + 0.75*stripes;
      gl_FragColor = vec4(mix(uColor, vec3(1.0), edge*0.6), (0.16*hex + edge*0.5) * uOpacity); }`
});

export class GateTrio {
  constructor(parent, bursts) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.bursts = bursts;
    this.gates = [0, 1, 2].map((i) => this.makeGate(i));
    this.distance = LAYOUT.gate.spawnDistance;
    this.phase = 'hidden';
    this.group.visible = false;
    this.selected = 1;
    this.t = 0;
  }

  makeGate(lane) {
    const m = buildModel('gate', { lod: 1, shadows: true });
    const root = m.root;
    root.position.x = laneX(lane);
    const mats = m.materials;
    // Lane colors
    mats.laneGlow.color.set(LANES[lane].color);
    mats.badge.color.set(LANES[lane].color);
    // Sign: one canvas, two textures (screen-left panel shows the left half).
    const canvas = document.createElement('canvas'); canvas.width = SIGN_W; canvas.height = SIGN_H;
    const texLeft = new THREE.CanvasTexture(canvas), texRight = new THREE.CanvasTexture(canvas);
    for (const t of [texLeft, texRight]) { t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(0.5, 1); t.anisotropy = 8; }
    texRight.offset.set(0.5, 0);
    // panel "R" sits at −X = screen-left when the gate faces the camera.
    m.meshes.signR.material = new THREE.MeshBasicMaterial({ map: texLeft, toneMapped: false });
    m.meshes.signL.material = new THREE.MeshBasicMaterial({ map: texRight, toneMapped: false });
    // Separate panel materials so each half can fade on its own.
    m.meshes.panelL.material = mats.panel.clone();
    m.meshes.panelR.material = mats.panel.clone();
    // Badge number decal
    const badge = new THREE.Mesh(new THREE.CircleGeometry(0.16, 32), new THREE.MeshBasicMaterial({ map: badgeTexture(lane), transparent: true, toneMapped: false }));
    badge.position.set(0, 2.46, 0.285);
    m.joints.frame.add(badge);
    // Lock shield
    const shield = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.0), shieldMaterial());
    shield.position.set(0, 1.24, 0.12);
    m.joints.frame.add(shield);
    // Emblems in the beacon (one per topic, only the active one visible)
    const emblems = EMBLEM_BY_TOPIC.map((id) => { const e = buildModel(id, { lod: 1 }); e.root.scale.setScalar(0.95); e.root.visible = false; m.joints.beacon.add(e.root); return e.root; });
    this.group.add(root);
    return { lane, m, root, canvas, texLeft, texRight, shield, emblems, state: 'idle', st: 0, wobble: 0, baseX: laneX(lane) };
  }

  setEncounter({ topic, choices }) {
    this.topic = topic;
    const color = WORLDS[topic].color;
    const frameColor = new THREE.Color(color);
    const panelColor = frameColor.clone().lerp(new THREE.Color('#0b2a4a'), 0.5);
    for (const g of this.gates) {
      drawSign(g.canvas, choices[g.lane], g.lane, color);
      g.texLeft.needsUpdate = true; g.texRight.needsUpdate = true;
      g.m.materials.frame.color.copy(frameColor);
      g.m.materials.frame.emissive?.set('#000000');
      for (const p of [g.m.meshes.panelL, g.m.meshes.panelR]) { p.material.color.copy(panelColor); p.material.emissive?.copy(panelColor); p.material.opacity = 0.86; }
      g.shield.material.uniforms.uColor.value.copy(frameColor);
      g.emblems.forEach((e, i) => { e.visible = i === topic; });
      this.resetGate(g);
    }
  }

  resetGate(g) {
    const J = g.m.joints;
    J.panelL.position.copy(J.panelL.userData.restPos); J.panelL.rotation.set(0, 0, 0);
    J.panelR.position.copy(J.panelR.userData.restPos); J.panelR.rotation.set(0, 0, 0);
    g.root.position.set(g.baseX, 0, 0); g.root.rotation.set(0, 0, 0); g.root.scale.setScalar(1);
    g.m.meshes.core.visible = true; g.m.meshes.core.scale.setScalar(1);
    for (const id of ['signL', 'signR']) g.m.meshes[id].visible = true;
    g.state = 'idle'; g.st = 0; g.wobble = 0;
    g.m.materials.frame.color.set(WORLDS[this.topic ?? 0]?.color || '#63f2c0');
  }

  flyIn() {
    this.group.visible = true;
    this.phase = 'flyIn';
    this.phaseT = 0;
    this.distance = LAYOUT.gate.spawnDistance;
    this.locked = true;
    for (const g of this.gates) g.shield.material.uniforms.uOpacity.value = 1;
  }

  unlock() { this.locked = false; this.unlockT = 0; }

  select(lane) { this.selected = lane; }

  // outcome: { lane, correct, answerLane }
  resolve(outcome) {
    this.outcome = outcome;
    this.phase = 'dash';
    this.phaseT = 0;
    this.dashFrom = this.distance;
    this.hitDone = false;
    this.locked = false;
  }

  hit() {
    const { lane, correct, answerLane } = this.outcome;
    const g = this.gates[lane];
    const color = WORLDS[this.topic].color;
    const center = new THREE.Vector3(g.baseX, 1.5, this.group.position.z + 0.3);
    if (correct) {
      g.state = 'open'; g.st = 0;
      this.bursts?.burst(center, [color, '#ffd45b', '#ffffff'], { count: 46, speed: 6.5, up: 2, size: 0.11, life: 1.0 });
    } else {
      g.state = 'crash'; g.st = 0;
      this.bursts?.burst(center, ['#ff8a7a', '#ffd0c9', color], { count: 22, speed: 3.6, up: 1.2, size: 0.09, life: 0.8, gravity: -9 });
      const a = this.gates[answerLane];
      a.state = 'reveal'; a.st = 0;
    }
    for (const other of this.gates) if (other.lane !== lane && other.state === 'idle') { other.state = 'sink'; other.st = 0; }
  }

  update(dt, t, ctx) {
    this.t = t;
    if (this.phase === 'hidden') return;
    this.phaseT += dt;
    const G = LAYOUT.gate;
    if (this.phase === 'flyIn') {
      const k = Math.min(1, this.phaseT / 1.25);
      this.distance = G.spawnDistance + (G.parkDistance - G.spawnDistance) * easeOut(k);
      if (k >= 1) this.phase = 'parked';
    } else if (this.phase === 'parked') {
      this.distance = G.parkDistance;
      if (ctx.approach != null) this.phase = 'approach';
    } else if (this.phase === 'approach') {
      const p = Math.min(1, Math.max(0, ctx.approach ?? 0));
      this.distance = G.parkDistance - (G.parkDistance - G.hitDistance - 1.2) * p;
      if (ctx.approach == null) this.phase = 'parked';
    } else if (this.phase === 'dash') {
      const k = Math.min(1, this.phaseT / 0.5);
      this.distance = this.dashFrom + (G.hitDistance - this.dashFrom) * (k * k);
      if (!this.hitDone && this.distance < 2.2) { this.hitDone = true; this.hit(); }
      if (k >= 1) { this.phase = 'exit'; this.phaseT = 0; }
    } else if (this.phase === 'exit') {
      this.distance -= (ctx.speed || 9) * dt;
      if (this.distance < -12) { this.phase = 'hidden'; this.group.visible = false; }
    }
    this.group.position.z = -this.distance;
    // Shield fade
    for (const g of this.gates) {
      const u = g.shield.material.uniforms;
      u.uTime.value = t;
      const target = this.locked ? 1 : 0;
      u.uOpacity.value += (target - u.uOpacity.value) * Math.min(1, dt * (this.locked ? 6 : 3.5));
      g.shield.visible = u.uOpacity.value > 0.01;
      this.animateGate(g, dt, t);
    }
  }

  animateGate(g, dt, t) {
    g.st += dt;
    const J = g.m.joints, M = g.m.meshes;
    const hover = Math.sin(t * 2.2 + g.lane) * 0.06;
    const selected = this.selected === g.lane && (this.phase === 'parked' || this.phase === 'approach' || this.phase === 'flyIn');
    if (g.state === 'idle') {
      g.root.position.y = hover;
      const pulse = selected ? 1 + Math.sin(t * 8) * 0.18 : 1;
      M.core.scale.setScalar(pulse * (selected ? 1.25 : 1));
      M.core.rotation.y += dt * (selected ? 4 : 1);
      g.m.materials.frame.emissive?.set(selected ? '#3a3a10' : '#000000');
      g.m.materials.laneGlow.color.set(LANES[g.lane].color).multiplyScalar(selected ? 1.6 : 0.8);
      g.root.scale.setScalar(selected ? 1.04 : 1);
    } else if (g.state === 'open') {
      const k = Math.min(1, g.st / 0.55), e = easeOut(k);
      J.panelL.position.x = J.panelL.userData.restPos.x + 1.25 * e; J.panelL.rotation.y = -0.9 * e; J.panelL.position.z = 0.4 * e;
      J.panelR.position.x = J.panelR.userData.restPos.x - 1.25 * e; J.panelR.rotation.y = 0.9 * e; J.panelR.position.z = 0.4 * e;
      for (const p of [M.panelL, M.panelR]) p.material.opacity = 0.86 * (1 - k * 0.8);
      M.core.scale.setScalar(1 + e * 0.8); M.core.visible = k < 0.22;
      g.m.materials.frame.emissive?.set('#244a2a');
    } else if (g.state === 'crash') {
      const k = Math.min(1, g.st / 0.9);
      const shake = k < 0.35 ? Math.sin(g.st * 60) * 0.06 * (1 - k / 0.35) : 0;
      g.root.position.x = g.baseX + shake;
      if (k > 0.25) {
        const f = easeOut((k - 0.25) / 0.75);
        J.panelL.rotation.x = -1.3 * f; J.panelL.position.y = J.panelL.userData.restPos.y - 1.0 * f; J.panelL.position.z = 0.6 * f;
        J.panelR.rotation.x = 1.1 * f; J.panelR.position.y = J.panelR.userData.restPos.y - 1.0 * f; J.panelR.position.z = -0.4 * f;
        J.panelR.rotation.z = 0.3 * f; J.panelL.rotation.z = -0.25 * f;
      }
      for (const p of [M.panelL, M.panelR]) p.material.color.lerp(new THREE.Color('#ff8a7a'), 0.15);
      M.core.visible = false;
    } else if (g.state === 'reveal') {
      g.root.position.y = hover + 0.15;
      g.m.materials.frame.color.lerp(new THREE.Color('#99f36a'), 0.2);
      g.m.materials.frame.emissive?.set('#1f5a1a');
      M.core.scale.setScalar(1.3 + Math.sin(t * 10) * 0.2);
    } else if (g.state === 'sink') {
      const k = Math.min(1, g.st / 0.6);
      g.root.position.y = hover - 0.6 * k;
      g.root.scale.setScalar(1 - 0.12 * k);
    }
    // emblem spin
    for (const e of g.emblems) if (e.visible) e.rotation.y += dt * 1.4;
  }

  hide() { this.phase = 'hidden'; this.group.visible = false; }
}
