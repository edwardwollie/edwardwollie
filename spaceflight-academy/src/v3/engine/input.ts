/**
 * Keyboard + virtual joystick input. Scenes poll `axis()` and read edge-triggered
 * `pressed()` presses once per frame; the React layer feeds the on-screen joystick.
 */
const down = new Set<string>();
const pressedQueue = new Set<string>();
let joyX = 0, joyY = 0;
let boostHeld = false;
let enabled = true;

function keyName(event: KeyboardEvent) {
  if (event.code === "Space") return "space";
  return event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase();
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

export function bindKeyboard() {
  window.addEventListener("keydown", (event) => {
    if (!enabled || isTyping(event.target)) return;
    const key = keyName(event);
    if (!down.has(key)) pressedQueue.add(key);
    down.add(key);
    if (["space", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) event.preventDefault();
  });
  window.addEventListener("keyup", (event) => {
    down.delete(keyName(event));
  });
  window.addEventListener("blur", () => {
    down.clear();
    joyX = joyY = 0;
    boostHeld = false;
  });
}

export const input = {
  isDown(...keys: string[]) {
    return keys.some((key) => down.has(key));
  },
  /** True once per physical key press (consumed). */
  pressed(...keys: string[]) {
    for (const key of keys) {
      if (pressedQueue.has(key)) {
        pressedQueue.delete(key);
        return true;
      }
    }
    return false;
  },
  /** Movement axis from WASD/arrows plus the on-screen joystick (x right, y forward). */
  axis() {
    let x = joyX, y = joyY;
    if (down.has("a") || down.has("arrowleft")) x -= 1;
    if (down.has("d") || down.has("arrowright")) x += 1;
    if (down.has("w") || down.has("arrowup")) y += 1;
    if (down.has("s") || down.has("arrowdown")) y -= 1;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  },
  setJoystick(x: number, y: number) {
    joyX = x;
    joyY = y;
  },
  setBoost(held: boolean) {
    boostHeld = held;
  },
  get boostHeld() {
    return boostHeld || down.has("space") || down.has("enter");
  },
  clearPresses() {
    pressedQueue.clear();
  },
  setEnabled(value: boolean) {
    enabled = value;
    if (!value) { down.clear(); pressedQueue.clear(); }
  },
};
