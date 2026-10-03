import * as THREE from "three";
import { WORLDS } from "../../flight-data.ts";
import type { Game } from "../app/game.ts";
import type { PointerInfo, SceneController } from "../engine/engine.ts";
import { updateStars } from "../engine/space.ts";
import { bakeStatic } from "../models/bake.ts";
import { missionKey } from "../state/save.ts";
import { textSprite } from "../world/labels.ts";

/**
 * Holographic mission map: a glowing route through the six v2.1 destinations
 * (Launch Deck → Orbital School → Moon Base → Mars Canyon → Asteroid Route → Outer
 * Worlds) with 30 mission beacons per crew path. Boss beacons sit on every 5th mission.
 */
const SECTOR_X = [-70, -42, -14, 14, 42, 70];

export class MapScene implements SceneController {
  readonly id = "map";
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(46, 1, 0.1, 3000);
  bloom = { strength: 0.9, radius: 0.55, threshold: 0.55 };
  private readonly game: Game;
  private readonly curve: THREE.CatmullRomCurve3;
  private readonly nodes: { level: number; mesh: THREE.Mesh; halo: THREE.Mesh; label: THREE.Sprite; position: THREE.Vector3 }[] = [];
  private readonly worlds: THREE.Object3D[] = [];
  private readonly marker: THREE.Group;
  private readonly raycaster = new THREE.Raycaster();
  private focusX = -70;
  private targetX = -70;
  private dragging = false;
  private built = false;
  private readonly materials = {
    open: new THREE.MeshStandardMaterial({ color: "#62e8ff", emissive: "#2fd0f0", emissiveIntensity: 1.1, roughness: 0.3 }),
    done: new THREE.MeshStandardMaterial({ color: "#ffd95a", emissive: "#ffb52e", emissiveIntensity: 1.0, roughness: 0.3 }),
    locked: new THREE.MeshStandardMaterial({ color: "#3a4468", emissive: "#141a36", emissiveIntensity: 0.4, roughness: 0.6 }),
    boss: new THREE.MeshStandardMaterial({ color: "#ff66bf", emissive: "#ff3fa4", emissiveIntensity: 1.2, roughness: 0.3 }),
  };

