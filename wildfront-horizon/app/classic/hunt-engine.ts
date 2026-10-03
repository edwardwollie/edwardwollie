/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Color3,Color4,DirectionalLight,Engine,GlowLayer,HemisphericLight,Mesh,MeshBuilder,
  Scene,ShadowGenerator,StandardMaterial,TransformNode,UniversalCamera,Vector3
} from "@babylonjs/core";

type Mission={id:number;reserve:string;species:string;count:number;time:string;weather:string};
type Upgrades={optics:number;stability:number;tracking:number};
type AnimalState="graze"|"walk"|"alert"|"flee";
type Animal={
  root:TransformNode;species:string;alive:boolean;baseSpeed:number;speed:number;heading:number;targetHeading:number;
  phase:number;state:AnimalState;stateTimer:number;herd:number;meshes:any[];legs:any[];head?:any;chest?:any;lastTrack:number;hitPauseUntil:number;
};
type Callbacks={onHud:(hud:any)=>void;onMessage:(text:string,kind:string)=>void;onComplete:(stats:any)=>void};

const palettes:any={
  "Aurora Pines":{sky:new Color4(.06,.20,.34,1),ground:new Color3(.10,.27,.19),tree:new Color3(.035,.31,.21),accent:new Color3(.20,.95,1),rock:new Color3(.24,.29,.33)},
  "Crimson Highlands":{sky:new Color4(.34,.12,.18,1),ground:new Color3(.38,.16,.10),tree:new Color3(.25,.07,.16),accent:new Color3(1,.38,.25),rock:new Color3(.40,.28,.26)},
  "Verdant Basin":{sky:new Color4(.045,.23,.22,1),ground:new Color3(.11,.36,.20),tree:new Color3(.018,.25,.13),accent:new Color3(.55,1,.22),rock:new Color3(.21,.32,.27)},
  "Obsidian Steppe":{sky:new Color4(.13,.17,.25,1),ground:new Color3(.24,.22,.17),tree:new Color3(.18,.24,.16),accent:new Color3(.86,.68,1),rock:new Color3(.22,.22,.25)},
  "All Reserves":{sky:new Color4(.12,.10,.28,1),ground:new Color3(.18,.27,.22),tree:new Color3(.06,.28,.20),accent:new Color3(.85,.35,1),rock:new Color3(.27,.25,.34)}
};

const speciesColor:any={
  "Mule Deer":new Color3(.48,.29,.16),"Red Deer":new Color3(.58,.22,.09),"Elk":new Color3(.45,.31,.18),
  "Wild Boar":new Color3(.19,.14,.12),"Bighorn Sheep":new Color3(.55,.47,.34),"Bison":new Color3(.21,.12,.075)
};

function mat(scene:Scene,name:string,color:Color3,emissive?:Color3){
  const m=new StandardMaterial(name,scene);m.diffuseColor=color;m.specularColor=Color3.White().scale(.18);m.specularPower=48;
  if(emissive)m.emissiveColor=emissive;return m;
}

