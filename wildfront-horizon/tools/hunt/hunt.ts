/* eslint-disable @typescript-eslint/no-explicit-any -- dev QA harness that pokes at engine internals from the console */
// Hunt test harness (no React UI): ?r=Aurora%20Pines&species=Mule%20Deer&count=1&time=Dawn&weather=Clear&q=medium&tut=1
import * as THREE from "three";
import { GameHost } from "../../app/game3d/engine/host.ts";
import { HuntSession, type HuntConfig } from "../../app/game3d/hunt/hunt.ts";
import type { QualityName } from "../../app/game3d/render/quality.ts";

const q = new URLSearchParams(location.search);
const host = new GameHost(document.getElementById("c") as HTMLCanvasElement, (q.get("q") ?? "medium") as QualityName);
const species = (q.get("species") ?? "Mule Deer").split(",");
const cfg: HuntConfig = {
  mode: "contract", missionId: 1, name: "Test Hunt", reserve: q.get("r") ?? "Aurora Pines", licensed: species, count: Number(q.get("count") ?? 1), distinct: false,
  time: (q.get("time") ?? "Dawn") as HuntConfig["time"], weather: (q.get("weather") ?? "Clear") as HuntConfig["weather"], rifleId: q.get("rifle") ?? "ridgeline-308",
  upgrades: { optics: 1, stability: 1, tracking: 1 }, gear: { camo: 0.1, caller: true, scentBlocker: false }, hitSignRealistic: false, tutorial: q.get("tut") === "1", seed: Number(q.get("seed") ?? 7), fov: 70,
};
const t0 = performance.now();
const hunt = new HuntSession(host.renderer, cfg, host.quality, host.input, host.audio, host.envMap);
const build = performance.now() - t0;
const msgEl = document.getElementById("msg")!;
hunt.onMessage = (t) => { msgEl.textContent = t; };
hunt.onAnalysis = (a) => { (window as any).__lastAnalysis = a; };
host.setMode(hunt);
const dbg = document.getElementById("dbg")!;
const scope = document.getElementById("scope")!;
host.onFrame = () => {
  const h = hunt.snapshot();
  scope.style.display = h.scoped ? "block" : "none";
  dbg.textContent = `build ${build.toFixed(0)} ms · fps ${host.fps.toFixed(0)} · ${h.clock}\nammo ${h.ammo}/${h.reserve} · score ${h.score} · ${h.target} · zoom ${h.zoom}\nrange ${h.range} · ${h.species} · ${h.state}\nwind ${h.wind} m/s · stance ${h.stance} · noise ${(h.noise*100).toFixed(0)} · vis ${(h.visibility*100).toFixed(0)}\n${h.prompt} ${h.shotLabel}`;
};
host.start();
// ---- QA helpers
const qa = {
  host, hunt, THREE,
  /** move the nearest licensed animal to a broadside position in front of the hunter */
  present(dist = 120, side = 1) {
    const p = hunt.player;
    const a = hunt.animals.animals.filter(x => x.alive && cfg.licensed.includes(x.bp.species)).sort((m, n) => Math.hypot(m.x - p.pos.x, m.z - p.pos.z) - Math.hypot(n.x - p.pos.x, n.z - p.pos.z))[0];
    if (!a) return null;
    // find a clear firing lane (no trunks / terrain between eye and chest)
    let yaw = p.yaw;
    const eye = p.eyePosition();
    for (let k = 0; k < 72; k++) {
      const yy = p.yaw + (k % 2 ? 1 : -1) * Math.floor((k + 1) / 2) * 0.09;
      const tx = p.pos.x - Math.sin(yy) * dist, tz = p.pos.z - Math.cos(yy) * dist;
      const ty = hunt.world.heightAt(tx, tz) + a.height * 0.6;
      const blocked = hunt.world.colliders.segment(eye.x, eye.y, eye.z, tx, ty, tz) !== null || hunt.world.plants.some(pl => (pl.type.includes("spruce") || pl.type.includes("pine") || pl.type.includes("oak") || pl.type.includes("aspen") || pl.type.includes("birch") || pl.type.includes("juniper") || pl.type.includes("willow")) && (() => { const dx = tx - eye.x, dz = tz - eye.z, l2 = dx * dx + dz * dz; let u = ((pl.x - eye.x) * dx + (pl.z - eye.z) * dz) / l2; u = Math.max(0, Math.min(1, u)); return Math.hypot(eye.x + dx * u - pl.x, eye.z + dz * u - pl.z) < 3.6 * pl.s && u < 0.97; })());
      let terr = false;
      for (let i = 1; i < 20; i++) { const u = i / 20; if (hunt.world.heightAt(eye.x + (tx - eye.x) * u, eye.z + (tz - eye.z) * u) > eye.y + (ty - eye.y) * u - 0.2) { terr = true; break; } }
      if (!blocked && !terr) { yaw = yy; break; }
    }
    p.yaw = yaw;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    a.x = p.pos.x + fx * dist; a.z = p.pos.z + fz * dist;
    a.heading = Math.atan2(fz, -fx) * side; a.state = "graze"; a.stateT = -1e6; a.awareness = 0; a.speed = 0; a.targetSpeed = 0;
    a.herd.leader = a; a.goalX = a.x; a.goalZ = a.z; a.herd.goal = { kind: "feed", x: a.x, z: a.z, r: 40 } as any; a.herd.goalT = 1e6;
    (qa as any).target = a;
    a.y = hunt.world.heightAt(a.x, a.z);
    a.obj.root.position.set(a.x, a.y, a.z); a.obj.root.rotation.y = a.heading; a.obj.root.updateMatrixWorld(true);
    for (const m of a.herd.members) if (m !== a) { m.x = a.x + 30; m.z = a.z + 30; }
    return a;
  },
  /** aim the camera at an animal's vital region (model-space point) */
  aimAt(a: any, part: "vital" | "head" | "gut" = "vital") {
    const p = hunt.player;
    a.obj.root.updateMatrixWorld(true);
    const bp = a.bp;
    const c = part === "head" ? bp.organs.find((o: any) => o.id === "brain").c : part === "gut" ? bp.organs.find((o: any) => o.id === "stomach").c : bp.vitalRegion.c;
    const v = new THREE.Vector3(...c).applyMatrix4(a.obj.root.matrixWorld);
    const eye = p.eyePosition();
    const d = v.clone().sub(eye);
    p.yaw = Math.atan2(-d.x, -d.z);
    p.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    return v;
  },
  scope(level = 2) { hunt.weapon.zoomLevel = 0; for (let i = 0; i < level; i++) hunt.weapon.cycleZoom(); hunt.weapon.ads = 1; },
  fire() { (hunt as any).fire(); },
  freeze(on = true) { host.timeScale = on ? 0 : 1; },
};
(window as any).__qa = qa;
setTimeout(() => { (window as any).__ready = true; }, Number(q.get("wait") ?? 1500));
