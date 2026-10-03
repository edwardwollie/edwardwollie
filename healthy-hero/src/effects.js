// Lightweight particle effects (instanced, one draw call each).
import * as THREE from './vendor/three.module.min.js?v=2.0.1';
import { dotTexture } from './engine.js?v=2.0.1';

const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();

export class Bursts {
  constructor(parent, max = 220, shape = 'star') {
    const geo = shape === 'cube' ? new THREE.BoxGeometry(1, 1, 1) : new THREE.OctahedronGeometry(0.6, 0);
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.max = max;
    this.p = Array.from({ length: max }, () => ({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s: 0.1, r: 0, vr: 0, g: -6 }));
    for (let i = 0; i < max; i++) { dummy.scale.setScalar(0); dummy.updateMatrix(); this.mesh.setMatrixAt(i, dummy.matrix); this.mesh.setColorAt(i, tmpColor.set('#ffffff')); }
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.cursor = 0;
    parent.add(this.mesh);
  }

  burst(pos, colors, { count = 26, speed = 5, up = 2.5, spread = 0.6, size = 0.09, life = 0.9, gravity = -7, cone = null } = {}) {
    const list = Array.isArray(colors) ? colors : [colors];
    for (let n = 0; n < count; n++) {
      const i = this.cursor = (this.cursor + 1) % this.max;
      const q = this.p[i];
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2;
      let vx = Math.cos(a) * Math.cos(e), vy = Math.sin(e), vz = Math.sin(a) * Math.cos(e);
      if (cone) { vx = vx * 0.6 + cone[0]; vy = vy * 0.6 + cone[1]; vz = vz * 0.6 + cone[2]; }
      const sp = speed * (0.45 + Math.random() * 0.75);
      Object.assign(q, {
        alive: true, x: pos.x + (Math.random() - 0.5) * spread, y: pos.y + (Math.random() - 0.5) * spread, z: pos.z + (Math.random() - 0.5) * spread * 0.5,
        vx: vx * sp, vy: vy * sp + up, vz: vz * sp, life: 0, max: life * (0.7 + Math.random() * 0.6), s: size * (0.6 + Math.random() * 0.9),
        r: Math.random() * 6, vr: (Math.random() - 0.5) * 14, g: gravity
      });
      this.mesh.setColorAt(i, tmpColor.set(list[n % list.length]));
    }
    this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt, scroll = 0) {
    let any = false;
    for (let i = 0; i < this.max; i++) {
      const q = this.p[i];
      if (!q.alive) continue;
      any = true;
      q.life += dt;
      if (q.life >= q.max) { q.alive = false; dummy.scale.setScalar(0); dummy.updateMatrix(); this.mesh.setMatrixAt(i, dummy.matrix); continue; }
      q.vy += q.g * dt;
      q.vx *= 0.985; q.vz *= 0.985;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += (q.vz + scroll) * dt;
      q.r += q.vr * dt;
      const k = 1 - q.life / q.max;
      dummy.position.set(q.x, q.y, q.z);
      dummy.rotation.set(q.r, q.r * 0.7, 0);
      dummy.scale.setScalar(q.s * (0.3 + 0.7 * k));
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    }
    if (any || this.wasAny) this.mesh.instanceMatrix.needsUpdate = true;
    this.wasAny = any;
  }
}