export class HuntEngine{
  engine:Engine;scene:Scene;camera:UniversalCamera;animals:Animal[]=[];tracks:Mesh[]=[];shadow:ShadowGenerator;
  mission:Mission;upgrades:Upgrades;callbacks:Callbacks;canvas:HTMLCanvasElement;
  ammo=5;reserve=15;score=0;collected=0;shots=0;hits=0;clean=0;perfectShots=0;greatShots=0;goodShots=0;scoped=false;zoomLevel=0;reloading=false;scan=1;scanActive=0;
  wind=0;move={x:0,y:0};last=performance.now();finished=false;steady=false;steadyMeter=100;stepClock=0;scopeSway=0;nearTarget="";shotFeedback="";shotLabel="";shotFeedbackUntil=0;
  constructor(canvas:HTMLCanvasElement,mission:Mission,upgrades:Upgrades,callbacks:Callbacks){
    this.canvas=canvas;this.mission=mission;this.upgrades=upgrades;this.callbacks=callbacks;
    this.engine=new Engine(canvas,true,{antialias:true,powerPreference:"high-performance"});
    this.scene=this.makeScene();this.camera=this.makeCamera();this.shadow=this.makeLights();this.makeWorld();this.spawn();this.bind();
    this.engine.runRenderLoop(()=>this.update());window.addEventListener("resize",this.resize);
  }
  resize=()=>this.engine.resize();
  makeScene(){
    const s=new Scene(this.engine),p=palettes[this.mission.reserve]||palettes["All Reserves"];
    s.clearColor=p.sky;s.fogMode=Scene.FOGMODE_EXP2;
    const weather=this.mission.weather;s.fogDensity=weather==="Mist"?.018:weather==="Rain"?.010:weather==="Snow"?.012:weather==="Storm"?.014:.0055;
    s.fogColor=new Color3(p.sky.r,p.sky.g,p.sky.b);new GlowLayer("reserveGlow",s,{blurKernelSize:24}).intensity=.34;return s;
  }
  makeCamera(){
    const c=new UniversalCamera("hunter",new Vector3(0,1.72,-18),this.scene);c.minZ=.08;c.maxZ=340;c.fov=.88;c.speed=.32;c.angularSensibility=3600;
    c.keysUp=[87];c.keysDown=[83];c.keysLeft=[65];c.keysRight=[68];c.attachControl(this.canvas,true);return c;
  }
  makeLights(){
    const h=new HemisphericLight("sky",new Vector3(0,1,0),this.scene);h.intensity=this.mission.time==="Night"?.42:.72;h.diffuse=new Color3(.72,.82,1);h.groundColor=new Color3(.12,.10,.14);
    const sun=new DirectionalLight("sun",new Vector3(-.55,-1,.35),this.scene);sun.position=new Vector3(40,65,-35);sun.intensity=this.mission.time==="Night"?.55:2.0;
    sun.diffuse=this.mission.time==="Sunset"?new Color3(1,.42,.2):this.mission.time==="Dusk"?new Color3(.72,.58,1):new Color3(1,.88,.65);
    const sh=new ShadowGenerator(1024,sun);sh.useBlurExponentialShadowMap=true;sh.blurKernel=16;return sh;
  }
  makeWorld(){
    const p=palettes[this.mission.reserve]||palettes["All Reserves"];
    const ground=MeshBuilder.CreateGround("reserve",{width:190,height:190,subdivisions:2},this.scene);ground.material=mat(this.scene,"earth",p.ground);ground.receiveShadows=true;
    const trunk=mat(this.scene,"trunk",new Color3(.20,.09,.045)),leaf=mat(this.scene,"canopy",p.tree),rockMat=mat(this.scene,"rock",p.rock);
    const open=this.mission.reserve==="Obsidian Steppe";
    for(let i=0;i<(open?38:92);i++){
      const a=Math.random()*Math.PI*2,r=18+Math.random()*75,x=Math.cos(a)*r,z=Math.sin(a)*r;
      const t=MeshBuilder.CreateCylinder(`tree${i}`,{diameter:.28+Math.random()*.30,height:3+Math.random()*5,tessellation:7},this.scene);t.position.set(x,2.4,z);t.material=trunk;
      const crown=MeshBuilder.CreateCylinder(`crown${i}`,{diameterTop:0,diameterBottom:1.7+Math.random()*2.5,height:3.5+Math.random()*3.5,tessellation:7},this.scene);crown.position.set(x,4.8+Math.random()*2,z);crown.material=leaf;this.shadow.addShadowCaster(crown);
    }
    for(let i=0;i<44;i++){
      const m=MeshBuilder.CreatePolyhedron(`rock${i}`,{type:1,size:.7+Math.random()*2.5},this.scene);m.position.set((Math.random()-.5)*145,.35,(Math.random()-.5)*145);m.scaling.set(1+Math.random()*2,.5+Math.random(),1+Math.random()*2);m.rotation.y=Math.random()*Math.PI;m.material=rockMat;m.receiveShadows=true;
    }
    const brush=mat(this.scene,"brush",p.tree.scale(.72));
    for(let i=0;i<70;i++){
      const b=MeshBuilder.CreateSphere(`brush${i}`,{diameter:1,segments:6},this.scene);b.position.set((Math.random()-.5)*150,.35,(Math.random()-.5)*150);b.scaling.set(.5+Math.random()*1.3,.25+Math.random()*.45,.5+Math.random()*1.3);b.material=brush;
    }
    if(this.mission.reserve==="Verdant Basin"||this.mission.reserve==="All Reserves"){
      const water=MeshBuilder.CreateDisc("water",{radius:10,tessellation:48},this.scene);water.rotation.x=Math.PI/2;water.position.set(-25,.035,24);water.scaling.y=.55;water.material=mat(this.scene,"water",new Color3(.04,.28,.34),new Color3(.01,.08,.10));
    }
    // Elevated landmark silhouettes give each reserve stronger depth cues.
    for(let i=0;i<5;i++){
      const ridge=MeshBuilder.CreatePolyhedron(`ridge${i}`,{type:1,size:8+Math.random()*8},this.scene);ridge.position.set(-75+i*34,-1,62+Math.sin(i)*12);ridge.scaling.set(1.8,1.2,1.1);ridge.material=rockMat;
    }
  }
  addPart(root:TransformNode,meshes:any[],mesh:any,material:any,pos:[number,number,number],scale:[number,number,number],rot:[number,number,number]=[0,0,0]){
    mesh.parent=root;mesh.position.set(...pos);mesh.scaling.set(...scale);mesh.rotation.set(...rot);mesh.material=material;meshes.push(mesh);return mesh;
  }
  creature(species:string,index:number,herd:number,origin:Vector3){
    const root=new TransformNode(`wildlife${index}`,this.scene);root.position.set(origin.x+(Math.random()-.5)*10,0,origin.z+(Math.random()-.5)*10);
    const coat=mat(this.scene,`coat${index}`,speciesColor[species]||speciesColor["Mule Deer"]),belly=mat(this.scene,`belly${index}`,new Color3(.68,.57,.40)),dark=mat(this.scene,`dark${index}`,new Color3(.045,.03,.025)),bone=mat(this.scene,`bone${index}`,new Color3(.64,.52,.35)),eye=mat(this.scene,`eye${index}`,new Color3(.01,.008,.006),new Color3(.04,.025,.01));
    const meshes:any[]=[],legs:any[]=[];const boar=species==="Wild Boar",bison=species==="Bison",sheep=species==="Bighorn Sheep",elk=species==="Elk";
    const size=bison?1.45:elk?1.22:boar?1.05:sheep?.92:1;
    const body=this.addPart(root,meshes,MeshBuilder.CreateSphere(`torso${index}`,{diameter:1,segments:18},this.scene),coat,[0,1.12*size,0],[bison?1.8:boar?1.5:1.42,bison?.90:.70*size,bison?.84:.60*size]);
    const chest=this.addPart(root,meshes,MeshBuilder.CreateSphere(`chest${index}`,{diameter:1,segments:16},this.scene),coat,[.66,1.23*size,0],[bison?.92:.72,bison?.94:.76*size,bison?.84:.62*size]);
    const shoulder=this.addPart(root,meshes,MeshBuilder.CreateSphere(`shoulder${index}`,{diameter:1,segments:14},this.scene),bison?dark:coat,[.35,1.40*size,0],[bison?1.05:.68,bison?1.18:.68,bison?.88:.58]);
    const neck=this.addPart(root,meshes,MeshBuilder.CreateCylinder(`neck${index}`,{diameterTop:.46,diameterBottom:bison?.82:.64,height:1,tessellation:14},this.scene),coat,[.93,1.66*size,0],[1,boar?.62:bison?.95:.82,1],[0,0,boar?-.72:bison?-.42:-.48]);
    const head=this.addPart(root,meshes,MeshBuilder.CreateSphere(`head${index}`,{diameter:1,segments:16},this.scene),coat,[bison?1.42:1.26,bison?2.08:boar?1.52:1.96*size,0],[bison?.82:boar?.72:.58,bison?.70:boar?.54:.68,bison?.65:boar?.53:.48]);
    this.addPart(root,meshes,MeshBuilder.CreateSphere(`muzzle${index}`,{diameter:1,segments:14},this.scene),boar||bison?dark:belly,[bison?1.94:boar?1.78:1.60,bison?1.94:boar?1.44:1.86*size,0],[bison?.56:boar?.62:.45,bison?.34:boar?.38:.30,bison?.50:boar?.48:.34]);
    if(bison){
      // Hump + beard give bison a clearly different silhouette.
      this.addPart(root,meshes,MeshBuilder.CreateSphere(`hump${index}`,{diameter:1,segments:14},this.scene),dark,[.22,2.05,0],[1.15,.72,.9]);
      this.addPart(root,meshes,MeshBuilder.CreateCylinder(`beard${index}`,{diameterTop:.15,diameterBottom:.48,height:.72,tessellation:9},this.scene),dark,[1.62,1.55,0],[1,1,1],[0,0,.15]);
    }
    for(const side of [-1,1]){
      this.addPart(root,meshes,MeshBuilder.CreateCylinder(`ear${index}_${side}`,{diameterTop:0,diameterBottom:.32,height:.55,tessellation:8},this.scene),coat,[1.16,bison?2.48:boar?1.91:2.42*size,side*(bison?.42:.28)],[1,1,boar?.7:1],[0,0,side*.14]);
      const e=this.addPart(root,meshes,MeshBuilder.CreateSphere(`eye${index}_${side}`,{diameter:.10,segments:8},this.scene),eye,[bison?1.76:boar?1.62:1.55,bison?2.17:boar?1.63:2.05*size,side*(bison?.50:boar?.42:.39)],[1,1,.55]);e.metadata={decor:true};
      if(boar)this.addPart(root,meshes,MeshBuilder.CreateCylinder(`tusk${index}_${side}`,{diameterTop:0,diameterBottom:.12,height:.42,tessellation:10},this.scene),bone,[1.92,1.32,side*.35],[1,1,1],[0,0,-.7]);
    }
    for(const x of [-.78,.62])for(const side of [-1,1]){
      const phase=(x>0?0:Math.PI)+(side>0?Math.PI:0);
      const upper=this.addPart(root,meshes,MeshBuilder.CreateCylinder(`legUpper${index}_${x}_${side}`,{diameterTop:bison?.24:.18,diameterBottom:bison?.32:.25,height:bison?1.02:.85,tessellation:10},this.scene),coat,[x,bison?.84:.72*size,side*(bison?.48:.34*size)],[1,size,1]);upper.metadata={walkPhase:phase};legs.push(upper);
      const lower=this.addPart(root,meshes,MeshBuilder.CreateCylinder(`legLower${index}_${x}_${side}`,{diameterTop:bison?.14:.105,diameterBottom:bison?.19:.15,height:bison?.82:.72,tessellation:9},this.scene),dark,[x,.28,side*(bison?.48:.34*size)],[1,size,1]);lower.metadata={walkPhase:phase};legs.push(lower);
      this.addPart(root,meshes,MeshBuilder.CreateBox(`hoof${index}_${x}_${side}`,{width:bison?.34:.26,height:.13,depth:bison?.28:.20},this.scene),dark,[x+.08,.055,side*(bison?.48:.34*size)],[1,1,1]);
    }
    this.addPart(root,meshes,MeshBuilder.CreateSphere(`tail${index}`,{diameter:1,segments:10},this.scene),species==="Mule Deer"?belly:coat,[-1.48,1.34*size,0],[boar?.42:bison?.34:.30,boar?.18:bison?.42:.38,.28],[0,0,-.45]);
    if(!boar){
      if(sheep||bison){
        for(const side of [-1,1]){
          const horn=this.addPart(root,meshes,MeshBuilder.CreateTorus(`horn${index}_${side}`,{diameter:sheep?.62:.48,thickness:sheep?.11:.08,tessellation:18},this.scene),bone,[1.32,bison?2.48:2.37*size,side*(sheep?.28:.36)],[1,1,1],[Math.PI/2,0,side*.5]);
          horn.scaling.x=.72;
        }
      }else{
        for(const side of [-1,1]){
          this.addPart(root,meshes,MeshBuilder.CreateCylinder(`antlerBase${index}_${side}`,{diameter:.075,height:.82,tessellation:9},this.scene),bone,[1.18,2.62*size,side*.18],[1,1,1],[0,0,side*.32]);
          const branches=elk?4:3;for(let branch=0;branch<branches;branch++)this.addPart(root,meshes,MeshBuilder.CreateCylinder(`antlerBranch${index}_${side}_${branch}`,{diameterTop:.025,diameterBottom:.06,height:.44+.09*branch,tessellation:8},this.scene),bone,[1.17+branch*.08,2.75*size+branch*.16,side*(.30+branch*.08)],[1,1,1],[side*.22,0,side*(.72-branch*.10)]);
        }
      }
    }
    const animal:Animal={root,species,alive:true,baseSpeed:.26+Math.random()*.16,speed:.30,heading:Math.random()*Math.PI*2,targetHeading:Math.random()*Math.PI*2,phase:Math.random()*10,state:"walk",stateTimer:3+Math.random()*5,herd,meshes,legs,head,chest,lastTrack:0,hitPauseUntil:0};
    // Head/muzzle and the visible upper torso are reliable scoring zones.
    for(const mesh of meshes){
      const n=String(mesh.name||"");
      const headZone=mesh===head||n.startsWith("muzzle")||n.startsWith("eye")||n.startsWith("ear");
      mesh.metadata={...(mesh.metadata||{}),animal,zone:headZone?"head":(mesh===chest||mesh===shoulder)?"vital":mesh===body?"torso":"body"};
      this.shadow.addShadowCaster(mesh);
    }
    return animal;
  }
  spawn(){
    const types=this.mission.species==="Mixed"?["Mule Deer","Wild Boar","Bighorn Sheep","Elk"]:[this.mission.species];
    const total=Math.max(9,this.mission.count+6);const herdCenters=[new Vector3(-32,0,22),new Vector3(28,0,30),new Vector3(-5,0,55),new Vector3(42,0,-18)];
    for(let i=0;i<total;i++){const herd=i%herdCenters.length;this.animals.push(this.creature(types[i%types.length],i,herd,herdCenters[herd]));}
  }
  bind(){
    this.canvas.addEventListener("click",this.pointerClick);window.addEventListener("keydown",this.keyDown);window.addEventListener("keyup",this.keyUp);
  }
  pointerClick=()=>{if(document.pointerLockElement!==this.canvas)this.canvas.requestPointerLock?.();else this.shoot();};
  keyDown=(e:KeyboardEvent)=>{if(e.code==="KeyR")this.reload();if(e.code==="KeyQ")this.toggleScope();if(e.code==="KeyE")this.pulseScan();if(e.code==="ShiftLeft"||e.code==="ShiftRight")this.setSteady(true);};
  keyUp=(e:KeyboardEvent)=>{if(e.code==="ShiftLeft"||e.code==="ShiftRight")this.setSteady(false);};
  setSteady(v:boolean){this.steady=v&&this.scoped&&this.steadyMeter>3;}
  toggleScope(){this.zoomLevel=(this.zoomLevel+1)%3;this.scoped=this.zoomLevel>0;const zoomBoost=this.upgrades.optics*.018;this.camera.fov=this.zoomLevel===0?.88:this.zoomLevel===1?.34-zoomBoost:.19-zoomBoost*.55;if(!this.scoped)this.steady=false;}
  pulseScan(){
    if(this.scan<1)return;this.scan=0;this.scanActive=2.7+this.upgrades.tracking*.65;this.callbacks.onMessage("TRAIL SCANNER — FRESH SIGN HIGHLIGHTED","info");
  }
  scareAnimals(origin:Vector3,radius:number,strong=false){
    for(const a of this.animals){if(!a.alive)continue;const d=Vector3.Distance(origin,a.root.position);if(d>radius)continue;a.state="flee";a.stateTimer=4+Math.random()*3;a.targetHeading=Math.atan2(a.root.position.z-origin.z,a.root.position.x-origin.x)+(Math.random()-.5)*.5;a.speed=(strong?2.7:2.0)+Math.random()*.6;}
  }

