export type SportMode = "goal" | "hoops" | "capture" | "targets";

export type ArenaMission = {
  id: number;
  name: string;
  arena: string;
  mode: SportMode;
  target: number;
  rivalTarget: number;
  time: number;
  bots: number;
  reward: number;
  color: string;
  championship: boolean;
  /** Arena index 0..5 (five matches per arena). */
  world: number;
  /** AI teammates on the player's side (0 in Target Blitz). */
  allies: number;
  /** Goal Rush from the second arena on: both goals guarded by keeper drones. */
  keeper: boolean;
  /** Gravity Hoops: sideways sway amplitude of the hoop rigs, metres. */
  hoopSway: number;
  /** Target Blitz: share of targets that drift on flight paths. */
  targetMotion: number;
};

export const MODE_INFO: Record<SportMode, { name: string; icon: string; instruction: string; accent: string }> = {
  goal: { name: "Goal Rush", icon: "◉", instruction: "Dribble the energy ball upfield and fire it past the keeper drone. Hold the shot to charge and release in the green band for a perfect strike.", accent: "#49f4ff" },
  hoops: { name: "Gravity Hoops", icon: "◎", instruction: "Collect the orb, line up with the floating hoop and launch an arcing gravity shot, or ride a launch pad and slam dunk it through the ring.", accent: "#ffcc4d" },
  capture: { name: "Core Capture", icon: "◇", instruction: "Carry the power core into the rival scoring zone while protecting your shield. Throw it ahead to a teammate to break a press.", accent: "#9b7cff" },
  targets: { name: "Target Blitz", icon: "✦", instruction: "Skate the arena and blast every holographic target before the rival squad clears theirs. Charged blasts hit twice as hard.", accent: "#ff55ad" },
};

const ARENAS = [
  "Prism Training Deck",
  "Solar City Stadium",
  "Aurora Skycourt",
  "Quantum Harbor",
  "Titan Pulse Dome",
  "Infinity Championship",
];

const COLORS = ["#49f4ff", "#ff55ad", "#d9ff4f", "#9b7cff", "#ff8b3d", "#ffe45c"];

const NAMES = [
  "First Light", "Pulse Practice", "Orbit Trial", "Core Relay", "Prism Cup",
  "Metro Kickoff", "Holo Hustle", "Skyline Carry", "Turbo Targets", "Solar Crown",
  "Cloudline Clash", "Zero-G Rally", "Aurora Charge", "Comet Strike", "Skycourt Masters",
  "Harbor Sprint", "Tidal Goals", "Reactor Run", "Dockside Blitz", "Quantum Trophy",
  "Titan Opening", "Colossus Hoops", "Power Vault", "Neon Barrage", "Pulse Dome Final",
  "Infinite Drive", "Champion's Orbit", "Apex Capture", "Supernova Blitz", "Arena Legend",
];

const MODE_PATTERN: SportMode[] = [
  "goal", "targets", "hoops", "capture", "goal",
  "hoops", "goal", "capture", "targets", "hoops",
  "capture", "targets", "goal", "hoops", "capture",
  "targets", "goal", "capture", "hoops", "targets",
  "goal", "hoops", "capture", "targets", "goal",
  "hoops", "goal", "capture", "targets", "hoops",
];

function scoreTarget(mode: SportMode, world: number): number {
  if (mode === "targets") return 7 + world * 2;
  if (mode === "hoops") return 3 + world;
  return 2 + world;
}

export const MISSIONS: ArenaMission[] = NAMES.map((name, index) => {
  const id = index + 1;
  const world = Math.min(5, Math.floor(index / 5));
  const mode = MODE_PATTERN[index];
  const target = scoreTarget(mode, world);
  const bots = Math.min(7, 1 + world + Math.floor((index % 5) / 2));
  return {
    id,
    name,
    arena: ARENAS[world],
    mode,
    target,
    rivalTarget: mode === "targets" ? 4 + world : Math.max(2, Math.ceil(target * .72)),
    time: Math.max(80, 118 - world * 6),
    bots,
    reward: 140 + id * 42,
    color: COLORS[world],
    championship: id % 5 === 0,
    world,
    allies: mode === "targets" ? 0 : Math.min(2, Math.floor((bots - 1) / 2)),
    keeper: mode === "goal" && world >= 1,
    hoopSway: [0, 0, 1.6, 2.4, 3.0, 3.6][world],
    targetMotion: [0, .2, .35, .5, .6, .75][world],
  };
});

export const ARENA_NAMES = ARENAS;

export type UpgradeKey = "speed" | "power" | "shield" | "energy";

export const UPGRADES: { key: UpgradeKey; name: string; detail: string; icon: string; color: string }[] = [
  { key: "speed", name: "Velocity Boots", detail: "Faster movement and boost acceleration", icon: "↯", color: "#d9ff4f" },
  { key: "power", name: "Pulse Launcher", detail: "Stronger shots, tackles, and target damage", icon: "✦", color: "#49f4ff" },
  { key: "shield", name: "Aegis Armor", detail: "Absorb more rival contact before a reset", icon: "⬡", color: "#9b7cff" },
  { key: "energy", name: "Nova Reactor", detail: "Faster energy recharge and longer overdrive", icon: "◉", color: "#ff55ad" },
];

export const TEAMS = [
  { name: "Cyan Comets", color: "#49f4ff", accent: "#1268ff", icon: "C" },
  { name: "Magenta Meteors", color: "#ff55ad", accent: "#8f25ff", icon: "M" },
  { name: "Lime Legends", color: "#d9ff4f", accent: "#27c969", icon: "L" },
  { name: "Solar Strikers", color: "#ffb13d", accent: "#ff514e", icon: "S" },
  { name: "Violet Vortex", color: "#9b7cff", accent: "#5a39ff", icon: "V" },
  { name: "Golden Gravity", color: "#ffe45c", accent: "#ff7c32", icon: "G" },
];
