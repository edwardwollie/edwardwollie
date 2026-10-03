// Graphics presets. "auto" picks by device class and is refined at runtime by
// the frame-time governor in the game host.

export type QualityName = "low" | "medium" | "high" | "ultra";

export interface QualitySettings {
  name: QualityName;
  pixelRatio: number;          // cap on devicePixelRatio
  terrainStep: number;         // 1 = full 257² grid, 2 = half
  grassCount: number;
  grassRadius: number;
  treeNear: number;
  treeFar: number;
  impostors: boolean;
  shadows: boolean;
  shadowMap: number;
  shadowRange: number;
  reflections: boolean;
  animalLod: "high" | "low";
  particles: number;
  antialias: boolean;
}

export const QUALITY: Record<QualityName, QualitySettings> = {
  low: { name: "low", pixelRatio: 1, terrainStep: 2, grassCount: 6000, grassRadius: 22, treeNear: 110, treeFar: 520, impostors: true, shadows: false, shadowMap: 1024, shadowRange: 40, reflections: false, animalLod: "low", particles: 1200, antialias: false },
  medium: { name: "medium", pixelRatio: 1.25, terrainStep: 1, grassCount: 18000, grassRadius: 34, treeNear: 165, treeFar: 650, impostors: true, shadows: true, shadowMap: 2048, shadowRange: 50, reflections: false, animalLod: "high", particles: 2500, antialias: true },
  high: { name: "high", pixelRatio: 1.75, terrainStep: 1, grassCount: 36000, grassRadius: 46, treeNear: 215, treeFar: 760, impostors: true, shadows: true, shadowMap: 4096, shadowRange: 60, reflections: true, animalLod: "high", particles: 4000, antialias: true },
  ultra: { name: "ultra", pixelRatio: 2, terrainStep: 1, grassCount: 56000, grassRadius: 58, treeNear: 270, treeFar: 820, impostors: true, shadows: true, shadowMap: 4096, shadowRange: 72, reflections: true, animalLod: "high", particles: 6000, antialias: true },
};

export function autoQuality(): QualityName {
  if (typeof navigator === "undefined") return "medium";
  const ua = navigator.userAgent || "";
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (typeof window !== "undefined" && Math.min(window.innerWidth, window.innerHeight) < 600);
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (mobile) return mem >= 6 && cores >= 8 ? "medium" : "low";
  if (cores >= 8 && mem >= 8) return "high";
  return "medium";
}
