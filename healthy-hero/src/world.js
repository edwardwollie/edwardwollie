// Run-scene environment: sky, fog, lights, recycled track tiles and scenery chunks for the
// six biomes. Each obstacle has its own topic, so the world "morphs" between biomes with a
// sparkling wave that sweeps down the track toward the runner.
import * as THREE from './vendor/three.module.min.js?v=2.0.0';
import { BIOMES, LAYOUT, BLUEPRINTS, EMBLEM_BY_TOPIC } from './blueprints.js?v=2.0.0';
import { buildMergedProp, buildModel } from './models.js?v=2.0.0';
import { Ambient } from './effects.js?v=2.0.0';
import { WORLDS } from './content.js?v=2.0.0';

const TILE = LAYOUT.tileLength;
const N_TILES = 10;
const ROAD_W = LAYOUT.lanes * LAYOUT.laneWidth;
const HALF = ROAD_W / 2;
const WIPE_SPEED = 26;

const KITS = [
  { near: ['carrot', 'veggieCrate', 'sunflower'], mid: ['fruitTree', 'fruitTree', 'sunflower'], far: ['fruitTree'], farScale: [1.7, 2.4] },
  { near: ['reeds', 'reeds'], mid: ['bottleTower', 'reeds'], far: ['cliffFalls'], farScale: [1.3, 1.9], water: true },
  { near: ['flag', 'hurdle'], mid: ['pineTree', 'pineTree', 'flag'], far: ['mountain'], farScale: [1.3, 2.3] },
  { near: ['starLantern', 'cloud'], mid: ['cloud', 'cloudBed'], far: ['cloud'], farScale: [2.2, 3.4] },
  { near: ['bubble', 'toothbrushPost', 'duck'], mid: ['bubble', 'duck'], far: ['lighthouse'], farScale: [1.2, 1.7], water: true },
  { near: ['zenStones', 'paperLantern'], mid: ['bamboo', 'blossomTree', 'bamboo'], far: ['blossomTree'], farScale: [1.7, 2.5] }
];

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }

// ----------------------------------------------------------------------------------------
// Procedural textures
// ----------------------------------------------------------------------------------------
function canvas(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function laneLines(g, w, h, color = 'rgba(255,255,255,0.75)') {
  g.fillStyle = color;
  for (const u of [1 / 3, 2 / 3]) for (let y = 0; y < h; y += 128) g.fillRect(u * w - 5, y + 16, 10, 76);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(0, 0, 8, h); g.fillRect(w - 8, 0, 8, h);
}

function pathTexture(key, colors) {
  return canvas(512, 512, (g, w, h) => {
    const [a, b] = colors;
    g.fillStyle = a; g.fillRect(0, 0, w, h);
    const r = rng(key.length * 991);
    if (key === 'garden') { // brick path
      for (let y = 0; y < h; y += 32) for (let x = (y / 32) % 2 ? -32 : 0; x < w; x += 64) {
        g.fillStyle = r() > 0.5 ? a : b; g.fillRect(x + 2, y + 2, 60, 28);
      }
    } else if (key === 'falls') { // wet stone slabs
      for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 85.3) {
        g.fillStyle = r() > 0.5 ? a : b; g.fillRect(x + 3, y + 3, 79, 58);
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 8, y + 8, 30, 6);
      }
    } else if (key === 'mountain') { // dirt trail with pebbles
      for (let i = 0; i < 260; i++) { g.fillStyle = r() > 0.5 ? b : 'rgba(255,255,255,0.18)'; g.beginPath(); g.arc(r() * w, r() * h, 2 + r() * 6, 0, 7); g.fill(); }
    } else if (key === 'sky') { // cloud road
      for (let i = 0; i < 90; i++) { g.fillStyle = r() > 0.5 ? b : 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(r() * w, r() * h, 10 + r() * 26, 0, 7); g.fill(); }
      g.fillStyle = 'rgba(184,137,255,0.25)'; g.fillRect(0, 0, w, h);
    } else if (key === 'harbor') { // boardwalk planks across the track
      for (let y = 0; y < h; y += 42.66) { g.fillStyle = r() > 0.5 ? a : b; g.fillRect(0, y + 2, w, 39); g.fillStyle = 'rgba(60,35,15,0.35)'; for (const x of [w * 0.18, w * 0.5, w * 0.82]) { g.beginPath(); g.arc(x, y + 21, 3, 0, 7); g.fill(); } }
    } else { // grove flagstones
      for (let y = 0; y < h; y += 64) for (let x = (y / 64) % 2 ? -40 : 0; x < w; x += 80) {
        g.fillStyle = r() > 0.5 ? a : b; g.beginPath(); g.roundRect(x + 4, y + 4, 72, 56, 14); g.fill();
      }
      g.fillStyle = 'rgba(111,207,95,0.35)';
      for (let i = 0; i < 60; i++) { g.beginPath(); g.arc(r() * w, r() * h, 3 + r() * 5, 0, 7); g.fill(); }
    }
    laneLines(g, w, h);
  });
}

