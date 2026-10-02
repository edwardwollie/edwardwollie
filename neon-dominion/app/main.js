import { SynthAudio } from "./audio.js";
import { RiftCommandGame } from "./game.js";
import { Renderer3D } from "./render3d.js";
import { setupHangar } from "./hangar.js";

const SAVE_KEY = "flexzonic.neonDominion.save.v1";
const MAX_UPGRADE_LEVEL = 5;
const BASE_COSTS = { damage: 120, armor: 150, squad: 180 };
const GRAPHICS = ["auto", "high", "medium", "low"];

const $ = (id) => document.getElementById(id);
const format = (value) => Math.max(0, Math.floor(value)).toLocaleString("en-US");
const pad = (value) => String(value).padStart(2, "0");

const elements = {
  canvas: $("gameCanvas"),
  hud: $("hud"),
  menu: $("menuScreen"),
  tutorial: $("tutorialScreen"),
  upgrades: $("upgradeScreen"),
  pause: $("pauseScreen"),
  result: $("resultScreen"),
  menuSector: $("menuSector"),
  bestScore: $("bestScore"),
  menuCredits: $("menuCredits"),
  vaultCredits: $("vaultCredits"),
  play: $("playButton"),
  upgrade: $("upgradeButton"),
  how: $("howButton"),
  tutorialDeploy: $("tutorialDeploy"),
  pauseButton: $("pauseButton"),
  resume: $("resumeButton"),
  restart: $("restartButton"),
  quit: $("quitButton"),
  sound: $("soundToggle"),
  haptic: $("hapticToggle"),
  resultKicker: $("resultKicker"),
  resultTitle: $("resultTitle"),
  resultEmblem: $("resultEmblem"),
  resultScore: $("resultScore"),
  resultKills: $("resultKills"),
  resultCores: $("resultCores"),
  resultCredits: $("resultCredits"),
  next: $("nextButton"),
  retry: $("retryButton"),
  resultMenu: $("resultMenuButton"),
  pauseSector: $("pauseSector"),
  pauseScore: $("pauseScore"),
  pauseSquad: $("pauseSquad"),
  joystickZone: $("joystickZone"),
  joystickBase: $("joystickBase"),
  joystickThumb: $("joystickThumb"),
  nova: $("novaButton"),
  stance: $("stanceButton"),
  toast: $("toast"),
  install: $("installButton"),
  graphics: $("graphicsToggle"),
  hangarButton: $("hangarButton"),
  hangarScreen: $("hangarScreen"),
  boot: $("bootScreen"),
  bootStatus: $("bootStatus")
};

function defaultSave() {
  return {
    credits: 0,
    unlockedSector: 1,
    bestScore: 0,
    tutorialSeen: false,
    upgrades: { damage: 0, armor: 0, squad: 0 },
    settings: { sound: true, haptics: true, graphics: "auto" }
  };
}

function loadSave() {
  const fallback = defaultSave();
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return fallback;
    return {
      credits: Math.max(0, Number(parsed.credits) || 0),
      unlockedSector: Math.max(1, Math.min(99, Math.floor(parsed.unlockedSector) || 1)),
      bestScore: Math.max(0, Number(parsed.bestScore) || 0),
      tutorialSeen: Boolean(parsed.tutorialSeen),
      upgrades: {
        damage: Math.max(0, Math.min(MAX_UPGRADE_LEVEL, Math.floor(parsed.upgrades?.damage) || 0)),
        armor: Math.max(0, Math.min(MAX_UPGRADE_LEVEL, Math.floor(parsed.upgrades?.armor) || 0)),
        squad: Math.max(0, Math.min(MAX_UPGRADE_LEVEL, Math.floor(parsed.upgrades?.squad) || 0))
      },
      settings: {
        sound: parsed.settings?.sound !== false,
        haptics: parsed.settings?.haptics !== false,
        graphics: GRAPHICS.includes(parsed.settings?.graphics) ? parsed.settings.graphics : "auto"
      }
    };
  } catch {
    return fallback;
  }
}

let save = loadSave();
let currentSector = save.unlockedSector;
let lastResult = null;
let toastTimer = 0;
let deferredInstallPrompt = null;
let joystickPointer = null;
let keyboardInput = { x: 0, y: 0 };
const pressedKeys = new Set();

const audio = new SynthAudio();
audio.setEnabled(save.settings.sound);

