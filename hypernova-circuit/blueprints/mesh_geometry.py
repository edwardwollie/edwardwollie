"""Indexed triangle primitives for the Hypernova blueprint pipeline.

Every primitive returns (vertices Nx3, faces Mx3) in metres. Faces are wound
counter-clockwise seen from outside, which is three.js' front-face convention.
`place()` bakes rotation, scale and translation into the vertices so a part in
blueprint-spec.json is already in model space: the game and the blueprint
renderer read exactly the same numbers.
"""
from __future__ import annotations

import math

import numpy as np
from scipy.spatial import ConvexHull


def _orient(verts, faces, centre_fn):
    out = []
    for a, b, c in faces:
        n = np.cross(verts[b] - verts[a], verts[c] - verts[a])
        mid = (verts[a] + verts[b] + verts[c]) / 3
        out.append([a, c, b] if np.dot(n, mid - centre_fn(mid, (a, b, c))) < 0 else [a, b, c])
    return out


def convex(points):
    verts = np.array(points, dtype=float)
    hull = ConvexHull(verts)
    centre = verts.mean(axis=0)
    faces = [list(map(int, s)) for s in hull.simplices]
    return verts, _orient(verts, faces, lambda m, t: centre)


def box(w, h, d, bevel=0.12):
    """Chamfered box centred on the origin."""
    b = min(w, h, d) * bevel
    pts = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                pts += [[sx * (w / 2 - b), sy * h / 2, sz * d / 2],
                        [sx * w / 2, sy * (h / 2 - b), sz * d / 2],
                        [sx * w / 2, sy * h / 2, sz * (d / 2 - b)]]
    return convex(pts)


def prism(outline, depth, bevel=0.0):
    """Extrude a convex XY outline along Z (fins, wings, chevrons)."""
    pts = []
    out = np.array(outline, float)
    c = out.mean(axis=0)
    for z, s in ((depth / 2, 1 - bevel), (depth / 2 - depth * bevel, 1),
                 (-depth / 2 + depth * bevel, 1), (-depth / 2, 1 - bevel)):
        for p in out:
            q = c + (p - c) * s
            pts.append([q[0], q[1], z])
    return convex(pts)


def _superellipse(w, h, n, t):
    c, s = math.cos(t), math.sin(t)
    e = 2 / max(n, 0.1)
    return w / 2 * math.copysign(abs(c) ** e, c), h / 2 * math.copysign(abs(s) ** e, s)


