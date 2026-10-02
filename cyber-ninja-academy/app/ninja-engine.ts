/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Color3, Engine, Mesh, MeshBuilder, Scene, ShadowGenerator, StandardMaterial, TransformNode,
  UniversalCamera, Vector3,
} from "@babylonjs/core";
import {BlueprintBuilder} from "./blueprint-mesh";
import {airPose,applyPose,buildNinjaRig,runPose,slidePose,strikePose,type Rig} from "./ninja-rig";
import {cinematicScene,cityFloor,heroFill,isMobile,postFx,skyDome,studioLights,Synth} from "./scene-kit";
import {planCourse,type HazardKind} from "./course-plan";
import type { Mission, UpgradeKey } from "./ninja-data";

type ActionCue = { kind:"strike"|"jump"|"slide"|"dodge"|"lock"; label:string; hint:string; urgency:number } | null;
type CB = { onHud:(v:any)=>void; onMessage:(t:string,k:string)=>void; onComplete:(v:any)=>void; onFail:()=>void };
type ObstacleKind = HazardKind|"drone"|"shard";
type Obstacle = { root:TransformNode; kind:ObstacleKind; hit:boolean; wave?:number; ring?:Mesh; outerRing?:Mesh; slashA?:Mesh; slashB?:Mesh; targetMat?:StandardMaterial };
type WaveState = {z:number;hit:boolean;passed:boolean};
type Effect = { mesh:Mesh; velocity:Vector3; ttl:number; spin:number };
type Up = Record<UpgradeKey,number>;

function material(scene:Scene,name:string,color:Color3,emissive=.08,alpha=1){
  const m=new StandardMaterial(name,scene);m.diffuseColor=color;m.emissiveColor=color.scale(emissive);m.specularColor=Color3.White().scale(.35);m.alpha=alpha;return m;
}
function seeded(seed:number){let state=seed>>>0;return()=>{state=(state*1664525+1013904223)>>>0;return state/0x100000000}}

export class NinjaEngine{
  engine:Engine;scene:Scene;camera:UniversalCamera;player:TransformNode;rig:Rig;mission:Mission;up:Up;cb:CB;obs:Obstacle[]=[];effects:Effect[]=[];
  lane=0;targetLane=0;y=0;vy=0;sliding=false;slideTimer=0;attacking=false;attackTimer=0;distance=0;shards=0;drones=0;health=100;score=0;combo=0;
  waves:WaveState[]=[];passedWaves=0;cleanWaves=0;hits=0;
  builder:BlueprintBuilder;roofModules:TransformNode[]=[];towerModules:{root:TransformNode;side:number}[]=[];nextRoofZ=0;nextTowerZ:Record<number,number>={[-1]:0,[1]:0};
  last=performance.now();finished=false;speed=13;keys=new Set<string>();shadow:ShadowGenerator;runClock=0;impactShake=0;hitStop=0;hudClock=0;audio:AudioContext|null=null;synth=new Synth();strikeVariant=0;

  constructor(canvas:HTMLCanvasElement,mission:Mission,up:Up,cb:CB,opts:{music?:boolean}={}){
    this.mission=mission;this.up=up;this.cb=cb;this.speed=Math.min(18,12.8+(mission.id-1)*.42);
    this.engine=new Engine(canvas,true,{antialias:true,powerPreference:"high-performance",stencil:true});this.engine.setHardwareScalingLevel(Math.max(1,window.devicePixelRatio/(isMobile()?1.3:1.6)));this.scene=this.makeScene();this.builder=new BlueprintBuilder(this.scene);this.shadow=this.lights();this.rig=this.makeNinja();this.player=this.rig.root;
    this.camera=new UniversalCamera("chase",new Vector3(0,4.1,-6.6),this.scene);this.camera.inputs.clear();this.camera.minZ=.1;this.camera.maxZ=2000;this.camera.fov=.9;
    this.world();this.spawnCourse();postFx(this.scene,this.camera);heroFill(this.scene,this.rig.root,this.camera);skyDome(this.scene);cityFloor(this.scene,new Vector3(0,0,this.mission.distance/2),Math.max(1400,this.mission.distance+600));
    if(opts.music)this.synth.setMusic(true);
    this.bind();this.engine.runRenderLoop(()=>this.update());window.addEventListener("resize",this.resize);
  }
  resize=()=>this.engine.resize();
  makeScene(){return cinematicScene(this.engine)}
  lights(){const l=studioLights(this.scene);l.shadow.getShadowMap()!.refreshRate=1;return l.shadow}

