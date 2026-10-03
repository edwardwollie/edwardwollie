// Blueprint Studio / viewer mode. Shows any blueprint as live line art (blue
// drafting film or paper), shaded, x-ray (organs and the GREAT vital region
// riding on their bones) or as a lit trophy mount. Standard orthographic views
// with dimension lines, a free orbit view, animated gaits for wildlife and
// exploded views for assemblies. The subject is framed inside a screen
// rectangle supplied by the UI so panels can sit around it.

import * as THREE from "three";
import type { Mode } from "../engine/host.ts";
import { BlueprintRenderer, ORGAN_COLORS, STYLE_BLUEPRINT, STYLE_PAPER } from "../render/blueprint-render.ts";
import { fitOrthoCamera, projectedExtent, viewAxes, type ViewName } from "../render/views.ts";
import { WILDLIFE_BY_ID } from "../blueprints/wildlife/index.ts";
import { GEAR_BY_ID } from "../blueprints/gear.ts";
import { STRUCTURES_BY_ID } from "../blueprints/structures.ts";
import { FLORA_BY_ID } from "../blueprints/flora.ts";
import type { AssemblyBlueprint } from "../blueprints/assembly.ts";
import { createAnimalObject, type AnimalObject } from "../models/animal-mesh.ts";
import { AnimalAnimator, newPose, type AnimPose } from "../sim/animal-anim.ts";
import { buildAssembly } from "../models/assembly-builder.ts";
import { buildFlora } from "../models/flora-builder.ts";
import { plainFloraMaterial } from "../world/vegetation.ts";
import { disposeObject } from "../engine/dispose.ts";

export type StudioStyle = "lines" | "paper" | "shaded" | "xray" | "trophy";
export type StudioView = ViewName | "orbit";
export type StudioPose = "rest" | "walk" | "trot" | "gallop" | "stot" | "graze" | "alert" | "bed" | "look";
export interface SubjectSpec { id: string; sex?: "male" | "female"; age?: number; seed?: number; individual?: boolean }
export interface DimLine { x0: number; y0: number; x1: number; y1: number; label: string; value: number; kind: "h" | "v"; ox: number; oy: number }

interface Subject {
  spec: SubjectSpec;
  kind: string;
  root: THREE.Object3D;
  box: THREE.Box3;
  animal?: AnimalObject;
  assembly?: AssemblyBlueprint;
  organs: { mesh: THREE.Mesh; bone: THREE.Object3D; offset: THREE.Vector3 }[];
  info: string;
}

const tmpM = new THREE.Matrix4();

