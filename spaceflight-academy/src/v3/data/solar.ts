import type { PlanetKind } from "../engine/space.ts";

/**
 * Solar System data for the Observatory. Physical values follow NASA's planetary
 * fact sheets; moon counts are the known totals reported by NASA in mid-2026
 * (astronomers keep finding more). Orbital elements are the JPL approximate
 * Keplerian elements (Standish, J2000) so the Orbits view can show where the
 * planets really are today.
 */
export type BodyId = "sun" | "mercury" | "venus" | "earth" | "moon" | "mars" | "jupiter" | "saturn" | "uranus" | "neptune" | "pluto";

export interface OrbitElements {
  /** Semi-major axis (AU). */
  a: number;
  e: number;
  /** Inclination, longitude of ascending node, longitude of perihelion, mean longitude at J2000 (degrees). */
  i: number;
  node: number;
  peri: number;
  L0: number;
  /** Mean motion (degrees per day). */
  n: number;
}

export interface Body {
  id: BodyId;
  name: string;
  kind: PlanetKind;
  type: string;
  icon: string;
  color: string;
  diameterKm: number;
  distanceText: string;
  spinText: string;
  spinHours: number;
  /** Negative = spins backwards (retrograde). */
  retrograde?: boolean;
  yearText: string;
  yearDays: number;
  moons: number | null;
  /** Surface gravity compared with Earth (1 = Earth). Gas giants: at the cloud tops. */
  gravity: number;
  tempText: string;
  lightText: string;
  tilt: number;
  rings: boolean;
  fits: string;
  facts: readonly string[];
  orbit?: OrbitElements;
  /** Can a cadet stand here (or on an imaginary platform) for the Gravity Jump? */
  jump: "ground" | "platform" | "no";
  jumpNote?: string;
}

export const MOON_COUNT_NOTE = "Known moons, mid-2026. Astronomers keep finding more!";

