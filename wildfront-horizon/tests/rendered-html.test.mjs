// Server-render smoke test against the production build (run `npm run build` first).
// Renders the 3D edition at /, the classic v2 edition at /classic and the health probe.
import assert from "node:assert/strict";
import test from "node:test";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const ctx = { waitUntil() {}, passThroughOnException() {} };
const get = (path, accept = "text/html") => worker.fetch(new Request(`http://localhost${path}`, { headers: { accept } }), env, ctx);

test("renders the 3D edition shell at /", async () => {
  const res = await get("/");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await res.text();
  assert.match(html, /<title>Wildfront Horizon 3D \| Flexzonic Games<\/title>/);
  assert.match(html, /full 3D hunting experience/);
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /class="wf3"/);
  assert.match(html, /CALIBRATING FIELD SYSTEM 3\.0/);
});

test("keeps the classic edition reachable at /classic", async () => {
  const res = await get("/classic");
  assert.equal(res.status, 200);
  const html = await res.text();
  // the classic game mounts on the client; the server renders its scoped wrapper and loading state
  assert.match(html, /class="wf-classic"/);
  assert.match(html, /CALIBRATING WILDFRONT 2\.0/);
});

test("answers the health probe", async () => {
  const res = await get("/healthz", "text/plain");
  assert.equal(res.status, 200);
  assert.equal((await res.text()).trim(), "wildfront-ok");
  assert.match(res.headers.get("cache-control") ?? "", /no-store/);
});

test("production build hides the Blueprint Studio", async () => {
  const fs = await import("node:fs");
  const dir = new URL("../dist/client/assets/", import.meta.url);
  const bundle = fs.readdirSync(dir).filter(f => f.endsWith(".js")).map(f => fs.readFileSync(new URL(f, dir), "utf8")).join("\n");
  assert.doesNotMatch(bundle, /Blueprint Studio/);
  assert.doesNotMatch(bundle, /EXPORT SHEET PNG/);
  assert.doesNotMatch(bundle, /PARTS LIST/);
});
