import * as THREE from "three";
import type { Game } from "../app/game.ts";
import { CADETS, type CadetId } from "../blueprints/cast.ts";
import type { PointerInfo, SceneController } from "../engine/engine.ts";
import { input } from "../engine/input.ts";
import { skyDome } from "../engine/space.ts";
import { damp } from "../engine/fx.ts";
import { bakeStatic, instance, keepJoints } from "../models/bake.ts";
import type { BuiltModel } from "../models/build.ts";
import { Animator, type PoseName } from "../models/rig.ts";
import { BUILDINGS, CAMPUS, PLANET_WALK, PLANET_WALK_Z, resolveCollisions, stationPads, toWorld, walkStopX } from "../world/campus.ts";
import { textSprite } from "../world/labels.ts";

type Mode = "attract" | "lineup" | "explore";

interface Character {
  model: BuiltModel;
  anim: Animator;
}

interface Npc extends Character {
  id: CadetId;
  home: THREE.Vector3;
  facing: number;
  pose: PoseName;
  lines: string[];
  spoken: boolean;
}

const NPC_SPOTS: { at: [number, number]; facing: number; pose: PoseName }[] = [
  { at: [-30, -4], facing: 70, pose: "wave" },
  { at: [32, 6], facing: -60, pose: "point" },
  { at: [-6, -20], facing: 160, pose: "idle" },
];

const NPC_LINES: Record<CadetId, string[]> = {
  omari: ["Did you know? A rocket engine pushes hot gas down, so the rocket goes up!", "I love countdowns! Three, two, one... liftoff!"],
  mei: ["Fun fact: the Moon is about 384,000 kilometres away. That's about 30 Earths in a row!", "I mapped every orbit in the Observatory. Want to see Saturn's rings?"],
  finn: ["Try the Rocket Hangar! Fins at the bottom keep a rocket flying straight, like feathers on an arrow.", "Heavy rocket? Add another engine. Too slow to reach Mars? Add a fuel tank!"],
  sofia: ["Look up at night: the bright dots that don't twinkle are often planets!", "Walk the Planet Walk to the beach. It shows how far apart the planets really are!"],
};

export class HubScene implements SceneController {
  readonly id = "hub";
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(48, 1, 0.1, 2400);
  bloom = { strength: 0.32, radius: 0.45, threshold: 0.86 };
  private mode: Mode = "attract";
  private readonly sun: THREE.DirectionalLight;
  private player!: Character;
  private cosmo!: Character;
  private readonly position = new THREE.Vector3(CAMPUS.spawn.x, 0, CAMPUS.spawn.z);
  private heading = Math.PI;
  private speed = 0;
  private yaw = 0;
  private distance = 13;
  private tapTarget: THREE.Vector3 | null = null;
  private readonly lineup: { id: string; char: Character; base: THREE.Vector3 }[] = [];
  private readonly lineupGroup = new THREE.Group();
  private readonly npcs: Npc[] = [];
  private readonly spin: { node: THREE.Object3D; axis: "x" | "y" | "z"; speed: number }[] = [];
  private readonly pads: { id: string; label: string; icon: string; x: number; z: number; ring: THREE.Mesh; arrow: THREE.Mesh }[] = [];
  private readonly clouds: THREE.Object3D[] = [];
  private readonly stops: { id: string; x: number; z: number; radius: number; planet: THREE.Object3D }[] = [];
  private lastStop: string | null = null;
  private lastPrompt: string | null = null;
  private readonly cosmoPos = new THREE.Vector3(1.5, 0, CAMPUS.spawn.z + 1.5);
  private readonly ground: THREE.Mesh;
  private readonly raycaster = new THREE.Raycaster();
  private dragging = false;
  private attractAngle = 0.4;
  private readonly lookTarget = new THREE.Vector3();
  private readonly camPos = new THREE.Vector3(0, 30, 60);
  private builtWorld = false;
  private npcTalkTimer = 0;

  private readonly game: Game;

