"""Export exact neutral-pose Babylon geometry as self-contained glTF binaries.

Babylon scenes are left-handed (+X right, +Z forward); glTF is right-handed.
Mirroring X converts one into the other, and because a mirror also flips
winding, Babylon's front-face index order becomes glTF's counter-clockwise
order unchanged. Babylon's own glTF loader applies the inverse, so a GLB
re-imported into the game lines up with the runtime mesh exactly.
"""
from __future__ import annotations

import json
import struct
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SPEC = json.loads((ROOT / 'app/blueprint-spec.json').read_text())
RUNTIME = json.loads((ROOT / 'blueprints/runtime-extracted.json').read_text())
OUT = ROOT / 'blueprints' / 'models'
OUT.mkdir(exist_ok=True)
DEFAULT_TINTS = {'kitPrimary': '#1268ff', 'kitTrim': '#49f4ff', 'arena': '#49f4ff'}
MIRROR = np.array([-1, 1, 1], dtype=np.float32)


def export(asset, filename, tints=None):
    tints = {**DEFAULT_TINTS, **(tints or {})}
    blob = bytearray(); views = []; accessors = []; images = []; textures = []; samplers = []
    materials = []; meshes = []; nodes = []; used = {}; texture_lookup = {}

    def buffer_view(data, target=None):
        while len(blob) % 4:
            blob.append(0)
        offset = len(blob); blob.extend(data)
        item = {'buffer': 0, 'byteOffset': offset, 'byteLength': len(data)}
        if target:
            item['target'] = target
        views.append(item); return len(views) - 1

    def accessor(values, component, kind, target=None, bounds=False):
        array = np.asarray(values, dtype=np.float32 if component == 5126 else np.uint32)
        view = buffer_view(array.astype('<f4' if component == 5126 else '<u4').tobytes(), target)
        n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[kind]
        item = {'bufferView': view, 'componentType': component, 'count': int(array.size // n), 'type': kind}
        if bounds:
            r = array.reshape(-1, n); item['min'] = r.min(axis=0).tolist(); item['max'] = r.max(axis=0).tolist()
        accessors.append(item); return len(accessors) - 1

    def material(key):
        if key in used:
            return used[key]
        swatch = SPEC['palette'][key]
        tint = swatch.get('tint')
        color = np.array(list(bytes.fromhex((tints[tint] if tint else swatch['color'])[1:])), dtype=float) / 255
        factor = (color * swatch.get('tintScale', 1.0)).tolist() + [swatch.get('alpha', 1.0)] if tint else [1, 1, 1, swatch.get('alpha', 1.0)]
        metal = key in ('armor', 'ceramic', 'steel')
        pbr = {'baseColorFactor': factor, 'metallicFactor': .7 if metal else .15, 'roughnessFactor': .32 if metal else .7}
        finish = swatch.get('texture')
        if finish and key != 'net':
            if finish not in texture_lookup:
                images.append({'bufferView': buffer_view((ROOT / 'public' / finish.lstrip('/')).read_bytes()), 'mimeType': 'image/png'})
                if not samplers:
                    samplers.append({'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497})
                textures.append({'sampler': 0, 'source': len(images) - 1}); texture_lookup[finish] = len(textures) - 1
            pbr['baseColorTexture'] = {'index': texture_lookup[finish]}
        item = {'name': key, 'pbrMetallicRoughness': pbr, 'doubleSided': 'alpha' in swatch,
                'emissiveFactor': np.clip(color * min(1.0, float(swatch['emissive']) * .6), 0, 1).tolist()}
        if 'alpha' in swatch:
            item['alphaMode'] = 'BLEND'
        materials.append(item); used[key] = len(materials) - 1
        return used[key]

    for part in RUNTIME['assets'][asset]:
        positions = np.asarray(part['positions'], np.float32).reshape(-1, 3) * MIRROR
        normals = np.asarray(part['normals'], np.float32).reshape(-1, 3) * MIRROR
        attrs = {'POSITION': accessor(positions, 5126, 'VEC3', 34962, True),
                 'NORMAL': accessor(normals, 5126, 'VEC3', 34962),
                 'COLOR_0': accessor(part['colors'], 5126, 'VEC4', 34962),
                 'TEXCOORD_0': accessor(part['uvs'], 5126, 'VEC2', 34962)}
        meshes.append({'name': part['name'], 'primitives': [{'attributes': attrs, 'indices': accessor(part['indices'], 5125, 'SCALAR', 34963),
                                                              'material': material(part['material']), 'mode': 4}]})
        nodes.append({'name': part['name'], 'mesh': len(meshes) - 1})
    doc = {'asset': {'version': '2.0', 'generator': 'Neon Sports Arena exact Babylon geometry exporter (NS-02)'},
           'scene': 0, 'scenes': [{'name': asset, 'nodes': list(range(len(nodes)))}], 'nodes': nodes, 'meshes': meshes,
           'materials': materials, 'buffers': [{'byteLength': 0}], 'bufferViews': views, 'accessors': accessors}
    if images:
        doc.update(images=images, textures=textures, samplers=samplers)
    while len(blob) % 4:
        blob.append(0)
    doc['buffers'][0]['byteLength'] = len(blob)
    packed = json.dumps(doc, separators=(',', ':')).encode()
    packed += b' ' * ((-len(packed)) % 4)
    path = OUT / filename
    with path.open('wb') as stream:
        stream.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(packed) + 8 + len(blob)))
        stream.write(struct.pack('<I4s', len(packed), b'JSON')); stream.write(packed)
        stream.write(struct.pack('<I4s', len(blob), b'BIN\x00')); stream.write(bytes(blob))
    print(filename, len(nodes), 'meshes', path.stat().st_size, 'bytes')


MODELS = [('athlete', 'Neon-Athlete'), ('energy_ball', 'Energy-Ball'), ('gravity_orb', 'Gravity-Orb'),
          ('power_core', 'Power-Core'), ('goal_frame', 'Goal-Frame'), ('keeper_drone', 'Keeper-Drone'),
          ('hoop_rig', 'Gravity-Hoop-Rig'), ('capture_zone', 'Capture-Zone'), ('trophy', 'Infinity-Cup'),
          ('stand_section', 'Stand-Section')]

if __name__ == '__main__':
    assert SPEC['version'] == RUNTIME['version']
    for asset, name in MODELS:
        export(asset, f'{name}-Exact-Mesh-v{SPEC["version"]}.glb')
