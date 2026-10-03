// Bundles the pure game modules (three stays external) so node tests can
// drive the real physics, AI and track code.
import { build } from "esbuild";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

export async function loadGameModules() {
  const out = new URL(`../.test-build/${process.pid}-${Date.now()}/`, import.meta.url);
  fs.mkdirSync(out, { recursive: true });
  const entries = ["track.ts", "race-physics.ts", "grand-prix.ts", "progression.ts", "blueprint-mesh.ts"];
  await build({
    entryPoints: entries.map((f) => new URL(`../app/game/${f}`, import.meta.url).pathname),
    outdir: out.pathname,
    bundle: true,
    packages: "external",
    platform: "node",
    format: "esm",
    logLevel: "silent",
  });
  const load = (f) => import(pathToFileURL(`${out.pathname}${f.replace(".ts", ".js")}`).href);
  const mods = Object.fromEntries(await Promise.all(entries.map(async (f) => [f.replace(".ts", ""), await load(f)])));
  fs.rmSync(out, { recursive: true, force: true });
  return mods;
}
