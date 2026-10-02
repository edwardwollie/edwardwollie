import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(p)=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url),'utf8'));
const spec=read('../app/blueprint-spec.json');
const runtime=read('../blueprints/runtime-extracted.json');
const pkg=read('../package.json');
const portal=read('../public/.well-known/flexzonic-game.json');

function part(asset,name){return spec.assets[asset].find(p=>p.name===name)}
function nearArray(actual,expected,label,tolerance=.00002){
  assert.equal(actual.length,expected.length,`${label} length`);
  for(let i=0;i<actual.length;i++)assert.ok(Math.abs(actual[i]-expected[i])<tolerance,`${label}/${i}`);
}

test('one asset specification supplies complete production meshes',()=>{
  assert.equal(spec.version,'4.1.0');
  // Patch releases (4.1.x) may ship without regenerating the 4.1 blueprint series.
  assert.equal(portal.version,pkg.version);
  assert.equal(pkg.version.split('.').slice(0,2).join('.'),spec.version.split('.').slice(0,2).join('.'));
  assert.equal(portal.url,'https://ninja.flexzonicgames.com');
  for(const [asset,parts] of Object.entries(spec.assets)){
    assert.ok(parts.length>0,`${asset} must be nonempty`);
    assert.equal(new Set(parts.map(p=>p.name)).size,parts.length,`${asset} duplicate part`);
    for(const p of parts){
      assert.ok(p.size.every(v=>v>0),`${asset}/${p.name} dimension`);
      assert.ok(spec.palette[p.material],`${asset}/${p.name} material`);
      assert.ok(!p.group||spec.groups[p.group],`${asset}/${p.name} parent`);
      const m=p.mesh;
      assert.ok(m.positions.length>=9&&m.positions.length%3===0,`${asset}/${p.name} vertices`);
      assert.equal(m.normals.length,m.positions.length,`${asset}/${p.name} normals`);
      assert.equal(m.colors.length,m.positions.length/3*4,`${asset}/${p.name} vertex colors`);
      assert.equal(m.uvs.length,m.positions.length/3*2,`${asset}/${p.name} UVs`);
      assert.ok(m.indices.length>=3&&m.indices.length%3===0,`${asset}/${p.name} triangles`);
      assert.ok(m.indices.every(i=>Number.isInteger(i)&&i>=0&&i<m.positions.length/3),`${asset}/${p.name} index range`);
    }
  }
  assert.equal(spec.assets.ninja.length,131);
  assert.equal(Object.values(spec.assets).flat().length,395);
  assert.equal(spec.assets.warden.length,42);
  assert.ok(spec.assets.ninja.reduce((n,p)=>n+p.mesh.indices.length/3,0)>20000,'high detail operative');
  assert.equal(spec.dimensions.ninjaHeight,1.92);
  for(const joint of ['hips','spine','chest','neck','head','leftUpperArm','leftForeArm','leftHand','rightUpperArm',
    'rightForeArm','rightHand','leftThigh','leftShin','leftFoot','rightThigh','rightShin','rightFoot','bladePivot','scarf'])
    assert.ok(spec.groups[joint],`joint ${joint}`);
});

test('blueprint renderer input uses the playable Babylon mesh data',()=>{
  assert.equal(runtime.version,spec.version);
  for(const [asset,parts] of Object.entries(spec.assets)){
    const extracted=runtime.assets[asset];
    assert.equal(extracted.length,parts.length,`${asset} part count`);
    for(let i=0;i<parts.length;i++){
      const source=parts[i],actual=extracted[i];
      assert.equal(actual.name,source.name);
      assert.equal(actual.material,source.material);
      assert.deepEqual(actual.indices,source.mesh.indices,`${asset}/${source.name} triangles`);
      nearArray(actual.colors,source.mesh.colors,`${asset}/${source.name} colors`);
      nearArray(actual.uvs,source.mesh.uvs,`${asset}/${source.name} UVs`);
      assert.equal(actual.positions.length,source.mesh.positions.length);
      assert.equal(actual.normals.length,source.mesh.normals.length);
    }
  }
});

