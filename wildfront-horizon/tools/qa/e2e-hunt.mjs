// End-to-end contract through the real UI (lodge → briefing → hunt → climb every stand/tower/blind →
// GREAT shot → tag → debrief → claim).
//   npm i --no-save playwright && npm run build && npm start      (or npm run dev)
//   BASE=http://127.0.0.1:3000 node tools/qa/e2e-hunt.mjs [width] [height] [--touch]
// Software-rendered browsers draw a reserve frame in seconds, so after the engage card the
// script stops the frame loop and steps the simulation itself, rendering one frame per screenshot.
// Screenshots go to e2e-out/ (override with E2E_OUT). Exits non-zero on any failed check.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const args = process.argv.slice(2);
const [w = "1280", h = "720"] = args.filter(a => !a.startsWith("--"));
const touch = args.includes("--touch");
const base = process.env.BASE ?? "http://127.0.0.1:3000";
const outDir = process.env.E2E_OUT ?? "e2e-out";
mkdirSync(outDir, { recursive: true });
const tag = `${w}x${h}${touch ? "-touch" : ""}`;
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: +w, height: +h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", e => errors.push(e.message));
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shot = async n => { await p.screenshot({ path: `${outDir}/${n}-${tag}.png`, timeout: 300000 }); log("screenshot", n); };
async function until(fn, arg, label, timeout = 300000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { try { if (await p.evaluate(fn, arg)) return; } catch { /* page busy */ } await sleep(1000); }
  throw new Error(`timed out waiting for ${label}`);
}
const has = sel => until(q => !!document.querySelector(q), sel, sel);
const click = sel => p.evaluate(q => { const el = document.querySelector(q); if (!el) throw new Error(`missing ${q}`); el.click(); }, sel);
const check = (ok, what) => { if (!ok) throw new Error(`check failed: ${what}`); log("ok —", what); };

// a returning player who has finished the intro and training
const save = { unlocked: 1, credits: 120, stars: {}, upgrades: { optics: 1, stability: 1, tracking: 1 }, tutorial: true, v3: { seenIntro: true, owned: ["ridgeline-308", "camo-forest", "caller"], settings: { quality: touch ? "low" : "medium", shotCard: true } } };
await p.addInitScript(s => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("wildfront-save-v1", s); sessionStorage.setItem("seeded", "1"); } }, JSON.stringify(save));

