import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function worker() {
  const url = new URL("../dist/server/index.js", import.meta.url);
  url.searchParams.set("test", `${Date.now()}-${Math.random()}`);
  return (await import(url.href)).default;
}

const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const ctx = { waitUntil() {}, passThroughOnException() {} };

test("renders Neon Sports Arena production metadata", async () => {
  const app = await worker();
  const response = await app.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), env, ctx);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /<title>Neon Sports Arena<\/title>/i);
  assert.match(html, /sports\.flexzonicgames\.com\/og\.png/i);
});

test("serves Neon Sports Arena health", async () => {
  const app = await worker();
  const response = await app.fetch(new Request("http://localhost/healthz"), env, ctx);
  assert.equal(response.status, 200);
  assert.equal((await response.text()).trim(), "neon-sports-ok");
});

test("ships thirty escalating multi-sport missions", async () => {
  const source = await import("../app/arena-data.ts");
  assert.equal(source.MISSIONS.length, 30);
  assert.equal(source.MISSIONS[0].id, 1);
  assert.equal(source.MISSIONS[29].id, 30);
  assert.ok(source.MISSIONS[29].reward > source.MISSIONS[0].reward);
  assert.equal(source.MISSIONS.filter((mission) => mission.championship).length, 6);
  assert.equal(new Set(source.MISSIONS.map((mission) => mission.arena)).size, 6);
  assert.deepEqual(new Set(source.MISSIONS.map((mission) => mission.mode)), new Set(["goal", "hoops", "capture", "targets"]));
  assert.equal(source.UPGRADES.length, 4);
  assert.equal(source.TEAMS.length, 6);
});

test("publishes installable portal metadata", async () => {
  const metadata = JSON.parse(await readFile(new URL("../public/.well-known/flexzonic-game.json", import.meta.url), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
  assert.equal(metadata.title, "Neon Sports Arena");
  assert.equal(metadata.coverImage, "https://sports.flexzonicgames.com/og.png");
  assert.equal(manifest.start_url, "/");
  assert.match(manifest.name, /Neon Sports Arena/i);
});
