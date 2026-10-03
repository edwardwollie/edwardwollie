// Model preview grid: ?ids=mule-deer,elk&views=left,front,top,iso&sex=male&age=1&seed=1&w=1600&h=900&bg=2a3036
import * as THREE from "three";
import { ALL_VIEWS, VIEWS, fitOrthoCamera, type ViewName } from "../../app/game3d/render/views.ts";
import { buildBlueprintObject } from "../../app/game3d/models/registry.ts";

const q = new URLSearchParams(location.search);
const ids = (q.get("ids") ?? "mule-deer").split(",");
const viewsParam = q.get("views") ?? "left,front,top,iso";
const views = (viewsParam === "all" ? ALL_VIEWS : viewsParam.split(",")) as ViewName[];
const W = Number(q.get("w") ?? 1600), H = Number(q.get("h") ?? 900);
const sex = (q.get("sex") ?? "male") as "male" | "female";
const age = Number(q.get("age") ?? 1), seed = Number(q.get("seed") ?? 1);
const pose = q.get("pose") ?? "rest";
const phase = Number(q.get("phase") ?? 0);
const bg = q.get("bg") ?? "2a3036";
const phases = Number(q.get("phases") ?? 0);

const canvas = document.getElementById("c") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
canvas.style.width = W + "px"; canvas.style.height = H + "px";
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setScissorTest(true);
renderer.setClearColor(new THREE.Color("#" + bg));

const labels = document.getElementById("labels")!;
const rows = ids.length, cols = phases > 0 ? phases : views.length;
const cw = Math.floor(W / cols), ch = Math.floor(H / rows);

async function main() {
  for (let r = 0; r < rows; r++) {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xdfeaff, 0x3a3228, 1.25));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.2); key.position.set(3, 5, 4); scene.add(key);
    const rim = new THREE.DirectionalLight(0xbcd4ff, 0.9); rim.position.set(-4, 2, -3); scene.add(rim);
    const built = await buildBlueprintObject(ids[r], { sex, age, seed, pose, phase });
    scene.add(built.object);
    built.object.updateMatrixWorld(true);
    const box = built.box ?? new THREE.Box3().setFromObject(built.object);
    // one scale for all orthographic views in the row so proportions compare
    let hh = 0;
    for (const v of views) {
      if (v.startsWith("iso")) continue;
      const cam = new THREE.OrthographicCamera();
      const f = fitOrthoCamera(cam, box, v, cw / ch, 0.1);
      hh = Math.max(hh, f.halfHeight);
    }
    for (let c = 0; c < cols; c++) {
      const v = phases > 0 ? views[0] : views[c];
      let sc = scene, bx = box;
      if (phases > 0) {
        sc = new THREE.Scene();
        sc.add(new THREE.HemisphereLight(0xdfeaff, 0x3a3228, 1.25));
        sc.add(key.clone()); sc.add(rim.clone());
        const b2 = await buildBlueprintObject(ids[r], { sex, age, seed, pose, phase: c / phases });
        sc.add(b2.object); b2.object.updateMatrixWorld(true);
        bx = box;
      }
      const cam = new THREE.OrthographicCamera();
      fitOrthoCamera(cam, bx, v, cw / ch, 0.1, v.startsWith("iso") ? undefined : hh);
      const x = c * cw, y = H - (r + 1) * ch;
      renderer.setViewport(x, y, cw, ch); renderer.setScissor(x, y, cw, ch);
      key.position.copy(cam.position).add(new THREE.Vector3(2, 4, 1));
      renderer.render(sc, cam);
      const l = document.createElement("div");
      l.style.left = x + 6 + "px"; l.style.top = r * ch + 6 + "px";
      l.textContent = phases > 0 ? `${pose} ${(c / phases).toFixed(2)}` : `${ids[r]} · ${VIEWS[v]?.short ?? v}`;
      labels.appendChild(l);
    }
    const size = box.getSize(new THREE.Vector3());
    const l = document.createElement("div");
    l.style.left = "6px"; l.style.top = (r + 1) * ch - 26 + "px";
    l.textContent = `L ${size.z.toFixed(3)} × W ${size.x.toFixed(3)} × H ${size.y.toFixed(3)} m · ${built.info ?? ""}`;
    labels.appendChild(l);
  }
  (window as unknown as { __ready: boolean }).__ready = true;
}
main().catch(e => { document.body.insertAdjacentHTML("beforeend", `<pre style="color:#f88">${String(e?.stack ?? e)}</pre>`); (window as unknown as { __ready: boolean }).__ready = true; });