  makeNinja():Rig{
    const rig=buildNinjaRig(this.scene,this.builder);
    rig.root.position.set(0,0,4);rig.root.getChildMeshes().forEach(mesh=>this.shadow.addShadowCaster(mesh));
    return rig;
  }

  world(){
    const road=MeshBuilder.CreateGround("roofRun",{width:12.3,height:this.mission.distance+180},this.scene);
    road.position.set(0,-.085,this.mission.distance/2);road.material=this.builder.tinted("floor","#14223a",4);road.receiveShadows=true;
    for(let i=0;i<13;i++){
      const tile=new TransformNode(`roofModule${i}`,this.scene);tile.position.z=9+i*18;
      this.builder.instanceStatic("roof_tile",tile);this.roofModules.push(tile);
    }
    this.nextRoofZ=9+13*18;
    for(const side of [-1,1]){
      for(let i=0;i<9;i++){
        const tower=new TransformNode(`skyTower${side}-${i}`,this.scene);
        tower.position.set(side*(17+(i%3)*3),-1,i*42-30);
        tower.rotation.y=side<0?.13:-.13;
        this.builder.instanceStatic("sky_tower",tower);this.towerModules.push({root:tower,side});
      }
      this.nextTowerZ[side]=9*42-30;
    }
    const finish=new TransformNode("finishGate",this.scene);
    finish.position.z=this.mission.distance+4;
    this.builder.build("finish_gate",finish);
  }
  recycleWorld(){
    const z=this.player.position.z;
    for(const tile of this.roofModules)if(tile.position.z+9<z-27){
      tile.position.z=this.nextRoofZ;this.nextRoofZ+=18;
    }
    for(const tower of this.towerModules)if(tower.root.position.z+6<z-85){
      const next=this.nextTowerZ[tower.side];tower.root.position.z=next;
      tower.root.position.x=tower.side*(17+(Math.floor(next/42)%3)*3);
      this.nextTowerZ[tower.side]+=42;
    }
  }
  createShard(lane:number,z:number){
    const root=new TransformNode(`shardRoot${z}`,this.scene);root.position.set(lane,1.25,z);
    this.builder.build("shard",root);return{root,kind:"shard" as const,hit:false};
  }
  createDrone(lane:number,z:number){
    const root=new TransformNode(`droneRoot${z}`,this.scene);root.position.set(lane,1.55,z);
    const parts=this.builder.build("drone",root),ring=parts.get("targetInner")!,outerRing=parts.get("targetOuter")!;
    const target=this.builder.material("magenta").clone(`targetMat${z}`) as StandardMaterial;
    for(const name of ["targetInner","targetOuter","slashLeft","slashRight"])parts.get(name)!.material=target;
    return{root,kind:"drone" as const,hit:false,ring,outerRing,
      slashA:parts.get("slashLeft")!,slashB:parts.get("slashRight")!,targetMat:target};
  }
  createHazard(kind:HazardKind,lane:number,z:number,wave:number):Obstacle{
    const root=new TransformNode(`${kind}Root${wave}-${lane}`,this.scene);
    root.position.set(lane,0,z);this.builder.buildCourseObstacle(kind,root);
    return{root,kind,hit:false,wave};
  }

  spawnCourse(){
    const course=planCourse(this.mission);
    this.waves=course.waves.map(w=>({z:w.z,hit:false,passed:false}));
    course.waves.forEach((wave,index)=>{
      for(const hazard of wave.hazards)this.obs.push(this.createHazard(hazard.kind,hazard.lane*3,wave.z,index));
    });
    for(const bonus of course.bonuses){
      this.obs.push(bonus.kind==="shard"?this.createShard(bonus.lane*3,bonus.z):this.createDrone(bonus.lane*3,bonus.z));
    }
  }

