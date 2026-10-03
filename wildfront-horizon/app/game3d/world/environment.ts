// Time of day, weather and wind. Drives the sky, sun/moon light, hemisphere
// ambient, atmosphere fog, exposure, terrain snow/wetness and lightning.

import * as THREE from "three";
import { clamp01, lerp, smoothstep } from "../core/math.ts";
import { Simplex2 } from "../core/noise.ts";
import { mulberry32 } from "../core/rng.ts";
import { ATMO } from "../render/atmosphere.ts";
import type { Sky } from "./sky.ts";

export type TimeKey = "Dawn" | "Morning" | "Afternoon" | "Sunset" | "Dusk" | "Night" | "Snowrise" | "Dynamic";
export type WeatherKey = "Clear" | "Mist" | "Wind" | "Rain" | "Storm" | "Snow" | "Dynamic";

export const TIME_HOURS: Record<TimeKey, number> = { Dawn: 6.55, Morning: 8.7, Afternoon: 15.3, Sunset: 17.45, Dusk: 18.15, Night: 22.6, Snowrise: 7.4, Dynamic: 16.4 };

export interface WeatherState { cover: number; fog: number; haze: number; rain: number; snow: number; wind: number; storm: number; mist: number }
export const WEATHER: Record<Exclude<WeatherKey, "Dynamic">, WeatherState> = {
  Clear: { cover: 0.22, fog: 0.0035, haze: 0.0010, rain: 0, snow: 0, wind: 2.2, storm: 0, mist: 0 },
  Mist: { cover: 0.5, fog: 0.055, haze: 0.0032, rain: 0, snow: 0, wind: 0.9, storm: 0, mist: 1 },
  Wind: { cover: 0.45, fog: 0.003, haze: 0.0013, rain: 0, snow: 0, wind: 7.5, storm: 0, mist: 0 },
  Rain: { cover: 0.9, fog: 0.016, haze: 0.0034, rain: 1, snow: 0, wind: 3.5, storm: 0, mist: 0.35 },
  Storm: { cover: 0.98, fog: 0.02, haze: 0.0042, rain: 1, snow: 0, wind: 9.0, storm: 1, mist: 0.25 },
  Snow: { cover: 0.84, fog: 0.018, haze: 0.0040, rain: 0, snow: 1, wind: 3.0, storm: 0, mist: 0.3 },
};
const DYNAMIC_CYCLE: Exclude<WeatherKey, "Dynamic">[] = ["Clear", "Wind", "Mist", "Rain", "Clear", "Snow"];

type C = [number, number, number];
const KEYS: { e: number; zen: C; hor: C; sun: C; sunI: number; amb: number }[] = [
  { e: -18, zen: [0.016, 0.024, 0.055], hor: [0.04, 0.06, 0.1], sun: [0.55, 0.62, 0.85], sunI: 0.0, amb: 0.34 },
  { e: -8, zen: [0.035, 0.06, 0.14], hor: [0.18, 0.16, 0.25], sun: [0.6, 0.45, 0.55], sunI: 0.0, amb: 0.45 },
  { e: -3, zen: [0.1, 0.15, 0.32], hor: [0.66, 0.4, 0.36], sun: [1.0, 0.45, 0.25], sunI: 0.15, amb: 0.56 },
  { e: 1, zen: [0.16, 0.26, 0.5], hor: [0.95, 0.55, 0.32], sun: [1.0, 0.52, 0.26], sunI: 1.3, amb: 0.62 },
  { e: 6, zen: [0.2, 0.36, 0.66], hor: [0.92, 0.72, 0.52], sun: [1.0, 0.72, 0.45], sunI: 2.4, amb: 0.8 },
  { e: 15, zen: [0.2, 0.42, 0.78], hor: [0.68, 0.78, 0.88], sun: [1.0, 0.88, 0.7], sunI: 3.1, amb: 0.95 },
  { e: 35, zen: [0.16, 0.4, 0.82], hor: [0.62, 0.76, 0.9], sun: [1.0, 0.95, 0.86], sunI: 3.5, amb: 1.05 },
  { e: 70, zen: [0.13, 0.36, 0.8], hor: [0.6, 0.75, 0.9], sun: [1.0, 0.97, 0.92], sunI: 3.6, amb: 1.1 },
];
function gradient(e: number) {
  let i = 0;
  while (i < KEYS.length - 2 && e > KEYS[i + 1].e) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = clamp01((e - a.e) / (b.e - a.e));
  const mixC = (x: C, y: C): C => [lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)];
  return { zen: mixC(a.zen, b.zen), hor: mixC(a.hor, b.hor), sun: mixC(a.sun, b.sun), sunI: lerp(a.sunI, b.sunI, t), amb: lerp(a.amb, b.amb, t) };
}

