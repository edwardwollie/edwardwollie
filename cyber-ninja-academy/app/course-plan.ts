import type {Mission} from "./ninja-data";

export type Lane=-1|0|1;
export type HazardKind="barrier"|"beam"|"wall"|"spike"|"sweep"|"crusher";
export type BonusKind="shard"|"drone";
export type Hazard={kind:HazardKind;lane:Lane};
export type Wave={z:number;hazards:Hazard[]};
export type Bonus={z:number;kind:BonusKind;lane:Lane};

function seeded(seed:number){let state=seed>>>0;return()=>{state=(state*1664525+1013904223)>>>0;return state/0x100000000}}
const LANES:Lane[]=[-1,0,1];
const ACTIONS:HazardKind[]=["barrier","beam","spike","sweep"];
const PICKS:HazardKind[]=["barrier","beam","wall","spike","sweep","crusher"];

export function planCourse(mission:Mission):{waves:Wave[];bonuses:Bonus[]}{
  const rnd=seeded(41000+mission.id*733);
  const difficulty=(mission.id-1)/11;
  const first=48,last=mission.distance-48;
  const step=(last-first)/(mission.hazards-1);
  const waves:Wave[]=[];
  for(let i=0;i<mission.hazards;i++){
    const jitter=i===0||i===mission.hazards-1?0:(rnd()-.5)*3.5;
    const z=first+i*step+jitter;
    const lane=LANES[Math.floor(rnd()*3)];
    let hazards:Hazard[];
    if(i===0)hazards=[{kind:"barrier",lane:0}];
    else if(i===1)hazards=[{kind:"beam",lane:0}];
    else if(i===2)hazards=[{kind:"wall",lane:0}];
    else{
      const available=mission.id===1?PICKS.slice(0,5):PICKS;
      const kind=available[(i+mission.id+Math.floor(rnd()*available.length))%available.length];
      const fullChance=i>=7?(mission.id>=3?.06+difficulty*.30:0):0;
      const pairChance=.22+difficulty*.20;
      const roll=rnd();
      if(roll<fullChance){
        // A full gate always has one action lane. It never demands a strike
        // or a bonus pickup to remain alive.
        const action=ACTIONS[Math.floor(rnd()*ACTIONS.length)];
        hazards=LANES.map(l=>({kind:l===lane?action:(rnd()<.5?"wall":"crusher"),lane:l}));
      }else if(roll<fullChance+pairChance){
        const second=LANES[(LANES.indexOf(lane)+1+Math.floor(rnd()*2))%3];
        hazards=[{kind,lane},{kind:available[Math.floor(rnd()*available.length)],lane:second}];
      }else hazards=[{kind,lane}];
    }
    waves.push({z,hazards});
  }
  const bonusKinds:BonusKind[]=[
    ...Array.from({length:mission.shards},()=>"shard" as const),
    ...Array.from({length:mission.drones},()=>"drone" as const),
  ];
  for(let i=bonusKinds.length-1;i>0;i--){
    const j=Math.floor(rnd()*(i+1));[bonusKinds[i],bonusKinds[j]]=[bonusKinds[j],bonusKinds[i]];
  }
  const bonuses=bonusKinds.map((kind,i)=>{
    const slot=Math.floor((i+1)*waves.length/(bonusKinds.length+1));
    return {kind,lane:LANES[Math.floor(rnd()*3)],z:(waves[slot-1].z+waves[slot].z)/2};
  }).sort((a,b)=>a.z-b.z);
  return {waves,bonuses};
}
