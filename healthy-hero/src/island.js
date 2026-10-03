// Wellness Island — the 3D hub. Six wedge-shaped worlds around a Heart Tower, 30 mission
// stones on a spiral path, a hero standing on the current stone, and tappable monuments.
import * as THREE from './vendor/three.module.min.js?v=2.0.1';
import { BIOMES, EMBLEM_BY_TOPIC } from './blueprints.js?v=2.0.1';
import { buildMergedProp, buildModel } from './models.js?v=2.0.1';
import { Rig } from './rig.js?v=2.0.1';
import { WORLDS } from './content.js?v=2.0.1';
import { dotTexture } from './engine.js?v=2.0.1';
import { glowSprite } from './effects.js?v=2.0.1';

const R = 20;
const D2R = Math.PI / 180;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

export function stonePosition(i) {
  const ring = Math.floor(i / 6), w = i % 6;
  const r = 5.4 + ring * 2.55;
  const a = (w * 60 + 30 + ring * 6) * D2R;
  return new THREE.Vector3(Math.cos(a) * r, 0, -Math.sin(a) * r);
}

const PROP_PLAN = [
  [['fruitTree', 0.62], ['fruitTree', 0.55], ['carrot', 0.7], ['sunflower', 0.7], ['veggieCrate', 0.6], ['fruitTree', 0.5]],
  [['cliffFalls', 0.42], ['bottleTower', 0.5], ['reeds', 0.8], ['reeds', 0.7], ['bottleTower', 0.42]],
  [['mountain', 0.38], ['pineTree', 0.62], ['pineTree', 0.55], ['flag', 0.6], ['hurdle', 0.6], ['pineTree', 0.5]],
  [['cloudBed', 0.5], ['starLantern', 0.7], ['cloud', 0.6], ['starLantern', 0.6], ['cloud', 0.5]],
  [['lighthouse', 0.5], ['toothbrushPost', 0.6], ['bubble', 0.8], ['duck', 0.7], ['bubble', 0.6]],
  [['bamboo', 0.6], ['blossomTree', 0.6], ['zenStones', 0.75], ['paperLantern', 0.7], ['bamboo', 0.5]]
];

function atlasCanvas() { const c = document.createElement('canvas'); c.width = 1024; c.height = 1024; return c; }

