// Measures every blueprint and reports (or rewrites with --write) its declared overall size.
// Usage: node --experimental-strip-types tools/dev/sync-overall.mjs [--write]
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { BLUEPRINTS, getBlueprint } from "../../src/v3/blueprints/registry.ts";
import { buildBlueprint, measure } from "../../src/v3/models/build.ts";

const write = process.argv.includes("--write");
const dir = new URL("../../src/v3/blueprints/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".ts")).map((f) => new URL(f, dir));
const sources = new Map(files.map((f) => [f.pathname, readFileSync(f, "utf8")]));
const round = (v) => Math.round(v * 100) / 100;
let drift = 0;
for (const bp of BLUEPRINTS) {
  const model = buildBlueprint(bp, { resolve: getBlueprint, quality: "high" });
  const box = measure(model.root);
  const size = { w: round(box.max.x - box.min.x), h: round(box.max.y - box.min.y), d: round(box.max.z - box.min.z) };
  const declared = bp.overall;
  const off = Math.max(Math.abs(size.w - declared.w), Math.abs(size.h - declared.h), Math.abs(size.d - declared.d));
  const flag = off > 0.015 ? "DRIFT" : "ok";
  if (off > 0.015) drift++;
  console.log(`${flag.padEnd(5)} ${bp.id.padEnd(26)} declared ${declared.w}×${declared.h}×${declared.d}  measured ${size.w}×${size.h}×${size.d}  minY ${round(box.min.y)}`);
  if (write && off > 0.015) {
    const text = `{ w: ${size.w}, h: ${size.h}, d: ${size.d} }`;
    for (const [path, src] of sources) {
      const cadet = bp.id.startsWith("cadet-") ? bp.id.slice(6) : null;
      let next = src;
      if (cadet) {
        next = src.replace(new RegExp(`(\\n\\s*${cadet}: )\\{ w: [^}]+\\}`), `$1${text}`);
      } else {
        const idIndex = src.indexOf(`id: "${bp.id}"`);
        if (idIndex >= 0) {
          const rest = src.slice(idIndex);
          const replaced = rest.replace(/overall: \{ w: [^}]+\}/, `overall: ${text}`);
          next = src.slice(0, idIndex) + replaced;
        }
      }
      if (next !== src) { sources.set(path, next); writeFileSync(path, next); break; }
    }
  }
}
console.log(drift ? `${drift} blueprint(s) drift more than 1.5 cm` : "All blueprints match their declared sizes.");
