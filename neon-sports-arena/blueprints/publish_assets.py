"""Copy the atlas, GLB models and plate previews into public/blueprints for the hangar."""
import json
import shutil
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parent / "public" / "blueprints"
VERSION = json.loads((HERE.parent / "app/blueprint-spec.json").read_text())["version"]
(PUBLIC / "models").mkdir(parents=True, exist_ok=True)
(PUBLIC / "plates").mkdir(parents=True, exist_ok=True)
for old in list(PUBLIC.glob("*.pdf")) + list((PUBLIC / "models").glob("*.glb")):
    old.unlink()
shutil.copy(HERE / f"Neon-Sports-Arena-3D-Blueprint-Atlas-v{VERSION}.pdf", PUBLIC)
for glb in (HERE / "models").glob(f"*-v{VERSION}.glb"):
    shutil.copy(glb, PUBLIC / "models")
for png in sorted((HERE / "renders").glob("[01]*.png")):
    Image.open(png).convert("RGB").resize((1400, 1040), Image.LANCZOS).save(PUBLIC / "plates" / f"{png.stem}.jpg", "JPEG", quality=84, optimize=True)
print("published", sum(f.stat().st_size for f in PUBLIC.rglob("*") if f.is_file()), "bytes")