function noiseTexture(base = '#ffffff', speck = 'rgba(0,0,0,0.08)', count = 900, size = 3) {
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const r = rng(7);
    for (let i = 0; i < count; i++) { g.fillStyle = r() > 0.5 ? speck : 'rgba(255,255,255,0.1)'; g.fillRect(r() * w, r() * h, size * (0.5 + r()), size * (0.5 + r()) * 2); }
  });
}

function waterTexture() {
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    const r = rng(3);
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = `rgba(255,255,255,${0.35 + r() * 0.4})`; g.lineWidth = 2 + r() * 3;
      const x = r() * w, y = r() * h, l = 14 + r() * 30;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 4, x + l, y); g.stroke();
    }
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, 'rgba(0,40,80,0.18)'); grd.addColorStop(0.5, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,40,80,0.18)');
    g.globalCompositeOperation = 'multiply'; g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });
}

export function bannerTexture(text, sub, color) {
  return canvas(1024, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(7,25,46,0.86)'; g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, 60); g.fill();
    g.lineWidth = 10; g.strokeStyle = color; g.stroke();
    g.fillStyle = color; g.font = "900 34px Nunito, system-ui, sans-serif"; g.textAlign = 'center'; g.fillText(sub.toUpperCase(), w / 2, 78);
    g.fillStyle = '#ffffff'; g.font = "800 96px 'Baloo 2', Nunito, system-ui, sans-serif"; g.fillText(text, w / 2, 186);
  });
}

// ----------------------------------------------------------------------------------------
export class World {
  constructor(scene, { density = 1, shadows = true } = {}) {
    this.scene = scene;
    this.density = density;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.biome = 0;
    this.time = 0;
    this.buildSky();
    this.buildLights(shadows);
    this.buildMaterials();
    this.buildTiles();
    this.buildArch();
    this.buildWipe();
    this.ambient = new Ambient(this.group, Math.round(220 * density));
    this.envFrom = this.envSnapshot(0);
    this.envTo = this.envFrom;
    this.envT = 1;
    this.setBiome(0, { instant: true });
  }

