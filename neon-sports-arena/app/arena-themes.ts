/** Presentation for the six venues: sky, fog, light, crowd and set dressing. */
export type Decor = "dome" | "city" | "clouds" | "harbor" | "pulse" | "halo";
export type ArenaTheme = {
  name: string; accent: string; decor: Decor; crowd: number;
  sky: [string, string, string, string]; sun: string; fog: string; fogDensity: number;
  exposure: number; hemi: number; key: number; music: number[];
};

export const ARENA_THEMES: ArenaTheme[] = [
  { name: "Prism Training Deck", accent: "#49f4ff", decor: "dome", crowd: .3,
    sky: ["#03040f", "#071338", "#0c2a52", "#041020"], sun: "#9fe9ff", fog: "#06122a", fogDensity: 0.0033,
    exposure: 1.05, hemi: .9, key: 1.35, music: [55, 65.4, 49, 58.3] },
  { name: "Solar City Stadium", accent: "#ff55ad", decor: "city", crowd: .72,
    sky: ["#0a0420", "#3a0f45", "#ff6a3d", "#1a0820"], sun: "#ffc08a", fog: "#2a0c30", fogDensity: 0.00248,
    exposure: 1.1, hemi: 1.0, key: 1.5, music: [61.7, 55, 73.4, 65.4] },
  { name: "Aurora Skycourt", accent: "#d9ff4f", decor: "clouds", crowd: .62,
    sky: ["#020815", "#06263a", "#1d7a63", "#0a1d2c"], sun: "#c8ffe4", fog: "#0a2232", fogDensity: 0.00193,
    exposure: 1.08, hemi: 1.05, key: 1.4, music: [65.4, 73.4, 55, 61.7] },
  { name: "Quantum Harbor", accent: "#9b7cff", decor: "harbor", crowd: .78,
    sky: ["#030216", "#140a3e", "#3c1d74", "#08051c"], sun: "#c9b8ff", fog: "#120a30", fogDensity: 0.00275,
    exposure: 1.05, hemi: .95, key: 1.4, music: [49, 58.3, 55, 43.7] },
  { name: "Titan Pulse Dome", accent: "#ff8b3d", decor: "pulse", crowd: .88,
    sky: ["#0a0306", "#2a0a10", "#5a1f12", "#120406"], sun: "#ffc79a", fog: "#1e0810", fogDensity: 0.0033,
    exposure: 1.06, hemi: .95, key: 1.45, music: [55, 49, 61.7, 46.2] },
  { name: "Infinity Championship", accent: "#ffe45c", decor: "halo", crowd: 1,
    sky: ["#04020c", "#1c0c3c", "#6b3a1a", "#0a0614"], sun: "#ffe7b0", fog: "#140a24", fogDensity: 0.0022,
    exposure: 1.12, hemi: 1.05, key: 1.6, music: [65.4, 55, 73.4, 82.4] },
];
