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
export type UpgradeKey="rifle"|"armor"|"boots"|"drone";
export const UPGRADES:{key:UpgradeKey;name:string;detail:string;icon:string;color:string}[]=[
 {key:"rifle",name:"Arc Rifle",detail:"More damage and range",icon:"⌁",color:"#35e8ff"},
 {key:"armor",name:"Titan Weave",detail:"Reduce incoming damage",icon:"⬡",color:"#ffb238"},
 {key:"boots",name:"Flux Boots",detail:"Move and dash faster",icon:"↯",color:"#61ff9a"},
 {key:"drone",name:"Pulse Drone",detail:"Faster automatic support fire",icon:"◉",color:"#ff4fba"}
];
export const SPECIES:{key:Species;name:string;detail:string;color:string;icon:string}[]=[
 {key:"raptor",name:"Feathered Raptor",detail:"Fast pack hunter with a luminous feather crest.",color:"#61ff9a",icon:"R"},
 {key:"spitter",name:"Venom Spitter",detail:"Agile predator with a bright warning frill.",color:"#d9ff3f",icon:"S"},
 {key:"anky",name:"Ironhide Anky",detail:"Armored herbivore carrying a dangerous tail club.",color:"#ffb238",icon:"A"},
 {key:"trike",name:"Storm Triceratops",detail:"Heavy charger protected by a cyan shield frill.",color:"#35e8ff",icon:"T"},
 {key:"rex",name:"Crimson Tyrant",detail:"Massive apex predator with devastating close attacks.",color:"#ff4d62",icon:"X"}
];
