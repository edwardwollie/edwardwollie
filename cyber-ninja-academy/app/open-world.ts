/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Color3, DynamicTexture, Engine, Matrix, Mesh, MeshBuilder, PointLight, type Scene, StandardMaterial,
  TransformNode, UniversalCamera, Vector3, Viewport,
} from "@babylonjs/core";
import {BlueprintBuilder} from "./blueprint-mesh";
import {planCity,type Box,type CityPlan,type Sector} from "./city-plan";
import {airPose,applyPose,buildNinjaRig,dashPose,hurtPose,idlePose,runPose,strikePose,type Rig} from "./ninja-rig";
import {cinematicScene,cityFloor,heroFill,isMobile,postFx,skyDome,studioLights,Synth} from "./scene-kit";
import type {UpgradeKey} from "./ninja-data";

type Up=Record<UpgradeKey,number>;
type CB={onHud:(v:any)=>void;onMessage:(t:string,k:string)=>void;onComplete:(v:any)=>void;onFail:()=>void};
type Drone={root:TransformNode;hp:number;maxHp:number;elite:boolean;anchor:Vector3;vel:Vector3;cooldown:number;charge:number;
  alive:boolean;flash:number;phase:number;ring?:Mesh;ringMat?:StandardMaterial;aggro:boolean};
type Bolt={mesh:Mesh;vel:Vector3;ttl:number;damage:number;reflected?:boolean};
type Star={mesh:Mesh;vel:Vector3;ttl:number;target:Drone|null};
type Pickup={root:TransformNode;pos:Vector3;taken:boolean;kind:"shard"|"repair"};
type Spark={mesh:Mesh;vel:Vector3;ttl:number};

export const PLAYER={radius:.34,height:1.85,run:8.6,sprint:12.2,jump:9.4,doubleJump:8.6,gravity:24,dash:21,
  dashTime:.2,dashCooldown:.75,padLaunch:17.5,step:.45};

/** Axis-separated AABB character physics. Pure enough to unit test. */
export function moveBody(pos:Vector3,vel:Vector3,dt:number,solids:Box[],wasGrounded:boolean){
  const r=PLAYER.radius,h=PLAYER.height;let grounded=false,hitWall=false;
  const overlaps=(b:Box)=>pos.x+r>b.min[0]&&pos.x-r<b.max[0]&&pos.z+r>b.min[2]&&pos.z-r<b.max[2]&&pos.y+h>b.min[1]&&pos.y<b.max[1];
  for(const axis of ["x","z"] as const){
    const delta=vel[axis]*dt;if(!delta)continue;
    pos[axis]+=delta;
    const i=axis==="x"?0:2;
    for(const b of solids){
      if(!overlaps(b))continue;
      const rise=b.max[1]-pos.y;
      if(wasGrounded&&rise>0&&rise<=PLAYER.step){pos.y=b.max[1];continue}
      pos[axis]=delta>0?b.min[i]-r-1e-4:b.max[i]+r+1e-4;vel[axis]=0;hitWall=true;
    }
  }
  pos.y+=vel.y*dt;
  for(const b of solids){
    if(!overlaps(b))continue;
    if(vel.y<=0){pos.y=b.max[1];vel.y=0;grounded=true}
    else{pos.y=b.min[1]-h-1e-4;vel.y=0}
  }
  return {grounded,hitWall};
}

/** Ray against boxes; returns the nearest hit distance or Infinity. */
export function rayBoxes(origin:Vector3,dir:Vector3,maxDist:number,solids:Box[]){
  let best=maxDist;
  for(const b of solids){
    let t0=0,t1=best,ok=true;
    for(const [k,i] of [["x",0],["y",1],["z",2]] as const){
      const o=origin[k],d=dir[k];
      if(Math.abs(d)<1e-8){if(o<b.min[i]||o>b.max[i]){ok=false;break}continue}
      let a=(b.min[i]-o)/d,c=(b.max[i]-o)/d;if(a>c)[a,c]=[c,a];
      t0=Math.max(t0,a);t1=Math.min(t1,c);if(t0>t1){ok=false;break}
    }
    if(ok&&t0<best)best=t0;
  }
  return best;
}

export class OpenWorldEngine{
  engine:Engine;scene:Scene;camera:UniversalCamera;builder:BlueprintBuilder;rig:Rig;plan:CityPlan;sector:Sector;up:Up;cb:CB;
  synth=new Synth();shadow:any;
  pos=new Vector3();vel=new Vector3();yaw=0;facing=0;camYaw=0;camPitch=.32;camDist=6.4;grounded=true;coyote=0;jumpBuffer=0;jumps=1;
  move={x:0,y:0};keys=new Set<string>();sprint=false;
  dashTimer=0;dashCooldown=0;dashDir=new Vector3();
  attackTimer=0;attackLength=.42;combo=0;comboWindow=0;queued=false;hitDone=false;
  stars:Star[]=[];starCharges=3;starRegen=0;bolts:Bolt[]=[];sparks:Spark[]=[];
  drones:Drone[]=[];pickups:Pickup[]=[];pads:{pos:Vector3;dir:Vector3;core?:Mesh}[]=[];
  beaconRoot!:TransformNode;beaconLight!:PointLight;beaconActive=false;
  health=100;invuln=0;hurtTimer=0;shardsTaken=0;dronesDown=0;score=0;time=0;finished=false;falls=0;
  lastSafe=new Vector3();lockTarget:Drone|null=null;shake=0;hitStop=0;hudClock=0;runClock=0;flip=0;
  last=performance.now();pointerLocked=false;canvas:HTMLCanvasElement;

