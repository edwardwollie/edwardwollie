import * as THREE from "three";

/**
 * Blueprint-style rendering: white feature lines (from normal + depth edges) over a
 * blueprint-blue background with a drafting grid. Used by the in-game Blueprint
 * Studio and by the printable blueprint book generator.
 */
export interface BlueprintStyle {
  background: string;
  fill: string;
  line: string;
  grid: string;
  gridSize: number;
  lineWidth: number;
  transparentBackground?: boolean;
}

export const BLUEPRINT_STYLE: BlueprintStyle = {
  background: "#0d3b8e",
  fill: "#1f56b8",
  line: "#f4f8ff",
  grid: "#2a62c4",
  gridSize: 24,
  lineWidth: 1.25,
};

const vertex = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";
const fragment = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2 resolution;
uniform float lineWidth;
uniform vec3 bg;
uniform vec3 fill;
uniform vec3 lineColor;
uniform vec3 gridColor;
uniform float gridSize;
uniform float transparentBg;
uniform float depthRange;
uniform float worldPerPixel;
float depthAt(vec2 uv){ return texture2D(tDepth, uv).r; }
vec3 normalAt(vec2 uv){ return texture2D(tNormal, uv).rgb * 2.0 - 1.0; }
void main(){
  vec2 px = lineWidth / resolution;
  float d = depthAt(vUv);
  vec3 n = normalAt(vUv);
  float dl = depthAt(vUv - vec2(px.x, 0.0)), dr = depthAt(vUv + vec2(px.x, 0.0));
  float du = depthAt(vUv + vec2(0.0, px.y)), dd = depthAt(vUv - vec2(0.0, px.y));
  vec3 nl = normalAt(vUv - vec2(px.x, 0.0)), nr = normalAt(vUv + vec2(px.x, 0.0));
  vec3 nu = normalAt(vUv + vec2(0.0, px.y)), nd = normalAt(vUv - vec2(0.0, px.y));
  bool inside = d < 0.99999;
  bool anyInside = inside || dl < 0.99999 || dr < 0.99999 || du < 0.99999 || dd < 0.99999;
  // Second derivative of depth: large at real depth steps (one part in front of another),
  // ~0 on smooth or steep surfaces, so curved parts don't grow thick bands.
  float lap = (abs(dl + dr - 2.0 * d) + abs(du + dd - 2.0 * d)) * depthRange / (lineWidth * worldPerPixel);
  float silhouette = (inside != (dl < 0.99999)) || (inside != (dr < 0.99999)) || (inside != (du < 0.99999)) || (inside != (dd < 0.99999)) ? 1.0 : 0.0;
  float normalEdge = (length(nl - nr) + length(nu - nd));
  float edge = 0.0;
  if (anyInside) edge = max(silhouette, max(smoothstep(1.2, 2.6, lap), smoothstep(0.55, 0.95, normalEdge)));
  vec2 g = mod(gl_FragCoord.xy, gridSize);
  float gridLine = (g.x < 1.0 || g.y < 1.0) ? 1.0 : 0.0;
  vec2 g5 = mod(gl_FragCoord.xy, gridSize * 5.0);
  float majorLine = (g5.x < 1.5 || g5.y < 1.5) ? 1.0 : 0.0;
  vec3 col = bg;
  float alpha = transparentBg > 0.5 ? 0.0 : 1.0;
  col = mix(col, gridColor, max(gridLine * 0.55, majorLine * 0.9));
  if (inside) {
    float shade = 0.72 + 0.28 * clamp(n.z, 0.0, 1.0) + 0.08 * n.y;
    col = fill * shade;
    alpha = 1.0;
  }
  col = mix(col, lineColor, clamp(edge, 0.0, 1.0));
  if (edge > 0.0) alpha = max(alpha, edge);
  // uniforms are linear; write sRGB
  gl_FragColor = vec4(pow(max(col, vec3(0.0)), vec3(1.0 / 2.2)), alpha);
}`;

export class BlueprintRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private target: THREE.WebGLRenderTarget;
  private readonly normalMaterial = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
  private readonly quadScene = new THREE.Scene();
  private readonly quadCamera = new THREE.Camera();
  private readonly material: THREE.ShaderMaterial;
  style: BlueprintStyle;

  constructor(renderer: THREE.WebGLRenderer, style: BlueprintStyle = BLUEPRINT_STYLE) {
    this.renderer = renderer;
    this.style = style;
    this.target = this.makeTarget(2, 2);
    this.material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        tNormal: { value: null }, tDepth: { value: null }, resolution: { value: new THREE.Vector2(2, 2) }, lineWidth: { value: style.lineWidth },
        bg: { value: new THREE.Color(style.background) }, fill: { value: new THREE.Color(style.fill) }, lineColor: { value: new THREE.Color(style.line) },
        gridColor: { value: new THREE.Color(style.grid) }, gridSize: { value: style.gridSize }, transparentBg: { value: style.transparentBackground ? 1 : 0 }, depthRange: { value: 10 }, worldPerPixel: { value: 0.01 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
  }

  private makeTarget(width: number, height: number) {
    const target = new THREE.WebGLRenderTarget(width, height, { samples: 0, type: THREE.UnsignedByteType });
    target.depthTexture = new THREE.DepthTexture(width, height);
    target.depthTexture.type = THREE.FloatType;
    return target;
  }

  setStyle(style: Partial<BlueprintStyle>) {
    this.style = { ...this.style, ...style };
    const u = this.material.uniforms;
    u.bg.value.set(this.style.background);
    u.fill.value.set(this.style.fill);
    u.lineColor.value.set(this.style.line);
    u.gridColor.value.set(this.style.grid);
    u.gridSize.value = this.style.gridSize;
    u.lineWidth.value = this.style.lineWidth;
    u.transparentBg.value = this.style.transparentBackground ? 1 : 0;
  }

  /**
   * Renders `scene` from `camera` in blueprint style into the current render target
   * (or the canvas) inside the given viewport (CSS pixels, origin bottom-left).
   */
  render(scene: THREE.Scene, camera: THREE.Camera, viewport?: { x: number; y: number; width: number; height: number }, output: THREE.WebGLRenderTarget | null = null) {
    const renderer = this.renderer;
    const ratio = renderer.getPixelRatio();
    const size = renderer.getSize(new THREE.Vector2());
    const vp = viewport ?? { x: 0, y: 0, width: size.x, height: size.y };
    const w = Math.max(2, Math.round(vp.width * ratio)), h = Math.max(2, Math.round(vp.height * ratio));
    if (this.target.width !== w || this.target.height !== h) {
      this.target.dispose();
      this.target = this.makeTarget(w, h);
    }
    // Hide glass and effects for the line drawing.
    const hidden: THREE.Object3D[] = [];
    scene.traverse((node) => {
      if (node.visible && (node.userData.ghost || node.userData.fx || (node as THREE.Sprite).isSprite || (node as THREE.Points).isPoints)) {
        hidden.push(node);
        node.visible = false;
      }
    });
    const background = scene.background;
    const override = scene.overrideMaterial;
    const fog = scene.fog;
    scene.background = null;
    scene.fog = null;
    scene.overrideMaterial = this.normalMaterial;
    const previous = renderer.getRenderTarget();
    const autoClear = renderer.autoClear;
    const clearColor = renderer.getClearColor(new THREE.Color());
    const clearAlpha = renderer.getClearAlpha();
    const tone = renderer.toneMapping;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x8080ff, 1);
    renderer.clear(true, true, true);
    renderer.render(scene, camera);
    scene.overrideMaterial = override;
    scene.background = background;
    scene.fog = fog;
    for (const node of hidden) node.visible = true;
    // Composite
    const u = this.material.uniforms;
    u.tNormal.value = this.target.texture;
    u.tDepth.value = this.target.depthTexture;
    u.resolution.value.set(w, h);
    const ortho = camera as THREE.OrthographicCamera;
    if (ortho.isOrthographicCamera) {
      u.depthRange.value = ortho.far - ortho.near;
      u.worldPerPixel.value = (ortho.top - ortho.bottom) / ortho.zoom / h;
    } else {
      const persp = camera as THREE.PerspectiveCamera;
      u.depthRange.value = 0.0001;
      u.worldPerPixel.value = 1;
      void persp;
    }
    renderer.setRenderTarget(output ?? previous);
    renderer.setScissorTest(true);
    renderer.setViewport(vp.x, vp.y, vp.width, vp.height);
    renderer.setScissor(vp.x, vp.y, vp.width, vp.height);
    renderer.autoClear = false;
    renderer.render(this.quadScene, this.quadCamera);
    renderer.autoClear = autoClear;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, size.x, size.y);
    renderer.setClearColor(clearColor, clearAlpha);
    renderer.toneMapping = tone;
  }

  dispose() {
    this.target.dispose();
    this.material.dispose();
    this.normalMaterial.dispose();
  }
}
