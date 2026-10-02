"""Assemble the blueprint plates into a printable PDF atlas."""
import io
import json
from pathlib import Path

from PIL import Image

from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

HERE = Path(__file__).resolve().parent
VERSION = json.loads((HERE.parent / "app/blueprint-spec.json").read_text())["version"]
PAGES = sorted((HERE / "renders").glob("[01]*.png"))
OUTPUT = HERE / f"Neon-Sports-Arena-3D-Blueprint-Atlas-v{VERSION}.pdf"
WIDTH, HEIGHT = 16 * 72, 16 * 72 * 1560 / 2100

pdf = canvas.Canvas(str(OUTPUT), pagesize=(WIDTH, HEIGHT), pageCompression=1)
pdf.setTitle(f"Neon Sports Arena - 3D Blueprint Atlas v{VERSION}")
pdf.setAuthor("Flexzonic Games")
pdf.setSubject("Blueprint series NS-02: athlete six sides, quarter views, detail, poses, team kits, equipment, "
               "scoring structures, venue plan and sections, sport configurations, venue modules, arena circuit")
for page in PAGES:
    # High-quality JPEG keeps the atlas small enough to download on mobile.
    buffer = io.BytesIO()
    Image.open(page).convert("RGB").save(buffer, "JPEG", quality=90, subsampling=0, optimize=True)
    buffer.seek(0)
    pdf.drawImage(ImageReader(buffer), 0, 0, WIDTH, HEIGHT, preserveAspectRatio=False)
    pdf.showPage()
pdf.save()
print(OUTPUT.name, len(PAGES), "pages", OUTPUT.stat().st_size, "bytes")
