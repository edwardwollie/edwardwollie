import {Color3, FresnelParameters, Matrix, Mesh, Quaternion, Scene, StandardMaterial, Texture, TransformNode, Vector3, VertexData} from "@babylonjs/core";
import specification from "./blueprint-spec.json";

/**
 * Babylon side of blueprint series NS-02. Every triangle the game draws comes
 * from app/blueprint-spec.json (written by blueprints/design_model.py), so the
 * printed plates, the GLB exports and the playable meshes are one geometry.
 */
export type PartMesh = {positions:number[];indices:number[];normals:number[];colors:number[];uvs:number[]};
export type Part = {name:string;shape:string;size:number[];position:number[];material:string;group?:string;rotation?:number[];mesh:PartMesh};
type Swatch = {color:string;emissive:number;texture?:string;tint?:string;tintScale?:number;alpha?:number};
export type AssetName = keyof typeof specification.assets;
export type Tints = {kitPrimary?:string;kitTrim?:string;arena?:string};
export type LayoutEntry = {asset:AssetName;position:number[];yaw:number;arenas:number[];modes?:string[]};

export const BLUEPRINT = specification;
export const PALETTE = specification.palette as Record<string,Swatch>;
export const ARENA = specification.arena;
export const LAYOUT = specification.layout as LayoutEntry[];
export const parts = (asset:AssetName) => specification.assets[asset] as Part[];

const METAL = new Set(["ceramic","armor","steel"]);
const isNull = (scene:Scene) => scene.getEngine().getClassName()==="NullEngine";

/** Local matrix of a part: translation x yaw-pitch-roll rotation (Babylon order). */
export function partMatrix(part:Part){
  const r=part.rotation||[0,0,0];
  return Matrix.Compose(Vector3.One(),Quaternion.RotationYawPitchRoll(r[1],r[0],r[2]),Vector3.FromArray(part.position));
}

export type MergedArrays = {positions:Float32Array;normals:Float32Array;colors:Float32Array;uvs:Float32Array;indices:Uint32Array};

/** Bake a list of parts (each with its own matrix) into one indexed buffer. */
export function mergeParts(items:{part:Part;matrix:Matrix}[]):MergedArrays{
  let vertexCount=0,indexCount=0;
  for(const {part} of items){vertexCount+=part.mesh.positions.length/3;indexCount+=part.mesh.indices.length}
  const positions=new Float32Array(vertexCount*3),normals=new Float32Array(vertexCount*3);
  const colors=new Float32Array(vertexCount*4),uvs=new Float32Array(vertexCount*2),indices=new Uint32Array(indexCount);
  let v=0,i=0;const p=new Vector3(),n=new Vector3();
  for(const {part,matrix} of items){
    const m=part.mesh,count=m.positions.length/3;
    for(let k=0;k<count;k++){
      Vector3.TransformCoordinatesFromFloatsToRef(m.positions[k*3],m.positions[k*3+1],m.positions[k*3+2],matrix,p);
      Vector3.TransformNormalFromFloatsToRef(m.normals[k*3],m.normals[k*3+1],m.normals[k*3+2],matrix,n);n.normalize();
      positions[(v+k)*3]=p.x;positions[(v+k)*3+1]=p.y;positions[(v+k)*3+2]=p.z;
      normals[(v+k)*3]=n.x;normals[(v+k)*3+1]=n.y;normals[(v+k)*3+2]=n.z;
    }
    colors.set(m.colors,v*4);uvs.set(m.uvs,v*2);
    for(let k=0;k<m.indices.length;k++)indices[i+k]=m.indices[k]+v;
    v+=count;i+=m.indices.length;
  }
  return {positions,normals,colors,uvs,indices};
}

export function applyArrays(mesh:Mesh,data:MergedArrays,updatable=false){
  const vd=new VertexData();
  vd.positions=data.positions;vd.normals=data.normals;vd.colors=data.colors;vd.uvs=data.uvs;vd.indices=data.indices;
  vd.applyToMesh(mesh,updatable);mesh.useVertexColors=true;mesh.hasVertexAlpha=false;
}

export class BlueprintBuilder {
  private cache = new Map<string,StandardMaterial>();
  private merged = new Map<string,Map<string,MergedArrays>>();
  private textures = new Map<string,Texture>();
  quality: "high"|"low" = "high";
  constructor(public scene:Scene, public tints:Tints = {}) {}

  private texture(url:string){
    let t=this.textures.get(url);
    if(!t){t=new Texture(url,this.scene,false,false,Texture.TRILINEAR_SAMPLINGMODE);t.wrapU=t.wrapV=Texture.WRAP_ADDRESSMODE;this.textures.set(url,t)}
    return t;
  }

