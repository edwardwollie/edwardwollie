#!/usr/bin/env python3
"""Compiles the rendered blueprint sheets into one A3-landscape PDF with bookmarks.

Usage:  python3 tools/blueprint-book/make_pdf.py <outDir> <book.pdf>
Needs:  pip install reportlab pillow
<outDir> is the folder given to render.mjs (it contains sheets/ and <outDir>-index.json).
"""
import io
import json
import os
import sys

from PIL import Image
from reportlab.lib.pagesizes import A3, landscape
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


def main(out_dir: str, pdf_path: str) -> None:
    out_dir = out_dir.rstrip("/")
    with open(out_dir + "-index.json", encoding="utf-8") as fh:
        index = json.load(fh)
    width, height = landscape(A3)
    pdf = canvas.Canvas(pdf_path, pagesize=(width, height), pageCompression=1)
    pdf.setTitle("Spaceflight Academy · 3D Blueprint Book")
    pdf.setAuthor("Flexzonic Games · Spaceflight Academy")
    pdf.setSubject("Third-angle orthographic blueprints of every 3D model in Spaceflight Academy v3")
    pdf.setCreator("SFA Blueprint Engine (tools/blueprint-book)")
    pdf.setKeywords("Spaceflight Academy, blueprints, orthographic, third angle, 3D, kids, rocket")
    for number, item in enumerate(index):
        png = os.path.join(out_dir, "sheets", item["file"] + ".png")
        with Image.open(png) as image:
            buffer = io.BytesIO()
            image.convert("RGB").save(buffer, "PNG", optimize=True)
        buffer.seek(0)
        pdf.drawImage(ImageReader(buffer), 0, 0, width=width, height=height)
        key = f"sheet{number + 1}"
        pdf.bookmarkPage(key)
        pdf.addOutlineEntry(f"{number + 1}. {item['code']} · {item['title']}", key, level=0)
        pdf.showPage()
    pdf.showOutline()
    pdf.save()
    print(f"wrote {pdf_path} ({len(index)} sheets)")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
