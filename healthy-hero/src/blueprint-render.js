// Blueprint-style line rendering for any Three.js object.
// Pass 1 writes view-space normals + linear depth, pass 2 writes a unique color per part,
// pass 3 finds edges (silhouettes, creases, part boundaries) and draws white line art on
// a shaded blue fill. Used by the in-game Blueprint Lab and the printable sheets.
import * as THREE from './vendor/three.module.min.js?v=2.0.0';

export const BP = {
  bg: '#0e3f86', bgDeep: '#0a2f68', grid: 'rgba(170,210,255,0.13)', gridMajor: 'rgba(180,220,255,0.3)',
  line: '#eef7ff', fill: '#2f6bbd', fillDeep: '#1c4f99', accent: '#ffd45b', dim: '#bfe3ff', red: '#ff8a7a'
};

export const VIEWS = {
  front:  { label: 'FRONT', dir: [0, 0, 1], up: [0, 1, 0] },
  back:   { label: 'BACK', dir: [0, 0, -1], up: [0, 1, 0] },
  left:   { label: 'LEFT SIDE', sub: '(hero’s left)', dir: [1, 0, 0], up: [0, 1, 0] },
  right:  { label: 'RIGHT SIDE', sub: '(hero’s right)', dir: [-1, 0, 0], up: [0, 1, 0] },
  top:    { label: 'TOP (PLAN)', dir: [0, 1, 0], up: [0, 0, -1] },
  bottom: { label: 'BOTTOM', dir: [0, -1, 0], up: [0, 0, 1] },
  iso:    { label: '3/4 VIEW', dir: [0.9, 0.55, 1.15], up: [0, 1, 0], perspective: true }
};

