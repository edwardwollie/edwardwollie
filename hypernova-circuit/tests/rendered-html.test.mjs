import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

function context() {
  return {
    waitUntil() {},
    passThroughOnException() {},
  };
}

test("renders the finished Hypernova Circuit experience", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    context(),
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /Hypernova Circuit \| Futuristic Racing/i);
  assert.match(html, /OUTRUN THE/i);
  assert.match(html, /GARAGE &amp; UPGRADES/i);
  assert.doesNotMatch(html, /codex-preview/i);
});

test("serves the container health endpoint", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/healthz"),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    context(),
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "hypernova-ok\n");
});

test("ships valid portal discovery metadata and PWA configuration", async () => {
  const metadata = JSON.parse(
    await readFile("public/.well-known/flexzonic-game.json", "utf8"),
  );
  const manifest = JSON.parse(
    await readFile("public/manifest.webmanifest", "utf8"),
  );

  assert.equal(metadata.title, "Hypernova Circuit");
  assert.equal(metadata.url, "https://racer.flexzonicgames.com");
  assert.equal(manifest.display, "fullscreen");
  assert.equal(manifest.start_url, "/");
});
