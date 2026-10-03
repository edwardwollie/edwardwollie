import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname;

async function waitFor(url, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try { return await fetch(url); } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error("server did not start");
}

test("production server: health check, 3D game, Classic edition, caching and 404s", { skip: !existsSync(new URL("../dist/index.html", import.meta.url)) && "run npm run build first" }, async () => {
  const port = 31000 + Math.floor(Math.random() * 2000);
  const server = spawn(process.execPath, ["server.mjs"], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
  try {
    const base = `http://127.0.0.1:${port}`;
    const health = await waitFor(`${base}/healthz`);
    assert.equal(health.status, 200);
    assert.equal(await health.text(), "spaceflight-academy-ok\n");
    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
    assert.match(home.headers.get("content-type"), /text\/html/);
    assert.equal(home.headers.get("cache-control"), "no-cache, no-store, must-revalidate");
    assert.match(await home.text(), /id="boot"/);
    const classic = await fetch(`${base}/classic/`);
    assert.equal(classic.status, 200);
    const classicHtml = await classic.text();
    assert.doesNotMatch(classicHtml, /id="boot"/, "the Classic edition is its own page");
    const redirect = await fetch(`${base}/classic`, { redirect: "manual" });
    assert.equal(redirect.status, 301);
    assert.equal(redirect.headers.get("location"), "/classic/");
    const asset = homeAsset(classicHtml);
    if (asset) {
      const res = await fetch(`${base}${asset}`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get("cache-control"), /immutable/);
    }
    const missing = await fetch(`${base}/assets/does-not-exist.js`);
    assert.equal(missing.status, 404);
    const deep = await fetch(`${base}/some/route`);
    assert.equal(deep.status, 200, "unknown routes fall back to the game");
    const meta = await fetch(`${base}/.well-known/flexzonic-game.json`);
    assert.equal(meta.status, 200);
    assert.equal((await meta.json()).version, "3.0.2");
    const sw = await fetch(`${base}/sw.js`);
    assert.equal(sw.status, 200);
    assert.equal(sw.headers.get("cache-control"), "no-cache, no-store, must-revalidate");
    const post = await fetch(`${base}/`, { method: "POST" });
    assert.equal(post.status, 405);
    const escape = await fetch(`${base}/..%2F..%2Fpackage.json`);
    assert.notEqual(await escape.text().then((t) => t.includes('"devDependencies"')), true, "no path traversal");
  } finally {
    server.kill();
  }
});

function homeAsset(html) {
  const m = html.match(/(\/assets\/[^"']+\.js)/);
  return m ? m[1] : null;
}
