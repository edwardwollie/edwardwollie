// Unified input: keyboard + mouse (pointer lock), touch (virtual stick and
// look-drag, fed by the HUD), and gamepads. Exposes per-frame held / pressed
// action sets and analogue move / look vectors.

export type Action =
  | "fire" | "aim" | "zoom" | "zoomIn" | "zoomOut" | "steady" | "sprint" | "crouch" | "prone" | "reload"
  | "scan" | "binoculars" | "interact" | "call" | "map" | "pause" | "journal" | "hud" | "range";

const KEYMAP: Record<string, Action[]> = {
  KeyQ: ["zoom"], KeyE: ["scan"], KeyR: ["reload"], ShiftLeft: ["steady", "sprint"], ShiftRight: ["steady", "sprint"], Space: ["steady"],
  KeyC: ["crouch"], ControlLeft: ["crouch"], KeyZ: ["prone"], KeyX: ["prone"], KeyB: ["binoculars"], KeyF: ["interact"], KeyT: ["call"], KeyM: ["map"],
  Escape: ["pause"], KeyP: ["pause"], KeyJ: ["journal"], KeyH: ["hud"], KeyV: ["range"],
};
const MOVEKEYS: Record<string, [number, number]> = { KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };

export interface InputSettings { sensitivity: number; scopedSensitivity: number; invertY: boolean; aimHold: boolean; touchSensitivity: number }

export class Input {
  held = new Set<Action>();
  pressed = new Set<Action>();
  released = new Set<Action>();
  move = { x: 0, y: 0 };
  look = { x: 0, y: 0 };
  wheel = 0;
  locked = false;
  usingTouch = false;
  usingPad = false;
  enabled = true;
  settings: InputSettings = { sensitivity: 1, scopedSensitivity: 0.55, invertY: false, aimHold: true, touchSensitivity: 1 };
  private keys = new Set<string>();
  private vMove = { x: 0, y: 0 };
  private vHeld = new Set<Action>();
  private padPrev: boolean[] = [];
  private canvas: HTMLElement;
  /** called when the canvas is clicked while unlocked (request pointer lock) */
  onLockRequest?: () => void;
  onUnlock?: () => void;
  constructor(canvas: HTMLElement) { this.canvas = canvas; }

  attach() {
    window.addEventListener("keydown", this.kd);
    window.addEventListener("keyup", this.ku);
    window.addEventListener("blur", this.blur);
    this.canvas.addEventListener("mousedown", this.md);
    window.addEventListener("mouseup", this.mu);
    window.addEventListener("mousemove", this.mm);
    this.canvas.addEventListener("wheel", this.wh, { passive: false });
    this.canvas.addEventListener("contextmenu", this.cm);
    document.addEventListener("pointerlockchange", this.plc);
  }
  detach() {
    window.removeEventListener("keydown", this.kd);
    window.removeEventListener("keyup", this.ku);
    window.removeEventListener("blur", this.blur);
    this.canvas.removeEventListener("mousedown", this.md);
    window.removeEventListener("mouseup", this.mu);
    window.removeEventListener("mousemove", this.mm);
    this.canvas.removeEventListener("wheel", this.wh);
    this.canvas.removeEventListener("contextmenu", this.cm);
    document.removeEventListener("pointerlockchange", this.plc);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock?.();
  }

  private press(a: Action) { if (!this.held.has(a)) { this.held.add(a); this.pressed.add(a); } }
  private release(a: Action) { if (this.held.has(a)) { this.held.delete(a); this.released.add(a); } }

