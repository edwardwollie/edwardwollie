import { G, P, S, dish, starOutline } from "./kit.ts";
import type { Blueprint, MatSpec } from "./types.ts";

const DISH: MatSpec = { color: "#eef2f8", roughness: 0.35, metalness: 0.2, doubleSide: true };
const DOME: MatSpec = { color: "#f4f7fb", roughness: 0.45, metalness: 0.05 };

export const moonBase: Blueprint = {
  id: "moon-base", code: "D-01", name: "Moon Base Tranquility", category: "destination", subtitle: "Moon Base missions · landing target",
  description: "The Academy's Moon base: three connected domes for living, working and growing plants, a solar farm that follows the Sun, a tall radio tower that talks to Earth, and the glowing landing pad where Moon Hopper touches down.",
  overall: { w: 28.7, h: 9.48, d: 24.75 },
  materials: { dish: DISH, dome: DOME },
  parts: [
    G("pad", [
      P("slab", S.cyl(5.2, 0.3, 5.4, 40), "concrete", { name: "Landing pad", at: [0, 0.15, 0] }),
      P("ring", S.disc(4.8, 4.4, 48), "goldGlow", { at: [0, 0.31, 0], rot: [-90, 0, 0] }),
      P("star", S.ext(starOutline(2.6, 1.1), 0.04, 0), "cyanGlow", { at: [0, 0.32, 0], rot: [-90, 0, 0] }),
      P("light", S.sph(0.22), "greenGlow", { at: [5.0, 0.4, 0], radial: { count: 8, offsetDeg: 22.5 } }),
    ], { at: [0, 0, 7.5], tag: "landingPad" }),
    G("domeA", [
      P("shell", S.dome(4.2, 90, 40), "dome", { name: "Habitat dome" }),
      P("rib", S.tor(4.2, 0.09, 180, 40), "silver", { rot: [0, 0, 0], radial: { count: 3, offsetDeg: 0 } }),
      P("base", S.tor(4.2, 0.18, 360, 48), "royal", { rot: [90, 0, 0] }),
      P("door", S.box(1.6, 2.2, 0.6, 0.2), "magenta", { at: [0, 1.1, 4.0] }),
      P("window", S.disc(0.6), "window", { at: [-2.0, 2.6, 3.1], rot: [-35, -30, 0] }),
    ], { at: [-8, 0, -5] }),
    G("domeB", [
      P("shell", S.dome(3.2, 90, 40), "dome", { name: "Lab dome" }),
      P("rib", S.tor(3.2, 0.08, 180, 40), "silver", { radial: { count: 3, offsetDeg: 30 } }),
      P("base", S.tor(3.2, 0.15, 360, 48), "royal", { rot: [90, 0, 0] }),
    ], { at: [1.0, 0, -8.5] }),
    G("greenhouse", [
      P("shell", S.dome(2.8, 90, 32), "glass", { name: "Greenhouse dome" }),
      P("plants", { kind: "cluster", balls: [[0.8, 0.5, 0.3, 0.6], [-0.7, 0.45, -0.4, 0.55], [0, 0.6, -1.0, 0.65], [0.1, 0.4, 0.9, 0.45]] }, "leaf"),
      P("base", S.tor(2.8, 0.14, 360, 40), "royal", { rot: [90, 0, 0] }),
    ], { at: [8.5, 0, -6.0] }),
    P("tunnelA", S.cyl(0.85, 6.0, 0.85, 20), "pearl", { name: "Connecting tunnel", at: [-3.2, 0.85, -6.8], rot: [0, 0, 90] }),
    P("tunnelB", S.cyl(0.85, 4.7, 0.85, 20), "pearl", { at: [5.2, 0.85, -7.2], rot: [0, 0, 90] }),
    G("solar", [
      P("post", S.cyl(0.12, 2.2), "gunmetal", { at: [0, 1.1, 0] }),
      P("panel", S.box(3.2, 0.08, 2.0, 0.02), "solarCell", { name: "Sun-tracking solar panel", at: [0, 2.3, 0], rot: [-30, 0, 0] }),
    ], { at: [12.5, 0, 3.0] }),
    G("solar2", [
      P("post", S.cyl(0.12, 2.2), "gunmetal", { at: [0, 1.1, 0] }),
      P("panel", S.box(3.2, 0.08, 2.0, 0.02), "solarCell", { at: [0, 2.3, 0], rot: [-30, 0, 0] }),
    ], { at: [12.5, 0, 6.8] }),
    G("solar3", [
      P("post", S.cyl(0.12, 2.2), "gunmetal", { at: [0, 1.1, 0] }),
      P("panel", S.box(3.2, 0.08, 2.0, 0.02), "solarCell", { at: [0, 2.3, 0], rot: [-30, 0, 0] }),
    ], { at: [12.5, 0, 10.6] }),
    G("tower", [
      P("mast", S.cyl(0.16, 8.0, 0.32, 8), "silver", { name: "Radio tower", at: [0, 4.0, 0] }),
      P("reflector", S.lathe(dish(1.1, 0.35).map(([r, y]) => [r, 0.35 - y] as [number, number]), 28), "dish", { at: [0, 8.2, 0.1], rot: [-55, 0, 0] }),
      P("beacon", S.sph(0.18), "redGlow", { at: [0, 8.05, 0], tag: "beacon" }),
    ], { at: [-13.5, 0, 4.0] }),
    G("flag", [
      P("pole", S.cyl(0.05, 3.0), "silver", { at: [0, 1.5, 0] }),
      P("arm", S.cyl(0.03, 1.5), "silver", { at: [0.75, 2.9, 0], rot: [0, 0, 90] }),
      P("cloth", S.label("★ ACADEMY", 1.5, 0.9, "#ffffff", "#2f63e0"), "white", { name: "Academy flag", at: [0.75, 2.4, 0] }),
    ], { at: [-5.5, 0, 6.0] }),
  ],
  facts: ["The Moon has no air to breathe, so a Moon base must be sealed tight and carry its own oxygen.", "A day on the Moon (sunrise to sunrise) lasts about 29.5 Earth days."],
};

