# Blueprint book generator

Every sheet is drawn from the same blueprint specs the game uses (`src/v3/blueprints`),
so the printed book can never drift from the 3D models.

## Sheets

* Cover and contents, "How to read a blueprint", crew line-up
* One A3 sheet per blueprint (41): front, back, left, right, top and bottom views in
  third-angle layout at a single printed scale, overall dimensions, a colour isometric
  view, notes, a parts list and a title block
* Comet exploded assembly, the 12 rocket systems, the Spaceport site plan,
  the Solar System to scale and the mission route

## Build it

```bash
npm ci
npm i --no-save playwright           # QA/render tooling (not part of the game build)
npx playwright install chromium
npm run dev                           # leave running (http://127.0.0.1:5173)

# in a second terminal
node tools/blueprint-book/render.mjs blueprint-out --singles   # sheets + single views
pip install reportlab pillow
python3 tools/blueprint-book/make_pdf.py blueprint-out spaceflight-academy-3d-blueprints.pdf
```

Options for `render.mjs`: `--sheets 0,8,9` renders only those sheets (0-based),
`--no-sheets` skips sheets, `--singles` also renders every view of every blueprint
(`views/<code>-<id>/<code>-<view>.png`, 1400 × 1114), `--ids rocket-comet,cadet-mei` limits singles.

You can also open `http://127.0.0.1:5173/tools/blueprint-book/index.html?sheet=8` in a desktop
browser to look at one sheet live.
