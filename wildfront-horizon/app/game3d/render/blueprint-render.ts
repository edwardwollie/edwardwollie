// Blueprint line-art renderer. Pass 1 renders view-space normals + linear
// depth (skinning, instancing and alpha-cut foliage supported). Pass 2 detects
// silhouettes (depth discontinuities, scale-aware) and creases (normal
// discontinuities) and draws ink lines over a blueprint field, with a soft
// fill inside the object. Used by the Studio, the shot card and the book.

import * as THREE from "three";

const ND_VERT = /* glsl */`
#include <common>
#include <skinning_pars_vertex>
varying vec3 vN;
varying float vDepth;
varying vec2 vUv2;
void main() {
  vUv2 = uv;
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  vN = normalize(transformedNormal);
  vDepth = -mvPosition.z;
}`;
const ND_FRAG = /* glsl */`
uniform sampler2D map; uniform float uAlphaTest; uniform float uUseMap; uniform float uId;
varying vec3 vN; varying float vDepth; varying vec2 vUv2;
void main() {
  if (uUseMap > 0.5) { if (texture2D(map, vUv2).a < uAlphaTest) discard; }
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  gl_FragColor = vec4(n * 0.5 + 0.5 + uId * 0.0, vDepth);
}`;

const EDGE_VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const EDGE_FRAG = /* glsl */`
uniform sampler2D tND; uniform vec2 uTexel; uniform vec3 uBg; uniform vec3 uInk; uniform vec3 uFill; uniform float uFillAmt;
uniform float uDepthK; uniform float uNormalK; uniform float uThick; uniform float uGrid; uniform vec2 uRes; uniform float uGridAmt;
uniform float uBgAlpha; uniform float uOutSRGB; uniform float uFillAlpha;
vec3 wfToSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
varying vec2 vUv;
vec4 S(vec2 o) { return texture2D(tND, vUv + o * uTexel * uThick); }
void main() {
  vec4 c = S(vec2(0.0));
  float has = step(0.0001, c.a);
  float edge = 0.0;
  // silhouette: any neighbour empty while centre is filled (or vice versa)
  vec4 n1 = S(vec2(1, 0)), n2 = S(vec2(-1, 0)), n3 = S(vec2(0, 1)), n4 = S(vec2(0, -1));
  vec4 n5 = S(vec2(1, 1)), n6 = S(vec2(-1, -1)), n7 = S(vec2(-1, 1)), n8 = S(vec2(1, -1));
  float hs = step(0.0001, n1.a) + step(0.0001, n2.a) + step(0.0001, n3.a) + step(0.0001, n4.a);
  if (has > 0.5 && hs < 3.5) edge = 1.0;
  if (has < 0.5 && hs > 0.5) edge = 1.0;
  if (has > 0.5) {
    // depth Laplacian relative to depth (second derivative: steep faces don't band)
    float d = c.a;
    float lap = abs(n1.a + n2.a + n3.a + n4.a - 4.0 * d) / max(d, 1e-3);
    float lap2 = abs(n5.a + n6.a + n7.a + n8.a - 4.0 * d) / max(d, 1e-3);
    edge = max(edge, smoothstep(uDepthK, uDepthK * 2.5, max(lap, lap2 * 0.7)));
    // creases
    vec3 nc = c.rgb * 2.0 - 1.0;
    float nd = 0.0;
    nd = max(nd, 1.0 - dot(nc, n1.rgb * 2.0 - 1.0));
    nd = max(nd, 1.0 - dot(nc, n2.rgb * 2.0 - 1.0));
    nd = max(nd, 1.0 - dot(nc, n3.rgb * 2.0 - 1.0));
    nd = max(nd, 1.0 - dot(nc, n4.rgb * 2.0 - 1.0));
    edge = max(edge, smoothstep(uNormalK, uNormalK * 1.8, nd) * 0.85);
  }
  vec3 col = uBg;
  // drafting grid
  vec2 px = vUv * uRes;
  float g1 = max(step(fract(px.x / uGrid), 1.2 / uGrid), step(fract(px.y / uGrid), 1.2 / uGrid));
  float g2 = max(step(fract(px.x / (uGrid * 5.0)), 1.6 / (uGrid * 5.0)), step(fract(px.y / (uGrid * 5.0)), 1.6 / (uGrid * 5.0)));
  col = mix(col, uInk, (g1 * 0.06 + g2 * 0.1) * uGridAmt);
  // soft shaded fill inside the part
  if (has > 0.5) {
    vec3 nc = c.rgb * 2.0 - 1.0;
    float shade = 0.65 + 0.35 * dot(nc, normalize(vec3(-0.4, 0.6, 0.7)));
    col = mix(col, uFill * shade, uFillAmt);
  }
  col = mix(col, uInk, clamp(edge, 0.0, 1.0));
  float alpha = max(uBgAlpha, max(clamp(edge, 0.0, 1.0), has * uFillAlpha));
  gl_FragColor = vec4(col, alpha);
  if (uOutSRGB > 0.5) gl_FragColor.rgb = wfToSRGB(gl_FragColor.rgb);
  else {
  #include <colorspace_fragment>
  }
}`;

