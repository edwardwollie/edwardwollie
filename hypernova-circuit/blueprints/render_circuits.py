"""Circuit plan and raceway cross-section plates (07-09).

Plans are drawn from the same resampled centreline the game drives on
(app/game/track-spec.json), with the 18 m road width to scale.
"""
from __future__ import annotations

import json
import math

import numpy as np
from PIL import ImageDraw

from render_blueprints import (BG, CYAN, INK, MUTED, PINK, ROOT, background, dim_line, font, frame, paste,
                               project, raster)

TRACKS = json.loads((ROOT / "app/game/track-spec.json").read_text())
WIDTH = TRACKS["width"]
THEME_RAIL = ["#19e6ff", "#ff8a1f", "#68d9ff", "#c45cff", "#56ffae", "#ff5d3a"]


def lerp_colour(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def track_arrays(track):
    p = np.array(track["points"], float).reshape(-1, 3)
    return p


def plan(d: ImageDraw.ImageDraw, track, box):
    x0, y0, x1, y1 = box
    p = track_arrays(track)
    n = len(p)
    length = track["length"]
    step = length / n
    minx, maxx, minz, maxz = p[:, 0].min(), p[:, 0].max(), p[:, 2].min(), p[:, 2].max()
    pad = 40
    scale = min((x1 - x0 - 2 * pad) / (maxx - minx), (y1 - y0 - 2 * pad - 30) / (maxz - minz))
    ox = x0 + (x1 - x0 - (maxx - minx) * scale) / 2
    oy = y0 + 30 + (y1 - y0 - 30 - (maxz - minz) * scale) / 2

    def to(x, z):
        return ox + (x - minx) * scale, oy + (z - minz) * scale

    # Direction-aware lateral offsets for the road edges.
    nxt = np.roll(p, -1, axis=0)
    prv = np.roll(p, 1, axis=0)
    tan = nxt - prv
    tan[:, 1] = 0
    tan /= np.linalg.norm(tan, axis=1, keepdims=True)
    right = np.stack([-tan[:, 2], np.zeros(n), tan[:, 0]], axis=1)
    ymin, ymax = p[:, 1].min(), p[:, 1].max()
    low, high = (40, 120, 200), (255, 79, 196)
    # Draw lower samples first so bridges overlay the road beneath.
    order = np.argsort(p[:, 1])
    for i in order:
        j = (i + 1) % n
        t = (p[i, 1] - ymin) / max(1e-6, ymax - ymin)
        c = lerp_colour(low, high, t)
        quad = [to(*(p[i] + right[i] * -WIDTH / 2)[[0, 2]]), to(*(p[i] + right[i] * WIDTH / 2)[[0, 2]]),
                to(*(p[j] + right[j] * WIDTH / 2)[[0, 2]]), to(*(p[j] + right[j] * -WIDTH / 2)[[0, 2]])]
        d.polygon(quad, fill=c)
        for side in (-1, 1):
            a = to(*(p[i] + right[i] * side * (WIDTH / 2 + 0.7))[[0, 2]])
            b = to(*(p[j] + right[j] * side * (WIDTH / 2 + 0.7))[[0, 2]])
            d.line((a, b), fill=INK, width=1)
    # Tunnels
    for a, b in track["tunnels"]:
        ia, ib = int(a / step), int(b / step)
        pts = [to(p[k % n, 0], p[k % n, 2]) for k in range(ia, ib + 1)]
        d.line(pts, fill=(255, 255, 255), width=9)
        d.line(pts, fill=(20, 30, 50), width=5)
        mid = pts[len(pts) // 2]
        d.text((mid[0] + 10, mid[1] - 8), "TUNNEL", font=font(12, True), fill=INK)
    # Checkpoints and start/finish
    for k, s in enumerate(track["checkpoints"]):
        i = int(s / step) % n
        a = to(*(p[i] + right[i] * -WIDTH * 0.9)[[0, 2]])
        b = to(*(p[i] + right[i] * WIDTH * 0.9)[[0, 2]])
        d.line((a, b), fill=(255, 255, 255) if k == 0 else CYAN, width=5 if k == 0 else 3)
        label = "START / FINISH" if k == 0 else f"CP{k}"
        d.text((b[0] + 6, b[1] - 8), label, font=font(13 if k == 0 else 11, True), fill=INK if k == 0 else CYAN)
    # Direction arrow after the start line
    i = int(60 / step)
    a = to(p[i, 0], p[i, 2])
    b = to(p[i + 8, 0], p[i + 8, 2])
    ang = math.atan2(b[1] - a[1], b[0] - a[0])
    for da in (2.6, -2.6):
        d.line((b, (b[0] + 14 * math.cos(ang + da), b[1] + 14 * math.sin(ang + da))), fill=(255, 255, 255), width=3)
    d.line((a, b), fill=(255, 255, 255), width=3)
    # Boost pads, items and hazards
    for pad in track["boostPads"]:
        i = int(pad["s"] / step) % n
        c = to(*(p[i] + right[i] * pad["d"])[[0, 2]])
        d.polygon([(c[0], c[1] - 7), (c[0] + 7, c[1]), (c[0], c[1] + 7), (c[0] - 7, c[1])], fill=CYAN, outline=INK)
    for item in track["items"]:
        i = int(item["s"] / step) % n
        c = to(*(p[i] + right[i] * item["d"])[[0, 2]])
        col = (25, 230, 255) if item["kind"] == "nitro" else (168, 255, 62)
        d.ellipse((c[0] - 4, c[1] - 4, c[0] + 4, c[1] + 4), fill=col)
    for hz in track["hazards"]:
        i = int(hz["s"] / step) % n
        c = to(*(p[i] + right[i] * hz["d"])[[0, 2]])
        d.rectangle((c[0] - 4, c[1] - 4, c[0] + 4, c[1] + 4), fill=(255, 23, 111), outline=INK)
    for line in track["coinLines"]:
        i = int(line["s"] / step) % n
        c = to(*(p[i] + right[i] * line["d"])[[0, 2]])
        d.ellipse((c[0] - 3, c[1] - 3, c[0] + 3, c[1] + 3), fill=(255, 216, 77))
    # Scale bar (200 m) and north arrow (-Z is up the page? +Z is down)
    sx, sy = x0 + 18, y1 - 26
    d.line((sx, sy, sx + 200 * scale, sy), fill=INK, width=3)
    for k in range(5):
        d.line((sx + k * 50 * scale, sy - 5, sx + k * 50 * scale, sy + 5), fill=INK, width=2)
    d.text((sx, sy - 22), "200 m", font=font(12, mono=True), fill=INK)
    return scale


def profile(d, track, box, rail):
    x0, y0, x1, y1 = box
    p = track_arrays(track)
    n = len(p)
    ys = p[:, 1]
    lo, hi = min(0, ys.min()), max(ys.max(), 10)
    d.rectangle(box, outline=(40, 96, 132), width=1)
    pts = []
    for i in range(n + 1):
        y = ys[i % n]
        pts.append((x0 + (x1 - x0) * i / n, y1 - 8 - (y - lo) / (hi - lo) * (y1 - y0 - 22)))
    d.line(pts, fill=rail, width=3)
    for a, b in track["tunnels"]:
        xa = x0 + (x1 - x0) * a / track["length"]
        xb = x0 + (x1 - x0) * b / track["length"]
        d.rectangle((xa, y0 + 2, xb, y0 + 10), fill=(90, 100, 130))
    d.text((x0 + 6, y0 + 2), f"ELEVATION {lo:.0f}–{hi:.0f} m", font=font(11, mono=True), fill=MUTED)
    for q in range(1, 4):
        x = x0 + (x1 - x0) * q / 4
        d.line((x, y0, x, y1), fill=(30, 70, 100), width=1)


def circuit_plate(indices, plate, total):
    names = " · ".join(TRACKS["tracks"][i]["name"].upper() for i in indices)
    img, d = background("GRAND PRIX CIRCUIT PLANS", f"PLAN VIEW TO SCALE · 18 m RACEWAY · ROAD SHADED BY ELEVATION (BLUE LOW → PINK HIGH)", plate, total)
    cw = (W_ := 2100 - 120 - 40) // 3
    for k, i in enumerate(indices):
        t = TRACKS["tracks"][i]
        bx = 60 + k * (cw + 20)
        box = (bx, 160, bx + cw, 1110)
        frame(d, box, f"ROUND {i + 1} · {t['name'].upper()}")
        plan(d, t, (box[0], box[1] + 10, box[2], box[3] - 10))
        prof = (bx, 1130, bx + cw, 1300)
        profile(d, t, prof, tuple(int(THEME_RAIL[t["theme"]][j:j + 2], 16) for j in (1, 3, 5)))
        facts = [f"LAP {t['length'] / 1000:.3f} km  ·  {t['laps']} LAPS  ·  {t['laps'] * t['length'] / 1000:.2f} km RACE",
                 f"TIGHTEST BEND R {t['minRadius']:.0f} m  ·  CLIMB {t['climb']:.0f} m",
                 f"{len(t['boostPads'])} WARP PADS · {len(t['coinLines'])} COIN LINES · {len(t['items'])} PICKUPS · {len(t['hazards'])} HAZARDS",
                 f"TUNNELS {len(t['tunnels'])}  ·  {t['blurb'][:46]}…"]
        for r, line in enumerate(facts):
            d.text((bx + 6, 1312 + r * 22), line, font=font(14, mono=True), fill=INK if r == 0 else MUTED)
    # legend
    lx, ly = 60, H_ - 64 if (H_ := 1560) else 0
    items = [((25, 230, 255), "◆ WARP PAD"), ((255, 216, 77), "● COIN LINE"), ((25, 230, 255), "● NITRO"),
             ((168, 255, 62), "● REPAIR"), ((255, 23, 111), "■ HAZARD"), ((255, 255, 255), "━ START / CP")]
    for k, (c, label) in enumerate(items):
        d.text((lx + k * 190, ly), label, font=font(15, True), fill=c)
    return img


def cross_section_plate(plate, total):
    img, d = background("RACEWAY CROSS-SECTION · GATES · GRID",
                        "SECTION THROUGH THE 18 m ROAD, ENERGY BARRIERS, KERBS, TUNNEL ARCH AND VIADUCT · CHECKPOINT ARCH FROM THE BLUEPRINT",
                        plate, total)
    box = (60, 160, 1240, 900)
    frame(d, box, "SECTION A-A · LOOKING ALONG THE RACING DIRECTION")
    s = 50  # px per metre
    cx, cy = (box[0] + box[2]) / 2, 560
    W = WIDTH / 2

    def P(x, y):
        return cx + x * s, cy - y * s
    R = W + 1.6
    arch = [P(math.cos(a) * R, math.sin(a) * R * 0.62 + 0.2) for a in np.linspace(0, math.pi, 40)]
    d.line(arch, fill=(120, 140, 170), width=3)
    d.text(P(-2.2, R * 0.62 + 0.6), "TUNNEL ARCH (TUNNEL SECTIONS)", font=font(13, True), fill=MUTED)
    d.polygon([P(-W - 0.9, 0), P(W + 0.9, 0), P(W + 0.9, -1.4), P(-W - 0.9, -1.4)], fill=(14, 20, 34), outline=INK)
    d.rectangle((*P(-W, 0.05), *P(W, 0)), fill=(36, 40, 70))
    for side in (-1, 1):
        x0, x1 = sorted((side * (W + 0.1), side * (W + 0.7)))
        d.rectangle((*P(x0, 1.25), *P(x1, 0)), fill=(30, 40, 62), outline=INK)
        d.rectangle((*P(x0 - 0.02, 1.32), *P(x1 + 0.02, 1.25)), fill=CYAN)
        k0, k1 = sorted((side * (W - 1.4), side * W))
        d.rectangle((*P(k0, 0.09), *P(k1, 0.0)), fill=PINK)
    for lx in (-W / 3, W / 3):
        d.rectangle((*P(lx - 0.08, 0.06), *P(lx + 0.08, 0)), fill=INK)
    # pillar
    d.polygon([P(-W + 1.9, -1.4), P(-W + 4.1, -1.4), P(-W + 4.5, -5), P(-W + 1.5, -5)], fill=(22, 27, 44), outline=MUTED)
    d.text(P(-W + 4.8, -4.6), "VIADUCT PILLAR Ø2.2–3.0 m (WHERE ROAD > 1.5 m UP)", font=font(13, True), fill=MUTED)
    # car silhouettes from blueprint (front view) to scale
    for x, key in ((-4.2, "pulse"), (4.2, "prism")):
        r = raster(key, "FRONT", (int(3.4 * s), int(2.2 * s)), scale=s)
        bx, by = P(x, 0)
        img.paste(r[0], (int(bx - 1.7 * s), int(by - 2.2 * s * 0.5 - 1.1 * s + 4)), r[1])
    dim_line(d, P(-W, 0), P(W, 0), f"ROAD {WIDTH:.0f} m", (0, 95))
    dim_line(d, P(-W, 0), P(-W + 1.4, 0), "KERB 1.4", (0, 60))
    dim_line(d, P(W + 0.7, 0), P(W + 0.7, 1.25), "1.25", (40, 0))
    dim_line(d, P(-W / 3, 0), P(W / 3, 0), "LANES 6 m", (0, 140))
    dim_line(d, P(0, 0.2), P(0, R * 0.62 + 0.2), f"{R*0.62:.1f} m", (0, 0))
    d.text((1140, 1140), "ENGINEERING NOTES", font=font(18, True), fill=CYAN)
    notes = ["Barriers stop the car centre at ±(9.0 − 1.15 − 0.35) = 7.5 m.",
             "Bank = clamp(30·k, ±0.30 rad), smoothed over 48 m.",
             "Road sampled every 4 m; the game reads track-spec.json.",
             "Bridge clearance ≥ 9 m is asserted by design_tracks.py."]
    for k, line in enumerate(notes):
        d.text((1140, 1180 + k * 26), line, font=font(14, mono=True), fill=MUTED)
    gate = (1260, 160, 2040, 900)
    frame(d, gate, "CHECKPOINT / START ARCH · FRONT")
    info = paste(img, raster("gate", "FRONT", (gate[2] - gate[0], gate[3] - gate[1] - 40)), (gate[0], gate[1] + 30, gate[2], gate[3] - 10))
    grid_box = (60, 920, 2040, 1400)
    frame(d, grid_box, "STARTING GRID · 8 CARS · 2 × 4 · 9 m ROWS · PLAYER STARTS 6TH")
    gs = 18
    gx, gy = grid_box[0] + 120, (grid_box[1] + grid_box[3]) / 2 + 10
    d.rectangle((gx - 20, gy - W * gs, gx + 52 * gs, gy + W * gs), fill=(20, 24, 44), outline=INK)
    d.rectangle((gx + 48 * gs, gy - W * gs, gx + 49 * gs, gy + W * gs), fill=INK)
    d.text((gx + 49.5 * gs, gy - W * gs - 24), "START LINE", font=font(14, True), fill=INK)
    for slot in range(8):
        row = slot // 2
        dist = 10 + row * 9
        lat = -4.2 if slot % 2 == 0 else 4.2
        x = gx + (48 - dist) * gs
        y = gy + lat * gs
        car = "pulse" if slot == 5 else ["solar", "vortex", "prism", "pulse", "vortex", None, "solar", "pulse"][slot]
        r = raster(car, "TOP", (int(5.4 * gs), int(3.4 * gs)), scale=gs)
        img.paste(r[0], (int(x - 2.7 * gs), int(y - 1.7 * gs)), r[1])
        d.text((x - 8, y - 2.4 * gs - 4), f"P{slot + 1}" + (" YOU" if slot == 5 else ""), font=font(13, True), fill=PINK if slot == 5 else MUTED)
    return img
