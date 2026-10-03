import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { getBlueprint } from "../../src/v3/blueprints/registry.ts";
import type { ViewName } from "../../src/v3/blueprints/types.ts";
import { buildBlueprint, measure, setExplode } from "../../src/v3/models/build.ts";
import { frameView, framePerspective } from "../../src/v3/models/views.ts";
import { applyPose } from "../../src/v3/models/rig.ts";
import { BlueprintRenderer } from "../../src/v3/models/blueprint-render.ts";

declare global { interface Window { __ready?: boolean; __error?: string } }

async function main() {
  const params = new URLSearchParams(location.search);
  const ids = (params.get("ids") ?? "cadet-omari").split(",");
  const views = (params.get("views") ?? "front,left,back,iso,persp").split(",") as (ViewName | "persp")[];
  const tile = Number(params.get("size") ?? 360);
  const cols = Number(params.get("cols") ?? views.length);
  const explode = Number(params.get("explode") ?? 0);
  const pose = params.get("pose") ?? "rest";
  const mode = params.get("mode") ?? "color";
  const background = params.get("bg") ?? "#1b2440";
  const tiles: { id: string; view: ViewName | "persp" }[] = [];
  for (const id of ids) for (const view of views) tiles.push({ id, view });
  const rows = Math.ceil(tiles.length / cols);
  const width = cols * tile, height = rows * tile;
  try { await document.fonts.load("700 32px 'Fredoka Variable'"); } catch { /* optional */ }
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.setScissorTest(true);
  document.body.appendChild(renderer.domElement);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const labels = document.getElementById("labels")!;
  const blueprint = new BlueprintRenderer(renderer);
  const built = new Map<string, { scene: THREE.Scene; box: THREE.Box3 }>();
  for (const id of ids) {
    const bp = getBlueprint(id);
    if (!bp) throw new Error("unknown blueprint " + id);
    const model = buildBlueprint(bp, { resolve: getBlueprint });
    if (explode > 0) setExplode(model, explode);
    if (pose !== "rest") applyPose(model, pose, 0.3);
    const scene = new THREE.Scene();
    scene.environment = env;
    scene.background = new THREE.Color(background);
    scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x3a3550, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(4, 8, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fd8ff, 1.0);
    rim.position.set(-6, 4, -5);
    scene.add(rim);
    scene.add(model.root);
    const box = measure(model.root);
    built.set(id, { scene, box });
  }
  tiles.forEach((t, index) => {
    const { scene, box } = built.get(t.id)!;
    const x = (index % cols) * tile, y = Math.floor(index / cols) * tile;
    const camera = t.view === "persp" ? framePerspective(box, 1) : frameView(box, t.view, 1, 0.1).camera;
    if (mode === "blueprint" && t.view !== "persp") {
      renderer.setScissorTest(false);
      blueprint.render(scene, camera, { x, y: height - y - tile, width: tile, height: tile });
      renderer.setScissorTest(true);
    } else {
      renderer.setViewport(x, height - y - tile, tile, tile);
      renderer.setScissor(x, height - y - tile, tile, tile);
      renderer.render(scene, camera);
    }
    const label = document.createElement("div");
    const size = box.getSize(new THREE.Vector3());
    label.textContent = `${t.id} · ${t.view} · ${size.x.toFixed(3)}×${size.y.toFixed(3)}×${size.z.toFixed(3)} m`;
    label.style.left = x + 6 + "px";
    label.style.top = y + 6 + "px";
    labels.appendChild(label);
  });
  window.__ready = true;
}

main().catch((error: unknown) => { window.__error = String((error as Error)?.stack ?? error); console.error(error); });
