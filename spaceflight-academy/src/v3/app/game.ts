import * as THREE from "three";
import type { AgePath } from "../../flight-data.ts";
import { CADETS, SUIT_ACCENTS, type CadetId } from "../blueprints/cast.ts";
import { getBlueprint } from "../blueprints/registry.ts";
import type { Blueprint, MatSpec } from "../blueprints/types.ts";
import { Engine, detectQuality, type QualityLevel, type SceneController } from "../engine/engine.ts";
import { setMood, setMusicEnabled, setSoundEnabled, sfx, stopLoops, unlockAudio, type Mood } from "../engine/audio.ts";
import { narrationRate, onCaption, setNarrationEnabled, speak, stopSpeaking, unlockSpeech } from "../engine/narrator.ts";
import { SpaceFactory } from "../engine/space.ts";
import { input } from "../engine/input.ts";
import { makeEngineeringMission, type EngineeringMission } from "../engineering/missions.ts";
import { emptyCounts, type SystemCounts } from "../engineering/systems.ts";
import { missionStars, missionXp, type RushSnapshot } from "../learning/rush.ts";
import { buildBlueprint, type BuiltModel } from "../models/build.ts";
import { loadSave, missionKey, writeSave, type Save } from "../state/save.ts";
import { createStore, type Store } from "./store.ts";
import { ACHIEVEMENTS, checkAchievements } from "../data/achievements.ts";
import { STUDIO_ENABLED } from "./features.ts";

export type Screen =
  | "title" | "onboard" | "hub" | "map" | "brief" | "rush" | "build" | "launch" | "activity" | "results"
  | "observatory" | "studio" | "lounge" | "family" | "grownups" | "training" | "sandbox";

export type Overlay = "settings" | "pause" | "journal" | "help" | null;

export interface MissionRun {
  age: AgePath;
  level: number;
  mission: EngineeringMission;
  rush: RushSnapshot | null;
  counts: SystemCounts;
  energyLeft: number;
  activityScore: number;
  practice: boolean;
}

export interface ResultsView {
  level: number;
  age: AgePath;
  stars: number;
  xp: number;
  correct: number;
  total: number;
  bestCombo: number;
  boss: boolean;
  badge: string | null;
  newAchievements: string[];
  facts: string[];
  unlocked: number;
  energyLeft: number;
  activityScore: number;
}

export interface UIState {
  screen: Screen;
  overlay: Overlay;
  caption: string | null;
  speaking: boolean;
  toast: { id: number; text: string; icon: string } | null;
  run: MissionRun | null;
  results: ResultsView | null;
  /** Free-form per-scene view data (each scene owns its own key). */
  hub: { prompt: { id: string; label: string; icon: string } | null; mode: "attract" | "lineup" | "explore" };
  rush: RushSnapshot | null;
  build: unknown;
  launch: unknown;
  activity: unknown;
  map: { selected: number | null };
  observatory: unknown;
  studio: unknown;
  training: unknown;
  loading: string | null;
  fps: number;
}

export interface SceneFactoryMap {
  [id: string]: (game: Game) => SceneController;
}

let toastId = 0;

export class Game {
  readonly engine: Engine;
  readonly space: SpaceFactory;
  readonly save: Store<Save>;
  readonly ui: Store<UIState>;
  readonly scenes = new Map<string, SceneController>();
  private readonly factories: SceneFactoryMap;
  private saveTimer = 0;
  private readonly modelTemplates = new Map<string, BuiltModel>();
  readonly thumbnails = new Map<string, string>();

  constructor(container: HTMLElement, factories: SceneFactoryMap) {
    this.factories = factories;
    const saved = loadSave();
    this.save = createStore<Save>(saved);
    const q = saved.v3.quality === "auto" ? detectQuality() : saved.v3.quality;
    this.engine = new Engine(container, q as QualityLevel);
    this.space = new SpaceFactory(this.engine.renderer, this.engine.quality === "low" ? 512 : 1024);
    this.ui = createStore<UIState>({
      screen: "title", overlay: null, caption: null, speaking: false, toast: null, run: null, results: null,
      hub: { prompt: null, mode: "attract" }, rush: null, build: null, launch: null, activity: null,
      map: { selected: null }, observatory: null, studio: null, training: null, loading: null, fps: 60,
    });
    onCaption((text, speaking) => this.ui.set({ caption: text, speaking }));
    this.save.subscribe(() => this.queueSave());
    this.applySettings();
    window.addEventListener("pagehide", () => writeSave(this.save.get()));
  }