let failed = false;
try {
  await p.goto(`${base}/?qa=1`, { waitUntil: "load", timeout: 120000 });
  await has(".lodge"); log("lodge");
  await click(".lodge .primary.big");
  await has(".brief-side .start"); log("briefing");
  await sleep(1200); await shot("briefing");
  await click(".brief-side .start");
  await has(".engage"); log("engage card");
  await p.evaluate(() => { const wf = window.__wf; wf.host.stop(); wf.hunt().render(wf.host.renderer); });
  await sleep(800); await shot("engage");
  await click(".engage");
  await p.evaluate(() => {
    const wf = window.__wf;
    wf.host.stop();
    window.__step = (sec, render) => {
      const host = wf.host, hunt = wf.hunt(); if (!hunt) return;
      for (let i = 0, n = Math.max(1, Math.round(sec * 30)); i < n && !hunt.finished; i++) { host.input.poll(); hunt.update(1 / 30, host.aspect); host.input.endFrame(); }
      host.onFrame?.(1 / 30);
      if (render) hunt.render(host.renderer);
    };
  });
  const step = async (sec, render = true) => { await p.evaluate(([s, r]) => window.__step(s, r), [sec, render]); await sleep(400); };
  await p.addStyleTag({ content: ".wf3 .lock-hint{display:none!important}" });
  await step(1.5); await shot("hud");
  check(await p.evaluate(() => !!document.querySelector(".compass") && !!document.querySelector(".hud.top")), "HUD shows compass and contract bar");

  // climb every stand / tower / blind in the reserve: nothing opaque may sit right in front of the eye
  const perches = await p.evaluate(() => {
    const wf = window.__wf, h = wf.hunt(), pl = h.player, THREE = wf.THREE;
    const keep = { x: pl.pos.x, z: pl.pos.z, yaw: pl.yaw, pitch: pl.pitch };
    const group = h.world.scene.getObjectByName("landmarks");
    const ray = new THREE.Raycaster();
    const report = [];
    for (const pc of h.perches) {
      pl.perch = null; pl.pos.x = pc.exitX; pl.pos.z = pc.exitZ;
      h.update(1 / 30, wf.host.aspect);
      h["interact"]();
      for (let k = 0; k < 30; k++) h.update(1 / 30, wf.host.aspect);
      const eye = pl.eyePosition(), seat = new THREE.Vector3(pc.x, eye.y, pc.z);
      const solid = (o, d) => { ray.set(o, d); ray.far = 3; return ray.intersectObject(group, true).some(i => !i.object.material?.transparent); };
      let blocked = 0;
      // from the seat: 8 headings relative to the structure (between a cab's corner posts, through
      // a blind's windows), level and looking slightly down at the ground beyond
      for (let k = 0; k < 16; k++) {
        const a = pc.rot + ((k >> 1) + 0.5) * Math.PI / 4, pitch = k & 1 ? -0.12 : 0;
        if (solid(seat, new THREE.Vector3(-Math.sin(a) * Math.cos(pitch), Math.sin(pitch), -Math.cos(a) * Math.cos(pitch)))) blocked++;
      }
      // and straight ahead from where the hunter actually settles
      if (solid(eye, new THREE.Vector3(-Math.sin(pl.yaw), 0, -Math.cos(pl.yaw)))) blocked++;
      report.push({ name: pc.name, kind: pc.kind, perched: !!pl.perch, eye: +(eye.y - pc.y).toFixed(2), blocked });
      h["interact"]();                               // climb down / leave
    }
    window.__perchKeep = keep;
    return report;
  });
  check(perches.length > 0 && perches.every(r => r.perched && r.blocked === 0), `${perches.length} stands, towers and blinds climbed, open view from each (${perches.map(r => `${r.kind}:${r.blocked}`).join(" ")})`);
  // the view from a lookout cab, a tripod stand and a ground blind (each once earlier messages have cleared),
  // then walk back to the trailhead spot
  for (const kind of ["tower", "stand", "blind"]) {
    await sleep(3600);
    const climbed = await p.evaluate(k => {
      const wf = window.__wf, h = wf.hunt(), pl = h.player, keep = window.__perchKeep, pc = h.perches.find(x => x.kind === k);
      if (!pc) return false;
      pl.pos.x = pc.exitX; pl.pos.z = pc.exitZ; pl.yaw = keep.yaw; h.update(1 / 30, wf.host.aspect); h["interact"]();
      for (let i = 0; i < 30; i++) h.update(1 / 30, wf.host.aspect);
      if (k !== "blind") pl.pitch = -0.08;            // a blind seats you level, facing its most open window
      h.update(1 / 30, wf.host.aspect); h.render(wf.host.renderer);
      return true;
    }, kind);
    if (!climbed) continue;
    await sleep(400); await shot(`perch-${kind}`);
    await p.evaluate(() => { const h = window.__wf.hunt(); if (h.player.perch) h["interact"](); });
  }
  await p.evaluate(() => {
    const wf = window.__wf, h = wf.hunt(), pl = h.player, keep = window.__perchKeep;
    if (pl.perch) h["interact"]();
    pl.pos.x = keep.x; pl.pos.z = keep.z; pl.yaw = keep.yaw; pl.pitch = keep.pitch;
    for (let k = 0; k < 3; k++) h.update(1 / 30, wf.host.aspect);
  });

  // present a licensed animal broadside at 100 m in a clear, dry lane and scope it
  const presented = await p.evaluate(() => {
    const hunt = window.__wf.hunt(); const pl = hunt.player, cfg = hunt.cfg, T = hunt.world.terrain;
    const a = hunt.animals.animals.filter(x => x.alive && cfg.licensed.includes(x.bp.species)).sort((m, n) => Math.hypot(m.x - pl.pos.x, m.z - pl.pos.z) - Math.hypot(n.x - pl.pos.x, n.z - pl.pos.z))[0];
    if (!a) return null;
    const dist = 100, eye = pl.eyePosition();
    const wet = (x, z) => T.lakes.some(L => Math.hypot(x - L.x, z - L.z) < Math.max(L.rx, L.rz) * 1.35 + 4) || T.rivers.some(rv => rv.pts.some(q => Math.hypot(x - q[0], z - q[1]) < 16));
    const treeIn = (tx, tz) => hunt.world.plants.some(q => /spruce|pine|oak|aspen|birch|juniper|willow|snag/.test(q.type) && (() => { const dx = tx - eye.x, dz = tz - eye.z, l2 = dx * dx + dz * dz; const u = Math.max(0, Math.min(1, ((q.x - eye.x) * dx + (q.z - eye.z) * dz) / l2)); return Math.hypot(eye.x + dx * u - q.x, eye.z + dz * u - q.z) < 3.6 * q.s && u < 0.97; })());
    // place the animal on candidate bearings until the line from the eye to its posed vital
    // centre is clear of terrain (0.5 m margin), water, trunks and structures
    const place = yy => {
      const fx = -Math.sin(yy), fz = -Math.cos(yy);
      a.x = pl.pos.x + fx * dist; a.z = pl.pos.z + fz * dist; a.y = hunt.world.heightAt(a.x, a.z);
      a.heading = Math.atan2(fz, -fx);
      a.obj.root.position.set(a.x, a.y, a.z); a.obj.root.rotation.y = a.heading; a.obj.root.updateMatrixWorld(true);
      const vr = a.bp.vitalRegion, bone = a.obj.bones[vr.bone], rest = a.obj.build.bones.find(x => x.name === vr.bone);
      return new hunt.camera.position.constructor(vr.c[0] - rest.p[0], vr.c[1] - rest.p[1], vr.c[2] - rest.p[2]).applyMatrix4(bone.matrixWorld);
    };
    let found = false;
    for (let k = 0; k < 240 && !found; k++) {
      const yy = pl.yaw + (k % 2 ? 1 : -1) * Math.floor((k + 1) / 2) * 0.03;
      const v = place(yy);
      if (wet(a.x, a.z) || treeIn(a.x, a.z) || hunt.world.colliders.segment(eye.x, eye.y, eye.z, v.x, v.y, v.z) !== null) continue;
      let ok = true;
      for (let i = 1; i < 100 && ok; i++) { const u = i / 100, x = eye.x + (v.x - eye.x) * u, z = eye.z + (v.z - eye.z) * u; if (hunt.world.heightAt(x, z) > eye.y + (v.y - eye.y) * u - (u < 0.96 ? 0.5 : 0.05) || wet(x, z)) ok = false; }
      found = ok;
    }
    if (!found) return null;
    a.state = "graze"; a.stateT = -1e6; a.awareness = 0; a.speed = 0; a.targetSpeed = 0;
    a.herd.leader = a; a.goalX = a.x; a.goalZ = a.z; a.herd.goal = { kind: "feed", x: a.x, z: a.z, r: 40 }; a.herd.goalT = 1e6;
    for (const m of a.herd.members) if (m !== a) { m.x = a.x + 35; m.z = a.z + 35; }
    window.__target = a;
    hunt.weapon.zoomLevel = 0; hunt.weapon.cycleZoom(); hunt.weapon.cycleZoom(); hunt.weapon.ads = 1; hunt.weapon.aiming = true;
    return a.label;
  });
  check(!!presented, `licensed animal presented (${presented})`);
  // aim at the posed vital centre (the chest bone carries it) and fire with the breath held still
  const aim = fire => p.evaluate(doFire => {
    const hunt = window.__wf.hunt(), a = window.__target, pl = hunt.player, V = hunt.camera.position.constructor;
    a.state = "graze"; a.stateT = -1e6; a.speed = 0; a.targetSpeed = 0; a.awareness = 0;
    a.obj.root.updateMatrixWorld(true);
    const vr = a.bp.vitalRegion, bone = a.obj.bones[vr.bone], rest = a.obj.build.bones.find(x => x.name === vr.bone);
    const v = new V(vr.c[0] - rest.p[0], vr.c[1] - rest.p[1], vr.c[2] - rest.p[2]).applyMatrix4(bone.matrixWorld);
    const d = v.clone().sub(pl.eyePosition()); pl.yaw = Math.atan2(-d.x, -d.z); pl.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    hunt.weapon.sway.set(0, 0); hunt.weapon.swayScale = 0;
    hunt.camera.position.copy(pl.eyePosition()); hunt.camera.rotation.set(pl.pitch, pl.yaw, 0); hunt.camera.updateMatrixWorld();
    if (doFire) hunt.fire();
  }, fire);
  await aim(false); await step(0.6); await shot("scope");
  check(await p.evaluate(() => !!document.querySelector(".scope-system.active")), "scope overlay is up");
  await aim(true); await step(0.5); await shot("shot");
  const after = await p.evaluate(() => { const h = window.__wf.hunt(); return { great: h.stats.great, perfect: h.stats.perfect, score: h.stats.score, alive: window.__target.alive, card: !!document.querySelector(".shot-card") }; });
  check(after.great + after.perfect === 1 && !after.alive, `vital shot graded and animal down (${JSON.stringify(after)})`);
  check(after.card, "shot analysis card shown");

  // walk up and tag before the debrief
  await step(0.6, false);
  await p.evaluate(() => { const h = window.__wf.hunt(), a = window.__target, pl = h.player; const dx = pl.pos.x - a.x, dz = pl.pos.z - a.z, l = Math.hypot(dx, dz) || 1; pl.pos.x = a.x + dx / l * 3.2; pl.pos.z = a.z + dz / l * 3.2; h.weapon.setAim(false); h.weapon.zoomLevel = 0; pl.yaw = Math.atan2(dx, dz); pl.pitch = -0.32; if (!a.tagged) h.tag(a); });
  await step(0.3); await shot("tag");
  check(await p.evaluate(() => !!document.querySelector(".tag-card")), "trophy tag card shown");
  for (let i = 0; i < 8 && !(await p.evaluate(() => !!document.querySelector(".complete-card"))); i++) await step(2, false);
  await has(".complete-card"); await sleep(1200); await shot("results");
  await click(".complete-card .primary");
  await has(".lodge");
  const sv = await p.evaluate(() => JSON.parse(localStorage.getItem("wildfront-save-v1")));
  check(sv.unlocked === 2 && sv.stars["1"] === 3 && sv.credits === 210 && sv.v3.trophies.length === 1, `save after claim (unlocked ${sv.unlocked}, stars ${JSON.stringify(sv.stars)}, credits ${sv.credits}, trophies ${sv.v3.trophies.length})`);
  check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
} catch (e) {
  failed = true;
  log("FAILED —", e.message);
  await shot("failure").catch(() => {});
}
await browser.close();
log(failed ? "E2E FAILED" : "E2E PASSED");
process.exit(failed ? 1 : 0);
