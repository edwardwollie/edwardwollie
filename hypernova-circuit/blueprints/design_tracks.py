"""Grand Prix circuit recipe: writes app/game/track-spec.json.

Each circuit is a closed Catmull-Rom loop through hand-placed control points
(x, z, elevation). It is resampled at equal arc length; the game reads those
samples directly, so the plan plates and the drivable road are identical.

World axes match three.js: X right, Y up, the start line faces -Z.
Bank > 0 lowers the right-hand side (into a right-hand bend).
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
STEP = 4.0
WIDTH = 18.0
BRIDGE_CLEARANCE = 9.0

TRACKS = [
    {
        "id": "neon-grandway", "name": "Neon Megacity Grandway", "theme": 0, "laps": 3,
        "blurb": "Skyline straights, a harbour hairpin and the tunnel under Tower Row.",
        "points": [(0, 60, 0), (0, -260, 0), (10, -420, 4), (90, -540, 8), (230, -590, 10), (380, -560, 10),
                   (450, -470, 8), (420, -370, 6), (330, -300, 4), (320, -210, 4), (420, -150, 6), (560, -130, 8),
                   (650, -40, 8), (640, 90, 6), (560, 190, 4), (400, 230, 2), (240, 230, 0), (110, 210, 0),
                   (30, 160, 0)],
        "tunnels": [(0.62, 0.70)],
        "hazards": 0,
    },
    {
        "id": "solar-rift", "name": "Solar Rift Canyon", "theme": 1, "laps": 3,
        "blurb": "Long canyon arcs that climb 40 m to the Rift Crest and dive back to the floor.",
        "points": [(0, 80, 0), (0, -240, 4), (-40, -460, 14), (-160, -640, 26), (-340, -720, 36), (-540, -680, 40),
                   (-660, -540, 36), (-650, -360, 28), (-540, -250, 20), (-480, -110, 14), (-560, 40, 10),
                   (-540, 220, 6), (-400, 320, 3), (-220, 330, 0), (-80, 260, 0)],
        "tunnels": [(0.33, 0.39)],
        "hazards": 1,
    },
    {
        "id": "prism-glacier", "name": "Prism Glacier Run", "theme": 2, "laps": 3,
        "blurb": "Technical switchbacks across the ice shelf. Brake early, carry the drift.",
        "points": [(0, 60, 0), (0, -200, 2), (60, -330, 6), (190, -360, 10), (280, -290, 12), (260, -170, 12),
                   (330, -80, 14), (460, -110, 16), (560, -220, 18), (690, -230, 18), (770, -120, 14),
                   (740, 30, 10), (620, 120, 8), (480, 110, 6), (380, 180, 4), (270, 270, 2), (130, 260, 0),
                   (40, 180, 0)],
        "tunnels": [],
        "hazards": 2,
    },
    {
        "id": "quantum-void", "name": "Quantum Void Spiral", "theme": 3, "laps": 3,
        "blurb": "A figure-eight in deep space. The Void Bridge crosses 12 m above the lower loop.",
        "points": "lemniscate",
        "tunnels": [],
        "hazards": 2,
    },
    {
        "id": "ion-causeway", "name": "Verdant Ion Causeway", "theme": 4, "laps": 3,
        "blurb": "Flat-out causeways and flowing esses through the bioluminescent wetlands.",
        "points": [(0, 60, 0), (0, -380, 0), (40, -560, 2), (180, -660, 4), (360, -650, 6), (460, -540, 6),
                   (440, -400, 4), (540, -300, 4), (660, -300, 6), (760, -200, 8), (760, 0, 8), (680, 140, 6),
                   (520, 200, 4), (400, 120, 2), (280, 180, 2), (160, 260, 0), (50, 200, 0)],
        "tunnels": [(0.86, 0.91)],
        "hazards": 1,
    },
    {
        "id": "nova-foundry", "name": "Nova Foundry Circuit", "theme": 5, "laps": 3,
        "blurb": "Industrial chicanes, the furnace tunnel and a rival pack that never lifts.",
        "points": [(0, 60, 0), (0, -220, 0), (30, -320, 2), (120, -350, 4), (170, -430, 6), (140, -540, 8),
                   (220, -620, 10), (360, -610, 10), (430, -510, 8), (420, -380, 6), (500, -300, 6),
                   (520, -160, 6), (440, -60, 4), (450, 70, 4), (380, 190, 2), (240, 220, 0), (120, 230, 0),
                   (40, 170, 0)],
        "tunnels": [(0.12, 0.2), (0.6, 0.66)],
        "hazards": 3,
    },
]


def lemniscate_points(count=28):
    """Figure-eight control points; the bridge leg (t = 0) is 12 m above the
    lower leg (t = pi). Sample 0 sits on the run-up to the lower crossing."""
    pts = []
    for k in range(count):
        t = math.pi - 0.55 + k * math.tau / count
        pts.append((round(500 * math.sin(t), 1), round(330 * math.sin(2 * t), 1), round(6 + 6 * math.cos(t), 2)))
    return pts


def catmull_rom_loop(points, per_segment=60):
    p = np.array(points, float)
    n = len(p)
    out = []
    for i in range(n):
        p0, p1, p2, p3 = p[(i - 1) % n], p[i], p[(i + 1) % n], p[(i + 2) % n]
        for k in range(per_segment):
            t = k / per_segment
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
                              (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    return np.array(out)


def resample(dense):
    closed = np.vstack([dense, dense[:1]])
    seg = np.linalg.norm(np.diff(closed[:, [0, 2]], axis=0), axis=1)
    cum = np.concatenate([[0], np.cumsum(seg)])
    length = cum[-1]
    count = int(round(length / STEP))
    targets = np.arange(count) * (length / count)
    res = np.stack([np.interp(targets, cum, closed[:, k]) for k in range(3)], axis=1)
    return res, length


def smooth_loop(values, radius):
    n = len(values)
    kernel = np.ones(2 * radius + 1) / (2 * radius + 1)
    padded = np.concatenate([values[-radius:], values, values[:radius]])
    return np.convolve(padded, kernel, mode="valid")[:n]


def analyse(samples, length):
    n = len(samples)
    step = length / n
    nxt = np.roll(samples, -1, axis=0)
    prv = np.roll(samples, 1, axis=0)
    tan = nxt - prv
    heading = np.arctan2(tan[:, 0], -tan[:, 2])  # 0 = facing -Z, positive turns right
    dh = np.angle(np.exp(1j * (np.roll(heading, -2) - np.roll(heading, 2))))
    curvature = dh / (4 * step)
    curvature = smooth_loop(curvature, 2)
    bank = np.clip(smooth_loop(curvature * 30, 6), -0.3, 0.3)
    grade = (nxt[:, 1] - prv[:, 1]) / (2 * step)
    return heading, curvature, bank, grade


def clearance(samples, length):
    """Every pair of road samples far apart along the lap must be either
    laterally separated or stacked by at least BRIDGE_CLEARANCE metres."""
    n = len(samples)
    step = length / n
    worst = 1e9
    crossings = 0
    xz = samples[:, [0, 2]]
    for i in range(n):
        d = np.linalg.norm(xz - xz[i], axis=1)
        gap = np.minimum(np.abs(np.arange(n) - i), n - np.abs(np.arange(n) - i)) * step
        close = (gap > 80) & (d < WIDTH + 14)
        if close.any():
            dy = np.abs(samples[close, 1] - samples[i, 1]).min()
            worst = min(worst, dy)
            crossings += 1
    return worst, crossings


def features(track, samples, length, curvature):
    n = len(samples)
    step = length / n
    rng = np.random.default_rng(abs(hash(track["id"])) % (2 ** 32) if False else sum(map(ord, track["id"])))
    straight = np.abs(curvature) < 1 / 420
    # Boost pads: the middle of every straight that lasts at least 140 m.
    pads, coins, items, hazards = [], [], [], []
    run = 0
    lane_cycle = [-4.5, 0.0, 4.5]
    for i in range(2 * n):
        k = i % n
        if straight[k]:
            run += 1
        else:
            if run * step >= 140 and i - run // 2 >= 0:
                mid = (i - run // 2) % n
                s = mid * step
                if all(min(abs(s - p["s"]), length - abs(s - p["s"])) > 200 for p in pads) and s > 120:
                    pads.append({"s": round(s, 1), "d": lane_cycle[len(pads) % 3]})
            run = 0
    # Coin lines on the inside of bends (the racing line apex), 7 coins each.
    i = 30
    while i < n - 20:
        if abs(curvature[i]) > 1 / 260:
            side = 1 if curvature[i] > 0 else -1
            coins.append({"s": round(i * step - 24, 1), "d": round(side * 4.8, 1), "count": 7, "spacing": 8})
            i += 60
        else:
            i += 4
    # Pickups every ~550 m, alternating nitro / repair.
    for k, s in enumerate(np.arange(380, length - 150, 550)):
        items.append({"s": round(float(s), 1), "d": float(rng.choice([-5.0, 0.0, 5.0])),
                      "kind": "nitro" if k % 3 != 2 else "repair"})
    # Hazards: later circuits place mines / barriers that block one side of a straight.
    kinds = ["mine", "barrier", "drone"]
    for k in range(track["hazards"] * 3):
        s = length * (0.18 + 0.7 * (k + rng.random() * 0.5) / max(1, track["hazards"] * 3))
        idx = int(s / step) % n
        if abs(curvature[idx]) > 1 / 180:
            continue
        hazards.append({"s": round(float(s), 1), "d": float(rng.choice([-5.5, 5.5])), "kind": kinds[k % 3]})
    return pads, coins, items, hazards


def main():
    out = {"version": "3.0.0", "step": STEP, "width": WIDTH, "tracks": []}
    for track in TRACKS:
        if track["points"] == "lemniscate":
            track["points"] = lemniscate_points()
        dense = catmull_rom_loop([(x, y, z) for x, z, y in track["points"]])
        samples, length = resample(dense)
        samples[:, 1] = smooth_loop(samples[:, 1], 8)
        heading, curvature, bank, grade = analyse(samples, length)
        worst, crossings = clearance(samples, length)
        min_radius = 1 / max(1e-6, np.abs(curvature).max())
        pads, coins, items, hazards = features(track, samples, length, curvature)
        print(f"{track['id']:14s} {length:7.0f} m  samples {len(samples):4d}  min radius {min_radius:5.0f} m  "
              f"max grade {np.abs(grade).max()*100:4.1f}%  climb {samples[:,1].max()-samples[:,1].min():4.0f} m  "
              f"pads {len(pads)} coins {len(coins)} items {len(items)} hazards {len(hazards)}  "
              f"close passes {crossings} (min dy {worst if crossings else 0:.1f})")
        if crossings:
            assert worst >= BRIDGE_CLEARANCE, f"{track['id']} crosses itself without bridge clearance"
        assert min_radius >= 40, f"{track['id']} has a bend tighter than 40 m"
        assert np.abs(grade).max() < 0.14
        out["tracks"].append({
            "id": track["id"], "name": track["name"], "theme": track["theme"], "laps": track["laps"],
            "blurb": track["blurb"], "length": round(float(length), 2),
            "minRadius": round(float(min_radius), 1),
            "climb": round(float(samples[:, 1].max() - samples[:, 1].min()), 1),
            "points": [round(float(v), 2) for v in samples.reshape(-1)],
            "bank": [round(float(v), 3) for v in bank],
            "tunnels": [[round(a * length, 1), round(b * length, 1)] for a, b in track["tunnels"]],
            "checkpoints": [round(length * q / 4, 1) for q in range(4)],
            "boostPads": pads, "coinLines": coins, "items": items, "hazards": hazards,
            "controlPoints": track["points"],
        })
    path = ROOT / "app/game/track-spec.json"
    path.write_text(json.dumps(out, separators=(",", ":")))
    print(path, f"{path.stat().st_size/1024:.0f} KB")


if __name__ == "__main__":
    main()
