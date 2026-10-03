/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {HuntEngine} from "./hunt-engine";
import {MISSIONS,UPGRADE_INFO,type UpgradeKey} from "./game-data";

type Save={unlocked:number;credits:number;stars:Record<number,number>;upgrades:Record<UpgradeKey,number>;tutorial:boolean};
const fresh:Save={unlocked:1,credits:120,stars:{},upgrades:{optics:0,stability:0,tracking:0},tutorial:false};
const steps=[
 {icon:"⌨",title:"STALK THE RESERVE",copy:"WASD moves. Use the mouse—or drag the view on touch devices—to scan the terrain. Moving while scoped is intentionally slower."},
 {icon:"◇",title:"READ FRESH SIGN",copy:"Press E or SCAN to pulse the Trail Scanner. Fresh footprints brighten and help you locate moving herds."},
 {icon:"◎",title:"USE THE OPTIC",copy:"Press Q to cycle 1× → 3× → 6×. The scope now shows target range, wind, animal state and zoom."},
 {icon:"◌",title:"STEADY YOUR BREATH",copy:"While scoped, hold SHIFT or the STEADY button. Sway drops sharply, but breath stamina is limited and must recover."},
 {icon:"✦",title:"SHOT GRADES",copy:"Headshots are vital and earn PERFECT. Clean chest or shoulder vital hits earn GREAT. Solid body hits earn GOOD and visibly stagger the animal."}
];

