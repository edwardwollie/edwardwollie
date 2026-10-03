"use client";
/* eslint-disable react-hooks/immutability, react-hooks/refs -- GameHost and HuntSession are imperative
   engine objects that live outside React; screens configure them from callbacks and effects by design
   (the React Compiler is not enabled for this project). */
// Wildfront Horizon 3D — application shell. One persistent WebGL canvas
// (GameHost) sits behind every screen; the lodge menus show the live reserve
// (ShowcaseMode), the guide / trophy lodge / studio use the blueprint viewer
// (StudioMode) and contracts run a HuntSession. Saves stay on the v2.0.3 key.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GameHost } from "../engine/host.ts";
import { Snapshotter } from "../render/snapshots.ts";
import { autoQuality, type QualityName } from "../render/quality.ts";
import { ACHIEVEMENTS, claimContract, loadSave, writeSave, type Save } from "../data/save.ts";
import { licensedFor, MISSIONS, missionTime, missionWeather, type Mission } from "../data/missions.ts";
import { HuntSession, type HuntConfig, type HuntStats, type HudSnapshot, type ShotAnalysis, type TrophyRecord } from "../hunt/hunt.ts";
import { ShowcaseMode } from "../modes/showcase.ts";
import { StudioMode } from "../modes/studio.ts";
import { checkAchievements, type AchEvent } from "../data/achievements.ts";
import { STORE_BY_ID } from "../data/store.ts";
import { starsFor } from "../hunt/scoring.ts";
import { reserveByName } from "../blueprints/reserves.ts";
import type { TimeKey, WeatherKey } from "../world/environment.ts";
import { Ctx, STUDIO_ENABLED, type AppCtx, type FreeHuntOptions, type Loadout, type Screen } from "./ctx.ts";
import { localizeMessage } from "./format.ts";
import Lodge from "./screens/Lodge.tsx";
import Contracts from "./screens/Contracts.tsx";
import Briefing from "./screens/Briefing.tsx";
import FreeHunt from "./screens/FreeHunt.tsx";
import Locker from "./screens/Locker.tsx";
import Trophies from "./screens/Trophies.tsx";
import Guide from "./screens/Guide.tsx";
import Studio from "./screens/Studio.tsx";
import SettingsScreen from "./screens/Settings.tsx";
import Loading from "./screens/Loading.tsx";
import Results, { type ResultsData } from "./screens/Results.tsx";
import { Intro, Training } from "./screens/Intro.tsx";
import Hud from "./hud/Hud.tsx";

const MENU: Screen[] = ["lodge", "contracts", "briefing", "free", "locker", "settings"];
const VIEWER: Screen[] = ["trophies", "guide", "studio"];

interface Toast { id: number; text: string; kind: string }
interface Plan { cfg: HuntConfig; mission: Mission | null }
export type Overlay = "none" | "pause" | "map";

function isTouch() { return typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches || "ontouchstart" in window); }

