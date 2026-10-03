#!/usr/bin/env python3
"""Assemble the Wildfront Horizon 3D blueprint book (A3 landscape, bookmarked).

usage: python3 tools/blueprint-book/make_pdf.py blueprint-out wildfront-horizon-3d-blueprints.pdf [--quality 86] [--444]

Reads blueprint-out/index.json and blueprint-out/sheets/*.png (written by export.mjs).
Sheets are embedded as high-quality JPEG (4:2:0 by default; --444 keeps full chroma) so the
book stays small enough to share (about 23 MB for 47 A3 sheets at 150 dpi).
"""
import io
import json
import os
import sys

from PIL import Image
from reportlab import rl_config
from reportlab.lib.pagesizes import A3, landscape
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    src = args[0] if args else "blueprint-out"
    dst = args[1] if len(args) > 1 else "wildfront-horizon-3d-blueprints.pdf"
    quality = 86
    subsampling = 0 if "--444" in sys.argv else 2
    if "--quality" in sys.argv:
        quality = int(sys.argv[sys.argv.index("--quality") + 1])
    index = json.load(open(os.path.join(src, "index.json")))
    sheets_dir = os.path.join(src, "sheets")
    files = sorted(os.listdir(sheets_dir))
    by_n = {int(f.split("_")[0]): f for f in files if f.endswith(".png")}
    rl_config.useA85 = 0   # embed the JPEG streams as binary (ASCII85 would add ~25 %)
    page = landscape(A3)
    c = canvas.Canvas(dst, pagesize=page)
    c.setTitle("Wildfront Horizon 3D — Blueprint Book")
    c.setAuthor("Flexzonic Games")
    c.setSubject("Engineering blueprints generated from the game data: wildlife, gear, structures, flora, reserves, ballistics")
    c.setCreator("Wildfront Horizon 3D blueprint generator")
    last_section = None
    for s in index:
        n = s["n"]
        f = by_n.get(n)
        if not f:
            print("missing sheet", n, s["drawing"])
            continue
        img = Image.open(os.path.join(sheets_dir, f)).convert("RGB")
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=quality, optimize=True, subsampling=subsampling)
        buf.seek(0)
        c.drawImage(ImageReader(buf), 0, 0, width=page[0], height=page[1])
        key = f"s{n}"
        c.bookmarkPage(key)
        if s["section"] != last_section:
            c.addOutlineEntry(s["section"], f"sec{n}", level=0, closed=False)
            c.bookmarkPage(f"sec{n}")
            last_section = s["section"]
        c.addOutlineEntry(f'{s["drawing"]} · {s["title"]}', key, level=1)
        c.showPage()
    c.showOutline()
    c.save()
    print(f"wrote {dst} ({os.path.getsize(dst) / 1e6:.1f} MB, {len(index)} sheets)")


if __name__ == "__main__":
    main()
