// Sky dome: time-of-day gradient, sun disk + glow, moving cloud deck,
// stars and moon at night. Drawn at the far plane behind everything.

import * as THREE from "three";

const VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const FRAG = /* glsl */`
uniform vec3 uSunDir; uniform vec3 uMoonDir;
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunColor; uniform vec3 uCloudLit; uniform vec3 uCloudDark;
uniform float uCover; uniform float uNight; uniform float uTime; uniform vec2 uWind; uniform float uStorm; uniform float uFlash; uniform float uSunVis;
varying vec3 vDir;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 sky = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.42));
  float sd = max(dot(d, uSunDir), 0.0);
  sky += uSunColor * (pow(sd, 5.0) * 0.28 + pow(sd, 48.0) * 0.55) * uSunVis;
  // stars
  if (uNight > 0.02 && h > 0.0) {
    vec3 p = d * 420.0;
    float s = hash(floor(p));
    float tw = 0.6 + 0.4 * sin(uTime * 3.0 + s * 50.0);
    sky += vec3(0.85, 0.9, 1.0) * step(0.9975, s) * uNight * tw * smoothstep(0.0, 0.25, h) * (1.0 - uCover);
    // milky band
    float band = exp(-pow(dot(d, normalize(vec3(0.3, 0.6, -0.74))) * 4.0, 2.0));
    sky += vec3(0.12, 0.13, 0.18) * band * uNight * fbm(d.xz * 6.0) * (1.0 - uCover);
  }
  // moon
  float md = dot(d, uMoonDir);
  sky += vec3(0.85, 0.88, 0.95) * smoothstep(0.99955, 0.9997, md) * uNight;
  sky += vec3(0.25, 0.3, 0.42) * pow(max(md, 0.0), 40.0) * uNight * 0.35;
  // clouds on a plane above the camera
  if (h > -0.02) {
    vec2 uv = d.xz / (h + 0.18) * 1.4 + uWind * uTime * 0.0022;
    float n = fbm(uv * 0.9) * 0.65 + fbm(uv * 2.6 + 3.1) * 0.35;
    float c = smoothstep(1.0 - uCover * 0.95, 1.0 - uCover * 0.95 + 0.28, n);
    c *= smoothstep(-0.02, 0.12, h);
    float lit = clamp(0.5 + 0.5 * dot(normalize(vec3(uSunDir.x, 0.35, uSunDir.z)), normalize(vec3(d.x, 0.2, d.z))), 0.0, 1.0);
    vec3 cc = mix(uCloudDark, uCloudLit, lit * (1.0 - uStorm * 0.7));
    cc += uSunColor * pow(sd, 10.0) * 0.6 * uSunVis;
    sky = mix(sky, cc, c * 0.94);
  }
  // sun disk (hidden by clouds / overcast)
  float disk = smoothstep(0.99968, 0.99985, dot(d, uSunDir));
  sky += uSunColor * disk * 18.0 * uSunVis * (1.0 - uStorm);
  // below horizon
  sky = mix(sky, uHorizon * 0.82, smoothstep(0.0, -0.1, h));
  sky += vec3(0.7, 0.75, 0.95) * uFlash;
  gl_FragColor = vec4(sky, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Sky {
  mesh: THREE.Mesh;
  uniforms = {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSunColor: { value: new THREE.Color() },
    uCloudLit: { value: new THREE.Color(1, 1, 1) },
    uCloudDark: { value: new THREE.Color(0.5, 0.52, 0.56) },
    uCover: { value: 0.3 },
    uNight: { value: 0 },
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector2(1, 0) },
    uStorm: { value: 0 },
    uFlash: { value: 0 },
    uSunVis: { value: 1 },
  };
  constructor() {
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, depthTest: true });
    mat.name = "sky";
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -100;
    this.mesh.name = "sky";
  }
  follow(cam: THREE.Camera) { this.mesh.position.copy(cam.position); }
}
