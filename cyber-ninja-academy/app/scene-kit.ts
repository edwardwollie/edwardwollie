import {
  type AbstractMesh, Color3, PointLight, type TransformNode, Color4, DefaultRenderingPipeline, DirectionalLight, DynamicTexture, type AbstractEngine, GlowLayer,
  HemisphericLight, ImageProcessingConfiguration, Mesh, MeshBuilder, Scene, ShadowGenerator,
  StandardMaterial, type Camera, Vector3,
} from "@babylonjs/core";

/** Shared cinematic look for every 3D view: fog, glow, ACES grading, bloom. */
export const isMobile=()=>typeof window!=="undefined"&&(window.innerWidth<760||matchMedia("(pointer: coarse)").matches);
const isNull=(engine:{getClassName():string})=>engine.getClassName()==="NullEngine";

export function cinematicScene(engine:AbstractEngine,fog=.0048){
  const s=new Scene(engine);
  s.clearColor=new Color4(.012,.018,.055,1);
  s.fogMode=Scene.FOGMODE_EXP2;s.fogDensity=fog;s.fogColor=new Color3(.03,.04,.1);
  s.ambientColor=new Color3(.12,.14,.22);
  if(!isNull(engine))new GlowLayer("neon",s,{blurKernelSize:isMobile()?16:28}).intensity=.62;
  return s;
}

export function studioLights(scene:Scene,shadowSize?:number){
  const h=new HemisphericLight("sky",new Vector3(0,1,0),scene);
  h.intensity=.75;h.diffuse=new Color3(.42,.6,.9);h.groundColor=new Color3(.1,.08,.2);h.specular=new Color3(.1,.15,.2);
  const moon=new DirectionalLight("moon",new Vector3(-.45,-1,.32),scene);
  moon.position=new Vector3(18,42,-20);moon.intensity=1.55;moon.diffuse=new Color3(.75,.9,1);
  const rim=new DirectionalLight("magenta-rim",new Vector3(.72,-.35,-.56),scene);
  rim.position=new Vector3(-18,14,35);rim.diffuse=new Color3(.75,.15,.55);rim.intensity=.7;rim.specular=new Color3(.6,.2,.5);
  const size=shadowSize??(isMobile()?1024:2048);
  const shadow=new ShadowGenerator(size,moon);
  shadow.usePercentageCloserFiltering=true;shadow.filteringQuality=ShadowGenerator.QUALITY_MEDIUM;
  shadow.bias=.0012;shadow.normalBias=.02;shadow.darkness=.25;
  return {hemi:h,moon,rim,shadow};
}

/**
 * Camera-side key light that only touches the operative, so the dark carbon
 * suit always reads against the night city (a standard third-person trick).
 */
export function heroFill(scene:Scene,hero:TransformNode,camera:Camera){
  const light=new PointLight("heroFill",new Vector3(0,3,-3),scene);
  light.diffuse=new Color3(.62,.86,1);light.specular=new Color3(.5,.7,.9);light.intensity=.9;light.range=14;
  light.includedOnlyMeshes=hero.getChildMeshes() as AbstractMesh[];
  scene.onBeforeRenderObservable.add(()=>{
    const toCam=camera.globalPosition.subtract(hero.getAbsolutePosition());toCam.y=0;
    if(toCam.lengthSquared()<1e-4)return;toCam.normalize();
    light.position.copyFrom(hero.getAbsolutePosition().add(toCam.scale(3.2)).add(new Vector3(0,3.4,0)));
  });
  return light;
}

/** Bloom, ACES tone mapping, FXAA, light grain and vignette. */
export function postFx(scene:Scene,camera:Camera){
  if(isNull(scene.getEngine()))return null;
  const mobile=isMobile();
  const p=new DefaultRenderingPipeline("cinema",true,scene,[camera]);
  p.fxaaEnabled=true;
  p.bloomEnabled=true;p.bloomThreshold=.62;p.bloomWeight=.38;p.bloomKernel=mobile?32:64;p.bloomScale=.5;
  p.imageProcessingEnabled=true;
  const ip=p.imageProcessing;
  ip.toneMappingEnabled=true;ip.toneMappingType=ImageProcessingConfiguration.TONEMAPPING_ACES;
  ip.exposure=1.05;ip.contrast=1.18;
  ip.vignetteEnabled=true;ip.vignetteWeight=2.2;ip.vignetteColor=new Color4(.02,0,.08,0);
  if(!mobile){
    p.chromaticAberrationEnabled=true;p.chromaticAberration.aberrationAmount=4;
    p.grainEnabled=true;p.grain.intensity=4;p.grain.animated=true;
  }
  return p;
}

