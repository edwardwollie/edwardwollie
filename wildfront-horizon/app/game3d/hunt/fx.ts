// Visual effects: v2.0.1-style impact pulses (bright flash + ring, coloured by
// grade, scaled with distance so they read through the scope), dust / bark /
// spark / splash bursts, and GPU rain & snow around the camera.

import * as THREE from "three";
import { ATMO, atmoGLSL, atmoUniforms } from "../render/atmosphere.ts";
import { softSprite } from "../world/textures.ts";

interface P { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; grow: number; r: number; g: number; b: number; a: number; drag: number; grav: number }

export class Fx {
  group = new THREE.Group();
  private parts: P[] = [];
  private mesh: THREE.InstancedMesh;
  private colorAttr: THREE.InstancedBufferAttribute;
  private pulses: { flash: THREE.Mesh; ring: THREE.Mesh; t: number; max: number; size: number }[] = [];
  private flashGeo = new THREE.SphereGeometry(1, 12, 8);
  private ringGeo = new THREE.TorusGeometry(1, 0.07, 6, 28);
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  constructor() {
    this.group.name = "fx";
    const geo = new THREE.PlaneGeometry(1, 1);
    this.colorAttr = new THREE.InstancedBufferAttribute(new Float32Array(400 * 4), 4);
    geo.setAttribute("aCol", this.colorAttr);
    const mat = new THREE.MeshBasicMaterial({ map: softSprite(), transparent: true, depthWrite: false });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute vec4 aCol; varying vec4 vCol;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCol = aCol;")
        .replace("#include <project_vertex>", `
vec3 ctr = (instanceMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;
float sc = length(instanceMatrix[0].xyz);
vec4 mvPosition = viewMatrix * vec4(ctr, 1.0);
mvPosition.xy += position.xy * sc;
gl_Position = projectionMatrix * mvPosition;`);
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec4 vCol;")
        .replace("#include <map_fragment>", "vec4 tc = texture2D(map, vMapUv); diffuseColor *= vec4(vCol.rgb, vCol.a * tc.a);");
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, 400);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.group.add(this.mesh);
  }

  /** Bright world-space confirmation of animal contact (v2.0.1), colour by grade. */
  pulse(point: THREE.Vector3, kind: "perfect" | "great" | "good" | "graze", dist: number) {
    const col = kind === "perfect" ? new THREE.Color(0.5, 1.0, 1.0) : kind === "great" ? new THREE.Color(0.79, 1, 0.28) : kind === "good" ? new THREE.Color(1, 0.75, 0.25) : new THREE.Color(0.9, 0.9, 0.9);
    const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, depthTest: false, toneMapped: false });
    const flash = new THREE.Mesh(this.flashGeo, mat);
    const ring = new THREE.Mesh(this.ringGeo, mat);
    const size = Math.max(0.12, dist * 0.0045);
    flash.position.copy(point); ring.position.copy(point);
    flash.scale.setScalar(size * 0.5); ring.scale.setScalar(size * 1.4);
    flash.renderOrder = ring.renderOrder = 20;
    this.group.add(flash, ring);
    this.pulses.push({ flash, ring, t: 0, max: kind === "graze" ? 0.25 : 0.42, size });
  }

  burst(point: THREE.Vector3, kind: "dust" | "bark" | "spark" | "splash" | "snow" | "fur", normal?: THREE.Vector3, color?: THREE.Color) {
    const n = kind === "spark" ? 10 : kind === "splash" ? 16 : 12;
    const base = color ?? (kind === "bark" ? new THREE.Color(0.35, 0.25, 0.16) : kind === "spark" ? new THREE.Color(1, 0.8, 0.45) : kind === "splash" ? new THREE.Color(0.75, 0.85, 0.9) : kind === "snow" ? new THREE.Color(0.95, 0.97, 1) : new THREE.Color(0.45, 0.38, 0.3));
    const nx = normal?.x ?? 0, ny = normal?.y ?? 1, nz = normal?.z ?? 0;
    for (let i = 0; i < n; i++) {
      const sp = kind === "spark" ? 6 : kind === "splash" ? 3.5 : 2.2;
      const vx = (Math.random() - 0.5) * sp + nx * sp * 0.6, vy = Math.random() * sp * (kind === "splash" ? 1.6 : 1) + ny * sp * 0.5, vz = (Math.random() - 0.5) * sp + nz * sp * 0.6;
      this.parts.push({ x: point.x, y: point.y, z: point.z, vx, vy, vz, life: 0, max: kind === "spark" ? 0.25 : 0.8 + Math.random() * 0.6, size: kind === "spark" ? 0.03 : 0.12 + Math.random() * 0.12, grow: kind === "dust" ? 0.9 : 0.2, r: base.r, g: base.g, b: base.b, a: kind === "dust" ? 0.55 : 0.85, drag: kind === "dust" ? 2.4 : 0.8, grav: kind === "dust" ? 0.6 : 9.8 });
    }
    if (this.parts.length > 400) this.parts.splice(0, this.parts.length - 400);
  }

  update(dt: number, camera: THREE.Camera) {
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      p.t += dt;
      const u = p.t / p.max;
      (p.flash.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - u);
      p.ring.scale.setScalar(p.size * (1.4 + u * 2.2));
      p.ring.quaternion.copy(camera.quaternion);
      if (u >= 1) { this.group.remove(p.flash, p.ring); (p.flash.material as THREE.Material).dispose(); this.pulses.splice(i, 1); }
    }
    let n = 0;
    const ca = this.colorAttr.array as Float32Array;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life += dt;
      if (p.life >= p.max) { this.parts.splice(i, 1); continue; }
      p.vx -= p.vx * p.drag * dt; p.vz -= p.vz * p.drag * dt; p.vy -= p.grav * dt + p.vy * p.drag * dt * 0.5;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const u = p.life / p.max;
      const s = p.size * (1 + p.grow * u * 3);
      this.m4.compose(new THREE.Vector3(p.x, p.y, p.z), this.q, new THREE.Vector3(s, s, s));
      this.mesh.setMatrixAt(n, this.m4);
      ca[n * 4] = p.r; ca[n * 4 + 1] = p.g; ca[n * 4 + 2] = p.b; ca[n * 4 + 3] = p.a * (1 - u);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ weather particles

