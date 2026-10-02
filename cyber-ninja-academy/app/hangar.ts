import {ArcRotateCamera, Color3, Engine, MeshBuilder, StandardMaterial, Vector3} from "@babylonjs/core";
import {BlueprintBuilder} from "./blueprint-mesh";
import {applyPose,buildNinjaRig,POSE_SHEET,idlePose,runPose,type Rig} from "./ninja-rig";
import {cinematicScene,heroFill,postFx,skyDome,studioLights} from "./scene-kit";

/** Interactive 3D blueprint hangar: the exact playable model on a turntable. */
export const HANGAR_VIEWS:Record<string,[number,number]>={
  front:[Math.PI/2,Math.PI/2.15],rear:[-Math.PI/2,Math.PI/2.15],left:[Math.PI,Math.PI/2.15],right:[0,Math.PI/2.15],
  top:[Math.PI/2,.02],under:[Math.PI/2,Math.PI-.02],quarter:[Math.PI/3,Math.PI/2.6],
};

export class HangarViewer{
  engine:Engine;scene;camera:ArcRotateCamera;rig:Rig;pose="stance";spin=true;time=0;blueprint=false;
  private saved=new Map<StandardMaterial,boolean>();
  constructor(private canvas:HTMLCanvasElement){
    this.engine=new Engine(canvas,true,{antialias:true,stencil:true});
    this.engine.setHardwareScalingLevel(Math.max(1,window.devicePixelRatio/1.6));
    this.scene=cinematicScene(this.engine,.004);const builder=new BlueprintBuilder(this.scene);
    const lights=studioLights(this.scene,1024);
    this.camera=new ArcRotateCamera("hangarCam",Math.PI/3,Math.PI/2.4,4.6,new Vector3(0,1,0),this.scene);
    this.camera.attachControl(canvas,true);this.camera.lowerRadiusLimit=1.6;this.camera.upperRadiusLimit=9;
    this.camera.wheelDeltaPercentage=.01;this.camera.pinchDeltaPercentage=.004;this.camera.minZ=.05;
    canvas.addEventListener("pointerdown",this.stopSpin);
    this.rig=buildNinjaRig(this.scene,builder,"hangarNinja");
    this.rig.root.getChildMeshes().forEach(m=>lights.shadow.addShadowCaster(m));
    heroFill(this.scene,this.rig.root,this.camera);
    // Turntable with blueprint grid.
    const deck=MeshBuilder.CreateCylinder("turntable",{diameter:3.2,height:.08,tessellation:64},this.scene);
    deck.position.y=-.04;deck.material=builder.tinted("steel","#1d2c3d",3);deck.receiveShadows=true;
    const ring=MeshBuilder.CreateTorus("turntableRing",{diameter:3.25,thickness:.03,tessellation:96},this.scene);
    ring.material=builder.material("cyan");
    const grid=MeshBuilder.CreateGround("grid",{width:40,height:40,subdivisions:40},this.scene);
    const gm=new StandardMaterial("gridMat",this.scene);gm.wireframe=true;gm.emissiveColor=new Color3(.05,.35,.45);gm.disableLighting=true;gm.alpha=.35;
    grid.material=gm;grid.position.y=-.09;
    skyDome(this.scene);postFx(this.scene,this.camera);
    this.engine.runRenderLoop(()=>this.update());window.addEventListener("resize",this.resize);
  }
  stopSpin=()=>{this.spin=false};
  resize=()=>this.engine.resize();
  setPose(name:string){this.pose=name}
  setView(name:keyof typeof HANGAR_VIEWS){
    const [a,b]=HANGAR_VIEWS[name];this.spin=false;
    this.camera.alpha=a;this.camera.beta=b;this.camera.radius=name==="top"||name==="under"?4.2:4.4;
  }
  toggleBlueprint(){
    this.blueprint=!this.blueprint;
    for(const m of this.rig.root.getChildMeshes()){
      const mat=m.material as StandardMaterial|null;if(!mat)continue;
      if(!this.saved.has(mat))this.saved.set(mat,mat.wireframe);
      mat.wireframe=this.blueprint?true:this.saved.get(mat)!;
    }
    return this.blueprint;
  }
  update(){
    const dt=this.engine.getDeltaTime()/1000;this.time+=dt;
    if(this.spin)this.camera.alpha+=dt*.35;
    const pose=this.pose==="stance"?idlePose(this.time):this.pose==="run"?runPose(this.time*9,1):POSE_SHEET[this.pose]||idlePose(this.time);
    applyPose(this.rig,pose,Math.min(1,dt*8));
    this.scene.render();
  }
  destroy(){
    window.removeEventListener("resize",this.resize);this.canvas.removeEventListener("pointerdown",this.stopSpin);
    // Restore shared material state before disposing.
    for(const [mat,w] of this.saved)mat.wireframe=w;
    this.scene.dispose();this.engine.dispose();
  }
}
