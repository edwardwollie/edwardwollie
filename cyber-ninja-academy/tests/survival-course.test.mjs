import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import {FreeCamera,NullEngine,Scene,TransformNode,VertexBuffer,Vector3} from '@babylonjs/core';

fs.mkdirSync(new URL('../tmp/',import.meta.url),{recursive:true});
const out=new URL(`../tmp/survival-tests-${process.pid}/`,import.meta.url);
await build({entryPoints:[new URL('../app/course-plan.ts',import.meta.url).pathname,
  new URL('../app/ninja-data.ts',import.meta.url).pathname,
  new URL('../app/ninja-engine.ts',import.meta.url).pathname,
  new URL('../app/blueprint-mesh.ts',import.meta.url).pathname],
  outdir:out.pathname,bundle:true,packages:'external',platform:'node',format:'esm',logLevel:'silent'});
const {planCourse}=await import(pathToFileURL(`${out.pathname}course-plan.js`).href);
const {MISSIONS}=await import(pathToFileURL(`${out.pathname}ninja-data.js`).href);
const {NinjaEngine}=await import(pathToFileURL(`${out.pathname}ninja-engine.js`).href);
const {BlueprintBuilder}=await import(pathToFileURL(`${out.pathname}blueprint-mesh.js`).href);
const spec=JSON.parse(fs.readFileSync(new URL('../app/blueprint-spec.json',import.meta.url),'utf8'));

test('every trial has dense, readable, solvable hazard waves and optional bonuses',()=>{
  const kinds=new Set();
  for(const mission of MISSIONS){
    const {waves,bonuses}=planCourse(mission);
    assert.equal(waves.length,mission.hazards);
    assert.ok(waves.length>bonuses.length*3);
    assert.equal(bonuses.filter(b=>b.kind==='shard').length,mission.shards);
    assert.equal(bonuses.filter(b=>b.kind==='drone').length,mission.drones);
    assert.equal(waves[0].z,48);
    assert.equal(waves.at(-1).z,mission.distance-48);
    for(let i=0;i<waves.length;i++){
      const wave=waves[i];
      assert.ok(wave.hazards.length>=1&&wave.hazards.length<=3);
      assert.equal(new Set(wave.hazards.map(h=>h.lane)).size,wave.hazards.length);
      if(wave.hazards.length===3)assert.ok(wave.hazards.some(h=>['barrier','beam','spike','sweep'].includes(h.kind)));
      for(const h of wave.hazards)kinds.add(h.kind);
      if(i>0)assert.ok(wave.z-waves[i-1].z>21,`${mission.id} wave ${i} timing`);
    }
    for(const bonus of bonuses){
      assert.ok(Math.min(...waves.map(w=>Math.abs(w.z-bonus.z)))>9,`${mission.id} bonus clearance`);
    }
  }
  assert.deepEqual([...kinds].sort(),['barrier','beam','crusher','spike','sweep','wall']);
});

test('finish alive completes with no shards or drones; zero integrity fails',()=>{
  const mission=MISSIONS[0],events=[];
  const game=Object.create(NinjaEngine.prototype);
  Object.assign(game,{mission,health:60,shards:0,drones:0,hits:2,score:1000,finished:false,
    waves:Array.from({length:mission.hazards},(_,i)=>({z:i,hit:i<2,passed:true})),
    passedWaves:mission.hazards,cleanWaves:mission.hazards-2,
    cb:{onComplete:r=>events.push(['complete',r]),onFail:()=>events.push(['fail'])}});
  game.finishTrial();
  assert.equal(events[0][0],'complete');
  assert.equal(events[0][1].bonusCredits,0);
  assert.equal(events[0][1].credits,mission.reward);
  assert.equal(events[0][1].stars,2);
  assert.equal(events[0][1].gates,mission.hazards);
  game.finished=false;game.health=0;game.finishTrial();
  assert.equal(events[1][0],'fail');
});

function vertexKeys(mesh){
  mesh.computeWorldMatrix(true);const positions=mesh.getVerticesData(VertexBuffer.PositionKind),keys=[];
  for(let i=0;i<positions.length;i+=3){
    const v=Vector3.TransformCoordinates(Vector3.FromArray(positions,i),mesh.getWorldMatrix());
    keys.push([v.x,v.y,v.z].map(x=>Math.round(x*10000)).join(','));
  }
  return keys.sort();
}

test('batched playable hazards retain their exact blueprint vertices',()=>{
  for(const asset of ['barrier','beam','wall','spike','sweep','crusher']){
    const engine=new NullEngine(),scene=new Scene(engine),builder=new BlueprintBuilder(scene);
    const source=new TransformNode('source',scene),merged=new TransformNode('merged',scene);
    const parts=builder.build(asset,source);builder.buildCourseObstacle(asset,merged);
    const authored=new Map();
    for(const part of spec.assets[asset])authored.set(part.material,[...(authored.get(part.material)||[]),...vertexKeys(parts.get(part.name))]);
    for(const mesh of merged.getChildMeshes()){
      const material=mesh.material.name.replace('blueprint-','');
      assert.deepEqual(vertexKeys(mesh),authored.get(material).sort(),`${asset}/${material}`);
      authored.delete(material);
    }
    assert.equal(authored.size,0,`${asset} unbatched materials`);
    scene.dispose();engine.dispose();
  }
});

test('passing a bonus drone is harmless while a missed floor spike costs integrity',()=>{
  const engine=new NullEngine(),scene=new Scene(engine);
  const camera=new FreeCamera('camera',new Vector3(0,5,-8),scene);
  scene.activeCamera=camera;
  const game=Object.create(NinjaEngine.prototype),messages=[];
  Object.assign(game,{engine,scene,camera,builder:new BlueprintBuilder(scene),
    mission:MISSIONS[0],up:{agility:0,armor:0,blade:0},shadow:{addShadowCaster(){}},
    cb:{onHud(){},onMessage:t=>messages.push(t),onComplete(){},onFail(){}},
    obs:[],effects:[],roofModules:[],towerModules:[],nextTowerZ:{[-1]:0,[1]:0},
    lane:0,targetLane:0,y:0,vy:0,sliding:false,slideTimer:0,attacking:false,
    attackTimer:0,distance:0,shards:0,drones:0,health:100,score:0,combo:0,
    waves:[],passedWaves:0,cleanWaves:0,hits:0,last:performance.now(),
    finished:false,speed:0,runClock:0,impactShake:0,hitStop:0,hudClock:0,audio:null});
  game.rig=game.makeNinja();game.player=game.rig.root;
  const drone=game.createDrone(0,4);game.obs=[drone];game.update();
  assert.equal(game.health,100);
  assert.equal(game.drones,0);
  assert.ok(!messages.some(t=>t.includes('IMPACT')));
  drone.hit=true;drone.root.setEnabled(false);
  game.waves=[{z:4,hit:false,passed:false}];
  game.obs=[game.createHazard('spike',0,4,0)];game.last=performance.now();game.update();
  assert.ok(game.health<100);
  assert.equal(game.hits,1);
  assert.equal(game.waves[0].hit,true);
  scene.dispose();engine.dispose();
});
