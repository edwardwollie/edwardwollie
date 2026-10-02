// Generates the ND-3 blueprint atlas from the runtime meshes.
//
//   node tools/blueprints.mjs            all plates + GLBs + dimensions + PDF
//   node tools/blueprints.mjs commander  only plates whose key contains "commander"
//
// Outputs
//   assets/blueprints/plates/*.jpg           web plates shown in the in-game hangar
//   assets/blueprints/models/*.glb           standalone binary glTF per unit
//   assets/blueprints/Neon-Dominion-3D-Blueprint-Atlas-v3.0.0.pdf
//   blueprints/dimensions.json               measured sizes checked by scripts/blueprint-contract.mjs
//
// Requires Playwright with Chromium (preinstalled in CI images; otherwise `npx playwright install chromium`).

import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { extname, join, resolve, normalize } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const VERSION = JSON.parse(await readFile(join(root, "version.json"), "utf8")).version;
const filter = process.argv[2] || "";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };

function serve() {
  const server = createServer(async (request, response) => {
    try {
      const path = normalize(decodeURIComponent(new URL(request.url, "http://x").pathname)).replace(/^([/\\])+/, "");
      const file = join(root, path);
      if (!file.startsWith(root)) throw new Error("outside root");
      const body = await readFile(file);
      response.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end("not found");
    }
  });
  return new Promise((done) => server.listen(0, "127.0.0.1", () => done(server)));
}

async function launch() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const globalRoot = (await import("node:child_process")).execSync("npm root -g").toString().trim();
    ({ chromium } = require(join(globalRoot, "playwright")));
  }
  const executablePath = process.env.CHROMIUM_PATH || undefined;
  return chromium.launch({ executablePath, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
}

const server = await serve();
const port = server.address().port;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (message) => {
  if (message.type() === "error") console.error("[studio]", message.text());
});
page.on("pageerror", (error) => console.error("[studio]", error.message));
await page.goto(`http://127.0.0.1:${port}/tools/blueprint-studio.html`);
await page.waitForFunction(() => window.studioReady === true, null, { timeout: 60000 });

const platesDir = join(root, "assets/blueprints/plates");
const modelsDir = join(root, "assets/blueprints/models");
await mkdir(platesDir, { recursive: true });
await mkdir(modelsDir, { recursive: true });
await mkdir(join(root, "blueprints"), { recursive: true });

const plates = await page.evaluate(() => window.studio.plates());
const rendered = [];
for (const plate of plates) {
  if (filter && !plate.key.includes(filter)) continue;
  const started = Date.now();
  await page.evaluate((key) => window.studio.renderPlate(key), plate.key);
  const jpeg = await page.evaluate(() => document.getElementById("out").toDataURL("image/jpeg", 0.9));
  const file = join(platesDir, `${plate.key}.jpg`);
  await writeFile(file, Buffer.from(jpeg.split(",")[1], "base64"));
  rendered.push(plate.key);
  console.log(`plate ${plate.key} (${Date.now() - started} ms)`);
}

if (!filter) {
  const dimensions = await page.evaluate(() => window.studio.dimensions());
  await writeFile(join(root, "blueprints/dimensions.json"), `${JSON.stringify(dimensions, null, 2)}\n`);
  for (const id of Object.keys(dimensions)) {
    const base64 = await page.evaluate((key) => window.studio.exportGLB(key), id);
    await writeFile(join(modelsDir, `${id}.glb`), Buffer.from(base64, "base64"));
    console.log(`glb ${id}.glb`);
  }

  // PDF atlas: one landscape page per plate.
  const pdfPage = await browser.newPage();
  const html = `<!doctype html><html><head><style>
    @page { size: 16in 10in; margin: 0; }
    html, body { margin: 0; background: #071431; }
    img { display: block; width: 16in; height: 10in; page-break-after: always; }
  </style></head><body>${plates.map((plate) => `<img src="http://127.0.0.1:${port}/assets/blueprints/plates/${plate.key}.jpg">`).join("")}</body></html>`;
  await pdfPage.setContent(html, { waitUntil: "networkidle" });
  const pdf = join(root, `assets/blueprints/Neon-Dominion-3D-Blueprint-Atlas-v${VERSION}.pdf`);
  await pdfPage.pdf({ path: pdf, width: "16in", height: "10in", printBackground: true });
  console.log(`pdf ${pdf}`);
  await writeFile(join(platesDir, "index.json"), `${JSON.stringify(plates.map((plate) => ({ key: plate.key, id: plate.id || null, kind: plate.kind })), null, 2)}\n`);
}

await browser.close();
server.close();
console.log(`Rendered ${rendered.length} plate(s).`);