export const BODIES: readonly Body[] = [
  {
    id: "sun", name: "The Sun", kind: "sun", type: "Star", icon: "☀️", color: "#ffc93d",
    diameterKm: 1392700, distanceText: "Centre of the solar system", spinText: "About 25 Earth days (at its middle)", spinHours: 609,
    yearText: "Circles the galaxy every ~230 million years", yearDays: 0, moons: null, gravity: 28, tempText: "5,500 °C at the surface", lightText: "Sunlight starts here!",
    tilt: 7.25, rings: false, fits: "About 1.3 million Earths could fit inside the Sun.",
    facts: [
      "The Sun is a star: a gigantic ball of hot, glowing gas.",
      "Its gravity holds the whole solar system together, from Mercury to Pluto and beyond.",
      "Never look straight at the Sun, not even with sunglasses. It can hurt your eyes.",
    ],
    jump: "no", jumpNote: "Nobody can stand on the Sun: it has no solid surface and it is far too hot.",
  },
  {
    id: "mercury", name: "Mercury", kind: "mercury", type: "Rocky planet", icon: "🪨", color: "#a9a19a",
    diameterKm: 4879, distanceText: "58 million km (0.39 AU)", spinText: "59 Earth days", spinHours: 1407.6,
    yearText: "88 Earth days", yearDays: 87.97, moons: 0, gravity: 0.38, tempText: "430 °C by day, −180 °C at night", lightText: "3 minutes",
    tilt: 0.03, rings: false, fits: "About 18 Mercurys could fit inside Earth.",
    facts: [
      "Mercury is the smallest planet and the closest to the Sun.",
      "A year on Mercury is only 88 Earth days. It zooms around the Sun!",
      "There is almost no air, so days are scorching and nights are freezing.",
    ],
    orbit: { a: 0.38709927, e: 0.20563593, i: 7.00497902, node: 48.33076593, peri: 77.45779628, L0: 252.2503235, n: 4.09233445 },
    jump: "ground",
  },
  {
    id: "venus", name: "Venus", kind: "venus", type: "Rocky planet", icon: "🌕", color: "#e8c27a",
    diameterKm: 12104, distanceText: "108 million km (0.72 AU)", spinText: "243 Earth days, backwards!", spinHours: 5832.5, retrograde: true,
    yearText: "225 Earth days", yearDays: 224.7, moons: 0, gravity: 0.9, tempText: "465 °C, hotter than a pizza oven", lightText: "6 minutes",
    tilt: 177.4, rings: false, fits: "Venus is almost Earth's twin in size: 95% as wide.",
    facts: [
      "Venus is the hottest planet, even hotter than Mercury, because thick clouds trap the heat like a blanket.",
      "Venus spins backwards compared with most planets, so the Sun rises in the west.",
      "One spin of Venus takes longer than one trip around the Sun!",
    ],
    orbit: { a: 0.72333566, e: 0.00677672, i: 3.39467605, node: 76.67984255, peri: 131.60246718, L0: 181.9790995, n: 1.60213034 },
    jump: "ground", jumpNote: "Imagination time! Real Venus would crush and cook any astronaut, so this cadet wears an imaginary super-suit.",
  },
  {
    id: "earth", name: "Earth", kind: "earth", type: "Rocky planet", icon: "🌍", color: "#3f8fe8",
    diameterKm: 12756, distanceText: "150 million km (1 AU)", spinText: "24 hours", spinHours: 23.93,
    yearText: "365¼ days", yearDays: 365.256, moons: 1, gravity: 1, tempText: "15 °C on average", lightText: "8 minutes 20 seconds",
    tilt: 23.44, rings: false, fits: "About 50 Moons could fit inside Earth.",
    facts: [
      "Earth is the only planet we know with life and with oceans of liquid water on its surface.",
      "About 71 percent of Earth's surface is covered by water.",
      "Earth's air protects us from harmful sunlight and burns up small space rocks.",
    ],
    orbit: { a: 1.00000261, e: 0.01671123, i: 0, node: 0, peri: 102.93768193, L0: 100.46457166, n: 0.98560911 },
    jump: "ground",
  },
  {
    id: "moon", name: "The Moon", kind: "moon", type: "Earth's moon", icon: "🌙", color: "#c8c8c8",
    diameterKm: 3475, distanceText: "384,400 km from Earth", spinText: "27 Earth days", spinHours: 655.7,
    yearText: "27 days to circle Earth", yearDays: 27.32, moons: null, gravity: 0.17, tempText: "120 °C by day, −130 °C at night", lightText: "8 minutes 20 seconds",
    tilt: 6.7, rings: false, fits: "The Moon is about one quarter as wide as Earth.",
    facts: [
      "Twelve astronauts walked on the Moon between 1969 and 1972.",
      "The same side of the Moon always faces Earth.",
      "The Moon has no air, so astronauts' footprints can last for millions of years.",
    ],
    jump: "ground",
  },
  {
    id: "mars", name: "Mars", kind: "mars", type: "Rocky planet", icon: "🔴", color: "#d4643a",
    diameterKm: 6792, distanceText: "228 million km (1.52 AU)", spinText: "24 hours 37 minutes", spinHours: 24.62,
    yearText: "687 Earth days", yearDays: 686.98, moons: 2, gravity: 0.38, tempText: "−65 °C on average", lightText: "13 minutes",
    tilt: 25.19, rings: false, fits: "More than 6 Mars-sized planets could fit inside Earth.",
    facts: [
      "Mars is red because its dust contains rusty iron.",
      "Olympus Mons on Mars is the biggest volcano in the solar system, about two and a half times as tall as Mount Everest.",
      "Mars has two small moons called Phobos and Deimos.",
    ],
    orbit: { a: 1.52371034, e: 0.0933941, i: 1.84969142, node: 49.55953891, peri: 336.05637041, L0: 355.44656795, n: 0.52402076 },
    jump: "ground",
  },
  {
    id: "jupiter", name: "Jupiter", kind: "jupiter", type: "Gas giant", icon: "🟠", color: "#d9b38c",
    diameterKm: 142984, distanceText: "778 million km (5.2 AU)", spinText: "9 hours 56 minutes", spinHours: 9.93,
    yearText: "12 Earth years", yearDays: 4332.6, moons: 115, gravity: 2.53, tempText: "−110 °C at the cloud tops", lightText: "43 minutes",
    tilt: 3.13, rings: true, fits: "About 1,300 Earths could fit inside Jupiter.",
    facts: [
      "Jupiter is the biggest planet in the solar system.",
      "The Great Red Spot is a giant storm that is wider than Earth.",
      "Jupiter spins faster than any other planet: a day there is less than 10 hours long.",
    ],
    orbit: { a: 5.202887, e: 0.04838624, i: 1.30439695, node: 100.47390909, peri: 14.72847983, L0: 34.39644051, n: 0.08308693 },
    jump: "platform", jumpNote: "Jupiter has no solid ground, so our cadet jumps on an imaginary platform floating at the cloud tops.",
  },
  {
    id: "saturn", name: "Saturn", kind: "saturn", type: "Gas giant", icon: "🪐", color: "#ead39b",
    diameterKm: 120536, distanceText: "1.4 billion km (9.6 AU)", spinText: "10 hours 33 minutes", spinHours: 10.56,
    yearText: "29 Earth years", yearDays: 10759, moons: 293, gravity: 1.06, tempText: "−140 °C", lightText: "1 hour 20 minutes",
    tilt: 26.73, rings: true, fits: "About 760 Earths could fit inside Saturn.",
    facts: [
      "Saturn's rings are made of countless pieces of ice and rock, from tiny grains of dust to chunks as big as mountains.",
      "Saturn is so light for its size that it would float in a giant bathtub of water!",
      "Saturn has more known moons than any other planet: almost 300.",
    ],
    orbit: { a: 9.53667594, e: 0.05386179, i: 2.48599187, node: 113.66242448, peri: 92.59887831, L0: 49.95424423, n: 0.03346981 },
    jump: "platform", jumpNote: "Saturn is a ball of gas, so our cadet jumps on an imaginary floating platform.",
  },
  {
    id: "uranus", name: "Uranus", kind: "uranus", type: "Ice giant", icon: "🔵", color: "#9ff0f0",
    diameterKm: 51118, distanceText: "2.9 billion km (19.2 AU)", spinText: "17 hours 14 minutes, on its side!", spinHours: 17.24, retrograde: true,
    yearText: "84 Earth years", yearDays: 30687, moons: 29, gravity: 0.9, tempText: "−195 °C", lightText: "2 hours 40 minutes",
    tilt: 97.77, rings: true, fits: "About 63 Earths could fit inside Uranus.",
    facts: [
      "Uranus spins tipped over on its side, like a ball rolling around the Sun.",
      "Its blue-green colour comes from methane gas in its air.",
      "Uranus has thin, dark rings that are hard to see.",
    ],
    orbit: { a: 19.18916464, e: 0.04725744, i: 0.77263783, node: 74.01692503, peri: 170.9542763, L0: 313.23810451, n: 0.0117312 },
    jump: "platform", jumpNote: "Uranus has no solid surface you could stand on, so this is an imaginary floating platform.",
  },
  {
    id: "neptune", name: "Neptune", kind: "neptune", type: "Ice giant", icon: "🔷", color: "#4c79e8",
    diameterKm: 49528, distanceText: "4.5 billion km (30 AU)", spinText: "16 hours 6 minutes", spinHours: 16.11,
    yearText: "165 Earth years", yearDays: 60190, moons: 16, gravity: 1.14, tempText: "−200 °C", lightText: "4 hours 10 minutes",
    tilt: 28.32, rings: true, fits: "About 57 Earths could fit inside Neptune.",
    facts: [
      "Neptune has the fastest winds in the solar system, more than 2,000 kilometres per hour.",
      "Neptune was found with mathematics before anyone saw it through a telescope.",
      "Since it was discovered in 1846, Neptune has gone around the Sun only once.",
    ],
    orbit: { a: 30.06992276, e: 0.00859048, i: 1.77004347, node: 131.78422574, peri: 44.96476227, L0: 304.87997031, n: 0.00598103 },
    jump: "platform", jumpNote: "Neptune has no solid surface you could stand on, so this is an imaginary floating platform.",
  },
  {
    id: "pluto", name: "Pluto", kind: "pluto", type: "Dwarf planet", icon: "🤍", color: "#c9a98a",
    diameterKm: 2377, distanceText: "5.9 billion km (39.5 AU)", spinText: "6 Earth days, backwards!", spinHours: 153.3, retrograde: true,
    yearText: "248 Earth years", yearDays: 90560, moons: 5, gravity: 0.06, tempText: "−225 °C", lightText: "5 hours 30 minutes",
    tilt: 122.5, rings: false, fits: "Pluto is smaller than Earth's Moon.",
    facts: [
      "Pluto is a dwarf planet in the Kuiper Belt, far beyond Neptune.",
      "Pluto has a giant heart-shaped plain of ice called Tombaugh Regio.",
      "The New Horizons spacecraft flew past Pluto in 2015 and sent back the first close-up pictures.",
    ],
    orbit: { a: 39.48211675, e: 0.2488273, i: 17.14001206, node: 110.30393684, peri: 224.06891629, L0: 238.92903833, n: 0.00397558 },
    jump: "ground",
  },
];