  bind(){window.addEventListener("keydown",this.down);window.addEventListener("keyup",this.keyUp)}
  down=(e:KeyboardEvent)=>{this.keys.add(e.code);if(e.code==="ArrowLeft"||e.code==="KeyA")this.shift(-1);if(e.code==="ArrowRight"||e.code==="KeyD")this.shift(1);if(e.code==="Space"||e.code==="ArrowUp"||e.code==="KeyW"){e.preventDefault();this.jump()}if(e.code==="ArrowDown"||e.code==="KeyS")this.slide();if(e.code==="KeyF"||e.code==="KeyK")this.attack()};
  keyUp=(e:KeyboardEvent)=>this.keys.delete(e.code);
  wakeAudio(){this.synth?.wake()}
  tone(freq:number,duration=.08,volume=.035,type:OscillatorType="sawtooth"){this.synth?.tone(freq,duration,volume,type)}
  shift(d:number){this.wakeAudio();this.targetLane=Math.max(-1,Math.min(1,this.targetLane+d))}
  jump(){this.wakeAudio();if(this.y<=.02){this.vy=8.35+this.up.agility*.68;this.tone(420,.08,.018,"sine");this.cb.onMessage("AIR STEP","info")}}
  slide(){this.wakeAudio();if(this.y<=.05&&!this.sliding){this.sliding=true;this.slideTimer=.78;this.synth?.noise(.3,.04,1500);this.cb.onMessage("SHADOW SLIDE","info")}}
  attack(){this.wakeAudio();if(this.attackTimer>.12)return;this.attacking=true;this.attackTimer=.62;this.strikeVariant=(this.strikeVariant+1)%3;this.tone(180,.12,.04,"sawtooth");setTimeout(()=>this.tone(620,.06,.018,"triangle"),60);this.cb.onMessage("PHOTON EDGE — STRIKE!","strike")}

  burst(position:Vector3,color:Color3,count=9){const rnd=seeded(Math.floor(position.z*17+this.score*11+count));for(let i=0;i<count;i++){const spark=MeshBuilder.CreateBox(`spark${performance.now()}${i}`,{size:.12+rnd()*.13},this.scene);spark.position.copyFrom(position);spark.material=material(this.scene,`sparkMat${performance.now()}${i}`,color,1.2,.9);this.effects.push({mesh:spark,velocity:new Vector3((rnd()-.5)*7,1.5+rnd()*5,(rnd()-.5)*5),ttl:.45+rnd()*.25,spin:(rnd()-.5)*12})}}
  nearestCue():ActionCue{
    const playerZ=this.player.position.z;
    const ahead=this.obs.filter(o=>!o.hit).map(o=>({o,dz:o.root.position.z-playerZ,
      dx:Math.abs(o.root.position.x-this.lane)})).filter(v=>v.dz>0&&v.dz<30).sort((a,b)=>a.dz-b.dz);
    const hazard=ahead.find(v=>v.o.wave!==undefined&&v.dx<1.55);
    if(hazard){
      const {o,dz}=hazard,urgency=Math.max(0,Math.min(1,1-dz/24));
      if(o.kind==="wall"||o.kind==="crusher")return{kind:"dodge",label:"SHIFT TO A CLEAR LANE",hint:"A / D OR LEFT / RIGHT",urgency};
      if(o.kind==="barrier"||o.kind==="spike")return{kind:"jump",label:dz>this.speed*.48?"PREPARE TO JUMP":"JUMP NOW",hint:"SPACE / W OR JUMP",urgency};
      return{kind:"slide",label:dz>this.speed*.50?"PREPARE TO SLIDE":"SLIDE NOW",hint:"S / DOWN OR SLIDE",urgency};
    }
    const drone=ahead.find(v=>v.o.kind==="drone"&&v.dz<14);
    if(drone)return{kind:"lock",label:"BONUS DRONE",hint:"OPTIONAL STRIKE / F / K",urgency:Math.max(0,1-drone.dz/14)};
    if(this.mission.distance-this.distance<36)return{kind:"lock",label:"FINISH IN SIGHT",hint:"SURVIVE TO THE GATE",urgency:.8};
    return null;
  }

  trialResult(){
    const cleanRate=this.cleanWaves/Math.max(1,this.waves.length);
    const stars=this.health>=75&&this.hits<=1&&cleanRate>=.9?3:this.health>=40&&cleanRate>=.7?2:1;
    const bonusCredits=Math.round(this.mission.reward*(.12*this.shards/this.mission.shards+.08*this.drones/this.mission.drones));
    return {score:this.score,health:Math.round(this.health),gates:this.passedWaves,
      clean:this.cleanWaves,hits:this.hits,shards:this.shards,drones:this.drones,
      stars,baseCredits:this.mission.reward,bonusCredits,credits:this.mission.reward+bonusCredits};
  }

