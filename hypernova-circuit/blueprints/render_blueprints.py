"""Render the Hypernova Circuit blueprint plates from app/game/blueprint-spec.json
and app/game/track-spec.json.

The rasteriser projects the exact triangles and the same area-weighted normals
three.js computes at runtime, so every plate shows the playable geometry.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from mesh_geometry import vertex_normals

ROOT = Path(__file__).resolve().parents[1]
SPEC = json.loads((ROOT / "app/game/blueprint-spec.json").read_text())
OUT = ROOT / "blueprints" / "renders"
OUT.mkdir(exist_ok=True)
W, H = 2100, 1560
SS = 2
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
BG = (4, 10, 24)
INK = (226, 246, 255)
CYAN = (61, 233, 255)
PINK = (255, 79, 196)
MUTED = (110, 150, 182)
GRID = (14, 34, 58)


def font(size, bold=False, mono=False):
    return ImageFont.truetype(MONO if mono else BOLD if bold else FONT, size)


def hex_rgb(value):
    return np.array([int(value[i:i + 2], 16) for i in (1, 3, 5)], float) / 255


VIEWS = {
    "FRONT": ([0, 0, 1], [0, 1, 0]), "REAR": ([0, 0, -1], [0, 1, 0]),
    "LEFT": ([1, 0, 0], [0, 1, 0]), "RIGHT": ([-1, 0, 0], [0, 1, 0]),
    "TOP": ([0, 1, 0], [1, 0, 0]), "UNDERSIDE": ([0, -1, 0], [-1, 0, 0]),
    "FRONT LEFT": ([1, .5, 1], [0, 1, 0]), "FRONT RIGHT": ([-1, .5, 1], [0, 1, 0]),
    "REAR LEFT": ([1, .5, -1], [0, 1, 0]), "REAR RIGHT": ([-1, .5, -1], [0, 1, 0]),
    "HERO": ([1.5, .75, 2.1], [0, 1, 0]), "ISO": ([1.2, 1.0, 1.4], [0, 1, 0]),
}


def basis(view):
    cam, up = VIEWS[view]
    cam = np.array(cam, float)
    cam /= np.linalg.norm(cam)
    up = np.array(up, float)
    right = np.cross(up, cam)
    right /= np.linalg.norm(right)
    up = np.cross(cam, right)
    return right, up, cam


_cache = {}


def faces_of(key, colors=None):
    if (key, colors) in _cache:
        return _cache[(key, colors)]
    asset = SPEC["assets"][key]
    mats = asset["materials"]
    out = []
    for part in asset["parts"]:
        v = np.array(part["positions"], float).reshape(-1, 3)
        f = np.array(part["indices"], int).reshape(-1, 3)
        v, f, n = vertex_normals(v, f, part["flat"])
        m = mats[part["material"]]
        color = hex_rgb(m["color"])
        if colors and part["material"] in ("paint", "under"):
            color = hex_rgb(colors[0])
        if colors and part["material"] in ("glow", "thrust"):
            color = hex_rgb(colors[1])
        out.append((v, f, n, color, float(m["emissive"]), float(m["metalness"]), part["name"]))
    _cache[(key, colors)] = out
    return out


def raster(key, view, size, scale=None, centre=None, colors=None):
    """Return (rgb image, alpha mask, projection info) for one view."""
    w, h = size[0] * SS, size[1] * SS
    right, up, cam = basis(view)
    parts = faces_of(key, colors)
    allv = np.concatenate([p[0] for p in parts])
    px, py = allv @ right, allv @ up
    if centre is None:
        centre = ((px.min() + px.max()) / 2, (py.min() + py.max()) / 2)
    if scale is None:
        scale = min(size[0] * .84 / max(.05, np.ptp(px)), size[1] * .84 / max(.05, np.ptp(py)))
    s = scale * SS
    zbuf = np.full((h, w), -np.inf, np.float32)
    rgb = np.zeros((h, w, 3), np.float32)
    nrm = np.zeros((h, w, 3), np.float32)
    key_l = cam * .7 + up * .9 - right * .5
    key_l /= np.linalg.norm(key_l)
    fill_l = cam * .4 + right * .8 - up * .1
    fill_l /= np.linalg.norm(fill_l)
    half = key_l + cam
    half /= np.linalg.norm(half)
    for v, f, n, color, emissive, metal, _name in parts:
        sx = (v @ right - centre[0]) * s + w / 2
        sy = -(v @ up - centre[1]) * s + h / 2
        dz = v @ cam
        for tri in f:
            x, y, z = sx[tri], sy[tri], dz[tri]
            den = (y[1] - y[2]) * (x[0] - x[2]) + (x[2] - x[1]) * (y[0] - y[2])
            if den >= -1e-9:  # back-facing or degenerate (screen y points down)
                continue
            x0, x1 = max(0, int(x.min())), min(w - 1, int(math.ceil(x.max())))
            y0, y1 = max(0, int(y.min())), min(h - 1, int(math.ceil(y.max())))
            if x1 < x0 or y1 < y0:
                continue
            yy, xx = np.mgrid[y0:y1 + 1, x0:x1 + 1].astype(np.float32) + .5
            a = ((y[1] - y[2]) * (xx - x[2]) + (x[2] - x[1]) * (yy - y[2])) / den
            b = ((y[2] - y[0]) * (xx - x[2]) + (x[0] - x[2]) * (yy - y[2])) / den
            c = 1 - a - b
            inside = (a >= -1e-4) & (b >= -1e-4) & (c >= -1e-4)
            if not inside.any():
                continue
            zz = a * z[0] + b * z[1] + c * z[2]
            region = zbuf[y0:y1 + 1, x0:x1 + 1]
            vis = inside & (zz > region)
            if not vis.any():
                continue
            nn = a[..., None] * n[tri[0]] + b[..., None] * n[tri[1]] + c[..., None] * n[tri[2]]
            nn /= np.maximum(np.linalg.norm(nn, axis=2, keepdims=True), 1e-8)
            lam = np.clip(nn @ key_l, 0, 1)
            fil = np.clip(nn @ fill_l, 0, 1)
            spec = np.clip(nn @ half, 0, 1) ** (18 + 60 * metal)
            fres = (1 - np.clip(nn @ cam, 0, 1)) ** 2.4
            base = color * (0.16 + 0.72 * lam[..., None] + 0.22 * fil[..., None])
            base += (0.25 + 0.6 * metal) * spec[..., None]
            base += np.array([.25, .55, 1.0]) * fres[..., None] * .35
            if emissive > 0.5:
                base = base * .45 + color * min(1.25, .55 + emissive * .2)
            region[vis] = zz[vis]
            rgb[y0:y1 + 1, x0:x1 + 1][vis] = base[vis]
            nrm[y0:y1 + 1, x0:x1 + 1][vis] = nn[vis]
    mask = np.isfinite(zbuf)
    # Contour pass: silhouette and crease lines in blueprint cyan.
    edge = np.zeros((h, w), bool)
    for dy, dx in ((0, 1), (1, 0)):
        m2 = np.roll(mask, (dy, dx), (0, 1))
        edge |= mask != m2
        nd = np.linalg.norm(nrm - np.roll(nrm, (dy, dx), (0, 1)), axis=2)
        zd = np.abs(np.where(mask, zbuf, 0) - np.roll(np.where(mask, zbuf, 0), (dy, dx), (0, 1)))
        edge |= mask & m2 & ((nd > .55) | (zd > .06))
    rgb = np.clip(rgb, 0, 1)
    rgb[edge] = rgb[edge] * .25 + np.array(CYAN) / 255 * .75
    img = Image.fromarray((rgb * 255).astype(np.uint8)).resize(size, Image.LANCZOS)
    alpha = Image.fromarray(((mask | edge) * 255).astype(np.uint8)).resize(size, Image.LANCZOS)
    return img, alpha, {"scale": scale, "centre": centre, "right": right, "up": up,
                        "extent": (px.min(), px.max(), py.min(), py.max())}


def background(title, subtitle, plate, total):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    for x in range(0, W, 30):
        d.line((x, 0, x, H), fill=GRID if x % 150 else (20, 48, 80))
    for y in range(0, H, 30):
        d.line((0, y, W, y), fill=GRID if y % 150 else (20, 48, 80))
    d.rectangle((20, 20, W - 20, H - 20), outline=(46, 110, 150), width=3)
    d.rectangle((32, 32, W - 32, H - 32), outline=(30, 72, 104), width=1)
    d.text((60, 52), title, font=font(46, True), fill=INK)
    d.text((62, 112), subtitle, font=font(20, mono=True), fill=MUTED)
    # title block
    tb = (W - 560, H - 150, W - 40, H - 40)
    d.rectangle(tb, fill=(6, 18, 36), outline=(46, 110, 150), width=2)
    d.text((tb[0] + 18, tb[1] + 12), "FLEXZONIC GAMES · HYPERNOVA CIRCUIT", font=font(17, True), fill=CYAN)
    d.text((tb[0] + 18, tb[1] + 40), f"BLUEPRINT SERIES v{SPEC['version']}  ·  UNITS: METRES", font=font(15, mono=True), fill=INK)
    d.text((tb[0] + 18, tb[1] + 64), "+Y UP · VEHICLES FACE +Z · ROAD Y = 0", font=font(15, mono=True), fill=MUTED)
    d.text((tb[0] + 18, tb[1] + 88), f"PLATE {plate:02d} / {total:02d}", font=font(15, mono=True), fill=PINK)
    return img, d


def frame(d, box, label, sub=""):
    x0, y0, x1, y1 = box
    d.rectangle(box, outline=(40, 96, 132), width=2)
    d.rectangle((x0, y0, x0 + 14 + d.textlength(label, font=font(17, True)) + 14, y0 + 32), fill=(10, 34, 60))
    d.text((x0 + 14, y0 + 6), label, font=font(17, True), fill=INK)
    if sub:
        d.text((x0 + 14, y1 - 26), sub, font=font(13, mono=True), fill=MUTED)


def paste(img, render, box):
    rgb, alpha, info = render
    x0, y0, x1, y1 = box
    img.paste(rgb, (x0, y0), alpha)
    return info


def project(info, box, point):
    x0, y0, x1, y1 = box
    p = np.array(point, float)
    sx = (p @ info["right"] - info["centre"][0]) * info["scale"] + (x1 - x0) / 2 + x0
    sy = -(p @ info["up"] - info["centre"][1]) * info["scale"] + (y1 - y0) / 2 + y0
    return sx, sy


def dim_line(d, a, b, text, offset=(0, 0), colour=PINK):
    ax, ay = a[0] + offset[0], a[1] + offset[1]
    bx, by = b[0] + offset[0], b[1] + offset[1]
    d.line((a[0], a[1], ax, ay), fill=(120, 60, 110), width=1)
    d.line((b[0], b[1], bx, by), fill=(120, 60, 110), width=1)
    d.line((ax, ay, bx, by), fill=colour, width=2)
    ang = math.atan2(by - ay, bx - ax)
    for (px, py), s in (((ax, ay), 1), ((bx, by), -1)):
        for da in (.45, -.45):
            d.line((px, py, px + s * 12 * math.cos(ang + da), py + s * 12 * math.sin(ang + da)), fill=colour, width=2)
    mx, my = (ax + bx) / 2, (ay + by) / 2
    f = font(16, True)
    tw = d.textlength(text, font=f)
    d.rectangle((mx - tw / 2 - 6, my - 12, mx + tw / 2 + 6, my + 12), fill=BG)
    d.text((mx - tw / 2, my - 10), text, font=f, fill=colour)


def six_view_plate(key, plate, total):
    asset = SPEC["assets"][key]
    lo, hi = np.array(asset["bounds"]["min"]), np.array(asset["bounds"]["max"])
    size = hi - lo
    img, d = background(asset["title"].upper(), f"SIX-SIDE ORTHOGRAPHIC · {asset['notes']}", plate, total)
    boxes = {"LEFT": (60, 170, 1040, 600), "RIGHT": (1060, 170, 2040, 600),
             "FRONT": (60, 620, 540, 1060), "REAR": (560, 620, 1040, 1060),
             "TOP": (1060, 620, 2040, 1060), "UNDERSIDE": (60, 1080, 1040, 1500)}
    # Plan views run nose-right, like the side views.
    # A shared scale keeps every view comparable.
    scale = min(800 / size[2], 340 / max(size[1], .5), 380 / size[0])
    infos = {}
    for view, box in boxes.items():
        bw, bh = box[2] - box[0], box[3] - box[1]
        r = raster(key, view, (bw, bh), scale=scale)
        infos[view] = paste(img, r, box)
        frame(d, box, view, {"LEFT": "PORT SIDE (+X)", "RIGHT": "STARBOARD (−X)", "FRONT": "LOOKING −Z",
                             "REAR": "LOOKING +Z", "TOP": "PLAN (+Y)", "UNDERSIDE": "HOVER PADS (−Y)"}[view])
    # dimensions
    b = boxes["LEFT"]
    i = infos["LEFT"]
    p1, p2 = project(i, b, [hi[0], lo[1], lo[2]]), project(i, b, [hi[0], lo[1], hi[2]])
    dim_line(d, p1, p2, f"LENGTH {size[2]:.2f} m", (0, 34))
    p1, p2 = project(i, b, [hi[0], lo[1], lo[2]]), project(i, b, [hi[0], hi[1], lo[2]])
    dim_line(d, p1, p2, f"{size[1]:.2f}", (60, 0))
    b = boxes["FRONT"]
    i = infos["FRONT"]
    p1, p2 = project(i, b, [lo[0], lo[1], hi[2]]), project(i, b, [hi[0], lo[1], hi[2]])
    dim_line(d, p1, p2, f"WIDTH {size[0]:.2f} m", (0, 30))
    b = boxes["TOP"]
    i = infos["TOP"]
    p1, p2 = project(i, b, [lo[0], hi[1], hi[2]]), project(i, b, [hi[0], hi[1], hi[2]])
    dim_line(d, p1, p2, f"{size[0]:.2f}", (50, 0))
    p1, p2 = project(i, b, [lo[0], hi[1], lo[2]]), project(i, b, [lo[0], hi[1], hi[2]])
    dim_line(d, p1, p2, f"{size[2]:.2f} m", (0, 26))
    # spec table
    tb = (1060, 1080, 2040, 1400)
    d.rectangle(tb, outline=(40, 96, 132), width=2)
    d.text((tb[0] + 18, tb[1] + 14), "PART SCHEDULE", font=font(18, True), fill=CYAN)
    names = []
    for p in asset["parts"]:
        base = p["name"].rstrip("LR") if p["name"][-1:] in "LR" and p["name"][:-1] in [q["name"][:-1] for q in asset["parts"] if q is not p] else p["name"]
        if base not in [n for n, _ in names]:
            names.append((base, p["material"]))
    cols = 3
    for k, (n, m) in enumerate(names):
        cx = tb[0] + 18 + (k % cols) * 320
        cy = tb[1] + 50 + (k // cols) * 24
        if cy > tb[3] - 24:
            break
        swatch = tuple(int(c * 255) for c in hex_rgb(asset["materials"][m]["color"]))
        d.rectangle((cx, cy + 3, cx + 14, cy + 17), fill=swatch, outline=INK)
        d.text((cx + 22, cy), f"{n}", font=font(15, mono=True), fill=INK)
        d.text((cx + 22 + d.textlength(n, font=font(15, mono=True)) + 8, cy), m, font=font(13, mono=True), fill=MUTED)
    tris = sum(len(p["indices"]) // 3 for p in asset["parts"])
    d.text((60, H - 52), f"{len(asset['parts'])} parts · {tris} triangles · bounding box {size[0]:.2f} × {size[1]:.2f} × {size[2]:.2f} m",
           font=font(16, mono=True), fill=MUTED)
    return img


def quarter_plate(plate, total):
    img, d = background("FLEET · QUARTER VIEWS", "ALL FOUR HOVERCARS AT 45° AZIMUTH / 20° ELEVATION · SAME SCALE", plate, total)
    cars = ["pulse", "vortex", "solar", "prism"]
    views = ["FRONT LEFT", "FRONT RIGHT", "REAR LEFT", "REAR RIGHT"]
    cw, ch = 490, 292
    for r, key in enumerate(cars):
        for c, view in enumerate(views):
            box = (60 + c * (cw + 5), 170 + r * (ch + 5), 60 + c * (cw + 5) + cw, 170 + r * (ch + 5) + ch)
            paste(img, raster(key, view, (cw, ch), scale=72), box)
            frame(d, box, view if r == 0 or c == 0 else view,
                  SPEC["assets"][key]["title"] if c == 0 else "")
    return img


def props_plate(plate, total):
    img, d = background("HAZARDS · PICKUPS · TRACK FURNITURE",
                        "ENCOUNTER ASSETS SHARED BY GRAND PRIX AND ENDLESS STORM · HERO + FRONT + TOP", plate, total)
    keys = ["barrier", "mine", "drone", "coin", "nitro", "repair", "boostPad", "gate"]
    cw, ch = 980, 320
    for k, key in enumerate(keys):
        col, row = k % 2, k // 2
        box = (60 + col * (cw + 20), 160 + row * (ch + 12), 60 + col * (cw + 20) + cw, 160 + row * (ch + 12) + ch)
        asset = SPEC["assets"][key]
        lo, hi = np.array(asset["bounds"]["min"]), np.array(asset["bounds"]["max"])
        sz = hi - lo
        frame(d, box, asset["title"].upper(), f"{sz[0]:.2f} W × {sz[1]:.2f} H × {sz[2]:.2f} L m · {asset['notes'][:70]}")
        subs = [("HERO", (box[0] + 10, box[1] + 36, box[0] + 440, box[3] - 30)),
                ("FRONT", (box[0] + 450, box[1] + 36, box[0] + 710, box[3] - 30)),
                ("TOP", (box[0] + 720, box[1] + 36, box[2] - 10, box[3] - 30))]
        for view, sb in subs:
            r = raster(key, view, (sb[2] - sb[0], sb[3] - sb[1]))
            paste(img, r, sb)
            d.text((sb[0] + 4, sb[3] - 18), view, font=font(12, mono=True), fill=MUTED)
    return img


def main():
    from render_circuits import circuit_plate, cross_section_plate
    plates = [lambda p, t, k=k: six_view_plate(k, p, t) for k in ("pulse", "vortex", "solar", "prism")]
    plates += [quarter_plate, props_plate,
               lambda p, t: circuit_plate([0, 1, 2], p, t), lambda p, t: circuit_plate([3, 4, 5], p, t),
               cross_section_plate]
    names = ["01-pulse-gt-six-view", "02-vortex-r9-six-view", "03-solar-wraith-six-view",
             "04-prism-titan-six-view", "05-fleet-quarter-views", "06-hazards-pickups-track",
             "07-circuit-plans-1", "08-circuit-plans-2", "09-raceway-cross-section"]
    total = len(plates)
    for n, fn in enumerate(plates, 1):
        img = fn(n, total)
        path = OUT / f"{names[n-1]}.png"
        img.save(path, optimize=True)
        print(path)


if __name__ == "__main__":
    import sys
    only = sys.argv[1:]
    if only:
        # quick preview of single assets: python3 render_blueprints.py pulse
        for k in only:
            six_view_plate(k, 1, 1).save(OUT / f"preview-{k}.png")
            print("preview", k)
    else:
        main()
