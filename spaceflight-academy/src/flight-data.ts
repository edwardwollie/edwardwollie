export type AgePath="5–7"|"8–10"|"11–12";
export type StatKey="thrust"|"fuel"|"stability"|"mission";
export type FlightStats=Record<StatKey,number>;
export type RocketPart={id:string;name:string;icon:string;cost:number;minAge:AgePath;effects:Partial<FlightStats>;category:string;fact:string};
export const STAT_INFO:Record<StatKey,{name:string;icon:string;color:string}>={
  thrust:{name:"Thrust",icon:"🔥",color:"#ff9a4e"},fuel:{name:"Fuel & Energy",icon:"⛽",color:"#ffd95a"},stability:{name:"Stability & Safety",icon:"🛡️",color:"#62e8ff"},mission:{name:"Mission Systems",icon:"🛰️",color:"#d579ff"},
};
export const WORLDS=[
  {name:"Launch Deck",icon:"🚀",color:"#62e8ff",detail:"Forces, countdowns, engines, and stable flight"},
  {name:"Orbital School",icon:"🌍",color:"#68ffba",detail:"Gravity, speed, orbits, solar energy, and communication"},
  {name:"Moon Base",icon:"🌙",color:"#d7d9e8",detail:"Landing, surface travel, habitats, and samples"},
  {name:"Mars Canyon",icon:"🔴",color:"#ff7b5d",detail:"Long journeys, heat shields, rovers, and life support"},
  {name:"Asteroid Route",icon:"☄️",color:"#ffd95a",detail:"Navigation, low gravity, resources, and precise maneuvers"},
  {name:"Outer Worlds",icon:"🪐",color:"#d579ff",detail:"Deep-space energy, communication delays, probes, and discovery"},
] as const;
export const ROCKET_PARTS:RocketPart[]=[
  {id:"engine",name:"Mount Main Engine",icon:"🔥",cost:3,minAge:"5–7",effects:{thrust:24,fuel:5},category:"Propulsion",fact:"A rocket engine pushes hot exhaust backward, and the equal opposite force pushes the rocket forward."},
  {id:"tank",name:"Add Fuel Tank",icon:"⛽",cost:2,minAge:"5–7",effects:{fuel:22,thrust:4},category:"Energy",fact:"Rocket propellant carries stored chemical energy and the material needed for an engine to make fast exhaust."},
  {id:"fins",name:"Fit Stability Fins",icon:"🔺",cost:2,minAge:"5–7",effects:{stability:20,thrust:3},category:"Control",fact:"Fins help a rocket point steadily while it moves through the lower atmosphere."},
  {id:"computer",name:"Program Guidance",icon:"🧭",cost:2,minAge:"5–7",effects:{stability:13,mission:14},category:"Navigation",fact:"Guidance computers compare the planned path with sensor measurements and command corrections."},
  {id:"parachute",name:"Pack Parachute",icon:"🪂",cost:2,minAge:"5–7",effects:{stability:19,mission:5},category:"Recovery",fact:"A parachute creates drag, slowing a capsule so it can return safely through an atmosphere."},
  {id:"antenna",name:"Connect Antenna",icon:"📡",cost:2,minAge:"5–7",effects:{mission:18,stability:5},category:"Communication",fact:"Antennas send and receive radio waves so spacecraft and mission control can share data."},
  {id:"solar",name:"Deploy Solar Array",icon:"☀️",cost:3,minAge:"8–10",effects:{fuel:18,mission:15},category:"Energy",fact:"Solar cells change sunlight into electrical energy for computers, instruments, heaters, and communication."},
  {id:"shield",name:"Install Heat Shield",icon:"🛡️",cost:3,minAge:"8–10",effects:{stability:25,mission:4},category:"Protection",fact:"A heat shield absorbs and carries away intense heat during fast atmospheric entry."},
  {id:"habitat",name:"Add Life-Support Cabin",icon:"🫧",cost:3,minAge:"11–12",effects:{mission:20,fuel:8,stability:7},category:"Crew",fact:"Life support controls air, water, temperature, pressure, and waste so a crew can live safely."},
  {id:"booster",name:"Attach Booster Stage",icon:"🚀",cost:3,minAge:"11–12",effects:{thrust:22,fuel:10,stability:2},category:"Staging",fact:"Staging drops empty hardware so the remaining rocket has less mass to accelerate."},
  {id:"lander",name:"Fit Landing Legs",icon:"🕷️",cost:3,minAge:"11–12",effects:{stability:18,mission:14},category:"Landing",fact:"Landing legs spread impact forces and help a spacecraft remain upright on uneven ground."},
  {id:"lab",name:"Load Science Module",icon:"🔬",cost:3,minAge:"11–12",effects:{mission:25,fuel:3},category:"Science",fact:"A science payload uses cameras and sensors to turn a journey into measurements that answer questions."},
];
const rank:Record<AgePath,number>={"5–7":0,"8–10":1,"11–12":2};
export function availableParts(age:AgePath){return ROCKET_PARTS.filter(part=>rank[part.minAge]<=rank[age])}
export type FlightMission={level:number;world:typeof WORLDS[number];focus:StatKey;start:FlightStats;target:number;scoreGoal:number;energy:number;brief:string;tip:string;objective:string};
export function makeFlightMission(age:AgePath,level:number):FlightMission{
  const safe=Math.max(1,Math.min(30,level)),zone=Math.floor((safe-1)/5),world=WORLDS[zone];
  const focuses:StatKey[]=["thrust","fuel","stability","mission"],focus=safe%5===0?"stability":focuses[(safe+zone)%4];
  const start:FlightStats={thrust:22+(safe*4)%12,fuel:23+(safe*5)%11,stability:24+(safe*3)%10,mission:20+(safe*2)%13};
  start[focus]=Math.max(12,start[focus]-9-zone);
  const target=56+zone*4+(safe%5===0?3:0),scoreGoal=Object.values(start).reduce((sum,value)=>sum+value,0)+73+zone*4;
  const energy=(age==="5–7"?18:age==="8–10"?17:16)+(safe<=5?2:0);
  const briefs=[
    "Choose rocket parts for the mission, watch the readiness meters, and learn why every system matters.",
    "Balance propulsion, energy, stability, and mission equipment while staying inside the build budget.",
    "Engineer a mass-conscious spacecraft plan that can accelerate, navigate, survive, communicate, and collect useful data.",
  ];
  const tips:Record<StatKey,string>={
    thrust:"Increase exhaust performance or reduce carried mass; thrust must overcome weight during liftoff.",
    fuel:"Store enough energy for the planned changes in speed, then add a dependable source for mission electricity.",
    stability:"Use guidance, recovery, and protection systems so the vehicle remains controlled through every phase.",
    mission:"Add navigation, communication, crew, landing, or science systems that directly serve the objective.",
  };
  const objectives=["Reach the target altitude","Enter a stable orbit","Deliver the exploration module","Land and return safely","Transmit the discovery data"];
  return{level:safe,world,focus,start,target,scoreGoal,energy,brief:briefs[rank[age]],tip:tips[focus],objective:objectives[(safe-1)%objectives.length]};
}
export function applyRocketPart(stats:FlightStats,part:RocketPart):FlightStats{return(Object.keys(stats) as StatKey[]).reduce((next,key)=>({...next,[key]:Math.min(100,next[key]+(part.effects[key]??0))}),{...stats})}
export function readinessScore(stats:FlightStats){return Object.values(stats).reduce((sum,value)=>sum+value,0)}
export function missionComplete(mission:FlightMission,stats:FlightStats){return stats[mission.focus]>=mission.target&&readinessScore(stats)>=mission.scoreGoal}
export const FLIGHT_SUMMARY={paths:3,missionsPerPath:30,worlds:WORLDS.length,parts:ROCKET_PARTS.length,skills:["forces","thrust","fuel","mass","stability","gravity","orbits","energy","navigation","communication","life support","landing","planetary science"]};
