import {MeshBuilder, Vector3, type Mesh, type Scene, TransformNode} from "@babylonjs/core";
import {BLUEPRINT, type BlueprintBuilder} from "./blueprint-mesh";

/**
 * The articulated Cyber Ninja. Joint names, rest transforms and every mesh come
 * from app/blueprint-spec.json; the poses below are shared by both game modes
 * and by the blueprint pose-sheet extractor, so the printed pose plate shows
 * the exact silhouettes the player sees.
 */
export const JOINTS = [
  "hips","spine","chest","neck","head",
  "leftUpperArm","leftForeArm","leftHand","rightUpperArm","rightForeArm","rightHand",
  "leftThigh","leftShin","leftFoot","rightThigh","rightShin","rightFoot",
  "bladePivot","scarf",
] as const;
export type Joint = typeof JOINTS[number];
type Euler = [number,number,number];
/** Rotation offsets from the rest pose, plus a hip drop and body lean. */
export type Pose = Partial<Record<Joint,Euler>> & {hipDrop?:number;hipShift?:number};
export type Rig = {
  root:TransformNode; joints:Record<Joint,TransformNode>; rest:Record<Joint,Vector3>;
  restHip:Vector3; current:Record<Joint,Vector3>; hipDrop:number; hipShift:number;
  blade:Mesh; trails:Mesh[]; parts:Map<string,Mesh>;
};

export function buildNinjaRig(scene:Scene,builder:BlueprintBuilder,name="cyberNinja"):Rig{
  const root=new TransformNode(name,scene);
  const nodes:Record<string,TransformNode>={root};
  for(const [joint,data] of Object.entries(BLUEPRINT.groups) as [string,{parent:string;position:number[];rotation?:number[]}][]){
    const node=new TransformNode(joint,scene);
    node.parent=nodes[data.parent];node.position=Vector3.FromArray(data.position);
    if(data.rotation)node.rotation=Vector3.FromArray(data.rotation);
    nodes[joint]=node;
  }
  const parts=builder.build("ninja",root,nodes);
  const joints=nodes as unknown as Record<Joint,TransformNode>;
  const rest={} as Record<Joint,Vector3>,current={} as Record<Joint,Vector3>;
  for(const j of JOINTS){rest[j]=joints[j].rotation.clone();current[j]=Vector3.Zero()}
  const trails:Mesh[]=[];
  for(let i=0;i<3;i++){
    const trail=MeshBuilder.CreateBox(`${name}-bladeTrail${i}`,{width:.012+i*.012,height:.05+i*.03,depth:.78-i*.1},scene);
    trail.parent=joints.bladePivot;trail.position.set(0,-.02*i,.7);trail.rotation.x=-.08*(i+1);
    trail.material=builder.material(i===1?"magenta":"cyan");trail.setEnabled(false);trails.push(trail);
  }
  return {root,joints,rest,restHip:joints.hips.position.clone(),current,hipDrop:0,hipShift:0,
    blade:parts.get("photonBlade")!,trails,parts};
}

/** Snap (blend=1) or ease the rig toward a pose. */
export function applyPose(rig:Rig,pose:Pose,blend=1){
  for(const j of JOINTS){
    const target=pose[j]||[0,0,0],c=rig.current[j];
    c.x+=(target[0]-c.x)*blend;c.y+=(target[1]-c.y)*blend;c.z+=(target[2]-c.z)*blend;
    rig.joints[j].rotation.copyFrom(rig.rest[j]).addInPlace(c);
  }
  rig.hipDrop+=((pose.hipDrop||0)-rig.hipDrop)*blend;
  rig.hipShift+=((pose.hipShift||0)-rig.hipShift)*blend;
  rig.joints.hips.position.set(rig.restHip.x,rig.restHip.y-rig.hipDrop,rig.restHip.z+rig.hipShift);
}

const S=Math.sin,C=Math.cos;

