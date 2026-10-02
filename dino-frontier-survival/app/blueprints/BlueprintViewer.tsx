"use client";
/* eslint-disable react-hooks/set-state-in-effect -- URL query is read after hydration */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArcRotateCamera, Camera, Color3, Color4, DirectionalLight, Engine, HemisphericLight, MeshBuilder, Scene, StandardMaterial,
  TargetCamera, Vector3, type LinesMesh, type Material,
} from "@babylonjs/core";
import { BLUEPRINTS, BLUEPRINT, type Blueprint, type MatSlot } from "../blueprints";
import { buildModel, slotMaterial } from "../model-builder";
import { SPECIES, STATS, type Species } from "../frontier-data";

type Mode = "lines" | "shaded" | "xray";
type View = { id: string; label: string; dir: Vector3; up: Vector3; h: Vector3; v: Vector3 };

/** Orthographic projections. `dir` points from the model toward the camera; h/v are the screen axes. */
const VIEWS: View[] = [
  { id: "front", label: "FRONT ELEVATION", dir: new Vector3(0, 0, 1), up: Vector3.Up(), h: new Vector3(-1, 0, 0), v: Vector3.Up() },
  { id: "back", label: "REAR ELEVATION", dir: new Vector3(0, 0, -1), up: Vector3.Up(), h: new Vector3(1, 0, 0), v: Vector3.Up() },
  { id: "left", label: "LEFT PROFILE", dir: new Vector3(-1, 0, 0), up: Vector3.Up(), h: new Vector3(0, 0, -1), v: Vector3.Up() },
  { id: "right", label: "RIGHT PROFILE", dir: new Vector3(1, 0, 0), up: Vector3.Up(), h: new Vector3(0, 0, 1), v: Vector3.Up() },
  { id: "top", label: "PLAN (TOP)", dir: new Vector3(0, 1, 0), up: new Vector3(-1, 0, 0), h: new Vector3(0, 0, 1), v: new Vector3(-1, 0, 0) },
  { id: "bottom", label: "UNDERSIDE", dir: new Vector3(0, -1, 0), up: new Vector3(1, 0, 0), h: new Vector3(0, 0, 1), v: new Vector3(1, 0, 0) },
];
const ISO = 6;
const absDot = (a: Vector3, s: Vector3) => Math.abs(Vector3.Dot(a, s));

type Label = { view: number; x: number; y: number; text: string; vertical?: boolean };
type Sheet = { scale: number; cells: { w: number; h: number; ox: number; oy: number }[]; labels: Label[]; size: Vector3 };

const LINE = new Color3(0.82, 0.95, 1);
const MODEL_MASK = 1;