export interface BlueprintStyle { bg: THREE.Color; ink: THREE.Color; fill: THREE.Color; fillAmt: number; thick: number; grid: number; gridAmt: number; depthK: number; normalK: number; bgAlpha?: number; fillAlpha?: number }
export const STYLE_BLUEPRINT: BlueprintStyle = { bg: new THREE.Color(0.043, 0.18, 0.36), ink: new THREE.Color(0.92, 0.97, 1.0), fill: new THREE.Color(0.11, 0.32, 0.56), fillAmt: 0.55, thick: 1.0, grid: 24, gridAmt: 1, depthK: 0.035, normalK: 0.35 };
export const STYLE_PAPER: BlueprintStyle = { bg: new THREE.Color(0.97, 0.965, 0.94), ink: new THREE.Color(0.08, 0.12, 0.18), fill: new THREE.Color(0.86, 0.9, 0.94), fillAmt: 0.5, thick: 1.0, grid: 24, gridAmt: 0.5, depthK: 0.035, normalK: 0.35 };
/** Transparent background, cyan-white ink — for drawings placed on UI cards. */
export const STYLE_INK: BlueprintStyle = { bg: new THREE.Color(0.02, 0.09, 0.14), ink: new THREE.Color(0.62, 0.98, 0.92), fill: new THREE.Color(0.05, 0.22, 0.3), fillAmt: 0.42, thick: 1.0, grid: 24, gridAmt: 0, depthK: 0.035, normalK: 0.35, bgAlpha: 0, fillAlpha: 0.42 };
const srgb = (hex: string) => new THREE.Color().setStyle(hex);
/** Printed blueprint sheets: transparent around the part so the sheet's own grid shows; opaque fill inside. */
export const STYLE_SHEET: BlueprintStyle = { bg: srgb("#1f5c99"), ink: srgb("#f2f8ff"), fill: srgb("#3f80c2"), fillAmt: 0.55, thick: 1.0, grid: 24, gridAmt: 0, depthK: 0.035, normalK: 0.35, bgAlpha: 0, fillAlpha: 1 };
/** Paper sheets (survey maps, charts). */
export const STYLE_SHEET_PAPER: BlueprintStyle = { bg: srgb("#f6f2e7"), ink: srgb("#172334"), fill: srgb("#dfe6ee"), fillAmt: 0.6, thick: 1.0, grid: 24, gridAmt: 0, depthK: 0.035, normalK: 0.35, bgAlpha: 0, fillAlpha: 1 };