  setShotFeedback(kind:"good"|"great"|"perfect"|"miss",label:string,duration=560){
    this.shotFeedback=kind;this.shotLabel=label;this.shotFeedbackUntil=performance.now()+duration;
  }
  impact(point:Vector3|undefined,kind:"hit"|"vital"){
    if(!point)return;
    const color=kind==="vital"?new Color3(.79,1,.28):new Color3(1,.61,.22);
    const flash=MeshBuilder.CreateSphere(`impact_${performance.now()}`,{diameter:.16,segments:8},this.scene);
    flash.position.copyFrom(point);flash.material=mat(this.scene,`impactMat_${Math.random()}`,color,color.scale(1.4));
    const ring=MeshBuilder.CreateTorus(`impactRing_${performance.now()}`,{diameter:.55,thickness:.035,tessellation:20},this.scene);
    ring.position.copyFrom(point);ring.billboardMode=Mesh.BILLBOARDMODE_ALL;ring.material=mat(this.scene,`impactRingMat_${Math.random()}`,color,color.scale(.9));
    setTimeout(()=>{flash.dispose();ring.dispose();},260);
  }
  recoil(animal:Animal,strong=false){
    animal.root.rotation.z=strong?.62:.28;animal.root.scaling.setAll(strong?.92:.97);
    if(!strong)setTimeout(()=>{if(animal.root&&!animal.root.isDisposed()){animal.root.rotation.z=0;animal.root.scaling.setAll(1);}},620);
  }
  isVitalContact(animal:Animal,mesh:any,point:Vector3|undefined){
    if(mesh?.metadata?.zone==="head"||mesh?.metadata?.zone==="vital")return true;
    if(mesh?.metadata?.zone!=="torso"||!point||!animal.chest)return false;
    const center=animal.chest.getAbsolutePosition();
    const radius=animal.species==="Bison"?1.34:animal.species==="Elk"?1.12:animal.species==="Wild Boar"?1.02:.98;
    return Vector3.Distance(point,center)<=radius;
  }
  staggerAndFlee(animal:Animal){
    animal.state="alert";animal.stateTimer=.72;animal.speed=0;animal.hitPauseUntil=performance.now()+720;
    setTimeout(()=>{if(animal.alive&&animal.root&&!animal.root.isDisposed()){animal.root.rotation.z=0;animal.root.scaling.setAll(1);animal.state="flee";animal.stateTimer=7;animal.speed=3.0;}},720);
  }
  shoot(){
    if(this.finished||this.reloading)return;if(this.ammo<=0){this.callbacks.onMessage("MAGAZINE EMPTY — RELOAD","warn");return;}
    this.ammo--;this.shots++;
    const w=this.engine.getRenderWidth(),h=this.engine.getRenderHeight();
    const swayBase=this.scoped?(this.steady?.35:1)*(1-this.upgrades.optics*.17):1.25;
    const swayPx=this.scopeSway*swayBase*(this.zoomLevel===2?10:this.zoomLevel===1?6:3);
    const pick=this.scene.pick(w/2+swayPx,h/2+Math.cos(performance.now()*.0023)*swayPx*.4,(m:any)=>Boolean(m.metadata?.animal?.alive));
    this.scareAnimals(this.camera.position,34,true);
    if(!pick?.hit||!pick.pickedMesh){
      this.score=Math.max(0,this.score-5);this.setShotFeedback("miss","MISS",340);this.callbacks.onMessage("MISS — FOLLOW THE ANIMAL, NOT THE RETICLE","miss");return;
    }
    const meta=pick.pickedMesh.metadata,animal:Animal=meta.animal,dist=Vector3.Distance(this.camera.position,animal.root.position);
    const vital=this.isVitalContact(animal,pick.pickedMesh,pick.pickedPoint),headshot=meta.zone==="head";
    this.hits++;
    if(!vital){
      this.goodShots++;this.impact(pick.pickedPoint,"hit");this.recoil(animal,false);this.staggerAndFlee(animal);
      const pts=Math.round(75+Math.max(0,70-dist)*.35);this.score+=pts;
      this.setShotFeedback("good","GOOD SHOT",820);
      this.callbacks.onMessage(`GOOD SHOT · BODY HIT · ${Math.round(dist)}m · +${pts}`,"good");return;
    }
    this.impact(pick.pickedPoint,"vital");this.recoil(animal,true);
    animal.alive=false;animal.speed=0;animal.hitPauseUntil=Number.POSITIVE_INFINITY;this.collected++;this.clean++;
    const rangeBonus=Math.max(0,130-dist),steadyBonus=this.steady?25:0;
    if(headshot){
      this.perfectShots++;const pts=Math.round(340+rangeBonus+steadyBonus);this.score+=pts;
      this.setShotFeedback("perfect","PERFECT · HEADSHOT",1100);
      this.callbacks.onMessage(`PERFECT HEADSHOT · VITAL ${animal.species.toUpperCase()} · ${Math.round(dist)}m · +${pts}`,"good");
    }else{
      this.greatShots++;const pts=Math.round(260+rangeBonus+steadyBonus);this.score+=pts;
      this.setShotFeedback("great","GREAT SHOT · VITAL",1000);
      this.callbacks.onMessage(`GREAT SHOT · VITAL ${animal.species.toUpperCase()} · ${Math.round(dist)}m · +${pts}`,"good");
    }
    setTimeout(()=>{if(animal.root&&!animal.root.isDisposed())animal.root.setEnabled(false);if(this.collected>=this.mission.count)this.finish();},1050);
  }
  reload(){
    if(this.reloading||this.ammo===5||this.reserve<=0)return;this.reloading=true;this.callbacks.onMessage("RELOADING…","info");
    setTimeout(()=>{const need=5-this.ammo,take=Math.min(need,this.reserve);this.ammo+=take;this.reserve-=take;this.reloading=false;},Math.max(650,1320-this.upgrades.stability*150));
  }
  setMove(x:number,y:number){this.move={x,y};}
  setLook(x:number,y:number){this.camera.rotation.y+=x*.0028;this.camera.rotation.x=Math.max(-1.1,Math.min(1.1,this.camera.rotation.x+y*.0025));}
  finish(){this.finished=true;const accuracy=this.shots?Math.round(this.hits/this.shots*100):0;setTimeout(()=>this.callbacks.onComplete({score:this.score,accuracy,shots:this.shots,hits:this.hits,clean:this.clean,perfect:this.perfectShots,great:this.greatShots,good:this.goodShots}),700);}
  addTrack(a:Animal){
    if(this.tracks.length>90){const old=this.tracks.shift();old?.dispose();}
    const p=palettes[this.mission.reserve]||palettes["All Reserves"],f=MeshBuilder.CreateDisc(`track_${performance.now()}_${Math.random()}`,{radius:.16,tessellation:10},this.scene);f.rotation.x=Math.PI/2;f.rotation.y=-a.heading;f.position.set(a.root.position.x,.028,a.root.position.z);f.scaling.y=.46;f.material=mat(this.scene,`trackMat_${Math.random()}`,p.accent,p.accent.scale(.22));f.visibility=this.scanActive>0?.90:.10+this.upgrades.tracking*.06;this.tracks.push(f);
  }
  targetInfo(){
    const pick=this.scene.pick(this.engine.getRenderWidth()/2,this.engine.getRenderHeight()/2,(m:any)=>Boolean(m.metadata?.animal?.alive));
    if(!pick?.hit||!pick.pickedMesh)return {range:"—",species:"NO TARGET",state:"SCANNING"};
    const a:Animal=pick.pickedMesh.metadata.animal;return {range:`${Math.round(Vector3.Distance(this.camera.position,a.root.position))}m`,species:a.species.toUpperCase(),state:a.state.toUpperCase()};
  }
  updateAnimal(a:Animal,dt:number,now:number){
    if(!a.alive)return;if(now<a.hitPauseUntil){a.root.position.y=Math.max(0,a.root.position.y);return;}a.phase+=dt;a.stateTimer-=dt;
    const playerDist=Vector3.Distance(this.camera.position,a.root.position);
    if(a.state!=="flee"&&playerDist<9){a.state="flee";a.stateTimer=6;a.targetHeading=Math.atan2(a.root.position.z-this.camera.position.z,a.root.position.x-this.camera.position.x);a.speed=2.6;}
    if(a.stateTimer<=0){
      if(a.state==="flee"){a.state="alert";a.stateTimer=2.5;a.speed=.12;}
      else if(a.state==="alert"){a.state=Math.random()>.45?"walk":"graze";a.stateTimer=3+Math.random()*5;a.speed=a.baseSpeed;}
      else {a.state=Math.random()>.40?"walk":"graze";a.stateTimer=3+Math.random()*6;a.targetHeading+= (Math.random()-.5)*1.5;a.speed=a.state==="graze"?.04:a.baseSpeed;}
    }
    // Herd awareness: alerted animals raise nearby herd mates.
    if(a.state==="alert"){for(const mate of this.animals)if(mate!==a&&mate.alive&&mate.herd===a.herd&&mate.state==="graze")mate.state="walk";}
    a.heading+=(a.targetHeading-a.heading)*Math.min(1,dt*(a.state==="flee"?2.4:.7));
    if(a.state!=="graze"){a.root.position.x+=Math.cos(a.heading)*a.speed*dt;a.root.position.z+=Math.sin(a.heading)*a.speed*dt;}
    if(Math.abs(a.root.position.x)>82||Math.abs(a.root.position.z)>82){a.targetHeading+=Math.PI;a.heading=a.targetHeading;}
    a.root.rotation.y=-a.heading;
    const gait=a.state==="flee"?10:a.state==="walk"?5.5:1.5,amp=a.state==="flee"?.58:a.state==="walk"?.30:.05;
    for(const leg of a.legs)leg.rotation.x=Math.sin(a.phase*gait+(leg.metadata?.walkPhase||0))*amp;
    if(a.head){a.head.rotation.z=a.state==="graze"?.35+Math.sin(a.phase*1.6)*.08:Math.sin(a.phase*1.2)*.035;}
    a.root.position.y=Math.max(0,Math.sin(a.phase*gait)*amp*.045);
    if(a.state==="walk"||a.state==="flee"){a.lastTrack+=dt;if(a.lastTrack>(a.state==="flee"?.32:.72)){a.lastTrack=0;this.addTrack(a);}}
    // Scanner gives a soft emissive pulse without turning wildlife into neon silhouettes.
    if(this.scanActive>0){const pulse=.08+.09*(.5+.5*Math.sin(now*.008));for(const mesh of a.meshes){const m=mesh.material as StandardMaterial;if(m&&!m.emissiveColor.equals(Color3.Black()))continue;if(m)m.emissiveColor=(speciesColor[a.species]||new Color3(.3,.3,.3)).scale(pulse);}}
    else for(const mesh of a.meshes){const m=mesh.material as StandardMaterial;if(m)m.emissiveColor=Color3.Black();}
  }
  update(){
    const now=performance.now(),dt=Math.min(.05,(now-this.last)/1000);this.last=now;this.wind=Math.sin(now*.00019)*2.2+Math.sin(now*.00047)*.45;this.scan=Math.min(1,this.scan+dt*(.075+this.upgrades.tracking*.006));this.scanActive=Math.max(0,this.scanActive-dt);
    if(this.steady&&this.scoped){this.steadyMeter=Math.max(0,this.steadyMeter-dt*(18-this.upgrades.stability*2.4));if(this.steadyMeter<=0)this.steady=false;}else this.steadyMeter=Math.min(100,this.steadyMeter+dt*(12+this.upgrades.stability*2));
    this.scopeSway=.55+.45*Math.sin(now*.0018)+Math.abs(this.wind)*.07;
    const forward=this.camera.getDirection(Vector3.Forward()),right=this.camera.getDirection(Vector3.Right()),moveScale=this.scoped?.62:1;
    this.camera.position.addInPlace(forward.scale(this.move.y*dt*5.6*moveScale));this.camera.position.addInPlace(right.scale(this.move.x*dt*5.6*moveScale));this.camera.position.y=1.72;
    for(const a of this.animals)this.updateAnimal(a,dt,now);
    for(const t of this.tracks)t.visibility=this.scanActive>0?.92:.08+this.upgrades.tracking*.055;
    const target=this.targetInfo();
    this.callbacks.onHud({ammo:this.ammo,reserve:this.reserve,score:this.score,target:`${this.collected}/${this.mission.count}`,wind:this.wind.toFixed(1),scan:Math.round(this.scan*100),scoped:this.scoped,zoom:this.zoomLevel===2?"6×":this.zoomLevel===1?"3×":"1×",steady:Math.round(this.steadyMeter),steadyActive:this.steady,range:target.range,species:target.species,state:target.state,shotFeedback:now<this.shotFeedbackUntil?this.shotFeedback:"",shotLabel:now<this.shotFeedbackUntil?this.shotLabel:""});
    this.scene.render();
  }
  destroy(){window.removeEventListener("resize",this.resize);window.removeEventListener("keydown",this.keyDown);window.removeEventListener("keyup",this.keyUp);this.canvas.removeEventListener("click",this.pointerClick);this.scene.dispose();this.engine.dispose();}
}
