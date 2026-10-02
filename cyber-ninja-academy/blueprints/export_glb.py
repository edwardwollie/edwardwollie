"""Export exact neutral-pose Babylon triangles as self-contained glTF binary."""
from __future__ import annotations

import json
import struct
from pathlib import Path

import numpy as np

ROOT=Path(__file__).resolve().parents[1]
SPEC=json.loads((ROOT/'app/blueprint-spec.json').read_text())
RUNTIME=json.loads((ROOT/'blueprints/runtime-extracted.json').read_text())
OUT=ROOT/'blueprints'/'models';OUT.mkdir(exist_ok=True)


def export(asset,filename):
    blob=bytearray();views=[];accessors=[];images=[];textures=[];samplers=[]
    materials=[];meshes=[];nodes=[];used_materials={}
    texture_lookup={}

    def buffer_view(data,target=None):
        while len(blob)%4:blob.append(0)
        offset=len(blob);blob.extend(data)
        item={'buffer':0,'byteOffset':offset,'byteLength':len(data)}
        if target:item['target']=target
        views.append(item);return len(views)-1

    def accessor(values,component,kind,target=None,bounds=False):
        array=np.asarray(values,dtype=np.float32 if component==5126 else np.uint32)
        raw=array.astype('<f4' if component==5126 else '<u4').tobytes()
        view=buffer_view(raw,target)
        components={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[kind]
        item={'bufferView':view,'componentType':component,'count':int(array.size//components),'type':kind}
        if bounds:
            reshaped=array.reshape(-1,components)
            item['min']=reshaped.min(axis=0).tolist();item['max']=reshaped.max(axis=0).tolist()
        accessors.append(item);return len(accessors)-1

    def material(key):
        if key in used_materials:return used_materials[key]
        swatch=SPEC['palette'][key];color=np.array(list(bytes.fromhex(swatch['color'][1:])),dtype=float)/255
        finish=swatch.get('texture')
        pbr={'baseColorFactor':[1,1,1,1],
             'metallicFactor':.73 if key in ('armor','ceramic','steel') else .22,
             'roughnessFactor':.32 if key in ('armor','ceramic','steel') else .72}
        if finish:
            if finish not in texture_lookup:
                data=(ROOT/'public'/finish.lstrip('/')).read_bytes()
                images.append({'bufferView':buffer_view(data),'mimeType':'image/png'})
                if not samplers:samplers.append({'magFilter':9729,'minFilter':9729,'wrapS':10497,'wrapT':10497})
                textures.append({'sampler':0,'source':len(images)-1})
                texture_lookup[finish]=len(textures)-1
            pbr['baseColorTexture']={'index':texture_lookup[finish]}
        glow=float(swatch['emissive'])
        item={'name':key,'pbrMetallicRoughness':pbr,'doubleSided':False,
              'emissiveFactor':(color*min(.8,glow*.55)).tolist()}
        materials.append(item);used_materials[key]=len(materials)-1
        return used_materials[key]

    for part in RUNTIME['assets'][asset]:
        positions=np.array(part['positions'],dtype=np.float32).reshape(-1,3)
        attrs={
            'POSITION':accessor(positions,5126,'VEC3',34962,True),
            'NORMAL':accessor(part['normals'],5126,'VEC3',34962),
            'COLOR_0':accessor(part['colors'],5126,'VEC4',34962),
            'TEXCOORD_0':accessor(part['uvs'],5126,'VEC2',34962),
        }
        index=accessor(part['indices'],5125,'SCALAR',34963)
        meshes.append({'name':part['name'],'primitives':[{
            'attributes':attrs,'indices':index,'material':material(part['material']),'mode':4}]})
        nodes.append({'name':part['name'],'mesh':len(meshes)-1})

    doc={'asset':{'version':'2.0','generator':'Flexzonic exact Babylon geometry exporter'},
         'scene':0,'scenes':[{'nodes':list(range(len(nodes)))}],
         'nodes':nodes,'meshes':meshes,'materials':materials,
         'buffers':[{'byteLength':len(blob)}],'bufferViews':views,'accessors':accessors}
    if images:doc.update(images=images,textures=textures,samplers=samplers)
    packed=json.dumps(doc,separators=(',',':')).encode()
    packed+=b' '*((-len(packed))%4)
    while len(blob)%4:blob.append(0)
    binary=bytes(blob)
    length=12+8+len(packed)+8+len(binary)
    destination=OUT/filename
    with destination.open('wb') as stream:
        stream.write(struct.pack('<4sII',b'glTF',2,length))
        stream.write(struct.pack('<I4s',len(packed),b'JSON'))
        stream.write(packed)
        stream.write(struct.pack('<I4s',len(binary),b'BIN\x00'))
        stream.write(binary)
    print(filename,len(nodes),'meshes',destination.stat().st_size,'bytes')


if __name__=='__main__':
    assert SPEC['version']==RUNTIME['version']
    v=SPEC['version']
    export('ninja',f'Cyber-Ninja-Operative-Exact-Mesh-v{v}.glb')
    export('drone',f'Aegis-Hunter-Drone-Exact-Mesh-v{v}.glb')
    export('beacon',f'Uplink-Beacon-Exact-Mesh-v{v}.glb')