  constructor(canvas:HTMLCanvasElement,sector:Sector,up:Up,cb:CB,opts:{music?:boolean}={}){
    this.canvas=canvas;this.sector=sector;this.up=up;this.cb=cb;
    this.engine=new Engine(canvas,true,{antialias:true,powerPreference:"high-performance",stencil:true});
    this.engine.setHardwareScalingLevel(Math.max(1,window.devicePixelRatio/(isMobile()?1.3:1.6)));
    this.scene=cinematicScene(this.engine,.0065);this.builder=new BlueprintBuilder(this.scene);
    const lights=studioLights(this.scene);this.shadow=lights.shadow;
    this.plan=planCity(sector);
    this.camera=new UniversalCamera("orbit",new Vector3(0,6,-8),this.scene);this.camera.inputs.clear();
    this.camera.minZ=.1;this.camera.maxZ=2000;this.camera.fov=.95;
    this.rig=buildNinjaRig(this.scene,this.builder,"operative");
    this.rig.root.getChildMeshes().forEach(m=>{this.shadow.addShadowCaster(m);m.receiveShadows=true});
    this.buildCity();this.spawnActors();
    const sp=this.plan.spawn;this.pos.set(sp.x,sp.y,sp.z);this.lastSafe.copyFrom(this.pos);this.yaw=this.facing=this.camYaw=sp.yaw;
    postFx(this.scene,this.camera);heroFill(this.scene,this.rig.root,this.camera);
    this.bind();if(opts.music)this.synth.setMusic(true);
    this.engine.runRenderLoop(()=>this.update());window.addEventListener("resize",this.resize);
    // QA hook: ?debug exposes the running operation to automated playtests.
    if(new URLSearchParams(location.search).has("debug"))(window as any).__cyberOps=this;
  }
  resize=()=>this.engine.resize();

  // ------------------------------------------------------------------ world
  facade(){
    const tex=new DynamicTexture("facadeTex",{width:512,height:512},this.scene,true);
    const ctx=tex.getContext() as CanvasRenderingContext2D;
    ctx.fillStyle="#0a1424";ctx.fillRect(0,0,512,512);
    let s=5;const r=()=>(s=(s*1664525+1013904223)>>>0)/0x100000000;
    for(let y=0;y<512;y+=32)for(let x=0;x<512;x+=24){
      const lit=r();ctx.fillStyle=lit>.78?(r()<.5?"#3fdcff":"#ffd27a"):lit>.7?"#ff4fa8":"#111e33";
      ctx.globalAlpha=lit>.7?.85:1;ctx.fillRect(x+4,y+8,15,17);ctx.globalAlpha=1;
    }
    ctx.fillStyle="#1c2b44";for(let x=0;x<512;x+=96)ctx.fillRect(x,0,4,512);
    tex.update();return tex;
  }
  buildCity(){
    const facade=this.scene.getEngine().getClassName()==="NullEngine"?null:this.facade();
    const deck=this.builder.tinted("floor","#1b2a40",4),steel=this.builder.tinted("steel","#2e4258"),edge=this.builder.material("cyanGlass");
    const lip=this.builder.tinted("armor","#33506a"),mag=this.builder.material("magenta"),bridge=this.builder.tinted("steel","#24364b",2);
    for(const roof of this.plan.roofs){
      const height=roof.h+60;
      const mass=MeshBuilder.CreateBox(`tower-${roof.i}-${roof.j}`,{width:roof.w,height,depth:roof.d},this.scene);
      mass.position.set(roof.x,roof.h-height/2-.05,roof.z);
      const m=new StandardMaterial(`facade-${roof.i}-${roof.j}`,this.scene);
      if(facade){const t=facade.clone();t.uScale=roof.w/8;t.vScale=height/8;m.emissiveTexture=t;m.diffuseTexture=t}
      m.diffuseColor=new Color3(.18,.22,.3);m.emissiveColor=new Color3(.45,.5,.62);m.specularColor=new Color3(.1,.12,.16);
      mass.material=m;mass.freezeWorldMatrix();
      const top=MeshBuilder.CreateBox(`deck-${roof.i}-${roof.j}`,{width:roof.w,height:.1,depth:roof.d},this.scene);
      top.position.set(roof.x,roof.h-.05,roof.z);top.material=deck;top.receiveShadows=true;top.freezeWorldMatrix();
      for(const [w,d,x,z] of [[roof.w,.08,0,roof.d/2],[roof.w,.08,0,-roof.d/2],[.08,roof.d,roof.w/2,0],[.08,roof.d,-roof.w/2,0]]){
        const e=MeshBuilder.CreateBox("edge",{width:w+.02,height:.06,depth:d+.02},this.scene);
        e.position.set(roof.x+x,roof.h+.01,roof.z+z);e.material=(roof.i+roof.j)%2?edge:mag;e.freezeWorldMatrix();
      }
    }
    for(const b of this.plan.solids){
      if(b.kind==="roof")continue;
      const w=b.max[0]-b.min[0],h=b.max[1]-b.min[1],d=b.max[2]-b.min[2];
      const mesh=MeshBuilder.CreateBox(`${b.kind}`,{width:w,height:h,depth:d},this.scene);
      mesh.position.set((b.min[0]+b.max[0])/2,(b.min[1]+b.max[1])/2,(b.min[2]+b.max[2])/2);
      mesh.material=b.kind==="prop"?steel:b.kind==="lip"?lip:bridge;
      mesh.receiveShadows=true;this.shadow.addShadowCaster(mesh);
      if(b.kind==="prop"){
        const strip=MeshBuilder.CreateBox("propLight",{width:w+.04,height:.05,depth:d+.04},this.scene);
        strip.position.set(mesh.position.x,b.max[1]-.12,mesh.position.z);strip.material=edge;strip.freezeWorldMatrix();
      }
      if(b.kind==="bridge"){
        const glow=MeshBuilder.CreateBox("bridgeLight",{width:b.max[0]-b.min[0]>d?w:.06,height:.04,depth:b.max[0]-b.min[0]>d?.06:d},this.scene);
        glow.position.set(mesh.position.x,b.max[1]+.01,mesh.position.z);glow.material=edge;
      }
      mesh.freezeWorldMatrix();
    }
    // Distant skyline from the blueprint tower module, ringed around the city.
    const n=this.sector.grid,centre=(n-1)*11;
    for(let k=0;k<26;k++){
      const a=k/26*Math.PI*2,rad=(n*11)+70+(k%3)*22;
      const t=new TransformNode(`skyline${k}`,this.scene);
      t.position.set(centre+Math.cos(a)*rad,-30-(k%4)*6,centre+Math.sin(a)*rad);t.rotation.y=-a+Math.PI/2;
      t.scaling.setAll(1.3+(k%5)*.25);this.builder.instanceStatic("sky_tower",t);
    }
    skyDome(this.scene,new Vector3(centre,0,centre));cityFloor(this.scene,new Vector3(centre,0,centre));
  }

