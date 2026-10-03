"""Export every blueprint asset as a self-contained glTF binary (.glb).

Geometry and normals are the exact arrays the game builds (see
mesh_geometry.vertex_normals), one node per named part.
"""
from __future__ import annotations

import json
import struct
from pathlib import Path

import numpy as np

from mesh_geometry import vertex_normals

ROOT = Path(__file__).resolve().parents[1]
SPEC = json.loads((ROOT / "app/game/blueprint-spec.json").read_text())
OUT = ROOT / "blueprints" / "models"
OUT.mkdir(exist_ok=True)
NAMES = {"pulse": "Pulse-GT", "vortex": "Vortex-R9", "solar": "Solar-Wraith", "prism": "Prism-Titan",
         "barrier": "Pulse-Barricade", "mine": "Ion-Mine", "drone": "Sentinel-Drone", "coin": "Quantum-Coin",
         "nitro": "Nitro-Cell", "repair": "Aegis-Repair", "boostPad": "Warp-Boost-Pad", "gate": "Checkpoint-Arch"}


def export(key):
    asset = SPEC["assets"][key]
    blob = bytearray()
    views, accessors, meshes, nodes, materials = [], [], [], [], []
    mat_index = {}

    def view(data, target):
        while len(blob) % 4:
            blob.append(0)
        views.append({"buffer": 0, "byteOffset": len(blob), "byteLength": len(data), "target": target})
        blob.extend(data)
        return len(views) - 1

    def accessor(arr, comp, kind, target, bounds=False):
        raw = arr.astype("<f4" if comp == 5126 else "<u4").tobytes()
        n = {"SCALAR": 1, "VEC3": 3}[kind]
        item = {"bufferView": view(raw, target), "componentType": comp, "count": int(arr.size // n), "type": kind}
        if bounds:
            r = arr.reshape(-1, n)
            item["min"] = r.min(axis=0).tolist()
            item["max"] = r.max(axis=0).tolist()
        accessors.append(item)
        return len(accessors) - 1

    def material(name):
        if name in mat_index:
            return mat_index[name]
        m = asset["materials"][name]
        c = [int(m["color"][i:i + 2], 16) / 255 for i in (1, 3, 5)]
        item = {"name": name, "pbrMetallicRoughness": {"baseColorFactor": c + [m.get("opacity", 1)],
                "metallicFactor": m["metalness"], "roughnessFactor": m["roughness"]},
                "emissiveFactor": [min(1, x * min(1, m["emissive"] * 0.4)) for x in c]}
        if m.get("opacity", 1) < 1:
            item["alphaMode"] = "BLEND"
        materials.append(item)
        mat_index[name] = len(materials) - 1
        return mat_index[name]

    for part in asset["parts"]:
        v = np.array(part["positions"], float).reshape(-1, 3)
        f = np.array(part["indices"], int).reshape(-1, 3)
        v, f, n = vertex_normals(v, f, part["flat"])
        prim = {"attributes": {"POSITION": accessor(v.astype(np.float32), 5126, "VEC3", 34962, True),
                               "NORMAL": accessor(n.astype(np.float32), 5126, "VEC3", 34962)},
                "indices": accessor(f.reshape(-1).astype(np.uint32), 5125, "SCALAR", 34963),
                "material": material(part["material"]), "mode": 4}
        meshes.append({"name": part["name"], "primitives": [prim]})
        nodes.append({"name": part["name"], "mesh": len(meshes) - 1})
    while len(blob) % 4:
        blob.append(0)
    doc = {"asset": {"version": "2.0", "generator": f"Hypernova Circuit blueprint exporter {SPEC['version']}"},
           "scene": 0, "scenes": [{"name": asset["title"], "nodes": list(range(len(nodes)))}],
           "nodes": nodes, "meshes": meshes, "materials": materials, "accessors": accessors,
           "bufferViews": views, "buffers": [{"byteLength": len(blob)}]}
    js = json.dumps(doc, separators=(",", ":")).encode()
    js += b" " * ((-len(js)) % 4)
    out = OUT / f"{NAMES[key]}-v{SPEC['version']}.glb"
    with open(out, "wb") as fh:
        fh.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob)))
        fh.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
        fh.write(struct.pack("<II", len(blob), 0x004E4942) + bytes(blob))
    print(out.name, f"{out.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    for key in SPEC["assets"]:
        export(key)