export default function BlueprintViewer() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const cells = useRef<(HTMLDivElement | null)[]>([]);
  const [key, setKey] = useState("raptor");
  const [mode, setMode] = useState<Mode>("lines");
  const [bones, setBones] = useState(true);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const bp: Blueprint = BLUEPRINT[key] ?? BLUEPRINTS[0];

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const m = q.get("model"), md = q.get("mode");
    if (m && BLUEPRINT[m]) setKey(m);
    if (md === "lines" || md === "shaded" || md === "xray") setMode(md);
    if (q.get("bones") === "0") setBones(false);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("model", key);
    window.history.replaceState(null, "", url);
  }, [key]);

  useEffect(() => {
    if (!canvas.current) return;
    const el = canvas.current;
    const engine = new Engine(el, true, { preserveDrawingBuffer: true, stencil: true, antialias: true });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0, 0, 0, 0);
    const hemi = new HemisphericLight("hemi", new Vector3(0.2, 1, 0.3), scene);
    hemi.intensity = mode === "shaded" ? 0.85 : 1;
    hemi.groundColor = new Color3(0.2, 0.25, 0.3);
    const sun = new DirectionalLight("sun", new Vector3(-0.5, -1, 0.6), scene);
    sun.intensity = mode === "shaded" ? 1.1 : 0;

    const ghost = new Map<string, Material>();
    const lineMaterial = (slot: MatSlot, hex: string): Material => {
      const k = `${slot}:${hex}:${mode}`;
      const cached = ghost.get(k);
      if (cached) return cached;
      const base = slotMaterial(scene, slot, hex).clone(`bp-${k}`) as StandardMaterial;
      if (mode === "lines") {
        base.diffuseColor = new Color3(0.1, 0.35, 0.6);
        base.emissiveColor = slot === "glow" || slot === "eye" || slot === "visor" ? new Color3(0.45, 0.8, 1) : new Color3(0.12, 0.32, 0.55);
        base.specularColor = Color3.Black();
        base.alpha = 0.16;
      } else {
        base.alpha = 0.32;
      }
      base.backFaceCulling = false;
      ghost.set(k, base);
      return base;
    };
    const model = buildModel(scene, bp, { name: "bp", material: mode === "shaded" ? undefined : lineMaterial });
    for (const m of model.meshes) {
      m.layerMask = MODEL_MASK;
      if (mode !== "shaded") {
        m.enableEdgesRendering(0.97);
        m.edgesWidth = 2.4;
        m.edgesColor = mode === "lines" ? new Color4(LINE.r, LINE.g, LINE.b, 0.95) : new Color4(0.95, 0.98, 1, 0.65);
      }
    }
    for (const m of model.meshes) m.computeWorldMatrix(true); // world matrices before measuring
    const { min, max } = model.root.getHierarchyBoundingVectors(true);
    const center = min.add(max).scale(0.5), size = max.subtract(min);
    const radius = size.length();

    // Rig overlay: joint spheres and parent→child links, drawn above the model.
    if (bones) {
      const jointMat = new StandardMaterial("joint", scene);
      jointMat.emissiveColor = new Color3(1, 0.7, 0.22);
      jointMat.disableLighting = true;
      const rigLines: Vector3[][] = [];
      const r = Math.max(0.025, radius * 0.008);
      for (const b of bp.bones) {
        const node = model.bones[b.id];
        const p = node.getAbsolutePosition().clone();
        const s = MeshBuilder.CreateSphere(`joint-${b.id}`, { diameter: r * 2, segments: 6 }, scene);
        s.position = p; s.material = jointMat; s.renderingGroupId = 2; s.layerMask = MODEL_MASK;
        if (b.parent && b.parent !== "root") rigLines.push([model.bones[b.parent].getAbsolutePosition().clone(), p]);
      }
      if (rigLines.length) {
        const rl = MeshBuilder.CreateLineSystem("rig", { lines: rigLines }, scene);
        rl.color = new Color3(1, 0.7, 0.22); rl.renderingGroupId = 2; rl.layerMask = MODEL_MASK;
      }
    }

    // Cameras: six orthographic elevations + one perspective inspection view.
    const cams: Camera[] = VIEWS.map((view, i) => {
      const cam = new TargetCamera(`cam-${view.id}`, center.add(view.dir.scale(radius * 3)), scene);
      cam.upVector = view.up.clone();
      cam.setTarget(center);
      cam.mode = Camera.ORTHOGRAPHIC_CAMERA;
      cam.minZ = 0.01; cam.maxZ = radius * 8;
      cam.layerMask = MODEL_MASK | (1 << (1 + i));
      return cam;
    });
    const iso = new ArcRotateCamera("iso", -Math.PI * 0.72, Math.PI * 0.38, radius * 1.9, center, scene);
    iso.minZ = 0.01; iso.wheelPrecision = 60 / radius; iso.lowerRadiusLimit = radius * 0.4; iso.upperRadiusLimit = radius * 4;
    iso.useAutoRotationBehavior = true;
    if (iso.autoRotationBehavior) iso.autoRotationBehavior.idleRotationSpeed = 0.35;
    iso.attachControl(true);
    cams.push(iso);
    scene.activeCameras = cams;

    // Ground grid for the perspective view only.
    const gridLines: Vector3[][] = [];
    const g = Math.ceil(Math.max(size.x, size.z) * 0.8 + 1);
    for (let i = -g; i <= g; i++) {
      gridLines.push([new Vector3(center.x + i, min.y, center.z - g), new Vector3(center.x + i, min.y, center.z + g)]);
      gridLines.push([new Vector3(center.x - g, min.y, center.z + i), new Vector3(center.x + g, min.y, center.z + i)]);
    }
    const isoMask = 1 << 8;
    iso.layerMask = MODEL_MASK | isoMask;
    const grid = MeshBuilder.CreateLineSystem("isoGrid", { lines: gridLines }, scene);
    grid.color = new Color3(0.25, 0.5, 0.75); grid.alpha = 0.45; grid.layerMask = isoMask;

    let dims: LinesMesh[] = [];
    const layout = () => {
      engine.resize();
      const c = el.getBoundingClientRect();
      if (!c.width || !c.height) return;
      const rects = cells.current.map(n => n?.getBoundingClientRect());
      // One scale for every elevation so the drawings compare 1:1.
      let scale = 0;
      VIEWS.forEach((view, i) => {
        const r = rects[i];
        if (!r) return;
        const w = absDot(view.h, new Vector3(size.x, 0, 0)) + absDot(view.h, new Vector3(0, size.y, 0)) + absDot(view.h, new Vector3(0, 0, size.z));
        const hgt = absDot(view.v, new Vector3(size.x, 0, 0)) + absDot(view.v, new Vector3(0, size.y, 0)) + absDot(view.v, new Vector3(0, 0, size.z));
        // Leave room (px) for the dimension lines, their labels and the view title.
        scale = Math.max(scale, w / Math.max(40, r.width - 120), hgt / Math.max(40, r.height - 112));
      });
      dims.forEach(d => d.dispose());
      dims = [];
      const labels: Label[] = [];
      const meta: Sheet["cells"] = [];
      cams.forEach((cam, i) => {
        const r = rects[i];
        if (!r) return;
        cam.viewport.x = (r.left - c.left) / c.width;
        cam.viewport.y = 1 - (r.bottom - c.top) / c.height;
        cam.viewport.width = r.width / c.width;
        cam.viewport.height = r.height / c.height;
        if (i === ISO) return;
        const view = VIEWS[i];
        const hw = (r.width * scale) / 2, hh = (r.height * scale) / 2;
        cam.orthoLeft = -hw; cam.orthoRight = hw; cam.orthoTop = hh; cam.orthoBottom = -hh;
        meta[i] = { w: r.width, h: r.height, ox: r.width / 2, oy: r.height / 2 };
        // Model extents along this view's screen axes (relative to the centre).
        const halfH = (absDot(view.h, new Vector3(size.x, 0, 0)) + absDot(view.h, new Vector3(0, size.y, 0)) + absDot(view.h, new Vector3(0, 0, size.z))) / 2;
        const halfV = (absDot(view.v, new Vector3(size.x, 0, 0)) + absDot(view.v, new Vector3(0, size.y, 0)) + absDot(view.v, new Vector3(0, 0, size.z))) / 2;
        const toward = view.dir.scale(radius);
        const P = (sx: number, sy: number) => center.add(view.h.scale(sx)).add(view.v.scale(sy)).add(toward);
        const gap = scale * 22, tick = scale * 6;
        const yB = -halfV - gap, xR = halfH + gap;
        const lines: Vector3[][] = [
          [P(-halfH, yB), P(halfH, yB)], [P(-halfH, yB - tick), P(-halfH, yB + tick)], [P(halfH, yB - tick), P(halfH, yB + tick)],
          [P(-halfH, -halfV - tick), P(-halfH, yB - tick)], [P(halfH, -halfV - tick), P(halfH, yB - tick)],
          [P(xR, -halfV), P(xR, halfV)], [P(xR - tick, -halfV), P(xR + tick, -halfV)], [P(xR - tick, halfV), P(xR + tick, halfV)],
          [P(halfH + tick, -halfV), P(xR + tick, -halfV)], [P(halfH + tick, halfV), P(xR + tick, halfV)],
          // Centre lines.
          [P(-halfH - tick * 2, 0), P(halfH + tick * 2, 0)], [P(0, -halfV - tick * 2), P(0, halfV + tick * 2)],
        ];
        const d = MeshBuilder.CreateLineSystem(`dim-${view.id}`, { lines }, scene);
        d.color = new Color3(1, 0.78, 0.35); d.alpha = 0.9; d.renderingGroupId = 1;
        d.layerMask = 1 << (1 + i); // visible to this elevation's camera only
        dims.push(d);
        const hLen = halfH * 2, vLen = halfV * 2;
        labels.push({ view: i, x: r.width / 2, y: r.height / 2 + (halfV + gap) / scale + 12, text: `${hLen.toFixed(2)} m` });
        labels.push({ view: i, x: r.width / 2 + (halfH + gap) / scale + 14, y: r.height / 2, text: `${vLen.toFixed(2)} m`, vertical: true });
      });
      setSheet({ scale, cells: meta, labels, size });
    };

    const ro = new ResizeObserver(layout);
    ro.observe(el);
    cells.current.forEach(n => n && ro.observe(n));
    layout();
    engine.runRenderLoop(() => scene.render());
    return () => { ro.disconnect(); engine.dispose(); };
  }, [bp, mode, bones]);

  const stats = bp.category === "dinosaur" ? STATS[bp.key as Species] : null;
  const species = SPECIES.find(s => s.key === bp.key);
  const counts = useMemo(() => {
    const byShape: Record<string, number> = {};
    for (const p of bp.parts) byShape[p.shape.kind] = (byShape[p.shape.kind] ?? 0) + 1;
    return byShape;
  }, [bp]);
  const gridPx = sheet ? 1 / sheet.scale : 40;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="bp">
      <header className="bp-head">
        <Link className="brand" href="/"><i>DF</i><span><b>BLUEPRINT ARCHIVE</b><small>DINO FRONTIER SURVIVAL</small></span></Link>
        <nav>
          {(["lines", "xray", "shaded"] as Mode[]).map(m => <button key={m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>{m === "lines" ? "BLUEPRINT" : m === "xray" ? "X-RAY" : "SHADED"}</button>)}
          <button className={bones ? "on" : ""} onClick={() => setBones(b => !b)}>RIG</button>
          <button onClick={() => window.print()}>PRINT SHEET</button>
          <Link className="bp-play" href="/">PLAY →</Link>
        </nav>
      </header>
      <div className="bp-body">
        <aside className="bp-list">
          {BLUEPRINTS.map(b => (
            <button key={b.key} className={b.key === key ? "on" : ""} onClick={() => setKey(b.key)}>
              <small>{b.code}</small><b>{b.name}</b><span>{b.category}</span>
            </button>
          ))}
        </aside>
        <section className="bp-sheet" style={{ "--grid": `${gridPx}px` } as React.CSSProperties}>
          <canvas ref={canvas} className="bp-canvas" />
          <div className="bp-grid">
            {[...VIEWS.map(v => v.label), "PERSPECTIVE · DRAG TO ORBIT"].map((label, i) => (
              <div key={label} ref={n => { cells.current[i] = n; }} className={`bp-cell v-${i === ISO ? "iso" : VIEWS[i].id}`}>
                <em>{String.fromCharCode(65 + i)}</em><span>{label}</span>
                {sheet?.labels.filter(l => l.view === i).map((l, j) => <i key={j} className={l.vertical ? "v" : ""} style={{ left: l.x, top: l.y }}>{l.text}</i>)}
              </div>
            ))}
            <div className="bp-card">
              <small>{bp.code} · REV C · {today}</small>
              <h1>{bp.name}</h1>
              <p className="role">{bp.role}</p>
              <dl>
                <div><dt>LENGTH (Z)</dt><dd>{sheet ? sheet.size.z.toFixed(2) : "–"} m</dd></div>
                <div><dt>WIDTH (X)</dt><dd>{sheet ? sheet.size.x.toFixed(2) : "–"} m</dd></div>
                <div><dt>HEIGHT (Y)</dt><dd>{sheet ? sheet.size.y.toFixed(2) : "–"} m</dd></div>
                <div><dt>GRID</dt><dd>1.00 m</dd></div>
                <div><dt>PARTS</dt><dd>{bp.parts.length}</dd></div>
                <div><dt>BONES</dt><dd>{bp.bones.length}</dd></div>
                {stats && <><div><dt>HEALTH</dt><dd>{stats.hp}</dd></div><div><dt>SPEED</dt><dd>{stats.speed} m/s</dd></div></>}
              </dl>
              <div className="swatches">{Object.entries(bp.palette).map(([slot, hex]) => <span key={slot} title={slot}><i style={{ background: hex }} />{slot}</span>)}</div>
              <ul>{bp.notes.map(n => <li key={n}>{n}</li>)}</ul>
              {species && <p className="behavior">{species.behavior}</p>}
              <p className="shapes">{Object.entries(counts).map(([k, n]) => `${n}× ${k}`).join(" · ")} · collider r {bp.collider.radius} m</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

