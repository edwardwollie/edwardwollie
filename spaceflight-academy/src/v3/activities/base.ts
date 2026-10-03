import * as THREE from "three";
import type { Game, MissionRun } from "../app/game.ts";
import { loop, sfx, stopLoops } from "../engine/audio.ts";
import type { PointerInfo, SceneController } from "../engine/engine.ts";
import { input } from "../engine/input.ts";
import { updateStars } from "../engine/space.ts";
import type { ActivityKind } from "../engineering/missions.ts";

export type ActivityControl = "hold" | "left" | "right" | "up" | "down" | "deploy" | "snap" | "grab" | "brake" | "scan";

export interface Gauge {
  label: string;
  value: number;
  max: number;
  /** Green zone (inclusive) in gauge units. */
  good?: [number, number];
  unit?: string;
}

export interface ActivityView {
  kind: ActivityKind;
  title: string;
  help: string;
  phase: "play" | "success" | "retry";
  message: string | null;
  controls: ActivityControl[];
  holdLabel: string;
  gauges: Gauge[];
  score: number;
  attempts: number;
  progress: string | null;
  steer: boolean;
  card: { title: string; text: string; icon: string } | null;
}

/** Assist level by crew path: Star Scouts get the most help. */
export function assistFor(age: string) {
  return age === "5–7" ? 2 : age === "8–10" ? 1 : 0;
}

/**
 * Shared plumbing for the destination activities (orbit, docking, landings,
 * asteroid sampling, photo flybys): HUD publishing, held controls, retries
 * without penalty, and handing the score back to the mission.
 */
export abstract class ActivityScene implements SceneController {
  abstract readonly id: string;
  abstract readonly kind: ActivityKind;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(52, 1, 0.1, 20000);
  bloom = { strength: 0.75, radius: 0.5, threshold: 0.65 };
  protected readonly game: Game;
  protected run: MissionRun | null = null;
  protected assist = 1;
  protected held = new Set<ActivityControl>();
  protected attempts = 1;
  protected phase: ActivityView["phase"] = "play";
  protected message: string | null = null;
  protected card: ActivityView["card"] = null;
  protected score = 0;
  protected time = 0;
  private finishTimer = 0;
  private uiTimer = 0;
  private built = false;
  protected steerX = 0;
  protected steerY = 0;
  private dragStart: { x: number; y: number } | null = null;

  constructor(game: Game) {
    this.game = game;
  }

  /** Build static scenery once. */
  protected abstract buildWorld(): void;
  /** Reset for a fresh attempt. */
  protected abstract reset(): void;
  protected abstract step(dt: number): void;
  protected abstract title(): string;
  protected abstract help(): string;
  protected abstract controls(): ActivityControl[];
  protected abstract gauges(): Gauge[];
  protected holdLabel() { return "HOLD"; }
  protected progress(): string | null { return null; }
  protected steerEnabled() { return false; }
  /** Intro narration. */
  protected abstract intro(): string;

  enter(params?: unknown) {
    this.run = (params as { run: MissionRun } | undefined)?.run ?? this.game.ui.get().run;
    this.assist = assistFor(this.run?.age ?? this.game.age);
    if (!this.built) {
      this.built = true;
      this.buildWorld();
    }
    this.attempts = 1;
    this.phase = "play";
    this.message = null;
    this.card = null;
    this.score = 0;
    this.finishTimer = 0;
    this.held.clear();
    this.reset();
    this.publish();
    void this.game.say(this.intro());
  }

  exit() {
    stopLoops();
    this.held.clear();
    this.game.quiet();
  }

  resume() {
    this.held.clear();
  }

  control(name: ActivityControl, down: boolean) {
    if (down) this.held.add(name); else this.held.delete(name);
    if (down) this.onPress(name);
  }

  /** One-shot presses (deploy, snap, grab, scan). */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected onPress(_name: ActivityControl) { /* optional */ }

