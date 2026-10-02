// Neon Dominion 3D renderer (three.js, WebGL2).
//
// The simulation in game.js stays 2D (x across, y forward, 25 units = 1 m). This renderer
// maps it into a 3D world (X = x, Z = -y, +Y up) and draws every unit with GPU-instanced
// copies of the blueprint meshes from ./blueprints. One pool per unit type keeps the draw
// call count fixed no matter how big the Legion gets.

import * as THREE from "./vendor/three.js";
import { MODELS, guardianVariant } from "./blueprints/models.js";
import { buildModel, createMaterial, modelToGroup, applyPose, measure } from "./blueprints/kit.js";
import { poseFor } from "./blueprints/rigs.js";
import { VIEWS } from "./blueprints/views.js";

const U = 1 / 25;
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const pathX = (y) => Math.sin(y * 0.00205) * 82 + Math.sin(y * 0.00071 + 1.3) * 54; // mirrors game.pathX

export const SECTOR_THEMES = [
  { zenith: "#03081c", horizon: "#1d3f86", fog: "#0a1636", ground: "#060b18", accent: "#45f6ff", accent2: "#ff52ce", key: "#b9d4ff" },
  { zenith: "#07041a", horizon: "#432078", fog: "#150b31", ground: "#090718", accent: "#b77bff", accent2: "#45f6ff", key: "#d6c6ff" },
  { zenith: "#020f13", horizon: "#0f525c", fog: "#062027", ground: "#041012", accent: "#3df5e0", accent2: "#ffd85a", key: "#c0fff6" },
  { zenith: "#10040b", horizon: "#62203f", fog: "#220917", ground: "#0d050a", accent: "#ff5a9e", accent2: "#ffb347", key: "#ffd0e2" },
  { zenith: "#030d09", horizon: "#1e5240", fog: "#081f18", ground: "#040c09", accent: "#4dffad", accent2: "#45f6ff", key: "#c8ffe4" }
];

const QUALITY = {
  high: { dpr: 2, shadows: 2048, bloom: true, msaa: 4, fxaa: false, lights: 6, particles: 700, towers: 160 },
  medium: { dpr: 1.5, shadows: 1024, bloom: true, msaa: 0, fxaa: true, lights: 3, particles: 450, towers: 110 },
  low: { dpr: 1, shadows: 0, bloom: false, msaa: 0, fxaa: false, lights: 0, particles: 260, towers: 70 }
};

const colorCache = new Map();
function color(value) {
  if (!colorCache.has(value)) colorCache.set(value, new THREE.Color(value));
  return colorCache.get(value);
}

// ---------------------------------------------------------------------------
// Shader helpers
// ---------------------------------------------------------------------------

/** Adds a per-instance white-hot hit flash (attribute aFlash) to a standard/physical material. */
function withFlash(material) {
  const patched = material.clone();
  patched.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aFlash;\nvarying float vFlash;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFlash = aFlash;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vFlash;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.9, 0.86) * vFlash * 2.4;");
  };
  patched.customProgramCacheKey = () => "nd-flash";
  patched.userData = { ...material.userData };
  return patched;
}

const NOISE_GLSL = `
float ndHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float ndNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(ndHash(i + vec3(0,0,0)), ndHash(i + vec3(1,0,0)), f.x), mix(ndHash(i + vec3(0,1,0)), ndHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(ndHash(i + vec3(0,0,1)), ndHash(i + vec3(1,0,1)), f.x), mix(ndHash(i + vec3(0,1,1)), ndHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float ndFbm(vec3 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * ndNoise(p); p *= 2.03; a *= 0.5; } return v; }
`;

function billboardMaterial(blending = THREE.AdditiveBlending, soft = 2.0) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending,
    toneMapped: false,
    uniforms: {},
    vertexShader: `
      attribute float aAlpha;
      varying vec2 vUv; varying vec3 vColor; varying float vAlpha;
      void main() {
        vUv = uv;
        vec4 center = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float s = length(instanceMatrix[0].xyz);
        center.xy += position.xy * s;
        gl_Position = projectionMatrix * center;
        #ifdef USE_INSTANCING_COLOR
          vColor = instanceColor;
        #else
          vColor = vec3(1.0);
        #endif
        vAlpha = aAlpha;
      }`,
    fragmentShader: `
      varying vec2 vUv; varying vec3 vColor; varying float vAlpha;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float a = pow(max(0.0, 1.0 - d), ${soft.toFixed(1)});
        if (a * vAlpha < 0.003) discard;
        gl_FragColor = vec4(vColor * (1.0 + 2.5 * pow(max(0.0, 1.0 - d * 2.2), 3.0)), a * vAlpha);
      }`
  });
}

// ---------------------------------------------------------------------------
// GPU-instanced blueprint unit pool
// ---------------------------------------------------------------------------

class UnitPool {
  constructor(scene, spec, capacity, materialCache) {
    this.spec = spec;
    this.capacity = capacity;
    this.model = buildModel(spec);
    this.size = measure(this.model);
    const names = [...this.model.pivots.keys()];
    const depth = (name) => {
      let level = 0;
      let current = this.model.pivots.get(name);
      while (current.parent) {
        level += 1;
        current = this.model.pivots.get(current.parent);
      }
      return level;
    };
    names.sort((a, b) => depth(a) - depth(b));
    this.pivots = names.map((name) => {
      const pivot = this.model.pivots.get(name);
      const parent = pivot.parent ? this.model.pivots.get(pivot.parent) : null;
      return {
        name,
        parent: pivot.parent ? names.indexOf(pivot.parent) : -1,
        rest: new THREE.Vector3(pivot.at[0] - (parent?.at[0] || 0), pivot.at[1] - (parent?.at[1] || 0), pivot.at[2] - (parent?.at[2] || 0))
      };
    });
    this.world = this.pivots.map(() => new THREE.Matrix4());
    this.flash = new Float32Array(capacity);
    this.meshes = this.model.chunks.map((chunk) => {
      const base = createMaterial(spec, chunk.mat, materialCache);
      const material = withFlash(base);
      const flash = new THREE.InstancedBufferAttribute(this.flash, 1);
      flash.setUsage(THREE.DynamicDrawUsage);
      chunk.geometry.setAttribute("aFlash", flash);
      const mesh = new THREE.InstancedMesh(chunk.geometry, material, capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.castShadow = !base.userData?.glow;
      mesh.receiveShadow = true;
      mesh.userData.pivotIndex = names.indexOf(chunk.pivot);
      mesh.userData.flash = flash;
      scene.add(mesh);
      return mesh;
    });
    this.count = 0;
    this.local = new THREE.Matrix4();
    this.position = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.euler = new THREE.Euler(0, 0, 0, "YXZ");
    this.scale = new THREE.Vector3();
  }

  begin() {
    this.count = 0;
  }

  push(root, pose, flash = 0) {
    if (this.count >= this.capacity) return false;
    for (let index = 0; index < this.pivots.length; index += 1) {
      const pivot = this.pivots[index];
      if (index === 0) {
        this.world[0].copy(root);
        continue;
      }
      const joint = pose[pivot.name];
      this.position.copy(pivot.rest);
      if (joint) {
        this.position.x += joint.px || 0;
        this.position.y += joint.py || 0;
        this.position.z += joint.pz || 0;
        this.euler.set(joint.rx || 0, joint.ry || 0, joint.rz || 0);
        this.quaternion.setFromEuler(this.euler);
        const s = joint.s ?? 1;
        this.scale.set(s, s, s);
      } else {
        this.quaternion.identity();
        this.scale.set(1, 1, 1);
      }
      this.local.compose(this.position, this.quaternion, this.scale);
      this.world[index].multiplyMatrices(this.world[pivot.parent], this.local);
    }
    for (const mesh of this.meshes) mesh.setMatrixAt(this.count, this.world[mesh.userData.pivotIndex]);
    this.flash[this.count] = flash;
    this.count += 1;
    return true;
  }

  end() {
    for (const mesh of this.meshes) {
      mesh.count = this.count;
      mesh.visible = this.count > 0;
      if (this.count > 0) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.userData.flash.needsUpdate = true;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Simple effect layers
// ---------------------------------------------------------------------------

class FlareLayer {
  constructor(scene, capacity, blending = THREE.AdditiveBlending, soft = 2.0) {
    this.capacity = capacity;
    this.items = [];
    this.alpha = new Float32Array(capacity);
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.setAttribute("aAlpha", new THREE.InstancedBufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mesh = new THREE.InstancedMesh(geometry, billboardMaterial(blending, soft), capacity);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
    this.matrix = new THREE.Matrix4();
    this.tint = new THREE.Color();
  }

  add(item) {
    if (this.items.length >= this.capacity) this.items.shift();
    this.items.push({ vx: 0, vy: 0, vz: 0, grow: 0, gravity: 0, alpha: 1, ...item, maxLife: item.life });
  }

  update(dt) {
    let count = 0;
    const next = [];
    for (const item of this.items) {
      item.life -= dt;
      if (item.life <= 0) continue;
      item.x += item.vx * dt;
      item.y += item.vy * dt;
      item.z += item.vz * dt;
      item.vy -= item.gravity * dt;
      item.size += item.grow * dt;
      const k = item.life / item.maxLife;
      this.matrix.makeScale(item.size, item.size, item.size).setPosition(item.x, item.y, item.z);
      this.mesh.setMatrixAt(count, this.matrix);
      this.tint.copy(item.color).multiplyScalar(item.intensity ?? 1);
      this.mesh.setColorAt(count, this.tint);
      this.alpha[count] = item.alpha * (item.fadeIn ? Math.min(1, (1 - k) * 6) * k : k);
      count += 1;
      next.push(item);
    }
    this.items = next;
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.geometry.getAttribute("aAlpha").needsUpdate = true;
  }

  clear() {
    this.items.length = 0;
    this.mesh.count = 0;
  }
}

class RingLayer {
  constructor(scene, inner, capacity, segments = 72) {
    this.capacity = capacity;
    const geometry = new THREE.RingGeometry(inner, 1, segments, 1);
    geometry.rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide
    }), capacity);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
    this.matrix = new THREE.Matrix4();
    this.tint = new THREE.Color();
    this.count = 0;
  }

  begin() {
    this.count = 0;
  }

  add(x, z, radius, hex, alpha, y = 0.04) {
    if (this.count >= this.capacity || radius <= 0) return;
    this.matrix.makeScale(radius, 1, radius).setPosition(x, y, z);
    this.mesh.setMatrixAt(this.count, this.matrix);
    this.tint.copy(typeof hex === "string" ? color(hex) : hex).multiplyScalar(alpha);
    this.mesh.setColorAt(this.count, this.tint);
    this.count += 1;
  }

  end() {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export class Renderer3D {
  static isSupported() {
    try {
      const canvas = document.createElement("canvas");
      return Boolean(canvas.getContext("webgl2"));
    } catch {
      return false;
    }
  }

  static detectQuality() {
    const coarse = window.matchMedia?.("(pointer: coarse)").matches;
    const memory = navigator.deviceMemory || 4;
    const cores = navigator.hardwareConcurrency || 4;
    if (coarse && (memory <= 3 || cores <= 4)) return "low";
    if (coarse) return "medium";
    return cores <= 2 ? "medium" : "high";
  }

  constructor(canvas, { quality = "auto", reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.reducedMotion = reducedMotion;
    this.cinematics = !reducedMotion;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.qualitySetting = quality;
    this.tier = quality === "auto" ? Renderer3D.detectQuality() : quality;
    this.resolutionScale = 1;
    this.frameTimes = [];
    this.adaptClock = 0;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2400);
    this.camera.position.set(0, 16, 14);
    this.focus = new THREE.Vector3();
    this.cameraState = { mode: "follow", timer: 0, height: 15, distance: 12.5, roll: 0, orbit: 0 };
    this.shake = 0;
    this.hitPulse = 0;
    this.flashPulse = 0;
    this.flashColor = new THREE.Color(1, 1, 1);
    this.desat = 0;
    this.slowmo = 1;
    this.animTime = 0;
    this.unitState = new WeakMap();
    this.envKey = null;
    this.theme = SECTOR_THEMES[0];

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    this.buildLights();
    this.buildSky();
    this.buildGround();
    this.buildPools();
    this.buildEffects();
    this.buildComposer();
    this.hangar = null;
    this.hangarActive = false;
    this.applyQuality();
    this.resize();
  }

  // -------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0x8fb6ff, 0x120a1e, 0.55);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xc8dcff, 2.3);
    this.sun.position.set(-12, 26, 10);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    const extent = 24;
    Object.assign(this.sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 1, far: 90 });
    this.scene.add(this.sun, this.sun.target);
    this.rim = new THREE.DirectionalLight(0xff52ce, 0.55);
    this.rim.position.set(6, 8, -30);
    this.scene.add(this.rim);
    this.pointLights = [];
    for (let index = 0; index < 6; index += 1) {
      const light = new THREE.PointLight(0xffffff, 0, 14, 2);
      light.userData = { life: 0, max: 1, power: 0 };
      this.scene.add(light);
      this.pointLights.push(light);
    }
    this.scene.fog = new THREE.FogExp2(0x0a1636, 0.0105);
  }

  buildSky() {
    this.skyUniforms = {
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uAccent: { value: new THREE.Color() },
      uAccent2: { value: new THREE.Color() },
      uTime: { value: 0 }
    };
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: this.skyUniforms,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: `
        uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uAccent; uniform vec3 uAccent2; uniform float uTime;
        varying vec3 vDir;
        ${NOISE_GLSL}
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(uHorizon, uZenith, smoothstep(-0.02, 0.55, h));
          col = mix(col, uHorizon * 0.35, smoothstep(0.0, -0.25, h));
          float n = ndFbm(d * 2.6 + vec3(0.0, 0.0, uTime * 0.004));
          float n2 = ndFbm(d * 5.5 + vec3(9.0, 3.0, -uTime * 0.006));
          float band = smoothstep(-0.05, 0.35, h) * smoothstep(0.95, 0.25, h);
          col += uAccent2 * pow(n, 3.2) * 0.85 * band;
          col += uAccent * pow(n2, 4.0) * 0.6 * band;
          vec3 sd = d * 340.0;
          float star = step(0.9975, ndHash(floor(sd))) * smoothstep(0.02, 0.35, h);
          col += vec3(0.85, 0.92, 1.0) * star * (0.6 + 0.6 * sin(uTime * 2.0 + ndHash(floor(sd) + 3.0) * 30.0));
          float rift = max(0.0, dot(d, normalize(vec3(0.0, 0.04, -1.0))));
          col += uAccent2 * pow(rift, 10.0) * 0.9 + uAccent * pow(rift, 40.0) * 0.8;
          gl_FragColor = vec4(col, 1.0);
        }`
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), material);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
  }

