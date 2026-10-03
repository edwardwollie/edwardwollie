// Off-screen blueprint drawings for the UI: contract cards, the field guide,
// the shot-analysis card, trophy cards and the gear locker all show line art
// generated live from the same blueprints the game models are built from.
// Renders into a render target on the game's renderer, reads it back and
// returns a PNG data URL plus a projection for overlay graphics (bullet paths,
// organ outlines, dimension lines).

import * as THREE from "three";
import { BlueprintRenderer, STYLE_BLUEPRINT, STYLE_INK, STYLE_PAPER, STYLE_SHEET, STYLE_SHEET_PAPER, type BlueprintStyle } from "./blueprint-render.ts";
import { fitOrthoCamera, viewAxes, type ViewName } from "./views.ts";
import { buildBlueprintObject, type BuildOpts } from "../models/registry.ts";
import { WILDLIFE_BY_ID } from "../blueprints/wildlife/index.ts";
import type { V3 } from "../blueprints/types.ts";

export type SnapStyle = "blueprint" | "paper" | "ink" | "shaded" | "sheet" | "sheetPaper";

export interface SnapOpts extends BuildOpts {
  view: ViewName;
  w: number; h: number;          // output size (px)
  style?: SnapStyle;
  margin?: number;
  ss?: number;                   // supersampling factor (default 2)
  /** fixed half-height of the ortho frame (m) so several drawings share a scale */
  halfHeight?: number;
  /** skip PNG encoding (sheet compositing uses the canvas) */
  noUrl?: boolean;
  /** frame on this box instead of the model's own bounds (gait strips share one frame) */
  frameBox?: [number, number, number, number, number, number];
  /** line weight multiplier (printed sheets use heavier lines) */
  thick?: number;
}

export interface SnapEllipse { id: string; cx: number; cy: number; rx: number; ry: number }

export interface Snap {
  url: string;
  /** the drawing itself (for compositing onto sheets) */
  canvas: HTMLCanvasElement;
  w: number; h: number;
  /** model (root-local) point → output pixel */
  project: (p: V3) => [number, number];
  /** metres per output pixel */
  mPerPx: number;
  box: THREE.Box3;
  /** organ outlines (wildlife only), output pixels */
  organs: SnapEllipse[];
  vital: SnapEllipse | null;
  info: string;
}

const BLIT_VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BLIT_FRAG = /* glsl */`
uniform sampler2D tSrc; uniform float uExposure; varying vec2 vUv;
vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 aces(vec3 color) {
  const mat3 ACESInputMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 ACESOutputMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color *= uExposure / 0.6;
  color = ACESInputMat * color; color = RRTAndODTFit(color); color = ACESOutputMat * color;
  return clamp(color, 0.0, 1.0);
}
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() { vec4 s = texture2D(tSrc, vUv); vec3 c = s.a > 0.0 ? s.rgb / max(s.a, 1e-4) : s.rgb; gl_FragColor = vec4(toSRGB(aces(c)), s.a); }`;

function styleFor(s: SnapStyle): BlueprintStyle { return s === "paper" ? STYLE_PAPER : s === "ink" ? STYLE_INK : s === "sheet" ? STYLE_SHEET : s === "sheetPaper" ? STYLE_SHEET_PAPER : STYLE_BLUEPRINT; }