const W_VERT = /* glsl */`
attribute vec4 aSeed;
uniform vec3 uCam; uniform float uTime; uniform vec2 uWind; uniform float uSnow; uniform float uBox;
varying float vA; varying vec3 vW; varying vec2 vUv;
void main() {
  float fall = mix(9.5, 1.1, uSnow);
  vec3 p = aSeed.xyz * uBox;
  p.y -= uTime * fall * (0.8 + 0.4 * aSeed.w);
  p.xz += uWind * uTime * mix(0.25, 0.9, uSnow);
  if (uSnow > 0.5) { p.x += sin(uTime * 1.3 + aSeed.w * 20.0) * 0.4; p.z += cos(uTime * 1.1 + aSeed.w * 17.0) * 0.4; }
  vec3 w = uCam + mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5;
  vW = w;
  vec4 mv = viewMatrix * vec4(w, 1.0);
  float len = mix(0.55, 0.06, uSnow), wid = mix(0.012, 0.06, uSnow);
  vec2 corner = position.xy;
  mv.x += corner.x * wid;
  // rain streaks stretch along the (screen projected) fall direction
  vec3 fallDir = normalize(vec3(uWind.x * 0.12, -1.0, uWind.y * 0.12));
  vec3 fv = (viewMatrix * vec4(fallDir, 0.0)).xyz;
  mv.xyz += fv * corner.y * len + vec3(0.0, uSnow * corner.y * wid, 0.0);
  vA = (1.0 - smoothstep(uBox * 0.3, uBox * 0.5, length(w - uCam))) * (0.6 + 0.4 * aSeed.w);
  vUv = corner + 0.5;
  gl_Position = projectionMatrix * mv;
}`;
const W_FRAG = /* glsl */`
uniform float uSnow; uniform float uIntensity; uniform vec3 uLight;
varying float vA; varying vec3 vW; varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float shape = uSnow > 0.5 ? smoothstep(1.0, 0.2, d) : (1.0 - abs(vUv.x - 0.5) * 2.0);
  vec3 col = mix(vec3(0.62, 0.68, 0.75), vec3(0.95, 0.97, 1.0), uSnow) * uLight;
  gl_FragColor = vec4(col, vA * shape * uIntensity * mix(0.32, 0.9, uSnow));
  #include <colorspace_fragment>
}`;

export class Precipitation {
  mesh: THREE.Mesh;
  uniforms = { uCam: { value: new THREE.Vector3() }, uTime: ATMO.uTime, uWind: ATMO.uWind, uSnow: { value: 0 }, uBox: { value: 26 }, uIntensity: { value: 0 }, uLight: { value: new THREE.Color(1, 1, 1) } };
  constructor(count: number) {
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index; geo.setAttribute("position", base.getAttribute("position"));
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) { seeds[i * 4] = Math.random(); seeds[i * 4 + 1] = Math.random(); seeds[i * 4 + 2] = Math.random(); seeds[i * 4 + 3] = Math.random(); }
    geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 4));
    geo.instanceCount = count;
    const mat = new THREE.ShaderMaterial({ vertexShader: W_VERT, fragmentShader: W_FRAG, uniforms: this.uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.name = "precipitation";
    void atmoGLSL; void atmoUniforms;
  }
  update(cam: THREE.Vector3, rain: number, snow: number, light: number) {
    this.uniforms.uCam.value.copy(cam);
    this.uniforms.uSnow.value = snow > rain ? 1 : 0;
    this.uniforms.uIntensity.value = Math.max(rain, snow);
    this.uniforms.uLight.value.setScalar(0.35 + 0.65 * light);
    this.mesh.visible = Math.max(rain, snow) > 0.02;
  }
}