  constructor(game: Game) {
    this.game = game;
    this.scene.background = new THREE.Color("#9fd4ff");
    this.scene.fog = new THREE.Fog("#cfe9ff", 190, 620);
    this.scene.add(skyDome("#3a86e0", "#cfeaff", new THREE.Vector3(0.45, 0.55, -0.7), 900));
    this.scene.add(new THREE.HemisphereLight(0xe9f4ff, 0x6c8f5a, 1.15));
    this.sun = new THREE.DirectionalLight(0xfff3dd, 2.4);
    this.sun.castShadow = game.engine.quality !== "low";
    this.sun.shadow.mapSize.set(game.engine.quality === "high" ? 2048 : 1024, game.engine.quality === "high" ? 2048 : 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -42; sc.right = 42; sc.top = 42; sc.bottom = -42; sc.near = 1; sc.far = 260;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: "#6cc263", roughness: 1 });
    this.ground = new THREE.Mesh(new THREE.CircleGeometry(260, 72), groundMaterial);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
  }

  // ------------------------------------------------------------ world construction

  private buildWorld() {
    if (this.builtWorld) return;
    this.builtWorld = true;
    const game = this.game;
    // Paths and roads
    const pathMat = new THREE.MeshStandardMaterial({ color: "#e4e8ef", roughness: 0.95 });
    const roadMat = new THREE.MeshStandardMaterial({ color: "#c9c3b6", roughness: 1 });
    const strip = (x1: number, z1: number, x2: number, z2: number, width: number, material: THREE.Material, y = 0.02) => {
      const length = Math.hypot(x2 - x1, z2 - z1);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, length), material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = -Math.atan2(x2 - x1, z2 - z1) + Math.PI;
      mesh.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      return mesh;
    };
    const padList = stationPads();
    for (const pad of padList) {
      const angle = Math.atan2(pad.x, pad.z);
      strip(Math.sin(angle) * 11.5, Math.cos(angle) * 11.5, pad.x, pad.z, 4.2, pathMat);
    }
    const hangarPad = padList.find((p) => p.id === "rocket-hangar")!;
    const launchPad = padList.find((p) => p.id === "launch-complex")!;
    strip(hangarPad.x, hangarPad.z, launchPad.x, launchPad.z, 8, roadMat, 0.015);
    // Planet Walk path
    const walkMat = new THREE.MeshStandardMaterial({ color: "#f3e7c9", roughness: 0.95 });
    strip(12, PLANET_WALK_Z, CAMPUS.coastX - 1, PLANET_WALK_Z, 3.2, walkMat, 0.03);
    // Beach + ocean
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(14, 520), new THREE.MeshStandardMaterial({ color: "#efd9a2", roughness: 1 }));
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(CAMPUS.coastX + 3, 0.03, 0);
    sand.receiveShadow = true;
    this.scene.add(sand);
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: "#2f8fd8", roughness: 0.18, metalness: 0.15, emissive: "#0b3c74", emissiveIntensity: 0.25 }));
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(CAMPUS.oceanX + 450, 0.05, 0);
    this.scene.add(ocean);
    // Distant hills and forests
    const hills = new THREE.Group();
    const hillMat = new THREE.MeshStandardMaterial({ color: "#5fae5c", roughness: 1, flatShading: true });
    const treeMat = new THREE.MeshStandardMaterial({ color: "#2f8a4a", roughness: 1, flatShading: true });
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2;
      const x = Math.cos(a) * 205, z = Math.sin(a) * 205;
      if (x > 80) continue;
      const hill = new THREE.Mesh(new THREE.SphereGeometry(30 + (i % 4) * 9, 10, 6), hillMat);
      hill.scale.y = 0.35 + (i % 3) * 0.1;
      hill.position.set(x, -2, z);
      hills.add(hill);
      for (let k = 0; k < 4; k++) {
        const tree = new THREE.Mesh(new THREE.ConeGeometry(2.4, 8, 7), treeMat);
        tree.position.set(x * 0.8 + Math.sin(i * 7 + k) * 14, 4, z * 0.8 + Math.cos(i * 3 + k) * 14);
        hills.add(tree);
      }
    }
    bakeStatic(hills);
    this.scene.add(hills);
    // Clouds
    const cloudMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1, emissive: "#ffffff", emissiveIntensity: 0.2 });
    for (let i = 0; i < 14; i++) {
      const cloud = new THREE.Group();
      for (let k = 0; k < 5; k++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(6 + (k % 3) * 2.5, 12, 8), cloudMat);
        puff.position.set(k * 7 - 14, Math.sin(k * 1.7) * 2, Math.cos(k) * 3);
        puff.scale.y = 0.6;
        cloud.add(puff);
      }
      const a = (i / 14) * Math.PI * 2;
      cloud.position.set(Math.cos(a) * (120 + (i % 3) * 60), 70 + (i % 4) * 12, Math.sin(a) * (120 + (i % 3) * 60));
      this.scene.add(cloud);
      this.clouds.push(cloud);
    }
    // Buildings
    for (const b of BUILDINGS) {
      const model = game.model(b.blueprint);
      keepJoints(model.joints);
      bakeStatic(model.root);
      model.root.position.set(b.x, 0, b.z);
      model.root.rotation.y = (b.rot * Math.PI) / 180;
      this.scene.add(model.root);
      for (const [name, node] of model.joints) {
        if (name.startsWith("orbit")) this.spin.push({ node, axis: "y", speed: 1.6 / Number(name.slice(5)) });
        if (name === "dish") this.spin.push({ node, axis: "y", speed: 0.25 });
        if (name === "centrifuge") this.spin.push({ node, axis: "y", speed: 0.9 });
      }
    }
    // The Comet on the pad
    const launch = BUILDINGS.find((b) => b.id === "launch-complex")!;
    const rocket = game.model("rocket-comet");
    bakeStatic(rocket.root);
    const [rx, rz] = toWorld(launch, 0, 0);
    rocket.root.position.set(rx, 2.0, rz);
    rocket.root.rotation.y = (launch.rot * Math.PI) / 180;
    this.scene.add(rocket.root);
    // Props (instanced)
    const lampSpots: THREE.Matrix4[] = [];
    for (const pad of padList) {
      const angle = Math.atan2(pad.x, pad.z);
      const length = Math.hypot(pad.x, pad.z) - 11.5;
      for (let d = 6; d < length - 2; d += 13) {
        const r = 11.5 + d;
        const side = (d / 13) % 2 < 1 ? 1 : -1;
        const px = Math.sin(angle) * r + Math.cos(angle) * 3.2 * side, pz = Math.cos(angle) * r - Math.sin(angle) * 3.2 * side;
        lampSpots.push(new THREE.Matrix4().compose(new THREE.Vector3(px, 0, pz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle + (side > 0 ? -Math.PI / 2 : Math.PI / 2)), new THREE.Vector3(1, 1, 1)));
      }
    }
    for (let x = 22; x < CAMPUS.coastX; x += 16) lampSpots.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, PLANET_WALK_Z - 2.6), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)));
    this.addInstances("prop-lamp", lampSpots);
    const palms: THREE.Matrix4[] = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      palms.push(new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * 17, 0, Math.sin(a) * 17), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a * 3), new THREE.Vector3(1, 1, 1).multiplyScalar(0.9 + (i % 3) * 0.12)));
    }
    for (let z = -100; z <= 100; z += 14) palms.push(new THREE.Matrix4().compose(new THREE.Vector3(CAMPUS.coastX - 3 + (z % 28 === 0 ? 0 : 2), 0, z + 5), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), z), new THREE.Vector3(1.1, 1.1, 1.1)));
    this.addInstances("prop-palm", palms);
    const spheres = [toWorld(launch, 24, 10), toWorld(launch, 26, -2)].map(([x, z]) => new THREE.Matrix4().makeTranslation(x, 0, z));
    this.addInstances("prop-fuel-sphere", spheres);
    const signs = [[8, 13], [-9, -13]].map(([x, z]) => new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(x, z)), new THREE.Vector3(1, 1, 1)));
    this.addInstances("prop-signpost", signs);
    const radar = game.model("prop-radar");
    keepJoints(radar.joints);
    bakeStatic(radar.root);
    radar.root.position.set(16, 0, -54);
    this.scene.add(radar.root);
    const radarDish = radar.joints.get("dish");
    if (radarDish) this.spin.push({ node: radarDish, axis: "y", speed: 0.8 });
    // Station pads
    for (const pad of padList) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.7, 2.15, 48), new THREE.MeshBasicMaterial({ color: "#62e8ff", transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(pad.x, 0.06, pad.z);
      ring.userData.bloom = true;
      const fill = new THREE.Mesh(new THREE.CircleGeometry(1.7, 40), new THREE.MeshBasicMaterial({ color: "#62e8ff", transparent: true, opacity: 0.16 }));
      fill.rotation.x = -Math.PI / 2;
      fill.position.set(pad.x, 0.05, pad.z);
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 16), new THREE.MeshStandardMaterial({ color: "#ff66bf", emissive: "#ff3fa4", emissiveIntensity: 0.8 }));
      arrow.rotation.x = Math.PI;
      arrow.userData.bloom = true;
      arrow.position.set(pad.x, 3.4, pad.z);
      const label = textSprite(pad.label, { icon: pad.icon, height: 1.15 });
      label.position.set(pad.x, 4.9, pad.z);
      this.scene.add(ring, fill, arrow, label);
      this.pads.push({ id: pad.id, label: pad.label, icon: pad.icon, x: pad.x, z: pad.z, ring, arrow });
    }
    // Planet Walk
    const pedestalMat = new THREE.MeshStandardMaterial({ color: "#f4f6fb", roughness: 0.6 });
    for (const stop of PLANET_WALK) {
      const x = walkStopX(stop), z = PLANET_WALK_Z;
      const group = new THREE.Group();
      group.position.set(x, 0, z + (stop.au < 2 ? (PLANET_WALK.indexOf(stop) % 2 ? 1.1 : -1.1) * 0 : 0));
      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 1.0, 20), pedestalMat);
      pedestal.position.y = 0.5;
      pedestal.castShadow = true;
      const planet = stop.id === "sun"
        ? new THREE.Mesh(new THREE.SphereGeometry(stop.size, 32, 20), new THREE.MeshBasicMaterial({ color: stop.color }))
        : new THREE.Mesh(new THREE.SphereGeometry(stop.size, 32, 20), new THREE.MeshStandardMaterial({ color: stop.color, roughness: 0.6, emissive: stop.color, emissiveIntensity: 0.15 }));
      planet.position.y = 1.0 + stop.size + 0.05;
      group.add(pedestal, planet);
      if (stop.id === "sun") {
        const glow = this.game.space.glow(4.5, "#ffb347", 0.75);
        glow.position.y = planet.position.y;
        group.add(glow);
      }
      if (stop.id === "saturn") {
        const ring = new THREE.Mesh(new THREE.RingGeometry(stop.size * 1.3, stop.size * 2.1, 40), new THREE.MeshStandardMaterial({ color: "#e8d6a8", side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
        ring.rotation.x = -Math.PI / 2.4;
        ring.position.y = planet.position.y;
        group.add(ring);
      }
      if (stop.au === 0 || stop.au > 2 || stop.id === "earth") {
        const label = textSprite(stop.name, { height: 0.55, border: "#ffd95a" });
        label.position.y = 2.2 + stop.size;
        group.add(label);
      }
      this.scene.add(group);
      this.stops.push({ id: stop.id, x, z, radius: stop.au < 2 && stop.au > 0 ? 0.55 : 1.4, planet });
    }
    // Characters
    this.player = this.makeCharacter(this.game.cadetModel());
    this.cosmo = this.makeCharacter(this.game.model("robot-cosmo"));
    this.scene.add(this.player.model.root, this.cosmo.model.root);
    this.buildNpcs();
    this.buildLineup();
  }

  private addInstances(id: string, transforms: THREE.Matrix4[]) {
    if (!transforms.length) return;
    const template = this.game.model(id);
    bakeStatic(template.root);
    this.scene.add(instance(template.root, transforms));
  }

  private makeCharacter(model: BuiltModel): Character {
    return { model, anim: new Animator(model) };
  }

  private buildNpcs() {
    for (const npc of this.npcs) this.scene.remove(npc.model.root);
    this.npcs.length = 0;
    const me = this.game.save.get().v3.cadet;
    CADETS.filter((c) => c.id !== me).forEach((look, i) => {
      const spot = NPC_SPOTS[i];
      const model = this.game.cadetModel(look.id, ["comet", "solar", "nebula"][i]);
      const npc: Npc = { id: look.id, model, anim: new Animator(model), home: new THREE.Vector3(spot.at[0], 0, spot.at[1]), facing: (spot.facing * Math.PI) / 180, pose: spot.pose, lines: NPC_LINES[look.id], spoken: false };
      npc.anim.set(spot.pose);
      model.root.position.copy(npc.home);
      model.root.rotation.y = npc.facing;
      this.scene.add(model.root);
      this.npcs.push(npc);
    });
  }

  private buildLineup() {
    this.scene.remove(this.lineupGroup);
    this.lineupGroup.clear();
    this.lineup.length = 0;
    const ids = [...CADETS.map((c) => c.id), "cosmo"];
    ids.forEach((id, i) => {
      const model = id === "cosmo" ? this.game.model("robot-cosmo") : this.game.cadetModel(id as CadetId, this.game.save.get().v3.cadet === id ? this.game.save.get().v3.suit : "classic");
      const base = new THREE.Vector3((i - 2) * 1.25, 0, 9.5 + Math.abs(i - 2) * 0.35);
      model.root.position.copy(base);
      model.root.rotation.y = -(i - 2) * 0.12;
      this.lineupGroup.add(model.root);
      const anim = new Animator(model);
      anim.time = i * 0.7;
      this.lineup.push({ id, char: { model, anim }, base });
    });
    this.scene.add(this.lineupGroup);
  }

  /** Called when the player changes cadet or suit. */
  refreshCadet() {
    if (!this.builtWorld) return;
    this.scene.remove(this.player.model.root);
    this.player = this.makeCharacter(this.game.cadetModel());
    this.player.model.root.position.copy(this.position);
    this.player.model.root.rotation.y = this.heading;
    this.scene.add(this.player.model.root);
    this.buildNpcs();
    this.buildLineup();
    this.applyModeVisibility();
  }

  setMode(mode: Mode) {
    this.mode = mode;
    this.game.ui.set({ hub: { ...this.game.ui.get().hub, mode, prompt: null } });
    this.applyModeVisibility();
  }

  private applyModeVisibility() {
    const explore = this.mode === "explore";
    this.lineupGroup.visible = !explore;
    this.player.model.root.visible = explore;
    this.cosmo.model.root.visible = explore;
    for (const npc of this.npcs) npc.model.root.visible = explore;
  }

  enter(params?: unknown) {
    this.buildWorld();
    const mode = (params as { mode?: Mode } | undefined)?.mode ?? "explore";
    this.setMode(mode);
    if (mode === "explore") {
      this.camPos.set(this.position.x + Math.sin(this.yaw) * this.distance, 9, this.position.z + Math.cos(this.yaw) * this.distance);
      if (this.position.distanceTo(new THREE.Vector3(CAMPUS.spawn.x, 0, CAMPUS.spawn.z)) > 200) this.position.set(CAMPUS.spawn.x, 0, CAMPUS.spawn.z);
    }
    this.lastPrompt = null;
  }

  exit() {
    input.setJoystick(0, 0);
    this.game.ui.set({ hub: { ...this.game.ui.get().hub, prompt: null } });
  }

  /** Puts the player on a station's pad (used when returning from a station). */
  placeAt(stationId: string) {
    const pad = this.pads.find((p) => p.id === stationId);
    if (!pad) return;
    const dir = new THREE.Vector2(-pad.x, -pad.z).normalize();
    this.position.set(pad.x + dir.x * 3, 0, pad.z + dir.y * 3);
  }

  // ------------------------------------------------------------ update

  update(dt: number, time: number) {
    for (const s of this.spin) s.node.rotation[s.axis] += s.speed * dt;
    for (const cloud of this.clouds) {
      cloud.position.x += dt * 1.2;
      if (cloud.position.x > 260) cloud.position.x = -260;
    }
    for (const pad of this.pads) {
      pad.arrow.position.y = 3.4 + Math.sin(time * 2.4 + pad.x) * 0.25;
      pad.arrow.rotation.y += dt * 1.5;
      (pad.ring.material as THREE.MeshBasicMaterial).opacity = 0.65 + Math.sin(time * 3 + pad.z) * 0.25;
    }
    for (const stop of this.stops) stop.planet.rotation.y += dt * 0.4;
    if (this.mode === "explore") this.updateExplore(dt, time);
    else this.updateShowcase(dt);
    for (const npc of this.npcs) {
      npc.anim.update(dt);
    }
    // Sun shadow follows the action
    const focus = this.mode === "explore" ? this.position : new THREE.Vector3(0, 0, 0);
    this.sun.position.set(focus.x + 60, 95, focus.z - 70);
    this.sun.target.position.copy(focus);
  }

  private updateShowcase(dt: number) {
    const selected = this.game.save.get().v3.cadet;
    for (const entry of this.lineup) {
      const isMe = entry.id === selected;
      const target = entry.base.clone();
      if (this.mode === "lineup" && isMe) target.z += 1.1;
      entry.char.model.root.position.lerp(target, 1 - Math.exp(-6 * dt));
      entry.char.anim.set(this.mode === "lineup" ? (isMe ? "wave" : entry.id === "cosmo" ? "idle" : "idle") : (entry.id === "cosmo" ? "wave" : entry.id === "omari" ? "cheer" : entry.id === "sofia" ? "point" : "wave"));
      entry.char.anim.update(dt);
    }
    if (this.mode === "attract") {
      this.attractAngle += dt * (this.game.reduceMotion ? 0.02 : 0.05);
      const r = 46;
      const desired = new THREE.Vector3(Math.sin(this.attractAngle) * r, 15 + Math.sin(this.attractAngle * 0.7) * 3, 22 + Math.cos(this.attractAngle) * r * 0.55);
      this.camPos.lerp(desired, 1 - Math.exp(-1.5 * dt));
      this.lookTarget.lerp(new THREE.Vector3(6, 7, -20), 1 - Math.exp(-2 * dt));
    } else {
      const desired = new THREE.Vector3(0, 1.75, 16.2);
      this.camPos.lerp(desired, 1 - Math.exp(-3 * dt));
      this.lookTarget.lerp(new THREE.Vector3(0, 0.95, 9.5), 1 - Math.exp(-4 * dt));
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.lookTarget);
  }

  private updateExplore(dt: number, time: number) {
    if (this.game.ui.get().overlay || this.game.ui.get().screen !== "hub" && this.game.ui.get().screen !== "training") {
      input.setJoystick(0, 0);
    }
    const blocked = this.game.ui.get().screen !== "hub";
    let { x: ax, y: ay } = blocked ? { x: 0, y: 0 } : input.axis();
    if (input.isDown("q")) this.yaw += dt * 1.6;
    if (input.isDown("e")) this.yaw -= dt * 1.6;
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const move = new THREE.Vector3();
    if (Math.abs(ax) + Math.abs(ay) > 0.05) {
      this.tapTarget = null;
      move.addScaledVector(right, ax).addScaledVector(forward, ay);
    } else if (this.tapTarget) {
      move.subVectors(this.tapTarget, this.position).setY(0);
      if (move.length() < 0.5) { this.tapTarget = null; move.set(0, 0, 0); } else move.normalize();
      ax = ay = 1;
    }
    const magnitude = Math.min(1, move.length());
    const targetSpeed = magnitude * 7.2;
    this.speed = damp(this.speed, targetSpeed, 10, dt);
    if (magnitude > 0.01) {
      move.normalize();
      const desired = Math.atan2(move.x, move.z);
      let delta = desired - this.heading;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      this.heading += delta * (1 - Math.exp(-12 * dt));
    }
    const step = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)).multiplyScalar(this.speed * dt);
    const [nx, nz] = resolveCollisions(this.position.x + step.x, this.position.z + step.z, 0.45);
    this.position.set(nx, 0, nz);
    const root = this.player.model.root;
    root.position.copy(this.position);
    root.rotation.y = this.heading;
    this.player.anim.set(this.speed > 4.8 ? "run" : this.speed > 0.4 ? "walk" : "idle");
    this.player.anim.update(dt, this.speed > 0.4 ? Math.max(0.6, this.speed / 5.2) : 1);
    void ax; void ay;
    // Cosmo follows
    const followTarget = this.position.clone().add(new THREE.Vector3(Math.sin(this.heading + 2.3) * 1.9, 0, Math.cos(this.heading + 2.3) * 1.9));
    this.cosmoPos.lerp(followTarget, 1 - Math.exp(-2.6 * dt));
    const cosmoRoot = this.cosmo.model.root;
    cosmoRoot.position.copy(this.cosmoPos);
    cosmoRoot.position.y = 0.25 + Math.sin(time * 2) * 0.06;
    const toPlayer = this.position.clone().sub(this.cosmoPos);
    cosmoRoot.rotation.y = damp(cosmoRoot.rotation.y, Math.atan2(toPlayer.x, toPlayer.z), 4, dt);
    this.cosmo.anim.set(this.speed > 0.4 ? "idle" : "wave");
    this.cosmo.anim.update(dt);
    // Camera follow
    const desiredCam = new THREE.Vector3(this.position.x + Math.sin(this.yaw) * this.distance, 2.2 + this.distance * 0.52, this.position.z + Math.cos(this.yaw) * this.distance);
    this.camPos.lerp(desiredCam, 1 - Math.exp(-5 * dt));
    this.camera.position.copy(this.camPos);
    this.lookTarget.lerp(this.position.clone().add(new THREE.Vector3(0, 1.4, 0)), 1 - Math.exp(-8 * dt));
    this.camera.lookAt(this.lookTarget);
    // Station prompt
    let prompt: { id: string; label: string; icon: string } | null = null;
    for (const pad of this.pads) {
      if (Math.hypot(pad.x - this.position.x, pad.z - this.position.z) < 2.6) prompt = { id: pad.id, label: pad.label, icon: pad.icon };
    }
    if ((prompt?.id ?? null) !== this.lastPrompt) {
      this.lastPrompt = prompt?.id ?? null;
      this.game.ui.set({ hub: { ...this.game.ui.get().hub, prompt } });
      if (prompt) this.game.sound("select");
    }
    if (prompt && (input.pressed("enter") || input.pressed("space"))) this.game.openStation(prompt.id);
    // Planet Walk
    let nearStop: (typeof this.stops)[number] | null = null;
    for (const stop of this.stops) if (Math.hypot(stop.x - this.position.x, stop.z - this.position.z) < stop.radius + 0.5) nearStop = stop;
    if (nearStop && nearStop.id !== this.lastStop) {
      this.lastStop = nearStop.id;
      const info = PLANET_WALK.find((s) => s.id === nearStop!.id)!;
      this.game.toast(`${info.name}: ${info.fact}`, "🪐");
      void this.game.say(`${info.name}. ${info.fact}`);
      this.game.sound("star");
      this.game.save.set((s) => ({ v3: { ...s.v3, planetWalk: [...new Set([...s.v3.planetWalk, info.id])] } }));
      this.game.awardAchievements();
    } else if (!nearStop && this.lastStop && this.stops.every((s) => Math.hypot(s.x - this.position.x, s.z - this.position.z) > s.radius + 2)) {
      this.lastStop = null;
    }
    // NPC chats
    this.npcTalkTimer -= dt;
    for (const npc of this.npcs) {
      const d = npc.home.distanceTo(this.position);
      const root = npc.model.root;
      if (d < 4.5) {
        const look = this.position.clone().sub(npc.home);
        root.rotation.y = damp(root.rotation.y, Math.atan2(look.x, look.z), 5, dt);
        if (!npc.spoken && this.npcTalkTimer <= 0) {
          npc.spoken = true;
          this.npcTalkTimer = 6;
          const line = npc.lines[Math.floor(Math.random() * npc.lines.length)];
          const name = CADETS.find((c) => c.id === npc.id)?.name ?? "Cadet";
          this.game.toast(`${name}: ${line}`, "💬");
          void this.game.say(line);
          npc.anim.set("wave");
        }
      } else if (d > 9 && npc.spoken) {
        npc.spoken = false;
        npc.anim.set(NPC_SPOTS[this.npcs.indexOf(npc)].pose);
      }
    }
  }

  pointer(info: PointerInfo) {
    if (this.mode !== "explore") return;
    if (info.type === "down") this.dragging = false;
    if (info.type === "move" && info.pointers > 0 && Math.abs(info.dx) + Math.abs(info.dy) > 0) {
      if (Math.abs(info.dx) > 1.5) this.dragging = true;
      this.yaw -= info.dx * 0.006;
    }
    if (info.type === "tap" && !this.dragging) {
      this.raycaster.setFromCamera(new THREE.Vector2(info.x, info.y), this.camera);
      const hit = this.raycaster.intersectObject(this.ground)[0];
      if (hit) {
        // Snap to a nearby station pad for easy tapping.
        const pad = this.pads.find((p) => Math.hypot(p.x - hit.point.x, p.z - hit.point.z) < 7);
        this.tapTarget = pad ? new THREE.Vector3(pad.x, 0, pad.z) : hit.point.clone().setY(0);
        this.game.sound("tap");
      }
    }
  }

  wheel(deltaY: number) {
    this.distance = Math.max(7, Math.min(26, this.distance + deltaY * 0.01));
  }

  zoom(delta: number) {
    this.distance = Math.max(7, Math.min(26, this.distance + delta));
  }
}
