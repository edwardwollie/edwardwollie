// Extract the actual Babylon VertexData and world transforms for blueprint QA.
// The ninja is built with the same rig the game uses (app/ninja-rig.ts); the
// pose sheet applies the same pose functions the game animates with.
import {build} from 'esbuild';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {NullEngine,Scene,TransformNode,Vector3,VertexBuffer} from '@babylonjs/core';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const tmp=resolve(root,'tmp');await mkdir(tmp,{recursive:true});
await build({entryPoints:[resolve(root,'app/ninja-rig.ts')],outfile:resolve(tmp,'extracted-rig.mjs'),
  bundle:true,packages:'external',platform:'node',format:'esm',logLevel:'silent'});
const {buildNinjaRig,applyPose,POSE_SHEET}=await import(pathToFileURL(resolve(tmp,'extracted-rig.mjs')).href+`?t=${Date.now()}`);
await build({entryPoints:[resolve(root,'app/blueprint-mesh.ts')],outfile:resolve(tmp,'extracted-builder.mjs'),
  bundle:true,packages:'external',platform:'node',format:'esm',logLevel:'silent'});
const {BlueprintBuilder,BLUEPRINT}=await import(pathToFileURL(resolve(tmp,'extracted-builder.mjs')).href+`?t=${Date.now()}`);

function flatten(mesh,light=false){
  mesh.computeWorldMatrix(true);const matrix=mesh.getWorldMatrix();
  const positions=mesh.getVerticesData(VertexBuffer.PositionKind);
  const normals=mesh.getVerticesData(VertexBuffer.NormalKind);
  const colors=mesh.getVerticesData(VertexBuffer.ColorKind);
  const uvs=mesh.getVerticesData(VertexBuffer.UVKind);
  const indices=mesh.getIndices();
  if(!positions||!normals||!colors||!uvs||!indices)throw new Error(`Missing mesh data: ${mesh.name}`);
  const world=[],worldNormals=[];
  for(let i=0;i<positions.length;i+=3){
    const p=Vector3.TransformCoordinates(Vector3.FromArray(positions,i),matrix);
    const n=Vector3.TransformNormal(Vector3.FromArray(normals,i),matrix).normalize();
    world.push(+p.x.toFixed(5),+p.y.toFixed(5),+p.z.toFixed(5));
    worldNormals.push(+n.x.toFixed(5),+n.y.toFixed(5),+n.z.toFixed(5));
  }
  if(light)return {positions:world,normals:worldNormals};
  return {positions:world,normals:worldNormals,colors:Array.from(colors),
          uvs:Array.from(uvs),indices:Array.from(indices)};
}
const output={version:BLUEPRINT.version,assets:{}},poses={version:BLUEPRINT.version,poses:{}};
for(const [asset,parts] of Object.entries(BLUEPRINT.assets)){
  const engine=new NullEngine();const scene=new Scene(engine);const builder=new BlueprintBuilder(scene);
  let built;
  if(asset==='ninja'){
    const rig=buildNinjaRig(scene,builder);
    built=rig.parts;
    rig.root.computeWorldMatrix(true);
    poses.joints=Object.fromEntries(Object.entries(rig.joints).map(([k,n])=>{n.computeWorldMatrix(true);const p=n.getAbsolutePosition();return [k,[+p.x.toFixed(4),+p.y.toFixed(4),+p.z.toFixed(4)]]}));
    poses.parents=Object.fromEntries(Object.entries(BLUEPRINT.groups).map(([k,g])=>[k,g.parent]));
    output.assets[asset]=parts.map(part=>({name:part.name,material:part.material,...flatten(built.get(part.name))}));
    for(const [name,pose] of Object.entries(POSE_SHEET)){
      applyPose(rig,pose,1);
      poses.poses[name]=parts.map(part=>({name:part.name,...flatten(built.get(part.name),true)}));
    }
  }else{
    const group=new TransformNode(asset,scene);
    built=builder.build(asset,group);
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
console.log(`Extracted ${Object.values(output.assets).reduce((n,a)=>n+a.length,0)} exact Babylon meshes and ${Object.keys(poses.poses).length} rig poses`);