def loft(rings, segments=22, caps=True):
    """Smooth hull lofted along +Z through superellipse cross sections.

    Each ring is (z, width, height, y_centre, exponent[, x_centre]).
    """
    verts = []
    for ring in rings:
        z, w, h, yc, n = ring[:5]
        xc = ring[5] if len(ring) > 5 else 0.0
        for j in range(segments):
            x, y = _superellipse(w, h, n, j * math.tau / segments)
            verts.append([xc + x, yc + y, z])
    faces = []
    count = len(rings)
    for k in range(count - 1):
        for j in range(segments):
            a = k * segments + j
            b = k * segments + (j + 1) % segments
            c = (k + 1) * segments + j
            e = (k + 1) * segments + (j + 1) % segments
            faces += [[a, b, e], [a, e, c]]
    side = len(verts)
    centres = [np.array([r[5] if len(r) > 5 else 0.0, r[3], r[0]], float) for r in rings]
    if caps:
        for k in (0, count - 1):
            ci = len(verts)
            verts.append(list(centres[k]))
            for j in range(segments):
                a = k * segments + j
                b = k * segments + (j + 1) % segments
                faces.append([ci, a, b])
    verts = np.array(verts, float)
    zs = [r[0] for r in rings]
    direction = 1 if zs[-1] > zs[0] else -1

    def centre(mid, tri):
        if tri[0] >= side:  # cap fan
            k = 0 if tri[0] == side else count - 1
            sign = -direction if k == 0 else direction
            return mid - np.array([0, 0, sign], float)
        k = min(count - 1, tri[0] // segments)
        c = centres[k].copy()
        c[2] = mid[2]
        return c
    return verts, _orient(verts, faces, centre)


def cylinder(radius, length, segments=18, taper=1.0, bevel=0.1):
    """Cylinder along +Z centred on the origin; `taper` scales the +Z end."""
    b = min(radius, length) * bevel
    rings = [(-length / 2, radius * 2 * 0.86, radius * 2 * 0.86, 0, 2),
             (-length / 2 + b, radius * 2, radius * 2, 0, 2),
             (length / 2 - b, radius * 2 * taper, radius * 2 * taper, 0, 2),
             (length / 2, radius * 2 * taper * 0.86, radius * 2 * taper * 0.86, 0, 2)]
    return loft(rings, segments)


def torus(major, minor, rings=32, sides=10):
    """Torus in the XY plane (its axis is Z)."""
    verts = []
    for i in range(rings):
        a = i * math.tau / rings
        for j in range(sides):
            b = j * math.tau / sides
            r = major + minor * math.cos(b)
            verts.append([r * math.cos(a), r * math.sin(a), minor * math.sin(b)])
    faces = []
    for i in range(rings):
        for j in range(sides):
            a = i * sides + j
            b = ((i + 1) % rings) * sides + j
            c = i * sides + (j + 1) % sides
            e = ((i + 1) % rings) * sides + (j + 1) % sides
            faces += [[a, b, e], [a, e, c]]
    verts = np.array(verts, float)

    def centre(mid, tri):
        ang = math.atan2(mid[1], mid[0])
        return np.array([major * math.cos(ang), major * math.sin(ang), 0])
    return verts, _orient(verts, faces, centre)


def ellipsoid(w, h, d, rows=10, segments=18):
    verts = []
    for k in range(rows + 1):
        a = k * math.pi / rows
        for j in range(segments):
            t = j * math.tau / segments
            verts.append([w / 2 * math.sin(a) * math.cos(t), h / 2 * math.cos(a), d / 2 * math.sin(a) * math.sin(t)])
    faces = []
    for k in range(rows):
        for j in range(segments):
            a = k * segments + j
            b = k * segments + (j + 1) % segments
            c = (k + 1) * segments + j
            e = (k + 1) * segments + (j + 1) % segments
            faces += [[a, b, e], [a, e, c]]
    verts = np.array(verts, float)
    return verts, _orient(verts, faces, lambda m, t: np.zeros(3))


def octahedron(w, h, d):
    return convex([[w / 2, 0, 0], [-w / 2, 0, 0], [0, h / 2, 0], [0, -h / 2, 0], [0, 0, d / 2], [0, 0, -d / 2]])


def icosphere(radius, detail=1):
    t = (1 + 5 ** 0.5) / 2
    v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t],
         [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
    v = [list(np.array(p) / np.linalg.norm(p)) for p in v]
    f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2],
         [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5],
         [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]]
    for _ in range(detail):
        cache = {}

        def mid(a, b):
            key = (min(a, b), max(a, b))
            if key not in cache:
                p = (np.array(v[a]) + np.array(v[b])) / 2
                v.append(list(p / np.linalg.norm(p)))
                cache[key] = len(v) - 1
            return cache[key]
        nf = []
        for a, b, c in f:
            ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
            nf += [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]]
        f = nf
    verts = np.array(v, float) * radius
    return verts, _orient(verts, f, lambda m, t: np.zeros(3))


def rotation(rx=0.0, ry=0.0, rz=0.0):
    """Rotation matrix with three.js' default XYZ Euler order."""
    cx, sx = math.cos(rx), math.sin(rx)
    cy, sy = math.cos(ry), math.sin(ry)
    cz, sz = math.cos(rz), math.sin(rz)
    X = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Y = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Z = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return X @ Y @ Z


def place(mesh, pos=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), mirror_x=False):
    verts, faces = mesh
    v = np.array(verts, float) * np.array(scale, float)
    v = v @ rotation(*rot).T + np.array(pos, float)
    faces = [list(f) for f in faces]
    flips = (np.prod(np.sign(scale)) < 0) != mirror_x
    if mirror_x:
        v[:, 0] *= -1
    if flips:
        faces = [[a, c, b] for a, b, c in faces]
    return v, faces


def vertex_normals(verts, faces, flat):
    """Same normals three.js computeVertexNormals produces (area weighted).

    Flat parts are un-welded first, exactly like BufferGeometry.toNonIndexed().
    """
    verts = np.asarray(verts, float)
    faces = np.asarray(faces, int)
    if flat:
        verts = verts[faces.reshape(-1)]
        faces = np.arange(len(verts)).reshape(-1, 3)
    normals = np.zeros_like(verts)
    fn = np.cross(verts[faces[:, 1]] - verts[faces[:, 0]], verts[faces[:, 2]] - verts[faces[:, 0]])
    for k in range(3):
        np.add.at(normals, faces[:, k], fn)
    normals /= np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-9)
    return verts, faces, normals