  spawnActors(){
    for(const s of this.plan.shards){
      const root=new TransformNode("shard",this.scene);root.position.set(s.x,s.y,s.z);root.scaling.setAll(.75);
      this.builder.build("shard",root);this.pickups.push({root,pos:root.position.clone(),taken:false,kind:"shard"});
    }
    for(const s of this.plan.repairs){
      const root=new TransformNode("repair",this.scene);root.position.set(s.x,s.y,s.z);
      this.builder.build("repair_cell",root);this.pickups.push({root,pos:root.position.clone(),taken:false,kind:"repair"});
    }
    for(const p of this.plan.pads){
      const root=new TransformNode("pad",this.scene);root.position.set(p.x,p.y,p.z);
      const parts=this.builder.build("jump_pad",root);
      this.pads.push({pos:new Vector3(p.x,p.y,p.z),dir:new Vector3(p.dx,0,p.dz),core:parts.get("padCore")});
    }
    this.beaconRoot=new TransformNode("beacon",this.scene);
    const b=this.plan.beacon;this.beaconRoot.position.set(b.x,b.y,b.z);
    this.builder.build("beacon",this.beaconRoot);this.beaconRoot.getChildMeshes().forEach(m=>m.visibility=.45);
    this.beaconLight=new PointLight("beaconLight",new Vector3(b.x,b.y+6,b.z),this.scene);
    this.beaconLight.diffuse=new Color3(.2,1,1);this.beaconLight.intensity=0;this.beaconLight.range=30;
    for(const d of this.plan.drones){
      const root=new TransformNode("drone",this.scene);root.position.set(d.x,d.y,d.z);
      const parts=this.builder.build("drone",root);
      for(const name of ["targetInner","targetOuter","slashLeft","slashRight"])parts.get(name)?.setEnabled(false);
      const ring=parts.get("targetInner")!,ringMat=this.builder.material("magenta").clone("droneRing") as StandardMaterial;
      ring.material=ringMat;
      if(d.elite){root.scaling.setAll(1.45);parts.get("optic")!.material=this.builder.material("red")}
      root.getChildMeshes().forEach(m=>this.shadow.addShadowCaster(m));
      const hp=(d.elite?6:3);
      this.drones.push({root,hp,maxHp:hp,elite:d.elite,anchor:new Vector3(d.x,d.y,d.z),vel:new Vector3(),
        cooldown:1.5+Math.random()*2,charge:0,alive:true,flash:0,phase:Math.random()*6,ring,ringMat,aggro:false});
    }
  }

  // ------------------------------------------------------------------ input
  bind(){
    window.addEventListener("keydown",this.down);window.addEventListener("keyup",this.keyUp);
    this.canvas.addEventListener("mousedown",this.mouseDown);this.canvas.addEventListener("contextmenu",this.noMenu);
    document.addEventListener("pointerlockchange",this.lockChange);document.addEventListener("mousemove",this.mouseMove);
  }
  noMenu=(e:Event)=>e.preventDefault();
  lockChange=()=>{this.pointerLocked=document.pointerLockElement===this.canvas};
  mouseDown=(e:MouseEvent)=>{
    this.synth.wake();
    if(!this.pointerLocked&&!isMobile()){try{void this.canvas.requestPointerLock()}catch{}return}
    if(e.button===0)this.attack();else if(e.button===2)this.throwStar();
  };
  mouseMove=(e:MouseEvent)=>{if(this.pointerLocked)this.look(e.movementX*.0026,e.movementY*.0022)};
  look(dx:number,dy:number){this.camYaw+=dx;this.camPitch=Math.max(-.35,Math.min(1.15,this.camPitch+dy))}
  down=(e:KeyboardEvent)=>{
    this.keys.add(e.code);this.synth.wake();
    if(e.code==="Space"){e.preventDefault();if(!e.repeat)this.jump()}
    if((e.code==="KeyF"||e.code==="KeyJ")&&!e.repeat)this.attack();
    if((e.code==="KeyE"||e.code==="KeyQ"||e.code==="KeyL")&&!e.repeat)this.dash();
    if((e.code==="KeyR"||e.code==="KeyK")&&!e.repeat)this.throwStar();
  };
  keyUp=(e:KeyboardEvent)=>this.keys.delete(e.code);
  setMove(x:number,y:number){this.move.x=x;this.move.y=y}