const ndMaterial = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  vertexShader: `varying vec3 vN; varying float vDepth;
    void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `varying vec3 vN; varying float vDepth;
    void main(){ vec3 n = normalize(vN); if(!gl_FrontFacing) n = -n; gl_FragColor = vec4(n, vDepth); }`
});

const compositeMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthTest: false,
  depthWrite: false,
  uniforms: {
    tND: { value: null }, tID: { value: null }, uTexel: { value: new THREE.Vector2() }, uLineW: { value: 1.2 },
    uPix: { value: 0.01 }, uDepthK: { value: 0.02 }, uLine: { value: new THREE.Color(BP.line) },
    uFill: { value: new THREE.Color(BP.fill) }, uFill2: { value: new THREE.Color(BP.fillDeep) },
    uFillAmt: { value: 0.85 }, uBg: { value: new THREE.Color(BP.bg) }, uBgAlpha: { value: 0 }, uCrease: { value: 0.22 }
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `precision highp float; varying vec2 vUv;
    uniform sampler2D tND; uniform sampler2D tID; uniform vec2 uTexel; uniform float uLineW, uPix, uDepthK, uFillAmt, uBgAlpha, uCrease;
    uniform vec3 uLine, uFill, uFill2, uBg;
    void main(){
      vec4 c = texture2D(tND, vUv); vec4 ci = texture2D(tID, vUv);
      float e = 0.0;
      for (int k = 0; k < 8; k++) {
        float a = float(k) * 0.785398;
        vec2 o = vec2(cos(a), sin(a)) * uTexel * uLineW;
        vec4 n = texture2D(tND, vUv + o); vec4 ni = texture2D(tID, vUv + o);
        if (distance(ci, ni) > 0.004) e = 1.0;
        if (ci.a > 0.5 && ni.a > 0.5) {
          float nd = 1.0 - dot(c.xyz, n.xyz);
          e = max(e, smoothstep(uCrease, uCrease * 1.6, nd));
          float expected = uPix * uLineW * length(c.xy) / max(abs(c.z), 0.08);
          float dd = abs(c.w - n.w);
          if (dd > uDepthK + expected * 1.6) e = 1.0;
        }
      }
      float cov = ci.a;
      float lit = clamp(c.z * 0.55 + c.y * 0.25 + 0.35, 0.0, 1.0);
      vec3 fill = mix(uFill2, uFill, lit);
      vec3 col = mix(uBg, fill, cov * uFillAmt);
      col = mix(col, uLine, e);
      float alpha = max(max(cov * uFillAmt, e), uBgAlpha);
      gl_FragColor = vec4(col, alpha);
    }`
});

const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), compositeMaterial);
const quadScene = new THREE.Scene();
quadScene.add(quad);
const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

export class BlueprintRenderer {
  constructor(renderer) {
    this.renderer = renderer;
    this.rtND = null;
    this.rtID = null;
    this.idMats = new Map();
    this.scene = new THREE.Scene();
  }

  ensure(w, h) {
    if (this.rtND && this.rtND.width === w && this.rtND.height === h) return;
    this.rtND?.dispose(); this.rtID?.dispose();
    this.rtND = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    this.rtID = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
  }

  idMaterial(mesh, index) {
    let m = this.idMats.get(mesh.uuid);
    if (!m) {
      const n = index + 1;
      const color = new THREE.Color(((n * 97) % 256) / 255, ((n * 57 + 31) % 256) / 255, ((n * 151 + 73) % 256) / 255);
      m = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
      this.idMats.set(mesh.uuid, m);
    }
    return m;
  }

  // Render `object` with `camera` into the renderer's current canvas region (w×h pixels).
  render(object, camera, { width, height, lineWidth = 1.25, fillAmount = 0.85, depthK = 0.02, pixelWorld = 0.01, background = null, crease = 0.22, target = null } = {}) {
    const r = this.renderer;
    this.ensure(width, height);
    const prevParent = object.parent;
    this.scene.add(object);
    const meshes = [];
    object.traverse((o) => { if (o.isMesh && o.visible) meshes.push(o); });
    const saved = meshes.map((m) => m.material);
    const prevTarget = r.getRenderTarget();
    const prevClear = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
    const prevAuto = r.autoClear;
    const prevTone = r.toneMapping;
    r.toneMapping = THREE.NoToneMapping;
    r.autoClear = true;
    // Pass 1 — normals + depth
    meshes.forEach((m) => { m.material = ndMaterial; });
    r.setRenderTarget(this.rtND); r.setClearColor(0x000000, 0); r.clear(); r.render(this.scene, camera);
    // Pass 2 — part IDs
    meshes.forEach((m, i) => { m.material = this.idMaterial(m, i); });
    r.setRenderTarget(this.rtID); r.setClearColor(0x000000, 0); r.clear(); r.render(this.scene, camera);
    meshes.forEach((m, i) => { m.material = saved[i]; });
    // Pass 3 — composite
    const u = compositeMaterial.uniforms;
    u.tND.value = this.rtND.texture; u.tID.value = this.rtID.texture;
    u.uTexel.value.set(1 / width, 1 / height);
    u.uLineW.value = lineWidth; u.uFillAmt.value = fillAmount; u.uDepthK.value = depthK; u.uPix.value = pixelWorld; u.uCrease.value = crease;
    if (background) { u.uBg.value.set(background); u.uBgAlpha.value = 1; } else u.uBgAlpha.value = 0;
    r.setRenderTarget(target);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(quadScene, quadCam);
    r.setRenderTarget(prevTarget);
    r.setClearColor(prevClear, prevAlpha);
    r.autoClear = prevAuto;
    r.toneMapping = prevTone;
    if (prevParent) prevParent.add(object); else this.scene.remove(object);
  }
}

// Orthographic camera for a named view with an exact scale (pixels per meter).
export function orthoCamera(viewName, center, pxPerMeter, width, height, distance = 30) {
  const v = VIEWS[viewName];
  const halfW = width / pxPerMeter / 2, halfH = height / pxPerMeter / 2;
  const cam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.01, distance * 2);
  const dir = new THREE.Vector3(...v.dir).normalize();
  cam.position.copy(center).addScaledVector(dir, distance);
  cam.up.set(...v.up);
  cam.lookAt(center);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

export function perspectiveCamera(center, radius, aspect, dir = VIEWS.iso.dir, fov = 28) {
  const cam = new THREE.PerspectiveCamera(fov, aspect, 0.01, 200);
  const d = new THREE.Vector3(...dir).normalize();
  const dist = radius / Math.sin((fov * Math.PI) / 360) * 1.08;
  cam.position.copy(center).addScaledVector(d, dist);
  cam.lookAt(center);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

// Perspective camera that tightly frames a Box3 from a direction (fits width and height).
export function fitPerspective(box, aspect, dir = VIEWS.iso.dir, fov = 28, margin = 1.08) {
  const center = box.getCenter(new THREE.Vector3());
  const d = new THREE.Vector3(...dir).normalize();
  const cam = new THREE.PerspectiveCamera(fov, aspect, 0.01, 500);
  cam.position.copy(center).addScaledVector(d, 10);
  cam.lookAt(center);
  cam.updateMatrixWorld(true);
  const inv = cam.matrixWorldInverse.clone();
  const tv = Math.tan((fov * Math.PI) / 360), th = tv * aspect;
  let dist = 0;
  const v = new THREE.Vector3();
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    v.set(x, y, z).applyMatrix4(inv); // camera space, camera 10 m back
    const zFromCenter = v.z + 10; // + toward camera
    dist = Math.max(dist, Math.abs(v.x) / th + zFromCenter, Math.abs(v.y) / tv + zFromCenter);
  }
  cam.position.copy(center).addScaledVector(d, dist * margin);
  cam.near = Math.max(0.01, dist * 0.05); cam.far = dist * 6;
  cam.lookAt(center);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

// World → pixel coordinates inside a w×h render.
export function projectToPixels(point, camera, width, height) {
  const p = point.clone().project(camera);
  return { x: (p.x * 0.5 + 0.5) * width, y: (-p.y * 0.5 + 0.5) * height, z: p.z };
}

export { THREE };
