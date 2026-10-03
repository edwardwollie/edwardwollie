// Renders every blueprint sheet to JPEG and compiles blueprints/healthy-hero-3d-blueprints.pdf
// Requires: npm i -D playwright pdf-lib   (Chromium with WebGL)
// Usage:    node tools/render-blueprints.mjs [sheetId ...]
import { chromium } from 'playwright';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'blueprints');
mkdirSync(join(outDir, 'sheets'), { recursive: true });
mkdirSync(join(outDir, 'web'), { recursive: true });
const port = 39500 + Math.floor(Math.random() * 300);
const server = spawn(process.execPath, ['server.mjs'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 500));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 3508, height: 2480 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://127.0.0.1:${port}/tools/blueprint-sheets.html?sheet=cover`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
const all = await page.evaluate(() => window.__sheets);
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : all;
const files = [];
for (const id of wanted) {
  const n = all.indexOf(id) + 1;
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${port}/tools/blueprint-sheets.html?sheet=${id}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
  const file = join(outDir, 'sheets', `${String(n).padStart(2, '0')}-${id}.jpg`);
  const buf = await page.screenshot({ path: file, type: 'jpeg', quality: 90 });
  // Web edition: 70% size, lighter JPEG (downscaled in the page with a canvas).
  const webData = await page.evaluate(async (b64) => {
    const img = new Image(); img.src = `data:image/jpeg;base64,${b64}`; await img.decode();
    const c = document.createElement('canvas'); c.width = Math.round(img.width * 0.7); c.height = Math.round(img.height * 0.7);
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8).split(',')[1];
  }, buf.toString('base64'));
  const webFile = join(outDir, 'web', `${String(n).padStart(2, '0')}-${id}.jpg`);
  writeFileSync(webFile, Buffer.from(webData, 'base64'));
  files.push({ id, file, webFile });
  console.log(`sheet ${String(n).padStart(2, '0')} ${id} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
await browser.close();
server.kill();
if (errors.length) console.log('Browser errors:\n' + errors.slice(0, 20).join('\n'));
async function buildPdf(key, out, label) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Healthy Hero 3D — Production Blueprints v2.0.0 (${label})`);
  pdf.setAuthor('Flexzonic Games');
  pdf.setSubject('Orthographic views, dimensions, parts, colors and animation for every 3D model in Healthy Hero 3D');
  await pdf.embedFont(StandardFonts.Helvetica);
  for (const f of files) {
    const img = await pdf.embedJpg(readFileSync(f[key]));
    const p = pdf.addPage([842, 595]); // A4 landscape
    p.drawImage(img, { x: 0, y: 0, width: 842, height: 595 });
  }
  writeFileSync(join(outDir, out), await pdf.save());
  console.log(`PDF written: blueprints/${out}`);
}
if (wanted.length === all.length) {
  await buildPdf('file', 'healthy-hero-3d-blueprints-print.pdf', '300 dpi print');
  await buildPdf('webFile', 'healthy-hero-3d-blueprints.pdf', 'web');
}
