import {
  Color3, DynamicTexture, type InstancedMesh, Matrix, Mesh, MeshBuilder, Quaternion, type Scene, StandardMaterial, Texture,
  TransformNode, Vector3,
} from "@babylonjs/core";
import type {SportMode} from "./arena-data";
import type {ArenaTheme} from "./arena-themes";
import {ARENA, type AssetName, BLUEPRINT, type BlueprintBuilder, LAYOUT, type Tints} from "./blueprint-mesh";
import type {Quality} from "./scene-kit";

type ModeEntry = {asset: AssetName; position: number[]; yaw: number; side?: "home" | "rival"};
export type Structure = {asset: AssetName; side: "home" | "rival"; node: TransformNode; base: Vector3; yaw: number; meshes: Mesh[]};
export type VenueKits = {home: Tints; rival: Tints; accent: string; homeColor: string; rivalColor: string};
const MODES = BLUEPRINT.modes as unknown as Record<string, ModeEntry[]>;

/**
 * The venue for one match, assembled from spec.layout. Repeated modules are
 * GPU instances of one merged source; spectators are thin instances with a
 * per-seat shirt colour, so a full championship bowl costs a few draw calls.
 */
export class Stadium {
  root: TransformNode;
  structures: Structure[] = [];
  crowd: Mesh | null = null;
  private crowdBase: Float32Array | null = null;
  private crowdWork: Float32Array | null = null;
  private crowdPhase: Float32Array | null = null;
  private crowdResting = true;
  jumbo: DynamicTexture | null = null;
  private animated: {mesh: Mesh | TransformNode; kind: "spin" | "pulse" | "water"; speed: number}[] = [];
  private waterTex: Texture | null = null;
  excitement = 0;

  constructor(private scene: Scene, private builder: BlueprintBuilder, public arena: number, public mode: SportMode,
              private theme: ArenaTheme, public kits: VenueKits, private quality: Quality, private shadowCasters?: (m: Mesh) => void) {
    this.root = new TransformNode("venue", scene);
    const sources = new Map<string, Mesh[]>();
    for (const entry of LAYOUT) {
      if (!entry.arenas.includes(arena)) continue;
      if (entry.modes && !entry.modes.includes(mode)) continue;
      const node = new TransformNode(`${entry.asset}@${entry.position.join(",")}`, scene);
      node.parent = this.root; node.position = Vector3.FromArray(entry.position); node.rotation.y = entry.yaw;
      let source = sources.get(entry.asset);
      if (!source) {
        source = builder.buildMerged(entry.asset, node, {arena: kits.accent});
        sources.set(entry.asset, source);
        for (const m of source) {
          if (entry.asset === "pitch" && m.name.endsWith("floor")) m.receiveShadows = true;
          if (entry.asset === "jumbotron" && m.name.endsWith("screen")) m.material = this.jumboMaterial();
        }
      } else {
        for (const m of source) {
          const inst: InstancedMesh = m.createInstance(`${m.name}#${node.name}`);
          inst.parent = node;
        }
      }
      if (entry.asset === "stand_section") this.seatFans(entry.position, entry.yaw);
    }
    this.buildCrowd();
    this.buildModeStructures();
    this.decor();
    scene.onAfterRenderObservable.addOnce(() => {
      const moving = new Set<unknown>(this.animated.map(a => a.mesh));
      for (const m of this.root.getChildMeshes()) {
        if (moving.has(m) || this.structures.some(s => s.meshes.includes(m as Mesh))) continue;
        m.freezeWorldMatrix();
      }
    });
  }