const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
let renderer = null;
if (Renderer3D.isSupported()) {
  try {
    renderer = new Renderer3D(elements.canvas, { quality: save.settings.graphics, reducedMotion });
    document.body.classList.add("webgl");
  } catch (error) {
    console.warn("3D renderer unavailable, using classic 2D view", error);
    renderer = null;
  }
}

const game = new RiftCommandGame(elements.canvas, audio, {
  onToast: showToast,
  onFinish: showResults,
  onHaptic: vibrate
}, { renderer });

const hangar = renderer
  ? setupHangar({ renderer, canvas: elements.canvas, screen: elements.hangarScreen, audio, onClose: () => elements.menu.classList.add("active") })
  : null;
if (!hangar) elements.hangarButton.classList.add("hidden");
elements.boot.classList.add("done");
window.__neonDominion = { game, renderer };

function writeSave() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    showToast("SAVE STORAGE UNAVAILABLE", "danger");
  }
}

function vibrate(pattern) {
  if (!save.settings.haptics || !navigator.vibrate) return;
  navigator.vibrate(pattern);
}

function showToast(message, type = "normal") {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle("danger", type === "danger");
  elements.toast.classList.add("visible");
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("visible"), 1750);
}

function hideAllModals() {
  elements.tutorial.classList.add("hidden");
  elements.upgrades.classList.add("hidden");
  elements.pause.classList.add("hidden");
  elements.result.classList.add("hidden");
}

function refreshMenu() {
  elements.menuSector.textContent = `SECTOR ${pad(save.unlockedSector)}`;
  elements.bestScore.textContent = format(save.bestScore);
  elements.menuCredits.textContent = format(save.credits);
  elements.vaultCredits.textContent = format(save.credits);
  refreshUpgrades();
  refreshSettings();
}

function showMenu() {
  hideAllModals();
  elements.hud.classList.add("hidden");
  elements.menu.classList.add("active");
  currentSector = save.unlockedSector;
  game.showMenu();
  resetJoystick();
  refreshMenu();
}

function beginSector(sector) {
  audio.unlock();
  hideAllModals();
  currentSector = Math.max(1, Math.min(99, Math.floor(sector) || 1));
  elements.menu.classList.remove("active");
  elements.hud.classList.remove("hidden");
  resetJoystick();
  game.start(currentSector, save.upgrades);
}

function requestDeploy() {
  audio.unlock();
  if (!save.tutorialSeen) {
    elements.tutorial.classList.remove("hidden");
    return;
  }
  beginSector(save.unlockedSector);
}

function openTutorial() {
  audio.unlock();
  elements.tutorial.classList.remove("hidden");
}

function upgradeCost(type, level = save.upgrades[type]) {
  return Math.round(BASE_COSTS[type] * (1 + level * 0.72));
}

function refreshUpgrades() {
  elements.vaultCredits.textContent = format(save.credits);
  for (const type of Object.keys(BASE_COSTS)) {
    const level = save.upgrades[type];
    const pips = document.querySelector(`[data-pips="${type}"]`);
    const button = document.querySelector(`[data-buy="${type}"]`);
    if (pips) {
      pips.replaceChildren();
      for (let index = 0; index < MAX_UPGRADE_LEVEL; index += 1) {
        const pip = document.createElement("i");
        pip.classList.toggle("active", index < level);
        pips.append(pip);
      }
    }
    if (button) {
      const cost = upgradeCost(type, level);
      const costLabel = button.querySelector("span");
      costLabel.textContent = level >= MAX_UPGRADE_LEVEL ? "MAX" : format(cost);
      button.disabled = level >= MAX_UPGRADE_LEVEL || save.credits < cost;
      button.setAttribute("aria-label", level >= MAX_UPGRADE_LEVEL
        ? `${type} upgrade at maximum level`
        : `Upgrade ${type} for ${cost} credits`);
    }
  }
}

function buyUpgrade(type) {
  if (!(type in BASE_COSTS)) return;
  const level = save.upgrades[type];
  if (level >= MAX_UPGRADE_LEVEL) return;
  const cost = upgradeCost(type, level);
  if (save.credits < cost) {
    showToast("INSUFFICIENT ENERGY CREDITS", "danger");
    return;
  }
  audio.unlock();
  save.credits -= cost;
  save.upgrades[type] += 1;
  writeSave();
  refreshMenu();
  audio.gate(true);
  vibrate([18, 20, 28]);
  const labels = { damage: "ION ACCELERATORS", armor: "QUANTUM PLATING", squad: "DRONE UPLINK" };
  showToast(`${labels[type]} // LEVEL ${save.upgrades[type]}`);
}

