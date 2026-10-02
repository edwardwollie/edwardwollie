import {Bone, Matrix, Mesh, Quaternion, type Scene, Skeleton, TransformNode, Vector3, VertexBuffer} from "@babylonjs/core";
import {applyArrays, BLUEPRINT, type BlueprintBuilder, mergeParts, type MergedArrays, type Part, partMatrix, parts, type Tints} from "./blueprint-mesh";

/**
 * The articulated Neon Sports athlete. Joint names, rest transforms and every
 * triangle come from app/blueprint-spec.json. The body is baked into one
 * skinned mesh per material (about nine draws per athlete) whose bones follow
 * the joint TransformNodes below, so posing is plain Euler rotation on a
 * TransformNode hierarchy. The same pose functions drive the game, the hangar
 * and the blueprint pose sheet.
 */
export const JOINTS = [
  "hips","spine","chest","neck","head",
  "leftUpperArm","leftForeArm","leftHand","rightUpperArm","rightForeArm","rightHand",
  "leftThigh","leftShin","leftFoot","rightThigh","rightShin","rightFoot",
] as const;
export type Joint = typeof JOINTS[number];
type Euler = [number,number,number];
export type Pose = Partial<Record<Joint,Euler>> & {hipDrop?:number;hipShift?:number};
export type PartRange = {mesh:Mesh;vertexStart:number;vertexCount:number;indexStart:number;indexCount:number};
export type Rig = {
  root:TransformNode; joints:Record<Joint,TransformNode>; rest:Record<Joint,Vector3>;
  restHip:Vector3; current:Record<Joint,Vector3>; hipDrop:number; hipShift:number;
  skeleton:Skeleton; meshes:Mesh[]; ranges:Map<string,PartRange>;
};

type Group = {parent:string;position:number[];rotation?:number[]};
const GROUPS = BLUEPRINT.groups as Record<string,Group>;

function localMatrix(group:Group){
  const r=group.rotation||[0,0,0];
  return Matrix.Compose(Vector3.One(),Quaternion.RotationYawPitchRoll(r[1],r[0],r[2]),Vector3.FromArray(group.position));
}

/** Rest-pose matrix of every joint relative to the athlete root. */
export function restWorld():Record<string,Matrix>{
  const out:Record<string,Matrix>={root:Matrix.Identity()};
  for(const joint of JOINTS){const g=GROUPS[joint];out[joint]=localMatrix(g).multiply(out[g.parent])}
  return out;
}

type Baked = {material:string;arrays:MergedArrays;bones:Float32Array;weights:Float32Array;
  ranges:{name:string;vertexStart:number;vertexCount:number;indexStart:number;indexCount:number}[]};
let bakedCache:Baked[]|null=null;

/** Bind-pose geometry per material with one rigid bone influence per vertex. */
export function bakeAthlete():Baked[]{
  if(bakedCache)return bakedCache;
  const world=restWorld();
  const byMaterial=new Map<string,Part[]>();
  for(const part of parts("athlete")){
    if(!byMaterial.has(part.material))byMaterial.set(part.material,[]);
    byMaterial.get(part.material)!.push(part);
  }
  bakedCache=[...byMaterial].map(([material,list])=>{
    const arrays=mergeParts(list.map(part=>({part,matrix:partMatrix(part).multiply(world[part.group||"root"])})));
    const count=arrays.positions.length/3,bones=new Float32Array(count*4),weights=new Float32Array(count*4);
    const ranges:Baked["ranges"]=[];let v=0,i=0;
    for(const part of list){
      const vc=part.mesh.positions.length/3,ic=part.mesh.indices.length,bone=JOINTS.indexOf((part.group||"hips") as Joint);
      for(let k=0;k<vc;k++){bones[(v+k)*4]=bone;weights[(v+k)*4]=1}
      ranges.push({name:part.name,vertexStart:v,vertexCount:vc,indexStart:i,indexCount:ic});v+=vc;i+=ic;
    }
    return {material,arrays,bones,weights,ranges};
  });
  return bakedCache;
}