/** Star field + horizon gradient dome and a glowing city floor far below. */
export function skyDome(scene:Scene,centre=Vector3.Zero(),radius=900){
  if(isNull(scene.getEngine()))return;
  const tex=new DynamicTexture("skyTex",{width:1024,height:512},scene,false);
  const ctx=tex.getContext() as CanvasRenderingContext2D;
  const g=ctx.createLinearGradient(0,0,0,512);
  g.addColorStop(0,"#02030c");g.addColorStop(.42,"#080b26");g.addColorStop(.5,"#2a0d3d");
  g.addColorStop(.535,"#5a1449");g.addColorStop(.56,"#0b1630");g.addColorStop(1,"#02040b");
  ctx.fillStyle=g;ctx.fillRect(0,0,1024,512);
  let s=91;const r=()=>(s=(s*1664525+1013904223)>>>0)/0x100000000;
  for(let i=0;i<700;i++){const y=r()*230,a=.25+r()*.75;ctx.fillStyle=`rgba(${190+r()*65|0},${200+r()*55|0},255,${a})`;ctx.fillRect(r()*1024,y,r()<.08?2:1,r()<.08?2:1)}
  ctx.fillStyle="rgba(255,90,190,.9)";ctx.beginPath();ctx.arc(760,150,26,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="rgba(255,200,240,.95)";ctx.beginPath();ctx.arc(760,150,19,0,Math.PI*2);ctx.fill();
  tex.update();
  const dome=MeshBuilder.CreateSphere("skyDome",{diameter:radius*2,segments:24,sideOrientation:Mesh.BACKSIDE},scene);
  dome.position.copyFrom(centre);
  const m=new StandardMaterial("skyMat",scene);m.emissiveTexture=tex;m.disableLighting=true;m.fogEnabled=false;
  m.diffuseColor=Color3.Black();m.specularColor=Color3.Black();
  dome.material=m;dome.infiniteDistance=true;dome.isPickable=false;dome.applyFog=false;
  return dome;
}

export function cityFloor(scene:Scene,centre:Vector3,size=1400,depth=-70){
  if(isNull(scene.getEngine()))return;
  const tex=new DynamicTexture("streetTex",{width:1024,height:1024},scene,true);
  const ctx=tex.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle="#03050d";ctx.fillRect(0,0,1024,1024);
  let s=37;const r=()=>(s=(s*1664525+1013904223)>>>0)/0x100000000;
  for(let i=0;i<1024;i+=64){
    ctx.fillStyle="rgba(255,150,60,.55)";ctx.fillRect(i,0,3,1024);
    ctx.fillStyle="rgba(40,230,255,.45)";ctx.fillRect(0,i,1024,3);
  }
  for(let i=0;i<900;i++){ctx.fillStyle=r()<.5?"rgba(255,70,170,.8)":"rgba(80,240,255,.8)";ctx.fillRect(r()*1024,r()*1024,2,2)}
  tex.update();tex.uScale=tex.vScale=8;
  const floor=MeshBuilder.CreateGround("cityFloor",{width:size,height:size},scene);
  floor.position.set(centre.x,depth,centre.z);
  const m=new StandardMaterial("streetMat",scene);m.emissiveTexture=tex;m.diffuseColor=Color3.Black();m.specularColor=Color3.Black();
  floor.material=m;floor.isPickable=false;
  return floor;
}

/** Tiny synth: sound effects plus an optional synthwave pulse. */
export class Synth{
  ctx:AudioContext|null=null;master:GainNode|null=null;music=false;timer:number|null=null;step=0;
  wake(){
    try{
      if(!this.ctx){this.ctx=new AudioContext();this.master=this.ctx.createGain();this.master.gain.value=.9;this.master.connect(this.ctx.destination)}
      if(this.ctx.state==="suspended")void this.ctx.resume();
    }catch{}
  }
  tone(freq:number,duration=.08,volume=.035,type:OscillatorType="sawtooth",slide=0){
    try{
      this.wake();if(!this.ctx||!this.master)return;
      const t=this.ctx.currentTime,osc=this.ctx.createOscillator(),gain=this.ctx.createGain();
      osc.type=type;osc.frequency.setValueAtTime(freq,t);if(slide)osc.frequency.exponentialRampToValueAtTime(Math.max(30,freq*slide),t+duration);
      gain.gain.setValueAtTime(volume,t);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
      osc.connect(gain).connect(this.master);osc.start(t);osc.stop(t+duration+.02);
    }catch{}
  }
  noise(duration=.2,volume=.05,cutoff=1800){
    try{
      this.wake();if(!this.ctx||!this.master)return;
      const t=this.ctx.currentTime,len=Math.floor(this.ctx.sampleRate*duration),buf=this.ctx.createBuffer(1,len,this.ctx.sampleRate),d=buf.getChannelData(0);
      for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*(1-i/len);
      const src=this.ctx.createBufferSource(),f=this.ctx.createBiquadFilter(),g=this.ctx.createGain();
      src.buffer=buf;f.type="lowpass";f.frequency.value=cutoff;g.gain.value=volume;
      src.connect(f).connect(g).connect(this.master);src.start(t);
    }catch{}
  }
  setMusic(on:boolean){
    this.music=on;
    if(!on){if(this.timer!==null)clearInterval(this.timer);this.timer=null;return}
    this.wake();if(this.timer!==null)return;
    const bass=[55,55,65.4,49];const arp=[220,261.6,329.6,392,329.6,261.6,246.9,293.7];
    this.timer=window.setInterval(()=>{
      if(!this.ctx||document.hidden)return;
      const k=this.step++;
      if(k%4===0)this.tone(bass[(k>>4)%4],.42,.05,"sawtooth",.98);
      if(k%2===0)this.tone(arp[(k>>1)%8]*((k>>5)%2?1.5:1),.16,.012,"triangle");
      if(k%8===4)this.noise(.06,.02,6000);
    },140);
  }
  close(){this.setMusic(false);try{void this.ctx?.close()}catch{}}
}