  finishTrial(){
    if(this.finished)return;
    this.finished=true;this.synth?.setMusic(false);
    if(this.health<=0){this.cb.onFail();return}
    this.score+=Math.round(this.mission.distance*1.5);
    this.cb.onComplete(this.trialResult());
  }

  updateNinja(dt:number){
    this.runClock+=dt*(8.5+this.speed*.13);
    const pose=this.attackTimer>0?strikePose(1-this.attackTimer/.62,this.strikeVariant):
      this.sliding?slidePose(this.runClock):this.y>.05?airPose(this.vy):runPose(this.runClock,1);
    applyPose(this.rig,pose,Math.min(1,dt*(this.attackTimer>0?24:16)));
    const p=this.attackTimer>0?1-this.attackTimer/.62:0;
    this.rig.trails.forEach(t=>t.setEnabled(p>.12&&p<.8));
  }
  updateEffects(dt:number){for(let i=this.effects.length-1;i>=0;i--){const e=this.effects[i];e.ttl-=dt;e.velocity.y-=8*dt;e.mesh.position.addInPlace(e.velocity.scale(dt));e.mesh.rotation.x+=e.spin*dt;e.mesh.rotation.y+=e.spin*.7*dt;e.mesh.scaling.scaleInPlace(Math.max(.88,1-dt*2.2));if(e.ttl<=0){e.mesh.dispose(false,true);this.effects.splice(i,1)}}}
  animateTarget(o:Obstacle,dt:number){if(o.kind!=="drone"||!o.ring||!o.outerRing||!o.targetMat)return;const dz=o.root.position.z-this.player.position.z,active=dz>-1.5&&dz<15.5,ready=dz>-1&&dz<12.8,pulse=1+Math.sin(performance.now()*.012)*(ready?.13:.06);o.ring.scaling.setAll(active?pulse:.9+Math.sin(performance.now()*.005)*.04);o.outerRing.scaling.setAll(active?1.06+Math.sin(performance.now()*.009)*.11:1);o.outerRing.rotation.z+=dt*(ready?3.4:1.4);if(o.slashA)o.slashA.scaling.y=ready?1.15+Math.sin(performance.now()*.016)*.12:1;if(o.slashB)o.slashB.scaling.y=ready?1.15+Math.sin(performance.now()*.016)*.12:1;const c=ready?new Color3(.08,1,.92):active?new Color3(1,.28,.06):new Color3(.72,.12,1);o.targetMat.diffuseColor=c;o.targetMat.emissiveColor=c.scale(1.25)}