/** Combat-ready stance: katana low and forward, knees soft. */
export function idlePose(t:number):Pose{
  const b=S(t*2.1)*.025;
  return {hipDrop:.05,spine:[.04+b,.1,0],chest:[.05+b,.12,0],neck:[-.04,-.18,0],head:[-.03,-.06,0],
    leftThigh:[-.25,.12,-.08],leftShin:[.38,0,0],leftFoot:[-.12,0,0],
    rightThigh:[.12,-.2,.06],rightShin:[.24,0,0],rightFoot:[-.1,0,0],
    leftUpperArm:[-.35,.25,-.12],leftForeArm:[-.95,0,0],leftHand:[0,.3,0],
    rightUpperArm:[-.55,-.1,.05],rightForeArm:[-.75,0,0],rightHand:[.05,0,0],
    bladePivot:[.05,.05,0],scarf:[.15+S(t*1.7)*.08,S(t*1.3)*.15,0]};
}

/** Sprint cycle. phase advances with stride; lean grows with speed (0..1). */
export function runPose(phase:number,lean=1):Pose{
  const s=S(phase),c=C(phase),bounce=Math.abs(C(phase));
  const kneeL=.25+1.2*Math.max(0,c)**1.4+.2*Math.max(0,-s);
  const kneeR=.25+1.2*Math.max(0,-c)**1.4+.2*Math.max(0,s);
  return {hipDrop:.06+.05*(1-bounce),spine:[.12*lean,.14*s,0],chest:[.18*lean,-.2*s,0],
    neck:[-.18*lean,.06*s,0],head:[-.08*lean,0,0],
    leftThigh:[-.85*s-.1,0,-.03],leftShin:[kneeL,0,0],leftFoot:[-.3*s,0,0],
    rightThigh:[.85*s-.1,0,.03],rightShin:[kneeR,0,0],rightFoot:[.3*s,0,0],
    leftUpperArm:[.75*s,0,-.1],leftForeArm:[-1.25+.25*s,0,0],
    rightUpperArm:[-.45-.35*s,.1,.18],rightForeArm:[-.7,0,0],
    bladePivot:[.85,.0,0],scarf:[.9*lean+S(phase*2)*.1,S(phase)*.12,0]};
}

/** Airborne: tucked while rising, legs reaching while falling. */
export function airPose(vy:number,flip=0):Pose{
  const rise=Math.max(0,Math.min(1,vy/8)),fall=Math.max(0,Math.min(1,-vy/10));
  return {hipDrop:0,spine:[.15*rise+flip,0,0],chest:[.12*rise-.08*fall,0,0],neck:[-.1,0,0],
    leftThigh:[-1.3*rise-.4*fall,0,-.1],leftShin:[1.6*rise+.25,0,0],leftFoot:[.2,0,0],
    rightThigh:[-.45*rise+.3*fall,0,.1],rightShin:[.9*rise+.55*fall,0,0],rightFoot:[.25,0,0],
    leftUpperArm:[-.6*rise+.4*fall,0,-.55-.3*fall],leftForeArm:[-.6,0,0],
    rightUpperArm:[-.9*rise,0,.5+.3*fall],rightForeArm:[-.5,0,0],
    bladePivot:[.9,0,0],scarf:[.6+fall*.6,0,0]};
}

/** Power slide: low hips, lead leg extended, torso leaning back. */
export function slidePose(t:number):Pose{
  return {hipDrop:.62,hipShift:-.1,spine:[-.55,.18,0],chest:[-.25,.12,0],neck:[.55,-.1,0],head:[.18,0,0],
    leftThigh:[-1.42,0,-.12],leftShin:[.12,0,0],leftFoot:[.25,0,0],
    rightThigh:[-.55,.2,.25],rightShin:[1.95,0,0],rightFoot:[.2,0,0],
    leftUpperArm:[.7,0,-.65],leftForeArm:[-.3,0,0],
    rightUpperArm:[-.4,0,.75],rightForeArm:[-.8,0,0],bladePivot:[1.1,0,0],
    scarf:[1.15+S(t*30)*.06,0,0]};
}

/** Air dash: horizontal torpedo with the blade swept back. */
export function dashPose():Pose{
  return {hipDrop:.15,spine:[.55,0,0],chest:[.35,0,0],neck:[-.6,0,0],head:[-.2,0,0],
    leftThigh:[.55,0,0],leftShin:[1.1,0,0],rightThigh:[.25,0,0],rightShin:[.6,0,0],
    leftUpperArm:[.9,0,-.25],leftForeArm:[-.3,0,0],rightUpperArm:[1.05,0,.2],rightForeArm:[-.2,0,0],
    bladePivot:[2.3,0,0],scarf:[1.3,0,0]};
}