export const BODY_BY_ID: Readonly<Record<BodyId, Body>> = Object.fromEntries(BODIES.map((b) => [b.id, b])) as Record<BodyId, Body>;

/** Days since the J2000 epoch (2000-01-01 12:00 UTC). */
export function daysSinceJ2000(date: Date) {
  return (date.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000;
}

const RAD = Math.PI / 180;

/** Solves Kepler's equation M = E − e·sin E (radians). */
export function eccentricAnomaly(M: number, e: number) {
  let E = e < 0.8 ? M : Math.PI;
  for (let k = 0; k < 12; k++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  return E;
}

/**
 * Heliocentric ecliptic position (AU) at `days` since J2000.
 * Returns x/y in the ecliptic plane and z above it.
 */
export function heliocentric(o: OrbitElements, days: number) {
  const L = o.L0 + o.n * days;
  const M = ((((L - o.peri) % 360) + 540) % 360 - 180) * RAD;
  const E = eccentricAnomaly(M, o.e);
  return orbitPoint(o, E);
}

/** Position on the orbit for eccentric anomaly E (radians). */
export function orbitPoint(o: OrbitElements, E: number) {
  const xp = o.a * (Math.cos(E) - o.e);
  const yp = o.a * Math.sqrt(1 - o.e * o.e) * Math.sin(E);
  const w = (o.peri - o.node) * RAD, W = o.node * RAD, i = o.i * RAD;
  const cw = Math.cos(w), sw = Math.sin(w), cW = Math.cos(W), sW = Math.sin(W), ci = Math.cos(i), si = Math.sin(i);
  return {
    x: (cw * cW - sw * sW * ci) * xp + (-sw * cW - cw * sW * ci) * yp,
    y: (cw * sW + sw * cW * ci) * xp + (-sw * sW + cw * cW * ci) * yp,
    z: sw * si * xp + cw * si * yp,
  };
}

/** Ecliptic longitude of the Moon around Earth (degrees), mean motion only. */
export function moonLongitude(days: number) {
  return (218.316 + 13.176396 * days) % 360;
}

/** How tall a jump would be on a world if the same jump reaches `earthHeight` metres on Earth. */
export function jumpOn(gravity: number, earthHeight = 0.5) {
  const g = 9.81 * gravity;
  const v0 = Math.sqrt(2 * 9.81 * earthHeight);
  return { v0, g, height: (v0 * v0) / (2 * g), airTime: (2 * v0) / g };
}

/** "If you were N on Earth, you would be X years old here." */
export function ageOn(body: Body, earthYears: number) {
  if (!body.yearDays || body.id === "moon") return null;
  return (earthYears * 365.256) / body.yearDays;
}