export default function WildfrontGame(){
 const canvas=useRef<HTMLCanvasElement>(null),engine=useRef<HuntEngine|null>(null);
 const [save,setSave]=useState<Save>(fresh),[selected,setSelected]=useState(0),[screen,setScreen]=useState<"menu"|"tutorial"|"hunt"|"complete">("menu"),[loaded,setLoaded]=useState(false);
 const [hud,setHud]=useState<any>({ammo:5,reserve:15,score:0,target:"0/1",wind:"0.0",scan:100,scoped:false,zoom:"1×",steady:100,steadyActive:false,range:"—",species:"NO TARGET",state:"SCANNING",shotFeedback:"",shotLabel:""});
 const [toast,setToast]=useState<any>(null),[stats,setStats]=useState<any>(null),[tutorialStep,setTutorialStep]=useState(0);const mission=MISSIONS[selected];
 useEffect(()=>{try{const s=localStorage.getItem("wildfront-save-v1");if(s)setSave({...fresh,...JSON.parse(s)})}catch{}setLoaded(true)},[]);
 useEffect(()=>{if(loaded)localStorage.setItem("wildfront-save-v1",JSON.stringify(save))},[save,loaded]);
 const message=useCallback((text:string,kind:string)=>{setToast({text,kind});setTimeout(()=>setToast(null),2300)},[]),complete=useCallback((s:any)=>{setStats(s);setScreen("complete")},[]);
 useEffect(()=>{if(screen!=="hunt"||!canvas.current)return;const h=new HuntEngine(canvas.current,mission as any,save.upgrades,{onHud:setHud,onMessage:message,onComplete:complete});engine.current=h;return()=>{h.destroy();engine.current=null}},[screen,mission,save.upgrades,message,complete]);
 const begin=()=>save.tutorial?setScreen("hunt"):(setTutorialStep(0),setScreen("tutorial"));
 const finishTutorial=()=>{setSave(s=>({...s,tutorial:true}));setScreen("hunt")};
 const claim=()=>{const stars=stats?.accuracy>=80?3:stats?.accuracy>=50?2:1;setSave(s=>({...s,credits:s.credits+mission.reward,unlocked:Math.min(MISSIONS.length,Math.max(s.unlocked,mission.id+1)),stars:{...s.stars,[mission.id]:Math.max(s.stars[mission.id]||0,stars)}}));setScreen("menu")};
 const buy=(k:UpgradeKey)=>{const level=save.upgrades[k],cost=120*(level+1);if(level>=3||save.credits<cost)return;setSave(s=>({...s,credits:s.credits-cost,upgrades:{...s.upgrades,[k]:level+1}}))};
 if(!loaded)return <main className="loading">CALIBRATING WILDFRONT 2.0…</main>;
 return <main className={`game-shell ${screen}`}>
 {screen==="menu"&&<>
  <header><div className="brand"><span className="brand-mark">W</span><div><b>WILDFRONT</b><small>HORIZON // FIELD SYSTEM 2.0</small></div></div><div className="classic-actions">
    {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full page load hands over from the Babylon classic engine to the 3D edition */}
    <a className="to3d" href="/">PLAY 3D EDITION →</a><div className="credits">◆ {save.credits}</div></div></header>
  <section className="hero"><div className="eyebrow">LIVING RESERVES // ADVANCED TRACKING SYSTEM</div><h1>READ THE LAND.<br/><em>MOVE WITH IT.</em></h1><p>Track living herds, read fresh sign, control your breathing and master twelve cinematic field missions across four distinct reserves.</p><button className="primary" onClick={begin}>ENTER RESERVE <span>→</span></button><div className="hero-stats"><span><b>04</b> RESERVES</span><span><b>12</b> MISSIONS</span><span><b>{Object.values(save.stars).reduce((a,b)=>a+b,0)}</b> STARS</span></div></section>
  <section className="command"><div className="missions"><div className="section-title"><span>FIELD CONTRACTS</span><small>{save.unlocked}/{MISSIONS.length} UNLOCKED</small></div>{MISSIONS.map((m,i)=><button key={m.id} disabled={m.id>save.unlocked} onClick={()=>setSelected(i)} className={selected===i?"active":""}><i>{String(m.id).padStart(2,"0")}</i><span><b>{m.name}</b><small>{m.reserve} · {m.species}</small></span><strong>{m.id>save.unlocked?"LOCKED":`${"★".repeat(save.stars[m.id]||0)}${"☆".repeat(3-(save.stars[m.id]||0))}`}</strong></button>)}</div>
   <aside><div className="mission-art"><div className="rings"/><span>{mission.weather} {"//"} {mission.time}</span><b>{mission.species}</b></div><div className="mission-detail"><small>SELECTED CONTRACT</small><h2>{mission.name}</h2><p className="mission-brief">{mission.brief}</p><div><span>DIFFICULTY <b>{mission.difficulty}</b></span><span>OBJECTIVE <b>{mission.count} CLEAN</b></span><span>REWARD <b>◆ {mission.reward}</b></span></div></div><div className="upgrades"><small>FIELD KIT</small>{(Object.keys(UPGRADE_INFO) as UpgradeKey[]).map(k=>{const u=UPGRADE_INFO[k],lvl=save.upgrades[k],cost=120*(lvl+1);return <button key={k} onClick={()=>buy(k)} disabled={lvl>=3||save.credits<cost}><i>{u.icon}</i><span><b>{u.label}</b><small>{u.detail}</small></span><strong>{lvl>=3?"MAX":`◆ ${cost}`}<em>{"●".repeat(lvl)}{"○".repeat(3-lvl)}</em></strong></button>})}</div></aside>
  </section></>}
 {screen==="tutorial"&&<div className="tutorial"><div className="tutorial-card"><small>FIELD TRAINING // {tutorialStep+1} OF {steps.length}</small><div className="tutorial-icon">{steps[tutorialStep].icon}</div><h2>{steps[tutorialStep].title}</h2><p>{steps[tutorialStep].copy}</p><div className="dots">{steps.map((_,i)=><i key={i} className={i===tutorialStep?"on":""}/>)}</div><button className="primary" onClick={()=>tutorialStep<steps.length-1?setTutorialStep(v=>v+1):finishTutorial()}>{tutorialStep<steps.length-1?"NEXT LESSON":"START HUNT"} →</button><button className="ghost" onClick={finishTutorial}>SKIP TRAINING</button></div></div>}
 {screen==="hunt"&&<div className="play">
  <canvas ref={canvas}/>
  <div className="hud top"><div><small>CONTRACT</small><b>{mission.name}</b></div><div className="objective"><small>CLEAN HARVEST</small><b>{hud.target}</b></div><div><small>SCORE</small><b>{hud.score}</b></div></div>
  <div className={`scope-system ${hud.scoped?"active":""} ${hud.steadyActive?"steady":""}`}>
    <div className="scope-glass"/><div className="scope-ring ring-a"/><div className="scope-ring ring-b"/><div className="scope-cross horizontal"/><div className="scope-cross vertical"/><div className="scope-dot"/>
    {hud.scoped&&<><div className="scope-readout left"><small>WIND</small><b>{hud.wind} m/s</b><small>ZOOM</small><b>{hud.zoom}</b></div><div className="scope-readout right"><small>RANGE</small><b>{hud.range}</b><small>STATE</small><b>{hud.state}</b></div><div className="scope-target"><small>TRACKED</small><b>{hud.species}</b></div><div className="breath"><span style={{width:`${hud.steady}%`}}/><small>{hud.steadyActive?"BREATH HELD":"STEADY BREATH"} · {hud.steady}%</small></div></>}
  </div>
  {!hud.scoped&&<div className="field-reticle"><i/><span/><b/><em/></div>}
  {hud.shotFeedback&&<div className={`shot-confirm ${hud.shotFeedback}`}><i/><b>{hud.shotLabel}</b></div>}
  {!hud.scoped&&<div className="rifle-silhouette"><i/><b/><span/></div>}
  <div className="wind">WIND <b>{hud.wind} m/s</b></div><div className="ammo"><span>{hud.ammo}</span><small>/ {hud.reserve}<br/>FIELD ROUNDS</small></div><div className="scan-meter">TRAIL SCAN <b>{hud.scan}%</b></div>
  <div className="desktop-help">WASD MOVE · MOUSE LOOK/FIRE · Q ZOOM · E SCAN · HOLD SHIFT STEADY · R RELOAD</div>
  <div className="mobile-controls"><div className="stick" onPointerMove={(e:any)=>{if(e.buttons)engine.current?.setMove(Math.max(-1,Math.min(1,(e.nativeEvent.offsetX-48)/38)),Math.max(-1,Math.min(1,(48-e.nativeEvent.offsetY)/38)))}} onPointerUp={()=>engine.current?.setMove(0,0)}>MOVE</div><div className="actions"><button onClick={()=>engine.current?.pulseScan()}>SCAN</button><button onClick={()=>engine.current?.toggleScope()}>ZOOM</button><button onPointerDown={()=>engine.current?.setSteady(true)} onPointerUp={()=>engine.current?.setSteady(false)} onPointerCancel={()=>engine.current?.setSteady(false)}>STEADY</button><button onClick={()=>engine.current?.reload()}>LOAD</button><button className="fire" onClick={()=>engine.current?.shoot()}>FIRE</button></div></div>
  {toast&&<div className={`toast ${toast.kind}`}>{toast.text}</div>}<button className="exit" onClick={()=>setScreen("menu")}>×</button>
 </div>}
 {screen==="complete"&&<div className="complete-card"><small>CONTRACT COMPLETE</small><h2>{mission.name}</h2><div className="trophy">✦</div><div className="result-grid"><span><small>SCORE</small><b>{stats?.score}</b></span><span><small>ACCURACY</small><b>{stats?.accuracy}%</b></span><span><small>CLEAN SHOTS</small><b>{stats?.clean}/{stats?.shots}</b></span><span className="grade-perfect"><small>PERFECT</small><b>{stats?.perfect||0}</b></span><span className="grade-great"><small>GREAT</small><b>{stats?.great||0}</b></span><span className="grade-good"><small>GOOD</small><b>{stats?.good||0}</b></span></div><h3>{"★".repeat(stats?.accuracy>=80?3:stats?.accuracy>=50?2:1)}</h3><p>Patient fieldcraft rewarded. Fresh mission telemetry and reserve access have been synchronized.</p><button className="primary" onClick={claim}>CLAIM ◆ {mission.reward}</button></div>}
 </main>
}