  protected isHeld(name: ActivityControl) {
    if (this.held.has(name)) return true;
    switch (name) {
      case "hold": return input.isDown("space") || (!this.steerEnabled() && input.isDown("w", "arrowup"));
      case "left": return input.isDown("a", "arrowleft");
      case "right": return input.isDown("d", "arrowright");
      case "up": return this.steerEnabled() && input.isDown("w", "arrowup");
      case "down": return input.isDown("s", "arrowdown");
      case "brake": return input.isDown("b", "shift");
      default: return false;
    }
  }

  /** Steering axis from keys, joystick or drag (-1..1). */
  protected steer() {
    const axis = input.axis();
    let x = axis.x + this.steerX, y = axis.y + this.steerY;
    if (this.held.has("left")) x -= 1;
    if (this.held.has("right")) x += 1;
    if (this.held.has("up")) y += 1;
    if (this.held.has("down")) y -= 1;
    return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
  }

  protected say(text: string) {
    void this.game.say(text);
  }

  protected success(score: number, message: string, card?: ActivityView["card"]) {
    if (this.phase === "success") return;
    this.phase = "success";
    this.score = Math.max(1, Math.min(3, score));
    this.message = message;
    this.card = card ?? null;
    this.finishTimer = 4.2;
    sfx("win");
    stopLoops();
    this.say(card ? `${message} ${card.title}. ${card.text}` : message);
    this.publish();
  }

  /** A friendly do-over (never a fail state). */
  protected retry(message: string) {
    if (this.phase !== "play") return;
    this.phase = "retry";
    this.message = message;
    this.attempts++;
    sfx("error");
    stopLoops();
    this.say(message);
    this.publish();
    window.setTimeout(() => {
      if (this.phase !== "retry") return;
      this.phase = "play";
      this.message = null;
      this.reset();
      this.publish();
    }, 2600);
  }

  /** Stars for the activity: fewer attempts = more stars. */
  protected attemptScore(bonus = 0) {
    return Math.max(1, Math.min(3, 4 - this.attempts + bonus));
  }

  finishNow() {
    if (this.phase === "success") { this.finishTimer = 0.01; return; }
    // Grown-up/QA skip: finish with one star
    this.success(1, "Mission complete!");
    this.finishTimer = 0.01;
  }

  protected publish() {
    const view: ActivityView = {
      kind: this.kind, title: this.title(), help: this.help(), phase: this.phase, message: this.message, controls: this.controls(),
      holdLabel: this.holdLabel(), gauges: this.gauges(), score: this.score, attempts: this.attempts, progress: this.progress(),
      steer: this.steerEnabled(), card: this.card,
    };
    this.game.ui.set({ activity: view });
  }

  update(dt: number, time: number) {
    if (this.game.ui.get().overlay) return;
    this.time = time;
    updateStars(this.scene, time);
    if (input.pressed("space", "enter")) this.onPress("snap");
    this.step(dt);
    this.uiTimer -= dt;
    if (this.uiTimer <= 0) { this.uiTimer = 0.1; this.publish(); }
    if (this.phase === "success" && this.finishTimer > 0) {
      this.finishTimer -= dt;
      if (this.finishTimer <= 0) void this.game.finishMission(this.score);
    }
  }

  pointer(info: PointerInfo) {
    if (!this.steerEnabled()) return;
    if (info.type === "down") this.dragStart = { x: info.px, y: info.py };
    if (info.type === "move" && this.dragStart && info.pointers > 0) {
      this.steerX = Math.max(-1, Math.min(1, (info.px - this.dragStart.x) / 90));
      this.steerY = Math.max(-1, Math.min(1, -(info.py - this.dragStart.y) / 90));
    }
    if (info.type === "up") { this.dragStart = null; this.steerX = 0; this.steerY = 0; }
  }

  protected engine(level: number) {
    loop("thruster", level);
  }
}
