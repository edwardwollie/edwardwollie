// Lakes and rivers: analytic ripple normals, Fresnel sky reflection with the
// sun glint, depth-based colour and soft shorelines sampled from the terrain
// height texture; optional planar reflection texture on high quality.

import * as THREE from "three";
import { ATMO, atmoGLSL, atmoUniforms } from "../render/atmosphere.ts";
import type { TerrainData } from "./terrain-gen.ts";

const VERT = /* glsl */`
varying vec3 vW; varying vec4 vClip;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vClip = projectionMatrix * viewMatrix * w;
  gl_Position = vClip;
}`;

const FRAG = /* glsl */`
uniform sampler2D uHeight; uniform float uTerrN; uniform float uTerrHalf; uniform float uTerrCell;
uniform float uTime; uniform vec2 uWind; uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uSunCol; uniform float uSunVis;
uniform vec3 uDeep; uniform vec3 uShallow; uniform float uWet;
uniform sampler2D uRefl; uniform float uUseRefl; uniform float uNight;
varying vec3 vW; varying vec4 vClip;
${atmoGLSL()}
float terrainH(vec2 p) {
  vec2 f = clamp((p + uTerrHalf) / uTerrCell, vec2(0.0), vec2(uTerrN - 1.001));
  ivec2 i = ivec2(floor(f)); vec2 t = fract(f);
  float a = texelFetch(uHeight, i, 0).r, b = texelFetch(uHeight, i + ivec2(1, 0), 0).r;
  float c = texelFetch(uHeight, i + ivec2(0, 1), 0).r, d = texelFetch(uHeight, i + ivec2(1, 1), 0).r;
  return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
}
vec2 wave(vec2 p, vec2 dir, float freq, float speed, float amp) {
  float ph = dot(p, dir) * freq + uTime * speed;
  return dir * cos(ph) * freq * amp;
}
float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
void main() {
  float ws = length(uWind) + 0.5;
  vec2 wd = normalize(uWind + vec2(0.001, 0.0));
  vec2 p = vW.xz;
  vec2 g = vec2(0.0);
  g += wave(p, wd, 0.55, 1.6, 0.05 * ws * 0.25);
  g += wave(p, normalize(wd + vec2(0.6, -0.4)), 1.3, 2.4, 0.02 * ws * 0.25);
  g += wave(p, normalize(wd + vec2(-0.7, 0.5)), 2.9, 3.6, 0.008 * ws * 0.3);
  g += wave(p, normalize(vec2(0.3, 1.0)), 5.7, 4.8, 0.004);
  // rain ripples
  vec2 cell = floor(p * 1.6); vec2 fp = fract(p * 1.6) - 0.5;
  float rt = fract(uTime * 0.9 + h21(cell));
  float ring = sin((length(fp) - rt * 0.5) * 40.0) * (1.0 - rt) * step(length(fp), rt * 0.5);
  g += fp * ring * 0.6 * uWet;
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 V = normalize(cameraPosition - vW);
  float NdV = max(dot(N, V), 0.0);
  float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
  vec3 R = reflect(-V, N);
  vec3 skyR = mix(uHor, uZen, pow(clamp(R.y, 0.0, 1.0), 0.5));
  if (uUseRefl > 0.5) {
    vec2 suv = vClip.xy / vClip.w * 0.5 + 0.5;
    suv.x = 1.0 - suv.x;
    suv += N.xz * 0.03;
    vec3 rc = texture2D(uRefl, suv).rgb;
    skyR = mix(skyR, rc, 0.85);
  }
  float spec = pow(max(dot(R, normalize(uSunDir)), 0.0), 420.0) * 9.0 + pow(max(dot(R, normalize(uSunDir)), 0.0), 40.0) * 0.25;
  float depth = max(0.0, vW.y - terrainH(p));
  vec3 body = mix(uShallow, uDeep, 1.0 - exp(-depth * 0.55));
  body *= 0.55 + 0.45 * (1.0 - uNight);
  vec3 col = mix(body, skyR, F) + uSunCol * spec * uSunVis;
  float foam = (1.0 - smoothstep(0.03, 0.22, depth)) * (0.55 + 0.45 * sin(uTime * 1.3 + p.x * 3.0 + p.y * 2.0));
  col = mix(col, vec3(0.85, 0.88, 0.86), foam * 0.35);
  float alpha = smoothstep(0.0, 0.35, depth) * 0.92 + F * 0.08;
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb = applyAtmosphere(gl_FragColor.rgb, vW);   // same order as the patched world materials
}`;

export class Water {
  group = new THREE.Group();
  uniforms: Record<string, THREE.IUniform>;
  material: THREE.ShaderMaterial;
  constructor(t: TerrainData, hTex: THREE.Texture, colors: { deep: THREE.Color; shallow: THREE.Color }) {
    this.group.name = "water";
    this.uniforms = {
      ...atmoUniforms(),
      uHeight: { value: hTex }, uTerrN: { value: t.n }, uTerrHalf: { value: t.half }, uTerrCell: { value: t.cell },
      uTime: ATMO.uTime, uWind: ATMO.uWind, uWet: ATMO.uWet,
      uZen: { value: new THREE.Color(0.2, 0.4, 0.8) }, uHor: { value: new THREE.Color(0.6, 0.7, 0.8) },
      uSunCol: { value: new THREE.Color(1, 0.9, 0.7) }, uSunVis: { value: 1 }, uNight: { value: 0 },
      uDeep: { value: colors.deep }, uShallow: { value: colors.shallow },
      uRefl: { value: null }, uUseRefl: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, transparent: true, depthWrite: false });
    this.material.name = "water";
    for (const L of t.lakes) {
      const g = new THREE.CircleGeometry(1, 96);
      g.rotateX(-Math.PI / 2);
      g.scale(L.rx * 1.28, 1, L.rz * 1.28);
      g.rotateY(-L.rot);
      const m = new THREE.Mesh(g, this.material);
      m.position.set(L.x, L.level, L.z);
      m.renderOrder = 2;
      m.name = `lake:${L.name ?? ""}`;
      this.group.add(m);
    }
    for (const rv of t.rivers) {
      const pos: number[] = [], idx: number[] = [];
      const pts = rv.pts;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        const nx = -dz, nz = dx, hw = rv.width * 0.75;
        pos.push(pts[i][0] + nx * hw, pts[i][2], pts[i][1] + nz * hw, pts[i][0] - nx * hw, pts[i][2], pts[i][1] - nz * hw);
        if (i > 0) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, this.material);
      m.renderOrder = 2;
      m.name = `river:${rv.name ?? ""}`;
      this.group.add(m);
    }
  }
  sync(sky: { uZenith: { value: THREE.Color }; uHorizon: { value: THREE.Color }; uSunColor: { value: THREE.Color }; uSunVis: { value: number }; uNight: { value: number } }) {
    (this.uniforms.uZen.value as THREE.Color).copy(sky.uZenith.value);
    (this.uniforms.uHor.value as THREE.Color).copy(sky.uHorizon.value);
    (this.uniforms.uSunCol.value as THREE.Color).copy(sky.uSunColor.value);
    this.uniforms.uSunVis.value = sky.uSunVis.value;
    this.uniforms.uNight.value = sky.uNight.value;
  }
}