  private kd = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
    if (e.repeat && !MOVEKEYS[e.code]) { if (KEYMAP[e.code]) e.preventDefault(); return; }
    this.keys.add(e.code);
    for (const a of KEYMAP[e.code] ?? []) this.press(a);
    if (KEYMAP[e.code] || MOVEKEYS[e.code] || e.code === "Tab") e.preventDefault();
    this.usingTouch = false;
  };
  private ku = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    for (const a of KEYMAP[e.code] ?? []) {
      // a shared action (steady) stays held while any bound key is down
      const still = Object.entries(KEYMAP).some(([k, acts]) => k !== e.code && this.keys.has(k) && acts.includes(a));
      if (!still) this.release(a);
    }
  };
  private blur = () => { this.keys.clear(); for (const a of [...this.held]) this.release(a); };
  private md = (e: MouseEvent) => {
    if (!this.enabled) return;
    this.usingTouch = false;
    if (!this.locked) { this.onLockRequest?.(); if (e.button === 2) this.press("aim"); return; }
    if (e.button === 0) this.press("fire");
    if (e.button === 2) this.press("aim");
    if (e.button === 1) this.press("zoom");
  };
  private mu = (e: MouseEvent) => {
    if (e.button === 0) this.release("fire");
    if (e.button === 2) this.release("aim");
    if (e.button === 1) this.release("zoom");
  };
  private mm = (e: MouseEvent) => {
    if (!this.locked || !this.enabled) return;
    this.look.x += e.movementX * this.settings.sensitivity;
    this.look.y += e.movementY * this.settings.sensitivity * (this.settings.invertY ? -1 : 1);
  };
  private wh = (e: WheelEvent) => { e.preventDefault(); this.wheel += Math.sign(e.deltaY); };
  private cm = (e: Event) => e.preventDefault();
  private plc = () => {
    const was = this.locked;
    this.locked = document.pointerLockElement === this.canvas;
    if (was && !this.locked) { this.blur(); this.onUnlock?.(); }
  };

  requestLock() {
    try { const r = (this.canvas as HTMLElement & { requestPointerLock: (o?: unknown) => Promise<void> | void }).requestPointerLock?.(); if (r && typeof (r as Promise<void>).catch === "function") (r as Promise<void>).catch(() => {}); } catch { /* ignore */ }
  }

  // ---- virtual (touch HUD) API
  setVirtualMove(x: number, y: number) { this.vMove.x = x; this.vMove.y = y; this.usingTouch = true; }
  addVirtualLook(dx: number, dy: number) { this.look.x += dx * this.settings.touchSensitivity; this.look.y += dy * this.settings.touchSensitivity * (this.settings.invertY ? -1 : 1); this.usingTouch = true; }
  virtual(a: Action, down: boolean) { if (down) { this.vHeld.add(a); this.press(a); } else { this.vHeld.delete(a); this.release(a); } this.usingTouch = true; }
  tap(a: Action) { this.press(a); this.releaseNextFrame.add(a); this.usingTouch = true; }
  private releaseNextFrame = new Set<Action>();

  /** Gather keyboard/pad state at the start of a frame. */
  poll() {
    let mx = 0, my = 0;
    for (const k of this.keys) { const m = MOVEKEYS[k]; if (m) { mx += m[0]; my += m[1]; } }
    mx += this.vMove.x; my += this.vMove.y;
    // gamepad
    const pads = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      const dz = (v: number) => (Math.abs(v) < 0.16 ? 0 : (v - Math.sign(v) * 0.16) / 0.84);
      const lx = dz(gp.axes[0] ?? 0), ly = dz(gp.axes[1] ?? 0), rx = dz(gp.axes[2] ?? 0), ry = dz(gp.axes[3] ?? 0);
      if (lx || ly || rx || ry) this.usingPad = true;
      mx += lx; my -= ly;
      this.look.x += rx * Math.abs(rx) * 14 * this.settings.sensitivity;
      this.look.y += ry * Math.abs(ry) * 10 * this.settings.sensitivity * (this.settings.invertY ? -1 : 1);
      const map: (Action | null)[] = ["interact", "crouch", "reload", "scan", "binoculars", "steady", "aim", "fire", "map", "pause", "sprint", "zoom", "call", "prone", "zoomOut", "zoomIn"];
      gp.buttons.forEach((b, i) => {
        const a = map[i]; if (!a) return;
        const down = b.pressed || b.value > 0.5;
        if (down && !this.padPrev[i]) { this.press(a); this.usingPad = true; }
        if (!down && this.padPrev[i]) this.release(a);
        this.padPrev[i] = down;
      });
    }
    const l = Math.hypot(mx, my);
    this.move.x = l > 1 ? mx / l : mx; this.move.y = l > 1 ? my / l : my;
    if (this.wheel !== 0) { if (this.wheel < 0) this.press("zoomIn"); else this.press("zoomOut"); this.releaseNextFrame.add(this.wheel < 0 ? "zoomIn" : "zoomOut"); this.wheel = 0; }
  }

  /** Clear per-frame edges and deltas at the end of a frame. */
  endFrame() {
    this.pressed.clear(); this.released.clear();
    this.look.x = 0; this.look.y = 0;
    for (const a of this.releaseNextFrame) { if (!this.vHeld.has(a)) this.held.delete(a); }
    this.releaseNextFrame.clear();
  }
  isDown(a: Action) { return this.held.has(a); }
  wasPressed(a: Action) { return this.pressed.has(a); }
}
