/**
 * File-backed City Ops leaderboard. Scores live in one JSON file on a
 * persistent Docker volume (LEADERBOARD_DIR, default /game/data). Writes are
 * serialised and atomic (temp file + rename). Validation is deliberately
 * strict but this is a casual board, not a cheat-proof one.
 */
export type Entry={name:string;time:number;health:number;stars:number;score:number;falls:number;at:string};
export type Board=Record<string,Entry[]>;
export const SECTOR_IDS=[1,2,3,4];
export const MIN_TIME:Record<number,number>={1:25,2:35,3:45,4:55};
const KEEP=50;

export function cleanName(raw:unknown){
  if(typeof raw!=="string")return null;
  const name=raw.toUpperCase().replace(/[^A-Z0-9 _-]/g,"").replace(/\s+/g," ").trim().slice(0,14);
  return name.length>=2?name:null;
}

export function validate(input:unknown):{sector:number;entry:Entry}|string{
  const body=(input&&typeof input==="object"?input:{}) as Record<string,unknown>;
  const sector=Number(body.sector);
  if(!SECTOR_IDS.includes(sector))return "unknown sector";
  const name=cleanName(body.name);if(!name)return "callsign must be 2-14 letters or numbers";
  const time=Number(body.time),health=Number(body.health),stars=Number(body.stars),score=Number(body.score),falls=Number(body.falls??0);
  if(!Number.isFinite(time)||time<MIN_TIME[sector]||time>3600)return "run time is outside the valid range for this sector";
  if(!Number.isFinite(health)||health<0||health>100)return "integrity out of range";
  if(![1,2,3].includes(stars))return "stars out of range";
  if(!Number.isFinite(score)||score<0||score>200000)return "score out of range";
  if(!Number.isInteger(falls)||falls<0||falls>999)return "falls out of range";
  return {sector,entry:{name,time:Math.round(time*100)/100,health:Math.round(health),stars,score:Math.round(score),falls,at:new Date().toISOString()}};
}

/** Insert keeping each callsign's best time; returns the 1-based rank. */
export function insert(board:Board,sector:number,entry:Entry){
  const key=String(sector),list=(board[key]||[]).filter(e=>e.name!==entry.name||e.time<=entry.time);
  if(!list.some(e=>e.name===entry.name))list.push(entry);
  list.sort((a,b)=>a.time-b.time||b.score-a.score);
  board[key]=list.slice(0,KEEP);
  const rank=board[key].findIndex(e=>e.name===entry.name)+1;
  return {rank,best:board[key].find(e=>e.name===entry.name)!};
}

let chain:Promise<unknown>=Promise.resolve();
async function fsx(){return await import("node:fs/promises")}
function dir(){return (typeof process!=="undefined"&&process.env?.LEADERBOARD_DIR)||"/game/data"}

export async function readBoard():Promise<Board>{
  const fs=await fsx();
  try{return JSON.parse(await fs.readFile(`${dir()}/leaderboard.json`,"utf8"))}catch(e){if((e as {code?:string})?.code==="ENOENT")return {};throw e}
}
export function update<T>(fn:(b:Board)=>T):Promise<T>{
  const run=chain.then(async()=>{
    const fs=await fsx(),board=await readBoard(),out=fn(board),file=`${dir()}/leaderboard.json`,tmp=`${file}.${Date.now()}.tmp`;
    await fs.mkdir(dir(),{recursive:true});await fs.writeFile(tmp,JSON.stringify(board));await fs.rename(tmp,file);
    return out;
  });
  chain=run.catch(()=>undefined);return run;
}
