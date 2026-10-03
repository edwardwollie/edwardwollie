// Spaceflight Academy production server (v3 · 3D edition).
// Serves the Vite build in ./dist: the 3D game at "/", the Classic 2D edition at "/classic/",
// a health check at "/healthz" and long-lived caching for content-hashed assets.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";

const port = Number(process.env.PORT || 3000);
const root = join(process.cwd(), "dist");

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
  ".pdf": "application/pdf",
  ".wasm": "application/wasm",
};

const securityHeaders = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "cross-origin-opener-policy": "same-origin",
};

/** Resolves a URL path to a file inside dist (directory → its index.html). */
function resolveFile(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  const safe = normalize(decoded).replace(/^(\.\.(\/|\\|$))+/g, "");
  let file = join(root, safe);
  if (file !== root && !file.startsWith(root + sep)) return null;
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  return existsSync(file) && statSync(file).isFile() ? file : null;
}

function cacheControl(file, pathname) {
  const extension = extname(file);
  if (file.endsWith(".html") || file.endsWith("sw.js") || extension === ".json" || extension === ".webmanifest") return "no-cache, no-store, must-revalidate";
  if (pathname.startsWith("/assets/")) return "public, max-age=31536000, immutable";
  return "public, max-age=3600";
}

createServer((request, response) => {
  const url = new URL(request.url || "/", "http://localhost");
  if (url.pathname === "/healthz") {
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    response.end("spaceflight-academy-ok\n");
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD", "content-type": "text/plain; charset=utf-8" });
    response.end("Method not allowed\n");
    return;
  }
  // "/classic" → "/classic/" so the Classic edition always loads from its own folder.
  if (url.pathname === "/classic") {
    response.writeHead(301, { location: "/classic/" + url.search });
    response.end();
    return;
  }
  let file = resolveFile(url.pathname);
  if (!file) {
    // Missing files with an extension are real 404s; anything else falls back to the game.
    if (extname(url.pathname)) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", ...securityHeaders });
      response.end("Not found\n");
      return;
    }
    file = url.pathname.startsWith("/classic/") ? join(root, "classic", "index.html") : join(root, "index.html");
  }
  response.writeHead(200, {
    "content-type": types[extname(file)] || "application/octet-stream",
    "cache-control": cacheControl(file, url.pathname),
    ...securityHeaders,
  });
  if (request.method === "HEAD") response.end();
  else createReadStream(file).pipe(response);
}).listen(port, "0.0.0.0", () => console.log(`Spaceflight Academy v3 running on port ${port}`));
