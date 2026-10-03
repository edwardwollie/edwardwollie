// Stage scene: Hero Select, mission celebration, Move Break, Bubble Breathing and the
// Blueprint Lab (blueprint line render or color, orthographic views, build animation).
import * as THREE from './vendor/three.module.min.js?v=2.0.1';
import { BLUEPRINTS, HERO_ORDER, EMBLEM_BY_TOPIC } from './blueprints.js?v=2.0.1';
import { buildModel, measure } from './models.js?v=2.0.1';
import { Rig } from './rig.js?v=2.0.1';
import { Confetti, Bursts, fresnelMaterial, glowSprite } from './effects.js?v=2.0.1';
import { BlueprintRenderer, VIEWS, BP, projectToPixels } from './blueprint-render.js?v=2.0.1';
import { WORLDS } from './content.js?v=2.0.1';
import { dotTexture } from './engine.js?v=2.0.1';

const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

export class StageScene {
  constructor(engine) {
    this.engine = engine;
    this.scene = new THREE.Scene();
    this.scene.environment = engine.envMap;
    this.scene.environmentIntensity = 0.6;
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
    this.camPos = new THREE.Vector3(0, 1.4, 6.5);
    this.camLook = new THREE.Vector3(0, 0.75, 0);
    this.goalPos = this.camPos.clone();
    this.goalLook = this.camLook.clone();
    this.mode = 'heroes';
    this.models = {};
    this.bpr = new BlueprintRenderer(engine.renderer);
    this.labStyle = 'blueprint';
    this.labView = 'iso';
    this.buildSet();
    this.confetti = new Confetti(this.scene);
    this.bursts = new Bursts(this.scene, 120);
    this.bindInput();
  }

