// Read back the geometry Babylon actually builds, for the blueprint plates,
// the GLB exports and the contract tests. Props are built with the game's
// BlueprintBuilder; the athlete is built with the game's skinned rig and read
// back through the skeleton (CPU skinning), first at rest and then once per
// entry of the pose sheet, using the same pose functions the game animates.
import {build} from 'esbuild';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {NullEngine,Scene,TransformNode,Vector3,VertexBuffer} from '@babylonjs/core';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const tmp=resolve(root,'tmp');await mkdir(tmp,{recursive:true});
async function load(entry){
  const out=resolve(tmp,`extract-${entry.replace(/\W/g,'_')}.mjs`);
  await build({entryPoints:[resolve(root,entry)],outfile:out,bundle:true,packages:'external',platform:'node',format:'esm',logLevel:'silent'});
  return import(pathToFileURL(out).href+`?t=${Date.now()}`);
}
const {buildAthlete,applyPose,POSE_SHEET,JOINTS}=await load('app/athlete-rig.ts');
const {BlueprintBuilder,BLUEPRINT}=await load('app/blueprint-mesh.ts');
const r5=v=>+v.toFixed(5);

function flatten(mesh){
  mesh.computeWorldMatrix(true);const matrix=mesh.getWorldMatrix();
  const positions=mesh.getVerticesData(VertexBuffer.PositionKind),normals=mesh.getVerticesData(VertexBuffer.NormalKind);
  const colors=mesh.getVerticesData(VertexBuffer.ColorKind),uvs=mesh.getVerticesData(VertexBuffer.UVKind),indices=mesh.getIndices();
  if(!positions||!normals||!colors||!uvs||!indices)throw new Error(`Missing mesh data: ${mesh.name}`);
  const world=[],worldNormals=[];
  for(let i=0;i<positions.length;i+=3){
    const p=Vector3.TransformCoordinates(Vector3.FromArray(positions,i),matrix);
    const n=Vector3.TransformNormal(Vector3.FromArray(normals,i),matrix).normalize();
    world.push(r5(p.x),r5(p.y),r5(p.z));worldNormals.push(r5(n.x),r5(n.y),r5(n.z));
  }
  return {positions:world,normals:worldNormals,colors:Array.from(colors),uvs:Array.from(uvs),indices:Array.from(indices)};
}

/** Skinned read-back of one athlete part (positions and normals after bones). */
function skinnedPart(rig,name,light=false){
  const range=rig.ranges.get(name);if(!range)throw new Error(`athlete/${name} missing from skinned rig`);
  const mesh=range.mesh;
  const positions=mesh.getPositionData(true),normals=mesh.getNormalsData(true);
  const p=[],n=[];
  for(let k=range.vertexStart;k<range.vertexStart+range.vertexCount;k++){
    p.push(r5(positions[k*3]),r5(positions[k*3+1]),r5(positions[k*3+2]));
    const l=Math.hypot(normals[k*3],normals[k*3+1],normals[k*3+2])||1;
    n.push(r5(normals[k*3]/l),r5(normals[k*3+1]/l),r5(normals[k*3+2]/l));
  }
  if(light)return {positions:p,normals:n};
  const colors=Array.from(mesh.getVerticesData(VertexBuffer.ColorKind).slice(range.vertexStart*4,(range.vertexStart+range.vertexCount)*4));
  const uvs=Array.from(mesh.getVerticesData(VertexBuffer.UVKind).slice(range.vertexStart*2,(range.vertexStart+range.vertexCount)*2));
  const indices=Array.from(mesh.getIndices().slice(range.indexStart,range.indexStart+range.indexCount)).map(i=>i-range.vertexStart);
  return {positions:p,normals:n,colors,uvs,indices};
}

const output={version:BLUEPRINT.version,assets:{}},poses={version:BLUEPRINT.version,poses:{}};
for(const [asset,parts] of Object.entries(BLUEPRINT.assets)){
  const engine=new NullEngine();const scene=new Scene(engine);const builder=new BlueprintBuilder(scene);
  if(asset==='athlete'){
    const rig=buildAthlete(scene,builder,'extract',{});
    const joints=()=>Object.fromEntries(JOINTS.map(j=>{rig.joints[j].computeWorldMatrix(true);const p=rig.joints[j].getAbsolutePosition();return [j,[+p.x.toFixed(4),+p.y.toFixed(4),+p.z.toFixed(4)]]}));
    rig.skeleton.prepare(true);
    poses.joints=joints();
    poses.parents=Object.fromEntries(JOINTS.map(j=>[j,BLUEPRINT.groups[j].parent]));
    output.assets[asset]=parts.map(part=>({name:part.name,material:part.material,...skinnedPart(rig,part.name)}));
    poses.poseJoints={};
    for(const [name,pose] of Object.entries(POSE_SHEET)){
      applyPose(rig,pose,1);rig.skeleton.prepare(true);
      poses.poses[name]=parts.map(part=>({name:part.name,...skinnedPart(rig,part.name,true)}));
      poses.poseJoints[name]=joints();
    }
  }else{
    const group=new TransformNode(asset,scene);
    const built=builder.build(asset,group);
    output.assets[asset]=parts.map(part=>{
      const mesh=built.get(part.name);
      if(!mesh)throw new Error(`${asset}/${part.name} missing in playable scene`);
      return {name:part.name,material:part.material,...flatten(mesh)};
    });
  }
  scene.dispose();engine.dispose();
}
await writeFile(resolve(root,'blueprints/runtime-extracted.json'),JSON.stringify(output));
await writeFile(resolve(root,'blueprints/runtime-poses.json'),JSON.stringify(poses));
console.log(`Extracted ${Object.values(output.assets).reduce((n,a)=>n+a.length,0)} Babylon meshes and ${Object.keys(poses.poses).length} rig poses`);
