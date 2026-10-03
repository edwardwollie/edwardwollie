// Renders model previews to PNG via the Vite dev server.
// Usage: node tools/preview/shoot.mjs "ids=cadet-omari&views=front,left,iso" out.png [baseUrl]
import { chromium } from "playwright";

const query = process.argv[2] ?? "ids=cadet-omari";
const out = process.argv[3] ?? "preview.png";
const base = process.argv[4] ?? process.env.PREVIEW_URL ?? "http://localhost:5173";
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
const errors = [];
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
page.on("pageerror", (err) => errors.push(String(err)));
await page.goto(`${base}/tools/preview/index.html?${query}`);
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
const failure = await page.evaluate(() => window.__error);
if (failure) { console.error(failure); process.exitCode = 1; }
const size = await page.evaluate(() => { const c = document.querySelector("canvas"); return c ? { width: c.width, height: c.height } : { width: 400, height: 400 }; });
await page.setViewportSize(size);
await page.screenshot({ path: out });
if (errors.length) console.error(errors.join("\n"));
await browser.close();
console.log("wrote", out, size);
