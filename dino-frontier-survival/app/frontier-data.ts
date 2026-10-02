export type Species="raptor"|"spitter"|"anky"|"trike"|"rex";
export type Sector={id:number;name:string;biome:string;target:number;threat:number;reward:number;species:Species[];boss?:Species;color:string};
export const SECTORS:Sector[]=[
 {id:1,name:"First Contact",biome:"Fernlight Basin",target:12,threat:1,reward:130,species:["raptor"],color:"#61ff9a"},
 {id:2,name:"Acid Rain",biome:"Prism Marsh",target:16,threat:2,reward:170,species:["raptor","spitter"],color:"#d9ff3f"},
 {id:3,name:"Ironhide Trail",biome:"Copper Mesa",target:20,threat:3,reward:220,species:["raptor","anky"],color:"#ffb238"},
 {id:4,name:"Horned Stampede",biome:"Solar Grasslands",target:24,threat:4,reward:280,species:["raptor","trike"],color:"#35e8ff"},
 {id:5,name:"Apex Signal",biome:"Obsidian Jungle",target:28,threat:5,reward:360,species:["raptor","spitter","anky"],boss:"rex",color:"#ff4d62"},
 {id:6,name:"Crimson Migration",biome:"Ember Savannah",target:32,threat:6,reward:450,species:["raptor","trike","spitter"],color:"#ff6e3a"},
 {id:7,name:"Storm of Claws",biome:"Thunder Canopy",target:36,threat:7,reward:550,species:["raptor","anky","trike"],color:"#a56dff"},
 {id:8,name:"Titan Valley",biome:"Cobalt Highlands",target:40,threat:8,reward:670,species:["spitter","anky","trike"],boss:"rex",color:"#30d8ff"},
 {id:9,name:"Extinction Protocol",biome:"Quantum Crater",target:46,threat:9,reward:820,species:["raptor","spitter","anky","trike"],boss:"rex",color:"#ff4fba"},
 {id:10,name:"Frontier Crown",biome:"Apex Caldera",target:55,threat:10,reward:1100,species:["raptor","spitter","anky","trike","rex"],boss:"rex",color:"#ffe45b"}
];
export type UpgradeKey="rifle"|"armor"|"boots"|"drone"|"emp";
export const UPGRADES:{key:UpgradeKey;name:string;detail:string;icon:string;color:string}[]=[
 {key:"rifle",name:"Arc Rifle",detail:"More bolt damage and range",icon:"⌁",color:"#35e8ff"},
 {key:"armor",name:"Titan Weave",detail:"Reduce incoming damage",icon:"⬡",color:"#ffb238"},
 {key:"boots",name:"Flux Boots",detail:"Run, jump and dash further",icon:"↯",color:"#61ff9a"},
 {key:"drone",name:"Pulse Drone",detail:"Faster automatic support fire",icon:"◉",color:"#ff4fba"},
 {key:"emp",name:"Shock Core",detail:"Bigger, faster-charging EMP pulse",icon:"✺",color:"#a56dff"}
];
export const SPECIES:{key:Species;name:string;detail:string;color:string;icon:string;behavior:string}[]=[
 {key:"raptor",name:"Feathered Raptor",detail:"Fast pack hunter with a luminous feather crest.",color:"#61ff9a",icon:"R",behavior:"Packs flank you from both sides, then crouch and pounce. Keep moving and dash through the gap."},
 {key:"spitter",name:"Venom Spitter",detail:"Agile predator with a bright warning frill.",color:"#d9ff3f",icon:"S",behavior:"Holds its distance and lobs acid globs when its frill flares. Strafe sideways and avoid the puddles."},
 {key:"anky",name:"Ironhide Anky",detail:"Armored herbivore carrying a dangerous tail club.",color:"#ffb238",icon:"A",behavior:"Slow and heavily armored from the front. Spins its tail club when you get close, so flank it and back off when it flashes red."},
 {key:"trike",name:"Storm Triceratops",detail:"Heavy charger protected by a cyan shield frill.",color:"#35e8ff",icon:"T",behavior:"Paws the ground, then charges in a straight line. Sidestep the rush and punish it while it's stunned."},
 {key:"rex",name:"Crimson Tyrant",detail:"Massive apex predator with devastating close attacks.",color:"#ff4d62",icon:"X",behavior:"Bites up close, roars to slow you, and stomps out a shockwave ring. Jump over the ring."}
];
export const STATS:Record<Species,{hp:number;speed:number;damage:number}>={raptor:{hp:34,speed:4.6,damage:8},spitter:{hp:48,speed:3.6,damage:11},anky:{hp:115,speed:2.2,damage:16},trike:{hp:140,speed:2.7,damage:19},rex:{hp:520,speed:2.6,damage:27}};
