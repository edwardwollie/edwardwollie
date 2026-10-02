import {Color3, FresnelParameters, Matrix, Mesh, Scene, StandardMaterial, Texture, TransformNode, Vector3, VertexData} from "@babylonjs/core";
import specification from "./blueprint-spec.json";

type Part = {name:string;shape:string;size:number[];position:number[];material:string;group?:string;rotation?:number[];mesh:{positions:number[];indices:number[];normals:number[];colors:number[];uvs:number[]}};
type Palette = Record<string,{color:string;emissive:number;texture?:string}>;
export const BLUEPRINT = specification;

export class BlueprintBuilder {
  private cache = new Map<string,StandardMaterial>();
  private staticSources = new Map<string,Map<string,Mesh>>();
  private courseData = new Map<string,Map<string,VertexData>>();
  constructor(private scene:Scene) {}

  material(key:string){
    let mat=this.cache.get(key);if(mat)return mat;
    const swatch=(specification.palette as Palette)[key];if(!swatch)throw new Error(`Unknown blueprint material ${key}`);
    mat=new StandardMaterial(`blueprint-${key}`,this.scene);
    const c=Color3.FromHexString(swatch.color);
    mat.diffuseColor=Color3.White();mat.emissiveColor=c.scale(swatch.emissive);
    const metal=["ceramic","armor","steel"].includes(key);
    mat.specularColor=metal?new Color3(.62,.78,.9):key==="suit"?new Color3(.32,.42,.52):new Color3(.25,.38,.48);
    mat.specularPower=key==="ceramic"?120:metal?96:key==="suit"?40:52;
    if(metal||key==="suit"){
      // Cool cyan rim on hard surfaces gives the armour its futuristic edge.
      const rim=new FresnelParameters();rim.bias=.62;rim.power=3.2;
      rim.leftColor=Color3.Black();rim.rightColor=key==="suit"?new Color3(.05,.14,.22):new Color3(.1,.32,.42);
      mat.emissiveFresnelParameters=rim;
    }
    if(swatch.texture&&this.scene.getEngine().getClassName()!=="NullEngine"){
      const finish=new Texture(swatch.texture,this.scene,false,false,Texture.BILINEAR_SAMPLINGMODE);
      finish.wrapU=Texture.WRAP_ADDRESSMODE;finish.wrapV=Texture.WRAP_ADDRESSMODE;
      mat.diffuseTexture=finish;
    }
    this.cache.set(key,mat);return mat;
  }

  /**
   * Blueprint finish for primitive geometry without vertex colours (city
   * decks, props): same texture and lighting, tinted with an explicit colour.
   */
  tinted(key:string,hex:string,uvScale=1){
    const id=`${key}-${hex}-${uvScale}`;let mat=this.cache.get(id);if(mat)return mat;
    mat=this.material(key).clone(`blueprint-${id}`) as StandardMaterial;
    mat.diffuseColor=Color3.FromHexString(hex);
    const tex=mat.diffuseTexture as Texture|null;
    if(tex&&uvScale!==1){const t=tex.clone();t.uScale=t.vScale=uvScale;mat.diffuseTexture=t}
    this.cache.set(id,mat);return mat;
  }

  build(asset:keyof typeof specification.assets,root:TransformNode,groups:Record<string,TransformNode>={}){
    const built=new Map<string,Mesh>();
    for(const part of specification.assets[asset] as Part[]){
      const mesh=new Mesh(part.name,this.scene),data=new VertexData();
      data.positions=part.mesh.positions;data.indices=part.mesh.indices;
      data.normals=part.mesh.normals;data.colors=part.mesh.colors;data.uvs=part.mesh.uvs;
      data.applyToMesh(mesh);
      mesh.useVertexColors=true;
      mesh.parent=groups[part.group||"root"]||root;
      mesh.position=Vector3.FromArray(part.position);
      if(part.rotation)mesh.rotation=Vector3.FromArray(part.rotation);
      mesh.material=this.material(part.material);
      if(asset==="roof_tile"&&part.name==="deckSurface")mesh.receiveShadows=true;
      built.set(part.name,mesh);
    }
    return built;
  }

  // Course hazards repeat dozens of times. Keep the exact authored triangles,
  // but combine same-material parts so each obstacle takes only a few draws.
  buildCourseObstacle(asset:"barrier"|"beam"|"wall"|"spike"|"sweep"|"crusher",root:TransformNode){
    let materials=this.courseData.get(asset);
    if(!materials){
      const raw=new Map<string,{positions:number[];normals:number[];colors:number[];uvs:number[];indices:number[]}>();
      for(const part of specification.assets[asset] as Part[]){
        let group=raw.get(part.material);
        if(!group){group={positions:[],normals:[],colors:[],uvs:[],indices:[]};raw.set(part.material,group)}
        const vertexOffset=group.positions.length/3;
        const r=part.rotation||[0,0,0],rotation=Matrix.RotationYawPitchRoll(r[1],r[0],r[2]);
        for(let i=0;i<part.mesh.positions.length;i+=3){
          const v=Vector3.TransformCoordinates(Vector3.FromArray(part.mesh.positions,i),rotation);
          group.positions.push(v.x+part.position[0],v.y+part.position[1],v.z+part.position[2]);
          const n=Vector3.TransformNormal(Vector3.FromArray(part.mesh.normals,i),rotation);
          group.normals.push(n.x,n.y,n.z);
        }
        group.colors.push(...part.mesh.colors);group.uvs.push(...part.mesh.uvs);
        for(const index of part.mesh.indices)group.indices.push(index+vertexOffset);
      }
      materials=new Map();
      for(const [key,arrays] of raw){const data=new VertexData();Object.assign(data,arrays);materials.set(key,data)}
      this.courseData.set(asset,materials);
    }
    for(const [key,data] of materials){
      const mesh=new Mesh(`${root.name}-${key}`,this.scene);
      data.applyToMesh(mesh);mesh.useVertexColors=true;mesh.parent=root;mesh.material=this.material(key);
    }
  }

  instanceStatic(asset:"roof_tile"|"sky_tower",root:TransformNode){
    let sources=this.staticSources.get(asset);
    if(!sources){sources=this.build(asset,root);this.staticSources.set(asset,sources);return}
    for(const part of specification.assets[asset] as Part[]){
      const instance=sources.get(part.name)!.createInstance(`${asset}-${part.name}-${root.name}`);
      instance.parent=root;instance.position=Vector3.FromArray(part.position);
      if(part.rotation)instance.rotation=Vector3.FromArray(part.rotation);
    }
  }
}
