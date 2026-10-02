import {ArcRotateCamera, Color3, Engine, type Mesh, MeshBuilder, StandardMaterial, TransformNode, Vector3} from "@babylonjs/core";
import {ARENA_THEMES} from "./arena-themes";
import {
  airPose, applyPose, blastPose, boostPose, buildAthlete, carryPose, celebratePose, dunkPose, idlePose, kickPose, type Pose, type Rig,
  shootPose, skatePose, tacklePose, throwPose,
} from "./athlete-rig";
import {type AssetName, BlueprintBuilder, parts, type Tints} from "./blueprint-mesh";
import {arenaLights, arenaScene, autoQuality, postFx, skyDome} from "./scene-kit";

/** Interactive 3D blueprint hangar: the exact playable meshes on a turntable. */
export const HANGAR_VIEWS: Record<string, [number, number]> = {
  front: [Math.PI / 2, Math.PI / 2.1], rear: [-Math.PI / 2, Math.PI / 2.1], left: [Math.PI, Math.PI / 2.1], right: [0, Math.PI / 2.1],
  top: [Math.PI / 2, .02], under: [Math.PI / 2, Math.PI - .02], quarter: [Math.PI / 3.2, Math.PI / 2.55],
};
export const HANGAR_ASSETS: {key: AssetName; label: string}[] = [
  {key: "athlete", label: "Athlete"}, {key: "energy_ball", label: "Energy ball"}, {key: "gravity_orb", label: "Gravity orb"},
  {key: "power_core", label: "Power core"}, {key: "goal_frame", label: "Goal"}, {key: "keeper_drone", label: "Keeper drone"},
  {key: "hoop_rig", label: "Hoop rig"}, {key: "capture_zone", label: "Capture zone"}, {key: "holo_target", label: "Holo target"},
  {key: "pickup_energy", label: "Energy cell"}, {key: "pickup_shield", label: "Shield cell"}, {key: "pickup_turbo", label: "Turbo cell"},
  {key: "launch_pad", label: "Launch pad"}, {key: "trophy", label: "Infinity Cup"}, {key: "stand_section", label: "Stand"},
  {key: "board_section", label: "Dasher board"}, {key: "floodlight", label: "Floodlight"}, {key: "jumbotron", label: "Jumbotron"},
];
export const HANGAR_POSES = ["stance", "skate", "boost", "kick", "shoot", "throw", "blast", "tackle", "jump", "dunk", "celebrate", "carry"];

function animatedPose(name: string, t: number): Pose {
  const loop = (period: number) => (t % period) / period;
  switch (name) {
    case "skate": return skatePose(t * 7, 1);
    case "boost": return boostPose(t);
    case "kick": return kickPose(loop(1.3) * 1.2);
    case "shoot": return shootPose(loop(1.4) * 1.15);
    case "throw": return throwPose(loop(1.3) * 1.15);
    case "blast": return blastPose(loop(.6));
    case "tackle": return tacklePose(t);
    case "jump": return airPose(Math.cos(t * 2.4) * 7);
    case "dunk": return dunkPose(loop(1.5) * 1.1);
    case "celebrate": return celebratePose(t);
    case "carry": return carryPose(t * 6, .7);
    default: return idlePose(t);
  }
}

export class HangarViewer {
  engine: Engine; scene; camera: ArcRotateCamera; builder: BlueprintBuilder;
  holder: TransformNode; rig: Rig | null = null; meshes: Mesh[] = []; asset: AssetName = "athlete";
  pose = "stance"; spin = true; time = 0; blueprint = false; tints: Tints;
  private shadow;

