"use client";
import { useEffect, useRef } from "react";
import { ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, GlowLayer, HemisphericLight, MeshBuilder, Scene, StandardMaterial, Vector3 } from "@babylonjs/core";
import { BLUEPRINT } from "./blueprints";
import { buildModel } from "./model-builder";

/** Small turntable that renders one blueprint with an idle breathing/tail-sway loop. */
export default function ModelViewer({ model, accent }: { model: string; accent: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const bp = BLUEPRINT[model];
    if (!ref.current || !bp) return;
    const engine = new Engine(ref.current, true, { antialias: true, stencil: true }, true);
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0, 0, 0, 0);
    const hemi = new HemisphericLight("h", new Vector3(0.2, 1, 0.3), scene);
    hemi.intensity = 0.8; hemi.groundColor = new Color3(0.05, 0.12, 0.1);
    const sun = new DirectionalLight("s", new Vector3(-0.5, -1, 0.7), scene);
    sun.intensity = 1.3;
    const rim = new DirectionalLight("r", new Vector3(0.6, -0.2, -1), scene);
    rim.intensity = 0.9; rim.diffuse = Color3.FromHexString(accent);
    const glow = new GlowLayer("g", scene, { blurKernelSize: 32 });
    glow.intensity = 0.7;
    glow.customEmissiveColorSelector = (_m, _s, mat, out) => {
      const sm = mat as StandardMaterial;
      if (sm?.metadata?.glow) out.set(sm.emissiveColor.r, sm.emissiveColor.g, sm.emissiveColor.b, 1); else out.set(0, 0, 0, 0);
    };
    const m = buildModel(scene, bp, { name: "view", merge: true });
    for (const mesh of m.meshes) mesh.computeWorldMatrix(true);
    const { min, max } = m.root.getHierarchyBoundingVectors(true);
    const center = min.add(max).scale(0.5), size = max.subtract(min).length();
    const disc = MeshBuilder.CreateDisc("pad", { radius: size * 0.45, tessellation: 64 }, scene);
    disc.rotation.x = Math.PI / 2; disc.position.y = min.y - 0.01;
    const pm = new StandardMaterial("pad", scene);
    pm.diffuseColor = Color3.Black(); pm.emissiveColor = Color3.FromHexString(accent).scale(0.18); pm.alpha = 0.6;
    disc.material = pm;
    const cam = new ArcRotateCamera("c", -Math.PI * 0.7, Math.PI * 0.4, size * 1.25, center, scene);
    cam.minZ = 0.05; cam.lowerRadiusLimit = size * 0.6; cam.upperRadiusLimit = size * 2.5; cam.wheelPrecision = 80 / size;
    cam.attachControl(true);
    cam.useAutoRotationBehavior = true;
    if (cam.autoRotationBehavior) cam.autoRotationBehavior.idleRotationSpeed = 0.4;
    let t = 0;
    engine.runRenderLoop(() => {
      t += engine.getDeltaTime() / 1000;
      const b = m.bones;
      if (b.tail1) { b.tail1.rotation.y = Math.sin(t * 1.2) * 0.12; b.tail2.rotation.y = Math.sin(t * 1.2 - 0.6) * 0.18; b.tail3.rotation.y = Math.sin(t * 1.2 - 1.2) * 0.25; }
      if (b.jaw) b.jaw.rotation.x = Math.max(0, Math.sin(t * 0.7)) * 0.25;
      if (b.neck) b.neck.rotation.x = Math.sin(t * 1.4) * 0.04;
      if (b.ring) b.ring.rotation.y = t * 4;
      if (b.chest) b.chest.rotation.x = Math.sin(t * 2) * 0.02;
      scene.render();
    });
    const resize = () => engine.resize();
    window.addEventListener("resize", resize);
    return () => { window.removeEventListener("resize", resize); engine.dispose(); };
  }, [model, accent]);
  return <canvas ref={ref} className="model-viewer" />;
}
