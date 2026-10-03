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

type View = "menu" | "garage" | "racing" | "paused" | "result";
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

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.floor(value));
}

function formatDistance(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)} km` : `${value} m`;
}

export default function HypernovaGame() {
  const stageRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<HypernovaEngine | null>(null);
  const audioRef = useRef<HypernovaAudio | null>(null);
  const viewRef = useRef<View>("menu");
  const boostRef = useRef(false);
  const pressedKeysRef = useRef(new Set<string>());
  const dragPointerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const flashTimerRef = useRef<number | null>(null);

  const [view, setView] = useState<View>("menu");
  const [save, setSave] = useState<SaveData>(createDefaultSave);
  const [garageCarId, setGarageCarId] = useState<CarId>("pulse");
  const [ready, setReady] = useState(false);
  const [hud, setHud] = useState<RaceHud>(EMPTY_HUD);
  const [result, setResult] = useState<RaceResult | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [hitFlash, setHitFlash] = useState(false);
  const [muted, setMuted] = useState(false);

  const selectedCar = useMemo(() => getCar(save.selectedCar), [save.selectedCar]);
  const garageCar = useMemo(() => getCar(garageCarId), [garageCarId]);
  const selectedStats = useMemo(
    () => effectiveStats(selectedCar, save.upgrades),
    [selectedCar, save.upgrades],
  );
  const dailyReward = dailyRewardAmount(save.highestSector);
  const dailyAvailable = save.dailyClaimDate !== utcDateKey();

  const showToast = useCallback((message: string, kind: string) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    const id = Date.now();
    setToast({ id, message, kind });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 1700);
  }, []);

  const commitSave = useCallback(
    (update: (current: SaveData) => SaveData): SaveData | null => {
      let committed: SaveData | null = null;
      setSave((current) => {
        committed = update(current);
        storeSave(committed);
        return committed;
      });
      return committed;
    },
    [],
  );

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
          setHitFlash(true);
          if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
          flashTimerRef.current = window.setTimeout(() => setHitFlash(false), 260);
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
    [showToast],
  );

  useEffect(() => {
    if (!stageRef.current) return;
    const loaded = loadSave();
    setSave(loaded);
    const audio = new HypernovaAudio();
    audioRef.current = audio;

    const engine = new HypernovaEngine(
      stageRef.current,
      getCar(loaded.selectedCar),
      loaded.upgrades,
      {
        onHud: (nextHud) => {
          setHud(nextHud);
          audio.setSpeed(nextHud.speed, boostRef.current);
        },
        onEvent: handleGameEvent,
        onGameOver: (raceResult) => {
          boostRef.current = false;
          setResult(raceResult);
          commitSave((current) => ({
            ...current,
            coins: current.coins + raceResult.coins,
            totalCoins: current.totalCoins + raceResult.coins,
            bestDistance: Math.max(current.bestDistance, raceResult.distance),
            highestSector: Math.max(current.highestSector, raceResult.sector),
            totalRuns: current.totalRuns + 1,
          }));
          viewRef.current = "result";
          setView("result");
        },
      },
    );
    engineRef.current = engine;
    engine.start();
    setReady(true);

    if ("serviceWorker" in navigator) {
      const register = () =>
        void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
      if (document.readyState === "complete") register();
      else window.addEventListener("load", register, { once: true });
    }

    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
      engine.dispose();
      audio.dispose();
      engineRef.current = null;
      audioRef.current = null;
    };
  }, [commitSave, handleGameEvent]);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    if (view !== "racing" && view !== "paused") {
      engineRef.current?.setShowroomCar(
        view === "garage" ? garageCar : selectedCar,
        save.upgrades,
      );
    }
  }, [garageCar, save.upgrades, selectedCar, view]);

  const pauseRace = useCallback(() => {
    if (viewRef.current !== "racing") return;
    boostRef.current = false;
    engineRef.current?.setBoosting(false);
    engineRef.current?.pause();
    viewRef.current = "paused";
    setView("paused");
  }, []);

  const resumeRace = useCallback(() => {
    if (viewRef.current !== "paused") return;
    void audioRef.current?.activate();
    engineRef.current?.resume();
    viewRef.current = "racing";
    setView("racing");
  }, []);

  useEffect(() => {
    const updateKeyboardSteering = () => {
      const keys = pressedKeysRef.current;
      const left = keys.has("arrowleft") || keys.has("a");
      const right = keys.has("arrowright") || keys.has("d");
      engineRef.current?.setSteering((right ? 1 : 0) - (left ? 1 : 0));
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (["arrowleft", "arrowright", "a", "d", " "].includes(key)) {
        event.preventDefault();
      }
      if ((key === "p" || key === "escape") && !event.repeat) {
        if (viewRef.current === "racing") pauseRace();
        else if (viewRef.current === "paused") resumeRace();
        return;
      }
      if (viewRef.current !== "racing") return;
      pressedKeysRef.current.add(key);
      updateKeyboardSteering();
      if (key === " ") {
        boostRef.current = true;
        engineRef.current?.setBoosting(true);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      pressedKeysRef.current.delete(key);
      updateKeyboardSteering();
      if (key === " ") {
        boostRef.current = false;
        engineRef.current?.setBoosting(false);
      }
    };

    const onVisibility = () => {
      if (document.hidden && viewRef.current === "racing") pauseRace();
    };

    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pauseRace, resumeRace]);

  const startRace = async () => {
    await audioRef.current?.activate();
    setResult(null);
    setHud({ ...EMPTY_HUD, maxShield: selectedStats.maxShield, shield: selectedStats.maxShield });
    engineRef.current?.beginRace(selectedCar, save.upgrades);
    viewRef.current = "racing";
    setView("racing");
  };

  const openGarage = () => {
    setGarageCarId(save.selectedCar);
    engineRef.current?.setShowroomCar(selectedCar, save.upgrades);
    engineRef.current?.startAttract();
    viewRef.current = "garage";
    setView("garage");
  };

  const returnToMenu = () => {
    boostRef.current = false;
    engineRef.current?.setBoosting(false);
    engineRef.current?.startAttract();
    viewRef.current = "menu";
    setView("menu");
  };

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
      upgrades: {
        ...current.upgrades,
        [upgradeId]: current.upgrades[upgradeId] + 1,
      },
    }));
    showToast(`${UPGRADE_INFO[upgradeId].name} upgraded`, "repair");
  };

  const claimDailyReward = () => {
    if (!dailyAvailable) return;
    commitSave((current) => ({
      ...current,
      coins: current.coins + dailyReward,
      dailyClaimDate: utcDateKey(),
    }));
    void audioRef.current?.activate().then(() => audioRef.current?.sector());
    showToast(`Daily cache +${dailyReward} coins`, "coin");
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    audioRef.current?.setMuted(next);
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stageRef.current?.requestFullscreen();
    } catch {
      showToast("Fullscreen is unavailable here", "near");
    }
  };

  const pointerPosition = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return ((event.clientX - rect.left) / rect.width) * 2 - 1;
  };

  const onStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (view !== "racing") return;
    if ((event.target as HTMLElement).closest("button, [data-interactive='true']")) return;
    dragPointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    engineRef.current?.steerTo(pointerPosition(event));
  };

  const onStagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragPointerRef.current !== event.pointerId || view !== "racing") return;
    engineRef.current?.steerTo(pointerPosition(event));
  };

  const onStagePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragPointerRef.current !== event.pointerId) return;
    dragPointerRef.current = null;
    engineRef.current?.releasePointer();
  };

  const controlPointer = (
    event: ReactPointerEvent<HTMLButtonElement>,
    action: "left" | "right" | "boost",
    active: boolean,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (action === "boost") {
      boostRef.current = active;
      engineRef.current?.setBoosting(active);
    } else {
      engineRef.current?.setSteering(active ? (action === "left" ? -1 : 1) : 0);
    }
  };

  const activeDisplayCar = view === "garage" ? garageCar : selectedCar;
  const themeStyle = {
    "--car-primary": activeDisplayCar.cssPrimary,
    "--car-secondary": activeDisplayCar.cssSecondary,
  } as CSSProperties;

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
              <small>CIRCUIT</small>
            </span>
          </button>
          <div className="header-actions">
            <div className="wallet" aria-label={`${save.coins} available coins`}>
              <span className="coin-dot" />
              {formatNumber(save.coins)}
            </div>
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
              <p className="eyebrow">FLEXZONIC // VELOCITY PROTOCOL</p>
              <h1>
                OUTRUN THE
                <span>QUANTUM STORM</span>
              </h1>
              <p className="menu-lead">
                Attack a full-scale Grand Circuit with sweeping bends, long checkpoint sectors, warp lanes, rival packs, drift rewards, and six living race environments.
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

              <button className="primary-button" onClick={startRace} disabled={!ready}>
                <span>{ready ? "LAUNCH RUN" : "INITIALIZING"}</span>
                <b>→</b>
              </button>
              <button className="secondary-button" onClick={openGarage}>
                GARAGE & UPGRADES
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
              <div><small>BEST DISTANCE</small><strong>{formatDistance(save.bestDistance)}</strong></div>
              <div><small>HIGHEST SECTOR</small><strong>{save.highestSector}</strong></div>
              <div><small>LIFETIME COINS</small><strong>{formatNumber(save.totalCoins)}</strong></div>
              <div><small>RUNS</small><strong>{save.totalRuns}</strong></div>
            </div>

            <div className="signal-legend" aria-label="Track signal color guide">
              <span><i className="signal coin" />GOLD: COINS</span>
              <span><i className="signal hazard" />PINK: HAZARD</span>
              <span><i className="signal boost" />CYAN: WARP / NITRO</span>
              <span><i className="signal repair" />GREEN: REPAIR</span>
            </div>
          </section>
        )}

        {view === "garage" && (
          <section className="garage-overlay overlay-layer" data-interactive="true">
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
                      style={{
                        "--card-primary": car.cssPrimary,
                        "--card-secondary": car.cssSecondary,
                      } as CSSProperties}
                      role="listitem"
                    >
                      <span className="car-card-color" />
                      <small>{car.model}</small>
                      <strong>{car.name}</strong>
                      <span>{owned ? (selected ? "SELECTED" : "OWNED") : `${formatNumber(car.price)} COINS`}</span>
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

        {(view === "racing" || view === "paused") && (
          <section className="race-hud overlay-layer" aria-label="Race status">
            <div className="hud-top">
              <div className="sector-block glass-panel">
                <span className="micro-label">GRAND CIRCUIT {hud.sector.toString().padStart(2, "0")}</span>
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
              <h2>RACE PAUSED</h2>
              <p>Your run is frozen. Resume when the circuit is clear.</p>
              <button className="primary-button" onClick={resumeRace}>RESUME RUN</button>
              <button className="secondary-button" onClick={returnToMenu}>ABANDON TO GARAGE</button>
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
              <button className="primary-button" onClick={startRace}>RACE AGAIN</button>
              <button className="secondary-button" onClick={openGarage}>SPEND REWARDS</button>
            </div>
          </section>
        )}

        {toast && (
          <div key={toast.id} className={`game-toast toast-${toast.kind}`} role="status" aria-live="polite">
            {toast.message}
          </div>
        )}

        <div className="sr-only" aria-live="polite">
          {view === "racing" ? `Speed ${hud.speed}. ${hud.coins} coins. Shield ${Math.ceil(hud.shield)}.` : ""}
        </div>
      </div>
    </main>
  );
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}
