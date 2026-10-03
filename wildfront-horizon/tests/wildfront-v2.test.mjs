// Classic edition (v2.0.3) regression suite — the classic game now lives at /classic (app/classic/*).
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const engine=fs.readFileSync(new URL("../app/classic/hunt-engine.ts",import.meta.url),"utf8");
const ui=fs.readFileSync(new URL("../app/classic/WildfrontGame.tsx",import.meta.url),"utf8");
const data=fs.readFileSync(new URL("../app/classic/game-data.ts",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("../app/classic/classic.css",import.meta.url),"utf8");
const manifest=JSON.parse(fs.readFileSync(new URL("../public/.well-known/flexzonic-game.json",import.meta.url),"utf8"));

test("expands the campaign to twelve contracts and four named core reserves",()=>{
  const ids=[...data.matchAll(/\{ id:(\d+),name:/g)].map(m=>Number(m[1]));
  assert.deepEqual(ids,[1,2,3,4,5,6,7,8,9,10,11,12]);
  for(const reserve of ["Aurora Pines","Crimson Highlands","Verdant Basin","Obsidian Steppe"])assert.match(data,new RegExp(reserve));
});

test("adds herd-aware animal behavior and fresh track generation",()=>{
  for(const state of ['"graze"','"walk"','"alert"','"flee"'])assert.match(engine,new RegExp(state));
  assert.match(engine,/herd:/);assert.match(engine,/addTrack\(a:Animal\)/);assert.match(engine,/scareAnimals/);
});

test("adds zoom, steady-breath and scope telemetry",()=>{
  assert.match(engine,/zoomLevel/);assert.match(engine,/setSteady/);assert.match(engine,/steadyMeter/);
  for(const token of ["range:target.range","species:target.species","state:target.state"])assert.match(engine,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  assert.match(ui,/HOLD SHIFT STEADY/);assert.match(ui,/scope-readout/);assert.match(css,/scope-system\.active/);
});

test("contains six visually differentiated species",()=>{
  for(const species of ["Mule Deer","Red Deer","Elk","Wild Boar","Bighorn Sheep","Bison"])assert.match(engine,new RegExp(species));
  assert.match(engine,/hump/);assert.match(engine,/tusk/);assert.match(engine,/antler/);assert.match(engine,/horn/);
});

test("preserves production hostname and health metadata (portal version is asserted by the v3 suite)",()=>{
  assert.equal(manifest.url,"https://hunt.flexzonicgames.com");
  assert.match(manifest.version,/^3\.\d+\.\d+$/);
  assert.equal(manifest.healthPath,"/healthz");
  assert.equal(manifest.category,"Adventure");
});


test("adds unmistakable shot impact feedback",()=>{
  assert.match(engine,/setShotFeedback/);
  assert.match(engine,/impact\(pick\.pickedPoint,"vital"\)/);
  assert.match(engine,/GOOD SHOT · BODY HIT/);
  assert.match(engine,/PERFECT HEADSHOT/);
  assert.match(engine,/GREAT SHOT · VITAL/);
  assert.match(ui,/shot-confirm/);
  assert.match(css,/\.shot-confirm\.perfect/);
  assert.match(css,/\.shot-confirm\.great/);
  assert.match(css,/\.shot-confirm\.good/);
});


test("treats the visible chest and shoulder surface as a reliable vital target",()=>{
  assert.match(engine,/mesh===chest\|\|mesh===shoulder/);
  assert.match(engine,/isVitalContact/);
  assert.match(engine,/metadata\?\.zone!=="torso"/);
  assert.doesNotMatch(engine,/cleanChance/);
});

test("interrupts animal movement immediately on every registered body hit",()=>{
  assert.match(engine,/hitPauseUntil/);
  assert.match(engine,/staggerAndFlee/);
  assert.match(engine,/GOOD SHOT · BODY HIT/);
  assert.match(engine,/setEnabled\(false\).*1050/);
});


test("counts head and muzzle contacts as vital PERFECT shots",()=>{
  assert.match(engine,/headZone=mesh===head\|\|n\.startsWith\("muzzle"\)/);
  assert.match(engine,/metadata\?\.zone==="head"\|\|mesh\?\.metadata\?\.zone==="vital"/);
  assert.match(engine,/headshot=meta\.zone==="head"/);
  assert.match(engine,/setShotFeedback\("perfect","PERFECT · HEADSHOT"/);
  assert.match(engine,/perfectShots\+\+/);
});

test("grades registered shots as PERFECT, GREAT, GOOD and reports grade totals",()=>{
  assert.match(engine,/goodShots\+\+/);
  assert.match(engine,/greatShots\+\+/);
  assert.match(engine,/perfectShots\+\+/);
  assert.match(engine,/accuracy=this\.shots\?Math\.round\(this\.hits\/this\.shots\*100\)/);
  assert.match(ui,/stats\?\.perfect/);
  assert.match(ui,/stats\?\.great/);
  assert.match(ui,/stats\?\.good/);
  assert.match(ui,/SHOT GRADES/);
});