export class StudioMode implements Mode {
  scene = new THREE.Scene();
  private organScene = new THREE.Scene();
  persp = new THREE.PerspectiveCamera(30, 1, 0.02, 600);
  ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 200);
  view: StudioView = "orbit";
  style: StudioStyle = "lines";
  /** framing rectangle in canvas CSS pixels */
  rect = { x: 0, y: 0, w: 1, h: 1 };
  /** padding inside the rect kept clear of the subject (toolbars, title block) */
  pad = { top: 0, right: 0, bottom: 0, left: 0 };
  canvas: [number, number] = [1, 1];
  yaw = 0.8; pitch = 0.2; zoom = 1;
  autoRotate = true;
  rotateSpeed = 0.18;
  private idle = 0;
  pose: StudioPose = "rest";
  animate = true;
  explode = 0;
  showOrganLabels = true;
  subject: Subject | null = null;
  loading = false;
  private animator: AnimalAnimator | null = null;
  private animPose: AnimPose | null = null;
  private bp: BlueprintRenderer;
  private token = 0;
  private lights: THREE.Group;
  private ground: THREE.Mesh;
  private plinth: THREE.Group;
  private fitInfo = { cx: 0, cy: 0, k: 1, axes: viewAxes("left") };
  private bgShaded = new THREE.Color(0x15232e);
  private bgTrophy = new THREE.Color(0x120d0a);
  onLoaded?: (s: Subject) => void;

  constructor(renderer: THREE.WebGLRenderer) {
    this.bp = new BlueprintRenderer(renderer);
    this.lights = new THREE.Group();
    const hemi = new THREE.HemisphereLight(0xdfeaff, 0x3a3228, 1.2);
    const key = new THREE.DirectionalLight(0xfff0dc, 2.4);
    key.position.set(4, 7, 5); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera as THREE.OrthographicCamera; sc.left = -6; sc.right = 6; sc.top = 6; sc.bottom = -6; sc.near = 0.5; sc.far = 40;
    key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
    const rim = new THREE.DirectionalLight(0xbcd4ff, 1.0); rim.position.set(-5, 3, -4);
    const spot = new THREE.SpotLight(0xffd9a8, 0, 40, 0.55, 0.65, 1.0); spot.position.set(2, 9, 4); spot.name = "spot";
    this.lights.add(hemi, key, key.target, rim, spot, spot.target);
    this.scene.add(this.lights);
    // shadow catcher + drafting grid for the shaded style
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.32 }));
    this.ground.rotation.x = -Math.PI / 2; this.ground.receiveShadow = true;
    (this.ground.material as THREE.Material).userData.blueprintSkip = true;
    this.scene.add(this.ground);
    const grid = new THREE.GridHelper(40, 80, 0x3d6f86, 0x24414f);
    (grid.material as THREE.Material).transparent = true; (grid.material as THREE.Material).opacity = 0.5;
    grid.name = "grid"; this.scene.add(grid);
    // trophy plinth (walnut base + brass plate)
    this.plinth = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x2e1a0e, roughness: 0.62, metalness: 0 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a14a, roughness: 0.3, metalness: 0.9 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.05, 0.12, 64), wood); base.position.y = -0.06; base.receiveShadow = true;
    const lip = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.012, 8, 96), brass); lip.rotation.x = Math.PI / 2; lip.position.y = 0.0;
    wood.userData.blueprintSkip = true; brass.userData.blueprintSkip = true;
    this.plinth.add(base, lip); this.plinth.visible = false;
    this.scene.add(this.plinth);
  }

  // ------------------------------------------------------------------ subject
  async load(spec: SubjectSpec): Promise<Subject | null> {
    const my = ++this.token;
    this.loading = true;
    const s = await this.build(spec);
    if (my !== this.token) { if (s) disposeObject(s.root); return null; }
    if (this.subject) { this.scene.remove(this.subject.root); disposeObject(this.subject.root); for (const o of this.subject.organs) this.organScene.remove(o.mesh); }
    this.subject = s;
    this.loading = false;
    if (s) {
      this.scene.add(s.root);
      for (const o of s.organs) this.organScene.add(o.mesh);
      this.setPose(this.pose);
      this.fitGround();
      this.onLoaded?.(s);
    }
    return s;
  }

  private async build(spec: SubjectSpec): Promise<Subject | null> {
    const wl = WILDLIFE_BY_ID[spec.id];
    if (wl) {
      const sex = spec.sex ?? "male";
      const a = createAnimalObject(wl, { sex, age: spec.age ?? 1, seed: spec.seed ?? 1, scale: spec.individual ? undefined : 1 });
      a.root.updateMatrixWorld(true);
      const b = a.build.bbox, s = a.root.scale.x;
      const box = new THREE.Box3(new THREE.Vector3(b.min[0] * s, b.min[1] * s, b.min[2] * s), new THREE.Vector3(b.max[0] * s, b.max[1] * s, b.max[2] * s));
      // organs + vital region (x-ray)
      const organs: Subject["organs"] = [];
      const add = (id: string, boneName: string, c: number[], r: number[], color: string, wire: boolean) => {
        const bone = a.bones[boneName];
        const rest = a.build.bones.find(x => x.name === boneName);
        if (!bone || !rest) return;
        const mat = wire
          ? new THREE.MeshBasicMaterial({ color: new THREE.Color(color), wireframe: true, transparent: true, opacity: 0.45, depthTest: false, depthWrite: false })
          : new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.72, depthTest: false, depthWrite: false });
        const m = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), mat);
        m.matrixAutoUpdate = false;
        m.userData.scale = new THREE.Vector3(r[0], r[1], r[2]);
        m.name = id;
        m.renderOrder = wire ? 1 : 2;
        organs.push({ mesh: m, bone, offset: new THREE.Vector3(c[0] - rest.p[0], c[1] - rest.p[1], c[2] - rest.p[2]) });
      };
      add("vital", wl.vitalRegion.bone, wl.vitalRegion.c, wl.vitalRegion.r, "#53f3dc", true);
      for (const o of wl.organs) add(o.id, o.bone, o.c, o.r, ORGAN_COLORS[o.id] ?? "#ffffff", false);
      const verts = (a.mesh.geometry.getAttribute("position") as THREE.BufferAttribute).count;
      return { spec, kind: "wildlife", root: a.root, box, animal: a, organs, info: `${verts.toLocaleString()} vertices · ${a.build.bones.length} bones · ${wl.organs.length} organs` };
    }
    const asm = GEAR_BY_ID[spec.id] ?? STRUCTURES_BY_ID[spec.id];
    if (asm) {
      const root = new THREE.Group();
      const built = buildAssembly(asm, { explode: this.explode, shadows: true, includeHidden: this.style === "xray" });
      root.add(built.root);
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(built.root);
      // assemblies sit on the ground plane in the studio
      if (asm.category === "gear") { const lift = -box.min.y; built.root.position.y = lift; box.min.y += lift; box.max.y += lift; }
      return { spec, kind: asm.category, root, box, assembly: asm, organs: [], info: `${asm.prims.length} parts · ${Object.keys(asm.materials).length} materials` };
    }
    const fl = FLORA_BY_ID[spec.id];
    if (fl) {
      const geo = buildFlora(fl, spec.seed ?? 1, 0);
      const mesh = new THREE.Mesh(geo, plainFloraMaterial());
      mesh.castShadow = true; mesh.receiveShadow = true;
      const root = new THREE.Group(); root.add(mesh);
      geo.computeBoundingBox();
      return { spec, kind: "flora", root, box: geo.boundingBox!.clone(), organs: [], info: `${(geo.getAttribute("position") as THREE.BufferAttribute).count.toLocaleString()} vertices` };
    }
    return null;
  }

  /** Rebuild an assembly with a new explode factor / hidden-part visibility. */
  async refreshAssembly() { if (this.subject?.assembly) await this.load(this.subject.spec); }

  setPose(p: StudioPose) {
    this.pose = p;
    const a = this.subject?.animal;
    if (!a) { this.animator = null; this.animPose = null; return; }
    this.animator = new AnimalAnimator(a);
    const pose = newPose();
    const g = a.bp.gait;
    switch (p) {
      case "walk": pose.gait = "walk"; pose.speed = g.walk.speed; break;
      case "trot": pose.gait = "trot"; pose.speed = g.trot.speed; break;
      case "gallop": pose.gait = "gallop"; pose.speed = g.gallop.speed; break;
      case "stot": pose.gait = "stot"; pose.speed = 6; break;
      case "graze": pose.graze = 1; break;
      case "alert": pose.alert = 1; break;
      case "bed": pose.bed = 1; break;
      case "look": pose.alert = 1; pose.lookYaw = 0.9; break;
    }
    this.animPose = pose;
    this.animator.apply(pose);
    a.root.updateMatrixWorld(true);
  }

  private fitGround() {
    const s = this.subject;
    if (!s) return;
    const size = s.box.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.z) * 0.5;
    this.plinth.scale.set(Math.max(0.6, r * 1.15), 1, Math.max(0.6, r * 1.15));
    const key = this.lights.children.find(c => (c as THREE.DirectionalLight).isDirectionalLight && (c as THREE.DirectionalLight).castShadow) as THREE.DirectionalLight;
    const ext = Math.max(size.x, size.y, size.z) * 0.8 + 0.5;
    const sc = key.shadow.camera as THREE.OrthographicCamera;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.updateProjectionMatrix();
    const c = s.box.getCenter(new THREE.Vector3());
    key.target.position.copy(c);
    key.position.copy(c).add(new THREE.Vector3(ext * 1.2, ext * 2.4, ext * 1.6));
  }

  // ------------------------------------------------------------------ input
  orbit(dx: number, dy: number) {
    this.yaw -= dx * 0.008; this.pitch = Math.max(-0.2, Math.min(1.35, this.pitch + dy * 0.006));
    this.idle = 0;
    if (this.view !== "orbit") this.view = "orbit";
  }
  dolly(f: number) { this.zoom = Math.max(0.35, Math.min(3, this.zoom * f)); this.idle = 0; }
  setRect(x: number, y: number, w: number, h: number, cw: number, ch: number) {
    const P = this.pad;
    const pw = Math.min(P.left + P.right, w * 0.4), ph = Math.min(P.top + P.bottom, h * 0.45);
    const kx = P.left + P.right > 0 ? pw / (P.left + P.right) : 0, ky = P.top + P.bottom > 0 ? ph / (P.top + P.bottom) : 0;
    this.rect = { x: x + P.left * kx, y: y + P.top * ky, w: Math.max(10, w - pw), h: Math.max(10, h - ph) };
    this.canvas = [cw, ch];
  }

  // ------------------------------------------------------------------ frame
  update(dt: number, aspect: number) {
    this.idle += dt;
    if (this.autoRotate && this.view === "orbit" && this.idle > 2.5) this.yaw += dt * this.rotateSpeed;
    if (this.animator && this.animPose && this.animate) {
      this.animPose.t += dt;
      this.animator.advance(this.animPose, dt);
      this.animator.apply(this.animPose);
    }
    const s = this.subject;
    if (s) {
      s.root.updateMatrixWorld(true);
      for (const o of s.organs) {
        o.mesh.matrix.compose(o.offset.clone().applyMatrix4(o.bone.matrixWorld), new THREE.Quaternion().setFromRotationMatrix(tmpM.extractRotation(o.bone.matrixWorld)), (o.mesh.userData.scale as THREE.Vector3).clone().multiplyScalar(new THREE.Vector3().setFromMatrixScale(o.bone.matrixWorld).x));
        o.mesh.matrixWorld.copy(o.mesh.matrix);
      }
    }
    void aspect;
    this.frameCameras();
  }

  private frameCameras() {
    const s = this.subject;
    const [W, H] = this.canvas;
    const R = this.rect;
    const rcx = R.x + R.w / 2, rcy = R.y + R.h / 2;
    const box = s?.box ?? new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 1.5, 1));
    if (this.view === "orbit") {
      const cam = this.persp;
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const center = box.getCenter(new THREE.Vector3());
      cam.fov = 30; cam.aspect = W / H;
      const halfV = Math.atan(Math.tan((cam.fov * Math.PI / 180) / 2) * (R.h / H));
      const halfH = Math.atan(Math.tan((cam.fov * Math.PI / 180) / 2) * cam.aspect * (R.w / W));
      const d = sphere.radius / Math.sin(Math.min(halfV, halfH)) * 0.92 / this.zoom;
      cam.position.set(center.x + d * Math.cos(this.pitch) * Math.sin(this.yaw), center.y + d * Math.sin(this.pitch), center.z + d * Math.cos(this.pitch) * Math.cos(this.yaw));
      cam.near = Math.max(0.01, d - sphere.radius * 3); cam.far = d + sphere.radius * 6 + 50;
      cam.lookAt(center);
      cam.setViewOffset(W, H, W / 2 - rcx, H / 2 - rcy, W, H);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
    } else {
      const cam = this.ortho;
      const f = fitOrthoCamera(cam, box, this.view, R.w / R.h, 0.16);
      const k = (f.halfHeight * 2) / R.h / this.zoom;    // world units per CSS px
      cam.left = -rcx * k; cam.right = (W - rcx) * k; cam.top = rcy * k; cam.bottom = (rcy - H) * k;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      const ext = projectedExtent(box, this.view);
      this.fitInfo = { cx: (ext.minX + ext.maxX) / 2, cy: (ext.minY + ext.maxY) / 2, k, axes: viewAxes(this.view) };
    }
  }

  get camera(): THREE.Camera { return this.view === "orbit" ? this.persp : this.ortho; }

  /** Overall dimension lines (CSS px) for the current orthographic view. */
  dimensions(): DimLine[] {
    const s = this.subject;
    if (!s || this.view === "orbit" || this.view === "iso" || this.view === "isoRear") return [];
    const ext = projectedExtent(s.box, this.view);
    const { cx, cy, k, axes } = this.fitInfo;
    const R = this.rect, rcx = R.x + R.w / 2, rcy = R.y + R.h / 2;
    const X = (x: number) => rcx + (x - cx) / k, Y = (y: number) => rcy - (y - cy) / k;
    const name = (v: THREE.Vector3) => Math.abs(v.y) > 0.9 ? "HEIGHT" : Math.abs(v.z) > 0.9 ? "LENGTH" : "WIDTH";
    const off = 26;
    return [
      { kind: "h", x0: X(ext.minX), x1: X(ext.maxX), y0: Y(ext.minY) + off, y1: Y(ext.minY) + off, value: ext.maxX - ext.minX, label: name(axes[0]), ox: 0, oy: Y(ext.minY) },
      { kind: "v", x0: X(ext.maxX) + off, x1: X(ext.maxX) + off, y0: Y(ext.maxY), y1: Y(ext.minY), value: ext.maxY - ext.minY, label: name(axes[1]), ox: X(ext.maxX), oy: 0 },
    ];
  }

  /** Screen positions (CSS px) of organ labels for the x-ray overlay. */
  organLabels(): { id: string; x: number; y: number }[] {
    const s = this.subject;
    if (!s || this.style !== "xray") return [];
    const cam = this.camera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
    const [W, H] = this.canvas;
    const out: { id: string; x: number; y: number }[] = [];
    for (const o of s.organs) {
      const p = new THREE.Vector3().setFromMatrixPosition(o.mesh.matrixWorld).project(cam);
      if (p.z > 1) continue;
      out.push({ id: o.mesh.name, x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H });
    }
    return out;
  }

  /** Ground line (CSS px y) for side elevations. */
  groundY(): number | null {
    if (this.view === "orbit" || this.view === "top" || this.view === "bottom") return null;
    const { cy, k } = this.fitInfo;
    const R = this.rect;
    return R.y + R.h / 2 - (0 - cy) / k;
  }

  render(renderer: THREE.WebGLRenderer) {
    const [W, H] = this.canvas;
    const cam = this.camera;
    const grid = this.scene.getObjectByName("grid")!;
    const spot = this.lights.getObjectByName("spot") as THREE.SpotLight;
    const lineStyle = this.style === "lines" || this.style === "paper" || this.style === "xray";
    this.ground.visible = !lineStyle;
    grid.visible = this.style === "shaded";
    this.plinth.visible = this.style === "trophy";
    spot.intensity = this.style === "trophy" ? 26 : 0;
    const hemi = this.lights.children.find(c => (c as THREE.HemisphereLight).isHemisphereLight) as THREE.HemisphereLight;
    hemi.intensity = this.style === "trophy" ? 0.55 : 1.2;
    if (this.subject) spot.target.position.copy(this.subject.box.getCenter(new THREE.Vector3()));
    if (lineStyle) {
      this.bp.render(this.scene, cam, W, H, this.style === "paper" ? STYLE_PAPER : STYLE_BLUEPRINT);
      if (this.style === "xray" && this.subject?.organs.length) {
        const auto = renderer.autoClear;
        renderer.autoClear = false;
        renderer.clearDepth();
        const tm = renderer.toneMapping; renderer.toneMapping = THREE.NoToneMapping;
        renderer.render(this.organScene, cam);
        renderer.toneMapping = tm;
        renderer.autoClear = auto;
      }
    } else {
      this.scene.background = this.style === "trophy" ? this.bgTrophy : this.bgShaded;
      renderer.toneMappingExposure = this.style === "trophy" ? 1.1 : 1.0;
      renderer.render(this.scene, cam);
      this.scene.background = null;
    }
  }

  dispose() {
    this.token++;
    if (this.subject) disposeObject(this.subject.root);
    disposeObject(this.organScene);
    this.bp.dispose();
    disposeObject(this.scene);
  }
}
