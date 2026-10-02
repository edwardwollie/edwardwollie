// Browser smoke test: serves the game with the production CSP, boots the 3D renderer in
// headless Chromium (SwiftShader WebGL2), plays a sector and opens the blueprint hangar.
//
//   node scripts/browser-smoke.mjs            run checks
//   node scripts/browser-smoke.mjs --shots    also save screenshots to ./screenshots
//   node scripts/browser-smoke.mjs --og       also regenerate assets/og.png from the live 3D scene

import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, join, resolve, normalize } from "node:path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const shots = process.argv.includes("--shots");
const og = process.argv.includes("--og");
const nginx = await readFile(join(root, "security-headers.conf"), "utf8");
const csp = nginx.match(/Content-Security-Policy "([^"]+)"/)[1];
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".pdf": "application/pdf", ".glb": "model/gltf-binary" };

const server = createServer(async (request, response) => {
  try {
    let path = normalize(decodeURIComponent(new URL(request.url, "http://x").pathname)).replace(/^([/\\])+/, "");
    if (!path) path = "index.html";
    const file = join(root, path);
    if (!file.startsWith(root)) throw new Error("outside");
    const body = await readFile(file);
    response.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "content-security-policy": csp });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("not found");
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}`;

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  const require = createRequire(import.meta.url);
  ({ chromium } = require(join(execSync("npm root -g").toString().trim(), "playwright")));
}
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const errors = [];
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
if (shots) await mkdir(join(root, "screenshots"), { recursive: true });
const shot = async (page, name) => {
  if (shots) await page.screenshot({ path: join(root, "screenshots", `${name}.png`) });
};

async function run(viewport, label) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`[${label}] ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`[${label}] ${error.message}`));
  await page.goto(`${base}/`);
  await page.waitForFunction(() => document.getElementById("bootScreen")?.classList.contains("done"), null, { timeout: 60000 });
  assert.ok(await page.evaluate(() => document.body.classList.contains("webgl")), "3D renderer should be active");
  await sleep(2500);
  await shot(page, `${label}-menu`);

  await page.click("#playButton");
  await page.click("#tutorialDeploy");
  await sleep(1500);
  await page.keyboard.down("KeyW");
  await sleep(3500);
  await shot(page, `${label}-advance`);
  await page.keyboard.press("Space");
  await sleep(300);
  await shot(page, `${label}-nova`);
  await page.keyboard.press("KeyF");
  await page.keyboard.down("KeyD");
  await sleep(2500);
  await page.keyboard.up("KeyD");
  await sleep(2500);
  await shot(page, `${label}-combat`);
  await page.keyboard.up("KeyW");
  const state = await page.evaluate(() => {
    const text = (id) => document.getElementById(id)?.textContent;
    return { sector: text("sectorLabel"), squad: text("squadCount"), hp: text("healthText") };
  });
  assert.equal(state.sector, "SECTOR 01");
  await page.keyboard.press("KeyP");
  await sleep(300);
  assert.ok(await page.evaluate(() => !document.getElementById("pauseScreen").classList.contains("hidden")), "pause should open");
  await page.click("#quitButton");
  await sleep(800);
  await page.click("#hangarButton");
  await sleep(2500);
  await shot(page, `${label}-hangar`);
  await page.click('[data-unit="guardian"]');
  await page.click('[data-hangar-toggle="ink"]');
  await sleep(2000);
  await shot(page, `${label}-hangar-ink`);
  await page.click('[data-unit="striker"]');
  await page.click('[data-hangar-toggle="ink"]');
  await sleep(1500);
  await shot(page, `${label}-hangar-striker`);
  await page.click("[data-hangar-close]");
  await sleep(500);
  const fps = await page.evaluate(() => new Promise((done) => {
    let frames = 0;
    const start = performance.now();
    const tick = () => {
      frames += 1;
      if (performance.now() - start < 2000) requestAnimationFrame(tick);
      else done(frames / ((performance.now() - start) / 1000));
    };
    requestAnimationFrame(tick);
  }));
  console.log(`[${label}] ok: ${JSON.stringify(state)}, menu ${fps.toFixed(1)} fps (software WebGL)`);
  if (og && label === "desktop") {
    await page.setViewportSize({ width: 1200, height: 630 });
    await sleep(2500);
    const buffer = await page.screenshot();
    await writeFile(join(root, "assets/og.png"), buffer);
    console.log("og.png regenerated");
  }
  await page.close();
}

try {
  await run({ width: 1280, height: 720 }, "desktop");
  await run({ width: 390, height: 844 }, "phone");
} finally {
  await browser.close();
  server.close();
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("Browser smoke passed: 3D boot, deploy, movement, NOVA, formation, pause, hangar (desktop + phone).");
