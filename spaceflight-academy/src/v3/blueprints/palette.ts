import type { MatSpec } from "./types.ts";

/**
 * Shared material palette. Colours follow the Spaceflight Academy cover art:
 * white flight suits with royal-blue panels, magenta accents, cyan glow lines.
 */
export const PALETTE: Readonly<Record<string, MatSpec>> = {
  // Flight-suit and hull whites
  white: { color: "#f3f6fb", roughness: 0.5, metalness: 0.02 },
  pearl: { color: "#e3e9f3", roughness: 0.42, metalness: 0.08 },
  hull: { color: "#f6f8fc", roughness: 0.38, metalness: 0.12 },
  // Blues
  royal: { color: "#2f63e0", roughness: 0.45, metalness: 0.05 },
  navy: { color: "#1b2c6e", roughness: 0.5, metalness: 0.05 },
  sky: { color: "#7fb6ff", roughness: 0.45 },
  // Accents
  magenta: { color: "#f2338f", roughness: 0.38, metalness: 0.08 },
  pink: { color: "#ff66bf", roughness: 0.4 },
  cyan: { color: "#62e8ff", roughness: 0.35, emissive: "#1fb8d6", emissiveIntensity: 0.35 },
  cyanGlow: { color: "#7ff0ff", emissive: "#3fe6ff", emissiveIntensity: 1.6, roughness: 0.3, ghost: true },
  pinkGlow: { color: "#ff8fd2", emissive: "#ff4fb5", emissiveIntensity: 1.5, roughness: 0.3, ghost: true },
  goldGlow: { color: "#ffe28a", emissive: "#ffc93d", emissiveIntensity: 1.4, roughness: 0.3, ghost: true },
  greenGlow: { color: "#8dffb8", emissive: "#2fe07a", emissiveIntensity: 1.4, roughness: 0.3, ghost: true },
  redGlow: { color: "#ff8f8f", emissive: "#ff3b3b", emissiveIntensity: 1.4, roughness: 0.3, ghost: true },
  gold: { color: "#ffcf4a", roughness: 0.35, metalness: 0.45 },
  goldFoil: { color: "#e8b23a", roughness: 0.28, metalness: 0.75 },
  orange: { color: "#ff8a3d", roughness: 0.45 },
  violet: { color: "#9b7bff", roughness: 0.45 },
  green: { color: "#3fcf7f", roughness: 0.5 },
  red: { color: "#ef4b4b", roughness: 0.45 },
  // Metals
  silver: { color: "#c8d2e2", roughness: 0.3, metalness: 0.65 },
  steel: { color: "#8c98ae", roughness: 0.35, metalness: 0.7 },
  gunmetal: { color: "#4a5368", roughness: 0.4, metalness: 0.6 },
  darkMetal: { color: "#2c3346", roughness: 0.45, metalness: 0.55 },
  engineBell: { color: "#39404f", roughness: 0.32, metalness: 0.8, doubleSide: true },
  copper: { color: "#c46b3c", roughness: 0.35, metalness: 0.75 },
  // Darks
  black: { color: "#121520", roughness: 0.5 },
  rubber: { color: "#262a35", roughness: 0.85 },
  visor: { color: "#0b1020", roughness: 0.12, metalness: 0.3 },
  screen: { color: "#0d1b3d", roughness: 0.25, emissive: "#1a4fd0", emissiveIntensity: 0.55 },
  // Glass
  glass: { color: "#b9e6ff", roughness: 0.05, metalness: 0.1, opacity: 0.32, ghost: true, doubleSide: true },
  window: { color: "#1c3f7a", roughness: 0.12, metalness: 0.4, emissive: "#2a62c9", emissiveIntensity: 0.35 },
  // Special surfaces
  solarCell: { color: "#1d3d9a", roughness: 0.22, metalness: 0.55, emissive: "#0f2b7a", emissiveIntensity: 0.25 },
  heatTile: { color: "#2b2421", roughness: 0.9 },
  ablative: { color: "#5a3d2b", roughness: 0.85 },
  concrete: { color: "#c9ccd3", roughness: 0.95 },
  asphalt: { color: "#4b5160", roughness: 0.95 },
  grass: { color: "#5fc46a", roughness: 0.95 },
  sand: { color: "#ead39b", roughness: 0.95 },
  water: { color: "#2f8fd8", roughness: 0.15, metalness: 0.2 },
  leaf: { color: "#2fae5a", roughness: 0.8 },
  bark: { color: "#8a5a35", roughness: 0.9 },
  moonDust: { color: "#b9b6b0", roughness: 0.95 },
  marsDust: { color: "#c8693f", roughness: 0.95 },
  // Faces
  eyeWhite: { color: "#ffffff", roughness: 0.25 },
  pupil: { color: "#1a1410", roughness: 0.2 },
  mouth: { color: "#7a2a35", roughness: 0.6 },
  blush: { color: "#ff9fb1", roughness: 0.7, opacity: 0.55 },
  tongue: { color: "#ff7c8f", roughness: 0.6 },
  teeth: { color: "#ffffff", roughness: 0.4 },
  // Default skin & hair (cadets override these per character)
  skin: { color: "#c98e62", roughness: 0.62 },
  skinShade: { color: "#b37a50", roughness: 0.62 },
  hair: { color: "#2a1a12", roughness: 0.7 },
  hairAccent: { color: "#f2338f", roughness: 0.6 },
  brow: { color: "#2a1a12", roughness: 0.7 },
  iris: { color: "#4b2d1a", roughness: 0.3 },
};