export class BlueprintRenderer {
  private r: THREE.WebGLRenderer;
  private rt: THREE.WebGLRenderTarget;
  private quad: THREE.Mesh;
  private qScene = new THREE.Scene();
  private qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private edgeMat: THREE.ShaderMaterial;
  private ndCache = new Map<THREE.Material, THREE.ShaderMaterial>();
  /** line weight / grid pitch multipliers (supersampled exports raise these) */
  thickScale = 1;
  gridScale = 1;
  constructor(renderer: THREE.WebGLRenderer) {
    this.r = renderer;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: true, samples: 0 });
    this.rt.texture.minFilter = THREE.NearestFilter; this.rt.texture.magFilter = THREE.NearestFilter;
    this.edgeMat = new THREE.ShaderMaterial({
      vertexShader: EDGE_VERT, fragmentShader: EDGE_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tND: { value: this.rt.texture }, uTexel: { value: new THREE.Vector2() }, uRes: { value: new THREE.Vector2() }, uBg: { value: new THREE.Color() }, uInk: { value: new THREE.Color() }, uFill: { value: new THREE.Color() }, uFillAmt: { value: 0.5 }, uDepthK: { value: 0.03 }, uNormalK: { value: 0.35 }, uThick: { value: 1 }, uGrid: { value: 24 }, uGridAmt: { value: 1 }, uBgAlpha: { value: 1 }, uOutSRGB: { value: 0 }, uFillAlpha: { value: 1 } },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.edgeMat);
    this.quad.frustumCulled = false;
    this.qScene.add(this.quad);
  }

  private ndMaterialFor(src: THREE.Material): THREE.ShaderMaterial {
    let m = this.ndCache.get(src);
    if (!m) {
      const s = src as THREE.MeshStandardMaterial;
      const useMap = !!(s.map && s.alphaTest > 0);
      m = new THREE.ShaderMaterial({ vertexShader: ND_VERT, fragmentShader: ND_FRAG, side: THREE.DoubleSide, uniforms: { map: { value: s.map ?? null }, uAlphaTest: { value: s.alphaTest || 0.5 }, uUseMap: { value: useMap ? 1 : 0 }, uId: { value: 0 } } });
      this.ndCache.set(src, m);
    }
    return m;
  }

  /** Draw `scene` through `camera` as line art into the current render target / viewport (w×h pixels). */
  render(scene: THREE.Scene, camera: THREE.Camera, w: number, h: number, style: BlueprintStyle = STYLE_BLUEPRINT, target: THREE.WebGLRenderTarget | null = null, viewport?: THREE.Vector4) {
    const r = this.r;
    const pr = r.getPixelRatio();
    const W = Math.max(1, Math.round(w * (target ? 1 : pr))), H = Math.max(1, Math.round(h * (target ? 1 : pr)));
    if (this.rt.width !== W || this.rt.height !== H) this.rt.setSize(W, H);
    // swap materials
    const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
    const hidden: THREE.Object3D[] = [];
    scene.traverse(o => {
      const mesh = o as THREE.Mesh;
      if ((o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite) { if (o.visible) { o.visible = false; hidden.push(o); } return; }
      if (!mesh.isMesh || !mesh.visible) return;
      if ((mesh.material as THREE.Material).userData?.blueprintSkip) { mesh.visible = false; hidden.push(mesh); return; }
      swapped.push([mesh, mesh.material]);
      mesh.material = this.ndMaterialFor(Array.isArray(mesh.material) ? mesh.material[0] : mesh.material);
    });
    const prevTarget = r.getRenderTarget();
    const prevClear = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
    const prevBg = scene.background; scene.background = null;
    const prevScissor = r.getScissorTest();
    r.setScissorTest(false);
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, true);
    const tm = r.toneMapping; r.toneMapping = THREE.NoToneMapping;
    r.render(scene, camera);
    r.toneMapping = tm;
    for (const [mesh, mat] of swapped) mesh.material = mat;
    for (const o of hidden) o.visible = true;
    scene.background = prevBg;
    // edge pass
    const U = this.edgeMat.uniforms;
    U.uTexel.value.set(1 / W, 1 / H); U.uRes.value.set(W, H);
    U.uBg.value.copy(style.bg); U.uInk.value.copy(style.ink); U.uFill.value.copy(style.fill); U.uFillAmt.value = style.fillAmt;
    U.uDepthK.value = style.depthK; U.uNormalK.value = style.normalK; U.uThick.value = style.thick * Math.max(1, W / 1400) * this.thickScale; U.uGrid.value = style.grid * Math.max(1, W / 1400) * this.gridScale; U.uGridAmt.value = style.gridAmt;
    U.uBgAlpha.value = style.bgAlpha ?? 1; U.uOutSRGB.value = target ? 1 : 0; U.uFillAlpha.value = style.fillAlpha ?? 1;
    r.setRenderTarget(target ?? prevTarget);
    if (viewport) { r.setViewport(viewport); r.setScissor(viewport); r.setScissorTest(true); }
    r.toneMapping = THREE.NoToneMapping;
    r.render(this.qScene, this.qCam);
    r.toneMapping = tm;
    r.setScissorTest(prevScissor);
    r.setClearColor(prevClear, prevAlpha);
  }
  dispose() { this.rt.dispose(); this.edgeMat.dispose(); for (const m of this.ndCache.values()) m.dispose(); }
}

/** Organ / vital-zone overlay meshes for an animal (x-ray drawings). */
export const ORGAN_COLORS: Record<string, string> = { brain: "#ffd75a", heart: "#ff4d5a", lungs: "#ff9fb0", liver: "#a8643c", stomach: "#8fbf5a", spine: "#e8e8e8" };