  constructor(game: Game) {
    this.game = game;
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const x = -84 + t * 168;
      points.push(new THREE.Vector3(x, Math.sin(t * Math.PI * 3) * 5, Math.cos(t * Math.PI * 2.2) * 8));
    }
    this.curve = new THREE.CatmullRomCurve3(points);
    this.marker = new THREE.Group();
  }

  private build() {
    if (this.built) return;
    this.built = true;
    const space = this.game.space;
    this.scene.add(space.skySphere(["#3b2a8f", "#c03a9a", "#2f8fe8"], 3.2));
    this.scene.add(space.starfield(2200, 800));
    this.scene.add(new THREE.AmbientLight(0x8fa8ff, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-30, 40, 60);
    this.scene.add(key);
    // Route
    const tube = new THREE.Mesh(new THREE.TubeGeometry(this.curve, 400, 0.35, 8), new THREE.MeshBasicMaterial({ color: "#62e8ff", transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(tube);
    const glow = new THREE.Mesh(new THREE.TubeGeometry(this.curve, 400, 1.1, 8), new THREE.MeshBasicMaterial({ color: "#8f6bff", transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(glow);
    // Sector worlds
    const makers: (() => THREE.Object3D)[] = [
      () => space.planet("earth", 7, { clouds: true }),
      () => { const m = this.game.model("station-orbital-school"); bakeStatic(m.root); m.root.scale.setScalar(0.32); m.root.rotation.set(0.4, 0.6, 0); return m.root; },
      () => space.planet("moon", 5.5),
      () => space.planet("mars", 6),
      () => { const g = new THREE.Group(); const mat = new THREE.MeshStandardMaterial({ map: space.surface("asteroid"), roughness: 1 }); for (let i = 0; i < 7; i++) { const rock = new THREE.Mesh(space.asteroidGeometry(1.2 + (i % 3) * 0.9, i * 3.1, 2), mat); rock.position.set(Math.cos(i * 2.4) * 5, Math.sin(i * 1.7) * 3, Math.sin(i * 2.4) * 4); g.add(rock); } return g; },
      () => space.planet("saturn", 6.5, { rings: true }),
    ];
    WORLDS.forEach((world, i) => {
      const object = makers[i]();
      const anchor = this.pointNear(SECTOR_X[i]);
      object.position.set(anchor.x, anchor.y + 14, anchor.z - 16);
      if (i === 5) object.rotation.z = 0.35;
      this.scene.add(object);
      this.worlds.push(object);
      const label = textSprite(world.name.toUpperCase(), { height: 2.6, icon: world.icon, border: world.color });
      label.position.set(anchor.x, anchor.y + 26, anchor.z - 16);
      this.scene.add(label);
    });
    // Mission beacons
    for (let level = 1; level <= 30; level++) {
      const sector = Math.floor((level - 1) / 5);
      const within = (level - 1) % 5;
      const x = SECTOR_X[sector] - 10 + within * 5;
      const position = this.pointNear(x);
      const boss = level % 5 === 0;
      const mesh = new THREE.Mesh(boss ? new THREE.OctahedronGeometry(1.6, 0) : new THREE.SphereGeometry(1.05, 24, 16), this.materials.locked);
      mesh.position.copy(position);
      mesh.userData.level = level;
      const halo = new THREE.Mesh(new THREE.RingGeometry(boss ? 2.2 : 1.6, boss ? 2.6 : 1.95, 40), new THREE.MeshBasicMaterial({ color: boss ? "#ff66bf" : "#62e8ff", transparent: true, opacity: 0.0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.position.copy(position);
      const label = textSprite(boss ? `☄️ ${level}` : String(level), { height: boss ? 1.5 : 1.25, border: boss ? "#ff66bf" : "#62e8ff" });
      label.position.copy(position).add(new THREE.Vector3(0, boss ? 3.2 : 2.6, 0));
      this.scene.add(mesh, halo, label);
      this.nodes.push({ level, mesh, halo, label, position });
    }
    // "You are here" rocket
    const rocket = this.game.model("rocket-comet");
    bakeStatic(rocket.root);
    rocket.root.scale.setScalar(0.16);
    rocket.root.position.y = 1.8;
    this.marker.add(rocket.root);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.4, 16), new THREE.MeshBasicMaterial({ color: "#ffd95a" }));
    arrow.rotation.x = Math.PI;
    arrow.position.y = 6.2;
    this.marker.add(arrow);
    this.scene.add(this.marker);
  }

  private pointNear(x: number) {
    const t = Math.max(0, Math.min(1, (x + 84) / 168));
    return this.curve.getPoint(t);
  }

  enter(params?: unknown) {
    this.build();
    const focus = (params as { focus?: number } | undefined)?.focus ?? 1;
    this.refresh();
    const node = this.nodes[Math.max(0, Math.min(29, focus - 1))];
    this.targetX = node.position.x;
    this.focusX = this.targetX - 20;
  }

  refresh() {
    const save = this.game.save.get();
    const age = this.game.age;
    const unlocked = save.progress[age];
    for (const node of this.nodes) {
      const stars = save.stars[missionKey(age, node.level)] ?? 0;
      const boss = node.level % 5 === 0;
      node.mesh.material = node.level > unlocked ? this.materials.locked : stars > 0 ? this.materials.done : boss ? this.materials.boss : this.materials.open;
      node.label.material.opacity = node.level > unlocked ? 0.45 : 1;
    }
    const current = this.nodes[Math.min(29, unlocked - 1)];
    this.marker.position.copy(current.position);
  }

  /** Moves the camera to a sector (0-5). */
  focusSector(index: number) {
    this.targetX = SECTOR_X[Math.max(0, Math.min(5, index))];
  }

  select(level: number) {
    const node = this.nodes[level - 1];
    if (!node) return;
    this.targetX = node.position.x;
    this.game.ui.set({ map: { selected: level } });
    this.game.sound(level > this.game.unlockedLevel() ? "error" : "select");
  }

  update(dt: number, time: number) {
    updateStars(this.scene, time);
    this.focusX += (this.targetX - this.focusX) * (1 - Math.exp(-3 * dt));
    const p = this.pointNear(this.focusX);
    const wide = this.game.engine.aspect < 1 ? 1.5 : 1;
    this.camera.position.set(this.focusX + 4, p.y + 12 * wide, p.z + 46 * wide);
    this.camera.lookAt(this.focusX, p.y + 5, p.z - 6);
    const selected = this.game.ui.get().map.selected;
    for (const node of this.nodes) {
      const isSel = node.level === selected;
      const mat = node.halo.material as THREE.MeshBasicMaterial;
      mat.opacity += ((isSel ? 0.95 : 0) - mat.opacity) * (1 - Math.exp(-8 * dt));
      node.halo.lookAt(this.camera.position);
      node.halo.scale.setScalar(1 + Math.sin(time * 4) * 0.08);
      node.mesh.rotation.y += dt * (node.level % 5 === 0 ? 1.2 : 0.4);
      const s = isSel ? 1.25 : 1;
      node.mesh.scale.setScalar(node.mesh.scale.x + (s - node.mesh.scale.x) * (1 - Math.exp(-8 * dt)));
    }
    this.worlds.forEach((world, i) => { world.rotation.y += dt * (i === 1 ? 0.15 : 0.08); });
    this.marker.position.y = this.nodes[Math.min(29, this.game.unlockedLevel() - 1)].position.y + Math.sin(time * 2.5) * 0.4;
    this.marker.rotation.y += dt * 0.8;
  }

  pointer(info: PointerInfo) {
    if (info.type === "down") this.dragging = false;
    if (info.type === "move" && info.pointers > 0) {
      if (Math.abs(info.dx) > 2) this.dragging = true;
      this.targetX = Math.max(-84, Math.min(84, this.targetX - info.dx * 0.12));
    }
    if (info.type === "tap" && !this.dragging) {
      this.raycaster.setFromCamera(new THREE.Vector2(info.x, info.y), this.camera);
      const hits = this.raycaster.intersectObjects(this.nodes.map((n) => n.mesh));
      const level = hits[0]?.object.userData.level as number | undefined;
      if (level) this.select(level);
    }
  }

  wheel(deltaY: number) {
    this.targetX = Math.max(-84, Math.min(84, this.targetX + deltaY * 0.05));
  }
}