  buildGround() {
    this.groundUniforms = { uAccent: { value: new THREE.Color() }, uTime: { value: 0 }, uFocus: { value: new THREE.Vector2() } };
    const material = new THREE.MeshStandardMaterial({ color: 0x060b18, roughness: 0.42, metalness: 0.65 });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.groundUniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vNdWorld;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvNdWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vNdWorld; uniform vec3 uAccent; uniform float uTime; uniform vec2 uFocus;")
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
          vec2 hp = vNdWorld.xz / 2.4;
          vec2 hr = vec2(1.0, 1.7320508); vec2 hh = hr * 0.5;
          vec2 ha = mod(hp, hr) - hh; vec2 hb = mod(hp - hh, hr) - hh;
          vec2 gv = dot(ha, ha) < dot(hb, hb) ? ha : hb;
          vec2 ag = abs(gv);
          float hexd = max(dot(ag, normalize(vec2(1.0, 1.7320508))), ag.x);
          float edge = smoothstep(0.455, 0.5, hexd);
          float dist = length(vNdWorld.xz - uFocus);
          float fade = exp(-dist * 0.03);
          float pulse = 0.5 + 0.5 * sin(vNdWorld.z * 0.12 + uTime * 1.6);
          totalEmissiveRadiance += uAccent * edge * (0.035 + 0.22 * fade * pulse);
          float scan = smoothstep(0.9, 1.0, sin(vNdWorld.z * 0.05 + uTime * 0.9)) * edge;
          totalEmissiveRadiance += uAccent * scan * 0.25 * fade;`);
    };
    material.customProgramCacheKey = () => "nd-ground";
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900, 1, 1), material);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.005;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    this.envGroup = new THREE.Group();
    this.scene.add(this.envGroup);
  }

  buildPools() {
    this.materialCache = new Map();
    const pool = (spec, capacity) => new UnitPool(this.scene, spec, capacity, this.materialCache);
    this.pools = {
      commander: pool(MODELS.commander, 1),
      striker: pool(MODELS.striker, 8),
      rail: pool(MODELS.rail, 8),
      bulwark: pool(MODELS.bulwark, 8),
      medic: pool(MODELS.medic, 8),
      grunt: pool(MODELS.grunt, 110),
      shooter: pool(MODELS.shooter, 48),
      charger: pool(MODELS.charger, 48),
      shield: pool(MODELS.shield, 40),
      jammer: pool(MODELS.jammer, 24),
      splitter: pool(MODELS.splitter, 24),
      brute: pool(MODELS.brute, 24),
      turret: pool(MODELS.turret, 16),
      gate: pool(MODELS.gate, 40),
      core: pool(MODELS.core, 320),
      crystal: pool(MODELS.crystal, 90),
      beacon: pool(MODELS.beacon, 90),
      rock: pool(MODELS.rock, 90),
      wreck: pool(MODELS.wreck, 90),
      riftgate: pool(MODELS.riftgate, 1)
    };
    this.guardianPools = [0, 1, 2, 3].map((index) => pool(guardianVariant(index), 1));
    this.allPools = [...Object.values(this.pools), ...this.guardianPools];
    this.rootMatrix = new THREE.Matrix4();
    this.rootQuat = new THREE.Quaternion();
    this.rootEuler = new THREE.Euler(0, 0, 0, "YXZ");
    this.rootPos = new THREE.Vector3();
    this.rootScale = new THREE.Vector3(1, 1, 1);
  }

  buildEffects() {
    // Projectiles: stretched HDR plasma bolts.
    const boltGeometry = new THREE.SphereGeometry(0.5, 10, 6);
    const boltMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.bolts = new THREE.InstancedMesh(boltGeometry, boltMaterial, 260);
    this.boltCores = new THREE.InstancedMesh(boltGeometry, boltMaterial, 260);
    for (const mesh of [this.bolts, this.boltCores]) {
      mesh.setColorAt(0, new THREE.Color(1, 1, 1));
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.renderOrder = 4;
      this.scene.add(mesh);
    }

    this.flares = new FlareLayer(this.scene, 220);
    this.smoke = new FlareLayer(this.scene, 120, THREE.NormalBlending, 1.4);
    this.rings = new RingLayer(this.scene, 0.86, 60);
    this.markers = new RingLayer(this.scene, 0.93, 220, 48);

    // Debris chunks and embers from destroyed units.
    this.debris = [];
    const debrisGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.debrisMesh = new THREE.InstancedMesh(debrisGeometry, new THREE.MeshStandardMaterial({ color: 0x2a2c36, metalness: 0.8, roughness: 0.45 }), 220);
    this.debrisMesh.castShadow = true;
    this.debrisMesh.frustumCulled = false;
    this.debrisMesh.count = 0;
    this.scene.add(this.debrisMesh);

    // Scorch decals.
    const scorchTexture = this.radialTexture([[0, "rgba(0,0,0,0.85)"], [0.45, "rgba(8,4,10,0.55)"], [1, "rgba(0,0,0,0)"]]);
    this.scorches = [];
    this.scorchMeshes = [];
    for (let index = 0; index < 28; index += 1) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: scorchTexture, transparent: true, depthWrite: false, opacity: 0 }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.02;
      mesh.visible = false;
      mesh.renderOrder = 1;
      this.scene.add(mesh);
      this.scorchMeshes.push(mesh);
    }
    this.scorchIndex = 0;

    // Particles from the simulation, plus ambient rift dust.
    const capacity = 900;
    this.particleGeometry = new THREE.BufferGeometry();
    this.particlePositions = new Float32Array(capacity * 3);
    this.particleColors = new Float32Array(capacity * 3);
    this.particleSizes = new Float32Array(capacity);
    this.particleAlphas = new Float32Array(capacity);
    this.particleGeometry.setAttribute("position", new THREE.BufferAttribute(this.particlePositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.particleGeometry.setAttribute("aColor", new THREE.BufferAttribute(this.particleColors, 3).setUsage(THREE.DynamicDrawUsage));
    this.particleGeometry.setAttribute("aSize", new THREE.BufferAttribute(this.particleSizes, 1).setUsage(THREE.DynamicDrawUsage));
    this.particleGeometry.setAttribute("aAlpha", new THREE.BufferAttribute(this.particleAlphas, 1).setUsage(THREE.DynamicDrawUsage));
    this.particleUniforms = { uScale: { value: 400 } };
    this.particles = new THREE.Points(this.particleGeometry, new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      uniforms: this.particleUniforms,
      vertexShader: `
        attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float uScale;
        varying vec3 vColor; varying float vAlpha;
        void main() {
          vColor = aColor; vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor; varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.0, d);
          gl_FragColor = vec4(vColor * (1.0 + 2.0 * smoothstep(0.5, 0.0, d)), a * vAlpha);
        }`
    }));
    this.particles.frustumCulled = false;
    this.particles.renderOrder = 6;
    this.scene.add(this.particles);
    this.dust = Array.from({ length: 220 }, () => ({ x: (Math.random() - 0.5) * 70, y: Math.random() * 14, z: (Math.random() - 0.5) * 70, s: Math.random(), c: Math.random() }));

    // Shield domes (Bastion barrier, commander shield hit).
    const shieldMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        varying vec3 vN; varying vec3 vV; varying vec3 vColor; varying vec3 vP;
        void main() {
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
          vV = normalize(cameraPosition - wp.xyz);
          vP = position;
          #ifdef USE_INSTANCING_COLOR
            vColor = instanceColor;
          #else
            vColor = vec3(1.0);
          #endif
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vColor; varying vec3 vP;
        void main() {
          float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4);
          float hex = smoothstep(0.85, 1.0, sin(vP.y * 22.0 + uTime * 3.0) * sin(atan(vP.z, vP.x) * 14.0));
          gl_FragColor = vec4(vColor * (f * 1.5 + 0.05 + hex * 0.25), 1.0);
        }`
    });
    this.shieldUniforms = shieldMaterial.uniforms;
    this.shields = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 32, 18), shieldMaterial, 48);
    this.shields.setColorAt(0, new THREE.Color(1, 1, 1));
    this.shields.frustumCulled = false;
    this.shields.count = 0;
    this.shields.renderOrder = 7;
    this.scene.add(this.shields);
    this.playerShield = 0;

    // Health bars (billboards, always on top).
    const barGeometry = new THREE.PlaneGeometry(1, 0.13);
    this.barData = new Float32Array(160 * 2);
    barGeometry.setAttribute("aHealth", new THREE.InstancedBufferAttribute(this.barData, 2).setUsage(THREE.DynamicDrawUsage));
    this.bars = new THREE.InstancedMesh(barGeometry, new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      vertexShader: `
        attribute vec2 aHealth; varying vec2 vUv; varying vec2 vHealth;
        void main() {
          vUv = uv; vHealth = aHealth;
          vec4 center = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float s = length(instanceMatrix[0].xyz);
          center.xy += position.xy * s;
          gl_Position = projectionMatrix * center;
        }`,
      fragmentShader: `
        varying vec2 vUv; varying vec2 vHealth;
        void main() {
          vec3 good = vec3(0.3, 1.0, 0.68); vec3 mid = vec3(1.0, 0.85, 0.35); vec3 bad = vec3(1.0, 0.31, 0.44);
          vec3 fill = vHealth.x > 0.5 ? mix(mid, good, (vHealth.x - 0.5) * 2.0) : mix(bad, mid, vHealth.x * 2.0);
          float inner = step(0.04, vUv.x) * step(vUv.x, 0.96) * step(0.18, vUv.y) * step(vUv.y, 0.82);
          float x = (vUv.x - 0.04) / 0.92;
          vec3 col = vec3(0.02, 0.03, 0.08);
          if (inner > 0.5 && x < vHealth.x) col = fill * 1.4;
          if (inner > 0.5 && vUv.y > 0.6 && x < vHealth.y) col = vec3(0.55, 0.65, 1.6);
          gl_FragColor = vec4(col, 0.88);
        }`
    }), 160);
    this.bars.frustumCulled = false;
    this.bars.count = 0;
    this.bars.renderOrder = 20;
    this.scene.add(this.bars);
  }

  radialTexture(stops, size = 128) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [offset, value] of stops) gradient.addColorStop(offset, value);
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  buildComposer() {
    this.gradeUniforms = {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uHit: { value: 0 },
      uFlash: { value: 0 },
      uFlashColor: { value: new THREE.Color(1, 1, 1) },
      uDesat: { value: 0 },
      uAberration: { value: 0 },
      uVignette: { value: 1 }
    };
    this.gradePass = new THREE.ShaderPass({
      uniforms: this.gradeUniforms,
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float uTime; uniform float uHit; uniform float uFlash; uniform vec3 uFlashColor;
        uniform float uDesat; uniform float uAberration; uniform float uVignette;
        varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
          vec2 c = vUv - 0.5;
          float r2 = dot(c, c);
          vec2 shift = c * (0.0025 + uAberration * 0.02) * (0.4 + r2 * 3.0);
          vec3 col;
          col.r = texture2D(tDiffuse, vUv + shift).r;
          col.g = texture2D(tDiffuse, vUv).g;
          col.b = texture2D(tDiffuse, vUv - shift).b;
          float lum = dot(col, vec3(0.299, 0.587, 0.114));
          col = mix(col, vec3(lum) * vec3(0.9, 0.95, 1.1), uDesat);
          col += uFlashColor * uFlash * 0.35;
          float vig = smoothstep(0.85, 0.2, r2 * 2.2);
          col *= mix(1.0, vig, 0.55 * uVignette);
          col = mix(col, col * vec3(1.6, 0.35, 0.45), uHit * smoothstep(0.08, 0.5, r2 * 2.0));
          col += (hash(vUv * 900.0 + uTime) - 0.5) * 0.025;
          gl_FragColor = vec4(col, 1.0);
        }`
    });
  }

  applyQuality() {
    const tier = QUALITY[this.tier] || QUALITY.medium;
    this.settings = tier;
    this.renderer.shadowMap.enabled = tier.shadows > 0;
    this.sun.castShadow = tier.shadows > 0;
    if (tier.shadows > 0) {
      this.sun.shadow.mapSize.set(tier.shadows, tier.shadows);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.pointLights.forEach((light, index) => {
      light.visible = index < tier.lights;
    });
    this.composer?.dispose?.();
    this.composer = null;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: THREE.HalfFloatType, samples: tier.msaa });
    this.composer = new THREE.EffectComposer(this.renderer, target);
    this.renderPass = new THREE.RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    if (tier.bloom) {
      this.bloom = new THREE.UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.6, 0.38, 0.86);
      this.composer.addPass(this.bloom);
    } else this.bloom = null;
    this.composer.addPass(new THREE.OutputPass());
    if (tier.fxaa) {
      this.fxaa = new THREE.ShaderPass(THREE.FXAAShader);
      this.composer.addPass(this.fxaa);
    } else this.fxaa = null;
    this.composer.addPass(this.gradePass);
    this.envKey = null; // tower density depends on tier
    this.resize();
  }

  setQuality(quality) {
    this.qualitySetting = quality;
    this.tier = quality === "auto" ? Renderer3D.detectQuality() : quality;
    this.resolutionScale = 1;
    this.applyQuality();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width || window.innerWidth));
    const height = Math.max(1, Math.floor(rect.height || window.innerHeight));
    const dpr = Math.min(this.settings?.dpr ?? 1.5, window.devicePixelRatio || 1) * this.resolutionScale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.width = width;
    this.height = height;
    this.camera.aspect = width / height;
    this.portrait = width / height < 0.8;
    this.camera.fov = this.portrait ? 62 : width / height < 1.2 ? 56 : 48;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(dpr);
      this.composer.setSize(width, height);
    }
    if (this.fxaa) this.fxaa.material.uniforms.resolution.value.set(1 / (width * dpr), 1 / (height * dpr));
    this.particleUniforms.uScale.value = height * dpr * 0.9;
  }

  adapt(delta) {
    if (this.qualitySetting !== "auto") return;
    this.frameTimes.push(delta);
    if (this.frameTimes.length > 90) this.frameTimes.shift();
    this.adaptClock += delta;
    if (this.adaptClock < 2.5 || this.frameTimes.length < 60) return;
    this.adaptClock = 0;
    const average = this.frameTimes.reduce((sum, value) => sum + value, 0) / this.frameTimes.length;
    if (average > 1 / 42) {
      if (this.resolutionScale > 0.72) {
        this.resolutionScale = Math.max(0.7, this.resolutionScale - 0.15);
        this.resize();
      } else if (this.tier !== "low") {
        this.tier = this.tier === "high" ? "medium" : "low";
        this.resolutionScale = 1;
        this.applyQuality();
      }
      this.frameTimes.length = 0;
    } else if (average < 1 / 58 && this.resolutionScale < 1) {
      this.resolutionScale = Math.min(1, this.resolutionScale + 0.1);
      this.resize();
      this.frameTimes.length = 0;
    }
  }

  // -------------------------------------------------------------------------
  // Environment (rebuilt per sector)
  // -------------------------------------------------------------------------

  disposeEnvironment() {
    for (const child of [...this.envGroup.children]) {
      child.traverse((node) => {
        node.geometry?.dispose();
        if (node.material && !node.material.userData?.shared) node.material.dispose?.();
      });
      this.envGroup.remove(child);
    }
    this.gateVisuals = new Map();
  }

  buildEnvironment(sector, goal, key) {
    this.disposeEnvironment();
    this.envKey = key;
    this.theme = SECTOR_THEMES[(Math.max(1, sector) - 1) % SECTOR_THEMES.length];
    this.goal = goal;
    const theme = this.theme;
    this.skyUniforms.uZenith.value.set(theme.zenith);
    this.skyUniforms.uHorizon.value.set(theme.horizon);
    this.skyUniforms.uAccent.value.set(theme.accent);
    this.skyUniforms.uAccent2.value.set(theme.accent2);
    this.groundUniforms.uAccent.value.set(theme.accent);
    this.ground.material.color.set(theme.ground);
    this.scene.fog.color.set(theme.fog);
    this.sun.color.set(theme.key);
    this.rim.color.set(theme.accent2);
    this.hemi.color.set(theme.horizon).lerp(new THREE.Color(0xffffff), 0.5);
    const start = -700;
    const end = goal + 900;
    this.causeway(start, end, theme);
    this.towers(goal, theme);
    this.orbitals(goal, theme);
    this.riftVortex(goal, theme);
    this.boundaryFence(start, end, theme);
    this.clearTransient();
  }

  causeway(start, end, theme) {
    const positions = [];
    const lanes = [];
    const indices = [];
    const step = 30;
    let along = 0;
    let previous = null;
    for (let y = start; y <= end; y += step) {
      const center = pathX(y);
      const half = 205 + Math.sin(y * 0.0031) * 20;
      if (previous !== null) along += Math.hypot(center - previous, step) * U;
      previous = center;
      positions.push((center - half) * U, 0.012, -y * U, (center + half) * U, 0.012, -y * U);
      lanes.push(0, along, 1, along);
      const row = positions.length / 6 - 1;
      if (row > 0) {
        const a = (row - 1) * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("aLane", new THREE.Float32BufferAttribute(lanes, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const uniforms = { uAccent: { value: color(theme.accent).clone() }, uAccent2: { value: color(theme.accent2).clone() }, uTime: this.groundUniforms.uTime };
    const material = new THREE.MeshStandardMaterial({ color: 0x0d1428, roughness: 0.38, metalness: 0.7, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec2 aLane; varying vec2 vLane;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLane = aLane;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vLane; uniform vec3 uAccent; uniform vec3 uAccent2; uniform float uTime;")
        .replace("#include <color_fragment>", `#include <color_fragment>
          float ndSeam = step(0.965, fract(vLane.y * 0.25)) + step(0.985, fract(vLane.x * 6.0));
          diffuseColor.rgb *= 1.0 - 0.45 * clamp(ndSeam, 0.0, 1.0);`)
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
          float u = vLane.x; float v = vLane.y;
          float edge = smoothstep(0.025, 0.0, u) + smoothstep(0.975, 1.0, u);
          float lane = (1.0 - smoothstep(0.0, 0.004, abs(u - 0.333))) + (1.0 - smoothstep(0.0, 0.004, abs(u - 0.667)));
          lane *= step(0.45, fract(v * 0.2));
          float chev = abs(u - 0.5) * 2.0;
          float cv = fract((v - chev * 9.0) * 0.07 - uTime * 0.32);
          float chevron = smoothstep(0.0, 0.015, cv) * smoothstep(0.05, 0.035, cv) * step(chev, 0.18);
          totalEmissiveRadiance += uAccent * (edge * 1.5 + lane * 0.45 + chevron * 0.55) + uAccent2 * chevron * 0.1;`);
    };
    material.customProgramCacheKey = () => "nd-causeway";
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    this.envGroup.add(mesh);

    // Edge bollards with lamp heads every 7 m.
    const count = Math.floor((end - start) / 175) * 2;
    const post = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.11, 0.7, 8), new THREE.MeshStandardMaterial({ color: 0x2a3146, metalness: 0.8, roughness: 0.35 }), count);
    const lamp = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 8), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color(theme.accent), emissiveIntensity: 3 }), count);
    const matrix = new THREE.Matrix4();
    let index = 0;
    for (let y = start; y <= end && index < count; y += 175) {
      const center = pathX(y);
      const half = 205 + Math.sin(y * 0.0031) * 20 + 12;
      for (const side of [-1, 1]) {
        if (index >= count) break;
        matrix.makeTranslation((center + side * half) * U, 0.35, -y * U);
        post.setMatrixAt(index, matrix);
        matrix.makeTranslation((center + side * half) * U, 0.76, -y * U);
        lamp.setMatrixAt(index, matrix);
        index += 1;
      }
    }
    post.count = index;
    lamp.count = index;
    post.castShadow = true;
    this.envGroup.add(post, lamp);
  }

  towers(goal, theme) {
    const count = this.settings.towers;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, 0.5, 0);
    const uniforms = { uAccent: { value: color(theme.accent).clone() }, uWarm: { value: color(theme.accent2).clone() } };
    const material = new THREE.MeshStandardMaterial({ color: 0x0a0f1e, roughness: 0.5, metalness: 0.7 });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vNdWorld; varying vec3 vNdNormal; varying float vNdId;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          vec4 ndW = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            ndW = instanceMatrix * ndW;
            vNdId = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.11;
          #endif
          vNdWorld = (modelMatrix * ndW).xyz;
          vNdNormal = normal;`);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vNdWorld; varying vec3 vNdNormal; varying float vNdId; uniform vec3 uAccent; uniform vec3 uWarm;")
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
          float side = abs(vNdNormal.y) > 0.5 ? 0.0 : 1.0;
          float along = abs(vNdNormal.x) > 0.5 ? vNdWorld.z : vNdWorld.x;
          vec2 g = vec2(along / 1.7, vNdWorld.y / 2.6);
          vec2 cell = floor(g); vec2 f = fract(g);
          float win = step(0.18, f.x) * step(f.x, 0.78) * step(0.28, f.y) * step(f.y, 0.72);
          float h = fract(sin(dot(cell + vNdId, vec2(12.9898, 78.233))) * 43758.5453);
          float lit = step(0.62, h);
          vec3 wc = mix(uAccent, mix(vec3(1.0, 0.82, 0.55), uWarm, 0.4), step(0.82, h));
          float band = smoothstep(0.96, 1.0, sin(vNdWorld.y * 0.08 + vNdId));
          totalEmissiveRadiance += (wc * win * lit * 0.42 + uAccent * band * 0.3) * side;`);
    };
    material.customProgramCacheKey = () => "nd-towers";
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    const matrix = new THREE.Matrix4();
    let seed = 1337;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const length = (goal + 1400) * U;
    for (let index = 0; index < count; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const x = side * (34 + Math.pow(random(), 1.4) * 150);
      const z = 30 - random() * (length + 80);
      const height = 14 + Math.pow(random(), 1.7) * 130;
      const width = 6 + random() * 18;
      const depth = 6 + random() * 18;
      matrix.makeScale(width, height, depth).setPosition(x, -0.5, z);
      mesh.setMatrixAt(index, matrix);
    }
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    this.envGroup.add(mesh);

    // Rooftop beacons
    const beacons = new THREE.InstancedMesh(new THREE.SphereGeometry(0.6, 8, 6), new THREE.MeshBasicMaterial({ color: color(theme.accent2).clone().multiplyScalar(4), toneMapped: false }), count);
    const scaleVec = new THREE.Vector3();
    const posVec = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    for (let index = 0; index < count; index += 1) {
      mesh.getMatrixAt(index, matrix);
      matrix.decompose(posVec, quat, scaleVec);
      matrix.makeTranslation(posVec.x, posVec.y + scaleVec.y + 0.8, posVec.z);
      beacons.setMatrixAt(index, matrix);
    }
    this.envGroup.add(beacons);
  }

  orbitals(goal, theme) {
    const glow = new THREE.MeshBasicMaterial({ color: color(theme.accent).clone().multiplyScalar(2.2), toneMapped: false, fog: false });
    const dark = new THREE.MeshStandardMaterial({ color: 0x141a2c, metalness: 0.8, roughness: 0.4, fog: false });
    this.orbitalRings = [];
    const placements = [[-160, 120, -(goal * U) * 0.45, 70], [190, 160, -(goal * U) - 120, 95], [-60, 210, -(goal * U) - 380, 140]];
    for (const [x, y, z, radius] of placements) {
      const group = new THREE.Group();
      group.add(new THREE.Mesh(new THREE.TorusGeometry(radius, radius * 0.045, 10, 96), dark));
      group.add(new THREE.Mesh(new THREE.TorusGeometry(radius * 1.02, radius * 0.006, 6, 96), glow));
      group.add(new THREE.Mesh(new THREE.TorusGeometry(radius * 0.92, radius * 0.004, 6, 96), glow));
      group.position.set(x, y, z);
      group.rotation.set(1.1 + Math.random() * 0.4, Math.random(), 0.3);
      this.envGroup.add(group);
      this.orbitalRings.push(group);
    }
  }

  riftVortex(goal, theme) {
    const y = goal + 430;
    this.riftPosition = new THREE.Vector3(pathX(y) * U, 0, -y * U);
    this.vortexUniforms = { uTime: { value: 0 }, uC1: { value: color(theme.accent2).clone() }, uC2: { value: color(theme.accent).clone() } };
    const vortex = new THREE.Mesh(new THREE.CircleGeometry(6.6, 96), new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
      uniforms: this.vortexUniforms,
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `
        uniform float uTime; uniform vec3 uC1; uniform vec3 uC2; varying vec2 vUv;
        ${NOISE_GLSL}
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float r = length(p);
          float a = atan(p.y, p.x);
          float swirl = a + r * 5.0 - uTime * 1.3;
          float n = ndFbm(vec3(cos(swirl) * 2.0, sin(swirl) * 2.0, r * 3.0 - uTime * 0.6));
          float arms = 0.5 + 0.5 * sin(swirl * 4.0 + n * 6.0);
          vec3 col = mix(uC1, uC2, arms) * (0.15 + pow(n, 2.0) * 1.8) * (1.2 - r) + uC1 * 0.25 * smoothstep(0.6, 1.0, r);
          col += vec3(1.0, 0.92, 1.0) * pow(max(0.0, 1.0 - r * 1.8), 4.0) * 1.2;
          float alpha = smoothstep(1.0, 0.82, r);
          gl_FragColor = vec4(col * 0.75, alpha);
        }`
    }));
    vortex.position.copy(this.riftPosition).add(new THREE.Vector3(0, 8.5, 0.1));
    this.envGroup.add(vortex);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 3.2, 400, 24, 1, true), new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: false,
      uniforms: { uColor: { value: color(theme.accent2).clone() }, uTime: this.vortexUniforms.uTime },
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `
        uniform vec3 uColor; uniform float uTime; varying vec2 vUv;
        void main() {
          float fade = pow(1.0 - vUv.y, 1.4);
          float flow = 0.6 + 0.4 * sin(vUv.y * 60.0 - uTime * 6.0);
          float edge = 0.4 + 0.6 * abs(sin(vUv.x * 3.14159 * 6.0));
          gl_FragColor = vec4(uColor * 1.2, fade * flow * edge * 0.22);
        }`
    }));
    beam.position.copy(this.riftPosition).add(new THREE.Vector3(0, 200, -2));
    this.envGroup.add(beam);
    this.riftLight = new THREE.PointLight(color(theme.accent2), 18, 40, 2);
    this.riftLight.position.copy(this.riftPosition).add(new THREE.Vector3(0, 8, 6));
    this.envGroup.add(this.riftLight);
  }

  boundaryFence(start, end, theme) {
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
      uniforms: { uColor: { value: color(theme.accent).clone() }, uTime: this.groundUniforms.uTime },
      vertexShader: "varying vec2 vUv; varying vec3 vW; void main() { vUv = uv; vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }",
      fragmentShader: `
        uniform vec3 uColor; uniform float uTime; varying vec2 vUv; varying vec3 vW;
        void main() {
          float fade = pow(1.0 - vUv.y, 2.0);
          float lines = smoothstep(0.92, 1.0, sin(vW.z * 1.4 - uTime * 3.0)) * 0.6 + 0.12;
          float base = smoothstep(0.08, 0.0, vUv.y) * 1.5;
          gl_FragColor = vec4(uColor, (fade * lines + base) * 0.35);
        }`
    });
    const length = (end - start) * U;
    for (const side of [-1, 1]) {
      const fence = new THREE.Mesh(new THREE.PlaneGeometry(length, 2.2), material);
      fence.rotation.y = Math.PI / 2;
      fence.position.set(side * (470 + 30) * U, 1.1, -((start + end) / 2) * U);
      this.envGroup.add(fence);
    }
  }

  // -------------------------------------------------------------------------
  // Gates
  // -------------------------------------------------------------------------

  gateLabelTexture(gate) {
    this.labelCache ??= new Map();
    const key = `${gate.type}`;
    if (this.labelCache.has(key)) return this.labelCache.get(key);
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, 512, 256);
    context.fillStyle = "rgba(4, 8, 24, 0.72)";
    context.strokeStyle = gate.color;
    context.lineWidth = 6;
    context.beginPath();
    context.roundRect(16, 16, 480, 224, 28);
    context.fill();
    context.stroke();
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.shadowColor = gate.color;
    context.shadowBlur = 24;
    context.fillStyle = gate.color;
    context.font = "900 112px system-ui, sans-serif";
    context.fillText(gate.symbol, 256, 106);
    context.shadowBlur = 8;
    context.fillStyle = "#f2ffff";
    context.font = "800 44px system-ui, sans-serif";
    context.fillText(gate.label, 256, 196);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    this.labelCache.set(key, texture);
    return texture;
  }

  gateVisual(gate) {
    let visual = this.gateVisuals.get(gate);
    if (visual) return visual;
    const uniforms = { uColor: { value: color(gate.color).clone() }, uTime: this.groundUniforms.uTime, uFade: { value: 1 }, uFlash: { value: 0 } };
    const field = new THREE.Mesh(new THREE.PlaneGeometry(3.86, 3.0), new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
      uniforms,
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `
        uniform vec3 uColor; uniform float uTime; uniform float uFade; uniform float uFlash; varying vec2 vUv;
        void main() {
          float scan = 0.5 + 0.5 * sin(vUv.y * 90.0 - uTime * 7.0);
          float edge = smoothstep(0.08, 0.0, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
          float sweep = smoothstep(0.06, 0.0, abs(fract(vUv.y * 0.8 - uTime * 0.45) - 0.5));
          float hex = smoothstep(0.9, 1.0, sin(vUv.x * 60.0) * sin(vUv.y * 46.0 + uTime));
          vec3 col = uColor * (0.06 + 0.08 * scan + edge * 1.1 + sweep * 0.35 + hex * 0.15 + uFlash * 1.6);
          gl_FragColor = vec4(col, uFade * (0.5 + edge * 0.5));
        }`
    }));
    field.position.set(gate.x * U, 1.65, -gate.y * U);
    field.renderOrder = 2;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshBasicMaterial({ map: this.gateLabelTexture(gate), transparent: true, depthWrite: false, toneMapped: false }));
    label.position.set(gate.x * U, 4.9, -gate.y * U);
    label.rotation.x = -0.35;
    label.renderOrder = 8;
    this.envGroup.add(field, label);
    visual = { field, label, uniforms, flash: 0 };
    this.gateVisuals.set(gate, visual);
    return visual;
  }

  // -------------------------------------------------------------------------
  // Per-frame
  // -------------------------------------------------------------------------

  clearTransient() {
    this.flares.clear();
    this.smoke.clear();
    this.debris.length = 0;
    this.debrisMesh.count = 0;
    this.scorches.length = 0;
    for (const mesh of this.scorchMeshes) mesh.visible = false;
    for (const light of this.pointLights) {
      light.intensity = 0;
      light.userData.life = 0;
    }
  }

  stateFor(unit) {
    let state = this.unitState.get(unit);
    if (!state) {
      state = { yaw: Math.PI, fire: 0, phase: Math.random() * 10, x: unit.x, y: unit.y, move: 0, h: 0 };
      this.unitState.set(unit, state);
    }
    return state;
  }

  root(x, y, z, yaw, pitch = 0, roll = 0, scale = 1) {
    this.rootPos.set(x, y, z);
    this.rootEuler.set(pitch, yaw, roll);
    this.rootQuat.setFromEuler(this.rootEuler);
    this.rootScale.set(scale, scale, scale);
    return this.rootMatrix.compose(this.rootPos, this.rootQuat, this.rootScale);
  }

  light(x, y, z, hex, power, life, distance = 14) {
    const count = this.settings.lights;
    if (!count) return;
    let best = this.pointLights[0];
    for (let index = 0; index < count; index += 1) {
      const light = this.pointLights[index];
      if (light.userData.life <= 0) {
        best = light;
        break;
      }
      if (light.userData.life < best.userData.life) best = light;
    }
    best.position.set(x, y, z);
    best.color.set(hex);
    best.distance = distance;
    best.userData = { life, max: life, power };
  }

  scorch(x, z, size) {
    const mesh = this.scorchMeshes[this.scorchIndex % this.scorchMeshes.length];
    this.scorchIndex += 1;
    mesh.position.set(x, 0.02 + (this.scorchIndex % 7) * 0.001, z);
    mesh.scale.set(size, size, 1);
    mesh.rotation.z = Math.random() * TAU;
    mesh.visible = true;
    mesh.userData.life = 7;
    mesh.material.opacity = 0.9;
  }

  explode(x, y, z, size, hex) {
    const tint = color(hex);
    this.flares.add({ x, y, z, size: size * 1.2, grow: size * 6, life: 0.32, color: new THREE.Color(1, 0.85, 0.7), intensity: 2.6 });
    this.flares.add({ x, y, z, size: size * 0.8, grow: size * 3, life: 0.55, color: tint.clone(), intensity: 2 });
    const smokeCount = Math.min(6, 2 + Math.round(size));
    for (let index = 0; index < smokeCount; index += 1) {
      this.smoke.add({
        x: x + (Math.random() - 0.5) * size,
        y: y + Math.random() * size * 0.5,
        z: z + (Math.random() - 0.5) * size,
        vy: 0.6 + Math.random(),
        vx: (Math.random() - 0.5) * 0.6,
        size: size * (0.7 + Math.random() * 0.6),
        grow: size * 0.9,
        life: 1.2 + Math.random() * 0.8,
        color: new THREE.Color(0.05, 0.045, 0.07),
        alpha: 0.75,
        fadeIn: true
      });
    }
    const chunks = Math.min(14, 4 + Math.round(size * 4));
    for (let index = 0; index < chunks; index += 1) {
      if (this.debris.length > 200) this.debris.shift();
      const angle = Math.random() * TAU;
      const speed = 2 + Math.random() * 5 * Math.sqrt(size);
      this.debris.push({
        x, y: y + 0.2, z,
        vx: Math.cos(angle) * speed, vy: 3 + Math.random() * 5, vz: Math.sin(angle) * speed,
        rx: Math.random() * TAU, ry: Math.random() * TAU, spin: (Math.random() - 0.5) * 14,
        size: 0.06 + Math.random() * 0.14 * Math.sqrt(size), life: 1.6 + Math.random() * 1.2
      });
    }
    this.light(x, y + 1, z, hex, 30 * size, 0.45, 10 + size * 6);
    this.scorch(x, z, size * 2.4);
  }

  consumeFx(game) {
    const fx = game.fx;
    if (!fx.length) return;
    for (const event of fx) {
      switch (event.type) {
        case "muzzle": {
          if (event.unit) this.stateFor(event.unit).fire = 1;
          const h = this.sourceHeight(event.source);
          const dx = (event.tx - event.x) * U;
          const dz = -(event.ty - event.y) * U;
          const length = Math.hypot(dx, dz) || 1;
          const reach = event.source === "commander" ? 1.1 : event.source === "boss" ? 2.4 : event.source === "turret" ? 1.5 : 0.5;
          this.flares.add({ x: event.x * U + (dx / length) * reach, y: h, z: -event.y * U + (dz / length) * reach, size: event.source === "boss" ? 1.4 : 0.55, grow: 2, life: 0.07, color: color(event.color).clone(), intensity: 2.2 });
          if (event.source === "commander" || event.source === "boss" || event.source === "turret") this.light(event.x * U + (dx / length) * reach, h, -event.y * U + (dz / length) * reach, event.color, 6, 0.07, 6);
          break;
        }
        case "hit": {
          this.stateFor(event.unit).flash = 1;
          this.flares.add({ x: event.x * U + (Math.random() - 0.5) * 0.4, y: 0.8 + Math.random() * 0.6, z: -event.y * U + (Math.random() - 0.5) * 0.4, size: event.heavy ? 0.9 : 0.4, grow: 3, life: 0.1, color: new THREE.Color(1, 0.7, 0.6), intensity: 1.6 });
          break;
        }
        case "kill": {
          const size = clamp(event.radius / 22, 0.6, 4);
          const hex = event.enemy === "drone" || event.enemy === "commander" ? "#6befff" : event.enemy === "boss" ? "#ff4bd8" : "#ff5a77";
          this.explode(event.x * U, 0.6 * size, -event.y * U, size, hex);
          if (event.enemy === "boss") {
            for (let index = 0; index < 5; index += 1) {
              setTimeout(() => this.explode(event.x * U + (Math.random() - 0.5) * 4, 1 + Math.random() * 3, -event.y * U + (Math.random() - 0.5) * 4, 2 + Math.random() * 1.5, index % 2 ? "#ffd85a" : "#ff4bd8"), 120 + index * 180);
            }
          }
          break;
        }
        case "player-hit":
          this.hitPulse = Math.min(1, this.hitPulse + (event.heavy ? 0.7 : 0.35));
          if (event.shield) this.playerShield = 1;
          break;
        case "nova":
          this.novaWave = { x: event.x * U, z: -event.y * U, life: 0.8, max: 0.8, radius: event.radius * U };
          this.flashPulse = 0.6;
          this.flashColor.set("#8ffbff");
          this.light(event.x * U, 2, -event.y * U, "#8ffbff", 90, 0.7, 30);
          break;
        case "gate": {
          const visual = this.gateVisuals?.get(event.gate);
          if (visual) visual.flash = 1;
          this.flashPulse = 0.35;
          this.flashColor.set(event.color);
          this.light(event.x * U, 2, -event.y * U, event.color, 40, 0.6, 18);
          break;
        }
        case "warp":
          this.warpPulse = 1;
          break;
        case "boss":
          if (this.cinematics) this.cameraState = { ...this.cameraState, mode: "boss", timer: 2.1, boss: event.unit };
          this.flashPulse = 0.5;
          this.flashColor.set("#ff3e91");
          break;
        case "phase":
          this.flashPulse = 0.5;
          this.flashColor.set(event.stage === 1 ? "#ff63d9" : "#ba62ff");
          this.light(event.x * U, 3, -event.y * U, "#ff63d9", 80, 0.8, 30);
          break;
        case "ending":
          if (event.success) {
            this.cameraState = { ...this.cameraState, mode: "victory", timer: 0, orbit: 0 };
            this.slowmo = 0.35;
          } else {
            this.cameraState = { ...this.cameraState, mode: "defeat", timer: 0 };
            this.desatTarget = 0.85;
          }
          break;
        default:
          break;
      }
    }
    fx.length = 0;
  }

  sourceHeight(source) {
    switch (source) {
      case "commander": return 1.3;
      case "striker": case "rail": case "bulwark": case "medic": return 1.3;
      case "shooter": return 1.48;
      case "turret": return 1.0;
      case "jammer": return 1.4;
      case "boss": return 2.4;
      default: return 1.1;
    }
  }

  updateCamera(game, dt, time) {
    const player = game.player;
    const state = this.cameraState;
    const portrait = this.portrait;
    const height = portrait ? 17 : 11.5;
    const distance = portrait ? 11 : 9.5;
    const ahead = portrait ? 7 : 5.5;
    if (!player) return;
    const px = player.x * U;
    const pz = -player.y * U;
    const pathCenter = pathX(player.y) * U;
    const focusX = lerp(pathCenter, px, 0.62);
    const target = new THREE.Vector3(focusX, 0, pz - ahead);
    let eye;
    let look = target.clone();
    if (state.mode === "boss" && state.boss) {
      state.timer -= dt;
      const bx = state.boss.x * U;
      const bz = -state.boss.y * U;
      const k = clamp(1 - state.timer / 2.1, 0, 1);
      const angle = lerp(-0.5, 0.35, k);
      eye = new THREE.Vector3(bx + Math.sin(angle) * 11, 2.2 + k * 1.8, bz + Math.cos(angle) * 11);
      look = new THREE.Vector3(bx, 3.2, bz);
      if (state.timer <= 0) state.mode = "follow";
      this.camera.position.lerp(eye, 1 - Math.exp(-6 * dt));
      this.focus.lerp(look, 1 - Math.exp(-6 * dt));
    } else if (state.mode === "victory") {
      state.orbit += dt * 0.5;
      eye = new THREE.Vector3(px + Math.sin(state.orbit + 0.4) * 7.5, 3.2, pz + Math.cos(state.orbit + 0.4) * 7.5);
      look = new THREE.Vector3(px, 1.3, pz);
      this.camera.position.lerp(eye, 1 - Math.exp(-3 * dt));
      this.focus.lerp(look, 1 - Math.exp(-4 * dt));
    } else if (state.mode === "defeat") {
      eye = new THREE.Vector3(px, height * 1.5, pz + distance * 0.6);
      look = new THREE.Vector3(px, 0, pz);
      this.camera.position.lerp(eye, 1 - Math.exp(-1.6 * dt));
      this.focus.lerp(look, 1 - Math.exp(-3 * dt));
    } else {
      eye = new THREE.Vector3(target.x, height, target.z + distance + ahead);
      const lambda = state.snap ? 1000 : 5;
      state.snap = false;
      this.camera.position.x = damp(this.camera.position.x, eye.x, lambda, dt);
      this.camera.position.y = damp(this.camera.position.y, eye.y, lambda, dt);
      this.camera.position.z = damp(this.camera.position.z, eye.z, lambda * 1.4, dt);
      this.focus.x = damp(this.focus.x, target.x, lambda, dt);
      this.focus.y = damp(this.focus.y, target.y, lambda, dt);
      this.focus.z = damp(this.focus.z, target.z, lambda * 1.4, dt);
      state.roll = damp(state.roll, -(player.vx / (player.speed || 265)) * 0.025, 4, dt);
    }
    this.camera.lookAt(this.focus);
    if (state.mode === "follow") this.camera.rotateZ(state.roll);
    const shake = (game.shake || 0) * 0.014 * (this.reducedMotion ? 0.3 : 1);
    if (shake > 0.002) {
      this.camera.position.x += (Math.random() - 0.5) * shake;
      this.camera.position.y += (Math.random() - 0.5) * shake;
    }
    // Shadow camera follows the action, snapped to texels to avoid shimmer.
    const texel = 48 / (this.settings.shadows || 1024);
    const sx = Math.round(px / texel) * texel;
    const sz = Math.round((pz - 6) / texel) * texel;
    this.sun.target.position.set(sx, 0, sz);
    this.sun.position.set(sx - 12, 26, sz + 10);
    this.groundUniforms.uFocus.value.set(px, pz);
    this.sky.position.copy(this.camera.position);
    void time;
  }

  drawUnits(game, t, dt) {
    for (const pool of this.allPools) pool.begin();
    this.markers.begin();
    this.rings.begin();
    let shieldCount = 0;
    let barCount = 0;
    const matrix = new THREE.Matrix4();
    const addBar = (x, y, z, width, hp, shield) => {
      if (barCount >= 160) return;
      matrix.makeScale(width, width, width).setPosition(x, y, z);
      this.bars.setMatrixAt(barCount, matrix);
      this.barData[barCount * 2] = clamp(hp, 0, 1);
      this.barData[barCount * 2 + 1] = clamp(shield, 0, 1);
      barCount += 1;
    };
    const addShield = (x, y, z, radius, hex, strength, squash = 1) => {
      if (shieldCount >= 48) return;
      matrix.makeScale(radius, radius * squash, radius).setPosition(x, y, z);
      this.shields.setMatrixAt(shieldCount, matrix);
      this.shields.setColorAt(shieldCount, color(hex).clone().multiplyScalar(strength));
      shieldCount += 1;
    };

    const player = game.player;
    const playerYawBase = Math.PI;
    const target = player?.alive ? game.findTarget(player, 520) : null;

    // Commander
    if (player && (player.alive || game.mode === "menu")) {
      const state = this.stateFor(player);
      const speed = Math.hypot(player.vx || 0, player.vy || 0);
      state.move = damp(state.move, clamp(speed / (player.speed || 265), 0, 1), 8, dt);
      const lean = clamp((player.vx || 0) / (player.speed || 265), -1, 1);
      state.yaw = damp(state.yaw, playerYawBase - lean * 0.35, 6, dt);
      let aim = 0;
      if (target) aim = wrapAngle(Math.atan2((target.x - player.x) * U, -(target.y - player.y) * U) - state.yaw);
      state.aim = damp(state.aim || 0, aim, 10, dt);
      state.fire = Math.max(0, state.fire - dt * 7);
      const blink = player.invulnerable > 0 && Math.floor(t * 22) % 2 ? 0.6 : 0;
      const x = player.x * U;
      const z = -player.y * U;
      const hover = MODELS.commander.hover + Math.sin(t * 2.4) * 0.04;
      this.pools.commander.push(this.root(x, hover, z, state.yaw, state.move * 0.1, -lean * 0.12), poseFor("commander", { t, phase: 0, move: state.move, aim: state.aim, fire: state.fire, lean }), blink);
      const stanceColor = game.stance === "assault" ? "#ff63d9" : game.stance === "bulwark" ? "#768cff" : "#45f6ff";
      this.markers.add(x, z, 1.25, stanceColor, 0.9);
      this.markers.add(x, z, 1.25 + 0.25 * (1 + Math.sin(t * 4)) , stanceColor, 0.25);
      if (this.playerShield > 0.01 && player.shield > 0) addShield(x, 1.15, z, 1.35, "#55eaff", this.playerShield * 1.4, 1.1);
      if (this.warpPulse > 0) this.rings.add(x, z, 0.6 + (1 - this.warpPulse) * 5, "#45f6ff", this.warpPulse);
      // Engine glow
      if (Math.random() < 0.6) this.flares.add({ x: x + Math.sin(state.yaw) * -0.4, y: hover + 1.0, z: z + Math.cos(state.yaw) * -0.4, vy: -1.5, size: 0.3 + state.move * 0.25, life: 0.18, color: color("#45f6ff").clone(), intensity: 1.5 });
    }

    // Squad drones
    for (const drone of game.squad) {
      if (!drone.alive) continue;
      const pool = this.pools[drone.role] || this.pools.striker;
      const state = this.stateFor(drone);
      state.fire = Math.max(0, state.fire - dt * 6);
      state.flash = Math.max(0, (state.flash || 0) - dt * 5);
      const vx = drone.vx || 0;
      const vy = drone.vy || 0;
      let yaw = Math.PI;
      const droneTarget = game.findTarget(drone, drone.range || 430);
      if (droneTarget) yaw = Math.atan2((droneTarget.x - drone.x) * U, -(droneTarget.y - drone.y) * U);
      state.yaw = state.yaw + wrapAngle(yaw - state.yaw) * (1 - Math.exp(-8 * dt));
      const bank = clamp(vx / 300, -0.5, 0.5);
      const pitch = clamp(vy / 300, -0.4, 0.4);
      const x = drone.x * U;
      const z = -drone.y * U;
      const y = (MODELS[drone.role]?.hover ?? 1.25) + Math.sin(t * 5.5 + drone.phase) * 0.08;
      pool.push(this.root(x, y, z, state.yaw, Math.abs(pitch) * 0.3, -bank * 0.6), poseFor(drone.role, { t, phase: drone.phase, fire: state.fire, charge: drone.role === "medic" ? Math.max(0, 1 - (game.medicClock || 0)) : 0 }), drone.hitFlash || 0);
      this.markers.add(x, z, 0.5, drone.color, 0.35);
      if (drone.hp < drone.maxHp) addBar(x, y + 0.6, z, 0.9, drone.hp / drone.maxHp, 0);
    }

    // Legion
    const playerPos = player ? { x: player.x, y: player.y } : { x: 0, y: 0 };
    for (const enemy of game.enemies) {
      if (!enemy.alive) continue;
      const dy = enemy.y - playerPos.y;
      if (dy > 1250 || dy < -600) continue;
      let pool;
      if (enemy.type === "boss") pool = this.guardianPools[(enemy.variant ?? 0) % this.guardianPools.length];
      else pool = this.pools[enemy.type] || this.pools.grunt;
      const state = this.stateFor(enemy);
      const moved = Math.hypot(enemy.x - state.x, enemy.y - state.y) / Math.max(dt, 1e-3);
      state.x = enemy.x;
      state.y = enemy.y;
      state.move = damp(state.move, clamp(moved / Math.max(40, enemy.speed || 60), 0, 1.4), 6, dt);
      state.fire = Math.max(0, state.fire - dt * 4);
      const dxp = (playerPos.x - enemy.x) * U;
      const dzp = -(playerPos.y - enemy.y) * U;
      const towards = Math.atan2(dxp, dzp);
      const isStatic = enemy.type === "turret";
      if (!isStatic) state.yaw = state.yaw + wrapAngle(towards - state.yaw) * (1 - Math.exp(-(enemy.type === "boss" ? 1.5 : 5) * dt));
      else state.yaw = 0;
      const aim = wrapAngle(towards - state.yaw);
      const x = enemy.x * U;
      const z = -enemy.y * U;
      const spec = pool.spec;
      let y = spec.hover || 0;
      if (enemy.type === "jammer") y += 0.2 + Math.sin(t * 2 + state.phase) * 0.15;
      if (enemy.type === "splitter") y += Math.sin(t * 3 + state.phase) * 0.1;
      const scale = enemy.type === "boss" ? 1 + enemy.phaseStage * 0.05 : 1;
      const charge = enemy.type === "charger" ? (enemy.dashClock > 0.8 ? 1 : 0) : enemy.type === "shield" ? (enemy.shield > 0 ? 1 : 0) : enemy.type === "boss" ? enemy.phaseStage / 2 : 0;
      const pose = poseFor(spec.id, { t, phase: state.phase, move: clamp(state.move, 0, 1), aim, fire: state.fire, charge });
      pool.push(this.root(x, y, z, state.yaw, 0, 0, scale), pose, clamp(enemy.hitFlash || 0, 0, 1));
      // markers and overlays
      const markerColor = enemy.type === "boss" ? "#ff3e91" : "#ff3d6e";
      this.markers.add(x, z, enemy.radius * U * 1.1, markerColor, enemy.type === "boss" ? 0.9 : 0.4);
      if (enemy.type === "jammer") {
        const inRange = player && Math.hypot(enemy.x - player.x, enemy.y - player.y) < 365;
        this.markers.add(x, z, 365 * U, "#ba62ff", inRange ? 0.55 : 0.18);
      }
      if (enemy.type === "shield" && enemy.shield > 0) addShield(x, 1.0, z, 1.25, "#879cff", 0.35 + 0.65 * (enemy.shield / enemy.maxShield) + (enemy.hitFlash || 0) * 0.8, 1.05);
      if (enemy.type !== "boss" && (enemy.hp < enemy.maxHp || enemy.maxShield > 0)) {
        addBar(x, (pool.size.height + y) * scale + 0.35, z, clamp(enemy.radius * U * 1.6, 0.9, 2.2), enemy.hp / enemy.maxHp, enemy.maxShield ? enemy.shield / enemy.maxShield : 0);
      }
    }

    // Pickups
    for (const pickup of game.pickups) {
      const x = pickup.x * U;
      const z = -pickup.y * U;
      this.pools.core.push(this.root(x, 0.55 + Math.sin(t * 5 + pickup.phase) * 0.12, z, t * 2.2 + pickup.phase), {});
    }

    // Gates
    const visible = new Set();
    for (const gate of game.gates) {
      const dy = gate.y - playerPos.y;
      if (dy > 1400 || dy < -500) continue;
      const fade = gate.passed ? (gate.selected ? 0.35 : 0.1) : 1;
      this.pools.gate.push(this.root(gate.x * U, 0, -gate.y * U, 0), {}, 0);
      const visual = this.gateVisual(gate);
      visual.flash = Math.max(0, visual.flash - dt * 2.5);
      visual.uniforms.uFade.value = damp(visual.uniforms.uFade.value, fade, 6, dt);
      visual.uniforms.uFlash.value = visual.flash;
      visual.label.material.opacity = visual.uniforms.uFade.value;
      visual.label.position.y = 4.9 + Math.sin(t * 2 + gate.row) * 0.08;
      visual.field.visible = true;
      visual.label.visible = true;
      visible.add(gate);
      if (!gate.passed) this.markers.add(gate.x * U, -gate.y * U, 2.3, gate.color, 0.35 + 0.15 * Math.sin(t * 4 + gate.row));
    }
    for (const [gate, visual] of this.gateVisuals) {
      if (!visible.has(gate)) {
        visual.field.visible = false;
        visual.label.visible = false;
      }
    }

    // Scenery
    for (const item of game.scenery) {
      const dy = item.y - playerPos.y;
      if (dy > 1500 || dy < -700) continue;
      const pool = this.pools[item.type];
      if (!pool) continue;
      pool.push(this.root(item.x * U, 0, -item.y * U, item.hue * TAU, 0, 0, 0.6 + item.size * 0.5), poseFor(item.type, { t, phase: item.hue * 10 }));
    }

    // Rift gate
    if (this.riftPosition) this.pools.riftgate.push(this.root(this.riftPosition.x, 0, this.riftPosition.z, 0), poseFor("riftgate", { t }));

    // Sim shockwave rings
    for (const ring of game.rings) {
      const alpha = clamp(ring.life / ring.maxLife, 0, 1);
      this.rings.add(ring.x * U, -ring.y * U, ring.radius * U, ring.color, alpha * 1.6, 0.06);
    }
    if (this.novaWave) {
      const wave = this.novaWave;
      wave.life -= dt;
      const k = 1 - wave.life / wave.max;
      if (wave.life <= 0) this.novaWave = null;
      else {
        addShield(wave.x, 0, wave.z, Math.max(0.5, wave.radius * (1 - Math.pow(1 - k, 3))), "#45d8ff", (1 - k) * (1 - k) * 0.55, 0.3);
      }
    }

    for (const pool of this.allPools) pool.end();
    this.markers.end();
    this.rings.end();
    this.shields.count = shieldCount;
    this.shields.instanceMatrix.needsUpdate = true;
    if (this.shields.instanceColor) this.shields.instanceColor.needsUpdate = true;
    this.bars.count = barCount;
    this.bars.instanceMatrix.needsUpdate = true;
    this.bars.geometry.getAttribute("aHealth").needsUpdate = true;
  }

  drawProjectiles(game) {
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler(0, 0, 0, "YXZ");
    const tint = new THREE.Color();
    let count = 0;
    for (const projectile of game.projectiles) {
      if (count >= 260) break;
      const h = projectile.h ?? (projectile.h = this.sourceHeight(projectile.source));
      const speed = Math.hypot(projectile.vx, projectile.vy);
      euler.set(0, Math.atan2(projectile.vx, -projectile.vy), 0);
      quaternion.setFromEuler(euler);
      position.set(projectile.x * U, h, -projectile.y * U);
      const width = projectile.radius * U * (projectile.side === "enemy" ? 1.5 : 1.1);
      const length = Math.max(width * 3, speed * U * 0.04);
      scale.set(width * 2.2, width * 2.2, length * 1.25);
      matrix.compose(position, quaternion, scale);
      this.bolts.setMatrixAt(count, matrix);
      tint.copy(color(projectile.color)).multiplyScalar(1.4);
      this.bolts.setColorAt(count, tint);
      scale.set(width * 0.9, width * 0.9, length);
      matrix.compose(position, quaternion, scale);
      this.boltCores.setMatrixAt(count, matrix);
      tint.copy(color(projectile.color)).lerp(new THREE.Color(1, 1, 1), 0.5).multiplyScalar(2.6);
      this.boltCores.setColorAt(count, tint);
      count += 1;
    }
    for (const mesh of [this.bolts, this.boltCores]) {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  drawParticles(game, dt, focus) {
    const limit = this.settings.particles;
    let count = 0;
    const tint = new THREE.Color();
    for (const particle of game.particles) {
      if (count >= limit) break;
      if (particle.h === undefined) {
        particle.h = 0.5 + Math.random() * 1.2;
        particle.vh = 1 + Math.random() * 4;
      }
      particle.vh -= 9 * dt;
      particle.h = Math.max(0.04, particle.h + particle.vh * dt);
      const k = clamp(particle.life / particle.maxLife, 0, 1);
      this.particlePositions.set([particle.x * U, particle.h, -particle.y * U], count * 3);
      tint.copy(color(particle.color)).multiplyScalar(1.6);
      this.particleColors.set([tint.r, tint.g, tint.b], count * 3);
      this.particleSizes[count] = particle.size * 0.045;
      this.particleAlphas[count] = k;
      count += 1;
    }
    // ambient dust drifting towards the rift
    for (const mote of this.dust) {
      if (count >= limit + 220) break;
      mote.z -= dt * (0.6 + mote.s);
      mote.y += Math.sin(this.animTime * 0.6 + mote.c * 10) * dt * 0.2;
      let rx = mote.x;
      let rz = mote.z;
      rx = ((rx + 35) % 70 + 70) % 70 - 35;
      rz = ((rz + 35) % 70 + 70) % 70 - 35;
      this.particlePositions.set([focus.x + rx, 0.3 + mote.y, focus.z + rz], count * 3);
      tint.copy(mote.c > 0.8 ? color(this.theme.accent2) : color(this.theme.accent)).multiplyScalar(0.9);
      this.particleColors.set([tint.r, tint.g, tint.b], count * 3);
      this.particleSizes[count] = 0.05 + mote.s * 0.06;
      this.particleAlphas[count] = 0.35 + 0.3 * Math.sin(this.animTime * 2 + mote.c * 20);
      count += 1;
    }
    this.particleGeometry.setDrawRange(0, count);
    for (const name of ["position", "aColor", "aSize", "aAlpha"]) this.particleGeometry.getAttribute(name).needsUpdate = true;
  }

  updateDebris(dt) {
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    let count = 0;
    const next = [];
    for (const piece of this.debris) {
      piece.life -= dt;
      if (piece.life <= 0) continue;
      piece.vy -= 16 * dt;
      piece.x += piece.vx * dt;
      piece.y += piece.vy * dt;
      piece.z += piece.vz * dt;
      if (piece.y < piece.size * 0.5) {
        piece.y = piece.size * 0.5;
        piece.vy *= -0.35;
        piece.vx *= 0.6;
        piece.vz *= 0.6;
        piece.spin *= 0.6;
      }
      piece.rx += piece.spin * dt;
      piece.ry += piece.spin * 0.7 * dt;
      euler.set(piece.rx, piece.ry, 0);
      quaternion.setFromEuler(euler);
      const s = piece.size * Math.min(1, piece.life * 2);
      scale.set(s, s * 0.6, s * 1.4);
      position.set(piece.x, piece.y, piece.z);
      matrix.compose(position, quaternion, scale);
      this.debrisMesh.setMatrixAt(count, matrix);
      if (Math.random() < 0.08 && piece.life > 0.8) this.flares.add({ x: piece.x, y: piece.y, z: piece.z, size: 0.18, life: 0.25, color: new THREE.Color(1, 0.55, 0.25), intensity: 2 });
      count += 1;
      next.push(piece);
    }
    this.debris = next;
    this.debrisMesh.count = count;
    this.debrisMesh.instanceMatrix.needsUpdate = true;
    for (const mesh of this.scorchMeshes) {
      if (!mesh.visible) continue;
      mesh.userData.life -= dt;
      mesh.material.opacity = clamp(mesh.userData.life / 3, 0, 0.9);
      if (mesh.userData.life <= 0) mesh.visible = false;
    }
    for (const light of this.pointLights) {
      if (light.userData.life <= 0) {
        light.intensity = 0;
        continue;
      }
      light.userData.life -= dt;
      light.intensity = light.userData.power * clamp(light.userData.life / light.userData.max, 0, 1);
    }
  }

  // Attract mode: the squad holds position in front of the rift while the camera orbits.
  attractActors(t) {
    if (!this.attract) {
      const baseY = 1950;
      const commander = { x: pathX(baseY), y: baseY, vx: 0, vy: 0, speed: 265, alive: true, invulnerable: 0, shield: 1, radius: 23 };
      const roles = ["striker", "rail", "bulwark", "medic", "striker", "rail"];
      const squad = roles.map((role, index) => ({
        role, alive: true, hp: 1, maxHp: 1, phase: index * 1.3, x: commander.x + ((index % 3) - 1) * 48, y: baseY + 60 + Math.floor(index / 3) * 52,
        color: { striker: "#45f6ff", rail: "#ff63d9", bulwark: "#768cff", medic: "#56ffb5" }[role], vx: 0, vy: 0
      }));
      const legion = ["grunt", "grunt", "shooter", "brute", "shield", "grunt", "charger", "jammer"].map((type, index) => ({
        type, alive: true, hp: 1, maxHp: 1, shield: 0, maxShield: 0, radius: 20, speed: 0, phaseStage: 0,
        x: pathX(baseY + 520) + (index - 3.5) * 70, y: baseY + 520 + (index % 3) * 40
      }));
      this.attract = { commander, squad, legion, gates: [], scenery: [], pickups: [], rings: [], projectiles: [], particles: [] };
      const rng = (() => {
        let s = 94017;
        return () => ((s = (s * 16807) % 2147483647) / 2147483647);
      })();
      for (let index = 0; index < 70; index += 1) {
        const y = 1300 + index * 22;
        const side = rng() > 0.5 ? 1 : -1;
        const roll = rng();
        this.attract.scenery.push({ x: pathX(y) + side * (270 + rng() * 230), y, type: roll > 0.7 ? "crystal" : roll > 0.48 ? "beacon" : roll > 0.2 ? "rock" : "wreck", size: 0.6 + rng() * 1.1, hue: rng() });
      }
    }
    const actors = this.attract;
    return {
      mode: "menu",
      player: actors.commander,
      squad: actors.squad,
      enemies: actors.legion,
      gates: actors.gates,
      scenery: actors.scenery,
      pickups: actors.pickups,
      rings: actors.rings,
      projectiles: actors.projectiles,
      particles: actors.particles,
      stance: "balanced",
      medicClock: 1,
      fx: [],
      shake: 0,
      findTarget: () => null,
      time: t
    };
  }

  render(game, time, delta) {
    const dt = Math.min(0.05, delta || 0.016);
    if (this.hangarActive) {
      this.renderHangar(time, dt);
      return;
    }
    this.adapt(delta || 0.016);
    const ending = game.ending;
    if (!ending) {
      this.slowmo = damp(this.slowmo, 1, 3, dt);
      this.desatTarget = 0;
    }
    const scaled = dt * this.slowmo;
    this.animTime += scaled;
    const t = this.animTime;

    let view = game;
    if (game.mode === "menu" || !game.player) {
      if (this.envKey !== "attract") {
        this.buildEnvironment(1, 2400, "attract");
        this.attract = null;
      }
      view = this.attractActors(t);
      const center = view.player;
      const orbit = t * 0.12;
      const radius = this.portrait ? 11 : 9.5;
      const cx = center.x * U;
      const cz = -center.y * U - 2;
      this.camera.position.set(cx + Math.sin(orbit) * radius, 2.6 + Math.sin(t * 0.21) * 0.6, cz + Math.cos(orbit) * radius);
      this.focus.set(cx, 1.6, cz - 1.5);
      this.camera.lookAt(this.focus);
      this.sky.position.copy(this.camera.position);
      this.sun.target.position.set(cx, 0, cz);
      this.sun.position.set(cx - 12, 26, cz + 10);
      this.groundUniforms.uFocus.value.set(cx, cz);
      this.cameraState.mode = "follow";
    } else {
      const key = game.gates;
      if (this.envKey !== key) {
        this.buildEnvironment(game.sector, game.goal, key);
        this.unitState = new WeakMap();
        this.cameraState = { mode: "follow", timer: 0, roll: 0, orbit: 0, snap: true };
        this.desatTarget = 0;
        this.slowmo = 1;
      }
      this.consumeFx(game);
      this.updateCamera(game, dt, t);
    }

    this.ground.position.set(Math.round(this.focus.x / 4.8) * 4.8, -0.005, Math.round(this.focus.z / 4.8) * 4.8);
    this.groundUniforms.uTime.value = t;
    this.skyUniforms.uTime.value = t;
    this.shieldUniforms.uTime.value = t;
    if (this.vortexUniforms) this.vortexUniforms.uTime.value = t;
    if (this.orbitalRings) for (const [index, ring] of this.orbitalRings.entries()) ring.rotation.z += scaled * 0.02 * (index % 2 ? -1 : 1);
    this.playerShield = Math.max(0, this.playerShield - dt * 2.5);
    this.warpPulse = Math.max(0, (this.warpPulse || 0) - dt * 1.6);

    this.drawUnits(view, t, scaled);
    this.drawProjectiles(view);
    this.drawParticles(view, scaled, this.focus);
    this.flares.update(scaled);
    this.smoke.update(scaled);
    this.updateDebris(scaled);

    // Post-processing state
    this.hitPulse = Math.max(0, this.hitPulse - dt * 2.2);
    this.flashPulse = Math.max(0, this.flashPulse - dt * 1.8);
    this.desat = damp(this.desat, this.desatTarget || 0, 2, dt);
    this.gradeUniforms.uTime.value = time % 100;
    this.gradeUniforms.uHit.value = this.hitPulse;
    this.gradeUniforms.uFlash.value = this.flashPulse;
    this.gradeUniforms.uFlashColor.value.copy(this.flashColor);
    this.gradeUniforms.uDesat.value = this.desat;
    this.gradeUniforms.uAberration.value = this.hitPulse * 0.6 + this.flashPulse * 0.3;
    this.renderPass.scene = this.scene;
    this.renderPass.camera = this.camera;
    if (this.bloom) {
      this.bloom.strength = 0.6 + this.flashPulse * 0.45;
      this.bloom.threshold = 0.86;
    }
    this.composer.render(dt);
  }

  // -------------------------------------------------------------------------
  // Blueprint hangar
  // -------------------------------------------------------------------------

  buildHangar() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050a1c);
    scene.fog = new THREE.Fog(0x050a1c, 18, 60);
    scene.environment = this.scene.environment;
    scene.environmentIntensity = 0.45;
    const key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(5, 9, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 40 });
    key.shadow.bias = -0.0004;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x45f6ff, 1.1);
    rim.position.set(-6, 4, -6);
    scene.add(rim);
    const rim2 = new THREE.DirectionalLight(0xff52ce, 0.8);
    rim2.position.set(6, 3, -5);
    scene.add(rim2);
    scene.add(new THREE.HemisphereLight(0x9fc4ff, 0x10081c, 0.35));
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.4, 0.24, 64), new THREE.MeshStandardMaterial({ color: 0x0c1430, metalness: 0.85, roughness: 0.3 }));
    deck.position.y = -0.12;
    deck.receiveShadow = true;
    scene.add(deck);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.25, 0.03, 8, 128), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x45f6ff).multiplyScalar(1.2), toneMapped: false }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.01;
    scene.add(ring);
    const grid = new THREE.GridHelper(40, 80, 0x2a62a8, 0x14284f);
    grid.position.y = -0.24;
    scene.add(grid);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x040814, metalness: 0.5, roughness: 0.6 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.25;
    floor.receiveShadow = true;
    scene.add(floor);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 400);
    this.hangar = { scene, camera, key, group: null, id: null, az: 0.7, el: 0.28, dist: 6, targetAz: 0.7, targetEl: 0.28, targetDist: 6, center: new THREE.Vector3(0, 1, 0), pose: "rest", ink: false, wire: false, spin: true, materials: new Map(), t: 0 };
  }

  enterHangar(id = "commander") {
    if (!this.hangar) this.buildHangar();
    this.hangarActive = true;
    this.setHangarModel(id);
  }

  exitHangar() {
    this.hangarActive = false;
  }

  setHangarModel(id) {
    const hangar = this.hangar;
    if (hangar.group) {
      hangar.scene.remove(hangar.group);
      hangar.group = null;
    }
    const spec = MODELS[id];
    hangar.id = id;
    hangar.model = hangar.models?.get(id) || buildModel(spec);
    hangar.models ??= new Map();
    hangar.models.set(id, hangar.model);
    hangar.size = measure(hangar.model);
    const group = modelToGroup(hangar.model, { materials: hangar.materials });
    group.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = !child.material.userData?.glow;
        child.receiveShadow = true;
        child.userData.pbr = child.material;
      }
    });
    const lift = spec.faction === "Dominion" && id !== "commander" && id !== "gate" ? 1.0 : spec.hover && id === "core" ? 0.6 : 0;
    group.position.y = lift - Math.min(0, hangar.model.bounds.min.y);
    hangar.group = group;
    hangar.scene.add(group);
    const size = hangar.model.bounds.getSize(new THREE.Vector3());
    const radius = size.length() * 0.5;
    hangar.center.set(0, group.position.y + hangar.model.bounds.getCenter(new THREE.Vector3()).y, 0);
    hangar.targetDist = (radius / Math.sin((15 * Math.PI) / 180)) * 1.05;
    hangar.dist = hangar.targetDist * 1.3;
    const shadowExtent = Math.max(4, radius * 1.4);
    Object.assign(hangar.key.shadow.camera, { left: -shadowExtent, right: shadowExtent, top: shadowExtent, bottom: -shadowExtent, far: shadowExtent * 6 });
    hangar.key.position.set(5, 9, 7).normalize().multiplyScalar(shadowExtent * 2.5);
    hangar.key.shadow.camera.updateProjectionMatrix();
    hangar.scene.fog.near = hangar.targetDist * 2;
    hangar.scene.fog.far = hangar.targetDist * 8;
    this.applyHangarStyle();
    return { spec, size: hangar.size };
  }

  setHangarView(key) {
    const view = VIEWS[key];
    if (!view) return;
    const [x, y, z] = view.dir;
    this.hangar.targetAz = Math.atan2(x, z);
    this.hangar.targetEl = Math.asin(clamp(y / Math.hypot(x, y, z), -1, 1));
    if (Math.abs(this.hangar.targetEl) > 1.5) this.hangar.targetEl = Math.sign(this.hangar.targetEl) * 1.5;
    this.hangar.spin = false;
  }

  setHangarPose(key) {
    this.hangar.pose = key;
  }

  setHangarStyle({ ink, wire, spin }) {
    if (ink !== undefined) this.hangar.ink = ink;
    if (wire !== undefined) this.hangar.wire = wire;
    if (spin !== undefined) this.hangar.spin = spin;
    this.applyHangarStyle();
  }

  applyHangarStyle() {
    const hangar = this.hangar;
    if (!hangar?.group) return;
    hangar.inkFill ??= new THREE.MeshBasicMaterial({ color: 0x0f2a63, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    hangar.inkLine ??= new THREE.LineBasicMaterial({ color: 0xbfe6ff });
    hangar.edgeCache ??= new WeakMap();
    hangar.group.traverse((child) => {
      if (!child.isMesh) return;
      child.material = hangar.ink ? hangar.inkFill : child.userData.pbr;
      if (child.material.wireframe !== undefined && !hangar.ink) child.material.wireframe = hangar.wire;
      let lines = child.userData.lines;
      if (hangar.ink && !lines) {
        let edges = hangar.edgeCache.get(child.geometry);
        if (!edges) {
          edges = new THREE.EdgesGeometry(child.geometry, 24);
          hangar.edgeCache.set(child.geometry, edges);
        }
        lines = new THREE.LineSegments(edges, hangar.inkLine);
        child.add(lines);
        child.userData.lines = lines;
      }
      if (lines) lines.visible = hangar.ink;
    });
    hangar.scene.background.set(hangar.ink ? 0x0b1d45 : 0x050a1c);
    hangar.scene.fog.color.set(hangar.ink ? 0x0b1d45 : 0x050a1c);
  }

  hangarOrbit(dx, dy) {
    const hangar = this.hangar;
    hangar.spin = false;
    hangar.targetAz -= dx * 0.008;
    hangar.targetEl = clamp(hangar.targetEl + dy * 0.006, -1.45, 1.45);
  }

  hangarZoom(factor) {
    this.hangar.targetDist = clamp(this.hangar.targetDist * factor, 1.2, 120);
  }

  renderHangar(time, dt) {
    const hangar = this.hangar;
    hangar.t += dt;
    if (hangar.spin) hangar.targetAz += dt * 0.35;
    hangar.az = damp(hangar.az, hangar.targetAz, 6, dt);
    hangar.el = damp(hangar.el, hangar.targetEl, 6, dt);
    hangar.dist = damp(hangar.dist, hangar.targetDist, 5, dt);
    const camera = hangar.camera;
    camera.aspect = this.width / this.height;
    camera.fov = this.portrait ? 42 : 30;
    camera.updateProjectionMatrix();
    camera.position.set(
      hangar.center.x + Math.sin(hangar.az) * Math.cos(hangar.el) * hangar.dist,
      hangar.center.y + Math.sin(hangar.el) * hangar.dist,
      hangar.center.z + Math.cos(hangar.az) * Math.cos(hangar.el) * hangar.dist
    );
    camera.up.set(0, 1, 0);
    if (Math.abs(hangar.el) > 1.4) camera.up.set(0, 0, -Math.sign(hangar.el));
    camera.lookAt(hangar.center);
    const sheet = { rest: {}, advance: { t: hangar.t, move: 1 }, aim: { aim: Math.sin(hangar.t) * 1.0, fire: (hangar.t * 2) % 1 < 0.2 ? 1 : 0 }, special: { t: hangar.t, charge: 1 } };
    const state = sheet[hangar.pose] || {};
    applyPose(hangar.group, poseFor(hangar.id, { t: hangar.t, ...state }));
    this.gradeUniforms.uHit.value = 0;
    this.gradeUniforms.uFlash.value = 0;
    this.gradeUniforms.uDesat.value = 0;
    this.gradeUniforms.uAberration.value = 0;
    if (this.bloom) {
      this.bloom.strength = hangar.ink ? 0.15 : 0.35;
      this.bloom.threshold = 0.95;
    }
    this.renderPass.scene = hangar.scene;
    this.renderPass.camera = camera;
    this.composer.render(dt);
  }
}
