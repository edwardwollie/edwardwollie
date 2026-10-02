/* eslint-disable @typescript-eslint/no-explicit-any,react-hooks/set-state-in-effect */
"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {NinjaEngine} from "./ninja-engine";
import {OpenWorldEngine,type GhostRun} from "./open-world";
import {HangarViewer} from "./hangar";
import {MISSIONS,UPGRADES,type UpgradeKey} from "./ninja-data";
import {SECTORS} from "./city-plan";

type Save={unlocked:number;credits:number;stars:Record<number,number>;upgrades:Record<UpgradeKey,number>;trained:boolean;survivalTrained:boolean;
  opsUnlocked:number;opsStars:Record<number,number>;opsBest:Record<number,number>;opsTrained:boolean;music:boolean;
  callsign:string;showGhost:boolean;ops41Seen:boolean};
const fresh:Save={unlocked:1,credits:150,stars:{},upgrades:{agility:0,armor:0,blade:0},trained:false,survivalTrained:false,
  opsUnlocked:1,opsStars:{},opsBest:{},opsTrained:false,music:true,callsign:"",showGhost:true,ops41Seen:false};
const GHOST_KEY="cyber-ninja-ghosts-v1";
function loadGhost(sector:number):GhostRun|null{try{const all=JSON.parse(localStorage.getItem(GHOST_KEY)||"{}");return all[sector]||null}catch{return null}}
function saveGhost(run:GhostRun){try{const all=JSON.parse(localStorage.getItem(GHOST_KEY)||"{}");all[run.sector]=run;localStorage.setItem(GHOST_KEY,JSON.stringify(all))}catch{}}
type Board={entries:{name:string;time:number;stars:number;health:number}[];rank?:number;error?:string}|null;
type Screen="academy"|"tutorial"|"opsTutorial"|"play"|"ops"|"hangar"|"complete"|"failed"|"opsComplete"|"opsFailed";
type Mode="ops"|"trials";

const lessons=[
  {i:"◇",t:"SURVIVE TO THE FINISH",p:"Reach the finish gate with integrity remaining. Hazard waves are the main challenge. Surviving them unlocks the next trial, even if you collect no shards or destroy no drones."},
  {i:"↔",t:"SHIFT LANES",p:"Use A/D or arrow keys. On mobile, tap LEFT and RIGHT. Tall orange walls and crushers mean SHIFT to a clear lane. Some waves block two lanes."},
  {i:"↑",t:"AIR STEP",p:"Press SPACE, W, or JUMP to clear red barriers and floor spikes. Wait for the JUMP NOW cue so you are still airborne over the hazard."},
  {i:"↓",t:"SHADOW SLIDE",p:"Press S, DOWN, or SLIDE under magenta laser gates and sweep bars when SLIDE NOW appears."},
  {i:"⚔",t:"OPTIONAL BONUSES",p:"Shards and Aegis drones add a small score and credit bonus. You may pass them without penalty. Focus on the next hazard and your integrity first."},
  {i:"✦",t:"CLEAN RUN",p:"Every hazard wave passed without a hit builds Flow and improves your score. Bonus pickups do not determine your star rating."},
];
const opsLessons=[
  {i:"◎",t:"FREE 3D MOVEMENT",p:"Move with WASD, look with the mouse (click the game to capture it, ESC to release). Hold SHIFT to sprint. On mobile, use the left stick and drag the right side of the screen to look."},
  {i:"↑↑",t:"DOUBLE JUMP + DASH",p:"SPACE jumps; press it again in the air for a somersault double jump. E or Q performs a phase dash with brief invulnerability. Magenta launch pads throw you to higher rooftops."},
  {i:"⚔",t:"KATANA CHAIN",p:"Left click or F strikes. Tap in rhythm for a three-hit chain; the third hit is a heavy finisher. Strikes auto-aim at the nearest drone and lunge toward it, even in mid-air."},
  {i:"✴",t:"PHOTON SHURIKEN",p:"Right click or R throws a homing shuriken at the drone you are aiming toward. You hold three; they recharge over time. A swing timed as a plasma bolt arrives deflects it back."},
  {i:"⫽",t:"WALL-RUN",p:"Jump at a tall wall while moving along it to run across it. Neon billboards span some gaps between rooftops. Press SPACE during a wall-run to kick off; a wall jump refunds your double jump."},
  {i:"⌖",t:"THE OPERATION",p:"Collect every data shard and destroy every drone. That wakes the Warden, the sector boss. Destroy it to bring the uplink beacon online, then reach it. Follow the objective marker and radar."},
  {i:"◉",t:"FIGHTING THE WARDEN",p:"Dodge cannon fans, step out of red plasma-rain circles and JUMP over the orange shockwave ring. Land six quick hits to stagger it: it sinks low and takes 50% more damage. Deflected bolts hit it hard."},
];

