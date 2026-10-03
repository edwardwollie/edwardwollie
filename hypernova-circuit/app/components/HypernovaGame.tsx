"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  HypernovaEngine,
  type GameEvent,
  type RaceHud,
  type RaceResult,
} from "../game/HypernovaEngine";
import {
  GrandPrixEngine,
  type CameraMode,
  type GpEvent,
  type GpHud,
  type GpResult,
  type Quality,
  type ShowroomView,
} from "../game/GrandPrixEngine";
import { HypernovaAudio } from "../game/HypernovaAudio";
import {
  CARS,
  UPGRADE_IDS,
  UPGRADE_INFO,
  createDefaultSave,
  dailyRewardAmount,
  effectiveStats,
  getCar,
  loadSave,
  storeSave,
  upgradeCost,
  utcDateKey,
  type CarId,
  type SaveData,
  type UpgradeId,
} from "../game/progression";
import {
  formatLapTime,
  isTrackUnlocked,
  raceReward,
  recordRace,
} from "../game/grand-prix";
import { getTrack, minimapPath, TRACKS } from "../game/track";
import { themeLook } from "../game/track-scene";

type View =
  | "menu"
  | "tracks"
  | "garage"
  | "gp"
  | "gp-paused"
  | "gp-result"
  | "racing"
  | "paused"
  | "result";
type Toast = { id: number; message: string; kind: string } | null;

const EMPTY_HUD: RaceHud = {
  speed: 0,
  coins: 0,
  distance: 0,
  sector: 1,
  circuitName: "Neon Grandway",
  checkpoint: 1,
  checkpointProgress: 0,
  shield: 100,
  maxShield: 100,
  nitro: 62,
  combo: 1,
  drift: 0,
  dodged: 0,
  rivalsPassed: 0,
};

const SHOWROOM_VIEWS: { id: ShowroomView; label: string }[] = [
  { id: "orbit", label: "ORBIT" },
  { id: "front", label: "FRONT" },
  { id: "rear", label: "REAR" },
  { id: "left", label: "LEFT" },
  { id: "right", label: "RIGHT" },
  { id: "top", label: "TOP" },
  { id: "underside", label: "UNDER" },
];

const CAMERA_LABEL: Record<CameraMode, string> = {
  chase: "CHASE CAM",
  far: "FAR CAM",
  hood: "HOOD CAM",
  tv: "TV CAM",
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.floor(value));
}