  // ---------------------------------------------------------------- actions
  jump(){
    this.jumpBuffer=.14;
  }
  doJump(){
    const agility=this.up.agility*.45;
    if(this.grounded||this.coyote>0){
      this.vel.y=PLAYER.jump+agility;this.grounded=false;this.coyote=0;this.synth.tone(360,.09,.02,"sine",1.8);return true;
    }
    if(this.jumps>0){
      this.jumps--;this.vel.y=PLAYER.doubleJump+agility;this.flip=1;
      this.synth.tone(520,.12,.02,"triangle",1.6);this.burst(this.pos.add(new Vector3(0,.2,0)),new Color3(.1,.9,1),6);
      return true;
    }
    return false;
  }
  dash(){
    if(this.dashCooldown>0)return;
    const dir=this.inputDir();if(dir.lengthSquared()<.01)dir.set(Math.sin(this.facing),0,Math.cos(this.facing));
    this.dashDir.copyFrom(dir.normalize());this.dashTimer=PLAYER.dashTime;this.dashCooldown=PLAYER.dashCooldown;this.invuln=Math.max(this.invuln,.22);
    this.facing=Math.atan2(dir.x,dir.z);this.synth.noise(.18,.05,3200);this.synth.tone(180,.16,.025,"sawtooth",2.5);
    this.cb.onMessage("PHASE DASH","info");
  }
  attack(){
    if(this.attackTimer>0&&this.attackTimer>this.attackLength*.45){this.queued=true;return}
    if(this.attackTimer>0){this.queued=true;return}
    this.startSwing();
  }
  startSwing(){
    this.combo=this.comboWindow>0?(this.combo+1)%3:0;
    this.attackLength=this.combo===2?.56:.42;this.attackTimer=this.attackLength;this.hitDone=false;this.queued=false;
    const target=this.softTarget(8,1.2);
    if(target){
      const d=target.root.position.subtract(this.pos);this.facing=Math.atan2(d.x,d.z);
      const flat=Math.hypot(d.x,d.z);
      if(flat>2.2){const lunge=Math.min(14,flat*2.6);this.vel.x=Math.sin(this.facing)*lunge;this.vel.z=Math.cos(this.facing)*lunge}
      if(d.y>1.6&&!this.grounded)this.vel.y=Math.max(this.vel.y,Math.min(9,d.y*2.4));
    }
    if(!this.grounded)this.vel.y=Math.max(this.vel.y,1.5);
    this.synth.noise(.12,.04,4200);this.synth.tone(this.combo===2?140:200,.14,.03,"sawtooth",3);
  }
  throwStar(){
    if(this.starCharges<1)return;
    this.starCharges--;
    const origin=this.pos.add(new Vector3(0,1.4,0));
    const target=this.softTarget(40,.5,true);
    let dir:Vector3;
    if(target)dir=target.root.position.subtract(origin).normalize();
    else{const f=this.cameraForward();dir=f}
    this.facing=Math.atan2(dir.x,dir.z);
    const mesh=MeshBuilder.CreateTorus("star",{diameter:.34,thickness:.06,tessellation:12},this.scene);
    mesh.material=this.builder.material("cyan");mesh.position.copyFrom(origin);
    const blade=MeshBuilder.CreateBox("starBlade",{width:.5,height:.02,depth:.08},this.scene);blade.parent=mesh;blade.material=this.builder.material("magenta");
    const cross=blade.clone("starBlade2");cross.parent=mesh;cross.rotation.y=Math.PI/2;
    this.stars.push({mesh,vel:dir.scale(38),ttl:1.4,target});
    this.synth.tone(900,.1,.02,"square",.5);
  }

