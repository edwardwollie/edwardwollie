// GPU grass: a fixed set of instanced clumps that wrap around the camera
// (stable in world space), height-sampled from the terrain texture, density
// and tint from the surface maps. Wind waves roll across meadows; blades bend
// away from the hunter. Flowers bloom in meadows.

import * as THREE from "three";
import { mulberry32 } from "../core/rng.ts";
import { ATMO, atmoGLSL, atmoUniforms } from "../render/atmosphere.ts";
import type { TerrainData } from "./terrain-gen.ts";

const VERT = /* glsl */`
precision highp float;
attribute vec2 aOff;
attribute vec4 aRnd;
uniform sampler2D uHeight; uniform sampler2D uSurf; uniform sampler2D uTint;
uniform float uTerrN; uniform float uTerrHalf; uniform float uTerrCell;
uniform vec3 uCam; uniform float uRadius; uniform float uTime; uniform vec2 uWind; uniform vec3 uPlayer;
uniform float uGrassH; uniform float uSnow; uniform vec3 uFlower0; uniform vec3 uFlower1; uniform vec3 uFlower2;
varying vec3 vCol; varying vec3 vW; varying float vY; varying vec3 vN;
float terrainH(vec2 p) {
  vec2 f = clamp((p + uTerrHalf) / uTerrCell, vec2(0.0), vec2(uTerrN - 1.001));
  ivec2 i = ivec2(floor(f)); vec2 t = fract(f);
  float a = texelFetch(uHeight, i, 0).r, b = texelFetch(uHeight, i + ivec2(1, 0), 0).r;
  float c = texelFetch(uHeight, i + ivec2(0, 1), 0).r, d = texelFetch(uHeight, i + ivec2(1, 1), 0).r;
  return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
}
void main() {
  float R = uRadius;
  vec2 o = aOff * 2.0 * R;
  vec2 p = uCam.xz + (mod(o - uCam.xz + R, 2.0 * R) - R);
  vec2 uv = (p + uTerrHalf) / (2.0 * uTerrHalf);
  vec4 surf = texture2D(uSurf, uv);
  float dens = surf.r;
  float dist = length(p - uCam.xz);
  float fade = 1.0 - smoothstep(R * 0.62, R * 0.98, dist);
  float alive = step(aRnd.x, dens) * fade;
  float h = (0.42 + 0.58 * aRnd.y) * uGrassH * (0.55 + 0.45 * dens) * (1.0 + surf.g * 0.35) * alive;
  float ang = aRnd.z * 6.2831853;
  float ca = cos(ang), sa = sin(ang);
  vec3 lp = position;
  vec3 rp = vec3(lp.x * ca - lp.z * sa, lp.y, lp.x * sa + lp.z * ca);
  float y = lp.y;
  // wind: base lean + gust waves rolling downwind
  float ws = length(uWind);
  vec2 wd = ws > 0.01 ? uWind / ws : vec2(1.0, 0.0);
  float wave = sin(dot(p, wd) * 0.18 - uTime * (1.4 + ws * 0.12)) * 0.5 + 0.5;
  float flutter = sin(uTime * 4.3 + aRnd.w * 30.0 + p.x * 0.7) * 0.25;
  float bend = (0.12 + ws * 0.035) * (0.35 + 0.65 * wave) + flutter * 0.08;
  vec2 off = wd * bend * y * y * h;
  // hunter pushes blades aside
  vec2 dp = p - uPlayer.xz; float dl = length(dp);
  off += (dl > 0.01 ? dp / dl : vec2(0.0)) * (1.0 - smoothstep(0.25, 1.1, dl)) * 0.55 * y * h * step(abs(uPlayer.y - terrainH(p)), 2.5);
  vec3 wpos = vec3(p.x + rp.x * (0.6 + 0.4 * h) + off.x, terrainH(p) + y * h, p.y + rp.z * (0.6 + 0.4 * h) + off.y);
  vW = wpos; vY = y;
  vec3 tint = texture2D(uTint, uv).rgb; tint *= tint;
  vec3 base = tint * (0.32 + 0.68 * y) * (0.82 + 0.36 * aRnd.w);
  base = mix(base, base * vec3(1.25, 1.12, 0.62) + vec3(0.03, 0.02, 0.0), smoothstep(0.55, 1.0, y) * (0.25 + 0.5 * aRnd.y));
  base *= 1.0 - surf.b * 0.35;
  // flowers in meadows
  float isFlower = step(0.955, aRnd.w) * step(0.15, surf.g) * step(0.82, y);
  vec3 fc = aRnd.y < 0.33 ? uFlower0 : (aRnd.y < 0.66 ? uFlower1 : uFlower2);
  base = mix(base, fc, isFlower);
  base = mix(base, vec3(0.82, 0.85, 0.9), uSnow * 0.7);
  vCol = base;
  vN = normalize(vec3(-off.x * 2.0, 1.0, -off.y * 2.0));
  gl_Position = projectionMatrix * viewMatrix * vec4(wpos, 1.0);
}`;