  // --- Crowd -----------------------------------------------------------------
  private fans: {m: Matrix; color: Color3}[] = [];
  private seatFans(at: number[], yaw: number) {
    const density = this.theme.crowd * (this.quality === "high" ? 1 : .45);
    if (density <= 0) return;
    const rows = ARENA.seatRows as number[][], spacing = ARENA.seatSpacing;
    let seed = Math.floor(at[0] * 73 + at[2] * 131 + at[1] * 17) >>> 0;
    const r = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000;
    const home = Color3.FromHexString(this.kits.homeColor), rival = Color3.FromHexString(this.kits.rivalColor);
    const shirts = ["#f4f8ff", "#2b3452", "#ffe45c", "#49f4ff", "#ff55ad", "#d9ff4f", "#9b7cff", "#ff8b3d"].map(Color3.FromHexString);
    // Home fans fill the home end and the left side; travelling fans the far end.
    const homeBias = at[2] < -20 ? .55 : at[2] > 20 ? .12 : at[0] < 0 ? .4 : .22;
    const rivalBias = at[2] > 20 ? .5 : .12;
    const rot = Matrix.RotationY(yaw), pos = Vector3.FromArray(at);
    for (const [y, z] of rows) {
      for (const side of [-1, 1]) {
        for (let k = 0; k < 8; k++) {
          if (r() > density) continue;
          const local = new Vector3(side * (.95 + k * spacing), y - .42, z + .12);
          const world = Vector3.TransformCoordinates(local, rot).addInPlace(pos);
          const m = Matrix.Compose(new Vector3(1, .92 + r() * .16, 1), Quaternion.RotationYawPitchRoll(yaw + (r() - .5) * .5, 0, 0), world);
          const pick = r();
          const base = pick < homeBias ? home : pick < homeBias + rivalBias ? rival : shirts[Math.floor(r() * shirts.length)];
          this.fans.push({m, color: base.scale(.7 + r() * .3)});
        }
      }
    }
  }

  private buildCrowd() {
    if (!this.fans.length) return;
    const [mesh] = this.builder.buildMerged("spectator", this.root, {});
    mesh.name = "crowd";
    const n = this.fans.length;
    const matrices = new Float32Array(n * 16), colors = new Float32Array(n * 4), phase = new Float32Array(n);
    this.fans.forEach((f, i) => {
      f.m.copyToArray(matrices, i * 16);
      colors[i * 4] = f.color.r; colors[i * 4 + 1] = f.color.g; colors[i * 4 + 2] = f.color.b; colors[i * 4 + 3] = 1;
      phase[i] = (i * 2.399) % (Math.PI * 2);
    });
    mesh.thinInstanceSetBuffer("matrix", matrices, 16, false);
    mesh.thinInstanceSetBuffer("color", colors, 4, true);
    mesh.alwaysSelectAsActiveMesh = true;
    this.crowd = mesh; this.crowdBase = matrices.slice(); this.crowdWork = matrices; this.crowdPhase = phase;
    this.fans = [];
  }

  /** Wave the crowd: excitement 0..1 decays on its own. */
  cheer(level = 1) {this.excitement = Math.max(this.excitement, level)}

  // --- Jumbotron ---------------------------------------------------------------
  private jumboMaterial() {
    const tex = new DynamicTexture("jumboTex", {width: 512, height: 280}, this.scene, true);
    tex.uScale = -.5; tex.uOffset = .5; tex.vScale = .5; tex.vOffset = .5;
    tex.wrapU = tex.wrapV = Texture.CLAMP_ADDRESSMODE;
    const mat = new StandardMaterial("jumboScreen", this.scene);
    mat.diffuseColor = Color3.Black(); mat.specularColor = new Color3(.2, .2, .25); mat.emissiveTexture = tex; mat.emissiveColor = Color3.White();
    this.jumbo = tex;
    this.screen(["NEON SPORTS", "ARENA LEAGUE"], this.kits.accent);
    return mat;
  }

