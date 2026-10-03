/**
 * Facts used by the destination activities. Written for ages 5–12 and kept to
 * long-standing science (no moon counts or dates that change often).
 */
export interface PhotoTarget {
  id: string;
  name: string;
  fact: string;
}

export const PHOTO_TARGETS: Record<string, PhotoTarget[]> = {
  jupiter: [
    { id: "jupiter-red-spot", name: "The Great Red Spot", fact: "The Great Red Spot is a giant storm on Jupiter that is wider than planet Earth and has been swirling for hundreds of years." },
    { id: "jupiter-io", name: "Io, the volcano moon", fact: "Io has more volcanoes than anywhere else in the solar system. Jupiter's pull squeezes Io and keeps it hot inside." },
    { id: "jupiter-europa", name: "Europa, the ice moon", fact: "Europa is covered in ice. Scientists think a salty ocean is hidden underneath!" },
  ],
  saturn: [
    { id: "saturn-rings", name: "Saturn's rings", fact: "Saturn's rings are made of billions of chunks of ice and rock — some as small as sand, some as big as a house." },
    { id: "saturn-titan", name: "Titan", fact: "Titan is Saturn's biggest moon. It has a thick orange sky and lakes of liquid methane." },
    { id: "saturn-cassini", name: "The Cassini Division", fact: "The dark gap in Saturn's rings is called the Cassini Division. It is so wide that our Moon could fit inside it." },
  ],
  uranus: [
    { id: "uranus-tilt", name: "Uranus on its side", fact: "Uranus spins tipped over on its side, so each pole gets about 42 years of sunlight and then 42 years of darkness." },
    { id: "uranus-rings", name: "Uranus's faint rings", fact: "Uranus has thin, dark rings that are much harder to see than Saturn's." },
    { id: "uranus-miranda", name: "Miranda", fact: "Miranda is a small moon of Uranus with giant cliffs, one of the tallest cliffs known in the solar system." },
  ],
  neptune: [
    { id: "neptune-dark-spot", name: "A Great Dark Spot", fact: "Neptune has had giant dark storms, and its winds are the fastest of any planet in the solar system." },
    { id: "neptune-triton", name: "Triton", fact: "Triton orbits Neptune backwards and has geysers that shoot nitrogen gas high above its icy surface." },
    { id: "neptune-blue", name: "Neptune's blue clouds", fact: "Neptune looks blue because methane gas in its air soaks up red light." },
  ],
};

export const ROCK_SAMPLES = [
  { id: "basalt", name: "Basalt", fact: "Basalt is a dark rock made from cooled lava. Mars has lots of it from ancient volcanoes." },
  { id: "clay", name: "Clay", fact: "Clay forms when water changes rock. Finding clay on Mars tells us water once flowed there." },
  { id: "hematite", name: "Hematite 'blueberries'", fact: "Tiny round hematite pebbles, nicknamed blueberries, formed in water long ago on Mars." },
];

export const ASTEROID_SAMPLES = [
  { id: "chondrule", name: "Chondrules", fact: "Chondrules are tiny melted beads from the very beginning of the solar system — older than any rock on Earth." },
  { id: "carbon", name: "Carbon-rich dust", fact: "Some asteroids are rich in carbon and water-bearing minerals — ingredients that may have helped make Earth's oceans." },
  { id: "metal", name: "Iron-nickel metal", fact: "Some asteroids are made of iron and nickel metal, like the cores of baby planets." },
];

export const LANDING_FACTS = {
  moon: "The Moon's gravity is about one sixth of Earth's, so the lander needs only a gentle push to slow down.",
  mars: "Mars has a thin atmosphere, so landers use a heat shield, a parachute and rockets — all three!",
};

export const ORBIT_FACT = "To stay in orbit you must fly sideways so fast that you keep falling around the Earth instead of into it — about 28,000 kilometres per hour!";
export const DOCK_FACT = "Spacecraft dock very slowly — about as fast as you walk — so the latches can catch gently.";