  update(){
    const now=performance.now(),dt=Math.min(.04,(now-this.last)/1000);this.last=now;if(this.finished)return;if(this.hitStop>0)this.hitStop=Math.max(0,this.hitStop-dt);const moveDt=this.hitStop>0?0:dt;
    if(this.attackTimer>0){this.attackTimer=Math.max(0,this.attackTimer-dt);this.attacking=this.attackTimer>0}else this.attacking=false;
    if(this.slideTimer>0){this.slideTimer=Math.max(0,this.slideTimer-dt);if(this.slideTimer<=0){this.sliding=false}}
    this.distance+=this.speed*moveDt;this.lane+=(this.targetLane*3-this.lane)*moveDt*(8.2+this.up.agility*.75);this.y+=this.vy*moveDt;this.vy-=20*moveDt;if(this.y<0){this.y=0;this.vy=0}
    const dash=this.attacking?Math.sin((1-this.attackTimer/.62)*Math.PI)*(.52+this.up.agility*.08):0;this.player.position.set(this.lane,this.y,this.distance+4+dash);this.player.rotation.z=(this.targetLane*3-this.lane)*-.075;this.updateNinja(dt);this.recycleWorld();
    this.impactShake=Math.max(0,this.impactShake-dt*2.8);const sx=this.impactShake?(Math.random()-.5)*this.impactShake:0,sy=this.impactShake?(Math.random()-.5)*this.impactShake*.6:0;this.camera.position.set(this.lane*.3+sx,4.1+this.y*.35+sy,this.distance-6.6);this.camera.fov+=((this.attacking?.84:.9+Math.min(.08,(this.speed-13)*.012))-this.camera.fov)*dt*10;this.camera.setTarget(this.player.position.add(new Vector3(0,1.05-this.y*.4,7.5)));
    for(const o of this.obs){
      if(o.hit)continue;
      const dzRaw=o.root.position.z-this.player.position.z;
      if(dzRaw<-5){o.hit=true;continue}
      if(o.kind==="drone"){
        o.root.position.y=1.55+Math.sin(now*.003+o.root.position.z)*.13;this.animateTarget(o,dt);
      }else if(o.kind==="shard"){
        o.root.rotation.y+=dt*2.6;o.root.rotation.z+=dt*.9;
      }
      const dz=Math.abs(dzRaw),dx=Math.abs(o.root.position.x-this.lane);
      const reach=o.kind==="drone"&&this.attacking?2.15+this.up.blade*.38:1.28;
      if(dz>=(o.kind==="drone"?1.75:1.15)||dx>=reach)continue;
      if(o.kind==="shard"){
        o.hit=true;o.root.setEnabled(false);this.shards++;this.score+=25;
        this.tone(820,.08,.022,"sine");this.burst(o.root.getAbsolutePosition(),new Color3(.08,.95,1),5);
        this.cb.onMessage("BONUS SHARD COLLECTED","good");
      }else if(o.kind==="drone"){
        if(!this.attacking)continue; // Passing a bonus target never damages the runner.
        o.hit=true;o.root.setEnabled(false);this.drones++;this.score+=75;
        this.hitStop=.065;this.impactShake=.28;
        this.tone(110,.13,.06,"square");this.tone(760,.1,.028,"triangle");
        this.burst(o.root.getAbsolutePosition(),new Color3(1,.08,.48),13);
        this.cb.onMessage("BONUS DRONE DESTROYED","strike");
      }else if(((o.kind==="beam"||o.kind==="sweep")&&this.sliding)||
               ((o.kind==="barrier"||o.kind==="spike")&&this.y>(o.kind==="spike"?.72:.95))){
        o.hit=true;
        this.cb.onMessage(o.kind==="beam"||o.kind==="sweep"?"CLEAN SLIDE":"CLEAN JUMP","good");
      }else{
        const damage=o.kind==="crusher"?28:o.kind==="wall"?26:o.kind==="spike"?24:22;
        this.health=Math.max(0,this.health-damage*(1-this.up.armor*.18));
        this.hits++;this.combo=0;this.impactShake=.32;
        if(o.wave!==undefined)this.waves[o.wave].hit=true;
        o.hit=true;o.root.setEnabled(false);
        this.tone(70,.15,.055,"square");
        this.cb.onMessage(o.kind==="wall"||o.kind==="crusher"?"IMPACT — SHIFT EARLIER":"IMPACT — READ THE GATE","warn");
      }
    }
    for(const wave of this.waves){
      if(wave.passed||wave.z>=this.player.position.z-1.75)continue;
      wave.passed=true;this.passedWaves++;
      if(!wave.hit){this.cleanWaves++;this.combo++;this.score+=120+Math.min(150,this.combo*6)}
    }
    this.updateEffects(dt);
    if(this.health<=0){this.finished=true;this.synth?.setMusic(false);this.cb.onFail()}
    else if(this.distance>=this.mission.distance)this.finishTrial();
    this.hudClock+=dt;
    if(this.hudClock>=.075){
      this.hudClock=0;
      this.cb.onHud({distance:Math.min(100,Math.round(this.distance/this.mission.distance*100)),
        health:Math.round(this.health),gates:`${this.passedWaves}/${this.waves.length}`,
        clean:this.cleanWaves,hits:this.hits,shards:`${this.shards}/${this.mission.shards}`,
        drones:`${this.drones}/${this.mission.drones}`,score:this.score,combo:this.combo,
        cue:this.nearestCue(),speed:this.speed.toFixed(1)});
    }
    this.scene.render();
  }
  destroy(){window.removeEventListener("resize",this.resize);window.removeEventListener("keydown",this.down);window.removeEventListener("keyup",this.keyUp);this.effects.forEach(e=>e.mesh.dispose(false,true));this.synth?.close();this.scene.dispose();this.engine.dispose()}
}
