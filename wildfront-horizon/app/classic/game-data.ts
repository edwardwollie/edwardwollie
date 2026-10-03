export const MISSIONS = [
  { id:1,name:"First Tracks",reserve:"Aurora Pines",species:"Mule Deer",count:1,reward:90,time:"Dawn",weather:"Clear",difficulty:"Ranger",brief:"Follow fresh sign into the cedar flats and take one patient, clean vital shot — head or upper torso." },
  { id:2,name:"Amber Trail",reserve:"Aurora Pines",species:"Wild Boar",count:2,reward:135,time:"Morning",weather:"Mist",difficulty:"Ranger+",brief:"Use the trail scanner through morning mist and locate the sounder before it catches your scent." },
  { id:3,name:"Highland Echo",reserve:"Crimson Highlands",species:"Red Deer",count:2,reward:180,time:"Sunset",weather:"Wind",difficulty:"Tracker",brief:"Cross exposed ridges, read the wind and wait for the herd to settle before firing." },
  { id:4,name:"Canyon Ghost",reserve:"Crimson Highlands",species:"Elk",count:1,reward:230,time:"Dusk",weather:"Clear",difficulty:"Tracker+",brief:"Track a mature elk through long canyon sightlines and make the first shot count." },
  { id:5,name:"Emerald Silence",reserve:"Verdant Basin",species:"Mule Deer",count:3,reward:285,time:"Morning",weather:"Rain",difficulty:"Expert",brief:"Rain hides your movement but washes away old sign. Find the newest tracks and stalk slowly." },
  { id:6,name:"Iron Tusks",reserve:"Verdant Basin",species:"Wild Boar",count:3,reward:350,time:"Night",weather:"Storm",difficulty:"Expert+",brief:"A storm has scattered several boar groups. Scan carefully and avoid rushing uncertain shots." },
  { id:7,name:"Stone Crown",reserve:"Obsidian Steppe",species:"Bighorn Sheep",count:2,reward:430,time:"Dawn",weather:"Wind",difficulty:"Master",brief:"Climb the open steppe and use steady aim against small targets at longer range." },
  { id:8,name:"Thunder Herd",reserve:"Obsidian Steppe",species:"Bison",count:1,reward:500,time:"Afternoon",weather:"Clear",difficulty:"Master+",brief:"Locate a lone mature bison at the herd edge and wait for a safe broadside angle." },
  { id:9,name:"The Monarch",reserve:"Aurora Pines",species:"Elk",count:2,reward:560,time:"Snowrise",weather:"Snow",difficulty:"Legend",brief:"Snow reveals movement and footprints. Track two elk without spooking the whole herd." },
  { id:10,name:"Red Horizon",reserve:"Crimson Highlands",species:"Bighorn Sheep",count:3,reward:640,time:"Sunset",weather:"Wind",difficulty:"Legend+",brief:"Long-range ridge work with heavy crosswind. Use breath control and optics together." },
  { id:11,name:"Blackgrass Giant",reserve:"Obsidian Steppe",species:"Bison",count:2,reward:760,time:"Dusk",weather:"Storm",difficulty:"Warden",brief:"Two bison move through storm-dark grass. Stay outside the herd and pick clean angles." },
  { id:12,name:"Horizon Grand Slam",reserve:"All Reserves",species:"Mixed",count:4,reward:950,time:"Dynamic",weather:"Dynamic",difficulty:"Mythic",brief:"A rotating reserve challenge: identify four different species, track them, and finish clean." },
] as const;

export const UPGRADE_INFO={
  optics:{label:"Quantum Optics",detail:"Less sway + stronger scope zoom",icon:"◎"},
  stability:{label:"Kinetic Stock",detail:"Longer steady-breath control + faster reload",icon:"⌁"},
  tracking:{label:"Trail Scanner",detail:"Longer scans + brighter fresh sign",icon:"◇"}
} as const;

export type UpgradeKey=keyof typeof UPGRADE_INFO;
export type Mission=(typeof MISSIONS)[number];