function formatDistance(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)} km` : `${value} m`;
}

function ordinal(n: number): string {
  const suffix = n === 1 ? "ST" : n === 2 ? "ND" : n === 3 ? "RD" : "TH";
  return `${n}${suffix}`;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/** The wireframe blueprint check is an internal tool: local dev builds only. */
const BLUEPRINT_TOGGLE = process.env.NODE_ENV !== "production";

const TRACK_PATHS = TRACKS.map((_, index) => minimapPath(getTrack(index)));

export default function HypernovaGame() {
  const stageRef = useRef<HTMLDivElement>(null);
  const gpRef = useRef<GrandPrixEngine | null>(null);
  const endlessRef = useRef<HypernovaEngine | null>(null);
  const audioRef = useRef<HypernovaAudio | null>(null);
  const viewRef = useRef<View>("menu");
  const boostRef = useRef(false);
  const pressedKeysRef = useRef(new Set<string>());
  const dragRef = useRef<{ id: number; x: number } | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  const bannerTimerRef = useRef<number | null>(null);
  const saveRef = useRef<SaveData>(createDefaultSave());

  const [view, setView] = useState<View>("menu");
  const [save, setSave] = useState<SaveData>(createDefaultSave);
  const [garageCarId, setGarageCarId] = useState<CarId>("pulse");
  const [ready, setReady] = useState(false);
  const [hud, setHud] = useState<RaceHud>(EMPTY_HUD);
  const [gpHud, setGpHud] = useState<GpHud | null>(null);
  const [result, setResult] = useState<RaceResult | null>(null);
  const [gpResult, setGpResult] = useState<GpResult | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);
  const [hitFlash, setHitFlash] = useState(false);
  const [muted, setMuted] = useState(false);
  const [trackIndex, setTrackIndex] = useState(0);
  const [showroomView, setShowroomView] = useState<ShowroomView>("orbit");
  const [blueprintMode, setBlueprintMode] = useState(false);
  const [quality, setQualityState] = useState<Quality>("high");

  const selectedCar = useMemo(() => getCar(save.selectedCar), [save.selectedCar]);
  const garageCar = useMemo(() => getCar(garageCarId), [garageCarId]);
  const selectedStats = useMemo(
    () => effectiveStats(selectedCar, save.upgrades),
    [selectedCar, save.upgrades],
  );
  const dailyReward = dailyRewardAmount(save.highestSector);
  const dailyAvailable = save.dailyClaimDate !== utcDateKey();

  const go = useCallback((next: View) => {
    viewRef.current = next;
    setView(next);
  }, []);

  const showToast = useCallback((message: string, kind: string) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), message, kind });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 1700);
  }, []);

  const showBanner = useCallback((message: string, ms = 1600) => {
    if (bannerTimerRef.current) window.clearTimeout(bannerTimerRef.current);
    setBanner(message);
    bannerTimerRef.current = window.setTimeout(() => setBanner(null), ms);
  }, []);

  const flash = useCallback(() => {
    setHitFlash(true);
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setHitFlash(false), 260);
  }, []);

  const commitSave = useCallback((update: (current: SaveData) => SaveData) => {
    setSave((current) => {
      const committed = update(current);
      saveRef.current = committed;
      storeSave(committed);
      return committed;
    });
  }, []);

  // ------------------------------------------------------- endless events

  const handleGameEvent = useCallback(
    (event: GameEvent) => {
      const audio = audioRef.current;
      switch (event.type) {
        case "coin":
          audio?.coin(event.combo);
          if (event.combo >= 4) showToast(`Coin chain ×${event.combo}`, "coin");
          break;
        case "hit":
          audio?.collision();
          flash();
          navigator.vibrate?.([35, 30, 55]);
          showToast("Shield impact", "hazard");
          break;
        case "sector":
          audio?.sector();
          showToast(`Sector ${event.sector} · +${event.reward} coins`, "sector");
          break;
        case "nitro":
          audio?.pickup();
          showToast("Nitro core +48", "boost");
          break;
        case "repair":
          audio?.pickup();
          showToast("Aegis repaired", "repair");
          break;
        case "near-miss":
          audio?.nearMiss();
          showToast(`Near miss · +${event.amount}`, "near");
          break;
        case "checkpoint":
          audio?.sector();
          showToast(`Checkpoint ${event.checkpoint} · ${event.circuit} · +${event.reward}`, "sector");
          break;
        case "drift":
          audio?.nearMiss();
          showToast(`Drift banked · +${event.amount} coins · +${event.nitro} nitro`, "drift");
          break;
        case "warp":
          audio?.pickup();
          showToast(`Warp lane! +${event.amount} coins`, "boost");
          break;
      }
    },
    [flash, showToast],
  );

  // ----------------------------------------------------- grand prix events

  const handleGpEvent = useCallback(
    (event: GpEvent) => {
      const audio = audioRef.current;
      switch (event.type) {
        case "countdown":
          audio?.countdown(event.value);
          setCountdown(String(event.value));
          break;
        case "go":
          audio?.countdown(0);
          setCountdown("GO!");
          window.setTimeout(() => setCountdown(null), 700);
          break;
        case "lap":
          audio?.lap(event.final);
          showBanner(event.final ? "FINAL LAP" : `LAP ${event.lap + 1}`, 1800);
          showToast(`Lap ${event.lap} · ${formatLapTime(event.time)}${event.best ? " · BEST" : ""}`, event.best ? "boost" : "sector");
          break;
        case "coin":
          audio?.coin(event.combo);
          if (event.combo >= 4) showToast(`Coin chain ×${event.combo}`, "coin");
          break;
        case "nitro":
          audio?.pickup();
          showToast("Nitro cell +48", "boost");
          break;
        case "repair":
          audio?.pickup();
          showToast("Aegis repaired +36", "repair");
          break;
        case "boost":
          audio?.boost();
          showToast("Warp pad! +4 coins", "boost");
          break;
        case "hit":
          audio?.collision();
          flash();
          navigator.vibrate?.([35, 30, 55]);
          showToast("Hazard impact", "hazard");
          break;
        case "wall":
          audio?.scrape();
          if (event.impact > 14) flash();
          break;
        case "bump":
          audio?.bump();
          navigator.vibrate?.(25);
          break;
        case "drift":
          audio?.nearMiss();
          showToast(`Drift banked · +${event.amount} coins · +${event.nitro} nitro`, "drift");
          break;
        case "overtake":
          audio?.nearMiss();
          showToast(`Overtake! Now ${ordinal(event.position)}`, "near");
          break;
        case "reboot":
          audio?.collision();
          flash();
          showBanner("SHIELD DOWN · REBOOTING", 2200);
          break;
        case "ghost-saved":
          showToast(`New best lap ${formatLapTime(event.time)} · ghost saved`, "boost");
          break;
      }
    },
    [flash, showBanner, showToast],
  );

  // --------------------------------------------------------------- set-up

  useEffect(() => {
    if (!stageRef.current) return;
    const loaded = loadSave();
    saveRef.current = loaded;
    setSave(loaded);
    const audio = new HypernovaAudio();
    audioRef.current = audio;

    const engine = new GrandPrixEngine(
      stageRef.current,
      {
        onHud: (next) => {
          setGpHud(next);
          audio.setSpeed(next.speed * 0.9, boostRef.current);
        },
        onEvent: handleGpEvent,
        onFinish: (raceResult) => {
          boostRef.current = false;
          setGpResult(raceResult);
          audio.finish(raceResult.position);
          commitSave((current) => ({
            ...current,
            coins: current.coins + raceResult.coins + raceResult.reward,
            totalCoins: current.totalCoins + raceResult.coins + raceResult.reward,
            totalRuns: current.totalRuns + 1,
            grandPrix: recordRace(current.grandPrix, raceResult.trackId, raceResult.position, raceResult.bestLap, raceResult.raceTime),
          }));
          showBanner(raceResult.position === 1 ? "VICTORY" : `FINISHED ${ordinal(raceResult.position)}`, 1500);
          window.setTimeout(() => {
            if (viewRef.current === "gp") {
              viewRef.current = "gp-result";
              setView("gp-result");
            }
          }, 1600);
        },
        onQuality: (q) => setQualityState(q),
      },
      loaded.graphics,
    );
    gpRef.current = engine;
    engine.start();
    setQualityState(engine.getQuality());
    setReady(true);

    if ("serviceWorker" in navigator) {
      const register = () => void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
      if (document.readyState === "complete") register();
      else window.addEventListener("load", register, { once: true });
    }

    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
      if (bannerTimerRef.current) window.clearTimeout(bannerTimerRef.current);
      endlessRef.current?.dispose();
      endlessRef.current = null;
      engine.dispose();
      audio.dispose();
      gpRef.current = null;
      audioRef.current = null;
    };
  }, [commitSave, handleGpEvent, showBanner]);

  useEffect(() => {
    if (view === "garage") gpRef.current?.showroom(garageCar, save.upgrades);
  }, [garageCar, save.upgrades, view]);

  useEffect(() => {
    gpRef.current?.setShowroomView(showroomView);
  }, [showroomView]);

  useEffect(() => {
    gpRef.current?.setWireframe(blueprintMode && view === "garage");
  }, [blueprintMode, view, garageCarId]);

  // ---------------------------------------------------------- endless mode

  const createEndless = useCallback(() => {
    if (!stageRef.current) return null;
    if (endlessRef.current) return endlessRef.current;
    const current = saveRef.current;
    const endless = new HypernovaEngine(stageRef.current, getCar(current.selectedCar), current.upgrades, {
      onHud: (nextHud) => {
        setHud(nextHud);
        audioRef.current?.setSpeed(nextHud.speed, boostRef.current);
      },
      onEvent: handleGameEvent,
      onGameOver: (raceResult) => {
        boostRef.current = false;
        setResult(raceResult);
        commitSave((s) => ({
          ...s,
          coins: s.coins + raceResult.coins,
          totalCoins: s.totalCoins + raceResult.coins,
          bestDistance: Math.max(s.bestDistance, raceResult.distance),
          highestSector: Math.max(s.highestSector, raceResult.sector),
          totalRuns: s.totalRuns + 1,
        }));
        viewRef.current = "result";
        setView("result");
      },
    });
    endless.start();
    endlessRef.current = endless;
    return endless;
  }, [commitSave, handleGameEvent]);

  const disposeEndless = useCallback(() => {
    endlessRef.current?.dispose();
    endlessRef.current = null;
    gpRef.current?.wake();
  }, []);

  const startEndless = async () => {
    await audioRef.current?.activate();
    gpRef.current?.suspend();
    const endless = createEndless();
    setResult(null);
    setHud({ ...EMPTY_HUD, maxShield: selectedStats.maxShield, shield: selectedStats.maxShield });
    endless?.beginRace(selectedCar, save.upgrades);
    go("racing");
  };

  // ------------------------------------------------------ grand prix flow

  const openTracks = () => {
    disposeEndless();
    const first = TRACKS.findIndex((_, i) => isTrackUnlocked(save, i) && !save.grandPrix[TRACKS[i].id]);
    const index = isTrackUnlocked(save, trackIndex) ? trackIndex : Math.max(0, first);
    setTrackIndex(index);
    gpRef.current?.showcase(index);
    go("tracks");
  };

  const pickTrack = (index: number) => {
    setTrackIndex(index);
    gpRef.current?.showcase(index);
  };

  const startGrandPrix = async (index = trackIndex) => {
    if (!isTrackUnlocked(saveRef.current, index)) return;
    await audioRef.current?.activate();
    disposeEndless();
    setGpResult(null);
    setCountdown(null);
    setTrackIndex(index);
    gpRef.current?.startRace(index, getCar(saveRef.current.selectedCar), saveRef.current.upgrades);
    go("gp");
  };

  const returnToMenu = () => {
    boostRef.current = false;
    disposeEndless();
    setCountdown(null);
    setBanner(null);
    gpRef.current?.showcase(trackIndex);
    go("menu");
  };

  const openGarage = () => {
    disposeEndless();
    setGarageCarId(save.selectedCar);
    gpRef.current?.showroom(selectedCar, save.upgrades);
    go("garage");
  };

  // ------------------------------------------------------------ pausing

  const pauseRace = useCallback(() => {
    const v = viewRef.current;
    boostRef.current = false;
    if (v === "racing") {
      endlessRef.current?.setBoosting(false);
      endlessRef.current?.pause();
      viewRef.current = "paused";
      setView("paused");
    } else if (v === "gp") {
      gpRef.current?.setBoost(false);
      gpRef.current?.pause();
      viewRef.current = "gp-paused";
      setView("gp-paused");
    }
  }, []);

  const resumeRace = useCallback(() => {
    const v = viewRef.current;
    void audioRef.current?.activate();
    if (v === "paused") {
      endlessRef.current?.resume();
      viewRef.current = "racing";
      setView("racing");
    } else if (v === "gp-paused") {
      gpRef.current?.resume();
      viewRef.current = "gp";
      setView("gp");
    }
  }, []);

  // ----------------------------------------------------------- keyboard

  useEffect(() => {
    const steerFromKeys = () => {
      const keys = pressedKeysRef.current;
      const left = keys.has("arrowleft") || keys.has("a");
      const right = keys.has("arrowright") || keys.has("d");
      const value = (right ? 1 : 0) - (left ? 1 : 0);
      if (viewRef.current === "racing") endlessRef.current?.setSteering(value);
      if (viewRef.current === "gp") {
        gpRef.current?.setSteer(value);
        gpRef.current?.setBrake(keys.has("arrowdown") || keys.has("s"));
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (["arrowleft", "arrowright", "arrowup", "arrowdown", "a", "d", "s", " "].includes(key)) {
        event.preventDefault();
      }
      if ((key === "p" || key === "escape") && !event.repeat) {
        if (viewRef.current === "racing" || viewRef.current === "gp") pauseRace();
        else if (viewRef.current === "paused" || viewRef.current === "gp-paused") resumeRace();
        return;
      }
      const v = viewRef.current;
      if (v !== "racing" && v !== "gp") return;
      if (v === "gp" && key === "c" && !event.repeat) {
        const mode = gpRef.current?.cycleCamera();
        if (mode) showToast(CAMERA_LABEL[mode], "sector");
      }
      if (v === "gp" && key === "b") gpRef.current?.setLookBack(true);
      pressedKeysRef.current.add(key);
      steerFromKeys();
      if (key === " " || key === "shift") {
        boostRef.current = true;
        endlessRef.current?.setBoosting(true);
        gpRef.current?.setBoost(true);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      pressedKeysRef.current.delete(key);
      steerFromKeys();
      if (key === "b") gpRef.current?.setLookBack(false);
      if (key === " " || key === "shift") {
        boostRef.current = false;
        endlessRef.current?.setBoosting(false);
        gpRef.current?.setBoost(false);
      }
    };

    const onVisibility = () => {
      if (document.hidden) pauseRace();
    };

    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pauseRace, resumeRace, showToast]);

  // ------------------------------------------------------------- economy

  const selectOrBuyCar = (carId: CarId) => {
    const car = getCar(carId);
    setGarageCarId(carId);
    if (save.ownedCars.includes(carId)) {
      commitSave((current) => ({ ...current, selectedCar: carId }));
      showToast(`${car.name} selected`, "boost");
      return;
    }
    if (save.coins < car.price) {
      showToast(`Need ${formatNumber(car.price - save.coins)} more coins`, "hazard");
      return;
    }
    commitSave((current) => ({
      ...current,
      coins: current.coins - car.price,
      selectedCar: carId,
      ownedCars: [...current.ownedCars, carId],
    }));
    showToast(`${car.name} unlocked`, "repair");
  };

  const buyUpgrade = (upgradeId: UpgradeId) => {
    const level = save.upgrades[upgradeId];
    if (level >= 5) return;
    const cost = upgradeCost(upgradeId, level);
    if (save.coins < cost) {
      showToast(`Need ${formatNumber(cost - save.coins)} more coins`, "hazard");
      return;
    }
    commitSave((current) => ({
      ...current,
      coins: current.coins - cost,
      upgrades: { ...current.upgrades, [upgradeId]: current.upgrades[upgradeId] + 1 },
    }));
    showToast(`${UPGRADE_INFO[upgradeId].name} upgraded`, "repair");
  };

  const claimDailyReward = () => {
    if (!dailyAvailable) return;
    commitSave((current) => ({ ...current, coins: current.coins + dailyReward, dailyClaimDate: utcDateKey() }));
    void audioRef.current?.activate().then(() => audioRef.current?.sector());
    showToast(`Daily cache +${dailyReward} coins`, "coin");
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    audioRef.current?.setMuted(next);
  };

  const cycleGraphics = () => {
    const order: SaveData["graphics"][] = ["auto", "high", "low"];
    const next = order[(order.indexOf(save.graphics) + 1) % order.length];
    commitSave((current) => ({ ...current, graphics: next }));
    gpRef.current?.setQuality(next);
    showToast(`Graphics: ${next.toUpperCase()}`, "sector");
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stageRef.current?.requestFullscreen();
    } catch {
      showToast("Fullscreen is unavailable here", "near");
    }
  };

  // ------------------------------------------------------------ touch

  const onStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (view !== "racing" && view !== "gp") return;
    if ((event.target as HTMLElement).closest("button, [data-interactive='true']")) return;
    dragRef.current = { id: event.pointerId, x: event.clientX };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (view === "racing") {
      const rect = event.currentTarget.getBoundingClientRect();
      endlessRef.current?.steerTo(((event.clientX - rect.left) / rect.width) * 2 - 1);
    }
  };

  const onStagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (view === "racing") {
      endlessRef.current?.steerTo(((event.clientX - rect.left) / rect.width) * 2 - 1);
    } else if (view === "gp") {
      // Drag distance from where the finger landed is an analogue wheel.
      gpRef.current?.setSteer((event.clientX - drag.x) / Math.max(60, rect.width * 0.16));
    }
  };

  const onStagePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.id !== event.pointerId) return;
    dragRef.current = null;
    endlessRef.current?.releasePointer();
    if (viewRef.current === "gp") gpRef.current?.setSteer(0);
  };

  const controlPointer = (
    event: ReactPointerEvent<HTMLButtonElement>,
    action: "left" | "right" | "boost" | "brake",
    active: boolean,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const gp = viewRef.current === "gp";
    if (action === "boost") {
      boostRef.current = active;
      if (gp) gpRef.current?.setBoost(active);
      else endlessRef.current?.setBoosting(active);
    } else if (action === "brake") {
      gpRef.current?.setBrake(active);
    } else {
      const value = active ? (action === "left" ? -1 : 1) : 0;
      if (gp) gpRef.current?.setSteer(value);
      else endlessRef.current?.setSteering(value);
    }
  };

  const pressCamera = () => {
    const mode = gpRef.current?.cycleCamera();
    if (mode) showToast(CAMERA_LABEL[mode], "sector");
  };

  const activeDisplayCar = view === "garage" ? garageCar : selectedCar;
  const themeStyle = {
    "--car-primary": activeDisplayCar.cssPrimary,
    "--car-secondary": activeDisplayCar.cssSecondary,
  } as CSSProperties;

  const selectedTrack = TRACKS[trackIndex];
  const selectedRecord = save.grandPrix[selectedTrack.id];
  const nextTrackIndex = gpResult ? gpResult.trackIndex + 1 : -1;
  const nextUnlocked = nextTrackIndex > 0 && nextTrackIndex < TRACKS.length && isTrackUnlocked(save, nextTrackIndex);
  const gpLive = view === "gp" || view === "gp-paused";

  return (
    <main className={`hypernova-app view-${view}`} style={themeStyle}>
      <div
        ref={stageRef}
        className="race-stage"
        onPointerDown={onStagePointerDown}
        onPointerMove={onStagePointerMove}
        onPointerUp={onStagePointerUp}
        onPointerCancel={onStagePointerUp}
      >
        <div className="scene-vignette" aria-hidden="true" />
        <div className={`impact-flash ${hitFlash ? "active" : ""}`} aria-hidden="true" />

        <header className="game-header" data-interactive="true">
          <button className="brand-lockup" onClick={returnToMenu} aria-label="Hypernova Circuit home">
            <span className="brand-mark">H</span>
            <span>
              <strong>HYPERNOVA</strong>
              <small>CIRCUIT · FULL 3D</small>
            </span>
          </button>
          <div className="header-actions">
            <div className="wallet" aria-label={`${save.coins} available coins`}>
              <span className="coin-dot" />
              {formatNumber(save.coins)}
            </div>
            <button className="icon-button" onClick={cycleGraphics} aria-label="Change graphics quality">
              GFX {save.graphics === "auto" ? `AUTO·${quality === "high" ? "HI" : "LO"}` : save.graphics.toUpperCase()}
            </button>
            <button className="icon-button" onClick={toggleMute} aria-label={muted ? "Turn sound on" : "Mute sound"}>
              {muted ? "SOUND OFF" : "SOUND ON"}
            </button>
            <button className="icon-button fullscreen-button" onClick={toggleFullscreen} aria-label="Toggle fullscreen">
              EXPAND
            </button>
          </div>
        </header>

        {view === "menu" && (
          <section className="menu-overlay overlay-layer" data-interactive="true">
            <div className="menu-copy">
              <p className="eyebrow">FLEXZONIC // HYPERNOVA 3.0 · GRAND PRIX</p>
              <h1>
                RACE THE
                <span>HYPERNOVA GRAND PRIX</span>
              </h1>
              <p className="menu-lead">
                Six real 3D circuits with hills, banked bends, tunnels and a figure-eight bridge. Race seven AI rivals over three laps, draft in their slipstream, drift for nitro and chase your own ghost lap.
              </p>
            </div>

            <div className="launch-console glass-panel">
              <div className="selected-machine">
                <div>
                  <span className="micro-label">ACTIVE MACHINE</span>
                  <strong>{selectedCar.name}</strong>
                  <small>{selectedCar.model} · {selectedCar.tagline}</small>
                </div>
                <span className="car-status">READY</span>
              </div>

              <button className="primary-button" onClick={openTracks} disabled={!ready}>
                <span>{ready ? "GRAND PRIX" : "INITIALIZING"}</span>
                <b>→</b>
              </button>
              <button className="secondary-button" onClick={startEndless} disabled={!ready}>
                ENDLESS STORM · CLASSIC RUN
              </button>
              <button className="secondary-button" onClick={openGarage}>
                GARAGE & SHOWROOM
              </button>

              <button
                className={`daily-cache ${dailyAvailable ? "available" : "claimed"}`}
                onClick={claimDailyReward}
                disabled={!dailyAvailable}
              >
                <span className="cache-glyph">◇</span>
                <span>
                  <small>DAILY QUANTUM CACHE</small>
                  <strong>{dailyAvailable ? `CLAIM ${dailyReward} COINS` : "CLAIMED · RETURNS TOMORROW"}</strong>
                </span>
              </button>
            </div>

            <div className="career-strip glass-panel">
              <div><small>GP WINS</small><strong>{Object.values(save.grandPrix).reduce((n, r) => n + r.wins, 0)}</strong></div>
              <div><small>CIRCUITS OPEN</small><strong>{TRACKS.filter((_, i) => isTrackUnlocked(save, i)).length} / {TRACKS.length}</strong></div>
              <div><small>BEST ENDLESS</small><strong>{formatDistance(save.bestDistance)}</strong></div>
              <div><small>RUNS</small><strong>{save.totalRuns}</strong></div>
            </div>
          </section>
        )}

        {view === "tracks" && (
          <section className="tracks-overlay overlay-layer" data-interactive="true">
            <div className="tracks-panel glass-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">HYPERNOVA GRAND PRIX</p>
                  <h2>SELECT CIRCUIT</h2>
                </div>
                <button className="close-button" onClick={returnToMenu}>BACK</button>
              </div>
              <div className="track-grid" role="list">
                {TRACKS.map((track, index) => {
                  const unlocked = isTrackUnlocked(save, index);
                  const record = save.grandPrix[track.id];
                  const look = themeLook(track.theme);
                  return (
                    <button
                      key={track.id}
                      role="listitem"
                      className={`track-card ${index === trackIndex ? "selected" : ""} ${unlocked ? "" : "locked"}`}
                      onClick={() => pickTrack(index)}
                      style={{ "--track-color": `#${look.rail.toString(16).padStart(6, "0")}`, "--track-key": `#${look.key.toString(16).padStart(6, "0")}` } as CSSProperties}
                    >
                      <svg viewBox="-6 -6 112 112" aria-hidden="true">
                        <path d={TRACK_PATHS[index]} />
                      </svg>
                      <span className="track-card-copy">
                        <small>ROUND {index + 1}{unlocked ? "" : " · LOCKED"}</small>
                        <strong>{track.name}</strong>
                        <em>{record ? `BEST ${ordinal(record.bestPosition)} · ${formatLapTime(record.bestLap)}` : unlocked ? "NOT RACED" : "PODIUM PREVIOUS ROUND"}</em>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="track-detail">
                <div>
                  <span className="micro-label">ROUND {trackIndex + 1} · {selectedTrack.laps} LAPS · 8 CARS</span>
                  <h3>{selectedTrack.name}</h3>
                  <p>{selectedTrack.blurb}</p>
                </div>
                <div className="track-facts">
                  <div><small>LAP</small><strong>{(selectedTrack.length / 1000).toFixed(2)} km</strong></div>
                  <div><small>CLIMB</small><strong>{Math.round(selectedTrack.climb)} m</strong></div>
                  <div><small>TIGHTEST</small><strong>{Math.round(selectedTrack.minRadius)} m</strong></div>
                  <div><small>WIN PAYS</small><strong>{formatNumber(raceReward(1, trackIndex))}</strong></div>
                  <div><small>BEST LAP</small><strong>{formatLapTime(selectedRecord?.bestLap ?? 0)}</strong></div>
                  <div><small>WINS</small><strong>{selectedRecord?.wins ?? 0}</strong></div>
                </div>
                <button
                  className="primary-button"
                  onClick={() => startGrandPrix()}
                  disabled={!isTrackUnlocked(save, trackIndex)}
                >
                  <span>{isTrackUnlocked(save, trackIndex) ? `RACE · ${selectedCar.name.toUpperCase()}` : "FINISH TOP 3 ON THE PREVIOUS ROUND"}</span>
                  <b>→</b>
                </button>
              </div>
            </div>
          </section>
        )}

        {view === "garage" && (
          <section className="garage-overlay overlay-layer" data-interactive="true">
            <div className="showroom-bar glass-panel" role="toolbar" aria-label="Showroom camera">
              {SHOWROOM_VIEWS.map((item) => (
                <button
                  key={item.id}
                  className={showroomView === item.id ? "active" : ""}
                  onClick={() => setShowroomView(item.id)}
                >
                  {item.label}
                </button>
              ))}
              {BLUEPRINT_TOGGLE && (
                <button className={blueprintMode ? "active blueprint" : "blueprint"} onClick={() => setBlueprintMode(!blueprintMode)}>
                  BLUEPRINT
                </button>
              )}
            </div>
            <div className="garage-panel glass-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">HYPERNOVA ENGINEERING</p>
                  <h2>GARAGE</h2>
                </div>
                <button className="close-button" onClick={returnToMenu}>BACK</button>
              </div>

              <div className="car-roster" role="list" aria-label="Available hovercars">
                {CARS.map((car) => {
                  const owned = save.ownedCars.includes(car.id);
                  const selected = garageCarId === car.id;
                  return (
                    <button
                      key={car.id}
                      className={`car-card ${selected ? "selected" : ""}`}
                      onClick={() => setGarageCarId(car.id)}
                      style={{ "--card-primary": car.cssPrimary, "--card-secondary": car.cssSecondary } as CSSProperties}
                      role="listitem"
                    >
                      <span className="car-card-color" />
                      <small>{car.model}</small>
                      <strong>{car.name}</strong>
                      <span>{owned ? (save.selectedCar === car.id ? "SELECTED" : "OWNED") : `${formatNumber(car.price)} COINS`}</span>
                    </button>
                  );
                })}
              </div>

              <div className="garage-detail">
                <div className="machine-profile">
                  <span className="micro-label">MACHINE PROFILE</span>
                  <h3>{garageCar.name}</h3>
                  <p>{garageCar.tagline}</p>
                  <div className="stat-bars">
                    {[
                      ["SPEED", garageCar.speed],
                      ["HANDLING", garageCar.handling],
                      ["ARMOR", garageCar.armor],
                      ["MAGNET", garageCar.magnet],
                    ].map(([label, value]) => (
                      <div className="stat-row" key={label as string}>
                        <span>{label}</span>
                        <i><b style={{ width: `${Math.round((value as number) * 100)}%` }} /></i>
                      </div>
                    ))}
                  </div>
                  {!save.ownedCars.includes(garageCar.id) && (
                    <button className="primary-button buy-car" onClick={() => selectOrBuyCar(garageCar.id)}>
                      UNLOCK FOR {formatNumber(garageCar.price)}
                    </button>
                  )}
                  {save.ownedCars.includes(garageCar.id) && save.selectedCar !== garageCar.id && (
                    <button className="primary-button buy-car" onClick={() => selectOrBuyCar(garageCar.id)}>
                      SELECT {garageCar.name.toUpperCase()}
                    </button>
                  )}
                </div>

                <div className="upgrade-lab">
                  <div className="subheading">
                    <span className="micro-label">UNIVERSAL MODULES</span>
                    <small>APPLIES TO EVERY OWNED CAR</small>
                  </div>
                  <div className="upgrade-grid">
                    {UPGRADE_IDS.map((upgradeId) => {
                      const info = UPGRADE_INFO[upgradeId];
                      const level = save.upgrades[upgradeId];
                      const maxed = level >= 5;
                      const cost = maxed ? 0 : upgradeCost(upgradeId, level);
                      return (
                        <button
                          key={upgradeId}
                          className="upgrade-card"
                          onClick={() => buyUpgrade(upgradeId)}
                          disabled={maxed}
                          style={{ "--upgrade-color": info.color } as CSSProperties}
                        >
                          <span className="upgrade-icon">{level + 1}</span>
                          <span className="upgrade-copy">
                            <small>{info.shortName} · LEVEL {level}/5</small>
                            <strong>{info.name}</strong>
                            <em>{info.description}</em>
                          </span>
                          <span className="upgrade-price">{maxed ? "MAX" : `${formatNumber(cost)} ◉`}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {gpLive && gpHud && (
          <section className="race-hud gp-hud overlay-layer" aria-label="Grand Prix status">
            <div className="hud-top">
              <div className="gp-position glass-panel">
                <span className="micro-label">POSITION</span>
                <strong>{gpHud.position}<em>/{gpHud.cars}</em></strong>
                <small>LAP {gpHud.lap}/{gpHud.laps}</small>
              </div>
              <div className="gp-times glass-panel">
                <span><small>LAP</small><b>{formatLapTime(gpHud.lapTime)}</b></span>
                <span><small>BEST</small><b>{formatLapTime(gpHud.bestLap)}</b></span>
                <span><small>GHOST</small><b>{formatLapTime(gpHud.ghostLap)}</b></span>
                <span><small>COINS</small><b><i className="coin-dot" />{formatNumber(gpHud.coins)}</b></span>
              </div>
              <div className="gp-top-actions">
                <button className="pause-button" onClick={pauseRace} aria-label="Pause race">Ⅱ</button>
                <button className="cam-button" onClick={pressCamera} aria-label="Change camera">{CAMERA_LABEL[gpHud.camera].replace(" CAM", "")}</button>
              </div>
            </div>

            <div className="gp-side">
              <svg className="gp-minimap" viewBox="-6 -6 112 112" aria-hidden="true">
                <path d={TRACK_PATHS[trackIndex]} />
                {gpHud.dots.map((dot, k) => (
                  <circle key={k} cx={dot.x} cy={dot.y} r={dot.player ? 4.2 : 2.8} fill={dot.css} stroke={dot.player ? "#fff" : "none"} strokeWidth={1.2} />
                ))}
              </svg>
              <ol className="gp-standings">
                {gpHud.standings.map((row, k) => (
                  <li key={row.name} className={row.isPlayer ? "me" : ""}>
                    <b>{k + 1}</b>
                    <i style={{ background: row.css }} />
                    <span>{row.isPlayer ? "YOU" : row.name.split(" ")[1]?.toUpperCase() ?? row.name}</span>
                    <em>{row.finished ? "FIN" : row.gap}</em>
                  </li>
                ))}
              </ol>
            </div>

            {countdown && <div className={`gp-countdown ${countdown === "GO!" ? "go" : ""}`} key={countdown}>{countdown}</div>}
            {banner && <div className="gp-banner" key={banner}>{banner}</div>}
            <div className={`gp-flag ${gpHud.slipstream ? "visible" : ""}`}>SLIPSTREAM</div>
            <div className={`drift-badge ${gpHud.drift > 2 ? "visible" : ""}`}>
              DRIFT <strong>{Math.ceil(gpHud.drift)}%</strong>
              <i><b style={{ width: `${clampPercent(gpHud.drift)}%` }} /></i>
            </div>

            <div className="speed-block">
              <span className="micro-label">VELOCITY</span>
              <strong>{gpHud.speed}</strong>
              <small>KM/H</small>
            </div>

            <div className="systems-block glass-panel">
              <div className="system-meter shield-meter">
                <span><b>AEGIS</b><em>{gpHud.rebooting ? "REBOOT" : `${Math.ceil((gpHud.shield / gpHud.maxShield) * 100)}%`}</em></span>
                <i><b style={{ width: `${clampPercent((gpHud.shield / gpHud.maxShield) * 100)}%` }} /></i>
              </div>
              <div className="system-meter nitro-meter">
                <span><b>NITRO</b><em>{Math.ceil(gpHud.nitro)}%</em></span>
                <i><b style={{ width: `${clampPercent(gpHud.nitro)}%` }} /></i>
              </div>
            </div>

            <div className="touch-controls" data-interactive="true">
              <div className="steer-controls">
                <button
                  aria-label="Steer left"
                  onPointerDown={(event) => controlPointer(event, "left", true)}
                  onPointerUp={(event) => controlPointer(event, "left", false)}
                  onPointerCancel={(event) => controlPointer(event, "left", false)}
                  onPointerLeave={(event) => controlPointer(event, "left", false)}
                >
                  ←
                </button>
                <button
                  aria-label="Steer right"
                  onPointerDown={(event) => controlPointer(event, "right", true)}
                  onPointerUp={(event) => controlPointer(event, "right", false)}
                  onPointerCancel={(event) => controlPointer(event, "right", false)}
                  onPointerLeave={(event) => controlPointer(event, "right", false)}
                >
                  →
                </button>
              </div>
              <div className="pedal-controls">
                <button
                  className="brake-control"
                  aria-label="Brake"
                  onPointerDown={(event) => controlPointer(event, "brake", true)}
                  onPointerUp={(event) => controlPointer(event, "brake", false)}
                  onPointerCancel={(event) => controlPointer(event, "brake", false)}
                  onPointerLeave={(event) => controlPointer(event, "brake", false)}
                >
                  BRAKE
                </button>
                <button
                  className="boost-control"
                  aria-label="Activate nitro boost"
                  onPointerDown={(event) => controlPointer(event, "boost", true)}
                  onPointerUp={(event) => controlPointer(event, "boost", false)}
                  onPointerCancel={(event) => controlPointer(event, "boost", false)}
                  onPointerLeave={(event) => controlPointer(event, "boost", false)}
                >
                  <span>BOOST</span>
                  <b>▲</b>
                </button>
              </div>
            </div>

            <p className="control-hint">STEER ← → · BOOST SPACE · TAP BRAKE (S) IN A TURN TO DRIFT · C CAMERA · B LOOK BACK</p>
          </section>
        )}

        {view === "gp-paused" && (
          <section className="modal-overlay overlay-layer" data-interactive="true">
            <div className="modal-card glass-panel">
              <p className="eyebrow">SYSTEM HOLD</p>
              <h2>RACE PAUSED</h2>
              <p>{selectedTrack.name} · lap {gpHud?.lap ?? 1} of {selectedTrack.laps}</p>
              <button className="primary-button" onClick={resumeRace}>RESUME RACE</button>
              <button className="secondary-button" onClick={() => startGrandPrix(trackIndex)}>RESTART RACE</button>
              <button className="secondary-button" onClick={returnToMenu}>RETIRE TO MENU</button>
              <small>Keyboard: P or Esc to resume</small>
            </div>
          </section>
        )}

        {view === "gp-result" && gpResult && (
          <section className="modal-overlay result-overlay overlay-layer" data-interactive="true">
            <div className="modal-card result-card gp-result glass-panel">
              <p className="eyebrow">{gpResult.trackName.toUpperCase()}</p>
              <h2>{gpResult.position === 1 ? "VICTORY" : `${ordinal(gpResult.position)} PLACE`}</h2>
              <ol className="podium-list">
                {gpResult.standings.map((row, k) => (
                  <li key={row.name} className={row.isPlayer ? "me" : ""}>
                    <b>{k + 1}</b>
                    <i style={{ background: row.css }} />
                    <span>{row.isPlayer ? "YOU" : row.name}<small>{row.team}</small></span>
                    <em>{k === 0 ? formatLapTime(row.time) : `+${(row.time - gpResult.standings[0].time).toFixed(2)}s`}</em>
                  </li>
                ))}
              </ol>
              <div className="result-grid">
                <div><small>RACE TIME</small><strong>{formatLapTime(gpResult.raceTime)}</strong></div>
                <div><small>BEST LAP</small><strong>{formatLapTime(gpResult.bestLap)}</strong></div>
                <div><small>COINS + PRIZE</small><strong>+{formatNumber(gpResult.coins + gpResult.reward)}</strong></div>
              </div>
              {nextUnlocked && (
                <button className="primary-button" onClick={() => startGrandPrix(nextTrackIndex)}>
                  <span>NEXT ROUND · {TRACKS[nextTrackIndex].name.toUpperCase()}</span><b>→</b>
                </button>
              )}
              <button className={nextUnlocked ? "secondary-button" : "primary-button"} onClick={() => startGrandPrix(gpResult.trackIndex)}>RACE AGAIN</button>
              <button className="secondary-button" onClick={openTracks}>CIRCUIT SELECT</button>
              <button className="secondary-button" onClick={openGarage}>SPEND REWARDS</button>
            </div>
          </section>
        )}

        {(view === "racing" || view === "paused") && (
          <section className="race-hud overlay-layer" aria-label="Race status">
            <div className="hud-top">
              <div className="sector-block glass-panel">
                <span className="micro-label">ENDLESS STORM {hud.sector.toString().padStart(2, "0")}</span>
                <strong>{hud.circuitName}</strong>
                <small>CHECKPOINT {((hud.checkpoint - 1) % 4) + 1} / 4</small>
                <i><b style={{ width: `${hud.checkpointProgress * 100}%` }} /></i>
              </div>
              <div className="run-counters glass-panel">
                <span><i className="coin-dot" />{formatNumber(hud.coins)}</span>
                <span>{formatDistance(hud.distance)}</span>
                <span>{hud.dodged} DODGED</span>
                <span>{hud.rivalsPassed} OVERTAKES</span>
              </div>
              <button className="pause-button" onClick={pauseRace} aria-label="Pause race">Ⅱ</button>
            </div>

            <div className={`combo-badge ${hud.combo > 1 ? "visible" : ""}`}>
              COIN CHAIN <strong>×{hud.combo}</strong>
            </div>
            <div className={`drift-badge ${hud.drift > 2 ? "visible" : ""}`}>
              DRIFT CHARGE <strong>{Math.ceil(hud.drift)}%</strong>
              <i><b style={{ width: `${clampPercent(hud.drift)}%` }} /></i>
            </div>

            <div className="speed-block">
              <span className="micro-label">VELOCITY</span>
              <strong>{hud.speed}</strong>
              <small>KM/H</small>
            </div>

            <div className="systems-block glass-panel">
              <div className="system-meter shield-meter">
                <span><b>AEGIS</b><em>{Math.ceil((hud.shield / hud.maxShield) * 100)}%</em></span>
                <i><b style={{ width: `${clampPercent((hud.shield / hud.maxShield) * 100)}%` }} /></i>
              </div>
              <div className="system-meter nitro-meter">
                <span><b>NITRO</b><em>{Math.ceil(hud.nitro)}%</em></span>
                <i><b style={{ width: `${clampPercent(hud.nitro)}%` }} /></i>
              </div>
            </div>

            <div className="touch-controls" data-interactive="true">
              <div className="steer-controls">
                <button
                  aria-label="Steer left"
                  onPointerDown={(event) => controlPointer(event, "left", true)}
                  onPointerUp={(event) => controlPointer(event, "left", false)}
                  onPointerCancel={(event) => controlPointer(event, "left", false)}
                  onPointerLeave={(event) => controlPointer(event, "left", false)}
                >
                  ←
                </button>
                <button
                  aria-label="Steer right"
                  onPointerDown={(event) => controlPointer(event, "right", true)}
                  onPointerUp={(event) => controlPointer(event, "right", false)}
                  onPointerCancel={(event) => controlPointer(event, "right", false)}
                  onPointerLeave={(event) => controlPointer(event, "right", false)}
                >
                  →
                </button>
              </div>
              <button
                className="boost-control"
                aria-label="Activate nitro boost"
                onPointerDown={(event) => controlPointer(event, "boost", true)}
                onPointerUp={(event) => controlPointer(event, "boost", false)}
                onPointerCancel={(event) => controlPointer(event, "boost", false)}
                onPointerLeave={(event) => controlPointer(event, "boost", false)}
              >
                <span>BOOST</span>
                <b>▲</b>
              </button>
            </div>

            <p className="control-hint">DRAG TO STEER · HOLD BOOST · HARD STEER AT SPEED TO DRIFT</p>
          </section>
        )}

        {view === "paused" && (
          <section className="modal-overlay overlay-layer" data-interactive="true">
            <div className="modal-card glass-panel">
              <p className="eyebrow">SYSTEM HOLD</p>
              <h2>RUN PAUSED</h2>
              <p>Your run is frozen. Resume when the circuit is clear.</p>
              <button className="primary-button" onClick={resumeRace}>RESUME RUN</button>
              <button className="secondary-button" onClick={returnToMenu}>ABANDON TO MENU</button>
              <small>Keyboard: P or Esc to resume</small>
            </div>
          </section>
        )}

        {view === "result" && result && (
          <section className="modal-overlay result-overlay overlay-layer" data-interactive="true">
            <div className="modal-card result-card glass-panel">
              <p className="eyebrow">RUN ARCHIVED</p>
              <h2>SECTOR {result.sector}</h2>
              <p className="result-rank">{result.sector >= 8 ? "QUANTUM ACE" : result.sector >= 4 ? "NEON VANGUARD" : "CIRCUIT RUNNER"}</p>
              <div className="result-grid">
                <div><small>COINS BANKED</small><strong>+{formatNumber(result.coins)}</strong></div>
                <div><small>DISTANCE</small><strong>{formatDistance(result.distance)}</strong></div>
                <div><small>TOP SPEED</small><strong>{result.topSpeed} <em>KM/H</em></strong></div>
                <div><small>HAZARDS DODGED</small><strong>{result.dodged}</strong></div>
                <div><small>RIVALS OVERTAKEN</small><strong>{result.rivalsPassed}</strong></div>
                <div><small>DRIFT REWARDS</small><strong>+{result.driftRewards}</strong></div>
              </div>
              <button className="primary-button" onClick={startEndless}>RUN AGAIN</button>
              <button className="secondary-button" onClick={openGarage}>SPEND REWARDS</button>
              <button className="secondary-button" onClick={returnToMenu}>MAIN MENU</button>
            </div>
          </section>
        )}

        {toast && (
          <div key={toast.id} className={`game-toast toast-${toast.kind}`} role="status" aria-live="polite">
            {toast.message}
          </div>
        )}

        <div className="sr-only" aria-live="polite">
          {view === "gp" && gpHud ? `Position ${gpHud.position} of ${gpHud.cars}. Lap ${gpHud.lap} of ${gpHud.laps}. Speed ${gpHud.speed}.` : ""}
          {view === "racing" ? `Speed ${hud.speed}. ${hud.coins} coins. Shield ${Math.ceil(hud.shield)}.` : ""}
        </div>
      </div>
    </main>
  );
}