  // ------------------------------------------------------------ settings & persistence

  private queueSave() {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => writeSave(this.save.get()), 250);
  }

  applySettings() {
    const s = this.save.get();
    setSoundEnabled(s.sound);
    setMusicEnabled(s.v3.music);
    setNarrationEnabled(s.v3.narration);
    if (s.v3.quality !== "auto") this.engine.setQuality(s.v3.quality);
  }

  updateV3(patch: Partial<Save["v3"]>) {
    this.save.set((s) => ({ v3: { ...s.v3, ...patch } }));
    this.applySettings();
  }

  get age(): AgePath {
    return this.save.get().age ?? "5–7";
  }

  get rate() {
    return narrationRate(this.age);
  }

  get reduceMotion() {
    return this.save.get().v3.reduceMotion;
  }

  /** User gesture: unlock audio + speech (iOS) and leave the title screen. */
  unlock() {
    unlockAudio();
    unlockSpeech();
  }

  say(text: string, caption?: string) {
    return speak(text, { rate: this.rate, caption });
  }

  quiet() {
    stopSpeaking();
  }

  sound(kind: Parameters<typeof sfx>[0]) {
    sfx(kind);
  }

  mood(m: Mood) {
    setMood(m);
  }

  toast(text: string, icon = "✦") {
    this.ui.set({ toast: { id: ++toastId, text, icon } });
  }

  // ------------------------------------------------------------ models

  /** Builds a model, applying the player's cadet look/suit colours when relevant. */
  model(id: string, palette?: Record<string, MatSpec>): BuiltModel {
    const bp = getBlueprint(id);
    if (!bp) throw new Error("unknown blueprint " + id);
    return buildBlueprint(bp, { resolve: getBlueprint, quality: this.engine.quality, palette, shadows: this.engine.quality !== "low" });
  }

  cadetModel(cadet: CadetId = this.save.get().v3.cadet, suit = this.save.get().v3.suit) {
    const accent = SUIT_ACCENTS[suit] ?? SUIT_ACCENTS.classic;
    return this.model(`cadet-${cadet}`, {
      accent: { color: accent.accent, roughness: 0.38, metalness: 0.08 },
      panel: { color: accent.panel, roughness: 0.45, metalness: 0.05 },
    });
  }

  blueprint(id: string): Blueprint {
    const bp = getBlueprint(id);
    if (!bp) throw new Error("unknown blueprint " + id);
    return bp;
  }

  /** Renders (once) a small thumbnail PNG of a blueprint for menus. */
  thumbnail(id: string, size = 160): string {
    const hit = this.thumbnails.get(id);
    if (hit) return hit;
    const renderer = this.engine.renderer;
    const model = this.modelTemplates.get(id) ?? this.model(id);
    this.modelTemplates.set(id, model);
    const scene = new THREE.Scene();
    scene.environment = this.engine.envMap;
    scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x30304a, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.3);
    key.position.set(4, 6, 5);
    scene.add(key);
    scene.add(model.root);
    const box = new THREE.Box3().setFromObject(model.root);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 1000);
    const dir = new THREE.Vector3(0.75, 0.42, 1).normalize();
    camera.position.copy(sphere.center).addScaledVector(dir, sphere.radius / Math.sin((14 * Math.PI) / 180) * 1.02);
    camera.lookAt(sphere.center);
    const target = new THREE.WebGLRenderTarget(size, size, { samples: 4, colorSpace: THREE.SRGBColorSpace });
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    const pixels = new Uint8Array(size * size * 4);
    renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
    renderer.setRenderTarget(previous);
    target.dispose();
    scene.remove(model.root);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) image.data.set(pixels.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    ctx.putImageData(image, 0, 0);
    const url = canvas.toDataURL("image/png");
    this.thumbnails.set(id, url);
    return url;
  }

  // ------------------------------------------------------------ scenes & screens

  scene(id: string): SceneController {
    let scene = this.scenes.get(id);
    if (!scene) {
      const factory = this.factories[id];
      if (!factory) throw new Error("no scene " + id);
      scene = factory(this);
      this.scenes.set(id, scene);
    }
    return scene;
  }

  async show(sceneId: string, screen: Screen, params?: unknown, fade = true) {
    this.quiet();
    stopLoops();
    input.clearPresses();
    this.ui.set({ screen, overlay: null });
    const scene = this.scene(sceneId);
    if (this.engine.current !== scene || params !== undefined) await this.engine.show(scene, params, fade);
  }

  /** Screen shown before the current one (used by the Grown-ups page to return). */
  previousScreen: Screen | null = null;

  setScreen(screen: Screen) {
    const current = this.ui.get().screen;
    if (current !== screen) this.previousScreen = current;
    this.ui.set({ screen });
  }

  setOverlay(overlay: Overlay) {
    this.ui.set({ overlay });
    if (overlay === "pause") this.engine.paused = true;
  }

  closeOverlay() {
    const wasPaused = this.ui.get().overlay === "pause";
    this.ui.set({ overlay: null });
    if (wasPaused) {
      this.engine.paused = false;
      (this.engine.current as { resume?: () => void } | null)?.resume?.();
    }
  }

  pause() {
    if (this.ui.get().overlay) return;
    this.quiet();
    stopLoops();
    this.setOverlay("pause");
  }

  // ------------------------------------------------------------ flow

  async start() {
    this.engine.start();
    await this.show("hub", "title", { mode: "attract" }, false);
    setMood("hub");
  }

  async enterAcademy() {
    this.unlock();
    sfx("tap");
    const s = this.save.get();
    if (!s.age) {
      this.ui.set({ screen: "onboard", hub: { ...this.ui.get().hub, mode: "lineup" } });
      (this.scene("hub") as { setMode?: (m: string) => void }).setMode?.("lineup");
      return;
    }
    await this.goHub();
  }

  chooseAge(age: AgePath) {
    this.save.set({ age });
    sfx("select");
  }

  chooseCadet(cadet: CadetId) {
    this.updateV3({ cadet });
    (this.scene("hub") as { refreshCadet?: () => void }).refreshCadet?.();
    sfx("select");
    const look = CADETS.find((c) => c.id === cadet);
    if (look) void this.say(`Cadet ${look.name}. ${look.tagline}`);
  }

  chooseSuit(suit: string) {
    this.updateV3({ suit });
    (this.scene("hub") as { refreshCadet?: () => void }).refreshCadet?.();
    sfx("build");
  }

  async goHub() {
    this.ui.set({ run: null, results: null, rush: null, build: null, launch: null, activity: null });
    setMood("hub");
    await this.show("hub", "hub", { mode: "explore" });
  }

  async openMap(level?: number) {
    setMood("calm");
    this.ui.set({ map: { selected: level ?? null } });
    await this.show("map", "map", { focus: level ?? this.save.get().progress[this.age] });
  }

  unlockedLevel() {
    return this.save.get().progress[this.age];
  }

  async startMission(level: number, practice = false) {
    const age = this.age;
    if (!practice && level > this.unlockedLevel()) {
      sfx("error");
      return;
    }
    const mission = makeEngineeringMission(age, level);
    const run: MissionRun = { age, level, mission, rush: null, counts: { ...mission.start }, energyLeft: mission.energy, activityScore: 0, practice };
    this.ui.set({ run, results: null, map: { selected: level } });
    this.setScreen("brief");
    void this.say(this.briefingText(mission));
  }

  briefingText(m: EngineeringMission) {
    const boss = m.boss ? " Boss mission! Meteor Command is guarding the route." : "";
    return `Mission ${m.level}. ${m.world.name}. Objective: ${m.objective}.${boss} First, fly the Space Rush and clear six learning gates. Each question and all three answers are read aloud before the timer starts. Then build a rocket that can reach ${m.destination}.`;
  }

  async beginRush() {
    const run = this.ui.get().run;
    if (!run) return;
    setMood(run.mission.boss ? "tension" : "space");
    await this.show("rush", "rush", { run });
  }

  /** Called by the rush scene when all six gates are done. */
  async finishRush(snapshot: RushSnapshot) {
    const run = this.ui.get().run;
    if (!run) return;
    const correctIds = snapshot.answered.filter((a) => a.correct).map((a) => a.id);
    this.save.set((s) => ({
      bestCombo: Math.max(s.bestCombo, snapshot.bestCombo),
      v3: {
        ...s.v3,
        journal: [...new Set([...s.v3.journal, ...correctIds])],
        stats: { ...s.v3.stats, gates: s.v3.stats.gates + snapshot.answered.length, gatesCorrect: s.v3.stats.gatesCorrect + correctIds.length },
      },
    }));
    this.ui.set({ run: { ...run, rush: snapshot } });
    setMood("build");
    await this.show("hangar", "build", { mode: "mission" });
  }

  updateBuild(counts: SystemCounts, energyLeft: number) {
    const run = this.ui.get().run;
    if (run) this.ui.set({ run: { ...run, counts, energyLeft } });
  }

  async launch() {
    const run = this.ui.get().run;
    if (!run) return;
    this.save.set((s) => ({ v3: { ...s.v3, stats: { ...s.v3.stats, launches: s.v3.stats.launches + 1 } } }));
    setMood("none");
    await this.show("launch", "launch", { counts: run.counts, destination: run.mission.destination, worldIndex: run.mission.worldIndex, boss: run.mission.boss });
  }

  async startActivity() {
    const run = this.ui.get().run;
    if (!run) return;
    setMood(run.mission.boss ? "tension" : "space");
    await this.show(`act-${run.mission.activity}`, "activity", { run });
  }

  /** Activity finished (score 1..3). Awards the mission exactly like v2.1 plus v3 extras. */
  async finishMission(activityScore: number) {
    const run = this.ui.get().run;
    if (!run) return;
    const { age, level, mission } = run;
    if (run.practice) {
      this.recordActivity(mission.activity, activityScore);
      this.ui.set({ results: null });
      await this.openTraining();
      return;
    }
    const rush = run.rush;
    const mistakes = rush?.mistakes ?? 0;
    const correct = rush?.correct ?? 0;
    const stars = missionStars(mistakes, run.energyLeft);
    const xp = missionXp(level, stars, correct);
    const key = missionKey(age, level);
    const badge = mission.boss ? `${mission.world.name} Ace` : null;
    const before = this.save.get();
    const unlocked = Math.max(before.progress[age], Math.min(30, level + 1));
    this.save.set((s) => ({
      progress: { ...s.progress, [age]: unlocked },
      stars: { ...s.stars, [key]: Math.max(s.stars[key] ?? 0, stars) },
      xp: s.xp + xp,
      starCores: s.starCores + stars + (mission.boss ? 3 : 0),
      bestCombo: Math.max(s.bestCombo, rush?.bestCombo ?? 0),
      badges: [...new Set([...s.badges, ...(badge ? [badge] : [])])],
      v3: { ...s.v3, passport: [...new Set([...s.v3.passport, String(mission.worldIndex)])], lastPlayed: new Date().toISOString() },
    }));
    this.recordActivity(mission.activity, activityScore);
    const newAchievements = checkAchievements(this.save.get(), before);
    if (newAchievements.length) this.save.set((s) => ({ v3: { ...s.v3, achievements: [...new Set([...s.v3.achievements, ...newAchievements])] } }));
    const facts = (rush?.answered ?? []).slice(0, 6).map((a) => a.id);
    const results: ResultsView = {
      level, age, stars, xp, correct, total: rush?.total ?? 6, bestCombo: rush?.bestCombo ?? 0, boss: mission.boss, badge,
      newAchievements, facts, unlocked, energyLeft: run.energyLeft, activityScore,
    };
    this.ui.set({ results, screen: "results" });
    setMood("hub");
    sfx("fanfare");
    void this.say(`Mission ${level} complete! You earned ${stars} ${stars === 1 ? "star" : "stars"}.${badge ? ` New badge: ${badge}!` : ""}`);
  }

  recordActivity(kind: string, score: number) {
    this.save.set((s) => {
      const best = Math.max(s.v3.activityBest[kind] ?? 0, score);
      const stats = { ...s.v3.stats };
      if (kind === "docking") stats.docks++;
      if (kind === "moon-landing" || kind === "mars-landing") stats.landings++;
      if (kind === "photo") stats.photos++;
      if (kind === "asteroid") stats.samples++;
      if (kind === "orbit") stats.orbits++;
      return { v3: { ...s.v3, activityBest: { ...s.v3.activityBest, [kind]: best }, stats } };
    });
  }

  async nextMission() {
    const results = this.ui.get().results;
    const level = Math.min(30, (results?.level ?? 1) + 1);
    await this.openMap(level);
    await this.startMission(level);
  }

  async replayMission() {
    const results = this.ui.get().results;
    if (results) await this.startMission(results.level);
  }

  // ------------------------------------------------------------ free-play stations

  async openHangarSandbox() {
    this.ui.set({ run: null });
    setMood("build");
    await this.show("hangar", "sandbox", { mode: "sandbox" });
  }

  async openObservatory(params: { mode?: "orbits" | "sizes" | "jump"; body?: string } = {}) {
    setMood("calm");
    await this.show("observatory", "observatory", params);
  }

  async openStudio(id?: string) {
    if (!STUDIO_ENABLED) return;
    setMood("calm");
    await this.show("studio", "studio", { id });
  }

  async openTraining() {
    setMood("hub");
    this.ui.set({ run: null });
    await this.show("hub", "training", { mode: "explore" });
  }

  async practice(kind: EngineeringMission["activity"]) {
    const worldIndex = ["orbit", "docking", "moon-landing", "mars-landing", "asteroid", "photo"].indexOf(kind);
    const level = worldIndex * 5 + 1;
    const mission = makeEngineeringMission(this.age, level);
    const run: MissionRun = { age: this.age, level, mission, rush: null, counts: emptyCounts(), energyLeft: 0, activityScore: 0, practice: true };
    this.ui.set({ run });
    setMood("space");
    await this.show(`act-${kind}`, "activity", { run });
  }

  openStation(id: string) {
    sfx("tap");
    switch (id) {
      case "mission-control": void this.openMap(); break;
      case "rocket-hangar": void this.openHangarSandbox(); break;
      case "observatory": void this.openObservatory(); break;
      case "blueprint-studio": void this.openStudio(); break;
      case "training-center": void this.openTraining(); break;
      case "family-lab": this.setScreen("family"); break;
      case "launch-complex": void this.openMap(); break;
      case "lounge": this.setScreen("lounge"); break;
      default: break;
    }
  }

  achievementsList() {
    return ACHIEVEMENTS;
  }

  /** Free-play achievements (Studio, Observatory, Planet Walk...): records and celebrates new ones. */
  awardAchievements() {
    const save = this.save.get();
    const fresh = checkAchievements(save, save);
    if (!fresh.length) return;
    this.save.set((s) => ({ v3: { ...s.v3, achievements: [...new Set([...s.v3.achievements, ...fresh])] } }));
    const names = fresh.map((id) => ACHIEVEMENTS.find((a) => a.id === id)).filter((a) => a !== undefined);
    if (!names.length) return;
    sfx("badge");
    this.toast(`Achievement unlocked: ${names.map((a) => a.name).join(", ")}! ${names[0].detail}`, names[0].icon);
  }

  resetProgress(age: AgePath) {
    this.save.set((s) => {
      const stars = Object.fromEntries(Object.entries(s.stars).filter(([key]) => !key.startsWith(age + "-")));
      return { progress: { ...s.progress, [age]: 1 }, stars };
    });
  }
}
