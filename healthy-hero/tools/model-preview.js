import * as THREE from '../src/vendor/three.module.min.js?v=2.0.1';
import { buildModel, measure } from '../src/models.js?v=2.0.1';
import { Rig } from '../src/rig.js?v=2.0.1';
const params = new URLSearchParams(location.search);
const ids = (params.get('ids') || 'pip,mia,leo,ginger').split(',');
const views = (params.get('views') || 'front,left,back,threeq').split(',');
const size = Number(params.get('size') || 300);
const poses = (params.get('poses') || '').split(',').filter(Boolean);
const grid = document.getElementById('grid');
grid.style.gridTemplateColumns = `repeat(${Number(params.get('cols')) || views.length}, ${size}px)`;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(size, size); renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
const envGeo = new THREE.SphereGeometry(10, 32, 16);
const envMat = new THREE.ShaderMaterial({ side: THREE.BackSide, uniforms: {}, vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }', fragmentShader: 'varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = mix(vec3(0.35,0.42,0.5), vec3(1.0,0.98,0.95), smoothstep(-0.2,0.8,h)); gl_FragColor = vec4(c*1.2,1.); }' });
envScene.add(new THREE.Mesh(envGeo, envMat));
const env = pmrem.fromScene(envScene, 0.02).texture;
const jobs = [];
for (const id of ids) { if (poses.length) for (const p of poses) jobs.push([id, p]); else jobs.push([id, null]); }
for (const [id, poseName] of jobs) {
  const m = buildModel(id, { lod: Number(params.get('lod') || 1) });
  if (poseName) { const [st, fr] = poseName.split(':'); const rig = new Rig(m); rig.poseAt(st, Number(fr || 0), Number(fr || 0) * 2 + 0.3); m.root.updateMatrixWorld(true); }
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#2a3d5e'); scene.environment = env; scene.environmentIntensity = 0.6;
  scene.add(new THREE.HemisphereLight('#ffffff', '#4a5a7a', 1.3));
  const d = new THREE.DirectionalLight('#ffffff', 2.2); d.position.set(2, 4, 3); scene.add(d);
  scene.add(m.root);
  const box = measure(m.root); const c = box.getCenter(new THREE.Vector3()); const s = box.getSize(new THREE.Vector3());
  const r = Math.max(s.x, s.y, s.z) * 0.62;
  for (const v of views) {
    const cam = new THREE.OrthographicCamera(-r, r, r, -r, 0.01, 100);
    const dir = { front: [0, 0, 1], back: [0, 0, -1], left: [1, 0, 0], right: [-1, 0, 0], top: [0, 1, 0.0001], threeq: [0.8, 0.45, 1] }[v];
    if (v === 'threeq') { const pc = new THREE.PerspectiveCamera(30, 1, 0.01, 100); pc.position.copy(c).add(new THREE.Vector3(...dir).normalize().multiplyScalar(r * 4.2)); pc.lookAt(c); render(pc, `${id} · ${v}${poseName ? ' · ' + poseName : ''}`); continue; }
    cam.position.copy(c).add(new THREE.Vector3(...dir).multiplyScalar(10)); if (v === 'top') cam.up.set(0, 0, -1); cam.lookAt(c);
    render(cam, `${id} · ${v}${poseName ? ' · ' + poseName : ''}`);
  }
  function render(cam, label) {
    renderer.render(scene, cam);
    const cell = document.createElement('div'); cell.className = 'cell';
    const cv = document.createElement('canvas'); cv.width = size; cv.height = size; cv.getContext('2d').drawImage(renderer.domElement, 0, 0);
    const sp = document.createElement('span'); sp.textContent = label; cell.append(cv, sp); grid.append(cell);
  }
}
window.__ready = true;