const FRAG = /* glsl */`
uniform vec3 uSunCol; uniform vec3 uSky; uniform vec3 uGround;
varying vec3 vCol; varying vec3 vW; varying float vY; varying vec3 vN;
${atmoGLSL()}
void main() {
  vec3 L = normalize(uSunDir);
  float wrap = 0.45 + 0.55 * max(dot(vN, L), 0.0);
  vec3 V = normalize(cameraPosition - vW);
  float trans = pow(max(dot(-V, L), 0.0), 4.0) * vY * 0.6;
  vec3 light = uSky * (0.55 + 0.45 * vY) + uGround * 0.25 + uSunCol * (wrap * 0.55 + trans);
  vec3 col = vCol * light;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  // fog goes on after tone mapping, exactly like the patched world materials (terrain, trees,
  // wildlife), so grass fades into the same haze instead of glowing brighter than its ground
  gl_FragColor.rgb = applyAtmosphere(gl_FragColor.rgb, vW);
}`;

function clumpGeometry(rnd: () => number, blades = 5): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  for (let b = 0; b < blades; b++) {
    const a = rnd() * Math.PI * 2, r = rnd() * 0.12;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    const ra = rnd() * Math.PI, ca = Math.cos(ra), sa = Math.sin(ra);
    const lean = (rnd() - 0.5) * 0.35, hh = 0.75 + rnd() * 0.25, w = 0.035 + rnd() * 0.02;
    const rows = [[0, w], [0.38, w * 0.82], [0.72, w * 0.5], [1, 0]];
    const base = pos.length / 3;
    rows.forEach(([y, hw], i) => {
      const yy = y * hh, lx = lean * y * y;
      if (i < 3) {
        pos.push(cx + (-hw) * ca + lx * sa, yy, cz + (-hw) * sa - lx * ca);
        pos.push(cx + hw * ca + lx * sa, yy, cz + hw * sa - lx * ca);
      } else pos.push(cx + lx * sa, yy, cz - lx * ca);
    });
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4, base + 3, base + 5, base + 4, base + 4, base + 5, base + 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

export class Grass {
  mesh: THREE.Mesh;
  uniforms: Record<string, THREE.IUniform>;
  constructor(t: TerrainData, hTex: THREE.Texture, sTex: THREE.Texture, tintTex: THREE.Texture, opts: { count: number; radius: number; grassH: number; flowers: [number, number, number][] }) {
    const rnd = mulberry32(t.def.seed + 777);
    const clump = clumpGeometry(rnd);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = clump.index;
    geo.setAttribute("position", clump.getAttribute("position"));
    const off = new Float32Array(opts.count * 2), rr = new Float32Array(opts.count * 4);
    for (let i = 0; i < opts.count; i++) {
      off[i * 2] = rnd(); off[i * 2 + 1] = rnd();
      rr[i * 4] = rnd(); rr[i * 4 + 1] = rnd(); rr[i * 4 + 2] = rnd(); rr[i * 4 + 3] = rnd();
    }
    geo.setAttribute("aOff", new THREE.InstancedBufferAttribute(off, 2));
    geo.setAttribute("aRnd", new THREE.InstancedBufferAttribute(rr, 4));
    geo.instanceCount = opts.count;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const f = opts.flowers.concat(opts.flowers, opts.flowers);
    this.uniforms = {
      ...atmoUniforms(),
      uHeight: { value: hTex }, uSurf: { value: sTex }, uTint: { value: tintTex },
      uTerrN: { value: t.n }, uTerrHalf: { value: t.half }, uTerrCell: { value: t.cell },
      uCam: { value: new THREE.Vector3() }, uRadius: { value: opts.radius }, uTime: ATMO.uTime, uWind: ATMO.uWind,
      uPlayer: { value: new THREE.Vector3(1e5, 0, 0) }, uGrassH: { value: opts.grassH }, uSnow: ATMO.uSnow,
      uFlower0: { value: new THREE.Color(...f[0]) }, uFlower1: { value: new THREE.Color(...f[1]) }, uFlower2: { value: new THREE.Color(...f[2]) },
      uSunCol: { value: new THREE.Color(1, 1, 1) }, uSky: { value: new THREE.Color(0.6, 0.7, 0.8) }, uGround: { value: new THREE.Color(0.2, 0.18, 0.15) },
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, side: THREE.DoubleSide });
    mat.name = "grass";
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.name = "grass";
  }
  update(cam: THREE.Vector3, player: THREE.Vector3, sun: THREE.DirectionalLight, hemi: THREE.HemisphereLight) {
    (this.uniforms.uCam.value as THREE.Vector3).copy(cam);
    (this.uniforms.uPlayer.value as THREE.Vector3).copy(player);
    (this.uniforms.uSunCol.value as THREE.Color).copy(sun.color).multiplyScalar(sun.intensity * 0.42);
    (this.uniforms.uSky.value as THREE.Color).copy(hemi.color).multiplyScalar(hemi.intensity * 0.75);
    (this.uniforms.uGround.value as THREE.Color).copy(hemi.groundColor).multiplyScalar(hemi.intensity);
  }
}

/** Grass tint texture (linear RGB) matching the terrain grass colours. */
export function grassTintTexture(geo: THREE.BufferGeometry, n: number): THREE.DataTexture {
  const a = geo.getAttribute("aGrass") as THREE.BufferAttribute;
  const m = Math.round(Math.sqrt(a.count));
  const data = new Uint8Array(m * m * 4);
  for (let i = 0; i < m * m; i++) {
    data[i * 4] = Math.min(255, Math.round(Math.sqrt(a.getX(i)) * 255));
    data[i * 4 + 1] = Math.min(255, Math.round(Math.sqrt(a.getY(i)) * 255));
    data[i * 4 + 2] = Math.min(255, Math.round(Math.sqrt(a.getZ(i)) * 255));
    data[i * 4 + 3] = 255;
  }
  void n;
  const t = new THREE.DataTexture(data, m, m, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
