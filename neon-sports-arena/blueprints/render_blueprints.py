"""Render the NS-02 blueprint plates from the geometry Babylon actually builds.

Input is blueprints/runtime-extracted.json (rest pose, read back from the game's
BlueprintBuilder and skinned athlete rig) and runtime-poses.json (the same rig
after each pose function). Views are orthographic in Babylon's left-handed
frame: +Y up, the subject faces +Z, its right hand is +X.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SPEC = json.loads((ROOT / "app/blueprint-spec.json").read_text())
EXTRACTED = json.loads((ROOT / "blueprints/runtime-extracted.json").read_text())
POSES = json.loads((ROOT / "blueprints/runtime-poses.json").read_text())
assert EXTRACTED["version"] == SPEC["version"] == POSES["version"]
VERSION = SPEC["version"]
PAL = SPEC["palette"]
MATS = list(PAL)
SS = 2
OUT = ROOT / "blueprints" / "renders"
OUT.mkdir(exist_ok=True)
TEXTURES = {key: np.array(Image.open(ROOT / "public" / v["texture"].lstrip("/")).convert("RGB"), dtype=np.float32) / 255
            for key, v in PAL.items() if v.get("texture")}
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
BG = (6, 8, 25)
PANEL = (11, 15, 40)
GRID = (21, 28, 64)
EDGE = (48, 58, 120)
CYAN = (73, 244, 255)
LIME = (217, 255, 79)
PINK = (255, 85, 173)
MUTED = (134, 146, 190)
INK = (236, 240, 255)
TEAMS = [("CYAN COMETS", "#49f4ff", "#1268ff"), ("MAGENTA METEORS", "#ff55ad", "#8f25ff"),
         ("LIME LEGENDS", "#d9ff4f", "#27c969"), ("SOLAR STRIKERS", "#ffb13d", "#ff514e"),
         ("VIOLET VORTEX", "#9b7cff", "#5a39ff"), ("GOLDEN GRAVITY", "#ffe45c", "#ff7c32")]
ARENAS = [("PRISM TRAINING DECK", "#49f4ff"), ("SOLAR CITY STADIUM", "#ff55ad"), ("AURORA SKYCOURT", "#d9ff4f"),
          ("QUANTUM HARBOR", "#9b7cff"), ("TITAN PULSE DOME", "#ff8b3d"), ("INFINITY CHAMPIONSHIP", "#ffe45c")]
DEFAULT_TINTS = {"kitPrimary": "#1268ff", "kitTrim": "#49f4ff", "arena": "#49f4ff"}
PLATES = 11


def rgb(hex_):
    return np.array(list(bytes.fromhex(hex_[1:])), dtype=np.float32) / 255


def font(size, bold=False, mono=False):
    return ImageFont.truetype(MONO if mono else BOLD if bold else FONT, size)


# ---------------------------------------------------------------------------
# Geometry gathering
# ---------------------------------------------------------------------------
class Faces:
    """Flat triangle soup: positions, normals, colours, uvs, material ids."""

    def __init__(self):
        self.p = []; self.n = []; self.c = []; self.uv = []; self.m = []

    def add(self, positions, normals, colors, uvs, indices, material, tint=None):
        tri = np.asarray(indices, int).reshape(-1, 3)
        P = np.asarray(positions, np.float32).reshape(-1, 3)
        N = np.asarray(normals, np.float32).reshape(-1, 3)
        Cl = np.asarray(colors, np.float32).reshape(-1, 4)[:, :3]
        if tint is not None:
            Cl = Cl * tint
        U = np.asarray(uvs, np.float32).reshape(-1, 2)
        self.p.append(P[tri]); self.n.append(N[tri]); self.c.append(Cl[tri]); self.uv.append(U[tri])
        self.m.append(np.full(len(tri), MATS.index(material), np.int16))

    def extend(self, other):
        for a in ("p", "n", "c", "uv", "m"):
            getattr(self, a).extend(getattr(other, a))

    def arrays(self):
        if not self.p:
            raise ValueError("empty scene")
        return (np.concatenate(self.p), np.concatenate(self.n), np.concatenate(self.c),
                np.concatenate(self.uv), np.concatenate(self.m))


def tint_for(material, tints):
    t = PAL[material].get("tint")
    if not t:
        return None
    return rgb(tints.get(t, PAL[material]["color"])) * PAL[material].get("tintScale", 1.0)


def yaw_matrix(yaw):
    c, s = math.cos(yaw), math.sin(yaw)
    # Babylon RotationY in row-vector form: x' = x c + z s, z' = -x s + z c.
    return np.array([[c, 0, -s], [0, 1, 0], [s, 0, c]], np.float32)


def asset_faces(asset, pose=None, selected=None, tints=None, at=(0, 0, 0), yaw=0.0, scale=1.0):
    tints = {**DEFAULT_TINTS, **(tints or {})}
    posed = {p["name"]: p for p in POSES["poses"][pose]} if pose else {}
    R = yaw_matrix(yaw); T = np.array(at, np.float32)
    faces = Faces()
    for part in EXTRACTED["assets"][asset]:
        if selected is not None and part["name"] not in selected:
            continue
        src = posed.get(part["name"], part)
        P = np.asarray(src["positions"], np.float32).reshape(-1, 3) * scale @ R + T
        N = np.asarray(src["normals"], np.float32).reshape(-1, 3) @ R
        faces.add(P, N, part["colors"], part["uvs"], part["indices"], part["material"], tint_for(part["material"], tints))
    return faces


def crowd_colors(count, seed):
    rng = np.random.default_rng(seed)
    shirts = [rgb(h) for h in ("#49f4ff", "#ff55ad", "#d9ff4f", "#ffe45c", "#9b7cff", "#ff8b3d", "#f4f8ff", "#2b3452")]
    return [shirts[i] * (.75 + .25 * rng.random()) for i in rng.integers(0, len(shirts), count)]


def venue_faces(arena=5, mode="goal", crowd=1.0, kit=None, accent=None, extras=True, cut=None, skip=()):
    """Every module the game places for this arena + sport, from spec.layout."""
    accent = accent or ARENAS[arena][1]
    kit = kit or {"kitPrimary": TEAMS[0][2], "kitTrim": TEAMS[0][1]}
    rival = {"kitPrimary": TEAMS[1][2], "kitTrim": TEAMS[1][1]}
    faces = Faces()
    seat_rows = SPEC["arena"]["seatRows"]; spacing = SPEC["arena"]["seatSpacing"]
    spectator = asset_faces("spectator")
    sp, sn, sc, suv, sm = spectator.arrays()
    rng = np.random.default_rng(arena * 31 + 7)
    fans_p = []; fans_n = []; fans_c = []
    for entry in SPEC["layout"]:
        if arena not in entry["arenas"]:
            continue
        if entry.get("modes") and mode not in entry["modes"]:
            continue
        if entry["asset"] == "sky_tower" and not extras or entry["asset"] in skip:
            continue
        if cut and not cut(entry["position"]):
            continue
        faces.extend(asset_faces(entry["asset"], tints={"arena": accent}, at=entry["position"], yaw=entry["yaw"]))
        if entry["asset"] == "stand_section" and crowd > 0:
            R = yaw_matrix(entry["yaw"]); T = np.array(entry["position"], np.float32)
            for y, z in seat_rows:
                for side in (-1, 1):
                    for k in range(8):
                        if rng.random() > crowd:
                            continue
                        x = side * (.75 + k * spacing + .2)
                        offset = np.array([x, y - .42, z + .12], np.float32)
                        fans_p.append((sp + offset) @ R + T); fans_n.append(sn @ R)
                        fans_c.append(np.broadcast_to(crowd_colors(1, int(rng.integers(1 << 30)))[0], sc.shape))
    for item in SPEC["modes"].get(mode, []) + (SPEC["modes"]["pickups"] if mode != "none" else []):
        side_kit = kit if item.get("side") == "home" else rival
        tints = {"arena": accent if item.get("side") != "home" else kit["kitTrim"], **side_kit}
        faces.extend(asset_faces(item["asset"], tints=tints, at=item["position"], yaw=item["yaw"]))
    if fans_p:
        faces.p.append(np.concatenate(fans_p)); faces.n.append(np.concatenate(fans_n))
        faces.c.append(np.concatenate(fans_c).astype(np.float32))
        faces.uv.append(np.zeros((sum(len(f) for f in fans_p), 3, 2), np.float32))
        faces.m.append(np.full(sum(len(f) for f in fans_p), MATS.index("crowd"), np.int16))
    return faces


# ---------------------------------------------------------------------------
# Software rasteriser
# ---------------------------------------------------------------------------
VIEWS = {
    "FRONT": ([0, 0, 1], [0, 1, 0]), "REAR": ([0, 0, -1], [0, 1, 0]),
    "LEFT": ([-1, 0, 0], [0, 1, 0]), "RIGHT": ([1, 0, 0], [0, 1, 0]),
    "TOP": ([0, 1, 0], [0, 0, 1]), "UNDERSIDE": ([0, -1, 0], [0, 0, 1]),
    "ISO": ([3, 2.4, 4], [0, 1, 0]), "ISO REAR": ([-3, 2.2, -4], [0, 1, 0]), "TOP ISO": ([2, 5, 3], [0, 1, 0]),
    "FRONT LEFT": ([-1, .36, 1], [0, 1, 0]), "FRONT RIGHT": ([1, .36, 1], [0, 1, 0]),
    "REAR LEFT": ([-1, .36, -1], [0, 1, 0]), "REAR RIGHT": ([1, .36, -1], [0, 1, 0]),
    "HERO": ([1.25, .42, 2.1], [0, 1, 0]), "BOWL": ([-1.6, 1.25, -2.2], [0, 1, 0]),
    "PLAN": ([0, 1, 0], [0, 0, 1]), "SIDE ISO": ([1.0, 1.15, -.3], [0, 1, 0]), "SIDE ELEVATION": ([1, 0, 0], [0, 1, 0]), "END ELEVATION": ([0, 0, -1], [0, 1, 0]),
}
GLOSSY = {MATS.index(k) for k in ("ceramic", "armor", "steel", "visor", "pearl")}
TRANSPARENT = {MATS.index(k): PAL[k]["alpha"] for k in PAL if "alpha" in PAL[k]}
EMISSION = np.array([PAL[k]["emissive"] for k in MATS], np.float32)
SUIT = MATS.index("suit")


def basis(view):
    cam, up = VIEWS[view]
    cam = np.array(cam, float); cam /= np.linalg.norm(cam)
    up = np.array(up, float)
    right = np.cross(cam, up); right /= np.linalg.norm(right)
    up = np.cross(right, cam)
    return right.astype(np.float32), up.astype(np.float32), cam.astype(np.float32)


def render(img, faces, view, box, fit=.82, shift=(0, 0), focus=None, span=None, lines=True, halo=True, header_h=82, ret=False):
    P, N, Cc, UV, M = faces.arrays()
    right, up, cam = basis(view)
    # Babylon front faces: outward normal is (p2 - p0) x (p1 - p0).
    outward = np.cross(P[:, 2] - P[:, 0], P[:, 1] - P[:, 0])
    is_transparent = np.isin(M, list(TRANSPARENT))
    keep = (outward @ cam > 0) | is_transparent
    P, N, Cc, UV, M, is_transparent = P[keep], N[keep], Cc[keep], UV[keep], M[keep], is_transparent[keep]
    px = P @ right; py = P @ up; depth = P @ cam
    x0, y0, x1, y1 = box
    avail_w = x1 - x0 - 46; avail_h = y1 - y0 - header_h - 36
    if focus is not None:
        cx = float(np.dot(focus, right)); cy = float(np.dot(focus, up))
        scale = min(avail_w / span[0], avail_h / span[1]) * fit
    else:
        cx = (px.min() + px.max()) / 2; cy = (py.min() + py.max()) / 2
        scale = min(avail_w / max(.1, px.max() - px.min()), avail_h / max(.1, py.max() - py.min())) * fit
    width, height = (x1 - x0) * SS, (y1 - y0) * SS
    ox = ((x1 - x0) / 2 + shift[0]) * SS; oy = ((y1 - y0 + header_h - 6) / 2 + shift[1]) * SS
    s = scale * SS
    SX = (px - cx) * s + ox; SY = -(py - cy) * s + oy
    zbuf = np.full((height, width), -np.inf, np.float32)
    frame = np.zeros((height, width, 3), np.float32)
    alpha = np.zeros((height, width), np.float32)
    key = cam * .75 + up * .8 - right * .55; key /= np.linalg.norm(key)
    fill = -cam * .9 + up * .25 + right * .6; fill /= np.linalg.norm(fill)
    side = cam * .5 + right * .8; side /= np.linalg.norm(side)
    half = key + cam; half /= np.linalg.norm(half)
    clip = (18 * SS, width - 18 * SS, (header_h) * SS, height - 22 * SS)
    order = np.argsort(is_transparent, kind="stable")  # opaque first, then glass
    for idx in order:
        sx = SX[idx]; sy = SY[idx]
        minx = max(clip[0], int(sx.min())); maxx = min(clip[1], int(math.ceil(sx.max())))
        miny = max(clip[2], int(sy.min())); maxy = min(clip[3], int(math.ceil(sy.max())))
        if maxx < minx or maxy < miny:
            continue
        den = (sy[1] - sy[2]) * (sx[0] - sx[2]) + (sx[2] - sx[1]) * (sy[0] - sy[2])
        if abs(den) < 1e-9:
            continue
        yy, xx = np.mgrid[miny:maxy + 1, minx:maxx + 1].astype(np.float32)
        xx += .5; yy += .5
        a = ((sy[1] - sy[2]) * (xx - sx[2]) + (sx[2] - sx[1]) * (yy - sy[2])) / den
        b = ((sy[2] - sy[0]) * (xx - sx[2]) + (sx[0] - sx[2]) * (yy - sy[2])) / den
        c = 1 - a - b
        inside = (a >= -1e-3) & (b >= -1e-3) & (c >= -1e-3)
        if not inside.any():
            continue
        d = depth[idx]
        z = a * d[0] + b * d[1] + c * d[2]
        local = zbuf[miny:maxy + 1, minx:maxx + 1]
        vis = inside & (z > local + 1e-5)
        if not vis.any():
            continue
        nrm = N[idx]; col = Cc[idx]; m = int(M[idx])
        normal = a[..., None] * nrm[0] + b[..., None] * nrm[1] + c[..., None] * nrm[2]
        normal /= np.maximum(np.linalg.norm(normal, axis=2, keepdims=True), 1e-8)
        color = a[..., None] * col[0] + b[..., None] * col[1] + c[..., None] * col[2]
        name = MATS[m]
        if name in TEXTURES and name != "net":
            tex = TEXTURES[name]; th, tw = tex.shape[:2]; uv = UV[idx]
            u = a * uv[0, 0] + b * uv[1, 0] + c * uv[2, 0]; v = a * uv[0, 1] + b * uv[1, 1] + c * uv[2, 1]
            color = color * tex[((1 - np.mod(v, 1)) * th).astype(int) % th, (np.mod(u, 1) * tw).astype(int) % tw]
        lam = np.maximum(0, normal @ key); rear = np.maximum(0, normal @ fill)
        fres = np.power(1 - np.maximum(0, normal @ cam), 2.3)
        glossy = m in GLOSSY
        spec = np.power(np.maximum(0, normal @ half), 60 if glossy else 20)
        light = .22 + .76 * lam + .14 * rear + .15 * np.maximum(0, normal @ side) + .08 * np.maximum(0, normal[..., 1])
        out = color * light[..., None] + spec[..., None] * (.45 if glossy else .16)
        out += fres[..., None] * rear[..., None] * np.array([.1, .05, .2], np.float32)
        out += color * (.3 * min(1.4, float(EMISSION[m])))
        if m == SUIT:
            out *= .85
        out = np.clip(out, 0, 1)
        target = frame[miny:maxy + 1, minx:maxx + 1]
        if m in TRANSPARENT:
            op = TRANSPARENT[m] * (1.6 if name == "net" else 1.4)
            if name == "net" and "net" in TEXTURES:
                tex = TEXTURES["net"]; th, tw = tex.shape[:2]; uv = UV[idx]
                u = a * uv[0, 0] + b * uv[1, 0] + c * uv[2, 0]; v = a * uv[0, 1] + b * uv[1, 1] + c * uv[2, 1]
                op = op * tex[((1 - np.mod(v * 2, 1)) * th).astype(int) % th, (np.mod(u * 2, 1) * tw).astype(int) % tw][..., 0]
            op = np.broadcast_to(np.clip(op, 0, .9), vis.shape)
            o = op[vis][:, None]
            target[vis] = target[vis] * (1 - o) + out[vis] * o
            al = alpha[miny:maxy + 1, minx:maxx + 1]
            al[vis] = np.maximum(al[vis], op[vis])
        else:
            target[vis] = out[vis]
            local[vis] = z[vis]
            alpha[miny:maxy + 1, minx:maxx + 1][vis] = 1
    covered = zbuf > -np.inf
    if lines:
        zz = np.where(covered, zbuf, np.nan)
        edge = np.zeros_like(covered)
        # A depth jump counts as an edge when it is larger than ~4 pixels of
        # surface slope, so oblique floors at stadium scale stay clean.
        thr = max(.035, 4.0 / s)
        for dy, dx in ((0, 1), (1, 0)):
            A = zz[:zz.shape[0] - dy, :zz.shape[1] - dx]; B = zz[dy:, dx:]
            jump = (np.isnan(A) != np.isnan(B)) | (np.abs(np.nan_to_num(A) - np.nan_to_num(B)) > thr)
            edge[:edge.shape[0] - dy, :edge.shape[1] - dx] |= jump
        edge &= covered | np.roll(covered, 1, 0) | np.roll(covered, 1, 1)
        line = np.array([120, 236, 255], np.float32) / 255
        frame[edge] = frame[edge] * .35 + line * .65
        alpha[edge] = 1
    rgba = np.dstack([np.clip(frame * 255, 0, 255), np.clip(alpha * 255, 0, 255)]).astype(np.uint8)
    cut = Image.fromarray(rgba, "RGBA").resize((x1 - x0, y1 - y0), Image.LANCZOS)
    if halo:
        glow = cut.getchannel("A").filter(ImageFilter.GaussianBlur(16)).point(lambda q: int(q * .16))
        back = Image.new("RGBA", cut.size, (73, 244, 255, 0)); back.putalpha(glow)
        img.paste(back.convert("RGB"), (x0, y0), back.getchannel("A"))
    img.paste(cut.convert("RGB"), (x0, y0), cut.getchannel("A"))
    if ret:
        return lambda q: (float((np.dot(q, right) - cx) * scale + ox / SS + x0), float(-(np.dot(q, up) - cy) * scale + oy / SS + y0))


# ---------------------------------------------------------------------------
# Plate furniture
# ---------------------------------------------------------------------------
def plate(title, kicker, detail):
    w, h = 2100, 1560
    img = Image.new("RGB", (w, h), BG); d = ImageDraw.Draw(img)
    d.rectangle((0, 0, w, 143), fill=(8, 11, 33))
    d.polygon([(45, 37), (60, 37), (60, 109), (45, 109)], fill=CYAN)
    d.text((80, 30), kicker, font=font(15, mono=True), fill=LIME)
    d.text((80, 54), title, font=font(39, True), fill=INK)
    d.text((w - 760, 96), detail, font=font(13, mono=True), fill=MUTED)
    d.line((45, 138, w - 45, 138), fill=(52, 66, 140), width=2)
    return img, d, w, h


def footer(d, w, h, number):
    d.line((45, h - 60, w - 45, h - 60), fill=(52, 66, 140), width=2)
    d.text((45, h - 44), f"NEON SPORTS ARENA // BLUEPRINT SERIES NS-02 // SPEC {VERSION} // GAME GEOMETRY = BLUEPRINT GEOMETRY",
           font=font(12, mono=True), fill=MUTED)
    d.text((w - 150, h - 44), f"PLATE {number:02}/{PLATES}", font=font(12, mono=True), fill=CYAN)


def panel(d, box, title, subtitle, index, grid=True):
    x0, y0, x1, y1 = box
    d.rounded_rectangle(box, radius=10, fill=PANEL, outline=EDGE, width=2)
    if grid:
        for x in range(x0 + 30, x1 - 15, 32):
            d.line((x, y0 + 77, x, y1 - 20), fill=GRID, width=1)
        for y in range(y0 + 90, y1 - 14, 32):
            d.line((x0 + 16, y, x1 - 16, y), fill=GRID, width=1)
    d.text((x0 + 22, y0 + 18), f"{index:02}  {title}", font=font(20, True), fill=INK)
    d.text((x0 + 22, y0 + 47), subtitle, font=font(11, mono=True), fill=MUTED)
    d.line((x0 + 18, y0 + 74, x1 - 18, y0 + 74), fill=(56, 70, 150), width=1)


def dim(d, a, b, label, vertical=True, color=CYAN):
    (xa, ya), (xb, yb) = a, b
    d.line((xa, ya, xb, yb), fill=color, width=1)
    if vertical:
        for y in (ya, yb):
            d.line((xa - 9, y, xa + 9, y), fill=color, width=2)
        d.text((xa + 9, (ya + yb) / 2 - 7), label, font=font(11, mono=True), fill=color)
    else:
        for x in (xa, xb):
            d.line((x, ya - 9, x, ya + 9), fill=color, width=2)
        d.text(((xa + xb) / 2 - len(label) * 3.4, ya + 8), label, font=font(11, mono=True), fill=color)


def grid_boxes(cols, rows, top=172, bottom=1478, left=45, right=2055, gap=18):
    cw = (right - left - gap * (cols - 1)) / cols; rh = (bottom - top - gap * (rows - 1)) / rows
    return [(int(left + c * (cw + gap)), int(top + r * (rh + gap)), int(left + c * (cw + gap) + cw), int(top + r * (rh + gap) + rh))
            for r in range(rows) for c in range(cols)]


def tris(asset):
    return sum(len(p["mesh"]["indices"]) // 3 for p in SPEC["assets"][asset])


def bounds(asset):
    pts = np.concatenate([np.asarray(p["positions"]).reshape(-1, 3) for p in EXTRACTED["assets"][asset]])
    return pts.min(0), pts.max(0)


ATHLETE = SPEC["assets"]["athlete"]
DIM = SPEC["dimensions"]


def save(img, name):
    img.save(OUT / name, optimize=True)
    print(name, (OUT / name).stat().st_size)


# ---------------------------------------------------------------------------
# Plates
# ---------------------------------------------------------------------------
def plate_six_sides():
    lo, hi = bounds("athlete")
    img, d, w, h = plate("ATHLETE / SIX SIDES", "ORTHOGRAPHIC CHARACTER ATLAS",
                         f"{hi[1]:.2f} m  |  {len(ATHLETE)} PARTS  |  {tris('athlete'):,} TRIANGLES  |  17 JOINTS  |  TEAM-TINTED KIT")
    views = [("FRONT", "+Z  VISOR / CHEST GUARD / NUMBER CHEVRON"), ("REAR", "-Z  NOVA REACTOR / BACK PLATE"),
             ("LEFT", "-X  PROFILE / ENERGY BRACER"), ("RIGHT", "+X  PROFILE / PULSE LAUNCHER"),
             ("TOP", "+Y  CREST / SHOULDER PADS"), ("UNDERSIDE", "-Y  VELOCITY BOOT HOVER RINGS")]
    for i, (view, sub) in enumerate(views):
        box = grid_boxes(3, 2)[i]
        panel(d, box, view, sub, i + 1)
        proj = render(img, asset_faces("athlete"), view, box, fit=.8, ret=True)
        if view in ("FRONT", "REAR", "LEFT", "RIGHT"):
            top = proj([0, hi[1], 0]); bottom = proj([0, 0, 0])
            dim(d, (box[2] - 56, top[1]), (box[2] - 56, bottom[1]), f"{hi[1]:.2f} m")
        if view in ("FRONT", "REAR"):
            sw = DIM["athleteShoulderWidth"]
            l = proj([-sw / 2, 0, 0]); r = proj([sw / 2, 0, 0])
            dim(d, (min(l[0], r[0]), bottom[1] + 24), (max(l[0], r[0]), bottom[1] + 24), f"{sw:.2f} m SHOULDER", vertical=False)
    footer(d, w, h, 1)
    save(img, "01-athlete-six-views.png")


def plate_quarters():
    img, d, w, h = plate("ATHLETE / QUARTER VIEWS", "EVERY ANGLE BETWEEN THE SIDES",
                         "45 DEG AZIMUTH  |  20 DEG ELEVATION  |  SKINNED RUNTIME VERTICES")
    views = [("FRONT LEFT", "VISOR WRAP / ENERGY BRACER / SHOULDER PAD"), ("FRONT RIGHT", "PULSE LAUNCHER / CHEST CORE / SHIN GUARDS"),
             ("REAR LEFT", "REACTOR / EXHAUSTS / CALF"), ("REAR RIGHT", "BACK PLATE / LAUNCHER BARREL / HEEL")]
    for i, (view, sub) in enumerate(views):
        box = grid_boxes(4, 1)[i]
        panel(d, box, view, sub, i + 1)
        render(img, asset_faces("athlete"), view, box, fit=.92, focus=(0, .95, 0), span=(1.0, 2.0))
    footer(d, w, h, 2)
    save(img, "02-athlete-quarter-views.png")


def plate_detail():
    img, d, w, h = plate("ATHLETE / DETAIL REVIEW", "RUNTIME MESH DETAIL",
                         "LOFTED BODY  |  CONFORMAL KIT SHELLS  |  HOVER-SKATES  |  PULSE LAUNCHER")
    hero = (45, 172, 1100, 1478)
    panel(d, hero, "PLAYABLE ATHLETE // HERO", "CYAN COMETS HOME KIT / AEGIS ARMOUR / VELOCITY BOOTS", 1)
    render(img, asset_faces("athlete", pose="stance"), "HERO", hero, fit=.88)
    group = {p["name"]: p.get("group") for p in ATHLETE}
    sel = lambda *g: {n for n, gr in group.items() if gr in g}
    details = [((1118, 172, 2055, 600), "HELMET + WRAP VISOR", "CREST / EAR COMMS / CHIN GUARD", "FRONT RIGHT", sel("head", "neck"), .8),
               ((1118, 618, 1580, 1040), "PULSE LAUNCHER", "SHOT + BLAST EMITTER", "RIGHT", sel("rightForeArm", "rightHand"), .82),
               ((1598, 618, 2055, 1040), "NOVA REACTOR", "BACK PACK / EXHAUSTS", "REAR", {n for n in group if n.startswith(("reactor", "exhaust", "backPlate"))}, .8),
               ((1118, 1058, 2055, 1478), "VELOCITY BOOT", "HOVER-SKATE / TWIN LEVITATION RINGS", "FRONT LEFT", sel("rightFoot"), .78)]
    for i, (box, title, sub, view, selected, fit) in enumerate(details, 2):
        panel(d, box, title, sub, i)
        render(img, asset_faces("athlete", selected=selected), view, box, fit=fit)
    swatches = [("JERSEY  (kitPrimary)", "#1268ff"), ("TRIM / GLOW  (kitTrim)", "#49f4ff"), ("AEGIS ARMOUR", PAL["armor"]["color"]),
                ("CERAMIC", PAL["ceramic"]["color"]), ("COMPRESSION SUIT", PAL["suit"]["color"])]
    for i, (label, hexv) in enumerate(swatches):
        x = 48 + i * 400
        d.rounded_rectangle((x, 1486, x + 30, 1508), radius=5, fill=tuple(bytes.fromhex(hexv[1:])))
        d.text((x + 40, 1490), label, font=font(12, mono=True), fill=(180, 190, 225))
    footer(d, w, h, 3)
    save(img, "03-athlete-detail.png")


def plate_poses():
    img, d, w, h = plate("ATHLETE / ARTICULATION + POSES", "ONE RIG FOR EVERY SPORT",
                         "17 JOINTS  |  RIGID SKINNING, 1 BONE PER VERTEX  |  POSES = app/athlete-rig.ts")
    rig = (45, 172, 560, 1478)
    panel(d, rig, "JOINT MAP // FRONT", "PIVOTS AND PARENT CHAIN", 1)
    proj = render(img, asset_faces("athlete"), "FRONT", rig, fit=.86, ret=True, lines=False)
    over = Image.new("RGBA", (rig[2] - rig[0] - 4, rig[3] - rig[1] - 80), (6, 10, 30, 150))
    img.paste(over, (rig[0] + 2, rig[1] + 78), over)
    joints = POSES["joints"]; parents = POSES["parents"]
    for name, parent in parents.items():
        if parent in joints:
            d.line((*proj(joints[parent]), *proj(joints[name])), fill=PINK, width=3)
    labels = {"head": "HEAD", "neck": "NECK", "chest": "CHEST", "spine": "SPINE", "hips": "HIPS", "rightUpperArm": "SHOULDER R",
              "rightForeArm": "ELBOW R", "rightHand": "WRIST R", "leftThigh": "HIP L", "leftShin": "KNEE L", "leftFoot": "ANKLE L"}
    for name, p in joints.items():
        x, y = proj(p)
        d.ellipse((x - 6, y - 6, x + 6, y + 6), fill=(12, 20, 50), outline=CYAN, width=2)
        if name in labels:
            # Viewed from the front the athlete's right (+X) appears on the left.
            tx = x - 14 - len(labels[name]) * 7 if p[0] > 0 else x + 14
            d.text((tx, y - 7), labels[name], font=font(11, mono=True), fill=(210, 230, 255))
    poses = [("stance", "READY STANCE", "KNEES SOFT / WEIGHT FORWARD"), ("skate", "HOVER STRIDE", "PUSH PHASE 90 DEG"),
             ("boost", "NOVA BOOST", "AERO TUCK"), ("kick", "POWER STRIKE", "GOAL RUSH CONTACT"),
             ("shoot", "GRAVITY SHOT", "TWO-HAND RELEASE"), ("throw", "CORE THROW", "OVERHAND RELEASE"),
             ("blast", "PULSE BLAST", "LAUNCHER LEVELLED"), ("tackle", "PULSE TACKLE", "SHOULDER CHARGE"),
             ("jump", "AIR STEP", "RISING TUCK"), ("dunk", "SLAM DUNK", "OVERHEAD REACH"),
             ("celebrate", "CELEBRATION", "ARMS-UP V"), ("carry", "CORE CARRY", "CRADLE AT CHEST")]
    boxes = grid_boxes(4, 3, left=578)
    for i, (key, title, sub) in enumerate(poses):
        panel(d, boxes[i], title, sub, i + 2)
        view = "LEFT" if key in ("skate", "boost", "tackle", "kick") else "FRONT LEFT"
        render(img, asset_faces("athlete", pose=key), view, boxes[i], fit=.86, focus=(0, .95, 0), span=(1.6, 2.15))
    footer(d, w, h, 4)
    save(img, "04-articulation-pose-sheet.png")


def plate_kits():
    img, d, w, h = plate("TEAM KITS / SIX COLOURWAYS", "ONE MESH, SIX LEAGUE TEAMS",
                         "jersey = team accent  |  trim + light strips = team colour  |  tinted at runtime")
    for i, (name, color, accent) in enumerate(TEAMS):
        box = grid_boxes(3, 2)[i]
        panel(d, box, name, f"KIT PRIMARY {accent.upper()}  /  TRIM {color.upper()}", i + 1)
        render(img, asset_faces("athlete", pose="stance", tints={"kitPrimary": accent, "kitTrim": color}),
               "FRONT RIGHT" if i % 2 == 0 else "FRONT LEFT", box, fit=.84)
        d.rounded_rectangle((box[2] - 120, box[1] + 22, box[2] - 92, box[1] + 50), radius=5, fill=tuple(bytes.fromhex(accent[1:])))
        d.rounded_rectangle((box[2] - 82, box[1] + 22, box[2] - 54, box[1] + 50), radius=5, fill=tuple(bytes.fromhex(color[1:])))
    footer(d, w, h, 5)
    save(img, "05-team-kits.png")


def plate_equipment():
    img, d, w, h = plate("SPORT EQUIPMENT", "BALLS, CORE, TARGETS, PICKUPS, PADS, TROPHY",
                         "ENERGY BALL 0.80 m  |  GRAVITY ORB 0.72 m  |  POWER CORE 0.80 m  |  TARGET 1.80 m")
    entries = [("ENERGY BALL", "ISO", "energy_ball", "GOAL RUSH / 3 LIGHT SEAMS", .7), ("ENERGY BALL // TOP", "TOP", "energy_ball", "POLE CAPS / SEAM GRID", .7),
               ("GRAVITY ORB", "ISO", "gravity_orb", "GRAVITY HOOPS / GLOW GROOVES", .7), ("POWER CORE", "ISO", "power_core", "CORE CAPTURE / CARRY RINGS", .74),
               ("HOLO TARGET", "FRONT RIGHT", "holo_target", "TARGET BLITZ / 3-RING BULLSEYE", .78),
               ("ENERGY CELL", "FRONT RIGHT", "pickup_energy", "+36 ENERGY", .72), ("SHIELD CELL", "FRONT RIGHT", "pickup_shield", "+34 SHIELD", .72),
               ("TURBO CELL", "FRONT RIGHT", "pickup_turbo", "2.6 s TURBO", .72), ("LAUNCH PAD", "TOP ISO", "launch_pad", "DUNK / VOLLEY LAUNCH ARC", .8),
               ("INFINITY CUP", "FRONT RIGHT", "trophy", "CHAMPIONSHIP TROPHY", .8)]
    boxes = grid_boxes(5, 2)
    for i, (title, view, asset, sub, fit) in enumerate(entries):
        panel(d, boxes[i], title, sub, i + 1)
        proj = render(img, asset_faces(asset, tints={"arena": "#d9ff4f"}), view, boxes[i], fit=fit, ret=True)
        lo, hi = bounds(asset)
        if view == "TOP":
            l = proj([lo[0], 0, lo[2]]); r = proj([hi[0], 0, lo[2]])
            dim(d, (l[0], boxes[i][3] - 46), (r[0], boxes[i][3] - 46), f"{hi[0] - lo[0]:.2f} m", vertical=False)
    footer(d, w, h, 6)
    save(img, "06-sport-equipment.png")


def plate_structures():
    A = SPEC["arena"]
    img, d, w, h = plate("SCORING STRUCTURES", "GOAL RUSH  /  GRAVITY HOOPS  /  CORE CAPTURE",
                         f"GOAL {A['goalHalfWidth'] * 2:.1f} x {A['goalHeight']:.1f} m  |  HOOP {DIM['hoopDiameter']:.1f} m AT {A['hoopCentreY']:.1f} m  |  ZONE R {A['captureRadius']:.1f} m")
    arena = {"arena": "#49f4ff"}
    keeper = {"kitPrimary": "#8f25ff", "kitTrim": "#ff55ad"}
    entries = [("GOAL // FRONT", "FRONT", "goal_frame", "MOUTH + POST LIGHTS", arena), ("GOAL // ISO", "ISO", "goal_frame", "HOLO NET + FRAME", arena),
               ("GOAL // SIDE", "RIGHT", "goal_frame", "NET DEPTH 2.4 m", arena), ("GOAL // TOP", "TOP", "goal_frame", "GOAL LINE + MOUTH GLOW", arena),
               ("KEEPER DRONE // FRONT", "FRONT", "keeper_drone", "SWEEP PADDLES 2.9 m", keeper), ("KEEPER DRONE // ISO", "ISO", "keeper_drone", "TRACKS THE SHOT LINE", keeper),
               ("HOOP RIG // FRONT", "FRONT", "hoop_rig", "RING + GRAVITY LENS", arena), ("HOOP RIG // SIDE", "RIGHT", "hoop_rig", "BACKBOARD 1.45 m BEHIND", arena),
               ("HOOP RIG // ISO", "ISO", "hoop_rig", "FORK MAST + RIM LIGHTS", arena), ("CAPTURE ZONE // TOP", "TOP", "capture_zone", "RING R 4.5 m", arena),
               ("CAPTURE ZONE // ISO", "ISO", "capture_zone", "PYLONS + HOLO DOME", arena), ("KEEPER DRONE // TOP", "TOP", "keeper_drone", "HULL + PADDLES", keeper)]
    boxes = grid_boxes(4, 3)
    for i, (title, view, asset, sub, tints) in enumerate(entries):
        panel(d, boxes[i], title, sub, i + 1)
        proj = render(img, asset_faces(asset, tints=tints), view, boxes[i], fit=.78, ret=True)
        lo, hi = bounds(asset)
        if asset == "goal_frame" and view == "FRONT":
            l = proj([-A["goalHalfWidth"], 0, 0]); r = proj([A["goalHalfWidth"], 0, 0]); t = proj([A["goalHalfWidth"], A["goalHeight"], 0])
            dim(d, (min(l[0], r[0]), l[1] + 18), (max(l[0], r[0]), l[1] + 18), f"{A['goalHalfWidth'] * 2:.1f} m", vertical=False)
            dim(d, (max(l[0], r[0]) + 22, t[1]), (max(l[0], r[0]) + 22, l[1]), f"{A['goalHeight']:.1f} m")
        if asset == "hoop_rig" and view == "FRONT":
            y = A["hoopCentreY"]; R = DIM["hoopDiameter"] / 2
            l = proj([-R, y, 0]); r = proj([R, y, 0]); g = proj([R, 0, 0]); c = proj([0, y, 0])
            dim(d, (min(l[0], r[0]), c[1]), (max(l[0], r[0]), c[1]), f"{DIM['hoopDiameter']:.1f} m", vertical=False, color=LIME)
            dim(d, (boxes[i][2] - 50, c[1]), (boxes[i][2] - 50, g[1]), f"{y:.1f} m")
    footer(d, w, h, 7)
    save(img, "07-scoring-structures.png")


def plate_venue_plan():
    A = SPEC["arena"]
    img, d, w, h = plate("VENUE / PLAN + ELEVATIONS", "INFINITY CHAMPIONSHIP CONFIGURATION",
                         f"PITCH {A['pitchHalfWidth'] * 2:.0f} x {A['pitchHalfLength'] * 2:.0f} m  |  8-TIER STANDS + UPPER RING  |  4 x 24 m FLOODLIGHTS")
    venue = venue_faces(5, "goal", crowd=.9, extras=False, skip=("jumbotron",))
    plan = (45, 172, 1180, 1478)
    panel(d, plan, "PLAN // TOP", "+Z = RIVAL GOAL (ATTACK UP)  /  -Z = HOME GOAL", 1)
    proj = render(img, venue, "PLAN", plan, fit=.92, ret=True, halo=False)
    W, L = A["pitchHalfWidth"], A["pitchHalfLength"]
    a = proj([-W, 0, -L]); b = proj([W, 0, -L]); c = proj([W, 0, L])
    dim(d, (a[0], a[1] + 16), (b[0], a[1] + 16), f"{2 * W:.0f} m", vertical=False, color=LIME)
    dim(d, (b[0] + 16, c[1]), (b[0] + 16, b[1]), f"{2 * L:.0f} m", color=LIME)
    for label, p in [("RIVAL GOAL", [0, 0, L]), ("HOME GOAL", [0, 0, -L]), ("CENTRE", [0, 0, 0])]:
        x, y = proj(p); d.text((x + 8, y + (10 if p[2] >= 0 else -24)), label, font=font(11, mono=True), fill=LIME)
    side = (1198, 172, 2055, 818)
    panel(d, side, "SECTION A-A // LOOKING -X", "NEAR SIDE CUT AWAY / TIERS RISE 0.52 m / UPPER RING +6.4 m", 2)
    render(img, venue_faces(5, "goal", crowd=.9, extras=False, cut=lambda p: p[0] < 1.0), "SIDE ELEVATION", side, fit=.94, halo=False)
    end = (1198, 836, 2055, 1478)
    panel(d, end, "SECTION B-B // LOOKING +Z", "HOME END CUT AWAY / JUMBOTRON +15.5 m / LAMP HEADS +24 m", 3)
    render(img, venue_faces(5, "goal", crowd=.9, extras=False, cut=lambda p: p[2] > -1.0), "END ELEVATION", end, fit=.94, halo=False)
    footer(d, w, h, 8)
    save(img, "08-venue-plan-elevations.png")


def plate_configs():
    img, d, w, h = plate("VENUE / SPORT CONFIGURATIONS", "WHAT THE GAME PLACES FOR EACH SPORT",
                         "RIVAL END +Z IN MATCH ACCENT  |  HOME END -Z IN YOUR TEAM COLOURS")
    entries = [("goal", "GOAL RUSH", "2 GOALS + 2 KEEPER DRONES + 6 PICKUPS"), ("hoops", "GRAVITY HOOPS", "2 HOOP RIGS + 2 LAUNCH PADS"),
               ("capture", "CORE CAPTURE", "2 CAPTURE ZONES"), ("targets", "TARGET BLITZ", "FLOATING TARGET FIELD")]
    for i, (mode, title, sub) in enumerate(entries):
        box = grid_boxes(2, 2)[i]
        panel(d, box, title, sub, i + 1)
        # Only the pitch bowl: boards, pitch and the sport structures.
        render(img, venue_pitch(mode), "SIDE ISO", box, fit=.96, halo=False)
    footer(d, w, h, 9)
    save(img, "09-sport-configurations.png")


def venue_pitch(mode, accent="#ff55ad"):
    faces = Faces()
    for entry in SPEC["layout"]:
        if entry["asset"] not in ("pitch", "board_section") or (entry.get("modes") and mode not in entry["modes"]):
            continue
        faces.extend(asset_faces(entry["asset"], tints={"arena": accent}, at=entry["position"], yaw=entry["yaw"]))
    kit = {"kitPrimary": TEAMS[0][2], "kitTrim": TEAMS[0][1]}; rival = {"kitPrimary": TEAMS[1][2], "kitTrim": TEAMS[1][1]}
    for item in SPEC["modes"][mode] + SPEC["modes"]["pickups"]:
        home = item.get("side") == "home"
        faces.extend(asset_faces(item["asset"], tints={"arena": kit["kitTrim"] if home else accent, **(kit if home else rival)},
                                 at=item["position"], yaw=item["yaw"]))
    return faces


def plate_modules():
    img, d, w, h = plate("VENUE / MODULES", "STANDS, BOARDS, LIGHTS, SCREENS, CROWD",
                         f"STAND {SPEC['arena']['standWidth']:.0f} m x 8 TIERS  |  BOARD 4 m  |  SPECTATOR {tris('spectator')} TRIS (INSTANCED)")
    entries = [("STAND SECTION // ISO", "ISO", "stand_section", "12 m / 8 TIERS / ARENA SEATS", .82),
               ("STAND SECTION // PROFILE", "LEFT", "stand_section", "TREAD 0.9 m / RISE 0.52 m", .86),
               ("DASHER BOARD", "ISO", "board_section", "LED BAND + GLASS 2.6 m", .8),
               ("FLOODLIGHT TOWER", "FRONT RIGHT", "floodlight", "24 m MAST / 12 LAMPS", .86),
               ("JUMBOTRON", "ISO", "jumbotron", "4 LIVE SCREENS (IN GAME)", .82),
               ("SPECTATOR", "FRONT RIGHT", "spectator", "THIN-INSTANCED / PER-SEAT COLOUR", .7),
               ("SKYLINE TOWER", "ISO", "sky_tower", "CITY VENUES BACKDROP", .82),
               ("PITCH DECK", "TOP", "pitch", "LINES IN ARENA ACCENT", .9)]
    for i, (title, view, asset, sub, fit) in enumerate(entries):
        box = grid_boxes(4, 2)[i]
        panel(d, box, title, sub, i + 1)
        render(img, asset_faces(asset, tints={"arena": "#ffe45c"}), view, box, fit=fit)
    footer(d, w, h, 10)
    save(img, "10-venue-modules.png")


def plate_circuit():
    img, d, w, h = plate("ARENA CIRCUIT / SIX VENUES", "30 MATCHES ACROSS SIX ARENAS",
                         "SAME MODULES, DIFFERENT BOWLS, ACCENTS AND CROWDS")
    crowd = [.25, .7, .6, .75, .85, 1.0]
    for i, (name, color) in enumerate(ARENAS):
        box = grid_boxes(3, 2)[i]
        panel(d, box, name, f"ACCENT {color.upper()}  /  MATCHES {i * 5 + 1}-{i * 5 + 5}  /  NEAR STANDS CUT AWAY", i + 1, grid=False)
        render(img, venue_faces(i, ["goal", "hoops", "capture", "targets", "goal", "hoops"][i], crowd=crowd[i] * .6, extras=False,
                                cut=lambda p: p[0] > -17 and p[2] > -25), "BOWL", box, fit=.98, halo=False)
    footer(d, w, h, 11)
    save(img, "11-arena-circuit.png")


JOBS = {"1": plate_six_sides, "2": plate_quarters, "3": plate_detail, "4": plate_poses, "5": plate_kits,
        "6": plate_equipment, "7": plate_structures, "8": plate_venue_plan, "9": plate_configs, "10": plate_modules,
        "11": plate_circuit}

if __name__ == "__main__":
    for key in (sys.argv[1:] or list(JOBS)):
        JOBS[key]()
