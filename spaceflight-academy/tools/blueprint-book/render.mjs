// Renders the blueprint book sheets (and optionally single views) to PNG.
//   node tools/blueprint-book/render.mjs <outDir> [--sheets 0,1,5] [--no-sheets] [--singles] [--ids a,b]
// Needs the Vite dev server (npm run dev) — GAME_URL overrides http://127.0.0.1:5173.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const outDir = args[0] && !args[0].startsWith("--") ? args[0] : "blueprint-out";
const flag = (name) => args.includes(name);
const value = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const base = process.env.GAME_URL ?? "http://127.0.0.1:5173";
const only = value("--sheets")?.split(",").map(Number);
const ids = value("--ids")?.split(",");
const VIEWS = ["front", "back", "left", "right", "top", "bottom", "iso", "colour"];

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 2339, height: 1654 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.stack ?? e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(`${base}/tools/blueprint-book/index.html`);
await page.waitForFunction(() => window.__bookReady === true || !!window.__bookError, null, { timeout: 180000 });
const bookError = await page.evaluate(() => window.__bookError);
if (bookError) { console.error(bookError); process.exit(1); }

const list = await page.evaluate(() => window.__book.list());
writeFileSync(`${outDir.replace(/\/$/, "")}-index.json`, JSON.stringify(list.map(({ file, code, title }) => ({ file, code, title })), null, 2));
if (!flag("--no-sheets")) {
  mkdirSync(`${outDir}/sheets`, { recursive: true });
  for (const [i, item] of list.entries()) {
    if (only && !only.includes(i)) continue;
    const t0 = Date.now();
    await page.setViewportSize({ width: 2339, height: 1654 });
    await page.evaluate((spec) => window.__book.sheet(spec), item.spec);
    await page.screenshot({ path: `${outDir}/sheets/${item.file}.png`, clip: { x: 0, y: 0, width: 2339, height: 1654 } });
    console.log(`sheet ${i + 1}/${list.length} ${item.file} ${Date.now() - t0}ms`);
  }
}
if (flag("--singles")) {
  const blueprints = await page.evaluate(() => window.__book.blueprints());
  const width = 1400, height = 1114;
  await page.setViewportSize({ width, height });
  for (const bp of blueprints) {
    if (ids && !ids.includes(bp.id)) continue;
    const dir = `${outDir}/views/${bp.code}-${bp.id}`;
    mkdirSync(dir, { recursive: true });
    const t0 = Date.now();
    for (const view of VIEWS) {
      await page.evaluate((spec) => window.__book.single(spec), { id: bp.id, view, width, height });
      await page.screenshot({ path: `${dir}/${bp.code}-${view}.png`, clip: { x: 0, y: 0, width, height } });
    }
    console.log(`views ${bp.code} ${bp.id} ${Date.now() - t0}ms`);
  }
}
if (errors.length) console.log("ERRORS:\n" + errors.slice(0, 20).join("\n"));
await browser.close();