export function sunDirection(hour: number, latDeg = 46, declDeg = -1): THREE.Vector3 {
  const H = (hour - 12) * 15 * Math.PI / 180, phi = latDeg * Math.PI / 180, dec = declDeg * Math.PI / 180;
  const e = -Math.cos(dec) * Math.sin(H);
  const nN = Math.sin(dec) * Math.cos(phi) - Math.cos(dec) * Math.cos(H) * Math.sin(phi);
  const u = Math.sin(dec) * Math.sin(phi) + Math.cos(dec) * Math.cos(H) * Math.cos(phi);
  return new THREE.Vector3(e, u, -nN).normalize();
}

export class Environment {
  hour: number;
  timeScale = 6;            // game minutes per real ten seconds ≈ 6× real time
  weatherKey: WeatherKey;
  w: WeatherState;
  windDir: number;          // radians, direction the wind blows TOWARD (0 = toward north / −Z)
  windSpeed = 0;
  gust = 0;
  sunDir = new THREE.Vector3();
  moonDir = new THREE.Vector3();
  sunElev = 0;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  exposure = 1;
  night = 0;
  flash = 0;
  private flashT = 0;
  private nextBolt = 6;
  private dynIndex = 0;
  private dynT = 0;
  private noise: Simplex2;
  private rng: () => number;
  private t = 0;
  private skyTint: THREE.Color;
  onThunder?: (delay: number, strength: number) => void;
  baseFloor: number;
  constructor(timeKey: TimeKey, weatherKey: WeatherKey, seed: number, skyTint: THREE.Color, baseFloor = 0) {
    this.baseFloor = baseFloor;
    this.hour = TIME_HOURS[timeKey] ?? 8;
    this.weatherKey = weatherKey;
    this.w = { ...(weatherKey === "Dynamic" ? WEATHER.Clear : WEATHER[weatherKey]) };
    this.rng = mulberry32(seed * 31 + 7);
    this.noise = new Simplex2(seed + 99);
    this.windDir = this.rng() * Math.PI * 2;
    this.skyTint = skyTint;
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.name = "sun";
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x4a4030, 1);
    this.hemi.name = "sky-ambient";
  }

  /** wind vector (m/s) the air moves toward, in world XZ */
  windVector(): [number, number] { return [Math.sin(this.windDir) * this.windSpeed, -Math.cos(this.windDir) * this.windSpeed]; }

  update(dt: number, sky: Sky, focus: THREE.Vector3) {
    this.t += dt;
    this.hour = (this.hour + dt * this.timeScale / 3600) % 24;
    // dynamic weather cycling
    if (this.weatherKey === "Dynamic") {
      this.dynT += dt;
      const period = 150;
      if (this.dynT > period) { this.dynT = 0; this.dynIndex = (this.dynIndex + 1) % DYNAMIC_CYCLE.length; }
      const target = WEATHER[DYNAMIC_CYCLE[this.dynIndex]];
      const k = 1 - Math.exp(-dt / 25);
      for (const key of Object.keys(target) as (keyof WeatherState)[]) this.w[key] = lerp(this.w[key], target[key], k);
    }
    // wind: base + slow veer + gusts
    this.windDir += this.noise.noise(this.t * 0.01, 3.3) * dt * 0.02;
    this.gust = Math.max(0, this.noise.noise(this.t * 0.18, 9.1)) * (0.6 + this.w.wind * 0.12);
    this.windSpeed = Math.max(0.2, this.w.wind * (0.8 + 0.25 * this.noise.noise(this.t * 0.05, 1.7)) + this.gust * 2.2);
    const [wx, wz] = this.windVector();
    ATMO.uWind.value.set(wx, wz);
    ATMO.uTime.value = this.t;

    // sun & moon
    this.sunDir.copy(sunDirection(this.hour));
    this.moonDir.copy(sunDirection((this.hour + 11.2) % 24, 46, 8));
    this.sunElev = Math.asin(this.sunDir.y) * 180 / Math.PI;
    const g = gradient(this.sunElev);
    this.night = smoothstep(-2, -12, this.sunElev);
    const cover = this.w.cover;
    const overcast = smoothstep(0.55, 0.95, cover);
    const grey = (c: C, k: number): THREE.Color => {
      const l = c[0] * 0.3 + c[1] * 0.5 + c[2] * 0.2;
      return new THREE.Color(lerp(c[0], l, k), lerp(c[1], l * 1.02, k), lerp(c[2], l * 1.06, k));
    };
    const tint = this.skyTint;
    const zen = grey(g.zen, overcast * 0.8).multiply(new THREE.Color(lerp(1, tint.r * 1.2, 0.18), lerp(1, tint.g * 1.2, 0.18), lerp(1, tint.b * 1.2, 0.18)));
    const hor = grey(g.hor, overcast * 0.75);
    const U = sky.uniforms;
    U.uSunDir.value.copy(this.sunDir);
    U.uMoonDir.value.copy(this.moonDir);
    U.uZenith.value.copy(zen).multiplyScalar(1 - this.w.storm * 0.45);
    U.uHorizon.value.copy(hor).multiplyScalar(1 - this.w.storm * 0.35);
    U.uSunColor.value.setRGB(g.sun[0], g.sun[1], g.sun[2]);
    U.uCover.value = cover;
    U.uNight.value = this.night;
    U.uTime.value = this.t;
    U.uWind.value.set(wx, wz);
    U.uStorm.value = this.w.storm;
    U.uSunVis.value = (1 - overcast * 0.85) * smoothstep(-4, 1, this.sunElev);
    const dayL = 0.25 + 0.75 * smoothstep(-6, 12, this.sunElev);
    U.uCloudLit.value.setRGB(lerp(0.95, g.hor[0], 0.35) * dayL, lerp(0.95, g.hor[1], 0.3) * dayL, lerp(0.97, g.hor[2], 0.25) * dayL).multiplyScalar(1 - this.w.storm * 0.5);
    U.uCloudDark.value.setRGB(0.42 * dayL, 0.45 * dayL, 0.5 * dayL).multiplyScalar(1 - this.w.storm * 0.4);

    // lightning
    if (this.w.storm > 0.5) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = 7 + this.rng() * 16;
        this.flashT = 0.35;
        const dist = 400 + this.rng() * 2600;
        this.onThunder?.(dist / 343, 1 - dist / 3200);
      }
    }
    if (this.flashT > 0) { this.flashT -= dt; this.flash = this.flashT > 0 ? (Math.sin(this.flashT * 60) > 0 ? 1 : 0.3) * (this.flashT / 0.35) : 0; } else this.flash = 0;
    U.uFlash.value = this.flash * 0.6;

    // lights: sun by day, moon by night
    const useMoon = this.sunElev < -4;
    const lightDir = useMoon ? this.moonDir : this.sunDir;
    const sunI = g.sunI * (1 - overcast * 0.78) * (1 - this.w.mist * 0.35);
    const moonI = 0.32 * this.night * (1 - overcast * 0.7) * smoothstep(-0.05, 0.2, this.moonDir.y);
    this.sun.intensity = (useMoon ? moonI : sunI) + this.flash * 4;
    if (useMoon) this.sun.color.setRGB(0.62, 0.72, 1.0); else this.sun.color.setRGB(g.sun[0], g.sun[1], g.sun[2]);
    this.sun.position.copy(focus).addScaledVector(lightDir, 160);
    this.sun.target.position.copy(focus);
    this.sun.target.updateMatrixWorld();
    this.hemi.color.copy(zen).lerp(new THREE.Color(0.7, 0.75, 0.82), overcast * 0.5).multiplyScalar(1);
    this.hemi.groundColor.setRGB(0.24 * dayL + 0.03, 0.22 * dayL + 0.03, 0.18 * dayL + 0.04);
    this.hemi.intensity = g.amb * (1 + overcast * 0.35) + this.flash * 1.5;
    // exposure keeps night readable without washing out noon
    this.exposure = lerp(1.0, 2.1, this.night) * lerp(1, 1.12, overcast);

    // atmosphere
    ATMO.uFogColor.value.copy(hor).multiplyScalar(1 - this.w.storm * 0.3).lerp(new THREE.Color(0.75, 0.78, 0.8), this.w.mist * 0.35 * dayL);
    ATMO.uFogSun.value.setRGB(g.sun[0], g.sun[1] * 0.95, g.sun[2] * 0.85).multiplyScalar(U.uSunVis.value * 0.9 + 0.1);
    ATMO.uSunDir.value.copy(this.sunDir);
    ATMO.uHaze.value = this.w.haze * (1 + this.night * 0.4);
    ATMO.uHeightFog.value = this.w.fog * (1 + 1.4 * smoothstep(8, 4, this.hour) * smoothstep(4.5, 6.5, this.hour));
    ATMO.uFogBase.value = this.baseFloor + 2;
    ATMO.uFogFalloff.value = lerp(0.045, 0.085, this.w.mist);
    ATMO.uSnow.value = lerp(ATMO.uSnow.value, this.w.snow * 0.92, 1 - Math.exp(-dt * 0.5));
    ATMO.uWet.value = lerp(ATMO.uWet.value, Math.max(this.w.rain, this.w.mist * 0.3), 1 - Math.exp(-dt * 0.3));
  }

  /** 0..1 how well the hunter can see / be seen (used by AI sight). */
  lightLevel(): number { return clamp01(0.18 + 0.82 * smoothstep(-10, 6, this.sunElev)) * (1 - this.w.cover * 0.15); }
  /** visibility multiplier from precipitation and mist */
  visibility(): number { return 1 - 0.35 * this.w.mist - 0.25 * this.w.rain - 0.3 * this.w.snow - 0.15 * this.w.storm; }
  /** sound masking from wind and rain (0..1) */
  noiseMask(): number { return clamp01(this.windSpeed / 14 + this.w.rain * 0.35 + this.w.storm * 0.25); }
  clockString(): string { const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60); return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`; }
}