  /** Draw lines of text on all four jumbotron faces. */
  screen(lines: string[], color = this.kits.accent, sub = "") {
    if (!this.jumbo) return;
    const ctx = this.jumbo.getContext() as CanvasRenderingContext2D;
    const g = ctx.createLinearGradient(0, 0, 0, 280);
    g.addColorStop(0, "#0a0f2a"); g.addColorStop(1, "#040614");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 280);
    ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.strokeRect(8, 8, 496, 264);
    ctx.textAlign = "center"; ctx.fillStyle = "#ffffff";
    const sizes = lines.length > 1 ? [76, 54] : [104];
    lines.slice(0, 2).forEach((line, i) => {
      ctx.font = `900 ${sizes[i]}px Arial Narrow, Impact, sans-serif`;
      ctx.fillStyle = i === 0 ? "#ffffff" : color;
      ctx.fillText(line, 256, lines.length > 1 ? 118 + i * 82 : 172);
    });
    if (sub) {ctx.font = "700 26px Arial, sans-serif"; ctx.fillStyle = "#9aa6d6"; ctx.fillText(sub, 256, 258)}
    this.jumbo.update();
  }

  // --- Sport structures -------------------------------------------------------
  private buildModeStructures() {
    for (const entry of MODES[this.mode] ?? []) {
      if (this.mode === "targets") continue;
      const side = entry.side ?? "rival";
      const node = new TransformNode(`${entry.asset}-${side}`, this.scene);
      node.parent = this.root; node.position = Vector3.FromArray(entry.position); node.rotation.y = entry.yaw;
      const tints: Tints = side === "home" ? {...this.kits.home, arena: this.kits.homeColor} : {...this.kits.rival, arena: this.kits.accent};
      const meshes = this.builder.buildMerged(entry.asset, node, tints);
      if (entry.asset === "keeper_drone") meshes.forEach(m => this.shadowCasters?.(m));
      this.structures.push({asset: entry.asset, side, node, base: node.position.clone(), yaw: entry.yaw, meshes});
    }
  }

  structure(asset: AssetName, side: "home" | "rival") {return this.structures.find(s => s.asset === asset && s.side === side)}

  // --- Set dressing ------------------------------------------------------------
  private decor() {
    const s = this.scene, accent = Color3.FromHexString(this.theme.accent), decor = this.theme.decor;
    const ground = (y: number, color: string, emissive = .0) => {
      const g = MeshBuilder.CreateGround("outerGround", {width: 700, height: 700}, s);
      g.position.y = y; const m = new StandardMaterial("outerGroundMat", s);
      m.diffuseColor = Color3.FromHexString(color); m.specularColor = Color3.Black(); m.emissiveColor = Color3.FromHexString(color).scale(emissive);
      g.material = m; g.parent = this.root; g.isPickable = false; return g;
    };
    const gridTexture = (size: number, line: string, back: string, step = 32) => {
      const tex = new DynamicTexture("gridTex", {width: size, height: size}, s, true);
      const ctx = tex.getContext() as CanvasRenderingContext2D;
      ctx.fillStyle = back; ctx.fillRect(0, 0, size, size); ctx.strokeStyle = line; ctx.lineWidth = 2;
      for (let i = 0; i <= size; i += step) {ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke()}
      tex.update(); return tex;
    };
    if (decor === "clouds") {
      const deck = MeshBuilder.CreateCylinder("skyPlatform", {diameter: 92, height: 3.2, tessellation: 64}, s);
      deck.position.y = -1.7; deck.parent = this.root; deck.material = this.builder.material("armor");
      const rim = MeshBuilder.CreateTorus("platformRim", {diameter: 92, thickness: .5, tessellation: 96}, s);
      rim.position.y = -.2; rim.parent = this.root; rim.material = this.builder.material("accent", {arena: this.theme.accent});
      const clouds = new DynamicTexture("cloudTex", {width: 512, height: 512}, s, true);
      const ctx = clouds.getContext() as CanvasRenderingContext2D;
      ctx.fillStyle = "#06141f"; ctx.fillRect(0, 0, 512, 512);
      let seed = 11; const r = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000;
      for (let i = 0; i < 160; i++) {
        const x = r() * 512, y = r() * 512, rad = 18 + r() * 60, g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, "rgba(120,190,210,.35)"); g.addColorStop(1, "rgba(120,190,210,0)"); ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      clouds.update(); clouds.uScale = clouds.vScale = 6;
      const sea = ground(-14, "#000000"); (sea.material as StandardMaterial).emissiveTexture = clouds;
      this.waterTex = clouds;
    } else if (decor === "harbor") {
      const water = gridTexture(256, "rgba(155,124,255,.55)", "#05031a", 32); water.uScale = water.vScale = 40;
      const sea = ground(-1.6, "#000000"); (sea.material as StandardMaterial).emissiveTexture = water; this.waterTex = water;
      const quay = MeshBuilder.CreateBox("quay", {width: 80, height: 1.6, depth: 96}, s); quay.position.y = -.8; quay.parent = this.root;
      quay.material = this.builder.material("concrete");
    } else {
      const tex = gridTexture(256, decor === "city" ? "rgba(255,90,170,.35)" : "rgba(73,244,255,.22)", "#03040d", 64);
      tex.uScale = tex.vScale = 30;
      const g = ground(-.08, "#000000"); (g.material as StandardMaterial).emissiveTexture = tex;
    }
    if (decor === "dome") {
      const tex = gridTexture(512, "rgba(73,244,255,.5)", "rgba(0,0,0,0)", 32); tex.hasAlpha = true; tex.uScale = 6; tex.vScale = 3;
      const dome = MeshBuilder.CreateSphere("trainingDome", {diameter: 130, segments: 32, slice: .5, sideOrientation: Mesh.BACKSIDE}, s);
      dome.parent = this.root; dome.position.y = -2;
      const m = new StandardMaterial("domeMat", s); m.diffuseColor = Color3.Black(); m.emissiveTexture = tex; m.opacityTexture = tex; m.alpha = .55;
      m.disableLighting = true; m.backFaceCulling = false; dome.material = m; dome.isPickable = false;
    }
    if (decor === "pulse" || decor === "halo") {
      const rings = decor === "halo" ? [[88, 34, .9], [70, 30, .6]] : [[72, 26, .9], [58, 22, .7], [86, 30, .5]];
      rings.forEach(([d, y, th], i) => {
        const ring = MeshBuilder.CreateTorus(`roofRing${i}`, {diameter: d, thickness: th, tessellation: 128}, s);
        ring.position.y = y; ring.parent = this.root;
        const m = new StandardMaterial(`roofRingMat${i}`, s); m.diffuseColor = Color3.Black(); m.emissiveColor = accent.scale(1.1); m.disableLighting = true;
        ring.material = m;
        this.animated.push({mesh: ring, kind: decor === "halo" ? "spin" : "pulse", speed: .05 + i * .03});
      });
    }
    if (this.quality === "high") {
      // Faint light shafts from each floodlight head toward the pitch.
      for (const entry of LAYOUT) {
        if (entry.asset !== "floodlight" || !entry.arenas.includes(this.arena)) continue;
        const head = new Vector3(entry.position[0] * .96, 23.5, entry.position[2] * .96);
        const target = new Vector3(entry.position[0] * .25, 0, entry.position[2] * .25);
        const length = Vector3.Distance(head, target);
        const cone = MeshBuilder.CreateCylinder("lightShaft", {diameterTop: 2.4, diameterBottom: 16, height: length, tessellation: 24, cap: Mesh.NO_CAP}, s);
        cone.position = Vector3.Center(head, target); cone.parent = this.root;
        const dir = target.subtract(head).normalize();
        const axis = Vector3.Cross(Vector3.Up(), dir.scale(-1)).normalize(), angle = Math.acos(Vector3.Dot(Vector3.Up(), dir.scale(-1)));
        cone.rotationQuaternion = Quaternion.RotationAxis(axis, angle);
        const m = new StandardMaterial("shaftMat", s); m.diffuseColor = Color3.Black(); m.emissiveColor = new Color3(.55, .68, .9);
        m.alpha = .035; m.disableLighting = true; m.backFaceCulling = false; m.fogEnabled = false; cone.material = m; cone.isPickable = false;
      }
    }
  }

  update(dt: number, time: number) {
    this.excitement = Math.max(0, this.excitement - dt * .35);
    for (const a of this.animated) {
      if (a.kind === "spin") a.mesh.rotation.y += dt * a.speed;
      if (a.kind === "pulse") {const k = 1 + Math.sin(time * 1.6 + a.speed * 40) * .03; a.mesh.scaling.set(k, 1, k)}
    }
    if (this.waterTex) this.waterTex.vOffset += dt * .01;
    if (this.crowd && this.crowdBase && this.crowdWork && this.crowdPhase) {
      const e = this.excitement;
      if (e > .02 || !this.crowdResting) {
        const n = this.crowdPhase.length;
        for (let i = 0; i < n; i++) {
          const hop = Math.max(0, Math.sin(time * 9 + this.crowdPhase[i])) * .32 * e;
          this.crowdWork[i * 16 + 13] = this.crowdBase[i * 16 + 13] + hop;
        }
        this.crowd.thinInstanceBufferUpdated("matrix");
        this.crowdResting = e <= .02;
      }
    }
  }
}