function backdropFor(save: Save): { reserve: string; time: TimeKey; weather: WeatherKey; species?: string[]; hour: number } {
  const m = MISSIONS[Math.min(save.unlocked, MISSIONS.length) - 1];
  const reserve = m.reserve === "All Reserves" ? "Horizon Crossing" : m.reserve;
  const weather = ({ Storm: "Mist", Rain: "Mist", Dynamic: "Clear", Wind: "Clear" } as Record<string, WeatherKey>)[m.weather] ?? (m.weather as WeatherKey);
  // the lodge always looks out on low, warm morning light
  return { reserve, time: m.weather === "Snow" ? "Snowrise" : "Morning", weather, species: m.species === "Mixed" ? ["Elk"] : [m.species], hour: 7.45 };
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [host, setHost] = useState<GameHost | null>(null);
  const [snap, setSnap] = useState<Snapshotter | null>(null);
  const [save, setSave] = useState<Save>(() => loadSave());
  const saveRef = useRef(save);
  const [screen, setScreen] = useState<Screen>("lodge");
  const screenRef = useRef<Screen>("lodge");
  const [missionId, setMissionId] = useState(() => Math.min(loadSave().unlocked, MISSIONS.length));
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [backdrop, setBackdrop] = useState(false);
  const [touch] = useState(isTouch);
  // hunt state
  const huntRef = useRef<HuntSession | null>(null);
  const planRef = useRef<Plan | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [overlay, setOverlayState] = useState<Overlay>("none");
  const overlayRef = useRef<Overlay>("none");
  const [engaged, setEngaged] = useState(false);
  const engagedRef = useRef(false);
  const [shotCard, setShotCard] = useState<ShotAnalysis | null>(null);
  const [tagCard, setTagCard] = useState<TrophyRecord | null>(null);
  const [results, setResults] = useState<ResultsData | null>(null);
  /** achievements unlocked since the hunt was launched — listed on the debrief card */
  const [huntAch, setHuntAch] = useState<string[]>([]);
  const [loadingFor, setLoadingFor] = useState<Plan | null>(null);
  const [training, setTraining] = useState<Plan | null>(null);
  const [locked, setLocked] = useState(false);
  const hudFrame = useRef<((h: HuntSession) => void) | null>(null);
  const showcaseRef = useRef<ShowcaseMode | null>(null);
  const studioRef = useRef<StudioMode | null>(null);
  const toastId = useRef(1);
  const suppressUnlock = useRef(false);
  const spottedIds = useRef(new Set<number>());

  const settings = save.v3.settings;
  const units = settings.units;

  // ------------------------------------------------------------------ save
  const update = useCallback((fn: (s: Save) => Save) => {
    const next = fn(saveRef.current);
    saveRef.current = next;
    setSave(next);
    writeSave(next);
    return next;
  }, []);

  const toast = useCallback((text: string, kind = "info") => {
    const id = toastId.current++;
    setToasts(t => [...t.slice(-3), { id, text, kind }]);
    window.setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), kind === "tip" ? 7000 : kind === "ach" ? 5200 : 3400);
  }, []);

  const award = useCallback((ev: AchEvent) => {
    const got = checkAchievements(saveRef.current, ev);
    if (!got.length) return;
    update(s => ({ ...s, v3: { ...s.v3, achievements: [...s.v3.achievements, ...got.filter(g => !s.v3.achievements.includes(g))] } }));
    const sc = screenRef.current;
    if (sc === "hunt" || sc === "loading" || sc === "results") setHuntAch(h => [...h, ...got.filter(g => !h.includes(g))]);
    // the debrief card lists them itself
    if (sc !== "results") for (const id of got) { const a = ACHIEVEMENTS.find(x => x.id === id); if (a) toast(`ACHIEVEMENT · ${a.title.toUpperCase()} — ${a.detail}`, "ach"); }
    host?.audio.ui("achievement");
  }, [update, toast, host]);

  // ------------------------------------------------------------------ host
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const s = saveRef.current.v3.settings;
    const q: QualityName = s.quality === "auto" ? autoQuality() : s.quality;
    let h: GameHost;
    try { h = new GameHost(c, q); } catch (e) { console.error(e); return; }
    h.start();
    h.maxFps = 45;
    const sn = new Snapshotter(h.renderer);
    setHost(h); setSnap(sn);
    // QA hook for automated tests (?qa)
    if (new URLSearchParams(location.search).has("qa")) (window as unknown as { __wf: unknown }).__wf = { THREE, host: h, snap: sn, hunt: () => huntRef.current, studio: () => studioRef.current, showcase: () => showcaseRef.current, save: () => saveRef.current };
    const onLock = () => setLocked(document.pointerLockElement === c);
    document.addEventListener("pointerlockchange", onLock);
    // browsers only start audio after a user gesture: unlock it on the first one
    const unlockAudio = () => { h.audio.init(); h.audio.setVolumes(saveRef.current.v3.settings.volume); window.removeEventListener("pointerdown", unlockAudio); window.removeEventListener("keydown", unlockAudio); };
    window.addEventListener("pointerdown", unlockAudio);
    window.addEventListener("keydown", unlockAudio);
    // pause rendering while the tab is hidden
    const vis = () => { if (document.hidden) h.audio.suspend(); else h.audio.resume(); };
    document.addEventListener("visibilitychange", vis);
    return () => { document.removeEventListener("pointerlockchange", onLock); document.removeEventListener("visibilitychange", vis); window.removeEventListener("pointerdown", unlockAudio); window.removeEventListener("keydown", unlockAudio); showcaseRef.current?.dispose(); showcaseRef.current = null; studioRef.current?.dispose(); studioRef.current = null; huntRef.current?.dispose(); huntRef.current = null; sn.dispose(); h.dispose(); };
  }, []);

  // settings → engine
  useEffect(() => {
    if (!host) return;
    host.input.settings = { sensitivity: settings.sensitivity, scopedSensitivity: settings.scopedSensitivity, invertY: settings.invertY, aimHold: settings.aimHold, touchSensitivity: settings.sensitivity * 1.6 };
    host.audio.setVolumes(settings.volume);
    if (huntRef.current) huntRef.current.cfg.fov = settings.fov;
  }, [host, settings]);

  const playUi = useCallback((kind: string) => { host?.audio.ui(kind); }, [host]);

  // ------------------------------------------------------------------ modes
  const ensureShowcase = useCallback(() => {
    if (!host) return;
    host.maxFps = 45;
    if (showcaseRef.current) { host.setMode(showcaseRef.current, true); setBackdrop(true); return; }
    setBackdrop(false);
    host.setMode(null, true);
    window.setTimeout(() => {
      if (showcaseRef.current || !MENU.includes(screenRef.current)) return;
      try {
        const sc = new ShowcaseMode(host.renderer, host.quality, backdropFor(saveRef.current));
        showcaseRef.current = sc;
        if (MENU.includes(screenRef.current)) host.setMode(sc, true);
        window.setTimeout(() => setBackdrop(true), 120);
      } catch (e) { console.error("backdrop", e); }
    }, 60);
  }, [host]);

  const studio = useCallback((): StudioMode => {
    if (!host) throw new Error("host not ready");
    if (!studioRef.current) studioRef.current = new StudioMode(host.renderer);
    if (host.mode !== studioRef.current) host.setMode(studioRef.current, true);
    host.maxFps = 60;
    return studioRef.current;
  }, [host]);

  const go = useCallback((s: Screen) => { if (s === "studio" && !STUDIO_ENABLED) s = "lodge"; screenRef.current = s; setScreen(s); }, []);

  useEffect(() => {
    if (!host) return;
    if (MENU.includes(screen)) ensureShowcase();
    else if (VIEWER.includes(screen)) studio();
  }, [screen, host, ensureShowcase, studio]);

  // Escape returns to the lodge from menus
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const s = screenRef.current;
      if (s === "briefing") go("contracts");
      else if (s !== "lodge" && s !== "hunt" && s !== "loading" && s !== "results") go("lodge");
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [go]);

  // ------------------------------------------------------------------ hunt lifecycle
  const setOverlay = useCallback((o: Overlay) => { overlayRef.current = o; setOverlayState(o); }, []);

  const pauseHunt = useCallback((o: Overlay) => {
    const h = huntRef.current; if (!h || h.finished) return;
    h.paused = true;
    if (host) host.input.enabled = false;
    if (o === "map" && document.pointerLockElement) { suppressUnlock.current = true; document.exitPointerLock?.(); }
    if (o === "pause") host?.audio.suspend();
    setOverlay(o);
  }, [host, setOverlay]);

  const resumeHunt = useCallback(() => {
    const h = huntRef.current; if (!h || !host) return;
    setOverlay("none");
    h.paused = false;
    host.input.enabled = true;
    host.audio.resume();
    if (!touch) { host.audio.init(); host.input.requestLock(); }
  }, [host, touch, setOverlay]);

  const foldStats = useCallback((st: HuntStats) => {
    update(s => ({
      ...s, v3: {
        ...s.v3, stats: {
          shots: s.v3.stats.shots + st.shots, hits: s.v3.stats.hits + st.hits, harvests: s.v3.stats.harvests + st.trophies.length,
          perfect: s.v3.stats.perfect + st.perfect, great: s.v3.stats.great + st.great, good: s.v3.stats.good + st.good,
          longest: Math.max(s.v3.stats.longest, st.longest), distance: s.v3.stats.distance + st.distance, tracks: s.v3.stats.tracks + st.tracks,
          time: s.v3.stats.time + st.time, hunts: s.v3.stats.hunts + 1, calls: s.v3.stats.calls + st.calls,
        },
      },
    }));
    award({ kind: "stats" });
  }, [update, award]);

  const endHunt = useCallback(() => {
    const h = huntRef.current;
    if (host) { host.onFrame = undefined; host.input.enabled = false; host.setMode(null, true); }
    if (document.pointerLockElement) { suppressUnlock.current = true; document.exitPointerLock?.(); }
    h?.dispose();
    huntRef.current = null; planRef.current = null;
    setPlan(null); setHud(null); setShotCard(null); setTagCard(null); setOverlay("none"); setEngaged(false); engagedRef.current = false;
  }, [host, setOverlay]);

  const wire = useCallback((h: HuntSession, p: Plan) => {
    h.onMessage = (text, kind) => toast(localizeMessage(text, saveRef.current.v3.settings.units), kind);
    h.onPause = () => { if (overlayRef.current === "none") pauseHunt("pause"); };
    h.onMap = () => { if (overlayRef.current === "none") pauseHunt("map"); };
    h.onSpot = (a) => {
      if (spottedIds.current.has(a.id)) return;
      spottedIds.current.add(a.id);
      const sp = a.bp.species;
      update(s => { const j = s.v3.journal[sp] ?? { spotted: 0, harvested: 0, bestScore: 0, bestRating: "none" }; return { ...s, v3: { ...s.v3, journal: { ...s.v3.journal, [sp]: { ...j, spotted: j.spotted + 1 } } } }; });
    };
    h.onAnalysis = (a) => {
      if (saveRef.current.v3.settings.shotCard) { setShotCard(a); }
      award({ kind: "shot", a });
    };
    h.onTag = (t) => {
      setTagCard(t);
      const order = ["none", "bronze", "silver", "gold", "diamond"];
      update(s => {
        const j = s.v3.journal[t.species] ?? { spotted: 0, harvested: 0, bestScore: 0, bestRating: "none" };
        const better = order.indexOf(t.rating) > order.indexOf(j.bestRating);
        return { ...s, v3: { ...s.v3, trophies: [...s.v3.trophies, t].slice(-200), journal: { ...s.v3.journal, [t.species]: { spotted: Math.max(j.spotted, 1), harvested: j.harvested + 1, bestScore: Math.max(j.bestScore, t.score), bestRating: better ? t.rating : j.bestRating } } } };
      });
      award({ kind: "tag", t, free: p.cfg.mode === "free", calls: h.stats.calls });
    };
    h.onComplete = (stats) => {
      h.paused = true;
      if (host) host.input.enabled = false;
      if (document.pointerLockElement) { suppressUnlock.current = true; document.exitPointerLock?.(); }
      setOverlay("none");
      const free = p.cfg.mode === "free";
      setResults({ stats, mission: p.mission, free, stars: starsFor(stats.accuracy), reserve: h.world.def.name });
      setToasts([]);      // field tips and achievement toasts give way to the debrief card
      go("results");
    };
  }, [toast, pauseHunt, update, award, host, setOverlay, go]);

  const launch = useCallback((p: Plan, skipTraining = false) => {
    if (!host) return;
    if (!skipTraining && p.mission?.id === 1 && !saveRef.current.tutorial) { setTraining(p); return; }
    setTraining(null);
    setLoadingFor(p);
    go("loading");
    host.setMode(null, true);
    showcaseRef.current?.dispose(); showcaseRef.current = null;
    setBackdrop(false);
    host.maxFps = 0;
    spottedIds.current.clear();
    setHuntAch([]);
    window.setTimeout(async () => {
      let h: HuntSession;
      try {
        h = new HuntSession(host.renderer, p.cfg, host.quality, host.input, host.audio, host.envMap);
      } catch (e) {
        console.error(e);
        toast("THE RESERVE FAILED TO LOAD — TRY A LOWER GRAPHICS QUALITY", "warn");
        go("lodge");
        return;
      }
      huntRef.current = h; planRef.current = p; setPlan(p);
      wire(h, p);
      host.input.enabled = false;
      h.update(1 / 60, host.aspect);
      h.paused = true;
      try { await host.renderer.compileAsync(h.world.scene, h.camera); } catch { /* optional */ }
      host.setMode(h, true);
      host.onFrame = () => {
        const hh = huntRef.current; if (!hh) return;
        hudFrame.current?.(hh);
      };
      setEngaged(false); engagedRef.current = false;
      setResults(null);
      setOverlay("none");
      go("hunt");
    }, 90);
  }, [host, go, toast, wire, setOverlay]);

  // HUD snapshots (~12 Hz)
  useEffect(() => {
    if (screen !== "hunt") return;
    const iv = window.setInterval(() => { const h = huntRef.current; if (h) setHud({ ...h.snapshot() }); }, 80);
    return () => window.clearInterval(iv);
  }, [screen]);

  // pointer lock released (Esc) → pause menu
  useEffect(() => {
    if (!host) return;
    host.input.onUnlock = () => {
      if (suppressUnlock.current) { suppressUnlock.current = false; return; }
      if (screenRef.current === "hunt" && engagedRef.current && overlayRef.current === "none" && huntRef.current && !huntRef.current.finished) pauseHunt("pause");
    };
  }, [host, pauseHunt]);

  const engage = useCallback(() => {
    const h = huntRef.current; if (!h || !host) return;
    host.audio.init();
    host.audio.setVolumes(saveRef.current.v3.settings.volume);
    host.input.enabled = true;
    h.paused = false;
    if (!touch) host.input.requestLock();
    setEngaged(true); engagedRef.current = true;
  }, [host, touch]);

  const loadout = useCallback((l: Loadout) => ({
    rifleId: l.rifleId,
    gear: { camo: STORE_BY_ID[l.camo]?.value ?? 0, caller: l.caller && saveRef.current.v3.owned.includes("caller"), scentBlocker: l.scent && saveRef.current.v3.owned.includes("scent") },
  }), []);

  const startContract = useCallback((id: number, l: Loadout) => {
    const m = MISSIONS.find(x => x.id === id)!;
    const s = saveRef.current;
    const lo = loadout(l);
    const cfg: HuntConfig = {
      mode: "contract", missionId: m.id, name: m.name, reserve: m.reserve, licensed: licensedFor(m), count: m.count, distinct: m.species === "Mixed",
      time: missionTime(m), weather: missionWeather(m), rifleId: lo.rifleId, upgrades: { ...s.upgrades }, gear: lo.gear,
      hitSignRealistic: s.v3.settings.hitSign === "realistic", tutorial: m.id === 1, seed: (Date.now() % 100000) + m.id * 7, fov: s.v3.settings.fov, assist: s.v3.settings.assist,
    };
    update(x => ({ ...x, v3: { ...x.v3, rifle: l.rifleId, camo: l.camo } }));
    launch({ cfg, mission: m });
  }, [launch, loadout, update]);

  const startFree = useCallback((o: FreeHuntOptions) => {
    const s = saveRef.current;
    const lo = loadout(o.loadout);
    const def = reserveByName(o.reserve);
    const cfg: HuntConfig = {
      mode: "free", missionId: 0, name: `Free Hunt · ${def.name}`, reserve: def.name, licensed: o.species.length ? o.species : def.fauna, count: 99, distinct: false,
      time: o.time as TimeKey, weather: o.weather as WeatherKey, rifleId: lo.rifleId, upgrades: { ...s.upgrades }, gear: lo.gear,
      hitSignRealistic: s.v3.settings.hitSign === "realistic", tutorial: false, seed: Date.now() % 100000, fov: s.v3.settings.fov, assist: s.v3.settings.assist,
    };
    update(x => ({ ...x, v3: { ...x.v3, rifle: o.loadout.rifleId, camo: o.loadout.camo } }));
    launch({ cfg, mission: null });
  }, [launch, loadout, update]);

  const abandon = useCallback(() => {
    const h = huntRef.current;
    if (h) foldStats(h.currentStats());
    endHunt();
    go("lodge");
  }, [endHunt, foldStats, go]);

  const restart = useCallback(() => {
    const p = planRef.current;
    const h = huntRef.current;
    if (h) foldStats(h.currentStats());
    endHunt();
    if (p) launch({ cfg: { ...p.cfg, seed: p.cfg.seed + 101 }, mission: p.mission }, true);
  }, [endHunt, foldStats, launch]);

  const endFree = useCallback(() => { const h = huntRef.current; if (h) { setOverlay("none"); h.finish(); } }, [setOverlay]);

  const claim = useCallback(() => {
    const r = results;
    if (!r) return;
    go("lodge");           // first, so achievements earned by claiming are toasted in the lodge
    foldStats(r.stats);
    if (r.free) update(s => ({ ...s, credits: s.credits + r.stats.credits }));
    else if (r.mission) {
      const m = r.mission;
      update(s => { const c = claimContract(s, m.id, r.stars); return { ...c, v3: { ...c.v3, best: { ...c.v3.best, [m.id]: Math.max(c.v3.best[m.id] ?? 0, r.stats.score) } } }; });
      award({ kind: "complete", mission: m, stats: r.stats, free: false });
      setMissionId(Math.min(MISSIONS.length, Math.max(m.id + 1, 1)));
    }
    setResults(null);
    endHunt();
  }, [results, foldStats, update, award, endHunt, go]);

  const ctx: AppCtx | null = useMemo(() => host && snap ? {
    host, snap, save, update, go, toast, studio, units, touch, missionId, setMissionId, playUi,
    brief: (id: number) => { setMissionId(id); go("briefing"); },
    startFree, startContract,
  } : null, [host, snap, save, update, go, toast, studio, units, touch, missionId, playUi, startFree, startContract]);

  const canvasVisible = (MENU.includes(screen) && backdrop) || VIEWER.includes(screen) || screen === "hunt" || screen === "results";

  return (
    <main className={`wf3 scr-${screen} ${touch ? "touch" : "mouse"} hud-${settings.hud}`}>
      <canvas ref={canvasRef} className={`wf-canvas ${canvasVisible ? "on" : ""}`} />
      {MENU.includes(screen) && <div className="backdrop-shade" />}
      {ctx && (
        <Ctx.Provider value={ctx}>
          <div className="wf-ui">
            {screen === "lodge" && <Lodge backdropReady={backdrop} />}
            {screen === "contracts" && <Contracts />}
            {screen === "briefing" && <Briefing />}
            {screen === "free" && <FreeHunt />}
            {screen === "locker" && <Locker />}
            {screen === "trophies" && <Trophies />}
            {screen === "guide" && <Guide />}
            {STUDIO_ENABLED && screen === "studio" && <Studio />}
            {screen === "settings" && <SettingsScreen inHunt={false} />}
            {screen === "loading" && loadingFor && <Loading plan={loadingFor} />}
            {screen === "hunt" && plan && hud && (
              <Hud
                hunt={huntRef.current} plan={plan} hud={hud} frameRef={hudFrame} overlay={overlay} engaged={engaged} locked={locked}
                onEngage={engage} onPause={() => pauseHunt("pause")} onResume={resumeHunt} onMap={() => pauseHunt("map")} onAbandon={abandon} onRestart={restart} onEndFree={endFree}
                shotCard={shotCard} onShotCardDone={() => setShotCard(null)} tagCard={tagCard} onTagDone={() => setTagCard(null)}
              />
            )}
            {screen === "results" && results && <Results data={results} achievements={huntAch} onClaim={claim} />}
            {!save.v3.seenIntro && screen === "lodge" && <Intro onDone={() => update(s => ({ ...s, v3: { ...s.v3, seenIntro: true } }))} />}
            {training && <Training onDone={() => { update(s => ({ ...s, tutorial: true })); launch(training, true); }} onSkip={() => { update(s => ({ ...s, tutorial: true })); launch(training, true); }} />}
            <div className="toasts">{toasts.map(t => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}</div>
          </div>
        </Ctx.Provider>
      )}
      {!ctx && <div className="wf-boot"><b>WILDFRONT</b><span>CALIBRATING FIELD SYSTEM 3.0…</span></div>}
    </main>
  );
}