  // ---------------------------------------------------------------- helpers
  cameraForward(){return new Vector3(Math.sin(this.camYaw)*Math.cos(this.camPitch*.6),-Math.sin(this.camPitch*.6)+.1,Math.cos(this.camYaw)*Math.cos(this.camPitch*.6)).normalize()}
  inputDir(){
    let x=this.move.x,y=this.move.y;
    if(this.keys.has("KeyW")||this.keys.has("ArrowUp"))y+=1;if(this.keys.has("KeyS")||this.keys.has("ArrowDown"))y-=1;
    if(this.keys.has("KeyD")||this.keys.has("ArrowRight"))x+=1;if(this.keys.has("KeyA")||this.keys.has("ArrowLeft"))x-=1;
    const len=Math.hypot(x,y);if(len>1){x/=len;y/=len}
    const fx=Math.sin(this.camYaw),fz=Math.cos(this.camYaw);
    return new Vector3(fx*y+fz*x,0,fz*y-fx*x);
  }
  /** Nearest live drone within range, weighted toward where the player aims. */
  softTarget(range:number,cone:number,useCamera=false){
    const aim=useCamera?Math.atan2(this.cameraForward().x,this.cameraForward().z):this.facing;
    let best:Drone|null=null,score=Infinity;
    for(const d of this.drones){
      if(!d.alive)continue;
      const v=d.root.position.subtract(this.pos),dist=v.length();if(dist>range)continue;
      let da=Math.atan2(v.x,v.z)-aim;da=Math.atan2(Math.sin(da),Math.cos(da));
      if(Math.abs(da)>cone+(dist<3.5?1.2:0))continue;
      const s=dist+Math.abs(da)*6;if(s<score){score=s;best=d}
    }
    return best;
  }
  burst(at:Vector3,color:Color3,count=10,speed=6){
    const mat=new StandardMaterial("spark",this.scene);mat.emissiveColor=color;mat.diffuseColor=color;mat.disableLighting=true;
    for(let i=0;i<count;i++){
      const m=MeshBuilder.CreateBox("spark",{size:.07+Math.random()*.09},this.scene);m.material=mat;m.position.copyFrom(at);
      this.sparks.push({mesh:m,vel:new Vector3((Math.random()-.5)*speed,Math.random()*speed*.8,(Math.random()-.5)*speed),ttl:.35+Math.random()*.35});
    }
  }
  damagePlayer(amount:number,from:Vector3){
    if(this.invuln>0||this.finished)return;
    const dmg=amount*(1-this.up.armor*.17);
    this.health=Math.max(0,this.health-dmg);this.invuln=.7;this.hurtTimer=.32;this.shake=.4;
    const push=this.pos.subtract(from);push.y=0;if(push.lengthSquared()>.01){push.normalize().scaleInPlace(7);this.vel.x+=push.x;this.vel.z+=push.z}
    this.synth.tone(80,.2,.06,"square",.6);this.synth.noise(.2,.05,900);
    this.cb.onMessage("INTEGRITY HIT","warn");
  }
  hitDrone(d:Drone,dmg:number,from:Vector3){
    if(!d.alive)return;
    d.hp-=dmg;d.flash=.12;d.aggro=true;this.hitStop=.05;this.shake=Math.max(this.shake,.18);
    const push=d.root.position.subtract(from);push.normalize();d.vel.addInPlace(push.scale(9));
    this.burst(d.root.position,new Color3(1,.25,.65),7,7);this.synth.tone(150,.1,.05,"square",.5);
    if(d.hp<=0){
      d.alive=false;d.root.setEnabled(false);this.dronesDown++;this.score+=d.elite?400:180;
      this.burst(d.root.position,new Color3(1,.1,.5),22,11);this.burst(d.root.position,new Color3(.1,1,1),12,8);
      this.synth.noise(.4,.08,1400);this.synth.tone(70,.4,.06,"sawtooth",.4);
      this.cb.onMessage(d.elite?"ELITE SENTINEL DOWN":"DRONE DESTROYED","strike");this.checkObjectives();
    }
  }
  checkObjectives(){
    if(!this.beaconActive&&this.shardsTaken>=this.plan.shards.length&&this.dronesDown>=this.drones.length){
      this.beaconActive=true;this.beaconRoot.getChildMeshes().forEach(m=>m.visibility=1);this.beaconLight.intensity=2.4;
      this.synth.tone(440,.3,.04,"triangle",2);setTimeout(()=>this.synth.tone(660,.4,.04,"triangle",1.5),180);
      this.cb.onMessage("UPLINK ONLINE — REACH THE BEACON","good");
    }
  }
  objective(){
    const p=this.pos;let best:{pos:Vector3;kind:string}|null=null,bd=Infinity;
    if(this.beaconActive)return {pos:this.beaconRoot.position.add(new Vector3(0,3,0)),kind:"beacon"};
    for(const s of this.pickups)if(!s.taken&&s.kind==="shard"){const d=Vector3.Distance(p,s.pos);if(d<bd){bd=d;best={pos:s.pos,kind:"shard"}}}
    if(!best)for(const d of this.drones)if(d.alive){const k=Vector3.Distance(p,d.root.position);if(k<bd){bd=k;best={pos:d.root.position,kind:"drone"}}}
    return best;
  }
  project(world:Vector3){
    const w=this.engine.getRenderWidth(),h=this.engine.getRenderHeight();
    const v=Vector3.Project(world,Matrix.Identity(),this.scene.getTransformMatrix(),new Viewport(0,0,w,h));
    const behind=Vector3.Dot(world.subtract(this.camera.position),this.camera.getForwardRay().direction)<0;
    return {x:v.x/w,y:v.y/h,behind};
  }

