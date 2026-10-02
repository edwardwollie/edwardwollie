// 3D Blueprint Hangar: inspect every unit's exact in-game mesh from any side,
// preview its rig, switch to blueprint ink, and download its plate, GLB or the full atlas.

import { MODELS, MODEL_GROUPS } from "./blueprints/models.js";

const ATLAS = "/assets/blueprints/Neon-Dominion-3D-Blueprint-Atlas-v3.0.0.pdf";
const VIEW_BUTTONS = [
  ["front", "FRONT"], ["rear", "REAR"], ["left", "LEFT"], ["right", "RIGHT"],
  ["top", "TOP"], ["bottom", "UNDER"], ["quarterFront", "QUARTER"]
];
const POSES = [["rest", "REST"], ["advance", "MOVE"], ["aim", "AIM / FIRE"], ["special", "SPECIAL"]];

export function setupHangar({ renderer, canvas, screen, onClose, audio }) {
  const $ = (selector) => screen.querySelector(selector);
  const list = $("[data-hangar-list]");
  const views = $("[data-hangar-views]");
  const poses = $("[data-hangar-poses]");
  const info = {
    designation: $("[data-hangar-designation]"),
    name: $("[data-hangar-name]"),
    role: $("[data-hangar-role]"),
    dims: $("[data-hangar-dims]"),
    plate: $("[data-hangar-plate]"),
    glb: $("[data-hangar-glb]")
  };
  $("[data-hangar-atlas]").href = ATLAS;
  let plates = [];
  fetch("/assets/blueprints/plates/index.json").then((response) => (response.ok ? response.json() : [])).then((data) => {
    plates = data;
    select(current);
  }).catch(() => {});

  let current = "commander";
  const style = { ink: false, wire: false, spin: true };

  function button(label, onClick, extra = "") {
    const element = document.createElement("button");
    element.type = "button";
    element.className = `hangar-chip ${extra}`;
    element.textContent = label;
    element.addEventListener("click", () => {
      audio?.unlock();
      onClick(element);
    });
    return element;
  }

  for (const group of MODEL_GROUPS) {
    const heading = document.createElement("h4");
    heading.textContent = group.title;
    list.append(heading);
    for (const id of group.ids) {
      const spec = MODELS[id];
      const element = button(`${spec.designation}  ${spec.name.replace(/ (Drone|Exo-Frame|Walker|Charger|Shieldbearer|Jammer|Splitter|Brute|Emplacement|Colossus|Pylon|Cluster|Outcrop|Wreck)$/i, "")}`, () => select(id), "unit");
      element.dataset.unit = id;
      list.append(element);
    }
  }
  for (const [key, label] of VIEW_BUTTONS) views.append(button(label, () => renderer.setHangarView(key)));
  for (const [key, label] of POSES) {
    const element = button(label, (target) => {
      renderer.setHangarPose(key);
      for (const chip of poses.querySelectorAll(".hangar-chip")) chip.classList.toggle("active", chip === target);
    });
    if (key === "rest") element.classList.add("active");
    poses.append(element);
  }
  for (const toggle of screen.querySelectorAll("[data-hangar-toggle]")) {
    toggle.addEventListener("click", () => {
      const key = toggle.dataset.hangarToggle;
      style[key] = !style[key];
      toggle.setAttribute("aria-pressed", String(style[key]));
      renderer.setHangarStyle({ [key]: style[key] });
    });
  }

  function select(id) {
    current = id;
    const { spec, size } = renderer.hangarActive ? renderer.setHangarModel(id) : { spec: MODELS[id], size: null };
    for (const chip of list.querySelectorAll(".hangar-chip")) chip.classList.toggle("active", chip.dataset.unit === id);
    info.designation.textContent = `${spec.designation} // ${spec.faction.toUpperCase()}`;
    info.name.textContent = spec.name;
    info.role.textContent = spec.role;
    if (size) {
      info.dims.replaceChildren(...[
        ["WIDTH", `${size.width.toFixed(2)} m`], ["HEIGHT", `${size.height.toFixed(2)} m`], ["LENGTH", `${size.length.toFixed(2)} m`],
        ["HIT RADIUS", `${(spec.simRadius / 25).toFixed(2)} m`], ["TRIANGLES", size.triangles.toLocaleString("en-US")], ["JOINTS", String(size.pivots - 1)]
      ].map(([label, value]) => {
        const row = document.createElement("div");
        const name = document.createElement("span");
        const amount = document.createElement("b");
        name.textContent = label;
        amount.textContent = value;
        row.append(name, amount);
        return row;
      }));
    }
    const plate = plates.find((item) => item.id === id);
    info.plate.classList.toggle("hidden", !plate);
    if (plate) info.plate.href = `/assets/blueprints/plates/${plate.key}.jpg`;
    info.glb.href = `/assets/blueprints/models/${id}.glb`;
    info.glb.download = `neon-dominion-${id}.glb`;
  }

  // Orbit / zoom on the 3D canvas while the hangar is open.
  const pointers = new Map();
  let pinch = 0;
  canvas.addEventListener("pointerdown", (event) => {
    if (!renderer.hangarActive) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    canvas.setPointerCapture(event.pointerId);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!renderer.hangarActive || !pointers.has(event.pointerId)) return;
    const last = pointers.get(event.pointerId);
    const next = { x: event.clientX, y: event.clientY };
    pointers.set(event.pointerId, next);
    if (pointers.size === 1) renderer.hangarOrbit(next.x - last.x, next.y - last.y);
    else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0) renderer.hangarZoom(pinch / Math.max(1, distance));
      pinch = distance;
    }
  });
  const release = (event) => {
    pointers.delete(event.pointerId);
    pinch = 0;
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("wheel", (event) => {
    if (!renderer.hangarActive) return;
    event.preventDefault();
    renderer.hangarZoom(Math.exp(event.deltaY * 0.0012));
  }, { passive: false });

  $("[data-hangar-close]").addEventListener("click", close);

  function open(id = current) {
    renderer.enterHangar(id);
    screen.classList.remove("hidden");
    document.body.classList.add("in-hangar");
    style.ink = false;
    style.wire = false;
    style.spin = true;
    for (const toggle of screen.querySelectorAll("[data-hangar-toggle]")) toggle.setAttribute("aria-pressed", String(style[toggle.dataset.hangarToggle]));
    renderer.setHangarStyle(style);
    select(id);
  }

  function close() {
    renderer.exitHangar();
    screen.classList.add("hidden");
    document.body.classList.remove("in-hangar");
    onClose?.();
  }

  return { open, close, isOpen: () => renderer.hangarActive };
}