export class Snapshotter {
  private r: THREE.WebGLRenderer;
  private bp: BlueprintRenderer;
  private cache = new Map<string, Promise<Snap>>();
  private blit: { scene: THREE.Scene; cam: THREE.OrthographicCamera; mat: THREE.ShaderMaterial };
  constructor(renderer: THREE.WebGLRenderer) {
    this.r = renderer;
    this.bp = new BlueprintRenderer(renderer);
    const mat = new THREE.ShaderMaterial({ vertexShader: BLIT_VERT, fragmentShader: BLIT_FRAG, uniforms: { tSrc: { value: null }, uExposure: { value: 1.05 } }, depthTest: false, depthWrite: false });
    const scene = new THREE.Scene();
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); q.frustumCulled = false; scene.add(q);
    this.blit = { scene, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), mat };
  }

  /** Cached drawing of any blueprint (wildlife, gear, structure, flora). */
  private queue: Promise<unknown> = Promise.resolve();
  get(id: string, o: SnapOpts): Promise<Snap> {
    const key = JSON.stringify([id, o]);
    let p = this.cache.get(key);
    if (!p) {
      // one drawing at a time, yielding to the browser between jobs
      p = this.queue.then(() => new Promise(r => setTimeout(r, 0))).then(() => this.make(id, o));
      this.queue = p.catch(() => undefined);
      this.cache.set(key, p);
      p.catch(() => this.cache.delete(key));
    }
    return p;
  }

  private async make(id: string, o: SnapOpts): Promise<Snap> {
    const built = await buildBlueprintObject(id, o);
    const style = o.style ?? "ink";
    const ss = o.ss ?? 2;
    const W = Math.round(o.w * ss), H = Math.round(o.h * ss);
    const scene = new THREE.Scene();
    scene.add(built.object);
    built.object.updateMatrixWorld(true);
    const box = built.box ?? new THREE.Box3().setFromObject(built.object);
    const frame = o.frameBox ? new THREE.Box3(new THREE.Vector3(o.frameBox[0], o.frameBox[1], o.frameBox[2]), new THREE.Vector3(o.frameBox[3], o.frameBox[4], o.frameBox[5])) : box;
    const cam = new THREE.OrthographicCamera();
    const fit = fitOrthoCamera(cam, frame, o.view, W / H, o.margin ?? 0.08, o.halfHeight);
    const r = this.r;
    // ---- save renderer state
    const prevTarget = r.getRenderTarget();
    const prevClear = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
    const prevScissor = r.getScissorTest();
    const prevAuto = r.autoClear;
    const vp = r.getViewport(new THREE.Vector4());
    const out = new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: true });
    try {
      if (style === "shaded") {
        scene.add(new THREE.HemisphereLight(0xe4eeff, 0x5a4a38, 1.35));
        const key = new THREE.DirectionalLight(0xfff0dc, 2.6); key.position.copy(cam.position).add(new THREE.Vector3(2, 6, 3)); scene.add(key);
        const rim = new THREE.DirectionalLight(0xb8d0ff, 1.1); rim.position.set(-4, 3, -5); scene.add(rim);
        const hdr = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: true, samples: 4 });
        r.setRenderTarget(hdr); r.setScissorTest(false); r.setClearColor(0x000000, 0); r.clear(true, true, true);
        r.render(scene, cam);
        this.blit.mat.uniforms.tSrc.value = hdr.texture;
        r.setRenderTarget(out); r.setClearColor(0x000000, 0); r.clear(true, true, true);
        r.render(this.blit.scene, this.blit.cam);
        hdr.dispose();
      } else {
        // constant line weight in output pixels, whatever the drawing size
        this.bp.thickScale = ss * 0.9 * (o.thick ?? 1) / Math.max(1, W / 1400);
        this.bp.gridScale = ss / Math.max(1, W / 1400);
        this.bp.render(scene, cam, W, H, styleFor(style), out);
        this.bp.thickScale = 1; this.bp.gridScale = 1;
      }
      const px = new Uint8Array(W * H * 4);
      r.readRenderTargetPixels(out, 0, 0, W, H, px);
      // flip rows into an ImageData
      const big = document.createElement("canvas"); big.width = W; big.height = H;
      const g = big.getContext("2d")!;
      const img = g.createImageData(W, H);
      for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
      g.putImageData(img, 0, 0);
      const small = document.createElement("canvas"); small.width = o.w; small.height = o.h;
      const sg = small.getContext("2d")!;
      sg.imageSmoothingEnabled = true; sg.imageSmoothingQuality = "high";
      sg.drawImage(big, 0, 0, o.w, o.h);
      const url = o.noUrl ? "" : small.toDataURL("image/png");
      // ---- projection & organ outlines
      const rootM = built.object.matrixWorld.clone();
      const project = (p: V3): [number, number] => {
        const v = new THREE.Vector3(...p).applyMatrix4(rootM).project(cam);
        return [(v.x + 1) / 2 * o.w, (1 - v.y) / 2 * o.h];
      };
      const mPerPx = (fit.halfHeight * 2) / o.h;
      const organs: SnapEllipse[] = [];
      let vital: SnapEllipse | null = null;
      const bp = WILDLIFE_BY_ID[id];
      if (bp) {
        const [right, up] = viewAxes(o.view);
        const s = built.object.scale.x;
        const ell = (eid: string, boneName: string, c: V3, rad: V3): SnapEllipse | null => {
          const bone = built.object.getObjectByName(boneName) as THREE.Bone | undefined;
          const rest = bp.bones.find(b => b.name === boneName);
          let world: THREE.Vector3;
          if (bone && rest) world = new THREE.Vector3(c[0] - rest.p[0], c[1] - rest.p[1], c[2] - rest.p[2]).applyMatrix4(bone.matrixWorld);
          else world = new THREE.Vector3(...c).applyMatrix4(rootM);
          const v = world.clone().project(cam);
          const rx = Math.abs(right.x) * rad[0] + Math.abs(right.y) * rad[1] + Math.abs(right.z) * rad[2];
          const ry = Math.abs(up.x) * rad[0] + Math.abs(up.y) * rad[1] + Math.abs(up.z) * rad[2];
          return { id: eid, cx: (v.x + 1) / 2 * o.w, cy: (1 - v.y) / 2 * o.h, rx: rx * s / mPerPx, ry: ry * s / mPerPx };
        };
        for (const org of bp.organs) { const e = ell(org.id, org.bone, org.c, org.r); if (e) organs.push(e); }
        vital = ell("vital", bp.vitalRegion.bone, bp.vitalRegion.c, bp.vitalRegion.r);
      }
      return { url, canvas: small, w: o.w, h: o.h, project, mPerPx, box, organs, vital, info: built.info ?? "" };
    } finally {
      out.dispose();
      r.setRenderTarget(prevTarget);
      r.setViewport(vp);
      r.setScissorTest(prevScissor);
      r.setClearColor(prevClear, prevAlpha);
      r.autoClear = prevAuto;
      scene.traverse(ob => { const m = ob as THREE.Mesh; if (m.isMesh && m.geometry) m.geometry.dispose(); });
    }
  }

  dispose() { this.bp.dispose(); this.cache.clear(); }
}
