import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import {NullEngine,Scene,Vector3} from '@babylonjs/core';

fs.mkdirSync(new URL('../tmp/',import.meta.url),{recursive:true});
const out=new URL(`../tmp/open-world-tests-${process.pid}/`,import.meta.url);
await build({entryPoints:['city-plan.ts','open-world.ts','ninja-rig.ts','blueprint-mesh.ts','leaderboard-store.ts'].map(f=>new URL(`../app/${f}`,import.meta.url).pathname),
  outdir:out.pathname,bundle:true,packages:'external',platform:'node',format:'esm',logLevel:'silent'});
const {planCity,SECTORS,DOUBLE_JUMP_RISE}=await import(pathToFileURL(`${out.pathname}city-plan.js`).href);
const {moveBody,rayBoxes,wallContact,poseFor,PLAYER}=await import(pathToFileURL(`${out.pathname}open-world.js`).href);
const {buildNinjaRig,applyPose,POSE_SHEET,runPose,strikePose}=await import(pathToFileURL(`${out.pathname}ninja-rig.js`).href);
const {BlueprintBuilder}=await import(pathToFileURL(`${out.pathname}blueprint-mesh.js`).href);
const {validate,insert,cleanName,MIN_TIME}=await import(pathToFileURL(`${out.pathname}leaderboard-store.js`).href);

const inside=(p,b,pad=0)=>p.x>b.min[0]-pad&&p.x<b.max[0]+pad&&p.y>b.min[1]&&p.y<b.max[1]&&p.z>b.min[2]-pad&&p.z<b.max[2]+pad;

test('every sector is deterministic, connected and has reachable objectives',()=>{
  for(const sector of SECTORS){
    const a=planCity(sector),b=planCity(sector);
    assert.deepEqual(a,b,'deterministic');
    assert.equal(a.roofs.length,sector.grid**2);
    assert.equal(a.shards.length,sector.shards);
    assert.equal(a.drones.length,sector.drones);
    assert.equal(a.drones.filter(d=>d.elite).length,sector.elite);
    // Spawn on the lowest corner, beacon on the summit.
    assert.equal(a.spawn.y,0);
    assert.ok(a.beacon.y>=Math.max(...a.roofs.map(r=>r.h))-3);
    // Every shard floats in open air above a surface (never inside a solid).
    for(const s of a.shards){
      assert.ok(!a.solids.some(box=>inside(s,box)),`${sector.name} shard inside solid`);
      const below=a.solids.filter(box=>s.x>=box.min[0]&&s.x<=box.max[0]&&s.z>=box.min[2]&&s.z<=box.max[2]&&box.max[1]<=s.y);
      assert.ok(below.length&&s.y-Math.max(...below.map(b=>b.max[1]))<1.6,`${sector.name} shard is reachable from its surface`);
    }
    // Neighbouring roofs on the spanning tree either differ by a double jump or have a pad.
    const bridges=a.solids.filter(s=>s.kind==='bridge');
    assert.equal(bridges.length,sector.grid**2-1,'spanning tree bridges');
    for(const br of bridges){
      const ends=a.roofs.filter(r=>
        br.min[0]<r.x+r.w/2+.5&&br.max[0]>r.x-r.w/2-.5&&br.min[2]<r.z+r.d/2+.5&&br.max[2]>r.z-r.d/2-.5);
      assert.equal(ends.length,2,'bridge joins two roofs');
      const [lo,hi]=ends.sort((x,y)=>x.h-y.h);
      if(hi.h-lo.h>DOUBLE_JUMP_RISE)assert.ok(a.pads.some(p=>Math.abs(p.y-lo.h)<1e-6&&Math.abs(p.x-lo.x)<lo.w/2&&Math.abs(p.z-lo.z)<lo.d/2),'launch pad on lower roof');
    }
    // Jump pads give enough height for the largest rise.
    assert.ok(PLAYER.padLaunch**2/(2*PLAYER.gravity)>Math.max(0,...a.roofs.map(r=>r.h))/sector.grid);
  }
});

