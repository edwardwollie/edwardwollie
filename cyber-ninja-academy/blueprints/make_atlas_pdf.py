"""Assemble the exact game-geometry plates into a printable blueprint atlas."""
import json
from pathlib import Path

from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

HERE = Path(__file__).resolve().parent
VERSION = json.loads((HERE.parent / "app/blueprint-spec.json").read_text())["version"]
PAGES = sorted((HERE / "renders").glob("0*.png"))
OUTPUT = HERE / f"Cyber-Ninja-3D-Blueprint-Atlas-v{VERSION}.pdf"
WIDTH, HEIGHT = 16 * 72, 16 * 72 * 1560 / 2100

pdf = canvas.Canvas(str(OUTPUT), pagesize=(WIDTH, HEIGHT), pageCompression=1)
pdf.setTitle(f"Cyber Ninja Academy - 3D Blueprint Atlas v{VERSION}")
pdf.setAuthor("Flexzonic Games")
pdf.setSubject("Exact runtime geometry: six sides, quarter views, detail, articulation and poses, city ops assets, survival hazards")
for page in PAGES:
    pdf.drawImage(ImageReader(str(page)), 0, 0, WIDTH, HEIGHT, preserveAspectRatio=False, mask='auto')
    pdf.showPage()
pdf.save()
print(OUTPUT, len(PAGES), "pages")
