import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Game, UIState } from "../app/game.ts";
import { useStore } from "../app/store.ts";
import { input } from "../engine/input.ts";
import { rankFor, totalStars, type Save } from "../state/save.ts";

export const GameContext = createContext<Game | null>(null);

export function useGame(): Game {
  const game = useContext(GameContext);
  if (!game) throw new Error("GameContext missing");
  return game;
}

export function useUI<S>(selector: (state: UIState) => S): S {
  return useStore(useGame().ui, selector);
}

export function useSave<S>(selector: (state: Save) => S): S {
  return useStore(useGame().save, selector);
}

export function Stars({ count, max = 3 }: { count: number; max?: number }) {
  return <span className="stars" aria-label={`${count} of ${max} stars`}>{"★".repeat(count)}<span style={{ opacity: 0.25 }}>{"★".repeat(Math.max(0, max - count))}</span></span>;
}

export function TopBar({ children, onHome }: { children?: ReactNode; onHome?: () => void }) {
  const game = useGame();
  const stars = useSave((s) => totalStars(s));
  const cores = useSave((s) => s.starCores);
  const xp = useSave((s) => s.xp);
  const rank = rankFor(xp).current.name;
  return (
    <div className="topbar">
      <button className="brand ui-on" onClick={onHome ?? (() => void game.goHub())} aria-label="Back to the Spaceport">
        🚀 <b>SPACEFLIGHT</b> <i>ACADEMY</i>
      </button>
      <div className="stat" title="Mission stars">★ {stars}</div>
      <div className="stat" title="Star cores">✦ {cores}</div>
      <div className="stat" title={`Rank: ${rank}`}>⚡ {xp} XP</div>
      <div className="spacer" />
      {children}
      <button className="btn round ui-on" aria-label="Settings" onClick={() => game.setOverlay("settings")}>⚙️</button>
    </div>
  );
}

/** Virtual joystick (touch + mouse). Writes into the shared input axis. */
export function Joystick() {
  const ref = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const active = useRef<number | null>(null);
  useEffect(() => () => input.setJoystick(0, 0), []);
  const update = (clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const r = rect.width / 2;
    let dx = (clientX - (rect.left + r)) / r, dy = (clientY - (rect.top + r)) / r;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    setKnob({ x: dx, y: dy });
    input.setJoystick(dx, -dy);
  };
  const end = () => {
    active.current = null;
    setKnob({ x: 0, y: 0 });
    input.setJoystick(0, 0);
  };
  return (
    <div
      ref={ref}
      className="joystick ui-on"
      aria-label="Move joystick"
      onPointerDown={(e) => { active.current = e.pointerId; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); update(e.clientX, e.clientY); }}
      onPointerMove={(e) => { if (active.current === e.pointerId) update(e.clientX, e.clientY); }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="knob" style={{ transform: `translate(${knob.x * 40}px, ${knob.y * 40}px)` }} />
    </div>
  );
}

export function Sheet({ title, kicker, onClose, children, wide = false }: { title: string; kicker?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="sheet panel" style={wide ? { width: "min(1180px, 100%)" } : undefined} role="dialog" aria-label={title}>
        <div className="sheet-head">
          <div>
            {kicker && <div className="kicker">{kicker}</div>}
            <div className="h2">{title}</div>
          </div>
          <div className="spacer" />
          <button className="btn round" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="sheet-body scroll">{children}</div>
      </section>
    </div>
  );
}

export function Meter({ label, icon, value, color, target, focus }: { label: string; icon: string; value: number; color: string; target?: number; focus?: boolean }) {
  return (
    <div className={"meter" + (focus ? " focus" : "")}>
      <div className="lbl"><span>{icon} {label}{focus ? " · FOCUS" : ""}</span><span>{value}{target !== undefined ? ` / ${target}` : ""}</span></div>
      <div className="bar">
        <i style={{ width: `${Math.max(2, Math.min(100, value))}%`, background: color }} />
        {target !== undefined && <em style={{ left: `calc(${Math.min(100, target)}% - 2px)` }} />}
      </div>
    </div>
  );
}

export function speakButton(game: Game, text: string) {
  return () => { game.sound("tap"); void game.say(text); };
}

export interface PanelInsets { l: number; r: number; t: number; b: number }

/**
 * Measures the side panels / bottom bar of a free-play station (Studio, Observatory)
 * and tells the 3D scene which part of the screen is free, so the model is framed
 * in the open space instead of behind a panel. Returns true on phone-sized screens.
 */
export function usePanelInsets(target: { setInsets: (insets: PanelInsets) => void }, deps: readonly unknown[] = []): boolean {
  const [mobile, setMobile] = useState(() => window.innerWidth <= 760);
  useLayoutEffect(() => {
    const measure = () => {
      const W = window.innerWidth, H = window.innerHeight;
      const isMobile = W <= 760;
      setMobile(isMobile);
      const rect = (sel: string) => document.querySelector(sel)?.getBoundingClientRect();
      const head = rect(".topbar"), list = rect(".studio-list"), panel = rect(".studio-info"), bar = rect(".studio-bar"), top = rect(".detective");
      let l = 16, r = 16;
      let t = (head ? head.bottom : 70) + 10;
      let b = bar ? H - bar.top + 12 : 90;
      if (bar) document.documentElement.style.setProperty("--studio-bar-h", `${Math.round(H - bar.top)}px`);
      if (top) t = Math.max(t, top.bottom + 10);
      if (!isMobile) {
        if (list) l = list.right + 12;
        if (panel) r = W - panel.left + 12;
      } else if (list) {
        b = Math.max(b, H - list.top + 12);
      }
      target.setInsets({ l, r, t, b });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    for (const sel of [".studio-bar", ".detective", ".studio-list", ".studio-info"]) {
      const el = document.querySelector(sel);
      if (el) ro.observe(el);
    }
    window.addEventListener("resize", measure);
    const timer = window.setTimeout(measure, 300);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); window.clearTimeout(timer); };
  }, [target, mobile, ...deps]);
  return mobile;
}