/**
 * Three-hit katana chain. p runs 0..1 over one swing.
 * 0: rising diagonal cut, 1: horizontal backhand, 2: overhead finisher.
 */
export function strikePose(p:number,variant:number):Pose{
  const wind=Math.min(1,p/.28),cut=Math.max(0,Math.min(1,(p-.22)/.35)),ease=cut*cut*(3-2*cut);
  const settle=Math.max(0,(p-.75)/.25);
  const legs:Pose={hipDrop:.14,leftThigh:[-.6,.15,-.12],leftShin:[.75,0,0],leftFoot:[-.15,0,0],
    rightThigh:[.35,-.2,.1],rightShin:[.4,0,0],rightFoot:[-.1,0,0]};
  if(variant===1)return {...legs,
    spine:[.08,-.5+1.3*ease,0],chest:[.08,-.55+1.4*ease-.3*settle,0],neck:[-.05,.6-1.2*ease,0],
    rightUpperArm:[-1.45*wind,-.2,1.35-.4*ease],rightForeArm:[-.4+.2*ease,.5-1.6*ease,0],
    rightHand:[0,-.5+1.2*ease,0],bladePivot:[1.45-.15*ease,0,0],
    leftUpperArm:[-.3,0,-.7],leftForeArm:[-1.2,0,0],scarf:[.7,-.6+1.2*ease,0]};
  if(variant===2)return {...legs,hipDrop:.1+.25*ease,
    spine:[-.2*wind+.55*ease,0,0],chest:[-.3*wind+.45*ease,.1,0],neck:[.2*wind-.4*ease,0,0],
    rightUpperArm:[-2.9*wind+2.1*ease,.1,.3],rightForeArm:[-.6+.4*ease,0,0],
    leftUpperArm:[-2.6*wind+1.9*ease,-.1,-.3],leftForeArm:[-.7+.4*ease,0,0],
    bladePivot:[.2+.9*ease,0,0],scarf:[.4+.9*ease,0,0]};
  return {...legs,
    spine:[.1,.45-1.0*ease,0],chest:[.12,.55-1.1*ease,0],neck:[-.06,-.45+.9*ease,0],
    rightUpperArm:[-.3-1.55*wind+.8*ease,.2,.15+.9*ease],rightForeArm:[-1.1+.85*ease,0,0],
    rightHand:[.3-.6*ease,0,0],bladePivot:[1.5-1.2*ease,0,0],
    leftUpperArm:[-.5,0,-.4],leftForeArm:[-1.3,0,0],scarf:[.6,.5-1.0*ease,0]};
}

/** Wall-run: sprint stride leaning away from the wall (side = +1 wall on right). */
export function wallRunPose(phase:number,side:number):Pose{
  const r=runPose(phase,1.1),lean=-side*.32;
  return {...r,spine:[.1,0,lean*.6],chest:[.12,-.15*side,lean*.5],neck:[-.1,.2*side,-lean*.4],
    leftUpperArm:side>0?[-.4,0,-1.1]:[.6*Math.sin(phase),0,-.3],rightUpperArm:side<0?[-.4,0,1.1]:[-.5,0,.3],
    scarf:[1.0,-side*.4,0]};
}

export function hurtPose():Pose{
  return {hipDrop:.12,spine:[-.35,0,.12],chest:[-.25,0,0],neck:[.3,0,0],
    leftThigh:[-.4,0,0],leftShin:[.6,0,0],rightThigh:[.2,0,0],rightShin:[.4,0,0],
    leftUpperArm:[-.4,0,-.9],rightUpperArm:[-.4,0,.9],leftForeArm:[-.8,0,0],rightForeArm:[-.8,0,0],
    bladePivot:[.8,0,0],scarf:[.4,0,0]};
}

/** Named poses for the printed articulation plate. */
export const POSE_SHEET:Record<string,Pose>={
  stance:idlePose(0),run:runPose(Math.PI/2),jump:airPose(6),slide:slidePose(0),
  strike:strikePose(.48,0),finisher:strikePose(.5,2),dash:dashPose(),wallrun:wallRunPose(Math.PI/2,1),
};
