// The 12 v2.0.3 field contracts, preserved exactly (id, name, reserve, species,
// count, reward, time, weather, difficulty, brief), plus v3 licence and
// briefing data.

import type { TimeKey, WeatherKey } from "../world/environment.ts";

export const MISSIONS = [
  { id: 1, name: "First Tracks", reserve: "Aurora Pines", species: "Mule Deer", count: 1, reward: 90, time: "Dawn", weather: "Clear", difficulty: "Ranger", brief: "Follow fresh sign into the cedar flats and take one patient, clean vital shot — head or upper torso." },
  { id: 2, name: "Amber Trail", reserve: "Aurora Pines", species: "Wild Boar", count: 2, reward: 135, time: "Morning", weather: "Mist", difficulty: "Ranger+", brief: "Use the trail scanner through morning mist and locate the sounder before it catches your scent." },
  { id: 3, name: "Highland Echo", reserve: "Crimson Highlands", species: "Red Deer", count: 2, reward: 180, time: "Sunset", weather: "Wind", difficulty: "Tracker", brief: "Cross exposed ridges, read the wind and wait for the herd to settle before firing." },
  { id: 4, name: "Canyon Ghost", reserve: "Crimson Highlands", species: "Elk", count: 1, reward: 230, time: "Dusk", weather: "Clear", difficulty: "Tracker+", brief: "Track a mature elk through long canyon sightlines and make the first shot count." },
  { id: 5, name: "Emerald Silence", reserve: "Verdant Basin", species: "Mule Deer", count: 3, reward: 285, time: "Morning", weather: "Rain", difficulty: "Expert", brief: "Rain hides your movement but washes away old sign. Find the newest tracks and stalk slowly." },
  { id: 6, name: "Iron Tusks", reserve: "Verdant Basin", species: "Wild Boar", count: 3, reward: 350, time: "Night", weather: "Storm", difficulty: "Expert+", brief: "A storm has scattered several boar groups. Scan carefully and avoid rushing uncertain shots." },
  { id: 7, name: "Stone Crown", reserve: "Obsidian Steppe", species: "Bighorn Sheep", count: 2, reward: 430, time: "Dawn", weather: "Wind", difficulty: "Master", brief: "Climb the open steppe and use steady aim against small targets at longer range." },
  { id: 8, name: "Thunder Herd", reserve: "Obsidian Steppe", species: "Bison", count: 1, reward: 500, time: "Afternoon", weather: "Clear", difficulty: "Master+", brief: "Locate a lone mature bison at the herd edge and wait for a safe broadside angle." },
  { id: 9, name: "The Monarch", reserve: "Aurora Pines", species: "Elk", count: 2, reward: 560, time: "Snowrise", weather: "Snow", difficulty: "Legend", brief: "Snow reveals movement and footprints. Track two elk without spooking the whole herd." },
  { id: 10, name: "Red Horizon", reserve: "Crimson Highlands", species: "Bighorn Sheep", count: 3, reward: 640, time: "Sunset", weather: "Wind", difficulty: "Legend+", brief: "Long-range ridge work with heavy crosswind. Use breath control and optics together." },
  { id: 11, name: "Blackgrass Giant", reserve: "Obsidian Steppe", species: "Bison", count: 2, reward: 760, time: "Dusk", weather: "Storm", difficulty: "Warden", brief: "Two bison move through storm-dark grass. Stay outside the herd and pick clean angles." },
  { id: 12, name: "Horizon Grand Slam", reserve: "All Reserves", species: "Mixed", count: 4, reward: 950, time: "Dynamic", weather: "Dynamic", difficulty: "Mythic", brief: "A rotating reserve challenge: identify four different species, track them, and finish clean." },
] as const;

export type Mission = (typeof MISSIONS)[number];

/** v2.0.3 used these four species for the "Mixed" Grand Slam. */
export const GRAND_SLAM_SPECIES = ["Mule Deer", "Wild Boar", "Bighorn Sheep", "Elk"];

export function licensedFor(m: Mission): string[] { return m.species === "Mixed" ? [...GRAND_SLAM_SPECIES] : [m.species]; }
export function missionTime(m: Mission): TimeKey { return m.time as TimeKey; }
export function missionWeather(m: Mission): WeatherKey { return m.weather as WeatherKey; }

/** Briefing field notes shown on the contract card (v3). */
export const FIELD_NOTES: Record<number, string[]> = {
  1: ["Your first contract: the trailhead path leads toward a doe group feeding at dawn.", "Read tracks with F, pulse the Trail Scanner with E, and keep the wind in your face."],
  2: ["Boar have weak eyes but superb noses — mist hides you, the wind does not.", "Sounders root along the lake shore; look for churned ground."],
  3: ["Red stags roar at sunset in the rut. A caller (T) can bring one in.", "Ridgelines skyline you — crouch on the crest."],
  4: ["Dusk is short. Use the 6× optic early and range before the light fails.", "Elk run long when spooked; one clean shot is the job."],
  5: ["Rain masks footsteps, but old sign washes out. Trust the freshest prints.", "Three deer: reload between stalks and keep your breath for the shot."],
  6: ["Night storm: lightning lights the meadows for an instant. Boar feed in the open at night.", "Thunder startles game — use it to close distance."],
  7: ["Bighorn see movement over a kilometre. Move only when they graze, freeze when heads come up.", "Long range: hold over with the BDC marks."],
  8: ["A bison's vitals sit low and forward behind the massive shoulder.", "Never walk into the herd; the bulls will stare you down."],
  9: ["Snow shows every track. Fresh prints have crisp edges and no snow in them.", "Elk travel far after being bumped — don't push the herd."],
  10: ["Heavy crosswind: read the HUD wind and hold into it.", "Prone (Z) is the steadiest position you have."],
  11: ["Storm-dark grass: bison are huge but their vitals are not. Wait for broadside.", "Lightning flashes give you a range check."],
  12: ["Four different species from four reserves that meet at Horizon Crossing.", "Pines NW, Highlands NE, Basin SW, Steppe SE — each holds its own game."],
};

export const RESERVE_ORDER = ["Aurora Pines", "Crimson Highlands", "Verdant Basin", "Obsidian Steppe", "Horizon Crossing"];
