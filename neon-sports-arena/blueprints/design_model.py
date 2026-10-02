"""Authoritative geometric recipe for Neon Sports Arena 2.0 (blueprint series NS-02).

Run this script after changing dimensions or colours. The emitted JSON is the
single source of truth for the game (Babylon VertexData), the blueprint
renderer, the GLB exporter and the stadium layout.

World units are metres, +Y is up and every asset faces +Z. The athlete is a
1.89 m articulated pro in hover-skates; jersey, trim and light strips are
tinted at runtime with the selected team kit, and arena accents are tinted with
the venue colour.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

from make_textures import make_all as make_textures
from mesh_geometry import build as build_mesh

ROOT = Path(__file__).resolve().parents[1]
VERSION = "2.0.0"
PI = math.pi
FRONT = PI / 2
BACK = 3 * PI / 2

palette = {
    # Athlete kit. Tinted entries get neutral vertex shading; the game swaps in
    # the team colours (kitPrimary = team accent, kitTrim = team colour).
    "suit": {"color": "#1b2338", "emissive": 0.04, "texture": "suit"},
    "jersey": {"color": "#1268ff", "emissive": 0.08, "tint": "kitPrimary", "tintScale": 0.82, "texture": "jersey"},
    "trim": {"color": "#49f4ff", "emissive": 0.30, "tint": "kitTrim"},
    "glow": {"color": "#49f4ff", "emissive": 1.25, "tint": "kitTrim"},
    "armor": {"color": "#2b3452", "emissive": 0.05, "texture": "armor"},
    "ceramic": {"color": "#e3eaf4", "emissive": 0.06, "texture": "ceramic"},
    "visor": {"color": "#0b1528", "emissive": 0.18},
    "steel": {"color": "#56627c", "emissive": 0.05, "texture": "steel"},
    "rubber": {"color": "#0d1019", "emissive": 0.02},
    # Equipment.
    "pearl": {"color": "#eef3ff", "emissive": 0.14},
    "amber": {"color": "#ff8b3d", "emissive": 0.32},
    "cyan": {"color": "#49f4ff", "emissive": 1.2},
    "magenta": {"color": "#ff55ad", "emissive": 1.1},
    "lime": {"color": "#d9ff4f", "emissive": 1.1},
    "violet": {"color": "#9b7cff", "emissive": 1.15},
    "gold": {"color": "#ffd447", "emissive": 0.5},
    "red": {"color": "#ff4969", "emissive": 1.0},
    "white": {"color": "#f4f8ff", "emissive": 1.35},
    "glass": {"color": "#7fe9ff", "emissive": 0.22, "alpha": 0.2},
    "net": {"color": "#bff6ff", "emissive": 0.55, "alpha": 0.42, "texture": "net"},
    # Venue. "accent" and "seat" take the arena colour.
    "accent": {"color": "#49f4ff", "emissive": 1.0, "tint": "arena"},
    "seat": {"color": "#49f4ff", "emissive": 0.1, "tint": "arena", "tintScale": 0.5},
    "concrete": {"color": "#232a40", "emissive": 0.03, "texture": "concrete"},
    "floor": {"color": "#0b1233", "emissive": 0.07, "texture": "floor"},
    "screen": {"color": "#05070f", "emissive": 0.9},
    "crowd": {"color": "#c9d1e8", "emissive": 0.06},
    "tower": {"color": "#141b30", "emissive": 0.04},
    "window": {"color": "#ffd28a", "emissive": 0.9},
}
for value in palette.values():
    if "texture" in value:
        value["texture"] = f"/blueprint-textures/{value['texture']}-finish.png"

ASSETS = ("athlete", "energy_ball", "gravity_orb", "power_core", "goal_frame", "keeper_drone",
          "hoop_rig", "capture_zone", "holo_target", "pickup_energy", "pickup_shield", "pickup_turbo",
          "launch_pad", "trophy", "pitch", "board_section", "stand_section", "floodlight",
          "jumbotron", "spectator", "sky_tower")
assets: dict[str, list[dict]] = {key: [] for key in ASSETS}


def part(asset, name, shape, size, at, material, group="root", rotation=None, **extra):
    item = {"name": name, "shape": shape, "size": [round(max(v, .001), 4) for v in size],
            "position": [round(v, 4) for v in at], "material": material}
    if group != "root":
        item["group"] = group
    if rotation:
        item["rotation"] = [round(v, 4) for v in rotation]
    item.update(extra)
    assets[asset].append(item)
    return item


# ---------------------------------------------------------------------------
# Loft / shell helpers (cross sections: height, width, depth, forward, n)
# ---------------------------------------------------------------------------

def bbox(profile, axis="y"):
    along = [p[0] for p in profile]
    w = max(p[1] for p in profile)
    d = max(abs(p[3]) + p[2] / 2 for p in profile) * 2
    length = max(max(along) - min(along), .01)
    return [max(w, .01), length, max(d, .01)] if axis == "y" else [max(w, .01), max(d, .01), length]


def body(asset, name, profile, material, group="root", at=(0, 0, 0), rotation=None, segments=24, axis="y"):
    return part(asset, name, "loft", bbox(profile, axis), list(at), material, group, rotation,
                profile=[[round(v, 4) for v in ring] for ring in profile], segments=segments, axis=axis)


def interp(profile, y):
    pts = sorted(profile, key=lambda p: p[0])
    if y <= pts[0][0]:
        return list(pts[0])
    if y >= pts[-1][0]:
        return list(pts[-1])
    for a, b in zip(pts, pts[1:]):
        if a[0] <= y <= b[0]:
            t = (y - a[0]) / (b[0] - a[0])
            return [y] + [a[i] + (b[i] - a[i]) * t for i in range(1, 5)]
    raise ValueError(y)


def slice_profile(profile, y0, y1, inflate, rings=5, taper=0.0):
    out = []
    for i in range(rings):
        y = y0 + (y1 - y0) * i / (rings - 1)
        _, w, d, off, n = interp(profile, y)
        edge = 1 - taper * (abs(i - (rings - 1) / 2) / ((rings - 1) / 2)) ** 4
        out.append([y, (w + 2 * inflate) * edge, (d + 2 * inflate) * edge, off, n])
    return out


def plate(asset, name, profile, y0, y1, inflate, arc, material, group="root", thickness=.012,
          rings=5, taper=.04, segments=18, at=(0, 0, 0), rotation=None):
    prof = slice_profile(profile, y0, y1, inflate, rings, taper)
    return part(asset, name, "shell", bbox(prof), list(at), material, group, rotation,
                profile=[[round(v, 4) for v in ring] for ring in prof],
                arc=[round(arc[0], 4), round(arc[1], 4)], thickness=thickness, segments=segments)


def mirror_arc(arc, side):
    """Arcs are authored for the right (+X) side; mirror them for the left."""
    return arc if side > 0 else (PI - arc[1], PI - arc[0])


def surface_z(profile, y, inflate=0.0):
    """Front (+Z) surface depth of a body profile at height y."""
    _, _, d, off, _ = interp(profile, y)
    return off + d / 2 + inflate


def disc(asset, name, diameter, height, at, material, bevel=.06, segments=40, group="root", rotation=None):
    r = diameter
    prof = [[-height / 2, r * (1 - bevel), r * (1 - bevel), 0, 2], [-height / 2 + height * .25, r, r, 0, 2],
            [height / 2 - height * .25, r, r, 0, 2], [height / 2, r * (1 - bevel), r * (1 - bevel), 0, 2]]
    return body(asset, name, prof, material, group, at=at, rotation=rotation, segments=segments)


def torus(asset, name, diameter, thickness, at, material, group="root", rotation=None, major=36, minor=8, **extra):
    return part(asset, name, "torus", [diameter, thickness, diameter], at, material, group, rotation,
                diameter=diameter, thickness=thickness, major=major, minor=minor, **extra)


def tube(asset, name, path, radius, material, group="root", segments=10, closed=False, at=(0, 0, 0)):
    xs = [p[0] for p in path]; ys = [p[1] for p in path]; zs = [p[2] for p in path]
    r = max(radius) if isinstance(radius, list) else radius
    size = [max(xs) - min(xs) + 2 * r, max(ys) - min(ys) + 2 * r, max(zs) - min(zs) + 2 * r]
    return part(asset, name, "tube", size, list(at), material, group,
                path=[[round(v, 4) for v in p] for p in path], radius=radius, segments=segments, closed=closed)


def prism(asset, name, polygon, depth, at, material, axis="x", group="root", rotation=None):
    us = [p[0] for p in polygon]; vs = [p[1] for p in polygon]
    span_u = max(us) - min(us); span_v = max(vs) - min(vs)
    size = {"x": [depth, span_v, span_u], "z": [span_u, span_v, depth], "y": [span_u, depth, span_v]}[axis]
    return part(asset, name, "prism", size, list(at), material, group, rotation,
                polygon=[[round(u, 4), round(v, 4)] for u, v in polygon], depth=depth, axis=axis)


def circle(radius, count, y=0.0, a0=0.0, a1=2 * PI, closed=True):
    n = count if closed else count + 1
    return [[radius * math.cos(a0 + (a1 - a0) * i / count), y, radius * math.sin(a0 + (a1 - a0) * i / count)]
            for i in range(n)]


# ---------------------------------------------------------------------------
# ATHLETE. 1.89 m, faces +Z, feet (hover discs) rest on Y = 0, right = +X.
# ---------------------------------------------------------------------------
groups = {
    "hips": {"parent": "root", "position": [0, 0.98, 0]},
    "spine": {"parent": "hips", "position": [0, 0.08, 0]},
    "chest": {"parent": "spine", "position": [0, 0.23, 0]},
    "neck": {"parent": "chest", "position": [0, 0.262, -0.01]},
    "head": {"parent": "neck", "position": [0, 0.085, 0.01]},
    "leftUpperArm": {"parent": "chest", "position": [-0.218, 0.198, -0.01], "rotation": [0, 0, -0.14]},
    "leftForeArm": {"parent": "leftUpperArm", "position": [0, -0.29, 0], "rotation": [-0.2, 0, 0]},
    "leftHand": {"parent": "leftForeArm", "position": [0, -0.262, 0]},
    "rightUpperArm": {"parent": "chest", "position": [0.218, 0.198, -0.01], "rotation": [0, 0, 0.14]},
    "rightForeArm": {"parent": "rightUpperArm", "position": [0, -0.29, 0], "rotation": [-0.2, 0, 0]},
    "rightHand": {"parent": "rightForeArm", "position": [0, -0.262, 0]},
    "leftThigh": {"parent": "hips", "position": [-0.105, -0.05, 0]},
    "leftShin": {"parent": "leftThigh", "position": [0, -0.43, 0]},
    "leftFoot": {"parent": "leftShin", "position": [0, -0.41, 0]},
    "rightThigh": {"parent": "hips", "position": [0.105, -0.05, 0]},
    "rightShin": {"parent": "rightThigh", "position": [0, -0.43, 0]},
    "rightFoot": {"parent": "rightShin", "position": [0, -0.41, 0]},
}

PELVIS = [[-0.13, 0.20, 0.15, 0.0, 2.2], [-0.09, 0.32, 0.21, 0.0, 2.4], [-0.02, 0.36, 0.235, 0.0, 2.6],
          [0.05, 0.35, 0.225, 0.0, 2.6], [0.11, 0.315, 0.21, 0.0, 2.4]]
ABDOMEN = [[-0.05, 0.30, 0.20, 0.0, 2.4], [0.05, 0.285, 0.195, 0.01, 2.4], [0.15, 0.305, 0.205, 0.012, 2.4],
           [0.26, 0.345, 0.222, 0.012, 2.5]]
CHEST = [[-0.03, 0.345, 0.222, 0.012, 2.5], [0.05, 0.385, 0.245, 0.016, 2.6], [0.13, 0.425, 0.258, 0.012, 2.7],
         [0.185, 0.445, 0.245, 0.0, 2.9], [0.23, 0.405, 0.205, -0.01, 3.0], [0.268, 0.25, 0.155, -0.015, 2.4],
         [0.29, 0.135, 0.125, -0.01, 2.0]]
NECK = [[-0.03, 0.13, 0.13, 0.0, 2.0], [0.05, 0.115, 0.12, 0.005, 2.0], [0.11, 0.118, 0.122, 0.01, 2.0]]
SKULL = [[-0.035, 0.10, 0.11, 0.035, 2.0], [0.0, 0.145, 0.17, 0.02, 2.2], [0.05, 0.172, 0.205, 0.008, 2.3],
         [0.11, 0.182, 0.222, 0.0, 2.3], [0.17, 0.176, 0.214, -0.006, 2.25], [0.21, 0.15, 0.18, -0.01, 2.1],
         [0.235, 0.10, 0.12, -0.012, 2.0], [0.25, 0.04, 0.05, -0.012, 2.0]]
UPPER_ARM = [[0.055, 0.105, 0.105, 0.0, 2.0], [0.0, 0.138, 0.13, 0.0, 2.2], [-0.06, 0.13, 0.122, 0.005, 2.2],
             [-0.14, 0.114, 0.108, 0.004, 2.2], [-0.22, 0.098, 0.096, 0.0, 2.2], [-0.295, 0.087, 0.09, 0.0, 2.0]]
FOREARM = [[0.025, 0.088, 0.088, 0.0, 2.0], [-0.04, 0.098, 0.092, 0.004, 2.2], [-0.12, 0.088, 0.077, 0.002, 2.3],
           [-0.2, 0.07, 0.06, 0.0, 2.3], [-0.252, 0.062, 0.052, 0.0, 2.2]]
THIGH = [[0.05, 0.155, 0.165, 0.0, 2.2], [-0.03, 0.178, 0.182, 0.008, 2.3], [-0.13, 0.17, 0.174, 0.016, 2.3],
         [-0.25, 0.146, 0.15, 0.012, 2.3], [-0.36, 0.122, 0.128, 0.006, 2.2], [-0.435, 0.106, 0.112, 0.0, 2.2]]
SHIN = [[0.02, 0.106, 0.112, 0.0, 2.2], [-0.06, 0.114, 0.124, -0.012, 2.2], [-0.14, 0.118, 0.134, -0.022, 2.2],
        [-0.24, 0.098, 0.108, -0.012, 2.2], [-0.33, 0.078, 0.082, 0.0, 2.2], [-0.39, 0.072, 0.076, 0.0, 2.0]]
# Hover-skate boot lofted forward along +Z: (z, width, height, vertical offset, n)
BOOT = [[-0.08, 0.086, 0.104, -0.022, 2.4], [-0.045, 0.104, 0.118, -0.016, 3.0], [0.03, 0.106, 0.104, -0.022, 3.2],
        [0.1, 0.1, 0.078, -0.034, 3.2], [0.155, 0.086, 0.056, -0.043, 3.0], [0.188, 0.058, 0.036, -0.052, 2.4]]

A = "athlete"

# --- Compression under-suit ---------------------------------------------------
body(A, "pelvis", PELVIS, "suit", "hips", segments=26)
body(A, "abdomen", ABDOMEN, "suit", "spine", segments=26)
body(A, "ribcage", CHEST, "suit", "chest", segments=26)
body(A, "neckSeal", NECK, "suit", "neck", segments=18)
body(A, "skull", SKULL, "suit", "head", segments=22)

# --- Helmet: aerodynamic shell, wrap visor, chin guard, ear comms -------------
HELMET = [[y, w + .036, d + .036, off, n] for y, w, d, off, n in SKULL]
body(A, "helmetShell", HELMET[1:], "armor", "head", segments=30)
plate(A, "helmetCrown", HELMET, .155, .246, .008, (FRONT - 1.1, FRONT + 1.1), "ceramic", "head", thickness=.012, rings=4, taper=.1)
plate(A, "visor", HELMET, .045, .14, .007, (FRONT - 1.2, FRONT + 1.2), "visor", "head", thickness=.01, rings=5, taper=.0, segments=24)
plate(A, "visorGlow", HELMET, .136, .152, .013, (FRONT - 1.22, FRONT + 1.22), "glow", "head", thickness=.008, rings=3, taper=.0, segments=24)
plate(A, "visorUnderGlow", HELMET, .04, .05, .013, (FRONT - .8, FRONT + .8), "glow", "head", thickness=.006, rings=3, taper=.0, segments=18)
plate(A, "chinGuard", HELMET, -.035, .042, .011, (FRONT - 1.0, FRONT + 1.0), "ceramic", "head", thickness=.014, rings=5, taper=.14, segments=20)
plate(A, "crestStripe", HELMET, .158, .252, .017, (FRONT - .07, FRONT + .07), "trim", "head", thickness=.01, rings=6, taper=.0, segments=3)
plate(A, "helmetNape", HELMET, -.02, .16, .007, (BACK - .95, BACK + .95), "armor", "head", thickness=.012, rings=5, taper=.08)
part(A, "rearVent", "box", [.06, .016, .02], [0, .12, -.128], "glow", "head")
for i, y in enumerate([-.005, .015]):
    part(A, f"breathGrille{i}", "box", [.046, .006, .012], [0, y, .147], "steel", "head")
for side, lab in [(-1, "L"), (1, "R")]:
    part(A, f"earPod{lab}", "cylinder", [.07, .04, .07], [side * .114, .08, -.006], "steel", "head", [0, 0, PI / 2])
    torus(A, f"earRing{lab}", .07, .012, [side * .136, .08, -.006], "glow", "head", [0, 0, PI / 2], major=20, minor=6)

# --- Jersey (team kit) ---------------------------------------------------------
plate(A, "jerseyChest", CHEST, -.03, .232, .012, (0, 2 * PI), "jersey", "chest", thickness=.01, rings=7, taper=0, segments=30)
plate(A, "jerseyBody", ABDOMEN, -.05, .262, .014, (0, 2 * PI), "jersey", "spine", thickness=.01, rings=5, taper=0, segments=30)
plate(A, "collar", CHEST, .228, .275, .02, (0, 2 * PI), "trim", "chest", thickness=.012, rings=3, taper=0, segments=28)
for side, lab in [(-1, "L"), (1, "R")]:
    plate(A, f"sidePanel{lab}", CHEST, -.025, .19, .019, mirror_arc((-.2, .2), side), "trim", "chest", thickness=.008, rings=6, taper=0, segments=4)
    plate(A, f"sidePanelLow{lab}", ABDOMEN, -.045, .255, .021, mirror_arc((-.2, .2), side), "trim", "spine", thickness=.008, rings=4, taper=0, segments=4)
    # Chest chevron: two angled bars meeting at the sternum.
    zc = surface_z(CHEST, .12, .02)
    part(A, f"chevron{lab}", "box", [.17, .022, .012], [side * .075, .14, zc - .012], "trim", "chest", [0, side * -.35, side * .42])
plate(A, "hemBand", ABDOMEN, -.05, -.02, .022, (0, 2 * PI), "trim", "spine", thickness=.008, rings=3, taper=0, segments=28)

# --- Aegis armour: chest guard, back plate, Nova Reactor ----------------------
plate(A, "chestGuard", CHEST, .1, .222, .03, (FRONT - .95, FRONT + .95), "armor", "chest", thickness=.014, rings=5, taper=.1, segments=18)
part(A, "chestCore", "octa", [.06, .07, .035], [0, .165, surface_z(CHEST, .165, .042)], "glow", "chest")
plate(A, "backPlate", CHEST, .02, .24, .028, (BACK - 1.1, BACK + 1.1), "armor", "chest", thickness=.014, rings=6, taper=.06, segments=20)
part(A, "reactorPack", "box", [.2, .2, .07], [0, .14, -.168], "steel", "chest", bevel=.3)
torus(A, "reactorRing", .13, .022, [0, .14, -.205], "glow", "chest", [PI / 2, 0, 0], major=28, minor=8)
part(A, "reactorCore", "octa", [.06, .08, .04], [0, .14, -.208], "glow", "chest")
for side, lab in [(-1, "L"), (1, "R")]:
    part(A, f"exhaust{lab}", "cylinder", [.045, .09, .045], [side * .08, .03, -.17], "steel", "chest", [-.4, 0, 0])
    part(A, f"exhaustGlow{lab}", "cylinder", [.03, .015, .03], [side * .08, -.012, -.187], "glow", "chest", [-.4, 0, 0])

# --- Shorts and belt -----------------------------------------------------------
plate(A, "shorts", PELVIS, -.125, .1, .016, (0, 2 * PI), "jersey", "hips", thickness=.01, rings=5, taper=0, segments=30)
plate(A, "belt", PELVIS, .065, .105, .028, (0, 2 * PI), "steel", "hips", thickness=.01, rings=3, taper=0, segments=28)
part(A, "beltBuckle", "box", [.06, .03, .014], [0, .085, surface_z(PELVIS, .085, .036)], "glow", "hips")

# --- Arms ----------------------------------------------------------------------
for side, lab in [(-1, "L"), (1, "R")]:
    ua, fa, hand = (f"{'left' if side < 0 else 'right'}{g}" for g in ("UpperArm", "ForeArm", "Hand"))
    body(A, f"upperArm{lab}", UPPER_ARM, "suit", ua, segments=18)
    plate(A, f"sleeve{lab}", UPPER_ARM, -.13, .05, .012, (0, 2 * PI), "jersey", ua, thickness=.009, rings=4, taper=0, segments=22)
    plate(A, f"sleeveCuff{lab}", UPPER_ARM, -.148, -.125, .016, (0, 2 * PI), "trim", ua, thickness=.008, rings=3, taper=0, segments=22)
    DOME = [[-.115, .19, .18, 0, 2.3], [-.04, .205, .195, 0, 2.3], [.025, .19, .18, 0, 2.3], [.07, .135, .13, 0, 2.1], [.095, .05, .055, 0, 2.0]]
    part(A, f"shoulderPad{lab}", "shell", bbox(DOME), [side * .014, 0, 0], "ceramic", ua,
         profile=DOME, arc=list(mirror_arc((-1.8, 1.8), side)), thickness=.016, segments=20)
    LAME = [[-.16, .17, .165, 0, 2.3], [-.115, .182, .175, 0, 2.3], [-.075, .17, .165, 0, 2.3]]
    part(A, f"padLame{lab}", "shell", bbox(LAME), [side * .016, 0, 0], "armor", ua,
         profile=LAME, arc=list(mirror_arc((-1.45, 1.45), side)), thickness=.012, segments=16)
    STRIPE = [[y, w + .012, d + .012, off, n] for y, w, d, off, n in DOME[1:]]
    part(A, f"padStripe{lab}", "shell", bbox(STRIPE), [side * .014, 0, 0], "trim", ua,
         profile=STRIPE, arc=list(mirror_arc((-.13, .13), side)), thickness=.008, segments=4)
    part(A, f"elbowPad{lab}", "sphere", [.08, .075, .066], [0, -.29, -.032], "armor", ua)
    body(A, f"foreArm{lab}", FOREARM, "suit", fa, segments=18)
    plate(A, f"wristBand{lab}", FOREARM, -.24, -.205, .012, (0, 2 * PI), "trim", fa, thickness=.012, rings=3, taper=0, segments=20)
    PALM = [[0.0, .036, .074, 0, 2.6], [-.05, .033, .09, .004, 3], [-.095, .029, .088, .006, 3]]
    body(A, f"palm{lab}", PALM, "rubber", hand, segments=14)
    for i, z in enumerate([.031, .011, -.009, -.029]):
        length = [.072, .082, .078, .064][i]
        FINGER = [[-.088, .025, .024, 0, 2], [-.09 - length * .5, .024, .023, .012, 2], [-.09 - length * .9, .021, .02, .024, 2], [-.09 - length, .012, .012, .028, 2]]
        body(A, f"finger{lab}{i}", FINGER, "rubber", hand, at=(0, 0, z), segments=8)
    THUMB = [[0, .022, .022, 0, 2], [-.04, .02, .02, 0, 2], [-.068, .017, .017, 0, 2]]
    body(A, f"thumb{lab}", THUMB, "rubber", hand, at=(side * -.012, -.025, .046), rotation=[.6, 0, 0], segments=8)
    plate(A, f"gloveGuard{lab}", PALM, -.085, 0, .01, mirror_arc((-.95, .95), side), "armor", hand, thickness=.01, rings=3, taper=.0, segments=10)
    part(A, f"knuckleLight{lab}", "box", [.008, .012, .066], [side * .026, -.088, 0], "glow", hand)

# Right forearm: Pulse Launcher gauntlet (the shot / blast emitter).
plate(A, "launcherBracer", FOREARM, -.205, -.03, .014, mirror_arc((-1.95, 1.95), 1), "armor", "rightForeArm", thickness=.015, rings=5, taper=.05, segments=20)
body(A, "launcherBarrel", [[0.0, .036, .04, 0, 2.4], [-.06, .044, .048, 0, 2.6], [-.17, .04, .044, 0, 2.6], [-.2, .032, .036, 0, 2.2]],
     "steel", "rightForeArm", at=(.058, -.02, 0), segments=14)
torus(A, "launcherMuzzle", .05, .012, [.058, -.222, 0], "glow", "rightForeArm", major=20, minor=6)
for i in range(3):
    part(A, f"launcherCell{i}", "box", [.012, .03, .03], [.084, -.06 - i * .045, .02], "glow", "rightForeArm")
# Left forearm: lighter bracer with the energy readout.
plate(A, "bracerL", FOREARM, -.2, -.04, .013, mirror_arc((-1.7, 1.7), -1), "ceramic", "leftForeArm", thickness=.013, rings=5, taper=.06, segments=18)
part(A, "wristDisplay", "box", [.012, .07, .034], [-.052, -.12, .012], "glow", "leftForeArm", [0, 0, -.12])

# --- Legs ----------------------------------------------------------------------
for side, lab in [(-1, "L"), (1, "R")]:
    th, sh, ft = (f"{'left' if side < 0 else 'right'}{g}" for g in ("Thigh", "Shin", "Foot"))
    body(A, f"thigh{lab}", THIGH, "suit", th, segments=20)
    plate(A, f"shortsLeg{lab}", THIGH, -.17, .055, .014, (0, 2 * PI), "jersey", th, thickness=.01, rings=5, taper=0, segments=24)
    plate(A, f"shortsStripe{lab}", THIGH, -.165, .05, .022, mirror_arc((-.12, .12), side), "trim", th, thickness=.008, rings=5, taper=0, segments=3)
    plate(A, f"shortsHem{lab}", THIGH, -.185, -.165, .02, (0, 2 * PI), "trim", th, thickness=.008, rings=3, taper=0, segments=24)
    plate(A, f"kneeGuard{lab}", THIGH, -.45, -.36, .018, (FRONT - .9, FRONT + .9), "ceramic", th, thickness=.016, rings=4, taper=.15, segments=14)
    part(A, f"kneeLight{lab}", "octa", [.032, .032, .02], [0, -.405, .078], "glow", th)
    body(A, f"shin{lab}", SHIN, "suit", sh, segments=20)
    plate(A, f"shinGuard{lab}", SHIN, -.33, -.035, .015, (FRONT - 1.2, FRONT + 1.2), "armor", sh, thickness=.014, rings=6, taper=.05, segments=18)
    plate(A, f"shinStripe{lab}", SHIN, -.31, -.06, .031, (FRONT - .05, FRONT + .05), "glow", sh, thickness=.008, rings=5, taper=0, segments=3)
    plate(A, f"sock{lab}", SHIN, -.385, -.33, .01, (0, 2 * PI), "trim", sh, thickness=.008, rings=3, taper=0, segments=20)
    # Velocity Boots: armoured hover-skate with twin levitation rings.
    body(A, f"boot{lab}", BOOT, "armor", ft, segments=20, axis="z")
    part(A, f"toeCap{lab}", "shell", [.11, .062, .12], [0, 0, 0], "ceramic", ft,
         profile=[[.07, .11, .086, -.032, 3.2], [.12, .104, .068, -.04, 3.2], [.16, .09, .052, -.048, 3.0], [.192, .062, .038, -.054, 2.4]],
         arc=[.15, PI - .15], thickness=.012, segments=14, axis="z")
    part(A, f"heelCounter{lab}", "shell", [.11, .1, .06], [0, 0, 0], "ceramic", ft,
         profile=[[-.085, .09, .1, -.02, 2.4], [-.05, .11, .12, -.016, 3.0], [-.02, .112, .114, -.02, 3.0]],
         arc=[PI + .2, 2 * PI - .2], thickness=.012, segments=12, axis="z")
    CUFF = [[-.05, .1, .104, -.005, 2.3], [.035, .092, .096, -.005, 2.3]]
    body(A, f"ankleCuff{lab}", CUFF, "trim", ft, segments=18)
    part(A, f"bootStripe{lab}", "box", [.006, .018, .16], [side * .053, -.03, .035], "glow", ft)
    part(A, f"skateChassis{lab}", "box", [.07, .016, .25], [0, -.079, .05], "steel", ft)
    for k, z in enumerate([-.04, .13]):
        disc(A, f"hoverPad{lab}{k}", .072, .01, (0, -.092, z), "glow", segments=20, group=ft)
        torus(A, f"hoverRing{lab}{k}", .094, .012, [0, -.091, z], "steel", ft, major=22, minor=6)
    part(A, f"skateFin{lab}", "blade", [.01, .04, .11], [side * .05, -.06, -.07], "trim", ft, [.3, 0, 0])

# ---------------------------------------------------------------------------
# SPORT EQUIPMENT
# ---------------------------------------------------------------------------
# Goal Rush energy ball: 0.8 m pearl shell with three light seams.
part("energy_ball", "ballShell", "ico", [.8, .8, .8], [0, 0, 0], "pearl", subdivisions=3)
for name, rot in [("seamEquator", None), ("seamMeridianX", [0, 0, PI / 2]), ("seamMeridianZ", [PI / 2, 0, 0])]:
    torus("energy_ball", name, .836, .036, [0, 0, 0], "cyan", rotation=rot, major=48, minor=6)
for i, (pos, rot) in enumerate([([0, .402, 0], None), ([0, -.402, 0], None), ([.402, 0, 0], [0, 0, PI / 2]),
                                ([-.402, 0, 0], [0, 0, PI / 2]), ([0, 0, .402], [PI / 2, 0, 0]), ([0, 0, -.402], [PI / 2, 0, 0])]):
    part("energy_ball", f"pole{i}", "cylinder", [.12, .02, .12], pos, "magenta", rotation=rot, segments=16)

# Gravity Hoops orb: 0.72 m amber sphere with basketball-style glowing grooves.
part("gravity_orb", "orbShell", "ico", [.72, .72, .72], [0, 0, 0], "amber", subdivisions=3)
torus("gravity_orb", "grooveEquator", .746, .026, [0, 0, 0], "gold", major=48, minor=6)
torus("gravity_orb", "grooveMeridian", .746, .026, [0, 0, 0], "gold", rotation=[PI / 2, 0, 0], major=48, minor=6)
for side, lab in [(-1, "L"), (1, "R")]:
    theta = .86
    path = [[side * .362 * math.cos(theta), .362 * math.sin(theta) * math.cos(t), .362 * math.sin(theta) * math.sin(t)]
            for t in [i * 2 * PI / 40 for i in range(40)]]
    tube("gravity_orb", f"grooveCurve{lab}", path, .013, "gold", segments=6, closed=True)

# Core Capture power core: violet crystal in a steel cage with carry rings.
part("power_core", "coreCrystal", "octa", [.38, .64, .38], [0, 0, 0], "violet")
part("power_core", "coreInner", "octa", [.2, .36, .2], [0, 0, 0], "white")
disc("power_core", "capTop", .34, .07, (0, .36, 0), "steel", segments=24)
disc("power_core", "capBottom", .34, .07, (0, -.36, 0), "steel", segments=24)
for i in range(4):
    a = i * PI / 2 + PI / 4
    path = [[math.cos(a) * (.17 + .13 * math.sin(t * PI)), .34 * (2 * t - 1), math.sin(a) * (.17 + .13 * math.sin(t * PI))]
            for t in [k / 10 for k in range(11)]]
    tube("power_core", f"cageRib{i}", path, .018, "steel", segments=8)
for side, lab in [(-1, "L"), (1, "R")]:
    torus("power_core", f"carryRing{lab}", .2, .03, [side * .32, 0, 0], "ceramic", rotation=[0, 0, PI / 2], major=24, minor=8)
torus("power_core", "coreHalo", .5, .02, [0, 0, 0], "violet", major=36, minor=6)

# Holographic target: concentric rings facing +Z.
for k, (dia, th, mat) in enumerate([(1.8, .12, "magenta"), (1.2, .1, "cyan"), (.62, .08, "lime")]):
    torus("holo_target", f"targetRing{k}", dia, th, [0, 0, 0], mat, rotation=[PI / 2, 0, 0], major=40, minor=8)
part("holo_target", "bullseye", "sphere", [.28, .28, .28], [0, 0, 0], "white", rows=10, segments=16)
for i in range(4):
    a = i * PI / 2 + PI / 4
    part("holo_target", f"targetNode{i}", "octa", [.16, .16, .16], [math.cos(a) * .9, math.sin(a) * .9, 0], "white")
    part("holo_target", f"targetStrut{i}", "box", [.04, .04, .4], [math.cos(a) * .9, math.sin(a) * .9, -.22], "steel")
body("holo_target", "targetEmitter", [[-.42, .05, .05, 0, 2], [-.3, .22, .22, 0, 2], [-.14, .3, .3, 0, 2], [-.08, .2, .2, 0, 2]],
     "steel", axis="z", segments=20)
torus("holo_target", "emitterGlow", .3, .03, [0, 0, -.16], "cyan", rotation=[PI / 2, 0, 0], major=24, minor=6)

# Pickups: three distinct silhouettes on hover rings.
BOLT = [[-.08, .34], [.12, .34], [.02, .06], [.14, .06], [-.1, -.36], [-.02, -.06], [-.14, -.06]]
prism("pickup_energy", "energyBolt", BOLT, .1, (0, 0, 0), "lime", axis="z")
torus("pickup_energy", "energyRing", .9, .05, [0, -.48, 0], "lime", major=36, minor=6)
torus("pickup_energy", "energyOrbit", .7, .025, [0, 0, 0], "white", rotation=[PI / 2, 0, 0], major=32, minor=6)
disc("pickup_energy", "energyBase", .5, .05, (0, -.5, 0), "steel", segments=24)
HEX = [[math.cos(a) * .34, math.sin(a) * .34 + .02] for a in [PI / 2 + i * PI / 3 for i in range(6)]]
SHIELD = [[0, .38], [.3, .24], [.27, -.12], [0, -.38], [-.27, -.12], [-.3, .24]]
prism("pickup_shield", "shieldBadge", SHIELD, .1, (0, 0, 0), "cyan", axis="z")
prism("pickup_shield", "shieldCore", [[x * .5, y * .5] for x, y in HEX], .14, (0, 0, 0), "white", axis="z")
torus("pickup_shield", "shieldRing", .9, .05, [0, -.48, 0], "cyan", major=36, minor=6)
disc("pickup_shield", "shieldBase", .5, .05, (0, -.5, 0), "steel", segments=24)
CHEVRON = [[-.3, .06], [0, .3], [.3, .06], [.3, -.08], [0, .16], [-.3, -.08]]
for k, y in enumerate([.12, -.14]):
    prism("pickup_turbo", f"turboChevron{k}", [[u, v + y] for u, v in CHEVRON], .1, (0, 0, 0), "magenta", axis="z")
torus("pickup_turbo", "turboRing", .9, .05, [0, -.48, 0], "magenta", major=36, minor=6)
disc("pickup_turbo", "turboBase", .5, .05, (0, -.5, 0), "steel", segments=24)

# Launch pad: fires the athlete into a dunk / volley arc toward +Z.
disc("launch_pad", "padBase", 2.6, .16, (0, .08, 0), "steel", segments=40)
torus("launch_pad", "padRing", 2.4, .1, [0, .17, 0], "accent", major=48, minor=8)
disc("launch_pad", "padCore", 1.6, .04, (0, .17, 0), "lime", bevel=.02, segments=36)
for k, r in enumerate([.55, .38]):
    torus("launch_pad", f"padCoil{k}", r * 2, .03, [0, .22 + k * .06, 0], "white", major=32, minor=6)
for k in range(3):
    prism("launch_pad", f"padArrow{k}", [[-.32, -.12], [0, .16], [.32, -.12], [.2, -.12], [0, .05], [-.2, -.12]], .04,
          (0, .2, -.5 + k * .42), "gold", axis="y")

# Infinity Cup trophy (championships + hangar).
body("trophy", "trophyPlinth", [[0, .36, .36, 0, 4], [.06, .36, .36, 0, 4], [.08, .32, .32, 0, 4], [.16, .3, .3, 0, 4], [.18, .26, .26, 0, 4]],
     "armor", segments=24)
plate("trophy", "plinthBand", [[0, .37, .37, 0, 4], [.2, .37, .37, 0, 4]], .1, .14, .006, (0, 2 * PI), "cyan", thickness=.01, rings=3, taper=0, segments=24)
body("trophy", "trophyStem", [[.18, .16, .16, 0, 2], [.24, .08, .08, 0, 2], [.36, .06, .06, 0, 2], [.42, .1, .1, 0, 2], [.46, .14, .14, 0, 2]],
     "gold", segments=24)
body("trophy", "trophyCup", [[.46, .1, .1, 0, 2], [.5, .26, .26, 0, 2], [.58, .36, .36, 0, 2], [.7, .4, .4, 0, 2], [.76, .38, .38, 0, 2], [.775, .3, .3, 0, 2]],
     "gold", segments=32)
for side, lab in [(-1, "L"), (1, "R")]:
    path = [[side * (.19 + .1 * math.sin(t * PI)), .5 + .22 * t, 0] for t in [k / 8 for k in range(9)]]
    tube("trophy", f"trophyHandle{lab}", path, .018, "gold", segments=8)
torus("trophy", "infinityHalo", .62, .03, [0, .92, 0], "cyan", rotation=[.35, 0, .2], major=40, minor=6)
part("trophy", "trophyStar", "octa", [.14, .24, .14], [0, .92, 0], "white")

# ---------------------------------------------------------------------------
# SCORING STRUCTURES
# ---------------------------------------------------------------------------
GOAL_HALF, GOAL_H, GOAL_D = 4.4, 3.6, 2.4
# Goal Rush goal: mouth on the goal line (z = 0) opening toward +Z, net behind.
frame = [[-GOAL_HALF, 0, 0], [-GOAL_HALF, GOAL_H - .12, 0], [-GOAL_HALF + .04, GOAL_H - .03, 0], [-GOAL_HALF + .12, GOAL_H, 0],
         [GOAL_HALF - .12, GOAL_H, 0], [GOAL_HALF - .04, GOAL_H - .03, 0], [GOAL_HALF, GOAL_H - .12, 0], [GOAL_HALF, 0, 0]]
tube("goal_frame", "goalFrame", frame, .13, "ceramic", segments=14)
for side, lab in [(-1, "L"), (1, "R")]:
    x = side * GOAL_HALF
    tube("goal_frame", f"sideFrame{lab}", [[x, GOAL_H, 0], [x, GOAL_H - .8, -1.8], [x, 0, -GOAL_D]], .055, "steel", segments=8)
    prism("goal_frame", f"netSide{lab}", [[0, 0], [0, GOAL_H], [-1.8, GOAL_H - .8], [-GOAL_D, 0]], .03, (x, 0, 0), "net", axis="x")
    part("goal_frame", f"postLight{lab}", "box", [.05, GOAL_H - .3, .05], [x - side * .02, (GOAL_H - .3) / 2 + .1, .14], "accent")
    disc("goal_frame", f"postSocket{lab}", .36, .1, (x, .05, 0), "steel", segments=20)
tube("goal_frame", "backBarTop", [[-GOAL_HALF, GOAL_H - .8, -1.8], [GOAL_HALF, GOAL_H - .8, -1.8]], .055, "steel", segments=8)
tube("goal_frame", "backBarFloor", [[-GOAL_HALF, .05, -GOAL_D], [GOAL_HALF, .05, -GOAL_D]], .07, "steel", segments=8)
top_len = math.hypot(1.8, .8)
part("goal_frame", "netTop", "box", [GOAL_HALF * 2, .03, top_len], [0, GOAL_H - .4, -.9], "net", rotation=[-math.atan2(.8, 1.8), 0, 0], bevel=.01)
back_len = math.hypot(.6, GOAL_H - .8)
part("goal_frame", "netBack", "box", [GOAL_HALF * 2, back_len, .03], [0, (GOAL_H - .8) / 2, -2.1], "net", rotation=[-math.atan2(.6, GOAL_H - .8), 0, 0], bevel=.01)
part("goal_frame", "crossbarLight", "box", [GOAL_HALF * 2 - .4, .05, .05], [0, GOAL_H - .17, .14], "accent")
part("goal_frame", "goalLine", "box", [GOAL_HALF * 2, .02, .12], [0, .012, 0], "accent", bevel=.05)
part("goal_frame", "goalMouthGlow", "box", [GOAL_HALF * 2 - .3, .015, 1.8], [0, .009, -1.1], "glass", bevel=.02)

# Goalkeeper drone: hovers on the goal line, sweeping paddles block shots.
K = "keeper_drone"
body(K, "keeperHull", [[-.3, .5, .34, 0, 2.2], [-.18, .92, .52, 0, 2.6], [.05, 1.04, .58, 0, 2.8], [.22, .86, .5, 0, 2.6], [.32, .42, .26, 0, 2.2]],
     "armor", segments=30)
plate(K, "keeperFace", [[-.18, .92, .52, 0, 2.6], [.05, 1.04, .58, 0, 2.8], [.22, .86, .5, 0, 2.6]], -.12, .18, .012, (FRONT - 1.0, FRONT + 1.0),
      "ceramic", thickness=.03, rings=4, taper=.06, segments=20)
part(K, "keeperEye", "sphere", [.3, .16, .1], [0, .03, .31], "glow")
part(K, "keeperPupil", "sphere", [.1, .1, .05], [0, .03, .355], "white")
for side, lab in [(-1, "L"), (1, "R")]:
    part(K, f"paddle{lab}", "panel", [.95, .78, .07], [side * .98, 0, .04], "ceramic", rotation=[0, side * -.12, 0],
         outline=[[-.5, -.42], [.5, -.5], [.5, .5], [-.5, .36]] if side > 0 else [[-.5, -.5], [.5, -.42], [.5, .36], [-.5, .5]])
    part(K, f"paddleEdge{lab}", "box", [.05, .8, .05], [side * 1.46, 0, .06], "glow")
    part(K, f"paddleStrip{lab}", "box", [.7, .04, .04], [side * .98, .2, .09], "glow", rotation=[0, side * -.12, 0])
    part(K, f"arm{lab}", "box", [.36, .14, .14], [side * .48, 0, 0], "steel")
    part(K, f"thruster{lab}", "cylinder", [.18, .2, .18], [side * .28, -.36, 0], "steel", segments=16)
    disc(K, f"thrusterGlow{lab}", .14, .03, (side * .28, -.47, 0), "glow", segments=16)
    part(K, f"antenna{lab}", "blade", [.02, .05, .3], [side * .2, .36, -.06], "trim", rotation=[-.9, 0, side * .3])
torus(K, "keeperRing", 1.12, .03, [0, -.05, 0], "glow", major=40, minor=6)

# Gravity Hoops rig: vertical ring facing +Z, centre 4.6 m up.
H = "hoop_rig"
HOOP_Y, HOOP_DIA, HOOP_TUBE = 4.6, 5.0, .28
torus(H, "hoopRing", HOOP_DIA, HOOP_TUBE, [0, HOOP_Y, 0], "accent", rotation=[PI / 2, 0, 0], major=64, minor=12)
torus(H, "hoopInner", 4.3, .05, [0, HOOP_Y, 0], "white", rotation=[PI / 2, 0, 0], major=64, minor=6)
part(H, "gravityLens", "cylinder", [4.25, .02, 4.25], [0, HOOP_Y, -.02], "glass", rotation=[PI / 2, 0, 0], segments=48)
for i in range(12):
    a = i * PI / 6
    part(H, f"rimLight{i}", "octa", [.16, .16, .12], [math.cos(a) * 2.5, HOOP_Y + math.sin(a) * 2.5, .14], "white")
disc(H, "hoopBase", 1.8, .24, (0, .12, -1.2), "steel", segments=32)
torus(H, "baseGlow", 1.9, .06, [0, .25, -1.2], "accent", major=40, minor=6)
body(H, "hoopMast", [[.2, .44, .44, 0, 2], [.5, .36, .36, 0, 2], [1.6, .28, .28, 0, 2], [1.95, .34, .34, 0, 2]], "armor", at=(0, 0, -1.2), segments=20)
for side, lab in [(-1, "L"), (1, "R")]:
    ax, ay = side * 2.36 * math.cos(PI / 3), HOOP_Y - 2.36 * math.sin(PI / 3)
    tube(H, f"hoopFork{lab}", [[0, 1.95, -1.2], [side * .5, 2.1, -.85], [ax * .8, ay - .05, -.3], [ax, ay, 0]], .1, "steel", segments=10)
BOARD = [[math.cos(a) * 3.6, HOOP_Y + math.sin(a) * 3.1] for a in [PI / 6 + i * PI / 3 for i in range(6)]]
prism(H, "backboard", BOARD, .06, (0, 0, -1.45), "glass", axis="z")
tube(H, "backboardFrame", [[x, y, -1.45] for x, y in BOARD], .06, "accent", segments=8, closed=True)
part(H, "backboardTarget", "box", [2.0, 1.5, .02], [0, HOOP_Y, -1.41], "white", bevel=.02)
part(H, "backboardTargetInner", "box", [1.8, 1.3, .025], [0, HOOP_Y, -1.405], "armor", bevel=.02)

# Capture zone: 4.5 m radius floor ring, six pylons and a holographic dome.
Z = "capture_zone"
disc(Z, "zoneDeck", 9.2, .06, (0, .03, 0), "steel", segments=64)
for k, (dia, th) in enumerate([(9.0, .16), (6.8, .07), (4.4, .07), (2.0, .1)]):
    torus(Z, f"zoneRing{k}", dia, th, [0, .07, 0], "accent", major=72 if k == 0 else 56, minor=8)
for i in range(6):
    a = i * PI / 3
    x, z = math.cos(a) * 4.7, math.sin(a) * 4.7
    body(Z, f"pylon{i}", [[0, .4, .4, 0, 2], [.15, .34, .34, 0, 2], [1.4, .22, .22, 0, 2], [1.6, .28, .28, 0, 2]], "armor", at=(x, 0, z), segments=16)
    part(Z, f"beacon{i}", "octa", [.3, .46, .3], [x, 1.92, z], "accent")
    path = [[math.cos(a) * 4.7 * math.cos(t), 1.6 + 2.0 * math.sin(t), math.sin(a) * 4.7 * math.cos(t)] for t in [k * PI / 2 / 10 for k in range(11)]]
    tube(Z, f"domeRib{i}", path, .03, "accent", segments=6)
disc(Z, "receptor", 1.0, .3, (0, .15, 0), "steel", segments=32)
torus(Z, "receptorGlow", 1.0, .06, [0, .31, 0], "white", major=36, minor=6)

# ---------------------------------------------------------------------------
# VENUE MODULES
# ---------------------------------------------------------------------------
PITCH_HALF_W, PITCH_HALF_L = 16.0, 24.0
P = "pitch"
part(P, "deckSurface", "box", [PITCH_HALF_W * 2 + 1.0, .12, PITCH_HALF_L * 2 + 1.0], [0, -.06, 0], "floor", bevel=.01, uvMode="world", uvScale=3.6)
for x in (-PITCH_HALF_W + .25, PITCH_HALF_W - .25):
    part(P, f"touchline{'L' if x < 0 else 'R'}", "box", [.12, .02, PITCH_HALF_L * 2 - .4], [x, .012, 0], "accent", bevel=.05)
for z in (-PITCH_HALF_L + .25, PITCH_HALF_L - .25):
    part(P, f"endline{'S' if z < 0 else 'N'}", "box", [PITCH_HALF_W * 2 - .5, .02, .12], [0, .012, z], "accent", bevel=.05)
part(P, "halfwayLine", "box", [PITCH_HALF_W * 2 - .5, .02, .12], [0, .012, 0], "accent", bevel=.05)
torus(P, "centreCircle", 9.0, .12, [0, .01, 0], "accent", major=72, minor=4, ratio=1.0)
part(P, "centreSpot", "cylinder", [.5, .02, .5], [0, .012, 0], "accent", segments=24)
for z, lab in [(-PITCH_HALF_L + .25, "S"), (PITCH_HALF_L - .25, "N")]:
    s = 1 if z > 0 else -1
    a0, a1 = (PI, 2 * PI) if s > 0 else (0, PI)
    torus(P, f"zoneArc{lab}", 14.0, .12, [0, .01, z], "accent", a0=a0, a1=a1, major=48, minor=4)
    for x in (-1, 1):
        centre = math.atan2(-s, -x)
        torus(P, f"cornerArc{lab}{'L' if x < 0 else 'R'}", 2.4, .1, [x * (PITCH_HALF_W - .25), .01, z], "accent",
              a0=centre - PI / 4, a1=centre + PI / 4, major=12, minor=4)
for k, z in enumerate([-12, 12]):
    part(P, f"launchMark{k}", "box", [.6, .02, .6], [0, .012, z], "accent", rotation=[0, PI / 4, 0], bevel=.05)

# Dasher board: 4 m module, faces +Z (toward the pitch).
B = "board_section"
part(B, "boardWall", "box", [4.0, 1.1, .26], [0, .55, 0], "armor")
part(B, "boardCap", "box", [4.0, .08, .34], [0, 1.12, 0], "steel")
part(B, "boardLed", "box", [3.8, .32, .03], [0, .62, .14], "accent", bevel=.05)
part(B, "boardKick", "box", [4.0, .14, .3], [0, .07, .02], "rubber")
part(B, "boardGlass", "box", [3.96, 1.5, .04], [0, 1.92, -.02], "glass", bevel=.02)
part(B, "boardPost", "box", [.1, 2.7, .14], [-1.95, 1.35, -.06], "steel")

# Stand section: 12 m wide, eight tiers rising away from the pitch (toward -Z).
S = "stand_section"
TIERS, TREAD, RISE, FRONT_H = 8, .9, .52, 1.4
profile = [[0.0, 0.0], [0.0, FRONT_H]]
for k in range(TIERS):
    z0 = -.4 - TREAD * k
    y = FRONT_H + .12 + RISE * k
    profile += [[z0, y], [z0 - TREAD, y]]
back_z = -.4 - TREAD * TIERS
profile += [[back_z, FRONT_H + .12 + RISE * TIERS + 1.4], [back_z - .5, FRONT_H + .12 + RISE * TIERS + 1.4], [back_z - .5, 0.0]]
fixed = [profile[0], profile[1], [-.4, FRONT_H], [-.4, FRONT_H + .12]] + profile[3:]
prism(S, "tiers", fixed, 12.0, (0, 0, 0), "concrete", axis="x")
part(S, "frontLed", "box", [11.9, .36, .05], [0, .95, .02], "accent", bevel=.05)
part(S, "frontGlass", "box", [11.9, .95, .04], [0, FRONT_H + .5, -.1], "glass", bevel=.02)
tube(S, "frontRail", [[-5.95, FRONT_H + 1.0, -.1], [5.95, FRONT_H + 1.0, -.1]], .035, "steel", segments=8)
seat_rows = []
for k in range(TIERS):
    z0 = -.4 - TREAD * k
    y = FRONT_H + .12 + RISE * k
    for side, lab in [(-1, "L"), (1, "R")]:
        seat = [[0, 0], [0, .4], [-.42, .44], [-.47, .86], [-.55, .86], [-.53, 0]]
        prism(S, f"seats{k}{lab}", [[z0 - .18 + u, y + v] for u, v in seat], 5.4, (side * 3.05, 0, 0), "seat", axis="x")
    seat_rows.append([round(y + .42, 3), round(z0 - .38, 3)])
    part(S, f"aisleStep{k}", "box", [.7, .24, .42], [0, FRONT_H + .12 + RISE * k + .12, -.4 - TREAD * k - .22], "concrete")
tube(S, "aisleRailL", [[-.42, FRONT_H + 1.0, -.4], [-.42, FRONT_H + .12 + RISE * TIERS + .9, back_z]], .035, "steel", segments=6)
tube(S, "aisleRailR", [[.42, FRONT_H + 1.0, -.4], [.42, FRONT_H + .12 + RISE * TIERS + .9, back_z]], .035, "steel", segments=6)
part(S, "crownLight", "box", [12.0, .2, .14], [0, FRONT_H + .12 + RISE * TIERS + 1.42, back_z - .25], "accent", bevel=.05)
for x in (-5.8, 5.8):
    part(S, f"vomitory{'L' if x < 0 else 'R'}", "box", [.2, FRONT_H + .12 + RISE * TIERS + 1.4, .5], [x, (FRONT_H + .12 + RISE * TIERS + 1.4) / 2, back_z - .25], "armor")

# Spectator (instanced over every seat row at runtime, coloured per instance).
F = "spectator"
part(F, "fanLegs", "cuboid", [.3, .2, .4], [0, .1, .12], "crowd")
part(F, "fanTorso", "cuboid", [.36, .5, .24], [0, .45, 0], "crowd", taper=.85)
part(F, "fanHead", "ico", [.22, .25, .22], [0, .84, .01], "crowd", subdivisions=0)
for side in (-1, 1):
    part(F, f"fanArm{'L' if side < 0 else 'R'}", "cuboid", [.09, .5, .09], [side * .23, .82, .02], "crowd", rotation=[0, 0, side * -.35])

# Floodlight tower: 24 m mast with an angled lamp bank (faces +Z).
L = "floodlight"
body(L, "mast", [[0, 1.1, 1.1, 0, 2], [.6, .8, .8, 0, 2], [20, .5, .5, 0, 2], [22.5, .6, .6, 0, 2]], "steel", segments=12)
for k in range(6):
    y0 = 2 + k * 3.3
    tube(L, f"brace{k}", [[-.6, y0, 0], [.6, y0 + 1.6, 0], [-.6, y0 + 3.2, 0]], .05, "steel", segments=6)
disc(L, "mastFoot", 2.2, .4, (0, .2, 0), "concrete", segments=20)
part(L, "platform", "box", [5.2, .16, 1.6], [0, 22.0, .4], "steel")
part(L, "lampFrame", "box", [6.0, 3.2, .4], [0, 24.0, .7], "armor", rotation=[.55, 0, 0])
TILT = .55
for row in range(3):
    for col in range(4):
        x = -2.1 + col * 1.4; v = (1 - row) * 1.0
        part(L, f"lamp{row}{col}", "box", [1.1, .7, .12],
             [x, 24.0 + v * math.cos(TILT) - .26 * math.sin(TILT), .7 + v * math.sin(TILT) + .26 * math.cos(TILT)], "white", rotation=[TILT, 0, 0])
part(L, "beaconTop", "octa", [.4, .6, .4], [0, 26.0, .2], "accent")

# Jumbotron: four-sided screen cluster hung above the centre circle.
J = "jumbotron"
part(J, "jumboCore", "box", [6.6, 3.8, 6.6], [0, 0, 0], "armor")
for name, pos, rot in [("screenFront", [0, 0, 3.32], None), ("screenBack", [0, 0, -3.32], [0, PI, 0]),
                       ("screenRight", [3.32, 0, 0], [0, PI / 2, 0]), ("screenLeft", [-3.32, 0, 0], [0, -PI / 2, 0])]:
    part(J, name, "box", [6.2, 3.4, .06], pos, "screen", rotation=rot, bevel=.02)
body(J, "jumboCrown", [[1.9, 6.0, 6.0, 0, 6], [2.1, 6.9, 6.9, 0, 6], [2.5, 5.0, 5.0, 0, 5], [2.9, 2.0, 2.0, 0, 3]], "steel", segments=32)
body(J, "jumboBelly", [[-2.9, 1.6, 1.6, 0, 3], [-2.5, 4.6, 4.6, 0, 5], [-2.1, 6.9, 6.9, 0, 6], [-1.9, 6.0, 6.0, 0, 6]], "steel", segments=32)
part(J, "ledRingTop", "box", [7.0, .14, 7.0], [0, 2.02, 0], "accent", bevel=.02)
part(J, "ledRingBottom", "box", [7.0, .14, 7.0], [0, -2.02, 0], "accent", bevel=.02)
part(J, "bellyLight", "sphere", [1.4, .5, 1.4], [0, -2.9, 0], "white", rows=8, segments=20)
for i in range(4):
    a = i * PI / 2 + PI / 4
    tube(J, f"cable{i}", [[math.cos(a) * 1.0, 2.9, math.sin(a) * 1.0], [math.cos(a) * 2.6, 14.0, math.sin(a) * 2.6]], .05, "steel", segments=6)

# Skyline tower for the city venues (outside the stadium bowl).
T = "sky_tower"
part(T, "towerMass", "box", [10, 34, 10], [0, 17, 0], "tower")
part(T, "towerCrown", "box", [10.6, .8, 10.6], [0, 34.2, 0], "steel")
for level in range(8):
    for col in range(4):
        part(T, f"window{level}{col}", "box", [1.6, .7, .1], [-3.6 + col * 2.4, 4 + level * 3.8, 5.05], "window")
part(T, "towerSpire", "box", [.3, 5, .3], [2.4, 37, 0], "accent")
part(T, "towerBand", "box", [10.2, .3, 10.2], [0, 26, 0], "accent")


# ---------------------------------------------------------------------------
# STADIUM LAYOUT (shared by the game, the plan plates and the tests)
# ---------------------------------------------------------------------------
ALL = [0, 1, 2, 3, 4, 5]
layout = []


def place(asset, at, yaw=0.0, arenas=None, modes=None):
    entry = {"asset": asset, "position": [round(v, 4) for v in at], "yaw": round(yaw, 5), "arenas": arenas or ALL}
    if modes:
        entry["modes"] = modes
    layout.append(entry)


place("pitch", (0, 0, 0))
for z in [-22 + 4 * i for i in range(12)]:
    place("board_section", (-PITCH_HALF_W - .3, 0, z), PI / 2)
    place("board_section", (PITCH_HALF_W + .3, 0, z), -PI / 2)
for x in [6.4, 10.4, 14.4]:
    for sx in (-1, 1):
        place("board_section", (sx * x, 0, -PITCH_HALF_L - .3), 0)
        place("board_section", (sx * x, 0, PITCH_HALF_L + .3), PI)
for x in [-2.2, 2.2]:
    place("board_section", (x, 0, -PITCH_HALF_L - .3), 0, modes=["hoops", "capture", "targets"])
    place("board_section", (x, 0, PITCH_HALF_L + .3), PI, modes=["hoops", "capture", "targets"])
SIDE_X = PITCH_HALF_W + 3.0
END_Z = PITCH_HALF_L + 3.2
for z in [-18, -6, 6, 18]:
    place("stand_section", (-SIDE_X, 0, z), PI / 2, arenas=[1, 2, 3, 4, 5])
    place("stand_section", (SIDE_X, 0, z), -PI / 2)
for x in [-12, 0, 12]:
    place("stand_section", (x, 0, -END_Z), 0, arenas=[1, 3, 4, 5])
    place("stand_section", (x, 0, END_Z), PI, arenas=[1, 3, 4, 5])
UPPER = 8.6
for z in [-18, -6, 6, 18]:
    place("stand_section", (-SIDE_X - UPPER, 6.4, z), PI / 2, arenas=[4, 5])
    place("stand_section", (SIDE_X + UPPER, 6.4, z), -PI / 2, arenas=[4, 5])
for x in [-12, 0, 12]:
    place("stand_section", (x, 6.4, -END_Z - UPPER), 0, arenas=[5])
    place("stand_section", (x, 6.4, END_Z + UPPER), PI, arenas=[5])
for sx in (-1, 1):
    for sz in (-1, 1):
        place("floodlight", (sx * 25.5, 0, sz * 32.5), math.atan2(-sx, -sz))
place("jumbotron", (0, 15.5, 0), 0, arenas=[1, 2, 3, 4, 5])
for i in range(10):
    a = i * 2 * PI / 10 + .2
    place("sky_tower", (math.cos(a) * 95, -6, math.sin(a) * 110), -a, arenas=[1, 3])

# Sport configurations: where each mode's structures stand on the pitch.
# "home" pieces belong to the player's team and take its kit colours.
HOOP_Z, CAPTURE_Z = 18.0, 18.5
modes = {
    "goal": [{"asset": "goal_frame", "position": [0, 0, PITCH_HALF_L], "yaw": PI, "side": "rival"},
             {"asset": "goal_frame", "position": [0, 0, -PITCH_HALF_L], "yaw": 0, "side": "home"},
             {"asset": "keeper_drone", "position": [0, 1.3, PITCH_HALF_L - .9], "yaw": PI, "side": "rival"},
             {"asset": "keeper_drone", "position": [0, 1.3, -PITCH_HALF_L + .9], "yaw": 0, "side": "home"}],
    "hoops": [{"asset": "hoop_rig", "position": [0, 0, HOOP_Z], "yaw": PI, "side": "rival"},
              {"asset": "hoop_rig", "position": [0, 0, -HOOP_Z], "yaw": 0, "side": "home"},
              {"asset": "launch_pad", "position": [-6.5, 0, 9.5], "yaw": 0, "side": "rival"},
              {"asset": "launch_pad", "position": [6.5, 0, 9.5], "yaw": 0, "side": "rival"}],
    "capture": [{"asset": "capture_zone", "position": [0, 0, CAPTURE_Z], "yaw": PI, "side": "rival"},
                {"asset": "capture_zone", "position": [0, 0, -CAPTURE_Z], "yaw": 0, "side": "home"}],
    "targets": [{"asset": "holo_target", "position": [x, y, z], "yaw": PI, "side": "rival"}
                for x, y, z in [(-10, 2.2, 6), (-3.5, 3.4, 12), (3.5, 1.8, 9), (10, 2.8, 15), (-7, 4.2, 19), (7, 2.4, 3)]],
    "pickups": [{"asset": f"pickup_{kind}", "position": [x, .9, z], "yaw": 0}
                for (x, z), kind in zip([(-12, -14), (12, -14), (-12, 0), (12, 0), (-12, 14), (12, 14)],
                                        ["energy", "shield", "turbo", "energy", "shield", "turbo"])],
}

spec = {
    "version": VERSION, "units": "metres", "forward": "+Z",
    "winding": "babylon-left-handed",
    "palette": palette, "groups": groups, "assets": assets, "layout": layout, "modes": modes,
    "arena": {
        "pitchHalfWidth": PITCH_HALF_W, "pitchHalfLength": PITCH_HALF_L,
        "goalHalfWidth": GOAL_HALF, "goalHeight": GOAL_H, "goalDepth": GOAL_D,
        "hoopCentreY": HOOP_Y, "hoopZ": HOOP_Z, "hoopScoreRadius": 2.1, "hoopRimRadius": 2.36, "hoopTube": HOOP_TUBE / 2,
        "captureRadius": 4.5, "captureZ": CAPTURE_Z, "ballRadius": .4, "orbRadius": .36, "coreRadius": .36,
        "launchPads": [[-6.5, 9.5], [6.5, 9.5]],
        "seatRows": seat_rows, "seatSpacing": .62, "standWidth": 12.0,
    },
    "dimensions": {"athleteHeight": 1.89, "athleteShoulderWidth": 0.6, "goalWidth": GOAL_HALF * 2,
                   "goalHeight": GOAL_H, "hoopDiameter": HOOP_DIA, "pitchWidth": PITCH_HALF_W * 2,
                   "pitchLength": PITCH_HALF_L * 2},
}

if __name__ == "__main__":
    for asset_parts in assets.values():
        for item in asset_parts:
            item["mesh"] = build_mesh(item, palette)
    make_textures()
    (ROOT / "app" / "blueprint-spec.json").write_text(json.dumps(spec, separators=(",", ":")) + "\n")
    tris = {k: sum(len(p["mesh"]["indices"]) // 3 for p in v) for k, v in assets.items()}
    print(f"Wrote blueprint-spec.json: {sum(len(v) for v in assets.values())} parts, {sum(tris.values())} triangles")
    for k, v in assets.items():
        print(f"  {k:15s} {len(v):4d} parts {tris[k]:7d} tris")
