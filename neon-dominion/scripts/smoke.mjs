import { readFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");
const required = [
  "index.html",
  "styles.css",
  "manifest.webmanifest",
  "sw.js",
  "version.json",
  "app/audio.js",
  "app/game.js",
  "app/main.js",
  "app/render3d.js",
  "app/hangar.js",
  "app/blueprints/kit.js",
  "app/blueprints/models.js",
  "app/blueprints/rigs.js",
  "app/blueprints/views.js",
  "app/vendor/three.js",
  "security-headers.conf",
  "assets/icon.svg",
  "assets/og.png",
  ".well-known/flexzonic-game.json",
  "Dockerfile",
  "compose.yaml",
  "nginx.conf"
];

await Promise.all(required.map((path) => access(resolve(root, path), constants.R_OK)));

const { version } = JSON.parse(await read("version.json"));
const [html, main, game, manifestText, portalText, serviceWorker, compose, nginx, dockerfile, headers] = await Promise.all([
  read("index.html"),
  read("app/main.js"),
  read("app/game.js"),
  read("manifest.webmanifest"),
  read(".well-known/flexzonic-game.json"),
  read("sw.js"),
  read("compose.yaml"),
  read("nginx.conf"),
  read("Dockerfile"),
  read("security-headers.conf")
]);

const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
const mainReferences = [...main.matchAll(/\$\("([^"]+)"\)/g)].map((match) => match[1]);
const gameReferences = [...game.matchAll(/id\("([^"]+)"\)/g)].map((match) => match[1]);
const missingIds = [...new Set([...mainReferences, ...gameReferences])].filter((id) => !ids.has(id));
if (missingIds.length) throw new Error(`Missing HTML element ids: ${missingIds.join(", ")}`);

const manifest = JSON.parse(manifestText);
const portal = JSON.parse(portalText);
if (manifest.name !== "Neon Dominion: Rift Command") throw new Error("Manifest name mismatch");
if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) throw new Error("Manifest icon missing");
if (portal.title !== manifest.name || portal.name !== manifest.name || portal.shortTitle !== "Neon Dominion") throw new Error("Portal metadata identity mismatch");
if (portal.category !== "Action Strategy" || portal.order !== 47 || portal.version !== version) throw new Error("Portal metadata catalog fields mismatch");
if (portal.coverImage !== "https://neon.flexzonicgames.com/assets/og.png") throw new Error("Portal cover artwork is missing");
for (const module of ["/app/game.js", "/app/render3d.js", "/app/vendor/three.js", "/app/blueprints/models.js"]) {
  if (!serviceWorker.includes(module)) throw new Error(`${module} missing from offline cache`);
}
if (!serviceWorker.includes(`neon-dominion-v${version}`)) throw new Error("Service worker cache name does not match version.json");
if (!html.includes(`/styles.css?v=${version}`) || !serviceWorker.includes(`/styles.css?v=${version}`)) throw new Error("Stylesheet cache-busting version mismatch");
if (!html.includes('src="/app/main.js"')) throw new Error("index.html must load /app/main.js");
if (!headers.includes("Content-Security-Policy") || !headers.includes("script-src 'self'")) throw new Error("Security headers snippet incomplete");
const locations = nginx.match(/location [^{]+\{/g) || [];
const includes = nginx.match(/include \/etc\/nginx\/snippets\/security-headers\.conf;/g) || [];
if (includes.length < locations.length + 1) throw new Error("Every nginx location must include the security headers snippet");
if (!dockerfile.includes("COPY security-headers.conf /etc/nginx/snippets/security-headers.conf")) throw new Error("Security headers not copied into the image");
if (!dockerfile.includes("COPY app /usr/share/nginx/html/app")) throw new Error("App modules not copied into the image");
if (/immutable/.test(nginx)) throw new Error("Code must not be cached as immutable");
if (!serviceWorker.includes("/.well-known/flexzonic-game.json")) throw new Error("Portal metadata must bypass the service worker cache");
if (!compose.includes("${GAME_PORT:-8108}:80")) throw new Error("Expected configurable port 8108 is missing");
if (!compose.includes("network_mode: bridge")) throw new Error("Shared Docker bridge mode is missing");
if (!nginx.includes("neon-dominion-ok")) throw new Error("Health endpoint is missing");
if (!nginx.includes("location = /.well-known/flexzonic-game.json")) throw new Error("Portal metadata route is missing");
if (!dockerfile.includes("COPY .well-known /usr/share/nginx/html/.well-known")) throw new Error("Portal metadata is not copied into the Docker image");
if (/https?:\/\//.test(html.replace(/content="https?:\/\/[^\"]+"/g, ""))) {
  throw new Error("Unexpected external dependency in index.html");
}

console.log(`Smoke checks passed: ${required.length} files, ${ids.size} UI ids, offline shell, cache busting, security headers, Docker health route.`);
