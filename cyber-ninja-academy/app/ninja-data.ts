export type Mission={id:number;name:string;zone:string;distance:number;hazards:number;shards:number;drones:number;reward:number;rank:string;color:string};
export const MISSIONS:Mission[]=[
  {id:1,name:"Neon Initiation",zone:"Academy Roofs",distance:620,hazards:22,shards:4,drones:1,reward:100,rank:"Initiate",color:"#27efff"},
  {id:2,name:"Laser Alley",zone:"Academy Roofs",distance:760,hazards:27,shards:5,drones:1,reward:140,rank:"Initiate+",color:"#ff4eb8"},
  {id:3,name:"Drone District",zone:"Circuit Ward",distance:880,hazards:32,shards:5,drones:2,reward:190,rank:"Runner",color:"#a970ff"},
  {id:4,name:"Skyrail Pursuit",zone:"Circuit Ward",distance:980,hazards:36,shards:6,drones:2,reward:240,rank:"Runner+",color:"#ffb632"},
  {id:5,name:"Ghost Protocol",zone:"Mirage Sector",distance:1100,hazards:41,shards:6,drones:2,reward:300,rank:"Shinobi",color:"#6cff72"},
  {id:6,name:"Vertical Limit",zone:"Mirage Sector",distance:1200,hazards:45,shards:7,drones:3,reward:360,rank:"Shinobi+",color:"#27efff"},
  {id:7,name:"Crimson Firewall",zone:"Ember Spire",distance:1320,hazards:50,shards:7,drones:3,reward:430,rank:"Master",color:"#ff435f"},
  {id:8,name:"Zero Gravity",zone:"Ember Spire",distance:1450,hazards:55,shards:8,drones:3,reward:510,rank:"Master+",color:"#ffcf3d"},
  {id:9,name:"Titan Network",zone:"Apex Citadel",distance:1580,hazards:60,shards:8,drones:4,reward:600,rank:"Elite",color:"#b655ff"},
  {id:10,name:"Quantum Siege",zone:"Apex Citadel",distance:1720,hazards:66,shards:9,drones:4,reward:700,rank:"Elite+",color:"#34ffd0"},
  {id:11,name:"Shadow Ascendant",zone:"Void Crown",distance:1880,hazards:72,shards:10,drones:4,reward:820,rank:"Legend",color:"#ff4eb8"},
  {id:12,name:"The Final Gate",zone:"Void Crown",distance:2100,hazards:80,shards:12,drones:5,reward:1000,rank:"Apex Ninja",color:"#cfff45"},
];
export type UpgradeKey="agility"|"armor"|"blade";
export const UPGRADES:{key:UpgradeKey;name:string;detail:string;icon:string}[]=[
  {key:"agility",name:"Flux Boots",detail:"Higher jumps and faster lane shifts",icon:"↯"},
  {key:"armor",name:"Shadow Weave",detail:"Extra integrity",icon:"⬡"},
  {key:"blade",name:"Photon Edge",detail:"Wider optional drone strike",icon:"◇"},
];
