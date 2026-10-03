import * as THREE from "three";
import type { Game } from "../app/game.ts";
import { layoutRocket, type Placement } from "../blueprints/rocket.ts";
import { Flame } from "../engine/fx.ts";
import { toConfig } from "../engineering/physics.ts";
import type { SystemCounts } from "../engineering/systems.ts";
import { bakeStatic } from "../models/bake.ts";

interface Piece {
  key: string;
  system: string;
  object: THREE.Object3D;
  from: THREE.Vector3;
  target: THREE.Vector3;
  t: number;
  removing: boolean;
  placement: Placement;
}

const ENGINE_FLAME_SPOTS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-0.72, 0], [0.72, 0]],
  3: [[0, 0.8], [-0.7, -0.42], [0.7, -0.42]],
};

/**
 * A live rocket built from system counts using the same layout as the blueprints.
 * Parts fly into place when added, and every engine/booster gets a flame.
 */
export class RocketAssembly {
  readonly group = new THREE.Group();
  readonly flames: Flame[] = [];
  readonly boosterFlames: Flame[] = [];
  private readonly game: Game;
  private readonly pieces = new Map<string, Piece>();
  height = 0;
  counts: SystemCounts | null = null;
  private readonly cache = new Map<string, THREE.Object3D[]>();

  constructor(game: Game) {
    this.game = game;
  }

  private takeObject(blueprint: string) {
    const pool = this.cache.get(blueprint);
    const reused = pool?.pop();
    if (reused) return reused;
    const model = this.game.model(blueprint);
    bakeStatic(model.root);
    return model.root;
  }

  private release(blueprint: string, object: THREE.Object3D) {
    const pool = this.cache.get(blueprint) ?? [];
    pool.push(object);
    this.cache.set(blueprint, pool);
  }

  setCounts(counts: SystemCounts, animate = true, newest?: string) {
    this.counts = { ...counts };
    const layout = layoutRocket(toConfig(counts));
    this.height = layout.height;
    const seen = new Set<string>();
    const tally: Record<string, number> = {};
    for (const item of layout.items) {
      const n = (tally[item.system] = (tally[item.system] ?? 0) + 1);
      const key = `${item.system}${n}`;
      seen.add(key);
      const target = new THREE.Vector3(...item.at);
      const existing = this.pieces.get(key);
      if (existing && !existing.removing) {
        existing.from.copy(existing.object.position);
        existing.target.copy(target);
        existing.t = animate ? 0 : 1;
        existing.placement = item;
        if (item.rot) existing.object.rotation.set(...item.rot.map((d) => (d * Math.PI) / 180) as [number, number, number]);
        continue;
      }
      const object = this.takeObject(item.part);
      object.visible = true;
      object.scale.setScalar(1);
      if (item.rot) object.rotation.set(...item.rot.map((d) => (d * Math.PI) / 180) as [number, number, number]);
      else object.rotation.set(0, 0, 0);
      const fresh = animate && (newest === undefined || newest === item.system);
      const from = target.clone();
      if (fresh) {
        if (["fins", "lander", "booster", "solar", "antenna"].includes(item.system)) from.add(new THREE.Vector3(item.system === "antenna" ? 6 : 0, 0, item.system === "solar" ? 5 : 0).add(new THREE.Vector3(0, 5, 0)));
        else from.y += 9;
      }
      object.position.copy(fresh ? from : target);
      this.group.add(object);
      this.pieces.set(key, { key, system: item.system, object, from, target, t: fresh ? 0 : 1, removing: false, placement: item });
    }
    for (const [key, piece] of this.pieces) {
      if (!seen.has(key) && !piece.removing) {
        piece.removing = true;
        piece.t = animate ? 0 : 1;
        piece.from.copy(piece.object.position);
        piece.target.copy(piece.object.position).add(new THREE.Vector3(0, 6, 0));
      }
    }
    this.rebuildFlames(counts);
  }

  private rebuildFlames(counts: SystemCounts) {
    for (const flame of [...this.flames, ...this.boosterFlames]) flame.mesh.removeFromParent();
    this.flames.length = 0;
    this.boosterFlames.length = 0;
    const config = toConfig(counts);
    const layout = layoutRocket(config);
    const engineItems = layout.items.filter((item) => item.system === "engine");
    const base = engineItems.length ? engineItems[0].at[1] - 1.9 : 0;
    for (const [x, z] of ENGINE_FLAME_SPOTS[config.engine]) {
      const flame = new Flame(0.62, 7.5, "orange");
      flame.mesh.position.set(x, base + 0.02, z);
      this.group.add(flame.mesh);
      this.flames.push(flame);
    }
    const booster = layout.items.find((item) => item.system === "booster");
    if (booster) {
      for (const side of [-1, 1]) {
        const flame = new Flame(0.55, 8, "orange");
        flame.mesh.position.set(side * 2.25, booster.at[1] - 1.55, 0);
        this.group.add(flame.mesh);
        this.boosterFlames.push(flame);
      }
    }
  }

  /** Object for the boosters (to detach them during staging). */
  boosterObject() {
    return this.pieces.get("booster1")?.object ?? null;
  }

  pieceOf(system: string) {
    return this.pieces.get(`${system}1`)?.object ?? null;
  }

  update(dt: number, time: number) {
    for (const [key, piece] of this.pieces) {
      if (piece.t < 1) {
        piece.t = Math.min(1, piece.t + dt * 2.2);
        const k = piece.removing ? piece.t * piece.t : easeOutBack(piece.t);
        piece.object.position.lerpVectors(piece.from, piece.target, k);
        if (piece.removing) piece.object.scale.setScalar(Math.max(0.001, 1 - piece.t));
      } else if (piece.removing) {
        piece.object.removeFromParent();
        this.release(piece.placement.part, piece.object);
        this.pieces.delete(key);
      }
    }
    for (const flame of [...this.flames, ...this.boosterFlames]) flame.update(dt, time);
  }

  setThrottle(core: number, booster = core) {
    for (const flame of this.flames) flame.throttle = core;
    for (const flame of this.boosterFlames) flame.throttle = booster;
  }
}

function easeOutBack(t: number) {
  const c1 = 1.4, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