  // ----------------------------------------------------------------- update
  update(){
    const now=performance.now();let dt=Math.min(.04,(now-this.last)/1000);this.last=now;
    if(this.finished){this.scene.render();return}
    if(this.hitStop>0){this.hitStop-=dt;dt*=.15}
    this.time+=dt;
    this.updatePlayer(dt);this.updateCombat(dt);this.updateDrones(dt);this.updateProjectiles(dt);this.updatePickups(dt);
    this.updateRig(dt);this.updateCamera(dt);
    if(this.health<=0){this.finished=true;this.synth.setMusic(false);this.cb.onFail();}
    else if(this.beaconActive&&Vector3.Distance(this.pos,this.beaconRoot.position)<3.2)this.complete();
    this.hudClock+=dt;if(this.hudClock>.08){this.hudClock=0;this.pushHud()}
    this.scene.render();
  }
  updatePlayer(dt:number){
    this.coyote=Math.max(0,this.coyote-dt);this.jumpBuffer=Math.max(0,this.jumpBuffer-dt);
    this.dashCooldown=Math.max(0,this.dashCooldown-dt);this.invuln=Math.max(0,this.invuln-dt);this.hurtTimer=Math.max(0,this.hurtTimer-dt);
    this.starRegen+=dt;if(this.starCharges<3&&this.starRegen>2.2){this.starCharges++;this.starRegen=0}
    if(this.starCharges>=3)this.starRegen=0;
    const dir=this.inputDir();const moving=dir.lengthSquared()>.01;
    const sprint=this.keys.has("ShiftLeft")||this.keys.has("ShiftRight")||this.sprint;
    const top=(sprint?PLAYER.sprint:PLAYER.run)*(1+this.up.agility*.06);
    if(this.dashTimer>0){
      this.dashTimer-=dt;this.vel.x=this.dashDir.x*PLAYER.dash;this.vel.z=this.dashDir.z*PLAYER.dash;this.vel.y=Math.max(this.vel.y,0);
      if(Math.random()<.6)this.burst(this.pos.add(new Vector3(0,1,0)),new Color3(.2,.9,1),1,1);
    }else{
      const attacking=this.attackTimer>0&&this.grounded;
      const target=moving&&!attacking?dir.scale(top):Vector3.Zero();
      const accel=this.grounded?(moving?55:42):18;
      const k=Math.min(1,accel*dt/Math.max(1,top));
      this.vel.x+=(target.x-this.vel.x)*k*(this.grounded?1.6:1);this.vel.z+=(target.z-this.vel.z)*k*(this.grounded?1.6:1);
      if(moving&&this.attackTimer<=0){
        const want=Math.atan2(dir.x,dir.z);let da=want-this.facing;da=Math.atan2(Math.sin(da),Math.cos(da));
        this.facing+=da*Math.min(1,dt*(this.grounded?14:7));
      }
      this.vel.y-=PLAYER.gravity*dt;if(this.vel.y<-42)this.vel.y=-42;
    }
    if(this.jumpBuffer>0&&this.doJump())this.jumpBuffer=0;
    const was=this.grounded;
    const r=moveBody(this.pos,this.vel,dt,this.plan.solids,was);
    if(r.grounded){
      if(!was&&this.vel.y<=0){this.synth.tone(90,.06,.02,"sine");this.flip=0}
      this.grounded=true;this.jumps=1;this.coyote=.12;
      // Remember solid footing well away from roof edges for fall recovery.
      const roof=this.plan.roofs.find(f=>Math.abs(this.pos.x-f.x)<f.w/2-1.5&&Math.abs(this.pos.z-f.z)<f.d/2-1.5&&Math.abs(this.pos.y-f.h)<.01);
      if(roof)this.lastSafe.copyFrom(this.pos);
    }else{if(was)this.coyote=.12;this.grounded=false}
    for(const pad of this.pads){
      if(this.grounded&&Math.hypot(this.pos.x-pad.pos.x,this.pos.z-pad.pos.z)<1.15&&Math.abs(this.pos.y-pad.pos.y)<.6){
        this.vel.y=PLAYER.padLaunch;this.vel.x=pad.dir.x*8.5;this.vel.z=pad.dir.z*8.5;this.grounded=false;this.jumps=1;this.flip=1;
        this.synth.tone(220,.35,.05,"sawtooth",4);this.burst(pad.pos.add(new Vector3(0,.4,0)),new Color3(1,.3,.7),14,8);
        this.cb.onMessage("LAUNCH PAD","info");
      }
    }
    if(this.pos.y<-24){
      this.falls++;this.pos.copyFrom(this.lastSafe);this.pos.y+=.2;this.vel.setAll(0);
      this.health=Math.max(0,this.health-15);this.invuln=1;this.shake=.3;
      this.synth.tone(110,.4,.05,"square",.5);this.cb.onMessage("FALL RECOVERY — −15 INTEGRITY","warn");
    }
  }
  updateCombat(dt:number){
    this.comboWindow=Math.max(0,this.comboWindow-dt);
    if(this.attackTimer>0){
      this.attackTimer-=dt;const p=1-this.attackTimer/this.attackLength;
      if(!this.hitDone&&p>.42){
        this.hitDone=true;
        const reach=2.9+this.up.blade*.35,dmg=(this.combo===2?2:1)+(this.up.blade>=3?1:0);
        const f=new Vector3(Math.sin(this.facing),0,Math.cos(this.facing)),chest=this.pos.add(new Vector3(0,1.2,0));
        let hit=false;
        for(const d of this.drones){
          if(!d.alive)continue;
          const v=d.root.position.subtract(chest),flat=new Vector3(v.x,0,v.z),dist=flat.length();
          if(dist>reach*(d.elite?1.25:1)||Math.abs(v.y)>2.6)continue;
          if(dist>.6&&Vector3.Dot(flat.normalize(),f)<.2)continue;
          this.hitDrone(d,dmg,chest);hit=true;
        }
        if(!hit)this.synth.noise(.06,.015,7000);
      }
      if(this.attackTimer<=0){this.attackTimer=0;this.comboWindow=.38;if(this.queued)this.startSwing()}
    }
  }
  updateDrones(dt:number){
    const chest=this.pos.add(new Vector3(0,1.3,0));
    for(const d of this.drones){
      if(!d.alive)continue;
      d.phase+=dt;const toPlayer=chest.subtract(d.root.position),dist=toPlayer.length();
      if(dist<24)d.aggro=true;
      let goal:Vector3;
      if(d.aggro&&dist<45){
        const flat=new Vector3(-toPlayer.x,0,-toPlayer.z);if(flat.lengthSquared()<.01)flat.set(1,0,0);flat.normalize();
        const orbit=new Vector3(-flat.z,0,flat.x).scale(Math.sin(d.phase*.6)*4);
        goal=chest.add(flat.scale(d.elite?9:7.5)).add(orbit);goal.y=chest.y+2.4+Math.sin(d.phase*1.3)*.8;
      }else{
        goal=d.anchor.add(new Vector3(Math.sin(d.phase*.5)*3,Math.sin(d.phase*1.1)*.5,Math.cos(d.phase*.4)*3));
      }
      const steer=goal.subtract(d.root.position).scale(d.elite?1.1:1.5);
      d.vel.addInPlace(steer.subtract(d.vel).scale(Math.min(1,dt*2.2)));
      d.root.position.addInPlace(d.vel.scale(dt));
      d.root.rotation.y=Math.atan2(-toPlayer.x,-toPlayer.z);d.root.rotation.z=-d.vel.x*.03;
      // Firing: a visible charge, then a plasma bolt aimed slightly ahead.
      if(d.aggro&&dist<30&&!this.finished){
        d.cooldown-=dt;
        if(d.cooldown<.75&&d.cooldown>0){
          d.charge=1-d.cooldown/.75;d.ring?.setEnabled(true);d.ring?.scaling.setAll(1.4-d.charge*.9);
          if(d.ringMat){d.ringMat.emissiveColor=new Color3(1,.15+.4*(1-d.charge),.3)}
        }else d.ring?.setEnabled(false);
        if(d.cooldown<=0){
          d.cooldown=(d.elite?1.9:2.7)+Math.random()*1.2;d.charge=0;
          const lead=chest.add(this.vel.scale(.25)),shots=d.elite?3:1;
          for(let s=0;s<shots;s++){
            const dir=lead.subtract(d.root.position).normalize();
            if(s){const a=(s===1?.18:-.18);dir.set(dir.x*Math.cos(a)-dir.z*Math.sin(a),dir.y,dir.x*Math.sin(a)+dir.z*Math.cos(a))}
            const mesh=MeshBuilder.CreateSphere("bolt",{diameter:.32,segments:8},this.scene);
            mesh.material=this.builder.material(d.elite?"red":"orange");mesh.position.copyFrom(d.root.position);
            this.bolts.push({mesh,vel:dir.scale(d.elite?19:16),ttl:3,damage:d.elite?14:11});
          }
          this.synth.tone(d.elite?260:330,.18,.025,"square",.4);
        }
      }
      if(d.flash>0){d.flash-=dt;d.root.scaling.setAll((d.elite?1.45:1)*(1+d.flash*1.5))}
    }
  }
  updateProjectiles(dt:number){
    const chest=this.pos.add(new Vector3(0,1.15,0));
    for(let i=this.bolts.length-1;i>=0;i--){
      const b=this.bolts[i];b.ttl-=dt;b.mesh.position.addInPlace(b.vel.scale(dt));
      let dead=b.ttl<=0;
      if(!dead&&Vector3.Distance(b.mesh.position,chest)<.75){
        if(this.attackTimer>0&&this.attackTimer<this.attackLength*.7){
          // A well-timed swing reflects the bolt.
          b.vel.scaleInPlace(-1.4);b.ttl=1.5;b.reflected=true;this.synth.tone(1200,.1,.03,"triangle");this.cb.onMessage("DEFLECT!","good");this.score+=40;
        }else{this.damagePlayer(b.damage,b.mesh.position);dead=true}
      }
      if(!dead&&b.reflected)for(const d of this.drones)if(d.alive&&Vector3.Distance(d.root.position,b.mesh.position)<1){this.hitDrone(d,2,b.mesh.position);dead=true;break}
      if(!dead&&this.plan.solids.some(s=>{const p=b.mesh.position;return p.x>s.min[0]&&p.x<s.max[0]&&p.y>s.min[1]&&p.y<s.max[1]&&p.z>s.min[2]&&p.z<s.max[2]}))dead=true;
      if(dead){this.burst(b.mesh.position,new Color3(1,.5,.2),5,4);b.mesh.dispose();this.bolts.splice(i,1)}
    }
    for(let i=this.stars.length-1;i>=0;i--){
      const s=this.stars[i];s.ttl-=dt;
      if(s.target?.alive){const want=s.target.root.position.subtract(s.mesh.position).normalize().scale(38);s.vel.addInPlace(want.subtract(s.vel).scale(Math.min(1,dt*7)))}
      s.mesh.position.addInPlace(s.vel.scale(dt));s.mesh.rotation.y+=dt*30;
      let dead=s.ttl<=0;
      for(const d of this.drones)if(!dead&&d.alive&&Vector3.Distance(d.root.position,s.mesh.position)<(d.elite?1.5:1.1)){this.hitDrone(d,1,s.mesh.position);dead=true}
      if(!dead&&this.plan.solids.some(b=>{const p=s.mesh.position;return p.x>b.min[0]&&p.x<b.max[0]&&p.y>b.min[1]&&p.y<b.max[1]&&p.z>b.min[2]&&p.z<b.max[2]}))dead=true;
      if(dead){s.mesh.dispose();this.stars.splice(i,1)}
    }
    for(let i=this.sparks.length-1;i>=0;i--){
      const s=this.sparks[i];s.ttl-=dt;s.vel.y-=14*dt;s.mesh.position.addInPlace(s.vel.scale(dt));s.mesh.scaling.scaleInPlace(Math.max(.85,1-dt*3));
      if(s.ttl<=0){s.mesh.dispose();this.sparks.splice(i,1)}
    }
  }
  updatePickups(dt:number){
    const body=this.pos.add(new Vector3(0,.9,0));
    for(const p of this.pickups){
      if(p.taken)continue;
      p.root.rotation.y+=dt*2.2;p.root.position.y=p.pos.y+Math.sin(this.time*2.4+p.pos.x)*.15;
      if(Vector3.Distance(body,p.root.position)<1.45){
        if(p.kind==="repair"&&this.health>=100)continue;
        p.taken=true;p.root.setEnabled(false);
        if(p.kind==="shard"){this.shardsTaken++;this.score+=120;this.synth.tone(880,.1,.025,"sine",1.5);this.burst(p.pos,new Color3(.1,1,1),9);this.cb.onMessage(`DATA SHARD ${this.shardsTaken}/${this.plan.shards.length}`,"good");this.checkObjectives()}
        else{this.health=Math.min(100,this.health+35);this.synth.tone(600,.25,.03,"triangle",1.5);this.cb.onMessage("REPAIR CELL +35","good")}
      }
    }
    for(const pad of this.pads)if(pad.core)pad.core.scaling.y=1+Math.sin(this.time*6)*.5;
    if(this.beaconActive)this.beaconRoot.rotation.y+=dt*.8;
  }
  updateRig(dt:number){
    const rig=this.rig;rig.root.position.copyFrom(this.pos);
    rig.root.rotation.y=this.facing;
    const flat=Math.hypot(this.vel.x,this.vel.z);
    let pose;
    if(this.hurtTimer>0)pose=hurtPose();
    else if(this.dashTimer>0)pose=dashPose();
    else if(this.attackTimer>0)pose=strikePose(1-this.attackTimer/this.attackLength,this.combo);
    else if(!this.grounded)pose=airPose(this.vel.y,0);
    else if(flat>.6){this.runClock+=dt*(5+flat*.75);pose=runPose(this.runClock,Math.min(1,flat/PLAYER.sprint+.3))}
    else pose=idlePose(this.time);
    applyPose(rig,pose,Math.min(1,dt*(this.attackTimer>0?22:13)));
    // Double-jump somersault.
    if(this.flip>0&&!this.grounded){this.flip=Math.max(0,this.flip-dt*2.6);rig.joints.hips.rotation.x+=(1-this.flip)*Math.PI*2}
    rig.trails.forEach(t=>t.setEnabled(this.attackTimer>0&&this.attackTimer<this.attackLength*.75));
    rig.root.getChildMeshes().forEach(m=>{m.visibility=this.invuln>0&&this.hurtTimer<=0&&Math.floor(this.time*20)%2?.45:1});
  }
  updateCamera(dt:number){
    const target=this.pos.add(new Vector3(0,1.55,0));
    const back=new Vector3(-Math.sin(this.camYaw)*Math.cos(this.camPitch),Math.sin(this.camPitch),-Math.cos(this.camYaw)*Math.cos(this.camPitch));
    const speed=Math.hypot(this.vel.x,this.vel.z);
    const want=this.camDist+Math.min(1.6,speed*.08);
    const hit=rayBoxes(target,back,want,this.plan.solids);
    const dist=Math.max(1.2,hit-.35);
    const desired=target.add(back.scale(dist));
    this.camera.position=Vector3.Lerp(this.camera.position,desired,Math.min(1,dt*14));
    if(this.shake>0){this.shake=Math.max(0,this.shake-dt*2.5);this.camera.position.addInPlace(new Vector3((Math.random()-.5)*this.shake,(Math.random()-.5)*this.shake,0))}
    this.camera.setTarget(target.add(new Vector3(0,.2,0)));
    const fov=.95+(this.dashTimer>0?.14:0)+Math.min(.08,speed*.004);this.camera.fov+=(fov-this.camera.fov)*Math.min(1,dt*8);
    // Gently follow the player's heading when steering with the keyboard only.
    if(!this.pointerLocked&&this.move.x===0&&this.move.y===0&&speed>3&&this.attackTimer<=0){
      let da=this.facing-this.camYaw;da=Math.atan2(Math.sin(da),Math.cos(da));this.camYaw+=da*dt*.9;
    }
  }
  pushHud(){
    const obj=this.objective();let marker=null;
    if(obj){const s=this.project(obj.pos);marker={...s,kind:obj.kind,dist:Math.round(Vector3.Distance(this.pos,obj.pos))}}
    this.lockTarget=this.softTarget(12,.9,true);
    const lock=this.lockTarget?this.project(this.lockTarget.root.position):null;
    const radar:{x:number;z:number;k:string}[]=[];const cy=Math.cos(-this.camYaw),sy=Math.sin(-this.camYaw);
    const add=(p:Vector3,k:string)=>{const dx=p.x-this.pos.x,dz=p.z-this.pos.z,d=Math.hypot(dx,dz);if(d>70)return;radar.push({x:(dx*cy+dz*sy)/70,z:(-dx*sy+dz*cy)/70,k})};
    for(const d of this.drones)if(d.alive)add(d.root.position,d.elite?"elite":"drone");
    for(const p of this.pickups)if(!p.taken)add(p.pos,p.kind);
    add(this.beaconRoot.position,this.beaconActive?"beacon-on":"beacon");
    this.cb.onHud({health:Math.round(this.health),shards:this.shardsTaken,shardsTotal:this.plan.shards.length,
      drones:this.dronesDown,dronesTotal:this.drones.length,time:this.time,par:this.sector.par,score:this.score,
      stars:this.starCharges,starRegen:Math.min(1,this.starRegen/2.2),dash:1-this.dashCooldown/PLAYER.dashCooldown,
      beacon:this.beaconActive,marker,lock:lock&&!lock.behind?lock:null,lockHp:this.lockTarget?this.lockTarget.hp/this.lockTarget.maxHp:0,
      radar,combo:this.combo,locked:this.pointerLocked,altitude:Math.round(this.pos.y)});
  }
  result(){
    const t=this.time,stars=t<=this.sector.par&&this.health>=60&&this.falls===0?3:(t<=this.sector.par*1.5||this.health>=35)?2:1;
    const timeBonus=Math.max(0,Math.round((this.sector.par-t)*4));
    return {time:t,health:Math.round(this.health),drones:this.dronesDown,shards:this.shardsTaken,falls:this.falls,
      score:this.score+timeBonus+Math.round(this.health*5),stars,credits:this.sector.reward+Math.round(this.sector.reward*.25*(stars-1))};
  }
  complete(){
    if(this.finished)return;this.finished=true;this.synth.setMusic(false);
    this.synth.tone(523,.3,.04,"triangle");setTimeout(()=>this.synth.tone(784,.5,.04,"triangle"),160);
    this.cb.onComplete(this.result());
  }
  destroy(){
    window.removeEventListener("resize",this.resize);window.removeEventListener("keydown",this.down);window.removeEventListener("keyup",this.keyUp);
    this.canvas.removeEventListener("mousedown",this.mouseDown);this.canvas.removeEventListener("contextmenu",this.noMenu);
    document.removeEventListener("pointerlockchange",this.lockChange);document.removeEventListener("mousemove",this.mouseMove);
    if(document.pointerLockElement===this.canvas)document.exitPointerLock();
    this.synth.close();this.scene.dispose();this.engine.dispose();
  }
}