export class IslandScene {
  constructor(engine) {
    this.engine = engine;
    this.scene = new THREE.Scene();
    this.scene.environment = engine.envMap;
    this.scene.environmentIntensity = 0.32;
    this.scene.fog = new THREE.Fog('#cdeeff', 150, 520);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 900);
    this.az = 0.5; this.pol = 50 * D2R; this.radius = 46;
    this.target = new THREE.Vector3(0, 0, 0);
    this.goalTarget = new THREE.Vector3(0, 0, 0);
    this.goalRadius = 46;
    this.mode = 'title';
    this.selected = 0;
    this.time = 0;
    this.pickables = [];
    this.buildSky();
    this.buildIsland();
    this.buildTower();
    this.buildMonuments();
    this.buildProps();
    this.buildStones();
    this.buildMarker();
    this.setHero('pip');
    this.bindInput();
  }

  buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position = p.xyww; }',
      fragmentShader: 'varying vec3 vP; void main(){ float h = vP.y; vec3 top = vec3(0.24,0.6,1.0), mid = vec3(0.62,0.85,1.0), hor = vec3(0.92,0.98,1.0); vec3 c = h > 0.15 ? mix(mid, top, smoothstep(0.15,0.7,h)) : mix(hor, mid, smoothstep(-0.05,0.15,h)); gl_FragColor = vec4(c,1.); }'
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), mat);
    sky.frustumCulled = false; sky.renderOrder = -10;
    this.scene.add(sky);
    this.scene.add(new THREE.HemisphereLight('#f4fbff', '#5a7a4a', 0.95));
    const sun = new THREE.DirectionalLight('#fff3dc', 1.75);
    sun.position.set(18, 30, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 5; sc.far = 80;
    sun.shadow.bias = -0.0006;
    this.scene.add(sun);
    this.sun = sun;
    // Sea
    const water = document.createElement('canvas'); water.width = water.height = 256;
    const g = water.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 80; i++) { g.strokeStyle = `rgba(255,255,255,${0.4 + Math.random() * 0.5})`; g.lineWidth = 2; const x = Math.random() * 256, y = Math.random() * 256; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 10, y - 3, x + 22, y); g.stroke(); }
    this.seaTex = new THREE.CanvasTexture(water); this.seaTex.wrapS = this.seaTex.wrapT = THREE.RepeatWrapping; this.seaTex.repeat.set(60, 60); this.seaTex.colorSpace = THREE.SRGBColorSpace;
    const sea = new THREE.Mesh(new THREE.CircleGeometry(600, 64), new THREE.MeshStandardMaterial({ color: '#28a9e0', map: this.seaTex, roughness: 0.2, metalness: 0.05 }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = -1.1;
    this.scene.add(sea);
  }

  buildIsland() {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.86, 4, 72), new THREE.MeshLambertMaterial({ color: '#9a7350' }));
    base.position.y = -2.02; base.receiveShadow = true;
    const beach = new THREE.Mesh(new THREE.CylinderGeometry(R + 1.8, R + 2.6, 0.9, 72), new THREE.MeshLambertMaterial({ color: '#f3d9a3' }));
    beach.position.y = -1.0;
    this.scene.add(base, beach);
    // Wedges
    BIOMES.forEach((b, w) => {
      const geo = new THREE.CircleGeometry(R - 0.2, 24, (w * 60) * D2R, 60 * D2R);
      geo.rotateX(-Math.PI / 2);
      const col = new THREE.Color(b.key === 'falls' ? '#58c6a0' : b.key === 'harbor' ? '#7fd8c9' : b.key === 'sky' ? '#c9b8ff' : b.ground);
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: col }));
      m.position.y = 0.01 + w * 0.002;
      m.receiveShadow = true;
      this.scene.add(m);
      // Divider line
      const a = w * 60 * D2R;
      const line = new THREE.Mesh(new THREE.BoxGeometry(R - 4.2, 0.04, 0.16), new THREE.MeshLambertMaterial({ color: '#ffffff' }));
      line.position.set(Math.cos(a) * (R + 4.2) / 2, 0.03, -Math.sin(a) * (R + 4.2) / 2);
      line.rotation.y = a;
      this.scene.add(line);
    });
    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(3.9, 4.1, 0.24, 48), new THREE.MeshLambertMaterial({ color: '#f1ebdd' }));
    plaza.position.y = 0.12; plaza.receiveShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(4.0, 0.12, 8, 64), new THREE.MeshBasicMaterial({ color: '#63f2c0', toneMapped: false }));
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.25;
    this.scene.add(plaza, rim);
  }

  buildTower() {
    const g = new THREE.Group();
    const stone = new THREE.MeshLambertMaterial({ color: '#e6ddc9' });
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.8, 0.8, 32), stone); ped.position.y = 0.6;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 2.3, 24), stone); col.position.y = 2.1;
    const heart = buildModel('pip', { lod: 1 }).meshes.heartCore.geometry.clone();
    heart.scale(16, 16, 22);
    this.heart = new THREE.Mesh(heart, new THREE.MeshStandardMaterial({ color: '#63f2c0', emissive: '#2fd39a', emissiveIntensity: 0.6, roughness: 0.25 }));
    this.heart.position.y = 4.4; this.heart.castShadow = true;
    const glow = glowSprite('#63f2c0', 6); glow.position.y = 4.4; glow.material.opacity = 0.45;
    g.add(ped, col, this.heart, glow);
    this.badgeOrbs = WORLDS.map((w, i) => {
      const a = (i * 60 + 30) * D2R;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.1, 8), stone); post.position.set(Math.cos(a) * 2.6, 0.75, -Math.sin(a) * 2.6);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 14), new THREE.MeshStandardMaterial({ color: '#8090a8', roughness: 0.3 }));
      orb.position.set(Math.cos(a) * 2.6, 1.5, -Math.sin(a) * 2.6);
      g.add(post, orb);
      return orb;
    });
    this.scene.add(g);
  }

  buildMonuments() {
    this.monuments = EMBLEM_BY_TOPIC.map((id, w) => {
      const a = (w * 60 + 30) * D2R, r = 18.0;
      const g = new THREE.Group();
      g.position.set(Math.cos(a) * r, 0, -Math.sin(a) * r);
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.25, 0.7, 6), new THREE.MeshLambertMaterial({ color: '#ffffff' }));
      ped.position.y = 0.35;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.07, 6, 6), new THREE.MeshBasicMaterial({ color: WORLDS[w].color, toneMapped: false }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.72;
      const em = buildModel(id, { lod: 1 });
      em.root.scale.setScalar(5);
      em.root.position.y = 2.3;
      em.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      const glow = glowSprite(WORLDS[w].color, 4.2); glow.position.y = 2.3; glow.material.opacity = 0.35;
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 4, 8), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.y = 2; hit.userData = { kind: 'monument', world: w };
      g.add(ped, ring, em.root, glow, hit);
      this.scene.add(g);
      this.pickables.push(hit);
      return { g, emblem: em.root, w };
    });
  }

  buildProps() {
    const rnd = (() => { let s = 99; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
    PROP_PLAN.forEach((list, w) => {
      list.forEach(([id, scale], k) => {
        const big = ['mountain', 'cliffFalls', 'lighthouse'].includes(id);
        const r = big ? 15.5 + rnd() * 1.5 : 6.5 + (k / list.length) * 10 + rnd() * 1.4;
        const a = (w * 60 + (big ? 10 : 8 + (k % 2) * 5 + rnd() * 6)) * D2R;
        const p = buildMergedProp(id);
        let y = 0;
        if (id === 'cloud') y = 3 + rnd() * 2;
        if (id === 'duck') { p.position.set(Math.cos(a) * (R + 3.5), -1.05, -Math.sin(a) * (R + 3.5)); p.scale.setScalar(scale); this.scene.add(p); this.duck = p; return; }
        p.position.set(Math.cos(a) * r, y, -Math.sin(a) * r);
        p.rotation.y = rnd() * Math.PI * 2;
        p.scale.setScalar(scale);
        p.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        this.scene.add(p);
        if (id === 'cloud') (this.clouds ||= []).push(p);
      });
    });
  }

  buildStones() {
    const hex = new THREE.CylinderGeometry(0.95, 1.05, 0.34, 6);
    hex.rotateY(Math.PI / 6);
    const parts = [];
    this.stonePos = [];
    for (let i = 0; i < 30; i++) {
      const p = stonePosition(i);
      this.stonePos.push(p);
      const g = hex.clone();
      g.translate(p.x, 0.17, p.z);
      const n = g.attributes.position.count;
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      parts.push(g);
    }
    this.stoneGeo = THREE.mergeGeometries(parts);
    this.stoneVerts = hex.attributes.position.count;
    this.stones = new THREE.Mesh(this.stoneGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.stones.castShadow = true; this.stones.receiveShadow = true;
    this.scene.add(this.stones);
    // Tops with a number atlas (6 × 5 cells)
    this.atlas = atlasCanvas();
    this.atlasTex = new THREE.CanvasTexture(this.atlas);
    this.atlasTex.colorSpace = THREE.SRGBColorSpace;
    this.atlasTex.anisotropy = 8;
    const tops = [];
    for (let i = 0; i < 30; i++) {
      const p = this.stonePos[i];
      const g = new THREE.CircleGeometry(0.82, 6, Math.PI / 6);
      g.rotateX(-Math.PI / 2);
      const ang = Math.atan2(-p.z, p.x);
      g.rotateY(ang + Math.PI / 2); // numbers read upright from outside the island
      g.translate(p.x, 0.35, p.z);
      const uv = g.attributes.uv;
      const cx = (i % 6) / 6, cy = 1 - (Math.floor(i / 6) + 1) / 5;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, cx + uv.getX(k) / 6, cy + uv.getY(k) / 5);
      tops.push(g);
    }
    this.tops = new THREE.Mesh(THREE.mergeGeometries(tops), new THREE.MeshLambertMaterial({ map: this.atlasTex }));
    this.scene.add(this.tops);
    // Stars above completed stones
    this.starMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ toneMapped: false }), 90);
    this.scene.add(this.starMesh);
    // Hit targets
    this.stoneHits = this.stonePos.map((p, i) => {
      const h = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.4, 6), new THREE.MeshBasicMaterial({ visible: false }));
      h.position.set(p.x, 0.5, p.z); h.userData = { kind: 'stone', index: i };
      this.scene.add(h); this.pickables.push(h);
      return h;
    });
    // Path dots along a smooth spiral
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.05, 0), ...this.stonePos.map((p) => new THREE.Vector3(p.x, 0.05, p.z))], false, 'centripetal');
    this.curve = curve;
    const len = curve.getLength();
    const count = Math.floor(len / 0.75);
    this.dotT = [];
    this.dots = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 10), new THREE.MeshBasicMaterial({ toneMapped: false }), count);
    const d = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const p = curve.getPointAt(t);
      d.position.copy(p); d.updateMatrix();
      this.dots.setMatrixAt(i, d.matrix);
      this.dotT.push(t);
    }
    this.scene.add(this.dots);
    // Map each stone to its curve parameter for coloring dots
    this.stoneT = this.stonePos.map((p) => { let best = 0, bd = 1e9; for (let k = 0; k <= 600; k++) { const q = curve.getPointAt(k / 600); const dd = (q.x - p.x) ** 2 + (q.z - p.z) ** 2; if (dd < bd) { bd = dd; best = k / 600; } } return best; });
  }

  buildMarker() {
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.07, 8, 48), new THREE.MeshBasicMaterial({ color: '#ffd45b', toneMapped: false }));
    this.ring.rotation.x = Math.PI / 2;
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.6, 16), new THREE.MeshBasicMaterial({ color: '#ffd45b', toneMapped: false }));
    this.arrow.rotation.x = Math.PI;
    this.nextGlow = glowSprite('#ffd45b', 3); this.nextGlow.material.opacity = 0.4;
    this.scene.add(this.ring, this.arrow, this.nextGlow);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: dotTexture('rgba(0,0,0,0.4)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false }));
    shadow.scale.set(1.1, 1, 0.9);
    this.heroShadow = shadow;
    this.scene.add(shadow);
  }

  setHero(id) {
    if (this.hero?.id === id) return;
    if (this.hero) this.scene.remove(this.hero.m.root);
    const m = buildModel(id, { lod: 1, shadows: true });
    const rig = new Rig(m);
    rig.setState('wave');
    this.hero = { id, m, rig };
    this.scene.add(m.root);
    this.placeHero(this.selected, true);
  }

  placeHero(i, instant = false) {
    const p = this.stonePos[i];
    this.hop = { from: this.hero.m.root.position.clone(), to: new THREE.Vector3(p.x, 0.34, p.z), t: instant ? 1 : 0 };
    if (instant) this.hero.m.root.position.copy(this.hop.to);
  }

  // progress = { unlocked, stars: {i: n}, badges: [...] }
  setProgress(progress, selected) {
    this.progress = progress;
    const colors = this.stoneGeo.attributes.color;
    const g = this.atlas.getContext('2d');
    g.clearRect(0, 0, 1024, 1024);
    const cw = 1024 / 6, ch = 1024 / 5;
    const starM = new THREE.Object3D();
    let si = 0;
    for (let i = 0; i < 30; i++) {
      const world = WORLDS[i % 6];
      const locked = i >= progress.unlocked;
      const col = new THREE.Color(locked ? '#8796ad' : world.color);
      if (!locked && !progress.stars[i]) col.lerp(new THREE.Color('#ffffff'), 0.15);
      for (let k = 0; k < this.stoneVerts; k++) colors.setXYZ(i * this.stoneVerts + k, col.r, col.g, col.b);
      // Atlas cell
      const x = (i % 6) * cw, y = Math.floor(i / 6) * ch;
      g.fillStyle = locked ? '#b9c3d3' : '#ffffff';
      g.fillRect(x, y, cw, ch);
      g.fillStyle = locked ? '#6d7b92' : world.color;
      g.beginPath(); g.arc(x + cw / 2, y + ch / 2, Math.min(cw, ch) * 0.36, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffff';
      if (locked) {
        g.fillRect(x + cw / 2 - 22, y + ch / 2 - 6, 44, 34);
        g.lineWidth = 9; g.strokeStyle = '#ffffff'; g.beginPath(); g.arc(x + cw / 2, y + ch / 2 - 8, 14, Math.PI, 0); g.stroke();
      } else {
        g.font = "900 62px Nunito, system-ui, sans-serif"; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(i + 1), x + cw / 2, y + ch / 2 + 4);
      }
      const stars = progress.stars[i] || 0;
      const p = this.stonePos[i];
      for (let s = 0; s < 3; s++) {
        starM.position.set(p.x + (s - 1) * 0.42, 1.0 + (s === 1 ? 0.15 : 0), p.z);
        starM.scale.setScalar(i < progress.unlocked ? 1 : 0);
        starM.updateMatrix();
        this.starMesh.setMatrixAt(si, starM.matrix);
        this.starMesh.setColorAt(si, new THREE.Color(s < stars ? '#ffd45b' : '#ffffff').multiplyScalar(s < stars ? 1.2 : 0.35));
        si++;
      }
    }
    colors.needsUpdate = true;
    this.atlasTex.needsUpdate = true;
    this.starMesh.instanceMatrix.needsUpdate = true;
    if (this.starMesh.instanceColor) this.starMesh.instanceColor.needsUpdate = true;
    // Path dots: gold up to the newest unlocked stone
    const lastT = this.stoneT[Math.min(29, Math.max(0, progress.unlocked - 1))];
    this.dotT.forEach((t, i) => this.dots.setColorAt(i, new THREE.Color(t <= lastT + 0.002 ? '#ffe9a3' : '#ffffff').multiplyScalar(t <= lastT ? 1.1 : 0.55)));
    this.dots.instanceColor.needsUpdate = true;
    // Badge orbs
    this.badgeOrbs.forEach((orb, i) => {
      const earned = progress.badges.includes(WORLDS[i].badge);
      orb.material.color.set(earned ? WORLDS[i].color : '#8090a8');
      orb.material.emissive = new THREE.Color(earned ? WORLDS[i].color : '#000000');
      orb.material.emissiveIntensity = earned ? 0.8 : 0;
    });
    if (selected !== undefined) this.select(selected, true);
  }

  select(i, instant = false) {
    this.selected = i;
    this.placeHero(i, instant);
    if (this.mode === 'map') {
      const p = this.stonePos[i];
      this.goalTarget.set(p.x * 0.55, 0, p.z * 0.55);
    }
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'title') { this.goalTarget.set(0, 0, 0); this.goalRadius = 40; this.hero.rig.setState('wave'); }
    else if (mode === 'map') { const p = this.stonePos[this.selected]; this.goalTarget.set(p.x * 0.55, 0, p.z * 0.55); this.goalRadius = 34; this.hero.rig.setState('idle'); }
  }

  focusWorld(w) {
    const m = this.monuments[w];
    this.goalTarget.set(m.g.position.x * 0.7, 0, m.g.position.z * 0.7);
    this.goalRadius = 26;
    const a = Math.atan2(-m.g.position.z, m.g.position.x);
    this.goalAz = a;
  }

  bindInput() {
    const el = this.engine.canvas;
    const ptrs = new Map();
    let start = null, pinch = null;
    el.addEventListener('pointerdown', (e) => {
      if (this.engine.scene !== this || this.mode !== 'map') return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.setPointerCapture?.(e.pointerId);
      if (ptrs.size === 1) start = { x: e.clientX, y: e.clientY, az: this.az, pol: this.pol, moved: false };
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), r: this.goalRadius }; }
    });
    el.addEventListener('pointermove', (e) => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2 && pinch) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.goalRadius = THREE.MathUtils.clamp(pinch.r * (pinch.d / d), 22, 62);
        if (start) start.moved = true;
        return;
      }
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) > 8) start.moved = true;
      if (start.moved) {
        this.az = start.az - dx * 0.006;
        this.pol = THREE.MathUtils.clamp(start.pol - dy * 0.004, 28 * D2R, 66 * D2R);
        this.goalAz = null;
      }
    });
    const end = (e) => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
      if (start && !start.moved && ptrs.size === 0) {
        const hit = this.engine.pick(e.clientX, e.clientY, this.camera, this.pickables);
        if (hit) this.onPick?.(hit.object.userData);
      }
      if (ptrs.size === 0) start = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => {
      if (this.engine.scene !== this || this.mode !== 'map') return;
      e.preventDefault();
      this.goalRadius = THREE.MathUtils.clamp(this.goalRadius * (1 + Math.sign(e.deltaY) * 0.08), 22, 62);
    }, { passive: false });
  }

  resize() { this.engine.applyFocus(this.camera, { vFov: 40, hFovMin: 46, hFovMax: 80 }); }

  update(dt, t) {
    this.time = t;
    if (this.mode === 'title' && !this.engine.reducedMotion) this.az += dt * 0.06;
    if (this.goalAz != null) {
      let d = this.goalAz - this.az; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.az += d * Math.min(1, dt * 2.5);
      if (Math.abs(d) < 0.01) this.goalAz = null;
    }
    this.target.x = damp(this.target.x, this.goalTarget.x, 3, dt);
    this.target.z = damp(this.target.z, this.goalTarget.z, 3, dt);
    this.radius = damp(this.radius, this.goalRadius, 3, dt);
    const sp = Math.sin(this.pol), cp = Math.cos(this.pol);
    this.camera.position.set(this.target.x + Math.cos(this.az) * sp * this.radius, cp * this.radius, this.target.z - Math.sin(this.az) * sp * this.radius);
    this.camera.lookAt(this.target.x, 0.5, this.target.z);
    // Hero hop + idle
    if (this.hop && this.hop.t < 1) {
      this.hop.t = Math.min(1, this.hop.t + dt / 0.65);
      const k = this.hop.t;
      const p = this.hop.from.clone().lerp(this.hop.to, k);
      p.y += Math.sin(k * Math.PI) * 1.6;
      this.hero.m.root.position.copy(p);
    }
    const hr = this.hero.m.root;
    const toCam = Math.atan2(this.camera.position.x - hr.position.x, this.camera.position.z - hr.position.z);
    this.hero.rig.extraYaw = toCam;
    this.hero.rig.update(dt);
    this.heroShadow.position.set(hr.position.x, 0.36, hr.position.z);
    // Marker on selected stone
    const sp2 = this.stonePos[this.selected];
    this.ring.position.set(sp2.x, 0.4, sp2.z);
    this.ring.scale.setScalar(1 + Math.sin(t * 4) * 0.06);
    const next = Math.min(29, Math.max(0, (this.progress?.unlocked || 1) - 1));
    const np = this.stonePos[next];
    this.arrow.position.set(np.x, 3.1 + Math.sin(t * 3) * 0.25, np.z);
    this.arrow.rotation.y += dt * 2;
    this.nextGlow.position.set(np.x, 0.6, np.z);
    // Life
    this.heart.rotation.y += dt * 0.8;
    this.heart.position.y = 4.4 + Math.sin(t * 1.5) * 0.15;
    for (const m of this.monuments) { m.emblem.rotation.y += dt * 0.6; m.emblem.position.y = 2.3 + Math.sin(t * 1.2 + m.w) * 0.18; }
    if (this.clouds) this.clouds.forEach((c, i) => { c.position.y = 3.5 + Math.sin(t * 0.5 + i) * 0.4; });
    if (this.duck) { this.duck.position.y = -1.05 + Math.sin(t * 1.8) * 0.06; this.duck.rotation.y = t * 0.15; }
    this.seaTex.offset.set(t * 0.004, t * 0.002);
  }
}
