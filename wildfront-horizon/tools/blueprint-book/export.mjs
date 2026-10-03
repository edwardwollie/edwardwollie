// Blueprint book export: renders every sheet and every single view to PNG.
//   npm i --no-save playwright   (once; uses the bundled Chromium or PLAYWRIGHT_BROWSERS_PATH)
//   node tools/blueprint-book/export.mjs [outDir] [--sheets-only] [--views-only] [--from=N] [--force]
// Existing PNGs are kept (so an interrupted export resumes) unless --force is given.
// Then: python3 tools/blueprint-book/make_pdf.py blueprint-out wildfront-horizon-3d-blueprints.pdf
import { createServer } from "vite";
import { chromium } from "playwright";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const out = resolve(args.find(a => !a.startsWith("--")) ?? "blueprint-out");
const only = args.includes("--sheets-only") ? "sheets" : args.includes("--views-only") ? "views" : "all";
const from = Number((args.find(a => a.startsWith("--from=")) ?? "--from=1").slice(7));
const port = Number(process.env.BOOK_PORT ?? 5299);
const force = args.includes("--force");

const server = await createServer({ configFile: join(here, "../vite.tools.config.ts"), server: { port, strictPort: true }, logLevel: "warn" });
await server.listen();
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
page.on("pageerror", e => console.error("pageerror:", e.message));
const date = process.env.BOOK_DATE ?? new Date().toISOString().slice(0, 10);
await page.goto(`http://127.0.0.1:${port}/blueprint-book/index.html?date=${date}`, { waitUntil: "load", timeout: 180000 });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
const save = (file, dataUrl) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, Buffer.from(dataUrl.split(",")[1], "base64")); };
const t0 = Date.now();
const list = await page.evaluate(() => window.__book.list());
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "index.json"), JSON.stringify(list, null, 1));
if (only !== "views") {
  for (const s of list) {
    if (s.n < from) continue;
    const name = `${String(s.n).padStart(2, "0")}_${s.drawing.replace(/[^A-Za-z0-9.-]+/g, "-")}_${s.id}.png`;
    if (!force && existsSync(join(out, "sheets", name))) continue;
    const url = await page.evaluate(i => window.__book.sheet(i), s.n - 1);
    save(join(out, "sheets", name), url);
    console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] sheet ${s.n}/${list.length} ${s.drawing} ${s.title}`);
  }
}
if (only !== "sheets") {
  const jobs = await page.evaluate(() => window.__book.jobs());
  for (let k = 0; k < jobs.length; k++) {
    const j = jobs[k];
    if (!force && existsSync(join(out, "views", j.group, j.file))) continue;
    const url = await page.evaluate(i => window.__book.view(i), k);
    save(join(out, "views", j.group, j.file), url);
    if (k % 10 === 0) console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] view ${k + 1}/${jobs.length} ${j.file}`);
  }
}
await browser.close();
await server.close();
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s → ${out}`);