test('character physics lands, steps onto lips, blocks at walls and falls off edges',()=>{
  const floor={min:[-10,-5,-10],max:[10,0,10],kind:'roof'},lip={min:[2,0,-10],max:[2.4,.3,10],kind:'lip'},wall={min:[5,0,-10],max:[6,3,10],kind:'prop'};
  const pos=new Vector3(0,2,0),vel=new Vector3(0,0,0);let grounded=false;
  for(let i=0;i<120&&!grounded;i++){vel.y-=PLAYER.gravity/60;grounded=moveBody(pos,vel,1/60,[floor,lip,wall],false).grounded}
  assert.ok(grounded);assert.equal(pos.y,0);
  vel.set(6,0,0);
  for(let i=0;i<60;i++){vel.x=6;vel.y-=PLAYER.gravity/60;moveBody(pos,vel,1/60,[floor,lip,wall],true)}
  assert.ok(pos.x<=5-PLAYER.radius+1e-3,'wall stops the operative');
  assert.ok(pos.x>2.4,'low lip was stepped over');
  const fall=new Vector3(9.9,0,0),v=new Vector3(8,0,0);
  for(let i=0;i<60;i++){v.y-=PLAYER.gravity/60;moveBody(fall,v,1/60,[floor],true)}
  assert.ok(fall.y<-1,'walking off the roof edge falls');
  assert.ok(Math.abs(rayBoxes(new Vector3(0,1,0),new Vector3(1,0,0),20,[wall])-5)<1e-6,'camera ray hits wall');
});

test('rig poses move joints within anatomical limits',()=>{
  const engine=new NullEngine(),scene=new Scene(engine),rig=buildNinjaRig(scene,new BlueprintBuilder(scene));
  for(const [name,pose] of Object.entries({...POSE_SHEET,run2:runPose(1.3),swing:strikePose(.6,1)})){
    applyPose(rig,pose,1);
    for(const j of ['leftShin','rightShin'])assert.ok(rig.current[j].x>=-.05,`${name}: ${j} never hyperextends`);
    for(const j of ['leftForeArm','rightForeArm'])assert.ok(rig.current[j].x<=.4,`${name}: ${j} elbow bends forward`);
  }
  scene.dispose();engine.dispose();
});

test('each sector has a Warden over the summit and wall-run billboards',()=>{
  for(const sector of SECTORS){
    const a=planCity(sector);
    assert.ok(Math.hypot(a.boss.x-a.beacon.x,a.boss.z-a.beacon.z)<1e-6,'boss guards the beacon');
    assert.ok(a.boss.y>a.beacon.y+2,'boss hovers above the summit');
    assert.ok(a.boss.hp>=24);
    assert.ok(a.walls.length>=1,`${sector.name} has billboards`);
    for(const w of a.walls){assert.ok(w.max[1]-w.min[1]>3,'billboard is tall enough to run on');assert.ok(a.solids.includes(w))}
  }
  assert.ok(planCity(SECTORS[3]).boss.hp>planCity(SECTORS[0]).boss.hp,'later Wardens are tougher');
});

test('wall contact finds the face beside the operative and its outward normal',()=>{
  const wall={min:[0,0,0],max:[8,5,.4],kind:'wall'};
  const n=wallContact(new Vector3(4,1,.4+PLAYER.radius+.05),[wall]);
  assert.ok(n&&n.z===1,'normal points away from the wall');
  assert.equal(wallContact(new Vector3(4,1,3),[wall]),null,'too far away');
  assert.equal(wallContact(new Vector3(4,6,.8),[wall]),null,'above the wall');
  const lip={min:[0,0,0],max:[8,.3,.4],kind:'lip'};
  assert.equal(wallContact(new Vector3(4,0,.8),[lip]),null,'low lips are not walls');
});

test('ghost pose ids rebuild every recorded pose',()=>{
  for(const [id,a,b] of [[0,0,0],[1,2,1],[2,4,0],[3,.5,2],[4,0,0],[6,1.2,-1],[7,0,0]]){
    const pose=poseFor(id,a,b,1);assert.ok(pose&&typeof pose==='object');
    assert.ok(Object.keys(pose).length>3,`pose ${id} has joints`);
  }
});

test('leaderboard validates runs and keeps each callsign\'s best time',()=>{
  assert.equal(cleanName(' sh<a>dow  01 '),'SHADOW 01');
  assert.equal(cleanName('x'),null);
  assert.equal(typeof validate({sector:1,name:'KAGE',time:MIN_TIME[1]-1,health:50,stars:2,score:10}),'string','too fast is rejected');
  assert.equal(typeof validate({sector:9,name:'KAGE',time:100,health:50,stars:2,score:10}),'string');
  assert.equal(typeof validate({sector:1,name:'KAGE',time:100,health:150,stars:2,score:10}),'string');
  const ok=validate({sector:1,name:'kage',time:100.123,health:50,stars:2,score:10,falls:0});
  assert.equal(typeof ok,'object');assert.equal(ok.entry.name,'KAGE');assert.equal(ok.entry.time,100.12);
  const board={};
  assert.equal(insert(board,1,{...ok.entry}).rank,1);
  assert.equal(insert(board,1,{...ok.entry,name:'ZERO',time:90}).rank,1);
  assert.equal(insert(board,1,{...ok.entry,time:120}).best.time,100.12,'slower repeat keeps the best');
  assert.equal(insert(board,1,{...ok.entry,time:80}).rank,1,'faster repeat replaces it');
  assert.equal(board['1'].length,2);
});