  /** Tinted entries take the kit / arena colour; everything else uses vertex colour. */
  tintFor(key:string,tints:Tints=this.tints){
    const swatch=PALETTE[key];
    if(!swatch?.tint)return null;
    return (tints as Record<string,string|undefined>)[swatch.tint]??swatch.color;
  }

  material(key:string,tints:Tints=this.tints){
    const swatch=PALETTE[key];if(!swatch)throw new Error(`Unknown blueprint material ${key}`);
    const tint=this.tintFor(key,tints);
    const id=`${key}|${tint??""}`;
    let mat=this.cache.get(id);if(mat)return mat;
    mat=new StandardMaterial(`bp-${id}`,this.scene);
    const base=Color3.FromHexString(tint??swatch.color);
    // Vertex colours already carry the swatch colour; tinted swatches are neutral.
    mat.diffuseColor=tint?base.scale(swatch.tintScale??1):Color3.White();
    mat.emissiveColor=base.scale(swatch.emissive);
    mat.specularColor=METAL.has(key)?new Color3(.62,.74,.9):key==="visor"?new Color3(.9,.95,1):key==="jersey"?new Color3(.18,.2,.26):new Color3(.24,.3,.4);
    mat.specularPower=key==="ceramic"?110:key==="visor"?160:METAL.has(key)?90:key==="jersey"?24:44;
    if(METAL.has(key)||key==="visor"||key==="pearl"){
      const rim=new FresnelParameters();rim.bias=.6;rim.power=3;
      rim.leftColor=Color3.Black();rim.rightColor=key==="visor"?new Color3(.2,.35,.5):new Color3(.08,.22,.34);
      mat.emissiveFresnelParameters=rim;
    }
    if(swatch.alpha!==undefined){mat.alpha=swatch.alpha;mat.backFaceCulling=false;mat.separateCullingPass=false}
    if(swatch.texture&&!isNull(this.scene)&&this.quality==="high"){
      if(key==="net"){mat.opacityTexture=null;mat.emissiveTexture=this.texture(swatch.texture);mat.emissiveColor=base.scale(.9)}
      else mat.diffuseTexture=this.texture(swatch.texture);
    }
    this.cache.set(id,mat);return mat;
  }

  /** One Babylon mesh per authored part (hangar inspection, blueprint extraction). */
  build(asset:AssetName,root:TransformNode,groups:Record<string,TransformNode>={},tints:Tints=this.tints){
    const built=new Map<string,Mesh>();
    for(const part of parts(asset)){
      const mesh=new Mesh(`${root.name}-${part.name}`,this.scene),data=new VertexData();
      data.positions=part.mesh.positions;data.indices=part.mesh.indices;
      data.normals=part.mesh.normals;data.colors=part.mesh.colors;data.uvs=part.mesh.uvs;
      data.applyToMesh(mesh);mesh.useVertexColors=true;
      mesh.parent=groups[part.group||"root"]||root;
      mesh.position=Vector3.FromArray(part.position);
      if(part.rotation)mesh.rotation=Vector3.FromArray(part.rotation);
      mesh.material=this.material(part.material,tints);
      built.set(part.name,mesh);
    }
    return built;
  }

  /** Same-material parts of a rigid asset baked together: a handful of draws per prop. */
  mergedArrays(asset:AssetName,filter?:(p:Part)=>boolean,cacheKey=""){
    const key=`${asset}|${cacheKey}`;
    let byMaterial=this.merged.get(key);
    if(!byMaterial){
      const groups=new Map<string,{part:Part;matrix:Matrix}[]>();
      for(const part of parts(asset)){
        if(filter&&!filter(part))continue;
        if(!groups.has(part.material))groups.set(part.material,[]);
        groups.get(part.material)!.push({part,matrix:partMatrix(part)});
      }
      byMaterial=new Map([...groups].map(([m,items])=>[m,mergeParts(items)]));
      this.merged.set(key,byMaterial);
    }
    return byMaterial;
  }

  buildMerged(asset:AssetName,root:TransformNode,tints:Tints=this.tints,filter?:(p:Part)=>boolean,cacheKey=""){
    const meshes:Mesh[]=[];
    for(const [key,data] of this.mergedArrays(asset,filter,cacheKey)){
      const mesh=new Mesh(`${root.name}-${key}`,this.scene);
      applyArrays(mesh,data);mesh.parent=root;mesh.material=this.material(key,tints);
      meshes.push(mesh);
    }
    return meshes;
  }
}
