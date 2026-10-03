import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const root = fileURLToPath(new URL(".", import.meta.url));
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };
export const CACHE_NAME = `spaceflight-academy-v${pkg.version}-3d`;
const CORE = ["/", "/classic/", "/manifest.webmanifest", "/icon.svg", "/og.png", "/version.json", "/.well-known/flexzonic-game.json"];

/**
 * Generates /sw.js from sw/sw.template.js with the release cache name and the
 * full list of built, content-hashed assets so the 3D game works offline.
 */
function serviceWorker(): Plugin {
  return {
    name: "spaceflight-service-worker",
    apply: "build",
    generateBundle(_options, bundle) {
      const template = readFileSync(new URL("./sw/sw.template.js", import.meta.url), "utf8");
      const built = Object.keys(bundle)
        .filter((name) => !name.endsWith(".html") && !name.endsWith(".map"))
        .map((name) => "/" + name.replace(/\\/g, "/"));
      const precache = [...new Set([...CORE, ...built])];
      const source = template.replace("__CACHE_NAME__", CACHE_NAME).replace("__PRECACHE__", JSON.stringify(precache));
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        main: root + "index.html",
        classic: root + "classic/index.html",
      },
    },
  },
});