export const marsOutpost: Blueprint = {
  id: "mars-outpost", code: "D-02", name: "Mars Canyon Outpost", category: "destination", subtitle: "Mars Canyon missions · rover garage",
  description: "A small science outpost at the edge of a giant Martian canyon. Dusty the rover parks in the garage, the weather mast measures dust storms, and the inflatable habitat keeps scientists warm in air that is mostly carbon dioxide.",
  overall: { w: 21.7, h: 5.48, d: 10.8 },
  materials: { dish: DISH, dome: { color: "#f6efe8", roughness: 0.5 } },
  parts: [
    P("hab", S.cap(2.6, 6.0, 32), "dome", { name: "Inflatable habitat", at: [-4, 2.6, 0], rot: [0, 0, 90] }),
    P("habBand", S.tor(2.62, 0.12, 360, 40), "orange", { at: [-4, 2.6, 0], rot: [0, 90, 0] }),
    P("habWindow", S.disc(0.55), "window", { at: [-2.2, 3.2, 2.5], rot: [-20, 0, 0] }),
    P("airlock", S.cyl(1.0, 2.0, 1.0, 20), "pearl", { name: "Airlock", at: [-4, 1.0, 3.3], rot: [90, 0, 0] }),
    G("garage", [
      P("body", S.box(5.0, 3.4, 6.0, 0.3), "pearl", { name: "Rover garage" }),
      P("door", S.box(3.6, 2.6, 0.1, 0.1), "orange", { at: [0, -0.3, 3.02] }),
      P("stripe", S.box(5.04, 0.3, 6.04), "royal", { at: [0, 1.3, 0] }),
    ], { at: [5.5, 1.7, 0.5] }),
    G("weather", [
      P("mast", S.cyl(0.08, 5.0), "silver", { name: "Weather mast", at: [0, 2.5, 0] }),
      P("vane", S.box(0.8, 0.1, 0.25), "orange", { at: [0.3, 4.8, 0] }),
      P("cups", S.sph(0.12), "white", { at: [0.5, 5.1, 0], radial: { count: 3 } }),
    ], { at: [10.5, 0, -4.5] }),
    P("solarDeck", S.box(6.0, 0.1, 3.0, 0.02), "solarCell", { name: "Solar mat", at: [-3.5, 0.06, -5.0] }),
    G("antenna", [
      P("post", S.cyl(0.15, 2.4), "gunmetal", { at: [0, 1.2, 0] }),
      P("reflector", S.lathe(dish(1.0, 0.3).map(([r, y]) => [r, 0.3 - y] as [number, number]), 28), "dish", { at: [0, 2.6, 0], rot: [-40, 0, 0] }),
    ], { at: [-9.5, 0, -3.0] }),
  ],
  facts: ["Mars's air is very thin and mostly carbon dioxide, so explorers would need spacesuits outdoors.", "Valles Marineris, the giant canyon on Mars, is long enough to stretch across the United States."],
};

export const DESTINATION_BLUEPRINTS: readonly Blueprint[] = [moonBase, marsOutpost];
