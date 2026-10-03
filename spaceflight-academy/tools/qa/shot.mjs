// Usage: node tools/qa/shot.mjs "<query>" out.png "<async js using window.__sfa>" [waitMs] [WxH]
import { chromium } from "playwright";

const [query = "", out = "shot.png", script = "", waitArg = "1500", size = "1280x720"] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const base = process.env.GAME_URL ?? "http://127.0.0.1:5173";
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const logs = [];
page.on("console", (msg) => { if (["error", "warning"].includes(msg.type())) logs.push(`[${msg.type()}] ${msg.text()}`); });
page.on("pageerror", (err) => logs.push(`[pageerror] ${err.stack ?? err}`));
await page.goto(`${base}/?fastnarration=1&pr=1&${query}`);
await page.waitForFunction(() => window.__sfa && document.getElementById("boot") === null, null, { timeout: 120000 });
if (script) {
  await page.evaluate(`(async () => { const s = window.__sfa; ${script} })()`);
}
await page.waitForTimeout(Number(waitArg));
await page.screenshot({ path: out });
const info = await page.evaluate(() => ({ screen: window.__sfa.ui().screen, scene: window.__sfa.scene() }));
console.log(JSON.stringify(info));
if (logs.length) console.log(logs.slice(0, 30).join("\n"));
await browser.close();