function glb(asset,file){
  const data=fs.readFileSync(new URL(`../blueprints/models/${file}`,import.meta.url));
  assert.equal(data.toString('ascii',0,4),'glTF');
  assert.equal(data.readUInt32LE(4),2);
  assert.equal(data.readUInt32LE(8),data.length);
  const jsonLength=data.readUInt32LE(12);
  assert.equal(data.toString('ascii',16,20),'JSON');
  const doc=JSON.parse(data.toString('utf8',20,20+jsonLength));
  const start=28+jsonLength;
  assert.equal(data.toString('ascii',start-4,start),'BIN\0');
  const base=start;
  assert.equal(doc.meshes.length,runtime.assets[asset].length);
  assert.equal(doc.nodes.length,doc.meshes.length);
  for(let i=0;i<doc.meshes.length;i++){
    const source=runtime.assets[asset][i];
    const mesh=doc.meshes[i];
    assert.equal(mesh.name,source.name);
    const primitive=mesh.primitives[0];
    for(const [semantic,expected,components] of [
      ['POSITION',source.positions,3],['NORMAL',source.normals,3],
      ['COLOR_0',source.colors,4],['TEXCOORD_0',source.uvs,2]]){
      const a=doc.accessors[primitive.attributes[semantic]],v=doc.bufferViews[a.bufferView];
      assert.equal(a.count,expected.length/components,`${source.name}/${semantic}`);
      for(let j=0;j<expected.length;j++){
        const value=data.readFloatLE(base+v.byteOffset+j*4);
        assert.ok(Math.abs(value-expected[j])<.00002,`${source.name}/${semantic}/${j}`);
      }
    }
    const a=doc.accessors[primitive.indices],v=doc.bufferViews[a.bufferView];
    assert.equal(a.count,source.indices.length);
    for(let j=0;j<source.indices.length;j++){
      assert.equal(data.readUInt32LE(base+v.byteOffset+j*4),source.indices[j]);
    }
  }
  assert.ok((doc.images?.length||0)>0,`${asset} embedded finish textures`);
}

test('standalone GLBs retain neutral-pose vertices, normals, UVs and indices',()=>{
  glb('ninja','Cyber-Ninja-Operative-Exact-Mesh-v4.1.0.glb');
  glb('drone','Aegis-Hunter-Drone-Exact-Mesh-v4.1.0.glb');
  glb('beacon','Uplink-Beacon-Exact-Mesh-v4.1.0.glb');
  glb('warden','Warden-Boss-Exact-Mesh-v4.1.0.glb');
});

test('three 3-metre lanes have deliberate, distinct obstacle actions',()=>{
  assert.deepEqual(spec.dimensions.laneCentres,[-3,0,3]);
  assert.ok(spec.dimensions.roofWidth>=12);
  assert.ok(part('barrier','jumpBlock').size[1]<1);
  assert.ok(part('beam','laser1.52').position[1]>1.4);
  assert.ok(part('wall','shiftWall').size[1]>2.4);
  for(const asset of ['barrier','beam','wall','spike','sweep','crusher']){
    assert.ok(spec.assets[asset].every(p=>p.size[0]<3),`${asset} must not block adjacent lanes`);
  }
  assert.ok(part('drone','targetInner'));
  assert.ok(part('drone','targetOuter'));
  assert.ok(part('spike','retractableTooth0'));
  assert.ok(part('sweep','sweepCrossbar'));
  assert.ok(part('crusher','crusherSlab'));
  assert.ok(part('finish_gate','finishLine'));
  assert.ok(part('ninja','photonBlade'));
  assert.ok(part('ninja','visor').shape==='shell');
  assert.ok(part('ninja','ribcage').shape==='loft');
  for(const name of ['wardenEye','wardenRing0','wardenRing1','wardenRing2'])assert.ok(part('warden',name),name);
});

test('blueprint pose sheet is read back from the game rig',()=>{
  const poses=read('../blueprints/runtime-poses.json');
  assert.equal(poses.version,spec.version);
  assert.deepEqual(Object.keys(poses.poses).sort(),['dash','finisher','jump','run','slide','stance','strike','wallrun']);
  for(const parts of Object.values(poses.poses))assert.equal(parts.length,spec.assets.ninja.length);
  const head=poses.joints.head;assert.ok(head[1]>1.6&&head[1]<1.8,'head height');
});

test('six sides, quarter views, detail, poses, city assets and hazards are packaged',()=>{
  for(const file of ['01-ninja-six-view-atlas.png','02-ninja-quarter-views.png','03-ninja-runtime-detail.png',
    '04-articulation-pose-sheet.png','05-city-ops-assets.png','06-survival-course-hazards.png','07-warden-boss.png']){
    const path=new URL(`../blueprints/renders/${file}`,import.meta.url);
    assert.ok(fs.statSync(path).size>50000,file);
  }
  assert.ok(fs.statSync(new URL('../blueprints/Cyber-Ninja-3D-Blueprint-Atlas-v4.1.0.pdf',import.meta.url)).size>50000);
});
