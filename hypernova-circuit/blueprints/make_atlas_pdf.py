"""Assemble the blueprint plates into a printable atlas PDF."""
import json
from pathlib import Path

from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

HERE = Path(__file__).resolve().parent
VERSION = json.loads((HERE.parent / "app/game/blueprint-spec.json").read_text())["version"]
PAGES = sorted((HERE / "renders").glob("0*.png"))
OUTPUT = HERE / f"Hypernova-Circuit-3D-Blueprint-Atlas-v{VERSION}.pdf"
WIDTH, HEIGHT = 16 * 72, 16 * 72 * 1560 / 2100

pdf = canvas.Canvas(str(OUTPUT), pagesize=(WIDTH, HEIGHT), pageCompression=1)
pdf.setTitle(f"Hypernova Circuit - 3D Blueprint Atlas v{VERSION}")
pdf.setAuthor("Flexzonic Games")
pdf.setSubject("Exact game geometry: six-side views of four hovercars, quarter views, hazards and pickups, six circuit plans, raceway section")
for page in PAGES:
    pdf.drawImage(ImageReader(str(page)), 0, 0, WIDTH, HEIGHT)
    pdf.showPage()
pdf.save()
print(OUTPUT.name, len(PAGES), "pages")
