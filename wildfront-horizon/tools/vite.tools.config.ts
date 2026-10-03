// Stand-alone Vite server for the blueprint tools (model preview, blueprint
// book sheets, view export). It imports the very same modules the game uses.
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const here = fileURLToPath(new URL(".", import.meta.url));
export default defineConfig({
  root: here,
  logLevel: "warn",
  server: { host: "127.0.0.1", port: Number(process.env.TOOLS_PORT || 5199), strictPort: true, fs: { allow: [resolve(here, "..")] } },
  build: {
    outDir: resolve(here, "../.tools-dist"), emptyOutDir: true,
    rollupOptions: { input: { preview: resolve(here, "preview/index.html"), book: resolve(here, "blueprint-book/index.html"), world: resolve(here, "world/index.html"), hunt: resolve(here, "hunt/index.html"), showcase: resolve(here, "showcase/index.html") } },
  },
});
