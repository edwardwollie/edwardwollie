// End-to-end smoke test of one full mission through the real UI:
// title → onboarding → Spaceport → mission map → briefing → Space Rush (6 gates)
// → Rocket Hangar → launch → destination activity → results.
//   node tools/qa/e2e.mjs [outDir] [WxH] [extra query, e.g. quality=high]   (needs `npm run dev` running)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const outDir = process.argv[2] ?? "e2e-shots";
const [width, height] = (process.argv[3] ?? "1280x720").split("x").map(Number);
const extra = process.argv[4] ? `&${process.argv[4]}` : "";
mkdirSync(outDir, { recursive: true });
const base = process.env.GAME_URL ?? "http://127.0.0.1:5173";
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: width < 800 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.stack ?? e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const screen = () => page.evaluate(() => window.__sfa.ui().screen);
const shot = async (name) => { await page.screenshot({ path: `${outDir}/${name}.png` }); console.log(`✓ ${name.padEnd(16)} screen=${await screen()}`); };
const until = async (fn, label, timeout = 60000, arg = null) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if (await page.evaluate(fn, arg)) return; await page.evaluate(() => window.__sfa.step(0.5)); await sleep(150); }
  throw new Error(`timed out waiting for ${label}`);
};

await page.goto(`${base}/?fastnarration=1&pr=1${extra}`);
await page.waitForFunction(() => window.__sfa && document.getElementById("boot") === null, null, { timeout: 120000 });
await page.evaluate(() => localStorage.removeItem("spaceflight-academy-save-v1"));
await page.reload();
await page.waitForFunction(() => window.__sfa && document.getElementById("boot") === null, null, { timeout: 120000 });
await shot("01-title");
await page.click("text=PLAY");
await until(() => window.__sfa.ui().screen === "onboard", "onboarding");
await page.click("text=Orbit Pilot");
await shot("02-onboarding");
await page.click("text=ENTER THE SPACEPORT");
await until(() => window.__sfa.ui().screen === "hub", "hub");
await page.evaluate(() => window.__sfa.step(1));
await shot("03-hub");
await page.click(".hub-menu .btn.primary");
await until(() => window.__sfa.ui().screen === "map", "map");
await page.evaluate(() => { window.__sfa.call("map", "select", 1); window.__sfa.game.ui.set({ map: { selected: 1 } }); window.__sfa.step(0.5); });
await page.click("text=START MISSION");
await until(() => window.__sfa.ui().screen === "brief", "briefing");
await shot("04-briefing");
await page.click("text=START SPACE RUSH");
await until(() => window.__sfa.ui().screen === "rush", "rush");
for (let gate = 0; gate < 6; gate++) {
  await until(() => window.__sfa.ui().rush?.stage === "narrating" || window.__sfa.ui().rush?.stage === "grace" || window.__sfa.ui().rush?.stage === "running", `gate ${gate + 1}`);
  if (gate === 0) await shot("05-rush-question");
  // Gate 3 is answered wrong on purpose: the rocket crashes through and the mission continues.
  await page.evaluate((g) => { const s = window.__sfa; const right = s.call("rush", "qaCorrectGate"); s.call("rush", "qaAnswer", g === 2 ? (right + 1) % 3 : right); s.step(0.3); }, gate);
  if (gate === 2) await shot("06-rush-crash");
  await until(() => ["fact", "done"].includes(window.__sfa.ui().rush?.stage) || window.__sfa.ui().screen !== "rush", `fact ${gate + 1}`);
  if (gate === 1) await shot("07-rush-fact");
  await until((g) => window.__sfa.ui().rush?.index > g || window.__sfa.ui().screen !== "rush", `next after ${gate + 1}`, 60000, gate);
}
await until(() => window.__sfa.ui().screen === "build" && window.__sfa.scene() === "hangar", "hangar");
await page.evaluate(() => window.__sfa.step(1));
await shot("08-hangar-start");
const solved = await page.evaluate(() => window.__sfa.solve());
if (!solved) throw new Error("no winning build found");
await page.evaluate(() => window.__sfa.step(2));
await shot("09-hangar-ready");
await page.click("button.btn.big.pink");
await until(() => window.__sfa.ui().screen === "launch" && window.__sfa.scene() === "launch" && !!window.__sfa.ui().launch, "launch");
await page.evaluate(() => window.__sfa.step(4));
await shot("10-launch");
await page.evaluate(() => window.__sfa.call("launch", "skip"));
await until(() => window.__sfa.ui().screen === "activity" && window.__sfa.scene() === "act-orbit", "activity");
await page.evaluate(() => window.__sfa.step(1));
await shot("11-activity");
await page.evaluate(() => window.__sfa.call("act-orbit", "qaCircularize"));
await until(() => window.__sfa.ui().screen === "results", "results", 90000);
await shot("12-results");
const save = await page.evaluate(() => window.__sfa.save());
const summary = { progress: save.progress["8–10"], stars: save.stars["8–10-1"], xp: save.xp, journal: save.v3.journal.length, passport: save.v3.passport, launches: save.v3.stats.launches, achievements: save.v3.achievements };
console.log("save after mission 1:", JSON.stringify(summary));
const ok = summary.progress === 2 && summary.stars >= 1 && summary.journal === 5 && summary.launches === 1;
if (errors.length) console.log("page errors:\n" + errors.slice(0, 20).join("\n"));
await browser.close();
if (!ok) { console.error("E2E FAILED"); process.exit(1); }
console.log("E2E PASSED");
