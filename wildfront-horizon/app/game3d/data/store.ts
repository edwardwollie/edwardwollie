// Gear Locker catalogue. Field Kit upgrades keep the v2.0.3 names, effects
// and prices (120 × (level+1), max level 3).

import { RIFLES } from "../blueprints/gear.ts";

export const UPGRADE_INFO = {
  optics: { label: "Quantum Optics", detail: "Less sway + stronger scope zoom", icon: "◎" },
  stability: { label: "Kinetic Stock", detail: "Longer steady-breath control + faster reload", icon: "⌁" },
  tracking: { label: "Trail Scanner", detail: "Longer scans + brighter fresh sign", icon: "◇" },
} as const;

export interface StoreItem { id: string; kind: "rifle" | "camo" | "caller" | "scent"; name: string; detail: string; price: number; blueprint?: string; value?: number }

export const STORE: StoreItem[] = [
  ...RIFLES.map(r => ({ id: r.id, kind: "rifle" as const, name: r.title, detail: `${r.ballistics.caliber} · ${r.scope.minMag}–${r.scope.maxMag}× · ${r.ballistics.mv} m/s`, price: r.price, blueprint: r.id })),
  { id: "camo-forest", kind: "camo", name: "Forest Fleece", detail: "Quiet fleece in a broken leaf pattern · visibility −10 %", price: 0, value: 0.1 },
  { id: "camo-ghillie", kind: "camo", name: "Ghillie Wrap", detail: "Burlap-thread ghillie · visibility −35 % (crouched or prone)", price: 300, value: 0.35 },
  { id: "caller", kind: "caller", name: "Game Caller", detail: "Grunt / bugle / roar reeds — call game in (T)", price: 180, blueprint: "game-caller" },
  { id: "scent", kind: "scent", name: "Scent Blocker", detail: "Carbon suit + spray · scent range −35 %", price: 150 },
];
export const STORE_BY_ID: Record<string, StoreItem> = Object.fromEntries(STORE.map(s => [s.id, s]));
