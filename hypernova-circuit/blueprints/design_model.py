"""Editable mesh recipe for every Hypernova Circuit 3.0 model.

Run `python3 blueprints/design_model.py` to write app/game/blueprint-spec.json.
The game (app/game/blueprint-mesh.ts) builds three.js BufferGeometry straight
from those arrays, and render_blueprints.py projects the very same triangles,
so the plates are the playable models, not artwork of them.

Orientation: metres, +Y up, every vehicle faces +Z, the road surface is Y = 0.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

from mesh_geometry import (box, convex, cylinder, ellipsoid, icosphere, loft, octahedron,
                           place, prism, torus)

ROOT = Path(__file__).resolve().parents[1]
VERSION = "3.0.0"

# Paint is overridden per car at runtime; these defaults mirror progression.ts.
CAR_COLORS = {
    "pulse": ("#19e6ff", "#8b5cff"),
    "vortex": ("#ff3bbd", "#32ff8a"),
    "solar": ("#ff8a1f", "#ffee55"),
    "prism": ("#a8ff3e", "#38a7ff"),
}

CAR_MATERIALS = {
    "paint": {"color": "#19e6ff", "emissive": 0.10, "metalness": 0.85, "roughness": 0.22, "clearcoat": 1},
    "trim": {"color": "#1a2035", "emissive": 0.0, "metalness": 0.7, "roughness": 0.35},
    "carbon": {"color": "#0c0f18", "emissive": 0.0, "metalness": 0.4, "roughness": 0.55},
    "glass": {"color": "#0a2a44", "emissive": 0.25, "metalness": 0.3, "roughness": 0.05, "opacity": 0.82},
    "chrome": {"color": "#c9d6e6", "emissive": 0.0, "metalness": 1.0, "roughness": 0.14},
    "glow": {"color": "#8b5cff", "emissive": 2.4, "metalness": 0.3, "roughness": 0.3},
    "thrust": {"color": "#8b5cff", "emissive": 3.6, "metalness": 0.0, "roughness": 0.4},
    "under": {"color": "#19e6ff", "emissive": 3.0, "metalness": 0.0, "roughness": 0.4},
    "light": {"color": "#e8fbff", "emissive": 4.0, "metalness": 0.0, "roughness": 0.2},
    "tail": {"color": "#ff2449", "emissive": 3.6, "metalness": 0.0, "roughness": 0.2},
}

PROP_MATERIALS = {
    "hazard": {"color": "#5a123e", "emissive": 0.0, "metalness": 0.75, "roughness": 0.3},
    "hazardGlow": {"color": "#ff176f", "emissive": 2.8, "metalness": 0.2, "roughness": 0.3},
    "stripe": {"color": "#ffee55", "emissive": 1.6, "metalness": 0.1, "roughness": 0.4},
    "steel": {"color": "#2b3448", "emissive": 0.0, "metalness": 0.9, "roughness": 0.28},
    "mine": {"color": "#22330c", "emissive": 0.0, "metalness": 0.6, "roughness": 0.35},
    "mineGlow": {"color": "#a8ff3e", "emissive": 3.4, "metalness": 0.0, "roughness": 0.3},
    "drone": {"color": "#40200c", "emissive": 0.0, "metalness": 0.85, "roughness": 0.2},
    "droneGlow": {"color": "#ff8a1f", "emissive": 3.2, "metalness": 0.0, "roughness": 0.3},
    "gold": {"color": "#ffd84d", "emissive": 1.8, "metalness": 0.9, "roughness": 0.16},
    "goldCore": {"color": "#fff5a8", "emissive": 3.0, "metalness": 0.0, "roughness": 0.3},
    "nitro": {"color": "#0c66bd", "emissive": 0.6, "metalness": 0.6, "roughness": 0.15},
    "nitroGlow": {"color": "#19e6ff", "emissive": 3.8, "metalness": 0.0, "roughness": 0.3},
    "repair": {"color": "#a8ff3e", "emissive": 3.0, "metalness": 0.2, "roughness": 0.3},
    "white": {"color": "#f4ffff", "emissive": 3.0, "metalness": 0.0, "roughness": 0.3},
    "gate": {"color": "#102b38", "emissive": 0.0, "metalness": 0.8, "roughness": 0.25},
    "gateGlow": {"color": "#19e6ff", "emissive": 3.4, "metalness": 0.0, "roughness": 0.3},
    "gateKey": {"color": "#ff3bbd", "emissive": 3.0, "metalness": 0.0, "roughness": 0.3},
    "checker": {"color": "#f4f7ff", "emissive": 1.2, "metalness": 0.1, "roughness": 0.5},
}


class Asset:
    def __init__(self, key, title, kind, materials, notes=""):
        self.key, self.title, self.kind, self.notes = key, title, kind, notes
        self.materials = materials
        self.parts = []

    def add(self, name, material, mesh, flat=False, mirror=False):
        assert material in self.materials, material
        verts, faces = mesh
        self.parts.append({"name": name, "material": material, "flat": flat,
                           "verts": np.asarray(verts, float), "faces": [list(map(int, f)) for f in faces]})
        if mirror:
            mv, mf = place(mesh, mirror_x=True)
            self.parts.append({"name": name + "R", "material": material, "flat": flat,
                               "verts": mv, "faces": mf})
            self.parts[-2]["name"] = name + "L"

    def bounds(self):
        allv = np.concatenate([p["verts"] for p in self.parts])
        return allv.min(axis=0), allv.max(axis=0)

    def to_json(self):
        lo, hi = self.bounds()
        parts = []
        for p in self.parts:
            parts.append({
                "name": p["name"], "material": p["material"], "flat": p["flat"],
                "positions": [round(float(x), 3) for x in p["verts"].reshape(-1)],
                "indices": [i for f in p["faces"] for i in f],
            })
        return {"title": self.title, "kind": self.kind, "notes": self.notes,
                "materials": self.materials,
                "bounds": {"min": [round(float(x), 3) for x in lo], "max": [round(float(x), 3) for x in hi]},
                "parts": parts}


def hull_top(rings, z):
    """Top surface height of a loft at z (for stripes that hug the body)."""
    zs = [r[0] for r in rings]
    tops = [r[3] + r[2] / 2 for r in rings]
    order = np.argsort(zs)
    return float(np.interp(z, np.array(zs)[order], np.array(tops)[order]))


def hull_half_width(rings, z):
    zs = [r[0] for r in rings]
    ws = [r[1] / 2 for r in rings]
    order = np.argsort(zs)
    return float(np.interp(z, np.array(zs)[order], np.array(ws)[order]))


def stripe(rings, z0, z1, width, lift=0.006, steps=10):
    out = []
    for i in range(steps + 1):
        z = z0 + (z1 - z0) * i / steps
        out.append((z, width, 0.03, hull_top(rings, z) + lift - 0.012, 3))
    return loft(out, 8)


def car_materials(key):
    mats = json.loads(json.dumps(CAR_MATERIALS))
    primary, secondary = CAR_COLORS[key]
    mats["paint"]["color"] = primary
    mats["under"]["color"] = primary
    mats["glow"]["color"] = secondary
    mats["thrust"]["color"] = secondary
    return mats


def common_underside(asset, length, width, z_shift=0.0):
    """Hover pads + chassis tray every car shares."""
    tray = loft([(length / 2 - 0.4 + z_shift, width * 0.45, 0.08, 0.24, 3),
                 (z_shift, width * 0.78, 0.12, 0.22, 4),
                 (-length / 2 + 0.35 + z_shift, width * 0.7, 0.1, 0.26, 4)], 16)
    asset.add("chassisTray", "carbon", tray)
    for name, z in (("hoverPadFront", length * 0.3), ("hoverPadRear", -length * 0.3)):
        pad = place(ellipsoid(0.62, 0.1, 0.9, 6, 14), (width * 0.3, 0.17, z + z_shift))
        asset.add(name, "under", pad, mirror=True)


def build_pulse():
    a = Asset("pulse", "Pulse GT · PX-01", "car", car_materials("pulse"),
              "Balanced ion racer. Dorsal stabiliser fin, twin ion thrusters, split rear wing.")
    hull = [(2.35, 0.34, 0.12, 0.44, 2.2), (2.1, 1.04, 0.26, 0.44, 2.6), (1.55, 1.62, 0.40, 0.47, 3.0),
            (0.85, 1.86, 0.50, 0.51, 3.4), (0.0, 1.94, 0.56, 0.53, 3.6), (-0.9, 1.92, 0.58, 0.55, 3.6),
            (-1.7, 1.80, 0.54, 0.56, 3.4), (-2.12, 1.56, 0.44, 0.57, 3.0), (-2.25, 1.34, 0.30, 0.57, 2.6)]
    a.add("hull", "paint", loft(hull, 28))
    canopy = [(1.25, 0.22, 0.05, 0.74, 2.2), (0.75, 0.86, 0.36, 0.84, 2.4), (0.05, 1.04, 0.52, 0.9, 2.5),
              (-0.75, 0.9, 0.42, 0.88, 2.5), (-1.3, 0.34, 0.1, 0.82, 2.2)]
    a.add("canopy", "glass", loft(canopy, 24))
    pod = [(1.15, 0.1, 0.1, 0.4, 2), (0.75, 0.42, 0.34, 0.4, 2.6), (-0.6, 0.52, 0.42, 0.42, 3),
           (-1.85, 0.5, 0.4, 0.44, 3), (-2.2, 0.36, 0.28, 0.45, 2.6)]
    a.add("sidePod", "trim", place(loft(pod, 16), (0.98, 0, 0)), mirror=True)
    a.add("intakeGlow", "glow", place(box(0.06, 0.16, 0.9, 0.2), (1.2, 0.46, 0.2)), flat=True, mirror=True)
    fin = prism([[0, 0], [0.08, 0], [-0.62, 0.5], [-0.9, 0.5], [-1.0, 0.08]], 0.09, 0.1)
    a.add("dorsalFin", "glow", place(fin, (0, hull_top(hull, -0.6) - 0.06, -0.55), rot=(0, -math.pi / 2, 0)), flat=True)
    a.add("centreStripe", "glow", stripe(hull, 1.9, -0.6, 0.16))
    wing = prism([[-1.16, 0], [1.16, 0], [1.1, 0.07], [-1.1, 0.07]], 0.52, 0.12)
    a.add("rearWing", "paint", place(wing, (0, 1.02, -1.98), rot=(0.08, 0, 0)), flat=True)
    a.add("wingStrut", "carbon", place(box(0.07, 0.42, 0.26), (0.62, 0.84, -1.95), rot=(0, 0, -0.08)), flat=True, mirror=True)
    a.add("wingEndplate", "glow", place(box(0.04, 0.24, 0.6), (1.17, 1.07, -1.98)), flat=True, mirror=True)
    a.add("thruster", "chrome", place(cylinder(0.22, 0.56, 18, 0.88), (0.5, 0.56, -2.28)), mirror=True)
    a.add("thrusterCore", "thrust", place(ellipsoid(0.34, 0.34, 0.08, 6, 14), (0.5, 0.56, -2.57)), mirror=True)
    a.add("headlight", "light", place(box(0.42, 0.05, 0.12, 0.2), (0.48, 0.52, 1.92), rot=(0, 0.32, 0)), flat=True, mirror=True)
    a.add("tailBar", "tail", place(box(1.3, 0.06, 0.05, 0.2), (0, 0.66, -2.24)), flat=True)
    common_underside(a, 4.5, 1.9)
    return a


def build_vortex():
    a = Asset("vortex", "Vortex R9 · VX-R9", "car", car_materials("vortex"),
              "Razor-handling wedge. Low forward cockpit, twin blade outriggers on carbon struts.")
    hull = [(2.55, 0.18, 0.06, 0.36, 2), (2.2, 0.9, 0.18, 0.37, 2.2), (1.4, 1.5, 0.32, 0.41, 2.6),
            (0.5, 1.7, 0.44, 0.45, 3.0), (-0.5, 1.72, 0.5, 0.48, 3.2), (-1.5, 1.66, 0.48, 0.5, 3.2),
            (-2.15, 1.44, 0.4, 0.51, 3.0), (-2.3, 1.2, 0.26, 0.51, 2.6)]
    a.add("hull", "paint", loft(hull, 28))
    canopy = [(1.65, 0.2, 0.04, 0.6, 2), (1.15, 0.74, 0.28, 0.66, 2.4), (0.45, 0.86, 0.4, 0.71, 2.4),
              (-0.3, 0.7, 0.3, 0.7, 2.4), (-0.75, 0.24, 0.06, 0.66, 2)]
    a.add("canopy", "glass", loft(canopy, 24))
    blade = [(2.1, 0.04, 0.05, 0.4, 2), (1.5, 0.24, 0.16, 0.42, 2.2), (0.0, 0.3, 0.22, 0.46, 2.4),
             (-1.6, 0.28, 0.2, 0.5, 2.4), (-2.35, 0.14, 0.12, 0.52, 2)]
    a.add("outriggerBlade", "paint", place(loft(blade, 14), (1.42, 0, 0), rot=(0, 0, 0)), mirror=True)
    a.add("bladeEdge", "glow", place(box(0.035, 0.05, 3.6, 0.3), (1.58, 0.46, -0.1)), flat=True, mirror=True)
    for name, z in (("strutFront", 0.9), ("strutRear", -1.2)):
        a.add(name, "carbon", place(box(0.7, 0.07, 0.24), (1.08, 0.45, z), rot=(0, 0, -0.12)), flat=True, mirror=True)
    a.add("splitter", "carbon", place(prism([[-0.9, 0], [0.9, 0], [0.5, 0.04], [-0.5, 0.04]], 0.5), (0, 0.27, 2.1)), flat=True)
    a.add("centreStripe", "glow", stripe(hull, 2.2, -2.1, 0.08))
    a.add("spoiler", "paint", place(prism([[-0.85, 0], [0.85, 0], [0.8, 0.05], [-0.8, 0.05]], 0.4, 0.1), (0, 0.86, -2.0), rot=(0.18, 0, 0)), flat=True)
    a.add("spoilerPylon", "carbon", place(box(0.05, 0.22, 0.2), (0.4, 0.76, -1.98)), flat=True, mirror=True)
    a.add("thruster", "chrome", place(cylinder(0.18, 0.5, 16, 0.86), (0.36, 0.5, -2.32)), mirror=True)
    a.add("thrusterCore", "thrust", place(ellipsoid(0.28, 0.28, 0.08, 6, 14), (0.36, 0.5, -2.58)), mirror=True)
    a.add("bladeThruster", "thrust", place(ellipsoid(0.2, 0.16, 0.08, 6, 12), (1.42, 0.52, -2.4)), mirror=True)
    a.add("headlight", "light", place(box(0.5, 0.035, 0.1, 0.2), (0.42, 0.42, 2.02), rot=(0, 0.42, 0)), flat=True, mirror=True)
    a.add("tailBar", "tail", place(box(1.0, 0.05, 0.05, 0.2), (0, 0.6, -2.29)), flat=True)
    common_underside(a, 4.6, 1.7)
    return a


def build_solar():
    a = Asset("solar", "Solar Wraith · SW-77", "car", car_materials("solar"),
              "Maximum-velocity interceptor. Needle nose with ring intake, twin booster nacelles, twin tails.")
    hull = [(2.95, 0.12, 0.08, 0.5, 2), (2.6, 0.5, 0.2, 0.5, 2.2), (1.9, 0.95, 0.34, 0.52, 2.4),
            (1.0, 1.28, 0.48, 0.55, 2.8), (0.0, 1.42, 0.58, 0.58, 3.0), (-1.1, 1.4, 0.6, 0.6, 3.0),
            (-1.9, 1.3, 0.54, 0.6, 2.8), (-2.3, 1.1, 0.4, 0.6, 2.4)]
    a.add("hull", "paint", loft(hull, 28))
    a.add("intakeRing", "glow", place(torus(0.3, 0.055, 28, 8), (0, 0.5, 2.62)))
    canopy = [(1.4, 0.16, 0.04, 0.74, 2), (0.9, 0.62, 0.3, 0.8, 2.4), (0.15, 0.78, 0.42, 0.86, 2.4),
              (-0.6, 0.66, 0.34, 0.85, 2.4), (-1.1, 0.2, 0.06, 0.8, 2)]
    a.add("canopy", "glass", loft(canopy, 24))
    nacelle = [(1.3, 0.12, 0.12, 0.5, 2), (0.8, 0.46, 0.44, 0.5, 2.2), (-0.8, 0.6, 0.56, 0.52, 2.2),
               (-2.0, 0.6, 0.56, 0.52, 2.2), (-2.45, 0.5, 0.46, 0.52, 2.2)]
    a.add("boosterNacelle", "paint", place(loft(nacelle, 20), (0.88, 0, 0)), mirror=True)
    a.add("nacelleBand", "trim", place(cylinder(0.31, 0.16, 20), (0.88, 0.52, -0.2)), mirror=True)
    a.add("boosterNozzle", "chrome", place(cylinder(0.26, 0.34, 18, 1.14), (0.88, 0.52, -2.55)), mirror=True)
    a.add("boosterCore", "thrust", place(ellipsoid(0.44, 0.44, 0.1, 6, 16), (0.88, 0.52, -2.74)), mirror=True)
    a.add("pylon", "carbon", place(box(0.5, 0.1, 1.6), (0.52, 0.5, -0.9)), flat=True, mirror=True)
    tail = prism([[0, 0], [0.1, 0], [-0.5, 0.62], [-0.78, 0.62], [-0.95, 0.05]], 0.08, 0.1)
    a.add("twinTail", "glow", place(tail, (0.42, hull_top(hull, -1.5) - 0.06, -1.25), rot=(0, -math.pi / 2, -0.18)), flat=True, mirror=True)
    a.add("centreStripe", "glow", stripe(hull, 2.5, -1.9, 0.1))
    a.add("canard", "paint", place(box(0.6, 0.04, 0.32, 0.3), (0.62, 0.5, 1.75), rot=(0, 0.35, -0.12)), flat=True, mirror=True)
    a.add("headlight", "light", place(box(0.3, 0.04, 0.1, 0.2), (0.3, 0.5, 2.48), rot=(0, 0.5, 0)), flat=True, mirror=True)
    a.add("tailBar", "tail", place(box(0.9, 0.05, 0.05, 0.2), (0, 0.72, -2.3)), flat=True)
    common_underside(a, 4.9, 1.8, -0.1)
    return a


def build_prism():
    a = Asset("prism", "Prism Titan · PT-X", "car", car_materials("prism"),
              "Shielded quantum collector. Boxy armoured hull, side armour pods, floating prism core, ram bar.")
    hull = [(2.3, 0.9, 0.3, 0.5, 4), (2.05, 1.6, 0.46, 0.54, 4.5), (1.3, 1.95, 0.62, 0.6, 5),
            (0.0, 2.05, 0.74, 0.64, 5.5), (-1.3, 2.05, 0.76, 0.66, 5.5), (-2.05, 1.9, 0.66, 0.66, 5),
            (-2.3, 1.62, 0.5, 0.66, 4)]
    a.add("hull", "paint", loft(hull, 28))
    canopy = [(1.15, 0.5, 0.06, 0.96, 3), (0.7, 1.0, 0.36, 1.06, 3.4), (-0.3, 1.14, 0.46, 1.1, 3.6),
              (-1.1, 1.0, 0.34, 1.08, 3.4), (-1.5, 0.5, 0.08, 1.02, 3)]
    a.add("canopy", "glass", loft(canopy, 24))
    a.add("armourPod", "paint", place(box(0.6, 0.56, 2.4, 0.22), (1.24, 0.52, -0.3), rot=(0, 0, 0.1)), flat=True, mirror=True)
    a.add("podPlate", "trim", place(box(0.06, 0.36, 2.0, 0.3), (1.55, 0.54, -0.3), rot=(0, 0, 0.1)), flat=True, mirror=True)
    a.add("podLight", "glow", place(box(0.04, 0.06, 1.6, 0.3), (1.6, 0.66, -0.3), rot=(0, 0, 0.1)), flat=True, mirror=True)
    a.add("prismCore", "glow", place(octahedron(0.5, 0.7, 0.5), (0, 1.62, -0.35)), flat=True)
    a.add("coreCradle", "chrome", place(torus(0.36, 0.035, 28, 6), (0, 1.38, -0.35), rot=(math.pi / 2, 0, 0)))
    a.add("cradleMast", "carbon", place(box(0.08, 0.28, 0.08), (0, 1.22, -0.35)), flat=True)
    a.add("ramBar", "chrome", place(cylinder(0.06, 1.7, 12), (0, 0.36, 2.4), rot=(0, math.pi / 2, 0)))
    a.add("ramPost", "carbon", place(box(0.08, 0.2, 0.3), (0.55, 0.38, 2.3)), flat=True, mirror=True)
    a.add("centreStripe", "glow", stripe(hull, 2.1, 1.2, 0.3))
    a.add("thruster", "chrome", place(cylinder(0.24, 0.5, 18, 0.9), (0.56, 0.64, -2.32)), mirror=True)
    a.add("thrusterCore", "thrust", place(ellipsoid(0.38, 0.38, 0.08, 6, 14), (0.56, 0.64, -2.58)), mirror=True)
    a.add("headlight", "light", place(box(0.5, 0.08, 0.06, 0.2), (0.5, 0.62, 2.3)), flat=True, mirror=True)
    a.add("tailBar", "tail", place(box(1.6, 0.07, 0.05, 0.2), (0, 0.84, -2.3)), flat=True)
    common_underside(a, 4.6, 2.0)
    return a


def build_barrier():
    a = Asset("barrier", "Pulse Barricade", "hazard", PROP_MATERIALS,
              "Lane-blocking energy barricade. 38 base damage. Hazard-striped face plates.")
    a.add("body", "hazard", place(box(2.45, 0.86, 0.6, 0.14), (0, 0.6, 0)), flat=True)
    a.add("glowBand", "hazardGlow", place(box(2.5, 0.1, 0.64, 0.2), (0, 0.98, 0)), flat=True)
    for i, x in enumerate((-0.74, 0.0, 0.74)):
        a.add(f"stripe{i}", "stripe", place(box(0.24, 0.6, 0.04, 0.2), (x, 0.6, 0.31), rot=(0, 0, -0.42)), flat=True)
    a.add("foot", "steel", place(box(0.4, 0.2, 0.9), (0.9, 0.1, 0)), flat=True, mirror=True)
    return a


def build_mine():
    a = Asset("mine", "Ion Mine", "hazard", PROP_MATERIALS,
              "Floating proximity mine. 46 base damage. Twelve emitter spikes and a warning halo.")
    a.add("core", "mine", place(icosphere(0.5, 1), (0, 0.74, 0)), flat=True)
    t = (1 + 5 ** 0.5) / 2
    dirs = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t],
            [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
    pts = []
    for i, d in enumerate(dirs):
        d = np.array(d, float) / np.linalg.norm(d)
        spike = octahedron(0.14, 0.14, 0.4)
        v, f = spike
        # orient the spike's Z axis along d
        z = d
        x = np.cross([0, 1, 0], z) if abs(z[1]) < 0.95 else np.cross([1, 0, 0], z)
        x /= np.linalg.norm(x)
        y = np.cross(z, x)
        v2 = v @ np.array([x, y, z]) + d * 0.56 + np.array([0, 0.74, 0])
        a.add(f"spike{i:02}", "mineGlow", (v2, f), flat=True)
    a.add("halo", "stripe", place(torus(0.9, 0.05, 32, 6), (0, 0.74, 0), rot=(math.pi / 2, 0, 0)))
    return a


def build_drone():
    a = Asset("drone", "Sentinel Drone", "hazard", PROP_MATERIALS,
              "Weaving sentry drone. 34 base damage. Armoured core, swept wings, twin rotor rings.")
    a.add("core", "drone", place(octahedron(0.9, 0.8, 1.1), (0, 1.2, 0)), flat=True)
    a.add("eye", "droneGlow", place(ellipsoid(0.32, 0.22, 0.2, 6, 12), (0, 1.2, 0.46)))
    wing = prism([[0, -0.04], [1.0, -0.12], [1.05, 0.0], [0, 0.06]], 0.5, 0.1)
    a.add("wing", "drone", place(wing, (0.3, 1.2, 0), rot=(0, 0, 0.18)), flat=True, mirror=True)
    a.add("rotor", "droneGlow", place(torus(0.32, 0.04, 24, 6), (1.18, 1.36, 0), rot=(math.pi / 2, 0, 0)), mirror=True)
    a.add("rotorHub", "steel", place(cylinder(0.08, 0.2, 10), (1.18, 1.32, 0), rot=(math.pi / 2, 0, 0)), mirror=True)
    return a


def build_coin():
    a = Asset("coin", "Quantum Coin", "pickup", PROP_MATERIALS, "Chain coins for combo multipliers up to ×5.")
    a.add("ring", "gold", place(torus(0.32, 0.11, 26, 10), (0, 1.05, 0)))
    a.add("core", "goldCore", place(octahedron(0.36, 0.44, 0.36), (0, 1.05, 0)), flat=True)
    return a


def build_nitro():
    a = Asset("nitro", "Nitro Cell", "pickup", PROP_MATERIALS, "+48 nitro.")
    a.add("crystal", "nitroGlow", place(octahedron(0.9, 1.6, 0.9), (0, 1.12, 0)), flat=True)
    a.add("cage", "nitro", place(torus(0.62, 0.05, 28, 6), (0, 1.12, 0), rot=(math.pi / 2, 0, 0)))
    a.add("ring", "white", place(torus(0.86, 0.035, 32, 6), (0, 1.12, 0), rot=(math.pi / 2, 0, 0)))
    return a


def build_repair():
    a = Asset("repair", "Aegis Repair", "pickup", PROP_MATERIALS, "+36 shield integrity.")
    a.add("vertical", "repair", place(box(0.34, 1.2, 0.3, 0.2), (0, 1.05, 0)), flat=True)
    a.add("horizontal", "repair", place(box(1.2, 0.34, 0.3, 0.2), (0, 1.05, 0)), flat=True)
    a.add("halo", "white", place(torus(0.82, 0.03, 32, 6), (0, 1.05, 0)))
    return a


def build_boost_pad():
    a = Asset("boostPad", "Warp Boost Pad", "track", PROP_MATERIALS,
              "Flush road pad. Speed ×1.13 +4 m/s, +34 nitro, +6 coins.")
    a.add("frame", "nitro", place(box(3.0, 0.06, 6.0, 0.2), (0, 0.03, 0)), flat=True)
    for i in range(4):
        # a chevron is concave, so each arm is its own convex prism
        left = prism([[-1.1, 0], [0, 0.55], [0, 0.83], [-1.1, 0.28]], 0.04)
        right = prism([[1.1, 0], [0, 0.55], [0, 0.83], [1.1, 0.28]], 0.04)
        for side, arm in (("L", left), ("R", right)):
            a.add(f"chevron{i}{side}", "nitroGlow", place(arm, (0, 0.075, -2.2 + i * 1.3), rot=(math.pi / 2, 0, 0)), flat=True)
    return a


def build_gate():
    a = Asset("gate", "Checkpoint Arch", "track", PROP_MATERIALS,
              "Spans the full 18 m Grand Prix raceway. Start/finish variant carries the checker header.")
    for side in (-1, 1):
        a.add("pylon" + ("L" if side < 0 else "R"), "gate", place(box(0.7, 7.4, 0.9, 0.18), (side * 9.9, 3.7, 0)), flat=True)
        a.add("pylonGlow" + ("L" if side < 0 else "R"), "gateGlow", place(box(0.08, 6.6, 0.95, 0.3), (side * 9.52, 3.7, 0)), flat=True)
        a.add("foot" + ("L" if side < 0 else "R"), "steel", place(box(1.4, 0.5, 1.6), (side * 9.9, 0.25, 0)), flat=True)
    a.add("header", "gate", place(box(20.5, 1.1, 1.0, 0.18), (0, 7.6, 0)), flat=True)
    a.add("headerGlow", "gateKey", place(box(19.0, 0.12, 1.06, 0.3), (0, 7.06, 0)), flat=True)
    for i in range(10):
        for row in range(2):
            if (i + row) % 2 == 0:
                a.add(f"checker{i}{row}", "checker", place(box(1.6, 0.42, 0.04, 0.05), (-7.2 + i * 1.6, 7.36 + row * 0.42, 0.51)), flat=True)
    a.add("halo", "gateGlow", place(torus(4.2, 0.08, 48, 6), (0, 5.4, 0)))
    return a


ASSETS = [build_pulse, build_vortex, build_solar, build_prism, build_barrier, build_mine, build_drone,
          build_coin, build_nitro, build_repair, build_boost_pad, build_gate]


def main():
    assets = {}
    for build in ASSETS:
        asset = build()
        assets[asset.key] = asset.to_json()
        lo, hi = asset.bounds()
        tris = sum(len(p["faces"]) for p in asset.parts)
        print(f"{asset.key:9s} {len(asset.parts):3d} parts {tris:6d} tris  "
              f"W {hi[0]-lo[0]:.2f}  H {hi[1]-lo[1]:.2f}  L {hi[2]-lo[2]:.2f} m")
    spec = {"version": VERSION, "units": "metres", "up": "+Y", "forward": "+Z", "assets": assets}
    out = ROOT / "app/game/blueprint-spec.json"
    out.write_text(json.dumps(spec, separators=(",", ":")))
    print(out, f"{out.stat().st_size/1024:.0f} KB")


if __name__ == "__main__":
    main()
