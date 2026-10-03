export type CarId = "pulse" | "vortex" | "solar" | "prism";
export type UpgradeId = "engine" | "handling" | "shield" | "magnet";

export type CarSpec = {
  id: CarId;
  name: string;
  model: string;
  tagline: string;
  price: number;
  primary: number;
  secondary: number;
  cssPrimary: string;
  cssSecondary: string;
  speed: number;
  handling: number;
  armor: number;
  magnet: number;
};

export const CARS: CarSpec[] = [
  {
    id: "pulse",
    name: "Pulse GT",
    model: "PX-01",
    tagline: "Balanced ion racer",
    price: 0,
    primary: 0x19e6ff,
    secondary: 0x8b5cff,
    cssPrimary: "#19e6ff",
    cssSecondary: "#8b5cff",
    speed: 0.62,
    handling: 0.7,
    armor: 0.62,
    magnet: 0.36,
  },
  {
    id: "vortex",
    name: "Vortex R9",
    model: "VX-R9",
    tagline: "Razor handling, wild speed",
    price: 850,
    primary: 0xff3bbd,
    secondary: 0x32ff8a,
    cssPrimary: "#ff3bbd",
    cssSecondary: "#32ff8a",
    speed: 0.84,
    handling: 0.82,
    armor: 0.47,
    magnet: 0.42,
  },
  {
    id: "solar",
    name: "Solar Wraith",
    model: "SW-77",
    tagline: "Maximum velocity interceptor",
    price: 1900,
    primary: 0xff8a1f,
    secondary: 0xffee55,
    cssPrimary: "#ff8a1f",
    cssSecondary: "#ffee55",
    speed: 0.98,
    handling: 0.6,
    armor: 0.55,
    magnet: 0.5,
  },
  {
    id: "prism",
    name: "Prism Titan",
    model: "PT-X",
    tagline: "Shielded quantum collector",
    price: 4200,
    primary: 0xa8ff3e,
    secondary: 0x38a7ff,
    cssPrimary: "#a8ff3e",
    cssSecondary: "#38a7ff",
    speed: 0.78,
    handling: 0.73,
    armor: 0.9,
    magnet: 0.9,
  },
];

export const UPGRADE_INFO: Record<
  UpgradeId,
  { name: string; shortName: string; description: string; color: string }
> = {
  engine: {
    name: "Ion Drive",
    shortName: "Speed",
    description: "Raises top speed and boost power.",
    color: "#ff8a1f",
  },
  handling: {
    name: "Vector Fins",
    shortName: "Handling",
    description: "Sharper steering and faster recovery.",
    color: "#19e6ff",
  },
  shield: {
    name: "Aegis Shell",
    shortName: "Shield",
    description: "More integrity and less collision damage.",
    color: "#a8ff3e",
  },
  magnet: {
    name: "Quantum Magnet",
    shortName: "Magnet",
    description: "Pulls coins in from farther away.",
    color: "#ff3bbd",
  },
};

export const UPGRADE_IDS: UpgradeId[] = [
  "engine",
  "handling",
  "shield",
  "magnet",
];

export type UpgradeLevels = Record<UpgradeId, number>;

export type SaveData = {
  version: 1;
  coins: number;
  selectedCar: CarId;
  ownedCars: CarId[];
  upgrades: UpgradeLevels;
  bestDistance: number;
  highestSector: number;
  totalCoins: number;
  totalRuns: number;
  dailyClaimDate: string;
};

export const SAVE_KEY = "hypernova-circuit-save-v1";

export function createDefaultSave(): SaveData {
  return {
    version: 1,
    coins: 250,
    selectedCar: "pulse",
    ownedCars: ["pulse"],
    upgrades: { engine: 0, handling: 0, shield: 0, magnet: 0 },
    bestDistance: 0,
    highestSector: 1,
    totalCoins: 0,
    totalRuns: 0,
    dailyClaimDate: "",
  };
}

const carIds = new Set<CarId>(CARS.map((car) => car.id));

function finiteInteger(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : fallback;
}

export function sanitizeSave(value: unknown): SaveData {
  const fallback = createDefaultSave();
  if (!value || typeof value !== "object") return fallback;

  const candidate = value as Partial<SaveData>;
  const ownedCars: CarId[] = Array.isArray(candidate.ownedCars)
    ? candidate.ownedCars.filter((id): id is CarId => carIds.has(id as CarId))
    : ["pulse"];
  if (!ownedCars.includes("pulse")) ownedCars.unshift("pulse");

  const selectedCar =
    carIds.has(candidate.selectedCar as CarId) &&
    ownedCars.includes(candidate.selectedCar as CarId)
      ? (candidate.selectedCar as CarId)
      : "pulse";

  const rawUpgrades = candidate.upgrades ?? fallback.upgrades;
  const upgrades = Object.fromEntries(
    UPGRADE_IDS.map((id) => [
      id,
      Math.min(5, finiteInteger(rawUpgrades[id], 0)),
    ]),
  ) as UpgradeLevels;

  return {
    version: 1,
    coins: finiteInteger(candidate.coins, fallback.coins),
    selectedCar,
    ownedCars: [...new Set<CarId>(ownedCars)],
    upgrades,
    bestDistance: finiteInteger(candidate.bestDistance),
    highestSector: Math.max(1, finiteInteger(candidate.highestSector, 1)),
    totalCoins: finiteInteger(candidate.totalCoins),
    totalRuns: finiteInteger(candidate.totalRuns),
    dailyClaimDate:
      typeof candidate.dailyClaimDate === "string"
        ? candidate.dailyClaimDate.slice(0, 10)
        : "",
  };
}

export function loadSave(): SaveData {
  if (typeof window === "undefined") return createDefaultSave();
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? sanitizeSave(JSON.parse(raw)) : createDefaultSave();
  } catch {
    return createDefaultSave();
  }
}

export function storeSave(save: SaveData): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // The game remains playable when private browsing blocks local storage.
  }
}

export function getCar(id: CarId): CarSpec {
  return CARS.find((car) => car.id === id) ?? CARS[0];
}

export function upgradeCost(id: UpgradeId, level: number): number {
  const base: Record<UpgradeId, number> = {
    engine: 140,
    handling: 120,
    shield: 130,
    magnet: 150,
  };
  return Math.round((base[id] * Math.pow(1.82, level)) / 10) * 10;
}

export type EffectiveStats = {
  maxSpeed: number;
  acceleration: number;
  steering: number;
  maxShield: number;
  damageReduction: number;
  magnetRadius: number;
  boostMultiplier: number;
};

export function effectiveStats(
  car: CarSpec,
  upgrades: UpgradeLevels,
): EffectiveStats {
  return {
    maxSpeed: 44 + car.speed * 35 + upgrades.engine * 3.8,
    acceleration: 10 + car.speed * 5 + upgrades.engine * 1.15,
    steering: 5.2 + car.handling * 4.2 + upgrades.handling * 0.72,
    maxShield: 72 + car.armor * 45 + upgrades.shield * 15,
    damageReduction: Math.min(
      0.58,
      car.armor * 0.25 + upgrades.shield * 0.045,
    ),
    magnetRadius: 1.1 + car.magnet * 3.2 + upgrades.magnet * 0.85,
    boostMultiplier: 1.2 + car.speed * 0.13 + upgrades.engine * 0.018,
  };
}

export function utcDateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function dailyRewardAmount(highestSector: number): number {
  return Math.min(350, 100 + Math.max(0, highestSector - 1) * 15);
}
