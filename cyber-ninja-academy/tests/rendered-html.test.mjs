import assert from "node:assert/strict";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

const env = {
  ASSETS: {
    fetch: async () => new Response("Not found", { status: 404 }),
  },
};
const ctx = { waitUntil() {}, passThroughOnException() {} };

test("renders Cyber Ninja Academy production metadata", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    env,
    ctx,
  );
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(html, /<title>Cyber Ninja Academy<\/title>/i);
  assert.match(html, /ninja\.flexzonicgames\.com\/og\.png/i);
});

test("serves the production health endpoint", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/healthz"), env, ctx);
  assert.equal(response.status, 200);
  assert.equal((await response.text()).trim(), "cyber-ninja-ok");
});
