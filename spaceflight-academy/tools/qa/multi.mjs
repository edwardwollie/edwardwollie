// Usage: node tools/qa/multi.mjs steps.json outDir [WxH] [query]
// steps.json: [{ "name": "a", "script": "await s.game.openStudio(); s.step(1);", "wait": 800 }, ...]
// Runs every step in ONE page session and screenshots after each step.
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";

const [stepsFile, outDir = ".", size = "1280x720", query = ""] = process.argv.slice(2);
const steps = JSON.parse(readFileSync(stepsFile, "utf8"));
const [width, height] = size.split("x").map(Number);
mkdirSync(outDir, { recursive: true });
const base = process.env.GAME_URL ?? "http://127.0.0.1:5173";
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: width < 800 });
const logs = [];
page.on("console", (msg) => { if (["error"].includes(msg.type())) logs.push(`[${msg.type()}] ${msg.text()}`); });
page.on("pageerror", (err) => logs.push(`[pageerror] ${err.stack ?? err}`));
await page.goto(`${base}/?fastnarration=1&pr=1&${query}`);
await page.waitForFunction(() => window.__sfa && document.getElementById("boot") === null, null, { timeout: 120000 });
for (const step of steps) {
  const t0 = Date.now();
  try {
    if (step.script) await page.evaluate(`(async () => { const s = window.__sfa; ${step.script} })()`);
    if (step.click) await page.click(step.click, { timeout: 5000 });
  } catch (err) {
    logs.push(`[step ${step.name}] ${err.message ?? err}`);
  }
  await page.waitForTimeout(step.wait ?? 600);
  await page.screenshot({ path: `${outDir}/${step.name}.png` });
  const info = await page.evaluate(() => ({ screen: window.__sfa.ui().screen, scene: window.__sfa.scene() }));
  console.log(step.name, JSON.stringify(info), `${Date.now() - t0}ms`);
}
if (logs.length) console.log(logs.slice(0, 40).join("\n"));
await browser.close();
