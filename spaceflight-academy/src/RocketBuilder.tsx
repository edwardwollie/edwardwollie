import type { CSSProperties } from "react";
import { STAT_INFO, type FlightMission, type FlightStats, type RocketPart, type StatKey } from "./flight-data";

export function RocketBuilder({mission,stats,history,launching}:{mission:FlightMission;stats:FlightStats;history:RocketPart[];launching:boolean}){
  const readiness=Math.round(Object.values(stats).reduce((sum,value)=>sum+value,0)/4),parts=history.slice(-7);
  return <section className="habitat-board rocket-board" style={{"--zone":mission.world.color} as CSSProperties} aria-label={mission.world.name+" spacecraft builder, "+readiness+" percent ready"}>
    <header><div><small>MISSION ASSEMBLY BAY</small><b>{mission.world.name}</b></div><span>{mission.world.icon}</span></header>
    <div className={"habitat-scene space-scene "+(launching?"launching":"")}>
      <div className="stars">✦ · ✧ · ✦ · ✧ · ✦</div><div className="planet-horizon">{mission.world.icon}</div>
      <div className="rocket-stack"><div className="nose">▲</div>{parts.length?parts.map((part,index)=><div className="rocket-part" key={part.id+"-"+index} title={part.name}><span>{part.icon}</span></div>):<div className="empty-rocket">SELECT<br/>PARTS</div>}<div className="flame">🔥</div></div>
      <div className="orbit-path"/><div className="telemetry"><small>OBJECTIVE</small><b>{mission.objective}</b></div>
      <div className="health-orb"><strong>{readiness}%</strong><small>FLIGHT READY</small></div>
    </div>
    <div className="stat-grid">{(Object.keys(STAT_INFO) as StatKey[]).map(key=><article key={key} className={key===mission.focus?"focus":""} style={{"--meter":STAT_INFO[key].color} as CSSProperties}><span>{STAT_INFO[key].icon}</span><div><small>{STAT_INFO[key].name}{key===mission.focus?" · FOCUS":""}</small><i><b style={{width:stats[key]+"%"}}/></i></div><strong>{stats[key]}</strong></article>)}</div>
  </section>;
}
