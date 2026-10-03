import * as THREE from "three";

/**
 * Lightweight effects: a pooled particle system (smoke, sparks, confetti, dust)
 * and shader-based rocket flames.
 */
let sprite: THREE.Texture | null = null;
function softSprite() {
  if (sprite) return sprite;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  sprite = new THREE.CanvasTexture(canvas);
  return sprite;
}

export interface EmitOptions {
  position: THREE.Vector3;
  velocity?: THREE.Vector3;
  spread?: number;
  life?: number;
  size?: number;
  growth?: number;
  color?: THREE.ColorRepresentation;
  colorEnd?: THREE.ColorRepresentation;
  count?: number;
  gravity?: number;
  drag?: number;
  alpha?: number;
}

export class Particles {
  readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly sizes: Float32Array;
  private readonly alphas: Float32Array;
  private readonly velocity: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly growth: Float32Array;
  private readonly baseSize: Float32Array;
  private readonly gravity: Float32Array;
  private readonly drag: Float32Array;
  private readonly baseAlpha: Float32Array;
  private readonly startColor: Float32Array;
  private readonly endColor: Float32Array;
  private cursor = 0;
  private readonly tmp = new THREE.Color();
  private readonly tmp2 = new THREE.Color();

  readonly capacity: number;

  constructor(capacity: number, additive = false, pixelRatio = 1) {
    this.capacity = capacity;
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity);
    this.alphas = new Float32Array(capacity);
    this.velocity = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity).fill(1);
    this.growth = new Float32Array(capacity);
    this.baseSize = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.baseAlpha = new Float32Array(capacity);
    this.startColor = new Float32Array(capacity * 3);
    this.endColor = new Float32Array(capacity * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("size", new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("alpha", new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.ShaderMaterial({
      uniforms: { map: { value: softSprite() }, scale: { value: 420 * pixelRatio } },
      vertexShader: "attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vColor; varying float vAlpha; uniform float scale; void main(){ vColor = color; vAlpha = alpha; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = size * scale / max(0.1, -mv.z); gl_Position = projectionMatrix*mv; }",
      fragmentShader: "uniform sampler2D map; varying vec3 vColor; varying float vAlpha; void main(){ vec4 t = texture2D(map, gl_PointCoord); if (t.a*vAlpha < 0.01) discard; gl_FragColor = vec4(vColor, t.a*vAlpha); }",
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
  }

  setPixelRatio(pixelRatio: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.scale.value = 420 * pixelRatio;
  }

  emit(o: EmitOptions) {
    const count = o.count ?? 1;
    const c0 = this.tmp.set(o.color ?? 0xffffff);
    const c1 = this.tmp2.set(o.colorEnd ?? o.color ?? 0xffffff);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;
      const spread = o.spread ?? 0;
      this.positions[i * 3] = o.position.x;
      this.positions[i * 3 + 1] = o.position.y;
      this.positions[i * 3 + 2] = o.position.z;
      this.velocity[i * 3] = (o.velocity?.x ?? 0) + (Math.random() - 0.5) * spread;
      this.velocity[i * 3 + 1] = (o.velocity?.y ?? 0) + (Math.random() - 0.5) * spread;
      this.velocity[i * 3 + 2] = (o.velocity?.z ?? 0) + (Math.random() - 0.5) * spread;
      const life = (o.life ?? 1) * (0.75 + Math.random() * 0.5);
      this.life[i] = life;
      this.maxLife[i] = life;
      this.baseSize[i] = (o.size ?? 1) * (0.7 + Math.random() * 0.6);
      this.growth[i] = o.growth ?? 0;
      this.gravity[i] = o.gravity ?? 0;
      this.drag[i] = o.drag ?? 0;
      this.baseAlpha[i] = o.alpha ?? 1;
      this.startColor.set([c0.r, c0.g, c0.b], i * 3);
      this.endColor.set([c1.r, c1.g, c1.b], i * 3);
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) {
        this.alphas[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const t = 1 - Math.max(0, this.life[i]) / this.maxLife[i];
      const drag = Math.max(0, 1 - this.drag[i] * dt);
      this.velocity[i * 3] *= drag;
      this.velocity[i * 3 + 1] = this.velocity[i * 3 + 1] * drag - this.gravity[i] * dt;
      this.velocity[i * 3 + 2] *= drag;
      this.positions[i * 3] += this.velocity[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocity[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocity[i * 3 + 2] * dt;
      this.sizes[i] = this.baseSize[i] * (1 + this.growth[i] * t);
      this.alphas[i] = this.baseAlpha[i] * (t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88);
      for (let k = 0; k < 3; k++) this.colors[i * 3 + k] = this.startColor[i * 3 + k] + (this.endColor[i * 3 + k] - this.startColor[i * 3 + k]) * t;
    }
    const geometry = this.points.geometry;
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.attributes.size.needsUpdate = true;
    geometry.attributes.alpha.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.alphas.fill(0);
  }
}

/** Shader flame (cone) — set `throttle` 0..1 every frame. */
export class Flame {
  readonly mesh: THREE.Mesh;
  readonly glow: THREE.Mesh;
  throttle = 0;
  private readonly material: THREE.ShaderMaterial;

  readonly hue: "orange" | "blue" | "pink";

  constructor(radius = 0.5, length = 3, hue: "orange" | "blue" | "pink" = "orange") {
    this.hue = hue;
    const geometry = new THREE.CylinderGeometry(radius * 0.25, radius, length, 20, 8, true);
    geometry.translate(0, -length / 2, 0);
    const inner = hue === "blue" ? new THREE.Color("#e8f6ff") : new THREE.Color("#fff6d8");
    const outer = hue === "blue" ? new THREE.Color("#3fa8ff") : hue === "pink" ? new THREE.Color("#ff5fb8") : new THREE.Color("#ff7a1a");
    this.material = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, throttle: { value: 0 }, inner: { value: inner }, outer: { value: outer }, len: { value: length } },
      vertexShader: "varying vec2 vUv; varying float vY; uniform float time; uniform float len; void main(){ vUv = uv; vY = -position.y/len; vec3 p = position; float w = 1.0 + 0.08*sin(time*40.0 + position.y*6.0); p.xz *= w; gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.0); }",
      fragmentShader: "uniform vec3 inner; uniform vec3 outer; uniform float throttle; uniform float time; varying vec2 vUv; varying float vY; void main(){ float edge = sin(vUv.x*3.14159*2.0)*0.0; float core = 1.0 - smoothstep(0.0, 0.7, vY); vec3 col = mix(outer, inner, core); float a = (1.0 - smoothstep(0.15, 1.0, vY)) * throttle; a *= 0.75 + 0.25*sin(time*55.0 + vY*20.0); gl_FragColor = vec4(col*1.6, a); }",
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    const glowGeometry = new THREE.SphereGeometry(radius * 1.2, 16, 12);
    this.glow = new THREE.Mesh(glowGeometry, new THREE.MeshBasicMaterial({ color: outer, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.mesh.add(this.glow);
  }

  update(dt: number, time: number) {
    this.material.uniforms.time.value = time;
    this.material.uniforms.throttle.value = this.throttle;
    const s = 0.35 + this.throttle * 0.75 + Math.sin(time * 30) * 0.03 * this.throttle;
    this.mesh.scale.set(1, s, 1);
    (this.glow.material as THREE.MeshBasicMaterial).opacity = this.throttle * 0.5;
    this.mesh.visible = this.throttle > 0.01;
    void dt;
  }
}

/** Expanding ring flash (correct gate, docking, landing). */
export class Ring {
  readonly mesh: THREE.Mesh;
  private t = 1;
  constructor(color: THREE.ColorRepresentation = "#7ff0ff") {
    this.mesh = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.mesh.visible = false;
  }
  fire(position: THREE.Vector3, quaternion?: THREE.Quaternion) {
    this.mesh.position.copy(position);
    if (quaternion) this.mesh.quaternion.copy(quaternion);
    this.t = 0;
    this.mesh.visible = true;
  }
  update(dt: number, maxScale = 8) {
    if (this.t >= 1) { this.mesh.visible = false; return; }
    this.t = Math.min(1, this.t + dt * 1.6);
    const s = 0.5 + this.t * maxScale;
    this.mesh.scale.set(s, s, s);
    (this.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - this.t) * 0.9;
  }
}

export function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3); }
export function easeInOutCubic(t: number) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
export function damp(current: number, target: number, lambda: number, dt: number) { return target + (current - target) * Math.exp(-lambda * dt); }
export function dampVec(current: THREE.Vector3, target: THREE.Vector3, lambda: number, dt: number) { return current.lerp(target, 1 - Math.exp(-lambda * dt)); }