  buildSet() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color('#1b2f6b') }, bottom: { value: new THREE.Color('#6a4fc8') } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position = p.xyww; }',
      fragmentShader: 'uniform vec3 top, bottom; varying vec3 vP; void main(){ float h = vP.y*0.5+0.5; vec3 c = mix(bottom, top, smoothstep(0.35,0.85,h)); float glow = smoothstep(0.55,0.0,length(vP.xz*vec2(1.0,0.6))) * smoothstep(0.7,0.4,h); c += vec3(0.35,0.25,0.5)*glow*0.4; gl_FragColor = vec4(c,1.); }'
    });
    this.skyMat = mat;
    const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), mat);
    sky.frustumCulled = false; sky.renderOrder = -10;
    this.scene.add(sky);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#5a4a8a', 1.4));
    const key = new THREE.DirectionalLight('#ffffff', 2.4); key.position.set(3, 6, 5);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera; sc.left = -4; sc.right = 4; sc.top = 4; sc.bottom = -4; sc.near = 1; sc.far = 20;
    const rim = new THREE.DirectionalLight('#b9a8ff', 1.4); rim.position.set(-4, 3, -5);
    this.scene.add(key, rim);
    this.floor = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.5, 0.3, 64), new THREE.MeshStandardMaterial({ color: '#2a3f7a', roughness: 0.5 }));
    disc.position.y = -0.15; disc.receiveShadow = true;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 0.02, 64), new THREE.MeshStandardMaterial({ color: '#33508f', roughness: 0.35 }));
    top.position.y = 0.01; top.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.05, 0.05, 8, 96), new THREE.MeshBasicMaterial({ color: '#63f2c0', toneMapped: false }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.02;
    this.floor.add(disc, top, ring);
    this.scene.add(this.floor);
    // Podiums for hero select
    this.podiums = HERO_ORDER.map((id, i) => {
      const g = new THREE.Group();
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.22, 40), new THREE.MeshStandardMaterial({ color: '#41609f', roughness: 0.4 }));
      p.position.y = 0.11; p.receiveShadow = true;
      const glow = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.035, 8, 48), new THREE.MeshBasicMaterial({ color: '#ffd45b', toneMapped: false, transparent: true, opacity: 0 }));
      glow.rotation.x = Math.PI / 2; glow.position.y = 0.23;
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.8, 8), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.y = 0.9; hit.userData = { kind: 'hero', id };
      g.add(p, glow, hit);
      g.position.set((i - 1.5) * 1.25, 0, -Math.abs(i - 1.5) * 0.35);
      g.userData = { glow, hit };
      this.scene.add(g);
      return g;
    });
    this.heroShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: dotTexture('rgba(0,0,0,0.45)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false }));
    this.scene.add(this.heroShadow);
    // Breathing bubble
    this.bubble = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), fresnelMaterial('#9ff7e6', 2.4, 0.9, 0.02));
    this.bubble.position.set(0, 1.1, 0.4);
    this.bubbleCore = glowSprite('#63f2c0', 1.6);
    this.bubbleCore.material.opacity = 0.35;
    this.bubbleCore.position.copy(this.bubble.position);
    this.bubble.visible = this.bubbleCore.visible = false;
    this.scene.add(this.bubble, this.bubbleCore);
    // Medal
    this.medal = new THREE.Group();
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 48), new THREE.MeshStandardMaterial({ color: '#ffd45b', metalness: 0.6, roughness: 0.25, emissive: '#5a4300', emissiveIntensity: 0.4 }));
    coin.rotation.x = Math.PI / 2;
    const rimM = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 10, 48), new THREE.MeshStandardMaterial({ color: '#fff1b0', metalness: 0.7, roughness: 0.2 }));
    this.medal.add(coin, rimM);
    this.medalEmblems = EMBLEM_BY_TOPIC.map((id) => { const e = buildModel(id, { lod: 1 }); e.root.scale.setScalar(1.6); e.root.position.z = 0.08; e.root.visible = false; this.medal.add(e.root); return e.root; });
    this.medal.visible = false;
    this.scene.add(this.medal);
    this.labRoot = new THREE.Group();
    this.scene.add(this.labRoot);
  }

  // Scale camera distance/height to the hero's size (Ginger is shorter than the kids).
  frameHero(id, dist, height, lookY, lookX = 0) {
    const k = id === 'ginger' ? 0.68 : id === 'pip' ? 0.85 : 1;
    this.goalPos.set(lookX * 0.75, height * (0.55 + 0.45 * k), dist * (0.55 + 0.45 * k));
    this.goalLook.set(lookX, lookY * k, 0);
  }

  snapIfEntering() {
    if (this.engine.scene !== this) { this.camPos.copy(this.goalPos); this.camLook.copy(this.goalLook); }
  }

  getHero(id) {
    if (!this.models[id]) {
      const m = buildModel(id, { lod: 1, shadows: true });
      const rig = new Rig(m);
      rig.setState('idle');
      this.models[id] = { m, rig };
    }
    return this.models[id];
  }

  clearActors() {
    for (const { m } of Object.values(this.models)) m.root.parent?.remove(m.root);
    this.podiums.forEach((p) => { p.visible = false; });
    this.bubble.visible = this.bubbleCore.visible = false;
    this.medal.visible = false;
    this.confetti.stop();
    this.labRoot.clear();
    this.labModel = null;
    this.floor.visible = true;
    this.skyMat.uniforms.top.value.set('#1b2f6b');
    this.skyMat.uniforms.bottom.value.set('#6a4fc8');
  }

  // --- Modes -------------------------------------------------------------------------------
  showHeroes(selected) {
    this.mode = 'heroes';
    this.clearActors();
    HERO_ORDER.forEach((id, i) => {
      const h = this.getHero(id);
      const p = this.podiums[i];
      p.visible = true;
      h.m.root.position.set(p.position.x, 0.22, p.position.z);
      h.m.root.rotation.set(0, 0, 0);
      h.rig.extraYaw = -p.position.x * 0.12;
      this.scene.add(h.m.root);
    });
    this.selectHero(selected);
    this.goalPos.set(0, 1.55, 7.2); this.goalLook.set(0, 0.7, 0);
    this.snapIfEntering();
  }

  selectHero(id) {
    this.heroId = id;
    HERO_ORDER.forEach((hid, i) => {
      const h = this.getHero(hid);
      const on = hid === id;
      h.rig.setState(on ? 'wave' : 'idle', { restart: on });
      this.podiums[i].userData.glow.material.opacity = on ? 1 : 0;
    });
  }

  showCelebration(id, { badgeTopic = null } = {}) {
    this.mode = 'celebrate';
    this.clearActors();
    const h = this.getHero(id);
    h.m.root.position.set(0, 0, 0);
    h.rig.extraYaw = 0;
    h.rig.setState('cheer', { restart: true });
    this.scene.add(h.m.root);
    this.heroId = id;
    this.confetti.fire(new THREE.Vector3(0, 0, 0), 2.6, 2.2);
    if (badgeTopic != null) {
      this.medal.visible = true;
      this.medalEmblems.forEach((e, i) => { e.visible = i === badgeTopic; });
      this.medal.position.set(id === 'ginger' ? 0.75 : 1.05, id === 'ginger' ? 0.8 : 1.15, 0.35);
      this.medalBaseY = this.medal.position.y;
    }
    this.frameHero(id, 5.2, 1.25, 0.8, 0.4);
    this.skyMat.uniforms.bottom.value.set('#3f9f8f');
    this.snapIfEntering();
  }

  showMove(id, move) {
    if (this.mode !== 'move' || this.heroId !== id) {
      this.mode = 'move';
      this.clearActors();
      const h = this.getHero(id);
      h.m.root.position.set(0, 0, 0); h.rig.extraYaw = 0;
      this.scene.add(h.m.root);
      this.heroId = id;
      this.frameHero(id, 5.0, 1.25, 0.75);
      this.skyMat.uniforms.bottom.value.set('#c98a2a');
      this.snapIfEntering();
    }
    this.getHero(id).rig.setState(move || 'idle');
  }

  showBreathe(id) {
    this.mode = 'breathe';
    this.clearActors();
    const h = this.getHero(id);
    h.m.root.position.set(0, 0, -0.6); h.rig.extraYaw = 0;
    h.rig.setState('calm');
    this.scene.add(h.m.root);
    this.heroId = id;
    this.bubble.visible = this.bubbleCore.visible = true;
    this.breath = 0.35;
    this.frameHero(id, 5.4, 1.25, 0.95);
    this.skyMat.uniforms.top.value.set('#123a4a');
    this.skyMat.uniforms.bottom.value.set('#2f8f7a');
    this.snapIfEntering();
  }

  setBreath(v) { this.breathGoal = v; }

  showLab(id) {
    this.mode = 'lab';
    this.clearActors();
    this.floor.visible = false;
    const m = buildModel(id, { lod: 2 });
    this.labModel = m;
    this.labId = id;
    this.labRoot.add(m.root);
    const box = measure(m.root);
    this.labBox = box;
    this.labSize = box.getSize(new THREE.Vector3());
    this.labCenter = box.getCenter(new THREE.Vector3());
    this.labSpin = 0;
    this.buildT = null;
    const r = this.labSize.length() * 0.5;
    this.labRadius = r;
    this.setLabView(this.labView);
    this.camPos.copy(this.goalPos); this.camLook.copy(this.goalLook);
  }

  setLabView(view) {
    this.labView = view;
    this.labSpin = 0;
    if (this.labModel) this.labModel.root.rotation.y = 0;
    const c = this.labCenter || new THREE.Vector3();
    // Always keep the 3D goal current so switching back from an orthographic view frames correctly.
    const d = new THREE.Vector3(...VIEWS.iso.dir).normalize();
    const dist = (this.labRadius || 1) / Math.sin((32 * Math.PI) / 360) * 1.0;
    this.goalPos.copy(c).addScaledVector(d, dist);
    this.goalLook.copy(c);
    this.snapIfEntering();
    this.resize();
  }

  setLabStyle(style) { this.labStyle = style; }

  build() {
    if (!this.labModel) return;
    this.buildT = 0;
    const center = this.labCenter;
    this.buildParts = [];
    const meshes = [];
    this.labModel.root.traverse((o) => { if (o.isMesh) meshes.push(o); });
    meshes.sort((a, b) => measure(a).min.y - measure(b).min.y);
    meshes.forEach((mesh, i) => {
      const wc = measure(mesh).getCenter(new THREE.Vector3());
      const dir = wc.clone().sub(center); if (dir.lengthSq() < 1e-4) dir.set(0, 1, 0);
      dir.normalize().multiplyScalar(this.labRadius * 1.6).add(new THREE.Vector3(0, this.labRadius * 0.8, 0));
      this.buildParts.push({ mesh, rest: mesh.userData.restPos.clone(), offsetWorld: dir, delay: (i / meshes.length) * 1.6 });
      mesh.visible = false;
    });
  }

  labDims() {
    // Screen-space overall dimensions for the current orthographic view.
    if (this.mode !== 'lab' || !this.labBox || this.labView === 'iso' || this.labView === 'spin') return null;
    const cam = this.ortho, b = this.labBox, W = this.engine.width, H = this.engine.height;
    const pts = [];
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) pts.push(projectToPixels(new THREE.Vector3(x, y, z), cam, W, H));
    const minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x)), minY = Math.min(...pts.map((p) => p.y)), maxY = Math.max(...pts.map((p) => p.y));
    const axes = { front: ['x', 'y'], back: ['x', 'y'], left: ['z', 'y'], right: ['z', 'y'], top: ['x', 'z'], bottom: ['x', 'z'] }[this.labView];
    return { minX, maxX, minY, maxY, w: this.labSize[axes[0]], h: this.labView === 'top' || this.labView === 'bottom' ? this.labSize.z : b.max.y };
  }

  bindInput() {
    const el = this.engine.canvas;
    let start = null;
    el.addEventListener('pointerdown', (e) => {
      if (this.engine.scene !== this) return;
      start = { x: e.clientX, y: e.clientY, spin: this.labSpin, moved: false };
    });
    el.addEventListener('pointermove', (e) => {
      if (!start || this.engine.scene !== this) return;
      const dx = e.clientX - start.x;
      if (Math.abs(dx) > 6) start.moved = true;
      if (this.mode === 'lab' && start.moved && (this.labView === 'iso' || this.labView === 'spin')) { this.labSpin = start.spin + dx * 0.01; this.userSpun = true; }
    });
    el.addEventListener('pointerup', (e) => {
      if (!start || this.engine.scene !== this) return;
      if (!start.moved && this.mode === 'heroes') {
        const hit = this.engine.pick(e.clientX, e.clientY, this.camera, this.podiums.map((p) => p.userData.hit));
        if (hit) this.onPick?.(hit.object.userData);
      }
      start = null;
    });
  }

  resize() {
    this.engine.applyFocus(this.camera, { vFov: this.mode === 'lab' ? 34 : 30, hFovMin: this.mode === 'heroes' ? 50 : 26, hFovMax: 70 });
    if (this.mode === 'lab' && this.labView !== 'iso' && this.labView !== 'spin' && this.labModel) {
      const W = this.engine.width, H = this.engine.height;
      const f = this.engine.focus && this.engine.focus.w > 20 ? this.engine.focus : { x: 0, y: 0, w: W, h: H };
      const v = VIEWS[this.labView];
      const ax = { front: ['x', 'y'], back: ['x', 'y'], left: ['z', 'y'], right: ['z', 'y'], top: ['x', 'z'], bottom: ['x', 'z'] }[this.labView];
      const sw = this.labSize[ax[0]], sh = this.labSize[ax[1]];
      const scale = Math.min(f.w / (sw * 1.7), f.h / (sh * 1.6));
      const cam = this.ortho;
      cam.left = -W / 2 / scale; cam.right = W / 2 / scale; cam.top = H / 2 / scale; cam.bottom = -H / 2 / scale;
      const c = this.labCenter;
      const camDist = this.labRadius * 2.5 + 0.5; // close camera keeps half-float depth precise
      cam.position.copy(c).addScaledVector(new THREE.Vector3(...v.dir).normalize(), camDist);
      cam.up.set(...v.up);
      cam.lookAt(c);
      cam.near = 0.01; cam.far = camDist * 2 + this.labRadius * 2;
      cam.setViewOffset(W, H, W / 2 - (f.x + f.w / 2), H / 2 - (f.y + f.h / 2), W, H);
      cam.updateProjectionMatrix();
      this.pxPerMeter = scale;
    }
  }

  update(dt, t) {
    this.camPos.lerp(this.goalPos, 1 - Math.exp(-3 * dt));
    this.camLook.lerp(this.goalLook, 1 - Math.exp(-3 * dt));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    for (const id of Object.keys(this.models)) { const h = this.models[id]; if (h.m.root.parent) h.rig.update(dt); }
    if (this.mode === 'heroes') {
      this.podiums.forEach((p, i) => { p.userData.glow.scale.setScalar(1 + Math.sin(t * 4 + i) * 0.04); });
    }
    if (this.mode === 'celebrate' && this.medal.visible) {
      this.medal.rotation.y += dt * 1.6;
      this.medal.position.y = (this.medalBaseY || 1.15) + Math.sin(t * 2) * 0.08;
    }
    if (this.mode === 'breathe') {
      this.breath = damp(this.breath, this.breathGoal ?? 0.35, 1.6, dt);
      const s = 0.45 + this.breath * 0.75;
      this.bubble.scale.setScalar(s);
      this.bubbleCore.scale.setScalar(s * 2.2);
      this.bubble.material.uniforms.uOpacity.value = 0.45 + this.breath * 0.35;
    }
    const hero = this.models[this.heroId];
    if (hero && hero.m.root.parent) { this.heroShadow.visible = this.mode !== 'heroes' && this.mode !== 'lab'; this.heroShadow.position.set(hero.m.root.position.x, 0.03, hero.m.root.position.z); this.heroShadow.scale.set(1.1, 1, 0.9); }
    else this.heroShadow.visible = false;
    if (this.mode === 'lab' && this.labModel) {
      if (this.labView === 'spin' && !this.userSpun) this.labSpin += dt * 0.6;
      if (this.labView === 'iso' || this.labView === 'spin') this.labModel.root.rotation.y = this.labSpin;
      if (this.buildT != null) {
        this.buildT += dt;
        let done = true;
        for (const p of this.buildParts) {
          const k = Math.min(1, Math.max(0, (this.buildT - p.delay) / 0.7));
          if (k < 1) done = false;
          p.mesh.visible = k > 0;
          const off = p.offsetWorld.clone().multiplyScalar(1 - easeOutBack(k));
          p.mesh.position.copy(p.rest).add(off);
        }
        if (done) { this.buildT = null; this.onBuilt?.(); }
      }
    }
    this.confetti.update(dt);
    this.bursts.update(dt, 0);
  }

  render(renderer) {
    if (this.mode === 'lab' && this.labModel && this.labStyle === 'blueprint') {
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      const ortho = this.labView !== 'iso' && this.labView !== 'spin';
      const cam = ortho ? this.ortho : this.camera;
      const pr = renderer.getPixelRatio();
      const pixelWorld = ortho ? 1 / (this.pxPerMeter * pr) : (this.labRadius * 2.4) / size.y;
      this.labModel.root.updateMatrixWorld(true);
      this.bpr.render(this.labModel.root, cam, { width: size.x, height: size.y, lineWidth: 1.15 * pr, pixelWorld, depthK: Math.max(0.006, this.labRadius * 0.02), background: BP.bg, fillAmount: 0.8 });
      return;
    }
    if (this.mode === 'lab' && this.labModel && this.labView !== 'iso' && this.labView !== 'spin') { renderer.render(this.scene, this.ortho); return; }
    renderer.render(this.scene, this.camera);
  }
}

export const LAB_GROUPS = [
  { title: 'Heroes', ids: HERO_ORDER },
  { title: 'Gate & emblems', ids: ['gate', ...EMBLEM_BY_TOPIC] },
  { title: 'World props', ids: Object.keys(BLUEPRINTS).filter((k) => BLUEPRINTS[k].kind === 'prop') }
];
export { WORLDS };
