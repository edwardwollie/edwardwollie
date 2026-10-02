/**
 * Pure arena physics shared by the game and the tests. No Babylon types: plain
 * {x,y,z} vectors in the left-handed world (+Z = the rival end the player
 * attacks, +Y up). Dimensions come from the blueprint spec (spec.arena).
 */
export type V3 = {x:number;y:number;z:number};
export type ArenaDims = {
  pitchHalfWidth:number; pitchHalfLength:number; goalHalfWidth:number; goalHeight:number;
  hoopCentreY:number; hoopScoreRadius:number; hoopRimRadius:number; ballRadius:number;
};
export type BallState = {p:V3;v:V3;spin:number};
export type BallEvent =
  | {type:"goal";end:1|-1}
  | {type:"post";end:1|-1}
  | {type:"wall"}
  | {type:"bounce";speed:number};

export const GRAVITY = 15;
export const FLOOR_RESTITUTION = .52;
export const WALL_RESTITUTION = .7;
const POST_RADIUS = .13;

export const v3 = (x=0,y=0,z=0):V3 => ({x,y,z});
export const add = (a:V3,b:V3):V3 => ({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
export const sub = (a:V3,b:V3):V3 => ({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
export const scale = (a:V3,s:number):V3 => ({x:a.x*s,y:a.y*s,z:a.z*s});
export const len = (a:V3) => Math.hypot(a.x,a.y,a.z);
export const flat = (a:V3) => Math.hypot(a.x,a.z);
export const dist2d = (a:V3,b:V3) => Math.hypot(a.x-b.x,a.z-b.z);
export const clamp = (v:number,lo:number,hi:number) => Math.max(lo,Math.min(hi,v));

/** Deterministic PRNG so matches (and tests) can be replayed from a seed. */
export function rng(seed:number){
  let s=seed>>>0||1;
  return ()=>{s=(s+0x6d2b79f5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296};
}

/**
 * Advance a loose ball. Handles gravity, floor bounces with rolling friction,
 * side boards, end boards, and (in goal mode) the goal mouths with their posts
 * and crossbar. Returns the events this step produced.
 */
export function stepBall(ball:BallState,dt:number,dims:ArenaDims,goalMode:boolean,drag=.12):BallEvent[]{
  const events:BallEvent[]=[];
  const r=dims.ballRadius,p=ball.p,v=ball.v;
  const grounded=p.y<=r+.002&&Math.abs(v.y)<.6;
  if(!grounded)v.y-=GRAVITY*dt;
  p.x+=v.x*dt;p.y+=v.y*dt;p.z+=v.z*dt;
  const airDrag=Math.exp(-drag*dt);v.x*=airDrag;v.z*=airDrag;
  if(p.y<r){
    p.y=r;
    if(v.y<-1.2){events.push({type:"bounce",speed:-v.y});v.y=-v.y*FLOOR_RESTITUTION;v.x*=.92;v.z*=.92}
    else v.y=0;
  }
  if(p.y<=r+.002&&v.y===0){const roll=Math.exp(-1.15*dt);v.x*=roll;v.z*=roll}
  const hw=dims.pitchHalfWidth-r;
  if(Math.abs(p.x)>hw){p.x=Math.sign(p.x)*hw;v.x=-v.x*WALL_RESTITUTION;events.push({type:"wall"})}
  const hl=dims.pitchHalfLength-r;
  if(Math.abs(p.z)>hl){
    const end=(p.z>0?1:-1) as 1|-1;
    const inMouth=goalMode&&Math.abs(p.x)<dims.goalHalfWidth-r&&p.y<dims.goalHeight-r;
    const nearPost=goalMode&&Math.abs(Math.abs(p.x)-dims.goalHalfWidth)<r+POST_RADIUS&&p.y<dims.goalHeight;
    const nearBar=goalMode&&Math.abs(p.x)<dims.goalHalfWidth&&Math.abs(p.y-dims.goalHeight)<r+POST_RADIUS;
    if(inMouth&&!nearPost&&!nearBar){
      if(Math.abs(p.z)>dims.pitchHalfLength+.2){events.push({type:"goal",end})}
    }else{
      p.z=end*hl;v.z=-v.z*WALL_RESTITUTION;
      if(nearPost||nearBar){events.push({type:"post",end});v.x+=(p.x>0?1:-1)*.8*(nearPost?1:0);if(nearBar)v.y=-Math.abs(v.y)*.6}
      else events.push({type:"wall"});
    }
  }
  ball.spin+=flat(v)*dt/r;
  return events;
}

/** Launch velocity that reaches `to` from `from` in `time` seconds under gravity. */
export function solveBallistic(from:V3,to:V3,time:number,g=GRAVITY):V3{
  const t=Math.max(.05,time);
  return {x:(to.x-from.x)/t,y:(to.y-from.y)/t+.5*g*t,z:(to.z-from.z)/t};
}

/** A driven shot: flight time from distance and launch speed, gravity compensated. */
export function solveShot(from:V3,to:V3,speed:number,g=GRAVITY){
  const t=Math.max(.08,dist2d(from,to)/Math.max(1,speed));
  return {velocity:solveBallistic(from,to,t,g),time:t};
}

/** Where (x, y) and when a ball on its current arc crosses the plane z = line. */
export function crossingAt(ball:{p:V3;v:V3},line:number,g=GRAVITY){
  if(Math.abs(ball.v.z)<1e-3)return null;
  const t=(line-ball.p.z)/ball.v.z;
  if(t<0)return null;
  const y=Math.max(0,ball.p.y+ball.v.y*t-.5*g*t*t);
  return {t,x:ball.p.x+ball.v.x*t,y};
}

/**
 * Goal Rush aim. The shot goes where the striker faces: the facing ray is
 * intersected with the goal line, then pulled inside the posts. Facing away
 * from goal (more than ~70 degrees) turns the shot into a straight clearance.
 */
export function goalAim(from:V3,yaw:number,goalZ:number,goalHalf:number,ballR:number){
  const dir={x:Math.sin(yaw),z:Math.cos(yaw)};
  const toward=Math.sign(goalZ-from.z)*dir.z;
  if(toward<.34)return {aimed:false,x:from.x+dir.x*20,z:from.z+dir.z*20};
  const t=(goalZ-from.z)/dir.z;
  const x=clamp(from.x+dir.x*t,-goalHalf+ballR+.35,goalHalf-ballR-.35);
  return {aimed:true,x,z:goalZ};
}

/** Classify a ring crossing between two ball positions (vertical ring facing Z). */
export function ringCrossing(a:V3,b:V3,centre:V3,scoreRadius:number,rimRadius:number):"score"|"rim"|null{
  if((a.z-centre.z)*(b.z-centre.z)>0||a.z===b.z)return null;
  const t=(centre.z-a.z)/(b.z-a.z);
  const x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;
  const d=Math.hypot(x-centre.x,y-centre.y);
  if(d<scoreRadius)return "score";
  if(d<rimRadius+.18)return "rim";
  return null;
}

/** Keeper drone: slide along the goal line toward where the ball will cross. */
export function keeperTarget(ball:{p:V3;v:V3},lineZ:number,goalHalf:number,end:1|-1){
  const incoming=Math.sign(ball.v.z)===end&&Math.abs(ball.v.z)>3;
  if(incoming){
    const c=crossingAt(ball,lineZ);
    if(c&&c.t<2.2)return {x:clamp(c.x,-goalHalf+.6,goalHalf-.6),urgent:true,y:c.y};
  }
  return {x:clamp(ball.p.x*.42,-goalHalf+1,goalHalf-1),urgent:false,y:1.2};
}

/** Aim point that leads a moving receiver, for a pass of the given speed. */
export function leadTarget(from:V3,to:V3,toVel:V3,speed:number){
  let t=dist2d(from,to)/Math.max(1,speed);
  for(let i=0;i<2;i++)t=dist2d(from,add(to,scale(toVel,t)))/Math.max(1,speed);
  return {target:add(to,scale(toVel,Math.min(1.2,t))),time:t};
}

/** Star rating used by the results screen (unchanged from 1.x). */
export function stars(rivalScore:number,shield:number){
  return rivalScore===0&&shield>=70?3:shield>=35?2:1;
}