function fmt(t:number){const m=Math.floor(t/60),s=Math.floor(t%60);return `${m}:${String(s).padStart(2,"0")}`}

/** Virtual analog stick for touch screens. */
function Stick({onMove}:{onMove:(x:number,y:number)=>void}){
  const base=useRef<HTMLDivElement>(null),[knob,setKnob]=useState({x:0,y:0}),id=useRef<number|null>(null);
  const update=(e:React.PointerEvent)=>{
    const r=base.current!.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,R=r.width/2;
    let dx=(e.clientX-cx)/R,dy=(e.clientY-cy)/R;const l=Math.hypot(dx,dy);if(l>1){dx/=l;dy/=l}
    setKnob({x:dx,y:dy});onMove(dx,-dy);
  };
  return <div className="stick" ref={base}
    onPointerDown={e=>{id.current=e.pointerId;(e.target as HTMLElement).setPointerCapture(e.pointerId);update(e)}}
    onPointerMove={e=>{if(id.current===e.pointerId)update(e)}}
    onPointerUp={()=>{id.current=null;setKnob({x:0,y:0});onMove(0,0)}} onPointerCancel={()=>{id.current=null;setKnob({x:0,y:0});onMove(0,0)}}>
    <i style={{transform:`translate(${knob.x*38}px,${knob.y*38}px)`}}/></div>;
}