function refreshSettings() {
  elements.sound.setAttribute("aria-pressed", String(save.settings.sound));
  elements.sound.querySelector("b").textContent = save.settings.sound ? "ON" : "OFF";
  elements.haptic.setAttribute("aria-pressed", String(save.settings.haptics));
  elements.haptic.querySelector("b").textContent = save.settings.haptics ? "ON" : "OFF";
  elements.graphics.querySelector("b").textContent = renderer ? save.settings.graphics.toUpperCase() : "2D";
  elements.graphics.disabled = !renderer;
}

function pauseGame() {
  if (!game.pause()) return;
  const state = game.getState();
  elements.pauseSector.textContent = pad(state.sector);
  elements.pauseScore.textContent = format(state.score);
  elements.pauseSquad.textContent = String(state.squad);
  elements.pause.classList.remove("hidden");
  resetJoystick();
}

function resumeGame() {
  elements.pause.classList.add("hidden");
  game.resume();
}

function showResults(result) {
  lastResult = result;
  save.credits += result.credits;
  save.bestScore = Math.max(save.bestScore, result.score);
  if (result.success) save.unlockedSector = Math.max(save.unlockedSector, Math.min(99, result.sector + 1));
  writeSave();
  elements.hud.classList.add("hidden");
  elements.result.classList.remove("hidden");
  elements.resultKicker.textContent = result.success ? "RIFT SECURED" : "COMMAND SIGNAL LOST";
  elements.resultTitle.textContent = result.success ? "Sector complete" : "Squad eliminated";
  elements.resultEmblem.textContent = result.success ? "✦" : "×";
  elements.resultEmblem.classList.toggle("defeat", !result.success);
  elements.resultScore.textContent = format(result.score);
  elements.resultKills.textContent = format(result.kills);
  elements.resultCores.textContent = format(result.cores);
  elements.resultCredits.textContent = `+${format(result.credits)}`;
  elements.next.classList.toggle("hidden", !result.success);
  elements.retry.classList.toggle("hidden", result.success);
}

function closeModal(id) {
  const modal = $(id);
  if (!modal) return;
  modal.classList.add("hidden");
}

function resetJoystick() {
  joystickPointer = null;
  elements.joystickZone.classList.remove("active");
  elements.joystickThumb.style.transform = "translate(-50%, -50%)";
  keyboardInput = computeKeyboardInput();
  game.setMoveInput(keyboardInput.x, keyboardInput.y);
}

function updateJoystick(event) {
  const rect = elements.joystickBase.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  let dx = event.clientX - centerX;
  let dy = event.clientY - centerY;
  const radius = rect.width * 0.32;
  const length = Math.hypot(dx, dy);
  if (length > radius) {
    dx = (dx / length) * radius;
    dy = (dy / length) * radius;
  }
  const normalizedX = dx / radius;
  const normalizedY = dy / radius;
  elements.joystickThumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  game.setMoveInput(normalizedX, normalizedY);
}

function computeKeyboardInput() {
  const left = pressedKeys.has("ArrowLeft") || pressedKeys.has("KeyA");
  const right = pressedKeys.has("ArrowRight") || pressedKeys.has("KeyD");
  const up = pressedKeys.has("ArrowUp") || pressedKeys.has("KeyW");
  const down = pressedKeys.has("ArrowDown") || pressedKeys.has("KeyS");
  const x = Number(right) - Number(left);
  const y = Number(down) - Number(up);
  const magnitude = Math.hypot(x, y);
  return magnitude > 1 ? { x: x / magnitude, y: y / magnitude } : { x, y };
}