  constructor(private canvas: HTMLCanvasElement, team: {color: string; accent: string}) {
    const quality = autoQuality();
    this.tints = {kitPrimary: team.accent, kitTrim: team.color, arena: team.color};
    this.engine = new Engine(canvas, true, {antialias: true, stencil: true});
    this.engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 1.6));
    const theme = {...ARENA_THEMES[0], fogDensity: .002};
    this.scene = arenaScene(this.engine, theme, quality);
    this.builder = new BlueprintBuilder(this.scene, this.tints);
    this.shadow = arenaLights(this.scene, theme, quality).shadow;
    this.camera = new ArcRotateCamera("hangarCam", Math.PI / 3.2, Math.PI / 2.55, 4.6, new Vector3(0, 1, 0), this.scene);
    this.camera.attachControl(canvas, true);
    this.camera.wheelDeltaPercentage = .01; this.camera.pinchDeltaPercentage = .004; this.camera.minZ = .05;
    this.camera.panningSensibility = 0;
    canvas.addEventListener("pointerdown", this.stopSpin);
    const deck = MeshBuilder.CreateCylinder("turntable", {diameter: 3.4, height: .08, tessellation: 64}, this.scene);
    deck.position.y = -.04; deck.material = this.builder.material("armor"); deck.receiveShadows = true;
    const ring = MeshBuilder.CreateTorus("turntableRing", {diameter: 3.45, thickness: .035, tessellation: 96}, this.scene);
    ring.material = this.builder.material("glow", this.tints);
    const grid = MeshBuilder.CreateGround("grid", {width: 60, height: 60, subdivisions: 60}, this.scene);
    const gm = new StandardMaterial("gridMat", this.scene); gm.wireframe = true; gm.emissiveColor = new Color3(.08, .32, .5); gm.disableLighting = true; gm.alpha = .3;
    grid.material = gm; grid.position.y = -.09;
    this.holder = new TransformNode("hangarHolder", this.scene);
    skyDome(this.scene, theme); postFx(this.scene, this.camera, theme, quality);
    this.setAsset("athlete");
    this.engine.runRenderLoop(() => this.update());
    window.addEventListener("resize", this.resize);
  }

  stopSpin = () => {this.spin = false};
  resize = () => this.engine.resize();

  setAsset(key: AssetName) {
    this.asset = key;
    if (this.rig) {this.rig.root.dispose(false, false); this.rig = null}
    for (const m of this.meshes) m.dispose();
    this.meshes = [];
    this.holder.getChildren().forEach(c => c.dispose());
    if (key === "athlete") {
      this.rig = buildAthlete(this.scene, this.builder, "hangarAthlete", this.tints);
      this.rig.root.parent = this.holder; this.meshes = this.rig.meshes;
    } else {
      const node = new TransformNode(`hangar-${key}`, this.scene); node.parent = this.holder;
      this.meshes = [...this.builder.build(key, node, {}, this.tints).values()];
      if (key === "keeper_drone" || key.startsWith("pickup") || key === "energy_ball" || key === "gravity_orb" || key === "power_core" || key === "holo_target") {
        const lo = Math.min(...parts(key).map(p => p.position[1] - p.size[1] / 2));
        node.position.y = .1 - lo;
      }
    }
    this.meshes.forEach(m => this.shadow?.addShadowCaster(m));
    this.applyWireframe();
    this.frame();
  }

  /** Fit the camera to the asset's bounds. */
  frame() {
    this.holder.computeWorldMatrix(true);
    let min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const m of this.meshes) {
      m.computeWorldMatrix(true); m.refreshBoundingInfo();
      const b = m.getBoundingInfo().boundingBox;
      min = Vector3.Minimize(min, b.minimumWorld); max = Vector3.Maximize(max, b.maximumWorld);
    }
    if (!isFinite(min.x)) return;
    const size = max.subtract(min), centre = Vector3.Center(min, max);
    const extent = Math.max(size.x, size.y, size.z);
    this.camera.setTarget(centre);
    this.camera.radius = Math.max(1.8, extent * 1.55);
    this.camera.lowerRadiusLimit = extent * .5; this.camera.upperRadiusLimit = extent * 4 + 4;
  }

  setPose(name: string) {this.pose = name}
  setView(name: keyof typeof HANGAR_VIEWS) {const [a, b] = HANGAR_VIEWS[name]; this.spin = false; this.camera.alpha = a; this.camera.beta = b}
  setTeam(team: {color: string; accent: string}) {
    this.tints = {kitPrimary: team.accent, kitTrim: team.color, arena: team.color};
    this.setAsset(this.asset);
  }
  toggleBlueprint() {this.blueprint = !this.blueprint; this.applyWireframe(); return this.blueprint}
  private applyWireframe() {for (const m of this.meshes) if (m.material) (m.material as StandardMaterial).wireframe = this.blueprint}

  update() {
    const dt = this.engine.getDeltaTime() / 1000; this.time += dt;
    if (this.spin) this.camera.alpha += dt * .32;
    if (this.rig) applyPose(this.rig, animatedPose(this.pose, this.time), Math.min(1, dt * 10));
    else if (this.asset === "energy_ball" || this.asset === "gravity_orb" || this.asset === "power_core") this.holder.rotation.y += dt * .8;
    this.scene.render();
  }

  destroy() {
    window.removeEventListener("resize", this.resize); this.canvas.removeEventListener("pointerdown", this.stopSpin);
    if (this.blueprint) {this.blueprint = false; this.applyWireframe()}
    this.engine.stopRenderLoop(); this.scene.dispose(); this.engine.dispose();
  }
}