  // --- Sky ------------------------------------------------------------------------------
  buildSky() {
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, stars: { value: 0 }, time: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position = p.xyww; }',
      fragmentShader: `uniform vec3 top, mid, horizon; uniform float stars, time; varying vec3 vP;
        float hash(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        void main(){ float h = vP.y; vec3 c = h > 0.18 ? mix(mid, top, smoothstep(0.18, 0.75, h)) : mix(horizon, mid, smoothstep(-0.05, 0.18, h));
          if (stars > 0.0 && h > 0.05) { vec3 q = floor(vP*220.0); float s = step(0.9965, hash(q)); float tw = 0.6 + 0.4*sin(time*3.0 + hash(q+1.7)*40.0); c += vec3(s*tw*stars); }
          gl_FragColor = vec4(c, 1.0); }`
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    this.scene.fog = new THREE.Fog('#ffd9a8', 34, 125);
    // Moon for Sleep Sky
    const moon = buildModel('emblemMoon', { lod: 1 });
    moon.root.traverse((o) => { if (o.isMesh) { o.material = new THREE.MeshBasicMaterial({ color: o.material.color, fog: false, toneMapped: false, transparent: true }); } });
    moon.root.scale.setScalar(70);
    moon.root.position.set(-70, 60, -330);
    this.moon = moon.root;
    this.moon.visible = false;
    this.scene.add(this.moon);
  }

  buildLights(shadows) {
    this.hemi = new THREE.HemisphereLight('#ffffff', '#557744', 1.35);
    this.sun = new THREE.DirectionalLight('#ffffff', 2.1);
    this.sun.position.set(5, 11, 6);
    this.sun.castShadow = shadows;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -7; sc.right = 7; sc.top = 8; sc.bottom = -8; sc.near = 1; sc.far = 40;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;
    this.sunTarget = new THREE.Object3D();
    this.sunTarget.position.set(0, 0, -6);
    this.sun.target = this.sunTarget;
    this.scene.add(this.hemi, this.sun, this.sunTarget);
  }

  // --- Materials --------------------------------------------------------------------------
  buildMaterials() {
    this.roadMats = BIOMES.map((b) => new THREE.MeshLambertMaterial({ map: pathTexture(b.key, b.path) }));
    const grass = noiseTexture('#ffffff', 'rgba(0,60,0,0.12)', 1400, 3);
    grass.repeat.set(4, 3);
    const cloud = noiseTexture('#ffffff', 'rgba(150,120,255,0.12)', 500, 9);
    cloud.repeat.set(3, 2);
    this.water = waterTexture();
    this.water.repeat.set(6, 3);
    this.sideMats = BIOMES.map((b, i) => {
      if (KITS[i].water) return new THREE.MeshStandardMaterial({ color: i === 1 ? '#3fb7e6' : '#25b6cf', map: this.water, roughness: 0.18, metalness: 0.05, transparent: false });
      if (b.key === 'sky') return new THREE.MeshLambertMaterial({ color: b.ground, map: cloud });
      return new THREE.MeshLambertMaterial({ color: b.ground, map: grass });
    });
    this.curbMats = BIOMES.map((b) => new THREE.MeshLambertMaterial({ color: new THREE.Color(b.path[1]).lerp(new THREE.Color('#ffffff'), 0.35) }));
    this.waterfallMat = new THREE.MeshBasicMaterial({ color: '#bff3ff', map: this.water, transparent: true, opacity: 0.92, toneMapped: false });
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshLambertMaterial({ color: '#5fbf4a' }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(0, -0.09, -200);
    this.group.add(this.ground);
  }

  // --- Tiles + scenery chunks ---------------------------------------------------------------
  buildTiles() {
    this.tiles = [];
    const roadGeo = new THREE.PlaneGeometry(ROAD_W, TILE);
    roadGeo.rotateX(-Math.PI / 2);
    const curbGeo = new THREE.BoxGeometry(LAYOUT.curbWidth, 0.2, TILE);
    const sideGeo = new THREE.PlaneGeometry(40, TILE);
    sideGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < N_TILES; i++) {
      const g = new THREE.Group();
      g.position.z = 6 - i * TILE;
      const road = new THREE.Mesh(roadGeo, this.roadMats[0]);
      road.receiveShadow = true;
      const curbL = new THREE.Mesh(curbGeo, this.curbMats[0]); curbL.position.set(-HALF - LAYOUT.curbWidth / 2, 0.08, 0);
      const curbR = new THREE.Mesh(curbGeo, this.curbMats[0]); curbR.position.set(HALF + LAYOUT.curbWidth / 2, 0.08, 0);
      const sideL = new THREE.Mesh(sideGeo, this.sideMats[0]); sideL.position.set(-HALF - LAYOUT.curbWidth - 20, -0.03, 0);
      const sideR = new THREE.Mesh(sideGeo, this.sideMats[0]); sideR.position.set(HALF + LAYOUT.curbWidth + 20, -0.03, 0);
      sideL.receiveShadow = sideR.receiveShadow = false;
      g.add(road, curbL, curbR, sideL, sideR);
      const kits = BIOMES.map((b, bi) => this.buildKit(bi, i));
      kits.forEach((k) => g.add(k));
      g.userData = { road, curbs: [curbL, curbR], sides: [sideL, sideR], kits, biome: -1, index: i };
      this.group.add(g);
      this.tiles.push(g);
    }
  }

  buildKit(bi, tileIndex) {
    const kit = new THREE.Group();
    kit.visible = false;
    const K = KITS[bi];
    const r = rng(1000 + bi * 77 + tileIndex * 13);
    const place = (id, x, z, scale = 1, y = 0) => {
      const p = buildMergedProp(id, { tagMaterials: { waterfall: this.waterfallMat } });
      p.position.set(x, y, z);
      p.rotation.y = (r() - 0.5) * 1.2 + (x < 0 ? 0.4 : -0.4);
      p.scale.setScalar(scale);
      p.traverse((o) => { if (o.isMesh) { o.matrixAutoUpdate = true; } });
      kit.add(p);
      return p;
    };
    const dens = this.density;
    for (const side of [-1, 1]) {
      if (r() < 0.85 * dens) {
        const id = K.near[Math.floor(r() * K.near.length)];
        const water = K.water && id !== 'reeds' && id !== 'toothbrushPost';
        place(id, side * (HALF + 1.4 + r() * 2.2), (r() - 0.5) * TILE * 0.8, 0.85 + r() * 0.35, water ? -0.15 : 0);
      }
      const mids = 1 + (r() < 0.6 * dens ? 1 : 0);
      for (let m = 0; m < mids; m++) {
        const id = K.mid[Math.floor(r() * K.mid.length)];
        const y = bi === 3 && id === 'cloud' ? -0.6 + r() * 2.5 : 0;
        const sc = id === 'cloudBed' ? 0.62 + r() * 0.2 : 0.9 + r() * 0.5;
        place(id, side * (HALF + (id === 'cloudBed' ? 7.5 : 5) + r() * 7), (r() - 0.5) * TILE * 0.9, sc, y);
      }
      if ((tileIndex + (side > 0 ? 1 : 0)) % 2 === 0) {
        const id = K.far[Math.floor(r() * K.far.length)];
        const [s0, s1] = K.farScale;
        const y = bi === 3 ? -2 + r() * 6 : 0;
        place(id, side * (HALF + 15 + r() * 14), (r() - 0.5) * TILE, s0 + r() * (s1 - s0), y);
      }
    }
    return kit;
  }

  skinTile(tile, bi) {
    const u = tile.userData;
    if (u.biome === bi) return;
    u.biome = bi;
    u.road.material = this.roadMats[bi];
    u.curbs.forEach((c) => { c.material = this.curbMats[bi]; });
    u.sides.forEach((s) => { s.material = this.sideMats[bi]; s.position.y = KITS[bi].water ? -0.05 : -0.03; });
    u.kits.forEach((k, i) => { k.visible = i === bi; });
  }

  // --- Welcome arch + wipe -------------------------------------------------------------------
  buildArch() {
    const arch = new THREE.Group();
    const post = new THREE.CylinderGeometry(0.22, 0.28, 5.2, 12);
    this.archMat = new THREE.MeshStandardMaterial({ color: '#63f2c0', roughness: 0.4 });
    const l = new THREE.Mesh(post, this.archMat); l.position.set(-HALF - 0.9, 2.6, 0);
    const r = new THREE.Mesh(post, this.archMat); r.position.set(HALF + 0.9, 2.6, 0);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(ROAD_W + 2.6, 0.4, 0.4), this.archMat); beam.position.set(0, 5.1, 0);
    this.bannerMat = new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, side: THREE.DoubleSide });
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.6), this.bannerMat); banner.position.set(0, 4.15, 0.25);
    arch.add(l, r, beam, banner);
    this.emblemHolder = new THREE.Group();
    this.emblemHolder.position.set(0, 6.1, 0);
    arch.add(this.emblemHolder);
    this.emblems = EMBLEM_BY_TOPIC.map((id) => { const m = buildModel(id, { lod: 1 }); m.root.scale.setScalar(3.2); m.root.visible = false; this.emblemHolder.add(m.root); return m.root; });
    arch.visible = false;
    this.arch = arch;
    this.group.add(arch);
    this.bannerCache = {};
  }

  buildWipe() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(6.4, 0.16, 8, 64, Math.PI), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const curtain = new THREE.Mesh(new THREE.PlaneGeometry(13, 6.5), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color('#ffffff') }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'uniform vec3 uColor; uniform float uTime; varying vec2 vUv; void main(){ float d = length(vUv*vec2(1.0,1.6)-vec2(0.5,0.0)); float ring = smoothstep(0.5,0.42,d); float sp = step(0.985, fract(sin(dot(floor(vUv*vec2(60.0,30.0)+vec2(0.0,uTime*8.0)), vec2(12.9898,78.233)))*43758.5453)); gl_FragColor = vec4(uColor*(ring*0.18 + sp*ring*0.9), 1.0); }'
    }));
    curtain.position.y = 3.2;
    g.add(ring, curtain);
    g.visible = false;
    this.wipe = { group: g, ring, curtain, z: 0, active: false };
    this.group.add(g);
  }

  // --- Biome control -------------------------------------------------------------------------
  envSnapshot(bi) {
    const b = BIOMES[bi];
    return {
      top: new THREE.Color(b.sky[0]), mid: new THREE.Color(b.sky[1]), horizon: new THREE.Color(b.sky[2]), fog: new THREE.Color(b.fog),
      ground: new THREE.Color(b.ground), hemiSky: new THREE.Color(b.hemi[0]), hemiGround: new THREE.Color(b.hemi[1]), sun: new THREE.Color(b.sun),
      sunI: b.night ? 0.9 : 2.1, hemiI: b.night ? 1.05 : 1.35, stars: b.night ? 1 : 0
    };
  }

  setBiome(bi, { instant = false } = {}) {
    if (instant) {
      this.biome = bi;
      this.tiles.forEach((t) => this.skinTile(t, bi));
      this.envFrom = this.envTo = this.envSnapshot(bi);
      this.envT = 1;
      this.applyEnv(this.envTo);
      this.ambient.setKind(BIOMES[bi].ambient);
      this.moon.visible = !!BIOMES[bi].night;
      this.wipe.active = false; this.wipe.group.visible = false;
      return;
    }
    if (bi === this.biome && !this.wipe.active) return;
    this.biome = bi;
    this.envFrom = this.currentEnv || this.envSnapshot(bi);
    this.envTo = this.envSnapshot(bi);
    this.envT = 0;
    this.wipe.active = true;
    this.wipe.z = -96;
    this.wipe.group.visible = true;
    this.wipe.group.position.z = this.wipe.z;
    const col = new THREE.Color(WORLDS[bi].color);
    this.wipe.ring.material.color.copy(col).lerp(new THREE.Color('#ffffff'), 0.3);
    this.wipe.curtain.material.uniforms.uColor.value.copy(col);
    // Welcome arch rides with the world from the wipe start.
    this.arch.visible = true;
    this.arch.position.z = -88;
    this.archMat.color.set(WORLDS[bi].color);
    if (!this.bannerCache[bi]) this.bannerCache[bi] = bannerTexture(WORLDS[bi].name, `Welcome to · ${WORLDS[bi].topic}`, WORLDS[bi].color);
    this.bannerMat.map = this.bannerCache[bi]; this.bannerMat.needsUpdate = true;
    this.emblems.forEach((e, i) => { e.visible = i === bi; });
    this.ambientPending = BIOMES[bi].ambient;
  }

  applyEnv(e) {
    const u = this.skyMat.uniforms;
    u.top.value.copy(e.top); u.mid.value.copy(e.mid); u.horizon.value.copy(e.horizon); u.stars.value = e.stars;
    this.scene.fog.color.copy(e.fog);
    this.ground.material.color.copy(e.ground);
    this.hemi.color.copy(e.hemiSky); this.hemi.groundColor.copy(e.hemiGround); this.hemi.intensity = e.hemiI;
    this.sun.color.copy(e.sun); this.sun.intensity = e.sunI;
    this.currentEnv = e;
  }

  lerpEnv(a, b, t) {
    const L = (x, y) => x.clone().lerp(y, t);
    return { top: L(a.top, b.top), mid: L(a.mid, b.mid), horizon: L(a.horizon, b.horizon), fog: L(a.fog, b.fog), ground: L(a.ground, b.ground), hemiSky: L(a.hemiSky, b.hemiSky), hemiGround: L(a.hemiGround, b.hemiGround), sun: L(a.sun, b.sun), sunI: a.sunI + (b.sunI - a.sunI) * t, hemiI: a.hemiI + (b.hemiI - a.hemiI) * t, stars: a.stars + (b.stars - a.stars) * t };
  }

  // --- Frame update ---------------------------------------------------------------------------
  update(dt, t, speed) {
    this.time = t;
    const move = speed * dt;
    for (const tile of this.tiles) {
      tile.position.z += move;
      if (tile.position.z > TILE + 6) {
        tile.position.z -= N_TILES * TILE;
        this.skinTile(tile, this.biome);
      }
    }
    if (this.arch.visible) {
      this.arch.position.z += move;
      this.emblemHolder.rotation.y += dt * 1.2;
      if (this.arch.position.z > 14) this.arch.visible = false;
    }
    if (this.wipe.active) {
      this.wipe.z += (WIPE_SPEED + speed) * dt;
      this.wipe.group.position.z = this.wipe.z;
      this.wipe.curtain.material.uniforms.uTime.value = t;
      for (const tile of this.tiles) if (tile.position.z < this.wipe.z) this.skinTile(tile, this.biome);
      this.envT = Math.min(1, this.envT + dt / 2.6);
      this.applyEnv(this.lerpEnv(this.envFrom, this.envTo, this.envT * this.envT * (3 - 2 * this.envT)));
      if (this.wipe.z > -24 && this.ambientPending) { this.ambient.setKind(this.ambientPending); this.ambientPending = null; this.moon.visible = !!BIOMES[this.biome].night; }
      if (this.wipe.z > 12) { this.wipe.active = false; this.wipe.group.visible = false; this.tiles.forEach((tl) => this.skinTile(tl, this.biome)); this.applyEnv(this.envTo); }
    }
    this.skyMat.uniforms.time.value = t;
    this.water.offset.y = (this.water.offset.y + dt * (this.biome === 1 ? 0.9 : 0.12)) % 1;
    this.water.offset.x = Math.sin(t * 0.3) * 0.05;
    this.ambient.update(dt, t, speed);
  }

  setShadows(on) { this.sun.castShadow = on; }
}