elements.play.addEventListener("click", requestDeploy);
elements.how.addEventListener("click", openTutorial);
elements.upgrade.addEventListener("click", () => {
  audio.unlock();
  refreshUpgrades();
  elements.upgrades.classList.remove("hidden");
});
elements.tutorialDeploy.addEventListener("click", () => {
  save.tutorialSeen = true;
  writeSave();
  beginSector(save.unlockedSector);
});
elements.pauseButton.addEventListener("click", pauseGame);
elements.resume.addEventListener("click", resumeGame);
elements.restart.addEventListener("click", () => beginSector(currentSector));
elements.quit.addEventListener("click", showMenu);
elements.resultMenu.addEventListener("click", showMenu);
elements.next.addEventListener("click", () => beginSector(Math.min(99, (lastResult?.sector || currentSector) + 1)));
elements.retry.addEventListener("click", () => beginSector(lastResult?.sector || currentSector));
elements.nova.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  audio.unlock();
  game.activateNova();
});
elements.stance.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  audio.unlock();
  game.cycleStance();
});

for (const button of document.querySelectorAll("[data-buy]")) {
  button.addEventListener("click", () => buyUpgrade(button.dataset.buy));
}

for (const button of document.querySelectorAll("[data-close]")) {
  button.addEventListener("click", () => closeModal(button.dataset.close));
}

elements.sound.addEventListener("click", () => {
  save.settings.sound = !save.settings.sound;
  audio.setEnabled(save.settings.sound);
  if (save.settings.sound) audio.unlock();
  writeSave();
  refreshSettings();
});

elements.haptic.addEventListener("click", () => {
  save.settings.haptics = !save.settings.haptics;
  writeSave();
  refreshSettings();
  if (save.settings.haptics) vibrate(25);
});

elements.graphics.addEventListener("click", () => {
  if (!renderer) return;
  const next = GRAPHICS[(GRAPHICS.indexOf(save.settings.graphics) + 1) % GRAPHICS.length];
  save.settings.graphics = next;
  renderer.setQuality(next);
  writeSave();
  refreshSettings();
  showToast(`GRAPHICS // ${next.toUpperCase()}${next === "auto" ? ` (${renderer.tier.toUpperCase()})` : ""}`);
});

elements.hangarButton.addEventListener("click", () => {
  if (!hangar) return;
  audio.unlock();
  elements.menu.classList.remove("active");
  hangar.open();
});

elements.joystickZone.addEventListener("pointerdown", (event) => {
  if (game.mode !== "playing") return;
  event.preventDefault();
  audio.unlock();
  joystickPointer = event.pointerId;
  elements.joystickZone.setPointerCapture(event.pointerId);
  elements.joystickZone.classList.add("active");
  updateJoystick(event);
});

elements.joystickZone.addEventListener("pointermove", (event) => {
  if (event.pointerId !== joystickPointer) return;
  event.preventDefault();
  updateJoystick(event);
});

const endJoystick = (event) => {
  if (event.pointerId !== joystickPointer) return;
  event.preventDefault();
  resetJoystick();
};

elements.joystickZone.addEventListener("pointerup", endJoystick);
elements.joystickZone.addEventListener("pointercancel", endJoystick);
elements.joystickZone.addEventListener("lostpointercapture", () => {
  if (joystickPointer !== null) resetJoystick();
});

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
  if (event.repeat && event.code === "Space") return;
  pressedKeys.add(event.code);
  if (event.code === "Space") {
    audio.unlock();
    game.activateNova();
  } else if (event.code === "KeyF") {
    audio.unlock();
    game.cycleStance();
  } else if (event.code === "Escape" || event.code === "KeyP") {
    if (hangar?.isOpen()) hangar.close();
    else if (game.mode === "playing") pauseGame();
    else if (game.mode === "paused") resumeGame();
  }
  if (joystickPointer === null) {
    keyboardInput = computeKeyboardInput();
    game.setMoveInput(keyboardInput.x, keyboardInput.y);
  }
});

window.addEventListener("keyup", (event) => {
  pressedKeys.delete(event.code);
  if (joystickPointer === null) {
    keyboardInput = computeKeyboardInput();
    game.setMoveInput(keyboardInput.x, keyboardInput.y);
  }
});

window.addEventListener("blur", () => {
  pressedKeys.clear();
  resetJoystick();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && game.mode === "playing") pauseGame();
});

document.addEventListener("contextmenu", (event) => event.preventDefault());

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  elements.install.classList.remove("hidden");
});

elements.install.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  elements.install.classList.add("hidden");
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  elements.install.classList.add("hidden");
  showToast("NEON DOMINION INSTALLED");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // The game remains fully playable online if service-worker registration is unavailable.
    });
  });
}

refreshMenu();
showMenu();
