import "@fontsource-variable/fredoka";
import "./ui/v3.css";
import { createRoot } from "react-dom/client";
import { Game } from "./app/game.ts";
import { installQA } from "./app/qa.ts";
import { bindKeyboard } from "./engine/input.ts";
import { SCENES } from "./scenes/index.ts";
import { App } from "./ui/App.tsx";

function webgl2() {
  try {
    const canvas = document.createElement("canvas");
    return !!canvas.getContext("webgl2");
  } catch {
    return false;
  }
}

function fallback() {
  const boot = document.getElementById("boot");
  if (boot) {
    boot.innerHTML = '<div class="b" style="max-width:520px;padding:24px;text-align:center"><b>SPACEFLIGHT ACADEMY</b><p style="color:#c7d4ff;font-size:17px;line-height:1.5">This device can\'t show 3D graphics, so we\'re opening the Classic edition. Your progress comes with you!</p><p><a href="/classic/" style="color:#62e8ff;font-size:20px">Open Classic now →</a></p></div>';
  }
  window.setTimeout(() => location.replace("/classic/"), 4000);
}

async function boot() {
  if (!webgl2() && !new URLSearchParams(location.search).has("force3d")) {
    fallback();
    return;
  }
  const root = document.getElementById("root")!;
  const stage = document.createElement("div");
  stage.className = "sfa-stage";
  const ui = document.createElement("div");
  ui.className = "sfa-ui";
  root.append(stage, ui);
  bindKeyboard();
  try {
    await document.fonts?.load("700 32px 'Fredoka Variable'");
  } catch { /* fonts are optional */ }
  const game = new Game(stage, SCENES);
  // Test helpers (window.__sfa) only in development or with ?qa=1.
  if (import.meta.env.DEV || new URLSearchParams(location.search).has("qa")) installQA(game);
  createRoot(ui).render(<App game={game} />);
  await game.start();
  document.getElementById("boot")?.classList.add("gone");
  window.setTimeout(() => document.getElementById("boot")?.remove(), 800);
}

void boot();

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => undefined));
}