export class Confetti {
  constructor(parent, count = 140) {
    const geo = new THREE.PlaneGeometry(0.09, 0.05);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    this.count = count;
    this.items = [];
    const colors = ['#63f2c0', '#b26cff', '#ffd45b', '#ff695f', '#49d9ff', '#8af06a', '#ffffff'];
    for (let i = 0; i < count; i++) {
      this.items.push({ x: 0, y: -99, z: 0, vy: 0, vx: 0, r: Math.random() * 6, vr: 2 + Math.random() * 4, sway: Math.random() * 6 });
      this.mesh.setColorAt(i, tmpColor.set(colors[i % colors.length]));
    }
    this.active = false;
    parent.add(this.mesh);
    this.mesh.visible = false;
  }
  fire(center = new THREE.Vector3(), radius = 2.2, height = 3.2) {
    this.active = true; this.mesh.visible = true; this.t = 0;
    for (const it of this.items) {
      it.x = center.x + (Math.random() - 0.5) * radius * 2; it.z = center.z + (Math.random() - 0.5) * radius * 1.4;
      it.y = center.y + height + Math.random() * 2.5; it.vy = -(0.6 + Math.random() * 0.9); it.vx = (Math.random() - 0.5) * 0.4;
    }
  }
  stop() { this.active = false; this.mesh.visible = false; }
  update(dt) {
    if (!this.active) return;
    this.t += dt;
    this.items.forEach((it, i) => {
      it.y += it.vy * dt; it.x += Math.sin(this.t * 2 + it.sway) * 0.3 * dt + it.vx * dt; it.r += it.vr * dt;
      if (it.y < -0.2 && this.t < 6) it.y += 5;
      dummy.position.set(it.x, it.y, it.z);
      dummy.rotation.set(it.r, it.r * 0.6, it.r * 0.3);
      dummy.scale.setScalar(it.y < -0.2 ? 0 : 1);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.t > 9) this.stop();
  }
}

// Ambient floating particles for each biome (one Points draw call).
export class Ambient {
  constructor(parent, count = 220) {
    this.count = count;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(count * 3);
    this.seed = new Float32Array(count);
    for (let i = 0; i < count; i++) { this.reset(i, true); this.seed[i] = Math.random() * 100; }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.textures = {
      soft: dotTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'),
      bubble: bubbleTexture(),
      petal: dotTexture('rgba(255,214,231,1)', 'rgba(255,180,210,0)')
    };
    this.mat = new THREE.PointsMaterial({ size: 0.25, map: this.textures.soft, transparent: true, depthWrite: false, color: '#ffffff', sizeAttenuation: true, toneMapped: false, opacity: 0.9 });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    parent.add(this.points);
    this.setKind('petals');
  }
  reset(i, initial = false) {
    this.pos[i * 3] = (Math.random() - 0.5) * 34;
    this.pos[i * 3 + 1] = initial ? Math.random() * 9 : (this.kind === 'bubbles' || this.kind === 'drops' ? -0.5 : Math.random() * 9);
    this.pos[i * 3 + 2] = -Math.random() * 90 + 8;
  }
  setKind(kind) {
    this.kind = kind;
    const m = this.mat;
    const cfg = {
      petals: { color: '#ffd0e4', size: 0.22, map: 'petal', blending: THREE.NormalBlending },
      drops: { color: '#9fe6ff', size: 0.2, map: 'soft', blending: THREE.AdditiveBlending },
      sparks: { color: '#ffe27a', size: 0.16, map: 'soft', blending: THREE.AdditiveBlending },
      stars: { color: '#fff6c9', size: 0.18, map: 'soft', blending: THREE.AdditiveBlending },
      bubbles: { color: '#e9fffb', size: 0.5, map: 'bubble', blending: THREE.NormalBlending },
      fireflies: { color: '#d9ff7a', size: 0.2, map: 'soft', blending: THREE.AdditiveBlending }
    }[kind] || {};
    m.color.set(cfg.color || '#ffffff'); m.size = cfg.size || 0.2; m.map = this.textures[cfg.map || 'soft']; m.blending = cfg.blending || THREE.NormalBlending; m.needsUpdate = true;
  }
  update(dt, t, scroll) {
    const p = this.pos;
    for (let i = 0; i < this.count; i++) {
      const s = this.seed[i];
      let x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
      z += scroll * dt;
      switch (this.kind) {
        case 'petals': x += Math.sin(t * 0.9 + s) * 0.6 * dt; y -= 0.35 * dt; break;
        case 'drops': case 'bubbles': y += (this.kind === 'bubbles' ? 0.55 : 0.8) * dt; x += Math.sin(t + s) * 0.25 * dt; break;
        case 'sparks': y += Math.sin(t * 3 + s) * 0.6 * dt; x += Math.cos(t * 2 + s) * 0.5 * dt; break;
        case 'stars': break;
        case 'fireflies': x += Math.sin(t * 0.7 + s) * 0.5 * dt; y += Math.cos(t * 0.9 + s * 2) * 0.35 * dt; break;
        default: break;
      }
      if (z > 10 || y > 10 || y < -1) { this.reset(i); z = -82 - Math.random() * 8; x = p[i * 3]; y = p[i * 3 + 1]; if (this.kind === 'stars') y = 2 + Math.random() * 8; }
      p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    if (this.kind === 'stars' || this.kind === 'fireflies') this.mat.opacity = 0.7 + Math.sin(t * 4) * 0.2;
    else this.mat.opacity = 0.9;
  }
}

function bubbleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 18, 32, 32, 31);
  grd.addColorStop(0, 'rgba(255,255,255,0.05)'); grd.addColorStop(0.75, 'rgba(200,255,250,0.25)'); grd.addColorStop(0.95, 'rgba(255,255,255,0.9)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(32, 32, 31, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.ellipse(22, 20, 6, 3.5, -0.6, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// Additive fresnel bubble (calm shield, breathing bubble, beacon glow).
export function fresnelMaterial(color = '#7af8ff', power = 2.2, strength = 1.2, base = 0.05) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uPower: { value: power }, uStrength: { value: strength }, uBase: { value: base }, uOpacity: { value: 1 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'uniform vec3 uColor; uniform float uPower, uStrength, uBase, uOpacity; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPower); gl_FragColor = vec4(uColor * (uBase + f * uStrength) * uOpacity, 1.0); }'
  });
}

export function glowSprite(color = '#7af8ff', size = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  s.scale.setScalar(size);
  return s;
}