export default function CyberNinja(){
  const canvas=useRef<HTMLCanvasElement>(null),engine=useRef<NinjaEngine|null>(null),ops=useRef<OpenWorldEngine|null>(null),hangar=useRef<HangarViewer|null>(null);
  const[save,setSave]=useState<Save>(fresh),[loaded,setLoaded]=useState(false),[mode,setMode]=useState<Mode>("ops"),[selected,setSelected]=useState(0),[sector,setSector]=useState(0);
  const[screen,setScreen]=useState<Screen>("academy"),[step,setStep]=useState(0);
  const[hud,setHud]=useState<any>({distance:0,health:100,gates:"0/22",shards:"0/4",drones:"0/1",score:0,combo:0,cue:null,speed:"13.0"});
  const[ohud,setOhud]=useState<any>(null),[toast,setToast]=useState<any>(null),[result,setResult]=useState<any>(null);
  const[pose,setPose]=useState("stance"),[wire,setWire]=useState(false);
  const[board,setBoard]=useState<Board>(null),[top,setTop]=useState<Board>(null),[posting,setPosting]=useState(false),[callsign,setCallsign]=useState("");
  const mission=MISSIONS[selected],op=SECTORS[sector];
  const look=useRef<{id:number;x:number;y:number}|null>(null);
  useEffect(()=>{try{const s=localStorage.getItem("cyber-ninja-save-v1");if(s)setSave({...fresh,...JSON.parse(s)})}catch{}setLoaded(true)},[]);
  useEffect(()=>{if(loaded)try{localStorage.setItem("cyber-ninja-save-v1",JSON.stringify(save))}catch{}},[save,loaded]);
  const toastTimer=useRef<any>(null);
  const msg=useCallback((text:string,kind:string)=>{setToast({text,kind,k:Math.random()});clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(null),kind==="strike"?1050:1450)},[]);
  const done=useCallback((v:any)=>{setResult(v);setScreen("complete")},[]),fail=useCallback(()=>setScreen("failed"),[]);
  const opsDone=useCallback((v:any)=>{
    const {ghostRun,...rest}=v;
    const prior=loadGhost(v.sector);rest.newRecord=!prior||v.time<prior.time;
    if(rest.newRecord&&ghostRun?.samples?.length)saveGhost(ghostRun);
    setResult(rest);setBoard(null);setScreen("opsComplete");
  },[]),opsFail=useCallback(()=>setScreen("opsFailed"),[]);
  const music=save.music;
  useEffect(()=>{if(screen!=="play"||!canvas.current)return;const g=new NinjaEngine(canvas.current,mission,save.upgrades,{onHud:setHud,onMessage:msg,onComplete:done,onFail:fail},{music});engine.current=g;return()=>{g.destroy();engine.current=null}},[screen,mission,save.upgrades,msg,done,fail]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{if(screen!=="ops"||!canvas.current)return;setOhud(null);const g=new OpenWorldEngine(canvas.current,op,save.upgrades,{onHud:setOhud,onMessage:msg,onComplete:opsDone,onFail:opsFail},{music,ghost:save.showGhost?loadGhost(op.id):null});ops.current=g;return()=>{g.destroy();ops.current=null}},[screen,op,save.upgrades,msg,opsDone,opsFail]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{if(screen!=="hangar"||!canvas.current)return;const v=new HangarViewer(canvas.current);hangar.current=v;setPose("stance");setWire(false);return()=>{v.destroy();hangar.current=null}},[screen]);
  useEffect(()=>{if(loaded)setCallsign(save.callsign)},[loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{
    if(screen!=="academy"||mode!=="ops")return;let live=true;setTop(null);
    fetch(`/api/leaderboard?sector=${op.id}`).then(r=>r.json()).then(d=>{if(live)setTop(d)}).catch(()=>{if(live)setTop({entries:[],error:"offline"})});
    return()=>{live=false};
  },[screen,mode,op.id]);
  const submitScore=async()=>{
    const name=callsign.toUpperCase().replace(/[^A-Z0-9 _-]/g,"").trim().slice(0,14);if(name.length<2||!result)return;
    setPosting(true);setSave(s=>({...s,callsign:name}));
    try{
      const r=await fetch("/api/leaderboard",{method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({sector:op.id,name,time:result.time,health:result.health,stars:result.stars,score:result.score,falls:result.falls})});
      const d=await r.json();setBoard(r.ok?d:{entries:[],error:d.error||"leaderboard unavailable"});
    }catch{setBoard({entries:[],error:"leaderboard offline"})}
    setPosting(false);
  };
  const toggleMusic=()=>{const on=!save.music;setSave(s=>({...s,music:on}));engine.current?.synth.setMusic(on);ops.current?.synth.setMusic(on)};
  const start=()=>{
    const trained=mode==="ops"?save.opsTrained:save.survivalTrained;
    // Returning operatives get only the cards for the 4.1 features.
    if(mode==="ops"&&trained&&!save.ops41Seen){setStep(4);setScreen("opsTutorial");return}
    if(trained){setScreen(mode==="ops"?"ops":"play");return}
    setStep(0);setScreen(mode==="ops"?"opsTutorial":"tutorial");
  };
  const trainDone=()=>{setSave(s=>({...s,trained:true,survivalTrained:true}));setScreen("play")};
  const opsTrainDone=()=>{setSave(s=>({...s,opsTrained:true,ops41Seen:true}));setScreen("ops")};
  const claim=()=>{setSave(s=>({...s,credits:s.credits+result.credits,unlocked:Math.min(12,Math.max(s.unlocked,mission.id+1)),stars:{...s.stars,[mission.id]:Math.max(result.stars,s.stars[mission.id]||0)}}));setScreen("academy")};
  const claimOps=()=>{setSave(s=>({...s,credits:s.credits+result.credits,opsUnlocked:Math.min(SECTORS.length,Math.max(s.opsUnlocked,op.id+1)),
    opsStars:{...s.opsStars,[op.id]:Math.max(result.stars,s.opsStars[op.id]||0)},opsBest:{...s.opsBest,[op.id]:Math.min(result.time,s.opsBest[op.id]??Infinity)}}));setScreen("academy")};
  const buy=(key:UpgradeKey)=>{const l=save.upgrades[key],cost=(l+1)*130;if(l>=3||save.credits<cost)return;setSave(s=>({...s,credits:s.credits-cost,upgrades:{...s.upgrades,[key]:l+1}}))};
  const lookDown=(e:React.PointerEvent)=>{look.current={id:e.pointerId,x:e.clientX,y:e.clientY};(e.target as HTMLElement).setPointerCapture(e.pointerId)};
  const lookMove=(e:React.PointerEvent)=>{const l=look.current;if(!l||l.id!==e.pointerId)return;ops.current?.look((e.clientX-l.x)*.0062,(e.clientY-l.y)*.005);l.x=e.clientX;l.y=e.clientY};
  if(!loaded)return <main className="boot">SYNCING SHADOW NETWORK…</main>;
  const lessonSet=screen==="opsTutorial"?opsLessons:lessons;

  return <main className={`shell ${screen}`}>
    {screen==="academy"&&<>
      <header><div className="brand"><i>刃</i><span><b>CYBER NINJA</b><small>{"ACADEMY // FULL 3D 4.1"}</small></span></div><div className="head-actions"><button className="ghost" onClick={toggleMusic}>{save.music?"♪ ON":"♪ OFF"}</button><button className="ghost" onClick={()=>setScreen("hangar")}>3D BLUEPRINT HANGAR</button><div className="credits">◇ {save.credits}</div></div></header>
      <section className="hero">
        <div className="hero-copy"><small>SHADOW NETWORK // FULL 3D OPERATIONS ONLINE</small><h1>ROAM.<br/><em>STRIKE.</em><br/>ASCEND.</h1><p>Free-roam a neon rooftop city in full 3D. Sprint, wall-run, double-jump and chain katana strikes against hunter drones, then take down the Warden and race your own ghost up the leaderboard. Or take on the 12 classic survival trials, rebuilt with the new realistic operative.</p><div className="hero-actions"><button className="primary" onClick={start}>{mode==="ops"?"DEPLOY TO CITY OPS →":"ENTER SURVIVAL TRIAL →"}</button><span><b>{SECTORS.length}</b> sectors + Warden bosses · <b>12</b> survival trials</span></div></div>
        <div className="ninja-sigil" aria-hidden="true"><i className="sigil-ring r1"/><i className="sigil-ring r2"/><i className="sigil-slash s1"/><i className="sigil-slash s2"/><strong>刃</strong><small>PHOTON<br/>EDGE</small></div>
        {mode==="ops"?<div className="rank-card"><small>SELECTED OPERATION</small><b>{op.name}</b><span>{op.zone}</span><i style={{"--rank":op.color} as any}/><p>{op.shards} shards · {op.drones} drones{op.elite?` (${op.elite} elite)`:""} · par {fmt(op.par)}</p></div>
        :<div className="rank-card"><small>SELECTED TRIAL</small><b>{mission.rank}</b><span>{mission.name}</span><i style={{"--rank":mission.color} as any}/><p>{mission.zone} · {mission.distance}m · {mission.hazards} hazard waves</p></div>}
      </section>
      <section className="academy-grid">
        <div className="missions">
          <div className="mode-tabs"><button className={mode==="ops"?"on":""} onClick={()=>setMode("ops")}>CITY OPS <small>FREE-ROAM 3D</small></button><button className={mode==="trials"?"on":""} onClick={()=>setMode("trials")}>SURVIVAL TRIALS <small>CLASSIC RUNNER</small></button></div>
          {mode==="ops"?<>
            <div className="section-head"><b>OPEN-CITY SECTORS</b><span>{save.opsUnlocked}/{SECTORS.length} UNLOCKED</span></div>
            {SECTORS.map((s,i)=><button key={s.id} disabled={s.id>save.opsUnlocked} className={sector===i?"active":""} onClick={()=>setSector(i)}><i>{String(s.id).padStart(2,"0")}</i><span><b>{s.name}</b><small>{s.zone} · {s.grid*s.grid} rooftops · best {save.opsBest[s.id]?fmt(save.opsBest[s.id]):"—"}</small></span><strong>{s.id>save.opsUnlocked?"LOCKED":`${"★".repeat(save.opsStars[s.id]||0)}${"☆".repeat(3-(save.opsStars[s.id]||0))}`}</strong></button>)}
          </>:<>
            <div className="section-head"><b>ACADEMY TRIALS</b><span>{save.unlocked}/12 UNLOCKED</span></div>
            {MISSIONS.map((m,i)=><button key={m.id} disabled={m.id>save.unlocked} className={selected===i?"active":""} onClick={()=>setSelected(i)}><i>{String(m.id).padStart(2,"0")}</i><span><b>{m.name}</b><small>{m.zone} · {m.rank}</small></span><strong>{m.id>save.unlocked?"LOCKED":`${"★".repeat(save.stars[m.id]||0)}${"☆".repeat(3-(save.stars[m.id]||0))}`}</strong></button>)}
          </>}
        </div>
        <aside>
          {mode==="ops"?<div className="brief"><small>OPERATION BRIEF // FREE ROAM</small><h2>{op.name}</h2><div className="objectives"><span>DATA SHARDS<b>{op.shards}</b></span><span>HUNTER DRONES<b>{op.drones}</b></span><span>PAR TIME<b>{fmt(op.par)}</b></span><span>BASE REWARD<b>◇ {op.reward}</b></span></div><p className="bonus-brief">Clear every shard and drone, defeat the Warden to light the uplink beacon, then reach it. Faster, cleaner runs earn up to +50% credits.</p>
            <div className="top3"><small>SECTOR LEADERBOARD</small>{!top?<span>…</span>:top.error?<span>offline</span>:top.entries.length?top.entries.slice(0,3).map((e,i)=><span key={e.name}><b>{i+1}</b>{e.name}<em>{fmt(e.time)}</em></span>):<span>No times yet. Be first.</span>}</div>
            <label className="ghost-toggle"><input type="checkbox" checked={save.showGhost} onChange={e=>{const v=e.target.checked;setSave(s=>({...s,showGhost:v}))}}/> RACE MY GHOST {save.opsBest[op.id]?`(best ${fmt(save.opsBest[op.id])})`:"(after first clear)"}</label></div>
          :<div className="brief"><small>MAIN OBJECTIVE // SURVIVE</small><h2>{mission.name}</h2><div className="objectives"><span>REACH FINISH<b>{mission.distance}m</b></span><span>HAZARD WAVES<b>{mission.hazards}</b></span><span>INTEGRITY<b>ABOVE 0</b></span><span>BASE REWARD<b>◇ {mission.reward}</b></span></div><p className="bonus-brief">OPTIONAL BONUSES · {mission.shards} shards · {mission.drones} drones · up to +20% credits</p></div>}
          {mode==="ops"?<div className="combat-legend"><small>OPERATIVE CONTROLS</small><div><i className="cue-dot jump"/>WASD MOVE · MOUSE LOOK · SHIFT SPRINT</div><div><i className="cue-dot slide"/>SPACE JUMP ×2 · E DASH</div><div><i className="cue-dot strike"/>CLICK / F KATANA CHAIN</div><div><i className="cue-dot dodge"/>RIGHT CLICK / R SHURIKEN</div></div>
          :<div className="combat-legend"><small>VISUAL SURVIVAL LANGUAGE</small><div><i className="cue-dot jump"/>JUMP BARRIER / SPIKES</div><div><i className="cue-dot slide"/>SLIDE LASER / SWEEP</div><div><i className="cue-dot dodge"/>SHIFT WALL / CRUSHER</div><div><i className="cue-dot strike"/>DRONE = BONUS</div></div>}
          <div className="upgrades"><small>SHINOBI LAB</small>{UPGRADES.map(u=>{const l=save.upgrades[u.key],cost=(l+1)*130;return <button key={u.key} disabled={l>=3||save.credits<cost} onClick={()=>buy(u.key)}><i>{u.icon}</i><span><b>{u.name}</b><small>{u.detail}</small></span><strong>{l>=3?"MAX":`◇ ${cost}`}<em>{"●".repeat(l)}{"○".repeat(3-l)}</em></strong></button>})}</div>
        </aside>
      </section>
    </>}
    {(screen==="tutorial"||screen==="opsTutorial")&&<div className="overlay"><div className="modal"><small>{`${screen==="opsTutorial"?"OPERATIVE TRAINING":"COMBAT TRAINING"} // ${step+1} OF ${lessonSet.length}`}</small><i className={`lesson-icon lesson-${step}`}>{lessonSet[step].i}</i><h2>{lessonSet[step].t}</h2><p>{lessonSet[step].p}</p><div className="dots">{lessonSet.map((_,i)=><i key={i} className={i===step?"on":""}/>)}</div><button className="primary" onClick={()=>step<lessonSet.length-1?setStep(x=>x+1):(screen==="opsTutorial"?opsTrainDone():trainDone())}>{step<lessonSet.length-1?"NEXT TECHNIQUE":"DEPLOY"} →</button></div></div>}
    {screen==="play"&&<div className="game"><canvas ref={canvas}/><div className="scanlines"/><div className="top-hud"><span><small>TRIAL</small><b>{mission.name}</b></span><span><small>GATES SURVIVED</small><b>{hud.gates}</b></span><span><small>INTEGRITY</small><b>{hud.health}%</b></span><span><small>SCORE</small><b>{hud.score}</b></span></div><div className="progress"><i><em style={{width:`${hud.distance}%`}}/></i><b>{hud.distance}%</b></div><div className="bonus-hud">OPTIONAL BONUS <b>◇ {hud.shards}</b><b>⚔ {hud.drones}</b></div><div className="integrity">SHADOW INTEGRITY <i><em style={{width:`${hud.health}%`}}/></i></div><div className="speed-readout">VELOCITY <b>{hud.speed}</b></div>{hud.combo>1&&<div className={`combo ${hud.combo>=5?"hot":""}`}>×{hud.combo}<small>CLEAN WAVES</small></div>}{hud.cue&&<div className={`action-cue ${hud.cue.kind}`}><i/><span><small>{hud.cue.hint}</small><b>{hud.cue.label}</b></span><i/></div>}
      <div className="controls"><button onClick={()=>engine.current?.shift(-1)}>◀<small>LEFT</small></button><button className="jump" onClick={()=>engine.current?.jump()}>↑<small>JUMP</small></button><button className="strike" onClick={()=>engine.current?.attack()}><strong>⚔</strong><small>STRIKE</small></button><button className="slide" onClick={()=>engine.current?.slide()}>↓<small>SLIDE</small></button><button onClick={()=>engine.current?.shift(1)}>▶<small>RIGHT</small></button></div><div className="help">A/D SHIFT · SPACE JUMP · S SLIDE · F/K STRIKE</div>{toast&&<div className={`toast ${toast.kind}`}>{toast.text}</div>}<button className="music-toggle" onClick={toggleMusic}>{save.music?"♪":"♪̸"}</button><button className="exit" onClick={()=>setScreen("academy")}>×</button></div>}
    {screen==="ops"&&<div className="game ops-game"><canvas ref={canvas}/><div className="scanlines"/>
      {ohud&&<>
        <div className="top-hud ops-top"><span><small>OPERATION</small><b>{op.name}</b></span><span className={ohud.shards>=ohud.shardsTotal?"done":""}><small>DATA SHARDS</small><b>{ohud.shards}/{ohud.shardsTotal}</b></span><span className={ohud.drones>=ohud.dronesTotal?"done":""}><small>DRONES</small><b>{ohud.drones}/{ohud.dronesTotal}</b></span><span><small>TIME / PAR</small><b className={ohud.time>ohud.par?"over":""}>{fmt(ohud.time)} / {fmt(ohud.par)}</b></span><span><small>SCORE</small><b>{ohud.score}</b></span></div>
        <div className="integrity ops-integrity">INTEGRITY {ohud.health}% <i><em style={{width:`${ohud.health}%`}} className={ohud.health<35?"low":""}/></i></div>
        <div className="ability-bar"><span className="ability"><small>SHURIKEN</small><b>{"✴".repeat(ohud.stars)}{"·".repeat(3-ohud.stars)}</b><i><em style={{width:`${ohud.stars>=3?100:ohud.starRegen*100}%`}}/></i></span><span className="ability"><small>DASH</small><b>{ohud.dash>=1?"READY":"…"}</b><i><em style={{width:`${ohud.dash*100}%`}}/></i></span><span className="ability"><small>ALT</small><b>{ohud.altitude}m</b></span></div>
        <div className="radar"><i className="radar-sweep"/>{ohud.radar.map((r:any,i:number)=><b key={i} className={`blip ${r.k}`} style={{left:`${50+r.x*46}%`,top:`${50-r.z*46}%`}}/>)}<em className="radar-you"/></div>
        {ohud.marker&&(()=>{const m=ohud.marker;let x=m.x,y=m.y;const off=m.behind||x<.04||x>.96||y<.08||y>.92;if(m.behind){x=1-x;y=.9}x=Math.min(.96,Math.max(.04,x));y=Math.min(.9,Math.max(.1,y));return <div className={`obj-marker ${m.kind} ${off?"edge":""}`} style={{left:`${x*100}%`,top:`${y*100}%`}}><i/><small>{m.kind==="beacon"?"UPLINK":m.kind==="shard"?"SHARD":m.kind==="boss"?"WARDEN":"DRONE"} · {m.dist}m</small></div>})()}
        {ohud.lock&&<div className="lock-reticle" style={{left:`${ohud.lock.x*100}%`,top:`${ohud.lock.y*100}%`}}><i/><em style={{width:`${ohud.lockHp*100}%`}}/></div>}
        {ohud.beacon&&<div className="beacon-alert">UPLINK ONLINE — REACH THE BEACON</div>}
        {ohud.boss&&<div className={`boss-bar ${ohud.boss.stagger?"stagger":""}`}><small>WARDEN // SECTOR BOSS{ohud.boss.stagger?" — STAGGERED":""}</small><i><em style={{width:`${ohud.boss.hp*100}%`}}/><b style={{left:"66%"}}/><b style={{left:"33%"}}/></i></div>}
        {ohud.wallRun&&<div className="wallrun-tag">WALL-RUN · SPACE TO KICK OFF</div>}
        {ohud.ghost&&<div className="ghost-tag">◌ GHOST: YOUR BEST RUN</div>}
        {!ohud.locked&&<div className="help ops-help">CLICK TO CAPTURE MOUSE · WASD MOVE · SPACE ×2 JUMP · E DASH · CLICK/F STRIKE · RIGHT-CLICK/R SHURIKEN · SHIFT SPRINT</div>}
      </>}
      <div className="look-zone" onPointerDown={lookDown} onPointerMove={lookMove} onPointerUp={()=>{look.current=null}} onPointerCancel={()=>{look.current=null}}/>
      <div className="touch-ops"><Stick onMove={(x,y)=>ops.current?.setMove(x,y)}/>
        <div className="ops-buttons"><button className="o-star" onPointerDown={()=>ops.current?.throwStar()}>✴<small>STAR</small></button><button className="o-dash" onPointerDown={()=>ops.current?.dash()}>»<small>DASH</small></button><button className="o-strike" onPointerDown={()=>ops.current?.attack()}>⚔<small>STRIKE</small></button><button className="o-jump" onPointerDown={()=>ops.current?.jump()}>↑<small>JUMP</small></button></div></div>
      {toast&&<div className={`toast ${toast.kind}`} key={toast.k}>{toast.text}</div>}<button className="music-toggle" onClick={toggleMusic}>{save.music?"♪":"♪̸"}</button><button className="exit" onClick={()=>setScreen("academy")}>×</button></div>}
    {screen==="hangar"&&<div className="game hangar"><canvas ref={canvas}/>
      <div className="hangar-panel"><small>{"3D BLUEPRINT HANGAR // SPEC 4.1.0"}</small><h2>CYBER NINJA OPERATIVE</h2><p>The exact playable model: 1.92 m, 16 articulated joints, conformal armour over a lofted carbon under-suit. Drag to orbit, scroll or pinch to zoom.</p>
        <div className="hangar-group"><small>SIDES</small>{["front","rear","left","right","top","under","quarter"].map(v=><button key={v} onClick={()=>hangar.current?.setView(v as any)}>{v.toUpperCase()}</button>)}</div>
        <div className="hangar-group"><small>POSES</small>{["stance","run","jump","slide","strike","finisher","dash","wallrun"].map(p=><button key={p} className={pose===p?"on":""} onClick={()=>{setPose(p);hangar.current?.setPose(p)}}>{p.toUpperCase()}</button>)}</div>
        <div className="hangar-group"><button className={wire?"on":""} onClick={()=>setWire(hangar.current?.toggleBlueprint()??false)}>{wire?"SOLID VIEW":"BLUEPRINT WIREFRAME"}</button><a href="/blueprints/Cyber-Ninja-3D-Blueprint-Atlas-v4.1.0.pdf" target="_blank" rel="noreferrer">DOWNLOAD BLUEPRINT ATLAS (PDF)</a></div>
      </div><button className="exit" onClick={()=>setScreen("academy")}>×</button></div>}
    {screen==="complete"&&<div className="overlay"><div className="modal result"><small>FINISH GATE REACHED</small><i className="lesson-icon">✦</i><h2>RUN SURVIVED</h2><div className="result-grid"><span>WAVES SURVIVED<b>{result?.gates}/{mission.hazards}</b></span><span>CLEAN WAVES<b>{result?.clean}</b></span><span>INTEGRITY<b>{result?.health}%</b></span></div><p>{result?.hits} impacts · {result?.stars} star{result?.stars===1?"":"s"} · Optional: {result?.shards}/{mission.shards} shards and {result?.drones}/{mission.drones} drones (+◇ {result?.bonusCredits}).</p><button className="primary" onClick={claim}>CLAIM ◇ {result?.credits}</button></div></div>}
    {screen==="failed"&&<div className="overlay"><div className="modal result"><small>INTEGRITY DEPLETED</small><i className="lesson-icon fail">!</i><h2>RECALIBRATE</h2><p>Reach the finish alive. Jump red barriers and spikes, slide beneath magenta gates and sweeps, and shift away from orange walls and crushers. Shards and drones are optional.</p><button className="primary" onClick={()=>setScreen("academy")}>RETURN TO ACADEMY</button></div></div>}
    {screen==="opsComplete"&&<div className="overlay"><div className="modal result"><small>UPLINK SECURED</small><i className="lesson-icon">✦</i><h2>OPERATION COMPLETE</h2><div className="result-grid"><span>TIME<b>{fmt(result?.time||0)}</b></span><span>INTEGRITY<b>{result?.health}%</b></span><span>SCORE<b>{result?.score}</b></span></div><p>{"★".repeat(result?.stars||0)}{"☆".repeat(3-(result?.stars||0))} · {result?.drones} drones · {result?.shards} shards · {result?.falls} falls · {result?.wallRuns||0} wall-runs · par {fmt(op.par)}</p>
      {result?.ghostTime!=null?<p className={`split ${result.time<result.ghostTime?"ahead":"behind"}`}>{result.time<result.ghostTime?"NEW RECORD":"GHOST"} {result.time<result.ghostTime?"−":"+"}{Math.abs(result.time-result.ghostTime).toFixed(1)}s vs your best</p>:<p className="split ahead">FIRST CLEAR — GHOST SAVED</p>}
      <div className="board">
        {!board?<div className="board-entry"><input value={callsign} maxLength={14} placeholder="CALLSIGN" onChange={e=>setCallsign(e.target.value.toUpperCase())}/><button className="ghost" disabled={posting||callsign.trim().length<2} onClick={submitScore}>{posting?"SENDING…":"POST TO LEADERBOARD"}</button></div>
        :board.error?<p className="board-error">{board.error}</p>
        :<ol>{board.entries.map((e,i)=><li key={e.name} className={i+1===board.rank?"me":""}><b>{i+1}</b><span>{e.name}</span><em>{fmt(e.time)}.{String(Math.round((e.time%1)*10))}</em><small>{"★".repeat(e.stars)}</small></li>)}{board.rank&&board.rank>10&&<li className="me"><b>{board.rank}</b><span>{callsign}</span><em>{fmt(result.time)}</em></li>}</ol>}
      </div>
      <button className="primary" onClick={claimOps}>CLAIM ◇ {result?.credits}</button></div></div>}
    {screen==="opsFailed"&&<div className="overlay"><div className="modal result"><small>OPERATIVE DOWN</small><i className="lesson-icon fail">!</i><h2>RECALIBRATE</h2><p>Keep moving: drones telegraph each shot with a shrinking red ring. Dash through bolts, or time a strike to deflect them. Grab red repair cells and upgrade Shadow Weave in the lab.</p><div className="hero-actions center"><button className="primary" onClick={()=>setScreen("ops")}>RETRY OPERATION</button><button className="ghost" onClick={()=>setScreen("academy")}>ACADEMY</button></div></div></div>}
  </main>;
}