export function buildAthlete(scene:Scene,builder:BlueprintBuilder,name:string,tints:Tints):Rig{
  const root=new TransformNode(name,scene);
  const nodes:Record<string,TransformNode>={root};
  const skeleton=new Skeleton(`${name}-skeleton`,`${name}-skeleton`,scene);
  const bones:Record<string,Bone>={};
  for(const joint of JOINTS){
    const g=GROUPS[joint];
    const node=new TransformNode(`${name}-${joint}`,scene);
    node.parent=nodes[g.parent];node.position=Vector3.FromArray(g.position);
    if(g.rotation)node.rotation=Vector3.FromArray(g.rotation);
    nodes[joint]=node;
    const bone=new Bone(joint,skeleton,g.parent==="root"?null:bones[g.parent],localMatrix(g));
    bone.linkTransformNode(node);bones[joint]=bone;
  }
  const meshes:Mesh[]=[],ranges=new Map<string,PartRange>();
  for(const baked of bakeAthlete()){
    const mesh=new Mesh(`${name}-${baked.material}`,scene);
    applyArrays(mesh,baked.arrays);
    mesh.setVerticesData(VertexBuffer.MatricesIndicesKind,baked.bones,false,4);
    mesh.setVerticesData(VertexBuffer.MatricesWeightsKind,baked.weights,false,4);
    mesh.skeleton=skeleton;mesh.numBoneInfluencers=1;mesh.parent=root;
    mesh.material=builder.material(baked.material,tints);
    meshes.push(mesh);
    for(const r of baked.ranges)ranges.set(r.name,{mesh,vertexStart:r.vertexStart,vertexCount:r.vertexCount,indexStart:r.indexStart,indexCount:r.indexCount});
  }
  const joints=nodes as unknown as Record<Joint,TransformNode>;
  const rest={} as Record<Joint,Vector3>,current={} as Record<Joint,Vector3>;
  for(const j of JOINTS){rest[j]=joints[j].rotation.clone();current[j]=Vector3.Zero()}
  return {root,joints,rest,restHip:joints.hips.position.clone(),current,hipDrop:0,hipShift:0,skeleton,meshes,ranges};
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

/** Blend two poses (t = 0 gives a, 1 gives b). */
export function mixPose(a:Pose,b:Pose,t:number):Pose{
  const out:Pose={hipDrop:(a.hipDrop||0)*(1-t)+(b.hipDrop||0)*t,hipShift:(a.hipShift||0)*(1-t)+(b.hipShift||0)*t};
  for(const j of JOINTS){
    const x=a[j]||[0,0,0],y=b[j]||[0,0,0];
    out[j]=[x[0]*(1-t)+y[0]*t,x[1]*(1-t)+y[1]*t,x[2]*(1-t)+y[2]*t];
  }
  return out;
}

const S=Math.sin,C=Math.cos,pos=(v:number)=>Math.max(0,v),clamp01=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(v:number)=>{const t=clamp01(v);return t*t*(3-2*t)};

/** Athletic ready stance on the hover-skates: knees soft, weight forward. */
export function idlePose(t:number):Pose{
  const b=S(t*2.2)*.02;
  return {hipDrop:.07+b*.5,spine:[.1+b,0,0],chest:[.06+b,0,0],neck:[-.1,0,0],head:[-.04,S(t*.7)*.12,0],
    leftThigh:[-.32,.08,-.06],leftShin:[.5,0,0],leftFoot:[-.18,0,.04],
    rightThigh:[-.22,-.1,.08],rightShin:[.42,0,0],rightFoot:[-.18,0,-.04],
    leftUpperArm:[-.15,.1,-.18],leftForeArm:[-.75,0,0],leftHand:[0,.2,0],
    rightUpperArm:[-.12,-.1,.18],rightForeArm:[-.8,0,0],rightHand:[0,-.2,0]};
}

/**
 * Hover-skate stride: each leg pushes back and out in turn while the body
 * leans into the glide. phase advances with distance; speed01 opens the stride.
 */
export function skatePose(phase:number,speed01=1):Pose{
  const s=S(phase),k=speed01,lean=.18+.22*k;
  const pushL=pos(s),pushR=pos(-s);
  return {hipDrop:.12+.05*k+.03*C(phase*2)*k,hipShift:0,
    spine:[lean,.16*s*k,0],chest:[.12+.1*k,-.22*s*k,0],neck:[-lean*.9,.12*s*k,0],head:[-.06,0,0],
    leftThigh:[-.55+(.95*pushL-.35*pushR)*k,0,(-.04-.36*pushL)*k],leftShin:[.75+(.25*pushR-.45*pushL)*k,0,0],leftFoot:[-.2-.25*pushL*k,0,.12*pushL],
    rightThigh:[-.55+(.95*pushR-.35*pushL)*k,0,(.04+.36*pushR)*k],rightShin:[.75+(.25*pushL-.45*pushR)*k,0,0],rightFoot:[-.2-.25*pushR*k,0,-.12*pushR],
    leftUpperArm:[(-.7*s)*k+.1,0,-.22-.25*pushR*k],leftForeArm:[-.8-.3*pushL*k,0,0],
    rightUpperArm:[(.7*s)*k+.1,0,.22+.25*pushL*k],rightForeArm:[-.8-.3*pushR*k,0,0]};
}

/** Nova boost: low aerodynamic tuck with both arms swept back. */
export function boostPose(t:number):Pose{
  const w=S(t*18)*.04;
  return {hipDrop:.3,spine:[.62,0,0],chest:[.3,0,0],neck:[-.75,0,0],head:[-.25,0,0],
    leftThigh:[-.85,0,-.08],leftShin:[1.25,0,0],leftFoot:[-.25,0,0],
    rightThigh:[-.3+w,0,.08],rightShin:[.9,0,0],rightFoot:[.1,0,0],
    leftUpperArm:[1.2,0,-.15],leftForeArm:[-.25,0,0],rightUpperArm:[1.2,0,.15],rightForeArm:[-.25,0,0]};
}

/** Goal Rush strike. p runs 0..1: wind-up, strike, follow-through. */
export function kickPose(p:number):Pose{
  const wind=smooth(p/.3),strike=smooth((p-.25)/.25),follow=smooth((p-.5)/.5);
  const thigh=.9*wind-2.0*strike-.25*follow;
  return {hipDrop:.12,spine:[-.1*strike+.15,-.25*wind+.45*strike,0],chest:[.05,-.3*wind+.5*strike,0],neck:[.1,.2*wind-.3*strike,0],
    leftThigh:[-.25,.1,-.12],leftShin:[.45,0,0],leftFoot:[-.2,0,0],
    rightThigh:[thigh,0,.12],rightShin:[1.5*wind-1.25*strike+.35*follow,0,0],rightFoot:[.35*wind-.5*strike,0,0],
    leftUpperArm:[-.4,0,-.9-.3*strike],leftForeArm:[-.5,0,0],rightUpperArm:[.5*strike,0,.7],rightForeArm:[-.6,0,0]};
}

/** Gravity Hoops two-hand jump shot: gather at the chest, extend and flick. */
export function shootPose(p:number):Pose{
  const gather=smooth(p/.35),release=smooth((p-.35)/.3);
  return {hipDrop:.18*gather-.08*release,spine:[.08-.18*release,0,0],chest:[-.05-.12*release,0,0],neck:[.1+.15*release,0,0],head:[-.1-.15*release,0,0],
    leftThigh:[-.35*gather+.2*release,0,-.05],leftShin:[.7*gather-.5*release,0,0],leftFoot:[-.2+.4*release,0,0],
    rightThigh:[-.3*gather+.2*release,0,.05],rightShin:[.65*gather-.45*release,0,0],rightFoot:[-.2+.4*release,0,0],
    leftUpperArm:[-1.2*gather-1.6*release,.2,.25],leftForeArm:[-1.4*gather+1.1*release,0,0],leftHand:[0,0,0],
    rightUpperArm:[-1.2*gather-1.7*release,-.2,-.25],rightForeArm:[-1.4*gather+1.1*release,0,0],rightHand:[-.6*release,0,0]};
}

/** Core Capture overhand throw with the right arm. */
export function throwPose(p:number):Pose{
  const cock=smooth(p/.35),fire=smooth((p-.3)/.3);
  return {hipDrop:.14,spine:[.05+.35*fire,-.5*cock+.9*fire,0],chest:[.1*fire,-.4*cock+.7*fire,0],neck:[-.1,.45*cock-.6*fire,0],
    leftThigh:[-.6,0,-.1],leftShin:[.55,0,0],rightThigh:[.25,0,.08],rightShin:[.5,0,0],rightFoot:[-.15,0,0],
    leftUpperArm:[-1.2+.9*fire,0,-.35],leftForeArm:[-.5,0,0],
    rightUpperArm:[-2.5*cock+1.6*fire,0,.4-.2*fire],rightForeArm:[-1.6*cock+1.3*fire,0,0],rightHand:[.3-.6*fire,0,0]};
}

/** Target Blitz: Pulse Launcher levelled, left hand bracing, recoil pulse. */
export function blastPose(p:number):Pose{
  const recoil=S(Math.min(1,p)*Math.PI)*.35;
  return {hipDrop:.12,spine:[.08,-.35,0],chest:[.05,-.2,0],neck:[-.05,.5,0],head:[0,.05,0],
    leftThigh:[-.45,.15,-.12],leftShin:[.55,0,0],rightThigh:[.15,-.2,.1],rightShin:[.45,0,0],
    rightUpperArm:[-1.5+recoil*.3,.35,.05],rightForeArm:[-.05-recoil,0,0],rightHand:[0,0,0],
    leftUpperArm:[-1.25,-.55,-.1],leftForeArm:[-1.25,0,0],leftHand:[0,.4,0]};
}

/** Pulse tackle: shoulder charge with the body low and driving. */
export function tacklePose(t:number):Pose{
  const drive=S(t*20)*.08;
  return {hipDrop:.32,spine:[.55,-.45,0],chest:[.25,-.3,0],neck:[-.55,.5,0],
    leftThigh:[-1.15,0,-.1],leftShin:[1.0,0,0],leftFoot:[-.1,0,0],
    rightThigh:[.45+drive,0,.1],rightShin:[.35,0,0],rightFoot:[.3,0,0],
    rightUpperArm:[-.35,0,.5],rightForeArm:[-1.7,0,0],leftUpperArm:[.3,0,-.6],leftForeArm:[-1.0,0,0]};
}

/** Airborne: knees tuck while rising, legs reach while falling. */
export function airPose(vy:number):Pose{
  const rise=clamp01(vy/8),fall=clamp01(-vy/10);
  return {hipDrop:0,spine:[.15*rise,0,0],chest:[.1*rise-.1*fall,0,0],neck:[-.1,0,0],
    leftThigh:[-1.2*rise-.4*fall,0,-.12],leftShin:[1.5*rise+.3,0,0],leftFoot:[.2,0,0],
    rightThigh:[-.5*rise+.25*fall,0,.12],rightShin:[1.0*rise+.5*fall,0,0],rightFoot:[.25,0,0],
    leftUpperArm:[-.7*rise+.3*fall,0,-.6-.4*fall],leftForeArm:[-.6,0,0],
    rightUpperArm:[-.9*rise+.2*fall,0,.6+.4*fall],rightForeArm:[-.6,0,0]};
}

/** Slam dunk: right arm overhead then hammered down through the ring. */
export function dunkPose(p:number):Pose{
  const reach=smooth(p/.4),slam=smooth((p-.4)/.3);
  return {hipDrop:0,spine:[-.2*reach+.45*slam,0,0],chest:[-.15*reach+.3*slam,0,0],neck:[.2*reach-.3*slam,0,0],
    leftThigh:[-1.1,0,-.15],leftShin:[1.6,0,0],rightThigh:[-.3,0,.12],rightShin:[1.1,0,0],
    rightUpperArm:[-3.0*reach+1.6*slam,0,.15],rightForeArm:[-.3*reach,0,0],rightHand:[.5*slam,0,0],
    leftUpperArm:[-.4,0,-.9],leftForeArm:[-.8,0,0]};
}

/** Victory: arms thrown up in a V, chest out, little hop. */
export function celebratePose(t:number):Pose{
  const pump=S(t*7),hop=pos(S(t*7))*.06;
  return {hipDrop:.05-hop,spine:[-.15,S(t*2)*.2,0],chest:[-.2,0,0],neck:[.35,0,0],head:[.15,0,0],
    leftThigh:[-.2,0,-.1],leftShin:[.3,0,0],rightThigh:[-.2,0,.1],rightShin:[.3,0,0],
    leftUpperArm:[-.3,0,-2.55-.15*pump],leftForeArm:[-.25-.2*pump,0,0],leftHand:[0,0,0],
    rightUpperArm:[-.3,0,2.55+.15*pump],rightForeArm:[-.25-.2*pump,0,0],rightHand:[0,0,0]};
}

/** Stunned after a tackle: knocked back and wobbling. */
export function stunPose(t:number):Pose{
  const w=S(t*11)*.18;
  return {hipDrop:.2,spine:[-.35,w,.12],chest:[-.25,0,w*.5],neck:[.35,0,-w],head:[.2,0,w],
    leftThigh:[-.6,0,-.15],leftShin:[.8,0,0],rightThigh:[.15,0,.12],rightShin:[.45,0,0],
    leftUpperArm:[.4,0,-1.0],leftForeArm:[-.6,0,0],rightUpperArm:[.5,0,1.05],rightForeArm:[-.7,0,0]};
}

/** Carrying the power core: skating legs, both arms cradling at the chest. */
export function carryPose(phase:number,speed01=1):Pose{
  const legs=skatePose(phase,speed01);
  return {...legs,
    leftUpperArm:[-.95,.25,-.05],leftForeArm:[-1.15,0,0],leftHand:[0,.5,0],
    rightUpperArm:[-.95,-.25,.05],rightForeArm:[-1.15,0,0],rightHand:[0,-.5,0]};
}

/** Named poses for the printed articulation plate and the hangar. */
export const POSE_SHEET:Record<string,Pose>={
  stance:idlePose(0),skate:skatePose(Math.PI/2,1),boost:boostPose(0),kick:kickPose(.47),
  shoot:shootPose(.62),throw:throwPose(.5),blast:blastPose(.2),tackle:tacklePose(0),
  jump:airPose(5),dunk:dunkPose(.25),celebrate:celebratePose(.22),carry:carryPose(Math.PI/2,.8),
};
