// Assembles a reserve: terrain, backdrop, sky, environment, water, vegetation,
// grass, colliders and (via structures.ts) landmarks.

import * as THREE from "three";
import { reserveByName, type ReserveDef } from "../blueprints/reserves.ts";
import { srgbToLinear } from "../models/paint.ts";
import type { QualitySettings } from "../render/quality.ts";
import { createBackdrop } from "./backdrop.ts";
import { ColliderGrid } from "./colliders.ts";
import { Environment, type TimeKey, type WeatherKey } from "./environment.ts";
import { Grass, grassTintTexture } from "./grass.ts";
import { Sky } from "./sky.ts";
import { createTerrainMesh, terrainTextures } from "./terrain-mesh.ts";
import { generateTerrain, heightAt, type TerrainData } from "./terrain-gen.ts";
import { buildColliders, placeVegetation, Vegetation, type PlantInstance } from "./vegetation.ts";
import { Water } from "./water.ts";

export interface WorldOptions { reserve: string | ReserveDef; time: TimeKey; weather: WeatherKey; seed?: number }

export class World {
  def: ReserveDef;
  terrain: TerrainData;
  scene: THREE.Scene;
  sky: Sky;
  env: Environment;
  terrainMesh: THREE.Mesh;
  backdrop: THREE.Mesh;
  water: Water;
  vegetation: Vegetation;
  grass: Grass | null;
  plants: PlantInstance[];
  colliders: ColliderGrid;
  hTex: THREE.Texture;
  sTex: THREE.Texture;
  quality: QualitySettings;
  structures = new THREE.Group();
  /** walkable bridge decks (filled by buildLandmarks) */
  decks: import("./structures.ts").Deck[] = [];
  constructor(renderer: THREE.WebGLRenderer, opts: WorldOptions, quality: QualitySettings) {
    this.quality = quality;
    this.def = typeof opts.reserve === "string" ? reserveByName(opts.reserve) : opts.reserve;
    const def = this.def;
    this.terrain = generateTerrain(def, 257);
    const t = this.terrain;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x8899aa, 0.001); // enables USE_FOG; colours come from ATMO
    this.sky = new Sky();
    this.scene.add(this.sky.mesh);
    const tint = new THREE.Color(def.sky.tint[0], def.sky.tint[1], def.sky.tint[2]);
    let floor = Infinity; for (const L of t.lakes) floor = Math.min(floor, L.level); if (!isFinite(floor)) floor = t.minH + 4;
    this.env = new Environment(opts.time, opts.weather, def.seed + (opts.seed ?? 0), tint, floor);
    this.scene.add(this.env.sun, this.env.sun.target, this.env.hemi);
    if (quality.shadows) {
      const s = this.env.sun;
      s.castShadow = true;
      s.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
      const r = quality.shadowRange;
      const c = s.shadow.camera as THREE.OrthographicCamera;
      c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.near = 1; c.far = 420;
      s.shadow.bias = -0.0004; s.shadow.normalBias = 0.5;
    }
    this.terrainMesh = createTerrainMesh(t, quality.terrainStep);
    this.scene.add(this.terrainMesh);
    this.backdrop = createBackdrop(t);
    this.scene.add(this.backdrop);
    const { hTex, sTex } = terrainTextures(t);
    this.hTex = hTex; this.sTex = sTex;
    const b0 = def.biomes[0];
    const deep = new THREE.Color().setRGB(srgbToLinear(0.03), srgbToLinear(0.16), srgbToLinear(0.2));
    const shallow = new THREE.Color().setRGB(srgbToLinear(b0.sand[0] * 0.55), srgbToLinear(b0.sand[1] * 0.6), srgbToLinear(b0.sand[2] * 0.5));
    this.water = new Water(t, hTex, { deep, shallow });
    this.scene.add(this.water.group);
    this.plants = placeVegetation(t);
    this.colliders = buildColliders(t, this.plants, new ColliderGrid(8));
    this.vegetation = new Vegetation(renderer, this.plants, { nearDist: quality.treeNear, farDist: quality.treeFar, shadows: quality.shadows, impostors: quality.impostors });
    this.scene.add(this.vegetation.group);
    if (quality.grassCount > 0) {
      const tintTex = grassTintTexture(this.terrainMesh.geometry, t.n);
      let gh = 0; for (const b of def.biomes) gh += b.grassHeight / def.biomes.length;
      const fl = def.biomes.flatMap(b => b.flowers).slice(0, 3).map(c => [srgbToLinear(c[0]), srgbToLinear(c[1]), srgbToLinear(c[2])] as [number, number, number]);
      while (fl.length < 3) fl.push(fl[0]);
      this.grass = new Grass(t, hTex, sTex, tintTex, { count: quality.grassCount, radius: quality.grassRadius, grassH: gh, flowers: fl });
      this.scene.add(this.grass.mesh);
    } else this.grass = null;
    this.structures.name = "structures";
    this.scene.add(this.structures);
  }

  heightAt(x: number, z: number) { return heightAt(this.terrain, x, z); }

  update(dt: number, camera: THREE.Camera, player: THREE.Vector3) {
    this.env.update(dt, this.sky, player);
    this.sky.follow(camera);
    this.water.sync(this.sky.uniforms);
    this.vegetation.update(camera.position);
    const amb = this.env.hemi.intensity * 0.55 + this.env.sun.intensity * 0.22;
    this.vegetation.setTint(new THREE.Color().copy(this.env.hemi.color).multiplyScalar(0.35).add(new THREE.Color(amb * 0.5, amb * 0.5, amb * 0.5)));
    this.grass?.update(camera.position, player, this.env.sun, this.env.hemi);
  }
}
